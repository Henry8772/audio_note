import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const createSession = mutation({
    args: {
        title: v.string(),
        hostId: v.string(),
        password: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        return await ctx.db.insert("sessions", {
            title: args.title,
            transcript: "",
            summary: "",
            isActive: true,
            hostId: args.hostId,
            password: args.password,
        });
    },
});

export const updateTranscript = mutation({
    args: {
        sessionId: v.id("sessions"),
        transcript: v.string(),
        hostId: v.string(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db.get(args.sessionId);
        if (!session || session.hostId !== args.hostId) {
            throw new Error("Unauthorized or session not found");
        }
        await ctx.db.patch(args.sessionId, { transcript: args.transcript });
    },
});

export const updateSummary = mutation({
    args: {
        sessionId: v.id("sessions"),
        summary: v.string(),
        hostId: v.string(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db.get(args.sessionId);
        if (!session || session.hostId !== args.hostId) {
            throw new Error("Unauthorized or session not found");
        }
        await ctx.db.patch(args.sessionId, { summary: args.summary });
    },
});

export const endSession = mutation({
    args: {
        sessionId: v.id("sessions"),
        hostId: v.string(),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db.get(args.sessionId);
        if (!session || session.hostId !== args.hostId) {
            throw new Error("Unauthorized or session not found");
        }
        await ctx.db.patch(args.sessionId, { isActive: false });
    },
});
