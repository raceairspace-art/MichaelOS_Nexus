"use client";

import {
  ArrowUp,
  AudioLines,
  Check,
  Circle,
  Eye,
  Mic,
  MicOff,
  Save,
  Sparkles,
  Square,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildWorkspaceContext,
  contextInstructions,
  initialWorkspace,
  sectionKeys,
  sectionLabels,
  type OliverWorkspace,
  type SectionKey,
  type TranscriptEntry,
} from "@/lib/nexus";

type VoiceState = "ready" | "connecting" | "listening" | "thinking" | "speaking" | "error";

const WORKSPACE_KEY = "michaelos-nexus-workspace-v1";
const TRANSCRIPT_KEY = "michaelos-nexus-transcript-v1";

function now() {
  return new Date().toISOString();
}

function makeEntry(role: TranscriptEntry["role"], text: string, mode: TranscriptEntry["mode"]): TranscriptEntry {
  return { id: crypto.randomUUID(), role, text, createdAt: now(), mode };
}

export default function Home() {
  const [workspace, setWorkspace] = useState<OliverWorkspace>(initialWorkspace);
  const [selectedSection, setSelectedSection] = useState<SectionKey>("identity");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [input, setInput] = useState("");
  const [textLoading, setTextLoading] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("ready");
  const [voiceError, setVoiceError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
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

  const context = useMemo(
    () => buildWorkspaceContext(workspace, selectedSection, transcript),
    [workspace, selectedSection, transcript],
  );

  const updateSection = useCallback((key: SectionKey, value: string) => {
    setWorkspace((current) => ({
      ...current,
      updatedAt: now(),
      sections: { ...current.sections, [key]: value },
    }));
  }, []);

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
    const contextForRequest = buildWorkspaceContext(workspace, selectedSection, [...transcript, userEntry]);
    setTranscript((current) => [...current, userEntry]);
    setInput("");
    setTextLoading(true);

    try {
      const response = await fetch("/api/collaborate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, context: contextForRequest }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Nexus could not respond.");
      setTranscript((current) => [...current, makeEntry("assistant", data.text, "text")]);
    } catch (error) {
      setTranscript((current) => [
        ...current,
        makeEntry("assistant", error instanceof Error ? error.message : "Nexus could not respond.", "text"),
      ]);
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
    setVoiceState("connecting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      peerRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const audio = new Audio();
      audio.autoplay = true;
      audioRef.current = audio;
      pc.ontrack = (event) => {
        audio.srcObject = event.streams[0];
        void audio.play().catch(() => undefined);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") setVoiceState("listening");
        if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
          if (pc.connectionState !== "closed") setVoiceState("error");
        }
      };

      const channel = pc.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onmessage = (event) => handleRealtimeEvent(event.data);
      channel.onopen = () => setVoiceState("listening");

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
    if (audioRef.current) audioRef.current.srcObject = null;
    audioRef.current = null;
    assistantDraftRef.current = "";
    setVoiceState("ready");
  }

  const voiceActive = peerRef.current !== null && voiceState !== "error";
  const statusLabel = voiceState === "ready" ? "Ready" : voiceState[0].toUpperCase() + voiceState.slice(1);

  return (
    <main className="nexus-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Sparkles size={17} /></span>
          <div><strong>MichaelOS Nexus</strong><small>Shared voice workspace</small></div>
        </div>
        <div className="presence"><span className="presence-dot" /> Michael + Nexus · Digital Oliver</div>
      </header>

      <div className="context-strip">
        <div><Eye size={14} /><strong>Nexus has workspace context</strong></div>
        <span>Selected: {sectionLabels[selectedSection]}</span>
        <span>Persistent locally</span>
        <span className="saved"><Check size={13} /> Saved</span>
      </div>

      <div className="workspace-layout">
        <section className="workspace">
          <div className="workspace-heading">
            <div><span className="eyebrow">ACTIVE PROJECT</span><h1>Digital Oliver</h1><p>A living model of trading philosophy, rules, knowledge, and behavior.</p></div>
            <div className="workspace-save"><Save size={14} /> Auto-saved</div>
          </div>

          <div className="document-shell">
            <nav className="section-nav" aria-label="Digital Oliver sections">
              {sectionKeys.map((key) => (
                <button key={key} className={selectedSection === key ? "active" : ""} onClick={() => setSelectedSection(key)}>
                  <span>{sectionLabels[key]}</span><Circle size={7} fill="currentColor" />
                </button>
              ))}
            </nav>

            <article className="editor">
              <div className="editor-meta"><span>{sectionLabels[selectedSection]}</span><small>Shared object · editable</small></div>
              <textarea
                aria-label={`${sectionLabels[selectedSection]} content`}
                value={workspace.sections[selectedSection]}
                onChange={(event) => updateSection(selectedSection, event.target.value)}
                spellCheck
              />
              <div className="editor-foot">Nexus receives this section plus the complete Digital Oliver object and recent conversation.</div>
            </article>
          </div>
        </section>

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
            <div>
              <strong>{voiceActive ? "Voice session live" : "Talk to Nexus"}</strong>
              <span>{voiceActive ? "Speak naturally. Nexus already has the workspace." : "Start a realtime conversation in this workspace."}</span>
            </div>
            {voiceActive && <AudioLines className="wave-icon" size={24} />}
          </div>
          {voiceError && <div className="voice-error">{voiceError}</div>}

          <div className="transcript" aria-live="polite">
            {transcript.length === 0 ? (
              <div className="empty-thread">
                <Eye size={20} />
                <strong>I’m looking at Digital Oliver with you.</strong>
                <p>Ask about the selected section, challenge an idea, or discuss what should change. You do not need to paste the workspace into the conversation.</p>
              </div>
            ) : transcript.map((entry) => (
              <div key={entry.id} className={`message ${entry.role}`}>
                <div className="message-meta"><span>{entry.role === "user" ? "Michael" : "Nexus"}</span><small>{entry.mode}</small></div>
                <p>{entry.text}</p>
              </div>
            ))}
            {textLoading && <div className="thinking"><Sparkles size={15} /> Nexus is thinking with the workspace in view…</div>}
          </div>

          <form className="composer" onSubmit={onSubmit}>
            <label><span className="context-pill"><Eye size={11} /> {sectionLabels[selectedSection]}</span>Text is secondary; voice is primary.</label>
            <div className="composer-row">
              <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask Nexus about what you’re working on…" rows={2} onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendText(input); }
              }} />
              <button type="submit" disabled={!input.trim() || textLoading} aria-label="Send"><ArrowUp size={18} /></button>
            </div>
          </form>
        </aside>
      </div>
    </main>
  );
}
