import { Router } from "express";
import { db } from "../db/client.js";
import { users, matches } from "../db/schema.js";
import { eq, or, and } from "drizzle-orm";
import { findMatchesByKeywords } from "../lib/matching.js";
import {
  arcjetMiddleware,
  swipeProtection,
  profileUpdateProtection,
} from "../middleware/arcjet.js";

export const router = Router();

// ─── Health ───────────────────────────────────────────────────────────────────

router.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// ─── Users ────────────────────────────────────────────────────────────────────

/**
 * POST /api/users
 * Create a new user profile.
 */
router.post("/users", arcjetMiddleware(profileUpdateProtection), async (req, res) => {
  try {
    const { email, displayName, role, jobTitle, keywords = [] } = req.body;

    if (!email || !displayName || !role) {
      return res.status(400).json({ error: "email, displayName, and role are required" });
    }

    if (!["candidate", "hr"].includes(role)) {
      return res.status(400).json({ error: "role must be candidate or hr" });
    }

    // Enforce max 10 keywords
    if (keywords.length > 10) {
      return res.status(400).json({ error: "Maximum 10 keywords allowed" });
    }

    const [user] = await db
      .insert(users)
      .values({ email, displayName, role, jobTitle, keywords })
      .returning();

    res.status(201).json(user);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Email already registered" });
    }
    console.error("[POST /users]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/users/:id
 * Fetch a user profile.
 */
router.get("/users/:id", async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.params.id));

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    console.error("[GET /users/:id]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PATCH /api/users/:id/keywords
 * Update a user's keywords (max 10 enforced).
 */
router.patch(
  "/users/:id/keywords",
  arcjetMiddleware(profileUpdateProtection),
  async (req, res) => {
    try {
      const { keywords } = req.body;

      if (!Array.isArray(keywords) || keywords.length > 10) {
        return res.status(400).json({ error: "keywords must be an array of max 10 strings" });
      }

      const [updated] = await db
        .update(users)
        .set({ keywords, updatedAt: new Date() })
        .where(eq(users.id, req.params.id))
        .returning();

      if (!updated) return res.status(404).json({ error: "User not found" });
      res.json(updated);
    } catch (err) {
      console.error("[PATCH /users/:id/keywords]", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ─── Discovery / Matching ─────────────────────────────────────────────────────

/**
 * GET /api/discover/:userId
 * Find users with overlapping keywords.
 */
router.get("/discover/:userId", async (req, res) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.params.userId));
    if (!user) return res.status(404).json({ error: "User not found" });

    const targetRole = user.role === "hr" ? "candidate" : "hr";
    const candidates = await findMatchesByKeywords(user.keywords, user.id, targetRole);

    res.json({ matches: candidates, count: candidates.length });
  } catch (err) {
    console.error("[GET /discover]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Swipe ────────────────────────────────────────────────────────────────────

/**
 * POST /api/swipe
 * Express interest. If both parties have swiped, creates a mutual match.
 * Rate limited: 20 swipes per minute per IP.
 */
router.post("/swipe", arcjetMiddleware(swipeProtection), async (req, res) => {
  try {
    const { initiatorId, receiverId } = req.body;
    if (!initiatorId || !receiverId) {
      return res.status(400).json({ error: "initiatorId and receiverId required" });
    }

    // Check if receiver already swiped on initiator (mutual match)
    const [existingMatch] = await db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.initiatorId, receiverId),
          eq(matches.receiverId, initiatorId)
        )
      );

    if (existingMatch) {
      // Mutual match — upgrade to "mutual"
      const [mutualMatch] = await db
        .update(matches)
        .set({ status: "mutual", updatedAt: new Date() })
        .where(eq(matches.id, existingMatch.id))
        .returning();

      return res.json({ match: mutualMatch, mutual: true });
    }

    // Check for duplicate swipe
    const [duplicate] = await db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.initiatorId, initiatorId),
          eq(matches.receiverId, receiverId)
        )
      );

    if (duplicate) {
      return res.status(409).json({ error: "Already swiped on this user" });
    }

    // Fetch shared keywords
    const [initiator, receiver] = await Promise.all([
      db.select().from(users).where(eq(users.id, initiatorId)).then((r) => r[0]),
      db.select().from(users).where(eq(users.id, receiverId)).then((r) => r[0]),
    ]);

    if (!initiator || !receiver) {
      return res.status(404).json({ error: "User not found" });
    }

    const sharedKeywords = initiator.keywords.filter((k) =>
      receiver.keywords.includes(k)
    );

    const [newMatch] = await db
      .insert(matches)
      .values({ initiatorId, receiverId, sharedKeywords })
      .returning();

    res.status(201).json({ match: newMatch, mutual: false });
  } catch (err) {
    console.error("[POST /swipe]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/matches/:userId
 * Get all mutual matches for a user.
 */
router.get("/matches/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const userMatches = await db
      .select()
      .from(matches)
      .where(
        and(
          or(
            eq(matches.initiatorId, userId),
            eq(matches.receiverId, userId)
          ),
          eq(matches.status, "mutual")
        )
      );

    res.json({ matches: userMatches });
  } catch (err) {
    console.error("[GET /matches]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});
