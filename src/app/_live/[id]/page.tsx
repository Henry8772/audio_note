"use client";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { use } from "react";
import { Mic, FileText, Loader2, List } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function LiveSessionViewer({ params }: { params: Promise<{ id: string }> }) {
    const unwrappedParams = use(params);
    // This automatically updates in real-time whenever the host speaks!
    const session = useQuery(api.queries.getSession, { sessionId: unwrappedParams.id as any });

    if (session === undefined) {
        return (
            <div className="h-screen w-full bg-black flex flex-col items-center justify-center font-sans">
                <Loader2 className="w-8 h-8 text-neutral-500 animate-spin mb-4" />
                <p className="text-neutral-500 text-sm font-medium">Connecting to live stream...</p>
            </div>
        );
    }

    if (session === null) {
        return (
            <div className="h-screen w-full bg-black flex flex-col items-center justify-center font-sans">
                <div className="w-12 h-12 bg-neutral-900 rounded-xl flex items-center justify-center mb-4 border border-neutral-800">
                    <Mic className="w-5 h-5 text-neutral-500" />
                </div>
                <p className="text-white text-lg font-semibold">Session Not Found</p>
                <p className="text-neutral-500 text-sm mt-2">This session may have ended or does not exist.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full bg-black text-neutral-200 font-sans selection:bg-neutral-800 selection:text-white">
            {/* Header */}
            <header className="h-16 border-b border-neutral-800/80 bg-black/50 backdrop-blur-md sticky top-0 z-50 flex items-center px-6">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm shrink-0">
                        <Mic className="w-4 h-4 text-black" />
                    </div>
                    <div>
                        <h1 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
                            {session.title}
                        </h1>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            {session.isActive ? (
                                <>
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                                    <span className="text-[10px] uppercase font-bold text-red-400 tracking-widest">Live Now</span>
                                </>
                            ) : (
                                <>
                                    <div className="w-1.5 h-1.5 rounded-full bg-neutral-600"></div>
                                    <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-widest">Ended</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-5xl mx-auto p-6 md:p-12">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">

                    {/* Transcript Column */}
                    <div className="flex flex-col gap-6">
                        <h2 className="text-[11px] font-semibold text-neutral-500 tracking-widest uppercase flex items-center gap-2 border-b border-neutral-800 pb-4">
                            <List className="w-3.5 h-3.5" /> Live Transcript
                        </h2>
                        <div className="bg-[#0a0a0a] rounded-xl border border-neutral-800/60 p-6 min-h-[50vh]">
                            {!session.transcript ? (
                                <p className="text-sm text-neutral-500 italic">Waiting for host to speak...</p>
                            ) : (
                                <div className="text-[14px] leading-relaxed whitespace-pre-wrap text-neutral-300">
                                    {session.transcript}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Summary Column */}
                    <div className="flex flex-col gap-6">
                        <h2 className="text-[11px] font-semibold text-neutral-500 tracking-widest uppercase flex items-center gap-2 border-b border-neutral-800 pb-4">
                            <FileText className="w-3.5 h-3.5" /> AI Summary
                        </h2>
                        <div className="bg-[#0a0a0a] rounded-xl border border-neutral-800/60 p-6 min-h-[50vh]">
                            {!session.summary ? (
                                <div className="h-full flex flex-col items-center justify-center opacity-50 text-neutral-500 pt-12">
                                    <Loader2 className="w-6 h-6 animate-spin mb-4" />
                                    <p className="text-xs font-medium uppercase tracking-widest">Waiting for notes</p>
                                </div>
                            ) : (
                                <div className="prose prose-invert prose-neutral max-w-none prose-h1:text-[16px] prose-h1:font-bold prose-h1:text-white prose-h2:text-[14px] prose-h2:font-semibold prose-h2:text-neutral-200 prose-p:text-[13.5px] prose-p:leading-relaxed prose-p:text-neutral-300 prose-ul:text-[13.5px] prose-ul:text-neutral-300 font-medium tracking-wide">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{session.summary}</ReactMarkdown>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
}
