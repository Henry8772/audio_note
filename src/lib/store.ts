import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface TranscriptItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
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
  summaries: Record<string, string>;
  lastSummaryTime: number;
  lastSummaryIndex: number; // For rolling context
  lastSummarizedTextLength: number; // For interim text changes
  selectedLanguages: string[]; // For STT
  translationLanguages: string[]; // For target LLM sumamries
  selectedMicId: string; // For audio input device
  
  // Auth State
  isAuthenticated: boolean;

  // Navigation State
  activeView: 'record' | 'notes';
  
  // Persistence State
  savedNotes: SavedNote[];

  setIsListening: (val: boolean) => void;
  setIsConnecting: (val: boolean) => void;
  addOrUpdateTranscriptItem: (item: TranscriptItem) => void;
  clearTranscript: () => void;
  setSummaries: (newSummaries: Record<string, string>) => void;
  setLastSummaryTime: (time: number) => void;
  setLastSummaryIndex: (idx: number) => void;
  setLastSummarizedTextLength: (len: number) => void;
  setSelectedLanguages: (langs: string[]) => void;
  setTranslationLanguages: (langs: string[]) => void;
  setSelectedMicId: (id: string) => void;
  setIsAuthenticated: (val: boolean) => void;
  
  // New actions for notes and view
  setActiveView: (view: 'record' | 'notes') => void;
  addSavedNote: (note: SavedNote) => void;
  deleteSavedNote: (id: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isListening: false,
      isConnecting: false,
      transcriptItems: [],
      summaries: {},
      lastSummaryTime: 0,
      lastSummaryIndex: 0,
      lastSummarizedTextLength: 0,
      selectedLanguages: ["en", "zh"],
      translationLanguages: ["en"],
      selectedMicId: "default",
      isAuthenticated: false,
      activeView: 'record',
      savedNotes: [],

      setIsListening: (val) => set({ isListening: val }),
      setIsConnecting: (val) => set({ isConnecting: val }),
      setSelectedLanguages: (langs) => set({ selectedLanguages: langs }),
      setTranslationLanguages: (langs) => set({ translationLanguages: langs }),
      setSelectedMicId: (id) => set({ selectedMicId: id }),
      setIsAuthenticated: (val) => set({ isAuthenticated: val }),
      
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

      clearTranscript: () => set({ transcriptItems: [], summaries: {}, lastSummaryIndex: 0, lastSummarizedTextLength: 0 }),
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
        translationLanguages: state.translationLanguages,
        selectedMicId: state.selectedMicId,
        isAuthenticated: state.isAuthenticated
      }),
    }
  )
);
