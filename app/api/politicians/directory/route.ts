import { NextRequest, NextResponse } from "next/server";
import { getDirectoryPage } from "@/lib/directory/server";
import { normalizeDirectoryFilters } from "@/lib/directory/search";
import { DirectoryInputError } from "@/lib/directory/types";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const PUBLIC_CACHE = "public, max-age=0, s-maxage=300, stale-while-revalidate=300";

export async function GET(request: NextRequest) {
  const limit = rateLimit(`directory:${clientIp(request)}`, 120, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many searches. Please try again shortly." }, {
      status: 429,
      headers: { "Cache-Control": "no-store", "Retry-After": String(limit.retryAfterSeconds) },
    });
  }

  try {
    const params = request.nextUrl.searchParams;
    const allowed = ["q", "state", "office", "scope", "cursor"];
    if (params.toString().length > 2000 || [...params.keys()].some((key) => !allowed.includes(key) || params.getAll(key).length !== 1)) {
      throw new DirectoryInputError("Use a valid directory search.");
    }
    const filters = normalizeDirectoryFilters({ q: params.get("q") ?? "", state: params.get("state") ?? "", office: params.get("office") ?? "", scope: params.get("scope") ?? "" });
    const page = await getDirectoryPage(filters, params.get("cursor") ?? undefined);
    return NextResponse.json(page, { headers: { "Cache-Control": PUBLIC_CACHE } });
  } catch (error) {
    if (error instanceof DirectoryInputError) {
      return NextResponse.json({ error: error.message }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Public directory read failed", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json({ error: "We could not load politicians. Please try again." }, {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "10" },
    });
  }
}
