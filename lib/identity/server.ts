import "server-only";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "../supabase/server";
import { resolvePoliticianIdentity as resolveUncached, type IdentityClient } from "./client";

const resolvePublic = unstable_cache(
  (id: string) => resolveUncached(id, createPublicClient()),
  ["public-politician-identity-v1"],
  { revalidate: 60, tags: ["politician-identity", "politician-profile"] },
);

/** Explicit clients bypass cache; only the cookieless public lookup is shared. */
export function resolvePoliticianIdentity(id: string, client?: IdentityClient) {
  return client ? resolveUncached(id, client) : resolvePublic(id);
}

