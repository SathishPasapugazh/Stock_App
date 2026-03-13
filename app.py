"""
Stock Watcher — Multi-user backend
- Google OAuth via Firebase ID tokens
- PostgreSQL for persistence
- Per-user watcher threads + SSE streams
- Per-user Twilio credentials
"""

from flask import Flask, Response, request, jsonify, g
from flask_cors import CORS
from functools import wraps
import psycopg2
import psycopg2.extras
import threading
import queue
import json
import time
import os
import yfinance as yf
from datetime import datetime
from twilio.rest import Client
import requests as req
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app, supports_credentials=True)

# ===================== CONFIG =====================
DATABASE_URL       = os.getenv("DATABASE_URL")        # postgres://user:pass@host:5432/dbname
FIREBASE_PROJECT   = os.getenv("FIREBASE_PROJECT_ID") # from Firebase console

# ===================== DB =====================

def get_db():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)

def init_db():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id          TEXT PRIMARY KEY,   -- Google UID
                    email       TEXT UNIQUE NOT NULL,
                    name        TEXT,
                    avatar      TEXT,
                    created_at  TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS twilio_credentials (
                    user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    account_sid     TEXT NOT NULL,
                    auth_token      TEXT NOT NULL,
                    whatsapp_from   TEXT NOT NULL DEFAULT 'whatsapp:+14155238886',
                    whatsapp_to     TEXT NOT NULL,
                    call_from       TEXT NOT NULL,
                    call_to         TEXT NOT NULL,
                    updated_at      TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS watchlist (
                    id          SERIAL PRIMARY KEY,
                    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    symbol      TEXT NOT NULL,
                    name        TEXT,
                    above       NUMERIC,
                    below       NUMERIC,
                    interval_s  INTEGER DEFAULT 30,
                    added_at    TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE(user_id, symbol)
                );

                CREATE TABLE IF NOT EXISTS alert_log (
                    id          SERIAL PRIMARY KEY,
                    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    symbol      TEXT NOT NULL,
                    alert_type  TEXT NOT NULL,   -- 'above' | 'below'
                    price       NUMERIC NOT NULL,
                    threshold   NUMERIC NOT NULL,
                    fired_at    TIMESTAMPTZ DEFAULT NOW()
                );
            """)
        conn.commit()
    print("✅ DB initialised")

# ===================== AUTH =====================

def verify_google_token(id_token: str) -> dict | None:
    """Verify Firebase ID token via Google's tokeninfo endpoint."""
    try:
        r = req.get(
            f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}",
            timeout=5
        )
        if r.status_code != 200:
            return None
        data = r.json()
        # Validate audience matches our Firebase project
        if data.get("aud") != os.getenv("FIREBASE_WEB_CLIENT_ID"):
            return None
        return {
            "uid":    data.get("sub"),
            "email":  data.get("email"),
            "name":   data.get("name"),
            "avatar": data.get("picture"),
        }
    except Exception:
        return None

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        if not token:
            return jsonify({"error": "Missing token"}), 401
        user = verify_google_token(token)
        if not user:
            return jsonify({"error": "Invalid token"}), 401
        # Upsert user into DB
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO users (id, email, name, avatar)
                    VALUES (%(uid)s, %(email)s, %(name)s, %(avatar)s)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        avatar = EXCLUDED.avatar
                """, user)
            conn.commit()
        g.user = user
        return f(*args, **kwargs)
    return decorated

# ===================== SSE MANAGER =====================

# user_id -> list of queues (one per open tab)
sse_clients: dict[str, list[queue.Queue]] = {}
sse_lock = threading.Lock()

def push_to_user(user_id: str, event_type: str, data: dict):
    payload = f"event: {event_type}\ndata: {json.dumps(data)}\n\n"
    with sse_lock:
        for q in sse_clients.get(user_id, []):
            try:
                q.put_nowait(payload)
            except queue.Full:
                pass

def push_log(user_id: str, msg: str, level: str = "info"):
    push_to_user(user_id, "log", {
        "msg": msg, "level": level,
        "ts": datetime.now().strftime("%H:%M:%S")
    })

# ===================== WATCHER THREADS =====================

# user_id -> {"thread": Thread, "running": bool, "detected": {symbol: {...}}}
user_watchers: dict[str, dict] = {}
watcher_lock = threading.Lock()

def get_quote(symbol: str) -> dict | None:
    for suffix in [".NS", ".BO"]:
        try:
            t = yf.Ticker(f"{symbol}{suffix}")
            info = t.fast_info
            hist = t.history(period="2d", interval="1d")
            if hist.empty:
                continue
            ltp  = float(info.last_price)
            prev = float(hist["Close"].iloc[-2]) if len(hist) >= 2 else float(hist["Close"].iloc[-1])
            chg  = ltp - prev
            full = t.info
            return {
                "name":       full.get("longName", full.get("shortName", symbol)),
                "price":      round(ltp, 2),
                "change":     round(chg, 2),
                "change_pct": round((chg / prev * 100), 2) if prev else 0,
                "open":       round(float(hist["Open"].iloc[-1]), 2),
                "high":       round(float(hist["High"].iloc[-1]), 2),
                "low":        round(float(hist["Low"].iloc[-1]), 2),
                "prev_close": round(prev, 2),
                "last_updated": datetime.now().strftime("%H:%M:%S"),
            }
        except Exception:
            continue
    return None

def fire_alert(user_id: str, symbol: str, stock: dict, alert_type: str, price: float, threshold: float):
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
    push_log(user_id, f"{sign} {symbol} crossed {direction} ₹{threshold:.2f} — now ₹{price:.2f}", "success")
    push_to_user(user_id, "alert", {
        "symbol": symbol, "price": price,
        "threshold": threshold, "type": alert_type,
        "ts": datetime.now().strftime("%H:%M:%S")
    })

    # Log to DB
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO alert_log (user_id, symbol, alert_type, price, threshold)
                    VALUES (%s, %s, %s, %s, %s)
                """, (user_id, symbol, alert_type, price, threshold))
            conn.commit()
    except Exception:
        pass

    # Send Twilio alerts using user's own credentials
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM twilio_credentials WHERE user_id = %s", (user_id,))
                creds = cur.fetchone()
        if creds:
            client = Client(creds["account_sid"], creds["auth_token"])
            threading.Thread(target=lambda: client.messages.create(
                from_=creds["whatsapp_from"], to=creds["whatsapp_to"], body=msg
            ), daemon=True).start()
            threading.Thread(target=lambda: client.calls.create(
                from_=creds["call_from"], to=creds["call_to"],
                twiml=f"<Response><Say voice='alice'>{stock['name']} has crossed {direction} {threshold:.0f} rupees. Current price is {price:.0f} rupees.</Say></Response>"
            ), daemon=True).start()
    except Exception as e:
        push_log(user_id, f"Twilio error: {e}", "error")

def watcher_loop(user_id: str):
    push_log(user_id, "Watcher started.", "system")
    state = user_watchers[user_id]

    while state["running"]:
        try:
            # Load watchlist from DB
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT * FROM watchlist WHERE user_id = %s", (user_id,))
                    rows = cur.fetchall()

            if not rows:
                push_log(user_id, "Watchlist empty — waiting...", "info")
            else:
                interval = rows[0]["interval_s"]  # use first stock's interval
                prices = {}

                for row in rows:
                    symbol = row["symbol"]
                    quote  = get_quote(symbol)
                    if not quote:
                        push_log(user_id, f"Could not fetch {symbol}", "error")
                        continue

                    price = quote["price"]
                    prices[symbol] = {**quote, "above": float(row["above"]) if row["above"] else None,
                                      "below": float(row["below"]) if row["below"] else None}

                    push_log(user_id, f"{symbol}  ₹{price:.2f}  ({'+' if quote['change_pct'] >= 0 else ''}{quote['change_pct']:.2f}%)", "info")

                    triggered = state["triggered"]

                    # Above alert
                    above = float(row["above"]) if row["above"] else None
                    if above and price >= above and f"{symbol}_above" not in triggered:
                        triggered.add(f"{symbol}_above")
                        fire_alert(user_id, symbol, quote, "above", price, above)
                    if above and price < above * 0.999:
                        triggered.discard(f"{symbol}_above")

                    # Below alert
                    below = float(row["below"]) if row["below"] else None
                    if below and price <= below and f"{symbol}_below" not in triggered:
                        triggered.add(f"{symbol}_below")
                        fire_alert(user_id, symbol, quote, "below", price, below)
                    if below and price > below * 1.001:
                        triggered.discard(f"{symbol}_below")

                push_to_user(user_id, "prices", {"prices": prices})

            # Countdown
            for remaining in range(interval if rows else 30, 0, -1):
                if not state["running"]:
                    break
                push_to_user(user_id, "tick", {"remaining": remaining})
                time.sleep(1)

        except Exception as e:
            push_log(user_id, f"Watcher error: {e}", "error")
            time.sleep(5)

    push_log(user_id, "Watcher stopped.", "system")
    push_to_user(user_id, "stopped", {})

def ensure_watcher(user_id: str):
    with watcher_lock:
        if user_id not in user_watchers or not user_watchers[user_id]["running"]:
            state = {"running": True, "triggered": set()}
            user_watchers[user_id] = state
            t = threading.Thread(target=watcher_loop, args=(user_id,), daemon=True)
            state["thread"] = t
            t.start()

def stop_watcher(user_id: str):
    with watcher_lock:
        if user_id in user_watchers:
            user_watchers[user_id]["running"] = False

# ===================== ROUTES =====================

# ── Auth ──
@app.route("/api/me")
@require_auth
def me():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s", (g.user["uid"],))
            user = cur.fetchone()
            cur.execute("SELECT account_sid, whatsapp_to, call_to FROM twilio_credentials WHERE user_id = %s", (g.user["uid"],))
            creds = cur.fetchone()
    return jsonify({"user": dict(user) if user else None, "has_twilio": creds is not None,
                    "twilio_preview": dict(creds) if creds else None})

# ── Twilio credentials ──
@app.route("/api/twilio", methods=["POST"])
@require_auth
def save_twilio():
    body = request.get_json() or {}
    required = ["account_sid", "auth_token", "whatsapp_to", "call_from", "call_to"]
    if not all(body.get(k) for k in required):
        return jsonify({"error": "All fields required"}), 400
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO twilio_credentials
                    (user_id, account_sid, auth_token, whatsapp_from, whatsapp_to, call_from, call_to)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (user_id) DO UPDATE SET
                    account_sid   = EXCLUDED.account_sid,
                    auth_token    = EXCLUDED.auth_token,
                    whatsapp_from = EXCLUDED.whatsapp_from,
                    whatsapp_to   = EXCLUDED.whatsapp_to,
                    call_from     = EXCLUDED.call_from,
                    call_to       = EXCLUDED.call_to,
                    updated_at    = NOW()
            """, (g.user["uid"], body["account_sid"], body["auth_token"],
                  body.get("whatsapp_from", "whatsapp:+14155238886"),
                  body["whatsapp_to"], body["call_from"], body["call_to"]))
        conn.commit()
    return jsonify({"status": "saved"})

# ── Watchlist ──
@app.route("/api/watchlist", methods=["GET"])
@require_auth
def get_watchlist():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM watchlist WHERE user_id = %s ORDER BY added_at", (g.user["uid"],))
            rows = cur.fetchall()
    return jsonify([dict(r) for r in rows])

@app.route("/api/watchlist/add", methods=["POST"])
@require_auth
def add_stock():
    body   = request.get_json() or {}
    symbol = body.get("symbol", "").strip().upper()
    above  = body.get("above")
    below  = body.get("below")
    interval_s = int(body.get("interval_s", 30))
    if not symbol:
        return jsonify({"error": "Symbol required"}), 400
    quote = get_quote(symbol)
    if not quote:
        return jsonify({"error": f"Could not find '{symbol}' on NSE/BSE"}), 404
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO watchlist (user_id, symbol, name, above, below, interval_s)
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT (user_id, symbol) DO UPDATE SET
                    above = EXCLUDED.above, below = EXCLUDED.below,
                    interval_s = EXCLUDED.interval_s
            """, (g.user["uid"], symbol, quote["name"],
                  float(above) if above else None,
                  float(below) if below else None, interval_s))
        conn.commit()
    ensure_watcher(g.user["uid"])
    return jsonify({"status": "added", "quote": quote})

@app.route("/api/watchlist/remove", methods=["POST"])
@require_auth
def remove_stock():
    symbol = (request.get_json() or {}).get("symbol", "").upper()
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM watchlist WHERE user_id=%s AND symbol=%s", (g.user["uid"], symbol))
        conn.commit()
    return jsonify({"status": "removed"})

@app.route("/api/watchlist/update", methods=["POST"])
@require_auth
def update_stock():
    body   = request.get_json() or {}
    symbol = body.get("symbol", "").upper()
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE watchlist SET above=%s, below=%s, interval_s=%s
                WHERE user_id=%s AND symbol=%s
            """, (float(body["above"]) if body.get("above") else None,
                  float(body["below"]) if body.get("below") else None,
                  int(body.get("interval_s", 30)),
                  g.user["uid"], symbol))
        conn.commit()
    return jsonify({"status": "updated"})

# ── Watcher control ──
@app.route("/api/watcher/start", methods=["POST"])
@require_auth
def start_watcher():
    ensure_watcher(g.user["uid"])
    return jsonify({"status": "started"})

@app.route("/api/watcher/stop", methods=["POST"])
@require_auth
def stop_watcher_route():
    stop_watcher(g.user["uid"])
    return jsonify({"status": "stopping"})

# ── Search ──
@app.route("/api/search")
@require_auth
def search():
    q = request.args.get("q", "").strip()
    if len(q) < 1:
        return jsonify([])
    try:
        results = yf.Search(q, max_results=10)
        out, seen = [], {}
        for r in (results.quotes or []):
            sym = r.get("symbol", "")
            if ".NS" in sym or ".BO" in sym:
                clean    = sym.replace(".NS", "").replace(".BO", "")
                exchange = "NSE" if ".NS" in sym else "BSE"
                if clean not in seen or exchange == "NSE":
                    seen[clean] = {"symbol": clean, "exchange": exchange,
                                   "name": r.get("longname") or r.get("shortname") or clean}
        return jsonify(list(seen.values())[:8])
    except Exception as e:
        return jsonify([])

# ── Community watchlists (public) ──
@app.route("/api/community")
@require_auth
def community():
    """Return what stocks other users are watching (anonymised)."""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT w.symbol, w.name, COUNT(*) as watchers,
                       AVG(w.above) as avg_above, AVG(w.below) as avg_below
                FROM watchlist w
                GROUP BY w.symbol, w.name
                ORDER BY watchers DESC
                LIMIT 20
            """)
            rows = cur.fetchall()
    return jsonify([dict(r) for r in rows])

# ── Alert history ──
@app.route("/api/alerts/history")
@require_auth
def alert_history():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT * FROM alert_log WHERE user_id=%s
                ORDER BY fired_at DESC LIMIT 50
            """, (g.user["uid"],))
            rows = cur.fetchall()
    return jsonify([dict(r) for r in rows])

# ── SSE ──
@app.route("/api/stream")
@require_auth
def stream():
    user_id = g.user["uid"]
    q: queue.Queue = queue.Queue(maxsize=200)
    with sse_lock:
        sse_clients.setdefault(user_id, []).append(q)

    def generate():
        yield f"event: connected\ndata: {json.dumps({'uid': user_id})}\n\n"
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
                if user_id in sse_clients:
                    try: sse_clients[user_id].remove(q)
                    except ValueError: pass

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ===================== MAIN =====================
if __name__ == "__main__":
    init_db()
    port = int(os.getenv("PORT", 5000))
    app.run(host="0.0.0.0", port=port, threaded=True)
else:
    # Running under gunicorn — init DB on first import
    try:
        init_db()
    except Exception as e:
        print(f"DB init warning: {e}")
