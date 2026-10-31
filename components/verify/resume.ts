export type VerificationMethod = "gov_email" | "meta_tag";
export type VerificationRole = "admin" | "editor" | "responder";

export type VerificationPolitician = {
  id: string;
  slug: string;
  full_name: string;
  office: string | null;
  state: string | null;
  party: string | null;
  photo_url: string | null;
};

export type VerificationResume = {
  politician: VerificationPolitician;
  role: VerificationRole;
  completedMethods: VerificationMethod[];
  verified: boolean;
};

type Membership = {
  user_id: string;
  role: string;
  politicians: (VerificationPolitician & { verification_tier: string }) | (VerificationPolitician & { verification_tier: string })[] | null;
};

type Verification = { user_id: string; politician_id: string; method: string; status: string };

/** Return only resume information owned by this authenticated user, never codes or metadata. */
export function buildVerificationResumes(userId: string, memberships: readonly Membership[], verifications: readonly Verification[]): VerificationResume[] {
  const roles: string[] = ["admin", "editor", "responder"];
  const results: VerificationResume[] = [];
  for (const membership of memberships) {
    if (membership.user_id !== userId || !roles.includes(membership.role)) continue;
    const politician = Array.isArray(membership.politicians) ? membership.politicians[0] : membership.politicians;
    if (!politician || results.some(result => result.politician.id === politician.id)) continue;
    const completed = verifications.filter(row => row.user_id === userId && row.politician_id === politician.id && row.status === "completed");
    const completedMethods = (["gov_email", "meta_tag"] as const).filter(method => completed.some(row => row.method === method));
    results.push({
      politician: {
        id: politician.id, slug: politician.slug, full_name: politician.full_name,
        office: politician.office, state: politician.state, party: politician.party, photo_url: politician.photo_url,
      },
      role: membership.role as VerificationRole,
      completedMethods,
      verified: politician.verification_tier === "2" || politician.verification_tier === "3",
    });
  }
  return results;
}

export function initialVerificationResume(profiles: readonly VerificationResume[], prefillId?: string): VerificationResume | null {
  return prefillId ? profiles.find(profile => profile.politician.id === prefillId) ?? null : null;
}
