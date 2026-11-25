# Isolated hosted preview for WhyTho

The existing Vercel Preview predates the release candidate and has no verified separate database. Use a protected preview backed by a dedicated Supabase test project. Use a Free Plan project if Garrett has a slot available. The limit is shared across organizations where he is an owner or administrator. Check availability before creating resources. [Current database rehearsal](HOSTED_ACCEPTANCE_GAP_20261122.md) [Supabase Free Plan](https://supabase.com/docs/guides/platform/billing-on-supabase#free-plan)

Garrett approved creating the preview and staging database if there is no added cost. The dedicated WhyTho Staging organization was created on Supabase Free, and Garrett completed creation of the healthy `whytho-staging` Nano project on November 23. Its reference is `cckigbmkfvopnvjryifd` in US East (North Virginia). Confirm the project reference before changing schema or adding fixtures. On November 23 the existing Vercel Pro team showed all included credit used for the cycle ending December 2 and on-demand usage in effect. Hosted app deployment is on hold under the no-added-cost condition. [Staging database](https://supabase.com/dashboard/project/cckigbmkfvopnvjryifd) [Vercel team usage](https://vercel.com/garrettweiss-projects/~/usage) [Vercel Spend Management](https://vercel.com/docs/spend-management)

The prepared preview source is at `diagnostics/integrated-release-20261122/preview-source-r2.tar.gz`. Its manifest verifies all 275 files against the pinned base and revised release overlay. The exact extracted archive passed 141 tests and generated all 113 pages against synthetic data. It excludes working-tree changes from other workstreams, local environment files and diagnostics. Use the matching November 22 schema checkpoint for this isolated test. Refresh the live migration and deployment inventory before any eventual production release.

The staging database now has the reviewed public schema, three release migrations and synthetic fixtures. Six hosted API checks and six browser checks passed. The browser ran the release app locally against hosted staging Supabase. It displayed the original and dated correction, with the draft hidden. The staging schema was installed by targeted SQL and its migration history requires reconciliation before a general push. See `diagnostics/staging-acceptance-20261123/` for evidence. The protected Vercel deployment and its hosted sign-in checks are still pending.

## Recommended setup

1. Create a dedicated WhyTho staging Supabase project and a separate WhyTho staging Vercel project in the authorized accounts. Set up Vercel Authentication for the preview. Deploy the source candidate to a non-production branch. Use the saved source overlay and its checksums. [Release candidate](INTEGRATED_RELEASE_CANDIDATE_20261122.md) [Vercel Deployment Protection](https://vercel.com/docs/deployment-protection)
2. Rebuild the reviewed public schema in staging with Supabase Auth and platform-managed dependencies supplied by that project. Validate the result against the local schema rehearsal. Apply the three pending migrations in the documented order. Set the project aside for synthetic fixtures, with a test office, a public question, an original answer, and controlled accounts for the admin, editor, responder and visitor.
3. Bind the Vercel preview to the same staging Supabase project for all three database settings in the table below. Verify the exact project reference in the public URL and confirm both keys came from that project. Keep server secrets out of build output and browser-visible configuration.
4. Verify the protected preview hostname, set its base URL, and allow exactly its auth callback on the staging Supabase project. Test with approved controlled email recipients or a mail-capture setup. Keep application email and scheduled sends disabled for the first pass. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) [Vercel preview variables](https://vercel.com/docs/environment-variables#preview-environment-variables)

| Setting | Staging source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | The staging project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The staging project's public browser key |
| `SUPABASE_SERVICE_ROLE_KEY` | The staging project's server key, stored as a sensitive Vercel variable |
| `NEXT_PUBLIC_SITE_URL` | The exact protected preview HTTPS origin used for the test |
| `RESEND_API_KEY`, sender and alert settings | Leave production email settings absent from this project. When delivery testing is authorized, use a staging sender and controlled inboxes. |
| Turnstile keys | For initial correction acceptance, use a synthetic pre-existing question. Set up dedicated preview keys only for separate question-submission acceptance. |

## Acceptance evidence

- Record the release commit or source checksum, preview deployment, staging project reference, and applied migration versions. Keep keys and tokens out of evidence.
- Open the protected preview and sign in with a controlled account. Verify redirect, dashboard session and sign-out on that hostname.
- Confirm a responder can save a draft and the authorized publishing role can publish and append a dated correction. View the profile signed out of WhyTho and verify the original answer, correction and publication dates. Compare the three sort modes.
- Confirm office email preference starts off, saves daily when selected, and can be turned off. Inspect the no-delivery result and any provider logs without contacting a real office.
- Record the browser, app, PostgREST and database outcomes. Hosted mail delivery and real office verification remain separate checks that require approved recipients.

This setup is prepared for execution. No staging resources or provider settings were changed while documenting it.
