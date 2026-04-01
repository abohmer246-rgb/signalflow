import { useState, useEffect, useRef, useCallback } from "react";

// ─── MOCK DATA (replace with real API calls) ───────────────────────────
const MOCK_NEWS = [
  { id: 1, source: "Bloomberg", headline: "Fed Signals Pause on Rate Hikes — Markets Rally", ticker: "SPY", sentiment: "bullish", time: new Date(Date.now() - 120000), category: "macro", impact: "high", url: "#" },
  { id: 2, source: "Reuters", headline: "NVIDIA Beats Q1 Earnings Estimates by 22%", ticker: "NVDA", sentiment: "bullish", time: new Date(Date.now() - 300000), category: "earnings", impact: "high", url: "#" },
  { id: 3, source: "CNBC", headline: "Apple Announces $110B Stock Buyback Program", ticker: "AAPL", sentiment: "bullish", time: new Date(Date.now() - 480000), category: "corporate", impact: "high", url: "#" },
  { id: 4, source: "X/Twitter", headline: "@unusual_whales: Massive $TSLA call sweep — $2.4M in June $280 calls", ticker: "TSLA", sentiment: "bullish", time: new Date(Date.now() - 600000), category: "options", impact: "medium", url: "#" },
  { id: 5, source: "Benzinga", headline: "FDA Rejects Pfizer's New Drug Application for RSV Treatment", ticker: "PFE", sentiment: "bearish", time: new Date(Date.now() - 900000), category: "pharma", impact: "high", url: "#" },
  { id: 6, source: "WSJ", headline: "China Imposes New Tariffs on US Semiconductor Exports", ticker: "SOXX", sentiment: "bearish", time: new Date(Date.now() - 1200000), category: "macro", impact: "high", url: "#" },
  { id: 7, source: "X/Twitter", headline: "@elonmusk: Tesla FSD v13 rollout starting next week globally", ticker: "TSLA", sentiment: "bullish", time: new Date(Date.now() - 1500000), category: "corporate", impact: "medium", url: "#" },
  { id: 8, source: "Finnhub", headline: "AMD Secures $3.2B Contract with Microsoft for AI Chips", ticker: "AMD", sentiment: "bullish", time: new Date(Date.now() - 1800000), category: "corporate", impact: "high", url: "#" },
  { id: 9, source: "SEC Filing", headline: "Insider Sale: Meta CEO Sells 200K Shares Worth $120M", ticker: "META", sentiment: "bearish", time: new Date(Date.now() - 2400000), category: "insider", impact: "medium", url: "#" },
  { id: 10, source: "Reuters", headline: "Oil Prices Surge After OPEC+ Announces Extended Cuts", ticker: "XLE", sentiment: "bullish", time: new Date(Date.now() - 3000000), category: "macro", impact: "high", url: "#" },
  { id: 11, source: "X/Twitter", headline: "@DeItaone: *BREAKING: US CPI comes in at 2.1% YoY vs 2.3% expected", ticker: "SPY", sentiment: "bullish", time: new Date(Date.now() - 3600000), category: "macro", impact: "high", url: "#" },
  { id: 12, source: "Benzinga", headline: "GameStop Reports Surprise Profit — Stock Up 15% After Hours", ticker: "GME", sentiment: "bullish", time: new Date(Date.now() - 4200000), category: "earnings", impact: "medium", url: "#" },
  { id: 13, source: "Bloomberg", headline: "Google Faces $8B Antitrust Fine from EU Commission", ticker: "GOOGL", sentiment: "bearish", time: new Date(Date.now() - 5400000), category: "legal", impact: "high", url: "#" },
  { id: 14, source: "Finnhub", headline: "Boeing 737 MAX Deliveries Resume After Safety Review", ticker: "BA", sentiment: "bullish", time: new Date(Date.now() - 6000000), category: "corporate", impact: "medium", url: "#" },
  { id: 15, source: "X/Twitter", headline: "@zaborogami: Unusual dark pool activity in $AMZN — 5x avg volume", ticker: "AMZN", sentiment: "bullish", time: new Date(Date.now() - 7200000), category: "options", impact: "medium", url: "#" },
];

const WATCHLIST_DEFAULT = ["NVDA", "TSLA", "AAPL", "SPY", "AMD", "META", "AMZN", "GOOGL"];

const CATEGORIES = [
  { key: "all", label: "Alle", icon: "◉" },
  { key: "macro", label: "Makro", icon: "🌍" },
  { key: "earnings", label: "Earnings", icon: "📊" },
  { key: "corporate", label: "Corporate", icon: "🏢" },
  { key: "options", label: "Options Flow", icon: "📈" },
  { key: "pharma", label: "Pharma/FDA", icon: "💊" },
  { key: "insider", label: "Insider", icon: "👤" },
  { key: "legal", label: "Legal", icon: "⚖️" },
];

const SOURCES = [
  { key: "all", label: "Alle Quellen" },
  { key: "Bloomberg", label: "Bloomberg" },
  { key: "Reuters", label: "Reuters" },
  { key: "CNBC", label: "CNBC" },
  { key: "X/Twitter", label: "X / Twitter" },
  { key: "Benzinga", label: "Benzinga" },
  { key: "Finnhub", label: "Finnhub" },
  { key: "WSJ", label: "WSJ" },
  { key: "SEC Filing", label: "SEC Filings" },
];

function timeAgo(date) {
  const s = Math.floor((Date.now() - date) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function SentimentBadge({ sentiment }) {
  const colors = {
    bullish: { bg: "rgba(0,230,118,0.12)", border: "rgba(0,230,118,0.3)", text: "#00e676", label: "BULLISH ▲" },
    bearish: { bg: "rgba(255,82,82,0.12)", border: "rgba(255,82,82,0.3)", text: "#ff5252", label: "BEARISH ▼" },
    neutral: { bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.15)", text: "#aaa", label: "NEUTRAL ●" },
  };
  const c = colors[sentiment] || colors.neutral;
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "4px", background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontSize: "10px", fontWeight: 700, letterSpacing: "0.5px", fontFamily: "'JetBrains Mono', monospace" }}>
      {c.label}
    </span>
  );
}

function ImpactDot({ impact }) {
  const color = impact === "high" ? "#ff9100" : impact === "medium" ? "#ffd740" : "#666";
  return (
    <span title={`Impact: ${impact}`} style={{ display: "inline-flex", gap: "2px", alignItems: "center" }}>
      {[1, 2, 3].map(i => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i <= (impact === "high" ? 3 : impact === "medium" ? 2 : 1) ? color : "rgba(255,255,255,0.1)" }} />
      ))}
    </span>
  );
}

function NewsCard({ item, isNew }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "14px 18px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        background: isNew
          ? "linear-gradient(90deg, rgba(0,230,118,0.06) 0%, transparent 40%)"
          : hovered
          ? "rgba(255,255,255,0.02)"
          : "transparent",
        cursor: "pointer",
        transition: "all 0.2s ease",
        animation: isNew ? "slideIn 0.4s ease-out" : undefined,
        position: "relative",
      }}
    >
      {isNew && (
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#00e676", borderRadius: "0 2px 2px 0" }} />
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#7c8aff", fontWeight: 600, padding: "1px 6px", background: "rgba(124,138,255,0.1)", borderRadius: 3 }}>
              ${item.ticker}
            </span>
            <span style={{ fontSize: 10, color: "#666", fontFamily: "'JetBrains Mono', monospace" }}>{item.source}</span>
            <ImpactDot impact={item.impact} />
            <SentimentBadge sentiment={item.sentiment} />
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: hovered ? "#fff" : "rgba(255,255,255,0.85)", transition: "color 0.2s", fontWeight: 500 }}>
            {item.headline}
          </p>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: isNew ? "#00e676" : "#555", fontWeight: isNew ? 700 : 400 }}>
            {timeAgo(item.time)}
          </span>
        </div>
      </div>
    </div>
  );
}

function AlertBanner({ count }) {
  if (count === 0) return null;
  return (
    <div style={{
      background: "linear-gradient(90deg, rgba(0,230,118,0.15), rgba(0,230,118,0.05))",
      border: "1px solid rgba(0,230,118,0.2)",
      borderRadius: 8,
      padding: "10px 16px",
      marginBottom: 16,
      display: "flex",
      alignItems: "center",
      gap: 10,
      animation: "pulse 2s infinite",
    }}>
      <span style={{ fontSize: 18 }}>⚡</span>
      <span style={{ color: "#00e676", fontSize: 13, fontWeight: 600 }}>
        {count} neue High-Impact News in den letzten 10 Minuten
      </span>
      <span style={{ marginLeft: "auto", width: 8, height: 8, borderRadius: "50%", background: "#00e676", animation: "blink 1s infinite" }} />
    </div>
  );
}

function SetupGuide({ onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#0d0f14", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, maxWidth: 680, width: "100%", maxHeight: "85vh", overflow: "auto", padding: "32px 36px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 22, color: "#fff", fontFamily: "'Space Mono', monospace" }}>🔧 Setup Guide</h2>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 }}>✕ Schließen</button>
        </div>

        {[
          {
            step: "1",
            title: "Kostenlose API Keys holen",
            items: [
              { name: "Finnhub.io", desc: "Echtzeit-News + Sentiment → finnhub.io/register (60 API calls/min free)", color: "#7c8aff" },
              { name: "NewsAPI.org", desc: "1000+ Quellen, Breaking News → newsapi.org/register (100 req/Tag free)", color: "#ffd740" },
              { name: "Alpha Vantage", desc: "News + Sentiment-Analyse → alphavantage.co/support (25 req/Tag free)", color: "#00e676" },
              { name: "Twitter/X API", desc: "Echtzeit-Tweets von Tradern → developer.x.com ($100/mo Basic Plan)", color: "#1da1f2" },
            ]
          },
          {
            step: "2",
            title: "Empfohlene X/Twitter Accounts",
            items: [
              { name: "@unusual_whales", desc: "Options Flow & ungewöhnliche Aktivität", color: "#ff9100" },
              { name: "@DeItaone", desc: "Breaking News — extrem schnell (Sekunden!)", color: "#ff9100" },
              { name: "@zerohedge", desc: "Makro-News & Marktanalyse", color: "#ff9100" },
              { name: "@Fxhedgers", desc: "Forex + Makro Breaking News", color: "#ff9100" },
              { name: "@disclosetv", desc: "Geopolitische Breaking News", color: "#ff9100" },
            ]
          },
          {
            step: "3",
            title: "Deployment (kostenlos)",
            items: [
              { name: "Vercel.com", desc: "GitHub-Repo verbinden → Auto-Deploy (kostenlos)", color: "#00e676" },
              { name: "Netlify.com", desc: "Alternative zu Vercel, ebenfalls gratis", color: "#00e676" },
              { name: "Railway.app", desc: "Falls du ein Backend mit WebSockets brauchst", color: "#00e676" },
            ]
          }
        ].map(section => (
          <div key={section.step} style={{ marginBottom: 24 }}>
            <h3 style={{ color: "#7c8aff", fontSize: 14, fontFamily: "'JetBrains Mono', monospace", marginBottom: 12 }}>
              STEP {section.step} — {section.title}
            </h3>
            {section.items.map((item, i) => (
              <div key={i} style={{ padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 8, marginBottom: 6, borderLeft: `3px solid ${item.color}` }}>
                <span style={{ color: "#fff", fontWeight: 600, fontSize: 13 }}>{item.name}</span>
                <span style={{ color: "#888", fontSize: 12, marginLeft: 8 }}>{item.desc}</span>
              </div>
            ))}
          </div>
        ))}

        <div style={{ padding: 16, background: "rgba(124,138,255,0.08)", borderRadius: 10, border: "1px solid rgba(124,138,255,0.2)" }}>
          <p style={{ margin: 0, color: "#7c8aff", fontSize: 13, lineHeight: 1.7 }}>
            <strong>💡 Profi-Tipp:</strong> Starte nur mit <strong>Finnhub</strong> (gratis, Echtzeit-News) + <strong>@DeItaone</strong> auf X (schnellste Breaking News).
            Das reicht für den Anfang! Später kannst du weitere Quellen ergänzen.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function StockNewsFilter() {
  const [news, setNews] = useState(MOCK_NEWS);
  const [filter, setFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sentimentFilter, setSentimentFilter] = useState("all");
  const [searchTicker, setSearchTicker] = useState("");
  const [watchlist, setWatchlist] = useState(WATCHLIST_DEFAULT);
  const [watchlistInput, setWatchlistInput] = useState("");
  const [showGuide, setShowGuide] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [onlyHigh, setOnlyHigh] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const intervalRef = useRef(null);

  // Simulate new incoming news
  useEffect(() => {
    if (isPaused) return;
    intervalRef.current = setInterval(() => {
      setLastUpdate(new Date());
    }, 30000);
    return () => clearInterval(intervalRef.current);
  }, [isPaused]);

  const filtered = news.filter(item => {
    if (filter !== "all" && item.category !== filter) return false;
    if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
    if (sentimentFilter !== "all" && item.sentiment !== sentimentFilter) return false;
    if (onlyHigh && item.impact !== "high") return false;
    if (searchTicker && !item.ticker.toLowerCase().includes(searchTicker.toLowerCase()) && !item.headline.toLowerCase().includes(searchTicker.toLowerCase())) return false;
    return true;
  });

  const watchlistNews = news.filter(n => watchlist.includes(n.ticker));
  const recentHighImpact = news.filter(n => n.impact === "high" && Date.now() - n.time < 600000).length;

  const addToWatchlist = () => {
    const t = watchlistInput.toUpperCase().trim();
    if (t && !watchlist.includes(t)) {
      setWatchlist([...watchlist, t]);
    }
    setWatchlistInput("");
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080a0f",
      color: "#e0e0e0",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap');
        
        @keyframes slideIn { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.85; } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
        @keyframes scan { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        
        .filter-btn { 
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); color: #888; 
          padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: all 0.2s;
          font-family: 'JetBrains Mono', monospace; white-space: nowrap;
        }
        .filter-btn:hover { background: rgba(255,255,255,0.08); color: #ccc; }
        .filter-btn.active { background: rgba(124,138,255,0.15); border-color: rgba(124,138,255,0.3); color: #7c8aff; }
        
        .ticker-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;
          font-family: 'JetBrains Mono', monospace; cursor: pointer; transition: all 0.2s;
          background: rgba(124,138,255,0.08); border: 1px solid rgba(124,138,255,0.15); color: #7c8aff;
        }
        .ticker-chip:hover { background: rgba(255,82,82,0.15); border-color: rgba(255,82,82,0.3); color: #ff5252; }
        
        .icon-btn {
          background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
          color: #888; padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 13px;
          transition: all 0.2s; display: flex; align-items: center; gap: 6px;
        }
        .icon-btn:hover { background: rgba(255,255,255,0.08); color: #fff; }
      `}</style>

      {showGuide && <SetupGuide onClose={() => setShowGuide(false)} />}

      {/* ─── HEADER ─── */}
      <header style={{
        padding: "16px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "linear-gradient(180deg, rgba(124,138,255,0.04) 0%, transparent 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #7c8aff, #5c6bc0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚡</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 18, fontFamily: "'Space Mono', monospace", color: "#fff", letterSpacing: "-0.5px" }}>
                SIGNAL<span style={{ color: "#7c8aff" }}>FLOW</span>
              </h1>
              <span style={{ fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace" }}>
                LIVE NEWS FILTER • {filtered.length} ITEMS
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ position: "relative", overflow: "hidden", padding: "6px 14px", borderRadius: 6, background: "rgba(0,230,118,0.08)", border: "1px solid rgba(0,230,118,0.2)" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "linear-gradient(90deg, transparent, rgba(0,230,118,0.1), transparent)", animation: "scan 3s linear infinite" }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#00e676", position: "relative" }}>
                ● SCANNING
              </span>
            </div>
            <button className="icon-btn" onClick={() => setIsPaused(!isPaused)}>
              {isPaused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button className="icon-btn" onClick={() => setSoundOn(!soundOn)}>
              {soundOn ? "🔊" : "🔇"}
            </button>
            <button className="icon-btn" onClick={() => setShowGuide(true)} style={{ background: "rgba(124,138,255,0.1)", borderColor: "rgba(124,138,255,0.25)", color: "#7c8aff" }}>
              🔧 Setup Guide
            </button>
          </div>
        </div>
      </header>

      <div style={{ display: "flex", minHeight: "calc(100vh - 73px)" }}>
        {/* ─── SIDEBAR ─── */}
        <aside style={{
          width: 260,
          borderRight: "1px solid rgba(255,255,255,0.06)",
          padding: "16px",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          overflowY: "auto",
        }}>
          {/* Search */}
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 6, letterSpacing: "1px" }}>SUCHE</label>
            <input
              type="text"
              placeholder="Ticker oder Keyword..."
              value={searchTicker}
              onChange={e => setSearchTicker(e.target.value)}
              style={{
                width: "100%", padding: "9px 12px", background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff",
                fontSize: 13, outline: "none", fontFamily: "'JetBrains Mono', monospace",
              }}
            />
          </div>

          {/* Categories */}
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, letterSpacing: "1px" }}>KATEGORIE</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {CATEGORIES.map(c => (
                <button key={c.key} className={`filter-btn ${filter === c.key ? "active" : ""}`}
                  onClick={() => setFilter(c.key)} style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{c.icon}</span> {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Source Filter */}
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, letterSpacing: "1px" }}>QUELLE</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {SOURCES.map(s => (
                <button key={s.key} className={`filter-btn ${sourceFilter === s.key ? "active" : ""}`}
                  onClick={() => setSourceFilter(s.key)} style={{ textAlign: "left" }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sentiment */}
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, letterSpacing: "1px" }}>SENTIMENT</label>
            <div style={{ display: "flex", gap: 4 }}>
              {[["all", "Alle"], ["bullish", "▲ Bull"], ["bearish", "▼ Bear"]].map(([k, l]) => (
                <button key={k} className={`filter-btn ${sentimentFilter === k ? "active" : ""}`}
                  onClick={() => setSentimentFilter(k)} style={{ flex: 1, textAlign: "center" }}>{l}</button>
              ))}
            </div>
          </div>

          {/* High Impact Toggle */}
          <div>
            <button className={`filter-btn ${onlyHigh ? "active" : ""}`}
              onClick={() => setOnlyHigh(!onlyHigh)}
              style={{ width: "100%", textAlign: "center", padding: "8px", background: onlyHigh ? "rgba(255,145,0,0.12)" : undefined, borderColor: onlyHigh ? "rgba(255,145,0,0.3)" : undefined, color: onlyHigh ? "#ff9100" : undefined }}>
              🔥 Nur High-Impact
            </button>
          </div>

          {/* Watchlist */}
          <div>
            <label style={{ display: "block", fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, letterSpacing: "1px" }}>WATCHLIST</label>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              <input
                type="text"
                placeholder="+ Ticker"
                value={watchlistInput}
                onChange={e => setWatchlistInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addToWatchlist()}
                style={{
                  flex: 1, padding: "7px 10px", background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff",
                  fontSize: 12, outline: "none", fontFamily: "'JetBrains Mono', monospace",
                }}
              />
              <button onClick={addToWatchlist} style={{ background: "rgba(124,138,255,0.15)", border: "1px solid rgba(124,138,255,0.3)", color: "#7c8aff", borderRadius: 6, padding: "0 12px", cursor: "pointer", fontSize: 14 }}>+</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {watchlist.map(t => (
                <span key={t} className="ticker-chip" onClick={() => setWatchlist(watchlist.filter(x => x !== t))}>
                  ${t} <span style={{ opacity: 0.5 }}>×</span>
                </span>
              ))}
            </div>
          </div>
        </aside>

        {/* ─── MAIN FEED ─── */}
        <main style={{ flex: 1, padding: "16px 20px", overflowY: "auto" }}>
          <AlertBanner count={recentHighImpact} />

          {/* Stats bar */}
          <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { label: "TOTAL", value: filtered.length, color: "#7c8aff" },
              { label: "BULLISH", value: filtered.filter(n => n.sentiment === "bullish").length, color: "#00e676" },
              { label: "BEARISH", value: filtered.filter(n => n.sentiment === "bearish").length, color: "#ff5252" },
              { label: "HIGH IMPACT", value: filtered.filter(n => n.impact === "high").length, color: "#ff9100" },
            ].map(stat => (
              <div key={stat.label} style={{ padding: "10px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)", minWidth: 100 }}>
                <div style={{ fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>{stat.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: stat.color, fontFamily: "'Space Mono', monospace" }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Watchlist quick bar */}
          {watchlistNews.length > 0 && (
            <div style={{ marginBottom: 16, padding: "12px 16px", background: "rgba(124,138,255,0.04)", borderRadius: 10, border: "1px solid rgba(124,138,255,0.1)" }}>
              <div style={{ fontSize: 10, color: "#7c8aff", fontFamily: "'JetBrains Mono', monospace", marginBottom: 8, letterSpacing: "1px" }}>
                ★ WATCHLIST ALERTS ({watchlistNews.length})
              </div>
              {watchlistNews.slice(0, 3).map(item => (
                <div key={item.id} style={{ fontSize: 12, color: "#bbb", padding: "4px 0", display: "flex", gap: 8, alignItems: "center" }}>
                  <span style={{ color: "#7c8aff", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>${item.ticker}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.headline}</span>
                  <span style={{ color: "#555", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>{timeAgo(item.time)}</span>
                </div>
              ))}
            </div>
          )}

          {/* News feed */}
          <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.01)" }}>
            <div style={{ padding: "10px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "#555", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "1px" }}>LIVE FEED</span>
              <span style={{ fontSize: 10, color: "#444", fontFamily: "'JetBrains Mono', monospace" }}>
                Updated {timeAgo(lastUpdate)} ago
              </span>
            </div>
            {filtered.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#444" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>Keine News mit diesen Filtern gefunden</p>
              </div>
            ) : (
              filtered.map((item, i) => (
                <NewsCard key={item.id} item={item} isNew={Date.now() - item.time < 600000} />
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
