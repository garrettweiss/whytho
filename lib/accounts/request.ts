import { NextResponse } from "next/server";

export const isUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export async function readAccountBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

export function accountError(error: { code?: string; message: string }) {
  const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "23505" ? 409 : error.code === "22023" ? 422 : 503;
  return NextResponse.json({ error: status === 503 ? "Account management is temporarily unavailable. Please try again." : error.message }, { status });
}
