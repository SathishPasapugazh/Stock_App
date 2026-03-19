import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "firebase/auth";

// ── Firebase config (replace with yours from Firebase Console) ──
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const provider    = new GoogleAuthProvider();

const API = "http://YOUR_ORACLE_IP:5000";  // ← replace with your Oracle VM IP

// ── Helpers ──
const fmt    = n => n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtRaw = n => n == null ? "" : Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct    = n => n == null ? "" : `${n >= 0 ? "+" : ""}${Number(n).toFixed(2)}%`;

async function apiFetch(path, token, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  return res;
}

// ── Components ──

function MiniBar({ value }) {
  return (
    <div style={{ width: "44px", height: "3px", background: "#111", borderRadius: "2px", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(Math.abs(value || 0) / 5 * 100, 100)}%`, height: "100%", background: value >= 0 ? "#00c896" : "#e05c5c", transition: "width 0.4s" }} />
    </div>
  );
}

function Tag({ label, color }) {
  return <span style={{ fontSize: "9px", padding: "2px 6px", border: `1px solid ${color}22`, color, background: `${color}11`, borderRadius: "2px", letterSpacing: "0.08em" }}>{label}</span>;
}

// ── Login page ──
function LoginPage({ onLogin }) {
  const [loading, setLoading] = useState(false);
  const handleLogin = async () => {
    setLoading(true);
    try { await signInWithPopup(auth, provider); }
    catch (e) { console.error(e); setLoading(false); }
  };
  return (
    <div style={{ minHeight: "100vh", background: "#060606", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Mono', monospace" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;600;700&family=Barlow+Condensed:wght@400;700;800&display=swap'); * { box-sizing:border-box; margin:0; padding:0; }`}</style>
      <div style={{ textAlign: "center", animation: "fadeIn 0.6s ease" }}>
        <div style={{ fontSize: "10px", letterSpacing: "0.3em", color: "#252525", marginBottom: "12px" }}>NSE · BSE · INDIA</div>
        <h1 style={{ fontFamily: "'Barlow Condensed'", fontSize: "72px", fontWeight: "800", color: "#e8e8e0", letterSpacing: "0.04em", lineHeight: 1, marginBottom: "8px" }}>
          STOCK<span style={{ color: "#00c896" }}>_</span>WATCHER
        </h1>
        <p style={{ color: "#2a2a2a", fontSize: "12px", letterSpacing: "0.1em", marginBottom: "48px" }}>REAL-TIME ALERTS · NSE · BSE · MULTI-USER</p>
        <button onClick={handleLogin} disabled={loading} style={{
          display: "flex", alignItems: "center", gap: "12px", margin: "0 auto",
          padding: "14px 28px", background: "transparent", border: "1px solid #1e1e1e",
          color: "#c8c8c0", fontFamily: "'IBM Plex Mono'", fontSize: "12px",
          letterSpacing: "0.12em", cursor: loading ? "wait" : "pointer", borderRadius: "2px",
          transition: "all 0.2s"
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "#00c896"; e.currentTarget.style.color = "#00c896"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e1e1e"; e.currentTarget.style.color = "#c8c8c0"; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          {loading ? "SIGNING IN..." : "CONTINUE WITH GOOGLE"}
        </button>
      </div>
      <style>{`@keyframes fadeIn { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }`}</style>
    </div>
  );
}

// ── Twilio Settings ──
function TwilioSettings({ token, existing, onSaved }) {
  const [form, setForm] = useState({ account_sid: "", auth_token: "", whatsapp_from: "whatsapp:+14155238886", whatsapp_to: "", call_from: "", call_to: "", ...existing });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true); setMsg("");
    const r = await apiFetch("/api/twilio", token, { method: "POST", body: JSON.stringify(form) });
    const d = await r.json();
    setMsg(r.ok ? "✓ Saved successfully" : `⚠ ${d.error}`);
    setSaving(false);
    if (r.ok) onSaved();
  };

  const fields = [
    { key: "account_sid",   label: "TWILIO ACCOUNT SID",    placeholder: "ACxxxxxxxxxxxxxxxx" },
    { key: "auth_token",    label: "AUTH TOKEN",             placeholder: "your auth token",    type: "password" },
    { key: "whatsapp_from", label: "WHATSAPP FROM",          placeholder: "whatsapp:+14155238886" },
    { key: "whatsapp_to",   label: "YOUR WHATSAPP NUMBER",   placeholder: "whatsapp:+91xxxxxxxxxx" },
    { key: "call_from",     label: "TWILIO CALL FROM NUMBER",placeholder: "+1xxxxxxxxxx" },
    { key: "call_to",       label: "YOUR PHONE NUMBER",      placeholder: "+91xxxxxxxxxx" },
  ];

  return (
    <div style={{ maxWidth: "520px" }}>
      <div style={{ fontSize: "9px", letterSpacing: "0.2em", color: "#252525", marginBottom: "20px" }}>TWILIO CREDENTIALS</div>
      <div style={{ background: "#0a0a0a", border: "1px solid #111", padding: "24px", marginBottom: "16px" }}>
        <p style={{ fontSize: "11px", color: "#333", lineHeight: 1.7, marginBottom: "20px" }}>
          Your credentials are stored securely and only used to send alerts to <em style={{ color: "#555" }}>your</em> phone. Get your credentials at{" "}
          <a href="https://console.twilio.com" target="_blank" rel="noreferrer" style={{ color: "#00c896" }}>console.twilio.com</a>
        </p>
        {fields.map(f => (
          <div key={f.key} style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "9px", letterSpacing: "0.15em", color: "#444", marginBottom: "6px" }}>{f.label}</label>
            <input type={f.type || "text"} value={form[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder}
              style={{ width: "100%", background: "#060606", border: "1px solid #1a1a1a", color: "#c8c8c0", padding: "10px 12px", fontFamily: "'IBM Plex Mono'", fontSize: "12px", borderRadius: "2px" }}
              onFocus={e => e.target.style.borderColor = "#00c896"}
              onBlur={e => e.target.style.borderColor = "#1a1a1a"}
            />
          </div>
        ))}
      </div>
      {msg && <div style={{ fontSize: "11px", color: msg.startsWith("✓") ? "#00c896" : "#e05c5c", marginBottom: "12px" }}>{msg}</div>}
      <button onClick={save} disabled={saving} style={{
        width: "100%", padding: "12px", background: "#00c896", border: "1px solid #00c896",
        color: "#060606", fontFamily: "'IBM Plex Mono'", fontSize: "11px", fontWeight: "700",
        letterSpacing: "0.15em", cursor: "pointer", borderRadius: "2px"
      }}>{saving ? "SAVING..." : "SAVE CREDENTIALS"}</button>
    </div>
  );
}

// ── Community tab ──
function CommunityTab({ token }) {
  const [data, setData] = useState([]);
  useEffect(() => {
    apiFetch("/api/community", token).then(r => r.json()).then(setData).catch(() => {});
  }, [token]);

  return (
    <div>
      <div style={{ fontSize: "9px", letterSpacing: "0.2em", color: "#252525", marginBottom: "16px" }}>MOST WATCHED STOCKS</div>
      <div style={{ border: "1px solid #0f0f0f" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 100px 100px", gap: "8px", padding: "8px 16px", borderBottom: "1px solid #0f0f0f" }}>
          {["SYMBOL", "NAME", "WATCHERS", "AVG ABOVE", "AVG BELOW"].map(h => (
            <div key={h} style={{ fontSize: "8px", letterSpacing: "0.15em", color: "#252525" }}>{h}</div>
          ))}
        </div>
        {data.length === 0
          ? <div style={{ padding: "32px", textAlign: "center", color: "#1a1a1a", fontSize: "11px" }}>No community data yet</div>
          : data.map(r => (
            <div key={r.symbol} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 100px 100px", gap: "8px", padding: "11px 16px", borderBottom: "1px solid #080808", alignItems: "center" }}>
              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: "13px", color: "#00c896", fontWeight: "600" }}>{r.symbol}</span>
              <span style={{ fontSize: "11px", color: "#444", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
              <span style={{ fontSize: "12px", color: "#c8c8c0" }}>{r.watchers}</span>
              <span style={{ fontSize: "11px", color: "#00c896" }}>{r.avg_above ? fmt(r.avg_above) : "—"}</span>
              <span style={{ fontSize: "11px", color: "#e05c5c" }}>{r.avg_below ? fmt(r.avg_below) : "—"}</span>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── Alert history tab ──
function AlertHistory({ token }) {
  const [data, setData] = useState([]);
  useEffect(() => {
    apiFetch("/api/alerts/history", token).then(r => r.json()).then(setData).catch(() => {});
  }, [token]);

  return (
    <div>
      <div style={{ fontSize: "9px", letterSpacing: "0.2em", color: "#252525", marginBottom: "16px" }}>ALERT HISTORY</div>
      <div style={{ border: "1px solid #0f0f0f" }}>
        {data.length === 0
          ? <div style={{ padding: "32px", textAlign: "center", color: "#1a1a1a", fontSize: "11px" }}>No alerts fired yet</div>
          : data.map(r => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "16px", padding: "10px 16px", borderBottom: "1px solid #080808" }}>
              <span style={{ fontSize: "9px", color: "#252525", flexShrink: 0 }}>{new Date(r.fired_at).toLocaleString("en-IN")}</span>
              <span style={{ fontFamily: "'IBM Plex Mono'", fontSize: "12px", color: "#e0e0d0", fontWeight: "600" }}>{r.symbol}</span>
              <Tag label={r.alert_type === "above" ? "▲ ABOVE" : "▼ BELOW"} color={r.alert_type === "above" ? "#00c896" : "#e05c5c"} />
              <span style={{ fontSize: "12px", color: "#c8c8c0" }}>₹{r.price}</span>
              <span style={{ fontSize: "11px", color: "#333" }}>threshold ₹{r.threshold}</span>
            </div>
          ))
        }
      </div>
    </div>
  );
}

// ── Main App ──
export default function App() {
  const [user, setUser]           = useState(null);
  const [token, setToken]         = useState(null);
  const [tab, setTab]             = useState("watchlist");
  const [watchlist, setWatchlist] = useState([]);
  const [prices, setPrices]       = useState({});
  const [logs, setLogs]           = useState([]);
  const [countdown, setCountdown] = useState(0);
  const [running, setRunning]     = useState(false);
  const [searchQ, setSearchQ]     = useState("");
  const [searchRes, setSearchRes] = useState([]);
  const [adding, setAdding]       = useState(null);
  const [addAbove, setAddAbove]   = useState("");
  const [addBelow, setAddBelow]   = useState("");
  const [addErr, setAddErr]       = useState("");
  const [hasTwilio, setHasTwilio] = useState(false);
  const [twilioData, setTwilioData] = useState({});
  const [editModal, setEditModal] = useState(null);
  const sseRef    = useRef(null);
  const logsRef   = useRef(null);
  const searchRef = useRef(null);

  const addLog = (msg, level = "info", ts = null) =>
    setLogs(p => [...p.slice(-100), { msg, level, ts: ts || new Date().toLocaleTimeString("en-IN", { hour12: false }), id: Date.now() + Math.random() }]);

  useEffect(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight; }, [logs]);

  // ── Auth listener ──
  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        const t = await u.getIdToken();
        setUser(u); setToken(t);
      } else {
        setUser(null); setToken(null);
        if (sseRef.current) sseRef.current.close();
      }
    });
  }, []);

  // ── Load user data on login ──
  useEffect(() => {
    if (!token) return;
    apiFetch("/api/me", token).then(r => r.json()).then(d => {
      setHasTwilio(d.has_twilio);
      setTwilioData(d.twilio_preview || {});
    });
    loadWatchlist();
    connectSSE();
  }, [token]);

  const loadWatchlist = async () => {
    if (!token) return;
    const r = await apiFetch("/api/watchlist", token);
    const d = await r.json();
    setWatchlist(d);
    if (d.length > 0) setRunning(true);
  };

  // ── SSE ──
  const connectSSE = useCallback(() => {
    if (!token) return;
    if (sseRef.current) sseRef.current.close();
    const es = new EventSource(`${API}/api/stream?token=${token}`);
    sseRef.current = es;
    es.addEventListener("prices",    e => setPrices(JSON.parse(e.data).prices || {}));
    es.addEventListener("log",       e => { const d = JSON.parse(e.data); addLog(d.msg, d.level, d.ts); });
    es.addEventListener("tick",      e => setCountdown(JSON.parse(e.data).remaining));
    es.addEventListener("alert",     e => { const d = JSON.parse(e.data); addLog(`🔔 ${d.symbol} ${d.type === "above" ? "▲" : "▼"} ₹${d.threshold} — now ₹${d.price}`, "success", d.ts); });
    es.addEventListener("connected", () => addLog("Connected to server", "system"));
    es.onerror = () => setTimeout(connectSSE, 5000);
  }, [token]);

  // Search
  useEffect(() => {
    if (!searchQ.trim() || !token) { setSearchRes([]); return; }
    const t = setTimeout(async () => {
      const r = await apiFetch(`/api/search?q=${encodeURIComponent(searchQ)}`, token);
      setSearchRes(await r.json());
    }, 350);
    return () => clearTimeout(t);
  }, [searchQ, token]);

  useEffect(() => {
    const handler = e => { if (searchRef.current && !searchRef.current.contains(e.target)) setSearchRes([]); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const startWatcher = async () => {
    await apiFetch("/api/watcher/start", token, { method: "POST" });
    setRunning(true);
  };

  const stopWatcher = async () => {
    await apiFetch("/api/watcher/stop", token, { method: "POST" });
    setRunning(false);
  };

  const confirmAdd = async () => {
    if (!adding) return;
    setAddErr("");
    const r = await apiFetch("/api/watchlist/add", token, {
      method: "POST",
      body: JSON.stringify({ symbol: adding.symbol, above: addAbove || null, below: addBelow || null })
    });
    const d = await r.json();
    if (!r.ok) { setAddErr(d.error); return; }
    setAdding(null); setSearchQ(""); setAddAbove(""); setAddBelow("");
    loadWatchlist();
    startWatcher();
  };

  const removeStock = async (symbol) => {
    await apiFetch("/api/watchlist/remove", token, { method: "POST", body: JSON.stringify({ symbol }) });
    loadWatchlist();
  };

  const saveAlerts = async (symbol, above, below) => {
    await apiFetch("/api/watchlist/update", token, { method: "POST", body: JSON.stringify({ symbol, above, below }) });
    setEditModal(null);
    loadWatchlist();
  };

  const logout = () => signOut(auth);

  if (!user) return <LoginPage />;

  const tabs = ["watchlist", "community", "history", "settings"];

  return (
    <div style={{ minHeight: "100vh", background: "#060606", color: "#c8c8c0", fontFamily: "'IBM Plex Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;600;700&family=Barlow+Condensed:wght@400;700;800&display=swap');
        *, *::before, *::after { box-sizing:border-box; margin:0; padding:0; }
        body, #root { max-width:100% !important; width:100% !important; padding:0 !important; }
        input { outline:none; } input::placeholder { color:#252525; }
        ::-webkit-scrollbar { width:3px; } ::-webkit-scrollbar-track { background:#080808; } ::-webkit-scrollbar-thumb { background:#1e1e1e; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes tickerScroll { from{transform:translateX(0)} to{transform:translateX(-50%)} }
      `}</style>

      {/* Ticker */}
      <div style={{ background: "#080808", borderBottom: "1px solid #0d0d0d", height: "26px", overflow: "hidden", display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "28px", whiteSpace: "nowrap", padding: "0 16px", animation: watchlist.length ? "tickerScroll 25s linear infinite" : "none" }}>
          {[...watchlist, ...watchlist].map((s, i) => {
            const p = prices[s.symbol];
            return (
              <span key={i} style={{ fontSize: "10px", letterSpacing: "0.06em", color: p?.change_pct >= 0 ? "#00c896" : "#e05c5c" }}>
                {s.symbol} <span style={{ color: "#c8c8c0" }}>{p ? fmt(p.price) : "—"}</span> {p ? pct(p.change_pct) : ""}
              </span>
            );
          })}
          {watchlist.length === 0 && <span style={{ fontSize: "10px", color: "#181818", letterSpacing: "0.1em" }}>NSE · BSE INDIA · ADD STOCKS TO WATCH</span>}
        </div>
      </div>

      <div style={{ width: "100%", padding: "0 32px 40px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 0 20px", borderBottom: "1px solid #0d0d0d", marginBottom: "24px" }}>
          <div>
            <div style={{ fontSize: "9px", letterSpacing: "0.3em", color: "#1e1e1e", marginBottom: "4px" }}>NSE · BSE · INDIA</div>
            <h1 style={{ fontFamily: "'Barlow Condensed'", fontSize: "clamp(36px, 4vw, 52px)", fontWeight: "800", letterSpacing: "0.04em", color: "#e8e8e0", lineHeight: 1 }}>
              STOCK<span style={{ color: "#00c896" }}>_</span>WATCHER
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {running && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#00c896", display: "inline-block", animation: "pulse 1.5s ease infinite" }} />
                <span style={{ fontSize: "10px", color: "#00c896", letterSpacing: "0.15em" }}>LIVE</span>
                <span style={{ fontFamily: "'Barlow Condensed'", fontSize: "22px", fontWeight: "700", color: countdown <= 5 ? "#00c896" : "#333" }}>{String(countdown).padStart(2, "0")}s</span>
              </div>
            )}
            <button onClick={running ? stopWatcher : startWatcher} style={{
              padding: "6px 16px", fontFamily: "'IBM Plex Mono'", fontSize: "10px", letterSpacing: "0.12em", fontWeight: "700",
              background: running ? "transparent" : "#00c896",
              border: `1px solid ${running ? "#e05c5c" : "#00c896"}`,
              color: running ? "#e05c5c" : "#060606",
              cursor: "pointer", borderRadius: "2px", transition: "all 0.2s"
            }}>{running ? "STOP" : "START"}</button>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingLeft: "16px", borderLeft: "1px solid #111" }}>
              {user.photoURL && <img src={user.photoURL} alt="" style={{ width: "28px", height: "28px", borderRadius: "50%", border: "1px solid #1e1e1e" }} />}
              <div>
                <div style={{ fontSize: "11px", color: "#c8c8c0" }}>{user.displayName?.split(" ")[0]}</div>
                <div style={{ fontSize: "9px", color: "#333", letterSpacing: "0.05em" }}>{user.email}</div>
              </div>
              <button onClick={logout} style={{ background: "none", border: "1px solid #1a1a1a", color: "#333", fontSize: "9px", padding: "4px 8px", cursor: "pointer", borderRadius: "2px", letterSpacing: "0.1em", fontFamily: "'IBM Plex Mono'" }}>LOGOUT</button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "0", borderBottom: "1px solid #0d0d0d", marginBottom: "28px" }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "10px 20px", background: "none", border: "none",
              borderBottom: `2px solid ${tab === t ? "#00c896" : "transparent"}`,
              color: tab === t ? "#00c896" : "#333",
              fontFamily: "'IBM Plex Mono'", fontSize: "10px", letterSpacing: "0.15em",
              cursor: "pointer", transition: "all 0.15s", textTransform: "uppercase"
            }}>{t}</button>
          ))}
        </div>

        {/* ── WATCHLIST TAB ── */}
        {tab === "watchlist" && (
          <div style={{ animation: "fadeIn 0.3s ease" }}>

            {/* Add stock */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "9px", letterSpacing: "0.2em", color: "#252525", marginBottom: "8px" }}>ADD STOCK</div>
              <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", flexWrap: "wrap" }}>
                <div ref={searchRef} style={{ position: "relative", flex: 1, minWidth: "220px" }}>
                  <input value={searchQ} onChange={e => { setSearchQ(e.target.value); setAdding(null); }}
                    placeholder="Search symbol or company..."
                    style={{ width: "100%", background: "#0a0a0a", border: "1px solid #1a1a1a", color: "#c8c8c0", padding: "10px 12px", fontSize: "12px", fontFamily: "'IBM Plex Mono'", borderRadius: "2px" }}
                    onFocus={e => e.target.style.borderColor = "#00c896"}
                    onBlur={e => e.target.style.borderColor = "#1a1a1a"}
                  />
                  {searchRes.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#0c0c0c", border: "1px solid #1a1a1a", zIndex: 100, borderTop: "none" }}>
                      {searchRes.map(r => (
                        <div key={r.symbol} onClick={() => { setAdding(r); setSearchQ(r.symbol); setSearchRes([]); }}
                          style={{ padding: "10px 12px", cursor: "pointer", borderBottom: "1px solid #0f0f0f", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                          onMouseEnter={e => e.currentTarget.style.background = "#111"}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          <span style={{ fontSize: "12px", color: "#00c896", fontWeight: "600" }}>{r.symbol}</span>
                          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                            <span style={{ fontSize: "10px", color: "#383838" }}>{r.name}</span>
                            <Tag label={r.exchange} color={r.exchange === "NSE" ? "#00c896" : "#f5c542"} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {adding && (
                  <>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "9px", color: "#00c896" }}>▲ ₹</span>
                      <input type="number" value={addAbove} onChange={e => setAddAbove(e.target.value)} placeholder="above"
                        style={{ width: "90px", background: "#0a0a0a", border: "1px solid #1a1a1a", color: "#c8c8c0", padding: "10px 8px", fontSize: "12px", fontFamily: "'IBM Plex Mono'", borderRadius: "2px" }}
                        onFocus={e => e.target.style.borderColor = "#00c896"} onBlur={e => e.target.style.borderColor = "#1a1a1a"}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontSize: "9px", color: "#e05c5c" }}>▼ ₹</span>
                      <input type="number" value={addBelow} onChange={e => setAddBelow(e.target.value)} placeholder="below"
                        style={{ width: "90px", background: "#0a0a0a", border: "1px solid #1a1a1a", color: "#c8c8c0", padding: "10px 8px", fontSize: "12px", fontFamily: "'IBM Plex Mono'", borderRadius: "2px" }}
                        onFocus={e => e.target.style.borderColor = "#e05c5c"} onBlur={e => e.target.style.borderColor = "#1a1a1a"}
                      />
                    </div>
                    <button onClick={confirmAdd} style={{
                      padding: "10px 20px", background: "#00c896", border: "1px solid #00c896",
                      color: "#060606", fontFamily: "'IBM Plex Mono'", fontSize: "11px", fontWeight: "700",
                      cursor: "pointer", borderRadius: "2px", letterSpacing: "0.1em"
                    }}>ADD +</button>
                  </>
                )}
              </div>
              {addErr && <div style={{ fontSize: "11px", color: "#e05c5c", marginTop: "6px" }}>⚠ {addErr}</div>}
            </div>

            {/* Stock table */}
            <div style={{ border: "1px solid #0d0d0d", background: "#080808", marginBottom: "20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 110px 90px 90px 90px 150px 50px", gap: "8px", padding: "8px 16px", borderBottom: "1px solid #0d0d0d" }}>
                {["SYMBOL", "PRICE", "CHANGE", "OPEN", "HIGH", "LOW", "ALERTS", ""].map(h => (
                  <div key={h} style={{ fontSize: "8px", letterSpacing: "0.15em", color: "#252525" }}>{h}</div>
                ))}
              </div>
              {watchlist.length === 0
                ? <div style={{ padding: "48px", textAlign: "center", color: "#1a1a1a", fontSize: "11px", letterSpacing: "0.1em" }}>SEARCH AND ADD STOCKS TO START WATCHING</div>
                : watchlist.map(stock => {
                  const p = prices[stock.symbol];
                  const isUp = (p?.change_pct || 0) >= 0;
                  return (
                    <div key={stock.symbol} style={{ display: "grid", gridTemplateColumns: "100px 1fr 110px 90px 90px 90px 150px 50px", gap: "8px", padding: "12px 16px", borderBottom: "1px solid #080808", alignItems: "center" }}>
                      <div>
                        <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: "13px", color: "#e0e0d0", fontWeight: "600" }}>{stock.symbol}</div>
                        <div style={{ fontSize: "9px", color: "#252525", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stock.name}</div>
                      </div>
                      <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: "15px", fontWeight: "700", color: "#e8e8e0", textAlign: "right" }}>{p ? fmt(p.price) : "—"}</div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: "12px", color: isUp ? "#00c896" : "#e05c5c" }}>{p ? pct(p.change_pct) : "—"}</div>
                        <MiniBar value={p?.change_pct || 0} />
                      </div>
                      {["open", "high", "low"].map(k => (
                        <div key={k} style={{ fontFamily: "'IBM Plex Mono'", fontSize: "11px", color: k === "high" ? "#00c896" : k === "low" ? "#e05c5c" : "#444", textAlign: "right" }}>
                          <div style={{ fontSize: "8px", color: "#1e1e1e", letterSpacing: "0.1em" }}>{k.toUpperCase()}</div>
                          {p ? fmt(p[k]) : "—"}
                        </div>
                      ))}
                      <div style={{ display: "flex", flexDirection: "column", gap: "3px", cursor: "pointer" }} onClick={() => setEditModal(stock)}>
                        {stock.above && <span style={{ fontSize: "9px", color: "#00c896", border: "1px solid #00c89622", padding: "2px 5px", borderRadius: "2px" }}>▲ {fmt(stock.above)}</span>}
                        {stock.below && <span style={{ fontSize: "9px", color: "#e05c5c", border: "1px solid #e05c5c22", padding: "2px 5px", borderRadius: "2px" }}>▼ {fmt(stock.below)}</span>}
                        {!stock.above && !stock.below && <span style={{ fontSize: "9px", color: "#1e1e1e" }}>+ SET ALERT</span>}
                      </div>
                      <button onClick={() => removeStock(stock.symbol)} style={{ background: "none", border: "1px solid #111", color: "#252525", fontSize: "11px", cursor: "pointer", padding: "4px 8px", borderRadius: "2px", fontFamily: "'IBM Plex Mono'", transition: "all 0.15s" }}
                        onMouseEnter={e => { e.target.style.borderColor = "#e05c5c"; e.target.style.color = "#e05c5c"; }}
                        onMouseLeave={e => { e.target.style.borderColor = "#111"; e.target.style.color = "#252525"; }}
                      >✕</button>
                    </div>
                  );
                })
              }
            </div>

            {/* Log */}
            <div style={{ fontSize: "9px", letterSpacing: "0.2em", color: "#1e1e1e", marginBottom: "8px" }}>ACTIVITY LOG</div>
            <div ref={logsRef} style={{ background: "#080808", border: "1px solid #0d0d0d", padding: "12px 14px", height: "150px", overflowY: "auto" }}>
              {logs.length === 0
                ? <span style={{ color: "#141414", fontSize: "11px" }}>No activity yet...</span>
                : logs.map(l => (
                  <div key={l.id} style={{ display: "flex", gap: "10px", padding: "2px 0", fontSize: "11px", lineHeight: 1.6 }}>
                    <span style={{ color: "#1e1e1e", flexShrink: 0 }}>{l.ts}</span>
                    <span style={{ color: { info: "#2a2a2a", success: "#00c896", error: "#e05c5c", system: "#1e4a6e" }[l.level] || "#2a2a2a" }}>{l.msg}</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}

        {tab === "community" && <CommunityTab token={token} />}
        {tab === "history"   && <AlertHistory token={token} />}
        {tab === "settings"  && <TwilioSettings token={token} existing={twilioData} onSaved={() => setHasTwilio(true)} />}
      </div>

      {/* Edit alert modal */}
      {editModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setEditModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#0d0d0d", border: "1px solid #1e1e1e", padding: "32px", width: "340px", borderRadius: "2px" }}>
            <div style={{ fontSize: "9px", letterSpacing: "0.2em", color: "#333", marginBottom: "4px" }}>SET ALERT</div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: "20px", color: "#e0e0d0", fontWeight: "700", marginBottom: "20px" }}>{editModal.symbol}</div>
            {[
              { label: "ALERT ABOVE ▲", key: "above", color: "#00c896", init: editModal.above || "" },
              { label: "ALERT BELOW ▼", key: "below", color: "#e05c5c", init: editModal.below || "" },
            ].map(f => {
              const [val, setVal] = useState(f.init);
              return (
                <div key={f.key} style={{ marginBottom: "20px" }}>
                  <label style={{ display: "block", fontSize: "9px", letterSpacing: "0.15em", color: f.color, marginBottom: "8px" }}>{f.label}</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <span style={{ color: "#333", alignSelf: "center" }}>₹</span>
                    <input type="number" value={val} onChange={e => setVal(e.target.value)} placeholder="—"
                      style={{ flex: 1, background: "#080808", border: "1px solid #1a1a1a", color: "#c8c8c0", padding: "10px 12px", fontFamily: "'IBM Plex Mono'", fontSize: "14px", borderRadius: "2px" }}
                      onFocus={e => e.target.style.borderColor = f.color} onBlur={e => e.target.style.borderColor = "#1a1a1a"}
                    />
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <button onClick={() => setEditModal(null)} style={{ flex: 1, padding: "12px", background: "transparent", border: "1px solid #1a1a1a", color: "#444", fontFamily: "'IBM Plex Mono'", fontSize: "11px", cursor: "pointer", borderRadius: "2px" }}>CANCEL</button>
              <button onClick={() => saveAlerts(editModal.symbol, document.querySelectorAll("#alert-above")[0]?.value, document.querySelectorAll("#alert-below")[0]?.value)}
                style={{ flex: 2, padding: "12px", background: "#00c896", border: "none", color: "#060606", fontFamily: "'IBM Plex Mono'", fontSize: "11px", fontWeight: "700", cursor: "pointer", borderRadius: "2px" }}>SAVE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
