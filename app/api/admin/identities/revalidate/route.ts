import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

/** Internal release hook after audited identity links have committed. */
export async function POST(request: NextRequest) {
  const expected = process.env.ADMIN_SECRET;
  const provided = request.headers.get("x-admin-secret") ?? "";
  if (!expected || Buffer.byteLength(expected) !== Buffer.byteLength(provided) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  for (const tag of ["politician-profile", "politician-identity", "politician-directory", "races"]) revalidateTag(tag);
  for (const path of ["/api/politicians/search-index", "/sitemap.xml", "/leaderboard"]) revalidatePath(path);
  revalidatePath("/", "page");
  revalidatePath("/[slug]", "page");
  return NextResponse.json({ revalidated: true }, { headers: { "Cache-Control": "no-store" } });
}
