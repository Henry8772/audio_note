import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface TranscriptItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
}

export interface WorkspaceView {
  id: string;
  type: 'ai_notes' | 'live_translation' | 'manual_note';
  language?: string;
}

export interface SavedNote {
  id: string;
  title: string;
  date: string;
  summaries: Record<string, string>; // Changed to mapping of lang_code -> content
  transcriptItems: TranscriptItem[];
}

interface AppState {
  isListening: boolean;
  isConnecting: boolean;
  transcriptItems: TranscriptItem[];
  translatedTranscriptItems: TranscriptItem[];
  summaries: Record<string, string>;
  lastSummaryTime: number;
  lastSummaryIndex: number; // For rolling context
  lastSummarizedTextLength: number; // For interim text changes
  selectedLanguages: string[]; // For STT hints
  workspaceViews: WorkspaceView[];
  translationLanguages: string[]; // Maintaining for backward compatibility or simple tracking
  selectedMicId: string; // For audio input device
  isMicEnabled: boolean; // For toggling microphone
  isSystemAudioEnabled: boolean; // For toggling system audio
  
  // Auth State
  isAuthenticated: boolean;
  userEmail: string | null;
  tier: 'free' | 'pro';
  freeUsageTime: number;
  freeUsageExceeded: boolean;

  // Theme State
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;

  // Navigation State
  activeView: 'record' | 'notes';
  
  // Persistence State
  savedNotes: SavedNote[];

  setIsListening: (val: boolean) => void;
  setIsConnecting: (val: boolean) => void;
  addOrUpdateTranscriptItem: (item: TranscriptItem) => void;
  addOrUpdateTranslatedItem: (item: TranscriptItem) => void;
  clearTranscript: () => void;
  setSummaries: (newSummaries: Record<string, string>) => void;
  setLastSummaryTime: (time: number) => void;
  setLastSummaryIndex: (idx: number) => void;
  setLastSummarizedTextLength: (len: number) => void;
  setSelectedLanguages: (langs: string[]) => void;
  setWorkspaceViews: (views: WorkspaceView[]) => void;
  addWorkspaceView: (view: WorkspaceView) => void;
  removeWorkspaceView: (id: string) => void;
  updateWorkspaceView: (id: string, updates: Partial<WorkspaceView>) => void;
  setTranslationLanguages: (langs: string[]) => void;
  setSelectedMicId: (id: string) => void;
  setIsMicEnabled: (val: boolean) => void;
  setIsSystemAudioEnabled: (val: boolean) => void;
  setIsAuthenticated: (val: boolean) => void;
  setUserEmail: (email: string | null) => void;
  setTier: (tier: 'free' | 'pro') => void;
  
  // New actions for notes and view
  setActiveView: (view: 'record' | 'notes') => void;
  addSavedNote: (note: SavedNote) => void;
  deleteSavedNote: (id: string) => void;

  // Trial actions
  incrementFreeUsageTime: (seconds: number) => void;
  setFreeUsageExceeded: (val: boolean) => void;

  // Live session
  liveSessionId: string | null;
  liveSessionHostId: string | null;
  setLiveSession: (id: string | null, hostId: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isListening: false,
      isConnecting: false,
      transcriptItems: [],
      translatedTranscriptItems: [],
      summaries: {},
      lastSummaryTime: 0,
      lastSummaryIndex: 0,
      lastSummarizedTextLength: 0,
      selectedLanguages: ["en", "zh"],
      workspaceViews: [
        { id: '1', type: 'ai_notes', language: 'en' },
        { id: '2', type: 'live_translation', language: 'zh' }
      ],
      translationLanguages: ["en"],
      selectedMicId: "default",
      isMicEnabled: true,
      isSystemAudioEnabled: true,
      isAuthenticated: false,
      userEmail: null,
      tier: 'free',
      freeUsageTime: 0,
      freeUsageExceeded: false,
      theme: 'light',
      activeView: 'record',
      savedNotes: [],
      liveSessionId: null,
      liveSessionHostId: null,

      setIsListening: (val) => set({ isListening: val }),
      setIsConnecting: (val) => set({ isConnecting: val }),
      setSelectedLanguages: (langs) => set({ selectedLanguages: langs }),
      
      setWorkspaceViews: (views) => set({ workspaceViews: views }),
      addWorkspaceView: (view) => set((state) => ({ workspaceViews: [...state.workspaceViews, view] })),
      removeWorkspaceView: (id) => set((state) => ({ workspaceViews: state.workspaceViews.filter(v => v.id !== id) })),
      updateWorkspaceView: (id, updates) => set((state) => ({
        workspaceViews: state.workspaceViews.map(v => v.id === id ? { ...v, ...updates } : v)
      })),

      setTranslationLanguages: (langs) => set({ translationLanguages: langs }),
      setSelectedMicId: (id) => set({ selectedMicId: id }),
      setIsMicEnabled: (val) => set({ isMicEnabled: val }),
      setIsSystemAudioEnabled: (val) => set({ isSystemAudioEnabled: val }),
      setIsAuthenticated: (val) => set({ isAuthenticated: val }),
      setUserEmail: (email) => set({ userEmail: email }),
      setTier: (tier) => set({ tier }),
      incrementFreeUsageTime: (seconds) => set((state) => ({ freeUsageTime: state.freeUsageTime + seconds })),
      setFreeUsageExceeded: (val) => set({ freeUsageExceeded: val }),
      setTheme: (theme) => set({ theme }),
      setLiveSession: (id, hostId) => set({ liveSessionId: id, liveSessionHostId: hostId }),
      
      addOrUpdateTranscriptItem: (item) => {
        set((state) => {
          const idx = state.transcriptItems.findIndex(i => i.id === item.id);
          if (idx >= 0) {
            const newItems = [...state.transcriptItems];
            newItems[idx] = item;
            return { transcriptItems: newItems };
          } else {
            return { transcriptItems: [...state.transcriptItems, item] };
          }
        });
      },

      addOrUpdateTranslatedItem: (item) => {
        set((state) => {
          const idx = state.translatedTranscriptItems.findIndex(i => i.id === item.id);
          if (idx >= 0) {
            const newItems = [...state.translatedTranscriptItems];
            newItems[idx] = item;
            return { translatedTranscriptItems: newItems };
          } else {
            return { translatedTranscriptItems: [...state.translatedTranscriptItems, item] };
          }
        });
      },

      clearTranscript: () => set({ transcriptItems: [], translatedTranscriptItems: [], summaries: {}, lastSummaryIndex: 0, lastSummarizedTextLength: 0 }),
      setSummaries: (newSummaries) => set({ summaries: newSummaries }),
      setLastSummaryTime: (time) => set({ lastSummaryTime: time }),
      setLastSummaryIndex: (idx) => set({ lastSummaryIndex: idx }),
      setLastSummarizedTextLength: (len) => set({ lastSummarizedTextLength: len }),
      
      setActiveView: (view) => set({ activeView: view }),
      addSavedNote: (note) => set((state) => ({ savedNotes: [note, ...state.savedNotes] })),
      deleteSavedNote: (id) => set((state) => ({ savedNotes: state.savedNotes.filter(n => n.id !== id) })),
    }),
    {
      name: 'audio-note-storage', // unique name for localStorage key
      storage: createJSONStorage(() => localStorage), // explicitly use localStorage
      partialize: (state) => ({ 
        // Only persist these fields.
        savedNotes: state.savedNotes,
        selectedLanguages: state.selectedLanguages,
        workspaceViews: state.workspaceViews,
        translationLanguages: state.translationLanguages,
        selectedMicId: state.selectedMicId,
        isMicEnabled: state.isMicEnabled,
        isSystemAudioEnabled: state.isSystemAudioEnabled,
        isAuthenticated: state.isAuthenticated,
        userEmail: state.userEmail,
        theme: state.theme,
        freeUsageTime: state.freeUsageTime,
        freeUsageExceeded: state.freeUsageExceeded
      }),
    }
  )
);
