import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { sql, ne, eq } from "drizzle-orm";

/**
 * Find users whose keywords intersect with the given keyword array.
 * Uses PostgreSQL array overlap operator (&&) for efficiency.
 *
 * @param {string[]} keywords - caller's keywords
 * @param {string} excludeUserId - don't return the caller
 * @param {"candidate"|"hr"} targetRole - filter by opposite role
 * @returns {Promise<Array>}
 */
export async function findMatchesByKeywords(keywords, excludeUserId, targetRole) {
  if (!keywords || keywords.length === 0) return [];

  // Drizzle doesn't have a built-in array overlap operator, so we use raw SQL
  // for the && (overlap) predicate — fully parameterized, no injection risk.
  const results = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      jobTitle: users.jobTitle,
      keywords: users.keywords,
      role: users.role,
    })
    .from(users)
    .where(
      sql`
        ${users.role} = ${targetRole}
        AND ${users.id} != ${excludeUserId}
        AND ${users.keywords} && ${sql.raw("ARRAY[" + keywords.map((_, i) => `$${i + 3}`).join(",") + "]::text[]")}
      `
    )
    .limit(50);

  // Annotate with the actual shared keywords for display
  return results.map((user) => ({
    ...user,
    sharedKeywords: user.keywords.filter((k) => keywords.includes(k)),
  }));
}
