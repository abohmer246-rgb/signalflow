import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONFIG ────────────────────────────────────────────────────────────
const API_KEY = import.meta.env.VITE_FINNHUB_KEY || "";
const BASE = "https://finnhub.io/api/v1";
const REFRESH_NEWS = 60000;
const REFRESH_QUOTES = 15000;

const WATCHLIST_DEFAULT = ["NVDA", "TSLA", "AAPL", "MSFT", "AMD", "META", "AMZN", "GOOGL"];

// ─── SENTIMENT KEYWORDS ────────────────────────────────────────────────
const BULLISH_WORDS = [
  "beats","surpass","record high","upgrade","buy","outperform","raise","growth",
  "surge","rally","soar","boom","breakout","bullish","strong","exceed","profit",
  "positive","innovative","expansion","partnership","approved","launches","wins",
  "acquires","deal","contract","revenue up","earnings beat","all-time high",
  "momentum","recovery","rebound","dividend","buyback","stock split","upside"
];
const BEARISH_WORDS = [
  "miss","downgrade","sell","underperform","cut","decline","crash","plunge",
  "drop","fall","bearish","weak","loss","negative","layoff","lawsuit","fine",
  "recall","bankruptcy","default","debt","warning","risk","concern","fraud",
  "investigation","subpoena","SEC","penalty","closure","shutdown","slowdown",
  "recession","inflation","tariff","ban","reject","delay","fail","downturn"
];

function analyzeSentiment(headline) {
  const lower = headline.toLowerCase();
  let bullScore = 0, bearScore = 0;
  BULLISH_WORDS.forEach(w => { if (lower.includes(w)) bullScore++; });
  BEARISH_WORDS.forEach(w => { if (lower.includes(w)) bearScore++; });
  const total = bullScore + bearScore;
  if (total === 0) return { sentiment: "neutral", confidence: 0, score: 50 };
  const score = Math.round((bullScore / total) * 100);
  const confidence = Math.min(total * 20, 100);
  if (score >= 60) return { sentiment: "bullish", confidence, score };
  if (score <= 40) return { sentiment: "bearish", confidence, score };
  return { sentiment: "neutral", confidence, score: 50 };
}

function getSignal(sentiment, confidence, priceChange) {
  if (sentiment === "bullish" && confidence >= 40) {
    if (priceChange > 0) return { signal: "LONG", strength: "stark", timeframe: "Intraday / Swing (1-5 Tage)", backup: "✅ Kurs bestätigt Sentiment" };
    return { signal: "LONG", strength: "mittel", timeframe: "Swing (2-7 Tage)", backup: "⚠️ Kurs noch nicht bestätigt — Einstieg abwarten" };
  }
  if (sentiment === "bearish" && confidence >= 40) {
    if (priceChange < 0) return { signal: "SHORT", strength: "stark", timeframe: "Intraday / Swing (1-5 Tage)", backup: "✅ Kurs bestätigt Sentiment" };
    return { signal: "SHORT", strength: "mittel", timeframe: "Swing (2-7 Tage)", backup: "⚠️ Kurs geht noch dagegen — Geduld" };
  }
  return { signal: "ABWARTEN", strength: "schwach", timeframe: "—", backup: "⛔ Kein klares Signal" };
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() / 1000) - ts);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function SignalBadge({ signal }) {
  const colors = {
    LONG: { bg: "rgba(0,230,118,0.12)", border: "rgba(0,230,118,0.35)", text: "#00e676" },
    SHORT: { bg: "rgba(255,82,82,0.12)", border: "rgba(255,82,82,0.35)", text: "#ff5252" },
    ABWARTEN: { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)", text: "#888" },
  };
  const c = colors[signal] || colors.ABWARTEN;
  return (
    <span style={{ padding: "3px 10px", borderRadius: 4, background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontSize: 11, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.5px" }}>
      {signal === "LONG" ? "▲ LONG" : signal === "SHORT" ? "▼ SHORT" : "● WAIT"}
    </span>
  );
}

function ConfidenceBar({ confidence, sentiment }) {
  const color = sentiment === "bullish" ? "#00e676" : sentiment === "bearish" ? "#ff5252" : "#555";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ width: `${confidence}%`, height: "100%", borderRadius: 2, background: color, transition: "width 0.5s ease" }} />
      </div>
      <span style={{ fontSize: 10, color: "#666", fontFamily: "'JetBrains Mono', monospace" }}>{confidence}%</span>
    </div>
  );
}

function QuoteCard({ symbol, quote, onClick }) {
  if (!quote) return (
    <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", minWidth: 130, flexShrink: 0 }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: "#7c8aff" }}>${symbol}</span>
      <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>Laden...</div>
    </div>
  );
  const change = quote.dp || 0;
  const isUp = change >= 0;
  return (
    <div onClick={() => onClick(symbol)} style={{
      padding: "10px 14px", borderRadius: 8, cursor: "pointer",
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      transition: "all 0.2s", minWidth: 130, flexShrink: 0,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: "#7c8aff" }}>${symbol}</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, color: isUp ? "#00e676" : "#ff5252" }}>
          {isUp ? "▲" : "▼"} {change.toFixed(2)}%
        </span>
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: "#fff" }}>
        ${quote.c?.toFixed(2) || "—"}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 9, color: "#555", fontFamily: "'JetBrains Mono', monospace" }}>H: ${quote.h?.toFixed(2)}</span>
        <span style={{ fontSize: 9, color: "#555", fontFamily: "'JetBrains Mono', monospace" }}>L: ${quote.l?.toFixed(2)}</span>
      </div>
    </div>
  );
}

function NewsCard({ item, quote, isNew }) {
  const [expanded, setExpanded] = useState(false);
  const { sentiment, confidence, score } = analyzeSentiment(item.headline);
  const priceChange = quote?.dp || 0;
  const sig = getSignal(sentiment, confidence, priceChange);

  return (
    <div onClick={() => setExpanded(!expanded)} style={{
      padding: "14px 18px", cursor: "pointer",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      background: isNew ? "linear-gradient(90deg, rgba(0,230,118,0.05) 0%, transparent 30%)" : "transparent",
      transition: "all 0.2s", position: "relative",
    }}>
      {isNew && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#00e676", borderRadius: "0 2px 2px 0" }} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            {item.related && (
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#7c8aff", fontWeight: 600, padding: "1px 6px", background: "rgba(124,138,255,0.1)", borderRadius: 3 }}>
                ${item.related.split(",")[0]}
              </span>
            )}
            <SignalBadge signal={sig.signal} />
            <ConfidenceBar confidence={confidence} sentiment={sentiment} />
            <span style={{ fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace" }}>{item.source}</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.88)", fontWeight: 500 }}>{item.headline}</p>

          {expanded && (
            <div style={{ marginTop: 10, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div>
                  <span style={{ fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace" }}>SIGNAL</span>
                  <div style={{ fontSize: 16, fontWeight: 800, color: sig.signal === "LONG" ? "#00e676" : sig.signal === "SHORT" ? "#ff5252" : "#888", fontFamily: "'JetBrains Mono', monospace" }}>{sig.signal}</div>
                </div>
                <div>
                  <span style={{ fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace" }}>STÄRKE</span>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", fontFamily: "'JetBrains Mono', monospace" }}>{sig.strength.toUpperCase()}</div>
                </div>
                <div>
                  <span style={{ fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace" }}>ZEITRAUM</span>
                  <div style={{ fontSize: 12, color: "#ccc" }}>{sig.timeframe}</div>
                </div>
                <div>
                  <span style={{ fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace" }}>KURS-CHANGE</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: priceChange >= 0 ? "#00e676" : "#ff5252", fontFamily: "'JetBrains Mono', monospace" }}>
                    {priceChange >= 0 ? "+" : ""}{priceChange.toFixed(2)}%
                  </div>
                </div>
              </div>
              <div style={{
                padding: "8px 12px", borderRadius: 6, fontSize: 12,
                background: sig.backup.includes("✅") ? "rgba(0,230,118,0.08)" : sig.backup.includes("⚠️") ? "rgba(255,193,7,0.08)" : "rgba(255,82,82,0.08)",
                border: `1px solid ${sig.backup.includes("✅") ? "rgba(0,230,118,0.2)" : sig.backup.includes("⚠️") ? "rgba(255,193,7,0.2)" : "rgba(255,82,82,0.2)"}`,
                color: sig.backup.includes("✅") ? "#00e676" : sig.backup.includes("⚠️") ? "#ffc107" : "#ff5252",
                fontWeight: 500, marginBottom: 10,
              }}>
                BACKUP-CHECK: {sig.backup}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace" }}>SENTIMENT:</span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
                  <div style={{
                    position: "absolute", left: 0, top: 0, bottom: 0, width: `${score}%`, borderRadius: 3,
                    background: score >= 60 ? "linear-gradient(90deg, #00e676, #69f0ae)" : score <= 40 ? "linear-gradient(90deg, #ff5252, #ff8a80)" : "linear-gradient(90deg, #666, #888)",
                  }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: score >= 60 ? "#00e676" : score <= 40 ? "#ff5252" : "#888", fontFamily: "'JetBrains Mono', monospace" }}>{score}/100</span>
              </div>
              {item.summary && <p style={{ margin: "10px 0 0", fontSize: 12, color: "#888", lineHeight: 1.6 }}>{item.summary.slice(0, 250)}...</p>}
              <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: 11, color: "#7c8aff", textDecoration: "none" }} onClick={e => e.stopPropagation()}>Artikel lesen →</a>
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: isNew ? "#00e676" : "#555", fontWeight: isNew ? 700 : 400 }}>{timeAgo(item.datetime)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────────────────
export default function StockNewsFilter() {
  const [news, setNews] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [watchlist, setWatchlist] = useState(WATCHLIST_DEFAULT);
  const [watchlistInput, setWatchlistInput] = useState("");
  const [searchTicker, setSearchTicker] = useState("");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [signalFilter, setSignalFilter] = useState("all");
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const prevNewsCount = useRef(0);

  const fetchNews = useCallback(async () => {
    if (!API_KEY) {
      setError("Kein API Key gefunden. Trage VITE_FINNHUB_KEY in Vercel Environment Variables ein.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${BASE}/news?category=general&token=${API_KEY}`);
      if (!res.ok) throw new Error(`API Error: ${res.status}`);
      const data = await res.json();
      const companyNews = [];
      const today = new Date().toISOString().split("T")[0];
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      for (const sym of watchlist.slice(0, 3)) {
        try {
          const cRes = await fetch(`${BASE}/company-news?symbol=${sym}&from=${weekAgo}&to=${today}&token=${API_KEY}`);
          if (cRes.ok) {
            const cData = await cRes.json();
            companyNews.push(...cData.slice(0, 5).map(n => ({ ...n, related: sym })));
          }
        } catch (e) {}
      }
      const allNews = [...data, ...companyNews]
        .sort((a, b) => b.datetime - a.datetime)
        .filter((item, idx, arr) => arr.findIndex(n => n.headline === item.headline) === idx)
        .slice(0, 60);
      if (prevNewsCount.current > 0 && allNews.length > prevNewsCount.current && soundOn) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.frequency.value = 880; osc.type = "sine";
          gain.gain.setValueAtTime(0.15, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
        } catch(e) {}
      }
      prevNewsCount.current = allNews.length;
      setNews(allNews);
      setApiConnected(true);
      setLastFetch(Date.now());
      setError("");
    } catch (err) {
      setError(`Fehler: ${err.message}`);
      setApiConnected(false);
    } finally {
      setLoading(false);
    }
  }, [API_KEY, watchlist, soundOn]);

  const fetchQuotes = useCallback(async () => {
    if (!API_KEY) return;
    const newQuotes = { ...quotes };
    for (const sym of watchlist) {
      try {
        const res = await fetch(`${BASE}/quote?symbol=${sym}&token=${API_KEY}`);
        if (res.ok) {
          const data = await res.json();
          if (data.c) newQuotes[sym] = data;
        }
      } catch (e) {}
    }
    setQuotes(newQuotes);
  }, [API_KEY, watchlist]);

  useEffect(() => {
    fetchNews();
    fetchQuotes();
    const t1 = setInterval(fetchNews, REFRESH_NEWS);
    const t2 = setInterval(fetchQuotes, REFRESH_QUOTES);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [fetchNews, fetchQuotes]);

  const filtered = news.filter(item => {
    const { sentiment, confidence } = analyzeSentiment(item.headline);
    const ticker = item.related?.split(",")[0] || "";
    const sig = getSignal(sentiment, confidence, quotes[ticker]?.dp || 0);
    if (sentimentFilter !== "all" && sentiment !== sentimentFilter) return false;
    if (signalFilter !== "all" && sig.signal !== signalFilter) return false;
    if (onlyHigh && confidence < 50) return false;
    if (searchTicker) {
      const q = searchTicker.toLowerCase();
      if (!item.headline.toLowerCase().includes(q) && !(item.related || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const addToWatchlist = () => {
    const t = watchlistInput.toUpperCase().trim();
    if (t && !watchlist.includes(t)) setWatchlist([...watchlist, t]);
    setWatchlistInput("");
  };

  const signalCounts = { LONG: 0, SHORT: 0, ABWARTEN: 0 };
  news.slice(0, 20).forEach(item => {
    const { sentiment, confidence } = analyzeSentiment(item.headline);
    const ticker = item.related?.split(",")[0] || "";
    const sig = getSignal(sentiment, confidence, quotes[ticker]?.dp || 0);
    signalCounts[sig.signal]++;
  });

  return (
    <div style={{ minHeight: "100vh", background: "#080a0f", color: "#e0e0e0", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
        @keyframes blink { 0%,100% { opacity:1; } 50% { opacity:0.2; } }
        @keyframes scan { 0% { transform:translateX(-100%); } 100% { transform:translateX(100%); } }
        @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } }
        * { box-sizing:border-box; }
        ::-webkit-scrollbar { width:6px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:3px; }
        .fb { background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); color:#888; padding:6px 12px; border-radius:6px; font-size:12px; cursor:pointer; transition:all 0.2s; font-family:'JetBrains Mono',monospace; white-space:nowrap; }
        .fb:hover { background:rgba(255,255,255,0.08); color:#ccc; }
        .fb.a { background:rgba(124,138,255,0.15); border-color:rgba(124,138,255,0.3); color:#7c8aff; }
        .ch { display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:4px; font-size:11px; font-weight:600; font-family:'JetBrains Mono',monospace; cursor:pointer; transition:all 0.2s; background:rgba(124,138,255,0.08); border:1px solid rgba(124,138,255,0.15); color:#7c8aff; }
        .ch:hover { background:rgba(255,82,82,0.15); border-color:rgba(255,82,82,0.3); color:#ff5252; }
      `}</style>

      {/* HEADER */}
      <header style={{ padding: "14px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(124,138,255,0.04) 0%, transparent 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #7c8aff, #5c6bc0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚡</div>
            <h1 style={{ margin: 0, fontSize: 18, fontFamily: "'Space Mono', monospace", color: "#fff" }}>SIGNAL<span style={{ color: "#7c8aff" }}>FLOW</span> <span style={{ fontSize: 11, color: "#00e676", fontWeight: 400 }}>v2.0</span></h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: apiConnected ? "#00e676" : "#ff5252", animation: apiConnected ? "blink 2s infinite" : "none" }} />
              <span style={{ fontSize: 11, color: apiConnected ? "#00e676" : "#ff5252", fontFamily: "'JetBrains Mono', monospace" }}>{apiConnected ? `LIVE • ${news.length} News` : "OFFLINE"}</span>
            </div>
            {lastFetch && <span style={{ fontSize: 10, color: "#444", fontFamily: "'JetBrains Mono', monospace" }}>Update: {new Date(lastFetch).toLocaleTimeString("de-DE")}</span>}
            <button className="fb" onClick={() => setSoundOn(!soundOn)}>{soundOn ? "🔊" : "🔇"}</button>
            <button className="fb" onClick={() => { fetchNews(); fetchQuotes(); }} style={{ color: "#7c8aff" }}>🔄 Refresh</button>
          </div>
        </div>
      </header>

      {error && (
        <div style={{ margin: "12px 24px", padding: "12px 16px", background: "rgba(255,82,82,0.08)", border: "1px solid rgba(255,82,82,0.2)", borderRadius: 8 }}>
          <span style={{ color: "#ff5252", fontSize: 13 }}>⚠️ {error}</span>
        </div>
      )}

      {/* QUOTES BAR */}
      <div style={{ padding: "12px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 8, paddingBottom: 4 }}>
          {watchlist.map(sym => <QuoteCard key={sym} symbol={sym} quote={quotes[sym]} onClick={s => setSearchTicker(s)} />)}
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 160px)" }}>
        {/* SIDEBAR */}
        <aside style={{ width: 260, borderRight: "1px solid rgba(255,255,255,0.06)", padding: 16, flexShrink: 0, display: "flex", flexDirection: "column", gap: 18, overflowY: "auto" }}>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 6, letterSpacing: "1px" }}>SUCHE</label>
            <input type="text" placeholder="Ticker oder Keyword..." value={searchTicker} onChange={e => setSearchTicker(e.target.value)}
              style={{ width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff", fontSize: 13, outline: "none", fontFamily: "'JetBrains Mono', monospace" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, letterSpacing: "1px" }}>SIGNAL</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {[["all", "◉ Alle Signale"], ["LONG", "▲ Nur LONG"], ["SHORT", "▼ Nur SHORT"], ["ABWARTEN", "● Nur ABWARTEN"]].map(([k, l]) => (
                <button key={k} className={`fb ${signalFilter === k ? "a" : ""}`} onClick={() => setSignalFilter(k)} style={{ textAlign: "left" }}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, letterSpacing: "1px" }}>SENTIMENT</label>
            <div style={{ display: "flex", gap: 4 }}>
              {[["all", "Alle"], ["bullish", "▲ Bull"], ["bearish", "▼ Bear"]].map(([k, l]) => (
                <button key={k} className={`fb ${sentimentFilter === k ? "a" : ""}`} onClick={() => setSentimentFilter(k)} style={{ flex: 1, textAlign: "center" }}>{l}</button>
              ))}
            </div>
          </div>
          <button className={`fb ${onlyHigh ? "a" : ""}`} onClick={() => setOnlyHigh(!onlyHigh)}
            style={{ width: "100%", textAlign: "center", padding: 8, background: onlyHigh ? "rgba(255,145,0,0.12)" : undefined, borderColor: onlyHigh ? "rgba(255,145,0,0.3)" : undefined, color: onlyHigh ? "#ff9100" : undefined }}>
            🎯 Nur Hohe Confidence
          </button>
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, letterSpacing: "1px" }}>WATCHLIST</label>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              <input type="text" placeholder="+ Ticker" value={watchlistInput} onChange={e => setWatchlistInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addToWatchlist()}
                style={{ flex: 1, padding: "7px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", fontSize: 12, outline: "none", fontFamily: "'JetBrains Mono', monospace" }} />
              <button onClick={addToWatchlist} style={{ background: "rgba(124,138,255,0.15)", border: "1px solid rgba(124,138,255,0.3)", color: "#7c8aff", borderRadius: 6, padding: "0 12px", cursor: "pointer", fontSize: 14 }}>+</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {watchlist.map(t => <span key={t} className="ch" onClick={() => setWatchlist(watchlist.filter(x => x !== t))}>${t} <span style={{ opacity: 0.5 }}>×</span></span>)}
            </div>
          </div>
          <div style={{ padding: 12, background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
            <label style={{ display: "block", fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, letterSpacing: "1px" }}>SIGNAL-ÜBERSICHT</label>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {[["LONG", "#00e676"], ["SHORT", "#ff5252"], ["WAIT", "#888"]].map(([label, color]) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'JetBrains Mono', monospace" }}>{signalCounts[label === "WAIT" ? "ABWARTEN" : label]}</div>
                  <div style={{ fontSize: 9, color }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* MAIN FEED */}
        <main style={{ flex: 1, padding: "16px 20px", overflowY: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300 }}>
              <div style={{ width: 36, height: 36, border: "3px solid rgba(124,138,255,0.2)", borderTopColor: "#7c8aff", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: 16 }} />
              <span style={{ color: "#7c8aff", fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>News werden geladen...</span>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1px" }}>LIVE FEED — {filtered.length} NEWS</span>
                <div style={{ position: "relative", overflow: "hidden", padding: "4px 12px", borderRadius: 4, background: "rgba(0,230,118,0.06)", border: "1px solid rgba(0,230,118,0.15)" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(90deg, transparent, rgba(0,230,118,0.08), transparent)", animation: "scan 3s linear infinite" }} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#00e676", position: "relative" }}>● SCANNING</span>
                </div>
              </div>
              <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.01)" }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", color: "#444" }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                    <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>Keine News mit diesen Filtern</p>
                  </div>
                ) : (
                  filtered.map((item, i) => (
                    <NewsCard key={`${item.id}-${item.datetime}-${i}`} item={item} quote={quotes[item.related?.split(",")[0]] || null} isNew={(Date.now() / 1000) - item.datetime < 600} />
                  ))
                )}
              </div>
              <div style={{ marginTop: 12, textAlign: "center", fontSize: 11, color: "#444", fontFamily: "'JetBrains Mono', monospace" }}>
                💡 Klicke auf eine News für Details: Signal, Zeitraum, Stärke und Backup-Check
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
