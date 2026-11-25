import { NextResponse } from "next/server";
export async function POST() {
 return NextResponse.json({ error: "Sign in with an account to participate.", code: "ACCOUNT_REQUIRED" }, { status: 401 });
}
