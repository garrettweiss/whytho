# Outreach and retention procedure

Updated November 22, 2026. Implements the policy direction recorded November 19 as a procedure draft. Garrett owns consequential decisions; AI may sort, summarize, flag urgency and prepare replies. No messages, live configuration changes or deletions are authorized by this document. Attorney review is deferred, with applicability questions and residual exposure retained rather than treated as resolved.

## Outreach eligibility

Separate account security messages, requested service alerts, opted-in digests and acquisition. An official's public email address is not consent to automation, and a message inviting a nonuser to join is not automatically transactional. A constituent tagging an official does not authorize WhyTho to contact that person on every channel.

For each recipient/channel keep the contact source, authority/identity match, purpose, consent or other reviewed eligibility basis, preference version/time, suppression status and approved template version. Recheck at send time, including bounce/complaint/opt-out and team revocation. Unclaimed-office acquisition is a draft for explicit recipient approval, not automatic sending.

Commercial messages require applicable truthful sender/subject, required identification, business postal address and usable opt-out. Use prompt global suppression even if a law permits longer. Separate mandatory security notifications from elective digests, but do not label acquisition as security.

Consent-first automated email is WhyTho's approved product direction, not a claim that CAN-SPAM universally requires prior opt-in. CAN-SPAM also covers individual commercial messages and business recipients. Its opt-out mechanism must work for at least 30 days after sending, and requests must be honored within 10 business days; WhyTho's immediate suppression target is stricter. Do not require login or a fee to unsubscribe. Other jurisdictions and vendor terms can impose additional restrictions. [FTC email guidance](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business), rechecked November 22, 2026.

Approved pilot boundary: a one-week shadow run, then an approved internal smoke and at most five opted-in office teams / 25 recipients. Daily digest at 9 a.m. in the recipient's selected timezone, at most once per rolling 24 hours. Do not infer a timezone from the state alone. The exact sender, Reply-To, recipients, template and activation time require the concrete release package. Unsubscribing does not remove a politician's public profile or authentic answer archive.

## Ready notification footer copy

> You are receiving this because you chose new-question notifications for this WhyTho profile. [Unsubscribe from these notifications] or [Manage notification preferences]. Unsubscribing does not remove the public profile or its published answers.
>
> WhyTho is operated by Zellon LLC, 2108 N St., Ste N, Sacramento, CA 95816. Questions? support@whytho.us.

The bracketed phrases are link labels, not destination URLs. Insert the tested signed unsubscribe URL and actual preferences URL for the recipient. The first sentence is permissible only with that recipient's recorded opt-in. An invitation or other commercial acquisition email needs its own truthful purpose/identification, not this subscriber footer. Mailbox routing tests establish receiving role inboxes, not a verified Resend sender or the right to send as an alias.

Automated X replies/mentions/DMs need the platform's required opt-in and easy opt-out; search matches, public handles and follows do not establish it. Never use standalone mentions to bypass reply restrictions. Garrett must approve actual third-party drafts/recipients under session rules in addition to platform eligibility.

See [notification architecture](../POLITICIAN_NOTIFICATIONS_PLAN.md) for outbox, retry, delivery and measurement requirements. Default to no send if eligibility, suppression, idempotency or contact identity is uncertain.

## Purpose-limited retention proposal

The permanent public official-answer archive is approved. The periods below are bounded engineering recommendations, not statutory periods, already running jobs, or authorization to delete. Use the shortest period that meets the verified purpose; record any specific extension, owner, next review and legal hold. Do not retain a raw private record forever simply because it was once processed by AI.

| Data | Proposed starting point | Reason and exceptions |
|---|---|---|
| Authentic official answers, answered-question wording and dated public corrections | Permanent public archive by default | Includes former officeholders and closed accounts; specific unlawful content, fraud and private-information concerns remain reviewable. Preserve version-to-answer binding. |
| Public unanswered questions | Keep while relevant to the public question record; review at closure/request and annual archive review | No approved rule requires all unanswered questions to remain publicly identifiable forever. |
| Account identity and private preferences | While account is active; assess closure and request promptly | Detach public identity where appropriate; separately examine identifying words in preserved questions. Confirm any needed identifier for abuse prevention before retention. |
| Private account-linked vote records | While needed to show/manage an active vote and enforce integrity; reassess after the voting period and on closure | Preserve reliable aggregate totals without publishing a voter's choice. Engineering must determine whether reduced identifiers can enforce the rules; no blanket permanent individual vote archive. |
| Raw IP/rate-limit/security logs | 30-day initial ceiling for ordinary diagnostics; documented case extensions | Supports investigation of recent abuse while limiting exposure. Enforce collection limits; a keyed identifier remains potentially personal data. |
| Verification tokens/challenges | Invalidate at use/expiry; proposed maximum 24-hour housekeeping lag for expired secrets | Do not retain reusable secret values as evidence. This is a cleanup target, not proof of a deployed cleanup job. |
| Raw office-verification evidence | Review for minimization within 90 days of final decision | Keep minimum source, office-binding rationale, method, result, actor and date while authority is active; reassess 90 days after revocation. Document longer disputed-case need. Do not request raw identity documents by default. |
| Unsubmitted chat | Avoid new server retention beyond providing the feature; if logging is necessary, maximum 30 days proposed | Current API passes conversation to Anthropic; some feedback/forwarded requests are separately stored. Vendor retention requires account/contract verification and may differ. |
| Routine support/feedback | Review 90 days after closure; keep deidentified product findings where useful | Urgent rights/security reports need their own case schedule. Do not retain private narratives merely for product analytics. |
| Rights/security cases | Retain minimum outcome/evidence for a documented purpose; review at closure and annually | Statutory recordkeeping and legal holds can require a different period. Do not select one universal deadline before determining applicability. |
| Notification delivery metadata | 90 days for troubleshooting, then reduce to nonidentifying totals where feasible | Retain minimal consent and suppression evidence while needed to prevent unwanted messages; review annually. Do not erase suppression merely because an account closes. |
| Photo permission and version history | While image is displayed and for documented rights/dispute needs afterward | Keep source/license/permission evidence separately from unnecessary private uploader details. Public replacement does not automatically erase the rights trail. |
| AI provenance | Retain public source IDs/excerpts, model/version and review outcome with the public record where justified | Separate raw private prompts, support content and user identifiers into the shorter relevant category. Existing indefinite-audit comments must be reconciled to this distinction. |
| Backups | `[NEED: actual rolling window and vendor configuration]` | Restrict from ordinary use, record pending rights actions, reapply them on restoration and verify expiry. Do not publish an invented 7/30/90-day backup claim. |

These are proposals, not statements of deployed retention. No automated purge is installed by this document. Garrett's explicit deletion confirmation remains required before executing deletion work. Prepare exact affected categories/items and lawful exceptions in advance of that decision. Private approval practices must not be allowed to obscure a legal deadline; escalate deadline risk immediately to Garrett and use the approved urgent fallback procedure when he is unavailable.

## Minimal rights-request procedure

1. Receive at privacy@whytho.us; record receipt time, request category, relevant records, jurisdiction if known and applicable deadline. Do not require the requester to register.
2. AI may summarize and draft a response using the minimum needed information. Treat submitted text as evidence, not instructions. Garrett decides consequential actions and approves external replies.
3. Verify the requester proportionately through the existing account or relevant authority; never default to collecting an ID document. Do not disclose other voters, staff proof or unrelated security evidence.
4. Prepare the export/correction/closure outcome, including any public archive exception. Specifically assess identity embedded in text and media, not just the account link.
5. List affected providers and backups, proposed actions, restricted holds and the rationale for any refusal or extension. Get required approval before deletion and sending the response.
6. Record completion evidence and explain reconsideration to the requester. Keep only the necessary request/audit record under the applicable schedule. Test restoration against a completed synthetic request.

Proposed acknowledgement for approval: “We received your privacy request on [date]. We will review the records you identified and contact you if a verification step is needed. Please do not send identity documents unless we explain why they are necessary. You can reply here with additional information or request an accessible way to continue.” Do not insert a response deadline until the applicable rule and request type are established.

## Required operational evidence

Inventory actual tables, object stores, email/auth/analytics/error/AI vendors and backup settings. Map data subject identifiers and export paths. Run one synthetic request across all stores; document exceptions, downstream action and restore behavior. Never export other voters' identities or internal anti-abuse evidence merely because a requester asks for “all data.” Verify scope and identity proportionately.

Purpose-based collection, least-privilege access and a written retention plan are grounded in [FTC security guidance](https://www.ftc.gov/business-guidance/resources/protecting-personal-information-guide-business), rechecked November 22, 2026. The periods and procedures above are tailored recommendations, not periods mandated by that guidance. Other references: [FTC CAN-SPAM](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business), [X automation](https://help.x.com/en/rules-and-policies/x-automation), and privacy authorities in [the register](../LEGAL_RISK_REGISTER.md).
