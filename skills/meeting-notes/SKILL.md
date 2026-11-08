---
name: meeting-notes
description: Henry's meetings, calls and voice notes, all as local Markdown files in ~/Hearo/notes — every Hearo recording (phone, MacBook Air, Mac) and every Discord /meeting (summary, todos, transcript by speaker). Use it WHENEVER Henry mentions a meeting, a call, a chat with someone (JZ, Billy, Linda…), "what did we say about X", "上次聊的 / 会上说的 / 那个会议", a decision or a todo from a meeting, or asks to summarise, compare or follow up on past conversations — before asking him to paste anything.
---

# Meeting notes (~/Hearo)

Every note in Henry's Hearo account is mirrored, read-only, to `~/Hearo/notes/`. That covers recordings
made in the Hearo app on his phone and Macs, and every Discord `/meeting`. It updates every 30 s.

## The path tells you what is inside, so you don't need the index first

```
~/Hearo/notes/<YYYY-MM>/<YYYY-MM-DD> <HHMM> <source> - <who> - <topic>.md
~/Hearo/notes/2026-11/2026-11-07 1318 hearo - 2 speakers - 工厂, 上市, lead, 出货.md
~/Hearo/notes/2026-11/2026-11-06 1538 discord - jz_work+Henry - 方向定为 Supply Chain 数据产品 + Fleet 官网准备.md
```

- **When:** London time, when the recording started. The month folder narrows the search fast.
- **source:** `hearo` is the app (in-person talks, calls on speaker, voice memos). `discord` is a `/meeting` in a Discord voice channel.
- **who:** for Discord, the speakers' Discord names: `jz_work` = JZ, `Henry`/`osefz` = Henry, `Billy`/`hy19.` = Billy. For app recordings it is the number of speakers. Soniox labels them `Speaker 1`, `Speaker 2` and never names them; work out who is who from the content.
- **topic:** for Discord, the title Opus wrote. For app recordings, the note's own title if Henry renamed it; otherwise the four most distinctive words, computed by TF-IDF (deterministic code, not a model), so read them as hints.

## Finding a note

Use the filesystem directly:

```bash
ls ~/Hearo/notes/2026-11/                         # one month, in time order
ls ~/Hearo/notes/*/ | grep -i 'jz_work'           # by person or topic word in the name
grep -ril 'supply chain' ~/Hearo/notes/           # by anything said
grep -il '定价' ~/Hearo/notes/*/*discord*          # only Discord meetings
awk -F'\t' '$2=="discord" && $4>60' ~/Hearo/index.tsv   # meetings over an hour
```

- `~/Hearo/index.tsv` has one line per note. The columns are `london source who minutes topic keywords path id`, and paths are relative to `~/Hearo`.
- `~/Hearo/INDEX.md` is the same list as Markdown tables grouped by month, for showing Henry.
- Both files are produced by code from the notes. Use them to filter on duration or keywords. You don't need to read them before opening a note.

## Reading a note

- **Frontmatter:** `id, title, topic, recorded_at` (ISO), `london, source, who, minutes, keywords, updated_at`.
- **Discord notes:** the summary block comes first. It holds the summary, a `### Todo` list grouped by owner, then decisions and open questions. The transcript follows as `**Name** · \`m:ss\`` blocks. For "what did we decide" or "what's my todo", read the top part; only read the transcript when you need the exact words.
- **App recordings:** `**Speaker N:**` lines. They can run 20k–70k characters, so use `grep -n` to find the passage you need and read around it rather than loading the whole file.
- **Quoting:** quote the line and give the file path and the time, so Henry can find it.

## Rules

1. **Don't edit or create files under `~/Hearo`.** The mirror rewrites them from the server, so edits are lost. Changes go through the Hearo app (hearo.henryai.studio).
2. **A note you expect is missing:** check `tail ~/Hearo/.logs/mirror.log` first (the mirror runs as launchd `com.henryzhang.hearo-mirror` on the M5 Pro). If the log looks fine, the note may still be on a device that isn't signed in to Hearo as zhonghe.zhang@hotmail.com, or a Discord meeting may still be being summarised.
3. **Recordings with no transcript have no file.** INDEX.md counts them.
4. **Mirror code:** `~/fork_git/audio_note_root/audio_note/scripts/hearo-mirror.mjs` (naming) and `hearo-describe.mjs` (who, minutes and topic words). Discord meetings are written into Hearo by `~/fork_git/claude-discord/src/meeting/hearo.ts`.
