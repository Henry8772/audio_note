import { create } from 'zustand';

interface TranscriptItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
}

interface AppState {
  isListening: boolean;
  isConnecting: boolean;
  transcriptItems: TranscriptItem[];
  summary: string;
  lastSummaryTime: number;
  
  setIsListening: (val: boolean) => void;
  setIsConnecting: (val: boolean) => void;
  addOrUpdateTranscriptItem: (item: TranscriptItem) => void;
  clearTranscript: () => void;
  setSummary: (summarizedText: string) => void;
  setLastSummaryTime: (time: number) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  isListening: false,
  isConnecting: false,
  transcriptItems: [],
  summary: "",
  lastSummaryTime: 0,

  setIsListening: (val) => set({ isListening: val }),
  setIsConnecting: (val) => set({ isConnecting: val }),
  
  addOrUpdateTranscriptItem: (item) => {
    set((state) => {
      const idx = state.transcriptItems.findIndex(i => i.id === item.id);
      if (idx >= 0) {
        // Update existing item
        const newItems = [...state.transcriptItems];
        newItems[idx] = item;
        return { transcriptItems: newItems };
      } else {
        // Add new item
        return { transcriptItems: [...state.transcriptItems, item] };
      }
    });
  },

  clearTranscript: () => set({ transcriptItems: [] }),
  setSummary: (val) => set({ summary: val }),
  setLastSummaryTime: (time) => set({ lastSummaryTime: time }),
}));
