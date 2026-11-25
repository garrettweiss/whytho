/**
 * Pure helpers for building photo rights manifests from authoritative sources.
 * No network or database access here; scripts/build-*-photo-manifest.ts do the I/O.
 */
import type { PhotoRights } from "./rights";

export type License = PhotoRights["license"];

export function stripTags(value: string | null | undefined): string {
  return (value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/** Last-name sanity check between two name renderings ("Last, First" or "First Last"). */
export function surnameMatches(ours: string, theirs: string): boolean {
  const tokens = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|dr|mr|mrs|ms|rep|sen|gov|governor)\b\.?/g, "").replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter(t => t.length > 1);
  const a = tokens(ours), b = tokens(theirs);
  return a.some(token => b.includes(token)) || b.some(token => a.includes(token));
}

export type CongressAttribution = { kind: "federal_official" | "member_supplied" | "gpo_publication" | "unresolved"; text: string };

/** Classify Congress.gov API `depiction.attribution` text. */
export function classifyCongressAttribution(raw: string | null | undefined): CongressAttribution {
  const text = stripTags(raw);
  if (!text) return { kind: "unresolved", text: "" };
  // Only photographs credited to Senate or House photographic staff are treated as federal works.
  if (/official u\.?s\.? senate photo|senate historical office|senate photographic studio|senate photo studio|collection of the u\.?s\.? house|house office of photography|house creative services|architect of the capitol|u\.?s\.? house of representatives photography/i.test(text)) {
    return { kind: "federal_official", text };
  }
  if (/courtesy of (the )?member/i.test(text)) return { kind: "member_supplied", text };
  // GPO compiles the Pictorial Directory from photos the offices supply; publication there does not make them federal works.
  if (/congressional pictorial directory|government publishing office|gpo member guide/i.test(text)) return { kind: "gpo_publication", text };
  return { kind: "unresolved", text };
}

export const BIOGUIDE_PHOTO = (bioguideId: string) => `https://bioguide.congress.gov/photo/${encodeURIComponent(bioguideId)}.jpg`;
export const BIOGUIDE_PAGE = (bioguideId: string) => `https://bioguide.congress.gov/search/bio/${encodeURIComponent(bioguideId)}`;
export const US_GOV_COPYRIGHT = "https://www.usa.gov/government-copyright";
/** unitedstates/images republishes GPO Congressional Pictorial Directory portraits (about 450x550). */
export const UNITEDSTATES_IMAGE = (bioguideId: string) => `https://unitedstates.github.io/images/congress/original/${encodeURIComponent(bioguideId)}.jpg`;
export const UNITEDSTATES_IMAGES_PAGE = "https://github.com/unitedstates/images";

export type CommonsExtMetadata = Partial<Record<"LicenseShortName" | "License" | "LicenseUrl" | "Artist" | "Credit" | "Categories" | "AttributionRequired", { value: string }>>;
export type CommonsLicense = { license: License; license_url: string; basis: string } | { license: null; reason: string };

const CC: Record<string, License> = {
  "cc by 2.0": "CC-BY-2.0", "cc by 2.5": "CC-BY-2.5", "cc by 3.0": "CC-BY-3.0", "cc by 4.0": "CC-BY-4.0",
  "cc by-sa 2.0": "CC-BY-SA-2.0", "cc by-sa 2.5": "CC-BY-SA-2.5", "cc by-sa 3.0": "CC-BY-SA-3.0", "cc by-sa 4.0": "CC-BY-SA-4.0",
};
const FEDERAL_PD = /\bPD[- ]?US[- ]?(Gov|Government|Congress|Senate|House|Military|Army|Navy|Air Force|Air National Guard|National Guard|Marine|Marines|Coast Guard|DoD|DOS|DOT|DHS|DOE|DOI|DOC|HUD|FEMA|USDA|VA|NIH|NOAA|NASA|NPS|FWS|BLM|EPA|Federal|Fed)\b|\bPD[- ]?USGov|\bPD White House|\bPD (VOA|NASA|USDA)\b/i;
const FEDERAL_TEMPLATE = /^pd-usgov\b|^pd-voa$/i;
/** State public-record templates whose text documents a statutory or constitutional public-domain basis. */
const STATE_PD_TEMPLATES: Array<[RegExp, string, string]> = [
  [/^pd-cagov$|\bPD California\b/i, "California", "PD-CAGov"],
  [/^pd-flgov$|\bPD Florida\b/i, "Florida", "PD-FLGov"],
  [/^pd-magov$|\bPD-MAGov\b/i, "Massachusetts", "PD-MAGov"],
  [/^pd-gagov$|\bPD Georgia \(U\.S\. state\)\b/i, "Georgia", "PD-GAGov"],
  [/^pd-gahor$/i, "Georgia House of Representatives", "PD-GAHoR"],
  [/^pd-ncgov-legislator photo$/i, "North Carolina General Assembly", "PD-NCGov-legislator_photo"],
  [/^pd-ok-lsbpd$/i, "Oklahoma Legislative Service Bureau", "PD-OK-LSBPD"],
];
const DEDICATION_TEMPLATE = /^pd-author(-flickrpdm)?$|^pd-self$|^pd-user(-\w+)?$|^pdmark-owner$|^pd-release$/i;
const DEDICATION_CATEGORY = /Released into the public domain by the copyright holder|\bPD-author\b|\bPD-self\b|\bPD-author-FlickrPDM\b/i;
const normalizeTemplate = (value: string) => value.toLowerCase().replace(/\s+/g, " ").replace(/_/g, " ").trim();

/**
 * Map Wikimedia Commons extmetadata (plus the license templates read from the file's wikitext, when supplied)
 * to a manifest license, or explain why it is unresolved.
 */
export function commonsLicense(meta: CommonsExtMetadata, templates: string[] = []): CommonsLicense {
  const short = stripTags(meta.LicenseShortName?.value).toLowerCase();
  const categories = stripTags(meta.Categories?.value);
  const tpl = templates.map(normalizeTemplate);
  if (/^cc0\b/.test(short) || /\bCC-Zero\b|\bCC0\b/i.test(categories)) {
    return { license: "CC0-1.0", license_url: "https://creativecommons.org/publicdomain/zero/1.0/", basis: "Commons license tag CC0" };
  }
  const cc = CC[short];
  if (cc) {
    const canonical = `https://creativecommons.org/licenses/${cc.slice(3).toLowerCase().replace(/-(\d)/, "/$1")}/`;
    const declared = stripTags(meta.LicenseUrl?.value).replace(/^http:/, "https:");
    const url = /^https:\/\/creativecommons\.org\/licenses\/[a-z-]+\/\d\.\d\/?$/.test(declared) ? declared : canonical;
    return { license: cc, license_url: url, basis: `Commons license tag ${stripTags(meta.LicenseShortName?.value)}` };
  }
  if (short === "copyrighted free use") {
    return { license: "copyrighted-free-use", license_url: "https://commons.wikimedia.org/wiki/Template:Copyrighted_free_use", basis: "Commons license tag Copyrighted free use (holder permits any use without conditions)" };
  }
  if (/public domain/.test(short) || meta.License?.value === "pd" || short === "pdm-owner") {
    const federalTemplate = tpl.find(t => FEDERAL_TEMPLATE.test(t));
    if (federalTemplate || FEDERAL_PD.test(categories)) {
      return { license: "US-federal-official-duty", license_url: US_GOV_COPYRIGHT, basis: `Commons public-domain ${federalTemplate ? `template {{${federalTemplate}}}` : `category ${categories.split("|").find(c => FEDERAL_PD.test(c)) ?? "PD US"}`} for a US federal work` };
    }
    for (const [pattern, body, template] of STATE_PD_TEMPLATES) {
      const hit = tpl.find(t => pattern.test(t)) ?? categories.split("|").find(c => pattern.test(c));
      if (hit) return { license: "US-state-public-record", license_url: `https://commons.wikimedia.org/wiki/Template:${template}`, basis: `Commons template {{${template}}}: ${body} works are public records in the public domain` };
    }
    const dedication = tpl.find(t => DEDICATION_TEMPLATE.test(t)) ?? (short === "pdm-owner" ? "pdmark-owner" : undefined) ?? (DEDICATION_CATEGORY.test(categories) ? "PD-author (category)" : undefined);
    if (dedication) return { license: "public-domain-dedication", license_url: "https://commons.wikimedia.org/wiki/Template:PD-author", basis: `Commons template {{${dedication}}}: copyright holder released the work into the public domain` };
    return { license: null, reason: `public domain claim without a recognised basis (${tpl.join(", ") || short || "pd"})` };
  }
  return { license: null, reason: short ? `license not accepted: ${short}` : "no license metadata" };
}

/** `http://commons.wikimedia.org/wiki/Special:FilePath/Name.jpg` to `File:Name.jpg`. */
export function commonsTitleFromFilePath(url: string): string | null {
  const match = /Special:FilePath\/(.+)$/i.exec(url);
  if (!match?.[1]) return null;
  try { return `File:${decodeURIComponent(match[1]).replace(/_/g, " ")}`; } catch { return null; }
}

export function commonsFilePage(title: string): string {
  return `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

/** Name tokens for structured matching: lowercase, accents and punctuation removed, suffixes and honorifics dropped. */
export function nameTokens(value: string): string[] {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/["“”]/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|dr|mr|mrs|ms|rep|sen|gov|governor|hon)\b\.?/g, "").replace(/[^a-z\s'-]/g, " ").split(/\s+/).filter(t => t.length > 1);
}
/**
 * Full-name match for office-and-state keyed candidates: our first and last tokens must both appear in the candidate label
 * (hyphenated surnames may match either half). Middle names and initials are ignored.
 */
export function fullNameMatches(ours: string, theirs: string): boolean {
  const a = nameTokens(ours), b = nameTokens(theirs).flatMap(t => [t, ...t.split("-")]);
  if (a.length < 2) return false;
  const first = a[0]!, last = a[a.length - 1]!;
  const has = (token: string) => b.includes(token) || token.split("-").some(part => part.length > 1 && b.includes(part));
  return has(first) && has(last);
}
/** "Colorado House of Representatives District 5" or "5" or "HD-5" to "5"; "Rutland" stays "rutland". */
export function districtKey(value: string | null | undefined): string | null {
  const text = (value ?? "").trim(); if (!text) return null;
  const num = /(\d+)\s*$/.exec(text); if (num) return String(Number(num[1]));
  return text.toLowerCase().replace(/^.*\bdistrict\b\s*/i, "").trim() || null;
}
