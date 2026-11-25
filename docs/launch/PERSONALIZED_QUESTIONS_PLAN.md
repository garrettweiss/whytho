# Personalized, legitimate questions for every visitor

November 19 decision update: Apply the decisions in DECISIONS_2026-11-02.md before implementing this historical plan. Suggestions have no visible AI-origin label, retain internal provenance, and require user-chosen submission. Preferences are optional state/district and topics; do not require exact address or political affiliation. Posting requires a verified account with a permitted display name and private email. No constituent verification/badge at launch. Default sort is Most votes (upvotes minus downvotes), with Newest and Most votes unanswered options. One active up/down vote per account per question, switchable/removable, with private voter identities. Published official answers form a permanent public archive; preserve original answered-question wording and attach dated clarifications. Garrett reviews the initial suggested-question batch. Earlier conflicting labeling or participation recommendations below are superseded.

Date: October 30, 2026. Owner: WT and editorial operations. This is the implementation and operating plan requested for launch. Personalization means relevance to a person's voluntarily selected place and topics, not political persuasion or inferred ideology. Coverage includes signed-out visitors, new accounts, returning users and politician/staff accounts.

## November 22 implementation checkpoint

The signed-in profile question form now has six optional topic starters. Selecting one fills an empty draft that the person can edit and submit through the existing controls. The regression test covers draft protection and explicit submission. All 148 tests, TypeScript, and focused lint passed in an isolated workspace. Production deployment is pending.

The [first editorial batch](QUESTION_SUGGESTIONS_FIRST_REVIEW_20261122.md) contains four draft examples tied to federal roll calls. The source-backed suggestion feed, optional saved preferences, and directory-wide coverage still need implementation and acceptance testing.

## Outcome and current gap

Every visitor should be able to find the appropriate official and either support an existing real question or edit a suggested question. Never invent constituents, votes, conversations, questions already asked by a real person, or evidence of misconduct.

The existing generator knows a politician's name, office, party and short biography. It does not retrieve votes/statements or retain a source record for each question. The legacy bulk script also prescribes conservative/progressive questions without evidence. Launch changes pause those publication paths until reviewed evidence is provided. This prevents adding unsupported factual premises; it does not audit the existing question archive.

The live directory has 11,513 active rows, including candidates and a test profile. Treat this as a record count, not a count of verified current officeholders. Resolve active candidacy and office freshness separately before promoting a race.

## Visitor experience

| Persona | Relevant default | Missing-information fallback | Trust boundary |
|---|---|---|---|
| First visit, signed out | Choose a state and a topic; optionally search an official | National officials and an office-neutral question starter | No location inferred from IP or browsing history |
| New account | Offer the same optional state/topic controls after sign-in | Skip remains a complete experience | No requirement to provide affiliation, birthdate or exact address |
| Returning constituent | Explicitly saved state/topics, followed officials and own questions | Reset/clear preferences, restore general feed | Never rank by inferred ideology or vulnerability |
| District unknown | Statewide offices and a clear district-selection prompt | Let user choose their district or official directly | State alone cannot identify a House or state-legislative district |
| Out-of-state researcher | Manual official/state switch | General search | Do not label the person a constituent |
| Politician/staff | Their actual question inbox, response queue and question provenance | Browse public questions as a separate action | Suggested questions never become fabricated constituent messages |
| Low-data/local profile | General policy/service questions within that office's remit | Say there is not enough reviewed record for a specific premise | An empty evidence set never invokes a fact-generating model |

Show 6 to 10 items, with three sections: “Questions people asked,” “Suggested questions,” and “Your questions.” Each suggested item offers “Why this is relevant,” supporting source/date when factual, and “Edit and ask.” No automatic posting on the user's behalf. Submission remains their explicit action and uses the existing auth, bot and rate controls.

## Evidence and editorial model

A suggestion stores its stable ID, politician ID, jurisdiction and office, topic, body, evidence IDs, generation and editor version, generation and review times, freshness expiry, review status, and internal provenance. Each evidence record stores the exact source URL, title, publication and retrieval dates, supporting excerpt, official identifier, content hash, retrieval outcome, and reviewer identity. Keep excerpts proportionate to source permissions.

1. Resolve the official by stable ID (bioguide/OpenStates/FEC as applicable), office, jurisdiction and effective dates. FEC filing is not proof of ballot qualification or current incumbency.
2. Retrieve primary material: congressional vote/bill/committee records, state legislative records, the official agency's published service/budget documents, and official statements. Store retrieval evidence. A model-supplied URL is not retrieval.
3. Extract factual premises with references to exact evidence spans. Validate date, entity, office authority and whether the quoted record supports the premise.
4. Generate neutral questions using only supplied excerpts. Treat excerpts as untrusted data, not instructions. “Insufficient record” is a normal result.
5. Deterministic checks: 20 to 500 characters, one clear request, valid jurisdiction, no personal contact details, no unsupported accusation, no duplicate evidence ID, no future/impossible dates, no invented citation.
6. Editorial review before first publication for every new politician and every premise involving crime, corruption, personal misconduct or disputed facts. Review all initial pilot suggestions. Reduce routine review only after a documented precision study; never waive allegation review.
7. Store approved suggestions separately from real user submissions. Before a user posts, show close existing questions and an option to upvote instead. A failed duplicate service queues review rather than silently allowing a bulk publisher to continue.
8. If a user edits and submits a suggestion, record assisted origin and user action while keeping the public author truthful. A copied suggestion is not evidence the person is a local resident.

The current `ReviewedEvidence` guard is a local safety control. A caller-supplied `reviewedBy` string is not sufficient production proof. The eventual worker must load approved evidence from a server-controlled table with restricted writes; it must not accept browser-provided approval flags.

## Ranking and coverage

Hard filters precede ranking: active record, eligible jurisdiction, published review state, not expired, not removed/disputed pending review, and identity evidence valid. Rank remaining items by selected topic match, selected office/location match, factual freshness and explicit user follows. Blend in topic diversity and exposure caps. Never use party affiliation, inferred beliefs, protected traits, or a predicted likelihood of adopting a political view.

Suggested target: 3 to 5 approved evergreen questions and up to 5 timely record-based questions per official in the pilot. Across the whole directory, use evidence-backed coverage, not “15 questions for every record every week.” Broad templated questions can be useful without claiming public-record analysis. Label them “Question starter” and explain they are role-based prompts, not a claim about something the official did.

Weekly jobs refresh evidence and queue changes; they do not erase questions or manufacture engagement. Deduplicate by politician + topic + normalized premise + source event. A bill's status change invalidates a suggestion when its wording becomes false. Default freshness: votes/statements 30 days; office/service records 90 days, with explicit event invalidation. Historical questions retain their date and sources.

Use Monday 00:00 America/New_York as the product boundary. UTC is 04:00 during daylight time and 05:00 during standard time. Do not hard-code 05:00 UTC year-round in the new pipeline. The existing reset convention needs an explicit migration/test before changing historical week assignments.

## Launch-sized rollout

| Stage | Work and owner | Exit evidence |
|---|---|---|
| 1. Inventory, WT | Count source=user/seeded/x separately, identify unsourced seeded allegations, resolve test/stale candidate exposure | Read-only cohort report and human review queue; preserve records |
| 2. Evidence schema, WT | Add RLS-protected evidence/suggestion/review tables, provenance and job keys | Anonymous users cannot write approvals; no service secrets in clients; migration and rollback-to-disabled plan tested |
| 3. Editorial pilot, editorial owner | 20 officials spanning federal/state offices and multiple regions; 5 reviewed items each | 100% identity/source support; balanced office coverage; no fabricated constituent attribution |
| 4. Preference and feed UI, WT | State/topic selection, rationale, clear/reset, assisted origin and duplicate suggestion | New/returning/no-location/mismatched-district/mobile persona tests pass |
| 5. Controlled launch, Garrett + growth | Promote the question flow using approved neutral creatives | Conversion and content-quality report; moderation/on-call capacity adequate |
| 6. Expand, data owner | Roll by evidence-complete cohorts, not blanket AI batches | Each cohort meets source/rights/freshness gates; failed jobs never show as complete |

## Ready-to-use neutral starters

These are templates, not statements about an actual vote or locality. Replace bracketed values only after the user selects them and the official's remit is verified.

- Housing: “Which housing-cost measures within your office's authority will you prioritize, and how will residents track progress?”
- Transportation: “What is your process for prioritizing transportation projects in [jurisdiction], and where can residents review the criteria?”
- Public services: “How can residents track a request for help from your office, and what response time should they expect?”
- Budget: “Which outcomes will you use to evaluate [published program], and when will the results be available?”
- Legislation: “The official record lists your [verified action] on [bill/date]. What was your reasoning, and what outcome do you expect?”
- Transparency: “Where can residents find your public meeting schedule and submit a question in advance?”
- Health policy: “Which health-care access priorities fall within your office's responsibilities, and what action do you plan to take?”
- Emergency readiness: “How does your office help residents find reliable emergency-preparedness information for [jurisdiction]?”
- Education: “How will you assess whether [documented education program] is meeting its stated goals?”
- Follow-up: “What has changed since your [dated public commitment], and when should residents expect the next update?”

No template asserts crime, motives, a vote, local facility problems or consensus without supporting evidence.

## Acceptance and measurement

The proposed launch rubric calls for 100% correct identity, supported factual premises, correct jurisdiction, internal provenance, and protection of private information. At least 90% should be useful and answerable, and at least 90% should be distinct from an existing question. Measure those rates during the pilot.

Automated cases: no sources, wrong person, same-name officials, withdrawn candidate, state-only geography, expired record, model citation not supplied, prompt injection in evidence, malformed date, unsupported accusation, duplicate retry, timezone/DST, zero-topic user, preferences reset, no-party ranking, and no suggestion counted as real activity. Adversarial content tests need a human rubric because a string rule cannot establish truth.

Funnel: directory visit -> official selected -> question form opened -> valid question submitted -> legitimate upvote or official response. Track aggregate first-party counts; browser PostHog is paused pending consent. Don't send question text, affiliation, exact address or politician-interest histories to ad platforms. Report organic questions and approved suggestions separately. Count response success only from published non-AI official responses.

Do not choose a new model based on price or this plan. The existing project model defaults remain candidates for an accuracy benchmark. Before production generation, Max should compare models on the frozen 100-item reviewed set, including refusal accuracy and unsupported-premise rate, then report cost per approved question. No paid model calls were made for this plan.

## Primary implementation references

- Congress.gov provides official API data and usage guidance: https://github.com/LibraryOfCongress/api.congress.gov
- Open States documents people and legislative endpoints: https://docs.openstates.org/api-v3/
- Census geocoder geography lookup can assist address-to-district resolution if a separately reviewed address flow is introduced: https://geocoding.geo.census.gov/geocoder/Geocoding_Services_API.html

Prefer manual jurisdiction choice for launch. Address collection/geocoding adds privacy and redistricting accuracy obligations and is not necessary to provide useful question starters.
