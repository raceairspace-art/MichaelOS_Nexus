"use client";

import { useEffect, useMemo, useRef } from "react";
import DigitalOliverWorkspace from "@/components/digital-oliver-workspace";
import styles from "@/components/oliver-day-controller.module.css";
import {
  MAG7,
  ensureCasesForDate,
  selectedCase,
  updateCase,
  type DayReview,
  type DigitalOliverWorkspaceState,
  type OliverAiReview,
  type OliverModelSettings,
  type OliverSymbol,
} from "@/lib/digital-oliver";

type Props={state:DigitalOliverWorkspaceState;onChange:(next:DigitalOliverWorkspaceState)=>void};
type RankState="idle"|"loading"|"complete"|"error";
type DayExt=DayReview&{
  aiBestSymbol?:OliverSymbol|"";aiSecondSymbol?:OliverSymbol|"";aiNoTradeDay?:boolean;
  aiWinnerReason?:string;aiSeparationReason?:string;aiConfidence?:number;aiRankState?:RankState;aiRankError?:string;
  aiRankModelVersion?:string;aiRankTimeframe?:"1m"|"5m"|"15m";aiRankGeneratedAt?:string;
};
type RankPayload={bestSymbol:OliverSymbol|"NO_TRADE";secondSymbol:OliverSymbol|"NO_TRADE";noTradeDay:boolean;winnerReason:string;separationReason:string;confidence:number;generatedAt:string;modelVersion:string;timeframe:"1m"|"5m"|"15m"};

const symbols=Object.keys(MAG7) as OliverSymbol[];
const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value);

function blankDay(date:string):DayExt{return{sessionDate:date,bestSymbol:"",secondSymbol:"",noTradeDay:false,daySummary:"",winnerReason:"",separationReason:"",confidence:3,locked:false,aiBestSymbol:"",aiSecondSymbol:"",aiNoTradeDay:false,aiWinnerReason:"",aiSeparationReason:"",aiConfidence:3,aiRankState:"idle",aiRankError:""}}
function dayFor(state:DigitalOliverWorkspaceState,date:string):DayExt{return(state.days.find(d=>d.sessionDate===date) as DayExt|undefined)??blankDay(date)}
function setDay(state:DigitalOliverWorkspaceState,date:string,patch:Partial<DayExt>){const existing=dayFor(state,date);const next={...existing,...patch};const found=state.days.some(d=>d.sessionDate===date);return{...state,days:found?state.days.map(d=>d.sessionDate===date?next as DayReview:d):[...state.days,next as DayReview],updatedAt:new Date().toISOString()}}
function freshAi(review:OliverAiReview|null,settings:OliverModelSettings,timeframe:DigitalOliverWorkspaceState["selectedTimeframe"]){return!!review&&review.modelVersion===settings.version&&review.timeframe===timeframe}
function addSettings(q:URLSearchParams,settings:OliverModelSettings){Object.entries(settings).forEach(([k,v])=>{if(k!=="version")q.set(k,String(v))})}

export default function DigitalOliverWorkspaceComplete({state,onChange}:Props){
 const stateRef=useRef(state);stateRef.current=state;
 const runningRef=useRef(false);
 const attemptedRef=useRef(new Set<string>());
 const current=selectedCase(state);const date=state.selectedDate;const day=dayFor(state,date);
 const dayCases=useMemo(()=>symbols.map(symbol=>state.cases.find(c=>c.sessionDate===date&&c.symbol===symbol)).filter(Boolean),[state.cases,date]);
 const freshCount=dayCases.filter(c=>c&&freshAi(c.aiReview,state.modelSettings,state.selectedTimeframe)).length;
 const errors=dayCases.filter(c=>c?.aiReviewState==="error").length;
 const allFresh=freshCount===7;
 const aiRankFresh=day.aiRankState==="complete"&&day.aiRankModelVersion===state.modelSettings.version&&day.aiRankTimeframe===state.selectedTimeframe;
 const runKey=`${date}|${state.selectedTimeframe}|${state.modelSettings.version}`;

 useEffect(()=>{attemptedRef.current.clear()},[runKey]);
 useEffect(()=>{if(!validDate(date))return;const ensured=ensureCasesForDate(state,date);if(ensured!==state)onChange(ensured)},[date,state.cases.length]); // eslint-disable-line react-hooks/exhaustive-deps

 async function reviewOne(symbol:OliverSymbol){
  const attemptKey=`${runKey}|${symbol}`;attemptedRef.current.add(attemptKey);
  let working=stateRef.current;const target=working.cases.find(c=>c.sessionDate===date&&c.symbol===symbol);if(!target)return;
  working=updateCase(working,target.caseId,{aiReviewState:"loading",aiReviewError:""});stateRef.current=working;onChange(working);
  try{
   const q=new URLSearchParams({symbol,interval:working.selectedTimeframe,date,phase:"decision"});addSettings(q,working.modelSettings);
   const marketResponse=await fetch(`/api/oliver_market?${q}`);const market=await marketResponse.json();if(!marketResponse.ok)throw new Error(market.error||`Market evidence failed for ${symbol}.`);
   const reviewResponse=await fetch("/api/oliver-ai-review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol,sessionDate:market.sessionDate||date,timeframe:working.selectedTimeframe,decisionTime:market.decisionTime??null,modelVersion:working.modelSettings.version,parameters:market.parameters??{},candidate:market.candidate??{},bars:Array.isArray(market.bars)?market.bars.slice(-500):[]})});
   const result=await reviewResponse.json();if(!reviewResponse.ok)throw new Error(result.error||`AI review failed for ${symbol}.`);
   working=stateRef.current;working=updateCase(working,target.caseId,{aiReviewState:"complete",aiReviewError:"",aiReview:result.review as OliverAiReview});stateRef.current=working;onChange(working);
  }catch(error){working=stateRef.current;working=updateCase(working,target.caseId,{aiReviewState:"error",aiReviewError:error instanceof Error?error.message:`AI review failed for ${symbol}.`});stateRef.current=working;onChange(working)}
 }

 async function rankDay(){
  let working=stateRef.current;const cases=symbols.map(symbol=>working.cases.find(c=>c.sessionDate===date&&c.symbol===symbol));
  if(cases.some(c=>!c||!freshAi(c.aiReview,working.modelSettings,working.selectedTimeframe)))return;
  const existing=dayFor(working,date);if(existing.aiRankState==="loading"||(existing.aiRankState==="complete"&&existing.aiRankModelVersion===working.modelSettings.version&&existing.aiRankTimeframe===working.selectedTimeframe))return;
  working=setDay(working,date,{aiRankState:"loading",aiRankError:""});stateRef.current=working;onChange(working);
  try{
   const response=await fetch("/api/oliver-ai-rank",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionDate:date,timeframe:working.selectedTimeframe,modelVersion:working.modelSettings.version,reviews:cases.map(c=>({symbol:c!.symbol,review:c!.aiReview}))})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||"Nexus could not rank the day.");const rank=result.ranking as RankPayload;
   working=stateRef.current;working=setDay(working,date,{aiRankState:"complete",aiRankError:"",aiBestSymbol:rank.bestSymbol==="NO_TRADE"?"":rank.bestSymbol,aiSecondSymbol:rank.secondSymbol==="NO_TRADE"?"":rank.secondSymbol,aiNoTradeDay:rank.noTradeDay,aiWinnerReason:rank.winnerReason,aiSeparationReason:rank.separationReason,aiConfidence:rank.confidence,aiRankGeneratedAt:rank.generatedAt,aiRankModelVersion:rank.modelVersion,aiRankTimeframe:rank.timeframe});stateRef.current=working;onChange(working);
  }catch(error){working=stateRef.current;working=setDay(working,date,{aiRankState:"error",aiRankError:error instanceof Error?error.message:"Nexus could not rank the day."});stateRef.current=working;onChange(working)}
 }

 const statusKey=dayCases.map(c=>`${c?.symbol}:${c?.aiReviewState}:${c?.aiReview?.modelVersion}:${c?.aiReview?.timeframe}`).join("|");
 useEffect(()=>{
  if(!validDate(date)||runningRef.current)return;
  if(dayCases.some(c=>c?.aiReviewState==="loading"))return;
  const pending=symbols.filter(symbol=>{
   const c=state.cases.find(x=>x.sessionDate===date&&x.symbol===symbol);if(!c||freshAi(c.aiReview,state.modelSettings,state.selectedTimeframe))return false;
   if(symbol===current.symbol)return false; // the visible case reviewer handles the selected symbol
   if(c.aiReviewState==="loading")return false;
   return !attemptedRef.current.has(`${runKey}|${symbol}`);
  });
  if(!pending.length){if(allFresh&&!aiRankFresh)void rankDay();return}
  runningRef.current=true;
  void(async()=>{for(const symbol of pending)await reviewOne(symbol);runningRef.current=false;const latest=stateRef.current;const done=symbols.every(s=>{const c=latest.cases.find(x=>x.sessionDate===date&&x.symbol===s);return!!c&&freshAi(c.aiReview,latest.modelSettings,latest.selectedTimeframe)});if(done)await rankDay()})();
 },[date,state.selectedTimeframe,state.modelSettings.version,statusKey,allFresh,aiRankFresh,current.symbol,runKey]); // eslint-disable-line react-hooks/exhaustive-deps

 function selectSymbol(symbol:OliverSymbol){let next=ensureCasesForDate(stateRef.current,date);const target=next.cases.find(c=>c.sessionDate===date&&c.symbol===symbol);if(!target)return;next={...next,selectedCaseId:target.caseId,marketSnapshot:null,updatedAt:new Date().toISOString()};stateRef.current=next;onChange(next)}
 function chooseHuman(symbol:OliverSymbol){let next=stateRef.current;const d=dayFor(next,date);const removing=d.bestSymbol===symbol;next=setDay(next,date,{bestSymbol:removing?"":symbol,noTradeDay:false,secondSymbol:d.secondSymbol===symbol?"":d.secondSymbol});stateRef.current=next;onChange(next)}
 function setHumanSecond(symbol:string){let next=stateRef.current;const d=dayFor(next,date);next=setDay(next,date,{secondSymbol:symbol as OliverSymbol|"",noTradeDay:false,bestSymbol:d.bestSymbol===symbol?"":d.bestSymbol});stateRef.current=next;onChange(next)}
 function toggleHumanNoTrade(){let next=stateRef.current;const d=dayFor(next,date);next=setDay(next,date,{noTradeDay:!d.noTradeDay,bestSymbol:"",secondSymbol:""});stateRef.current=next;onChange(next)}
 function retryErrors(){attemptedRef.current.clear();let next=stateRef.current;for(const c of next.cases.filter(c=>c.sessionDate===date&&c.aiReviewState==="error"))next=updateCase(next,c.caseId,{aiReviewState:"idle",aiReviewError:""});next=setDay(next,date,{aiRankState:"idle",aiRankError:""});stateRef.current=next;onChange(next)}

 const starMatrix=state.activeTab==="guidedReview"&&validDate(date)?<section className={styles.starMatrix}>
  <div className={styles.starMatrixHead}><div><span>DAILY PICKS</span><strong>{date}</strong></div><div><span>Human</span><span>AI</span></div></div>
  <div className={styles.starMatrixGrid}>{symbols.map(symbol=>{const c=state.cases.find(x=>x.sessionDate===date&&x.symbol===symbol);const selected=current.symbol===symbol;const humanBest=day.bestSymbol===symbol&&!day.noTradeDay;const humanSecond=day.secondSymbol===symbol&&!day.noTradeDay;const aiBest=aiRankFresh&&day.aiBestSymbol===symbol&&!day.aiNoTradeDay;const aiSecond=aiRankFresh&&day.aiSecondSymbol===symbol&&!day.aiNoTradeDay;return <div className={`${styles.starMatrixRow} ${selected?styles.selected:""}`} key={symbol}><button className={styles.symbolButton} onClick={()=>selectSymbol(symbol)}><strong>{symbol}</strong><span>{MAG7[symbol]}</span><i>{c?.locked?"Locked":freshAi(c?.aiReview??null,state.modelSettings,state.selectedTimeframe)?"AI ready":c?.aiReviewState==="error"?"AI error":c?.aiReviewState==="loading"?"AI reviewing":"queued"}</i></button><button title="Human daily winner" className={`${styles.star} ${humanBest?styles.starOn:""}`} onClick={()=>chooseHuman(symbol)}>{humanSecond&&!humanBest?<b>2</b>:humanBest?"★":"☆"}</button><span title="Nexus daily winner" className={`${styles.star} ${aiBest?styles.aiStarOn:""}`}>{aiSecond&&!aiBest?<b>2</b>:aiBest?"★":"☆"}</span></div>})}</div>
  <div className={styles.starMatrixFooter}><span>AI reviews {freshCount}/7</span><span>{aiRankFresh?(day.aiNoTradeDay?"AI: no trade":"AI daily ranking complete"):day.aiRankState==="loading"?"Ranking day…":"Reviewing seven symbols…"}</span>{errors>0&&<button onClick={retryErrors}>Retry {errors} failed review{errors===1?"":"s"}</button>}</div>
 </section>:null;

 return <div className={`${styles.wrapper} ${state.activeTab==="dailyRanking"?styles.rankMode:""}`}>
  {starMatrix}
  {state.activeTab==="dailyRanking"&&validDate(date)&&<section className={styles.dailyPanel}><div className={styles.dailyTitle}><div><span>DAILY RANKING · {date}</span><h2>Michael vs Nexus</h2></div><div><span>AI reviews</span><strong>{freshCount}/7</strong></div></div><div className={styles.rankColumns}><div><h3>Michael</h3><p>Use the Human ★ in Daily Picks to choose your #1.</p><div className={styles.rankPick}><span>#1</span><strong>{day.noTradeDay?"NO TRADE":day.bestSymbol||"—"}</strong></div><label><span>#2</span><select disabled={day.noTradeDay} value={day.secondSymbol} onChange={e=>setHumanSecond(e.target.value)}><option value="">—</option>{symbols.filter(s=>s!==day.bestSymbol).map(s=><option key={s}>{s}</option>)}</select></label><button className={day.noTradeDay?styles.activeButton:""} onClick={toggleHumanNoTrade}>{day.noTradeDay?"✓ Human: No trade":"Mark human no-trade day"}</button></div><div><h3>Nexus</h3>{aiRankFresh?<><div className={styles.rankPick}><span>#1</span><strong>{day.aiNoTradeDay?"NO TRADE":day.aiBestSymbol||"—"}</strong></div><div className={styles.rankPick}><span>#2</span><strong>{day.aiNoTradeDay?"—":day.aiSecondSymbol||"—"}</strong></div><p>{day.aiWinnerReason}</p><p className={styles.muted}>{day.aiSeparationReason}</p></>:<><div className={styles.rankPick}><span>Status</span><strong>{day.aiRankState==="error"?"AI ranking error":`${freshCount}/7 reviewed`}</strong></div><p>{day.aiRankError||"Nexus ranks the day automatically only after all seven frozen case reviews are complete."}</p>{errors>0&&<button onClick={retryErrors}>Retry failed AI reviews</button>}</>}</div></div></section>}
  <DigitalOliverWorkspace state={state} onChange={onChange}/>
 </div>;
}
