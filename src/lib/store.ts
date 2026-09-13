import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface TranscriptItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  translation?: string; // Live Chinese translation of `text` (when translation is enabled)
  isFinal: boolean;
}

export interface SavedNote {
  id: string;
  title: string;
  date: string;
  transcriptItems: TranscriptItem[];
  contentHash?: string; // Signature of the transcript, used to de-duplicate repeated saves
}

interface AppState {
  isListening: boolean;
  isConnecting: boolean;
  transcriptItems: TranscriptItem[];
  selectedLanguages: string[]; // For STT hints
  selectedMicId: string; // For audio input device
  isMicEnabled: boolean; // For toggling microphone
  isSystemAudioEnabled: boolean; // For toggling system audio
  isTranslationEnabled: boolean; // Live translate everything into Chinese (split view)

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
  clearTranscript: () => void;
  setSelectedLanguages: (langs: string[]) => void;
  setSelectedMicId: (id: string) => void;
  setIsMicEnabled: (val: boolean) => void;
  setIsSystemAudioEnabled: (val: boolean) => void;
  setIsTranslationEnabled: (val: boolean) => void;
  setIsAuthenticated: (val: boolean) => void;
  setUserEmail: (email: string | null) => void;
  setTier: (tier: 'free' | 'pro') => void;

  // New actions for notes and view
  setActiveView: (view: 'record' | 'notes') => void;
  addSavedNote: (note: SavedNote) => void;
  updateSavedNote: (id: string, updates: Partial<SavedNote>) => void;
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
      selectedLanguages: ["en", "zh"],
      selectedMicId: "default",
      isMicEnabled: true,
      isSystemAudioEnabled: true,
      isTranslationEnabled: false,
      isAuthenticated: false,
      userEmail: null,
      tier: 'free',
      freeUsageTime: 0,
      freeUsageExceeded: false,
      theme: 'dark',
      activeView: 'record',
      savedNotes: [],
      liveSessionId: null,
      liveSessionHostId: null,

      setIsListening: (val) => set({ isListening: val }),
      setIsConnecting: (val) => set({ isConnecting: val }),
      setSelectedLanguages: (langs) => set({ selectedLanguages: langs }),
      setSelectedMicId: (id) => set({ selectedMicId: id }),
      setIsMicEnabled: (val) => set({ isMicEnabled: val }),
      setIsSystemAudioEnabled: (val) => set({ isSystemAudioEnabled: val }),
      setIsTranslationEnabled: (val) => set({ isTranslationEnabled: val }),
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

      clearTranscript: () => set({ transcriptItems: [] }),

      setActiveView: (view) => set({ activeView: view }),
      addSavedNote: (note) => set((state) => ({ savedNotes: [note, ...state.savedNotes] })),
      updateSavedNote: (id, updates) => set((state) => ({
        savedNotes: state.savedNotes.map(n => n.id === id ? { ...n, ...updates } : n)
      })),
      deleteSavedNote: (id) => set((state) => ({ savedNotes: state.savedNotes.filter(n => n.id !== id) })),
    }),
    {
      name: 'audio-note-storage', // unique name for localStorage key
      storage: createJSONStorage(() => localStorage), // explicitly use localStorage
      partialize: (state) => ({
        // Only persist these fields.
        savedNotes: state.savedNotes,
        selectedLanguages: state.selectedLanguages,
        selectedMicId: state.selectedMicId,
        isMicEnabled: state.isMicEnabled,
        isSystemAudioEnabled: state.isSystemAudioEnabled,
        isTranslationEnabled: state.isTranslationEnabled,
        isAuthenticated: state.isAuthenticated,
        userEmail: state.userEmail,
        theme: state.theme,
        freeUsageTime: state.freeUsageTime,
        freeUsageExceeded: state.freeUsageExceeded
      }),
    }
  )
);
