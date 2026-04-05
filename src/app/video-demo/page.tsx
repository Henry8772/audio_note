"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, ArrowLeft, Youtube, Upload, Play, Square, Loader2, LayoutTemplate, X, Subtitles, Video } from "lucide-react";
import { useVideoRealtime } from "@/lib/useVideoRealtime";

export default function VideoDemoPage() {
  const [sourceType, setSourceType] = useState<"youtube" | "local" | null>(null);

  // YouTube State
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [embedId, setEmbedId] = useState("");

  // Subtitles Model
  interface Subtitle {
    id: string;
    start: number;
    end: number;
    text: string;
  }

  // Local Video State
  const [localVideoFile, setLocalVideoFile] = useState<File | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string>("");
  const [subtitleFile, setSubtitleFile] = useState<File | null>(null);
  const [parsedSubtitles, setParsedSubtitles] = useState<Subtitle[]>([]);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [showOriginals, setShowOriginals] = useState<boolean>(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const { connect, stopListening, isListening, isConnecting, transcriptItems, getSrtContent, hasRecordedSrt } = useVideoRealtime();

  const handleDownloadSRT = () => {
    if (!getSrtContent) return;
    const srt = getSrtContent();
    const blob = new Blob([srt], { type: 'text/srt' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hearo-baseline.srt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Load YouTube ID
  const handleYoutubeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrl) return;

    try {
      let id = "";
      const urlObj = new URL(youtubeUrl);
      if (urlObj.hostname.includes("youtube.com")) {
        if (urlObj.pathname.includes("/watch")) {
          id = urlObj.searchParams.get("v") || "";
        } else if (urlObj.pathname.startsWith("/embed/")) {
          id = urlObj.pathname.split("/")[2];
        } else if (urlObj.pathname.startsWith("/shorts/")) {
          id = urlObj.pathname.split("/")[2];
        }
      } else if (urlObj.hostname.includes("youtu.be")) {
        id = urlObj.pathname.slice(1);
      } else if (youtubeUrl.length === 11) {
        id = youtubeUrl; // fallback if they just pasted the ID
      }

      // Sometimes URLs have extra parameters, just take the first 11 chars of the ID if it's longer
      // Though robust ids are typically 11 chars
      if (id && id.length >= 11) {
        setEmbedId(id.substring(0, 11));
      } else {
        alert("Could not detect a valid YouTube Video ID from that link.");
      }
    } catch (err) {
      if (youtubeUrl.length === 11) {
        setEmbedId(youtubeUrl);
      } else {
        alert("Invalid URL format.");
      }
    }
  };

  const handleLocalFileDrop = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('video/')) {
      setLocalVideoFile(file);
      setLocalVideoUrl(URL.createObjectURL(file));
      // Removed setSourceType so they can stay on setup screen to upload subtitles
    } else {
      alert("Please select a valid video file.");
    }
  };

  const handleSubtitleDrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.name.endsWith('.srt') || file.name.endsWith('.vtt') || file.name.endsWith('.txt'))) {
      setSubtitleFile(file);
      try {
        const text = await file.text();
        setParsedSubtitles(parseSubtitlesFile(text));
      } catch (err) {
        alert('Failed to read subtitle file');
      }
    } else {
      alert("Please select a standard .srt or .vtt subtitle file.");
    }
  };

  const handleStartTranscription = () => {
    if (isListening) {
      stopListening();
      if (videoRef.current && sourceType === 'local') {
        videoRef.current.pause();
      }
    } else {
      if (sourceType === "local" && videoRef.current) {
        // Must play the video first manually or by code before createMediaElementSource
        videoRef.current.play().then(() => {
          connect(videoRef.current);
        }).catch(err => {
          console.error("Autoplay prevented:", err);
          alert("Please click the play button on the video first, then start transcription.");
        });
      } else if (sourceType === "youtube") {
        // Tab Share
        connect(null).catch(err => console.error(err));
      }
    }
  };

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcriptItems]);

  const resetAll = () => {
    stopListening();
    setSourceType(null);
    setYoutubeUrl("");
    setEmbedId("");
    setLocalVideoFile(null);
    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    setLocalVideoUrl("");
    setSubtitleFile(null);
    setParsedSubtitles([]);
    setCurrentTime(0);
  }

  const parseTime = (timeStr: string) => {
    const parts = timeStr.trim().split(':');
    let seconds = 0;
    const lastPart = parts[parts.length - 1]; // e.g. "05.123" or "05,123"
    const msParts = lastPart.split(/[,.]/);
    const secs = parseInt(msParts[0] || '0', 10);
    const ms = parseInt(msParts[1] || '0', 10) / 1000;
    seconds += secs + ms;

    if (parts.length >= 2) seconds += parseInt(parts[parts.length - 2], 10) * 60; // mins
    if (parts.length >= 3) seconds += parseInt(parts[parts.length - 3], 10) * 3600; // hours
    return seconds;
  }

  const parseSubtitlesFile = (content: string): Subtitle[] => {
    const subtitles: Subtitle[] = [];
    const blocks = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n\n');

    for (const block of blocks) {
      if (!block.trim() || block.includes('WEBVTT')) continue;

      const lines = block.split('\n');
      let timeLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('-->')) {
          timeLine = i;
          break;
        }
      }

      if (timeLine !== -1) {
        const timeParts = lines[timeLine].split('-->');
        const start = parseTime(timeParts[0]);
        const end = parseTime(timeParts[1]);
        const text = lines.slice(timeLine + 1).join('\n').trim();
        subtitles.push({ id: Math.random().toString(), start, end, text });
      }
    }
    return subtitles;
  }

  // Helper to sanitize Hearo transcription text
  const cleanText = (text: string) => {
    return text.replace(/\*\*Speaker \d+:\*\*/g, '')
      .replace(/\\n/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/\*\*/g, '')
      .trim();
  };

  // Helper to dynamically diff active text against original subtitles
  const getSubtleDiff = (hearoText: string) => {
    if (parsedSubtitles.length === 0 || !showOriginals) {
      return hearoText.split(/\s+/).filter(Boolean).map((word, id) => ({ id, word, added: false }));
    }

    // Get the complete block of text that the Original SRT has currently provided up to this point
    const originalText = parsedSubtitles.filter(s => s.start <= currentTime).map(s => s.text).join(' ');

    const hearoWords = hearoText.split(/\s+/).filter(Boolean);
    const originalWords = originalText.split(/\s+/).filter(Boolean);

    // Limit LCS algorithm to the most recent 100 words to keep 60fps performance during heavy strings
    const MAX_WORDS = 100;
    const mLen = hearoWords.length;
    const oLen = originalWords.length;

    const mRecent = hearoWords.slice(Math.max(0, mLen - MAX_WORDS));
    const oRecent = originalWords.slice(Math.max(0, oLen - MAX_WORDS));

    const dp = Array(mRecent.length + 1).fill(null).map(() => Array(oRecent.length + 1).fill(0));
    for (let i = 1; i <= mRecent.length; i++) {
      for (let j = 1; j <= oRecent.length; j++) {
        const mClean = mRecent[i - 1].toLowerCase().replace(/[^a-z0-9]/g, '');
        const oClean = oRecent[j - 1].toLowerCase().replace(/[^a-z0-9]/g, '');

        if (mClean === oClean && mClean.length > 0) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    let i = mRecent.length;
    let j = oRecent.length;
    const resultRecent: Array<{ word: string, added: boolean }> = [];

    while (i > 0 && j > 0) {
      const mClean = mRecent[i - 1].toLowerCase().replace(/[^a-z0-9]/g, '');
      const oClean = oRecent[j - 1].toLowerCase().replace(/[^a-z0-9]/g, '');

      if (mClean === oClean && mClean.length > 0) {
        resultRecent.unshift({ word: mRecent[i - 1], added: false });
        i--; j--;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        // Hearo has a word that isn't mapped in the Original timeline => "Extra Information Caught"
        resultRecent.unshift({ word: mRecent[i - 1], added: true });
        i--;
      } else {
        j--;
      }
    }
    while (i > 0) {
      resultRecent.unshift({ word: mRecent[i - 1], added: true });
      i--;
    }

    const oldWords = hearoWords.slice(0, Math.max(0, mLen - MAX_WORDS)).map((word) => ({ word, added: false }));
    return [...oldWords, ...resultRecent].map((res, id) => ({ ...res, id }));
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-neutral-800 selection:text-white flex flex-col overflow-hidden">
      {/* Top Navbar */}
      <nav className="h-16 border-b border-neutral-800/80 bg-black/50 backdrop-blur-md flex items-center justify-between px-6 z-50 shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/" className="hover:bg-neutral-900 p-2 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5 text-neutral-400" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.2)]">
              <Mic className="w-4 h-4 text-black" />
            </div>
            <span className="font-semibold tracking-wide text-sm hidden sm:block">Hearo Studio Demo</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {sourceType && (
            <button onClick={resetAll} className="px-3 py-1.5 rounded-full text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors">
              Change Source
            </button>
          )}
        </div>
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 w-full flex flex-col overflow-hidden relative">
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none" />

        {!sourceType || (sourceType === 'youtube' && !embedId) ? (
          // Setup View
          <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 w-full max-w-4xl mx-auto">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 mb-6 backdrop-blur-md">
                <LayoutTemplate className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-neutral-300">Studio Setup</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Select Video Source</h1>
              <p className="text-neutral-400 max-w-xl mx-auto">Upload a local video or paste a YouTube link to demonstrate Hearo&apos;s real-time accuracy against any content.</p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
              {/* YouTube Option */}
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="group">
                <div onClick={() => setSourceType('youtube')} className={`h-full cursor-pointer p-8 rounded-3xl border transition-all duration-300 bg-black/40 backdrop-blur-xl flex flex-col items-center text-center ${sourceType === 'youtube' ? 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.15)] bg-red-500/5' : 'border-neutral-800 hover:border-neutral-600 hover:bg-neutral-900/50'}`}>
                  <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6 text-red-500 group-hover:scale-110 transition-transform">
                    <Youtube className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">YouTube URL</h3>
                  <p className="text-sm text-neutral-500 mb-6">Play any YouTube video and capture its audio via Tab Share.</p>

                  {sourceType === 'youtube' && (
                    <div className="w-full mt-auto" onClick={(e) => e.stopPropagation()}>
                      <form onSubmit={handleYoutubeSubmit} className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Paste Youtube link..."
                          value={youtubeUrl}
                          onChange={(e) => setYoutubeUrl(e.target.value)}
                          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-red-500 text-white"
                        />
                        <button type="submit" className="bg-red-500 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-red-600 transition-colors">
                          Load
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </motion.div>

              {/* Local File Option */}
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="group">
                <div className="h-full rounded-3xl border border-neutral-800 bg-black/40 backdrop-blur-xl hover:border-neutral-600 transition-all duration-300 flex flex-col items-center text-center p-8">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 text-blue-400 group-hover:scale-110 transition-transform">
                    <Upload className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Local Video</h3>
                  <p className="text-sm text-neutral-500 mb-6">Upload an MP4. Optionally add standard .srt/.vtt subtitles.</p>

                  <div className="mt-auto w-full flex flex-col gap-3">
                    <label className="relative overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900/80 hover:bg-neutral-800 transition-colors py-3 px-4 cursor-pointer flex items-center justify-center gap-2">
                      <input type="file" accept="video/*" onChange={handleLocalFileDrop} className="hidden" />
                      <Video className="w-4 h-4 text-blue-400" />
                      <span className="text-blue-400 font-medium text-sm truncate max-w-[180px]">
                        {localVideoFile ? localVideoFile.name : 'Select Video...'}
                      </span>
                    </label>

                    {localVideoFile && (
                      <label className="relative overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900/80 hover:bg-neutral-800 transition-colors py-3 px-4 cursor-pointer flex items-center justify-center gap-2">
                        <input type="file" accept=".srt,.vtt,.txt" onChange={handleSubtitleDrop} className="hidden" />
                        <Subtitles className="w-4 h-4 text-neutral-300" />
                        <span className="text-neutral-300 font-medium text-sm truncate max-w-[180px]">
                          {subtitleFile ? subtitleFile.name : 'Add Subtitles (Optional)'}
                        </span>
                      </label>
                    )}

                    {localVideoFile && (
                      <button onClick={() => setSourceType("local")} className="mt-2 py-2 rounded-xl bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white transition-colors text-sm font-semibold border border-blue-500/50 w-full shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                        Enter Studio Mode
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        ) : (
          // Dual Pane Layout
          // Pure Video Widget Layout (No UI)
          <div className="absolute inset-0 z-10 overflow-hidden bg-[#020202] flex items-center justify-center p-4 md:p-8 lg:p-12">

            {/* The Demo Container - perfectly sized for capturing */}
            <div className="w-full max-w-[1200px] aspect-auto md:aspect-[16/9] min-h-[600px] bg-black rounded-3xl border border-white/10 overflow-hidden relative shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_30px_80px_rgba(0,0,0,0.8)]">

              {/* Full Background Video Player */}
              <div className="absolute inset-0 z-0">
                {sourceType === 'youtube' && embedId ? (
                  <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube-nocookie.com/embed/${embedId}?autoplay=1&cc_load_policy=1`}
                    title="YouTube video player"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    className="w-full h-full object-cover"
                  />
                ) : sourceType === 'local' && localVideoUrl ? (
                  <video
                    ref={videoRef}
                    src={localVideoUrl}
                    controls
                    className="w-full h-full object-contain"
                    onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  />
                ) : null}
              </div>

              {/* Left Side: Floating Subtitles Zone */}
              <div className="absolute top-0 left-0 w-full md:w-[45%] lg:w-[40%] h-full z-10 flex flex-col pb-[10%] px-6 md:px-12 pointer-events-none bg-gradient-to-r from-black/90 via-black/50 to-transparent">
                {/* Badge */}
                <div className={`pt-8 mb-auto transition-opacity duration-1000 ${isListening || transcriptItems.length > 0 ? "opacity-100" : "opacity-0"
                  }`}>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-xl">
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    <span className="text-sm md:text-base font-bold text-white tracking-widest uppercase shadow-sm">Ours</span>
                  </div>
                </div>

                {/* Transcript Body */}
                <div
                  ref={transcriptRef}
                  className="flex-1 overflow-y-auto space-y-5 scroll-smooth pointer-events-none pr-4"
                  style={{
                    WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 100%)',
                    maskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 100%)'
                  }}
                >
                  <AnimatePresence initial={false}>
                    {transcriptItems.map((item, idx) => {
                      const sanitizedText = cleanText(item.text);
                      if (!sanitizedText) return null; // Skip rendering if text is empty after sanitization

                      return (
                        <motion.div
                          key={item.id + idx}
                          initial={{ opacity: 0, x: -20, scale: 0.95 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          className="py-2 w-full"
                        >
                          <p className="text-xl md:text-3xl leading-relaxed tracking-wide font-medium text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] flex flex-wrap gap-x-2">
                            {getSubtleDiff(sanitizedText).map((w) => (
                              <span
                                key={w.id}
                                className={w.added ? "bg-gradient-to-r from-blue-300 to-indigo-300 bg-clip-text text-transparent font-bold" : ""}
                              >
                                {w.word}
                              </span>
                            ))}
                          </p>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>

              {/* RIGHT SIDE: Original Subtitles Zone */}
              {sourceType === 'local' && parsedSubtitles.length > 0 && showOriginals && (
                <div className="absolute top-0 right-0 w-full md:w-[45%] lg:w-[40%] h-full z-10 flex flex-col justify-end pb-[10%] px-6 md:px-12 pointer-events-none bg-gradient-to-l from-black/90 via-black/50 to-transparent">

                  {/* Badge */}
                  <div className="pt-8 mb-auto flex justify-end opacity-100 transition-opacity duration-1000">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 shadow-xl">
                      <span className="text-sm md:text-base font-bold text-white tracking-widest uppercase shadow-sm">Youtube</span>
                    </div>
                  </div>

                  {/* Transcript Body */}
                  <div
                    className="flex-1 overflow-hidden space-y-5 pointer-events-none pr-4 flex flex-col justify-end"
                    style={{ maskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 100%)', WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 30%, black 100%)' }}
                  >
                    <AnimatePresence initial={false}>
                      {parsedSubtitles
                        .filter(s => s.start <= currentTime) // Show history
                        .slice(-10) // Render bottom 10 items statically for performance
                        .map((item) => {
                          const isActive = currentTime >= item.start && currentTime <= (item.end + 2.0); // Keep highlighted for 2s after finishes
                          return (
                            <motion.div
                              key={item.id}
                              initial={{ opacity: 0, x: 20, scale: 0.95 }}
                              animate={{ opacity: isActive ? 1 : 0.3, x: 0, scale: 1, transition: { duration: 0.4 } }}
                              className="py-2 w-full text-right"
                            >
                              <p className={`text-xl md:text-3xl leading-relaxed tracking-wide font-medium drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] ${isActive ? 'text-neutral-300' : 'text-neutral-500'
                                }`}>
                                {item.text}
                              </p>
                            </motion.div>
                          );
                        })}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Stealth Start Button (Fades out when listening so recording is clean) */}
              <button
                onClick={handleStartTranscription}
                disabled={isConnecting}
                style={{ pointerEvents: isListening || isConnecting ? 'none' : 'auto' }}
                className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full text-xs font-bold tracking-widest uppercase transition-all duration-1000 backdrop-blur-md border shadow-2xl ${isListening
                  ? "opacity-0 scale-95"
                  : isConnecting
                    ? "bg-neutral-900/80 text-neutral-400 border-white/5 opacity-50"
                    : "bg-[#0a0a0a]/80 text-white border-white/20 hover:bg-white/20 hover:scale-105 cursor-pointer"
                  }`}
              >
                {isConnecting ? "Connecting..." : "Tap Anywhere or Here to Start Real-time AI"}
              </button>
              {sourceType === 'youtube' && !isListening && (
                <div className="absolute top-16 right-6 z-50 text-[10px] text-white/50 uppercase tracking-widest">
                  Don't forget to Share Audio
                </div>
              )}
            </div>

            {/* Subtitle Toggle */}
            {sourceType === 'local' && parsedSubtitles.length > 0 && (
              <div className="absolute bottom-4 right-4 z-50">
                <button
                  onClick={() => setShowOriginals(!showOriginals)}
                  className="px-4 py-2 rounded-xl bg-black/50 backdrop-blur-md border border-white/10 text-[10px] font-bold tracking-widest uppercase text-neutral-400 hover:text-white transition-colors"
                >
                  {showOriginals ? 'Turn Off Originals' : 'Turn On Originals'}
                </button>
              </div>
            )}

            {/* Export Recorded Subtitles */}
            {!isListening && hasRecordedSrt && (
              <div className="absolute bottom-4 left-4 z-50">
                <button
                  onClick={handleDownloadSRT}
                  className="px-4 py-2 rounded-xl bg-blue-600/80 backdrop-blur-md border border-blue-400/50 text-[10px] font-bold tracking-widest uppercase text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20"
                >
                  Download Demo SRT
                </button>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
