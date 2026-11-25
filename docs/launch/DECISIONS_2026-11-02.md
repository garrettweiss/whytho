# Launch decisions recorded November 2, 2026

## November 19, 2026 decision update: voter privacy

Garrett approved displaying vote totals publicly while keeping voter identities and individual voting choices private. Retain restricted vote records needed to enforce one active vote per account per question and investigate abuse, subject to the private-data retention policy. Enforce privacy at database/API boundaries as well as the UI; a user's access to their own vote remains necessary for switching/removal. Implementation and workbook synchronization remain outstanding; no vote data or production permissions changed by this edit.

## November 19, 2026 decision update: net-vote ranking

Garrett specified "most upvotes minus downvotes" for vote ranking. Both "Most votes" (default) and "Most votes unanswered" sort by net score: upvote count minus downvote count, descending. "Newest" sorts by question publication time. Preserve one active up/down vote per account per question with switching/removal. Implementation, tie-break behavior and workbook synchronization remain outstanding; no production ranking changed by this record edit.

## November 19, 2026 decision update: downvotes allowed

Garrett explicitly chose to allow downvotes. Preserve the fundamental one-active-vote-per-account-per-question rule: an account can hold an upvote or downvote, switch direction, or remove its vote, but cannot hold both. Enforce this server-side. The meaning of "Most votes" (net score versus upvote count) remains to be confirmed separately. Implementation and workbook synchronization remain outstanding; no production voting behavior changed by this edit.

## November 19, 2026 decision update: sort options and fundamental vote rule

Garrett added "Most votes unanswered" to the question sort picker. Required options are "Most votes" (default), "Newest", and "Most votes unanswered". He approved one vote per account per question and called it a fundamental principle. Voting requires sign-in; a user can remove their active vote. Enforce uniqueness and authorization server-side, including concurrent/repeated requests; UI restrictions alone are insufficient. The rule is per account and does not establish that each account represents a unique person. Implementation, acceptance evidence and workbook synchronization remain outstanding; no production behavior changed by this record edit.

## November 19, 2026 decision update: question sorting

Garrett specified questions rank by most votes by default, with a picker to switch to "Newest". Do not infer an unanswered-only restriction from the preceding recommendation; answered/unanswered filtering is separate. This answer establishes sorting, not approval of every other suggestion in the preceding prompt. Implementation and workbook synchronization remain outstanding; no ranking or vote behavior changed by this edit.

## November 19, 2026 decision update: cross-district participation

Garrett approved allowing eligible account holders to ask questions of politicians outside their district. District selection is optional and self-reported. Defer constituent verification for launch; no verified-constituent badge or ranking advantage. Email verification does not establish residency. Do not collect address evidence for this deferred feature. Implementation and workbook synchronization remain outstanding; no participation or ranking behavior changed by this edit.

## November 19, 2026 decision update: account closure and answered questions

Garrett approved preserving answered questions and politicians' responses as the default public record after the asker closes their account, while detaching the former user's public identity where appropriate and handling personal-information requests individually. Detaching identity does not automatically anonymize identifying text within a question; include that in rights-request review. Exact account-closure/private-data handling, applicable exceptions and retention implementation remain to be specified and tested. This is policy direction, not authorization to delete a particular account or record. Workbook synchronization remains outstanding; no production data changed.

## November 19, 2026 decision update: answered-question integrity

Garrett approved preserving the original wording of a question once a politician/authorized office answers. Permit clearly dated clarifications alongside the original rather than silently editing the question and changing the apparent meaning of the answer. Bind answers to the question version actually answered and preserve correction history. Applicable content/rights exceptions remain separately handled. Implementation and workbook synchronization remain outstanding; no question content or permissions changed by this edit.

## November 19, 2026 decision update: public display names

Garrett approved requiring a verified account to post while permitting a public display name and keeping login email private. Account verification here does not imply verified legal identity, residency or constituent status. Preserve the approved participation age boundary and abuse controls. Implementation and workbook synchronization remain outstanding; no account or public identity settings changed in this record edit.

## November 19, 2026 decision update: voluntary personalization

Garrett approved optional state/district and topic preferences for personalized suggestions. Do not require an exact address or political affiliation. Implement usable fallbacks when preferences are absent and allow preferences to be changed. Keep source-backed suggestion quality and internal provenance requirements; preserve the separately recorded no-visible-AI-label decision. Implementation, preference privacy/retention details and workbook synchronization remain outstanding. No preference collection or production change occurred in this record edit.

## November 19, 2026 decision update: suggestion labeling

Garrett clarified that he rejects a visible AI-assisted label on question suggestions, not the suggestions feature. Record no visible AI-origin label on suggestions. Preserve the existing user-controlled edit/submission flow; suggested or generated text alone is not an authentic user submission. Retain internal provenance and source evidence, and do not invent human authorship or engagement. This does not resolve broader privacy/data-use disclosures or authorize misleading factual claims; assess any applicable disclosure requirements against the actual implementation before publication. This supersedes earlier recommendations for a visible suggestion-origin label. No UI, generation, public content or metrics changed by this record edit. Workbook synchronization remains outstanding.

## November 19, 2026 decision update: notification opt-out

Garrett approved optional new-question emails with an unsubscribe link in every notification and the ability to stop those emails at any time. Unsubscribing does not remove the politician's public profile or published-answer archive. This reinforces D10's existing opt-in digest and immediate opt-out direction; record recipient-level consent and suppression and test that opted-out recipients receive no subsequent question notifications. Notification implementation, exact pilot approval and workbook synchronization remain outstanding. No notification sending or new automation was enabled.

## November 19, 2026 decision update: authorized staff responses

Garrett approved responses from authorized members of a verified politician's office team, labeled "Answered by [politician]'s office". Do not imply the politician personally authored a team response. Enforce profile-bound membership and response permissions and retain restricted author/audit evidence consistent with the private-data policy. Implementation and workbook synchronization remain outstanding; no office membership, public label or production permission was changed by this edit.

## November 19, 2026 decision update: office transitions

Garrett approved keeping former officeholders' profiles and published answers publicly accessible, labeling former status and showing answer publication dates. Incoming politicians receive separate profiles/accounts; do not transfer the predecessor's answer authorship or office-team access to the successor by implication. Preserve stable identity and historical office/service dates. Define and test membership transitions so former teams cannot answer as the current officeholder. Implementation and workbook synchronization remain outstanding; this edit changed no production profile or access.

## November 19, 2026 decision update: disputed answers and corrections

Garrett approved investigating disputed answers, preserving their history and temporarily stopping further answers when account compromise is suspected. He clarified that fraudulent answers may be removed when needed; answers determined to originate from the politician or their authorized team remain publicly visible, with a clearly associated notice that they wish to correct the answer and the correction itself when supplied. Do not attribute correction language or intent without an actual request. Establish authenticity from evidence and record the disposition. Any removal requires review and Garrett's approval for the specific item; this policy is not blanket deletion authorization. Prefer reversible public withdrawal of proven fraudulent content with restricted audit evidence retained under the private-data policy. Mandatory legal exceptions remain separately assessed. No content, permissions or production settings changed by this record update. Workbook synchronization remains outstanding.

## November 19, 2026 decision update: office claims and individual disputes

Garrett approved automatic acceptance only when a claimant completes verification through an independently confirmed official office email; uncertain cases go to Garrett, with public answering permissions withheld until resolved. Verification must bind the specific office/profile and authorized membership; possession of an address on a broad shared domain alone is insufficient. Garrett added that complaints should be resolved individually and used to consider process improvements. Prepare a minimal documented dispute/recovery path with evidence and decision history rather than building an elaborate process upfront. This does not authorize automatically accepting disputed claims, exposing proof material, contacting third parties, deleting records or enabling untested verification. Implementation, acceptance evidence and workbook synchronization remain outstanding.

## November 19, 2026 decision update: security/privacy incident ownership

Garrett agreed that the AI security team investigates security/privacy alerts and prepares fixes. Garrett approves changes to the live site and messages to affected people. Quinn remains the urgent fallback when Garrett is unavailable, with willingness, availability and contact/access arrangements still requiring verification. This records ownership and approval boundaries; no continuous monitoring, incident-response coverage, deployment, third-party message or automatic restriction was enabled. Local investigation, reversible preparation and testing can proceed within existing authorization. Implementation and workbook synchronization remain outstanding.

## November 19, 2026 decision update: content-report decisions

Garrett agreed that AI summarizes harmful/inaccurate-content reports and recommends an action; Garrett decides corrections, restrictions or removals. Suspected illegal content or exposed private information is flagged urgently. This approval establishes responsibility, not authorization to remove any particular item or enable an automated takedown. Preserve the separately approved permanent official-answer archive and correction history, subject to documented applicable exceptions. Actual deletion still requires explicit item-specific confirmation. Quinn remains the urgent fallback when Garrett is unavailable, with availability/contact arrangements still unverified. Implementation and workbook synchronization remain outstanding.

## November 19, 2026 decision update: photo permission checks without a manual approval queue

Garrett rejected building a manual photo-review process at this stage. His requirement is to ensure WhyTho has permission to publish each photo; politicians can replace their photos themselves. Do not assign Garrett routine photo approval. Implement source/rights evidence checks within image sourcing: record the exact asset, creator or rights holder where available, permission/license or documented public-domain basis, source, attribution requirements and checked date. Verify the legal basis using current authoritative sources during implementation; public availability or placement on an official website alone is not clearance. Use the previously approved neutral placeholder when the basis is unresolved, preserving originals/history. Preserve politician self-service replacement and enforce the same permission requirements for uploaded replacements. No per-asset clearance, image replacement, deletion or deployment occurred in this decision-record edit. This supersedes any proposal for Garrett to approve an initial photo batch; workbook synchronization remains outstanding.

## November 19, 2026 decision update: initial editorial reviewer

Garrett agreed to serve as the initial reviewer of AI-prepared suggested questions before publication. AI prepares questions, checks source support and presents review evidence; Garrett reviews an initial batch. Use the results to assess further automation separately. This does not approve any unseen batch or enable automatic publication. Reviewer acceptance does not establish factual support without the underlying evidence. Workbook synchronization remains outstanding.

## November 19, 2026 decision update: AI intake authority

Garrett approved AI automatically sorting reports, summarizing them, flagging urgency and drafting responses. Garrett approves replies and consequential actions, including account restrictions and public-content changes. This records the operating model; no inbox-monitoring automation, external send, access grant or moderation action was enabled. Implementation must preserve existing communication and deletion approval rules, minimize private data supplied to AI, and treat incoming report content as untrusted. Quinn remains an urgent fallback when Garrett is unavailable, subject to verified availability and separately authorized contact. Workbook synchronization remains outstanding.

## November 19, 2026 decision update: D03 backup escalation approved

Garrett confirmed that he receives routine reports and Quinn is brought in only for urgent issues when he is unavailable, such as suspected account takeover, exposed private information or a time-sensitive complaint. Define response timing and fallback steps in the operating procedure. Quinn's willingness, availability and necessary access still need verification before claiming operational coverage. This decision does not authorize contacting Quinn or automatically sending her messages. No routine monitoring duty is assigned to her. Workbook synchronization remains outstanding.

## November 19, 2026 decision update: D08 Cloudflare owner

Garrett confirmed he personally set up WhyTho's Cloudflare account. Record Garrett as the existing account owner/operator. Use the existing authenticated sign-in workflow for any remaining read-only configuration checks; do not request secrets in chat or create new access by implication. Authenticated access and configuration evidence remain implementation checks, not unanswered account-ownership decisions. No Cloudflare settings or permissions changed in this record update. Workbook synchronization remains outstanding.

## November 19, 2026 decision update: D07 controlled test accounts

Garrett approved clearly labeled test accounts using WhyTho email aliases routed to his existing garrett@whytho.us inbox, with fictional politician profiles in a separate test environment. This authorizes preparing and configuring controlled test identities for the account/persona suite. Exact alias names and environment must be recorded during implementation. No test accounts or aliases were created by this decision-record edit. Do not impersonate real politicians or publish synthetic activity as authentic engagement. Real-office identity-proof acceptance still requires a consenting representative; no third-party contact is authorized. Workbook synchronization remains outstanding.

## November 19, 2026 decision update: D12 private-data direction approved

Garrett agreed to purpose-limited retention of private information and instructed the team to use industry best practices. Together with his permanent official-answer archive decision, this resolves D12's high-level policy direction. Inventory actual collected data and vendors, verify current authoritative privacy/security guidance and applicable requirements, then prepare category-specific retention periods, access controls, backup expiry and rights-request handling. Minimize identity evidence and sensitive logging; retain narrowly justified security, rights, suppression and legal-hold records with documented purposes. Do not treat a generic 30/90-day period as universally required or an indefinite private-data archive as approved. Published politicians' answers remain a permanent public civic archive under the separately recorded direction, with legal exceptions reviewed before final policy promises. Exact schedules, implementation and legal applicability remain open execution tasks. No actual deletion is authorized; Garrett's explicit deletion-confirmation rule continues to apply. The workbook has not yet been synchronized with these November 19 addenda.

## November 19, 2026 decision update: permanent official-answer archive

Garrett stated: "we want all answers to be visible forever. its important to have a record of politicians positions". Product direction: retain politicians' published answers as a permanent public civic record, including after departure from office or account closure. Preserve original published versions and visibly associate later corrections, retractions and changed positions rather than silently replacing the historical answer. Do not promise unconditional visibility regardless of legal obligations; research and document narrow legally required restrictions and exceptional sensitive-content handling before finalizing policy. No deletion, deployment or third-party communication authorized by this decision. Private-data retention remains a separate unanswered portion of D12. This addendum records the decision; workbook synchronization and implementation remain outstanding.

## November 19, 2026 decision update: D03 backup

## November 19, 2026 decision update: deferred attorney review

Garrett stated that an attorney is unaffordable at this stage. Keep independent attorney review open as an unresolved risk and revisit if WhyTho gains traction. No attorney engagement or legal clearance is claimed. Garrett requested firm, law-grounded recommendations that make the product as safe as practical in the meantime. AI review should verify current primary legal authorities for each substantive conclusion, distinguish clear obligations from fact-dependent applicability and uncertain interpretation, document assumptions and residual exposure, and recommend concrete risk-reducing implementation. This authorizes continued research and preparation; it does not authorize third-party communications, spending, deletions or falsely marking counsel-dependent acceptance complete. Attorney availability is not a blanket prerequisite for all implementation work. The workbook remains to be synchronized with this addendum.

Garrett designated Quinn Weiss as his backup, emphasizing that she is truly a backup. Garrett remains primary for routine monitoring and day-to-day reports. Quinn is the fallback for urgent escalations when Garrett is unavailable, with no routine monitoring assignment. Her willingness, availability and escalation/access arrangements have not yet been verified. No message was sent to her and no access was granted. This supersedes the earlier statement that Quinn had not been assigned. D03 remains open for coverage details, legal reviewer and specialist responsibilities. The workbook's earlier D03 entry has not yet been synchronized with this addendum.

Garrett accepted the recommendations for D01-D11, with D06 changed to all of Congress in testing. Acceptance of direction is recorded below separately from missing factual details and later execution packages. D12 remains a question, not an approved retention schedule. This record does not claim implementation, legal clearance or completion of testing.

| ID | Recorded decision | Remaining detail or execution condition |
|---|---|---|
| D01 | Zellon LLC is the WhyTho operator, formed in California. Public business name: WhyTho. Garrett supplied these facts November 2. | Owner decision complete. Independent company-record reconciliation remains an LG01 implementation check. |
| D02 | Set up support@whytho.us, privacy@whytho.us, copyright@whytho.us and security@whytho.us, all delivering to Garrett's chosen inbox garrett@whytho.us. Public business mailing address supplied by Garrett: 2108 N St., Ste N, Sacramento, CA 95816. | Complete: all four aliases created, all four tests received in Outlook, and a reply from garrett@whytho.us received in Garrett's Gmail. D03 coverage and LG01 public notices remain separate. See EMAIL_CONTACT_SETUP.md. |
| D03 | Garrett is interim accountable owner. AI may triage/draft/escalate under the proposed operating model. | A willing human backup, coverage schedule, qualified legal reviewer and editorial/image/privacy/security/accessibility responsibilities still need explicit names. Quinn has not been assigned. |
| D04 | 18+ participation; public reading open; minimal age attestation. | Implement and test. Underage disclosures still require the proposed escalation procedure. |
| D05 | Use neutral placeholders for images with unknown rights, preserving originals/history. | Review exact assets and implement the reversible display policy. This is not deletion approval or per-asset clearance. |
| D06 | All of Congress belongs in test. | Implement the complete coverage manifest and test layers below. Actual roster count is established at execution. |
| D07 | Owned staging personas and Garrett as the first real browser/challenge tester; use a consenting office for real office-proof acceptance. | Name controlled inboxes, environment and consenting office participant. No actual politician impersonation or unapproved third-party test mail. |
| D08 | Existing account owner retains control; WT receives only the access needed for diagnosis. | Identify the Cloudflare operator and authenticated access route. No secrets in tracker/chat. |
| D09 | Prepare the database maintenance plan using backups, staging rehearsal and a staffed low-traffic window. | Exact target version, window, expected interruption and tested recovery package must be ready before execution approval. |
| D10 | One-week shadow run, then an approved internal smoke and a maximum five opted-in office teams / 25 recipients. Daily 9 a.m. local digest, at most one per rolling 24 hours, with immediate opt-out. | Exact sender, Reply-To, rendered template, recipients and launch time remain a later approval package after technical acceptance. Sending remains off. |
| D11 | Small organic product-education pilot using reviewed assets and existing accounts. | Exact assets, accounts, links and posting times still require the final publication package. No paid spend or unsolicited partner sequence. |
| D12 | Garrett asked whether data has to be deleted after any particular time. | No retention periods or deletion operation approved. See explanation below; finalize after data/vendor inventory and applicability review. |

## All-Congress testing scope

Use all currently serving senators, representatives, delegates and the resident commissioner. Reconcile dated official House and Senate rosters with stable platform IDs and permanent slugs. Track vacancies, former officials and incoming members separately. Do not hard-code a membership count or treat member-elects as incumbents. Recheck the roster before acceptance and following office transitions.

- T13/LG10 own a coverage manifest with chamber, seat type, state/district, service dates/status, official identifier, platform ID, slug, source URL and checked date. Every occupied seat must map correctly; every mismatch has an explicit disposition.
- T02 checks website/email authority for every member. Each has reviewed evidence or an explicit tested manual-review state. Broad domains alone are not identity proof.
- I01-I03 cover every congressional profile. Every display has a cleared usable portrait or intentional placeholder. Report actual cleared portrait coverage separately from safe-display coverage. I04 then extends reviewed coverage to governors, state and local officials.
- T03 runs isolated staging persona and authorization cases across every congressional profile: correct question/answer binding, claimant/pending/admin/editor/responder roles, unrelated and removed-member denial, last-admin protection, drafts, publication and portrait controls. Real provider acceptance uses only owned or consenting identities. Fixture coverage does not imply real-office participation or verification.
- T14-T16 cover suggestions and evidence for every member. Five reviewed suggestions per member remains a content target; insufficient evidence uses a truthful starter or abstention. The frozen 100-item model benchmark is a subset and cannot establish full congressional coverage.
- T15/LG02 cover jurisdiction choices, delegates, district/state fallbacks, provenance and response metrics. Test and AI activity never count as authentic constituent or official participation.
- LG12/R01 require complete profile coverage evidence plus mobile/accessibility and real-provider persona results. Every row names the test layer, build, evidence and any unresolved exception. Sampling is not presented as comprehensive testing.

The notification pilot remains at five opted-in teams / 25 recipients. The organic marketing pilot remains limited to reviewed pages/assets. Test scope does not authorize contacting all offices or submitting public test questions.

### Newer question-verification evidence

The WhyTho journal entry dated November 1 at 12:16 records Garrett's "it worked" confirmation and closes the earlier question-verification issue on that basis. The tracker now places T01 in Review to document this resolved issue and finish any still-unrecorded regression evidence. It does not assert a current production failure, invent a submitted question ID, or count user confirmation as completion of the full provider/persona suite. Source: `/Users/garrettweiss/.claude/journal/whytho/log.md`, entry dated 2026-11-01 12:16.

## Email setup checkpoint

Public DNS checked November 2:

- MX: `0 whytho-us.mail.protection.outlook.com.`
- Nameservers: `ns19.domaincontrol.com.` and `ns20.domaincontrol.com.`

The MX identifies Microsoft 365 inbound mail. Garrett signed into GoDaddy Email & Office, which confirmed the existing administrator mailbox `garrett@whytho.us`. All four approved aliases were created under that mailbox and are shown in the dashboard. Garrett then completed Microsoft MFA. All four uniquely labeled setup messages arrived in the Outlook Inbox at 21:32 Pacific; a reply from `garrett@whytho.us` reached Garrett's Gmail Inbox at 21:36 Pacific. Receipt/reply verification is complete. Sending as each individual alias was not tested. See [the setup evidence](EMAIL_CONTACT_SETUP.md).

Report categorization is documented as a manual process pending D03 coverage/backup assignments. Existing routing, including Outlook's displayed forwarding to Garrett's Gmail, and mailbox access were preserved. No licenses, replacement tenant, MX changes or politician outreach were involved. The readable reply included a winmail.dat attachment; outgoing formatting is a small follow-up before routine public replies.

Reference: [GoDaddy alias setup](https://www.godaddy.com/help/what-is-an-email-alias-9019), [Email & Office dashboard access](https://www.godaddy.com/help/access-my-email-office-dashboard-26409).

## D12: retention explanation and revised recommendation

There is no single 30-day or 90-day deletion deadline for all WhyTho data. Those numbers were proposed operating defaults, not universal legal deadlines. Requirements depend on the data, its purpose, applicable law, vendor contracts and promises made to users. The FTC recommends retaining sensitive personal information only while it is needed and documenting retention and secure disposal. Applicable privacy laws can also require responding to deletion requests, subject to exceptions. WhyTho's exact applicability is still a legal-review task. [FTC guidance](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business), [California Attorney General privacy guidance](https://www.oag.ca.gov/privacy/ccpa).

Recommended direction, pending Garrett's decision:

1. Public civic questions, official responses and necessary source/correction history: long-term archive with no routine age-based expiry, subject to rights requests, unlawful-content handling and other applicable exceptions. Public content is not automatically exempt from every privacy obligation.
2. Private account data: retain for the active service purpose, then apply the approved closure/rights process and justified exceptions.
3. Raw IP/abuse logs, private support chats, identity evidence and delivery diagnostics: keep only for documented purposes, with category-specific review/expiry periods based on the actual inventory. Thirty and ninety days remain proposed starting points, not accepted mandatory cutoffs. Do not keep reusable proof tokens or raw IDs merely because an audit trail is useful.
4. Keep minimal opt-out suppression records and necessary rights/security evidence while justified. Document legal holds and actual vendor/backup windows.

Do not turn every archive into an automatic purge or treat indefinite retention of all private data as the default. No actual deletion is authorized by this recommendation or this session's answer to D12.
