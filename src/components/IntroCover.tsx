"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { Mic } from "lucide-react";

// What the cover "hears": meeting lines shown the way the app shows them, with the Chinese translation.
const CAPTIONS = [
  { speaker: "Speaker 1", heard: "So we moved the launch to Thursday.", translated: "所以我们把发布改到了周四。" },
  { speaker: "Speaker 2", heard: "Est-ce que tout le monde m'entend bien ?", translated: "大家都能听清我说话吗？" },
  { speaker: "Speaker 3", heard: "来週までに見積もりを送ります。", translated: "我会在下周之前把报价发给你。" },
  { speaker: "Speaker 1", heard: "Can you say that one more time?", translated: "你能再说一遍吗？" },
];

const HEADLINE = ["Every word,", "as it's said."];
const EXPAND_SECONDS = 0.95;
const EASE = [0.76, 0, 0.24, 1] as const;

function CaptionStrip() {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState(0);
  const caption = CAPTIONS[index];
  // Reveal by word where the language has spaces, by character where it doesn't.
  const units = caption.heard.includes(" ") ? caption.heard.split(/(?<= )/) : Array.from(caption.heard);
  const done = shown >= units.length;

  useEffect(() => {
    if (reduceMotion) return;
    const t = setTimeout(() => {
      if (done) {
        setIndex((i) => (i + 1) % CAPTIONS.length);
        setShown(0);
      } else {
        setShown((s) => s + 1);
      }
    }, done ? 2600 : 150);
    return () => clearTimeout(t);
  }, [shown, done, reduceMotion]);

  const heard = reduceMotion ? caption.heard : units.slice(0, shown).join("");
  const showTranslation = reduceMotion || done;

  return (
    <div aria-hidden="true" className="min-h-[5.75rem]">
      <p className="text-[13px] font-semibold text-neutral-500">{caption.speaker}</p>
      <p className="mt-0.5 text-[18px] sm:text-[22px] leading-snug font-medium tracking-[-0.01em] min-h-[1.4em]">{heard}</p>
      <p className={`text-[18px] sm:text-[22px] leading-snug font-medium text-neutral-500 transition-opacity duration-500 ${showTranslation ? "opacity-100" : "opacity-0"}`}>
        {showTranslation ? caption.translated : " "}
      </p>
    </div>
  );
}

export function IntroCover({
  hasInvite,
  onStart,
  onSignIn,
  onDone,
}: {
  hasInvite: boolean;
  onStart: () => void;
  onSignIn: () => void;
  onDone: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const discRef = useRef<HTMLButtonElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [covered, setCovered] = useState(false);
  const opening = scale !== null;

  // The disc leans toward a nearby cursor.
  const pullX = useMotionValue(0);
  const pullY = useMotionValue(0);
  const x = useSpring(pullX, { stiffness: 180, damping: 18 });
  const y = useSpring(pullY, { stiffness: 180, damping: 18 });

  const onPointerMove = (e: React.PointerEvent) => {
    const disc = discRef.current;
    if (!disc || opening || reduceMotion || e.pointerType !== "mouse") return;
    const r = disc.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2 - x.get());
    const dy = e.clientY - (r.top + r.height / 2 - y.get());
    const near = Math.hypot(dx, dy) < r.width * 1.1;
    pullX.set(near ? dx * 0.16 : 0);
    pullY.set(near ? dy * 0.16 : 0);
  };

  const open = (action: () => void) => {
    if (opening) return;
    action();
    const disc = discRef.current;
    if (!disc || reduceMotion) {
      setScale(1);
      setCovered(true);
      return;
    }
    // Grow the disc until it reaches the farthest corner of the viewport.
    const r = disc.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const reach = Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy));
    setScale((reach / (r.width / 2)) * 1.05);
  };

  // Disc, rings and label share one box so they stay together on every screen size.
  const discBox =
    "absolute right-5 sm:right-[10vw] top-1/2 -translate-y-[20%] sm:-translate-y-[42%] w-[9.5rem] sm:w-[22vw] aspect-square";

  return (
    <motion.div
      animate={{ opacity: covered ? 0 : 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.45, ease: "easeOut" }}
      onAnimationComplete={() => { if (covered) onDone(); }}
      onPointerMove={onPointerMove}
      onPointerLeave={() => { pullX.set(0); pullY.set(0); }}
      className="fixed inset-0 z-[90] overflow-hidden bg-white text-black flex flex-col font-[family-name:var(--font-host-grotesk)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
      style={{ colorScheme: "light" }}
    >
      <header className="shrink-0 flex items-center justify-between px-5 sm:px-8 h-16">
        <span className="text-[17px] font-semibold tracking-tight">Hearo</span>
        <button
          type="button"
          onClick={() => open(onSignIn)}
          className="text-[14px] font-medium text-neutral-600 hover:text-black px-3 py-2 -mr-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          Sign in
        </button>
      </header>

      {/* No transform, opacity or z-index on this wrapper: the disc blends with the headline behind it. */}
      <main className="relative flex-1 min-h-0 flex flex-col justify-center px-5 sm:px-8 pb-[18vh] sm:pb-0">
        <h1 className="text-[17vw] sm:text-[15.6vw] leading-[0.88] tracking-[-0.055em] font-bold select-none">
          {HEADLINE.map((line, i) => (
            <span key={line} className="block overflow-hidden pt-[0.2em] -mt-[0.2em] pb-[0.3em] -mb-[0.3em]">
              <motion.span
                className="block"
                initial={reduceMotion ? false : { y: "110%" }}
                animate={{ y: 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.1 + i * 0.09 }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>

        {!opening && !reduceMotion && (
          <motion.div className={`${discBox} pointer-events-none`} style={{ x, y }} aria-hidden="true">
            {[0, 1].map((i) => (
              <motion.span
                key={i}
                className="absolute inset-0 rounded-full border border-black/30"
                animate={{ scale: [1, 1.5], opacity: [0, 0.55, 0] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeOut", delay: 1.2 + i * 1.4 }}
              />
            ))}
          </motion.div>
        )}

        {/* White + difference blending reads as a black disc on the page and inverts any type it crosses. */}
        <motion.button
          ref={discRef}
          type="button"
          aria-label="Start listening"
          onClick={() => open(onStart)}
          style={{ x, y }}
          initial={reduceMotion ? false : { scale: 0 }}
          animate={{ scale: scale ?? 1 }}
          whileHover={opening ? undefined : { scale: 1.06 }}
          whileTap={opening ? undefined : { scale: 0.96 }}
          transition={opening
            ? { duration: EXPAND_SECONDS, ease: EASE }
            : { type: "spring", stiffness: 260, damping: 22 }}
          onAnimationComplete={() => { if (opening) setCovered(true); }}
          className={`${discBox} rounded-full bg-white mix-blend-difference cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white`}
        />

        <motion.div
          aria-hidden="true"
          style={{ x, y }}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: opening ? 0 : 1 }}
          transition={{ duration: opening ? 0.15 : 0.4, delay: opening ? 0 : 0.5 }}
          className={`${discBox} pointer-events-none flex flex-col items-center justify-center gap-2 text-white`}
        >
          <Mic className="w-[16%] h-[16%]" strokeWidth={1.75} />
          <span className="text-[0.95rem] sm:text-[1.45vw] font-semibold tracking-tight">Start listening</span>
        </motion.div>
      </main>

      <footer className="shrink-0 px-5 sm:px-8 pb-7 sm:pb-10 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
        <CaptionStrip />
        <p className="text-[14px] sm:text-[15px] font-medium sm:text-right max-w-[30ch]">
          {hasInvite
            ? "Your invite includes Pro. Sign in once and listening is unlimited."
            : "Free for 15 minutes. No account needed."}
        </p>
      </footer>
    </motion.div>
  );
}
