import { useState, useEffect, useRef, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════
const FINNHUB_KEY = import.meta.env.VITE_FINNHUB_KEY || "";
const NEWSFILTER_KEY = import.meta.env.VITE_NEWSFILTER_KEY || "";
const FINNHUB = "https://finnhub.io/api/v1";
const NF_URL = "https://api.newsfilter.io/public/actions";
const T_NEWS = 60000;
const T_QUOTES = 20000;

const DEFAULT_WATCHLIST = ["NVDA", "TSLA", "AAPL", "MSFT", "AMD", "META", "AMZN", "GOOGL"];

const TWITTER = [
  { handle: "DeItaone", name: "Walter Bloomberg", desc: "Schnellste Breaking News", cat: "BREAKING" },
  { handle: "unusual_whales", name: "Unusual Whales", desc: "Options Flow & Smart Money", cat: "OPTIONS" },
  { handle: "zerohedge", name: "Zerohedge", desc: "Makro & Marktanalyse", cat: "MAKRO" },
  { handle: "Fxhedgers", name: "Fxhedgers", desc: "Forex + Makro News", cat: "MAKRO" },
  { handle: "FirstSquawk", name: "First Squawk", desc: "Echtzeit-Headlines", cat: "BREAKING" },
  { handle: "disclosetv", name: "Disclose.tv", desc: "Geopolitik News", cat: "GEO" },
  { handle: "StockMKTNewz", name: "StockMKTNewz", desc: "US-Aktienmarkt", cat: "STOCKS" },
  { handle: "LiveSquawk", name: "LiveSquawk", desc: "Institutionelle Alerts", cat: "BREAKING" },
];

// ═══════════════════════════════════════════════════════════════════════
// SENTIMENT + SIGNAL ENGINE
// ═══════════════════════════════════════════════════════════════════════
const BULL = [
  "beats","surpass","record high","upgrade","buy","outperform","raise",
  "growth","surge","rally","soar","boom","breakout","bullish","strong",
  "exceed","profit","positive","innovative","expansion","partnership",
  "approved","launches","wins","acquires","deal","contract","revenue up",
  "earnings beat","all-time high","momentum","recovery","rebound",
  "dividend","buyback","upside","beat expectations","guidance raised",
  "price target raised","stock split","new high","accelerat","optimis",
  "strong demand","record revenue","market share","breakthrough"
];
const BEAR = [
  "miss","downgrade","sell","underperform","cut","decline","crash",
  "plunge","drop","fall","bearish","weak","loss","negative","layoff",
  "lawsuit","fine","recall","bankruptcy","default","debt","warning",
  "risk","concern","fraud","investigation","subpoena","SEC","penalty",
  "closure","shutdown","slowdown","recession","inflation","tariff",
  "ban","reject","delay","fail","downturn","guidance cut",
  "price target cut","missed expectations","disappointing","worse than",
  "pessimis","weak demand","margin pressure","supply chain"
];

function sentiment(text) {
  if (!text) return { sent: "neutral", conf: 0, score: 50, bullWords: [], bearWords: [] };
  const lo = text.toLowerCase();
  const bw = BULL.filter(w => lo.includes(w));
  const ew = BEAR.filter(w => lo.includes(w));
  const total = bw.length + ew.length;
  if (total === 0) return { sent: "neutral", conf: 0, score: 50, bullWords: [], bearWords: [] };
  const score = Math.round((bw.length / total) * 100);
  const conf = Math.min(total * 18, 100);
  if (score >= 58) return { sent: "bullish", conf, score, bullWords: bw, bearWords: ew };
  if (score <= 42) return { sent: "bearish", conf, score, bullWords: bw, bearWords: ew };
  return { sent: "neutral", conf: Math.max(conf - 20, 0), score: 50, bullWords: bw, bearWords: ew };
}

function calcSignal(s, conf, pc) {
  // s = sentiment string, conf = confidence, pc = price change %
  if (s === "bullish" && conf >= 30) {
    if (pc > 0.5) return {
      sig: "LONG", str: "STARK", time: "Intraday – 3 Tage",
      reason: "Starkes bullisches Sentiment wird vom Kurs bestätigt. Der Markt reagiert bereits positiv.",
      backup: "✅ Kurs bestätigt", riskLevel: "Mittel"
    };
    if (pc > -0.3) return {
      sig: "LONG", str: "MITTEL", time: "Swing 2–7 Tage",
      reason: "Bullisches Sentiment erkannt, Kurs noch neutral. Einstieg möglich bei Bestätigung.",
      backup: "⚠️ Bestätigung abwarten", riskLevel: "Mittel-Hoch"
    };
    return {
      sig: "LONG", str: "SCHWACH", time: "Swing 5–14 Tage",
      reason: "Sentiment positiv, aber Kurs geht dagegen. Nur mit engem Stop-Loss.",
      backup: "⚠️ Kurs dagegen", riskLevel: "Hoch"
    };
  }
  if (s === "bearish" && conf >= 30) {
    if (pc < -0.5) return {
      sig: "SHORT", str: "STARK", time: "Intraday – 3 Tage",
      reason: "Starkes bärisches Sentiment wird vom fallenden Kurs bestätigt. Klarer Abwärtstrend.",
      backup: "✅ Kurs bestätigt", riskLevel: "Mittel"
    };
    if (pc < 0.3) return {
      sig: "SHORT", str: "MITTEL", time: "Swing 2–7 Tage",
      reason: "Bärisches Sentiment erkannt, Kurs noch neutral. Short bei Breakdown.",
      backup: "⚠️ Bestätigung abwarten", riskLevel: "Mittel-Hoch"
    };
    return {
      sig: "SHORT", str: "SCHWACH", time: "Swing 5–14 Tage",
      reason: "Sentiment negativ, aber Kurs steigt noch. Risiko eines Short Squeeze.",
      backup: "⚠️ Kurs dagegen", riskLevel: "Hoch"
    };
  }
  return {
    sig: "WAIT", str: "—", time: "—",
    reason: "Kein eindeutiges Signal. Sentiment ist gemischt oder zu schwach für eine klare Richtung.",
    backup: "⛔ Kein Signal", riskLevel: "—"
  };
}

function buildIndicators(sent, conf, pc, bullWords, bearWords) {
  const indicators = [];
  // Sentiment Indicator
  indicators.push({
    name: "News-Sentiment",
    value: sent === "bullish" ? "Positiv" : sent === "bearish" ? "Negativ" : "Neutral",
    color: sent === "bullish" ? "#00e676" : sent === "bearish" ? "#ff5252" : "#888",
    detail: `${bullWords.length} bullische vs ${bearWords.length} bärische Keywords`
  });
  // Confidence
  indicators.push({
    name: "Confidence",
    value: `${conf}%`,
    color: conf >= 60 ? "#00e676" : conf >= 35 ? "#ffc107" : "#ff5252",
    detail: conf >= 60 ? "Hohe Sicherheit" : conf >= 35 ? "Mittlere Sicherheit" : "Niedrige Sicherheit"
  });
  // Price Momentum
  indicators.push({
    name: "Kurs-Momentum",
    value: `${pc >= 0 ? "+" : ""}${pc.toFixed(2)}%`,
    color: pc > 0.5 ? "#00e676" : pc < -0.5 ? "#ff5252" : "#ffc107",
    detail: Math.abs(pc) > 1 ? "Starke Bewegung" : Math.abs(pc) > 0.3 ? "Moderate Bewegung" : "Geringe Bewegung"
  });
  // Trend Alignment
  const aligned = (sent === "bullish" && pc > 0) || (sent === "bearish" && pc < 0);
  indicators.push({
    name: "Trend-Alignment",
    value: aligned ? "Bestätigt" : sent === "neutral" ? "N/A" : "Divergenz",
    color: aligned ? "#00e676" : sent === "neutral" ? "#888" : "#ff9100",
    detail: aligned ? "News & Kurs gleiche Richtung" : "News & Kurs widersprechen sich"
  });
  return indicators;
}

function timeAgo(ts) {
  if (!ts || isNaN(ts)) return "—";
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 0) return "0s";
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// ═══════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function ConfidenceGauge({ value, size }) {
  const sz = size || 80;
  const r = sz * 0.38;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(Math.max(value, 0), 100);
  const offset = circ - (pct / 100) * circ * 0.75;
  const color = pct >= 60 ? "#00e676" : pct >= 35 ? "#ffc107" : "#ff5252";
  return (
    <div style={{ position: "relative", width: sz, height: sz * 0.65 }}>
      <svg width={sz} height={sz * 0.65} viewBox={`0 0 ${sz} ${sz * 0.65}`}>
        <circle cx={sz / 2} cy={sz * 0.55} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5}
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeLinecap="round"
          transform={`rotate(135 ${sz / 2} ${sz * 0.55})`} />
        <circle cx={sz / 2} cy={sz * 0.55} r={r} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeDashoffset={offset} strokeLinecap="round"
          transform={`rotate(135 ${sz / 2} ${sz * 0.55})`} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <div style={{ position: "absolute", bottom: 2, left: 0, right: 0, textAlign: "center" }}>
        <span style={{ fontSize: sz * 0.22, fontWeight: 800, color, fontFamily: "var(--mono)" }}>{pct}%</span>
      </div>
    </div>
  );
}

function SignalBadge({ signal, big }) {
  const m = {
    LONG: { bg: "rgba(0,230,118,0.15)", bd: "rgba(0,230,118,0.4)", c: "#00e676", t: "▲ LONG" },
    SHORT: { bg: "rgba(255,82,82,0.15)", bd: "rgba(255,82,82,0.4)", c: "#ff5252", t: "▼ SHORT" },
    WAIT: { bg: "rgba(255,255,255,0.06)", bd: "rgba(255,255,255,0.12)", c: "#888", t: "● ABWARTEN" },
  };
  const s = m[signal] || m.WAIT;
  return (
    <span style={{ padding: big ? "6px 16px" : "4px 12px", borderRadius: 6, background: s.bg, border: `1.5px solid ${s.bd}`, color: s.c, fontSize: big ? 16 : 13, fontWeight: 800, fontFamily: "var(--mono)", letterSpacing: 0.5, display: "inline-block" }}>
      {s.t}
    </span>
  );
}

function QuoteCard({ symbol, quote, isFav, onClick }) {
  if (!quote || typeof quote.c !== "number") {
    return (
      <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", minWidth: 135, flexShrink: 0 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: "#7c8aff" }}>${symbol}</span>
        <div style={{ fontSize: 12, color: "#444", marginTop: 4, fontFamily: "var(--mono)" }}>Laden...</div>
      </div>
    );
  }
  const ch = typeof quote.dp === "number" ? quote.dp : 0;
  const up = ch >= 0;
  return (
    <div onClick={() => onClick(symbol)} style={{
      padding: "12px 16px", borderRadius: 10, cursor: "pointer",
      background: isFav ? "rgba(255,215,0,0.04)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${isFav ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.06)"}`,
      transition: "all 0.2s", minWidth: 135, flexShrink: 0, position: "relative",
    }}>
      {isFav && <span style={{ position: "absolute", top: 4, right: 6, fontSize: 10 }}>★</span>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, color: "#7c8aff" }}>${symbol}</span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: up ? "#00e676" : "#ff5252" }}>
          {up ? "▲" : "▼"}{Math.abs(ch).toFixed(2)}%
        </span>
      </div>
      <div style={{ fontFamily: "var(--mono)", fontSize: 18, fontWeight: 800, color: "#fff" }}>${quote.c.toFixed(2)}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 10, color: "#555", fontFamily: "var(--mono)" }}>H:{typeof quote.h === "number" ? quote.h.toFixed(2) : "—"}</span>
        <span style={{ fontSize: 10, color: "#555", fontFamily: "var(--mono)" }}>L:{typeof quote.l === "number" ? quote.l.toFixed(2) : "—"}</span>
      </div>
    </div>
  );
}

function NewsCard({ item, quotes }) {
  const [open, setOpen] = useState(false);
  const ticker = (item.ticker || "").split(",")[0].trim();
  const q = ticker ? quotes[ticker] : null;
  const pc = (q && typeof q.dp === "number") ? q.dp : 0;
  const fullText = (item.headline || "") + " " + (item.summary || "");
  const { sent, conf, score, bullWords, bearWords } = sentiment(fullText);
  const sig = calcSignal(sent, conf, pc);
  const indicators = buildIndicators(sent, conf, pc, bullWords, bearWords);
  const isNew = (Date.now() / 1000) - item.datetime < 600;

  const srcColor = item.apiSource === "newsfilter" ? "#7c8aff" : "#ff9100";

  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "all 0.2s", position: "relative" }}>
      {isNew && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#00e676", borderRadius: "0 3px 3px 0" }} />}

      {/* Klickbare Headline */}
      <div onClick={() => setOpen(!open)} style={{
        padding: "16px 20px", cursor: "pointer",
        background: isNew ? "linear-gradient(90deg, rgba(0,230,118,0.04) 0%, transparent 25%)" : "transparent",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              {ticker && <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "#7c8aff", fontWeight: 700, padding: "2px 8px", background: "rgba(124,138,255,0.1)", borderRadius: 5 }}>${ticker}</span>}
              <SignalBadge signal={sig.sig} />
              <span style={{ fontSize: 10, color: srcColor, fontFamily: "var(--mono)", fontWeight: 700, padding: "2px 6px", background: `${srcColor}12`, borderRadius: 4, border: `1px solid ${srcColor}25` }}>
                {item.apiSource === "newsfilter" ? "NEWSFILTER" : "FINNHUB"}
              </span>
              <span style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)" }}>{item.source || ""}</span>
            </div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,0.9)", fontWeight: 500 }}>{item.headline}</p>
          </div>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: isNew ? "#00e676" : "#555", fontWeight: isNew ? 700 : 400 }}>{timeAgo(item.datetime)}</span>
            <span style={{ fontSize: 18, color: "#555", transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}>⌄</span>
          </div>
        </div>
      </div>

      {/* ═══ EXPANDED ANALYSIS ═══ */}
      {open && (
        <div style={{ padding: "0 20px 20px", animation: "fadeIn 0.3s ease" }}>
          <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 20, backdropFilter: "blur(10px)" }}>

            {/* Top Row: Signal + Confidence Gauge */}
            <div style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)", marginBottom: 8, letterSpacing: 1 }}>TRADE-EMPFEHLUNG</div>
                <SignalBadge signal={sig.sig} big />
                <div style={{ marginTop: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)", marginBottom: 2 }}>STÄRKE</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: "var(--mono)" }}>{sig.str}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)", marginBottom: 2 }}>ZEITRAUM</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", fontFamily: "var(--mono)" }}>{sig.time}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)", marginBottom: 2 }}>RISIKO</div>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "var(--mono)", color: sig.riskLevel === "Hoch" ? "#ff5252" : sig.riskLevel === "Mittel-Hoch" ? "#ff9100" : sig.riskLevel === "Mittel" ? "#ffc107" : "#888" }}>{sig.riskLevel}</div>
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)", marginBottom: 4, letterSpacing: 1 }}>CONFIDENCE</div>
                <ConfidenceGauge value={conf} size={100} />
              </div>
            </div>

            {/* Begründung */}
            <div style={{
              padding: "14px 18px", borderRadius: 10, marginBottom: 16,
              background: sig.sig === "LONG" ? "rgba(0,230,118,0.06)" : sig.sig === "SHORT" ? "rgba(255,82,82,0.06)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${sig.sig === "LONG" ? "rgba(0,230,118,0.15)" : sig.sig === "SHORT" ? "rgba(255,82,82,0.15)" : "rgba(255,255,255,0.06)"}`,
            }}>
              <div style={{ fontSize: 11, color: "#888", fontFamily: "var(--mono)", marginBottom: 6, letterSpacing: 1 }}>BEGRÜNDUNG</div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{sig.reason}</p>
            </div>

            {/* Backup Check */}
            <div style={{
              padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14, fontWeight: 600,
              background: sig.backup.startsWith("✅") ? "rgba(0,230,118,0.08)" : sig.backup.startsWith("⚠️") ? "rgba(255,193,7,0.06)" : "rgba(255,82,82,0.06)",
              border: `1px solid ${sig.backup.startsWith("✅") ? "rgba(0,230,118,0.2)" : sig.backup.startsWith("⚠️") ? "rgba(255,193,7,0.15)" : "rgba(255,82,82,0.15)"}`,
              color: sig.backup.startsWith("✅") ? "#00e676" : sig.backup.startsWith("⚠️") ? "#ffc107" : "#ff5252",
            }}>
              BACKUP-CHECK: {sig.backup}
            </div>

            {/* Indikatoren Grid */}
            <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)", marginBottom: 8, letterSpacing: 1 }}>INDIKATOREN</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {indicators.map(ind => (
                <div key={ind.name} style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, color: "#888", fontFamily: "var(--mono)" }}>{ind.name}</span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: ind.color, fontFamily: "var(--mono)" }}>{ind.value}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#666" }}>{ind.detail}</div>
                </div>
              ))}
            </div>

            {/* Sentiment Bar */}
            <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)", marginBottom: 6, letterSpacing: 1 }}>SENTIMENT-SCORE</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: "#ff5252", fontFamily: "var(--mono)", fontWeight: 700 }}>BEAR</span>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)", overflow: "hidden", position: "relative" }}>
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0,
                  width: `${score}%`, borderRadius: 4,
                  background: score >= 60 ? "linear-gradient(90deg, #ffc107, #00e676)" : score <= 40 ? "linear-gradient(90deg, #ff5252, #ff9100)" : "linear-gradient(90deg, #888, #aaa)",
                  transition: "width 0.6s ease",
                }} />
              </div>
              <span style={{ fontSize: 12, color: "#00e676", fontFamily: "var(--mono)", fontWeight: 700 }}>BULL</span>
              <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "var(--mono)", color: score >= 60 ? "#00e676" : score <= 40 ? "#ff5252" : "#888", minWidth: 45, textAlign: "right" }}>{score}/100</span>
            </div>

            {/* Keywords */}
            {(bullWords.length > 0 || bearWords.length > 0) && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {bullWords.map(w => <span key={`b-${w}`} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(0,230,118,0.1)", color: "#00e676", fontFamily: "var(--mono)" }}>+{w}</span>)}
                {bearWords.map(w => <span key={`e-${w}`} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: "rgba(255,82,82,0.1)", color: "#ff5252", fontFamily: "var(--mono)" }}>-{w}</span>)}
              </div>
            )}

            {/* Summary + Link */}
            {item.summary && <p style={{ margin: "0 0 10px", fontSize: 13, color: "#888", lineHeight: 1.7 }}>{item.summary.slice(0, 300)}{item.summary.length > 300 ? "..." : ""}</p>}
            {item.url && item.url !== "#" && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ fontSize: 13, color: "#7c8aff", textDecoration: "none", fontFamily: "var(--mono)", fontWeight: 600 }}>
                Artikel lesen →
              </a>
            )}
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
  const [watchlist, setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [favorites, setFavorites] = useState(["NVDA", "TSLA", "AAPL"]);
  const [watchInput, setWatchInput] = useState("");
  const [favInput, setFavInput] = useState("");
  const [search, setSearch] = useState("");
  const [sentFilter, setSentFilter] = useState("all");
  const [sigFilter, setSigFilter] = useState("all");
  const [highOnly, setHighOnly] = useState(false);
  const [apiStatus, setApiStatus] = useState({ finnhub: false, newsfilter: false });
  const [lastFetch, setLastFetch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState([]);
  const [soundOn, setSoundOn] = useState(true);

  const quotesRef = useRef(quotes);
  const watchRef = useRef(watchlist);
  const favRef = useRef(favorites);
  const newsCountRef = useRef(0);
  const soundRef = useRef(soundOn);

  useEffect(() => { quotesRef.current = quotes; }, [quotes]);
  useEffect(() => { watchRef.current = watchlist; }, [watchlist]);
  useEffect(() => { favRef.current = favorites; }, [favorites]);
  useEffect(() => { soundRef.current = soundOn; }, [soundOn]);

  // ─── FETCH FINNHUB ──────────────────────────────────────────────
  const fetchFinnhub = useCallback(async () => {
    if (!FINNHUB_KEY) return { results: [], errs: [], ok: false };
    const results = [];
    const errs = [];
    try {
      const res = await fetch(`${FINNHUB}/news?category=general&token=${FINNHUB_KEY}`);
      if (!res.ok) throw new Error(`Finnhub ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        data.slice(0, 30).forEach(item => {
          results.push({ id: `fh-${item.id || item.datetime}`, headline: item.headline || "", summary: item.summary || "", source: item.source || "", apiSource: "finnhub", url: item.url || "", datetime: item.datetime || 0, ticker: item.related || "" });
        });
      }
    } catch (e) { errs.push(`Finnhub: ${e.message}`); }

    const today = new Date().toISOString().split("T")[0];
    const week = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    const allTickers = [...new Set([...watchRef.current, ...favRef.current])];
    for (let i = 0; i < Math.min(allTickers.length, 4); i++) {
      try {
        const res = await fetch(`${FINNHUB}/company-news?symbol=${allTickers[i]}&from=${week}&to=${today}&token=${FINNHUB_KEY}`);
        if (res.ok) {
          const d = await res.json();
          if (Array.isArray(d)) d.slice(0, 4).forEach(item => {
            results.push({ id: `fhc-${item.id || item.datetime}-${allTickers[i]}`, headline: item.headline || "", summary: item.summary || "", source: item.source || "", apiSource: "finnhub", url: item.url || "", datetime: item.datetime || 0, ticker: allTickers[i] });
          });
        }
      } catch (e) {}
    }
    return { results, errs, ok: results.length > 0 };
  }, []);

  // ─── FETCH NEWSFILTER ───────────────────────────────────────────
  const fetchNF = useCallback(async () => {
    if (!NEWSFILTER_KEY) return { results: [], errs: [], ok: false };
    const results = [];
    const errs = [];
    try {
      const res = await fetch(NF_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${NEWSFILTER_KEY}` },
        body: JSON.stringify({ type: "filterArticles", queryString: "*", from: 0, size: 25 }),
      });
      if (!res.ok) throw new Error(`Newsfilter ${res.status}`);
      const data = await res.json();
      const arts = data.articles || data || [];
      if (Array.isArray(arts)) arts.forEach(item => {
        const ts = item.publishedAt ? new Date(item.publishedAt).getTime() / 1000 : 0;
        const syms = Array.isArray(item.symbols) ? item.symbols.join(",") : (item.symbols || "");
        results.push({ id: `nf-${item.id || ts}`, headline: item.title || item.headline || "", summary: item.description || item.summary || "", source: (item.source && item.source.name) ? item.source.name : "Newsfilter", apiSource: "newsfilter", url: item.url || "", datetime: ts, ticker: syms });
      });
    } catch (e) { errs.push(`Newsfilter: ${e.message}`); }
    return { results, errs, ok: results.length > 0 };
  }, []);

  // ─── COMBINED ───────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [fh, nf] = await Promise.all([fetchFinnhub(), fetchNF()]);
    const all = [...fh.results, ...nf.results];
    const seen = new Set();
    const uniq = all.filter(item => {
      if (!item.headline) return false;
      const k = item.headline.toLowerCase().slice(0, 50);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).sort((a, b) => (b.datetime || 0) - (a.datetime || 0)).slice(0, 80);

    if (newsCountRef.current > 0 && uniq.length > newsCountRef.current && soundRef.current) {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880; o.type = "sine";
        g.gain.setValueAtTime(0.1, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.2);
      } catch (e) {}
    }
    newsCountRef.current = uniq.length;
    setNews(uniq);
    setApiStatus({ finnhub: fh.ok, newsfilter: nf.ok });
    setErrors([...fh.errs, ...nf.errs]);
    setLastFetch(Date.now());
    setLoading(false);
  }, [fetchFinnhub, fetchNF]);

  // ─── QUOTES ─────────────────────────────────────────────────────
  const fetchQuotes = useCallback(async () => {
    if (!FINNHUB_KEY) return;
    const allT = [...new Set([...watchRef.current, ...favRef.current])];
    const prev = quotesRef.current;
    const upd = { ...prev };
    for (const sym of allT) {
      try {
        const res = await fetch(`${FINNHUB}/quote?symbol=${sym}&token=${FINNHUB_KEY}`);
        if (res.ok) {
          const d = await res.json();
          if (d && typeof d.c === "number" && d.c > 0) upd[sym] = d;
        }
      } catch (e) {}
    }
    setQuotes(upd);
  }, []);

  useEffect(() => {
    fetchAll();
    fetchQuotes();
    const t1 = setInterval(fetchAll, T_NEWS);
    const t2 = setInterval(fetchQuotes, T_QUOTES);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [fetchAll, fetchQuotes]);

  // ─── FILTERS ────────────────────────────────────────────────────
  const filtered = news.filter(item => {
    const txt = (item.headline || "") + " " + (item.summary || "");
    const { sent: s, conf: c } = sentiment(txt);
    const tk = (item.ticker || "").split(",")[0].trim();
    const pc = (quotes[tk] && typeof quotes[tk].dp === "number") ? quotes[tk].dp : 0;
    const sg = calcSignal(s, c, pc);
    if (sentFilter !== "all" && s !== sentFilter) return false;
    if (sigFilter !== "all" && sg.sig !== sigFilter) return false;
    if (highOnly && c < 50) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(item.headline + " " + (item.ticker || "") + " " + (item.source || "")).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = { LONG: 0, SHORT: 0, WAIT: 0 };
  news.slice(0, 25).forEach(item => {
    const { sent: s, conf: c } = sentiment((item.headline || "") + " " + (item.summary || ""));
    const tk = (item.ticker || "").split(",")[0].trim();
    const pc = (quotes[tk] && typeof quotes[tk].dp === "number") ? quotes[tk].dp : 0;
    counts[calcSignal(s, c, pc).sig]++;
  });

  const addWatch = () => { const t = watchInput.toUpperCase().trim(); if (t && !watchlist.includes(t)) setWatchlist(p => [...p, t]); setWatchInput(""); };
  const addFav = () => { const t = favInput.toUpperCase().trim(); if (t && !favorites.includes(t)) setFavorites(p => [...p, t]); setFavInput(""); };
  const anyOn = apiStatus.finnhub || apiStatus.newsfilter;

  return (
    <div style={{ minHeight: "100vh", background: "#06080d", color: "#e0e0e0", fontFamily: "'Outfit', 'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap');
        :root { --mono: 'JetBrains Mono', monospace; --body: 'Outfit', sans-serif; }
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.15}}
        @keyframes scan{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.07);border-radius:3px}
        .btn{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#999;padding:7px 14px;border-radius:8px;font-size:13px;cursor:pointer;transition:all .15s;font-family:var(--mono);white-space:nowrap}
        .btn:hover{background:rgba(255,255,255,0.07);color:#ddd}
        .btn.on{background:rgba(124,138,255,0.14);border-color:rgba(124,138,255,0.3);color:#7c8aff}
        .chip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:5px;font-size:12px;font-weight:600;font-family:var(--mono);cursor:pointer;transition:all .15s;background:rgba(124,138,255,0.08);border:1px solid rgba(124,138,255,0.15);color:#7c8aff}
        .chip:hover{background:rgba(255,82,82,0.12);border-color:rgba(255,82,82,0.3);color:#ff5252}
        .fchip{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:5px;font-size:12px;font-weight:600;font-family:var(--mono);cursor:pointer;transition:all .15s;background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.2);color:#ffd740}
        .fchip:hover{background:rgba(255,82,82,0.12);border-color:rgba(255,82,82,0.3);color:#ff5252}
        .inp{width:100%;padding:9px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:#fff;font-size:14px;outline:none;font-family:var(--mono)}
        .inp:focus{border-color:rgba(124,138,255,0.4)}
      `}</style>

      {/* ═══ HEADER ═══ */}
      <header style={{ padding: "14px 22px", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "linear-gradient(180deg, rgba(124,138,255,0.03) 0%, transparent 100%)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #7c8aff, #5c6bc0)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚡</div>
            <h1 style={{ margin: 0, fontSize: 20, fontFamily: "var(--mono)", color: "#fff" }}>
              SIGNAL<span style={{ color: "#7c8aff" }}>FLOW</span>{" "}
              <span style={{ fontSize: 12, color: "#00e676", fontWeight: 400 }}>v4.0</span>
            </h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 6 }}>
              {[{ n: "Finnhub", on: apiStatus.finnhub, c: "#ff9100" }, { n: "Newsfilter", on: apiStatus.newsfilter, c: "#7c8aff" }].map(a => (
                <div key={a.n} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 6, background: a.on ? `${a.c}10` : "rgba(255,82,82,0.06)", border: `1px solid ${a.on ? a.c + "25" : "rgba(255,82,82,0.15)"}` }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.on ? a.c : "#ff5252", animation: a.on ? "blink 2s infinite" : "none" }} />
                  <span style={{ fontSize: 11, color: a.on ? a.c : "#ff5252", fontFamily: "var(--mono)" }}>{a.n}</span>
                </div>
              ))}
            </div>
            <span style={{ fontSize: 11, color: "#555", fontFamily: "var(--mono)" }}>
              {news.length} News{lastFetch ? ` • ${new Date(lastFetch).toLocaleTimeString("de-DE")}` : ""}
            </span>
            <button className="btn" onClick={() => setSoundOn(!soundOn)}>{soundOn ? "🔊" : "🔇"}</button>
            <button className="btn" onClick={() => { setLoading(true); fetchAll(); fetchQuotes(); }} style={{ color: "#7c8aff" }}>🔄</button>
          </div>
        </div>
      </header>

      {errors.length > 0 && !anyOn && (
        <div style={{ margin: "10px 22px", padding: "12px 16px", background: "rgba(255,82,82,0.06)", border: "1px solid rgba(255,82,82,0.15)", borderRadius: 10 }}>
          {errors.map((e, i) => <div key={i} style={{ color: "#ff5252", fontSize: 13, fontFamily: "var(--mono)" }}>⚠️ {e}</div>)}
          <div style={{ color: "#888", fontSize: 12, marginTop: 6 }}>Trage API Keys in Vercel → Settings → Environment Variables ein.</div>
        </div>
      )}

      {/* ═══ FAVORITEN + QUOTES ═══ */}
      <div style={{ padding: "12px 22px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        {favorites.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "#ffd740", fontFamily: "var(--mono)", letterSpacing: 1 }}>★ FAVORITEN</span>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {favorites.map(sym => <QuoteCard key={`f-${sym}`} symbol={sym} quote={quotes[sym]} isFav onClick={s => setSearch(s)} />)}
          {watchlist.filter(s => !favorites.includes(s)).map(sym => <QuoteCard key={`w-${sym}`} symbol={sym} quote={quotes[sym]} isFav={false} onClick={s => setSearch(s)} />)}
        </div>
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 170px)" }}>
        {/* ═══ SIDEBAR ═══ */}
        <aside style={{ width: 260, borderRight: "1px solid rgba(255,255,255,0.05)", padding: 16, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>

          <div>
            <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)", marginBottom: 6, letterSpacing: 1 }}>SUCHE</div>
            <input className="inp" type="text" placeholder="Ticker / Keyword..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div>
            <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)", marginBottom: 6, letterSpacing: 1 }}>SIGNAL</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[["all", "◉ Alle"], ["LONG", "▲ LONG"], ["SHORT", "▼ SHORT"], ["WAIT", "● WAIT"]].map(([k, l]) => (
                <button key={k} className={`btn ${sigFilter === k ? "on" : ""}`} onClick={() => setSigFilter(k)} style={{ textAlign: "left" }}>{l}</button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)", marginBottom: 6, letterSpacing: 1 }}>SENTIMENT</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[["all", "Alle"], ["bullish", "▲ Bull"], ["bearish", "▼ Bear"]].map(([k, l]) => (
                <button key={k} className={`btn ${sentFilter === k ? "on" : ""}`} onClick={() => setSentFilter(k)} style={{ flex: 1, textAlign: "center" }}>{l}</button>
              ))}
            </div>
          </div>

          <button className={`btn ${highOnly ? "on" : ""}`} onClick={() => setHighOnly(!highOnly)}
            style={{ width: "100%", textAlign: "center", padding: 9, ...(highOnly ? { background: "rgba(255,145,0,0.1)", borderColor: "rgba(255,145,0,0.3)", color: "#ff9100" } : {}) }}>
            🎯 Nur Hohe Confidence
          </button>

          {/* FAVORITEN Section */}
          <div style={{ padding: 12, background: "rgba(255,215,0,0.03)", borderRadius: 10, border: "1px solid rgba(255,215,0,0.1)" }}>
            <div style={{ fontSize: 11, color: "#ffd740", fontFamily: "var(--mono)", marginBottom: 8, letterSpacing: 1 }}>★ FAVORITEN</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              <input type="text" placeholder="+ Ticker" value={favInput} onChange={e => setFavInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addFav()}
                style={{ flex: 1, padding: "7px 9px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 6, color: "#fff", fontSize: 12, outline: "none", fontFamily: "var(--mono)" }} />
              <button onClick={addFav} style={{ background: "rgba(255,215,0,0.12)", border: "1px solid rgba(255,215,0,0.25)", color: "#ffd740", borderRadius: 6, padding: "0 12px", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>+</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {favorites.map(t => <span key={t} className="fchip" onClick={() => setFavorites(p => p.filter(x => x !== t))}>★ ${t} ×</span>)}
            </div>
          </div>

          {/* WATCHLIST */}
          <div>
            <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)", marginBottom: 6, letterSpacing: 1 }}>WATCHLIST</div>
            <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
              <input type="text" placeholder="+ Ticker" value={watchInput} onChange={e => setWatchInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addWatch()}
                style={{ flex: 1, padding: "7px 9px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "#fff", fontSize: 12, outline: "none", fontFamily: "var(--mono)" }} />
              <button onClick={addWatch} style={{ background: "rgba(124,138,255,0.12)", border: "1px solid rgba(124,138,255,0.25)", color: "#7c8aff", borderRadius: 6, padding: "0 12px", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>+</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {watchlist.map(t => <span key={t} className="chip" onClick={() => setWatchlist(p => p.filter(x => x !== t))}>${t} ×</span>)}
            </div>
          </div>

          {/* Signal Summary */}
          <div style={{ padding: 12, background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" }}>
            <div style={{ fontSize: 11, color: "#666", fontFamily: "var(--mono)", marginBottom: 8, letterSpacing: 1 }}>SIGNAL-ÜBERSICHT</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {[["LONG", "#00e676", counts.LONG], ["SHORT", "#ff5252", counts.SHORT], ["WAIT", "#888", counts.WAIT]].map(([l, c, v]) => (
                <div key={l} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: c, fontFamily: "var(--mono)" }}>{v}</div>
                  <div style={{ fontSize: 10, color: c, fontWeight: 600 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Twitter */}
          <div style={{ padding: 12, background: "rgba(29,161,242,0.03)", borderRadius: 10, border: "1px solid rgba(29,161,242,0.1)" }}>
            <div style={{ fontSize: 11, color: "#1da1f2", fontFamily: "var(--mono)", marginBottom: 8, letterSpacing: 1, fontWeight: 700 }}>𝕏 TWITTER FEEDS</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {TWITTER.map(a => (
                <a key={a.handle} href={`https://x.com/${a.handle}`} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", padding: "6px 8px", borderRadius: 6, textDecoration: "none", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", transition: "all 0.15s" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "#1da1f2", fontWeight: 600, fontFamily: "var(--mono)" }}>@{a.handle}</span>
                    <span style={{ fontSize: 9, color: "#666", fontFamily: "var(--mono)", padding: "1px 5px", background: "rgba(255,255,255,0.04)", borderRadius: 3 }}>{a.cat}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>{a.desc}</div>
                </a>
              ))}
            </div>
          </div>
        </aside>

        {/* ═══ MAIN ═══ */}
        <main style={{ flex: 1, padding: "16px 20px", overflowY: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300 }}>
              <div style={{ width: 36, height: 36, border: "3px solid rgba(124,138,255,0.15)", borderTopColor: "#7c8aff", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: 16 }} />
              <span style={{ color: "#7c8aff", fontFamily: "var(--mono)", fontSize: 14 }}>News werden geladen...</span>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: "#666", fontFamily: "var(--mono)", letterSpacing: 1 }}>
                  LIVE FEED — {filtered.length} NEWS {search && `• "${search}"`}
                </span>
                <div style={{ position: "relative", overflow: "hidden", padding: "4px 12px", borderRadius: 6, background: "rgba(0,230,118,0.05)", border: "1px solid rgba(0,230,118,0.1)" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent, rgba(0,230,118,0.06), transparent)", animation: "scan 3s linear infinite" }} />
                  <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#00e676", position: "relative" }}>● SCANNING</span>
                </div>
              </div>

              <div style={{ border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, overflow: "hidden", background: "rgba(255,255,255,0.01)" }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: 50, textAlign: "center", color: "#555" }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
                    <p style={{ fontFamily: "var(--mono)", fontSize: 14 }}>
                      {!anyOn ? "Keine API verbunden — trage Keys in Vercel ein" : "Keine News mit diesen Filtern"}
                    </p>
                  </div>
                ) : (
                  filtered.map(item => <NewsCard key={item.id} item={item} quotes={quotes} />)
                )}
              </div>

              <div style={{ marginTop: 14, textAlign: "center", fontSize: 12, color: "#555", fontFamily: "var(--mono)" }}>
                💡 Klicke auf eine News → detaillierte Analyse mit Signal, Begründung, Indikatoren und Confidence
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
