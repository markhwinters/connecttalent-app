import arcjet, {
  tokenBucket,
  shield,
  detectBot,
  fixedWindow,
} from "@arcjet/node";

// ─── Arcjet instance ──────────────────────────────────────────────────────────

const aj = arcjet({
  key: process.env.ARCJET_KEY,
  // Characteristics used to identify a "user" for rate limiting
  characteristics: ["ip.src"],
  rules: [
    // Shield: protection against common attacks (SQLi, XSS, etc.)
    shield({ mode: "LIVE" }),
  ],
});

// ─── Rule Sets ────────────────────────────────────────────────────────────────

// 20 swipes per minute per IP
export const swipeProtection = aj.withRule(
  tokenBucket({
    mode: "LIVE",
    refillRate: 20,
    interval: 60,
    capacity: 20,
  })
);

// 5 WS upgrade attempts per minute per IP + bot detection
export const wsUpgradeProtection = aj
  .withRule(
    fixedWindow({ mode: "LIVE", window: "1m", max: 5 })
  )
  .withRule(
    detectBot({ mode: "LIVE", allow: [] }) // deny all bots
  );

// Profile/keyword update: fixed window 30/min
export const profileUpdateProtection = aj.withRule(
  fixedWindow({ mode: "LIVE", window: "1m", max: 30 })
);

// ─── Express middleware helper ────────────────────────────────────────────────

/**
 * Wraps an Arcjet protected instance into Express middleware.
 * Usage: router.post('/swipe', arcjetMiddleware(swipeProtection), handler)
 */
export function arcjetMiddleware(protectedAj) {
  return async (req, res, next) => {
    const decision = await protectedAj.protect(req);

    if (decision.isDenied()) {
      const reason = decision.reason;

      if (reason.isRateLimit()) {
        return res.status(429).json({
          error: "Too many requests",
          retryAfter: reason.resetTime,
        });
      }

      if (reason.isBot()) {
        return res.status(403).json({ error: "Bot traffic not allowed" });
      }

      return res.status(403).json({ error: "Forbidden" });
    }

    next();
  };
}
