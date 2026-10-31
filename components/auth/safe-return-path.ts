const LOCAL_ORIGIN = "https://return.whytho.invalid";

/** Only local paths may be carried through authentication callbacks. */
export function safeReturnPath(value: unknown): string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/";
  try {
    const parsed = new URL(value, LOCAL_ORIGIN);
    const localPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (parsed.origin !== LOCAL_ORIGIN || localPath.startsWith("//")) return "/";
    return localPath;
  } catch {
    return "/";
  }
}
