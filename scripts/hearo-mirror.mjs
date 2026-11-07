#!/usr/bin/env node
// Mirrors one Hearo account's notes into a local folder, so Claude (and anything else on this
// Mac) can read every meeting as a plain Markdown file without copying it out of the app.
//
//   node scripts/hearo-mirror.mjs            keep running: pull changes every 30 s
//   node scripts/hearo-mirror.mjs --once     one pass, then exit
//   node scripts/hearo-mirror.mjs --full     forget the cursor and rewrite every file
//
// Settings (env, or audio_note/.env):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   the Hearo Supabase project
//   HEARO_MIRROR_EMAIL   whose notes to mirror (default zhonghe.zhang@hotmail.com)
//   HEARO_MIRROR_DIR     where (default ~/Hearo)
//
// Layout:
//   ~/Hearo/INDEX.md                         every note, newest first, with its file
//   ~/Hearo/notes/2026-11-06 2105 Title.md   one note: frontmatter, then the transcript
//   ~/Hearo/.mirror-state.json               cursor + id → file map (don't edit)
//
// One-way: the server is the source of truth. A note deleted in the app disappears here;
// editing a file here does not change the app (the next update to that note overwrites it).

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Load audio_note/.env without overriding the real environment.
const envFile = join(ROOT, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = (process.env.HEARO_MIRROR_EMAIL || 'zhonghe.zhang@hotmail.com').toLowerCase();
const DIR = (process.env.HEARO_MIRROR_DIR || join(homedir(), 'Hearo')).replace(/^~/, homedir());
const NOTES = join(DIR, 'notes');
const STATE = join(DIR, '.mirror-state.json');
const POLL_MS = 30_000;
const PAGE = 100;
const OVERLAP_MS = 10_000;
const TZ = 'Europe/London';

if (!URL_ || !KEY) {
  console.error('[hearo-mirror] need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const log = (...a) => console.log(new Date().toISOString(), '[hearo-mirror]', ...a);

async function api(path) {
  const res = await fetch(`${URL_}${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status} ${path.split('?')[0]}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

function loadState() {
  try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return { notes: {} }; }
}

function saveState(state) {
  writeFileSync(STATE + '.tmp', JSON.stringify(state, null, 1));
  renameSync(STATE + '.tmp', STATE);
}

async function resolveUser(state) {
  if (state.userId && state.email === EMAIL) return state.userId;
  for (let page = 1; page < 50; page++) {
    const { users } = await api(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const u = users.find((x) => (x.email || '').toLowerCase() === EMAIL);
    if (u) {
      // Switching accounts: start the folder over.
      if (state.userId && state.userId !== u.id) { state.notes = {}; state.cursor = null; }
      state.userId = u.id;
      state.email = EMAIL;
      return u.id;
    }
    if (users.length < 200) break;
  }
  throw new Error(`no Hearo account with email ${EMAIL}`);
}

const parts = (iso) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return p;
};

function fileName(row) {
  const p = parts(row.recorded_at);
  const title = (row.title || 'Untitled').replace(/[\/\\:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
  return `${p.year}-${p.month}-${p.day} ${p.hour}${p.minute} ${title}.md`;
}

const sourceOf = (row) => (row.id.startsWith('discord-') ? 'discord' : 'hearo');

function render(row) {
  const p = parts(row.recorded_at);
  const items = Array.isArray(row.transcript_items) ? row.transcript_items : [];
  const body = items.map((i) => (i?.text || '').trim()).filter(Boolean).join('\n\n') || '_No transcript._';
  const q = (s) => JSON.stringify(s ?? '');
  return [
    '---',
    `id: ${q(row.id)}`,
    `title: ${q(row.title)}`,
    `recorded_at: ${row.recorded_at}`,
    `updated_at: ${row.client_updated_at}`,
    `source: ${sourceOf(row)}`,
    '---',
    '',
    `# ${row.title || 'Untitled'}`,
    '',
    `_${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute} (London) · ${sourceOf(row) === 'discord' ? 'Discord /meeting' : 'Hearo'}_`,
    '',
    body,
    '',
  ].join('\n');
}

function writeIndex(state) {
  const rows = Object.entries(state.notes)
    .map(([id, n]) => ({ id, ...n }))
    .sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at));
  const lines = [
    '# Hearo notes',
    '',
    `Mirror of ${state.email}'s Hearo account (app recordings + Discord /meeting). Newest first.`,
    `Updated ${new Date().toISOString()} · ${rows.length} notes · files in ./notes/`,
    '',
    '| When (London) | Source | Title | File |',
    '|---|---|---|---|',
    ...rows.map((n) => {
      const p = parts(n.recorded_at);
      const title = (n.title || 'Untitled').replace(/\|/g, '\\|');
      return `| ${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} | ${n.source} | ${title} | \`notes/${n.file.replace(/\|/g, '\\|')}\` |`;
    }),
    '',
  ];
  writeFileSync(join(DIR, 'INDEX.md'), lines.join('\n'));
}

function apply(state, row) {
  const prev = state.notes[row.id];
  // The cursor overlap re-reads the last few rows every pass: skip ones already written.
  if (prev && prev.server_updated_at === row.server_updated_at) return null;
  if (row.deleted_at) {
    if (prev) {
      rmSync(join(NOTES, prev.file), { force: true });
      delete state.notes[row.id];
      return 'deleted';
    }
    return null;
  }
  // Two notes with the same minute and title: keep the files apart.
  let file = fileName(row);
  const taken = new Set(Object.entries(state.notes).filter(([id]) => id !== row.id).map(([, n]) => n.file));
  if (taken.has(file)) file = file.replace(/\.md$/, ` (${row.id.slice(0, 8)}).md`);

  if (prev && prev.file !== file) rmSync(join(NOTES, prev.file), { force: true });
  writeFileSync(join(NOTES, file), render(row));
  state.notes[row.id] = { file, title: row.title, recorded_at: row.recorded_at, source: sourceOf(row), server_updated_at: row.server_updated_at };
  return prev ? 'updated' : 'added';
}

async function pass(state, full) {
  const userId = await resolveUser(state);
  const cursor = full ? null : state.cursor;
  let since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null;
  let newest = cursor;
  const counts = { added: 0, updated: 0, deleted: 0 };
  const seen = new Set();

  for (;;) {
    let q = `/rest/v1/notes?user_id=eq.${userId}&select=id,title,recorded_at,transcript_items,client_updated_at,deleted_at,server_updated_at&order=server_updated_at.asc,id.asc&limit=${PAGE}`;
    if (since) q += `&server_updated_at=gt.${encodeURIComponent(since)}`;
    const rows = await api(q);
    for (const row of rows) {
      seen.add(row.id);
      const r = apply(state, row);
      if (r) counts[r]++;
    }
    if (rows.length === 0) break;
    const last = rows[rows.length - 1].server_updated_at;
    if (!newest || Date.parse(last) > Date.parse(newest)) newest = last;
    if (rows.length < PAGE) break;
    since = last;
  }

  // Full pass: drop files for notes the server no longer has at all.
  if (full) {
    for (const [id, n] of Object.entries(state.notes)) {
      if (!seen.has(id)) { rmSync(join(NOTES, n.file), { force: true }); delete state.notes[id]; counts.deleted++; }
    }
  }

  state.cursor = newest;
  const changed = counts.added + counts.updated + counts.deleted;
  if (changed || full || !existsSync(join(DIR, 'INDEX.md'))) writeIndex(state);
  saveState(state);
  if (changed) log(`+${counts.added} ~${counts.updated} -${counts.deleted} (${Object.keys(state.notes).length} notes)`);
}

async function main() {
  mkdirSync(NOTES, { recursive: true });
  const state = loadState();
  log(`mirroring ${EMAIL} → ${DIR}`);
  await pass(state, args.has('--full') || !state.cursor);
  if (args.has('--once') || args.has('--full')) return;

  // Re-check everything once a day in case a delete was missed.
  let lastFull = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    try {
      const full = Date.now() - lastFull > 24 * 3600 * 1000;
      await pass(state, full);
      if (full) lastFull = Date.now();
    } catch (e) {
      log('pass failed:', e.message);
    }
  }
}

main().catch((e) => { log('fatal:', e.message); process.exit(1); });
