import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    sessions: defineTable({
        title: v.string(),
        transcript: v.string(),
        summary: v.string(),
        isActive: v.boolean(),
        hostId: v.string(),
        password: v.optional(v.string()),
    }),
});
