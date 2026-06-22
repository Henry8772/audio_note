import { useRef, useCallback } from 'react';
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
    addOrUpdateTranscriptItem,
    clearTranscript,
    selectedLanguages,
    selectedMicId,
    isMicEnabled,
    isSystemAudioEnabled,
  } = useAppStore();

  const connect = useCallback(async (isResume: boolean = false) => {
    try {
      if (!isMicEnabled && !isSystemAudioEnabled) {
        throw new Error("Please enable at least one audio source (Microphone or System Audio).");
      }

      setIsConnecting(true);
      if (!isResume) {
        clearTranscript();
      }

      const sessionId = `stream-session-${Date.now()}`;

      // Mint a short-lived temporary Soniox key so we can connect directly
      // (no Cloudflare proxy) without exposing the long-lived API key.
      let sonioxApiKey: string;
      try {
        const tokenRes = await fetch("/api/soniox-token", { method: "POST" });
        if (!tokenRes.ok) throw new Error("token request failed");
        const tokenData = await tokenRes.json();
        sonioxApiKey = tokenData.apiKey;
        if (!sonioxApiKey) throw new Error("no key returned");
      } catch (e) {
        throw new Error("Failed to authenticate with the transcription service. Please try again.");
      }

      // 1. Get Microphone
      let micStream: MediaStream | null = null;
      if (isMicEnabled) {
        try {
          const audioConstraints: any = { noiseSuppression: true, echoCancellation: true, autoGainControl: true };
          if (selectedMicId && selectedMicId !== "default") {
            audioConstraints.deviceId = { exact: selectedMicId };
          }
          micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
          micStreamRef.current = micStream;
        } catch (e) {
          throw new Error("Microphone access is required or was denied.");
        }
      }

      // 2. Ask user to share a screen/tab to capture System Audio
      let sysStream: MediaStream | null = null;
      if (isSystemAudioEnabled) {
        try {
          // Only attempt getDisplayMedia if it exists (not on mobile browsers)
          if (navigator.mediaDevices.getDisplayMedia) {
            sysStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            sysStreamRef.current = sysStream;
          }
        } catch (e) {
          console.warn("User cancelled system audio/screen share.");
        }
      }

      // 3. Mix the audio streams using Web Audio API
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const destination = audioCtx.createMediaStreamDestination();

      if (micStream) {
        const micSource = audioCtx.createMediaStreamSource(micStream);
        micSource.connect(destination);
      }

      if (sysStream && sysStream.getAudioTracks().length > 0) {
        const sysAudioStream = new MediaStream(sysStream.getAudioTracks());
        const sysSource = audioCtx.createMediaStreamSource(sysAudioStream);
        sysSource.connect(destination);
      }

      // Connect directly to the Soniox real-time WebSocket
      const ws = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");
      wsRef.current = ws;

      // 6. Set up the Native Browser MediaRecorder using the Mixed Audio
      // Soniox auto-detects WebM, so this works perfectly out of the box!
      const mediaRecorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      let finalTokens: any[] = [];

      // Helper function to render tokens into readable text
      const renderTokens = (tokensList: any[]) => {
        let textParts = [];
        let currentSpeaker = null;

        for (const token of tokensList) {
          let text = token.text;

          // Remove programmatic tags like <end> returned by Soniox
          text = text.replace(/<[^>]+>/g, "");

          if (token.speaker && token.speaker !== currentSpeaker) {
            if (currentSpeaker !== null) textParts.push("\n\n");
            currentSpeaker = token.speaker;
            // Bold the speaker name for readability
            textParts.push(`**Speaker ${currentSpeaker}:** `);
            // Trim leading space when starting a new speaker block
            text = text.trimStart();
          }

          // We ignore token.language as requested, preventing [zh] labels
          textParts.push(text);
        }
        return textParts.join("");
      };

      ws.onopen = () => {
        setIsConnecting(false);
        setIsListening(true);

        // Send Initial Soniox Config (temporary key authenticates the stream)
        ws.send(JSON.stringify({
          api_key: sonioxApiKey,
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
          // Soniox accepts binary WebM frames directly
          ws.send(e.data);
        }
      };

      ws.onmessage = (e) => {
        const res = JSON.parse(e.data);

        if (res.error_code) {
          console.error(`Stream Error: ${res.error_code} - ${res.error_message}`);
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
        const allTokens = [...finalTokens, ...nonFinalTokens];
        const fullTranscript = renderTokens(allTokens);

        // Update the UI with a unique session bubble
        addOrUpdateTranscriptItem({
          id: sessionId,
          role: "user",
          text: fullTranscript,
          isFinal: res.finished || false
        });
      };

      ws.onerror = (e) => console.error("WebSocket error:", e);
      ws.onclose = () => stopListening();

    } catch (err: any) {
      console.error("Connection error:", err);
      alert(err.message || "Failed to start listening.");
      setIsConnecting(false);
      setIsListening(false);
    }
  }, [setIsListening, setIsConnecting, addOrUpdateTranscriptItem, clearTranscript, selectedLanguages, selectedMicId, isMicEnabled, isSystemAudioEnabled]);

  const stopListening = useCallback(() => {
    // 0. Guard against multiple calls
    if (!useAppStore.getState().isListening) return;

    // Note: saving is handled in the app page (de-duped auto-save + title generation),
    // which fires when isListening flips to false.

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (wsRef.current) {
      wsRef.current.send(""); // Tell Soniox we are done streaming
      // Add a tiny delay before closing so Soniox can process the final chunk
      setTimeout(() => wsRef.current?.close(), 500);
      wsRef.current = null;
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
  }, [setIsListening, setIsConnecting]);

  return { connect, stopListening };
}
