// Describes one Hearo note from its content alone, deterministically (no model involved):
// where it came from, who spoke, roughly how long it ran, and a few topic words.
// The mirror uses this to name files so a path says what is inside it.
//
// Topic words = TF-IDF over everything in the account: words that come up a lot in this note
// and rarely in the others. Chinese is split with Intl.Segmenter; English two-word terms
// ("supply chain") count as one term.

const SEG = new Intl.Segmenter('zh', { granularity: 'word' });

const STOP_EN = new Set(`
a about above after again all also am an and any are aren as at be because been before being both but by can
could did do does doing don down during each few for from further get got gonna had has have having he her here
hers him his how i if in into is isn it its itself just know like ll me more most my no nor not now of off oh ok
okay on once only or other our out over own really right said same say says she should so some such sure than
that the their them then there these they thing things think this those through to too uh um under until up us
ve very was we well were what when where which while who why will with would yeah yes you your yours actually
mean kind sort lot going want see one two maybe something anything everything people time way let thank thanks
hello hi hey cool nice good great guess look need make much many even still back stuff alright mm hmm huh ah
speaker guys man serious heavy base according real hard ever pre percent confirmed essentially basically probably literally definitely
exactly obviously totally pretty quite already always never every first last next new old big small little long
high low best better worse different same own able around away across between take give put come came went
tell told talk talking said saying ask asked try trying work working use using used done doing call called
year years day days week weeks month months today tomorrow yesterday one two three four five six seven eight nine
ten hundred thousand million billion part point case fact idea question problem number lot bit side end start
`.split(/\s+/).filter(Boolean));

const STOP_ZH = new Set(`
这个 那个 就是 我们 你们 他们 她们 它们 然后 因为 所以 可以 什么 没有 一个 现在 觉得 知道 的话 其实 但是 如果 还是
这样 那样 东西 时候 应该 可能 一下 比较 对吧 自己 这些 那些 怎么 为什么 一些 已经 还有 而且 或者 不是 就是说 这种
那种 一样 这边 那边 这里 那里 今天 明天 昨天 真的 非常 特别 直接 需要 一直 之后 之前 以后 以前 不会 不要 不能 只是
只有 只要 当然 所以说 然后呢 就是说 感觉 好像 可能是 一点 有点 有些 很多 比如 比如说 例如 首先 其次 最后 对对 对对对
嗯嗯 哈哈 是的 好的 行吧 是吧 你看 我看 你说 我说 他说 说话 意思 问题 情况 方面 部分 主要 基本 大概 差不多 一般 整个
一起 每个 那么 这么 多少 怎样 如何 起来 出来 过来 下来 人们 表示 回答 为了 底下 接着 下午 不用 听得见 检查 准备 输出 收集 一台 一句 一种 一次 一天 两个 三个 大半 好像是 那句话 删掉 也来 往前走 原谅 地上 极其 相反 上去 进去 回来 不了 不行 可是 不过 虽然 只能 能够 可能会
或许 肯定 确实 其他 别的 另外 之类 等等 我们的 你的 我的 他的 这块 那块 东东 啊啊 呃呃 讲讲 一个人 有没有 是不是
能不能 要不要 对不对 好不好 会不会 测试 测试一下 就行 就好 的时候 也是 都是 还是说 那就 这就 我觉得 你觉得 知道吧
`.split(/\s+/).filter(Boolean));

const CJK = /[㐀-鿿]/;

/** The words of a note, without speaker labels, timestamps or Markdown. */
function words(text) {
  const clean = text
    .replace(/\*\*Speaker \d+:\*\*/g, ' ')
    .replace(/\*\*[^*\n]+\*\* · `[\d:]+`/g, ' ')
    .replace(/[*_`>#|[\]()]/g, ' ');
  const out = [];
  for (const s of SEG.segment(clean)) out.push(s.isWordLike ? s.segment : null);
  return out;
}

function keepWord(w) {
  if (!w || /^\d+$/.test(w)) return false;
  if (CJK.test(w)) return w.length >= 2 && !STOP_ZH.has(w);
  const lw = w.toLowerCase();
  if (STOP_EN.has(lw) || lw.includes("'")) return false;
  return lw.length >= 3 || /^[A-Z]{2}$/.test(w); // keep acronyms like AI, PM
}

/**
 * Term counts for one note (kept words plus adjacent English word pairs), keyed lowercase,
 * with the spelling used most often for display ("PE", not "pe").
 */
export function terms(text) {
  const counts = new Map();
  const spellings = new Map();
  const add = (t, shown) => {
    counts.set(t, (counts.get(t) || 0) + 1);
    const m = spellings.get(t) || new Map();
    m.set(shown, (m.get(shown) || 0) + 1);
    spellings.set(t, m);
  };
  const ws = words(text);
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (!keepWord(w)) continue;
    add(w.toLowerCase(), w);
    const n = ws[i + 1];
    if (!CJK.test(w) && n && !CJK.test(n) && keepWord(n)) add(`${w} ${n}`.toLowerCase(), `${w} ${n}`);
  }
  const forms = new Map([...spellings].map(([t, m]) => [t, [...m].sort((a, b) => b[1] - a[1])[0][0]]));
  return { counts, forms };
}

/**
 * Top topic words of one note. `df(term)` = in how many notes the term appears, `n` = number
 * of notes. A term must appear at least twice (once is chance), and a single word already
 * inside a chosen pair is dropped ("supply chain" beats "supply").
 */
export function topicWords({ counts, forms }, df, n, { max = 4, exclude = [] } = {}) {
  const skip = new Set(exclude.map((x) => x.toLowerCase()));
  // Longer notes need a word to repeat more before it counts as a topic.
  let total = 0;
  for (const c of counts.values()) total += c;
  const min = Math.max(2, Math.round(total / 1500));
  const scored = [];
  for (const [t, c] of counts) {
    const pair = t.includes(' ');
    if (skip.has(t) || c < (pair ? min + 1 : min)) continue;
    const idf = Math.log((n + 1) / (df(t) + 0.5));
    if (idf <= 0.3) continue; // in most notes: not what this one is about
    scored.push([t, c * idf * (pair ? 1.5 : 1)]);
  }
  scored.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const picked = [];
  for (const [t] of scored) {
    if (picked.length >= max) break;
    if (picked.some((p) => p.includes(t) || t.includes(p))) continue;
    picked.push(t);
  }
  return picked.map((t) => forms.get(t) || t);
}

const DEFAULT_TITLE = /^(note|meeting)?\s*\d{1,2}:\d{2}(:\d{2})?$/i;

export const sourceOf = (row) => (row.id.startsWith('discord-') ? 'discord' : 'hearo');

/** Plain text of a note's transcript (Discord: the speaker blocks, not the summary). */
export function transcriptText(row) {
  const items = Array.isArray(row.transcript_items) ? row.transcript_items : [];
  return items
    .filter((i) => !(sourceOf(row) === 'discord' && i?.id === 'summary'))
    .map((i) => (i?.text || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

/** Who spoke: Discord names, or "N speakers" for app recordings (Soniox numbers them). */
export function speakers(row, text) {
  if (sourceOf(row) === 'discord') {
    const names = [...new Set([...text.matchAll(/\*\*([^*\n]+)\*\* · `/g)].map((m) => m[1].trim()))];
    return { names, label: names.join('+') || 'unknown' };
  }
  const ids = new Set([...text.matchAll(/\*\*Speaker (\d+):\*\*/g)].map((m) => m[1]));
  const k = Math.max(ids.size, text ? 1 : 0);
  return { names: [], label: k === 1 ? '1 speaker' : `${k} speakers` };
}

/** Minutes: Discord from the last block's timestamp, app recordings estimated from length. */
export function minutes(row, text) {
  if (sourceOf(row) === 'discord') {
    const stamps = [...text.matchAll(/ · `(?:(\d+):)?(\d+):(\d{2})`/g)];
    const last = stamps[stamps.length - 1];
    if (last) return Math.max(1, Math.round((+(last[1] || 0)) * 60 + +last[2] + +last[3] / 60));
  }
  const cjk = (text.match(/[㐀-鿿]/g) || []).length;
  const en = (text.replace(/[㐀-鿿]/g, ' ').match(/[A-Za-z']+/g) || []).length;
  return Math.max(1, Math.round(cjk / 230 + en / 150));
}

/** The title to show: the note's own title unless it is just the default timestamp. */
export function topic(row, keywords) {
  const title = (row.title || '').trim();
  if (title && !DEFAULT_TITLE.test(title)) return title;
  return keywords.length ? keywords.join(', ') : 'untitled';
}
