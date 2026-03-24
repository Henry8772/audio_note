"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, List, FileText, LayoutDashboard, Clock, MoreVertical, Trash2, Lock, Save, RadioTower } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { useAppStore, TranscriptItem, SavedNote } from "@/lib/store";
import { useAudioRealtime } from "@/lib/useAudioRealtime";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

const AVAILABLE_LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'zh', label: 'ZH' },
  { code: 'es', label: 'ES' },
  { code: 'fr', label: 'FR' },
  { code: 'de', label: 'DE' },
  { code: 'ja', label: 'JA' },
];

export default function Home() {
  const {
    isListening,
    isConnecting,
    transcriptItems,
    summaries,
    setSummaries,
    lastSummaryTime,
    setLastSummaryTime,
    lastSummaryIndex,
    setLastSummaryIndex,
    lastSummarizedTextLength,
    setLastSummarizedTextLength,
    selectedLanguages,
    setSelectedLanguages,
    translationLanguages,
    setTranslationLanguages,
    activeView,
    setActiveView,
    savedNotes,
    deleteSavedNote,
    addSavedNote,
    isAuthenticated,
    setIsAuthenticated,
    selectedMicId,
    setSelectedMicId,
    freeUsageTime,
    freeUsageExceeded,
    incrementFreeUsageTime,
    setFreeUsageExceeded,
    liveSessionId,
    liveSessionHostId,
    setLiveSession
  } = useAppStore();

  const createSession = useMutation(api.mutations.createSession);
  const updateTranscriptMutation = useMutation(api.mutations.updateTranscript);
  const updateSummaryMutation = useMutation(api.mutations.updateSummary);
  const endSession = useMutation(api.mutations.endSession);

  const [isSharingLive, setIsSharingLive] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [requirePassword, setRequirePassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");

  const { connect, stopListening } = useAudioRealtime();
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // Auth State
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Free Usage Tracker (15 mins = 900 seconds)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isListening && !isAuthenticated) {
      interval = setInterval(() => {
        const state = useAppStore.getState();
        if (state.freeUsageTime >= 900) {
          state.setFreeUsageExceeded(true);
          stopListening();
          setShowAuthModal(true);
          clearInterval(interval);
        } else {
          state.incrementFreeUsageTime(1);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isListening, isAuthenticated, stopListening]);

  // Handle forcing modal if exceeded on load
  useEffect(() => {
    if (!isAuthenticated && freeUsageExceeded) {
      setShowAuthModal(true);
    }
  }, [isAuthenticated, freeUsageExceeded]);

  // Media Devices State
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    async function fetchMics() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices.filter(device => device.kind === 'audioinput');
        setAvailableMics(mics);
      } catch (err) {
        console.error("Failed to fetch media devices:", err);
      }
    }
    
    fetchMics();
    navigator.mediaDevices?.addEventListener('devicechange', fetchMics);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', fetchMics);
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcriptItems, activeView]);

  const [isSummarizing, setIsSummarizing] = useState(false);

  const triggerSummary = async () => {
    if (isSummarizing) return;
    const state = useAppStore.getState();
    const currentItems = state.transcriptItems;
    let currentIndex = state.lastSummaryIndex;
    const currentSummaries = state.summaries;
    const currentTranslationLanguages = state.translationLanguages;

    let lastItemHasGrown = false;
    if (currentItems.length > 0 && currentItems.length === currentIndex) {
      const lastItem = currentItems[currentItems.length - 1];
      if (lastItem.text.length > state.lastSummarizedTextLength + 10) {
        lastItemHasGrown = true;
        currentIndex = currentIndex - 1; // Step back to include the last item
      }
    }

    if (currentItems.length <= currentIndex) return;

    try {
      setIsSummarizing(true);
      const now = Date.now();
      const newItems = currentItems.slice(currentIndex);
      const textToSummarize = newItems
        .map(i => `${i.role === 'user' ? 'Speaker' : 'Model'}: ${i.text}`)
        .join('\\n');

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: textToSummarize,
          previousSummary: currentSummaries,
          targetLanguages: currentTranslationLanguages
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.summaries) {
          setSummaries(data.summaries);
          setLastSummaryTime(now);
          setLastSummaryIndex(currentItems.length);
          if (currentItems.length > 0) {
            useAppStore.getState().setLastSummarizedTextLength(currentItems[currentItems.length - 1].text.length);
          }
        }
      }
    } catch (e) {
      console.error("Failed to summarize", e);
    } finally {
      setIsSummarizing(false);
    }
  };


  // Export Logic
  const handleExportNotes = async () => {
    if (savedNotes.length === 0) return alert("No notes to export.");

    const zip = new JSZip();
    const folder = zip.folder("AudioNotes_Export");
    if (!folder) return;

    savedNotes.forEach(note => {
      // Serialize Note to Markdown
      const safeTitle = note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${safeTitle}_${new Date(note.date).getTime()}.md`;

      const frontmatter = `---
id: ${note.id}
title: "${note.title.replace(/"/g, '\\"')}"
date: ${note.date}
---

`;
      // For the human readable body, we will join all summaries together
      const body = Object.entries(note.summaries).map(([lang, text]) => {
        return `## ${lang.toUpperCase()}\\n\\n${text}\\n`;
      }).join("\\n") || "*No summary available*";

      // Store the raw JSON object representation of the summaries for perfect import rebuild
      const hiddenSummariesData = `\n\n<!-- AUDIO_NOTE_SUMMARIES_START\n${JSON.stringify(note.summaries)}\nAUDIO_NOTE_SUMMARIES_END -->`;
      const hiddenTranscriptData = `\n\n<!-- AUDIO_NOTE_DATA_START\n${JSON.stringify(note.transcriptItems)}\nAUDIO_NOTE_DATA_END -->`;

      const fileContent = frontmatter + body + hiddenSummariesData + hiddenTranscriptData;
      folder.file(filename, fileContent);
    });

    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "AudioNotes_Export.zip");
  };

  // Import Logic
  const handleImportNotes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    let importCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.name.endsWith('.md')) continue;

      const text = await file.text();

      // Parse basic frontmatter
      const fmMatch = text.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;

      const fmText = fmMatch[1];
      const idMatch = fmText.match(/id:\s*(.*)/);
      const titleMatch = fmText.match(/title:\s*"(.*)"/);
      const dateMatch = fmText.match(/date:\s*(.*)/);

      if (!idMatch || !titleMatch || !dateMatch) continue;

      const id = idMatch[1].trim();
      const title = titleMatch[1].trim();
      const date = dateMatch[1].trim();

      // Check if already exists to prevent duplicate imports
      if (useAppStore.getState().savedNotes.some(n => n.id === id)) continue;

      // Parse body and hidden data
      const remainder = text.replace(fmMatch[0], '').trim();

      const summariesMatch = remainder.match(/<!-- AUDIO_NOTE_SUMMARIES_START\n([\s\S]*?)\nAUDIO_NOTE_SUMMARIES_END -->/);
      const dataMatch = remainder.match(/<!-- AUDIO_NOTE_DATA_START\n([\s\S]*?)\nAUDIO_NOTE_DATA_END -->/);

      let summaries: Record<string, string> = {};
      let transcriptItems: TranscriptItem[] = [];

      if (summariesMatch) {
        try {
          summaries = JSON.parse(summariesMatch[1].trim());
        } catch (err) {
          console.error("Failed to parse summaries JSON for", title, err);
        }
      } else {
        // Fallback legacy support
        summaries = { en: remainder.replace(dataMatch ? dataMatch[0] : '', '').trim() };
      }

      if (dataMatch) {
        try {
          transcriptItems = JSON.parse(dataMatch[1].trim());
        } catch (err) {
          console.error("Failed to parse transcript data for", title, err);
        }
      }

      addSavedNote({
        id,
        title,
        date,
        summaries,
        transcriptItems
      });
      importCount++;
    }

    if (importCount > 0) {
      alert(`Successfully imported ${importCount} note(s)!`);
    } else {
      alert("No valid new notes found to import.");
    }

    // Reset input
    if (e.target) e.target.value = '';
  };

  const activeNote = savedNotes.find(n => n.id === selectedNoteId);

  const handleShareLive = async () => {
    if (!isListening) {
      alert("Please start recording first to share the live session.");
      return;
    }
    setShowShareModal(true);
    // Generate an initial random 6 character alphanumeric password
    setGeneratedPassword(Math.random().toString(36).slice(-6).toUpperCase());
    setRequirePassword(false);
  };

  const confirmShareLive = async () => {
    try {
      setIsSharingLive(true);
      setShowShareModal(false);
      const hostId = crypto.randomUUID();
      const sessionId = await createSession({
        title: "Henry's Live Meeting",
        hostId: hostId,
        password: requirePassword ? generatedPassword : undefined
      });
      
      setLiveSession(sessionId, hostId);
      
      const shareUrl = `${window.location.origin}/live/${sessionId}`;
      await navigator.clipboard.writeText(shareUrl);
      alert(`Live link copied to clipboard!\n\n${requirePassword ? `Password: ${generatedPassword}\n\nAnyone with the link and password can view the live transcription.` : `Anyone with the link can view the live transcription.`}`);
      setIsSharingLive(false);
    } catch (e) {
      console.error("Failed to create live session", e);
      setIsSharingLive(false);
      setShowShareModal(false);
      alert("Failed to create share link.");
    }
  };

  // Push Transcript Updates to Convex
  useEffect(() => {
    if (liveSessionId && liveSessionHostId && transcriptItems.length > 0) {
      const transcriptText = transcriptItems
        .map(i => `${i.role === 'user' ? 'Speaker' : 'AI Assistant'}: ${i.text}`)
        .join('\n\n');
        
      updateTranscriptMutation({
        sessionId: liveSessionId as any,
        transcript: transcriptText,
        hostId: liveSessionHostId
      }).catch((err: any) => console.error("Failed to update transcript:", err));
    }
  }, [transcriptItems, liveSessionId, liveSessionHostId, updateTranscriptMutation]);

  // Push Summary Updates to Convex
  useEffect(() => {
    if (liveSessionId && liveSessionHostId && Object.keys(summaries).length > 0) {
      const summaryText = Object.entries(summaries)
        .map(([lang, text]) => `## ${lang.toUpperCase()}\n\n${text}`)
        .join('\n\n');

      updateSummaryMutation({
        sessionId: liveSessionId as any,
        summary: summaryText,
        hostId: liveSessionHostId
      }).catch((err: any) => console.error("Failed to update summary:", err));
    }
  }, [summaries, liveSessionId, liveSessionHostId, updateSummaryMutation]);

  // End session when stopped listening
  useEffect(() => {
    if (!isListening && liveSessionId && liveSessionHostId) {
      endSession({ sessionId: liveSessionId as any, hostId: liveSessionHostId }).catch(console.error);
      setLiveSession(null, null);
      setIsSharingLive(false);
    }
  }, [isListening, liveSessionId, liveSessionHostId, endSession, setLiveSession]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setIsAuthenticating(true);
    setAuthError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsAuthenticated(true);
        setShowAuthModal(false);
      } else {
        setAuthError(data.error || 'Authentication failed');
      }
    } catch (err) {
      setAuthError('Network error connecting to auth server.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleManualSave = () => {
    if (transcriptItems.length === 0) return;
    const now = new Date();
    
    let title = "Meeting Note";
    const defaultLangSummary = summaries['en'] || Object.values(summaries)[0];
    
    if (defaultLangSummary) {
      const firstLine = defaultLangSummary.split('\n')[0];
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
      summaries: { ...summaries },
      transcriptItems: [...transcriptItems],
    });

    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="h-screen w-full bg-black text-neutral-200 flex font-sans overflow-hidden selection:bg-neutral-800 selection:text-white">
      {/* Auth Modal Overlay */}
      <AnimatePresence>
        {showAuthModal && !isAuthenticated && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center px-4"
          >
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="w-full max-w-sm p-8 bg-[#0a0a0a] border border-neutral-800 rounded-2xl shadow-xl flex flex-col items-center relative">
              {!freeUsageExceeded && (
                <button onClick={() => setShowAuthModal(false)} className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors">
                  <span className="sr-only">Close</span>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}

              <div className="w-12 h-12 bg-neutral-900 rounded-xl flex items-center justify-center mb-6 border border-neutral-800/50 shadow-sm">
                <Lock className="w-5 h-5 text-neutral-400" />
              </div>
              <h1 className="text-xl font-semibold text-white mb-2 tracking-tight">Unlock Unlimited Access</h1>
              <p className="text-sm text-neutral-500 mb-8 text-center leading-relaxed">
                {freeUsageExceeded 
                  ? "Your 15-minute free preview has ended. Please enter your access token to continue." 
                  : "Enter your special access token to unlock unlimited recordings and features."}
              </p>
              
              <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
                <div>
                   <input
                     type="password"
                     value={password}
                     onChange={e => setPassword(e.target.value)}
                     placeholder="Enter token..."
                     className="w-full bg-[#111] border border-neutral-800 rounded-lg px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-all font-mono"
                     disabled={isAuthenticating}
                   />
                   {authError && (
                     <motion.p initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="text-red-400 text-xs mt-2.5 font-medium ml-1">
                       {authError}
                     </motion.p>
                   )}
                </div>
                <button
                  type="submit"
                  disabled={isAuthenticating || !password}
                  className="w-full bg-white text-black font-semibold text-sm py-3 rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-sm"
                >
                  {isAuthenticating ? <Loader2 className="w-4 h-4 animate-spin text-neutral-500" /> : "Verify Token"}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Left Sidebar Navigation */}
      <aside className="w-16 md:w-56 h-full border-r border-neutral-800/80 bg-black flex flex-col shrink-0 py-4 px-2 md:px-4 transition-all duration-300 z-20">
        <div className="flex items-center gap-3 px-2 mb-8 mt-2">
          <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center shadow-sm shrink-0">
            <Mic className="w-3.5 h-3.5 text-black" />
          </div>
          <h1 className="text-[13px] font-semibold tracking-wide text-white hidden md:block whitespace-nowrap overflow-hidden">
            Henry's Meeting
          </h1>
        </div>

        <nav className="flex flex-col gap-1">
          <button
            onClick={() => setActiveView('record')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeView === 'record'
                ? 'bg-[#111] text-white shadow-sm border border-neutral-800'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900 border border-transparent'
              }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span className="hidden md:block">Record Area</span>
          </button>
          <button
            onClick={() => setActiveView('notes')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeView === 'notes'
                ? 'bg-[#111] text-white shadow-sm border border-neutral-800'
                : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900 border border-transparent'
              }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span className="hidden md:block">Past Notes</span>
            {savedNotes.length > 0 && (
              <span className="ml-auto hidden md:flex items-center justify-center bg-neutral-800 text-neutral-300 text-[10px] h-5 px-2 rounded-full">
                {savedNotes.length}
              </span>
            )}
          </button>
        </nav>

        <div className="mt-auto px-2">
          <p className="hidden md:block text-[10px] text-neutral-600 leading-tight">
            Data is securely saved locally to your device.
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full min-w-0 bg-[#0a0a0a] relative">
        <AnimatePresence mode="wait">

          {/* -------------------- RECORD LAYOUT -------------------- */}
          {activeView === 'record' && (
            <motion.div
              key="record-view"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col h-full w-full absolute inset-0"
            >
              {/* Header */}
              <header className="h-14 border-b border-neutral-800 bg-black flex items-center justify-between px-6 shrink-0 relative z-10">
                <h2 className="text-sm font-medium text-white hidden sm:block">Live Session</h2>

                <div className="flex items-center gap-2 sm:gap-4 ml-auto">
                  {/* Unlock Unlimited Menu / Badge */}
                  {!isAuthenticated && (
                    <button
                      onClick={() => setShowAuthModal(true)}
                      className="text-[10px] sm:text-[11px] px-2.5 sm:px-3 py-1.5 rounded-md uppercase font-bold bg-neutral-900 border border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800 transition-all tracking-wider mr-1 sm:mr-2 flex items-center gap-1.5"
                    >
                      <Lock className="w-3 h-3" />
                      <span className="hidden sm:inline">Unlock Unlimited</span>
                      <span className="sm:hidden">Unlock</span>
                    </button>
                  )}

                  {/* Mic Selector */}
                  <div className="flex items-center mr-1 sm:mr-2">
                    <select 
                      value={selectedMicId} 
                      onChange={(e) => setSelectedMicId(e.target.value)}
                      className="bg-[#111] text-[11px] text-neutral-400 font-medium px-2 py-1.5 rounded-md border border-neutral-800 outline-none hover:text-white transition-colors max-w-[90px] sm:max-w-[150px] truncate cursor-pointer appearance-none"
                      disabled={isListening}
                    >
                      <option value="default">Default Mic</option>
                      {availableMics.map(mic => (
                        <option key={mic.deviceId} value={mic.deviceId}>
                          {mic.label || `Mic (${mic.deviceId.slice(0, 4)})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Language Selector */}
                  <div className="hidden lg:flex items-center gap-1 mr-2 bg-[#111] px-1 py-1 rounded-lg border border-neutral-800">
                    {AVAILABLE_LANGUAGES.map(lang => {
                      const isSelected = selectedLanguages.includes(lang.code);
                      return (
                        <button
                          key={lang.code}
                          disabled={isListening}
                          onClick={() => {
                            if (isSelected && selectedLanguages.length > 1) {
                              setSelectedLanguages(selectedLanguages.filter(c => c !== lang.code));
                            } else if (!isSelected) {
                              setSelectedLanguages([...selectedLanguages, lang.code]);
                            }
                          }}
                          className={`text-[11px] px-2.5 py-1 rounded-md uppercase font-medium transition-all ${isSelected
                              ? 'bg-neutral-800 text-white shadow-sm border border-neutral-700/50'
                              : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900 border border-transparent'
                            } ${isListening ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {lang.label}
                        </button>
                      );
                    })}
                  </div>

                  {isListening && (
                    <div className="flex items-center gap-2 text-[11px] font-medium text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-md border border-emerald-400/20 uppercase tracking-widest">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                      </span>
                      Recording
                    </div>
                  )}

                  {/* Share Live Button */}
                  <button
                    onClick={handleShareLive}
                    disabled={!isListening || isSharingLive}
                    className={`text-[10px] sm:text-[11px] px-2.5 py-1.5 rounded-md uppercase font-bold tracking-wider flex items-center gap-1.5 transition-all outline-none border mr-1 sm:mr-2 ${
                      liveSessionId
                        ? "bg-red-500/10 text-red-400 border-red-500/30"
                        : isListening
                        ? "bg-[#111] text-blue-400 border-neutral-800 hover:text-white hover:bg-neutral-800"
                        : "bg-[#111] text-neutral-600 border-neutral-800 cursor-not-allowed"
                    }`}
                  >
                    {liveSessionId ? (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        Live Sharing
                      </>
                    ) : (
                      <>
                        {isSharingLive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RadioTower className="w-3.5 h-3.5" />}
                        Share Live
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      if (!isAuthenticated && freeUsageExceeded) {
                        setShowAuthModal(true);
                        return;
                      }
                      isListening ? stopListening() : connect();
                    }}
                    disabled={isConnecting}
                    className={`flex items-center gap-2 px-4 py-1.5 rounded-md font-medium text-sm transition-all duration-200 ${isConnecting
                        ? 'bg-neutral-900 border border-neutral-800 text-neutral-400 cursor-not-allowed'
                        : isListening
                          ? 'bg-[#111] text-red-400 hover:bg-red-500/10 hover:text-red-300 border border-neutral-800 hover:border-red-500/30'
                          : 'bg-white text-black hover:bg-neutral-200 shadow-[0_0_15px_rgba(255,255,255,0.1)]'
                      }`}
                  >
                    {isConnecting ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting</>
                    ) : isListening ? (
                      <><Square className="w-3.5 h-3.5 fill-current" /> Stop</>
                    ) : (
                      <><Mic className="w-3.5 h-3.5" /> Start</>
                    )}
                  </button>
                </div>
              </header>

              {/* Workspace */}
              <div className="flex-1 grid grid-cols-1 grid-rows-2 lg:grid-cols-2 lg:grid-rows-1 min-h-0">
                {/* Left Pane: Raw Transcript */}
                <div className="border-r border-neutral-800 flex flex-col h-full bg-[#0a0a0a] min-h-0 overflow-hidden">
                  <div className="h-10 border-b border-neutral-800/80 flex items-center px-6 shrink-0 bg-black">
                    <h2 className="text-[10px] font-semibold text-neutral-500 tracking-widest uppercase flex items-center gap-2">
                      <List className="w-3.5 h-3.5" /> Live Transcript
                    </h2>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0" ref={transcriptContainerRef}>
                    {transcriptItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-neutral-600">
                        <div className="w-12 h-12 bg-neutral-900 rounded-xl flex items-center justify-center mb-4 border border-neutral-800/50">
                          <List className="w-5 h-5 text-neutral-500" />
                        </div>
                        <p className="text-sm font-medium text-neutral-400">No transcript data</p>
                        <p className="text-xs mt-1 text-neutral-600">Click "Start" to begin recording.</p>
                      </div>
                    ) : (
                      transcriptItems.map((item, idx) => (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                          key={item.id + idx} className="flex flex-col items-start w-full"
                        >
                          <div className={`p-4 rounded-xl border w-full flex flex-col gap-1.5 shadow-sm ${
                            item.role === 'user' 
                              ? 'bg-[#151515] border-neutral-800/80' 
                              : 'bg-[#0f172a]/40 border-blue-900/30'
                          }`}>
                            <span className={`text-[9px] font-bold uppercase tracking-widest ${item.role === 'user' ? 'text-neutral-500' : 'text-blue-500'}`}>
                              {item.role === 'user' ? 'Speaker' : 'AI Assistant'}
                            </span>
                            <p className={`text-[14px] leading-relaxed whitespace-pre-wrap break-words font-medium ${item.isFinal ? 'text-white' : 'text-neutral-400 italic'}`}>
                              {item.text}
                            </p>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right Pane: Multi-Lang Grid */}
                <div className="flex flex-col h-full bg-black relative min-h-0 overflow-hidden">
                  <div className="h-10 border-b border-neutral-800/80 flex items-center justify-between px-6 shrink-0 bg-black">
                    <h2 className="text-[10px] font-semibold text-neutral-500 tracking-widest uppercase flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" /> AI Notes
                    </h2>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleManualSave}
                        disabled={transcriptItems.length === 0}
                        className="text-[10px] px-2.5 py-1.5 rounded-md border border-neutral-700 bg-[#111] text-white hover:bg-neutral-800 transition-colors flex items-center gap-1.5 font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Save Note to Library"
                      >
                       {isSaved ? <Save className="w-3 h-3 text-emerald-400" /> : <Save className="w-3 h-3 text-neutral-400" />}
                       {isSaved ? "SAVED" : "SAVE"}
                      </button>

                      <button
                        onClick={triggerSummary}
                        disabled={
                          isSummarizing || 
                          isConnecting || 
                          transcriptItems.length === 0 || 
                          (transcriptItems.length === lastSummaryIndex && transcriptItems[transcriptItems.length - 1].text.length <= lastSummarizedTextLength + 10)
                        }
                        className="text-[10px] px-2.5 py-1.5 rounded-md border border-neutral-700 bg-neutral-800 text-white hover:bg-neutral-700 transition-colors flex items-center gap-1.5 font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSummarizing ? <Loader2 className="w-3 h-3 animate-spin text-neutral-400" /> : <FileText className="w-3 h-3 text-neutral-400" />}
                        {isSummarizing ? "VALIDATING" : "TAKE NOTE"}
                      </button>

                      <div className="flex items-center gap-1 ml-2">
                        <span className="text-[9px] text-neutral-600 uppercase tracking-widest font-semibold mr-1">TGT LANGS:</span>
                        {AVAILABLE_LANGUAGES.map(lang => {
                          const isSelected = translationLanguages.includes(lang.code);
                          return (
                            <button
                              key={lang.code}
                              disabled={isListening}
                              onClick={() => {
                                if (isSelected && translationLanguages.length > 1) {
                                  setTranslationLanguages(translationLanguages.filter(c => c !== lang.code));
                                } else if (!isSelected && translationLanguages.length < 4) {
                                  setTranslationLanguages([...translationLanguages, lang.code]);
                                } else if (!isSelected && translationLanguages.length >= 4) {
                                  alert("Maximum of 4 translation languages allowed.");
                                }
                              }}
                              className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold transition-all ${isSelected
                                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                                  : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900 border border-transparent'
                                } ${isListening ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              {lang.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Dynamic Grid Rendering */}
                  <div className={`flex-1 min-h-0 overflow-hidden grid ${translationLanguages.length === 1 ? 'grid-cols-1 grid-rows-1' :
                      translationLanguages.length === 2 ? 'grid-cols-2 grid-rows-1 divide-x divide-neutral-800' :
                        translationLanguages.length === 3 ? 'grid-cols-2 grid-rows-2 divide-x divide-y divide-neutral-800' :
                          'grid-cols-2 grid-rows-2 divide-x divide-y divide-neutral-800'
                    }`}>
                    {translationLanguages.map((lang, index) => {
                      const summaryText = summaries[lang];
                      const isThreePanes = translationLanguages.length === 3;
                      const spanClass = (isThreePanes && index === 0) ? 'col-span-2' : 'col-span-1';

                      return (
                        <div key={lang} className={`flex flex-col h-full overflow-hidden ${spanClass}`}>
                          {/* Sub Header for Panes > 1 */}
                          {translationLanguages.length > 1 && (
                            <div className="h-7 bg-neutral-900/50 border-b border-neutral-800/50 flex items-center px-4 shrink-0 justify-between">
                              <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                                {AVAILABLE_LANGUAGES.find(l => l.code === lang)?.label || lang}
                              </span>
                            </div>
                          )}

                          <div className="flex-1 min-h-0 overflow-y-auto p-6">
                            {!summaryText ? (
                              <div className="h-full flex flex-col items-center justify-center text-neutral-600 opacity-50">
                                <FileText className="w-8 h-8 mb-2" />
                                <p className="text-xs font-medium">Waiting</p>
                              </div>
                            ) : (
                              <div className="prose prose-invert prose-neutral max-w-none prose-h1:text-[16px] prose-h1:font-bold prose-h1:tracking-tight prose-h1:text-white prose-h2:text-[14px] prose-h2:font-semibold prose-h2:text-neutral-100 prose-p:text-[13.5px] prose-p:leading-relaxed prose-p:text-neutral-200 prose-a:text-white prose-ul:text-[13.5px] prose-ul:text-neutral-200 prose-li:marker:text-neutral-600 font-medium tracking-wide">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryText}</ReactMarkdown>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* -------------------- NOTES LIBRARY LAYOUT -------------------- */}
          {activeView === 'notes' && (
            <motion.div
              key="notes-view"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col h-full w-full absolute inset-0 bg-black"
            >
              <header className="h-14 border-b border-neutral-800 bg-black flex items-center justify-between px-6 shrink-0 z-10">
                <h2 className="text-sm font-medium text-white">Past Notes Library</h2>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleExportNotes}
                    className="text-[11px] px-3 py-1.5 rounded-md uppercase font-medium bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
                  >
                    Export All (ZIP)
                  </button>

                  {/* Hidden folder input */}
                  <input
                    type="file"
                    id="folder-import"
                    className="hidden"
                    // @ts-ignore - webkitdirectory is standard in modern browsers but sometimes clunky in TS types
                    webkitdirectory="true"
                    directory="true"
                    multiple
                    onChange={handleImportNotes}
                  />
                  <label
                    htmlFor="folder-import"
                    className="text-[11px] px-3 py-1.5 rounded-md uppercase font-medium bg-white text-black hover:bg-neutral-200 shadow-sm cursor-pointer transition-all"
                  >
                    Import Folder
                  </label>
                </div>
              </header>

              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Notes List Column */}
                <div className="w-1/3 min-w-[300px] border-r border-neutral-800 bg-[#0a0a0a] flex flex-col h-full min-h-0">
                  <div className="p-4 border-b border-neutral-800/50 shrink-0">
                    <input
                      type="text"
                      placeholder="Search notes..."
                      className="w-full bg-[#111] border border-neutral-800 rounded-md px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-600 transition-colors"
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                    {savedNotes.length === 0 ? (
                      <div className="text-center py-10 text-neutral-600">
                        <p className="text-sm">No notes saved yet.</p>
                      </div>
                    ) : (
                      savedNotes.map(note => {
                        const d = new Date(note.date);
                        const isSelectedDate = selectedNoteId === note.id;
                        return (
                          <div
                            key={note.id}
                            onClick={() => setSelectedNoteId(note.id)}
                            className={`p-4 rounded-lg cursor-pointer transition-all border ${isSelectedDate
                                ? 'bg-neutral-900 border-neutral-700'
                                : 'bg-[#111] border-transparent hover:bg-neutral-900/50 hover:border-neutral-800'
                              }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <h3 className="text-sm font-medium text-neutral-200 line-clamp-1 break-all flex-1">{note.title}</h3>
                              <span className="text-[10px] text-neutral-500 shrink-0 whitespace-nowrap mt-0.5">
                                {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-2 line-clamp-2 leading-relaxed">
                              {note.summaries['en'] ? note.summaries['en'].replace(/[#*`]/g, '') : Object.values(note.summaries)[0]?.replace(/[#*`]/g, '') || "No summary available."}
                            </p>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

                {/* Note Detail Column */}
                <div className="flex-1 flex flex-col h-full bg-black relative min-w-0 min-h-0">
                  {!activeNote ? (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-600">
                      <Clock className="w-12 h-12 mb-4 opacity-20 text-neutral-400" />
                      <p className="text-sm font-medium text-neutral-400">Select a note to view</p>
                    </div>
                  ) : (
                    <div className="flex flex-col h-full">
                      <div className="h-16 px-8 border-b border-neutral-800/80 flex items-center justify-between shrink-0">
                        <div>
                          <h2 className="text-lg font-semibold text-white">{activeNote.title}</h2>
                          <p className="text-[11px] text-neutral-500 mt-0.5">
                            Recorded on {new Date(activeNote.date).toLocaleString()}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            deleteSavedNote(activeNote.id);
                            setSelectedNoteId(null);
                          }}
                          className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-all"
                          title="Delete note"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto w-full">
                        {/* We will grid layout the exported notes if they span multiple langs */}
                        <div className={`grid w-full min-h-full ${Object.keys(activeNote.summaries).length > 1 ? 'grid-cols-2 divide-x divide-neutral-800' : 'grid-cols-1'
                          }`}>
                          {Object.entries(activeNote.summaries).map(([lang, text]) => (
                            <div key={lang} className="p-8 lg:p-12">
                              {Object.keys(activeNote.summaries).length > 1 && (
                                <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-6">Translation: {lang}</h3>
                              )}
                              <div className="prose prose-invert prose-neutral max-w-none prose-h1:text-xl prose-h1:font-semibold prose-h1:text-neutral-100 prose-h2:text-lg prose-h2:font-medium prose-h2:text-neutral-200 prose-p:text-[14px] prose-p:leading-relaxed prose-p:text-neutral-300 prose-a:text-white prose-ul:text-[14px] prose-ul:text-neutral-300">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {text || "*Empty.*"}
                                </ReactMarkdown>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="max-w-4xl mx-auto p-8 lg:p-12">
                          {activeNote.transcriptItems.length > 0 && (
                            <div className="mt-16 pt-8 border-t border-neutral-800/50">
                              <h3 className="text-[11px] font-semibold text-neutral-500 uppercase tracking-widest mb-6 border-b border-neutral-800/40 pb-4">Raw Transcript Timeline</h3>
                              <div className="space-y-4">
                                {activeNote.transcriptItems.map((item, idx) => (
                                  <div key={idx} className="bg-[#111] p-4 rounded-lg border border-neutral-800/50 text-[13px] text-neutral-400 leading-relaxed whitespace-pre-wrap break-words shadow-sm">
                                    {item.text}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}
