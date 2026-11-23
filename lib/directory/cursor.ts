import { createHash } from "node:crypto";
import { DirectoryInputError, type DirectoryFilters } from "./types";

export type DirectoryCursor = { name: string; id: string; weekNumber: number; snapshot?: number };
export const DIRECTORY_SNAPSHOT_MS = 5 * 60_000;
export const DIRECTORY_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fingerprint(filters: DirectoryFilters): string {
  return createHash("sha256").update(JSON.stringify([filters.q, filters.state, filters.office, filters.scope ?? ""])).digest("hex").slice(0, 24);
}

export function encodeDirectoryCursor(cursor: DirectoryCursor, filters: DirectoryFilters): string {
  return Buffer.from(JSON.stringify({ v: 1, n: cursor.name, i: cursor.id, w: cursor.weekNumber, f: fingerprint(filters), s: cursor.snapshot })).toString("base64url");
}

export function decodeDirectoryCursor(value: string | undefined, filters: DirectoryFilters): DirectoryCursor | null {
  if (!value) return null;
  const fail = () => new DirectoryInputError("This page link has expired. Start your search again.");
  if (value.length > 1200 || !/^[A-Za-z0-9_-]+$/.test(value)) throw fail();
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw fail();
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw fail();
    const data = parsed as Record<string, unknown>;
    const keys = Object.keys(data).sort().join(",");
    if ((keys !== "f,i,n,v,w" && keys !== "f,i,n,s,v,w") || data.v !== 1 || data.f !== fingerprint(filters) ||
      typeof data.w !== "number" || !Number.isInteger(data.w) || data.w < 200001 || data.w > 209953 || data.w % 100 < 1 || data.w % 100 > 53 ||
      typeof data.n !== "string" || !data.n || data.n.length > 200 || /[\u0000-\u001f\u007f]/.test(data.n) ||
      typeof data.i !== "string" || !UUID.test(data.i)) throw fail();
    if (keys === "f,i,n,s,v,w") {
      const snapshot = data.s;
      const now = Date.now();
      if (typeof snapshot !== "number" || !Number.isSafeInteger(snapshot) || snapshot % DIRECTORY_SNAPSHOT_MS !== 0 ||
        snapshot > now || snapshot < now - DIRECTORY_SNAPSHOT_MAX_AGE_MS) throw fail();
      return { name: data.n, id: data.i, weekNumber: data.w, snapshot };
    }
    return { name: data.n, id: data.i, weekNumber: data.w };
  } catch {
    throw fail();
  }
}

/** A missing aggregate is a failed read, never evidence of no response. */
export function readEmbeddedCount(value: unknown): number {
  if (!Array.isArray(value) || value.length !== 1) throw new Error("Invalid directory count");
  const row: unknown = value[0];
  if (!row || typeof row !== "object" || !("count" in row) ||
    typeof row.count !== "number" || !Number.isSafeInteger(row.count) || row.count < 0) {
    throw new Error("Invalid directory count");
  }
  return row.count;
}
