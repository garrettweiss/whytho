# WhyTho launch action tracker

## Promotion checklist

November 23, 2026. The current release is live. Start with the asking flow, then work through the remaining gates in order. Use the organic plan for the first pilot. [Production release](ANSWER_HISTORY_PRODUCTION_RELEASE_20261123.md) [Organic campaign](SOCIAL_MARKETING_PLAN.md)

- [x] **1. Verify that a visitor can ask a question.** On November 23, Garrett signed in, returned to the asking form, completed security verification and submitted a question. WhyTho displayed a success message, and the question was visible on the public profile without an account session. At 390 px in Chrome, the form fit without horizontal overflow, and pressing Enter on **Ask a question** moved focus to the text field. [Public question](https://whytho.us/alexandria-ocasio-cortez-new-york?sort=newest#question-0c52ecd3-abd0-451d-851a-cc4c2a798017)
- [x] **2. Verify the simulated office response flow.** The **Billy Richardson** staging profile passed 23 checks using synthetic accounts and a simulated office verification tier. The app supported sign-in, claim and resume, team roles, publishing, and a dated correction that preserved the original. Draft privacy and permission boundaries passed. Real government verification remains untested. Recheck the outstanding Congress profile gaps before featuring a real official. [Test results](../../diagnostics/staging-acceptance-20261123/billy-richardson/results.json) [Congress roster](CONGRESS_ROSTER_RECONCILIATION_20261122.md)
- [x] **3. Publish the rules and confirm who handles problems.** The terms, privacy notice, reporting page, 18+ assent, registered private voting, and reversible content restrictions went live November 23. Garrett owns reports. He confirmed phone alerts work and Quinn can receive and act on urgent reports with her own authorized access when he is unavailable. Attorney review remains a deferred risk. [Legal risks](LEGAL_RISK_REGISTER.md) [Recorded decisions](DECISIONS_2026-11-02.md) [Step 3 verification and release status](STEP_3_RELEASE_20261123.md) [Reporting operations](legal/STEP_3_OPERATIONS.md)
- [x] **4. Clear the assets for the first promotion batch.** Four official source portraits and four housing questions were reviewed. The first organic posts link to the homepage and use plain text. Four individual profile links work, and their older image previews remain out of the first batch. Live profile portrait replacement and broader coverage remain open. [Repeatable checks and first batch](PILOT_PHOTO_AND_QUESTION_PREPARATION.md) [Reviewed questions](QUESTION_SUGGESTIONS_FIRST_REVIEW_20261122.md)
- [x] **5. Prepare and approve the first organic posts.** Three exact posts, proposed dates, a live mobile check, a tested measurement query and pause criteria are in the pilot packet. Garrett approved the exact posts for November 30, December 2 and December 4 at 10 a.m. local time. [Pilot packet](PROMOTION_PILOT_GO_LIVE.md) [Campaign plan](SOCIAL_MARKETING_PLAN.md)
- [ ] **6. Run a small pilot before expanding promotion.** The [first post](https://x.com/WhyTho_official/status/2124953263078334794) is live as of November 23. First-week review is November 30. The December 2 and 4 follow-up drafts are in the [pilot packet](PROMOTION_PILOT_GO_LIVE.md), with scheduling unverified. Check that visitors reach the form, submit questions and return to read responses. Review reports and errors after the first week, then decide whether to expand.
- [ ] **Separate gate before turning on new-question emails.** Confirm how the existing vote-threshold alerts are configured, then finish new-question delivery, retries and unsubscribe. Run the no-send trial and get approval for the first recipient list and messages before activation. [Notification plan](POLITICIAN_NOTIFICATIONS_PLAN.md)

## November 23 production update

[Answer corrections and office email preferences shipped](ANSWER_HISTORY_PRODUCTION_RELEASE_20261123.md). The release retained the existing question sort options and the live identity repair. Automated sending and public marketing are separate launch items.

## November 22 execution update

Use the [current readiness checkpoint](LAUNCH_READINESS.md) for the latest verified progress. The [release candidate](INTEGRATED_RELEASE_CANDIDATE_20261122.md) records the pending database and application changes for sorting, answer history, and notification preferences. The [first question drafts](QUESTION_SUGGESTIONS_FIRST_REVIEW_20261122.md) are ready for editorial review. The workbook's earlier counts and production checkpoint below describe its November 1 baseline.

The [Congress roster reconciliation](CONGRESS_ROSTER_RECONCILIATION_20261122.md) records the checks for all 539 current members, the four candidate profiles to update, the three federal profiles to create, and the territory and handoff scenarios for account testing.

The [isolated preview setup](ISOLATED_PREVIEW_SETUP.md) lists the staging database, Vercel protection, sign-in settings and checks required to exercise release flows with test accounts.

Prepared November 1, 2026. Production evidence remains the October 31 release checkpoint.

Decision update November 2: Garrett's responses are recorded in the workbook and [the decision record](DECISIONS_2026-11-02.md). The test scope is now all currently serving Congress members, including delegates and the resident commissioner. Missing factual details and later execution packages remain visible; accepted recommendations are not marked as implemented. D12 remains open pending the retention clarification. This update supersedes the earlier 20-official test scope in linked plans.

T01 now distinguishes Garrett's November 1 confirmation that question verification worked from the broader regression/provider acceptance still to document. It is in Review, not listed as an unaddressed live failure. Production technical evidence otherwise remains the October 31 release checkpoint.

[Open the editable tracker](</Users/garrettweiss/Library/Mobile Documents/com~apple~CloudDocs/Projects/WhyTho/outputs/whytho-launch-tracker-20261101/WhyTho-launch-tracker.xlsx>)

The workbook contains 39 open actions, four completed deliverables, 12 Garrett decisions and ten AI routing briefs. All seven requested workstreams and all 22 legal risk IDs are represented. AI assignments describe ownership for future execution; they are not evidence of active background jobs or retained human counsel.

1. Start in **Your decisions**. Column E now gives a recommended decision, the facts to enter and whether to decide now or wait for a concrete package. Recommendations were added November 1 without changing Garrett's answers or confirmation fields. Enter your own answer in F and confirm it in G. Later maintenance and outreach approvals require the concrete package described in that row.
2. Filter **Actions** by priority or AI lead. The question-submission and verification tasks appear first. Scroll right for exact steps, acceptance evidence, human inputs and source documents.
3. Use **AI assignments** to hand a specific task ID to the appropriate lead. Preparatory work may start while a final completion prerequisite is still open.
4. Add actual completion evidence and set the work status to Done. The calculated prerequisite column checks all recorded dependencies and their decision inputs. A completion claim without evidence is flagged.

Due dates are deliberately unassigned. Source references and working notes are included inside each sortable table so they remain with the task ID when sorting. The workbook is the editable tracker; the accompanying JSON is its initial build snapshot, not a second live source of truth. Do not rerun the builder over user edits. Future updates must read the existing workbook and preserve responses, status, dates and evidence.

This tracker does not authorize new production changes, public posts, messages, registrations or deletions. Those actions follow the existing session approval rules when their concrete implementation is ready. No deployment or external communication was performed while preparing it.
