import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const FK = import.meta.env.VITE_FINNHUB_KEY || "";
const NFK = import.meta.env.VITE_NEWSFILTER_KEY || "";
const FH = "https://finnhub.io/api/v1";
const NFU = "https://api.newsfilter.io/public/actions";

const CATS = [
  { id: "all", label: "Alle" },
  { id: "tech", label: "Tech" },
  { id: "oil", label: "Öl & Energie" },
  { id: "us", label: "US-Markt" },
  { id: "de", label: "DE-Markt" },
  { id: "market", label: "Gesamtmarkt" },
];

const TECH_KW=["apple","google","microsoft","amazon","meta","nvidia","amd","intel","tesla","semiconductor","chip","ai ","artificial intelligence","software","cloud","saas","tech","cyber","data center"];
const OIL_KW=["oil","crude","opec","energy","petroleum","natural gas","exxon","chevron","shell","bp ","drilling","pipeline","refinery","barrel","brent","wti"];
const US_KW=["wall street","s&p","nasdaq","dow jones","nyse","fed ","federal reserve","us economy","treasury","congress","senate","white house"];
const DE_KW=["dax","germany","german","deutsche","siemens","volkswagen","bmw","sap ","basf","allianz","bayer","adidas","infineon","europe","ecb","bundesbank","frankfurt"];
const MKT_KW=["market","index","stocks","equities","bonds","yield","inflation","gdp","employment","recession","rate hike","rate cut","monetary","global economy"];

const TICKER_MAP=[
  {kw:["apple","iphone","ipad"],t:["AAPL"]},{kw:["google","alphabet","youtube"],t:["GOOGL"]},
  {kw:["microsoft","windows","azure","xbox"],t:["MSFT"]},{kw:["amazon","aws","prime"],t:["AMZN"]},
  {kw:["meta","facebook","instagram","whatsapp"],t:["META"]},{kw:["nvidia","gpu ","geforce","rtx ","cuda"],t:["NVDA"]},
  {kw:["amd","radeon","ryzen"],t:["AMD"]},{kw:["tesla","electric vehicle","ev ","cybertruck","fsd "],t:["TSLA"]},
  {kw:["intel","core i","xeon"],t:["INTC"]},{kw:["semiconductor","chip","chipmaker"],t:["NVDA","AMD","INTC","TSM"]},
  {kw:["ai ","artificial intelligence","machine learning","chatgpt","openai"],t:["NVDA","MSFT","GOOGL"]},
  {kw:["cloud","cloud computing"],t:["MSFT","AMZN","GOOGL"]},
  {kw:["oil","crude","petroleum","barrel"],t:["XOM","CVX","COP"]},{kw:["opec","production cut"],t:["XLE","XOM"]},
  {kw:["natural gas","lng "],t:["LNG","XOM"]},{kw:["energy","renewable","solar"],t:["XLE","ENPH"]},
  {kw:["s&p","s&p 500","index fund"],t:["SPY"]},{kw:["nasdaq","tech index"],t:["QQQ"]},
  {kw:["gold","precious metal"],t:["GLD","NEM"]},{kw:["bitcoin","btc","crypto","blockchain"],t:["BTC","MSTR","COIN"]},
  {kw:["bank","banking","interest rate"],t:["JPM","BAC","GS"]},{kw:["pharma","drug","fda","biotech"],t:["JNJ","PFE","LLY"]},
  {kw:["dax","german stock"],t:["DAX","SAP"]},{kw:["volkswagen","vw "],t:["VOW3.DE"]},
  {kw:["defense","military","pentagon","nato"],t:["LMT","RTX","NOC"]},
  {kw:["airline","flight","boeing"],t:["BA","UAL","DAL"]},{kw:["retail","walmart","target"],t:["WMT","TGT"]},
  {kw:["streaming","netflix","disney"],t:["NFLX","DIS"]},
];

function suggestTickers(text){if(!text)return[];const lo=text.toLowerCase();const f=new Set();TICKER_MAP.forEach(e=>{e.kw.forEach(k=>{if(lo.includes(k))e.t.forEach(t=>f.add(t));});});return[...f].slice(0,4);}
function detectCat(text){if(!text)return"all";const lo=text.toLowerCase();if(TECH_KW.some(k=>lo.includes(k)))return"tech";if(OIL_KW.some(k=>lo.includes(k)))return"oil";if(DE_KW.some(k=>lo.includes(k)))return"de";if(US_KW.some(k=>lo.includes(k)))return"us";if(MKT_KW.some(k=>lo.includes(k)))return"market";return"all";}

const BW=["beats","surpass","record high","upgrade","buy","outperform","raise","growth","surge","rally","soar","boom","breakout","bullish","strong","exceed","profit","positive","innovative","expansion","partnership","approved","launches","wins","acquires","deal","contract","revenue up","earnings beat","all-time high","momentum","recovery","rebound","dividend","buyback","upside","guidance raised","price target raised","new high","strong demand","record revenue","breakthrough","beat expectations"];
const EW=["miss","downgrade","sell","underperform","cut","decline","crash","plunge","drop","fall","bearish","weak","loss","negative","layoff","lawsuit","fine","recall","bankruptcy","default","debt","warning","risk","concern","fraud","investigation","subpoena","SEC","penalty","closure","shutdown","slowdown","recession","inflation","tariff","ban","reject","delay","fail","downturn","guidance cut","price target cut","disappointing","worse than","weak demand","margin pressure"];

function sent(text){if(!text)return{s:"neutral",c:0,sc:50,bw:[],ew:[]};const lo=text.toLowerCase();const b=BW.filter(w=>lo.includes(w));const e=EW.filter(w=>lo.includes(w));const t=b.length+e.length;if(t===0)return{s:"neutral",c:0,sc:50,bw:[],ew:[]};const sc=Math.round((b.length/t)*100);const c=Math.min(t*18,100);if(sc>=58)return{s:"bullish",c,sc,bw:b,ew:e};if(sc<=42)return{s:"bearish",c,sc,bw:b,ew:e};return{s:"neutral",c:Math.max(c-20,0),sc:50,bw:b,ew:e};}

function calcSig(s,c,pc,price){
  const p=price||100;
  if(s==="bullish"&&c>=30){
    if(pc>0.5)return{sig:"LONG",str:"STARK",time:"Intraday – 3 Tage",reason:"Starkes bullisches Sentiment + steigender Kurs. News-Katalysator treibt Momentum.",backup:"✅ Kurs bestätigt",risk:"Mittel",hebel:c>=60?"3–5x":"2–3x",sl:`$${(p*0.97).toFixed(2)} (−3%)`,tp:`$${(p*1.06).toFixed(2)} (+6%)`,rrr:"1:2"};
    if(pc>-0.3)return{sig:"LONG",str:"MITTEL",time:"Swing 3–7 Tage",reason:"Bullisches Sentiment erkannt, Kurs neutral. Warte auf Bestätigung.",backup:"⚠️ Bestätigung abwarten",risk:"Mittel-Hoch",hebel:"2–3x",sl:`$${(p*0.96).toFixed(2)} (−4%)`,tp:`$${(p*1.08).toFixed(2)} (+8%)`,rrr:"1:2"};
    return{sig:"LONG",str:"SCHWACH",time:"Swing 7–14 Tage",reason:"Sentiment positiv, Kurs dagegen. Nur mit engem SL.",backup:"⚠️ Kurs dagegen",risk:"Hoch",hebel:"1–2x",sl:`$${(p*0.95).toFixed(2)} (−5%)`,tp:`$${(p*1.10).toFixed(2)} (+10%)`,rrr:"1:2"};
  }
  if(s==="bearish"&&c>=30){
    if(pc<-0.5)return{sig:"SHORT",str:"STARK",time:"Intraday – 3 Tage",reason:"Starkes bärisches Sentiment + fallender Kurs. Klarer Abwärtstrend.",backup:"✅ Kurs bestätigt",risk:"Mittel",hebel:c>=60?"3–5x":"2–3x",sl:`$${(p*1.03).toFixed(2)} (+3%)`,tp:`$${(p*0.94).toFixed(2)} (−6%)`,rrr:"1:2"};
    if(pc<0.3)return{sig:"SHORT",str:"MITTEL",time:"Swing 3–7 Tage",reason:"Bärisches Sentiment, Kurs stabil. Short bei Breakdown.",backup:"⚠️ Warte auf Breakdown",risk:"Mittel-Hoch",hebel:"2–3x",sl:`$${(p*1.04).toFixed(2)} (+4%)`,tp:`$${(p*0.92).toFixed(2)} (−8%)`,rrr:"1:2"};
    return{sig:"SHORT",str:"SCHWACH",time:"Swing 7–14 Tage",reason:"Sentiment negativ, Kurs steigt. Short-Squeeze Risiko.",backup:"⚠️ Kurs dagegen",risk:"Hoch",hebel:"1–2x",sl:`$${(p*1.05).toFixed(2)} (+5%)`,tp:`$${(p*0.90).toFixed(2)} (−10%)`,rrr:"1:2"};
  }
  return{sig:"WAIT",str:"—",time:"—",reason:"Kein klares Signal. Abwarten.",backup:"⛔ Kein Trade",risk:"—",hebel:"—",sl:"—",tp:"—",rrr:"—"};
}

function mkInd(s,c,pc,bw,ew){return[
  {n:"News-Sentiment",v:s==="bullish"?"Positiv":s==="bearish"?"Negativ":"Neutral",c:s==="bullish"?"#34d399":s==="bearish"?"#f87171":"#94a3b8",d:`${bw.length} bull vs ${ew.length} bear Keywords`},
  {n:"Confidence",v:`${c}%`,c:c>=60?"#34d399":c>=35?"#fbbf24":"#f87171",d:c>=60?"Stark":c>=35?"Mittel":"Schwach"},
  {n:"Momentum",v:`${pc>=0?"+":""}${pc.toFixed(2)}%`,c:pc>0.5?"#34d399":pc<-0.5?"#f87171":"#fbbf24",d:Math.abs(pc)>1?"Stark":Math.abs(pc)>0.3?"Moderat":"Gering"},
  {n:"Alignment",v:(s==="bullish"&&pc>0)||(s==="bearish"&&pc<0)?"Bestätigt":s==="neutral"?"—":"Divergenz",c:(s==="bullish"&&pc>0)||(s==="bearish"&&pc<0)?"#34d399":s==="neutral"?"#94a3b8":"#fbbf24",d:(s==="bullish"&&pc>0)||(s==="bearish"&&pc<0)?"Kurs = Sentiment":"Kurs ≠ Sentiment"},
];}

function timeAgo(ts){if(!ts)return"—";const s=Math.floor(Date.now()/1000-ts);if(s<0)return"0s";if(s<60)return`${s}s`;if(s<3600)return`${Math.floor(s/60)}m`;if(s<86400)return`${Math.floor(s/3600)}h`;return`${Math.floor(s/86400)}d`;}

const TW=[{h:"DeItaone",d:"Breaking News"},{h:"unusual_whales",d:"Options Flow"},{h:"zerohedge",d:"Makro"},{h:"FirstSquawk",d:"Echtzeit"},{h:"Fxhedgers",d:"Forex"},{h:"disclosetv",d:"Geopolitik"},{h:"StockMKTNewz",d:"US-Markt"}];

// ═══ GAUGE ══════════════════════════════════════════════════════════
function Gauge({value}){
  const p=Math.min(Math.max(value,0),100);
  const col=p>=60?"#34d399":p>=35?"#fbbf24":"#f87171";
  const r=34,circ=2*Math.PI*r,off=circ-(p/100)*circ*0.75;
  return(
    <div style={{position:"relative",width:90,height:58}}>
      <svg width="90" height="58" viewBox="0 0 90 58">
        <circle cx="45" cy="48" r={r} fill="none" stroke="#1e293b" strokeWidth="5" strokeDasharray={`${circ*0.75} ${circ*0.25}`} strokeLinecap="round" transform="rotate(135 45 48)"/>
        <circle cx="45" cy="48" r={r} fill="none" stroke={col} strokeWidth="5" strokeDasharray={`${circ*0.75} ${circ*0.25}`} strokeDashoffset={off} strokeLinecap="round" transform="rotate(135 45 48)" style={{transition:"stroke-dashoffset 0.8s"}}/>
      </svg>
      <div style={{position:"absolute",bottom:0,left:0,right:0,textAlign:"center"}}>
        <span style={{fontSize:18,fontWeight:700,color:col,fontFamily:"var(--m)"}}>{p}%</span>
      </div>
    </div>
  );
}

// ═══ SIGNAL BADGE ═══════════════════════════════════════════════════
function SB({sig,lg}){
  const m={LONG:{bg:"#05261a",bd:"#34d39940",c:"#34d399",t:"▲ LONG"},SHORT:{bg:"#26080e",bd:"#f8717140",c:"#f87171",t:"▼ SHORT"},WAIT:{bg:"#1a1a2e",bd:"#94a3b830",c:"#94a3b8",t:"● ABWARTEN"}};
  const x=m[sig]||m.WAIT;
  return <span style={{padding:lg?"7px 18px":"4px 12px",borderRadius:6,background:x.bg,border:`1px solid ${x.bd}`,color:x.c,fontSize:lg?16:13,fontWeight:700,fontFamily:"var(--m)",display:"inline-block",letterSpacing:"0.3px"}}>{x.t}</span>;
}

// ═══ FAVORITE STAR (klickbar in News) ═══════════════════════════════
function FavStar({ticker,isFav,onToggle}){
  return(
    <button onClick={e=>{e.stopPropagation();onToggle(ticker);}} title={isFav?`${ticker} aus Favoriten entfernen`:`${ticker} zu Favoriten hinzufügen`}
      style={{background:"none",border:"none",cursor:"pointer",fontSize:16,padding:"2px 4px",color:isFav?"#fbbf24":"#334155",transition:"all 0.15s",lineHeight:1}}>
      {isFav?"★":"☆"}
    </button>
  );
}

// ═══ QUOTE MINI CARD ════════════════════════════════════════════════
function QMini({sym,q,onRemove,onClick}){
  const ch=(q&&typeof q.dp==="number")?q.dp:null;
  const up=ch!==null?ch>=0:true;
  return(
    <div onClick={()=>onClick(sym)} style={{padding:"10px 14px",borderRadius:10,cursor:"pointer",background:"#0f172a",border:"1px solid #1e293b",minWidth:120,flexShrink:0,position:"relative",transition:"border-color 0.15s"}}>
      <button onClick={e=>{e.stopPropagation();onRemove(sym);}} style={{position:"absolute",top:4,right:6,background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:13,padding:0,lineHeight:1}}>×</button>
      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:4}}>
        <span style={{color:"#fbbf24",fontSize:11}}>★</span>
        <span style={{fontFamily:"var(--m)",fontSize:13,fontWeight:700,color:"#a5b4fc"}}>{sym}</span>
        {ch!==null&&<span style={{fontFamily:"var(--m)",fontSize:11,fontWeight:700,color:up?"#34d399":"#f87171",marginLeft:"auto"}}>{up?"+":""}{ch.toFixed(2)}%</span>}
      </div>
      {q&&typeof q.c==="number"?<div style={{fontFamily:"var(--m)",fontSize:17,fontWeight:700,color:"#f1f5f9"}}>${q.c.toFixed(2)}</div>:<div style={{fontSize:12,color:"#475569",fontFamily:"var(--m)"}}>—</div>}
    </div>
  );
}

// ═══ COMBINED CARD (Hauptempfehlung pro Aktie) ══════════════════════
function ComboCard({ticker,items,quotes,isFav,onToggleFav}){
  const[open,setOpen]=useState(false);
  const q=quotes[ticker];
  const pc=(q&&typeof q.dp==="number")?q.dp:0;
  const price=(q&&typeof q.c==="number")?q.c:0;
  let tBull=0,tBear=0,aBW=[],aEW=[];
  items.forEach(item=>{const{bw,ew}=sent((item.headline||"")+" "+(item.summary||""));tBull+=bw.length;tBear+=ew.length;bw.forEach(w=>{if(!aBW.includes(w))aBW.push(w);});ew.forEach(w=>{if(!aEW.includes(w))aEW.push(w);});});
  const total=tBull+tBear;const cSc=total>0?Math.round((tBull/total)*100):50;
  const cSent=cSc>=58?"bullish":cSc<=42?"bearish":"neutral";const cConf=Math.min(total*12,100);
  const sig=calcSig(cSent,cConf,pc,price);const inds=mkInd(cSent,cConf,pc,aBW,aEW);

  return(
    <div style={{borderRadius:12,marginBottom:10,overflow:"hidden",background:"#0c1222",border:`1px solid ${open?"#1e293b":"#151d2e"}`,transition:"border-color 0.2s"}}>
      <div onClick={()=>setOpen(!open)} style={{padding:"16px 20px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
        <FavStar ticker={ticker} isFav={isFav} onToggle={onToggleFav}/>
        <span style={{fontFamily:"var(--m)",fontSize:17,fontWeight:700,color:"#a5b4fc"}}>{ticker}</span>
        {price>0&&<span style={{fontFamily:"var(--m)",fontSize:15,fontWeight:600,color:"#e2e8f0"}}>${price.toFixed(2)}</span>}
        {pc!==0&&<span style={{fontFamily:"var(--m)",fontSize:13,fontWeight:700,color:pc>=0?"#34d399":"#f87171"}}>{pc>=0?"+":""}{pc.toFixed(2)}%</span>}
        <SB sig={sig.sig}/>
        <span style={{fontSize:12,color:"#475569",fontFamily:"var(--m)"}}>{items.length} News</span>
        <span style={{fontSize:12,color:cConf>=50?"#34d399":cConf>=30?"#fbbf24":"#94a3b8",fontFamily:"var(--m)",fontWeight:600}}>{cConf}%</span>
        <span style={{marginLeft:"auto",fontSize:14,color:"#334155",transform:open?"rotate(180deg)":"",transition:"transform 0.2s"}}>▾</span>
      </div>

      {open&&(
        <div style={{padding:"0 20px 20px",animation:"fadeIn 0.2s ease"}}>
          <div style={{background:"#0a0f1a",border:"1px solid #1e293b",borderRadius:14,padding:22}}>
            <div style={{display:"flex",gap:20,alignItems:"flex-start",marginBottom:20,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:200}}>
                <div style={{fontSize:11,color:"#475569",fontFamily:"var(--m)",marginBottom:8,letterSpacing:1.5,textTransform:"uppercase"}}>Hauptempfehlung · {items.length} News</div>
                <SB sig={sig.sig} lg/>
                <div style={{display:"flex",gap:20,marginTop:14,flexWrap:"wrap"}}>
                  {[{l:"Stärke",v:sig.str},{l:"Zeitraum",v:sig.time},{l:"Risiko",v:sig.risk,c:sig.risk==="Hoch"?"#f87171":sig.risk==="Mittel-Hoch"?"#fbbf24":"#94a3b8"}].map(x=>(
                    <div key={x.l}><div style={{fontSize:11,color:"#475569",fontFamily:"var(--m)",marginBottom:2}}>{x.l}</div><div style={{fontSize:15,fontWeight:600,color:x.c||"#e2e8f0",fontFamily:"var(--m)"}}>{x.v}</div></div>
                  ))}
                </div>
              </div>
              <div style={{textAlign:"center"}}><div style={{fontSize:10,color:"#475569",fontFamily:"var(--m)",marginBottom:4,letterSpacing:1}}>CONFIDENCE</div><Gauge value={cConf}/></div>
            </div>

            {/* Trade-Daten */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginBottom:18}}>
              {[{l:"Hebel",v:sig.hebel,c:"#a5b4fc"},{l:"Stop-Loss",v:sig.sl,c:"#f87171"},{l:"Take-Profit",v:sig.tp,c:"#34d399"},{l:"R/R",v:sig.rrr,c:"#fbbf24"}].map(x=>(
                <div key={x.l} style={{padding:"12px 14px",borderRadius:10,background:"#111827",border:"1px solid #1e293b"}}>
                  <div style={{fontSize:10,color:"#475569",fontFamily:"var(--m)",marginBottom:3,letterSpacing:0.5}}>{x.l}</div>
                  <div style={{fontSize:15,fontWeight:700,color:x.c,fontFamily:"var(--m)"}}>{x.v}</div>
                </div>
              ))}
            </div>

            {/* Begründung */}
            <div style={{padding:"14px 18px",borderRadius:10,marginBottom:16,background:sig.sig==="LONG"?"#052e16":sig.sig==="SHORT"?"#300a0a":"#111827",border:"1px solid #1e293b"}}>
              <div style={{fontSize:10,color:"#475569",fontFamily:"var(--m)",marginBottom:6,letterSpacing:1}}>BEGRÜNDUNG</div>
              <p style={{margin:0,fontSize:14,lineHeight:1.7,color:"#cbd5e1"}}>{sig.reason}</p>
            </div>

            {/* Backup */}
            <div style={{padding:"10px 16px",borderRadius:8,marginBottom:16,fontSize:14,fontWeight:600,background:"#111827",border:"1px solid #1e293b",color:sig.backup.startsWith("✅")?"#34d399":sig.backup.startsWith("⚠️")?"#fbbf24":"#f87171"}}>
              {sig.backup}
            </div>

            {/* Indikatoren */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
              {inds.map(i=>(
                <div key={i.n} style={{padding:"10px 14px",borderRadius:8,background:"#111827",border:"1px solid #1e293b"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                    <span style={{fontSize:11,color:"#64748b",fontFamily:"var(--m)"}}>{i.n}</span>
                    <span style={{fontSize:13,fontWeight:700,color:i.c,fontFamily:"var(--m)"}}>{i.v}</span>
                  </div>
                  <div style={{fontSize:11,color:"#475569"}}>{i.d}</div>
                </div>
              ))}
            </div>

            {/* Sentiment */}
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
              <span style={{fontSize:11,color:"#f87171",fontFamily:"var(--m)",fontWeight:600,width:36}}>Bear</span>
              <div style={{flex:1,height:6,borderRadius:3,background:"#1e293b",overflow:"hidden"}}>
                <div style={{width:`${cSc}%`,height:"100%",borderRadius:3,background:cSc>=60?"linear-gradient(90deg,#fbbf24,#34d399)":cSc<=40?"linear-gradient(90deg,#f87171,#fbbf24)":"#64748b",transition:"width 0.5s"}}/>
              </div>
              <span style={{fontSize:11,color:"#34d399",fontFamily:"var(--m)",fontWeight:600,width:36,textAlign:"right"}}>Bull</span>
              <span style={{fontSize:14,fontWeight:700,color:cSc>=60?"#34d399":cSc<=40?"#f87171":"#94a3b8",fontFamily:"var(--m)",minWidth:40,textAlign:"right"}}>{cSc}</span>
            </div>

            {/* Keywords */}
            {(aBW.length>0||aEW.length>0)&&(
              <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:14}}>
                {aBW.map(w=><span key={`b-${w}`} style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:"#052e16",color:"#34d399",fontFamily:"var(--m)"}}>+{w}</span>)}
                {aEW.map(w=><span key={`e-${w}`} style={{fontSize:11,padding:"2px 8px",borderRadius:4,background:"#300a0a",color:"#f87171",fontFamily:"var(--m)"}}>−{w}</span>)}
              </div>
            )}

            {/* Einzelne News */}
            <div style={{fontSize:10,color:"#475569",fontFamily:"var(--m)",marginBottom:6,letterSpacing:1}}>NEWS ({items.length})</div>
            {items.slice(0,5).map((item,i)=>(
              <div key={i} style={{padding:"8px 12px",marginBottom:4,borderRadius:6,background:"#111827",border:"1px solid #1e293b"}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                  <p style={{margin:0,fontSize:13,color:"#94a3b8",lineHeight:1.5,flex:1}}>{item.headline}</p>
                  <span style={{fontSize:11,color:"#475569",fontFamily:"var(--m)",flexShrink:0}}>{timeAgo(item.datetime)}</span>
                </div>
                {item.url&&item.url!=="#"&&<a href={item.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{fontSize:11,color:"#a5b4fc",textDecoration:"none",fontFamily:"var(--m)"}}>Lesen →</a>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ SINGLE NEWS (ohne Ticker / mit Vorschlägen + Favs) ════════════
function SingleNews({item,isFavFn,onToggleFav}){
  const[open,setOpen]=useState(false);
  const txt=(item.headline||"")+" "+(item.summary||"");
  const{s,sc}=sent(txt);
  const suggested=item.suggested||[];
  const tk=(item.ticker||"").split(",")[0].trim();
  const allTickers=tk?[tk]:suggested;
  const isNew=(Date.now()/1000)-item.datetime<600;
  const isBrk=(Date.now()/1000)-item.datetime<300;

  return(
    <div style={{borderBottom:"1px solid #151d2e",position:"relative"}}>
      {isBrk&&<div style={{position:"absolute",left:0,top:0,bottom:0,width:2,background:"#f87171"}}/>}
      {isNew&&!isBrk&&<div style={{position:"absolute",left:0,top:0,bottom:0,width:2,background:"#34d399"}}/>}
      <div onClick={()=>setOpen(!open)} style={{padding:"14px 20px",cursor:"pointer",background:isBrk?"#1a060808":"transparent"}}>
        <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
          <div style={{flex:1}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap"}}>
              {isBrk&&<span style={{fontSize:11,fontWeight:700,color:"#f87171",fontFamily:"var(--m)",padding:"2px 8px",background:"#300a0a",borderRadius:4,animation:"pulse 2s infinite"}}>BREAKING</span>}
              {allTickers.map(t=>(
                <span key={t} style={{display:"inline-flex",alignItems:"center",gap:2}}>
                  <FavStar ticker={t} isFav={isFavFn(t)} onToggle={onToggleFav}/>
                  <span style={{fontFamily:"var(--m)",fontSize:13,color:"#a5b4fc",fontWeight:600}}>{t}</span>
                </span>
              ))}
              {allTickers.length===0&&<span style={{fontSize:12,color:"#475569",fontFamily:"var(--m)"}}>Allgemein</span>}
              <span style={{fontSize:11,color:s==="bullish"?"#34d399":s==="bearish"?"#f87171":"#64748b",fontFamily:"var(--m)",fontWeight:600}}>{s==="bullish"?"BULL":s==="bearish"?"BEAR":"—"}</span>
            </div>
            <p style={{margin:0,fontSize:15,lineHeight:1.6,color:"#cbd5e1",fontWeight:500}}>{item.headline}</p>
            {suggested.length>0&&!tk&&!open&&<div style={{marginTop:4,fontSize:12,color:"#64748b"}}>Investierbar: {suggested.map(t=><span key={t} style={{color:"#a5b4fc",fontWeight:600,marginRight:6}}>${t}</span>)}</div>}
          </div>
          <span style={{fontFamily:"var(--m)",fontSize:12,color:isNew?"#34d399":"#475569",fontWeight:isNew?600:400,flexShrink:0}}>{timeAgo(item.datetime)}</span>
        </div>
      </div>
      {open&&item.summary&&(
        <div style={{padding:"0 20px 14px"}}><p style={{margin:0,fontSize:13,color:"#64748b",lineHeight:1.7}}>{item.summary.slice(0,300)}{item.summary.length>300?"...":""}</p>
        {item.url&&<a href={item.url} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:"#a5b4fc",textDecoration:"none",fontFamily:"var(--m)"}}>Lesen →</a>}</div>
      )}
    </div>
  );
}

// ═══ MAIN APP ═══════════════════════════════════════════════════════
export default function App(){
  const[news,setNews]=useState([]);
  const[quotes,setQuotes]=useState({});
  const[favs,setFavs]=useState([]);
  const[favIn,setFavIn]=useState("");
  const[search,setSearch]=useState("");
  const[sentF,setSentF]=useState("all");
  const[sigF,setSigF]=useState("all");
  const[cat,setCat]=useState("all");
  const[highOnly,setHighOnly]=useState(false);
  const[activeT,setActiveT]=useState("");
  const[view,setView]=useState("combined");
  const[api,setApi]=useState({fh:false,nf:false});
  const[last,setLast]=useState(null);
  const[loading,setLoading]=useState(true);
  const[errs,setErrs]=useState([]);
  const[snd,setSnd]=useState(true);

  const qR=useRef(quotes),fR=useRef(favs),ncR=useRef(0),sR=useRef(snd);
  useEffect(()=>{qR.current=quotes;},[quotes]);
  useEffect(()=>{fR.current=favs;},[favs]);
  useEffect(()=>{sR.current=snd;},[snd]);

  const toggleFav=useCallback((ticker)=>{
    setFavs(prev=>prev.includes(ticker)?prev.filter(t=>t!==ticker):[...prev,ticker]);
  },[]);
  const isFav=useCallback((ticker)=>favs.includes(ticker),[favs]);

  const fetchFH=useCallback(async()=>{
    if(!FK)return{r:[],e:[],ok:false};const r=[],e=[];
    try{const res=await fetch(`${FH}/news?category=general&token=${FK}`);if(!res.ok)throw new Error(`${res.status}`);const d=await res.json();if(Array.isArray(d))d.slice(0,40).forEach(i=>r.push({id:`fh-${i.id||i.datetime}`,headline:i.headline||"",summary:i.summary||"",source:i.source||"",apiSource:"finnhub",url:i.url||"",datetime:i.datetime||0,ticker:i.related||""}));}catch(x){e.push(`Finnhub: ${x.message}`);}
    const today=new Date().toISOString().split("T")[0],week=new Date(Date.now()-7*864e5).toISOString().split("T")[0];
    for(const sym of fR.current.slice(0,5)){try{const res=await fetch(`${FH}/company-news?symbol=${sym}&from=${week}&to=${today}&token=${FK}`);if(res.ok){const d=await res.json();if(Array.isArray(d))d.slice(0,5).forEach(i=>r.push({id:`fc-${i.id||i.datetime}-${sym}`,headline:i.headline||"",summary:i.summary||"",source:i.source||"",apiSource:"finnhub",url:i.url||"",datetime:i.datetime||0,ticker:sym}));}}catch(x){}}
    return{r,e,ok:r.length>0};
  },[]);

  const fetchNF=useCallback(async()=>{
    if(!NFK)return{r:[],e:[],ok:false};const r=[],e=[];
    try{const res=await fetch(NFU,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${NFK}`},body:JSON.stringify({type:"filterArticles",queryString:"*",from:0,size:25})});if(!res.ok)throw new Error(`${res.status}`);const d=await res.json();const a=d.articles||d||[];if(Array.isArray(a))a.forEach(i=>{const ts=i.publishedAt?new Date(i.publishedAt).getTime()/1000:0;r.push({id:`nf-${i.id||ts}`,headline:i.title||i.headline||"",summary:i.description||i.summary||"",source:(i.source&&i.source.name)?i.source.name:"Newsfilter",apiSource:"newsfilter",url:i.url||"",datetime:ts,ticker:Array.isArray(i.symbols)?i.symbols.join(","):(i.symbols||"")});});}catch(x){e.push(`Newsfilter: ${x.message}`);}
    return{r,e,ok:r.length>0};
  },[]);

  const fetchAll=useCallback(async()=>{
    const[fh,nf]=await Promise.all([fetchFH(),fetchNF()]);
    const all=[...fh.r,...nf.r];const seen=new Set();
    const uniq=all.filter(i=>{if(!i.headline)return false;const k=i.headline.toLowerCase().slice(0,50);if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>(b.datetime||0)-(a.datetime||0)).slice(0,80);
    uniq.forEach(item=>{const txt=(item.headline||"")+" "+(item.summary||"");item.suggested=item.ticker?[]:suggestTickers(txt);item.detectedCat=detectCat(txt);});
    if(ncR.current>0&&uniq.length>ncR.current&&sR.current){try{const ctx=new(window.AudioContext||window.webkitAudioContext)();const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=880;o.type="sine";g.gain.setValueAtTime(0.1,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.2);o.start(ctx.currentTime);o.stop(ctx.currentTime+0.2);}catch(e){}}
    ncR.current=uniq.length;
    setNews(uniq);setApi({fh:fh.ok,nf:nf.ok});setErrs([...fh.e,...nf.e]);setLast(Date.now());setLoading(false);
  },[fetchFH,fetchNF]);

  const fetchQ=useCallback(async()=>{
    if(!FK)return;const tks=[...new Set(fR.current)];const upd={...qR.current};
    for(const sym of tks){try{const res=await fetch(`${FH}/quote?symbol=${sym}&token=${FK}`);if(res.ok){const d=await res.json();if(d&&typeof d.c==="number"&&d.c>0)upd[sym]=d;}}catch(e){}}
    setQuotes(upd);
  },[]);

  useEffect(()=>{fetchAll();fetchQ();const t1=setInterval(fetchAll,60000),t2=setInterval(fetchQ,20000);return()=>{clearInterval(t1);clearInterval(t2);};},[fetchAll,fetchQ]);

  const filtered=news.filter(item=>{
    const txt=(item.headline||"")+" "+(item.summary||"");const{s:se,c:co}=sent(txt);
    const tk=(item.ticker||"").split(",")[0].trim();const pc=(quotes[tk]&&typeof quotes[tk].dp==="number")?quotes[tk].dp:0;
    const sg=calcSig(se,co,pc,0);
    if(sentF!=="all"&&se!==sentF)return false;if(sigF!=="all"&&sg.sig!==sigF)return false;
    if(highOnly&&co<50)return false;
    if(cat!=="all"&&item.detectedCat!==cat&&item.detectedCat!=="all")return false;
    if(activeT){const at=[tk,...(item.suggested||[])];if(!at.includes(activeT)&&!(item.headline||"").toUpperCase().includes(activeT))return false;}
    if(search){const q=search.toLowerCase();if(!(item.headline+" "+(item.ticker||"")).toLowerCase().includes(q))return false;}
    return true;
  });

  const grouped=useMemo(()=>{const map={},nt=[];filtered.forEach(item=>{const tk=(item.ticker||"").split(",")[0].trim();if(tk){if(!map[tk])map[tk]=[];map[tk].push(item);}else nt.push(item);});return{sorted:Object.entries(map).sort((a,b)=>b[1].length-a[1].length),nt};
  },[filtered]);

  const counts={LONG:0,SHORT:0,WAIT:0};
  news.slice(0,25).forEach(i=>{const{s:se,c:co}=sent((i.headline||"")+" "+(i.summary||""));const tk=(i.ticker||"").split(",")[0].trim();counts[calcSig(se,co,(quotes[tk]&&typeof quotes[tk].dp==="number")?quotes[tk].dp:0,0).sig]++;});
  const addFav=()=>{const t=favIn.toUpperCase().trim();if(t&&!favs.includes(t))setFavs(p=>[...p,t]);setFavIn("");};
  const anyOn=api.fh||api.nf;

  return(
    <div style={{minHeight:"100vh",background:"#060a12",color:"#e2e8f0",fontFamily:"'Outfit',system-ui,sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap');
        :root{--m:'JetBrains Mono',monospace}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.15}}
        @keyframes scan{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
        .b{background:#0c1222;border:1px solid #1e293b;color:#94a3b8;padding:7px 14px;border-radius:8px;font-size:13px;cursor:pointer;transition:all .12s;font-family:var(--m);white-space:nowrap}
        .b:hover{background:#111827;color:#cbd5e1}.b.on{background:#1e1b4b;border-color:#4f46e540;color:#a5b4fc}
        .in{width:100%;padding:9px 12px;background:#0c1222;border:1px solid #1e293b;border-radius:8px;color:#e2e8f0;font-size:14px;outline:none;font-family:var(--m)}.in:focus{border-color:#4f46e550}
      `}</style>

      {/* HEADER */}
      <header style={{padding:"14px 22px",borderBottom:"1px solid #111827"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#6366f1,#4f46e5)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16}}>⚡</div>
            <h1 style={{margin:0,fontSize:20,fontFamily:"var(--m)",color:"#f1f5f9",letterSpacing:"-0.5px"}}>SIGNAL<span style={{color:"#a5b4fc"}}>FLOW</span></h1>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            {[{n:"Finnhub",on:api.fh,c:"#fbbf24"},{n:"Newsfilter",on:api.nf,c:"#a5b4fc"}].map(a=>(
              <div key={a.n} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:6,background:"#0c1222",border:`1px solid ${a.on?"#1e293b":"#7f1d1d40"}`}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:a.on?a.c:"#ef4444",animation:a.on?"blink 2s infinite":"none"}}/>
                <span style={{fontSize:11,color:a.on?a.c:"#ef4444",fontFamily:"var(--m)"}}>{a.n}</span>
              </div>
            ))}
            <span style={{fontSize:11,color:"#334155",fontFamily:"var(--m)"}}>{news.length}{last?` · ${new Date(last).toLocaleTimeString("de-DE")}`:""}</span>
            <button className="b" onClick={()=>setSnd(!snd)} style={{padding:"6px 10px"}}>{snd?"🔊":"🔇"}</button>
            <button className="b" onClick={()=>{setLoading(true);fetchAll();fetchQ();}} style={{padding:"6px 10px",color:"#a5b4fc"}}>↻</button>
          </div>
        </div>
      </header>

      {errs.length>0&&!anyOn&&<div style={{margin:"10px 22px",padding:"12px 16px",background:"#1a0606",border:"1px solid #7f1d1d40",borderRadius:10}}>{errs.map((e,i)=><div key={i} style={{color:"#f87171",fontSize:13,fontFamily:"var(--m)"}}>⚠ {e}</div>)}</div>}

      {/* FAVORITEN */}
      <div style={{padding:"12px 22px",borderBottom:"1px solid #111827"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:favs.length>0?10:0}}>
          <span style={{fontSize:11,color:"#fbbf24",fontFamily:"var(--m)",letterSpacing:1.5,fontWeight:600}}>★ FAVORITEN</span>
          <div style={{display:"flex",gap:4,marginLeft:"auto"}}>
            <input type="text" placeholder="Ticker…" value={favIn} onChange={e=>setFavIn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addFav()} style={{padding:"5px 10px",background:"#0c1222",border:"1px solid #1e293b",borderRadius:6,color:"#e2e8f0",fontSize:13,outline:"none",fontFamily:"var(--m)",width:100}}/>
            <button onClick={addFav} style={{background:"#1e1b4b",border:"1px solid #4f46e540",color:"#a5b4fc",borderRadius:6,padding:"0 12px",cursor:"pointer",fontSize:14,fontWeight:700}}>+</button>
          </div>
        </div>
        {favs.length>0&&(
          <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:4}}>
            {favs.map(sym=><QMini key={sym} sym={sym} q={quotes[sym]} onClick={s=>{setActiveT(activeT===s?"":s);setSearch("");}} onRemove={s=>setFavs(p=>p.filter(x=>x!==s))}/>)}
          </div>
        )}
      </div>

      {/* CATEGORIES + VIEW TOGGLE */}
      <div style={{padding:"8px 22px",borderBottom:"1px solid #111827",display:"flex",gap:5,alignItems:"center",overflowX:"auto"}}>
        {CATS.map(c=><button key={c.id} className={`b ${cat===c.id?"on":""}`} onClick={()=>{setCat(c.id);setActiveT("");}} style={{padding:"6px 14px",fontSize:12}}>{c.label}</button>)}
        <div style={{marginLeft:"auto",display:"flex",gap:3}}>
          <button className={`b ${view==="combined"?"on":""}`} onClick={()=>setView("combined")} style={{fontSize:11,padding:"5px 10px"}}>Zusammen</button>
          <button className={`b ${view==="single"?"on":""}`} onClick={()=>setView("single")} style={{fontSize:11,padding:"5px 10px"}}>Einzeln</button>
        </div>
      </div>

      <div style={{display:"flex",minHeight:"calc(100vh - 220px)"}}>
        {/* SIDEBAR */}
        <aside style={{width:240,borderRight:"1px solid #111827",padding:14,flexShrink:0,display:"flex",flexDirection:"column",gap:14,overflowY:"auto"}}>
          <div><div style={{fontSize:11,color:"#334155",fontFamily:"var(--m)",marginBottom:5,letterSpacing:1}}>SUCHE</div><input className="in" type="text" placeholder="Ticker / Keyword…" value={search} onChange={e=>{setSearch(e.target.value);setActiveT("");}}/></div>
          <div><div style={{fontSize:11,color:"#334155",fontFamily:"var(--m)",marginBottom:6,letterSpacing:1}}>SIGNAL</div><div style={{display:"flex",flexDirection:"column",gap:3}}>{[["all","Alle"],["LONG","▲ Long"],["SHORT","▼ Short"],["WAIT","● Wait"]].map(([k,l])=><button key={k} className={`b ${sigF===k?"on":""}`} onClick={()=>setSigF(k)} style={{textAlign:"left",fontSize:12}}>{l}</button>)}</div></div>
          <div><div style={{fontSize:11,color:"#334155",fontFamily:"var(--m)",marginBottom:6,letterSpacing:1}}>SENTIMENT</div><div style={{display:"flex",gap:3}}>{[["all","Alle"],["bullish","Bull"],["bearish","Bear"]].map(([k,l])=><button key={k} className={`b ${sentF===k?"on":""}`} onClick={()=>setSentF(k)} style={{flex:1,textAlign:"center",fontSize:12}}>{l}</button>)}</div></div>
          <button className={`b ${highOnly?"on":""}`} onClick={()=>setHighOnly(!highOnly)} style={{width:"100%",textAlign:"center",fontSize:12,...(highOnly?{background:"#422006",borderColor:"#92400e50",color:"#fbbf24"}:{})}}>Hohe Confidence</button>
          <div style={{padding:12,background:"#0c1222",borderRadius:10,border:"1px solid #1e293b"}}>
            <div style={{fontSize:11,color:"#334155",fontFamily:"var(--m)",marginBottom:8,letterSpacing:1}}>SIGNALE</div>
            <div style={{display:"flex",justifyContent:"space-between"}}>{[["LONG","#34d399",counts.LONG],["SHORT","#f87171",counts.SHORT],["WAIT","#64748b",counts.WAIT]].map(([l,c,v])=><div key={l} style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:700,color:c,fontFamily:"var(--m)"}}>{v}</div><div style={{fontSize:10,color:c}}>{l}</div></div>)}</div>
          </div>
          <div style={{padding:12,background:"#0c1222",borderRadius:10,border:"1px solid #1e293b"}}>
            <div style={{fontSize:11,color:"#1d9bf0",fontFamily:"var(--m)",marginBottom:8,letterSpacing:1,fontWeight:600}}>𝕏 TWITTER</div>
            {TW.map(a=><a key={a.h} href={`https://x.com/${a.h}`} target="_blank" rel="noopener noreferrer" style={{display:"flex",justifyContent:"space-between",padding:"4px 0",textDecoration:"none",borderBottom:"1px solid #111827"}}><span style={{fontSize:12,color:"#1d9bf0",fontFamily:"var(--m)"}}>@{a.h}</span><span style={{fontSize:10,color:"#334155"}}>{a.d}</span></a>)}
          </div>
        </aside>

        {/* MAIN */}
        <main style={{flex:1,padding:"14px 20px",overflowY:"auto"}}>
          {loading?(<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:280}}><div style={{width:32,height:32,border:"2px solid #1e293b",borderTopColor:"#a5b4fc",borderRadius:"50%",animation:"spin 1s linear infinite",marginBottom:14}}/><span style={{color:"#64748b",fontFamily:"var(--m)",fontSize:14}}>Laden…</span></div>
          ):(
            <>
              {activeT&&(<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"8px 14px",background:"#1e1b4b20",borderRadius:8,border:"1px solid #4f46e520"}}><span style={{fontSize:15,fontWeight:600,color:"#a5b4fc",fontFamily:"var(--m)"}}>{activeT}</span><button onClick={()=>setActiveT("")} style={{marginLeft:"auto",background:"none",border:"1px solid #4f46e530",color:"#a5b4fc",borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:12,fontFamily:"var(--m)"}}>✕</button></div>)}

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{fontSize:12,color:"#334155",fontFamily:"var(--m)",letterSpacing:1}}>{view==="combined"?`${grouped.sorted.length} Aktien · ${grouped.nt.length} Allgemein`:`${filtered.length} News`}</span>
                <div style={{position:"relative",overflow:"hidden",padding:"4px 12px",borderRadius:6,background:"#0c1222",border:"1px solid #1e293b"}}>
                  <div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,transparent,#34d39908,transparent)",animation:"scan 3s linear infinite"}}/>
                  <span style={{fontFamily:"var(--m)",fontSize:11,color:"#34d399",position:"relative"}}>● Live</span>
                </div>
              </div>

              {view==="combined"?(
                <>
                  {grouped.sorted.length===0&&grouped.nt.length===0?(<div style={{padding:50,textAlign:"center"}}><div style={{fontSize:28,marginBottom:8}}>🔍</div><p style={{fontFamily:"var(--m)",fontSize:14,color:"#475569"}}>{!anyOn?"Keine API verbunden":"Keine News"}</p></div>):(
                    <>
                      {grouped.sorted.map(([ticker,items])=><ComboCard key={ticker} ticker={ticker} items={items} quotes={quotes} isFav={isFav(ticker)} onToggleFav={toggleFav}/>)}
                      {grouped.nt.length>0&&(<>
                        <div style={{fontSize:11,color:"#334155",fontFamily:"var(--m)",margin:"16px 0 8px",letterSpacing:1}}>ALLGEMEIN · MIT TICKER-VORSCHLÄGEN</div>
                        <div style={{borderRadius:12,overflow:"hidden",background:"#0c1222",border:"1px solid #151d2e"}}>
                          {grouped.nt.map(item=><SingleNews key={item.id} item={item} isFavFn={isFav} onToggleFav={toggleFav}/>)}
                        </div>
                      </>)}
                    </>
                  )}
                </>
              ):(
                <div style={{borderRadius:12,overflow:"hidden",background:"#0c1222",border:"1px solid #151d2e"}}>
                  {filtered.length===0?(<div style={{padding:50,textAlign:"center"}}><div style={{fontSize:28,marginBottom:8}}>🔍</div><p style={{fontFamily:"var(--m)",fontSize:14,color:"#475569"}}>{!anyOn?"Keine API":"Keine News"}</p></div>):(
                    filtered.map(item=><SingleNews key={item.id} item={item} isFavFn={isFav} onToggleFav={toggleFav}/>)
                  )}
                </div>
              )}

              <div style={{marginTop:12,textAlign:"center",fontSize:12,color:"#1e293b",fontFamily:"var(--m)"}}>
                ☆ Klicke den Stern neben einem Ticker um ihn zu favorisieren
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
