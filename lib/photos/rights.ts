import { z } from "zod";

const httpsUrl = z.string().url().refine(value => {
  const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password;
});
export const photoRightsManifest = z.array(z.object({
  politician_id: z.string().uuid(),
  source_url: httpsUrl,
  source_page: httpsUrl,
  creator: z.string().trim().min(2),
  license: z.enum(["CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "US-federal-official-duty", "written-permission"]),
  license_url: httpsUrl,
  evidence: z.string().trim().min(30),
  identity_verified: z.literal(true),
  reviewed_by: z.string().trim().min(2),
  reviewed_at: z.string().datetime(),
  changes: z.string().trim().min(5),
}).strict()).refine(rows => new Set(rows.map(row => row.politician_id)).size === rows.length, "Duplicate politician rights records");
export type PhotoRights = z.infer<typeof photoRightsManifest>[number];
export function approvedRights(rows: PhotoRights[], politicianId: string, source: string): PhotoRights | null {
  return rows.find(row => row.politician_id === politicianId && row.source_url === source) ?? null;
}
