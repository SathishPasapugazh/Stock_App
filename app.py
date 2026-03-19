"""
Stock Watcher Backend — Flask + SSE
Fetches live prices from NSE India's unofficial JSON API.
No API key needed. Data updates every ~15 seconds on NSE's end.
"""

from flask import Flask, Response, request, jsonify
from flask_cors import CORS
from twilio.rest import Client
from datetime import datetime
import threading
import queue
import json
import time
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# ===================== TWILIO =====================
TWILIO_SID           = os.getenv("TWILIO_SID")
TWILIO_AUTH          = os.getenv("TWILIO_AUTH")
TWILIO_WHATSAPP_FROM = "whatsapp:+14155238886"
YOUR_WHATSAPP        = "whatsapp:+919281336100"
TWILIO_CALL_FROM     = "+13348350672"
YOUR_PHONE           = "+918608000708"

# ===================== SHARED STATE =====================
watcher_state = {
    "running":   False,
    "interval":  30,
    "watchlist": {},   # symbol -> { name, price, change, change_pct, above, below, triggered_above, triggered_below, last_updated }
    "thread":    None,
}

sse_clients: list[queue.Queue] = []
sse_lock = threading.Lock()

# ===================== SSE HELPERS =====================
def push_event(event_type: str, data: dict):
    payload = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
    with sse_lock:
        dead = []
        for q in sse_clients:
            try:
                q.put_nowait(payload)
            except queue.Full:
                dead.append(q)
        for q in dead:
            sse_clients.remove(q)

def push_log(msg: str, level: str = "info"):
    push_event("log", {
        "msg": msg, "level": level,
        "ts": datetime.now().strftime("%H:%M:%S")
    })

# ===================== ALERT HELPERS =====================
def send_whatsapp(msg: str):
    try:
        client = Client(TWILIO_SID, TWILIO_AUTH)
        client.messages.create(from_=TWILIO_WHATSAPP_FROM, to=YOUR_WHATSAPP, body=msg)
    except Exception as e:
        push_log(f"WhatsApp error: {e}", "error")

def make_call(msg_text: str):
    try:
        client = Client(TWILIO_SID, TWILIO_AUTH)
        client.calls.create(
            from_=TWILIO_CALL_FROM,
            to=YOUR_PHONE,
            twiml=f"<Response><Say voice='alice'>{msg_text}</Say></Response>"
        )
    except Exception as e:
        push_log(f"Call error: {e}", "error")

def fire_alert(symbol: str, stock: dict, alert_type: str, price: float, threshold: float):
    direction = "above" if alert_type == "above" else "below"
    sign      = "📈" if alert_type == "above" else "📉"
    msg = (
        f"{sign} STOCK ALERT!\n"
        f"Symbol : {symbol}\n"
        f"Name   : {stock['name']}\n"
        f"Price  : ₹{price:.2f}\n"
        f"Alert  : Crossed {direction} ₹{threshold:.2f}\n"
        f"Time   : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )
    push_log(f"{sign} {symbol} crossed {direction} ₹{threshold:.2f} — now ₹{price:.2f}", "success")
    push_event("alert", {
        "symbol": symbol, "name": stock["name"],
        "price": price, "threshold": threshold,
        "type": alert_type, "ts": datetime.now().strftime("%H:%M:%S")
    })
    threading.Thread(target=send_whatsapp, args=(msg,), daemon=True).start()
    threading.Thread(target=make_call, args=(
        f"Alert for {stock['name']}. Price has crossed {direction} {threshold:.0f} rupees. Current price is {price:.0f} rupees.",
    ), daemon=True).start()

# ===================== NSE FETCH =====================

import yfinance as yf

# ===================== STOCK DATA VIA YFINANCE =====================

def fetch_quote(symbol: str) -> dict | None:
    """Fetch live quote using yfinance. Tries NSE (.NS) first, then BSE (.BO)."""
    for suffix in [".NS", ".BO"]:
        try:
            ticker = yf.Ticker(f"{symbol.upper()}{suffix}")
            info   = ticker.fast_info
            hist   = ticker.history(period="2d", interval="1d")
            if hist.empty:
                continue
            ltp  = float(info.last_price)
            prev = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else float(hist["Close"].iloc[-1])
            chg  = ltp - prev
            chg_pct = round((chg / prev * 100), 2) if prev else 0
            full = ticker.info
            return {
                "name":         full.get("longName", full.get("shortName", symbol)),
                "price":        round(ltp, 2),
                "change":       round(chg, 2),
                "change_pct":   chg_pct,
                "open":         round(float(hist["Open"].iloc[-1]), 2),
                "high":         round(float(hist["High"].iloc[-1]), 2),
                "low":          round(float(hist["Low"].iloc[-1]), 2),
                "prev_close":   round(prev, 2),
                "last_updated": datetime.now().strftime("%H:%M:%S"),
            }
        except Exception as e:
            push_log(f"yfinance {symbol}{suffix}: {e}", "error")
            continue
    return None

def search_stocks(query: str) -> list:
    """Search stocks via yfinance — returns NSE/BSE listed results."""
    try:
        results = yf.Search(query, max_results=10)
        out = []
        for r in (results.quotes or []):
            sym = r.get("symbol", "")
            if ".NS" in sym or ".BO" in sym:
                clean = sym.replace(".NS", "").replace(".BO", "")
                exchange = "NSE" if ".NS" in sym else "BSE"
                out.append({
                    "symbol":   clean,
                    "name":     r.get("longname") or r.get("shortname") or clean,
                    "exchange": exchange,
                })
        # Deduplicate by symbol (prefer NSE)
        seen = {}
        for item in out:
            if item["symbol"] not in seen or item["exchange"] == "NSE":
                seen[item["symbol"]] = item
        return list(seen.values())[:8]
    except Exception as e:
        push_log(f"Search error: {e}", "error")
        return []

# ===================== WATCHER LOOP =====================

def watcher_loop():
    state = watcher_state
    push_log("Stock watcher started.", "system")

    while state["running"]:
        watchlist = state["watchlist"]
        if not watchlist:
            push_log("Watchlist empty — waiting...", "info")
        else:
            for symbol, stock in list(watchlist.items()):
                quote = fetch_quote(symbol)
                if not quote:
                    push_log(f"Could not fetch {symbol}", "error")
                    continue

                price = quote["price"]

                # Merge quote into watchlist entry
                stock.update({
                    "price":        price,
                    "change":       quote["change"],
                    "change_pct":   quote["change_pct"],
                    "open":         quote["open"],
                    "high":         quote["high"],
                    "low":          quote["low"],
                    "prev_close":   quote["prev_close"],
                    "last_updated": quote["last_updated"],
                })

                push_log(f"{symbol}  ₹{price:.2f}  ({'+' if quote['change_pct'] >= 0 else ''}{quote['change_pct']:.2f}%)", "info")

                # Check ABOVE alert
                above = stock.get("above")
                if above and price >= above and not stock.get("triggered_above"):
                    stock["triggered_above"] = True
                    fire_alert(symbol, stock, "above", price, above)

                # Check BELOW alert
                below = stock.get("below")
                if below and price <= below and not stock.get("triggered_below"):
                    stock["triggered_below"] = True
                    fire_alert(symbol, stock, "below", price, below)

                # Reset trigger if price moves back into range (allows re-triggering)
                if above and price < above * 0.999:
                    stock["triggered_above"] = False
                if below and price > below * 1.001:
                    stock["triggered_below"] = False

            # Push full state to UI
            push_event("state", {"watchlist": state["watchlist"]})

        interval = state["interval"]
        for remaining in range(interval, 0, -1):
            if not state["running"]:
                break
            push_event("tick", {"remaining": remaining})
            time.sleep(1)

    push_log("Stock watcher stopped.", "system")
    push_event("stopped", {})

# ===================== ROUTES =====================

@app.route("/api/start", methods=["POST"])
def start():
    if watcher_state["running"]:
        return jsonify({"error": "Already running"}), 400
    body = request.get_json() or {}
    watcher_state["interval"] = int(body.get("interval", 30))
    watcher_state["running"]  = True
    t = threading.Thread(target=watcher_loop, daemon=True)
    watcher_state["thread"] = t
    t.start()
    return jsonify({"status": "started"})

@app.route("/api/stop", methods=["POST"])
def stop():
    watcher_state["running"] = False
    return jsonify({"status": "stopping"})

@app.route("/api/watchlist", methods=["GET"])
def get_watchlist():
    return jsonify(watcher_state["watchlist"])

@app.route("/api/watchlist/add", methods=["POST"])
def add_stock():
    body   = request.get_json() or {}
    symbol = body.get("symbol", "").strip().upper()
    above  = body.get("above")   # optional float
    below  = body.get("below")   # optional float

    if not symbol:
        return jsonify({"error": "Symbol required"}), 400
    if symbol in watcher_state["watchlist"]:
        return jsonify({"error": f"{symbol} already in watchlist"}), 400

    # Fetch initial quote to confirm symbol is valid
    quote = fetch_quote(symbol)
    if not quote:
        return jsonify({"error": f"Could not find symbol '{symbol}' on NSE"}), 404

    watcher_state["watchlist"][symbol] = {
        **quote,
        "above":            float(above) if above else None,
        "below":            float(below) if below else None,
        "triggered_above":  False,
        "triggered_below":  False,
    }
    push_log(f"Added {symbol} — ₹{quote['price']:.2f}", "system")
    push_event("state", {"watchlist": watcher_state["watchlist"]})
    return jsonify({"status": "added", "quote": quote})

@app.route("/api/watchlist/remove", methods=["POST"])
def remove_stock():
    symbol = (request.get_json() or {}).get("symbol", "").upper()
    watcher_state["watchlist"].pop(symbol, None)
    push_event("state", {"watchlist": watcher_state["watchlist"]})
    return jsonify({"status": "removed"})

@app.route("/api/watchlist/update", methods=["POST"])
def update_alerts():
    """Update above/below thresholds for an existing symbol."""
    body   = request.get_json() or {}
    symbol = body.get("symbol", "").upper()
    if symbol not in watcher_state["watchlist"]:
        return jsonify({"error": "Symbol not in watchlist"}), 404
    stock = watcher_state["watchlist"][symbol]
    above = body.get("above")
    below = body.get("below")
    stock["above"]           = float(above) if above else None
    stock["below"]           = float(below) if below else None
    stock["triggered_above"] = False
    stock["triggered_below"] = False
    push_event("state", {"watchlist": watcher_state["watchlist"]})
    return jsonify({"status": "updated"})

@app.route("/api/search")
def search():
    q = request.args.get("q", "").strip()
    if len(q) < 1:
        return jsonify([])
    results = search_stocks(q)
    return jsonify(results)

@app.route("/api/stream")
def stream():
    q: queue.Queue = queue.Queue(maxsize=200)
    with sse_lock:
        sse_clients.append(q)

    def generate():
        yield f"event: state\ndata: {json.dumps({'watchlist': watcher_state['watchlist']})}\n\n"
        try:
            while True:
                try:
                    yield q.get(timeout=25)
                except queue.Empty:
                    yield ": heartbeat\n\n"
        except GeneratorExit:
            pass
        finally:
            with sse_lock:
                if q in sse_clients:
                    sse_clients.remove(q)

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@app.route("/api/status")
def status():
    return jsonify({
        "running":  watcher_state["running"],
        "interval": watcher_state["interval"],
        "count":    len(watcher_state["watchlist"]),
    })

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, threaded=True)
else:
    # Running under gunicorn
    pass
