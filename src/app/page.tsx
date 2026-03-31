"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { Mic, ArrowRight, Globe, Share2, Layers, CheckCircle2, Check, X, Zap, Play, Square, Loader2, Lock, Volume2, VolumeX } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAudioRealtime } from "@/lib/useAudioRealtime";
import { joinWaitlist } from "@/app/actions/waitlist";

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [demo1Muted, setDemo1Muted] = useState(true);
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], [0, -50]);

  // Demo State
  const { isListening, isConnecting, transcriptItems } = useAppStore();
  const { connect, stopListening } = useAudioRealtime();
  const demoTranscriptRef = useRef<HTMLDivElement>(null);

  const [demoTimeLeft, setDemoTimeLeft] = useState<number | null>(null);
  const [demoFinished, setDemoFinished] = useState<boolean>(false);

  // Waitlist State
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [waitlistError, setWaitlistError] = useState("");

  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail) return;

    setWaitlistStatus('loading');
    setWaitlistError("");

    const formData = new FormData();
    formData.append("email", waitlistEmail);

    try {
      const result = await joinWaitlist(formData);
      if (result.success) {
        setWaitlistStatus('success');
        setWaitlistEmail("");
      } else {
        setWaitlistStatus('error');
        setWaitlistError(result.error || "Something went wrong.");
      }
    } catch {
      setWaitlistStatus('error');
      setWaitlistError("Failed to join waitlist. Please try again.");
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Demo Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isListening && !demoFinished) {
      setDemoTimeLeft(15); // 15 seconds demo
      interval = setInterval(() => {
        setDemoTimeLeft((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(interval);
            stopListening();
            setDemoFinished(true);
            return null;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (!isListening && demoTimeLeft !== null) {
      setDemoTimeLeft(null);
    }
    return () => clearInterval(interval);
  }, [isListening, stopListening, demoFinished]);

  // Auto-scroll demo transcript
  useEffect(() => {
    if (demoTranscriptRef.current) {
      demoTranscriptRef.current.scrollTop = demoTranscriptRef.current.scrollHeight;
    }
  }, [transcriptItems]);

  const toggleDemo = () => {
    if (isListening) stopListening();
    else connect();
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-neutral-800 selection:text-white overflow-hidden">
      {/* Navigation */}
      <nav
        className={`fixed top-0 w-full z-50 transition-all duration-300 border-b ${scrolled ? "bg-black/80 backdrop-blur-md border-neutral-800/80 py-3" : "bg-transparent border-transparent py-5"
          }`}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.2)]">
              <Mic className="w-4 h-4 text-black" />
            </div>
            <span className="font-semibold tracking-wide text-sm">Meetly</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#demo" className="hover:text-white transition-colors">Live Demo</a>
            <a href="#waitlist" className="hover:text-white transition-colors">Waitlist</a>
          </div>
          <div className="flex flex-center gap-4">
            <Link
              href="/app"
              className="bg-white text-black px-4 py-2 rounded-full text-sm font-semibold hover:bg-neutral-200 hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] flex items-center gap-2"
            >
              Start for Free <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 md:pt-52 md:pb-32 px-6 flex flex-col items-center justify-center text-center">
        {/* Glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="relative z-10 max-w-4xl mx-auto"
        >
          <a href="https://henryai.studio" target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all duration-300 mb-6 backdrop-blur-md">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-[0_0_10px_rgba(99,102,241,0.5)]">
              <Layers className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-medium text-neutral-300 group-hover:text-white transition-colors">
              A product by <span className="font-semibold text-white">HenryAI Studio</span>
            </span>
            <ArrowRight className="w-4 h-4 text-neutral-500 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
          </a>
          <br />
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter mb-8 leading-[1.1]">
            World-class <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-300 to-neutral-600">
              transcription.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto mb-12 leading-relaxed font-light">
            We turn your $5 microphone into an $800 studio setup. Experience best-in-class noise cancellation, real-time translation, and zero lag.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/app"
              className="bg-white text-black px-8 py-4 rounded-full text-base font-semibold hover:bg-neutral-200 transition-colors w-full sm:w-auto shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            >
              Start for Free
            </Link>
            <a
              href="#demo"
              className="px-8 py-4 rounded-full text-base font-medium text-white border border-neutral-800 hover:bg-neutral-900 transition-colors w-full sm:w-auto flex items-center justify-center gap-2"
            >
              Try Live Demo
            </a>
          </div>
        </motion.div>
      </section>

      {/* Features Showcase */}
      <section id="features" className="py-24 md:py-32 px-6 bg-[#050505] relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-40 left-0 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-40 right-0 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-20 md:mb-32">
            <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">Core Capabilities</h2>
            <p className="text-neutral-400 max-w-xl mx-auto text-lg md:text-xl leading-relaxed">Everything you need to make the most out of every conversation, instantly.</p>
          </div>

          <div className="flex flex-col gap-32">
            {/* Feature 1 */}
            <div className="flex flex-col md:flex-row items-center gap-12 md:gap-20">
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="flex-1 space-y-8"
              >
                <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center border border-blue-500/20 shadow-[0_0_30px_rgba(59,130,246,0.15)]">
                  <Mic className="w-8 h-8 text-blue-400" />
                </div>
                <h3 className="text-3xl md:text-4xl font-semibold text-white leading-tight">Perfect Audio, <br />Anywhere.</h3>
                <p className="text-neutral-400 leading-relaxed text-lg font-light">
                  See our engine instantly process noisy audio. Compared to standard YouTube captions (right), <span className="text-blue-400 font-medium whitespace-nowrap">blue highlights</span> show exactly what they miss.
                </p>
                <div className="pt-4 flex flex-wrap gap-3">
                  <div
                    onClick={() => setDemo1Muted(!demo1Muted)}
                    className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900 border border-neutral-800 text-sm font-medium text-neutral-300 hover:bg-neutral-800 transition-colors"
                  >
                    {demo1Muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    {demo1Muted ? "Unmute Video" : "Mute Video"}
                  </div>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.9, rotateY: 10 }}
                whileInView={{ opacity: 1, scale: 1, rotateY: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="flex-[1.5] w-full perspective-[1000px]"
              >
                <div className="aspect-video bg-[#0a0a0a] rounded-3xl border border-neutral-800 shadow-[0_0_50px_rgba(59,130,246,0.1)] relative overflow-hidden group transform-gpu preserve-3d">
                  <video
                    src="/demo-1.mp4"
                    autoPlay
                    loop
                    muted={demo1Muted}
                    playsInline
                    className="w-full h-full object-cover scale-[1.02] group-hover:scale-100 transition-transform duration-700 ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div className="absolute bottom-6 left-8 pointer-events-none">
                    <p className="text-white font-bold text-lg tracking-wide opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0">
                      Meetly vs. Standard Captions
                    </p>
                    <p className="text-neutral-400 text-sm opacity-0 group-hover:opacity-100 transition-all duration-500 delay-100 translate-y-2 group-hover:translate-y-0 mt-1">
                      Notice the blue highlighted differences
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Feature 2 */}
            <div className="flex flex-col md:flex-row-reverse items-center gap-12 md:gap-20">
              <motion.div
                initial={{ opacity: 0, x: 50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="flex-1 space-y-8"
              >
                <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center border border-purple-500/20 shadow-[0_0_30px_rgba(168,85,247,0.15)]">
                  <Globe className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-3xl md:text-4xl font-semibold text-white leading-tight">60+ Languages.<br />Zero Wait.</h3>
                <p className="text-neutral-400 leading-relaxed text-lg font-light">
                  Break language barriers instantly. We support over 60 languages with near-zero latency real-time translation.
                </p>
                <div className="pt-4">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900 border border-neutral-800 text-sm font-medium text-neutral-300">
                    <CheckCircle2 className="w-4 h-4 text-purple-500" /> 60+ Languages Supported
                  </div>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.9, rotateY: -10 }}
                whileInView={{ opacity: 1, scale: 1, rotateY: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="flex-[1.5] w-full perspective-[1000px]"
              >
                <div className="aspect-video bg-[#0a0a0a] rounded-3xl border border-neutral-800 shadow-2xl relative overflow-hidden group flex items-center justify-center transform-gpu preserve-3d">
                  <div className="absolute inset-0 bg-gradient-to-bl from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 group-hover:scale-110 group-hover:bg-white text-white group-hover:text-black transition-all duration-500 cursor-pointer shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                    <Play className="w-8 h-8 ml-1 fill-current" />
                  </div>
                  <div className="absolute bottom-6 right-8 text-right">
                    <p className="text-white font-medium text-lg tracking-wide opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-y-2 group-hover:translate-y-0">Watch Demo</p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Feature 3 */}
            <div className="flex flex-col md:flex-row items-center gap-12 md:gap-20">
              <motion.div
                initial={{ opacity: 0, x: -50 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="flex-1 space-y-8"
              >
                <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
                  <Share2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-3xl md:text-4xl font-semibold text-white leading-tight">Sync Global <br />Teams.</h3>
                <p className="text-neutral-400 leading-relaxed text-lg font-light">
                  Create live sessions instantly. Invite others to watch real-time results and dive into the conversation together.
                </p>
                <div className="pt-4">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900 border border-neutral-800 text-sm font-medium text-neutral-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Seamless Synchronization
                  </div>
                </div>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, scale: 0.9, rotateY: 10 }}
                whileInView={{ opacity: 1, scale: 1, rotateY: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="flex-[1.5] w-full perspective-[1000px]"
              >
                <div className="aspect-video bg-[#0a0a0a] rounded-3xl border border-neutral-800 shadow-2xl relative overflow-hidden group flex items-center justify-center transform-gpu preserve-3d">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                  <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 group-hover:scale-110 group-hover:bg-white text-white group-hover:text-black transition-all duration-500 cursor-pointer shadow-[0_0_40px_rgba(255,255,255,0.1)]">
                    <Play className="w-8 h-8 ml-1 fill-current" />
                  </div>
                  <div className="absolute bottom-6 left-8">
                    <p className="text-white font-medium text-lg tracking-wide opacity-0 group-hover:opacity-100 transition-opacity duration-300 translate-y-2 group-hover:translate-y-0">Watch Demo</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </section>

      {/* Competitor Comparison */}
      <section className="py-24 px-6 relative border-y border-neutral-900 bg-[#020202]">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 text-white">How we stack up</h2>
            <p className="text-neutral-400 text-lg">See why teams are switching to Meetly for flawless execution.</p>
          </div>

          <div className="overflow-x-auto border border-neutral-800 rounded-3xl bg-[#050505] shadow-[0_0_40px_rgba(0,0,0,0.5)]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 bg-[#0a0a0a]">
                  <th className="p-6 font-medium text-neutral-400 w-1/4">Feature</th>
                  <th className="p-6 font-semibold text-white text-lg w-1/4 border-l border-neutral-800 bg-white/5 relative">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-purple-500" />
                    Meetly
                  </th>
                  <th className="p-6 font-medium text-neutral-500 w-1/4 border-l border-neutral-800">OpenAI Whisper</th>
                  <th className="p-6 font-medium text-neutral-500 w-1/4 border-l border-neutral-800">Deepgram</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 text-sm">
                <tr>
                  <td className="p-6 text-neutral-300 font-medium">Latency</td>
                  <td className="p-6 border-l border-neutral-800 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                      <Zap className="w-4 h-4" /> Near-Zero
                    </div>
                  </td>
                  <td className="p-6 text-neutral-500 border-l border-neutral-800">Batch / Delayed</td>
                  <td className="p-6 text-neutral-500 border-l border-neutral-800">Low</td>
                </tr>
                <tr>
                  <td className="p-6 text-neutral-300 font-medium">Audio Input Target</td>
                  <td className="p-6 border-l border-neutral-800 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-white font-medium">
                      <Check className="w-4 h-4 text-emerald-400" /> Enhances $5 mics
                    </div>
                  </td>
                  <td className="p-6 text-neutral-500 border-l border-neutral-800">Requires clear audio</td>
                  <td className="p-6 text-neutral-500 border-l border-neutral-800">Requires clear audio</td>
                </tr>
                <tr>
                  <td className="p-6 text-neutral-300 font-medium">Noise Cancellation</td>
                  <td className="p-6 border-l border-neutral-800 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-white font-medium">
                      <Check className="w-4 h-4 text-emerald-400" /> Built-in Best-in-class
                    </div>
                  </td>
                  <td className="p-6 text-neutral-500 border-l border-neutral-800"><X className="w-4 h-4" /> None</td>
                  <td className="p-6 text-neutral-500 border-l border-neutral-800"><X className="w-4 h-4" /> Basic</td>
                </tr>
                <tr>
                  <td className="p-6 text-neutral-300 font-medium">Real-time Translation</td>
                  <td className="p-6 border-l border-neutral-800 bg-white/[0.02]">
                    <div className="flex items-center gap-2 text-white font-medium">
                      <Check className="w-4 h-4 text-emerald-400" /> 60+ Languages
                    </div>
                  </td>
                  <td className="p-6 text-neutral-500 border-l border-neutral-800"><X className="w-4 h-4" /> Varies/Delayed</td>
                  <td className="p-6 text-neutral-500 border-l border-neutral-800"><X className="w-4 h-4" /> English-first</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Interactive Live Demo */}
      <section id="demo" className="py-24 md:py-32 px-6 relative">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-16">
            <div className="flex-1">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">Experience the magic firsthand.</h2>
              <p className="text-neutral-400 text-lg leading-relaxed mb-6">
                Don&apos;t just take our word for it. Press the button and say a few words. You&apos;ll see the transcription stream instantly using the exact same technology underneath the hood.
              </p>

              <div className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-medium">
                <Lock className="w-4 h-4" />
                Demo is automatically limited to a 15-second recording.
              </div>

              <button
                onClick={toggleDemo}
                disabled={isConnecting || demoFinished}
                className={`flex items-center justify-center gap-3 px-6 py-4 rounded-full font-semibold text-base transition-all duration-300 w-full sm:w-auto shadow-sm ${demoFinished
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed border border-neutral-700"
                  : isConnecting
                    ? "bg-neutral-900 border border-neutral-800 text-neutral-400 cursor-not-allowed"
                    : isListening
                      ? "bg-[#111] text-red-400 border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.15)]"
                      : "bg-white text-black hover:bg-neutral-200 shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                  }`}
              >
                {demoFinished ? (
                  <>Demo Complete. Sign Up.</>
                ) : isConnecting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Connecting server...</>
                ) : isListening ? (
                  <><Square className="w-4 h-4 fill-current" /> Stop Live Demo ({demoTimeLeft}s)</>
                ) : (
                  <><Play className="w-4 h-4 fill-current" /> Start Live Demo</>
                )}
              </button>
            </div>

            {/* Mock Dashboard Window */}
            <div className="flex-1 w-full bg-[#0a0a0a] rounded-3xl border border-neutral-800 shadow-2xl overflow-hidden relative min-h-[400px] flex flex-col group">
              {/* Window Header */}
              <div className="h-12 border-b border-neutral-800/80 bg-black/50 flex items-center px-4 shrink-0 backdrop-blur-md">
                <div className="flex gap-2">
                  <div className="w-3 h-3 rounded-full bg-neutral-800 group-hover:bg-red-500 transition-colors" />
                  <div className="w-3 h-3 rounded-full bg-neutral-800 group-hover:bg-yellow-500 transition-colors" />
                  <div className="w-3 h-3 rounded-full bg-neutral-800 group-hover:bg-green-500 transition-colors" />
                </div>
                <div className="mx-auto text-[11px] font-medium text-neutral-500 flex items-center gap-2">
                  <Lock className="w-3 h-3" /> meeting.henryai.studio
                </div>
              </div>

              {/* Demo Transcript Window */}
              <div
                ref={demoTranscriptRef}
                className="flex-1 p-6 overflow-y-auto w-full relative h-[350px]"
              >
                {!isListening && transcriptItems.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-600">
                    <Mic className="w-8 h-8 mb-4 opacity-20" />
                    <p className="text-sm font-medium">
                      {demoFinished ? "Demo session complete." : "Waiting for audio..."}
                    </p>
                    {demoFinished && (
                      <Link href="/app" className="mt-4 text-[11px] text-blue-400 hover:text-blue-300 underline underline-offset-2">
                        Create an account to continue
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transcriptItems.map((item, idx) => (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={item.id + idx}
                        className={`p-4 rounded-2xl border flex flex-col gap-1.5 shadow-sm max-w-[85%] ${item.role === 'user'
                          ? 'bg-[#151515] border-neutral-800/80 self-end ml-auto'
                          : 'bg-[#0f172a]/40 border-blue-900/30 self-start'
                          }`}
                      >
                        <p className={`text-sm leading-relaxed ${item.isFinal ? 'text-white' : 'text-neutral-400 italic'}`}>
                          {item.text}
                        </p>
                      </motion.div>
                    ))}
                    {demoFinished && transcriptItems.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5 text-center my-6"
                      >
                        <p className="text-sm font-medium text-neutral-200 mb-2">Live Demo Session Finished</p>
                        <p className="text-xs text-neutral-400 mb-4">You&apos;ve reached the 15-second preview limit.</p>
                        <Link href="/app" className="inline-block bg-white text-black text-xs font-semibold px-4 py-2 rounded-full hover:bg-neutral-200 transition-colors">
                          Unlock Unlimited Access
                        </Link>
                      </motion.div>
                    )}
                  </div>
                )}

                {isListening && (
                  <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-neutral-800 text-[10px] font-medium text-blue-400">
                      <span className="flex h-1.5 w-1.5 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                      </span>
                      Listening...
                    </div>
                    {demoTimeLeft !== null && (
                      <div className="inline-flex items-center px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-neutral-800 text-[10px] font-medium text-neutral-400">
                        {demoTimeLeft}s remaining
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 md:py-32 px-6 relative border-t border-neutral-900 bg-black overflow-hidden flex items-center justify-center">
        {/* Glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight mb-8 text-white">
            Ready to upgrade your meetings?
          </h2>
          <p className="text-neutral-400 text-lg md:text-xl mb-12 max-w-2xl mx-auto font-light leading-relaxed">
            Join professionals who have revolutionized their workflow with Meetly. Experience flawless real-time transcription and translation today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/app"
              className="bg-white text-black px-8 py-4 rounded-full text-base font-semibold hover:bg-neutral-200 hover:scale-105 transition-all w-full sm:w-auto shadow-[0_0_30px_rgba(255,255,255,0.2)] flex items-center justify-center gap-2"
            >
              Start for Free <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-neutral-900 bg-[#050505]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-neutral-500" />
            <span className="font-semibold text-neutral-500 tracking-wide text-sm">Meetly by HenryAI</span>
          </div>
          <p className="text-sm text-neutral-600">
            &copy; {new Date().getFullYear()} meeting.henryai.studio. All rights reserved.
          </p>
          <div className="flex items-center gap-6 text-sm text-neutral-600">
            <a href="#" className="hover:text-neutral-300 transition-colors">Privacy</a>
            <a href="#" className="hover:text-neutral-300 transition-colors">Terms</a>
            <a href="#" className="hover:text-neutral-300 transition-colors">Twitter</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
