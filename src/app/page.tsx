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

function makeToneBlob(durationSeconds = 0.7, volume = 0.28) {
  const sampleRate = 44100;
  const sampleCount = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, sampleCount * 2, true);

  for (let i = 0; i < sampleCount; i += 1) {
    const envelope = Math.min(1, i / 500, (sampleCount - i) / 1000);
    const sample = Math.sin((2 * Math.PI * 523.25 * i) / sampleRate) * volume * envelope;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export default function Home() {
  const [workspace, setWorkspace] = useState<OliverWorkspace>(initialWorkspace);
  const [selectedSection, setSelectedSection] = useState<SectionKey>("identity");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [input, setInput] = useState("");
  const [textLoading, setTextLoading] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("ready");
  const [voiceError, setVoiceError] = useState("");
  const [audioStatus, setAudioStatus] = useState("Audio output waiting");
  const [hydrated, setHydrated] = useState(false);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const speakerRef = useRef<HTMLAudioElement | null>(null);
  const speakerUrlRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const speechSourceRef = useRef<AudioBufferSourceNode | null>(null);
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
    const requestContext = buildWorkspaceContext(workspace, selectedSection, [...transcript, userEntry]);
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

  function clearSpeakerUrl() {
    if (speakerUrlRef.current) {
      URL.revokeObjectURL(speakerUrlRef.current);
      speakerUrlRef.current = null;
    }
  }

  async function primeSpeaker() {
    const audio = speakerRef.current;
    if (!audio) throw new Error("Nexus speaker element is unavailable.");

    const url = URL.createObjectURL(makeToneBlob(0.03, 0));
    audio.pause();
    audio.srcObject = null;
    audio.src = url;
    audio.muted = false;
    audio.volume = 1;
    try {
      await audio.play();
      audio.pause();
    } finally {
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
    }

    const audioContext = new AudioContext();
    await audioContext.resume();
    audioContextRef.current = audioContext;
    setAudioStatus(`Speaker authorized (${audioContext.state})`);
  }

  function speakWithBrowser(text: string) {
    if (!("speechSynthesis" in window)) return false;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => {
      streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
      setVoiceState("speaking");
      setAudioStatus("Playing browser voice fallback");
    };
    utterance.onend = () => {
      streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = true; });
      setVoiceState("listening");
      setAudioStatus("Browser voice finished");
    };
    utterance.onerror = () => {
      streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = true; });
      setVoiceError("Browser speech synthesis also failed.");
    };
    window.speechSynthesis.speak(utterance);
    return true;
  }

  async function speakResponse(text: string) {
    if (!text.trim()) return;

    try {
      setAudioStatus("Generating Nexus voice");
      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "OpenAI speech request failed.");
      }

      const blob = await response.blob();
      if (blob.size < 100) throw new Error("OpenAI returned an empty speech file.");

      const audioContext = audioContextRef.current;
      if (!audioContext) throw new Error("Nexus audio engine is unavailable.");
      if (audioContext.state !== "running") await audioContext.resume();

      const arrayBuffer = await blob.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      speechSourceRef.current?.stop();

      const source = audioContext.createBufferSource();
      source.buffer = decoded;
      source.connect(audioContext.destination);
      speechSourceRef.current = source;
      streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
      setVoiceState("speaking");
      setAudioStatus(`Playing decoded OpenAI voice (${decoded.duration.toFixed(1)}s)`);
      source.onended = () => {
        speechSourceRef.current = null;
        streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = true; });
        setVoiceState("listening");
        setAudioStatus("Nexus voice finished");
      };
      source.start(0);
    } catch (error) {
      const message = error instanceof Error ? error.message : "OpenAI speech playback failed.";
      setVoiceError(`OpenAI voice failed: ${message}`);
      if (!speakWithBrowser(text)) setAudioStatus("All voice playback failed");
    }
  }

  function handleRealtimeEvent(raw: string) {
    try {
      const event = JSON.parse(raw);
      const type = String(event.type || "");

      if (type.includes("input_audio_buffer.speech_started")) setVoiceState("listening");
      if (type.includes("input_audio_buffer.speech_stopped")) setVoiceState("thinking");
      if (type === "response.created") setVoiceState("thinking");
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
        if (text) {
          setTranscript((current) => [...current, makeEntry("assistant", text, "voice")]);
          void speakResponse(text);
        }
      }
    } catch {
      // Ignore non-JSON data channel payloads.
    }
  }

  async function testSpeaker() {
    const audio = speakerRef.current;
    if (!audio || peerRef.current) return;

    setVoiceError("");
    clearSpeakerUrl();
    const url = URL.createObjectURL(makeToneBlob());
    speakerUrlRef.current = url;
    try {
      audio.pause();
      audio.srcObject = null;
      audio.src = url;
      audio.volume = 1;
      audio.muted = false;
      setAudioStatus("Playing speaker test");
      await audio.play();
      setAudioStatus("Speaker test played");
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Speaker test failed.");
      setAudioStatus("Speaker test failed");
    }
  }

  async function startVoice() {
    if (peerRef.current) return;
    setVoiceError("");
    setVoiceState("connecting");

    try {
      await primeSpeaker();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      peerRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        setAudioStatus(`Realtime ${event.track.kind} track negotiated; decoded TTS output active`);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") setVoiceState("listening");
        if (["failed", "disconnected", "closed"].includes(pc.connectionState) && pc.connectionState !== "closed") {
          setVoiceState("error");
        }
      };

      const channel = pc.createDataChannel("oai-events");
      channelRef.current = channel;
      channel.onmessage = (event) => handleRealtimeEvent(event.data);
      channel.onopen = () => {
        setVoiceState("listening");
        setAudioStatus("Voice input ready; decoded OpenAI voice enabled");
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
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (speechSourceRef.current) {
      try { speechSourceRef.current.stop(); } catch {}
      speechSourceRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (speakerRef.current) {
      speakerRef.current.pause();
      speakerRef.current.srcObject = null;
      speakerRef.current.removeAttribute("src");
      speakerRef.current.load();
    }
    clearSpeakerUrl();
    assistantDraftRef.current = "";
    setAudioStatus("Audio output waiting");
    setVoiceState("ready");
  }

  const voiceActive = peerRef.current !== null && voiceState !== "error";
  const statusLabel = voiceState === "ready" ? "Ready" : voiceState[0].toUpperCase() + voiceState.slice(1);

  return (
    <main className="nexus-shell">
      <audio
        ref={speakerRef}
        style={{ display: "none" }}
        onEnded={() => {
          setVoiceState(peerRef.current ? "listening" : "ready");
          setAudioStatus(peerRef.current ? "Nexus voice finished" : "Speaker test finished");
        }}
      />

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
            <div>
              <span className="eyebrow">ACTIVE PROJECT</span>
              <h1>Digital Oliver</h1>
              <p>A living model of trading philosophy, rules, knowledge, and behavior.</p>
            </div>
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
              <span>{voiceActive ? `Speak naturally. ${audioStatus}.` : audioStatus}</span>
            </div>
            {voiceActive && <AudioLines className="wave-icon" size={24} />}
          </div>

          {!voiceActive && (
            <button
              type="button"
              onClick={() => void testSpeaker()}
              style={{ margin: "0 16px 12px", padding: "8px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.12)", background: "transparent", color: "inherit", cursor: "pointer" }}
            >
              Test speaker
            </button>
          )}

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
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask Nexus about what you’re working on…"
                rows={2}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendText(input);
                  }
                }}
              />
              <button type="submit" disabled={!input.trim() || textLoading} aria-label="Send"><ArrowUp size={18} /></button>
            </div>
          </form>
        </aside>
      </div>
    </main>
  );
}
