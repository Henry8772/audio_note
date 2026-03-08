"use client";

import { useState, useRef } from "react";
import { Upload, Link as LinkIcon, FileVideo, Music, Loader2, CheckCircle2, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { extractAndChunkAudio } from "@/lib/ffmpeg";
import clsx from "clsx";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"upload" | "url">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");

  const [statusMsg, setStatusMsg] = useState("");
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcription, setTranscription] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const startProcessing = async (source: File | string) => {
    setIsProcessing(true);
    setTranscription("");
    setStatusMsg("Initializing processing...");
    setProgress(0);

    try {
      // 1. Extract and chunk audio
      const chunks = await extractAndChunkAudio(
        source,
        (msg) => setStatusMsg(msg),
        (prog) => setProgress(prog)
      );

      setStatusMsg(`Sending ${chunks.length} chunks for transcription...`);
      setProgress(0);

      // 2. Transcribe chunks sequentially
      let fullText = "";
      for (let i = 0; i < chunks.length; i++) {
        setStatusMsg(`Transcribing chunk ${i + 1} of ${chunks.length}...`);
        setProgress(Math.round(((i) / chunks.length) * 100));

        const formData = new FormData();
        formData.append("audio", chunks[i], `chunk_${i}.mp3`);

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(`Transcription failed: ${errorData.error}`);
        }

        const data = await res.json();
        fullText += data.text + "\n\n";
        setTranscription(fullText);
        setProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

      setStatusMsg("Transcription complete!");
      setProgress(100);

    } catch (error: any) {
      console.error(error);
      setStatusMsg(`Error: ${error.message || "Unknown error occurred"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center py-20 px-4 relative overflow-hidden">
      {/* Background aesthetic blobs */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px] -z-10" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-pink-600/20 rounded-full blur-[120px] -z-10" />

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl flex flex-col items-center mb-12"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-white/10 rounded-2xl glass-panel text-glow">
            <Music className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Audio<span className="gradient-text">Note</span></h1>
        </div>
        <p className="text-zinc-400 text-lg text-center max-w-lg mb-8">
          Extract flawless multilingual transcriptions directly from your MP4 audio tracks. Powered by GPT-4o Audio.
        </p>

        {/* Workspace Card */}
        <div className="w-full glass-panel rounded-3xl p-6 sm:p-10 relative overflow-hidden">

          {/* Tabs */}
          <div className="flex bg-white/5 rounded-xl p-1 mb-8 w-fit mx-auto border border-white/10">
            <button
              onClick={() => setActiveTab("upload")}
              className={clsx(
                "px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2",
                activeTab === "upload" ? "bg-white/15 text-white shadow-lg" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
              )}
            >
              <Upload className="w-4 h-4" /> Local MP4
            </button>
            <button
              onClick={() => setActiveTab("url")}
              className={clsx(
                "px-6 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 flex items-center gap-2",
                activeTab === "url" ? "bg-white/15 text-white shadow-lg" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
              )}
            >
              <LinkIcon className="w-4 h-4" /> Link URL
            </button>
          </div>

          {!isProcessing && transcription === "" && (
            <AnimatePresence mode="wait">
              {activeTab === "upload" ? (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col items-center"
                >
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full glass-panel-hover border-2 border-dashed border-white/20 rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer group mb-6"
                  >
                    <input
                      type="file"
                      accept="video/mp4,audio/*"
                      className="hidden"
                      ref={fileInputRef}
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                      <FileVideo className="w-8 h-8 text-purple-400" />
                    </div>
                    {file ? (
                      <p className="text-xl font-medium text-white">{file.name}</p>
                    ) : (
                      <>
                        <p className="text-xl font-medium text-white mb-2">Drag & drop your file</p>
                        <p className="text-zinc-400 text-sm">MP4, M4A, or MP3 (Max browser limit)</p>
                      </>
                    )}
                  </div>
                  <button
                    disabled={!file}
                    onClick={() => file && startProcessing(file)}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 font-bold text-white shadow-[0_0_20px_rgba(157,78,221,0.4)] hover:shadow-[0_0_30px_rgba(157,78,221,0.6)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Start Transcription
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="url"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col gap-6"
                >
                  <div className="relative">
                    <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                      <LinkIcon className="w-5 h-5 text-zinc-400" />
                    </div>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="Paste a direct URL to an MP4/Audio file..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-4 pl-12 pr-4 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all duration-300"
                    />
                  </div>
                  <button
                    disabled={!url}
                    onClick={() => url && startProcessing(url)}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 font-bold text-white shadow-[0_0_20px_rgba(157,78,221,0.4)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Start Transcription
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          )}

          {/* Processing State */}
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12"
            >
              <div className="relative w-24 h-24 mb-8">
                <Loader2 className="w-full h-full text-purple-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-bold">{progress}%</span>
                </div>
              </div>
              <h3 className="text-xl font-bold mb-2 text-white">{statusMsg}</h3>
              <p className="text-zinc-400 text-center max-w-sm">
                For large files, this process runs in chunks and may take several minutes. Please do not close the window.
              </p>

              {/* Progress Bar Container */}
              <div className="w-full max-w-md h-2 bg-white/10 rounded-full mt-8 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "linear", duration: 0.5 }}
                />
              </div>
            </motion.div>
          )}

          {/* Result State */}
          {!isProcessing && transcription !== "" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-green-400" />
                  <h3 className="text-xl font-bold text-white">Transcription Complete</h3>
                </div>
                <button
                  onClick={() => setTranscription("")}
                  className="text-sm text-zinc-400 hover:text-white transition-colors flex items-center gap-1"
                >
                  Start Over <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-black/40 border border-white/5 rounded-2xl p-6 max-h-[500px] overflow-y-auto w-full prose prose-invert">
                {transcription.split('\n').map((paragraph, idx) => (
                  <p key={idx} className="text-zinc-200 leading-relaxed text-lg mb-4">{paragraph}</p>
                ))}
              </div>

              <button
                onClick={() => {
                  const blob = new Blob([transcription], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'transcription.txt';
                  a.click();
                }}
                className="mt-6 w-full py-4 rounded-xl bg-white/10 hover:bg-white/20 font-bold text-white border border-white/10 transition-all duration-300"
              >
                Download as TXT
              </button>
            </motion.div>
          )}

        </div>
      </motion.div>
    </main>
  );
}
