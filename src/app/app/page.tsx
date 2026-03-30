"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Monitor, Square, Loader2, List, FileText, LayoutDashboard, Clock, MoreVertical, Trash2, Lock, Save, RadioTower, Download, LogOut, Settings, Sparkles, CheckCircle2, Globe, Sun, Moon, Play, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { useAppStore, TranscriptItem, SavedNote } from "@/lib/store";
import { useAudioRealtime } from "@/lib/useAudioRealtime";
import { createClient } from "@/utils/supabase/client";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";

const AVAILABLE_LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'zh', label: 'Chinese', native: '中文' },
  { code: 'es', label: 'Spanish', native: 'Español' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'de', label: 'German', native: 'Deutsch' },
  { code: 'ja', label: 'Japanese', native: '日本語' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'ar', label: 'Arabic', native: 'العربية' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
  { code: 'ru', label: 'Russian', native: 'Русский' },
  { code: 'it', label: 'Italian', native: 'Italiano' },
  { code: 'ko', label: 'Korean', native: '한국어' },
  { code: 'nl', label: 'Dutch', native: 'Nederlands' },
  { code: 'tr', label: 'Turkish', native: 'Türkçe' },
  { code: 'pl', label: 'Polish', native: 'Polski' },
  { code: 'sv', label: 'Swedish', native: 'Svenska' },
  { code: 'vi', label: 'Vietnamese', native: 'Tiếng Việt' },
  { code: 'th', label: 'Thai', native: 'ไทย' },
  { code: 'id', label: 'Indonesian', native: 'Bahasa Indonesia' },
  { code: 'ro', label: 'Romanian', native: 'Română' },
  { code: 'el', label: 'Greek', native: 'Ελληνικά' },
  { code: 'cs', label: 'Czech', native: 'Čeština' },
  { code: 'da', label: 'Danish', native: 'Dansk' },
  { code: 'fi', label: 'Finnish', native: 'Suomi' },
  { code: 'hu', label: 'Hungarian', native: 'Magyar' },
  { code: 'no', label: 'Norwegian', native: 'Norsk' },
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
    workspaceViews,
    setWorkspaceViews,
    addWorkspaceView,
    removeWorkspaceView,
    translatedTranscriptItems,
    translationLanguages,
    setTranslationLanguages,
    activeView,
    setActiveView,
    savedNotes,
    deleteSavedNote,
    addSavedNote,
    isAuthenticated,
    setIsAuthenticated,
    userEmail,
    setUserEmail,
    selectedMicId,
    setSelectedMicId,
    freeUsageTime,
    freeUsageExceeded,
    incrementFreeUsageTime,
    setFreeUsageExceeded,
    tier,
    setTier,
    liveSessionId,
    liveSessionHostId,
    setLiveSession,
    isMicEnabled,
    setIsMicEnabled,
    isSystemAudioEnabled,
    setIsSystemAudioEnabled,
    theme,
    setTheme,
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
  const translatedTranscriptContainerRef = useRef<HTMLDivElement>(null);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [showAddViewModal, setShowAddViewModal] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [translationSearch, setTranslationSearch] = useState("");
  const [mobileTab, setMobileTab] = useState<'transcript' | 'translation'>('transcript');

  const filteredTranslationLanguages = AVAILABLE_LANGUAGES.filter(lang => 
    lang.label.toLowerCase().includes(translationSearch.toLowerCase()) || 
    lang.native.toLowerCase().includes(translationSearch.toLowerCase())
  );
  const closestTranslationLanguage = translationSearch.trim() === "" ? null : filteredTranslationLanguages[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(event.target as Node)) {
        setShowLanguageDropdown(false);
      }
    }
    if (showLanguageDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showLanguageDropdown]);

  useEffect(() => {
    if (!activeWorkspaceId && workspaceViews.length > 0) {
      setActiveWorkspaceId(workspaceViews[0].id);
    } else if (activeWorkspaceId && !workspaceViews.find(v => v.id === activeWorkspaceId)) {
      if (workspaceViews.length > 0) setActiveWorkspaceId(workspaceViews[0].id);
      else setActiveWorkspaceId(null);
    }
  }, [workspaceViews, activeWorkspaceId]);

  // Migrate legacy AI Notes targeting non-English languages to Live Translation
  useEffect(() => {
    const hasLegacyViews = workspaceViews.some(v => v.type === 'ai_notes' && v.language !== 'en');
    if (hasLegacyViews && setWorkspaceViews) {
      const migratedViews = workspaceViews.map(v =>
        (v.type === 'ai_notes' && v.language !== 'en')
          ? { ...v, type: 'live_translation' as 'live_translation' }
          : v
      );
      // Remove duplicates for live_translation (since only 1 is supported)
      const liveTranslations = migratedViews.filter(v => v.type === 'live_translation');
      let finalViews = migratedViews;
      if (liveTranslations.length > 1) {
        const firstId = liveTranslations[0].id;
        finalViews = migratedViews.filter(v => v.type !== 'live_translation' || v.id === firstId);
      }
      setWorkspaceViews(finalViews);
    }
  }, [workspaceViews, setWorkspaceViews]);

  // Auto-scroll translated transcript
  useEffect(() => {
    if (translatedTranscriptContainerRef.current) {
      const container = translatedTranscriptContainerRef.current;
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 150;
      if (isAtBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [translatedTranscriptItems, activeView]);

  // Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');

  // Upgrade State
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalSource, setUpgradeModalSource] = useState<'limit' | 'manual'>('manual');
  const [proPassword, setProPassword] = useState('');
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');

  // Settings State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isManagingBilling, setIsManagingBilling] = useState(false);

  const supabase = createClient();

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/user/usage');
      if (res.ok) {
        const data = await res.json();
        setTier(data.tier);
        useAppStore.setState({ freeUsageTime: data.usageSeconds });
        if (data.tier === 'free' && data.usageSeconds >= 900) {
          setFreeUsageExceeded(true);
        }
      }
    } catch (e) { }
  };

  // Sync Supabase Auth State
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setIsAuthenticated(true);
        setUserEmail(session.user.email || null);
        fetchUsage();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsAuthenticated(true);
        setUserEmail(session.user.email || null);
        fetchUsage();
      } else {
        setIsAuthenticated(false);
        setUserEmail(null);
        setTier('free');
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth, setIsAuthenticated, setUserEmail, setTier]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setUserEmail(null);
    toast.success("Signed out successfully");
  };

  // Free Usage Tracker (15 mins = 900 seconds)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isListening) {
      if (!isAuthenticated || tier === 'free') {
        interval = setInterval(() => {
          const state = useAppStore.getState();
          if (state.freeUsageTime >= 900) {
            state.setFreeUsageExceeded(true);
            stopListening();
            if (!isAuthenticated) {
              setShowAuthModal(true);
            } else {
              setUpgradeModalSource('limit');
              setShowUpgradeModal(true);
            }
            clearInterval(interval);
          } else {
            state.incrementFreeUsageTime(1);
          }
        }, 1000);
      }
    }
    return () => clearInterval(interval);
  }, [isListening, isAuthenticated, tier, stopListening]);

  // Periodic usage sync (10s intervals)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isListening && isAuthenticated && tier === 'free') {
      interval = setInterval(() => {
        fetch('/api/user/usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: 10 })
        }).catch(console.error);
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [isListening, isAuthenticated, tier]);

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
        // Fallback or silent fail if no mics
      }
    }

    fetchMics();
    navigator.mediaDevices?.addEventListener('devicechange', fetchMics);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', fetchMics);
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptContainerRef.current) {
      const container = transcriptContainerRef.current;
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 150;
      if (isAtBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [transcriptItems, activeView]);

  const [isSummarizing, setIsSummarizing] = useState(false);

  const triggerSummary = async () => {
    if (isSummarizing) return;
    const state = useAppStore.getState();
    const currentItems = state.transcriptItems;
    let currentIndex = state.lastSummaryIndex;
    const currentSummaries = state.summaries;
    const currentTranslationLanguages = workspaceViews.filter(v => v.type === 'ai_notes' && v.language).map(v => v.language);

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
      } else {
        toast.error("Failed to generate summary from server.");
      }
    } catch (e) {
      toast.error("Network error while generating summary.");
    } finally {
      setIsSummarizing(false);
    }
  };


  // Export Logic
  const handleExportNotes = async () => {
    if (savedNotes.length === 0) return toast.error("No notes to export.");

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

  const handleDownloadNote = async (note: SavedNote) => {
    const safeTitle = note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `${safeTitle}_${new Date(note.date).getTime()}.md`;

    const frontmatter = `---
id: ${note.id}
title: "${note.title.replace(/"/g, '\\"')}"
date: ${note.date}
---

`;
    const body = Object.entries(note.summaries).map(([lang, text]) => {
      return `## ${lang.toUpperCase()}\\n\\n${text}\\n`;
    }).join("\\n") || "*No summary available*";

    const hiddenSummariesData = `\n\n<!-- AUDIO_NOTE_SUMMARIES_START\n${JSON.stringify(note.summaries)}\nAUDIO_NOTE_SUMMARIES_END -->`;
    const hiddenTranscriptData = `\n\n<!-- AUDIO_NOTE_DATA_START\n${JSON.stringify(note.transcriptItems)}\nAUDIO_NOTE_DATA_END -->`;

    const fileContent = frontmatter + body + hiddenSummariesData + hiddenTranscriptData;

    const blob = new Blob([fileContent], { type: "text/markdown;charset=utf-8" });
    saveAs(blob, filename);
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
          // silently handle
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
      toast.success(`Successfully imported ${importCount} note(s)!`);
    } else {
      toast.error("No valid new notes found to import.");
    }

    // Reset input
    if (e.target) e.target.value = '';
  };

  const activeNote = savedNotes.find(n => n.id === selectedNoteId);

  const handleShareLive = async () => {
    if (!isListening) {
      toast.error("Please start recording first to share the live session.");
      return;
    }
    setShowShareModal(true);
    // Secure cryptographic password generation
    setGeneratedPassword(crypto.randomUUID().split('-')[0].substring(0, 6).toUpperCase());
    setRequirePassword(false);
  };

  const confirmShareLive = async () => {
    try {
      setIsSharingLive(true);
      setShowShareModal(false);
      const hostId = crypto.randomUUID();
      const sessionId = await createSession({
        title: "Meetly | HenryAI",
        hostId: hostId,
        password: requirePassword ? generatedPassword : undefined
      });

      setLiveSession(sessionId, hostId);

      const shareUrl = `${window.location.origin}/live/${sessionId}`;
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Live link copied to clipboard!", {
        description: requirePassword ? `Password: ${generatedPassword}. Anyone with the link & password can view.` : 'Anyone with the link can view.',
        duration: 8000
      });
      setIsSharingLive(false);
    } catch (e) {
      setIsSharingLive(false);
      setShowShareModal(false);
      toast.error("Failed to create share link.");
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
      }).catch((err: any) => toast.error("Connection issue: Live transcript may not be visible to viewers."));
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
      }).catch((err: any) => toast.error("Connection issue: Live summary may not be visible."));
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

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setAuthError('Please enter both email and password.');
      return;
    }
    setIsAuthenticating(true);
    setAuthError('');
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        if (data.user) {
          setIsAuthenticated(true);
          setShowAuthModal(false);
          toast.success("Account created successfully!");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data.user) {
          setIsAuthenticated(true);
          setShowAuthModal(false);
          toast.success("Welcome back!");
        }
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsAuthenticating(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/app`
        }
      });
      if (error) throw error;
    } catch (err: any) {
      setAuthError(err.message || 'Google login failed');
      setIsAuthenticating(false);
    }
  };

  const handleUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpgrading(true);
    setUpgradeError('');

    if (proPassword.trim()) {
      try {
        const res = await fetch('/api/upgrade/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: proPassword.trim() })
        });
        
        if (res.ok) {
          toast.success("Pro Token Accepted! Welcome to Pro.");
          setTier('pro');
          setFreeUsageExceeded(false);
          setShowUpgradeModal(false);
          setProPassword('');
          setIsUpgrading(false);
          return;
        } else {
          const data = await res.json();
          setUpgradeError(data.error || "Invalid or expired token");
          setIsUpgrading(false);
          return;
        }
      } catch (err) {
        setUpgradeError("Failed to verify token. Please try again.");
        setIsUpgrading(false);
        return;
      }
    }

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: 'pro' })
      });

      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setUpgradeError(data.error || 'Failed to create checkout session');
      }
    } catch (e: any) {
      setUpgradeError(e.message);
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleManageBilling = async () => {
    if (tier === 'free') {
      setShowSettingsModal(false);
      setUpgradeModalSource('manual');
      setShowUpgradeModal(true);
      return;
    }

    setIsManagingBilling(true);
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || 'Failed to open billing portal');
      }
    } catch (e: any) {
      toast.error('Network error while opening portal');
    } finally {
      setIsManagingBilling(false);
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
    <div className={`h-[100dvh] w-full flex flex-col md:flex-row font-sans overflow-hidden ${theme === 'dark' ? 'bg-black text-neutral-200 selection:bg-neutral-800 selection:text-white' : 'bg-[#f4f4f5] text-neutral-800 selection:bg-neutral-200 selection:text-neutral-900'}`}>
      {/* Mobile Top Header */}
      <div className={`md:hidden shrink-0 h-[60px] w-full flex items-center justify-between px-4 z-30 border-b ${theme === 'dark' ? 'bg-black border-neutral-800/80' : 'bg-white border-neutral-200'}`}>
        <Link href="/" className="flex items-center gap-2 cursor-pointer">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shadow-sm shrink-0 ${theme === 'dark' ? 'bg-white' : 'bg-black'}`}>
            <Mic className={`w-4 h-4 ${theme === 'dark' ? 'text-black' : 'text-white'}`} />
          </div>
          <span className={`text-[15px] font-bold tracking-wide ${theme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>
            Meetly
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {isAuthenticated && userEmail ? (
             <button
               onClick={() => setShowSettingsModal(true)}
               className={`p-2 rounded-lg transition-all ${theme === 'dark' ? 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800' : 'bg-white text-neutral-500 hover:text-neutral-900 border border-neutral-200 shadow-sm'}`}
             >
               <Settings className="w-4 h-4" />
             </button>
          ) : (
            <button
               onClick={() => setShowAuthModal(true)}
               className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all ${theme === 'dark' ? 'bg-white text-black hover:bg-neutral-200' : 'bg-black text-white hover:bg-neutral-800'}`}
            >
              Sign In
            </button>
          )}
        </div>
      </div>

      {/* Auth Modal Overlay */}
      <AnimatePresence>
        {showAuthModal && !isAuthenticated && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center px-4"
            onClick={(e) => {
              if (e.target === e.currentTarget && !freeUsageExceeded) setShowAuthModal(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full max-w-[420px] p-8 sm:p-10 bg-[#050505] border border-neutral-800/80 rounded-3xl shadow-[0_0_80px_-15px_rgba(255,255,255,0.08)] flex flex-col relative overflow-hidden"
            >
              {/* Subtle top glare */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

              {!freeUsageExceeded && (
                <button
                  onClick={() => setShowAuthModal(false)}
                  className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-900/40 text-neutral-500 hover:text-white hover:bg-neutral-800 transition-all duration-200"
                >
                  <span className="sr-only">Close</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}

              <div className="flex flex-col items-center mb-8">
                <div className="w-14 h-14 bg-white rounded-[1.25rem] flex items-center justify-center mb-5 shadow-[0_0_20px_rgba(255,255,255,0.15)] ring-1 ring-white/10">
                  <Mic className="w-7 h-7 text-black" />
                </div>
                <h1 className="text-[22px] font-bold text-white tracking-tight">Welcome to Henry AI</h1>
                <p className="text-[13px] text-neutral-400 mt-2 text-center leading-relaxed max-w-[280px]">
                  {freeUsageExceeded
                    ? "Your 15-minute free preview has ended. Sign in to unlock unlimited meeting intelligence."
                    : "Sign in or create an account to save unlimited notes and live sessions."}
                </p>
              </div>

              <div className="w-full flex flex-col gap-4">
                {/* Auth Mode Toggle */}
                <div className="flex bg-[#111] p-1 rounded-lg border border-neutral-800">
                  <button
                    onClick={() => { setAuthMode('signup'); setAuthError(''); }}
                    className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-all ${authMode === 'signup' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
                  >
                    Sign Up
                  </button>
                  <button
                    onClick={() => { setAuthMode('signin'); setAuthError(''); }}
                    className={`flex-1 py-1.5 text-[13px] font-medium rounded-md transition-all ${authMode === 'signin' ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-500 hover:text-neutral-300'}`}
                  >
                    Sign In
                  </button>
                </div>

                <form onSubmit={handleAuth} className="flex flex-col gap-3 mt-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Email address"
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-4 py-3.5 text-[14px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-all font-sans"
                    disabled={isAuthenticating}
                  />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password (min 6 characters)"
                    minLength={6}
                    className="w-full bg-[#0a0a0a] border border-neutral-800 rounded-xl px-4 py-3.5 text-[14px] text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-all font-sans"
                    disabled={isAuthenticating}
                  />

                  {authError && (
                    <div className="text-red-400 text-xs font-medium px-2 py-1 bg-red-400/10 rounded-md border border-red-400/20 text-center animate-in fade-in slide-in-from-top-1">
                      {authError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isAuthenticating || !email || !password}
                    className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-[14px] py-3.5 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center border border-blue-500/80 shadow-[0_2px_10px_rgba(37,99,235,0.3)]"
                  >
                    {isAuthenticating ? <Loader2 className="w-5 h-5 animate-spin text-white/70" /> : (authMode === 'signup' ? "Create Account" : "Sign In with Email")}
                  </button>
                </form>
              </div>

              <p className="mt-8 text-[11px] text-neutral-600 text-center leading-relaxed">
                By continuing, you agree to Henry AI's <br /> <a href="#" className="underline hover:text-white transition-colors">Terms of Service</a> and <a href="#" className="underline hover:text-white transition-colors">Privacy Policy</a>.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upgrade Pro Modal Overlay */}
      <AnimatePresence>
        {showUpgradeModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center px-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowUpgradeModal(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full max-w-[420px] p-8 sm:p-10 bg-[#050505] border border-amber-500/20 rounded-3xl shadow-[0_0_80px_-15px_rgba(245,158,11,0.08)] flex flex-col relative overflow-hidden"
            >
              {/* Subtle top glare */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[1px] bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />

              <button
                onClick={() => setShowUpgradeModal(false)}
                className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-900/40 text-neutral-500 hover:text-white hover:bg-neutral-800 transition-all duration-200"
              >
                <span className="sr-only">Close</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              <div className="flex flex-col items-center mb-8 relative">
                <div className="relative w-16 h-16 flex items-center justify-center mb-5">
                  <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/20 to-orange-500/20 rounded-full blur-xl animate-pulse" />
                  <div className="relative w-full h-full bg-[#111] border border-white/10 rounded-2xl flex items-center justify-center shadow-2xl backdrop-blur-sm">
                    <Sparkles className="w-8 h-8 text-amber-500" />
                  </div>
                </div>
                <h1 className="text-2xl font-semibold text-white tracking-tight">Upgrade to Pro</h1>
                <p className="text-[14px] text-neutral-400 mt-2.5 text-center leading-relaxed max-w-[280px]">
                  {upgradeModalSource === 'limit' && freeUsageExceeded
                    ? "Your 15-minute free transcription has ended. Upgrade to Pro to continue recording."
                    : "Unlock unlimited meeting intelligence with Pro."}
                </p>
              </div>

              <div className="w-full flex flex-col gap-5">
                <div className="bg-[#111] border border-white/5 rounded-2xl p-4 space-y-3.5">
                  <div className="flex items-center text-[13px] text-neutral-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mr-3 shrink-0" />
                    <span>Unlimited recording & transcription</span>
                  </div>
                  <div className="flex items-center text-[13px] text-neutral-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mr-3 shrink-0" />
                    <span>Best-in-class noise cancellation</span>
                  </div>
                  <div className="flex items-center text-[13px] text-neutral-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mr-3 shrink-0" />
                    <span>Real-time translation (60+ languages)</span>
                  </div>
                </div>

                <form onSubmit={handleUpgrade} className="flex flex-col gap-3">
                  {upgradeError && (
                    <div className="text-red-400 text-xs font-medium px-3 py-2 bg-red-400/10 rounded-xl border border-red-400/20 text-center animate-in fade-in slide-in-from-top-1">
                      {upgradeError}
                    </div>
                  )}

                  <input
                    type="text"
                    value={proPassword}
                    onChange={e => setProPassword(e.target.value)}
                    placeholder="Got a Pro Token? (optional)"
                    className="w-full bg-[#111] border border-white/5 rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-neutral-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all font-sans text-center"
                    disabled={isUpgrading}
                  />

                  <button
                    type="submit"
                    disabled={isUpgrading}
                    className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-[14px] font-medium rounded-xl text-black bg-white hover:bg-neutral-100 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_25px_rgba(255,255,255,0.2)]"
                  >
                    {isUpgrading ? <Loader2 className="w-5 h-5 animate-spin text-black/70" /> : proPassword.trim() ? "Upgrade via Token" : "Upgrade via Stripe"}
                  </button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal Overlay */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center px-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowSettingsModal(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full max-w-[420px] p-8 sm:p-10 bg-[#050505] border border-neutral-800/80 rounded-3xl shadow-[0_0_80px_-15px_rgba(255,255,255,0.08)] flex flex-col relative overflow-hidden"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

              <button
                onClick={() => setShowSettingsModal(false)}
                className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-900/40 text-neutral-500 hover:text-white hover:bg-neutral-800 transition-all duration-200"
              >
                <span className="sr-only">Close</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              <div className="flex flex-col items-center mb-8 relative">
                <div className="w-14 h-14 bg-gradient-to-b from-neutral-800 to-neutral-900 border border-white/10 rounded-2xl flex items-center justify-center mb-5 shadow-xl relative overflow-hidden">
                  <div className="absolute inset-0 bg-white/5 opacity-0 hover:opacity-100 transition-opacity" />
                  <Settings className="w-6 h-6 text-neutral-300" />
                </div>
                <h1 className="text-2xl font-semibold text-white tracking-tight">Settings</h1>
                <p className="text-[14px] text-neutral-400 mt-2.5 text-center leading-relaxed">
                  Manage your account and billing.
                </p>
              </div>

              <div className="w-full flex flex-col gap-5">
                <div className="bg-[#111] border border-white/5 rounded-2xl p-4 flex justify-between items-center group hover:border-white/10 transition-colors">
                  <div>
                    <h3 className="text-[14px] font-medium text-white">Current Plan</h3>
                    <p className="text-[13px] text-neutral-400 mt-1">{tier === 'pro' ? 'Pro Membership active' : 'Free Trial limits applied'}</p>
                  </div>
                  <div className="bg-black px-3 py-1.5 rounded-lg border border-neutral-800 shadow-inner">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">{tier}</span>
                  </div>
                </div>

                <button
                  onClick={handleManageBilling}
                  disabled={isManagingBilling}
                  className="w-full bg-white hover:bg-neutral-200 text-black font-medium text-[14px] py-3.5 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.05)] hover:shadow-[0_0_25px_rgba(255,255,255,0.15)]"
                >
                  {isManagingBilling ? <Loader2 className="w-5 h-5 animate-spin text-black" /> : "Manage Billing"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add View Modal Overlay */}
      <AnimatePresence>
        {showAddViewModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/90 backdrop-blur-md flex items-center justify-center px-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowAddViewModal(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full max-w-[420px] p-8 sm:p-10 bg-[#050505] border border-neutral-800/80 rounded-3xl shadow-[0_0_80px_-15px_rgba(255,255,255,0.08)] flex flex-col relative overflow-hidden"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

              <button
                onClick={() => setShowAddViewModal(false)}
                className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-900/40 text-neutral-500 hover:text-white hover:bg-neutral-800 transition-all duration-200"
              >
                <span className="sr-only">Close</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              <div className="flex flex-col items-center mb-6 relative">
                <h1 className="text-xl font-semibold text-white tracking-tight">Add Workspace View</h1>
                <p className="text-[14px] text-neutral-400 mt-2 text-center leading-relaxed">
                  Choose a widget to add to your right panel.
                </p>
              </div>

              <div className="w-full flex flex-col gap-4">
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold text-neutral-500 tracking-wider uppercase mb-1">AI Notes</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {AVAILABLE_LANGUAGES.filter(l => l.code === 'en').map(lang => (
                      <button
                        key={`ainote-${lang.code}`}
                        onClick={() => {
                          const id = crypto.randomUUID();
                          addWorkspaceView({ id: id, type: 'ai_notes', language: lang.code });
                          setActiveWorkspaceId(id);
                          setShowAddViewModal(false);
                        }}
                        className="py-2.5 px-2 bg-[#111] hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-xl border border-neutral-800 hover:border-neutral-700 transition flex flex-col items-center gap-1 group"
                      >
                        <FileText className="w-4 h-4 text-neutral-500 group-hover:text-blue-400 mb-1.5" />
                        <span className="text-[11px] font-bold uppercase tracking-wider">{lang.label}</span>
                        {lang.code !== 'en' && <span className="text-[11px] font-medium text-neutral-400 mt-0.5">{lang.native}</span>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 mt-2">
                  <h3 className="text-xs font-semibold text-neutral-500 tracking-wider uppercase mb-1">Real-Time Translation</h3>
                  
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                    <input
                      type="text"
                      placeholder="Enter language to search..."
                      value={translationSearch}
                      onChange={(e) => setTranslationSearch(e.target.value)}
                      className="w-full bg-[#111] border border-neutral-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-neutral-700 transition"
                    />
                  </div>

                  {translationSearch.trim() === "" ? (
                    <div className="grid grid-cols-3 gap-2">
                      {AVAILABLE_LANGUAGES.slice(0, 6).map(lang => (
                        <button
                          key={`live-${lang.code}`}
                          onClick={() => {
                            if (workspaceViews.some(v => v.type === 'live_translation')) {
                              toast.error("Only 1 Live Translation view is supported per session.");
                              return;
                            }
                            const id = crypto.randomUUID();
                            addWorkspaceView({ id: id, type: 'live_translation', language: lang.code });
                            setActiveWorkspaceId(id);
                            setShowAddViewModal(false);
                          }}
                          className="py-2.5 px-2 bg-[#111] hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-xl border border-neutral-800 hover:border-neutral-700 transition flex flex-col items-center gap-1 group"
                        >
                          <RadioTower className="w-4 h-4 text-neutral-500 group-hover:text-blue-400 mb-1.5" />
                          <span className="text-[11px] font-bold uppercase tracking-wider">{lang.label}</span>
                          {lang.code !== 'en' && <span className="text-[11px] font-medium text-neutral-400 mt-0.5">{lang.native}</span>}
                        </button>
                      ))}
                    </div>
                  ) : closestTranslationLanguage ? (
                    <button
                      onClick={() => {
                        if (workspaceViews.some(v => v.type === 'live_translation')) {
                          toast.error("Only 1 Live Translation view is supported per session.");
                          return;
                        }
                        const id = crypto.randomUUID();
                        addWorkspaceView({ id: id, type: 'live_translation', language: closestTranslationLanguage.code });
                        setActiveWorkspaceId(id);
                        setShowAddViewModal(false);
                        setTranslationSearch("");
                      }}
                      className="w-full py-3 px-4 bg-[#111] hover:bg-neutral-800 text-neutral-300 hover:text-white rounded-xl border border-neutral-800 hover:border-neutral-700 transition flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <RadioTower className="w-5 h-5 text-neutral-400 group-hover:text-blue-400 transition" />
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-bold uppercase tracking-wider">{closestTranslationLanguage.label}</span>
                          {closestTranslationLanguage.code !== 'en' && <span className="text-xs font-medium text-neutral-500">{closestTranslationLanguage.native}</span>}
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold bg-neutral-800/80 text-neutral-400 group-hover:bg-blue-500/20 group-hover:text-blue-400 px-2.5 py-1 rounded-md transition border border-neutral-700/50 group-hover:border-blue-500/30">Add View</span>
                    </button>
                  ) : (
                    <div className="text-[11px] text-neutral-500 text-center py-3 bg-[#111] rounded-xl border border-neutral-800">
                      No matching language found.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Share Modal Overlay */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center px-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowShareModal(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="w-full max-w-[420px] p-8 sm:p-10 bg-[#050505] border border-neutral-800/80 rounded-3xl shadow-[0_0_80px_-15px_rgba(255,255,255,0.08)] flex flex-col relative overflow-hidden"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

              <button
                onClick={() => setShowShareModal(false)}
                className="absolute top-5 right-5 w-8 h-8 flex items-center justify-center rounded-full bg-neutral-900/40 text-neutral-500 hover:text-white hover:bg-neutral-800 transition-all duration-200"
              >
                <span className="sr-only">Close</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>

              <div className="flex flex-col items-center mb-8">
                <div className="w-14 h-14 bg-white rounded-[1.25rem] flex items-center justify-center mb-5 shadow-[0_0_20px_rgba(255,255,255,0.15)] ring-1 ring-white/10">
                  <RadioTower className="w-7 h-7 text-black" />
                </div>
                <h1 className="text-[22px] font-bold text-white tracking-tight">Share Live Session</h1>
                <p className="text-[13px] text-neutral-400 mt-2 text-center leading-relaxed">
                  Anyone with the link can view your real-time transcript and live summary.
                </p>
              </div>

              <div className="flex flex-col gap-5 w-full">
                <label className="flex items-center justify-between p-4 bg-[#111] border border-neutral-800 rounded-xl cursor-pointer hover:bg-[#151515] transition-colors">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-white">Require Password</span>
                    <span className="text-xs text-neutral-500 mt-0.5">Protect this live session</span>
                  </div>
                  <div className={`relative w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-300 ${requirePassword ? 'bg-[#3498db]' : 'bg-neutral-700'}`}>
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={requirePassword}
                      onChange={(e) => setRequirePassword(e.target.checked)}
                    />
                    <div className={`absolute left-1 bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${requirePassword ? 'translate-x-5' : 'translate-x-0'}`}></div>
                  </div>
                </label>

                <AnimatePresence>
                  {requirePassword && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-[#0a0a0a] border border-neutral-800/80 rounded-xl p-4 flex flex-col gap-2">
                        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">Generated Password</span>
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-mono font-bold tracking-widest text-emerald-400">{generatedPassword}</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={confirmShareLive}
                  disabled={isSharingLive}
                  className="w-full mt-2 bg-white hover:bg-neutral-200 text-black font-semibold text-[14px] py-3.5 rounded-xl transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center shadow-sm"
                >
                  {isSharingLive ? <Loader2 className="w-5 h-5 animate-spin" /> : "Start Live Sharing"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Left Sidebar Navigation */}
      <aside className={`hidden md:flex w-56 h-full flex-col shrink-0 py-4 px-4 transition-all duration-300 z-20 ${theme === 'dark' ? 'bg-black border-r border-neutral-800/80' : 'bg-[#f4f4f5] border-r border-neutral-200'}`}>
        <Link href="/" className="flex items-center gap-3 px-2 mb-8 mt-2 hover:opacity-80 transition-opacity cursor-pointer">
          <div className={`w-6 h-6 rounded-md flex items-center justify-center shadow-sm shrink-0 ${theme === 'dark' ? 'bg-white' : 'bg-black'}`}>
            <Mic className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-black' : 'text-white'}`} />
          </div>
          <h1 className={`text-[13px] font-semibold tracking-wide hidden md:block whitespace-nowrap overflow-hidden ${theme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>
            Meetly | HenryAI
          </h1>
        </Link>

        <nav className="flex flex-col gap-1">
          <button
            onClick={() => setActiveView('record')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeView === 'record'
              ? (theme === 'dark' ? 'bg-[#111] text-white shadow-sm border border-neutral-800' : 'bg-white text-neutral-900 shadow-sm border border-neutral-200')
              : (theme === 'dark' ? 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900 border border-transparent' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200/50 border border-transparent')
              }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span className="hidden md:block">Record Area</span>
          </button>
          <button
            onClick={() => setActiveView('notes')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium ${activeView === 'notes'
              ? (theme === 'dark' ? 'bg-[#111] text-white shadow-sm border border-neutral-800' : 'bg-white text-neutral-900 shadow-sm border border-neutral-200')
              : (theme === 'dark' ? 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900 border border-transparent' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200/50 border border-transparent')
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

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm font-medium border border-transparent ${theme === 'dark'
              ? 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900'
              : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200/50'
              }`}
          >
            {theme === 'dark' ? <Moon className="w-4 h-4 shrink-0" /> : <Sun className="w-4 h-4 shrink-0" />}
            <span className="hidden md:block">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
          </button>
        </nav>

        <div className="mt-auto px-2 mb-4 space-y-4">
          <p className="hidden md:block text-[10px] text-neutral-600 leading-tight">
            Data is securely saved locally to your device.
          </p>

          <AnimatePresence>
            {isAuthenticated && userEmail && (
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                className={`flex items-center justify-between p-2.5 rounded-lg border ${theme === 'dark' ? 'bg-[#111] border-neutral-800' : 'bg-white border-neutral-200 shadow-sm text-neutral-900'}`}
              >
                <div className="flex-1 min-w-0 mr-2 hidden md:block">
                  <p className={`text-[11px] font-medium truncate ${theme === 'dark' ? 'text-neutral-300' : 'text-neutral-900'}`} title={userEmail}>
                    {userEmail}
                  </p>
                  <p className="text-[9px] text-neutral-500 uppercase tracking-widest mt-0.5">{tier === 'pro' ? 'Pro User' : 'Free User'}</p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => setShowSettingsModal(true)}
                    className="p-1.5 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-md transition-all"
                    title="Settings"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-neutral-800 rounded-md transition-all"
                    title="Sign Out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 flex flex-col h-full min-w-0 relative ${theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-white'}`}>
        <AnimatePresence mode="wait">

          {/* -------------------- RECORD LAYOUT -------------------- */}
          {activeView === 'record' && (
            <motion.div
              key="record-view"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col h-full w-full absolute inset-0"
            >
              {/* Mobile Tab Switcher */}
              <div className={`md:hidden shrink-0 px-4 py-2 border-b flex justify-center z-10 ${theme === 'dark' ? 'bg-[#0a0a0a] border-neutral-800/80' : 'bg-white border-neutral-200'}`}>
                <div className={`flex p-1 rounded-xl border w-full max-w-[300px] ${theme === 'dark' ? 'bg-[#111] border-neutral-800' : 'bg-neutral-100/50 border-neutral-200/50'}`}>
                  <button
                    onClick={() => setMobileTab('transcript')}
                    className={`flex items-center justify-center gap-2 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${mobileTab === 'transcript' ? (theme === 'dark' ? 'bg-neutral-800 text-white shadow-sm' : 'bg-white text-neutral-900 shadow-sm border border-neutral-200') : (theme === 'dark' ? 'text-neutral-500' : 'text-neutral-500')}`}
                  >
                    <List className="w-3.5 h-3.5" /> Transcript
                  </button>
                  <button
                    onClick={() => setMobileTab('translation')}
                    className={`flex items-center justify-center gap-2 flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${mobileTab === 'translation' ? (theme === 'dark' ? 'bg-neutral-800 text-white shadow-sm' : 'bg-white text-neutral-900 shadow-sm border border-neutral-200') : (theme === 'dark' ? 'text-neutral-500' : 'text-neutral-500')}`}
                  >
                    <FileText className="w-3.5 h-3.5" /> Notes
                  </button>
                </div>
              </div>

              {/* Workspace */}
              <div className="flex-1 flex flex-col md:grid md:grid-cols-2 min-h-0 relative">
                {/* Floating Dock */}
                <div className={`absolute bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 sm:gap-4 p-2 sm:p-3 rounded-2xl backdrop-blur-xl border w-[96%] sm:w-auto overflow-x-auto no-scrollbar ${theme === 'dark' ? 'bg-black/80 md:bg-black/60 border-neutral-800/80 shadow-[0_0_40px_rgba(0,0,0,0.8)]' : 'bg-white/90 md:bg-white/70 border-neutral-200 shadow-[0_4px_30px_rgba(0,0,0,0.1)]'}`}>

                  {isListening && (
                    <div className="hidden sm:flex items-center gap-2 text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-1.5 rounded-md border border-emerald-400/20 uppercase tracking-widest mr-[-4px]">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                      </span>
                      <span>Recording</span>
                    </div>
                  )}

                  {tier === 'free' && (
                    <div 
                      onClick={() => setShowUpgradeModal(true)}
                      className={`cursor-pointer flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-md border uppercase tracking-widest transition-colors shadow-sm ml-1 ${
                        900 - freeUsageTime < 180 
                          ? 'text-red-500 bg-red-500/10 border-red-500/30 animate-pulse' 
                          : theme === 'dark' 
                            ? 'text-amber-400 bg-amber-400/10 border-amber-400/20 hover:bg-amber-400/20' 
                            : 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100'
                      }`}
                      title="Upgrade to Pro for unlimited transcription"
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span className="whitespace-nowrap">{Math.max(0, Math.floor((900 - freeUsageTime) / 60))}:{String(Math.max(0, 900 - freeUsageTime) % 60).padStart(2, '0')}&nbsp;FREE</span>
                    </div>
                  )}

                  <div className={`flex items-center gap-1 p-1 rounded-xl border hidden sm:flex ${theme === 'dark' ? 'bg-[#111] border-neutral-800' : 'bg-neutral-100/50 border-neutral-200/50'}`}>
                    <button
                      onClick={() => setIsMicEnabled(!isMicEnabled)}
                      disabled={isListening}
                      className={`flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isMicEnabled
                        ? (theme === 'dark' ? 'bg-neutral-800 text-white shadow-sm' : 'bg-white text-neutral-900 shadow-sm border border-neutral-200 shadow-[0_2px_10px_rgba(0,0,0,0.05)]')
                        : (theme === 'dark' ? 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900' : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/50')
                        } ${isListening ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {isMicEnabled ? <Mic className="w-3.5 h-3.5 mr-1.5" /> : <MicOff className="w-3.5 h-3.5 mr-1.5" />}
                      Mic
                    </button>
                    <button
                      onClick={() => setIsSystemAudioEnabled(!isSystemAudioEnabled)}
                      disabled={isListening}
                      className={`flex items-center justify-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isSystemAudioEnabled
                        ? (theme === 'dark' ? 'bg-neutral-800 text-white shadow-sm' : 'bg-white text-neutral-900 shadow-sm border border-neutral-200 shadow-[0_2px_10px_rgba(0,0,0,0.05)]')
                        : (theme === 'dark' ? 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900' : 'text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/50')
                        } ${isListening ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <Monitor className="w-3.5 h-3.5 mr-1.5" />
                      System
                    </button>
                  </div>

                  {isMicEnabled && (
                    <select
                      value={selectedMicId}
                      onChange={(e) => setSelectedMicId(e.target.value)}
                      className={`text-[11px] font-medium px-2 sm:px-3 py-2 rounded-xl border outline-none transition-colors max-w-[90px] sm:max-w-[150px] truncate cursor-pointer appearance-none ${theme === 'dark' ? 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:text-white' : 'bg-white text-neutral-700 border-neutral-300 hover:text-neutral-900 shadow-[0_2px_10px_rgba(0,0,0,0.05)]'}`}
                      disabled={isListening}
                    >
                      <option value="default">Default Mic</option>
                      {availableMics.map(mic => (
                        <option key={mic.deviceId} value={mic.deviceId}>
                          {mic.label || `Mic (${mic.deviceId.slice(0, 4)})`}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    onClick={handleShareLive}
                    disabled={!isListening || isSharingLive}
                    className={`text-[10px] sm:text-[11px] px-3 sm:px-4 py-2 rounded-xl uppercase font-bold tracking-wider flex items-center gap-1.5 transition-all outline-none border ${liveSessionId
                      ? "bg-red-500/10 text-red-500 border-red-500/30 shadow-sm"
                      : isListening
                        ? (theme === 'dark' ? "bg-neutral-900 text-blue-400 border-neutral-700 hover:text-white hover:bg-neutral-800" : "bg-blue-50 text-blue-600 border-blue-200 hover:text-blue-700 hover:bg-blue-100 shadow-sm")
                        : (theme === 'dark' ? "bg-neutral-900 text-neutral-600 border-neutral-800 cursor-not-allowed" : "bg-neutral-100/80 text-neutral-400 border-neutral-200 cursor-not-allowed")
                      }`}
                  >
                    {liveSessionId ? (
                      <>
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span>Live</span>
                      </>
                    ) : (
                      <>
                        {isSharingLive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RadioTower className="w-3.5 h-3.5" />}
                        <span>Share</span>
                      </>
                    )}
                  </button>

                  <div className={`w-[1px] h-6 mx-1 ${theme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-300'}`}></div>

                  {/* Language Selector Dropdown (Dark Theme) */}
                  <div ref={languageDropdownRef} className="relative group shrink-0">
                    <button
                      type="button"
                      disabled={isListening}
                      onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                      className={`flex items-center justify-between min-w-[100px] gap-2 px-3 py-1.5 rounded-lg uppercase font-medium text-xs transition-all outline-none border ${showLanguageDropdown ? (theme === 'dark' ? "bg-neutral-800 text-white border-neutral-700/50 shadow-sm" : "bg-white text-neutral-900 border-neutral-300 shadow-sm") : isListening ? (theme === 'dark' ? "bg-neutral-900 text-neutral-600 border-neutral-800 cursor-not-allowed" : "bg-neutral-100/80 text-neutral-400 border-neutral-200 cursor-not-allowed") : (theme === 'dark' ? "bg-[#111] text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 border-transparent hover:border-neutral-800" : "bg-white text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 border-neutral-200 shadow-[0_2px_10px_rgba(0,0,0,0.05)]")
                        }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 hidden sm:block" />
                        <span className="text-[10px] sm:text-[11px] font-bold whitespace-nowrap">
                          {selectedLanguages.length === 0 ? "Auto" : selectedLanguages.length === 1 ? AVAILABLE_LANGUAGES.find(l => l.code === selectedLanguages[0])?.label : `${selectedLanguages.length} Selected`}
                        </span>
                      </div>
                    </button>

                    <AnimatePresence>
                      {showLanguageDropdown && (
                        <>
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-[220px] bg-[#111] border border-neutral-800 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)] overflow-hidden z-[60]"
                          >
                            <div className="p-3 border-b border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
                              <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Select Languages</span>
                              <span className="text-[9px] font-medium text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded-full">{selectedLanguages.length}/{AVAILABLE_LANGUAGES.length}</span>
                            </div>
                            <div className="p-2 max-h-[240px] overflow-y-auto no-scrollbar flex flex-col gap-1">
                              <button
                                onClick={() => setSelectedLanguages([])}
                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[12px] font-medium transition-colors ${selectedLanguages.length === 0 ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
                                  }`}
                              >
                                <span>Auto-Detect</span>
                                {selectedLanguages.length === 0 && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                              </button>
                              <div className="h-[1px] bg-neutral-800/50 my-1 mx-2"></div>
                              {AVAILABLE_LANGUAGES.map(lang => {
                                const isSelected = selectedLanguages.includes(lang.code);
                                return (
                                  <button
                                    key={lang.code}
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedLanguages(selectedLanguages.filter(c => c !== lang.code));
                                      } else {
                                        setSelectedLanguages([...selectedLanguages, lang.code]);
                                      }
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[12px] font-medium transition-colors ${isSelected ? 'bg-neutral-800 text-white shadow-sm' : 'text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
                                      }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={isSelected ? "font-semibold text-white" : ""}>{lang.label}</span>
                                      {lang.code !== 'en' && <span className={`text-[10px] ${isSelected ? 'text-neutral-400' : 'text-neutral-600'}`}>{lang.native}</span>}
                                    </div>
                                    {isSelected && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                                  </button>
                                );
                              })}
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  {(() => {
                    if (isConnecting) {
                      return (
                        <button disabled className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2 rounded-xl font-bold text-sm transition-all duration-200 border cursor-not-allowed ${theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-neutral-400' : 'bg-neutral-100/50 border-neutral-200 text-neutral-400'}`}>
                          <Loader2 className="w-4 h-4 animate-spin" /> <span className="hidden sm:inline">Connecting</span>
                        </button>
                      );
                    }
                    if (isListening) {
                      return (
                        <button onClick={stopListening} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2 rounded-xl font-bold text-sm transition-all duration-200 border ${theme === 'dark' ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.15)]' : 'bg-red-50 text-red-600 hover:bg-red-100 border-red-200 shadow-sm'}`}>
                          <Square className="w-4 h-4 fill-current shrink-0" /> Stop
                        </button>
                      );
                    }
                    if (transcriptItems.length > 0) {
                      return (
                        <div className="flex items-center gap-2 flex-1 sm:flex-none justify-end">
                          <button
                            onClick={() => {
                              if (!isAuthenticated) return setShowAuthModal(true);
                              if (!isMicEnabled && !isSystemAudioEnabled) return toast.error("Please enable Mic or System Audio to start.");
                              connect(true);
                            }}
                            className={`flex items-center justify-center gap-2 px-4 sm:px-6 py-2 rounded-xl font-bold text-sm transition-all duration-200 border ${theme === 'dark' ? 'border-blue-500/30 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 shadow-[0_0_15px_rgba(69,143,255,0.15)]' : 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 shadow-sm'}`}
                          >
                            <Play className="w-4 h-4 fill-current shrink-0" /> Resume
                          </button>
                          <div className={`w-[1px] h-6 mx-1 ${theme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-300'}`}></div>
                          <button
                            onClick={() => {
                              if (!isAuthenticated) return setShowAuthModal(true);
                              if (!isMicEnabled && !isSystemAudioEnabled) return toast.error("Please enable Mic or System Audio to start.");
                              if (window.confirm("Are you sure you want to start a new session? This will clear your current timeline.")) {
                                connect(false);
                              }
                            }}
                            className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all duration-200 border ${theme === 'dark' ? 'bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800 border-neutral-800' : 'bg-white text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 shadow-sm border-neutral-200'}`}
                          >
                            New
                          </button>
                        </div>
                      );
                    }
                    return (
                      <button
                        onClick={() => {
                          if (!isAuthenticated) return setShowAuthModal(true);
                          if (!isMicEnabled && !isSystemAudioEnabled) return toast.error("Please enable Mic or System Audio to start.");
                          connect(false);
                        }}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2 rounded-xl font-bold text-sm transition-all duration-200 ${theme === 'dark' ? 'bg-white text-black hover:bg-neutral-200 shadow-[0_0_20px_rgba(255,255,255,0.2)]' : 'bg-neutral-900 text-white hover:bg-black shadow-[0_2px_15px_rgba(0,0,0,0.15)] border border-neutral-800'}`}
                      >
                        <Mic className="w-4 h-4 shrink-0" /> Start
                      </button>
                    );
                  })()}
                </div>

                {/* Left Pane: Raw Transcript */}
                <div className={`${mobileTab === 'transcript' ? 'flex' : 'hidden'} md:flex flex-col h-full min-h-0 overflow-hidden relative ${theme === 'dark' ? 'bg-[#0a0a0a] border-r border-neutral-800' : 'bg-white border-r border-neutral-200'}`}>
                  <div className={`min-h-[48px] border-b flex items-center px-6 shrink-0 ${theme === 'dark' ? 'border-neutral-800/80 bg-black' : 'border-neutral-200/80 bg-[#f4f4f5]'}`}>
                    <h2 className={`text-[10px] font-semibold tracking-widest uppercase flex items-center gap-2 ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-600'}`}>
                      <List className="w-3.5 h-3.5" /> Live Transcript
                    </h2>
                  </div>
                  <div className="flex-1 overflow-y-auto p-6 pb-24 space-y-6 min-h-0" ref={transcriptContainerRef}>
                    {transcriptItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-neutral-600">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 border ${theme === 'dark' ? 'bg-neutral-900 border-neutral-800/50' : 'bg-neutral-100 border-neutral-200/50'}`}>
                          <List className={`w-5 h-5 ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-400'}`} />
                        </div>
                        <p className={`text-sm font-medium ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-600'}`}>No transcript data</p>
                        <p className={`text-xs mt-1 ${theme === 'dark' ? 'text-neutral-600' : 'text-neutral-500'}`}>Click "Start" to begin recording.</p>
                      </div>
                    ) : (
                      transcriptItems.map((item, idx) => (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                          key={item.id + idx} className="flex flex-col items-start w-full"
                        >
                          <div className={`p-4 rounded-xl border w-full flex flex-col gap-1.5 shadow-sm ${item.role === 'user'
                            ? (theme === 'dark' ? 'bg-[#151515] border-neutral-800/80' : 'bg-[#f4f4f5] border-neutral-200/80')
                            : (theme === 'dark' ? 'bg-[#0f172a]/40 border-blue-900/30' : 'bg-blue-50/50 border-blue-200/50')
                            }`}>
                            <span className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${item.role === 'user' ? 'text-neutral-500' : 'text-blue-500'}`}>
                              {item.role === 'user' ? 'Live Room' : 'AI Assistant'}
                            </span>
                            <div className={`text-[17px] leading-[1.8] whitespace-pre-wrap break-words font-medium prose prose-p:my-2 prose-p:leading-[1.8] max-w-none ${theme === 'dark' ? 'prose-invert' : ''} ${item.isFinal ? (theme === 'dark' ? 'text-white' : 'text-neutral-900') : (theme === 'dark' ? 'text-neutral-400 italic' : 'text-neutral-500 italic')}`}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right Pane: Customizable Workspace Tabs */}
                <div className={`${mobileTab === 'translation' ? 'flex' : 'hidden'} md:flex flex-col h-full relative min-h-0 overflow-hidden ${theme === 'dark' ? 'bg-black border-l border-neutral-800/80' : 'bg-[#f4f4f5] border-l border-neutral-200'}`}>
                  <div className={`min-h-[48px] border-b flex items-center justify-between px-2 sm:px-4 ${theme === 'dark' ? 'border-neutral-800/80 bg-[#0a0a0a]' : 'border-neutral-200 bg-white'}`}>

                    {/* Tabs / Headers */}
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-2">
                      {workspaceViews.map((view) => (
                        <button
                          key={view.id}
                          onClick={() => setActiveWorkspaceId(view.id)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap border ${activeWorkspaceId === view.id ? (theme === 'dark' ? 'bg-neutral-800 border-neutral-700 text-white shadow-sm' : 'bg-white shadow-sm border-neutral-200 text-neutral-900') : (theme === 'dark' ? 'bg-transparent border-transparent text-neutral-500 hover:text-neutral-300 hover:bg-neutral-900' : 'bg-transparent border-transparent text-neutral-500 hover:text-neutral-800 hover:bg-neutral-200/50')}`}
                        >
                          {view.type === 'ai_notes' ? <FileText className="w-3.5 h-3.5" /> : <RadioTower className="w-3.5 h-3.5" />}
                          {view.type === 'ai_notes' ? 'AI NOTES' : 'TRANSLATION'}
                          <span className="opacity-50 text-[9px] uppercase">[{AVAILABLE_LANGUAGES.find(l => l.code === view.language)?.label || view.language}]</span>

                          <div onClick={(e) => {
                            e.stopPropagation();
                            removeWorkspaceView(view.id);
                          }} className={`p-0.5 rounded-sm transition-colors ${theme === 'dark' ? 'hover:bg-neutral-700/50 text-neutral-400 hover:text-white' : 'hover:bg-neutral-200 text-neutral-400 hover:text-neutral-900'}`}>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </div>
                        </button>
                      ))}

                      <button
                        onClick={() => setShowAddViewModal(true)}
                        className={`flex items-center justify-center w-7 h-7 rounded-sm border transition-all ml-1 shrink-0 ${theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800 hover:border-neutral-700' : 'bg-white border-neutral-200 shadow-sm text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'}`}
                        title="Add Workspace View"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                      </button>
                    </div>

                    {/* Action buttons (Save, Take Note) */}
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-4">
                      <button
                        onClick={handleManualSave}
                        disabled={transcriptItems.length === 0}
                        className={`text-[10px] px-2.5 py-1.5 rounded-md border flex items-center gap-1.5 font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed hidden sm:flex transition-colors ${theme === 'dark' ? 'border-neutral-700 bg-[#111] text-white hover:bg-neutral-800' : 'border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900 shadow-sm'}`}
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
                        className={`text-[10px] px-2.5 py-1.5 rounded-md border flex items-center gap-1.5 font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${theme === 'dark' ? 'border-neutral-700 bg-neutral-800 text-white hover:bg-neutral-700' : 'border-neutral-300 bg-neutral-100 text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 shadow-sm'}`}
                      >
                        {isSummarizing ? <Loader2 className="w-3 h-3 animate-spin text-neutral-400" /> : <FileText className="w-3 h-3 text-neutral-400" />}
                        {isSummarizing ? "VALIDATING" : "TAKE NOTE"}
                      </button>
                    </div>
                  </div>

                  {/* Rendering Active View Payload */}
                  <div className="flex-1 min-h-0 overflow-hidden relative">
                    {workspaceViews.map((view) => {
                      if (view.id !== activeWorkspaceId) return null;

                      if (view.type === 'ai_notes') {
                        const summaryText = summaries[view.language || 'en'];
                        return (
                          <div key={view.id} className="h-full flex flex-col p-6 pb-24 overflow-y-auto">
                            {!summaryText ? (
                              <div className="h-full flex flex-col items-center justify-center text-neutral-600 opacity-50">
                                <FileText className="w-8 h-8 mb-2" />
                                <p className="text-xs font-medium">Waiting for Summary</p>
                              </div>
                            ) : (
                              <div className={`prose max-w-none prose-h1:text-[16px] prose-h1:font-bold prose-h1:tracking-tight prose-h2:text-[14px] prose-h2:font-semibold prose-p:text-[13.5px] prose-p:leading-relaxed prose-ul:text-[13.5px] font-medium tracking-wide ${theme === 'dark' ? 'prose-invert prose-neutral prose-h1:text-white prose-h2:text-neutral-100 prose-p:text-neutral-200 prose-a:text-white prose-ul:text-neutral-200 prose-li:marker:text-neutral-600' : 'prose-neutral prose-h1:text-neutral-900 prose-h2:text-neutral-800 prose-p:text-neutral-700 prose-a:text-neutral-900 prose-ul:text-neutral-700 prose-li:marker:text-neutral-400'}`}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryText}</ReactMarkdown>
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (view.type === 'live_translation') {
                        return (
                          <div key={view.id} className="h-full flex flex-col pt-6 px-6 sm:px-8 pb-32 overflow-y-auto space-y-6" ref={translatedTranscriptContainerRef}>
                            {translatedTranscriptItems.length === 0 ? (
                              <div className="flex flex-col items-center justify-center h-full text-neutral-500 opacity-60">
                                <RadioTower className="w-8 h-8 mb-3 opacity-50" />
                                <p className="text-[13px]">Listening for translations...</p>
                              </div>
                            ) : (
                              translatedTranscriptItems.map((item, index) => (
                                <div key={index} className="flex group">
                                  <div className={`text-[17px] leading-[1.8] whitespace-pre-wrap break-words font-medium prose prose-p:my-2 prose-p:leading-[1.8] max-w-none ${theme === 'dark' ? 'prose-invert' : ''} ${item.isFinal ? (theme === 'dark' ? 'text-white' : 'text-neutral-900') : (theme === 'dark' ? 'text-neutral-400 italic' : 'text-neutral-500 italic')}`}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        );
                      }

                      return null;
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
                <div className={`${activeNote ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 md:min-w-[300px] border-r border-neutral-800 bg-[#0a0a0a] flex flex-col h-full min-h-0`}>
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
                <div className={`${!activeNote ? 'hidden md:flex' : 'flex'} flex-1 flex flex-col h-full bg-black relative min-w-0 min-h-0`}>
                  {!activeNote ? (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-600">
                      <Clock className="w-12 h-12 mb-4 opacity-20 text-neutral-400" />
                      <p className="text-sm font-medium text-neutral-400">Select a note to view</p>
                    </div>
                  ) : (
                    <div className="flex flex-col h-full w-full">
                      <div className="h-16 px-4 md:px-8 border-b border-neutral-800/80 flex items-center justify-between shrink-0 gap-3">
                        <div className="flex items-center gap-2 md:gap-0 min-w-0">
                          <button
                            onClick={() => setSelectedNoteId(null)}
                            className="md:hidden p-2 -ml-2 text-neutral-500 hover:text-white transition-all rounded-md shrink-0"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                          </button>
                          <div className="min-w-0 truncate">
                            <h2 className="text-lg font-semibold text-white truncate">{activeNote.title}</h2>
                            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
                              Recorded on {new Date(activeNote.date).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownloadNote(activeNote)}
                            className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-md transition-all"
                            title="Download note"
                          >
                            <Download className="w-4 h-4" />
                          </button>
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
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto w-full">
                        {/* We will grid layout the exported notes if they span multiple langs */}
                        {Object.keys(activeNote.summaries).length > 0 && (
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
                        )}

                        <div className="max-w-4xl mx-auto p-8 lg:p-12">
                          {activeNote.transcriptItems.length > 0 && (
                            <div className={Object.keys(activeNote.summaries).length > 0 ? "mt-16 pt-8 border-t border-neutral-800/50" : ""}>
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

      {/* Mobile Bottom Navigation */}
      <nav className={`md:hidden shrink-0 w-full flex items-center justify-around px-2 pt-2 pb-5 z-40 border-t ${theme === 'dark' ? 'bg-black border-neutral-800/80' : 'bg-white border-neutral-200'}`}>
        <button
          onClick={() => setActiveView('record')}
          className={`flex flex-col items-center gap-1 min-w-[64px] transition-all ${activeView === 'record'
            ? (theme === 'dark' ? 'text-white' : 'text-neutral-900')
            : (theme === 'dark' ? 'text-neutral-500 hover:text-neutral-400' : 'text-neutral-500 hover:text-neutral-700')
            }`}
        >
          <div className={`p-1.5 rounded-full ${activeView === 'record' ? (theme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-100') : 'bg-transparent'}`}>
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-medium">Record</span>
        </button>
        <button
          onClick={() => setActiveView('notes')}
          className={`relative flex flex-col items-center gap-1 min-w-[64px] transition-all ${activeView === 'notes'
            ? (theme === 'dark' ? 'text-white' : 'text-neutral-900')
            : (theme === 'dark' ? 'text-neutral-500 hover:text-neutral-400' : 'text-neutral-500 hover:text-neutral-700')
            }`}
        >
          <div className={`p-1.5 rounded-full ${activeView === 'notes' ? (theme === 'dark' ? 'bg-neutral-800' : 'bg-neutral-100') : 'bg-transparent'}`}>
            <Clock className="w-5 h-5" />
            {savedNotes.length > 0 && (
              <span className="absolute top-0 right-3 flex items-center justify-center bg-blue-500 text-white text-[9px] font-bold h-4 min-w-[16px] px-1 rounded-full border-2" style={{ borderColor: theme === 'dark' ? '#000' : '#fff' }}>
                {savedNotes.length}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium">Notes</span>
        </button>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className={`flex flex-col items-center gap-1 min-w-[64px] transition-all ${theme === 'dark' ? 'text-neutral-500 hover:text-neutral-400' : 'text-neutral-500 hover:text-neutral-700'}`}
        >
          <div className="p-1.5 rounded-full bg-transparent">
            {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </div>
          <span className="text-[10px] font-medium">{theme === 'dark' ? 'Dark' : 'Light'}</span>
        </button>
      </nav>
    </div>
  );
}
