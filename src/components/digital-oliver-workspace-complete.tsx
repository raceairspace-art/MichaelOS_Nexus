"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
type EngineReview={score?:number;overallGrade?:string;wouldTrade?:string;oliverInterest?:string;direction?:string;strongestReason?:string;biggestConcern?:string};
type EngineDay={reviews:Array<{symbol:OliverSymbol;review:EngineReview}>;ranking:{bestSymbol:OliverSymbol|"NO_TRADE";secondSymbol:OliverSymbol|"NO_TRADE";noTradeDay:boolean;winnerReason:string;separationReason:string;confidence:number}};
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
 const current=selectedCase(state);const date=state.selectedDate;const day=dayFor(state,date);
 const [engineDay,setEngineDay]=useState<EngineDay|null>(null);const [engineState,setEngineState]=useState<RankState>("idle");const [engineError,setEngineError]=useState("");const [manualAiState,setManualAiState]=useState<RankState>("idle");const [manualAiError,setManualAiError]=useState("");
 const dayCases=useMemo(()=>symbols.map(symbol=>state.cases.find(c=>c.sessionDate===date&&c.symbol===symbol)).filter(Boolean),[state.cases,date]);
 const freshCount=dayCases.filter(c=>c&&freshAi(c.aiReview,state.modelSettings,state.selectedTimeframe)).length;
 const aiRankFresh=day.aiRankState==="complete"&&day.aiRankModelVersion===state.modelSettings.version&&day.aiRankTimeframe===state.selectedTimeframe;

 useEffect(()=>{if(!validDate(date))return;const ensured=ensureCasesForDate(state,date);if(ensured!==state)onChange(ensured)},[date,state.cases.length]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(!validDate(date))return;const controller=new AbortController();setEngineState("loading");setEngineError("");const q=new URLSearchParams({date,interval:state.selectedTimeframe,modelVersion:state.modelSettings.version});addSettings(q,state.modelSettings);void fetch(`/api/oliver_engine_day?${q}`,{signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Oliver Decision Engine could not score the day.");if(!controller.signal.aborted){setEngineDay(d as EngineDay);setEngineState("complete")}}).catch(e=>{if(!controller.signal.aborted){setEngineError(e instanceof Error?e.message:"Oliver Decision Engine failed.");setEngineState("error")}});return()=>controller.abort()},[date,state.selectedTimeframe,state.modelSettings.version]); // eslint-disable-line react-hooks/exhaustive-deps

 async function runNexusDayReview(){
  if(!validDate(date)||manualAiState==="loading")return;setManualAiState("loading");setManualAiError("");let working=ensureCasesForDate(stateRef.current,date);stateRef.current=working;onChange(working);
  try{
   const completed:Array<{symbol:OliverSymbol;review:OliverAiReview}>=[];
   for(const symbol of symbols){
    const target=working.cases.find(c=>c.sessionDate===date&&c.symbol===symbol)!;
    const existing=target.aiReview;if(freshAi(existing,working.modelSettings,working.selectedTimeframe)){completed.push({symbol,review:existing!});continue}
    working=updateCase(working,target.caseId,{aiReviewState:"loading",aiReviewError:""});stateRef.current=working;onChange(working);
    const q=new URLSearchParams({symbol,interval:working.selectedTimeframe,date,phase:"decision"});addSettings(q,working.modelSettings);
    const marketResponse=await fetch(`/api/oliver_market?${q}`);const market=await marketResponse.json();if(!marketResponse.ok)throw new Error(market.error||`Market evidence failed for ${symbol}.`);
    const reviewResponse=await fetch("/api/oliver-ai-review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol,sessionDate:market.sessionDate||date,timeframe:working.selectedTimeframe,decisionTime:market.decisionTime??null,modelVersion:working.modelSettings.version,parameters:market.parameters??{},candidate:market.candidate??{},bars:Array.isArray(market.bars)?market.bars.slice(-500):[],manual:true})});
    const result=await reviewResponse.json();if(!reviewResponse.ok)throw new Error(result.error||`Nexus review failed for ${symbol}.`);
    const review=result.review as OliverAiReview;working=stateRef.current;working=updateCase(working,target.caseId,{aiReviewState:"complete",aiReviewError:"",aiReview:review});stateRef.current=working;onChange(working);completed.push({symbol,review});
   }
   working=stateRef.current;working=setDay(working,date,{aiRankState:"loading",aiRankError:""});stateRef.current=working;onChange(working);
   const rankResponse=await fetch("/api/oliver-ai-rank",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionDate:date,timeframe:working.selectedTimeframe,modelVersion:working.modelSettings.version,reviews:completed,manual:true})});const rankJson=await rankResponse.json();if(!rankResponse.ok)throw new Error(rankJson.error||"Nexus could not rank the day.");const rank=rankJson.ranking as RankPayload;
   working=stateRef.current;working=setDay(working,date,{aiRankState:"complete",aiRankError:"",aiBestSymbol:rank.bestSymbol==="NO_TRADE"?"":rank.bestSymbol,aiSecondSymbol:rank.secondSymbol==="NO_TRADE"?"":rank.secondSymbol,aiNoTradeDay:rank.noTradeDay,aiWinnerReason:rank.winnerReason,aiSeparationReason:rank.separationReason,aiConfidence:rank.confidence,aiRankGeneratedAt:rank.generatedAt,aiRankModelVersion:rank.modelVersion,aiRankTimeframe:rank.timeframe});stateRef.current=working;onChange(working);setManualAiState("complete");
  }catch(error){working=stateRef.current;for(const c of working.cases.filter(c=>c.sessionDate===date&&c.aiReviewState==="loading"))working=updateCase(working,c.caseId,{aiReviewState:"error",aiReviewError:error instanceof Error?error.message:"Nexus review failed."});working=setDay(working,date,{aiRankState:"error",aiRankError:error instanceof Error?error.message:"Nexus could not rank the day."});stateRef.current=working;onChange(working);setManualAiError(error instanceof Error?error.message:"Nexus review failed.");setManualAiState("error")}
 }

 function selectSymbol(symbol:OliverSymbol){let next=ensureCasesForDate(stateRef.current,date);const target=next.cases.find(c=>c.sessionDate===date&&c.symbol===symbol);if(!target)return;next={...next,selectedCaseId:target.caseId,marketSnapshot:null,updatedAt:new Date().toISOString()};stateRef.current=next;onChange(next)}
 function chooseHuman(symbol:OliverSymbol){let next=stateRef.current;const d=dayFor(next,date);const removing=d.bestSymbol===symbol;next=setDay(next,date,{bestSymbol:removing?"":symbol,noTradeDay:false,secondSymbol:d.secondSymbol===symbol?"":d.secondSymbol});stateRef.current=next;onChange(next)}
 function setHumanSecond(symbol:string){let next=stateRef.current;const d=dayFor(next,date);next=setDay(next,date,{secondSymbol:symbol as OliverSymbol|"",noTradeDay:false,bestSymbol:d.bestSymbol===symbol?"":d.bestSymbol});stateRef.current=next;onChange(next)}
 function toggleHumanNoTrade(){let next=stateRef.current;const d=dayFor(next,date);next=setDay(next,date,{noTradeDay:!d.noTradeDay,bestSymbol:"",secondSymbol:""});stateRef.current=next;onChange(next)}
 const engineMap=new Map((engineDay?.reviews??[]).map(item=>[item.symbol,item.review]));

 const starMatrix=state.activeTab==="guidedReview"&&validDate(date)?<section className={styles.starMatrix}>
  <div className={styles.starMatrixHead}><div><span>DAILY PICKS</span><strong>{date}</strong></div><div><span>Engine</span><span>Human</span><span>Nexus</span></div></div>
  <div className={styles.starMatrixGrid}>{symbols.map(symbol=>{const c=state.cases.find(x=>x.sessionDate===date&&x.symbol===symbol);const selected=current.symbol===symbol;const humanBest=day.bestSymbol===symbol&&!day.noTradeDay;const humanSecond=day.secondSymbol===symbol&&!day.noTradeDay;const aiBest=aiRankFresh&&day.aiBestSymbol===symbol&&!day.aiNoTradeDay;const aiSecond=aiRankFresh&&day.aiSecondSymbol===symbol&&!day.aiNoTradeDay;const engineBest=engineDay?.ranking.bestSymbol===symbol&&!engineDay.ranking.noTradeDay;const engineSecond=engineDay?.ranking.secondSymbol===symbol&&!engineDay.ranking.noTradeDay;const er=engineMap.get(symbol);return <div className={`${styles.starMatrixRow} ${selected?styles.selected:""}`} key={symbol}><button className={styles.symbolButton} onClick={()=>selectSymbol(symbol)}><strong>{symbol}</strong><span>{MAG7[symbol]}</span><i>{c?.locked?"Locked":er?`Engine ${er.overallGrade??"—"} · ${Math.round(er.score??0)}`:"Engine pending"}</i></button><span title="Oliver Decision Engine ranking" className={`${styles.star} ${engineBest?styles.aiStarOn:""}`}>{engineSecond&&!engineBest?<b>2</b>:engineBest?"★":"☆"}</span><button title="Human daily winner" className={`${styles.star} ${humanBest?styles.starOn:""}`} onClick={()=>chooseHuman(symbol)}>{humanSecond&&!humanBest?<b>2</b>:humanBest?"★":"☆"}</button><span title="Nexus daily winner" className={`${styles.star} ${aiBest?styles.aiStarOn:""}`}>{aiSecond&&!aiBest?<b>2</b>:aiBest?"★":"☆"}</span></div>})}</div>
  <div className={styles.starMatrixFooter}><span>Engine {engineState==="complete"?"7/7":engineState==="loading"?"scoring…":"unavailable"}</span><span>Nexus saved {freshCount}/7</span><button disabled={manualAiState==="loading"||!validDate(date)} onClick={()=>void runNexusDayReview()}>{manualAiState==="loading"?"Running Nexus review…":freshCount===7&&aiRankFresh?"Nexus review saved · run only if needed":"Run Nexus review for this day"}</button>{(manualAiError||engineError)&&<span>{manualAiError||engineError}</span>}</div>
 </section>:null;

 return <div className={`${styles.wrapper} ${state.activeTab==="dailyRanking"?styles.rankMode:""}`}>
  {starMatrix}
  {state.activeTab==="dailyRanking"&&validDate(date)&&<section className={styles.dailyPanel}><div className={styles.dailyTitle}><div><span>DAILY RANKING · {date}</span><h2>Oliver Engine vs Michael vs Nexus</h2></div><div><span>Nexus saved</span><strong>{freshCount}/7</strong></div></div><div className={styles.rankColumns}><div><h3>Oliver Decision Engine</h3>{engineDay?<><div className={styles.rankPick}><span>#1</span><strong>{engineDay.ranking.noTradeDay?"NO TRADE":engineDay.ranking.bestSymbol}</strong></div><div className={styles.rankPick}><span>#2</span><strong>{engineDay.ranking.noTradeDay?"—":engineDay.ranking.secondSymbol}</strong></div><p>{engineDay.ranking.winnerReason}</p><p className={styles.muted}>{engineDay.ranking.separationReason}</p></>:<p>{engineState==="loading"?"Scoring all seven cases…":engineError||"Engine ranking unavailable."}</p>}</div><div><h3>Michael</h3><div className={styles.rankPick}><span>#1</span><strong>{day.noTradeDay?"NO TRADE":day.bestSymbol||"—"}</strong></div><label><span>#2</span><select disabled={day.noTradeDay} value={day.secondSymbol} onChange={e=>setHumanSecond(e.target.value)}><option value="">—</option>{symbols.filter(s=>s!==day.bestSymbol).map(s=><option key={s}>{s}</option>)}</select></label><button className={day.noTradeDay?styles.activeButton:""} onClick={toggleHumanNoTrade}>{day.noTradeDay?"✓ Human: No trade":"Mark human no-trade day"}</button></div><div><h3>Nexus · optional</h3>{aiRankFresh?<><div className={styles.rankPick}><span>#1</span><strong>{day.aiNoTradeDay?"NO TRADE":day.aiBestSymbol||"—"}</strong></div><div className={styles.rankPick}><span>#2</span><strong>{day.aiNoTradeDay?"—":day.aiSecondSymbol||"—"}</strong></div><p>{day.aiWinnerReason}</p><p className={styles.muted}>{day.aiSeparationReason}</p></>:<><p>No OpenAI call is made automatically. Run Nexus manually only when its independent judgment is useful.</p><button disabled={manualAiState==="loading"} onClick={()=>void runNexusDayReview()}>{manualAiState==="loading"?"Running…":"Run Nexus review for this day"}</button></>}</div></div></section>}
  <DigitalOliverWorkspace state={state} onChange={onChange}/>
 </div>;
}
