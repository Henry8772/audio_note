"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { Mic, ArrowRight, Globe, Share2, Layers, CheckCircle2, Play, Square, Loader2, Lock } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAudioRealtime } from "@/lib/useAudioRealtime";
import { joinWaitlist } from "@/app/actions/waitlist";

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
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

    if (importCount > 0) {
      alert(`Successfully imported ${importCount} note(s)!`);
    } else {
      alert("No valid new notes found to import.");
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
        className={`fixed top-0 w-full z-50 transition-all duration-300 border-b ${
          scrolled ? "bg-black/80 backdrop-blur-md border-neutral-800/80 py-3" : "bg-transparent border-transparent py-5"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.2)]">
              <Mic className="w-4 h-4 text-black" />
            </div>
            <span className="font-semibold tracking-wide text-sm">Henry&apos;s Meeting</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#demo" className="hover:text-white transition-colors">Live Demo</a>
            <a href="#waitlist" className="hover:text-white transition-colors">Waitlist</a>
          </div>
          <div className="flex flex-center gap-4">
             <Link href="/app" className="hidden md:flex items-center text-sm font-medium text-neutral-300 hover:text-white transition-colors">
               Sign In
             </Link>
             <Link
              href="/app"
              className="bg-white text-black px-4 py-2 rounded-full text-sm font-semibold hover:bg-neutral-200 hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] flex items-center gap-2"
             >
               Start for Free <ArrowRight className="w-4 h-4" />
             </Link>
          </div>
        </div>
      </aside>
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800 text-xs font-medium text-neutral-300 mb-8">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            Real-time AI Intelligence
          </div>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter mb-8 leading-[1.1]">
            Meetings, <br/>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-neutral-300 to-neutral-600">
              perfectly captured.
            </span>
          </h1>
          <p className="text-lg md:text-xl text-neutral-400 max-w-2xl mx-auto mb-12 leading-relaxed font-light">
            Stay entirely present. Henry&apos;s Meeting transcribes, translates, and summarizes your live sessions across multiple languages, in real-time.
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
      <section id="features" className="py-24 md:py-32 px-6 bg-[#050505]">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20 md:mb-32">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">Core Capabilities</h2>
            <p className="text-neutral-400 max-w-xl mx-auto text-lg leading-relaxed">Everything you need to make the most out of every conversation, instantly.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-[#0a0a0a] rounded-3xl p-8 md:p-10 border border-neutral-800/50 hover:border-neutral-700 transition-colors group"
            >
              <div className="w-14 h-14 bg-neutral-900 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500">
                <Mic className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4 text-white">Real-time Transcription</h3>
              <p className="text-neutral-400 leading-relaxed font-light">
                Flawless precision as they speak. Our ultra-low latency model captures every word immediately without lag.
              </p>
            </motion.div>

            {/* Feature 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-[#0a0a0a] rounded-3xl p-8 md:p-10 border border-neutral-800/50 hover:border-neutral-700 transition-colors group"
            >
              <div className="w-14 h-14 bg-neutral-900 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500">
                <Globe className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4 text-white">Live Translation</h3>
              <p className="text-neutral-400 leading-relaxed font-light">
                Break language barriers instantly. Speak in English and have everyone read in Spanish, French, Chinese, or Japanese.
              </p>
            </motion.div>

            {/* Feature 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-[#0a0a0a] rounded-3xl p-8 md:p-10 border border-neutral-800/50 hover:border-neutral-700 transition-colors group"
            >
              <div className="w-14 h-14 bg-neutral-900 rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500">
                <Share2 className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-4 text-white">Live Meeting Session</h3>
              <p className="text-neutral-400 leading-relaxed font-light">
                Open a session, share the link, and let participants read the transcripion stream live from their own devices.
              </p>
            </motion.div>
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
                className={`flex items-center justify-center gap-3 px-6 py-4 rounded-full font-semibold text-base transition-all duration-300 w-full sm:w-auto shadow-sm ${
                  demoFinished
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
                </div>

                {/* Note Detail Column */}
                <div className="flex-1 flex flex-col h-full bg-black relative">
                  {!activeNote ? (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-600">
                      <Clock className="w-12 h-12 mb-4 opacity-20 text-neutral-400" />
                      <p className="text-sm font-medium text-neutral-400">Select a note to view</p>
                ) : (
                  <div className="space-y-4">
                    {transcriptItems.map((item, idx) => (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={item.id + idx}
                        className={`p-4 rounded-2xl border flex flex-col gap-1.5 shadow-sm max-w-[85%] ${
                          item.role === 'user' 
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

      {/* Waitlist Section */}
      <section id="waitlist" className="py-24 md:py-32 px-6 bg-[#050505] border-t border-neutral-900">
         <div className="max-w-4xl mx-auto">
           <div className="text-center mb-12">
             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-400 mb-8">
               Closed Beta
             </div>
             <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-6">Join the Waitlist</h2>
             <p className="text-neutral-400 max-w-xl mx-auto text-lg leading-relaxed">
               Henry&apos;s Meeting is currently in private beta. Skip the line by joining our exclusive waitlist, or try the 15-minute free preview right now.
             </p>
           </div>
           
           <div className="bg-[#0a0a0a] rounded-3xl p-8 md:p-12 border border-neutral-800 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center gap-8">
             {/* Glow */}
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-blue-500/10 rounded-full blur-[80px] pointer-events-none" />
             
             <div className="flex-1 relative z-10 w-full text-center md:text-left">
               <h3 className="text-2xl font-semibold text-white mb-2">Get Early Access</h3>
               <p className="text-neutral-400 text-sm">We&apos;ll notify you the moment a spot opens up.</p>
             </div>
             
             <div className="flex-1 relative z-10 w-full">
               <form 
                 onSubmit={handleJoinWaitlist} 
                 className="flex flex-col sm:flex-row gap-3"
               >
                 <input 
                   type="email" 
                   required
                   value={waitlistEmail}
                   onChange={(e) => setWaitlistEmail(e.target.value)}
                   disabled={waitlistStatus === 'loading' || waitlistStatus === 'success'}
                   placeholder="Enter your email..." 
                   className="flex-1 bg-[#111] border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 focus:ring-1 focus:ring-neutral-500 transition-all font-sans disabled:opacity-50"
                 />
                 <button 
                   type="submit" 
                   disabled={waitlistStatus === 'loading' || waitlistStatus === 'success'}
                   className="bg-white text-black font-semibold text-sm px-6 py-3 rounded-xl hover:bg-neutral-200 hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)] whitespace-nowrap disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2 min-w-[140px]"
                 >
                   {waitlistStatus === 'loading' ? (
                     <><Loader2 className="w-4 h-4 animate-spin" /> Joining...</>
                   ) : waitlistStatus === 'success' ? (
                     <><CheckCircle2 className="w-4 h-4" /> Joined!</>
                   ) : (
                     "Join Waitlist"
                   )}
                 </button>
               </form>
               {waitlistStatus === 'error' && (
                 <p className="text-red-400 text-xs mt-3 text-left animate-in slide-in-from-top-1 opacity-100">{waitlistError}</p>
               )}
               {waitlistStatus === 'success' && (
                 <p className="text-green-400 text-xs mt-3 text-left animate-in slide-in-from-top-1 opacity-100">Thanks for joining! We'll be in touch soon.</p>
               )}
             </div>
           </div>
         </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-neutral-900 bg-[#050505]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-neutral-500" />
            <span className="font-semibold text-neutral-500 tracking-wide text-sm">Henry&apos;s Meeting</span>
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
