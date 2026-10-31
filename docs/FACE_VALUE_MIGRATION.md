# WhyTho: Face Value migration

Reviewed implementation plan and build record, 30 October 2026. Garrett subsequently authorized completing the release to the live site. The release addendum below supersedes the earlier local-only rollout boundary.

## Product and visual goal

Make the first action finding a politician and asking or supporting a question. Adopt mockup 01, The Direct Hybrid: dark charcoal, white condensed sans-serif headlines, large grayscale portraits, square edges, thin rules, restrained response colors. Search and the first politicians must appear early on mobile. Preserve permanent profile URLs, authentication, questions, votes, verification and existing data.

## Delivery sequence

1. Build a real homepage and public directory with a responsive header, unified search, portrait cards and incremental loading. Link to working politician profiles and existing account/verification flows. This is the first implementation slice.
2. Carry the visual system through politician profiles, question lists, answer treatments and participation history. Preserve official versus AI distinctions, vote rollback behavior, moderation and verification labels. Audit the existing conflicting participation definitions before changing any response-rate UI.
3. Apply the public shell to state directories, leaderboard and elections. Then adapt sign-in, account, verification and politician dashboard for continuity without changing their security or workflow contracts.
4. Review the complete journey and staging performance before any production rollout. Keep rollout separate from this local build; no deployment, merge or database mutation is needed for the first slice.

## First-slice contracts

- Homepage stays cookieless and cacheable using createPublicClient and a cached data layer. Authentication remains client-side. Do not ship the entire politician index or issue one query per card.
- Public directory endpoint returns a bounded batch of public fields, excludes inactive/test profiles and validates every input. Stable cursor pagination with an explicit end state; request cancellation, deduplication, retry and a manual Load more alternative.
- Search accepts a person, state or office. Normalize full state names and codes. Treat US Senate, US House, state senate and state house as distinct filters. Show explicit choices when "senate" is ambiguous. Support composed state + office queries and common aliases such as AOC. Keep applied filters visible and removable. Empty and error states must be distinct.
- Use database records, never the mockup's fictional response counts. Weekly snapshots currently join all answer types and do not establish an official response. Audit source rows before showing response colors. Only published, non-AI direct or team responses count as a politician response. Do not call a question "skipped" without an actual deadline/decline rule. Incomplete records are neutral, never red by default. Label the reporting period and explain the metric.
- Initial presentation: four portrait columns on desktop, three at small desktop, two on tablets and phones, with compact mobile typography. Mobile menu, full-width search and wrapping controls; no horizontal overflow at 320px. Images reserve space, lazy-load below the fold, have fallbacks and do not cause shifts.
- Whole cards are normal links and navigate on the first tap. Hover/focus can reveal color; touch cannot depend on hover. Persistent text communicates response state. No animations that move content or delay interaction. Use short color transitions and honor reduced motion.
- Semantic form and headings, visible keyboard focus, labeled input, accessible navigation disclosure, polite result announcements, meaningful image alternatives, contrast checks and 44px touch controls. Infinite loading must not trap access to footer/navigation.
- Scope new styling to the new public surface initially. Existing authenticated pages must remain readable. Preserve account navigation and claim-profile access.

## Acceptance checks

- Pure logic: state/office disambiguation, aliases, malformed filters/cursors, answer classification, absent data, duplicate pages and end-of-list behavior.
- Public API: bounded anonymous reads only, no drafts/AI counted as official, safe filter construction, no private fields or privileged credentials, generic errors, cache headers, no unbounded scans or N+1 calls.
- Browser: 320, 390, 768, 1024 and 1440px; keyboard form/menu/cards; touch first-tap navigation; loading/failure/empty states; repeated loads without duplicates; filtered pagination; back navigation and search state; images failing; reduced motion.
- Real flows: homepage to politician to question, sign-in and claim routes; no write actions against live data during verification.
- Clean local-disk install, type check, focused logic tests, production build where environment permits. Record any pre-existing failure separately.

## Review log

Three independent agents reviewed the plan and first implementation through six builder personas. Their findings changed the build:

| Persona | Finding | Resolution in first slice |
| --- | --- | --- |
| Product designer | Tiny mobile metadata and an undefined first-fold target | Minimum 12px metadata; natural names; search and first portraits visible at 390 x 844; single column below 360px |
| Motion designer | Tap-to-preview breaks navigation; page appends and Back can lose place | Real links on first tap; separate color toggle; short pointer-gated color transitions; reduced-motion override; save batches and scroll per history entry |
| Engineering lead | Whole-index search silently stops at 1,000; snapshots include unsuitable answer types | New 24-person keyset pages, embedded aggregate counts, cached anonymous data, reporting-week-bound cursors |
| Security engineer | Baseline answer RLS exposes drafts; arbitrary filter grammar and unbounded inputs | Endpoint explicitly filters drafts/AI, returns no answer content, escapes grammar, validates fields/cursors, aborts queries and rate-limits requests |
| Content designer | Green can imply full participation; answer week is question cohort; state names can be person names | Factual existence label, explicit question date range, neutral nonresponse, preserve Virginia Foxx and Al Green, state/name alternative |
| Accessibility specialist | Combobox semantics incomplete; live append traps footer; office choices silent | Ordinary form and labeled buttons, announced and focused choices, automatic-loading toggle above grid, manual loading/focus continuation, Escape disclosure and visible focus |

Second-pass reviews found a Back-navigation request race, 100/120-character mismatch, ambiguous offices inheriting the wrong filter, and footer anchors triggering appends. These were corrected before browser acceptance.

## Scope and release gates

The first slice changed the real homepage and its navigation. The second slice now carries the design through politician profiles, questions, answers and asking. The third and fourth slices now cover directories, elections, leaderboard, authenticated surfaces, informational pages, settings and errors. All work remains local.

Red/skipped remains deferred because no tracked decline or deadline rule exists. Green is supported only by published, non-AI direct/team responses attached to active questions in the displayed week. Counts are response records, not distinct answered questions, and no percentage is inferred. Zero questions and zero official replies remain neutral.

Before production rollout, audit the currently broad answers SELECT policy and inconsistent participation calculations in a separate security/data change. The new endpoint does not expose draft bodies, but it cannot fix the pre-existing direct table access policy. Do not advertise the whole platform as hardened because this endpoint is safe.

## Validation record

- Clean local-disk production build passed, including TypeScript and lint. Homepage is static with five-minute revalidation. Existing unrelated warnings remain in team-manager and legacy search-bar, plus Sentry configuration deprecations.
- Eight focused tests passed: name/state/office parsing, aliases, validation, safe cursor grammar, reporting-week consistency, fail-closed counts and stable portrait ordering.
- Thirteen read-only HTTP checks passed: batch bounds, public field whitelist, counts/cache headers, unique continuation, combined filters, aliases, empty results, invalid inputs and literal treatment of filter punctuation. Evidence: FACE_VALUE_HTTP_CHECKS.json.
- Browser checks at 320, 390, 768, 1024 and 1440px found no horizontal overflow. At 390 x 844, search ends around314px and the first portraits start around569px.
- Browser interaction checks passed: office ambiguity announcements and focus, mobile disclosure Escape/focus return, 24-to-48 manual append, 48-to-72 automatic append with unique IDs, 40 California state-senate results and end state, empty search, Back restoring 48 loaded cards, immediate Back during an in-flight search, and real profile navigation to Tony Strickland and back. Sign-in page still opens; no credentials submitted.
- Browser testing exposed content-visibility scroll shifts. Removed that optimization while retaining lazy images and reserved image space. Portraits with actual photo URLs lead each batch, while cursors retain database ordering. This does not omit profiles or reorder earlier batches.
- Final browser checks confirmed API-error recovery through Clear filters and hash-only navigation preserving all 48 loaded records. How it works pauses automatic appends. Desktop portrait height is capped to keep names nearer the first fold.
- Reduced-motion handling is implemented and code-reviewed; OS preference emulation, a full screen-reader audit and signed-in mutation workflows were not exercised in this local pass.
- No database writes, migrations, deployments or production merges were performed.

## Data follow-ups found during verification

The public database includes duplicate identities under different IDs (including Alexandria Ocasio-Cortez), missing portraits and inconsistent candidate type defaults. Candidate labels use is_candidate plus the incumbent flag, rather than the unreliable politician_type field. Deduplication is a separate reviewed data task; this build never deletes or silently merges records.

## Local preview and next implementation slice

Production preview: http://127.0.0.1:8771/ from the attached local-disk checkout, branch feature/s11-face-value-home. Run npm run start -- --hostname 127.0.0.1 --port 8771 from that checkout after npm run build if the local server has stopped.

Next: run isolated signed-in staging checks for account updates, verification, role-specific answer drafts/publication, media uploads and team management. Address the direct-table RLS release gates before production deployment. Public and authenticated visual migrations are built; no rollout has occurred.


## Second slice: politician profiles, questions and responses

Built 30 October 2026 after Garrett asked to continue. The profile uses the selected charcoal, sans-serif, portrait-led design with a compact mobile identity row, factual response record, ordinary period links, archived weeks and an Ask action that focuses the form or sign-in link. The same public header preserves politician-dashboard access and the citizen/politician view toggle. Question and answer components opt into the new appearance so authenticated dashboard callers keep their existing layout. The loading screen uses the same visual system without pulsing motion.

### Data and interaction corrections

- The previous profile percentage could include AI analysis and drafts. The replacement read layer selects explicit public fields, excludes drafts in the database and again during mapping, and counts only published non-AI direct/team answers as official. User identifiers do not enter the public question payload. Unsafe source/media protocols and closing-script JSON-LD payloads are rejected or escaped.
- Response totals count distinct active questions, including those below the participation threshold. The separate percentage uses questions with at least ten net votes as its denominator. No qualifying questions means no rate, not zero percent. Exact aggregates cover the entire question cohort regardless of the 50-question weekly or 200-question aggregate display cap.
- Periods are explicitly this week, past 28 days, past 365 days and all time. Historical links use validated ISO weeks. Snapshot rows provide archive links only, not the old mixed participation percentages. Read failures throw rather than claim zero activity or a nonexistent politician.
- Previously saved votes now hydrate through bounded client-side reads for the current identity and visible current-week questions. A versioned successful save wins over a hydration read started earlier. Loading/error states pause voting and allow retry. A stable keyed list preserves control focus and local state when a question crosses the ten-vote boundary.
- The application vote endpoint now verifies the actual current week and active question before adding, changing or removing a vote. This does not change the underlying database policy. Existing anonymous voting, rate limit, notifications and Turnstile workflow remain in place.
- Keyboard fixes include Escape and focus restoration for report/navigation disclosures, an accessible native image dialog, Ask focus, and submission-success/reset focus. Uncertain network responses no longer claim a write definitely failed.

### Specialist review and verification

Designer, motion, content, accessibility, engineering and security perspectives were covered by three independent specialist agents. Their findings drove compact mobile ordering, truthful period labels and counts, preserved team-account controls, modal focus behavior and the vote fixes above. Code review found no remaining blocker in the implemented scope after those corrections. This is not a claim that the full platform is issue-free.

- Twenty-four focused tests passed across directory search/cursors, profile counts and public-data safety, answer classification, vote eligibility and hydration reconciliation.
- Six read-only HTTP smoke checks passed for current, all-time, rolling, archived, invalid-week and missing-profile states, with no submitted_by/published_by keys in rendered payloads. Evidence: FACE_VALUE_PROFILE_HTTP_CHECKS.json. The streamed missing-profile response uses HTTP200 with the existing not-found UI, so this check asserts the body rather than claiming a404 status.
- Production build, TypeScript and lint completed successfully. The only lint warnings remain the existing team-manager dependency and legacy search combobox attributes; Sentry configuration deprecation warnings remain.
- Browser widths 320, 390, 768, 1024 and 1440 pixels showed no horizontal overflow. Verified long-name wrapping, compact portrait, question-list-before-form order on mobile and portrait color toggle.
- Verified homepage AOC search to the real profile, current/28-day/all-time records, archived week 202612 with three existing questions and all six vote controls disabled, current-week empty state, navigation/report Escape focus return, Ask focus and the sign-in return URL. No credentials were submitted.
- Live data contained no published non-AI official responses available for a positive green-state check. Positive/AI/draft classification is covered by pure fixtures; interactive signed-in writes, image-dialog behavior with real answer media, screen-reader behavior and 200% text zoom still need isolated staging verification.
- No live questions, votes, reports, database records or migrations were created or changed. No deployment or merge was performed.

### Remaining release and data work

The broad answers SELECT policy and direct vote-write policies still need a separately reviewed database hardening migration. Application filtering and API week checks do not secure direct Supabase access. Existing generated questions also include factual inconsistencies (the historical AOC fixture references a different district); content correction is a separate reviewed data task. No source records were edited or removed.


## Third and fourth slices: remaining site surfaces

Built locally on 30 October 2026 after Garrett asked to continue. The selected Face Value style now extends through regional and state directories, U.S. officials, elections, leaderboard, sign-in, account history and profile, politician verification and dashboard, notification settings, informational pages and error states. Internal admin tools retain their existing presentation. The assistant panel now shares the visual system, labels AI assistance, supports Escape/focus return and announces messages/status/errors. No assistant messages were sent during verification.

### Public directories, elections and leaderboard

- State and regional pages reuse the bounded 24-person portrait directory with endless loading, a manual alternative, and route-bound geography. Search, clearing, pagination and Back retain the page scope. Clicking other scope/state links saves loaded batches; state navigation no longer loses them. Footer and methodology interaction pauses automatic loading.
- U.S. officials retains Cabinet, President, Vice President, Congress and governors, including existing chamber URLs. Search recognizes complete executive office titles before shorter names, and distinguishes explicitly state-titled offices. Native filters keep the applied interpretation visible.
- The schema lacks a reliable jurisdiction field for ambiguous titles such as Attorney General. State-only lists therefore positively identify state office titles. Broader regional/all-politician lists retain other records. Washington D.C. uses the regional route and district wording rather than a state-only list. This is a presentation constraint, not a data repair.
- Leaderboard calculations now scan the entire qualifying current-week population in ordered 500-row metadata pages. A separate bounded stream supplies published non-AI direct/team answers. Answers must match the question and politician and are deduplicated by question. Ties use exact ratios and share ranks; display pagination happens after ranking. Incomplete reads/timeouts fail explicitly instead of publishing a partial ranking. The currently empty qualifying cohort was verified anonymously.
- Election state, office and period filters persist together. Race and candidate lists paginate 24 at a time with exact totals, preserve explicitly linked inactive candidates, and distinguish an officeholder record from candidacy. Dates do not imply completed results or winners. Missing races and failed reads remain distinct. The current race table returned no public records; no fixtures were added to the database.

### Authenticated surfaces and contract corrections

- Sign-in and account use the new public shell, responsive square forms, accessible status messages, history tabs and keyboard-compatible location controls. Account reads remain cookie-authenticated, user-scoped and uncached. The displayed histories accurately describe their 50-question/100-vote caps.
- A pre-existing open redirect in the login callback was corrected. Both the sign-in page and callback independently validate local destinations after URL canonicalization, rejecting external/protocol-relative URLs, userinfo tricks, control characters and backslashes. Existing OAuth, email, anonymous upgrade and return-destination flows remain.
- Verification retains its existing government-email and official-site methods, claim authorization, API payloads and prefill authorization boundary. The redesign adds step focus, request cancellation, errors, readable method forms and a mobile layout. No claims, codes, identity submissions or email actions were performed.
- Dashboard auth, team roles and all seven existing dashboard mutation handlers remain. Its summary removes the old mixed participation percentage, labels exact active-question/published-official-response counts, and states the inbox display limit. Private drafts remain restricted to the appropriate team roles. Read failures do not turn into false zero counts.
- The answer composer was reading data.answer.id although the API returns answer_id and is_draft. It also forced direct answers even for responder roles. The client now reads the real response contract and lets the server apply existing role defaults. Media uploads use the confirmed answer ID. Drafts show review status, and sharing appears only when the API explicitly confirms publication. An unknown success shape or ambiguous network failure requires checking the saved record before another submission.
- Notification preferences preserve their existing update endpoint. Load errors no longer fabricate default enabled settings. The sign-in link now returns to the actual /sign-in route with the settings destination preserved.
- About, FAQ and How it works now describe the implemented official-response model without unsupported coverage totals, historical immutability claims, unimplemented verification methods or inferred refusal. Error and not-found screens use the same layout.

### Final specialist review and evidence

Engineering/security, UI design, content/accessibility and motion considerations were reviewed through the existing specialist agents. Reviews caught scope leakage, exact office-title search, lost Back history, D.C. treatment, auth return-path validation, draft/publication contract mismatches, false chatbot route context and missing live announcements. These findings were addressed in source before the final build.

- Production build passed from the local-disk worktree, including TypeScript and lint. Existing team-manager hook-dependency and legacy search-bar combobox warnings remain, along with Sentry deprecation/configuration notices.
- All 49 focused tests passed across directory parsing/scopes/cursors, public profile counts and safety, voting eligibility, answer classification, complete leaderboard ranking, election dates/counts/filters, safe auth redirects and answer publication contracts.
- All 24 read-only HTTP checks passed. They cover scoped pagination, cross-scope cursor rejection, exact office search, legacy federal URLs, truthful leaderboard/election emptiness, D.C. redirect, account/dashboard auth guards, safe sign-in destinations, support-page shells and missing profiles. Evidence: FACE_VALUE_PUBLIC_HTTP_CHECKS.json.
- Browser checks covered 12 public/signed-out pages at 320, 390, 768, 1024 and 1440 pixels, with no horizontal overflow. Evidence: FACE_VALUE_LAYOUT_CHECKS.json. Loading states were allowed to resolve before final page measurements.
- Interaction checks passed for regional 24-to-48 loading with unique IDs, Back retaining 48 loaded cards after switching to state-only, rejecting searches for a different state, Clear recovery, state-senate filtering, exact Cabinet title search, election state/office preservation on period changes, account/dashboard sign-in destinations and notification auth guidance. Assistant focus, Escape return and a 320px dialog fit were checked without submitting a message.
- Desktop and mobile directory screenshots are saved in the attached visualization workspace. The preview remains http://127.0.0.1:8771/.

### Remaining validation and release boundaries

Authenticated account contents, team changes, answer publication/drafts/uploads, actual email/OAuth sign-in and identity verification were not exercised with a signed-in browser session. Positive race/leaderboard views lack real public fixtures and were checked through code and pure data fixtures rather than live populated screens. Full screen-reader, OS reduced-motion and text-zoom audits remain. The public database still has duplicate/missing/outdated civic records; no records were edited, deleted or merged.

At the end of the local build, the pre-existing broad answers SELECT and direct vote-write RLS policies remained production release gates. No production deployment, merge, database write/migration, external communication or live civic submission had been performed. Sam recorded the build and decisions; Sage captured reusable auth, write-confirmation and scoped-directory patterns.

## Release addendum: authorized production rollout

Garrett asked to finish the work until the real site is live. The final release includes the chosen responsive design across public and authenticated surfaces, continuous directory loading, and name/state/office search. The release review also closed concrete trust and workflow issues found while testing:

- Sign-out uses a deliberate full navigation so menu prefetch cannot log someone out.
- Existing claims can resume verification with completed methods. Codes and private verification metadata never enter the page payload.
- Self-claimed profiles can prepare private drafts. Public human responses require verification tier 2 or 3. Responders can edit only their own pending drafts; an approval that happens during editing prevents that edit from changing the published answer.
- Draft answer/media reads require current authorized membership. Verification completion and OTP access are server-owned. Direct client vote writes enforce question status, current week and immutable identity, and the tally trigger safely updates another citizen's question.
- Answer media uses a new private bucket. The application checks visibility before issuing a 60-second signed redirect with private/no-store headers. A service-only atomic registration function locks the answer and membership, enforces ownership and verification, and prevents a late responder attachment after approval. Approvers can preview attachments. Stable media links survive the public data mapper, and shared answer URLs have matching anchors.
- Uploads allow five files of up to 4 MiB each. Larger media should use links. This leaves multipart overhead below Vercel's [4.5 MB function payload limit](https://vercel.com/docs/functions/limitations).

The final application suite has 72 passing tests, including 20 offline integration cases that execute actual handlers and server pages against isolated auth/database/storage boundaries. Production build, TypeScript and lint pass. Existing unrelated lint/Sentry warnings remain. The earlier 60 responsive-layout checks remain applicable to the visual design.

Two independent engineering/security and content/accessibility reviews cleared the implemented scope after fixes. This is not an assertion that every possible platform issue has been eliminated. Live OAuth/email delivery, real identity submissions, and civic writes are deliberately excluded from release verification; no messages or test civic records were sent to production. Database safeguards are exercised in an isolated PostgreSQL fixture and verified through read-only production checks. Release execution details are recorded separately in FACE_VALUE_RELEASE.md.
