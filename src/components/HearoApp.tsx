"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Monitor, Square, Loader2, Clock, Trash2, Lock, Save, RadioTower, Download, Upload, LogOut, Settings, Sparkles, CheckCircle2, Globe, Sun, Moon, Play, Search, Copy, Languages } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { useAppStore, TranscriptItem, SavedNote } from "@/lib/store";
import { useAudioRealtime, canCaptureSystemAudio } from "@/lib/useAudioRealtime";
import { createClient } from "@/utils/supabase/client";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { toast } from "sonner";
import { IntroCover } from "@/components/IntroCover";

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

// Speaker turns arrive as "**Speaker 1:** text" paragraphs.
function splitTurns(text: string) {
  let offset = 0;
  return text.split("\n\n").map((para) => {
    const label = para.match(/^\*\*(.+?):\*\* ?/);
    const bodyStart = offset + (label ? label[0].length : 0);
    offset += para.length + 2;
    return { speaker: label?.[1] ?? null, body: para.slice(label ? label[0].length : 0), bodyStart };
  });
}

// Rendered by hand rather than as markdown so settled words and words that may still
// change can sit on the same line in different inks.
const TranscriptBlock = memo(function TranscriptBlock({ item }: { item: TranscriptItem }) {
  const settled = item.isFinal ? item.text.length : item.finalLength ?? item.text.length;
  return (
    <>
      {splitTurns(item.text).map((turn, i) => {
        if (!turn.body.trim()) return null;
        const cut = Math.max(0, Math.min(turn.body.length, settled - turn.bodyStart));
        return (
          <div key={i} className="mb-7">
            {turn.speaker && <div className="text-[13px] font-semibold text-[var(--muted)] mb-1">{turn.speaker}</div>}
            <p className="text-[20px] sm:text-[24px] leading-[1.5] tracking-[-0.01em] font-medium whitespace-pre-wrap break-words">
              {turn.body.slice(0, cut)}<span className="text-[var(--muted)]">{turn.body.slice(cut)}</span>
            </p>
          </div>
        );
      })}
    </>
  );
});

// Subtitle-style Chinese translation block, one line per speaker turn.
const TranslationBlock = memo(function TranslationBlock({ text }: { text: string }) {
  return (
    <div className="text-[20px] sm:text-[24px] leading-[1.6] whitespace-pre-wrap break-words font-medium mb-7">
      {text}
    </div>
  );
});

// Halo behind the stop button that swells with the incoming audio, so it's obvious Hearo can hear the room.
function LevelHalo({ getLevel }: { getLevel: () => number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let smooth = 0;
    const tick = () => {
      smooth += (getLevel() - smooth) * 0.25;
      if (ref.current) ref.current.style.transform = `scale(${1 + smooth * 0.9})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getLevel]);
  return <span ref={ref} aria-hidden="true" className="absolute inset-0 rounded-full bg-[var(--fg)] opacity-25 pointer-events-none" />;
}

const formatClock = (seconds: number) => {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
};

const THEME_VARS = {
  dark: { '--bg': '#000', '--fg': '#fff', '--muted': '#8f8f8f', '--line': 'rgba(255,255,255,0.14)', '--panel': '#151515' },
  light: { '--bg': '#fff', '--fg': '#000', '--muted': '#6b6b6b', '--line': 'rgba(0,0,0,0.12)', '--panel': '#f2f2f2' },
} as const;
const LIVE_RED = '#e5484d';

// Invite codes arrive as ?invite=CODE and wait here until the visitor has an account to attach Pro to.
const INVITE_STORAGE_KEY = "hearo-invite";

export default function HearoApp({ intro = false }: { intro?: boolean }) {
  const {
    isListening,
    isConnecting,
    transcriptItems,
    selectedLanguages,
    setSelectedLanguages,
    activeView,
    setActiveView,
    savedNotes,
    deleteSavedNote,
    addSavedNote,
    updateSavedNote,
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
    isTranslationEnabled,
    setIsTranslationEnabled,
    theme,
    setTheme,
  } = useAppStore();

  const createSession = useMutation(api.mutations.createSession);
  const updateTranscriptMutation = useMutation(api.mutations.updateTranscript);
  const endSession = useMutation(api.mutations.endSession);

  const [isSharingLive, setIsSharingLive] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [requirePassword, setRequirePassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");

  const { connect, stopListening, restartStream, getLevel } = useAudioRealtime();
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const translationContainerRef = useRef<HTMLDivElement>(null);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const micDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [showMicDropdown, setShowMicDropdown] = useState(false);

  // Tracks the note id for the current recording session so repeated/auto saves
  // update one note instead of creating duplicates.
  const currentNoteIdRef = useRef<string | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(event.target as Node)) {
        setShowLanguageDropdown(false);
      }
      if (micDropdownRef.current && !micDropdownRef.current.contains(event.target as Node)) {
        setShowMicDropdown(false);
      }
    }
    if (showLanguageDropdown || showMicDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showLanguageDropdown, showMicDropdown]);

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

  // Landing cover + invite link state
  const [showIntro, setShowIntro] = useState(intro);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const claimingInviteRef = useRef(false);
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

  // Redeems a pending invite for the signed-in user, then refreshes their tier.
  const claimInvite = async () => {
    let code: string | null = null;
    try { code = localStorage.getItem(INVITE_STORAGE_KEY); } catch { }
    if (!code || claimingInviteRef.current) return fetchUsage();
    claimingInviteRef.current = true;
    try {
      const res = await fetch('/api/upgrade/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: code })
      });
      if (res.ok) {
        setFreeUsageExceeded(false);
        toast.success("Invite claimed. Pro is on, listening is unlimited.");
      } else if (res.status === 403) {
        toast.error("That invite code isn't valid. Ask for a new link.");
      } else {
        // Keep the code so the next sign-in or reload retries.
        claimingInviteRef.current = false;
        toast.error("Couldn't claim your invite. Reload to try again.");
        return fetchUsage();
      }
      try { localStorage.removeItem(INVITE_STORAGE_KEY); } catch { }
      setInviteCode(null);
    } catch {
      toast.error("Couldn't claim your invite. Reload to try again.");
    }
    claimingInviteRef.current = false;
    return fetchUsage();
  };

  // Pick up ?invite=CODE from the link, then keep the address bar clean.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const fromLink = url.searchParams.get('invite')?.trim();
      if (fromLink) {
        localStorage.setItem(INVITE_STORAGE_KEY, fromLink);
        url.searchParams.delete('invite');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
      setInviteCode(fromLink || localStorage.getItem(INVITE_STORAGE_KEY));
    } catch { }
  }, []);

  // Sync Supabase Auth State
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setIsAuthenticated(true);
        setUserEmail(session.user.email || null);
        claimInvite();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setIsAuthenticated(true);
        setUserEmail(session.user.email || null);
        claimInvite();
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

  // Auto-scroll transcript (and translation panel) while the user is near the bottom
  useEffect(() => {
    for (const container of [transcriptContainerRef.current, translationContainerRef.current]) {
      if (!container) continue;
      const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 150;
      if (isAtBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [transcriptItems, activeView, isTranslationEnabled]);

  const toggleTranslation = () => {
    const next = !isTranslationEnabled;
    setIsTranslationEnabled(next);
    // Translation is configured per socket, so reopen it without stopping capture.
    if (isListening) {
      restartStream();
      toast.success(next ? "中文翻译已开启" : "中文翻译已关闭");
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
      // Human-readable body: the transcript itself.
      const body = note.transcriptItems.map(i => i.text).join("\n\n") || "*No transcript available*";

      const hiddenTranscriptData = `\n\n<!-- AUDIO_NOTE_DATA_START\n${JSON.stringify(note.transcriptItems)}\nAUDIO_NOTE_DATA_END -->`;

      const fileContent = frontmatter + body + hiddenTranscriptData;
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
    const body = note.transcriptItems.map(i => i.text).join("\n\n") || "*No transcript available*";

    const hiddenTranscriptData = `\n\n<!-- AUDIO_NOTE_DATA_START\n${JSON.stringify(note.transcriptItems)}\nAUDIO_NOTE_DATA_END -->`;

    const fileContent = frontmatter + body + hiddenTranscriptData;

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

      const dataMatch = remainder.match(/<!-- AUDIO_NOTE_DATA_START\n([\s\S]*?)\nAUDIO_NOTE_DATA_END -->/);

      let transcriptItems: TranscriptItem[] = [];

      if (dataMatch) {
        try {
          transcriptItems = JSON.parse(dataMatch[1].trim());
        } catch (err) {
          // silently handle
        }
      } else {
        // Fallback: treat the whole body as a single transcript block
        const bodyText = remainder.trim();
        if (bodyText) {
          transcriptItems = [{ id: crypto.randomUUID(), role: 'user', text: bodyText, isFinal: true }];
        }
      }

      addSavedNote({
        id,
        title,
        date,
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
        title: "Hearo | HenryAI",
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

  // Push Transcript Updates to Convex (Markdown — item text already carries **Speaker N:** formatting)
  useEffect(() => {
    if (liveSessionId && liveSessionHostId && transcriptItems.length > 0) {
      const transcriptText = transcriptItems
        .map(i => i.text)
        .join('\n\n');

      updateTranscriptMutation({
        sessionId: liveSessionId as any,
        transcript: transcriptText,
        hostId: liveSessionHostId
      }).catch((err: any) => toast.error("Connection issue: Live transcript may not be visible to viewers."));
    }
  }, [transcriptItems, liveSessionId, liveSessionHostId, updateTranscriptMutation]);

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

  // Signature of the transcript used to detect "same content" saves.
  const computeContentHash = (items: TranscriptItem[]) =>
    items.map(i => `${i.id}:${i.text}`).join('|');

  const savingRef = useRef(false);

  // Centralized, de-duplicated save. Repeated saves of the same content update the
  // same note (or no-op); a short title is generated from the content on each change.
  const saveNote = async (opts?: { manual?: boolean }) => {
    const items = useAppStore.getState().transcriptItems;
    if (items.length === 0) return;
    if (savingRef.current) return;

    const hash = computeContentHash(items);
    const existingId = currentNoteIdRef.current;
    const existing = existingId
      ? useAppStore.getState().savedNotes.find(n => n.id === existingId)
      : null;

    // Dedup short-circuit: identical content already saved → nothing to do.
    if (existing && existing.contentHash === hash) {
      if (opts?.manual) { setIsSaved(true); setTimeout(() => setIsSaved(false), 2000); }
      return;
    }

    savingRef.current = true;
    try {
      const now = new Date();
      const transcriptText = items.map(i => i.text).join('\n\n');

      // Reserve the note id up front so concurrent saves target the same note.
      const id = existing?.id ?? crypto.randomUUID();
      if (!existing) currentNoteIdRef.current = id;

      // Generate a short title via the cheapest model.
      let title = '';
      try {
        const res = await fetch('/api/title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: transcriptText }),
        });
        if (res.ok) {
          const d = await res.json();
          title = d.title || '';
        }
      } catch { /* fall back below */ }

      if (!title) {
        title = existing?.title || `Note ${now.toLocaleTimeString()}`;
      }

      const latestItems = useAppStore.getState().transcriptItems;
      const payload = {
        title,
        date: now.toISOString(),
        transcriptItems: [...latestItems],
        contentHash: computeContentHash(latestItems),
      };

      if (existing) {
        updateSavedNote(id, payload);
      } else {
        addSavedNote({ id, ...payload });
      }

      if (opts?.manual) { setIsSaved(true); setTimeout(() => setIsSaved(false), 2000); }
    } finally {
      savingRef.current = false;
    }
  };

  const handleManualSave = () => { saveNote({ manual: true }); };

  // Session clock shown next to the live indicator.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isListening) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isListening]);

  // Detected after mount: the server can't know whether this device can share system audio.
  const [systemAudioSupported, setSystemAudioSupported] = useState(false);
  useEffect(() => { setSystemAudioSupported(canCaptureSystemAudio()); }, []);

  const startSession = (isResume: boolean) => {
    if (!isMicEnabled && !isSystemAudioEnabled) return toast.error("Turn on Mic or System first.");
    if (!isResume) setElapsed(0);
    connect(isResume);
  };

  const iconBtn = "w-9 h-9 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel)] transition-colors disabled:opacity-40 disabled:pointer-events-none";
  const dockBtn = (active: boolean) =>
    `h-11 px-3 sm:px-3.5 rounded-full flex items-center gap-2 text-[14px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active ? 'bg-[var(--line)] text-[var(--fg)]' : 'text-[var(--muted)] hover:text-[var(--fg)]'}`;
  const startBtn = "h-14 px-5 sm:px-6 rounded-full bg-[var(--fg)] text-[var(--bg)] flex items-center gap-2.5 text-[15px] font-semibold whitespace-nowrap hover:scale-[1.03] active:scale-95 transition-transform";
  const menuPanel = "absolute bottom-full mb-3 w-[240px] bg-[var(--panel)] border border-[var(--line)] rounded-2xl shadow-[0_20px_40px_-12px_rgba(0,0,0,0.45)] overflow-hidden z-[60]";
  const menuItem = (selected: boolean) =>
    `w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors ${selected ? 'bg-[var(--line)] text-[var(--fg)]' : 'text-[var(--muted)] hover:text-[var(--fg)]'}`;

  // Start a fresh note whenever a new recording clears the transcript.
  useEffect(() => {
    if (transcriptItems.length === 0) currentNoteIdRef.current = null;
  }, [transcriptItems.length]);

  // Debounced auto-save: fires ~8s after the transcript stops changing.
  useEffect(() => {
    if (transcriptItems.length === 0) return;
    const t = setTimeout(() => { saveNote(); }, 8000);
    return () => clearTimeout(t);
  }, [transcriptItems]);

  // Save once more when recording stops.
  const prevListeningRef = useRef(isListening);
  useEffect(() => {
    if (prevListeningRef.current && !isListening) {
      saveNote();
    }
    prevListeningRef.current = isListening;
  }, [isListening]);

  return (
    <div
      style={THEME_VARS[theme] as React.CSSProperties}
      className="h-[100dvh] w-full flex flex-col overflow-hidden font-[family-name:var(--font-host-grotesk)] bg-[var(--bg)] text-[var(--fg)] selection:bg-[var(--fg)] selection:text-[var(--bg)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      {showIntro && (
        <IntroCover
          hasInvite={!!inviteCode && tier !== 'pro'}
          onStart={() => {
            // An invite needs an account to attach Pro to, so ask for that first.
            if (inviteCode && !isAuthenticated) return setShowAuthModal(true);
            // Mic only from the cover: the screen-share picker is a lot to meet on a first click.
            connect(false, { micOnly: true });
          }}
          onSignIn={() => { if (!isAuthenticated) setShowAuthModal(true); }}
          onDone={() => setShowIntro(false)}
        />
      )}

      {/* Top Bar */}
      <header className="shrink-0 h-14 sm:h-16 flex items-center justify-between gap-3 px-4 sm:px-6 z-30">
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <Link href="/" className="text-[17px] font-semibold tracking-tight">Hearo</Link>
          {(isListening || isConnecting) && (
            <div role="status" className="flex items-center gap-2 text-[14px] font-medium tabular-nums">
              {isConnecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: LIVE_RED }} />
                  <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: LIVE_RED }} />
                </span>
              )}
              <span className="hidden sm:inline">{isConnecting ? 'Connecting' : 'Listening'}</span>
              {isListening && <span className="text-[var(--muted)]">{formatClock(elapsed)}</span>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {tier === 'free' && (
            <button
              onClick={() => setShowUpgradeModal(true)}
              title="Free listening time left. Upgrade for unlimited."
              className="h-8 px-2.5 sm:px-3 mr-1 rounded-full border border-[var(--line)] text-[13px] font-medium tabular-nums hover:bg-[var(--panel)] transition-colors"
              style={900 - freeUsageTime < 180 ? { color: LIVE_RED } : undefined}
            >
              {formatClock(900 - freeUsageTime)}<span className="hidden sm:inline text-[var(--muted)]"> free</span>
            </button>
          )}
          {activeView === 'record' && (
            <>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(transcriptItems.map(item => item.text).join('\n\n'));
                  toast.success("Transcript copied");
                }}
                disabled={transcriptItems.length === 0}
                className={iconBtn}
                title="Copy transcript"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={handleManualSave}
                disabled={transcriptItems.length === 0}
                className={`${iconBtn} hidden sm:flex`}
                title={isSaved ? "Saved" : "Save to notes"}
              >
                {isSaved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              </button>
            </>
          )}
          <button
            onClick={() => setActiveView(activeView === 'record' ? 'notes' : 'record')}
            className="h-9 px-3 rounded-full flex items-center gap-2 text-[14px] font-medium text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel)] transition-colors"
          >
            {activeView === 'record' ? <Clock className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            <span className="hidden sm:inline">{activeView === 'record' ? `Notes${savedNotes.length ? ` (${savedNotes.length})` : ''}` : 'Back to live'}</span>
          </button>
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={`${iconBtn} hidden sm:flex`}
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          {isAuthenticated && userEmail ? (
            <button onClick={() => setShowSettingsModal(true)} className={iconBtn} title={userEmail}>
              <Settings className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => setShowAuthModal(true)}
              className="h-8 px-3.5 ml-1 rounded-full bg-[var(--fg)] text-[var(--bg)] text-[13px] font-semibold"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

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
                  {inviteCode
                    ? "Your invite includes Pro. Sign in or create an account to claim it."
                    : freeUsageExceeded
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
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="w-full bg-[#111] border border-white/5 hover:border-white/10 text-neutral-300 font-medium text-[14px] py-3.5 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,0,0,0.2)]"
                >
                  {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />} Toggle Theme
                </button>

                <button
                  onClick={handleManageBilling}
                  disabled={isManagingBilling}
                  className="w-full bg-white hover:bg-neutral-200 text-black font-medium text-[14px] py-3.5 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.05)] hover:shadow-[0_0_25px_rgba(255,255,255,0.15)]"
                >
                  {isManagingBilling ? <Loader2 className="w-5 h-5 animate-spin text-black" /> : "Manage Billing"}
                </button>

                <button
                  onClick={() => { setShowSettingsModal(false); handleSignOut(); }}
                  className="w-full text-neutral-400 hover:text-white font-medium text-[14px] py-2 transition-colors flex items-center justify-center gap-2"
                >
                  <LogOut className="w-4 h-4" /> Sign out
                </button>
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


      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0 min-w-0 relative">
        <AnimatePresence mode="wait">

          {/* -------------------- LIVE LAYOUT -------------------- */}
          {activeView === 'record' && (
            <motion.div
              key="record-view"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col h-full w-full absolute inset-0"
            >
              <div className={`flex-1 min-h-0 flex flex-col ${isTranslationEnabled ? 'md:flex-row' : ''}`}>

                {/* Live Transcript */}
                <div ref={transcriptContainerRef} className={`flex-1 basis-1/2 min-h-0 overflow-y-auto px-5 sm:px-10 pt-4 sm:pt-8 ${isTranslationEnabled ? 'pb-6 md:pb-36' : 'pb-36'}`}>
                  <div className={`mx-auto w-full ${isTranslationEnabled ? 'max-w-[38rem]' : 'max-w-[46rem]'}`}>
                    {!transcriptItems.some(i => i.text.trim()) ? (
                      <div className="min-h-[52vh] flex flex-col justify-center">
                        <p className="text-[2.6rem] sm:text-[4.25rem] leading-[0.98] font-bold tracking-[-0.045em] max-w-[13ch]">
                          {isListening ? "Listening. Say something." : isConnecting ? "Connecting." : "Ready when your meeting is."}
                        </p>
                        <p className="mt-6 text-[16px] sm:text-[17px] text-[var(--muted)] max-w-[44ch] leading-relaxed">
                          {isListening
                            ? "Words appear here as they're spoken, with each speaker on their own line."
                            : systemAudioSupported
                              ? "Mic picks up the room. Turn on System to also capture a call playing on this computer."
                              : "Keep this tab open and your phone near whoever is speaking."}
                        </p>
                      </div>
                    ) : (
                      transcriptItems.map((item, idx) => (
                        <TranscriptBlock key={item.id + idx} item={item} />
                      ))
                    )}
                  </div>
                </div>

                {/* Live Chinese Translation */}
                {isTranslationEnabled && (
                  <div ref={translationContainerRef} className="flex-1 basis-1/2 min-h-0 overflow-y-auto px-5 sm:px-10 pt-4 sm:pt-8 pb-36 border-t md:border-t-0 md:border-l border-[var(--line)]">
                    <div className="mx-auto w-full max-w-[38rem]">
                      <div className="flex items-center justify-between mb-5">
                        <h2 className="text-[13px] font-semibold text-[var(--muted)]">中文实时翻译</h2>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(transcriptItems.map(i => i.translation || '').filter(Boolean).join('\n'));
                            toast.success("翻译已复制");
                          }}
                          disabled={!transcriptItems.some(i => i.translation)}
                          className={iconBtn}
                          title="Copy translation"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      {transcriptItems.some(i => i.translation) ? (
                        transcriptItems.map((item, idx) => item.translation ? (
                          <TranslationBlock key={item.id + idx} text={item.translation} />
                        ) : null)
                      ) : (
                        <p className="text-[16px] text-[var(--muted)] leading-relaxed">
                          {isListening ? "等待语音…听到的内容会实时翻译成中文显示在这里" : "开始后，所有收到的声音都会翻译成中文"}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Floating Dock */}
              <div className="absolute bottom-0 inset-x-0 z-40 pointer-events-none flex justify-center px-3 pt-12 pb-4 sm:pb-6 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent">
                <div className="pointer-events-auto flex items-center gap-0.5 p-1.5 rounded-full bg-[var(--panel)] border border-[var(--line)] shadow-[0_10px_40px_rgba(0,0,0,0.28)]">

                  <button
                    onClick={() => setIsMicEnabled(!isMicEnabled)}
                    disabled={isListening}
                    aria-pressed={isMicEnabled}
                    className={dockBtn(isMicEnabled)}
                    title={isListening ? "Stop to change sources" : "Listen through the microphone"}
                  >
                    {isMicEnabled ? <Mic className="w-4 h-4 shrink-0" /> : <MicOff className="w-4 h-4 shrink-0" />}
                    <span className="hidden sm:inline">Mic</span>
                  </button>

                  {systemAudioSupported && (
                    <button
                      onClick={() => setIsSystemAudioEnabled(!isSystemAudioEnabled)}
                      disabled={isListening}
                      aria-pressed={isSystemAudioEnabled}
                      className={dockBtn(isSystemAudioEnabled)}
                      title={isListening ? "Stop to change sources" : "Also capture audio playing on this computer"}
                    >
                      <Monitor className="w-4 h-4 shrink-0" />
                      <span className="hidden sm:inline">System</span>
                    </button>
                  )}

                  {isMicEnabled && (
                    <div ref={micDropdownRef} className="hidden md:block relative shrink-0">
                      <button
                        type="button"
                        disabled={isListening}
                        onClick={() => setShowMicDropdown(!showMicDropdown)}
                        className={`${dockBtn(showMicDropdown)} max-w-[150px]`}
                      >
                        <span className="truncate">
                          {selectedMicId === "default" ? "Default mic" : (availableMics.find(m => m.deviceId === selectedMicId)?.label || "Selected mic")}
                        </span>
                      </button>
                      <AnimatePresence>
                        {showMicDropdown && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 8 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className={`${menuPanel} left-1/2 -translate-x-1/2`}
                          >
                            <div className="p-1.5 max-h-[220px] overflow-y-auto no-scrollbar flex flex-col gap-0.5">
                              {[{ deviceId: "default", label: "Default mic" }, ...availableMics].map(mic => (
                                <button
                                  key={mic.deviceId}
                                  onClick={() => { setSelectedMicId(mic.deviceId); setShowMicDropdown(false); }}
                                  className={menuItem(selectedMicId === mic.deviceId)}
                                >
                                  <span className="truncate text-left">{mic.label || `Mic (${mic.deviceId.slice(0, 4)})`}</span>
                                  {selectedMicId === mic.deviceId && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  <div ref={languageDropdownRef} className="relative shrink-0">
                    <button
                      type="button"
                      disabled={isListening}
                      onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                      className={dockBtn(showLanguageDropdown)}
                      title={isListening ? "Stop to change languages" : "Languages spoken in the meeting"}
                    >
                      <Globe className="w-4 h-4 shrink-0" />
                      <span className="hidden sm:inline whitespace-nowrap">
                        {selectedLanguages.length === 0 ? "Auto" : selectedLanguages.length === 1 ? AVAILABLE_LANGUAGES.find(l => l.code === selectedLanguages[0])?.label : `${selectedLanguages.length} languages`}
                      </span>
                    </button>
                    <AnimatePresence>
                      {showLanguageDropdown && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.96, y: 8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.96, y: 8 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          className={`${menuPanel} left-0 sm:left-1/2 sm:-translate-x-1/2`}
                        >
                          <div className="p-1.5 max-h-[260px] overflow-y-auto no-scrollbar flex flex-col gap-0.5">
                            <button onClick={() => setSelectedLanguages([])} className={menuItem(selectedLanguages.length === 0)}>
                              <span>Detect automatically</span>
                              {selectedLanguages.length === 0 && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                            </button>
                            <div className="h-px bg-[var(--line)] my-1 mx-2" />
                            {AVAILABLE_LANGUAGES.map(lang => {
                              const isSelected = selectedLanguages.includes(lang.code);
                              return (
                                <button
                                  key={lang.code}
                                  onClick={() => setSelectedLanguages(isSelected ? selectedLanguages.filter(c => c !== lang.code) : [...selectedLanguages, lang.code])}
                                  className={menuItem(isSelected)}
                                >
                                  <span className="flex items-center gap-2">
                                    {lang.label}
                                    {lang.code !== 'en' && <span className="text-[12px] text-[var(--muted)]">{lang.native}</span>}
                                  </span>
                                  {isSelected && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <button
                    onClick={toggleTranslation}
                    role="switch"
                    aria-checked={isTranslationEnabled}
                    className={dockBtn(isTranslationEnabled)}
                    title="Translate everything into Chinese as it's spoken"
                  >
                    <Languages className="w-4 h-4 shrink-0" />
                    <span className="whitespace-nowrap">中文</span>
                  </button>

                  <button
                    onClick={handleShareLive}
                    disabled={!isListening || isSharingLive}
                    className={`${dockBtn(!!liveSessionId)} hidden sm:flex`}
                    style={liveSessionId ? { color: LIVE_RED } : undefined}
                    title={isListening ? "Share a live link to this transcript" : "Start listening to share a live link"}
                  >
                    {isSharingLive ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <RadioTower className="w-4 h-4 shrink-0" />}
                    <span>{liveSessionId ? 'Live' : 'Share'}</span>
                  </button>

                  {/* The one action that matters */}
                  <div className="flex items-center gap-1 pl-1.5">
                    {isConnecting ? (
                      <button disabled aria-label="Connecting" className="w-14 h-14 rounded-full bg-[var(--fg)] text-[var(--bg)] flex items-center justify-center opacity-60">
                        <Loader2 className="w-5 h-5 animate-spin" />
                      </button>
                    ) : isListening ? (
                      <div className="relative">
                        <LevelHalo getLevel={getLevel} />
                        <button
                          onClick={stopListening}
                          aria-label="Stop listening"
                          title="Stop listening"
                          className="relative w-14 h-14 rounded-full bg-[var(--fg)] text-[var(--bg)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                        >
                          <Square className="w-[18px] h-[18px] fill-current" />
                        </button>
                      </div>
                    ) : transcriptItems.length > 0 ? (
                      <>
                        <button
                          onClick={() => {
                            if (window.confirm("Start a new session? This clears the transcript on screen. It stays saved in Notes.")) startSession(false);
                          }}
                          className={dockBtn(false)}
                        >
                          New
                        </button>
                        <button onClick={() => startSession(true)} aria-label="Resume listening" className={startBtn}>
                          <Play className="w-4 h-4 fill-current shrink-0" /> <span className="hidden sm:inline">Resume</span>
                        </button>
                      </>
                    ) : (
                      <button onClick={() => startSession(false)} className={startBtn}>
                        <Mic className="w-4 h-4 shrink-0" />
                        <span className="sm:hidden">Start</span>
                        <span className="hidden sm:inline">Start listening</span>
                      </button>
                    )}
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
              className={`flex flex-col h-full w-full absolute inset-0 ${theme === 'dark' ? 'bg-black' : 'bg-[#f4f4f5]'}`}
            >
              <header className={`h-14 border-b flex items-center justify-between px-4 sm:px-6 shrink-0 z-10 ${theme === 'dark' ? 'border-neutral-800 bg-black' : 'border-neutral-200 bg-[#f4f4f5]'}`}>
                <h2 className={`text-[13px] sm:text-sm font-semibold tracking-wide truncate mr-2 ${theme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>Notes Library</h2>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportNotes}
                    className={`flex items-center gap-1.5 text-[10px] sm:text-[11px] px-2.5 sm:px-3 py-1.5 rounded-lg uppercase font-bold transition-all shadow-sm border ${theme === 'dark' ? 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-800' : 'bg-white border-neutral-200 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'}`}
                    title="Export All (ZIP)"
                  >
                    <Download className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Export</span>
                  </button>

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
                    className={`flex items-center gap-1.5 text-[10px] sm:text-[11px] px-2.5 sm:px-3 py-1.5 rounded-lg uppercase font-bold shadow-sm cursor-pointer transition-all ${theme === 'dark' ? 'bg-white text-black hover:bg-neutral-200' : 'bg-neutral-900 text-white hover:bg-black'}`}
                    title="Import Folder"
                  >
                    <Upload className="w-3.5 h-3.5 shrink-0" />
                    <span className="hidden sm:inline">Import</span>
                  </label>
                </div>
              </header>

              <div className="flex-1 flex overflow-hidden min-h-0">
                {/* Notes List Column */}
                <div className={`${activeNote ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 md:min-w-[300px] border-r ${theme === 'dark' ? 'border-neutral-800 bg-[#0a0a0a]' : 'border-neutral-200 bg-white'} flex flex-col h-full min-h-0`}>
                  <div className={`p-3 sm:p-4 border-b shrink-0 relative ${theme === 'dark' ? 'border-neutral-800/50' : 'border-neutral-100'}`}>
                    <Search className={`absolute left-6 sm:left-7 top-1/2 -translate-y-1/2 w-4 h-4 ${theme === 'dark' ? 'text-neutral-500' : 'text-neutral-400'}`} />
                    <input
                      type="text"
                      placeholder="Search notes..."
                      className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none transition-colors shadow-sm ${theme === 'dark' ? 'bg-[#111] border-neutral-800 text-neutral-100 placeholder:text-neutral-600 focus:border-neutral-600 focus:bg-neutral-900/50' : 'bg-[#f4f4f5] border-transparent text-neutral-900 placeholder:text-neutral-500 focus:border-neutral-300 focus:bg-white'}`}
                    />
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
                    {savedNotes.length === 0 ? (
                      <div className={`text-center py-10 ${theme === 'dark' ? 'text-neutral-600' : 'text-neutral-400'}`}>
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
                              ? (theme === 'dark' ? 'bg-neutral-900 border-neutral-700' : 'bg-[#f4f4f5] border-neutral-300 shadow-sm')
                              : (theme === 'dark' ? 'bg-[#111] border-transparent hover:bg-neutral-900/50 hover:border-neutral-800' : 'bg-white border-transparent hover:bg-neutral-50 hover:border-neutral-200')
                              }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <h3 className={`text-sm font-medium line-clamp-1 break-all flex-1 ${theme === 'dark' ? 'text-neutral-200' : 'text-neutral-800'}`}>{note.title}</h3>
                              <span className="text-[10px] text-neutral-500 shrink-0 whitespace-nowrap mt-0.5">
                                {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            <p className="text-xs text-neutral-500 mt-2 line-clamp-2 leading-relaxed">
                              {note.transcriptItems.map(i => i.text).join(' ').replace(/[#*`]/g, '') || "No transcript available."}
                            </p>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>

{/* Note Detail Column */}
                <div className={`${!activeNote ? 'hidden md:flex' : 'flex'} flex-1 flex flex-col h-full ${theme === 'dark' ? 'bg-black' : 'bg-white'} relative min-w-0 min-h-0`}>
                  {!activeNote ? (
                    <div className={`h-full flex flex-col items-center justify-center ${theme === 'dark' ? 'text-neutral-600' : 'text-neutral-400'}`}>
                      <Clock className={`w-12 h-12 mb-4 opacity-20 ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`} />
                      <p className={`text-sm font-medium ${theme === 'dark' ? 'text-neutral-400' : 'text-neutral-500'}`}>Select a note to view</p>
                    </div>
                  ) : (
                    <div className="flex flex-col h-full w-full">
                      <div className={`h-16 px-4 md:px-8 border-b flex items-center justify-between shrink-0 gap-3 ${theme === 'dark' ? 'border-neutral-800/80' : 'border-neutral-200/80 bg-[#f4f4f5]'}`}>
                        <div className="flex items-center gap-2 md:gap-0 min-w-0">
                          <button
                            onClick={() => setSelectedNoteId(null)}
                            className={`md:hidden p-2 -ml-2 transition-all rounded-md shrink-0 ${theme === 'dark' ? 'text-neutral-500 hover:text-white' : 'text-neutral-500 hover:text-black hover:bg-neutral-200'}`}
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                          </button>
                          <div className="min-w-0 truncate">
                            <h2 className={`text-lg font-semibold truncate ${theme === 'dark' ? 'text-white' : 'text-neutral-900'}`}>{activeNote.title}</h2>
                            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
                              Recorded on {new Date(activeNote.date).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDownloadNote(activeNote)}
                            className={`p-2 rounded-md transition-all ${theme === 'dark' ? 'text-neutral-500 hover:text-white hover:bg-neutral-800' : 'text-neutral-500 hover:text-black hover:bg-neutral-200'}`}
                            title="Download note"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              deleteSavedNote(activeNote.id);
                              setSelectedNoteId(null);
                            }}
                            className={`p-2 rounded-md transition-all ${theme === 'dark' ? 'text-neutral-500 hover:text-red-400 hover:bg-red-400/10' : 'text-neutral-500 hover:text-red-600 hover:bg-red-50'}`}
                            title="Delete note"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto w-full">
                        <div className="max-w-4xl mx-auto p-8 lg:p-12">
                          {activeNote.transcriptItems.length > 0 ? (
                            <div className="space-y-4">
                              {activeNote.transcriptItems.map((item, idx) => (
                                <div key={idx} className={`p-4 rounded-lg border text-[15px] leading-[1.8] break-words shadow-sm prose max-w-none prose-p:my-2 prose-p:leading-[1.8] prose-strong:font-semibold ${theme === 'dark' ? 'prose-invert bg-[#111] border-neutral-800/50 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-700'}`}>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-neutral-500 italic">No transcript available.</p>
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
