import { isIP } from "node:net";

/** A source reviewer may approve only an HTTPS hostname, never a literal address. */
export function safeOfficialUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port || isIP(url.hostname) || url.hostname.includes(":")) return null;
    if (!url.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(url.hostname)) return null;
    return url;
  } catch { return null; }
}

/** Only globally routable IPv4 is supported. IPv6 and mixed DNS answers fail closed. */
export function isPublicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || b === 0 || b === 88))
    || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
    || (a === 203 && b === 0 && c === 113));
}

export function permittedGovernmentEmail(email: string, domains: string[]): boolean {
  if (!/^[^\s@<>]+@[^\s@<>]+$/.test(email) || email.length > 254) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  return Boolean(domain?.endsWith(".gov") && domains.some(allowed => domain === allowed.toLowerCase()));
}

export function readVerificationCode(html: string): string | null {
  // Ignore comments and inert script/style/template text instead of accepting a
  // tag-shaped string as proof. Source URL is fixed by the independent reviewer.
  const clean = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const head = /<head(?:\s[^>]*)?>([\s\S]*?)<\/head\s*>/i.exec(clean)?.[1];
  if (!head) return null;
  for (const tag of head.match(/<meta\s[^>]*>/gi) ?? []) {
    if (!/\sname\s*=\s*["']whytho-verification["']/i.test(tag)) continue;
    const code = /\scontent\s*=\s*["'](wt-[a-f0-9]{32})["']/i.exec(tag)?.[1];
    if (code) return code;
  }
  return null;
}
