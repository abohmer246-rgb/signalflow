import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════
// CONFIG — API Keys werden aus Vercel Environment Variables geladen
// ═══════════════════════════════════════════════════════════════════════
const FINNHUB_KEY = import.meta.env.VITE_FINNHUB_KEY || "";
const NEWSFILTER_KEY = import.meta.env.VITE_NEWSFILTER_KEY || "";
const FINNHUB_BASE = "https://finnhub.io/api/v1";
const NEWSFILTER_BASE = "https://api.newsfilter.io/public/actions";

const REFRESH_NEWS = 60000;   // News alle 60s
const REFRESH_QUOTES = 20000; // Kurse alle 20s

const WATCHLIST_DEFAULT = ["NVDA", "TSLA", "AAPL", "MSFT", "AMD", "META", "AMZN", "GOOGL"];

// ═══════════════════════════════════════════════════════════════════════
// TWITTER ACCOUNTS — Kuratierte Liste der schnellsten Trading-Accounts
// ═══════════════════════════════════════════════════════════════════════
const TWITTER_ACCOUNTS = [
  { handle: "DeItaone", name: "Walter Bloomberg", desc: "Schnellste Breaking News (Sekunden!)", category: "breaking" },
  { handle: "unusual_whales", name: "Unusual Whales", desc: "Options Flow & Smart Money", category: "options" },
  { handle: "zerohedge", name: "Zerohedge", desc: "Makro-News & Marktanalyse", category: "macro" },
  { handle: "Fxhedgers", name: "Fxhedgers", desc: "Forex + Makro Breaking News", category: "macro" },
  { handle: "disclosetv", name: "Disclose.tv", desc: "Geopolitische Breaking News", category: "breaking" },
  { handle: "FirstSquawk", name: "First Squawk", desc: "Echtzeit-Markt-Headlines", category: "breaking" },
  { handle: "LiveSquawk", name: "LiveSquawk", desc: "Institutionelle News-Alerts", category: "breaking" },
  { handle: "StockMKTNewz", name: "Stock Market News", desc: "US-Aktienmarkt Updates", category: "stocks" },
];

// ═══════════════════════════════════════════════════════════════════════
// SENTIMENT ANALYSE — Keyword-basiert mit Gewichtung
// ═══════════════════════════════════════════════════════════════════════
const BULL_WORDS = [
  "beats", "surpass", "record high", "upgrade", "buy", "outperform",
  "raise", "growth", "surge", "rally", "soar", "boom", "breakout",
  "bullish", "strong", "exceed", "profit", "positive", "innovative",
  "expansion", "partnership", "approved", "launches", "wins", "acquires",
  "deal", "contract", "revenue up", "earnings beat", "all-time high",
  "momentum", "recovery", "rebound", "dividend", "buyback", "upside",
  "beat expectations", "guidance raised", "price target raised",
  "stock split", "new high", "accelerat", "optimis"
];
const BEAR_WORDS = [
  "miss", "downgrade", "sell", "underperform", "cut", "decline",
  "crash", "plunge", "drop", "fall", "bearish", "weak", "loss",
  "negative", "layoff", "lawsuit", "fine", "recall", "bankruptcy",
  "default", "debt", "warning", "risk", "concern", "fraud",
  "investigation", "subpoena", "SEC", "penalty", "closure", "shutdown",
  "slowdown", "recession", "inflation", "tariff", "ban", "reject",
  "delay", "fail", "downturn", "guidance cut", "price target cut",
  "missed expectations", "disappointing", "worse than", "pessimis"
];

function analyzeSentiment(text) {
  if (!text || typeof text !== "string") {
    return { sentiment: "neutral", confidence: 0, score: 50 };
  }
  const lower = text.toLowerCase();
  let bull = 0;
  let bear = 0;
  BULL_WORDS.forEach(w => { if (lower.includes(w)) bull++; });
  BEAR_WORDS.forEach(w => { if (lower.includes(w)) bear++; });
  const total = bull + bear;
  if (total === 0) return { sentiment: "neutral", confidence: 0, score: 50 };
  const score = Math.round((bull / total) * 100);
  const confidence = Math.min(total * 18, 100);
  if (score >= 60) return { sentiment: "bullish", confidence, score };
  if (score <= 40) return { sentiment: "bearish", confidence, score };
  return { sentiment: "neutral", confidence: Math.max(confidence - 20, 0), score: 50 };
}

function getSignal(sentiment, confidence, priceChange) {
  if (sentiment === "bullish" && confidence >= 35) {
    if (priceChange > 0.3) return { signal: "LONG", strength: "STARK", timeframe: "Intraday / Swing (1–5 Tage)", backup: "✅ Kurs bestätigt Sentiment" };
    if (priceChange > -0.3) return { signal: "LONG", strength: "MITTEL", timeframe: "Swing (2–7 Tage)", backup: "⚠️ Kurs neutral — Bestätigung abwarten" };
    return { signal: "LONG", strength: "SCHWACH", timeframe: "Swing (3–10 Tage)", backup: "⚠️ Kurs geht dagegen — vorsichtig" };
  }
  if (sentiment === "bearish" && confidence >= 35) {
    if (priceChange < -0.3) return { signal: "SHORT", strength: "STARK", timeframe: "Intraday / Swing (1–5 Tage)", backup: "✅ Kurs bestätigt Sentiment" };
    if (priceChange < 0.3) return { signal: "SHORT", strength: "MITTEL", timeframe: "Swing (2–7 Tage)", backup: "⚠️ Kurs neutral — Bestätigung abwarten" };
    return { signal: "SHORT", strength: "SCHWACH", timeframe: "Swing (3–10 Tage)", backup: "⚠️ Kurs geht dagegen — vorsichtig" };
  }
  return { signal: "ABWARTEN", strength: "—", timeframe: "—", backup: "⛔ Kein klares Signal — nicht traden" };
}

function timeAgo(ts) {
  if (!ts || isNaN(ts)) return "—";
  const seconds = Math.floor(Date.now() / 1000 - ts);
  if (seconds < 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// ═══════════════════════════════════════════════════════════════════════
// KLEINE KOMPONENTEN
// ═══════════════════════════════════════════════════════════════════════

function SignalBadge({ signal }) {
  const map = {
    LONG: { bg: "rgba(0,230,118,0.12)", bd: "rgba(0,230,118,0.35)", c: "#00e676", t: "▲ LONG" },
    SHORT: { bg: "rgba(255,82,82,0.12)", bd: "rgba(255,82,82,0.35)", c: "#ff5252", t: "▼ SHORT" },
    ABWARTEN: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.12)", c: "#888", t: "● WAIT" },
  };
  const s = map[signal] || map.ABWARTEN;
  return (
    <span style={{ padding: "3px 10px", borderRadius: 4, background: s.bg, border: `1px solid ${s.bd}`, color: s.c, fontSize: 11, fontWeight: 800, fontFamily: "monospace", letterSpacing: 0.5 }}>
      {s.t}
    </span>
  );
}

function ConfidenceBar({ confidence, sentiment }) {
  const color = sentiment === "bullish" ? "#00e676" : sentiment === "bearish" ? "#ff5252" : "#555";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 50, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ width: `${confidence}%`, height: "100%", borderRadius: 2, background: color, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 10, color: "#666", fontFamily: "monospace" }}>{confidence}%</span>
    </div>
  );
}

function SourceBadge({ source }) {
  const colorMap = {
    finnhub: "#ff9100",
    newsfilter: "#7c8aff",
    twitter: "#1da1f2",
  };
  const color = colorMap[source] || "#666";
  const label = source === "finnhub" ? "FINNHUB" : source === "newsfilter" ? "NEWSFILTER" : source === "twitter" ? "X/TWITTER" : source.toUpperCase();
  return (
    <span style={{ fontSize: 9, color, fontFamily: "monospace", fontWeight: 700, padding: "1px 5px", background: `${color}15`, borderRadius: 3, border: `1px solid ${color}30` }}>
      {label}
    </span>
  );
}

function QuoteCard({ symbol, quote, onClick }) {
  if (!quote || typeof quote.c !== "number") {
    return (
      <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", minWidth: 120, flexShrink: 0 }}>
        <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#7c8aff" }}>${symbol}</span>
        <div style={{ fontSize: 10, color: "#444", marginTop: 4, fontFamily: "monospace" }}>Laden...</div>
      </div>
    );
  }
  const change = typeof quote.dp === "number" ? quote.dp : 0;
  const isUp = change >= 0;
  return (
    <div onClick={() => onClick(symbol)} style={{ padding: "10px 14px", borderRadius: 8, cursor: "pointer", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", transition: "all 0.2s", minWidth: 120, flexShrink: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
        <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#7c8aff" }}>${symbol}</span>
        <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 600, color: isUp ? "#00e676" : "#ff5252" }}>
          {isUp ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%
        </span>
      </div>
      <div style={{ fontFamily: "monospace", fontSize: 15, fontWeight: 700, color: "#fff" }}>${quote.c.toFixed(2)}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        <span style={{ fontSize: 9, color: "#555", fontFamily: "monospace" }}>H:{typeof quote.h === "number" ? quote.h.toFixed(2) : "—"}</span>
        <span style={{ fontSize: 9, color: "#555", fontFamily: "monospace" }}>L:{typeof quote.l === "number" ? quote.l.toFixed(2) : "—"}</span>
      </div>
    </div>
  );
}

function NewsCard({ item, quotes }) {
  const [open, setOpen] = useState(false);
  const ticker = (item.ticker || "").split(",")[0].trim();
  const quote = ticker ? quotes[ticker] : null;
  const priceChange = (quote && typeof quote.dp === "number") ? quote.dp : 0;
  const { sentiment, confidence, score } = analyzeSentiment(item.headline + " " + (item.summary || ""));
  const sig = getSignal(sentiment, confidence, priceChange);
  const isNew = (Date.now() / 1000) - item.datetime < 600;

  return (
    <div onClick={() => setOpen(!open)} style={{
      padding: "13px 18px", cursor: "pointer",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      background: isNew ? "linear-gradient(90deg, rgba(0,230,118,0.05) 0%, transparent 25%)" : "transparent",
      transition: "background 0.2s", position: "relative",
    }}>
      {isNew && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#00e676", borderRadius: "0 2px 2px 0" }} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
            {ticker && (
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#7c8aff", fontWeight: 700, padding: "1px 6px", background: "rgba(124,138,255,0.1)", borderRadius: 3 }}>${ticker}</span>
            )}
            <SignalBadge signal={sig.signal} />
            <ConfidenceBar confidence={confidence} sentiment={sentiment} />
            <SourceBadge source={item.apiSource || "finnhub"} />
            <span style={{ fontSize: 10, color: "#555", fontFamily: "monospace" }}>{item.source || ""}</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "rgba(255,255,255,0.88)", fontWeight: 500 }}>{item.headline}</p>

          {open && (
            <div style={{ marginTop: 10, padding: 12, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              {/* Signal Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", marginBottom: 2 }}>SIGNAL</div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: sig.signal === "LONG" ? "#00e676" : sig.signal === "SHORT" ? "#ff5252" : "#888" }}>{sig.signal}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", marginBottom: 2 }}>STÄRKE</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace", color: "#fff" }}>{sig.strength}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", marginBottom: 2 }}>ZEITRAUM</div>
                  <div style={{ fontSize: 12, color: "#ccc" }}>{sig.timeframe}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", marginBottom: 2 }}>KURS</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace", color: priceChange >= 0 ? "#00e676" : "#ff5252" }}>
                    {priceChange >= 0 ? "+" : ""}{priceChange.toFixed(2)}%
                  </div>
                </div>
              </div>

              {/* Backup Check */}
              <div style={{
                padding: "8px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, marginBottom: 10,
                background: sig.backup.startsWith("✅") ? "rgba(0,230,118,0.08)" : sig.backup.startsWith("⚠️") ? "rgba(255,193,7,0.08)" : "rgba(255,82,82,0.08)",
                border: `1px solid ${sig.backup.startsWith("✅") ? "rgba(0,230,118,0.2)" : sig.backup.startsWith("⚠️") ? "rgba(255,193,7,0.2)" : "rgba(255,82,82,0.2)"}`,
                color: sig.backup.startsWith("✅") ? "#00e676" : sig.backup.startsWith("⚠️") ? "#ffc107" : "#ff5252",
              }}>
                BACKUP-CHECK: {sig.backup}
              </div>

              {/* Sentiment Bar */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: "#555", fontFamily: "monospace", flexShrink: 0 }}>SENTIMENT</span>
                <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{ width: `${score}%`, height: "100%", borderRadius: 3, background: score >= 60 ? "#00e676" : score <= 40 ? "#ff5252" : "#888", transition: "width 0.4s" }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: score >= 60 ? "#00e676" : score <= 40 ? "#ff5252" : "#888" }}>{score}/100</span>
              </div>

              {/* Summary */}
              {item.summary && (
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#888", lineHeight: 1.6 }}>{item.summary.slice(0, 280)}{item.summary.length > 280 ? "..." : ""}</p>
              )}

              {/* Link */}
              {item.url && item.url !== "#" && (
                <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                  style={{ display: "inline-block", marginTop: 8, fontSize: 11, color: "#7c8aff", textDecoration: "none", fontFamily: "monospace" }}>
                  Artikel lesen →
                </a>
              )}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: isNew ? "#00e676" : "#555", fontWeight: isNew ? 700 : 400 }}>{timeAgo(item.datetime)}</span>
        </div>
      </div>
    </div>
  );
}

function TwitterPanel() {
  const [expanded, setExpanded] = useState(true);
  return (
    <div style={{ padding: 12, background: "rgba(29,161,242,0.04)", borderRadius: 8, border: "1px solid rgba(29,161,242,0.12)" }}>
      <div onClick={() => setExpanded(!expanded)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: expanded ? 8 : 0 }}>
        <span style={{ fontSize: 10, color: "#1da1f2", fontFamily: "monospace", letterSpacing: 1, fontWeight: 700 }}>𝕏 TWITTER FEEDS</span>
        <span style={{ fontSize: 10, color: "#555" }}>{expanded ? "▼" : "▶"}</span>
      </div>
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {TWITTER_ACCOUNTS.map(acc => (
            <a key={acc.handle} href={`https://x.com/${acc.handle}`} target="_blank" rel="noopener noreferrer"
              style={{
                display: "block", padding: "6px 8px", borderRadius: 6, textDecoration: "none",
                background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
                transition: "all 0.2s",
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#1da1f2", fontWeight: 600, fontFamily: "monospace" }}>@{acc.handle}</span>
                <span style={{ fontSize: 8, color: "#555", fontFamily: "monospace", padding: "1px 4px", background: "rgba(255,255,255,0.04)", borderRadius: 3 }}>
                  {acc.category.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>{acc.desc}</div>
            </a>
          ))}
          <div style={{ fontSize: 9, color: "#444", marginTop: 4, lineHeight: 1.5, fontFamily: "monospace" }}>
            💡 Öffne diese Accounts in X/Twitter für die schnellsten Breaking News. @DeItaone ist oft Minuten vor allen anderen!
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════

export default function App() {
  const [news, setNews] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [watchlist, setWatchlist] = useState(WATCHLIST_DEFAULT);
  const [watchInput, setWatchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sentFilter, setSentFilter] = useState("all");
  const [sigFilter, setSigFilter] = useState("all");
  const [highOnly, setHighOnly] = useState(false);
  const [apiStatus, setApiStatus] = useState({ finnhub: false, newsfilter: false });
  const [lastFetch, setLastFetch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [soundOn, setSoundOn] = useState(true);
  const [tab, setTab] = useState("feed"); // "feed" | "twitter"

  // Refs um stale closures in intervals zu vermeiden
  const quotesRef = useRef(quotes);
  const watchlistRef = useRef(watchlist);
  const newsCountRef = useRef(0);
  const soundRef = useRef(soundOn);

  // Refs synchron halten
  useEffect(() => { quotesRef.current = quotes; }, [quotes]);
  useEffect(() => { watchlistRef.current = watchlist; }, [watchlist]);
  useEffect(() => { soundRef.current = soundOn; }, [soundOn]);

  // ─── FETCH FINNHUB NEWS ──────────────────────────────────────────
  const fetchFinnhubNews = useCallback(async () => {
    if (!FINNHUB_KEY) return [];
    const results = [];
    const errs = [];

    try {
      const res = await fetch(`${FINNHUB_BASE}/news?category=general&token=${FINNHUB_KEY}`);
      if (!res.ok) throw new Error(`Finnhub ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        data.slice(0, 30).forEach(item => {
          results.push({
            id: `fh-${item.id || item.datetime}`,
            headline: item.headline || "",
            summary: item.summary || "",
            source: item.source || "Finnhub",
            apiSource: "finnhub",
            url: item.url || "",
            datetime: item.datetime || 0,
            ticker: item.related || "",
          });
        });
      }
    } catch (e) {
      errs.push(`Finnhub News: ${e.message}`);
    }

    // Company News für Watchlist (max 3 um Rate Limit zu schonen)
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const wl = watchlistRef.current;

    for (let i = 0; i < Math.min(wl.length, 3); i++) {
      try {
        const res = await fetch(`${FINNHUB_BASE}/company-news?symbol=${wl[i]}&from=${weekAgo}&to=${today}&token=${FINNHUB_KEY}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            data.slice(0, 5).forEach(item => {
              results.push({
                id: `fh-c-${item.id || item.datetime}-${wl[i]}`,
                headline: item.headline || "",
                summary: item.summary || "",
                source: item.source || "Finnhub",
                apiSource: "finnhub",
                url: item.url || "",
                datetime: item.datetime || 0,
                ticker: wl[i],
              });
            });
          }
        }
      } catch (e) { /* skip einzelne Fehler */ }
    }
    return { results, errs, connected: results.length > 0 };
  }, []); // Keine deps — verwendet Refs

  // ─── FETCH NEWSFILTER.IO NEWS ────────────────────────────────────
  const fetchNewsfilterNews = useCallback(async () => {
    if (!NEWSFILTER_KEY) return { results: [], errs: [], connected: false };
    const results = [];
    const errs = [];

    try {
      const res = await fetch(NEWSFILTER_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${NEWSFILTER_KEY}`,
        },
        body: JSON.stringify({
          type: "filterArticles",
          queryString: "*",
          from: 0,
          size: 25,
        }),
      });

      if (!res.ok) throw new Error(`Newsfilter ${res.status}`);
      const data = await res.json();
      const articles = data.articles || data || [];

      if (Array.isArray(articles)) {
        articles.forEach(item => {
          const pubDate = item.publishedAt ? new Date(item.publishedAt).getTime() / 1000 : 0;
          const symbols = Array.isArray(item.symbols) ? item.symbols.join(",") : (item.symbols || "");
          results.push({
            id: `nf-${item.id || pubDate}`,
            headline: item.title || item.headline || "",
            summary: item.description || item.summary || "",
            source: (item.source && item.source.name) ? item.source.name : "Newsfilter",
            apiSource: "newsfilter",
            url: item.url || "",
            datetime: pubDate,
            ticker: symbols,
          });
        });
      }
    } catch (e) {
      errs.push(`Newsfilter: ${e.message}`);
    }
    return { results, errs, connected: results.length > 0 };
  }, []);

  // ─── COMBINED FETCH ──────────────────────────────────────────────
  const fetchAllNews = useCallback(async () => {
    const [fh, nf] = await Promise.all([
      fetchFinnhubNews(),
      fetchNewsfilterNews(),
    ]);

    const allNews = [...fh.results, ...nf.results];
    const allErrs = [...fh.errs, ...nf.errs];

    // Deduplizieren nach Headline
    const seen = new Set();
    const unique = allNews.filter(item => {
      if (!item.headline) return false;
      const key = item.headline.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Nach Zeit sortieren (neueste zuerst)
    unique.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));

    // Sound bei neuen News
    if (newsCountRef.current > 0 && unique.length > newsCountRef.current && soundRef.current) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = "sine";
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      } catch (e) { /* Audio nicht verfügbar */ }
    }
    newsCountRef.current = unique.length;

    setNews(unique.slice(0, 80));
    setApiStatus({ finnhub: fh.connected, newsfilter: nf.connected });
    setErrors(allErrs);
    setLastFetch(Date.now());
    setLoading(false);
  }, [fetchFinnhubNews, fetchNewsfilterNews]);

  // ─── FETCH QUOTES (kein stale closure dank Ref) ─────────────────
  const fetchQuotes = useCallback(async () => {
    if (!FINNHUB_KEY) return;
    const wl = watchlistRef.current;
    const prev = quotesRef.current;
    const updated = { ...prev };
    for (const sym of wl) {
      try {
        const res = await fetch(`${FINNHUB_BASE}/quote?symbol=${sym}&token=${FINNHUB_KEY}`);
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.c === "number" && data.c > 0) {
            updated[sym] = data;
          }
        }
      } catch (e) { /* skip */ }
    }
    setQuotes(updated);
  }, []); // Keine deps — verwendet Refs

  // ─── INTERVALS ───────────────────────────────────────────────────
  useEffect(() => {
    fetchAllNews();
    fetchQuotes();
    const t1 = setInterval(fetchAllNews, REFRESH_NEWS);
    const t2 = setInterval(fetchQuotes, REFRESH_QUOTES);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
    };
  }, [fetchAllNews, fetchQuotes]);

  // ─── FILTER LOGIC ────────────────────────────────────────────────
  const filtered = news.filter(item => {
    const text = (item.headline || "") + " " + (item.summary || "");
    const { sentiment, confidence } = analyzeSentiment(text);
    const ticker = (item.ticker || "").split(",")[0].trim();
    const priceChange = (quotes[ticker] && typeof quotes[ticker].dp === "number") ? quotes[ticker].dp : 0;
    const sig = getSignal(sentiment, confidence, priceChange);

    if (sentFilter !== "all" && sentiment !== sentFilter) return false;
    if (sigFilter !== "all" && sig.signal !== sigFilter) return false;
    if (highOnly && confidence < 50) return false;
    if (search) {
      const q = search.toLowerCase();
      const haystack = (item.headline + " " + (item.ticker || "") + " " + (item.source || "")).toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  // ─── SIGNAL COUNTS ──────────────────────────────────────────────
  const counts = { LONG: 0, SHORT: 0, ABWARTEN: 0 };
  news.slice(0, 25).forEach(item => {
    const { sentiment, confidence } = analyzeSentiment((item.headline || "") + " " + (item.summary || ""));
    const ticker = (item.ticker || "").split(",")[0].trim();
    const pc = (quotes[ticker] && typeof quotes[ticker].dp === "number") ? quotes[ticker].dp : 0;
    counts[getSignal(sentiment, confidence, pc).signal]++;
  });

  const addWatch = () => {
    const t = watchInput.toUpperCase().trim();
    if (t && !watchlist.includes(t)) setWatchlist(prev => [...prev, t]);
    setWatchInput("");
  };

  const anyConnected = apiStatus.finnhub || apiStatus.newsfilter;

  // ─── RENDER ──────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#080a0f", color: "#e0e0e0", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes scan{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}
        .sb{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#888;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;transition:all .15s;font-family:'JetBrains Mono',monospace;white-space:nowrap}
        .sb:hover{background:rgba(255,255,255,0.08);color:#ccc}
        .sb.on{background:rgba(124,138,255,0.15);border-color:rgba(124,138,255,0.3);color:#7c8aff}
        .wc{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;font-family:'JetBrains Mono',monospace;cursor:pointer;transition:all .15s;background:rgba(124,138,255,0.08);border:1px solid rgba(124,138,255,0.15);color:#7c8aff}
        .wc:hover{background:rgba(255,82,82,0.15);border-color:rgba(255,82,82,0.3);color:#ff5252}
      `}</style>

      {/* ═══ HEADER ═══ */}
      <header style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, rgba(124,138,255,0.03) 0%, transparent 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg, #7c8aff, #5c6bc0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 17, fontFamily: "'JetBrains Mono', monospace", color: "#fff" }}>
                SIGNAL<span style={{ color: "#7c8aff" }}>FLOW</span>{" "}
                <span style={{ fontSize: 10, color: "#00e676", fontWeight: 400 }}>v3.0</span>
              </h1>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* API Status Badges */}
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { name: "Finnhub", on: apiStatus.finnhub, color: "#ff9100" },
                { name: "Newsfilter", on: apiStatus.newsfilter, color: "#7c8aff" },
              ].map(api => (
                <div key={api.name} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 4, background: api.on ? `${api.color}10` : "rgba(255,82,82,0.08)", border: `1px solid ${api.on ? api.color + "30" : "rgba(255,82,82,0.2)"}` }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: api.on ? api.color : "#ff5252", animation: api.on ? "blink 2s infinite" : "none" }} />
                  <span style={{ fontSize: 10, color: api.on ? api.color : "#ff5252", fontFamily: "monospace" }}>{api.name}</span>
                </div>
              ))}
            </div>

            <span style={{ fontSize: 10, color: "#444", fontFamily: "monospace" }}>
              {news.length} News{lastFetch ? ` • ${new Date(lastFetch).toLocaleTimeString("de-DE")}` : ""}
            </span>

            <button className="sb" onClick={() => setSoundOn(!soundOn)}>{soundOn ? "🔊" : "🔇"}</button>
            <button className="sb" onClick={() => { setLoading(true); fetchAllNews(); fetchQuotes(); }} style={{ color: "#7c8aff" }}>🔄</button>
          </div>
        </div>
      </header>

      {/* ═══ ERRORS ═══ */}
      {errors.length > 0 && !anyConnected && (
        <div style={{ margin: "10px 20px", padding: "10px 14px", background: "rgba(255,82,82,0.08)", border: "1px solid rgba(255,82,82,0.2)", borderRadius: 8 }}>
          {errors.map((e, i) => <div key={i} style={{ color: "#ff5252", fontSize: 12, fontFamily: "monospace" }}>⚠️ {e}</div>)}
          <div style={{ color: "#888", fontSize: 11, marginTop: 6 }}>Trage API Keys in Vercel → Settings → Environment Variables ein.</div>
        </div>
      )}

      {/* ═══ QUOTES BAR ═══ */}
      <div style={{ padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)", overflowX: "auto" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {watchlist.map(sym => <QuoteCard key={sym} symbol={sym} quote={quotes[sym]} onClick={s => setSearch(s)} />)}
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 150px)" }}>
        {/* ═══ SIDEBAR ═══ */}
        <aside style={{ width: 250, borderRight: "1px solid rgba(255,255,255,0.06)", padding: 14, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>

          {/* Search */}
          <div>
            <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", marginBottom: 5, letterSpacing: 1 }}>SUCHE</div>
            <input type="text" placeholder="Ticker / Keyword..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "#fff", fontSize: 12, outline: "none", fontFamily: "'JetBrains Mono', monospace" }} />
          </div>

          {/* Signal Filter */}
          <div>
            <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", marginBottom: 6, letterSpacing: 1 }}>SIGNAL</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {[["all", "◉ Alle"], ["LONG", "▲ LONG"], ["SHORT", "▼ SHORT"], ["ABWARTEN", "● WAIT"]].map(([k, l]) => (
                <button key={k} className={`sb ${sigFilter === k ? "on" : ""}`} onClick={() => setSigFilter(k)} style={{ textAlign: "left" }}>{l}</button>
              ))}
            </div>
          </div>

          {/* Sentiment Filter */}
          <div>
            <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", marginBottom: 6, letterSpacing: 1 }}>SENTIMENT</div>
            <div style={{ display: "flex", gap: 3 }}>
              {[["all", "Alle"], ["bullish", "▲ Bull"], ["bearish", "▼ Bear"]].map(([k, l]) => (
                <button key={k} className={`sb ${sentFilter === k ? "on" : ""}`} onClick={() => setSentFilter(k)} style={{ flex: 1, textAlign: "center" }}>{l}</button>
              ))}
            </div>
          </div>

          {/* High Confidence */}
          <button className={`sb ${highOnly ? "on" : ""}`} onClick={() => setHighOnly(!highOnly)}
            style={{ width: "100%", textAlign: "center", padding: 8, ...(highOnly ? { background: "rgba(255,145,0,0.1)", borderColor: "rgba(255,145,0,0.3)", color: "#ff9100" } : {}) }}>
            🎯 Nur Hohe Confidence
          </button>

          {/* Watchlist */}
          <div>
            <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", marginBottom: 6, letterSpacing: 1 }}>WATCHLIST</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              <input type="text" placeholder="+ Ticker" value={watchInput} onChange={e => setWatchInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addWatch()}
                style={{ flex: 1, padding: "6px 8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, color: "#fff", fontSize: 11, outline: "none", fontFamily: "'JetBrains Mono', monospace" }} />
              <button onClick={addWatch} style={{ background: "rgba(124,138,255,0.15)", border: "1px solid rgba(124,138,255,0.3)", color: "#7c8aff", borderRadius: 5, padding: "0 10px", cursor: "pointer", fontSize: 13 }}>+</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {watchlist.map(t => <span key={t} className="wc" onClick={() => setWatchlist(prev => prev.filter(x => x !== t))}>${t} ×</span>)}
            </div>
          </div>

          {/* Signal Summary */}
          <div style={{ padding: 10, background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: 10, color: "#555", fontFamily: "monospace", marginBottom: 6, letterSpacing: 1 }}>SIGNAL-ÜBERSICHT</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {[["LONG", "#00e676", counts.LONG], ["SHORT", "#ff5252", counts.SHORT], ["WAIT", "#888", counts.ABWARTEN]].map(([l, c, v]) => (
                <div key={l} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: c, fontFamily: "monospace" }}>{v}</div>
                  <div style={{ fontSize: 9, color: c }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Twitter Panel */}
          <TwitterPanel />

        </aside>

        {/* ═══ MAIN CONTENT ═══ */}
        <main style={{ flex: 1, padding: "14px 18px", overflowY: "auto" }}>

          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300 }}>
              <div style={{ width: 32, height: 32, border: "3px solid rgba(124,138,255,0.2)", borderTopColor: "#7c8aff", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: 14 }} />
              <span style={{ color: "#7c8aff", fontFamily: "monospace", fontSize: 13 }}>News werden geladen...</span>
            </div>
          ) : (
            <>
              {/* Feed Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 10, color: "#555", fontFamily: "monospace", letterSpacing: 1 }}>
                  LIVE FEED — {filtered.length} NEWS {search && `• "${search}"`}
                </span>
                <div style={{ position: "relative", overflow: "hidden", padding: "3px 10px", borderRadius: 4, background: "rgba(0,230,118,0.05)", border: "1px solid rgba(0,230,118,0.12)" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent, rgba(0,230,118,0.07), transparent)", animation: "scan 3s linear infinite" }} />
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: "#00e676", position: "relative" }}>● SCANNING</span>
                </div>
              </div>

              {/* News List */}
              <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.01)" }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: 40, textAlign: "center", color: "#444" }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
                    <p style={{ fontFamily: "monospace", fontSize: 13 }}>
                      {!anyConnected ? "Keine API verbunden — trage Keys in Vercel ein" : "Keine News mit diesen Filtern"}
                    </p>
                  </div>
                ) : (
                  filtered.map(item => (
                    <NewsCard key={item.id} item={item} quotes={quotes} />
                  ))
                )}
              </div>

              <div style={{ marginTop: 10, textAlign: "center", fontSize: 10, color: "#444", fontFamily: "monospace" }}>
                💡 Klicke auf eine News → Signal, Zeitraum, Stärke, Backup-Check
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
