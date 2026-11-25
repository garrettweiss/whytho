/** Weekly brand content queue: generated Sunday, approved by Garrett, published per channel. */

export type Channel = "x" | "bluesky" | "threads";

export const CHANNELS: readonly Channel[] = ["x", "bluesky", "threads"];

export type ItemStatus = "draft" | "approved" | "published" | "skipped" | "failed";

export interface PublishedRecord {
  at: string;
  url?: string;
  id?: string;
  by: string;
}

export interface QueueItem {
  /** Stable id, e.g. "2026-W48-03". Statuses survive regeneration by id. */
  id: string;
  /** Asset code from docs/launch/SOCIAL_MARKETING_PLAN.md, or WEEK_NOTE. */
  asset: string;
  channel: Channel;
  /** UTC instant the post is due. Publishing never happens before it. */
  scheduled_at: string;
  text: string;
  links: string[];
  status: ItemStatus;
  /** Human checks that must pass before approval. Empty when none. */
  requires: string[];
  notes?: string;
  approved_by?: string;
  approved_at?: string;
  published?: PublishedRecord;
  error?: string;
}

export interface WeekFacts {
  checked_at: string;
  week: number;
  /** Non-test, non-seeded, source=user questions created this ISO week. Includes founder/QA activity until separated by hand. */
  user_questions_this_week: number;
  officials_asked_this_week: number;
  official_answers_total: number;
  politicians_tracked: number;
}

export interface WeeklyQueue {
  version: 1;
  week: number;
  label: string;
  monday: string;
  sunday: string;
  generated_at: string;
  site: string;
  facts: WeekFacts;
  /** HTTP status per link at generation time; null when unreachable. */
  link_checks: Record<string, number | null>;
  items: QueueItem[];
}
