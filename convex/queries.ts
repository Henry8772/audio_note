import { query } from "./_generated/server";
import { v } from "convex/values";

export const getSession = query({
    args: {
        sessionId: v.id("sessions"),
        password: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const session = await ctx.db.get(args.sessionId);
        if (!session) return null;

        const requiresAuth = !!session.password;
        const isAuthenticated = !requiresAuth || session.password === args.password;

        return {
            _id: session._id,
            title: session.title,
            isActive: session.isActive,
            hasPassword: requiresAuth,
            isAuthenticated: isAuthenticated,
            ...(isAuthenticated ? {
                transcript: session.transcript,
                summary: session.summary,
            } : {
                transcript: null,
                summary: null,
            })
        };
    },
});
