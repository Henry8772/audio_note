import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface TranscriptItem {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  translation?: string; // Live Chinese translation of `text` (when translation is enabled)
  finalLength?: number; // How much of `text` is settled; the rest may still be revised
  isFinal: boolean;
}

export interface SavedNote {
  id: string;
  title: string;
  date: string;
  transcriptItems: TranscriptItem[];
  contentHash?: string; // Signature of the transcript, used to de-duplicate repeated saves

  // Cross-device sync bookkeeping (see notesSync.ts)
  updatedAt?: string; // ISO; when this note last changed on the device that wrote it
  deletedAt?: string; // ISO; set on delete. The note stays as a tombstone until the server has it
  dirty?: boolean; // Changed locally and not yet pushed to the server
  ownerId?: string; // Supabase user id this note belongs to; unset = made while signed out
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

// Notes the current viewer should see: not deleted, and theirs (or made while signed out).
export const selectVisibleNotes = (notes: SavedNote[], userId: string | null) =>
  notes
    .filter(n => !n.deletedAt && (!n.ownerId || n.ownerId === userId))
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));

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
  userId: string | null;
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

  // Sync State
  syncCursors: Record<string, string>; // userId -> last server_updated_at pulled
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;

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
  setUserId: (id: string | null) => void;
  setTier: (tier: 'free' | 'pro') => void;

  // New actions for notes and view
  setActiveView: (view: 'record' | 'notes') => void;
  addSavedNote: (note: SavedNote) => void;
  updateSavedNote: (id: string, updates: Partial<SavedNote>) => void;
  deleteSavedNote: (id: string) => void;

  // Sync actions
  setSyncStatus: (status: SyncStatus, lastSyncedAt?: string) => void;
  setSyncCursor: (userId: string, cursor: string | null) => void;

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
      userId: null,
      tier: 'free',
      freeUsageTime: 0,
      freeUsageExceeded: false,
      theme: 'dark',
      activeView: 'record',
      savedNotes: [],
      syncCursors: {},
      syncStatus: 'idle',
      lastSyncedAt: null,
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
      setUserId: (id) => set({ userId: id }),
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
      // Every local change stamps updatedAt and marks the note dirty so the sync engine pushes it.
      addSavedNote: (note) => set((state) => ({
        savedNotes: [{
          ...note,
          updatedAt: new Date().toISOString(),
          dirty: true,
          ownerId: note.ownerId ?? state.userId ?? undefined,
        }, ...state.savedNotes.filter(n => n.id !== note.id)]
      })),
      updateSavedNote: (id, updates) => set((state) => ({
        savedNotes: state.savedNotes.map(n => n.id === id
          ? { ...n, ...updates, updatedAt: new Date().toISOString(), dirty: true, ownerId: n.ownerId ?? state.userId ?? undefined }
          : n)
      })),
      deleteSavedNote: (id) => set((state) => {
        const note = state.savedNotes.find(n => n.id === id);
        // A note made while signed out was never uploaded: just drop it.
        if (!note || (!note.ownerId && !state.userId)) {
          return { savedNotes: state.savedNotes.filter(n => n.id !== id) };
        }
        // Otherwise keep a tombstone so the delete reaches the server and the other devices.
        const now = new Date().toISOString();
        return {
          savedNotes: state.savedNotes.map(n => n.id === id
            ? { ...n, transcriptItems: [], deletedAt: now, updatedAt: now, dirty: true, ownerId: n.ownerId ?? state.userId ?? undefined }
            : n)
        };
      }),

      setSyncStatus: (status, lastSyncedAt) => set(lastSyncedAt ? { syncStatus: status, lastSyncedAt } : { syncStatus: status }),
      setSyncCursor: (userId, cursor) => set((state) => {
        const syncCursors = { ...state.syncCursors };
        if (cursor) syncCursors[userId] = cursor; else delete syncCursors[userId];
        return { syncCursors };
      }),
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
        userId: state.userId,
        syncCursors: state.syncCursors,
        lastSyncedAt: state.lastSyncedAt,
        theme: state.theme,
        freeUsageTime: state.freeUsageTime,
        freeUsageExceeded: state.freeUsageExceeded
      }),
    }
  )
);
