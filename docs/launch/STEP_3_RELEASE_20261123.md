# Step 3 release and operations

November 23, 2026. Garrett approved the publication, four reviewed Supabase migrations and one Vercel production build on the existing plan. At the initial release check, phone alerts and absence coverage were still unverified. Garrett later confirmed both for the pilot.

## Release candidate

The candidate is commit `611f5fe03c19b7fb057d7975fee58af1dddb29f6`, directly above the prior live release `339e29cd4ceae55387d03140812eb141a396e79a`. The clean release patch, unit log and build log are under `diagnostics/staging-acceptance-20261123/step-3`.

- Included public /privacy, /terms and /report, reachable from the site footer. The urgent removal procedure is available without creating an account.
- Added affirmative 18+ confirmation and versioned terms agreement for participation. Existing accounts must agree when they next participate. No birth date is requested for this confirmation.
- Enforced registered, private, single active vote per account per question. Earlier guest records are retained. Registration establishes control of an account. It does not certify each account is a distinct person.
- Stopped new collection of political affiliation. Existing records are preserved for privacy-request review.
- Added reversible restrictions for specific answers and attachments. Newly generated share cards omit attachment images and use public reads.

## Verified before production

- 188 unit and integration tests, focused lint, TypeScript, and an optimized Next.js build using the staging public database passed.
- Synthetic database checks passed for adult assent, vote ownership and switching, unauthorized participation, a role-based office claim, answer and attachment restrictions, evidence preservation, and prospective affiliation blocking. The vote removal path was reviewed with no actual vote deletion.
- Ten local browser checks passed across mobile and desktop, covering public routes, footer links, the urgent request template, blocked guest mutations, and both sign-in paths staying disabled until age confirmation. No email was sent.
- Production read-only preflight confirmed the affected tables use row-level security, the unique voting constraint is present, the answer-media bucket is private, and the four release migrations still needed applying.

## Operating commitments

Garrett is primary. Quinn is the emergency backup. On November 23 Garrett confirmed that she can receive urgent reports and act with her own authorized access when he is unavailable. Valid intimate-image requests have an outside limit of 48 hours from receipt under the applicable federal platform procedure. Direct phone alerts and absence coverage are confirmed by Garrett. See the pilot packet for publishing checkpoints. The private procedure covers copyright, privacy requests, suspected breaches, safety concerns, and exceptions to the public archive. See [reporting operations](legal/STEP_3_OPERATIONS.md) and [legal applicability](legal/STEP_3_APPLICABILITY.md).

Attorney review, DMCA designation and repeat-infringer readiness, historical permissions, and a full privacy-request rehearsal across providers remain open. Existing contact routes were previously delivery-tested. That test does not establish after-hours coverage or the result of any real report.

## Production status

The [Vercel deployment](https://vercel.com/garrettweiss-projects/whytho/9vhW9ELgyact1YQhyDoNE3fcaYb1) was built once with automatic promotion off. The protected candidate report page and health check passed. The four reviewed Supabase migrations were applied, then Vercel promoted the deployment to whytho.us.

The [privacy notice](https://whytho.us/privacy), [terms of use](https://whytho.us/terms), and [report page](https://whytho.us/report) are public. All six live HTTP checks passed, covering those pages, health, the sign-in age prompt and the guest assent response. A read-only database check confirmed all four migrations, three active participation/profile triggers, both restrictive quarantine policies, row-level security and unchanged pre-existing vote and legacy-affiliation counts. Signed-in behavior and quarantine were exercised with synthetic local fixtures. No real votes, assent, reports, outreach or withdrawals were submitted for this release.

Vercel's protected-URL check automatically generated a project Automation Bypass secret. Garrett approved revoking it. Revocation was verified, with zero Automation Bypass secrets remaining and the project's login protection enabled.

The release was published directly through Vercel from the verified standalone source export. The source commit and release patch are retained locally. GitHub main needs the same change before the next GitHub-triggered deployment to keep the release in the repository.
