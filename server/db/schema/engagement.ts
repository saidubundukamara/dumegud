import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { MilestoneKey } from "../../../lib/milestones";
import type { RecapStats } from "../../../lib/recap";
import { users } from "./auth";
import { createdAt, id, timestamps } from "./columns";
import { payments } from "./payments";

// Monthly recaps and milestones: the creator's own highlights, shared as image cards.

/**
 * A creator's month, frozen once built so the email, the page and the card always agree. One row
 * per creator and month: the job inserts with ON CONFLICT DO NOTHING, so overlapping runs agree.
 */
export const creatorRecaps = pgTable(
  "creator_recaps",
  {
    id: id(),
    creatorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "2026-09", a calendar month in Freetown time (GMT). */
    month: text().notNull(),
    stats: jsonb().$type<RecapStats>().notNull(),
    /** Claimed just before the email is sent (cleared again if sending fails). */
    emailedAt: timestamp({ withTimezone: true }),
    seenAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [uniqueIndex().on(t.creatorId, t.month), index().on(t.month, t.emailedAt)],
);

/**
 * A milestone the creator reached. The unique (creator, key) row is the only record of it, so a
 * webhook and the daily sweep racing on the same milestone write it once.
 */
export const creatorMilestones = pgTable(
  "creator_milestones",
  {
    id: id(),
    creatorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text().$type<MilestoneKey>().notNull(),
    /** When it was really reached (the settledAt of the payment that crossed the line). */
    achievedAt: timestamp({ withTimezone: true }).notNull(),
    paymentId: uuid().references(() => payments.id, { onDelete: "set null" }),
    /** Reached before milestones were tracked (or long ago): listed, never celebrated or emailed. */
    silent: boolean().notNull().default(false),
    /** Claimed just before the email is sent (cleared again if sending fails). */
    emailedAt: timestamp({ withTimezone: true }),
    seenAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.creatorId, t.key), index().on(t.emailedAt, t.silent)],
);

export type CreatorRecap = typeof creatorRecaps.$inferSelect;
export type CreatorMilestone = typeof creatorMilestones.$inferSelect;
