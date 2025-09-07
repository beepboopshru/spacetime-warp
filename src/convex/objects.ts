import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const createObject = mutation({
  args: {
    type: v.string(),
    mass: v.number(),
    position: v.object({
      x: v.number(),
      y: v.number(),
      z: v.number(),
    }),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Must be authenticated to create objects");
    }

    return await ctx.db.insert("spaceObjects", {
      userId: user._id,
      type: args.type,
      mass: args.mass,
      position: args.position,
      name: args.name,
    });
  },
});

export const getUserObjects = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    return await ctx.db
      .query("spaceObjects")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const updateObjectMass = mutation({
  args: {
    objectId: v.id("spaceObjects"),
    mass: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Must be authenticated");
    }

    const object = await ctx.db.get(args.objectId);
    if (!object || object.userId !== user._id) {
      throw new Error("Object not found or unauthorized");
    }

    await ctx.db.patch(args.objectId, {
      mass: args.mass,
    });
  },
});

export const updateObjectPosition = mutation({
  args: {
    objectId: v.id("spaceObjects"),
    position: v.object({
      x: v.number(),
      y: v.number(),
      z: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Must be authenticated");
    }

    const object = await ctx.db.get(args.objectId);
    if (!object || object.userId !== user._id) {
      throw new Error("Object not found or unauthorized");
    }

    await ctx.db.patch(args.objectId, {
      position: args.position,
    });
  },
});

export const deleteObject = mutation({
  args: {
    objectId: v.id("spaceObjects"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Must be authenticated");
    }

    const object = await ctx.db.get(args.objectId);
    // Make deletion idempotent: if it's already gone, just return
    if (!object) {
      return;
    }
    if (object.userId !== user._id) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.objectId);
  },
});

export const clearAllObjects = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Must be authenticated");
    }

    const objects = await ctx.db
      .query("spaceObjects")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const object of objects) {
      await ctx.db.delete(object._id);
    }
  },
});