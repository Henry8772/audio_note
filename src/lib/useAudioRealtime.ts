import { useRef, useCallback } from 'react';
import { useAppStore } from './store';

export function useAudioRealtime() {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const {
    setIsListening,
    setIsConnecting,
    addOrUpdateTranscriptItem,
    clearTranscript,
  } = useAppStore();

  const connect = useCallback(async () => {
    try {
      setIsConnecting(true);
      clearTranscript();

      // 1. Request microphone IMMEDIATELY during the click gesture
      let ms: MediaStream;
      try {
        ms = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = ms;
      } catch (e) {
        console.warn("Microphone not available", e);
        throw new Error("Microphone access is required.");
      }

      // 2. Fetch the Ephemeral Token from your server
      const res = await fetch("/api/session");
      if (!res.ok) throw new Error("Failed to get session token");
      const data = await res.json();
      const token = data.client_secret.value;

      // 3. Initialize WebRTC Peer Connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Add the local microphone track to the connection
      pc.addTrack(ms.getTracks()[0]);

      // 4. Set up Data Channel for sending/receiving events
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        setIsConnecting(false);
        setIsListening(true);
        
        // Send our session configuration once the channel is open
        dc.send(JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text"], // Add "audio" here if you want it to speak
            instructions: "You are a real-time meeting transcriber. Listen to the conversation and immediately transcribe the speech verbatim. Do not add any conversational filler or answer questions.",
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 200,
            }
          }
        }));
      };

      dc.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        
        if (msg.type === "response.text.delta") {
          addOrUpdateTranscriptItem({
            id: msg.item_id || msg.response_id,
            role: "assistant",
            text: msg.delta,
            isFinal: false,
          });
        } else if (msg.type === "response.text.done") {
          addOrUpdateTranscriptItem({
            id: msg.item_id || msg.response_id,
            role: "assistant",
            text: msg.text,
            isFinal: true,
          });
        } else if (msg.type === "conversation.item.input_audio_transcription.completed") {
           addOrUpdateTranscriptItem({
            id: msg.item_id,
            role: "user",
            text: msg.transcript,
            isFinal: true
          });
        }
      };

      // 5. Start the session using Session Description Protocol (SDP)
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch("https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        console.error("Failed to get SDP answer:", errorText);
        throw new Error(`Realtime API SDP error: ${sdpResponse.status}`);
      }

      const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer as RTCSessionDescriptionInit);

    } catch (err) {
      console.error("Connection error:", err);
      setIsConnecting(false);
      setIsListening(false);
    }
  }, [setIsListening, setIsConnecting, addOrUpdateTranscriptItem, clearTranscript]);

  const stopListening = useCallback(() => {
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setIsListening(false);
    setIsConnecting(false);
  }, [setIsListening, setIsConnecting]);

  return { connect, stopListening };
}
