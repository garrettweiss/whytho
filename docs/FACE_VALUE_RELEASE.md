# Face Value release

Authorized by Garrett on 30 October 2026: finish the remaining work until the real site is live with the redesign.

## Release candidate

The release replaces the public and authenticated site presentation with the approved Face Value design. The homepage and directories use politician portraits, name/state/office search and incremental scrolling. Profiles, questions, sign-in, account, verification, dashboard, elections and support pages share the responsive visual system.

The release also repairs verified-publication rules, private draft and media access, direct vote permissions, verification resumption, safe return URLs, answer share targets and accidental sign-out prefetch. Self-claimed profiles prepare private drafts; public official responses require completed identity verification. Media uploads support five files of up to 4 MiB each, with links recommended for larger media.

## Review and validation

- Two independent engineering/security and content/accessibility reviews cleared the implemented release scope after fixes.
- 72 application tests pass, including 20 offline integrations using real handlers and server pages.
- Production build, TypeScript and lint pass. Existing team-manager/legacy search lint warnings and Sentry migration notices remain.
- 25 read-only HTTP checks pass against the local production build. See FACE_VALUE_RELEASE_LOCAL_CHECKS.json.
- Earlier visual checks cover 12 pages at 320, 390, 768, 1024 and 1440 pixels, without horizontal overflow. See FACE_VALUE_LAYOUT_CHECKS.json.
- PostgreSQL fixture tests cover role visibility, current-week votes/tallies, verification confidentiality, atomic media registration and official publication. Repeat application, emergency rollback and forward reapplication are tested.

## Database rollout

Migration `20261031041730_release_rls_hardening` was applied successfully through Supabase to the WhyTho project on 31 October 2026 UTC. All 18 read-only production postapply checks pass, every public table retains RLS, and an anonymous query sees zero drafts. See FACE_VALUE_DATABASE_CHECKS.json.

No civic records, existing storage objects or files were deleted. The new answer-media bucket is private. The live aggregate contained zero published human official responses before the new verification boundary, so no existing public response was removed or relabeled.

## Hosting and rollback

The production domain is https://whytho.us. Release through the connected GitHub repository and Vercel integration after green CI and preview build. The pre-release production revision is `3ecdc135f970c7f582b79874b0719f1215afd31d`; its deployment is https://whytho-ktga6umk2-garrettweiss-projects.vercel.app.

Prefer reverting the application release while retaining database safeguards if application rollback is needed. The SQL rollback is an emergency diagnostic artifact; it reopens legacy vulnerabilities and must not run automatically. Private storage is retained. No rollback or restart of the production database was needed.

## Scope of verification

Offline integrations exercise signed-in role behavior without contacting OAuth, email or identity providers. Release checks make no production questions, votes, claims, messages or attachments. Actual provider delivery and a full assistive-technology audit are not asserted by these checks. Duplicate, missing and outdated civic source records remain a separate data-maintenance task. The security report records remaining limitations without representing this release as a complete penetration test.

Production deployment identifiers and live checks will be recorded after Vercel reports readiness.
