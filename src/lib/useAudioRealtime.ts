import { useRef, useCallback, useEffect } from 'react';
import { useAppStore } from './store';

// Target language for live translation (movie mode: anything -> Chinese).
const TRANSLATION_TARGET = 'zh';
// Roll over to a new transcript bubble once the finalized text grows past this,
// so a 2-hour session doesn't re-render one giant markdown block on every token.
const ITEM_ROLLOVER_CHARS = 2500;
const MAX_RECONNECT_DELAY_MS = 10_000;
const PCM_SAMPLE_RATE = 16000;

// Streams raw 16 kHz mono PCM instead of MediaRecorder/WebM: iOS Safari can't record
// WebM, and PCM needs no container header, so reconnects can resume mid-stream.
const PCM_WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ratio = sampleRate / options.processorOptions.targetRate;
    this.chunk = new Int16Array(Math.round(options.processorOptions.targetRate / 10)); // 100 ms
    this.fill = 0;
    this.acc = 0;
    this.accCount = 0;
    this.pos = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    const len = channels[0].length;
    for (let i = 0; i < len; i++) {
      let s = 0;
      for (let c = 0; c < channels.length; c++) s += channels[c][i];
      this.acc += s / channels.length;
      this.accCount++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const v = Math.max(-1, Math.min(1, this.acc / this.accCount));
        this.chunk[this.fill++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        this.acc = 0;
        this.accCount = 0;
        if (this.fill === this.chunk.length) {
          this.port.postMessage(this.chunk.buffer.slice(0));
          this.fill = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`;

type Token = {
  text: string;
  is_final?: boolean;
  speaker?: string;
  translation_status?: 'original' | 'translation' | 'none';
};

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");

// Renders original-language tokens, inserting a bold speaker label whenever the speaker changes.
function renderOriginal(tokens: Token[], startSpeaker: string | null) {
  const parts: string[] = [];
  let speaker = startSpeaker;
  for (const token of tokens) {
    let text = stripTags(token.text);
    if (token.speaker && token.speaker !== speaker) {
      if (speaker !== null) parts.push("\n\n");
      speaker = token.speaker;
      parts.push(`**Speaker ${speaker}:** `);
      text = text.trimStart();
    }
    parts.push(text);
  }
  return { text: parts.join(""), speaker };
}

// Translation is shown subtitle-style: a new line whenever the speaker changes, no labels.
function renderTranslation(tokens: Token[], startSpeaker: string | null) {
  const parts: string[] = [];
  let speaker = startSpeaker;
  for (const token of tokens) {
    let text = stripTags(token.text);
    if (token.speaker && token.speaker !== speaker) {
      if (speaker !== null) parts.push("\n");
      speaker = token.speaker;
      text = text.trimStart();
    }
    parts.push(text);
  }
  return { text: parts.join(""), speaker };
}

export const canCaptureSystemAudio = () =>
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices?.getDisplayMedia &&
  !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export function useAudioRealtime() {
  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sysStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const captureNodeRef = useRef<AudioWorkletNode | null>(null);
  const wakeLockRef = useRef<any>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const userStoppedRef = useRef(true);

  // Transcript state that must survive socket reconnects within one recording session.
  const sessionIdRef = useRef("");
  const itemIndexRef = useRef(0);
  const finalOrigRef = useRef("");
  const finalTransRef = useRef("");
  const origSpeakerRef = useRef<string | null>(null);
  const transSpeakerRef = useRef<string | null>(null);

  const {
    setIsListening,
    setIsConnecting,
    addOrUpdateTranscriptItem,
    clearTranscript,
    selectedLanguages,
    selectedMicId,
    isMicEnabled,
    isSystemAudioEnabled,
  } = useAppStore();

  const fetchSonioxKey = async () => {
    try {
      const tokenRes = await fetch("/api/soniox-token", { method: "POST" });
      if (!tokenRes.ok) throw new Error("token request failed");
      const tokenData = await tokenRes.json();
      if (!tokenData.apiKey) throw new Error("no key returned");
      return tokenData.apiKey as string;
    } catch {
      throw new Error("Failed to authenticate with the transcription service. Please try again.");
    }
  };

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
        wakeLockRef.current.addEventListener?.('release', () => { wakeLockRef.current = null; });
      }
    } catch (e) {
      console.warn("Wake lock unavailable:", e);
    }
  };

  // Opens (or re-opens) the Soniox socket; audio capture keeps running across reconnects.
  const openSocket = useCallback(async () => {
    if (!captureNodeRef.current || userStoppedRef.current) return;

    const sonioxApiKey = await fetchSonioxKey();
    if (userStoppedRef.current) return;

    const translate = useAppStore.getState().isTranslationEnabled;
    const languageHints = useAppStore.getState().selectedLanguages;

    const ws = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    // A new socket restarts speaker numbering, so start a new speaker block.
    origSpeakerRef.current = null;
    transSpeakerRef.current = null;
    if (finalOrigRef.current && !finalOrigRef.current.endsWith("\n\n")) finalOrigRef.current += "\n\n";
    if (finalTransRef.current && !finalTransRef.current.endsWith("\n")) finalTransRef.current += "\n";

    let configured = false;
    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
      setIsConnecting(false);
      setIsListening(true);

      ws.send(JSON.stringify({
        api_key: sonioxApiKey,
        model: "stt-rt-v4",
        audio_format: "pcm_s16le",
        sample_rate: PCM_SAMPLE_RATE,
        num_channels: 1,
        language_hints: languageHints,
        enable_language_identification: true,
        enable_speaker_diarization: true,
        enable_endpoint_detection: true,
        ...(translate ? { translation: { type: "one_way", target_language: TRANSLATION_TARGET } } : {}),
      }));
      configured = true;
    };

    captureNodeRef.current.port.onmessage = (e) => {
      const current = wsRef.current;
      if (configured && current === ws && ws.readyState === WebSocket.OPEN) ws.send(e.data);
    };

    ws.onmessage = (e) => {
      const res = JSON.parse(e.data);
      if (res.error_code) {
        console.error(`Stream Error: ${res.error_code} - ${res.error_message}`);
        return;
      }

      const finalOrig: Token[] = [];
      const finalTrans: Token[] = [];
      const pendingOrig: Token[] = [];
      const pendingTrans: Token[] = [];

      for (const token of (res.tokens || []) as Token[]) {
        if (!token.text) continue;
        const isTranslation = token.translation_status === 'translation';
        if (token.is_final) (isTranslation ? finalTrans : finalOrig).push(token);
        else (isTranslation ? pendingTrans : pendingOrig).push(token);
      }

      // Append finalized tokens incrementally (never re-render the whole history).
      if (finalOrig.length) {
        const r = renderOriginal(finalOrig, origSpeakerRef.current);
        finalOrigRef.current += r.text;
        origSpeakerRef.current = r.speaker;
      }
      if (finalTrans.length) {
        const r = renderTranslation(finalTrans, transSpeakerRef.current);
        finalTransRef.current += r.text;
        transSpeakerRef.current = r.speaker;
      }

      const pendingOrigText = renderOriginal(pendingOrig, origSpeakerRef.current).text;
      const pendingTransText = renderTranslation(pendingTrans, transSpeakerRef.current).text;
      const idle = pendingOrig.length === 0 && pendingTrans.length === 0;

      const id = `${sessionIdRef.current}-${itemIndexRef.current}`;
      const shouldRollover = idle && finalOrigRef.current.length > ITEM_ROLLOVER_CHARS;

      addOrUpdateTranscriptItem({
        id,
        role: "user",
        text: finalOrigRef.current + pendingOrigText,
        translation: translate || finalTransRef.current ? finalTransRef.current + pendingTransText : undefined,
        isFinal: shouldRollover || res.finished || false,
      });

      if (shouldRollover) {
        itemIndexRef.current += 1;
        finalOrigRef.current = "";
        finalTransRef.current = "";
        origSpeakerRef.current = null;
        transSpeakerRef.current = null;
      }
    };

    ws.onerror = (e) => console.error("WebSocket error:", e);
    ws.onclose = () => {
      if (wsRef.current !== ws) return; // superseded by a deliberate restart or stop
      wsRef.current = null;
      // Unexpected drop (network blip, server limit): keep the audio capture alive and reconnect.
      scheduleReconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setIsListening, setIsConnecting, addOrUpdateTranscriptItem]);

  function scheduleReconnect() {
    if (userStoppedRef.current) return;
    const attempt = reconnectAttemptsRef.current++;
    const delay = Math.min(500 * 2 ** attempt, MAX_RECONNECT_DELAY_MS);
    console.warn(`Soniox socket closed unexpectedly, reconnecting in ${delay}ms`);
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      openSocket().catch((err) => {
        console.error("Reconnect failed:", err);
        scheduleReconnect();
      });
    }, delay);
  }

  const stopListening = useCallback(() => {
    if (!useAppStore.getState().isListening && userStoppedRef.current) return;
    userStoppedRef.current = true;

    // Note: saving is handled in the app page (de-duped auto-save + title generation),
    // which fires when isListening flips to false.

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      if (ws.readyState === WebSocket.OPEN) ws.send(""); // Tell Soniox we are done streaming
      setTimeout(() => ws.close(), 500); // Let Soniox process the final chunk
    }

    if (captureNodeRef.current) {
      captureNodeRef.current.port.onmessage = null;
      captureNodeRef.current.disconnect();
      captureNodeRef.current = null;
    }
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
    if (sysStreamRef.current) sysStreamRef.current.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    sysStreamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') audioCtxRef.current.close();
    audioCtxRef.current = null;

    wakeLockRef.current?.release?.().catch(() => {});
    wakeLockRef.current = null;

    setIsListening(false);
    setIsConnecting(false);
  }, [setIsListening, setIsConnecting]);

  const connect = useCallback(async (isResume: boolean = false) => {
    try {
      // Phones can't share tab/system audio, so they always listen through the mic.
      const systemAudioSupported = canCaptureSystemAudio();
      const useSystemAudio = isSystemAudioEnabled && systemAudioSupported;
      const useMic = isMicEnabled || !systemAudioSupported;
      if (!useMic && !useSystemAudio) {
        throw new Error("Please enable at least one audio source (Microphone or System Audio).");
      }

      // Create the AudioContext synchronously inside the click so iOS Safari allows it to run.
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      audioCtx.resume().catch(() => {});

      setIsConnecting(true);
      userStoppedRef.current = false;
      reconnectAttemptsRef.current = 0;
      if (!isResume) clearTranscript();

      sessionIdRef.current = `stream-session-${Date.now()}`;
      itemIndexRef.current = 0;
      finalOrigRef.current = "";
      finalTransRef.current = "";

      // Validate credentials before prompting for mic / screen share.
      await fetchSonioxKey();

      let micStream: MediaStream | null = null;
      if (useMic) {
        try {
          // For movies/speakers heard through the mic, voice-call processing
          // (noise suppression / echo cancellation) strips out the audio we want.
          const movieMode = useAppStore.getState().isTranslationEnabled || !systemAudioSupported;
          const audioConstraints: MediaTrackConstraints = {
            noiseSuppression: !movieMode,
            echoCancellation: !movieMode,
            autoGainControl: true,
          };
          if (selectedMicId && selectedMicId !== "default") {
            audioConstraints.deviceId = { exact: selectedMicId };
          }
          micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
          micStreamRef.current = micStream;
        } catch {
          throw new Error("Microphone access is required or was denied.");
        }
      }

      // Share a screen/tab to capture System Audio (e.g. the movie tab)
      let sysStream: MediaStream | null = null;
      if (useSystemAudio) {
        try {
          sysStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          sysStreamRef.current = sysStream;
          // If the user ends sharing from the browser bar and there's no mic, stop cleanly.
          sysStream.getVideoTracks()[0]?.addEventListener('ended', () => {
            if (!micStreamRef.current) stopListening();
          });
        } catch {
          console.warn("User cancelled system audio/screen share.");
        }
      }

      const hasSysAudio = !!sysStream && sysStream.getAudioTracks().length > 0;
      if (!micStream && !hasSysAudio) {
        throw new Error("No audio captured. When sharing, pick the tab and tick \"Share tab audio\".");
      }

      // Mix sources -> PCM capture worklet (kept alive for the whole session).
      if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});
      const workletUrl = URL.createObjectURL(new Blob([PCM_WORKLET], { type: 'application/javascript' }));
      try {
        await audioCtx.audioWorklet.addModule(workletUrl);
      } finally {
        URL.revokeObjectURL(workletUrl);
      }
      const captureNode = new AudioWorkletNode(audioCtx, 'pcm-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
        channelCountMode: 'explicit',
        processorOptions: { targetRate: PCM_SAMPLE_RATE },
      });
      captureNodeRef.current = captureNode;

      if (micStream) audioCtx.createMediaStreamSource(micStream).connect(captureNode);
      if (sysStream && hasSysAudio) {
        audioCtx.createMediaStreamSource(new MediaStream(sysStream.getAudioTracks())).connect(captureNode);
      }
      // The graph must reach the destination for Safari to pull audio; keep it silent.
      const mute = audioCtx.createGain();
      mute.gain.value = 0;
      captureNode.connect(mute).connect(audioCtx.destination);

      await requestWakeLock();
      await openSocket();
    } catch (err: any) {
      console.error("Connection error:", err);
      alert(err.message || "Failed to start listening.");
      userStoppedRef.current = false; // let stopListening run its cleanup
      stopListening();
      setIsConnecting(false);
      setIsListening(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setIsListening, setIsConnecting, clearTranscript, selectedLanguages, selectedMicId, isMicEnabled, isSystemAudioEnabled, openSocket, stopListening]);

  // Re-open the socket with the current settings (e.g. translation toggled mid-session)
  // without interrupting audio capture or losing the transcript.
  const restartStream = useCallback(() => {
    if (userStoppedRef.current || !captureNodeRef.current) return;
    const old = wsRef.current;
    wsRef.current = null; // mark as superseded so its onclose doesn't trigger reconnect
    if (old) {
      if (old.readyState === WebSocket.OPEN) old.send("");
      setTimeout(() => old.close(), 500);
    }
    openSocket().catch((err) => {
      console.error("Restart failed:", err);
      scheduleReconnect();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSocket]);

  // Mobile browsers suspend audio/wake lock when backgrounded; recover on return.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || userStoppedRef.current) return;
      requestWakeLock();
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().catch(() => {});
      if (!wsRef.current && !reconnectTimerRef.current) scheduleReconnect();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { connect, stopListening, restartStream };
}
