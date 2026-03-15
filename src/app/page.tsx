"use client";

import { useEffect, useRef } from "react";
import { Mic, Square, Loader2, List, FileText } from "lucide-react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAppStore } from "@/lib/store";
import { useAudioRealtime } from "@/lib/useAudioRealtime";

export default function Home() {
  const {
    isListening,
    isConnecting,
    transcriptItems,
    summary,
    setSummary,
    lastSummaryTime,
    setLastSummaryTime
  } = useAppStore();

  const { connect, stopListening } = useAudioRealtime();
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcriptItems]);

  // Summarize loop every 30 seconds
  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isListening) {
      interval = setInterval(async () => {
        const now = Date.now();
        if (now - lastSummaryTime >= 30000 && transcriptItems.length > 0) {
          try {
            // Grab the text from the transcript (ideally rolling window, but here we just take all for brevity)
            const textToSummarize = transcriptItems
                .map(i => `${i.role === 'user' ? 'Speaker' : 'Model'}: ${i.text}`)
                .join('\\n');

            const res = await fetch('/api/summarize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                transcript: textToSummarize,
                previousSummary: summary
              })
            });
            
            if (res.ok) {
              const data = await res.json();
              if (data.summary) {
                setSummary(data.summary);
                setLastSummaryTime(now);
              }
            }
          } catch (e) {
            console.error("Failed to summarize", e);
          }
        }
      }, 5000);
    }

    return () => clearInterval(interval);
  }, [isListening, transcriptItems, summary, lastSummaryTime, setSummary, setLastSummaryTime]);

  return (
    <main className="h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-white/10 bg-zinc-900/50 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
            <Mic className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Meeting Assistant</h1>
        </div>

        <div className="flex items-center gap-4">
          {isListening && (
            <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 px-3 py-1.5 rounded-full border border-green-400/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              Active
            </div>
          )}

          <button
            onClick={isListening ? stopListening : connect}
            disabled={isConnecting}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-300 ${
              isConnecting 
                ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                : isListening 
                  ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20' 
                  : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-600/20'
            }`}
          >
            {isConnecting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Connecting</>
            ) : isListening ? (
              <><Square className="w-4 h-4 fill-current" /> Stop Listening</>
            ) : (
              <><Mic className="w-4 h-4" /> Start Assistant</>
            )}
          </button>
        </div>
      </header>

      {/* Main Dual-Pane Workspace */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 h-[calc(100vh-4rem)]">
        
        {/* Left Pane: Raw Transcript */}
        <div className="border-r border-white/10 flex flex-col h-full bg-zinc-950/50">
          <div className="h-12 border-b border-white/5 flex items-center px-4 shrink-0 bg-zinc-900/30">
            <List className="w-4 h-4 text-zinc-400 mr-2" />
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">Live Transcript</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {transcriptItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600">
                <List className="w-12 h-12 mb-4 opacity-20" />
                <p>No transcript data yet.</p>
                <p className="text-sm mt-1">Click "Start Assistant" to begin listening.</p>
              </div>
            ) : (
              transcriptItems.map((item, idx) => {
                // Determine if we should group them, but keeping it simple for now
                const isUser = item.role === 'user';
                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    key={item.id + idx} 
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                  >
                    <span className="text-xs text-zinc-500 mb-1 ml-1 font-medium select-none">
                      {isUser ? "Speaker (You/Meeting)" : "Model (Transcriber)"}
                    </span>
                    <div className={`px-4 py-3 rounded-2xl max-w-[85%] ${
                      isUser 
                        ? 'bg-blue-600/20 text-blue-100 border border-blue-500/20 rounded-tr-none' 
                        : 'bg-zinc-800/50 text-zinc-200 border border-zinc-700 rounded-tl-none'
                    }`}>
                      <span className={item.isFinal ? '' : 'animate-pulse'}>
                        {item.text}
                      </span>
                    </div>
                  </motion.div>
                );
              })
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Right Pane: Clean Summary */}
        <div className="flex flex-col h-full bg-zinc-950">
          <div className="h-12 border-b border-white/5 flex items-center px-4 shrink-0 bg-zinc-900/30">
            <FileText className="w-4 h-4 text-zinc-400 mr-2" />
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">AI Meeting Notes</h2>
            {isListening && transcriptItems.length > 0 && (
               <span className="ml-auto text-xs text-zinc-500 flex items-center">
                 <Loader2 className="w-3 h-3 animate-spin mr-1.5" /> Auto-updating every 30s
               </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-8">
            {!summary ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-600">
                <FileText className="w-12 h-12 mb-4 opacity-20" />
                <p>Waiting for enough context to generate summary...</p>
              </div>
            ) : (
              <div className="prose prose-invert prose-zinc max-w-none prose-h1:text-2xl prose-h2:text-xl prose-a:text-blue-400">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {summary}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  );
}
