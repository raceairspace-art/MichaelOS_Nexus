"use client";

import { ArrowUp, AudioLines, Eye, Mic, MicOff, Sparkles, Square } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import DigitalOliverWorkspace from "@/components/digital-oliver-workspace";
import { initialDigitalOliverState, type DigitalOliverWorkspaceState } from "@/lib/digital-oliver";
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
      if (savedWorkspace) setWorkspace(JSON.parse(savedWorkspace));
      if (savedTranscript) setTranscript(JSON.parse(savedTranscript));
    } catch {
      // Corrupt local state should never prevent Nexus from opening.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
  }, [workspace, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(transcript.slice(-100)));
  }, [transcript, hydrated]);

  const context = useMemo(() => buildWorkspaceContext(workspace, transcript), [workspace, transcript]);

  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || channel.readyState !== "open") return;
    channel.send(JSON.stringify({
      type: "session.update",
      session: { type: "realtime", instructions: contextInstructions(context) },
    }));
  }, [context]);

  async function sendText(message: string) {
    const clean = message.trim();
    if (!clean || textLoading) return;
    const userEntry = makeEntry("user", clean, "text");
    const requestContext = buildWorkspaceContext(workspace, [...transcript, userEntry]);
    setTranscript((current) => [...current, userEntry]);
    setInput("");
    setTextLoading(true);

    try {
      const response = await fetch("/api/collaborate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, context: requestContext }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nexus could not respond.");
      setTranscript((current) => [...current, makeEntry("assistant", data.text, "text")]);
    } catch (error) {
      setTranscript((current) => [...current, makeEntry("assistant", error instanceof Error ? error.message : "Nexus could not respond.", "text")]);
    } finally {
      setTextLoading(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendText(input);
  }

  function handleRealtimeEvent(raw: string) {
    try {
      const event = JSON.parse(raw);
      const type = String(event.type || "");
      if (type.includes("input_audio_buffer.speech_started")) setVoiceState("listening");
      if (type.includes("input_audio_buffer.speech_stopped")) setVoiceState("thinking");
      if (type === "response.created") setVoiceState("thinking");
      if (type.includes("response.output_audio.delta") || type.includes("response.audio.delta")) setVoiceState("speaking");
      if (type === "response.done") setVoiceState("listening");

      if (type === "conversation.item.input_audio_transcription.completed" && event.transcript?.trim()) {
        setTranscript((current) => [...current, makeEntry("user", event.transcript.trim(), "voice")]);
      }
      if ((type === "response.output_audio_transcript.delta" || type === "response.audio_transcript.delta") && event.delta) {
        assistantDraftRef.current += event.delta;
      }
      if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
        const text = (event.transcript || assistantDraftRef.current).trim();
        assistantDraftRef.current = "";
        if (text) setTranscript((current) => [...current, makeEntry("assistant", text, "voice")]);
      }
    } catch {
      // Ignore non-JSON data channel payloads.
    }
  }

  async function startVoice() {
    if (peerRef.current) return;
    setVoiceError("");
    setAudioStatus("Connecting native realtime audio");
    setVoiceState("connecting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      peerRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        const audio = remoteAudioRef.current;
        if (!audio) return;
        audio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        audio.muted = false;
        audio.volume = 1;
        setAudioStatus("Realtime audio track received");
        void audio.play()
          .then(() => setAudioStatus("Nexus audio playing"))
          .catch((error) => setVoiceError(`Realtime audio playback failed: ${error instanceof Error ? error.message : "unknown browser error"}`));
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") setVoiceState("listening");
        if (["failed", "disconnected"].includes(pc.connectionState)) setVoiceState("error");
      };

      const channel = pc.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onmessage = (event) => handleRealtimeEvent(event.data);
      channel.onopen = () => {
        setVoiceState("listening");
        setAudioStatus("Voice session live");
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const response = await fetch("/api/realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: offer.sdp, context }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Nexus could not start voice.");
      }
      const answer = await response.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch (error) {
      stopVoice();
      setVoiceState("error");
      setVoiceError(error instanceof Error ? error.message : "Microphone or realtime connection failed.");
    }
  }

  function stopVoice() {
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
    assistantDraftRef.current = "";
    setAudioStatus("Native realtime audio ready");
    setVoiceState("ready");
  }

  const voiceActive = peerRef.current !== null && voiceState !== "error";
  const statusLabel = voiceState === "ready" ? "Ready" : voiceState[0].toUpperCase() + voiceState.slice(1);

  return (
    <main className="nexus-shell nexus-shell-v2">
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Sparkles size={17} /></span><div><strong>MichaelOS Nexus</strong><small>Shared voice workspace</small></div></div>
        <div className="presence"><span className="presence-dot" /> Michael + Nexus · Digital Oliver</div>
      </header>

      <div className="context-strip">
        <div><Eye size={14} /><strong>Nexus has live Digital Oliver context</strong></div>
        <span>View: {workspace.activeTab}</span>
        <span>Case: {context.selectedObject.caseRef as string}</span>
        <span>Persistent locally</span>
      </div>

      <div className="workspace-layout workspace-layout-v2">
        <DigitalOliverWorkspace state={workspace} onChange={setWorkspace} />

        <aside className="collaborator">
          <div className="collaborator-head">
            <div className="ai-avatar"><Sparkles size={18} /></div>
            <div><strong>Nexus</strong><small>Beside you, in context</small></div>
            <span className={`voice-status state-${voiceState}`}><i />{statusLabel}</span>
          </div>

          <div className="voice-zone">
            <button className={`voice-button ${voiceActive ? "active" : ""}`} onClick={() => voiceActive ? stopVoice() : void startVoice()}>
              {voiceActive ? <Square size={20} fill="currentColor" /> : voiceState === "error" ? <MicOff size={24} /> : <Mic size={26} />}
            </button>
            <div><strong>{voiceActive ? "Voice session live" : "Talk to Nexus"}</strong><span>{voiceActive ? `Speak naturally. ${audioStatus}.` : "Discuss the actual Digital Oliver workspace."}</span></div>
            {voiceActive && <AudioLines className="wave-icon" size={24} />}
          </div>
          {voiceError && <div className="voice-error">{voiceError}</div>}

          <div className="current-context-card">
            <Eye size={15} /><div><strong>Current context</strong><span>{String(context.selectedObject.caseRef)} · {String(context.selectedObject.symbol)} · {workspace.activeTab}</span></div>
          </div>

          <div className="transcript" aria-live="polite">
            {transcript.length === 0 ? (
              <div className="empty-thread"><Eye size={20} /><strong>I’m looking at Digital Oliver with you.</strong><p>Ask about the current case, checklist, rulebook, or saved judgment. You do not need to describe what is already in the workspace.</p></div>
            ) : transcript.map((entry) => (
              <div key={entry.id} className={`message ${entry.role}`}><div className="message-meta"><span>{entry.role === "user" ? "Michael" : "Nexus"}</span><small>{entry.mode}</small></div><p>{entry.text}</p></div>
            ))}
            {textLoading && <div className="thinking"><Sparkles size={15} /> Nexus is thinking with Digital Oliver in view…</div>}
          </div>

          <form className="composer" onSubmit={onSubmit}>
            <label><span className="context-pill"><Eye size={11} /> {String(context.selectedObject.caseRef)}</span>Text is secondary; voice is primary.</label>
            <div className="composer-row">
              <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask Nexus about this Digital Oliver workspace…" rows={2} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendText(input); } }} />
              <button type="submit" disabled={!input.trim() || textLoading} aria-label="Send"><ArrowUp size={18} /></button>
            </div>
          </form>
        </aside>
      </div>
    </main>
  );
}
