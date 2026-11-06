// Keeps the signed-in user's notes the same on every device.
//
// localStorage (the zustand store) stays the working copy, so the app keeps working offline.
// This module reconciles it with the `notes` table in Supabase:
//   push  every local note marked `dirty` goes to push_notes(); the server keeps whichever
//         version has the newer client_updated_at (last write wins).
//   pull  rows whose server_updated_at is past this device's cursor come back and replace the
//         local copy, unless the local copy is dirty and newer.
// Deletes travel as tombstones (deleted_at), so a note deleted on the phone disappears on the Mac.
//
// It runs when you sign in, when the tab comes back into view or back online, every minute while
// visible, a few seconds after any local change, and on demand ("Sync now" does a full re-check).

import type { SupabaseClient } from '@supabase/supabase-js';
import { useAppStore, SavedNote, TranscriptItem } from './store';

interface NoteRow {
  id: string;
  title: string;
  recorded_at: string;
  transcript_items: TranscriptItem[];
  content_hash: string | null;
  client_updated_at: string;
  deleted_at: string | null;
  server_updated_at: string;
}

const NOTE_COLUMNS = 'id,title,recorded_at,transcript_items,content_hash,client_updated_at,deleted_at,server_updated_at';
const PULL_PAGE_SIZE = 100;
const PUSH_MAX_BYTES = 1_500_000; // per request; a single bigger note still goes alone
const MIN_GAP_MS = 15_000; // between background syncs (e.g. auto-saves while recording)
const CHANGE_DELAY_MS = 3_000; // wait after a local change before pushing
const POLL_MS = 60_000; // background pull while the app is visible
const FOCUS_DEBOUNCE_MS = 5_000;
const CURSOR_OVERLAP_MS = 10_000; // re-read a little before the cursor; merging is idempotent

let client: SupabaseClient | null = null;
let userId: string | null = null;
let inFlight: Promise<boolean> | null = null;
let rerun = false;
let pendingFull = false;
let lastRunAt = 0;
let scheduled: ReturnType<typeof setTimeout> | null = null;
let teardown: (() => void) | null = null;

const ms = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : 0;
};

const validIso = (iso: string | null | undefined) => (ms(iso) ? new Date(ms(iso)).toISOString() : null);

// ---------- public API ----------

/** Start syncing for this user. Safe to call repeatedly (auth events fire often). */
export function startNotesSync(supabase: SupabaseClient, uid: string) {
  if (client && userId === uid) return;
  stopNotesSync();
  client = supabase;
  userId = uid;

  claimSignedOutNotes(uid);

  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRunAt > FOCUS_DEBOUNCE_MS) syncNotesNow();
  };
  const onOnline = () => syncNotesNow();
  const onOffline = () => useAppStore.getState().setSyncStatus('offline');
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible') scheduleSync();
  }, POLL_MS);

  // Push shortly after any local change (new note, auto-save, delete, import).
  let lastDirtySig = '';
  const unsubscribe = useAppStore.subscribe((state, prev) => {
    if (state.savedNotes === prev.savedNotes) return;
    const dirty = state.savedNotes.filter(n => n.dirty && n.ownerId === uid);
    const sig = dirty.map(n => `${n.id}@${n.updatedAt}`).join('|');
    if (sig && sig !== lastDirtySig) scheduleSync();
    lastDirtySig = sig;
  });

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  teardown = () => {
    clearInterval(poll);
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };

  syncNotesNow();
}

export function stopNotesSync() {
  teardown?.();
  teardown = null;
  if (scheduled) clearTimeout(scheduled);
  scheduled = null;
  client = null;
  userId = null;
  useAppStore.getState().setSyncStatus('idle');
}

/**
 * Push local changes and pull remote ones right now.
 * `full` re-reads every note from the server instead of only what changed since the last pull,
 * and re-uploads any local note the server turns out not to have. Use it to repair a device.
 */
export function syncNotesNow(opts?: { full?: boolean }): Promise<boolean> {
  if (opts?.full) pendingFull = true;
  if (scheduled) { clearTimeout(scheduled); scheduled = null; }
  if (inFlight) { rerun = true; return inFlight; }
  inFlight = (async () => {
    let ok = false;
    do {
      rerun = false;
      const full = pendingFull;
      pendingFull = false;
      ok = await runOnce(full);
    } while (rerun);
    return ok;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

/** Before signing out: push what is left, then drop this user's synced notes from this device. */
export async function flushAndForgetUser(uid: string): Promise<boolean> {
  const ok = userId === uid
    ? await Promise.race([syncNotesNow(), new Promise<boolean>(r => setTimeout(() => r(false), 8000))])
    : false;
  // Unsynced notes stay (hidden) and upload the next time this account signs in here.
  useAppStore.setState(state => ({
    savedNotes: state.savedNotes.filter(n => n.ownerId !== uid || n.dirty),
  }));
  stopNotesSync();
  return ok;
}

// ---------- internals ----------

function scheduleSync() {
  if (scheduled || !client) return;
  const delay = Math.max(CHANGE_DELAY_MS, lastRunAt + MIN_GAP_MS - Date.now());
  scheduled = setTimeout(() => { scheduled = null; syncNotesNow(); }, delay);
}

// Notes recorded while signed out on this device become the signed-in user's.
function claimSignedOutNotes(uid: string) {
  useAppStore.setState(state => {
    if (!state.savedNotes.some(n => !n.ownerId)) return {};
    return {
      savedNotes: state.savedNotes.map(n => n.ownerId ? n : {
        ...n,
        ownerId: uid,
        dirty: true,
        updatedAt: n.updatedAt ?? validIso(n.date) ?? new Date().toISOString(),
      }),
    };
  });
}

async function runOnce(full: boolean): Promise<boolean> {
  const supabase = client;
  const uid = userId;
  if (!supabase || !uid) return false;
  const store = useAppStore.getState();

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    store.setSyncStatus('offline');
    return false;
  }

  lastRunAt = Date.now();
  store.setSyncStatus('syncing');
  try {
    await push(supabase, uid);
    if (userId !== uid) return false; // signed out / switched account mid-sync
    await pull(supabase, uid, full);
    if (userId !== uid) return false;
    useAppStore.getState().setSyncStatus('synced', new Date().toISOString());
    return true;
  } catch (err) {
    console.warn('[notes-sync] failed:', err);
    if (userId === uid) {
      useAppStore.getState().setSyncStatus(navigator.onLine === false ? 'offline' : 'error');
    }
    return false;
  }
}

function toRow(n: SavedNote) {
  const updatedAt = validIso(n.updatedAt) ?? validIso(n.date) ?? new Date().toISOString();
  return {
    id: n.id,
    title: n.title ?? '',
    recorded_at: validIso(n.date) ?? updatedAt,
    transcript_items: n.deletedAt ? [] : (n.transcriptItems ?? []),
    content_hash: n.contentHash ?? null,
    client_updated_at: updatedAt,
    deleted_at: validIso(n.deletedAt),
  };
}

async function push(supabase: SupabaseClient, uid: string) {
  const dirty = useAppStore.getState().savedNotes.filter(n => n.dirty && n.ownerId === uid);
  if (dirty.length === 0) return;

  // Batch by payload size so one long meeting doesn't make a single huge request.
  const batches: SavedNote[][] = [];
  let current: SavedNote[] = [];
  let bytes = 0;
  for (const n of dirty) {
    const size = JSON.stringify(n.transcriptItems ?? []).length + 512;
    if (current.length && bytes + size > PUSH_MAX_BYTES) { batches.push(current); current = []; bytes = 0; }
    current.push(n);
    bytes += size;
  }
  if (current.length) batches.push(current);

  const rejected: string[] = [];
  for (const batch of batches) {
    const { data, error } = await supabase.rpc('push_notes', { p_notes: batch.map(toRow) });
    if (error) throw error;
    const written = new Set<string>((data as string[] | null) ?? []);
    for (const n of batch) if (!written.has(n.id)) rejected.push(n.id);
    markPushed(batch);
    if (userId !== uid) return;
  }

  // The server already had a newer version of these: fetch it now rather than wait for the cursor.
  if (rejected.length) {
    const { data, error } = await supabase.from('notes').select(NOTE_COLUMNS).eq('user_id', uid).in('id', rejected);
    if (error) throw error;
    applyRemote(uid, (data ?? []) as NoteRow[]);
  }
}

// Clear `dirty` on notes that haven't changed again since we sent them; drop sent tombstones.
function markPushed(sent: SavedNote[]) {
  const sentAt = new Map(sent.map(n => [n.id, n.updatedAt]));
  useAppStore.setState(state => ({
    savedNotes: state.savedNotes.flatMap(n => {
      if (!sentAt.has(n.id) || sentAt.get(n.id) !== n.updatedAt) return [n];
      if (n.deletedAt) return [];
      return [{ ...n, dirty: false }];
    }),
  }));
}

async function pull(supabase: SupabaseClient, uid: string, full: boolean) {
  const cursor = full ? null : useAppStore.getState().syncCursors[uid] ?? null;
  let since: string | null = cursor ? new Date(ms(cursor) - CURSOR_OVERLAP_MS).toISOString() : null;
  let newest = cursor;
  const seen = new Set<string>();

  for (;;) {
    let q = supabase
      .from('notes')
      .select(NOTE_COLUMNS)
      .eq('user_id', uid)
      .order('server_updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PULL_PAGE_SIZE);
    if (since) q = q.gt('server_updated_at', since);
    const { data, error } = await q;
    if (error) throw error;
    if (userId !== uid) return;

    const rows = (data ?? []) as NoteRow[];
    rows.forEach(r => seen.add(r.id));
    applyRemote(uid, rows);
    if (rows.length === 0) break;

    const last = rows[rows.length - 1].server_updated_at;
    if (!newest || ms(last) > ms(newest)) newest = last;
    if (rows.length < PULL_PAGE_SIZE) break;
    since = last;
  }

  if (newest && newest !== cursor) useAppStore.getState().setSyncCursor(uid, newest);

  // Full check: anything this device has that the server doesn't goes back up.
  if (full) {
    let missing = 0;
    useAppStore.setState(state => ({
      savedNotes: state.savedNotes.map(n => {
        if (n.ownerId !== uid || n.dirty || n.deletedAt || seen.has(n.id)) return n;
        missing++;
        return { ...n, dirty: true, updatedAt: n.updatedAt ?? validIso(n.date) ?? new Date().toISOString() };
      }),
    }));
    if (missing) rerun = true;
  }
}

function applyRemote(uid: string, rows: NoteRow[]) {
  if (rows.length === 0) return;
  useAppStore.setState(state => {
    const notes: (SavedNote | null)[] = [...state.savedNotes];
    const index = new Map(notes.map((n, i) => [n!.id, i]));

    for (const row of rows) {
      const i = index.get(row.id);
      const local = i === undefined ? undefined : notes[i];
      // Same id held by a different account on this browser: leave theirs alone.
      if (local && local.ownerId && local.ownerId !== uid) continue;
      // Our unsent edit is newer than the server's copy: keep it, it will be pushed.
      if (local && local.dirty && ms(local.updatedAt) > ms(row.client_updated_at)) continue;

      if (row.deleted_at) {
        if (i !== undefined) notes[i] = null;
        continue;
      }
      const note: SavedNote = {
        id: row.id,
        title: row.title,
        date: row.recorded_at,
        transcriptItems: Array.isArray(row.transcript_items) ? row.transcript_items : [],
        contentHash: row.content_hash ?? undefined,
        updatedAt: row.client_updated_at,
        ownerId: uid,
        dirty: false,
      };
      if (i === undefined) {
        index.set(row.id, notes.length);
        notes.push(note);
      } else {
        notes[i] = note;
      }
    }
    return { savedNotes: notes.filter((n): n is SavedNote => n !== null) };
  });
}
