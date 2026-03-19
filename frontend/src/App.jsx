import { useState, useEffect, useRef, useCallback } from "react";

const API = "http://localhost:5000";

// ── Helpers ───────────────────────────────────────────────────────
const fmt  = (n) => n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (n) => n == null ? "—" : Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct  = (n) => n == null ? "" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`;

// ── Spark mini bar ────────────────────────────────────────────────
function MiniBar({ value, max }) {
  const pct = max ? Math.abs(value) / max * 100 : 0;
  return (
    <div style={{ width: "48px", height: "4px", background: "#111", borderRadius: "2px", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: value >= 0 ? "#00c896" : "#e05c5c", borderRadius: "2px", transition: "width 0.4s" }} />
    </div>
  );
}

// ── Alert badge ───────────────────────────────────────────────────
function AlertBadge({ type, value, price }) {
  if (!value) return null;
  const triggered = type === "above" ? price >= value : price <= value;
  return (
    <span style={{
      fontSize: "9px", padding: "2px 6px", borderRadius: "2px",
      fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.08em",
      border: `1px solid ${triggered ? (type === "above" ? "#00c896" : "#e05c5c") : "#222"}`,
      color: triggered ? (type === "above" ? "#00c896" : "#e05c5c") : "#444",
      background: triggered ? (type === "above" ? "rgba(0,200,150,0.08)" : "rgba(224,92,92,0.08)") : "transparent",
    }}>
      {type === "above" ? "▲" : "▼"} ₹{fmtN(value)}
    </span>
  );
}

// ── Stock row ─────────────────────────────────────────────────────
function StockRow({ symbol, stock, onRemove, onEditAlert }) {
  const [flash, setFlash] = useState(null);
  const prevPrice = useRef(stock.price);

  useEffect(() => {
    if (stock.price !== prevPrice.current) {
      setFlash(stock.price > prevPrice.current ? "up" : "down");
      prevPrice.current = stock.price;
      const t = setTimeout(() => setFlash(null), 800);
      return () => clearTimeout(t);
    }
  }, [stock.price]);

  const isUp = stock.change_pct >= 0;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "90px 1fr 100px 90px 90px 90px 140px 60px",
      alignItems: "center", gap: "8px",
      padding: "12px 16px",
      borderBottom: "1px solid #0f0f0f",
      background: flash === "up" ? "rgba(0,200,150,0.04)" : flash === "down" ? "rgba(224,92,92,0.04)" : "transparent",
      transition: "background 0.6s",
    }}>
      {/* Symbol */}
      <div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "13px", color: "#e0e0d0", fontWeight: "600", letterSpacing: "0.05em" }}>{symbol}</div>
        <div style={{ fontSize: "10px", color: "#383838", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "85px" }}>{stock.name}</div>
      </div>

      {/* Price */}
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "15px", fontWeight: "700", color: flash === "up" ? "#00c896" : flash === "down" ? "#e05c5c" : "#e8e8e0", transition: "color 0.4s", textAlign: "right" }}>
        {fmt(stock.price)}
      </div>

      {/* Change */}
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px", color: isUp ? "#00c896" : "#e05c5c" }}>{pct(stock.change_pct)}</div>
        <MiniBar value={stock.change_pct} max={5} />
      </div>

      {/* Open / High / Low */}
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#444", textAlign: "right" }}>
        <div style={{ color: "#333", fontSize: "9px", letterSpacing: "0.1em" }}>OPEN</div>
        {fmt(stock.open)}
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#00c896", textAlign: "right" }}>
        <div style={{ color: "#333", fontSize: "9px", letterSpacing: "0.1em" }}>HIGH</div>
        {fmt(stock.high)}
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#e05c5c", textAlign: "right" }}>
        <div style={{ color: "#333", fontSize: "9px", letterSpacing: "0.1em" }}>LOW</div>
        {fmt(stock.low)}
      </div>

      {/* Alerts */}
      <div style={{ display: "flex", flexDirection: "column", gap: "3px", cursor: "pointer" }} onClick={() => onEditAlert(symbol, stock)}>
        <AlertBadge type="above" value={stock.above} price={stock.price} />
        <AlertBadge type="below" value={stock.below} price={stock.price} />
        {!stock.above && !stock.below && (
          <span style={{ fontSize: "9px", color: "#2a2a2a", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.08em" }}>+ SET ALERT</span>
        )}
      </div>

      {/* Remove */}
      <button onClick={() => onRemove(symbol)} style={{
        background: "none", border: "1px solid #1a1a1a", color: "#333",
        fontSize: "11px", cursor: "pointer", padding: "4px 8px", borderRadius: "2px",
        fontFamily: "'IBM Plex Mono', monospace", transition: "all 0.15s"
      }}
        onMouseEnter={e => { e.target.style.borderColor = "#e05c5c"; e.target.style.color = "#e05c5c"; }}
        onMouseLeave={e => { e.target.style.borderColor = "#1a1a1a"; e.target.style.color = "#333"; }}
      >✕</button>
    </div>
  );
}

// ── Log entry ─────────────────────────────────────────────────────
function LogLine({ msg, level, ts }) {
  const colors = { info: "#333", success: "#00c896", error: "#e05c5c", system: "#2a5c8a" };
  return (
    <div style={{ display: "flex", gap: "10px", padding: "2px 0", fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", lineHeight: 1.6 }}>
      <span style={{ color: "#252525", flexShrink: 0 }}>{ts}</span>
      <span style={{ color: colors[level] || "#333" }}>{msg}</span>
    </div>
  );
}

// ── Alert modal ───────────────────────────────────────────────────
function AlertModal({ symbol, stock, onSave, onClose }) {
  const [above, setAbove] = useState(stock.above || "");
  const [below, setBelow] = useState(stock.below || "");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center"
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#0d0d0d", border: "1px solid #1e1e1e",
        padding: "32px", width: "340px", borderRadius: "2px",
        animation: "slideUp 0.2s ease"
      }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", color: "#444", letterSpacing: "0.15em", marginBottom: "4px" }}>SET ALERT</div>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "20px", color: "#e0e0d0", fontWeight: "700", marginBottom: "4px" }}>{symbol}</div>
        <div style={{ fontSize: "12px", color: "#333", marginBottom: "24px", fontFamily: "'IBM Plex Mono', monospace" }}>
          Current: <span style={{ color: "#e0e0d0" }}>{fmt(stock.price)}</span>
        </div>

        {[
          { label: "ALERT ABOVE ▲", key: "above", val: above, set: setAbove, color: "#00c896", hint: "Notify when price rises above this" },
          { label: "ALERT BELOW ▼", key: "below", val: below, set: setBelow, color: "#e05c5c", hint: "Notify when price drops below this" },
        ].map(f => (
          <div key={f.key} style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "9px", letterSpacing: "0.2em", color: f.color, marginBottom: "8px", fontFamily: "'IBM Plex Mono', monospace" }}>{f.label}</label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ color: "#333", fontFamily: "'IBM Plex Mono', monospace" }}>₹</span>
              <input type="number" value={f.val} onChange={e => f.set(e.target.value)} placeholder="—" style={{
                flex: 1, background: "#080808", border: "1px solid #1a1a1a", borderRadius: "2px",
                color: "#c8c8c0", padding: "10px 12px", fontFamily: "'IBM Plex Mono', monospace", fontSize: "14px"
              }}
                onFocus={e => e.target.style.borderColor = f.color}
                onBlur={e => e.target.style.borderColor = "#1a1a1a"}
              />
              {f.val && <button onClick={() => f.set("")} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: "14px" }}>×</button>}
            </div>
            <div style={{ fontSize: "10px", color: "#252525", marginTop: "4px", fontFamily: "'IBM Plex Mono', monospace" }}>{f.hint}</div>
          </div>
        ))}

        <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "12px", background: "transparent", border: "1px solid #1a1a1a",
            color: "#444", fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px",
            cursor: "pointer", borderRadius: "2px", letterSpacing: "0.1em"
          }}>CANCEL</button>
          <button onClick={() => onSave(symbol, above || null, below || null)} style={{
            flex: 2, padding: "12px", background: "transparent", border: "1px solid #00c896",
            color: "#00c896", fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px",
            cursor: "pointer", borderRadius: "2px", letterSpacing: "0.1em", transition: "all 0.2s"
          }}
            onMouseEnter={e => { e.target.style.background = "#00c896"; e.target.style.color = "#080808"; }}
            onMouseLeave={e => { e.target.style.background = "transparent"; e.target.style.color = "#00c896"; }}
          >SAVE ALERTS</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────
export default function App() {
  const [running, setRunning]       = useState(false);
  const [days, setDays]             = useState(0);
  const [mins, setMins]             = useState(0);
  const [secs, setSecs]             = useState(30);
  const [watchlist, setWatchlist]   = useState({});
  const [logs, setLogs]             = useState([]);
  const [countdown, setCountdown]   = useState(0);
  const [searchQ, setSearchQ]       = useState("");
  const [searchRes, setSearchRes]   = useState([]);
  const [searching, setSearching]   = useState(false);
  const [adding, setAdding]         = useState(null);   // symbol being configured
  const [addAbove, setAddAbove]     = useState("");
  const [addBelow, setAddBelow]     = useState("");
  const [editModal, setEditModal]   = useState(null);   // { symbol, stock }
  const [connErr, setConnErr]       = useState("");
  const [addErr, setAddErr]         = useState("");
  const sseRef    = useRef(null);
  const logsRef   = useRef(null);
  const searchRef = useRef(null);

  const addLog = (msg, level = "info", ts = null) =>
    setLogs(p => [...p.slice(-120), { msg, level, ts: ts || new Date().toLocaleTimeString("en-IN", { hour12: false }), id: Date.now() + Math.random() }]);

  useEffect(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight; }, [logs]);

  // ── SSE ──
  const connectSSE = useCallback(() => {
    if (sseRef.current) sseRef.current.close();
    const es = new EventSource(`${API}/api/stream`);
    sseRef.current = es;
    let connected = false;
    es.addEventListener("state",   e => { connected = true; setConnErr(""); setWatchlist(JSON.parse(e.data).watchlist || {}); });
    es.addEventListener("log",     e => { const d = JSON.parse(e.data); addLog(d.msg, d.level, d.ts); });
    es.addEventListener("tick",    e => setCountdown(JSON.parse(e.data).remaining));
    es.addEventListener("alert",   e => { const d = JSON.parse(e.data); addLog(`🔔 ${d.symbol} ${d.type === "above" ? "▲" : "▼"} ₹${d.threshold} — now ₹${d.price}`, "success", d.ts); });
    es.addEventListener("stopped", () => { setRunning(false); es.close(); });
    es.onerror = () => {
      // Only show error if we were previously connected — ignore initial connection failures
      if (connected) setConnErr("Lost connection to backend. Is app.py running on port 5000?");
      // Auto-retry after 5s
      es.close();
      setTimeout(() => connectSSE(), 5000);
    };
  }, []);

  useEffect(() => { connectSSE(); return () => sseRef.current?.close(); }, [connectSSE]);

  // ── Search debounce ──
  useEffect(() => {
    if (!searchQ.trim()) { setSearchRes([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/api/search?q=${encodeURIComponent(searchQ)}`);
        setSearchRes(await r.json());
      } catch { setSearchRes([]); }
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [searchQ]);

  // Close search dropdown on outside click
  useEffect(() => {
    const handler = e => { if (searchRef.current && !searchRef.current.contains(e.target)) setSearchRes([]); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Actions ──
  const totalSeconds = (days * 86400) + (mins * 60) + secs;

  const toggleWatcher = async () => {
    if (running) {
      await fetch(`${API}/api/stop`, { method: "POST" });
      setRunning(false);
    } else {
      const interval = Math.max(5, totalSeconds);
      const r = await fetch(`${API}/api/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ interval }) });
      if (r.ok) { setRunning(true); setConnErr(""); }
    }
  };

  const selectSearchResult = (result) => {
    setAdding(result);
    setSearchQ(result.symbol);
    setSearchRes([]);
    setAddAbove("");
    setAddBelow("");
    setAddErr("");
  };

  const confirmAdd = async () => {
    if (!adding) return;
    setAddErr("");
    try {
      const r = await fetch(`${API}/api/watchlist/add`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: adding.symbol, above: addAbove || null, below: addBelow || null })
      });
      const d = await r.json();
      if (!r.ok) { setAddErr(d.error); return; }
      setAdding(null); setSearchQ(""); setAddAbove(""); setAddBelow("");
    } catch { setAddErr("Network error"); }
  };

  const removeStock = async (symbol) => {
    await fetch(`${API}/api/watchlist/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) });
  };

  const saveAlerts = async (symbol, above, below) => {
    await fetch(`${API}/api/watchlist/update`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, above, below })
    });
    setEditModal(null);
  };

  const stocks = Object.entries(watchlist);
  const totalChange = stocks.length ? stocks.reduce((s, [, v]) => s + (v.change_pct || 0), 0) / stocks.length : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#060606", color: "#c8c8c0", fontFamily: "'IBM Plex Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&family=Barlow+Condensed:wght@300;400;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body, #root { max-width: 100% !important; width: 100% !important; padding: 0 !important; }
        input { outline: none; }
        input::placeholder { color: #252525; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: #080808; }
        ::-webkit-scrollbar-thumb { background: #1e1e1e; }
        @keyframes slideUp   { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn    { from { opacity:0; } to { opacity:1; } }
        @keyframes pulse     { 0%,100%{ opacity:1; } 50%{ opacity:0.3; } }
        @keyframes tickerScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>

      {/* ── Ticker bar ── */}
      <div style={{ background: "#080808", borderBottom: "1px solid #0f0f0f", height: "28px", overflow: "hidden", display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "32px", animation: stocks.length ? "tickerScroll 20s linear infinite" : "none", whiteSpace: "nowrap", padding: "0 16px" }}>
          {[...stocks, ...stocks].map(([sym, s], i) => (
            <span key={i} style={{ fontSize: "10px", letterSpacing: "0.08em", color: s.change_pct >= 0 ? "#00c896" : "#e05c5c" }}>
              {sym} <span style={{ color: "#e0e0d0" }}>{fmt(s.price)}</span> {pct(s.change_pct)}
            </span>
          ))}
          {stocks.length === 0 && <span style={{ fontSize: "10px", color: "#1e1e1e", letterSpacing: "0.1em" }}>NSE INDIA · ADD STOCKS TO WATCH</span>}
        </div>
      </div>

      <div style={{ width: "100%", padding: "0 32px 40px" }}>

        {/* ── Header ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "end", padding: "28px 0 24px", borderBottom: "1px solid #0f0f0f", marginBottom: "24px" }}>
          <div>
            <div style={{ fontSize: "10px", letterSpacing: "0.3em", color: "#252525", marginBottom: "6px" }}>NSE · BSE · INDIA</div>
            <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "clamp(40px, 5vw, 60px)", fontWeight: "800", letterSpacing: "0.04em", color: "#e8e8e0", lineHeight: 1 }}>
              STOCK<span style={{ color: "#00c896" }}>_</span>WATCHER
            </h1>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
            {running && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00c896", display: "inline-block", animation: "pulse 1.5s ease infinite" }} />
                <span style={{ fontSize: "10px", color: "#00c896", letterSpacing: "0.15em" }}>LIVE</span>
                <span style={{ fontSize: "20px", fontWeight: "700", color: countdown <= 5 ? "#00c896" : "#333", fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: "0.05em" }}>{String(countdown).padStart(2, "0")}s</span>
              </div>
            )}
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              {/* Days / Min / Sec inputs */}
              {[
                { label: "DAYS", val: days, set: setDays, max: 365 },
                { label: "MIN",  val: mins, set: setMins, max: 59 },
                { label: "SEC",  val: secs, set: setSecs, max: 59 },
              ].map(f => (
                <div key={f.label} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <input
                    type="number" min="0" max={f.max} value={f.val}
                    onChange={e => f.set(Math.max(0, Math.min(f.max, Number(e.target.value))))}
                    style={{
                      width: "52px", background: "#0a0a0a",
                      border: "1px solid #1a1a1a", color: "#c8c8c0",
                      padding: "5px 6px", borderRadius: "2px", textAlign: "center",
                      fontFamily: "'IBM Plex Mono', monospace", fontSize: "13px", fontWeight: "600"
                    }}
                    onFocus={e => e.target.style.borderColor = "#00c896"}
                    onBlur={e => e.target.style.borderColor = "#1a1a1a"}
                  />
                  <span style={{ fontSize: "9px", color: "#2a2a2a", letterSpacing: "0.12em" }}>{f.label}</span>
                </div>
              ))}
              <span style={{ fontSize: "10px", color: "#252525", margin: "0 2px" }}>
                = {totalSeconds < 60 ? `${totalSeconds}s` : totalSeconds < 3600 ? `${Math.floor(totalSeconds/60)}m ${totalSeconds%60}s` : `${Math.floor(totalSeconds/3600)}h ${Math.floor((totalSeconds%3600)/60)}m`}
              </span>
              <button onClick={toggleWatcher} style={{
                padding: "7px 20px", fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", letterSpacing: "0.12em",
                background: running ? "transparent" : "#00c896",
                border: `1px solid ${running ? "#e05c5c" : "#00c896"}`,
                color: running ? "#e05c5c" : "#060606",
                cursor: "pointer", borderRadius: "2px", transition: "all 0.2s", fontWeight: "700"
              }}
                onMouseEnter={e => { if (running) { e.target.style.background = "#e05c5c"; e.target.style.color = "#fff"; } }}
                onMouseLeave={e => { if (running) { e.target.style.background = "transparent"; e.target.style.color = "#e05c5c"; } }}
              >{running ? "STOP" : "START"}</button>
            </div>
          </div>
        </div>

        {connErr && <div style={{ border: "1px solid #e05c5c", padding: "10px 14px", fontSize: "11px", color: "#e05c5c", marginBottom: "16px" }}>⚠ {connErr}</div>}

        {/* ── Add stock ── */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "9px", letterSpacing: "0.2em", color: "#252525", marginBottom: "8px" }}>ADD STOCK</div>
          <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", flexWrap: "wrap" }}>

            {/* Search */}
            <div ref={searchRef} style={{ position: "relative", flex: "1", minWidth: "200px" }}>
              <input
                value={searchQ}
                onChange={e => { setSearchQ(e.target.value); setAdding(null); }}
                placeholder="Search symbol or company..."
                style={{
                  width: "100%", background: "#0a0a0a", border: "1px solid #1a1a1a",
                  color: "#c8c8c0", padding: "10px 12px", fontSize: "12px",
                  fontFamily: "'IBM Plex Mono', monospace", borderRadius: "2px"
                }}
                onFocus={e => e.target.style.borderColor = "#00c896"}
                onBlur={e => e.target.style.borderColor = "#1a1a1a"}
              />
              {/* Dropdown */}
              {(searchRes.length > 0 || searching) && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#0c0c0c", border: "1px solid #1a1a1a", zIndex: 100, borderTop: "none" }}>
                  {searching && <div style={{ padding: "10px 12px", fontSize: "11px", color: "#252525" }}>Searching...</div>}
                  {searchRes.map(r => (
                    <div key={r.symbol} onClick={() => selectSearchResult(r)} style={{
                      padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #0f0f0f",
                      display: "flex", justifyContent: "space-between", alignItems: "center"
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = "#111"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <span style={{ fontSize: "12px", color: "#00c896", fontWeight: "600", fontFamily: "'IBM Plex Mono', monospace" }}>{r.symbol}</span>
                      <span style={{ fontSize: "10px", color: "#383838", maxWidth: "180px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{r.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Alert thresholds — shown only after picking a symbol */}
            {adding && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "9px", color: "#00c896", letterSpacing: "0.1em" }}>▲ ABOVE ₹</span>
                  <input type="number" value={addAbove} onChange={e => setAddAbove(e.target.value)} placeholder="optional" style={{
                    width: "100px", background: "#0a0a0a", border: "1px solid #1a1a1a", color: "#c8c8c0",
                    padding: "10px 10px", fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace", borderRadius: "2px"
                  }}
                    onFocus={e => e.target.style.borderColor = "#00c896"}
                    onBlur={e => e.target.style.borderColor = "#1a1a1a"}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "9px", color: "#e05c5c", letterSpacing: "0.1em" }}>▼ BELOW ₹</span>
                  <input type="number" value={addBelow} onChange={e => setAddBelow(e.target.value)} placeholder="optional" style={{
                    width: "100px", background: "#0a0a0a", border: "1px solid #1a1a1a", color: "#c8c8c0",
                    padding: "10px 10px", fontSize: "12px", fontFamily: "'IBM Plex Mono', monospace", borderRadius: "2px"
                  }}
                    onFocus={e => e.target.style.borderColor = "#e05c5c"}
                    onBlur={e => e.target.style.borderColor = "#1a1a1a"}
                  />
                </div>
                <button onClick={confirmAdd} style={{
                  padding: "10px 20px", background: "#00c896", border: "1px solid #00c896",
                  color: "#060606", fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px",
                  fontWeight: "700", cursor: "pointer", borderRadius: "2px", letterSpacing: "0.1em",
                  transition: "all 0.15s"
                }}
                  onMouseEnter={e => { e.target.style.background = "transparent"; e.target.style.color = "#00c896"; }}
                  onMouseLeave={e => { e.target.style.background = "#00c896"; e.target.style.color = "#060606"; }}
                >ADD +</button>
              </>
            )}
          </div>
          {addErr && <div style={{ fontSize: "11px", color: "#e05c5c", marginTop: "6px" }}>⚠ {addErr}</div>}
        </div>

        {/* ── Portfolio summary ── */}
        {stocks.length > 0 && (
          <div style={{ display: "flex", gap: "24px", padding: "12px 16px", background: "#080808", border: "1px solid #0f0f0f", marginBottom: "16px" }}>
            {[
              { label: "WATCHING", value: stocks.length, color: "#c8c8c0" },
              { label: "AVG CHANGE", value: `${totalChange >= 0 ? "+" : ""}${totalChange.toFixed(2)}%`, color: totalChange >= 0 ? "#00c896" : "#e05c5c" },
              { label: "ALERTS SET", value: stocks.filter(([, s]) => s.above || s.below).length, color: "#f5c542" },
              { label: "TRIGGERED", value: stocks.filter(([, s]) => s.triggered_above || s.triggered_below).length, color: "#e05c5c" },
            ].map(s => (
              <div key={s.label}>
                <div style={{ fontSize: "8px", letterSpacing: "0.2em", color: "#252525", marginBottom: "3px" }}>{s.label}</div>
                <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: "22px", fontWeight: "700", color: s.color, lineHeight: 1 }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Stock table ── */}
        <div style={{ border: "1px solid #0f0f0f", background: "#080808", marginBottom: "20px" }}>
          {/* Header */}
          <div style={{
            display: "grid", gridTemplateColumns: "90px 1fr 100px 90px 90px 90px 140px 60px",
            gap: "8px", padding: "8px 16px", borderBottom: "1px solid #0f0f0f"
          }}>
            {["SYMBOL", "PRICE", "CHANGE", "OPEN", "HIGH", "LOW", "ALERTS", ""].map(h => (
              <div key={h} style={{ fontSize: "8px", letterSpacing: "0.2em", color: "#252525", textAlign: h === "PRICE" || h === "CHANGE" || h === "OPEN" || h === "HIGH" || h === "LOW" ? "right" : "left" }}>{h}</div>
            ))}
          </div>

          {stocks.length === 0 ? (
            <div style={{ padding: "48px 16px", textAlign: "center", color: "#1a1a1a", fontSize: "12px", letterSpacing: "0.1em" }}>
              SEARCH AND ADD STOCKS ABOVE TO START WATCHING
            </div>
          ) : (
            stocks.map(([symbol, stock]) => (
              <StockRow key={symbol} symbol={symbol} stock={stock}
                onRemove={removeStock}
                onEditAlert={(sym, stk) => setEditModal({ symbol: sym, stock: stk })}
              />
            ))
          )}
        </div>

        {/* ── Log ── */}
        <div>
          <div style={{ fontSize: "9px", letterSpacing: "0.2em", color: "#252525", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
            ACTIVITY LOG
            {running && <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#00c896", display: "inline-block", animation: "pulse 1.2s ease infinite" }} />}
          </div>
          <div ref={logsRef} style={{ background: "#080808", border: "1px solid #0f0f0f", padding: "12px 14px", height: "160px", overflowY: "auto" }}>
            {logs.length === 0
              ? <span style={{ color: "#181818", fontSize: "11px" }}>No activity yet...</span>
              : logs.map(l => <LogLine key={l.id} {...l} />)
            }
          </div>
        </div>
      </div>

      {/* ── Alert edit modal ── */}
      {editModal && (
        <AlertModal
          symbol={editModal.symbol}
          stock={editModal.stock}
          onSave={saveAlerts}
          onClose={() => setEditModal(null)}
        />
      )}
    </div>
  );
}
