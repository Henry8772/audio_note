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
// Layout (the path alone says when, where from, who, and what about):
//   ~/Hearo/notes/2026-11/2026-11-07 1318 hearo - 2 speakers - 工厂, 上市, lead, 出货.md
//   ~/Hearo/notes/2026-11/2026-11-06 1538 discord - jz_work+Henry - 方向定为 Supply Chain 数据产品.md
//   ~/Hearo/INDEX.md      every note by month, newest first (for people)
//   ~/Hearo/index.tsv     the same, one line per note (for grep/awk)
//   ~/Hearo/.mirror-state.json, .terms.json   cursor, id → file, word stats (don't edit)
//
// Topic words for untitled recordings come from scripts/hearo-describe.mjs (TF-IDF, no model).
// They are worked out when a note is written and kept until the note changes, so paths stay put.
// Recordings with no transcript get no file.
//
// One-way: the server is the source of truth. A note deleted in the app disappears here;
// editing a file here does not change the app (the next update to that note overwrites it).

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minutes, sourceOf, speakers, terms, topic, topicWords, transcriptText } from './hearo-describe.mjs';

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
const TERMS = join(DIR, '.terms.json');
const LAYOUT = 2; // bump when file naming changes: the folder is rebuilt
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

const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };

function writeAtomic(file, text) {
  writeFileSync(file + '.tmp', text);
  renameSync(file + '.tmp', file);
}

function loadState() {
  const state = readJson(STATE, { notes: {} });
  if (state.layout !== LAYOUT) {
    // New naming scheme: start the folder over (the server has everything).
    rmSync(NOTES, { recursive: true, force: true });
    rmSync(join(DIR, 'INDEX.md'), { force: true });
    rmSync(TERMS, { force: true });
    termSets.clear(); df.clear();
    return { layout: LAYOUT, notes: {}, cursor: null, userId: state.userId, email: state.email };
  }
  return state;
}

const saveState = (state) => writeAtomic(STATE, JSON.stringify(state, null, 1));

// Which terms each note uses, so IDF (how rare a word is across notes) survives restarts.
const termSets = new Map(Object.entries(readJson(TERMS, {})));
const df = new Map();
for (const ts of termSets.values()) for (const t of ts) df.set(t, (df.get(t) || 0) + 1);

function setTerms(id, ts) {
  for (const t of termSets.get(id) || []) df.set(t, df.get(t) - 1);
  if (ts) { termSets.set(id, ts); for (const t of ts) df.set(t, (df.get(t) || 0) + 1); }
  else termSets.delete(id);
}

async function resolveUser(state) {
  if (state.userId && state.email === EMAIL) return state.userId;
  for (let page = 1; page < 50; page++) {
    const { users } = await api(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const u = users.find((x) => (x.email || '').toLowerCase() === EMAIL);
    if (u) {
      // Switching accounts: start the folder over.
      if (state.userId && state.userId !== u.id) {
        rmSync(NOTES, { recursive: true, force: true });
        termSets.clear(); df.clear();
        state.notes = {}; state.cursor = null;
      }
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

const clean = (x, n) => x.replace(/[\/\\:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n).trim();

/** "2026-11/2026-11-07 1318 hearo - 2 speakers - 工厂, 上市.md" */
function fileName(row, d) {
  const p = parts(row.recorded_at);
  return `${p.year}-${p.month}/${p.year}-${p.month}-${p.day} ${p.hour}${p.minute} ${d.source} - ${clean(d.who, 40)} - ${clean(d.topic, 70) || 'untitled'}.md`;
}

function render(row, d) {
  const p = parts(row.recorded_at);
  const items = Array.isArray(row.transcript_items) ? row.transcript_items : [];
  const body = items.map((i) => (i?.text || '').trim()).filter(Boolean).join('\n\n');
  const q = (x) => JSON.stringify(x ?? '');
  return [
    '---',
    `id: ${q(row.id)}`,
    `title: ${q(row.title)}`,
    `topic: ${q(d.topic)}`,
    `recorded_at: ${row.recorded_at}`,
    `london: ${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`,
    `source: ${d.source}`,
    `who: ${q(d.who)}`,
    `minutes: ${d.minutes}`,
    `keywords: ${q(d.keywords.join(', '))}`,
    `updated_at: ${row.client_updated_at}`,
    '---',
    '',
    `# ${d.topic}`,
    '',
    `_${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute} (London) · ${d.source === 'discord' ? 'Discord /meeting' : 'Hearo recording'} · ${d.who} · ~${d.minutes} min_`,
    '',
    body,
    '',
  ].join('\n');
}

function writeIndex(state) {
  const all = Object.values(state.notes);
  const rows = all.filter((n) => n.file).sort((a, b) => Date.parse(b.recorded_at) - Date.parse(a.recorded_at));
  const empty = all.length - rows.length;
  const cell = (x) => String(x ?? '').replace(/\|/g, '\\|');
  const lines = [
    '# Hearo notes',
    '',
    `Mirror of ${state.email}'s Hearo account: app recordings (phone, Macs) and Discord /meeting.`,
    `${rows.length} notes${empty ? ` (+${empty} empty recordings, no file)` : ''} · updated ${new Date().toISOString()}`,
    '',
    'File names: `notes/<YYYY-MM>/<date> <HHMM London> <source> - <who> - <topic>.md`.',
    'Topic = the note\'s own title, or for untitled recordings its most distinctive words (TF-IDF, computed, not written by a model).',
    'Same data as one tab-separated line per note: `index.tsv`.',
  ];
  let month = '';
  for (const n of rows) {
    const p = parts(n.recorded_at);
    if (`${p.year}-${p.month}` !== month) {
      month = `${p.year}-${p.month}`;
      lines.push('', `## ${month}`, '', '| When | Source | Who | Min | Topic | Keywords | File |', '|---|---|---|---|---|---|---|');
    }
    lines.push(`| ${p.day} ${p.hour}:${p.minute} | ${n.source} | ${cell(n.who)} | ${n.minutes} | ${cell(n.topic)} | ${cell(n.keywords.join(', '))} | \`notes/${cell(n.file)}\` |`);
  }
  writeAtomic(join(DIR, 'INDEX.md'), lines.join('\n') + '\n');

  const tsv = (x) => String(x ?? '').replace(/[\t\n\r]+/g, ' ');
  writeAtomic(join(DIR, 'index.tsv'), [
    ['london', 'source', 'who', 'minutes', 'topic', 'keywords', 'path', 'id'].join('\t'),
    ...rows.map((n) => {
      const p = parts(n.recorded_at);
      return [`${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`, n.source, n.who, n.minutes, n.topic, n.keywords.join(', '), `notes/${n.file}`, n.id].map(tsv).join('\t');
    }),
  ].join('\n') + '\n');
}

function removeFile(n) {
  if (n?.file) rmSync(join(NOTES, n.file), { force: true });
}

/** Write (or drop) one note. Returns what happened, or null when nothing changed. */
function apply(state, row, text, t) {
  const prev = state.notes[row.id];
  // The cursor overlap re-reads the last few rows every pass: skip ones already written.
  if (prev && prev.server_updated_at === row.server_updated_at) return null;
  if (row.deleted_at || !text) {
    removeFile(prev);
    if (row.deleted_at) { delete state.notes[row.id]; return prev ? 'deleted' : null; }
    state.notes[row.id] = { id: row.id, recorded_at: row.recorded_at, server_updated_at: row.server_updated_at };
    return prev?.file ? 'deleted' : null;
  }
  const who = speakers(row, text);
  const keywords = topicWords(t, (x) => df.get(x) || 0, termSets.size, { exclude: who.names });
  const d = { source: sourceOf(row), who: who.label, minutes: minutes(row, text), keywords, topic: topic(row, keywords) };

  let file = fileName(row, d);
  const taken = new Set(Object.values(state.notes).filter((n) => n.id !== row.id).map((n) => n.file));
  if (taken.has(file)) file = file.replace(/\.md$/, ` (${row.id.slice(0, 8)}).md`);
  if (prev?.file && prev.file !== file) removeFile(prev);
  mkdirSync(dirname(join(NOTES, file)), { recursive: true });
  writeFileSync(join(NOTES, file), render(row, d));
  state.notes[row.id] = { id: row.id, file, recorded_at: row.recorded_at, server_updated_at: row.server_updated_at, ...d };
  return prev?.file ? 'updated' : 'added';
}

async function pass(state, full) {
  const userId = await resolveUser(state);
  const cursor = full ? null : state.cursor;
  let since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null;
  let newest = cursor;
  const counts = { added: 0, updated: 0, deleted: 0 };
  const seen = new Set();
  const fetched = [];

  for (;;) {
    let q = `/rest/v1/notes?user_id=eq.${userId}&select=id,title,recorded_at,transcript_items,client_updated_at,deleted_at,server_updated_at&order=server_updated_at.asc,id.asc&limit=${PAGE}`;
    if (since) q += `&server_updated_at=gt.${encodeURIComponent(since)}`;
    const rows = await api(q);
    fetched.push(...rows);
    if (rows.length === 0) break;
    const last = rows[rows.length - 1].server_updated_at;
    if (!newest || Date.parse(last) > Date.parse(newest)) newest = last;
    if (rows.length < PAGE) break;
    since = last;
  }

  // Word stats first, so every note in this batch is scored against all of them.
  const changed = fetched.filter((row) => state.notes[row.id]?.server_updated_at !== row.server_updated_at);
  const texts = new Map();
  for (const row of changed) {
    const text = row.deleted_at ? '' : transcriptText(row);
    const t = text ? terms(text) : null;
    texts.set(row.id, { text, t });
    setTerms(row.id, t ? [...t.counts.keys()] : null);
  }
  for (const row of fetched) {
    seen.add(row.id);
    const x = texts.get(row.id);
    const r = x ? apply(state, row, x.text, x.t) : null;
    if (r) counts[r]++;
  }

  // Full pass: drop files for notes the server no longer has at all.
  if (full) {
    for (const [id, n] of Object.entries(state.notes)) {
      if (!seen.has(id)) { removeFile(n); delete state.notes[id]; setTerms(id, null); counts.deleted++; }
    }
  }
  if (changed.length) writeAtomic(TERMS, JSON.stringify(Object.fromEntries(termSets)));

  state.cursor = newest;
  const n = counts.added + counts.updated + counts.deleted;
  if (n || full || !existsSync(join(DIR, 'INDEX.md'))) writeIndex(state);
  saveState(state);
  if (n) log(`+${counts.added} ~${counts.updated} -${counts.deleted} (${Object.keys(state.notes).length} notes)`);
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
