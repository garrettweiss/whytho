import { STATES } from "@/lib/search/states";
import type { ElectionCandidate, ElectionFilters, ElectionOffice, ElectionPeriod, ElectionSearchParams } from "./types";

export const ELECTION_PAGE_SIZE = 24;
export const ELECTION_MAX_PAGE = 500;
export const ELECTION_OFFICES: { value: ElectionOffice; label: string; stored?: string }[] = [
  { value: "all", label: "All offices" },
  { value: "governor", label: "Governor", stored: "Governor" },
  { value: "senate", label: "U.S. Senate", stored: "U.S. Senator" },
  { value: "house", label: "U.S. House", stored: "U.S. Representative" },
  { value: "state-senate", label: "State Senate", stored: "State Senator" },
  { value: "state-house", label: "State House / Assembly", stored: "State Representative" },
  { value: "mayor", label: "Mayor", stored: "Mayor" },
  { value: "president", label: "President", stored: "President" },
];

export function parseElectionPage(value: unknown): number {
  if (typeof value !== "string" || !/^[1-9]\d{0,3}$/.test(value)) return 1;
  const page = Number(value);
  return page <= ELECTION_MAX_PAGE ? page : 1;
}

export function parseElectionFilters(params: ElectionSearchParams): ElectionFilters {
  const office = ELECTION_OFFICES.find((item) => item.value === params.filter)?.value ?? "all";
  const requestedState = typeof params.state === "string" ? params.state.toUpperCase() : "";
  const state = STATES.some((item) => item.code === requestedState) ? requestedState : "";
  const period: ElectionPeriod = params.period === "past" || params.period === "all" ? params.period : "upcoming";
  return { office, state, period, page: parseElectionPage(params.page) };
}

export function electionDirectoryHref(filters: ElectionFilters, changes: Partial<ElectionFilters> = {}): string {
  const next = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (next.office !== "all") params.set("filter", next.office);
  if (next.state) params.set("state", next.state);
  if (next.period !== "upcoming") params.set("period", next.period);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return `/races${query ? `?${query}` : ""}`;
}

export function electionDetailHref(slug: string, page = 1): string {
  return `/races/${encodeURIComponent(slug)}${page > 1 ? `?page=${page}` : ""}`;
}

export function electionStateName(state: string | null): string {
  return STATES.find((item) => item.code === state?.toUpperCase())?.name ?? state ?? "State not listed";
}

export function electionToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function isElectionDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function electionDateLabel(value: string, long = false): string {
  if (!isElectionDate(value)) return "Date not confirmed";
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: long ? "long" : "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
}

export function electionTypeLabel(value: string): string {
  return ({ general: "General election", primary: "Primary election", runoff: "Runoff election", special: "Special election" } as Record<string, string>)[value] ?? "Election";
}

export function electionPhaseLabel(race: { election_date: string; status: string }, today: string): string {
  if (race.status === "cancelled" || race.status === "canceled") return "Recorded as cancelled";
  if (race.status === "completed") return "Recorded as completed";
  if (!isElectionDate(race.election_date)) return "Date not confirmed";
  if (race.election_date < today) return "Past election";
  if (race.election_date === today) return "Election date today";
  return "Upcoming election";
}

export function candidateRecordLabel(candidate: Pick<ElectionCandidate, "candidate_status" | "is_active">): string {
  const labels: Record<string, string> = {
    won: "Recorded result: won",
    lost: "Recorded status: lost",
    withdrew: "Recorded status: withdrew",
    withdrawn: "Recorded status: withdrew",
    active: "Listed candidate",
  };
  const label = candidate.candidate_status ? labels[candidate.candidate_status] : undefined;
  if (label) return label;
  return candidate.is_active ? "Profile linked to this race" : "Inactive profile linked to this race";
}

export function readCandidateCount(value: unknown): number {
  if (!Array.isArray(value) || value.length !== 1) throw new Error("Candidate count unavailable");
  const row: unknown = value[0];
  if (!row || typeof row !== "object" || !("count" in row) || typeof row.count !== "number" || !Number.isSafeInteger(row.count) || row.count < 0) throw new Error("Candidate count unavailable");
  return row.count;
}

export function exactElectionTotal(value: number | null): number {
  if (value === null || !Number.isSafeInteger(value) || value < 0) throw new Error("Election total unavailable");
  return value;
}
