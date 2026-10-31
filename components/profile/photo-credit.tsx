"use client";
import { useEffect, useState } from "react";
import { PORTRAIT_RIGHTS_VERSION } from "@/lib/photos/policy";

type Credit = { credit: string; basis: string | null };
function safeHttps(value: string | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value.trim()); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function PhotoCredit({ politicianId }: { politicianId: string }) {
  const [record, setRecord] = useState<Credit | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/politicians/${politicianId}/photo-credit`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then((data: { credit?: unknown; basis?: unknown } | null) => setRecord(typeof data?.credit === "string" ? { credit: data.credit, basis: typeof data.basis === "string" ? data.basis : null } : null)).catch(() => {});
    return () => controller.abort();
  }, [politicianId]);
  if (!record) return null;
  const uploaded = record.basis === PORTRAIT_RIGHTS_VERSION;
  const parts = record.basis?.split("; ") ?? [];
  const label = parts[0]?.split(": ")[0];
  const license = safeHttps(parts[0]?.split(": ").slice(1).join(": "));
  const source = safeHttps(parts[1]);
  return <p style={{ fontSize: 12, lineHeight: 1.5 }}>
    Photo: {record.credit}. {uploaded ? "Supplied with permission by the verified profile team." : <>
      {license && <><a href={license} rel="noopener noreferrer">{label ?? "License"}</a>. </>}
      {source && <><a href={source} rel="noopener noreferrer">Original source</a>. </>}
      {parts.slice(2).join("; ")}
    </>}
  </p>;
}
