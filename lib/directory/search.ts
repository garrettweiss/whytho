import { EXECUTIVE_OFFICES, EXECUTIVE_OFFICE_OPTIONS, STATE_ADDITIONAL_OFFICE_OPTIONS } from "./scope";
import { STATES } from "../search/states";
import { DirectoryInputError, type DirectoryFilters } from "./types";

export const OFFICES = [
  { value: "us-senate", label: "U.S. Senate", records: ["U.S. Senator"] },
  { value: "us-house", label: "U.S. House", records: ["U.S. Representative"] },
  { value: "state-senate", label: "State Senate", records: ["State Senator", "State Senate"] },
  { value: "state-house", label: "State House / Assembly", records: ["State Representative", "State House", "State Assembly", "State Assemblymember", "State Delegate"] },
  { value: "governor", label: "Governor", records: ["Governor"] },
  { value: "president", label: "President", records: ["President"] },
  { value: "vice-president", label: "Vice President", records: ["Vice President"] },
  { value: "executive", label: "President, Cabinet & executive", records: EXECUTIVE_OFFICES },
  ...EXECUTIVE_OFFICE_OPTIONS,
  ...STATE_ADDITIONAL_OFFICE_OPTIONS,
] as const;

export const EMPTY_DIRECTORY_FILTERS: DirectoryFilters = { q: "", state: "", office: "" };

function clean(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeDirectoryFilters(input: Partial<Omit<DirectoryFilters, "scope">> & { scope?: string }): DirectoryFilters {
  const q = clean(input.q ?? "");
  if (q.length > 100 || /[\u0000-\u001f\u007f]/.test(input.q ?? "")) {
    throw new DirectoryInputError("Use a search of 100 characters or fewer.");
  }
  const stateInput = clean(input.state ?? "");
  const state = STATES.find((entry) =>
    [entry.code, entry.name, entry.slug].some((value) => value.toLowerCase() === stateInput.toLowerCase())
  );
  if (stateInput && !state) throw new DirectoryInputError("Choose a valid state.");
  const office = clean(input.office ?? "").toLowerCase();
  if (office && !OFFICES.some((entry) => entry.value === office)) {
    throw new DirectoryInputError("Choose a valid office.");
  }
  const scope = input.scope || undefined;
  if (scope && !["national", "state", "executive"].includes(scope)) throw new DirectoryInputError("Choose a valid directory scope.");
  return { ...(scope ? { scope: scope as DirectoryFilters["scope"] } : {}), q: q.toLowerCase() === "aoc" ? "Alexandria Ocasio-Cortez" : q, state: state?.code ?? "", office };
}

const OFFICE_PHRASES: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\b(?:state\s+(?:senate|senator|senators))\b/i, value: "state-senate" },
  { pattern: /\b(?:state\s+(?:house|representative|representatives|assembly|assemblymember|delegate)|assemblymember|state assembly member)\b/i, value: "state-house" },
  { pattern: /\b(?:(?:u\.?s\.?|united states|federal|congress|congressional)\s+(?:senate|senator|senators))\b/i, value: "us-senate" },
  { pattern: /\b(?:(?:u\.?s\.?|united states|federal|congress|congressional)\s+(?:house|representative|representatives))\b/i, value: "us-house" },
  { pattern: /\bgovernors?\b/i, value: "governor" },
  { pattern: /\bvice president\b/i, value: "vice-president" },
  { pattern: /\b(?:executive branch|cabinet)\b/i, value: "executive" },
  { pattern: /\bpresident\b/i, value: "president" },
];

/** Parse explicit jurisdictions; bare senate/house stays a choice for the visitor. */
export function parseDirectorySearch(text: string): { filters: DirectoryFilters; officeChoices: string[] } {
  normalizeDirectoryFilters({ q: text });
  let remainder = clean(text);
  let office = "";
  let state = "";
  // Match the full office title before parsing state names or shorter roles.
  const exactTitle = [...EXECUTIVE_OFFICE_OPTIONS, ...STATE_ADDITIONAL_OFFICE_OPTIONS].sort((a, b) => b.label.length - a.label.length).find(entry => {
    const at = remainder.toLowerCase().indexOf(entry.label.toLowerCase());
    return at >= 0 && (at === 0 || /\s/.test(remainder[at - 1]!)) && (at + entry.label.length === remainder.length || /\s/.test(remainder[at + entry.label.length]!));
  });
  if (exactTitle) {
    office = exactTitle.value;
    const at = remainder.toLowerCase().indexOf(exactTitle.label.toLowerCase());
    remainder = clean(remainder.slice(0, at) + " " + remainder.slice(at + exactTitle.label.length));
  }
  for (const entry of office ? [] : OFFICE_PHRASES) {
    if (entry.pattern.test(remainder)) {
      office = entry.value;
      remainder = clean(remainder.replace(entry.pattern, " "));
      break;
    }
  }

  const exactState = STATES.find((entry) => [entry.code, entry.name, entry.slug]
    .some((value) => value.toLowerCase() === remainder.toLowerCase()));
  const hasOfficeContext = Boolean(office) || /\b(?:senate|senator|senators|house|representative|representatives)\b/i.test(remainder);
  if (exactState) {
    state = exactState.code;
    remainder = "";
  } else if (hasOfficeContext) {
    // Preserve names such as Virginia Foxx and Al Green without an office context.
    // Long state names first, so West Virginia is not interpreted as Virginia.
    const statesByLength = [...STATES].sort((a, b) => b.name.length - a.name.length);
    for (const entry of statesByLength) {
      const escaped = entry.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, "i");
      if (pattern.test(remainder)) {
        state = entry.code;
        remainder = clean(remainder.replace(pattern, " "));
        break;
      }
    }
    if (!state) {
      const parts = remainder.split(" ");
      const index = parts.findIndex((part) => STATES.some((entry) => entry.code === part.toUpperCase()));
      if (index >= 0) {
        state = parts[index]!.toUpperCase();
        parts.splice(index, 1);
        remainder = clean(parts.join(" "));
      }
    }
  }

  let officeChoices: string[] = [];
  if (!office && /\b(?:senate|senator|senators)\b/i.test(remainder)) {
    officeChoices = ["us-senate", "state-senate"];
    remainder = clean(remainder.replace(/\b(?:senate|senator|senators)\b/gi, " "));
  } else if (!office && /\b(?:house|representative|representatives)\b/i.test(remainder)) {
    officeChoices = ["us-house", "state-house"];
    remainder = clean(remainder.replace(/\b(?:house|representative|representatives)\b/gi, " "));
  }
  remainder = clean(remainder.replace(/^(?:in|from)\s+|\s+(?:in|from)$/gi, " "));
  return { filters: normalizeDirectoryFilters({ q: remainder, state, office }), officeChoices };
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/** Quote PostgREST grammar separately from URL encoding. */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function stateRecordValues(code: string): string[] {
  const state = STATES.find((entry) => entry.code === code);
  return state ? [state.code, state.name] : [];
}
