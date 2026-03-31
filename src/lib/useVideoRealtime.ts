import { useRef, useCallback, useState } from 'react';
import { useAppStore } from './store';

export function useVideoRealtime() {
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sysStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // We keep a local transcript state for the demo to avoid polluting the global app store if we don't want to
  const { selectedLanguages, workspaceViews } = useAppStore();
  const [transcriptItems, setTranscriptItems] = useState<any[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [hasRecordedSrt, setHasRecordedSrt] = useState(false);

  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const srtChunksRef = useRef<Array<{start: number, end: number, text: string}>>([]);
  const lastChunkStartRef = useRef<number>(0);
  const currentChunkTextRef = useRef<string>("");
  const fallbackStartTimeRef = useRef<number>(0);

  const connect = useCallback(async (videoElement?: HTMLVideoElement | null) => {
    try {
      setIsConnecting(true);
      setTranscriptItems([]);
      setHasRecordedSrt(false);
      srtChunksRef.current = [];
      lastChunkStartRef.current = 0;
      currentChunkTextRef.current = "";
      videoElementRef.current = videoElement || null;
      fallbackStartTimeRef.current = performance.now();
      
      const sessionId = `soniox-demo-${Date.now()}`;

      // Set up Audio Context
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = audioCtx;
      const destination = audioCtx.createMediaStreamDestination();

      if (videoElement) {
        // Local File: Extract audio from the video element
        // Note: The video element MUST be playing and user interacted to avoid AutoPlay browser policies.
        const source = audioCtx.createMediaElementSource(videoElement);
        // Connect to destination (for recording)
        source.connect(destination);
        // Connect back to normal speakers so we can hear it
        source.connect(audioCtx.destination);
      } else {
        // YouTube or Remote: Ask for System Audio Tab share
        try {
          if (navigator.mediaDevices.getDisplayMedia) {
            const sysStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            sysStreamRef.current = sysStream;
            
            if (sysStream.getAudioTracks().length > 0) {
              const sysAudioStream = new MediaStream(sysStream.getAudioTracks());
              const sysSource = audioCtx.createMediaStreamSource(sysAudioStream);
              sysSource.connect(destination);
            } else {
              throw new Error("No audio track detected in the shared tab. Please make sure to check 'Share tab audio'.");
            }
          }
        } catch (e: any) {
          throw new Error(e.message || "User cancelled system audio/screen share or audio not found.");
        }
      }

      // Fetch the Soniox API Key securely
      const keyRes = await fetch("/api/soniox-token");
      if (!keyRes.ok) throw new Error("Failed to get Soniox key");
      const { apiKey } = await keyRes.json();

      // Connect to Soniox WebSocket
      const ws = new WebSocket("wss://stt-rt.soniox.com/transcribe-websocket");
      wsRef.current = ws;

      const mediaRecorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;

      let finalTokens: any[] = [];

      const renderTokens = (tokensList: any[]) => {
        let textParts = [];
        let currentSpeaker = null;

        for (const token of tokensList) {
          let text = token.text;
          text = text.replace(/<[^>]+>/g, "");

          if (token.speaker && token.speaker !== currentSpeaker) {
            if (currentSpeaker !== null) textParts.push("\\n\\n");
            currentSpeaker = token.speaker;
            textParts.push(`**Speaker ${currentSpeaker}:** `);
            text = text.trimStart();
          }
          textParts.push(text);
        }
        return textParts.join("");
      };

      ws.onopen = () => {
        setIsConnecting(false);
        setIsListening(true);

        const liveTranslationView = workspaceViews.find(v => v.type === 'live_translation');
        const translationConfig = liveTranslationView && liveTranslationView.language 
          ? { type: "one_way", target_language: liveTranslationView.language }
          : undefined;

        const configPayload: any = {
          api_key: apiKey,
          model: "stt-rt-v4",
          audio_format: "auto",
          language_hints: selectedLanguages,
          enable_language_identification: true,
          enable_speaker_diarization: true,
          enable_endpoint_detection: true,
        };

        if (translationConfig) {
          configPayload.translation = translationConfig;
        }

        ws.send(JSON.stringify(configPayload));
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
        
        let currentTimeSec = videoElementRef.current 
            ? videoElementRef.current.currentTime 
            : ((performance.now() - fallbackStartTimeRef.current) / 1000);

        if (res.tokens) {
          for (const token of res.tokens) {
            if (token.text) {
              if (token.is_final) {
                finalTokens.push(token);
                
                // Chunk sentences for SRT Recording
                let cleanText = token.text.replace(/<[^>]+>/g, "");
                
                if (currentChunkTextRef.current === "") {
                    // Try to guess a more accurate start time based on token duration if available
                    let tokenDuration = token.duration_ms ? (token.duration_ms / 1000) : 0.4;
                    lastChunkStartRef.current = Math.max(0, currentTimeSec - tokenDuration); 
                }
                
                currentChunkTextRef.current += cleanText;
                
                // Finish chunk on punctuation or excessive length
                if (/[.!?]\s*$/.test(cleanText) || currentChunkTextRef.current.length > 70) {
                    srtChunksRef.current.push({
                        start: lastChunkStartRef.current,
                        end: currentTimeSec + 0.2, // Pad end slightly
                        text: currentChunkTextRef.current.trim()
                    });
                    currentChunkTextRef.current = "";
                    setHasRecordedSrt(true);
                }
              } else {
                nonFinalTokens.push(token);
              }
            }
          }
        }

        const allTokens = [...finalTokens, ...nonFinalTokens];
        const originalTokens = allTokens.filter(t => !t.translation_status || t.translation_status === 'none' || t.translation_status === 'original');

        const fullTranscript = renderTokens(originalTokens);

        setTranscriptItems(prev => {
            const copy = [...prev];
            const existingIdx = copy.findIndex(item => item.id === sessionId);
            if (existingIdx > -1) {
                copy[existingIdx] = {
                    id: sessionId,
                    role: "user",
                    text: fullTranscript,
                    isFinal: res.finished || false
                };
            } else {
                copy.push({
                    id: sessionId,
                    role: "user",
                    text: fullTranscript,
                    isFinal: res.finished || false
                });
            }
            return copy;
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
  }, [selectedLanguages, workspaceViews]);

  const stopListening = useCallback(() => {
    // Flush remaining chunk to SRT
    if (currentChunkTextRef.current.trim()) {
       const finalTime = videoElementRef.current ? videoElementRef.current.currentTime : ((performance.now() - fallbackStartTimeRef.current)/1000);
       srtChunksRef.current.push({
           start: lastChunkStartRef.current,
           end: finalTime + 0.5,
           text: currentChunkTextRef.current.trim()
       });
       currentChunkTextRef.current = "";
       setHasRecordedSrt(true);
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (wsRef.current) {
      wsRef.current.send("");
      setTimeout(() => wsRef.current?.close(), 500);
      wsRef.current = null;
    }
    
    if (sysStreamRef.current) sysStreamRef.current.getTracks().forEach(t => t.stop());
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        // It's possible to fail if it's already closed
        try {
            audioCtxRef.current.close();
        } catch(e) {}
    }

    setIsListening(false);
    setIsConnecting(false);
  }, []);

  const formatTimeSRT = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  };

  const getSrtContent = useCallback(() => {
      let out = "";
      srtChunksRef.current.forEach((chunk, i) => {
          out += `${i + 1}\n`;
          out += `${formatTimeSRT(chunk.start)} --> ${formatTimeSRT(chunk.end)}\n`;
          out += `${chunk.text}\n\n`;
      });
      return out;
  }, []);

  return { connect, stopListening, isListening, isConnecting, transcriptItems, getSrtContent, hasRecordedSrt };
}
