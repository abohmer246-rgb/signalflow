import { useState, useEffect, useRef, useCallback } from "react";

const FK = import.meta.env.VITE_FINNHUB_KEY || "";
const NFK = import.meta.env.VITE_NEWSFILTER_KEY || "";
const FH = "https://finnhub.io/api/v1";
const NF = "https://api.newsfilter.io/public/actions";

const CATS = [
  { id: "all", label: "Alle" },
  { id: "stocks", label: "Aktien" },
  { id: "crypto", label: "Krypto" },
  { id: "etf", label: "ETFs" },
  { id: "forex", label: "Forex" },
  { id: "macro", label: "Makro" },
];

const CRYPTO_TICKERS = ["BTC","ETH","SOL","XRP","DOGE","ADA","DOT","AVAX","MATIC","LINK"];
const ETF_TICKERS = ["SPY","QQQ","IWM","DIA","XLF","XLE","XLK","GLD","SLV","TLT"];

const TWITTER = [
  { h: "DeItaone", d: "Schnellste Breaking News" },
  { h: "unusual_whales", d: "Options Flow" },
  { h: "zerohedge", d: "Makro-Analyse" },
  { h: "FirstSquawk", d: "Echtzeit-Headlines" },
  { h: "Fxhedgers", d: "Forex + Makro" },
  { h: "disclosetv", d: "Geopolitik" },
  { h: "StockMKTNewz", d: "US-Aktienmarkt" },
];

// ═══ SENTIMENT ENGINE ═══════════════════════════════════════════════
const BW = ["beats","surpass","record high","upgrade","buy","outperform","raise","growth","surge","rally","soar","boom","breakout","bullish","strong","exceed","profit","positive","innovative","expansion","partnership","approved","launches","wins","acquires","deal","contract","revenue up","earnings beat","all-time high","momentum","recovery","rebound","dividend","buyback","upside","guidance raised","price target raised","new high","strong demand","record revenue","breakthrough","beat expectations"];
const EW = ["miss","downgrade","sell","underperform","cut","decline","crash","plunge","drop","fall","bearish","weak","loss","negative","layoff","lawsuit","fine","recall","bankruptcy","default","debt","warning","risk","concern","fraud","investigation","subpoena","SEC","penalty","closure","shutdown","slowdown","recession","inflation","tariff","ban","reject","delay","fail","downturn","guidance cut","price target cut","disappointing","worse than","weak demand","margin pressure"];

function sent(text) {
  if (!text) return { s: "neutral", c: 0, sc: 50, bw: [], ew: [] };
  const lo = text.toLowerCase();
  const b = BW.filter(w => lo.includes(w));
  const e = EW.filter(w => lo.includes(w));
  const t = b.length + e.length;
  if (t === 0) return { s: "neutral", c: 0, sc: 50, bw: [], ew: [] };
  const sc = Math.round((b.length / t) * 100);
  const c = Math.min(t * 18, 100);
  if (sc >= 58) return { s: "bullish", c, sc, bw: b, ew: e };
  if (sc <= 42) return { s: "bearish", c, sc, bw: b, ew: e };
  return { s: "neutral", c: Math.max(c - 20, 0), sc: 50, bw: b, ew: e };
}

function calcSignal(s, c, pc, price) {
  const p = price || 100;
  if (s === "bullish" && c >= 30) {
    if (pc > 0.5) return { sig: "LONG", str: "STARK", time: "Intraday – 3 Tage", reason: "Starkes bullisches Sentiment wird vom steigenden Kurs bestätigt. News-Katalysator treibt Momentum. Einstieg bei aktuellem Kurs oder kleinem Rücksetzer.", backup: "✅ Kurs bestätigt", risk: "Mittel", hebel: c >= 60 ? "3x–5x" : "2x–3x", sl: `$${(p * 0.97).toFixed(2)} (−3%)`, tp: `$${(p * 1.06).toFixed(2)} (+6%)`, rrr: "1:2" };
    if (pc > -0.3) return { sig: "LONG", str: "MITTEL", time: "Swing 3–7 Tage", reason: "Bullisches Sentiment erkannt, Kurs reagiert noch nicht. Warte auf Kursbestätigung über dem aktuellen Widerstand. Einstieg erst bei Breakout.", backup: "⚠️ Warte auf Bestätigung", risk: "Mittel-Hoch", hebel: "2x–3x", sl: `$${(p * 0.96).toFixed(2)} (−4%)`, tp: `$${(p * 1.08).toFixed(2)} (+8%)`, rrr: "1:2" };
    return { sig: "LONG", str: "SCHWACH", time: "Swing 7–14 Tage", reason: "Sentiment positiv, aber Kurs fällt noch. Hohes Risiko eines Fehlsignals. Nur mit sehr engem Stop-Loss.", backup: "⚠️ Kurs dagegen", risk: "Hoch", hebel: "1x–2x", sl: `$${(p * 0.95).toFixed(2)} (−5%)`, tp: `$${(p * 1.10).toFixed(2)} (+10%)`, rrr: "1:2" };
  }
  if (s === "bearish" && c >= 30) {
    if (pc < -0.5) return { sig: "SHORT", str: "STARK", time: "Intraday – 3 Tage", reason: "Starkes bärisches Sentiment bestätigt durch fallenden Kurs. Klarer Abwärtstrend. Short bei aktuellem Kurs oder kleiner Erholung.", backup: "✅ Kurs bestätigt", risk: "Mittel", hebel: c >= 60 ? "3x–5x" : "2x–3x", sl: `$${(p * 1.03).toFixed(2)} (+3%)`, tp: `$${(p * 0.94).toFixed(2)} (−6%)`, rrr: "1:2" };
    if (pc < 0.3) return { sig: "SHORT", str: "MITTEL", time: "Swing 3–7 Tage", reason: "Bärisches Sentiment erkannt, Kurs noch stabil. Warte auf Breakdown unter Support. Short erst bei klarem Durchbruch.", backup: "⚠️ Warte auf Breakdown", risk: "Mittel-Hoch", hebel: "2x–3x", sl: `$${(p * 1.04).toFixed(2)} (+4%)`, tp: `$${(p * 0.92).toFixed(2)} (−8%)`, rrr: "1:2" };
    return { sig: "SHORT", str: "SCHWACH", time: "Swing 7–14 Tage", reason: "Sentiment negativ, aber Kurs steigt. Risiko eines Short Squeeze. Sehr vorsichtig agieren.", backup: "⚠️ Kurs dagegen", risk: "Hoch", hebel: "1x–2x", sl: `$${(p * 1.05).toFixed(2)} (+5%)`, tp: `$${(p * 0.90).toFixed(2)} (−10%)`, rrr: "1:2" };
  }
  return { sig: "WAIT", str: "—", time: "—", reason: "Kein eindeutiges Signal. Sentiment gemischt oder zu schwach. Finger weg — warte auf klare Richtung.", backup: "⛔ Kein Trade", risk: "—", hebel: "—", sl: "—", tp: "—", rrr: "—" };
}

function mkIndicators(s, c, pc, bw, ew) {
  return [
    { n: "News-Sentiment", v: s === "bullish" ? "Positiv" : s === "bearish" ? "Negativ" : "Neutral", c: s === "bullish" ? "#22c55e" : s === "bearish" ? "#ef4444" : "#94a3b8", d: `${bw.length} bullische vs ${ew.length} bärische Keywords erkannt` },
    { n: "Confidence", v: `${c}%`, c: c >= 60 ? "#22c55e" : c >= 35 ? "#f59e0b" : "#ef4444", d: c >= 60 ? "Hohe Sicherheit — starkes Signal" : c >= 35 ? "Mittlere Sicherheit — vorsichtig traden" : "Niedrig — besser abwarten" },
    { n: "Kurs-Momentum", v: `${pc >= 0 ? "+" : ""}${pc.toFixed(2)}%`, c: pc > 0.5 ? "#22c55e" : pc < -0.5 ? "#ef4444" : "#f59e0b", d: Math.abs(pc) > 1.5 ? "Sehr starke Bewegung" : Math.abs(pc) > 0.5 ? "Moderate Bewegung" : "Geringe Bewegung" },
    { n: "Trend-Alignment", v: (s === "bullish" && pc > 0) || (s === "bearish" && pc < 0) ? "Bestätigt ✓" : s === "neutral" ? "N/A" : "Divergenz ✗", c: (s === "bullish" && pc > 0) || (s === "bearish" && pc < 0) ? "#22c55e" : s === "neutral" ? "#94a3b8" : "#f59e0b", d: (s === "bullish" && pc > 0) || (s === "bearish" && pc < 0) ? "Kurs & Sentiment gleiche Richtung" : "Kurs & Sentiment widersprechen sich" },
  ];
}

function timeAgo(ts) {
  if (!ts) return "—";
  const sec = Math.floor(Date.now() / 1000 - ts);
  if (sec < 0) return "0s";
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

// ═══ COMPONENTS ═════════════════════════════════════════════════════

function Gauge({ value }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const color = pct >= 60 ? "#22c55e" : pct >= 35 ? "#f59e0b" : "#ef4444";
  const r = 36;
  const circ = 2 * Math.PI * r;
  const off = circ - (pct / 100) * circ * 0.75;
  return (
    <div style={{ position: "relative", width: 96, height: 62, margin: "0 auto" }}>
      <svg width="96" height="62" viewBox="0 0 96 62">
        <circle cx="48" cy="52" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" strokeDasharray={`${circ*0.75} ${circ*0.25}`} strokeLinecap="round" transform="rotate(135 48 52)"/>
        <circle cx="48" cy="52" r={r} fill="none" stroke={color} strokeWidth="6" strokeDasharray={`${circ*0.75} ${circ*0.25}`} strokeDashoffset={off} strokeLinecap="round" transform="rotate(135 48 52)" style={{transition:"stroke-dashoffset 0.8s ease"}}/>
      </svg>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, textAlign: "center" }}>
        <span style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "var(--m)" }}>{pct}%</span>
      </div>
    </div>
  );
}

function SigBadge({ sig, big }) {
  const m = { LONG: { bg: "#22c55e18", bd: "#22c55e50", c: "#22c55e", t: "▲ LONG" }, SHORT: { bg: "#ef444418", bd: "#ef444450", c: "#ef4444", t: "▼ SHORT" }, WAIT: { bg: "#ffffff08", bd: "#ffffff15", c: "#94a3b8", t: "● ABWARTEN" } };
  const x = m[sig] || m.WAIT;
  return <span style={{ padding: big ? "8px 20px" : "4px 12px", borderRadius: 8, background: x.bg, border: `1.5px solid ${x.bd}`, color: x.c, fontSize: big ? 18 : 14, fontWeight: 800, fontFamily: "var(--m)", display: "inline-block" }}>{x.t}</span>;
}

function QCard({ sym, q, fav, onClick, onRemove }) {
  const ch = (q && typeof q.dp === "number") ? q.dp : null;
  const up = ch !== null ? ch >= 0 : true;
  return (
    <div style={{ padding: "14px 18px", borderRadius: 12, cursor: "pointer", background: fav ? "#f59e0b08" : "#ffffff03", border: `1px solid ${fav ? "#f59e0b20" : "#ffffff08"}`, minWidth: 140, flexShrink: 0, position: "relative", transition: "all 0.15s" }}>
      {fav && onRemove && (
        <button onClick={e => { e.stopPropagation(); onRemove(sym); }} style={{ position: "absolute", top: 6, right: 8, background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 14, fontWeight: 700, padding: 0, lineHeight: 1 }}>×</button>
      )}
      <div onClick={() => onClick(sym)}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
          {fav && <span style={{ color: "#f59e0b", fontSize: 12 }}>★</span>}
          <span style={{ fontFamily: "var(--m)", fontSize: 15, fontWeight: 700, color: "#818cf8" }}>${sym}</span>
          {ch !== null && <span style={{ fontFamily: "var(--m)", fontSize: 12, fontWeight: 700, color: up ? "#22c55e" : "#ef4444", marginLeft: "auto" }}>{up ? "+" : ""}{ch.toFixed(2)}%</span>}
        </div>
        {q && typeof q.c === "number" ? (
          <>
            <div style={{ fontFamily: "var(--m)", fontSize: 20, fontWeight: 800, color: "#f1f5f9" }}>${q.c.toFixed(2)}</div>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <span style={{ fontSize: 11, color: "#64748b", fontFamily: "var(--m)" }}>H:{typeof q.h === "number" ? q.h.toFixed(2) : "—"}</span>
              <span style={{ fontSize: 11, color: "#64748b", fontFamily: "var(--m)" }}>L:{typeof q.l === "number" ? q.l.toFixed(2) : "—"}</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4, fontFamily: "var(--m)" }}>Laden...</div>
        )}
      </div>
    </div>
  );
}

function NewsItem({ item, quotes, isBreaking }) {
  const [open, setOpen] = useState(false);
  const tk = (item.ticker || "").split(",")[0].trim();
  const q = tk ? quotes[tk] : null;
  const pc = (q && typeof q.dp === "number") ? q.dp : 0;
  const price = (q && typeof q.c === "number") ? q.c : 0;
  const txt = (item.headline || "") + " " + (item.summary || "");
  const { s, c: conf, sc, bw, ew } = sent(txt);
  const sig = calcSignal(s, conf, pc, price);
  const inds = mkIndicators(s, conf, pc, bw, ew);
  const isNew = (Date.now() / 1000) - item.datetime < 600;

  return (
    <div style={{ borderBottom: "1px solid #ffffff06", position: "relative" }}>
      {isBreaking && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#ef4444", borderRadius: "0 3px 3px 0" }} />}
      {isNew && !isBreaking && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "#22c55e", borderRadius: "0 3px 3px 0" }} />}

      <div onClick={() => setOpen(!open)} style={{ padding: "18px 22px", cursor: "pointer", background: isBreaking ? "#ef44440a" : isNew ? "#22c55e06" : "transparent", transition: "background 0.15s" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              {isBreaking && <span style={{ fontSize: 12, fontWeight: 800, color: "#ef4444", fontFamily: "var(--m)", padding: "3px 10px", background: "#ef444415", borderRadius: 6, border: "1px solid #ef444430", animation: "pulse 2s infinite" }}>🔴 BREAKING</span>}
              {tk && <span style={{ fontFamily: "var(--m)", fontSize: 14, color: "#818cf8", fontWeight: 700, padding: "3px 10px", background: "#818cf815", borderRadius: 6 }}>${tk}</span>}
              <SigBadge sig={sig.sig} />
              <span style={{ fontSize: 11, color: item.apiSource === "newsfilter" ? "#818cf8" : "#f59e0b", fontFamily: "var(--m)", fontWeight: 700 }}>{item.apiSource === "newsfilter" ? "NEWSFILTER" : "FINNHUB"}</span>
            </div>
            <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, color: "#e2e8f0", fontWeight: 500 }}>{item.headline}</p>
          </div>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <span style={{ fontFamily: "var(--m)", fontSize: 13, color: isNew ? "#22c55e" : "#64748b", fontWeight: isNew ? 700 : 400 }}>{timeAgo(item.datetime)}</span>
            <span style={{ fontSize: 16, color: "#475569", transform: open ? "rotate(180deg)" : "", transition: "transform 0.2s" }}>⌄</span>
          </div>
        </div>
      </div>

      {/* ═══ EXPANDED TRADE ANALYSIS ═══ */}
      {open && (
        <div style={{ padding: "0 22px 22px", animation: "fadeIn 0.25s ease" }}>
          <div style={{ background: "#0f1320", border: "1px solid #ffffff0a", borderRadius: 16, padding: 24 }}>

            {/* Signal + Gauge */}
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontFamily: "var(--m)", marginBottom: 10, letterSpacing: 1.5 }}>TRADE-EMPFEHLUNG</div>
                <SigBadge sig={sig.sig} big />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16 }}>
                  {[
                    { l: "STÄRKE", v: sig.str, c: "#f1f5f9" },
                    { l: "ZEITRAUM", v: sig.time, c: "#f1f5f9" },
                    { l: "RISIKO", v: sig.risk, c: sig.risk === "Hoch" ? "#ef4444" : sig.risk === "Mittel-Hoch" ? "#f59e0b" : sig.risk === "Mittel" ? "#eab308" : "#94a3b8" },
                  ].map(x => (
                    <div key={x.l}>
                      <div style={{ fontSize: 11, color: "#64748b", fontFamily: "var(--m)", marginBottom: 3 }}>{x.l}</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: x.c, fontFamily: "var(--m)" }}>{x.v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: "center", minWidth: 120 }}>
                <div style={{ fontSize: 11, color: "#64748b", fontFamily: "var(--m)", marginBottom: 6, letterSpacing: 1.5 }}>CONFIDENCE</div>
                <Gauge value={conf} />
              </div>
            </div>

            {/* Hebel + Stop-Loss + Take-Profit */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
              {[
                { l: "HEBEL", v: sig.hebel, c: "#818cf8", icon: "⚡" },
                { l: "STOP-LOSS", v: sig.sl, c: "#ef4444", icon: "🛑" },
                { l: "TAKE-PROFIT", v: sig.tp, c: "#22c55e", icon: "🎯" },
                { l: "RISK/REWARD", v: sig.rrr, c: "#f59e0b", icon: "⚖️" },
              ].map(x => (
                <div key={x.l} style={{ padding: "14px 16px", borderRadius: 12, background: `${x.c}08`, border: `1px solid ${x.c}18` }}>
                  <div style={{ fontSize: 11, color: "#64748b", fontFamily: "var(--m)", marginBottom: 4 }}>{x.icon} {x.l}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: x.c, fontFamily: "var(--m)" }}>{x.v}</div>
                </div>
              ))}
            </div>

            {/* Begründung */}
            <div style={{ padding: "16px 20px", borderRadius: 12, marginBottom: 20, background: sig.sig === "LONG" ? "#22c55e08" : sig.sig === "SHORT" ? "#ef444408" : "#ffffff04", border: `1px solid ${sig.sig === "LONG" ? "#22c55e15" : sig.sig === "SHORT" ? "#ef444415" : "#ffffff08"}` }}>
              <div style={{ fontSize: 11, color: "#64748b", fontFamily: "var(--m)", marginBottom: 8, letterSpacing: 1.5 }}>BEGRÜNDUNG</div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.75, color: "#e2e8f0" }}>{sig.reason}</p>
            </div>

            {/* Backup Check */}
            <div style={{ padding: "12px 18px", borderRadius: 10, marginBottom: 20, fontSize: 15, fontWeight: 700, background: sig.backup.startsWith("✅") ? "#22c55e0a" : sig.backup.startsWith("⚠️") ? "#f59e0b08" : "#ef44440a", border: `1px solid ${sig.backup.startsWith("✅") ? "#22c55e20" : sig.backup.startsWith("⚠️") ? "#f59e0b18" : "#ef444418"}`, color: sig.backup.startsWith("✅") ? "#22c55e" : sig.backup.startsWith("⚠️") ? "#f59e0b" : "#ef4444" }}>
              BACKUP: {sig.backup}
            </div>

            {/* Indikatoren */}
            <div style={{ fontSize: 11, color: "#64748b", fontFamily: "var(--m)", marginBottom: 10, letterSpacing: 1.5 }}>INDIKATOREN</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
              {inds.map(i => (
                <div key={i.n} style={{ padding: "12px 16px", borderRadius: 10, background: "#ffffff03", border: "1px solid #ffffff06" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "#94a3b8", fontFamily: "var(--m)" }}>{i.n}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: i.c, fontFamily: "var(--m)" }}>{i.v}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{i.d}</div>
                </div>
              ))}
            </div>

            {/* Sentiment Bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 13, color: "#ef4444", fontFamily: "var(--m)", fontWeight: 700 }}>BEAR</span>
              <div style={{ flex: 1, height: 8, borderRadius: 4, background: "#ffffff08", overflow: "hidden" }}>
                <div style={{ width: `${sc}%`, height: "100%", borderRadius: 4, background: sc >= 60 ? "linear-gradient(90deg,#f59e0b,#22c55e)" : sc <= 40 ? "linear-gradient(90deg,#ef4444,#f59e0b)" : "#94a3b8", transition: "width 0.6s" }} />
              </div>
              <span style={{ fontSize: 13, color: "#22c55e", fontFamily: "var(--m)", fontWeight: 700 }}>BULL</span>
              <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "var(--m)", color: sc >= 60 ? "#22c55e" : sc <= 40 ? "#ef4444" : "#94a3b8", minWidth: 50, textAlign: "right" }}>{sc}/100</span>
            </div>

            {/* Keywords */}
            {(bw.length > 0 || ew.length > 0) && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
                {bw.map(w => <span key={`b-${w}`} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, background: "#22c55e10", color: "#22c55e", fontFamily: "var(--m)" }}>+{w}</span>)}
                {ew.map(w => <span key={`e-${w}`} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 6, background: "#ef444410", color: "#ef4444", fontFamily: "var(--m)" }}>−{w}</span>)}
              </div>
            )}

            {item.summary && <p style={{ margin: "0 0 12px", fontSize: 14, color: "#94a3b8", lineHeight: 1.7 }}>{item.summary.slice(0, 300)}{item.summary.length > 300 ? "..." : ""}</p>}
            {item.url && item.url !== "#" && <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 14, color: "#818cf8", textDecoration: "none", fontFamily: "var(--m)", fontWeight: 600 }}>Artikel lesen →</a>}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ MAIN APP ═══════════════════════════════════════════════════════
export default function App() {
  const [news, setNews] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [favs, setFavs] = useState(["NVDA", "TSLA", "AAPL"]);
  const [favIn, setFavIn] = useState("");
  const [search, setSearch] = useState("");
  const [sentF, setSentF] = useState("all");
  const [sigF, setSigF] = useState("all");
  const [cat, setCat] = useState("all");
  const [highOnly, setHighOnly] = useState(false);
  const [activeT, setActiveT] = useState("");
  const [api, setApi] = useState({ fh: false, nf: false });
  const [last, setLast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errs, setErrs] = useState([]);
  const [snd, setSnd] = useState(true);

  const qR = useRef(quotes);
  const fR = useRef(favs);
  const ncR = useRef(0);
  const sR = useRef(snd);

  useEffect(() => { qR.current = quotes; }, [quotes]);
  useEffect(() => { fR.current = favs; }, [favs]);
  useEffect(() => { sR.current = snd; }, [snd]);

  const allTickers = useCallback(() => {
    const base = [...fR.current];
    if (cat === "crypto") return [...base, ...CRYPTO_TICKERS.filter(t => !base.includes(t))];
    if (cat === "etf") return [...base, ...ETF_TICKERS.filter(t => !base.includes(t))];
    return base;
  }, [cat]);

  const fetchFH = useCallback(async () => {
    if (!FK) return { r: [], e: [], ok: false };
    const r = []; const e = [];
    try {
      const res = await fetch(`${FH}/news?category=general&token=${FK}`);
      if (!res.ok) throw new Error(`Finnhub ${res.status}`);
      const d = await res.json();
      if (Array.isArray(d)) d.slice(0, 35).forEach(i => r.push({ id: `fh-${i.id||i.datetime}`, headline: i.headline||"", summary: i.summary||"", source: i.source||"", apiSource: "finnhub", url: i.url||"", datetime: i.datetime||0, ticker: i.related||"" }));
    } catch (x) { e.push(`Finnhub: ${x.message}`); }
    const today = new Date().toISOString().split("T")[0];
    const week = new Date(Date.now()-7*864e5).toISOString().split("T")[0];
    const tks = fR.current.slice(0, 4);
    for (const sym of tks) {
      try {
        const res = await fetch(`${FH}/company-news?symbol=${sym}&from=${week}&to=${today}&token=${FK}`);
        if (res.ok) { const d = await res.json(); if (Array.isArray(d)) d.slice(0,5).forEach(i => r.push({ id: `fc-${i.id||i.datetime}-${sym}`, headline: i.headline||"", summary: i.summary||"", source: i.source||"", apiSource: "finnhub", url: i.url||"", datetime: i.datetime||0, ticker: sym })); }
      } catch(x){}
    }
    return { r, e, ok: r.length > 0 };
  }, []);

  const fetchNF = useCallback(async () => {
    if (!NFK) return { r: [], e: [], ok: false };
    const r = []; const e = [];
    try {
      const res = await fetch(NF, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${NFK}` }, body: JSON.stringify({ type: "filterArticles", queryString: "*", from: 0, size: 25 }) });
      if (!res.ok) throw new Error(`Newsfilter ${res.status}`);
      const d = await res.json();
      const a = d.articles || d || [];
      if (Array.isArray(a)) a.forEach(i => { const ts = i.publishedAt ? new Date(i.publishedAt).getTime()/1000 : 0; r.push({ id: `nf-${i.id||ts}`, headline: i.title||i.headline||"", summary: i.description||i.summary||"", source: (i.source&&i.source.name)?i.source.name:"Newsfilter", apiSource: "newsfilter", url: i.url||"", datetime: ts, ticker: Array.isArray(i.symbols)?i.symbols.join(","):(i.symbols||"") }); });
    } catch(x) { e.push(`Newsfilter: ${x.message}`); }
    return { r, e, ok: r.length > 0 };
  }, []);

  const fetchAll = useCallback(async () => {
    const [fh, nf] = await Promise.all([fetchFH(), fetchNF()]);
    const all = [...fh.r, ...nf.r];
    const seen = new Set();
    const uniq = all.filter(i => { if (!i.headline) return false; const k = i.headline.toLowerCase().slice(0,50); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a,b) => (b.datetime||0)-(a.datetime||0)).slice(0,80);
    if (ncR.current > 0 && uniq.length > ncR.current && sR.current) {
      try { const ctx = new (window.AudioContext||window.webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value=880; o.type="sine"; g.gain.setValueAtTime(0.1,ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.2); o.start(ctx.currentTime); o.stop(ctx.currentTime+0.2); } catch(e){}
    }
    ncR.current = uniq.length;
    setNews(uniq); setApi({ fh: fh.ok, nf: nf.ok }); setErrs([...fh.e,...nf.e]); setLast(Date.now()); setLoading(false);
  }, [fetchFH, fetchNF]);

  const fetchQ = useCallback(async () => {
    if (!FK) return;
    const tks = [...new Set(fR.current)];
    const prev = qR.current;
    const upd = { ...prev };
    for (const sym of tks) {
      try { const res = await fetch(`${FH}/quote?symbol=${sym}&token=${FK}`); if (res.ok) { const d = await res.json(); if (d && typeof d.c === "number" && d.c > 0) upd[sym] = d; } } catch(e){}
    }
    setQuotes(upd);
  }, []);

  useEffect(() => { fetchAll(); fetchQ(); const t1 = setInterval(fetchAll, 60000); const t2 = setInterval(fetchQ, 20000); return () => { clearInterval(t1); clearInterval(t2); }; }, [fetchAll, fetchQ]);

  // Filter
  const filtered = news.filter(item => {
    const txt = (item.headline||"")+" "+(item.summary||"");
    const { s: se, c: co } = sent(txt);
    const tk = (item.ticker||"").split(",")[0].trim();
    const pc = (quotes[tk]&&typeof quotes[tk].dp==="number")?quotes[tk].dp:0;
    const sg = calcSignal(se, co, pc, 0);
    if (sentF !== "all" && se !== sentF) return false;
    if (sigF !== "all" && sg.sig !== sigF) return false;
    if (highOnly && co < 50) return false;
    if (activeT && tk !== activeT && !(item.headline||"").toUpperCase().includes(activeT)) return false;
    if (search) { const q = search.toLowerCase(); if (!(item.headline+" "+(item.ticker||"")).toLowerCase().includes(q)) return false; }
    return true;
  });

  const breaking = filtered.filter(i => (Date.now()/1000) - i.datetime < 300);
  const counts = { LONG: 0, SHORT: 0, WAIT: 0 };
  news.slice(0,25).forEach(i => { const { s: se, c: co } = sent((i.headline||"")+" "+(i.summary||"")); const tk = (i.ticker||"").split(",")[0].trim(); counts[calcSignal(se,co,(quotes[tk]&&typeof quotes[tk].dp==="number")?quotes[tk].dp:0,0).sig]++; });
  const addFav = () => { const t = favIn.toUpperCase().trim(); if (t && !favs.includes(t)) setFavs(p => [...p, t]); setFavIn(""); };
  const anyOn = api.fh || api.nf;

  return (
    <div style={{ minHeight: "100vh", background: "#080c15", color: "#e2e8f0", fontFamily: "'Outfit', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap');
        :root{--m:'JetBrains Mono',monospace}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.15}}
        @keyframes scan{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px}
        ::-webkit-scrollbar-thumb{background:#ffffff0a;border-radius:3px}
        .btn{background:#ffffff05;border:1px solid #ffffff0a;color:#94a3b8;padding:8px 16px;border-radius:8px;font-size:14px;cursor:pointer;transition:all .12s;font-family:var(--m);white-space:nowrap}
        .btn:hover{background:#ffffff0a;color:#e2e8f0}
        .btn.on{background:#818cf818;border-color:#818cf835;color:#818cf8}
        .inp{width:100%;padding:10px 14px;background:#ffffff05;border:1px solid #ffffff0a;border-radius:10px;color:#f1f5f9;font-size:15px;outline:none;font-family:var(--m)}
        .inp:focus{border-color:#818cf840}
      `}</style>

      {/* ═══ HEADER ═══ */}
      <header style={{ padding: "16px 24px", borderBottom: "1px solid #ffffff06", background: "linear-gradient(180deg,#818cf805,transparent)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg,#818cf8,#6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚡</div>
            <h1 style={{ margin: 0, fontSize: 22, fontFamily: "var(--m)", color: "#f1f5f9" }}>SIGNAL<span style={{ color: "#818cf8" }}>FLOW</span> <span style={{ fontSize: 12, color: "#22c55e" }}>v5</span></h1>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {[{ n: "Finnhub", on: api.fh, c: "#f59e0b" }, { n: "Newsfilter", on: api.nf, c: "#818cf8" }].map(a => (
              <div key={a.n} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, background: a.on ? `${a.c}10` : "#ef44440a", border: `1px solid ${a.on ? a.c+"25" : "#ef444420"}` }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.on ? a.c : "#ef4444", animation: a.on ? "blink 2s infinite" : "none" }}/>
                <span style={{ fontSize: 12, color: a.on ? a.c : "#ef4444", fontFamily: "var(--m)" }}>{a.n}</span>
              </div>
            ))}
            <span style={{ fontSize: 12, color: "#64748b", fontFamily: "var(--m)" }}>{news.length} News{last ? ` • ${new Date(last).toLocaleTimeString("de-DE")}` : ""}</span>
            <button className="btn" onClick={() => setSnd(!snd)}>{snd ? "🔊" : "🔇"}</button>
            <button className="btn" onClick={() => { setLoading(true); fetchAll(); fetchQ(); }} style={{ color: "#818cf8" }}>🔄</button>
          </div>
        </div>
      </header>

      {errs.length > 0 && !anyOn && (
        <div style={{ margin: "12px 24px", padding: "14px 18px", background: "#ef44440a", border: "1px solid #ef444418", borderRadius: 12 }}>
          {errs.map((e,i) => <div key={i} style={{ color: "#ef4444", fontSize: 14, fontFamily: "var(--m)" }}>⚠️ {e}</div>)}
        </div>
      )}

      {/* ═══ FAVORITEN BAR ═══ */}
      <div style={{ padding: "14px 24px", borderBottom: "1px solid #ffffff06" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: "#f59e0b", fontFamily: "var(--m)", letterSpacing: 1.5, fontWeight: 700 }}>★ FAVORITEN</span>
          <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
            <input type="text" placeholder="+ Ticker" value={favIn} onChange={e => setFavIn(e.target.value)} onKeyDown={e => e.key === "Enter" && addFav()}
              style={{ padding: "6px 10px", background: "#ffffff05", border: "1px solid #f59e0b20", borderRadius: 8, color: "#f1f5f9", fontSize: 13, outline: "none", fontFamily: "var(--m)", width: 100 }}/>
            <button onClick={addFav} style={{ background: "#f59e0b15", border: "1px solid #f59e0b30", color: "#f59e0b", borderRadius: 8, padding: "0 14px", cursor: "pointer", fontSize: 15, fontWeight: 700 }}>+</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
          {favs.map(sym => <QCard key={sym} sym={sym} q={quotes[sym]} fav onClick={s => { setActiveT(activeT === s ? "" : s); setSearch(""); }} onRemove={s => setFavs(p => p.filter(x => x !== s))} />)}
        </div>
      </div>

      {/* ═══ CATEGORY TABS ═══ */}
      <div style={{ padding: "10px 24px", borderBottom: "1px solid #ffffff06", display: "flex", gap: 6, overflowX: "auto" }}>
        {CATS.map(c => (
          <button key={c.id} className={`btn ${cat === c.id ? "on" : ""}`} onClick={() => { setCat(c.id); setActiveT(""); }} style={{ fontSize: 14, padding: "8px 18px" }}>
            {c.label}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", minHeight: "calc(100vh - 240px)" }}>
        {/* ═══ SIDEBAR ═══ */}
        <aside style={{ width: 260, borderRight: "1px solid #ffffff06", padding: 16, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto" }}>
          <div>
            <div style={{ fontSize: 12, color: "#64748b", fontFamily: "var(--m)", marginBottom: 6, letterSpacing: 1.5 }}>SUCHE</div>
            <input className="inp" type="text" placeholder="Ticker / Keyword..." value={search} onChange={e => { setSearch(e.target.value); setActiveT(""); }}/>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#64748b", fontFamily: "var(--m)", marginBottom: 8, letterSpacing: 1.5 }}>SIGNAL</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[["all","◉ Alle"],["LONG","▲ LONG"],["SHORT","▼ SHORT"],["WAIT","● WAIT"]].map(([k,l]) => (
                <button key={k} className={`btn ${sigF===k?"on":""}`} onClick={() => setSigF(k)} style={{ textAlign: "left" }}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#64748b", fontFamily: "var(--m)", marginBottom: 8, letterSpacing: 1.5 }}>SENTIMENT</div>
            <div style={{ display: "flex", gap: 4 }}>
              {[["all","Alle"],["bullish","▲ Bull"],["bearish","▼ Bear"]].map(([k,l]) => (
                <button key={k} className={`btn ${sentF===k?"on":""}`} onClick={() => setSentF(k)} style={{ flex: 1, textAlign: "center" }}>{l}</button>
              ))}
            </div>
          </div>
          <button className={`btn ${highOnly?"on":""}`} onClick={() => setHighOnly(!highOnly)} style={{ width: "100%", textAlign: "center", ...(highOnly ? { background: "#f59e0b10", borderColor: "#f59e0b30", color: "#f59e0b" } : {}) }}>🎯 Hohe Confidence</button>

          <div style={{ padding: 14, background: "#ffffff03", borderRadius: 12, border: "1px solid #ffffff06" }}>
            <div style={{ fontSize: 12, color: "#64748b", fontFamily: "var(--m)", marginBottom: 10, letterSpacing: 1.5 }}>SIGNALE (Top 25)</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              {[["LONG","#22c55e",counts.LONG],["SHORT","#ef4444",counts.SHORT],["WAIT","#94a3b8",counts.WAIT]].map(([l,c,v]) => (
                <div key={l} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: c, fontFamily: "var(--m)" }}>{v}</div>
                  <div style={{ fontSize: 11, color: c, fontWeight: 700 }}>{l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Twitter */}
          <div style={{ padding: 14, background: "#1da1f205", borderRadius: 12, border: "1px solid #1da1f212" }}>
            <div style={{ fontSize: 12, color: "#1da1f2", fontFamily: "var(--m)", marginBottom: 10, letterSpacing: 1.5, fontWeight: 700 }}>𝕏 TWITTER</div>
            {TWITTER.map(a => (
              <a key={a.h} href={`https://x.com/${a.h}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", textDecoration: "none", borderBottom: "1px solid #ffffff04" }}>
                <span style={{ fontSize: 13, color: "#1da1f2", fontFamily: "var(--m)" }}>@{a.h}</span>
                <span style={{ fontSize: 11, color: "#64748b" }}>{a.d}</span>
              </a>
            ))}
          </div>
        </aside>

        {/* ═══ MAIN FEED ═══ */}
        <main style={{ flex: 1, padding: "16px 22px", overflowY: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300 }}>
              <div style={{ width: 36, height: 36, border: "3px solid #818cf820", borderTopColor: "#818cf8", borderRadius: "50%", animation: "spin 1s linear infinite", marginBottom: 16 }}/>
              <span style={{ color: "#818cf8", fontFamily: "var(--m)", fontSize: 15 }}>Laden...</span>
            </div>
          ) : (
            <>
              {activeT && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 16px", background: "#818cf810", borderRadius: 10, border: "1px solid #818cf820" }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: "#818cf8", fontFamily: "var(--m)" }}>Zeige News für ${activeT}</span>
                  <button onClick={() => setActiveT("")} style={{ marginLeft: "auto", background: "none", border: "1px solid #818cf830", color: "#818cf8", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 13, fontFamily: "var(--m)" }}>✕ Alle zeigen</button>
                </div>
              )}

              {/* Breaking News */}
              {breaking.length > 0 && !activeT && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: "#ef4444", fontFamily: "var(--m)", marginBottom: 8, letterSpacing: 1.5, fontWeight: 700, animation: "pulse 2s infinite" }}>🔴 BREAKING NEWS</div>
                  <div style={{ border: "1px solid #ef444420", borderRadius: 12, overflow: "hidden", background: "#ef44440a" }}>
                    {breaking.slice(0,3).map(item => <NewsItem key={`br-${item.id}`} item={item} quotes={quotes} isBreaking />)}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#64748b", fontFamily: "var(--m)", letterSpacing: 1 }}>LIVE FEED — {filtered.length} NEWS</span>
                <div style={{ position: "relative", overflow: "hidden", padding: "5px 14px", borderRadius: 8, background: "#22c55e08", border: "1px solid #22c55e15" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg,transparent,#22c55e08,transparent)", animation: "scan 3s linear infinite" }}/>
                  <span style={{ fontFamily: "var(--m)", fontSize: 12, color: "#22c55e", position: "relative" }}>● LIVE</span>
                </div>
              </div>

              <div style={{ border: "1px solid #ffffff06", borderRadius: 14, overflow: "hidden", background: "#ffffff02" }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: 50, textAlign: "center" }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
                    <p style={{ fontFamily: "var(--m)", fontSize: 15, color: "#64748b" }}>{!anyOn ? "Keine API verbunden" : "Keine News gefunden"}</p>
                  </div>
                ) : (
                  filtered.filter(i => !breaking.includes(i) || activeT).map(item => <NewsItem key={item.id} item={item} quotes={quotes} isBreaking={false} />)
                )}
              </div>

              <div style={{ marginTop: 14, textAlign: "center", fontSize: 13, color: "#475569", fontFamily: "var(--m)" }}>
                Klicke auf News → Hebel, Stop-Loss, Take-Profit, Indikatoren & Begründung
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
