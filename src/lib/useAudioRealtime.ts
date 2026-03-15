import { useRef, useCallback } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAppStore } from './store';

export function useAudioRealtime() {
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sysStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const {
    setIsListening,
    setIsConnecting,
    isLive,
    setLiveSessionId,
    addOrUpdateTranscriptItem,
    clearTranscript,
    selectedLanguages,
    setSummaries,
    addSavedNote,
  } = useAppStore();

  const createSession = useMutation(api.mutations.createSession);
  const updateTranscript = useMutation(api.mutations.updateTranscript);
  const endSession = useMutation(api.mutations.endSession);

  const connect = useCallback(async () => {
    try {
      setIsConnecting(true);
      clearTranscript();
      setSummaries({});

      // 1. Get Microphone
      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true }
        });
        micStreamRef.current = micStream;
      } catch (e) {
        throw new Error("Microphone access is required.");
      }

      // 2. Ask user to share a screen/tab to capture System Audio
      let sysStream: MediaStream | null = null;
      try {
        sysStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        sysStreamRef.current = sysStream;
      } catch (e) {
        console.warn("User cancelled system audio/screen share.");
      }

      // 3. Mix the audio streams using Web Audio API
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const destination = audioCtx.createMediaStreamDestination();

      const micSource = audioCtx.createMediaStreamSource(micStream);
      micSource.connect(destination);

      if (sysStream && sysStream.getAudioTracks().length > 0) {
        const sysAudioStream = new MediaStream(sysStream.getAudioTracks());
        const sysSource = audioCtx.createMediaStreamSource(sysAudioStream);
        sysSource.connect(destination);
      }

      // 4. Fetch the Soniox API Key securely
      const keyRes = await fetch("/api/soniox-token");
      if (!keyRes.ok) throw new Error("Failed to get Soniox key");
      const { apiKey } = await keyRes.json();

      // 5. Connect to Soniox WebSocket
      const ws = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");
      wsRef.current = ws;

      // 6. Set up the Native Browser MediaRecorder using the Mixed Audio
      // Soniox auto-detects WebM, so this works perfectly out of the box!
      const mediaRecorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      if (useAppStore.getState().isLive) {
        try {
          // If Live is checked, hit Convex first
          const hostId = "anonymous-host"; // Optional: grab from user session later
          const sessionId = await createSession({
            title: `Live Session ${new Date().toLocaleTimeString()}`,
            hostId,
          });
          setLiveSessionId(sessionId);
        } catch (err) {
          console.error("Failed to create live session on Convex:", err);
        }
      }

      let finalTokens: Record<string, unknown>[] = [];

      // Helper function to render tokens into readable text
      const renderTokens = (final: Record<string, unknown>[], nonFinal: Record<string, unknown>[]) => {
        const textParts = [];
        let currentSpeaker = null;
        let currentLanguage = null;

        for (const token of [...final, ...nonFinal]) {
          let text = token.text as string;

          if (token.speaker && token.speaker !== currentSpeaker) {
            if (currentSpeaker !== null) textParts.push("\n\n");
            currentSpeaker = token.speaker;
            currentLanguage = null;
            textParts.push(`Speaker ${currentSpeaker}: `);
          }

          if (token.language && token.language !== currentLanguage) {
            currentLanguage = token.language;
            textParts.push(`[${currentLanguage}] `);
            text = text.trimStart();
          }

          textParts.push(text);
        }
        return textParts.join("");
      };

      ws.onopen = () => {
        setIsConnecting(false);
        setIsListening(true);

        // Send Initial Soniox Config
        ws.send(JSON.stringify({
          api_key: apiKey,
          model: "stt-rt-v4",
          audio_format: "auto", // WebM is detected automatically
          language_hints: selectedLanguages, // Use dynamic selected languages
          enable_language_identification: true,
          enable_speaker_diarization: true, // Will label Speaker 1, Speaker 2, etc.
          enable_endpoint_detection: true,
        }));

        // Tell the MediaRecorder to send a chunk of audio every 250 milliseconds
        mediaRecorder.start(250);
      };

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data);
        }
      };

      ws.onmessage = (e) => {
        const res = JSON.parse(e.data);

        if (res.error_code) {
          console.error(`Soniox Error: ${res.error_code} - ${res.error_message}`);
          return;
        }

        let nonFinalTokens: any[] = [];

        if (res.tokens) {
          for (const token of res.tokens) {
            if (token.text) {
              if (token.is_final) {
                finalTokens.push(token);
              } else {
                nonFinalTokens.push(token);
              }
            }
          }
        }

        // Generate the formatted transcript block
        const fullTranscript = renderTokens(finalTokens, nonFinalTokens);

        // Update the UI
        // Note: We use a single ID here so the bubble continuously grows and updates 
        // with the speaker diarization labels perfectly formatted.
        addOrUpdateTranscriptItem({
          id: "soniox-live-session",
          role: "user",
          text: fullTranscript,
          isFinal: res.finished || false
        });

        const liveSessionId = useAppStore.getState().liveSessionId;
        if (liveSessionId) {
          // Push to Convex
          updateTranscript({
            sessionId: liveSessionId as any,
            transcript: fullTranscript,
            hostId: "anonymous-host"
          }).catch(err => console.error("Convex updateTranscript error:", err));
        }
      };

      ws.onerror = (e) => console.error("WebSocket error:", e);
      ws.onclose = () => stopListening();

    } catch (err) {
      console.error("Connection error:", err);
      setIsConnecting(false);
      setIsListening(false);
    }
  }, [setIsListening, setIsConnecting, addOrUpdateTranscriptItem, clearTranscript, selectedLanguages, setSummaries, createSession, updateTranscript, setLiveSessionId, isLive]);

  const stopListening = useCallback(() => {
    // 1. Auto-save before destroying the current streams, if we have content
    const currentItems = useAppStore.getState().transcriptItems;
    const currentSummaries = useAppStore.getState().summaries;

    if (currentItems.length > 0) {
      const now = new Date();

      // Determine a smart title based on summary or fall back to generic timestamp
      let title = "Meeting Note";
      const defaultLangSummary = currentSummaries['en'] || Object.values(currentSummaries)[0];

      if (defaultLangSummary) {
        // Try getting the first line heading, e.g "# Discussion about X" -> "Discussion about X"
        const firstLine = defaultLangSummary.split('\\n')[0];
        if (firstLine && firstLine.startsWith('# ')) {
          title = firstLine.replace('# ', '').trim().slice(0, 50);
        } else if (firstLine) {
          title = firstLine.substring(0, 50);
        }
      }

      addSavedNote({
        id: crypto.randomUUID(),
        title: title || `Note ${now.toLocaleTimeString()}`,
        date: now.toISOString(),
        summaries: currentSummaries,
        transcriptItems: [...currentItems],
      });
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (wsRef.current) {
      wsRef.current.send(""); // Tell Soniox we are done streaming
      // Add a tiny delay before closing so Soniox can process the final chunk
      setTimeout(() => wsRef.current?.close(), 500);
      wsRef.current = null;
    }

    // Check if live session
    const finalLiveId = useAppStore.getState().liveSessionId;
    if (finalLiveId) {
      endSession({ sessionId: finalLiveId as any, hostId: "anonymous-host" })
        .catch(console.error);
      useAppStore.getState().setLiveSessionId(null);
    }

    // Stop all tracks to remove the recording/sharing indicators from the browser tab
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop());
    if (sysStreamRef.current) sysStreamRef.current.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close();
    }

    setIsListening(false);
    setIsConnecting(false);

    // UI Cleanup to prep for next run is done on connect() so user can still see what they just recorded.
  }, [setIsListening, setIsConnecting, addSavedNote, endSession]);

  return { connect, stopListening };
}
