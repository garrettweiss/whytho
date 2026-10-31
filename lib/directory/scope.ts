import { DirectoryInputError, type DirectoryFilters } from "./types";

export const EXECUTIVE_OFFICES = [
  "President", "Vice President", "Secretary of State", "Secretary of Defense", "Secretary of the Treasury", "Attorney General",
  "Secretary of Homeland Security", "Secretary of Health and Human Services", "Secretary of Education", "Secretary of Energy",
  "Secretary of Agriculture", "Secretary of Commerce", "Secretary of Labor", "Secretary of Transportation",
  "Secretary of Housing and Urban Development", "Secretary of Veterans Affairs", "Secretary of the Interior",
  "White House Chief of Staff", "National Security Advisor", "OMB Director", "CIA Director", "U.S. Ambassador to the United Nations",
  "EPA Administrator", "U.S. Trade Representative",
] as const;
export const FEDERAL_LEGISLATIVE_OFFICES = ["U.S. Senator", "U.S. Representative"];
export const NATIONAL_OFFICES = [...EXECUTIVE_OFFICES, ...FEDERAL_LEGISLATIVE_OFFICES, "Governor"];
// Titles alone cannot distinguish a federal Attorney General from a state one.
// Only positively identified state titles enter the state-only directory.
export const STATE_OFFICES = ["Governor", "Lieutenant Governor", "State Senator", "State Senate", "State Representative", "State House", "State Assembly", "State Assemblymember", "State Delegate", "State Attorney General", "State Secretary of State", "State Treasurer"];
export const STATE_ADDITIONAL_OFFICE_OPTIONS = ["Lieutenant Governor", "State Attorney General", "State Secretary of State", "State Treasurer"].map(office => ({ value: "office-" + office.toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: office, records: [office] }));
export const EXECUTIVE_OFFICE_OPTIONS = EXECUTIVE_OFFICES.filter(office => office !== "President" && office !== "Vice President").map(office => ({ value: "office-" + office.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, ""), label: office, records: [office] }));
export type DirectoryScope = "national" | "state" | "executive";
export type DirectoryContext = { basePath: string; state?: string; scope?: DirectoryScope };

export function allowedOfficeValues(scope?: DirectoryScope): string[] | null {
  if (scope === "state") return ["state-senate", "state-house", "governor", ...STATE_ADDITIONAL_OFFICE_OPTIONS.map(office => office.value)];
  if (scope === "national") return ["us-senate", "us-house", "governor", "president", "vice-president", "executive", ...EXECUTIVE_OFFICE_OPTIONS.map(office => office.value)];
  if (scope === "executive") return ["president", "vice-president", "executive", ...EXECUTIVE_OFFICE_OPTIONS.map(office => office.value)];
  return null;
}

/** Route constraints survive clear, pagination and restored browser history. */
export function constrainDirectoryFilters(filters: DirectoryFilters, context?: DirectoryContext): DirectoryFilters {
  if (!context) return filters;
  if (context.state && filters.state && context.state !== filters.state) throw new DirectoryInputError("This directory is for one state. Use All politicians to search another state.");
  const allowed = allowedOfficeValues(context.scope);
  if (filters.office && allowed && !allowed.includes(filters.office)) throw new DirectoryInputError("That office is outside this directory. Use All politicians to broaden your search.");
  return { ...filters, state: context.state || filters.state, ...(context.scope ? { scope: context.scope } : {}) };
}

export function directoryContextDefaults(context?: DirectoryContext): DirectoryFilters {
  return { q: "", state: context?.state ?? "", office: "", ...(context?.scope ? { scope: context.scope } : {}) };
}

export function federalChamberOffice(chamber: string | undefined): string {
  return ({ executive: "executive", senate: "us-senate", house: "us-house", governors: "governor" } as Record<string, string>)[chamber ?? ""] ?? "";
}
