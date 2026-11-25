import { STATES } from "../search/states";

export function normalizeIdentityState(value: string): string {
  const query = value.trim().toLowerCase();
  if (["washington dc", "washington d.c.", "washington-dc", "district of columbia"].includes(query)) return "DC";
  const territories = [{ code: "PR", name: "Puerto Rico", slug: "puerto-rico" }, { code: "VI", name: "Virgin Islands", slug: "virgin-islands" }, { code: "GU", name: "Guam", slug: "guam" }, { code: "AS", name: "American Samoa", slug: "american-samoa" }, { code: "MP", name: "Northern Mariana Islands", slug: "northern-mariana-islands" }];
  const state = [...STATES, ...territories].find(state => [state.code, state.name, state.slug].some(label => label.toLowerCase() === query));
  if (!state) throw new Error("Use a recognized U.S. state or territory");
  return state.code;
}

/** Discovery key only. Similar names are never automatic merge approval. */
export function normalizeIdentityName(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export function normalizeIdentityDistrict(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const raw = String(value).trim().toLowerCase();
  if (["at-large", "at large", "al", "0", "00"].includes(raw)) return "0";
  return /^\d+$/.test(raw) ? String(Number(raw)) : raw;
}

