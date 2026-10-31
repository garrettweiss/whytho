/** A trusted retrieval/review step supplies evidence; model output cannot certify itself. */
export interface ReviewedEvidence {
  title: string;
  url: string;
  date: string;
  excerpt: string;
  reviewedBy: string;
}
export function validEvidence(input: unknown): input is ReviewedEvidence {
  if (!input || typeof input !== "object") return false;
  const source = input as Record<string, unknown>;
  if (typeof source.title !== "string" || !source.title.trim() || typeof source.excerpt !== "string" || source.excerpt.trim().length < 30 || source.excerpt.length > 12000 || typeof source.reviewedBy !== "string" || !source.reviewedBy.trim()) return false;
  if (typeof source.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(source.date) || Number.isNaN(Date.parse(source.date)) || source.date > new Date().toISOString().slice(0,10)) return false;
  if (new Date(source.date).toISOString().slice(0,10) !== source.date) return false;
  try { const url = new URL(String(source.url)); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
