/** Browser mutation requests must originate on the site serving the request. */
export function mutationRequestError(request: Request): string | null {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return null;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return "Cross-origin requests are not allowed.";
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return "Cross-origin requests are not allowed.";
  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim();
  if (contentType && contentType !== "application/json" && contentType !== "multipart/form-data") {
    return "Use a JSON or multipart request.";
  }
  return null;
}
