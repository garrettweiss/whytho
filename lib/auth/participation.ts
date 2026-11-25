export const TERMS_VERSION = "terms-2026-11-23";
export const PARTICIPATION_REQUIRED = "Confirm that you are 18 or older and accept the current Terms before participating.";
export function isParticipationMutation(path: string, method: string): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  return /^\/api\/(?:votes|questions|chat|answers|dashboard\/(?:team|photo|profile)|verify\/(?:claim|gov-email|meta-tag|request-profile)|politicians\/[^/]+\/(?:photo|photo-credit|profile))(?:\/|$)/.test(path);
}
export function validAssent(body: unknown): body is { adult: true; terms_version: string } {
  return !!body && typeof body === "object" && (body as Record<string, unknown>).adult === true && (body as Record<string, unknown>).terms_version === TERMS_VERSION;
}
