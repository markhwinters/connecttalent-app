import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", ["candidate", "hr"]);
export const matchStatusEnum = pgEnum("match_status", [
  "pending",
  "mutual",
  "rejected",
]);

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    role: userRoleEnum("role").notNull(),
    jobTitle: varchar("job_title", { length: 100 }),
    // Max 10 keywords enforced at application layer (Arcjet + validation)
    keywords: text("keywords").array().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // GIN index for efficient keyword array intersection queries
    keywordsIdx: index("users_keywords_idx").on(table.keywords),
    roleIdx: index("users_role_idx").on(table.role),
  })
);

// ─── Matches ──────────────────────────────────────────────────────────────────

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    initiatorId: uuid("initiator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    receiverId: uuid("receiver_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: matchStatusEnum("status").notNull().default("pending"),
    sharedKeywords: text("shared_keywords").array().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    initiatorIdx: index("matches_initiator_idx").on(table.initiatorId),
    receiverIdx: index("matches_receiver_idx").on(table.receiverId),
  })
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  initiatedMatches: many(matches, { relationName: "initiator" }),
  receivedMatches: many(matches, { relationName: "receiver" }),
}));

export const matchesRelations = relations(matches, ({ one }) => ({
  initiator: one(users, {
    fields: [matches.initiatorId],
    references: [users.id],
    relationName: "initiator",
  }),
  receiver: one(users, {
    fields: [matches.receiverId],
    references: [users.id],
    relationName: "receiver",
  }),
}));
