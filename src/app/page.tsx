"use client";

import { ArrowUp, AudioLines, Eye, Mic, MicOff, Sparkles, Square } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import DigitalOliverWorkspace from "@/components/digital-oliver-workspace";
import { initialDigitalOliverState, migrateWorkspaceState, type DigitalOliverWorkspaceState } from "@/lib/digital-oliver";
import { buildWorkspaceContext, contextInstructions, type TranscriptEntry } from "@/lib/nexus";

type VoiceState = "ready" | "connecting" | "listening" | "thinking" | "speaking" | "error";

const WORKSPACE_KEY = "michaelos-nexus-digital-oliver-v2";
const TRANSCRIPT_KEY = "michaelos-nexus-transcript-v1";

function makeEntry(role: TranscriptEntry["role"], text: string, mode: TranscriptEntry["mode"]): TranscriptEntry {
  return { id: crypto.randomUUID(), role, text, createdAt: new Date().toISOString(), mode };
}

export default function Home() {
  const [workspace, setWorkspace] = useState<DigitalOliverWorkspaceState>(initialDigitalOliverState);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [input, setInput] = useState("");
  const [textLoading, setTextLoading] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("ready");
  const [voiceError, setVoiceError] = useState("");
  const [audioStatus, setAudioStatus] = useState("Native realtime audio ready");
  const [hydrated, setHydrated] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const assistantDraftRef = useRef("");

  useEffect(() => {
    try {
      const savedWorkspace = localStorage.getItem(WORKSPACE_KEY);
      const savedTranscript = localStorage.getItem(TRANSCRIPT_KEY);
      if (savedWorkspace) setWorkspace(migrateWorkspaceState(JSON.parse(savedWorkspace)));
      if (savedTranscript) setTranscript(JSON.parse(savedTranscript));
    } catch {} finally { setHydrated(true); }
  }, []);
  useEffect(() => { if (hydrated) localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace)); }, [workspace, hydrated]);
  useEffect(() => { if (hydrated) localStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(transcript.slice(-100))); }, [transcript, hydrated]);

  const context = useMemo(() => buildWorkspaceContext(workspace, transcript), [workspace, transcript]);
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") return;
    channel.send(JSON.stringify({ type:"session.update", session:{ type:"realtime", instructions:contextInstructions(context) } }));
  }, [context]);

  async function sendText(message:string) {
    const clean=message.trim(); if(!clean||textLoading)return;
    const userEntry=makeEntry("user",clean,"text"); const requestContext=buildWorkspaceContext(workspace,[...transcript,userEntry]);
    setTranscript(c=>[...c,userEntry]); setInput(""); setTextLoading(true);
    try { const response=await fetch("/api/collaborate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:clean,context:requestContext})}); const data=await response.json(); if(!response.ok)throw new Error(data.error||"Nexus could not respond."); setTranscript(c=>[...c,makeEntry("assistant",data.text,"text")]); }
    catch(error){setTranscript(c=>[...c,makeEntry("assistant",error instanceof Error?error.message:"Nexus could not respond.","text")]);}
    finally{setTextLoading(false);}
  }
  function onSubmit(event:FormEvent){event.preventDefault();void sendText(input);}

  function handleRealtimeEvent(raw:string){
    try{
      const event=JSON.parse(raw); const type=String(event.type||"");
      if(type.includes("input_audio_buffer.speech_started"))setVoiceState("listening");
      if(type.includes("input_audio_buffer.speech_stopped"))setVoiceState("thinking");
      if(type==="response.created")setVoiceState("thinking");
      if(type.includes("response.output_audio.delta")||type.includes("response.audio.delta"))setVoiceState("speaking");
      if(type==="response.done")setVoiceState("listening");
      if(type==="conversation.item.input_audio_transcription.completed"&&event.transcript?.trim())setTranscript(c=>[...c,makeEntry("user",event.transcript.trim(),"voice")]);
      if(type.includes("response.output_audio_transcript.delta")||type.includes("response.audio_transcript.delta")){assistantDraftRef.current+=event.delta||"";}
      if((type.includes("response.output_audio_transcript.done")||type.includes("response.audio_transcript.done"))&&assistantDraftRef.current.trim()){const text=assistantDraftRef.current.trim();assistantDraftRef.current="";setTranscript(c=>[...c,makeEntry("assistant",text,"voice")]);}
      if(type==="error"){setVoiceError(event.error?.message||"Realtime voice error.");setVoiceState("error");}
    }catch{}
  }

  function stopVoice(){
    channelRef.current?.close(); peerRef.current?.close(); streamRef.current?.getTracks().forEach(t=>t.stop());
    channelRef.current=null; peerRef.current=null; streamRef.current=null; if(remoteAudioRef.current){remoteAudioRef.current.srcObject=null;}
    setVoiceState("ready"); setAudioStatus("Native realtime audio ready");
  }

  async function startVoice(){
    if(voiceState!=="ready"&&voiceState!=="error"){stopVoice();return;}
    setVoiceError("");setVoiceState("connecting");setAudioStatus("Requesting microphone…");
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;
      const pc=new RTCPeerConnection();peerRef.current=pc;stream.getTracks().forEach(track=>pc.addTrack(track,stream));
      const audio=new Audio();audio.autoplay=true;audio.playsInline=true;remoteAudioRef.current=audio;pc.ontrack=e=>{audio.srcObject=e.streams[0];void audio.play().catch(()=>undefined);};
      const channel=pc.createDataChannel("oai-events");channelRef.current=channel;channel.onmessage=e=>handleRealtimeEvent(e.data);channel.onopen=()=>{setVoiceState("listening");setAudioStatus("Connected · listening");};
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      const response=await fetch("/api/realtime",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sdp:offer.sdp,context})});
      if(!response.ok){const detail=await response.json().catch(()=>({}));throw new Error(detail.error||"Realtime connection failed.");}
      const answer={type:"answer" as RTCSdpType,sdp:await response.text()};await pc.setRemoteDescription(answer);
    }catch(error){stopVoice();setVoiceError(error instanceof Error?error.message:"Could not start voice.");setVoiceState("error");}
  }

  return <main className="nexus-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><Sparkles size={17}/></div><div><strong>MichaelOS Nexus</strong><small>Shared human + AI workspace</small></div></div><div className="presence"><span className="presence-dot"/>Nexus online</div></header>
    <div className="context-strip"><div><Eye size={12}/><span>Workspace</span><strong>Digital Oliver</strong></div><div><span>View</span><strong>{workspace.activeTab}</strong></div><div><span>Rule version</span><strong>{workspace.modelSettings.version}</strong></div><span className="saved">● saved locally</span></div>
    <div className="workspace-layout"><section className="workspace"><DigitalOliverWorkspace state={workspace} onChange={setWorkspace}/></section>
      <aside className="collaborator"><div className="collaborator-head"><div className="ai-avatar"><Sparkles size={17}/></div><div><strong>Nexus</strong><small>Digital Oliver collaborator</small></div><div className={`voice-status state-${voiceState}`}><i/>{voiceState}</div></div>
        <div className="voice-zone"><button className={`voice-button ${voiceState!=="ready"?"active":""}`} onClick={()=>void startVoice()}>{voiceState!=="ready"&&voiceState!=="error"?<MicOff size={20}/>:<Mic size={20}/>}</button><div><strong>{voiceState!=="ready"&&voiceState!=="error"?"Stop Nexus":"Talk to Nexus"}</strong><span>{audioStatus}</span></div>{voiceState==="speaking"&&<AudioLines className="wave-icon" size={18}/>}</div>{voiceError&&<div className="voice-error">{voiceError}</div>}
        <div className="transcript">{!transcript.length&&<div className="empty-thread"><Sparkles size={18}/><strong>Nexus has the workspace in context</strong><p>Ask about the selected Oliver case, the chart evidence, or the rule definitions.</p></div>}{transcript.map(m=><div className={`message ${m.role}`} key={m.id}><div className="message-meta"><span>{m.role==="user"?"Michael":"Nexus"}</span><small>{m.mode}</small></div><p>{m.text}</p></div>)}{textLoading&&<div className="thinking"><Sparkles size={13}/>Thinking…</div>}</div>
        <form className="composer" onSubmit={onSubmit}><label><span>Ask Nexus</span><span className="context-pill"><Eye size={10}/>workspace context attached</span></label><div className="composer-row"><textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask about the current Oliver workspace…" rows={2}/><button disabled={!input.trim()||textLoading}>{textLoading?<Square size={13}/>:<ArrowUp size={15}/>}</button></div></form>
      </aside></div>
  </main>;
}
