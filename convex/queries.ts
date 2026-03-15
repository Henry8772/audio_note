import { query } from "./_generated/server";
import { v } from "convex/values";

export const getSession = query({
    args: {
        sessionId: v.id("sessions"),
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.sessionId);
    },
});
