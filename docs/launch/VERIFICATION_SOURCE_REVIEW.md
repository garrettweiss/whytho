# Official-source review before politician verification

Date: October 30, 2026. Owner: WhyTho operator, with WT performing the import. This procedure is ready; no production source rows were inserted during the audit.

The launch security migration intentionally creates an empty `politician_verification_sources` table. Government email and website verification return a clear review-needed response until a row is reviewed and entered for the selected politician. Existing verified profiles retain their current dashboard access. Do not copy `politicians.website_url` into this table automatically: a claimant may have supplied it. Profile source review is an independent identity control.

## Operator procedure

1. Resolve the exact politician using profile ID, current office, state/district and a primary official directory. Check same-name candidates and former officeholders. FEC candidate IDs and public biographical facts do not prove ownership.
2. Open the government's current official directory independently of the claimant's link. Follow the office's link and record the evidence page URL and review date. For a candidate without a government site, use an independently verified campaign authority and a manual verification path; do not invent a `.gov` email method.
3. Record the exact HTTPS page on which the office can place the meta tag. Require it to identify this politician. HTTPS redirects are refused by the verification fetcher; use the final, independently confirmed HTTPS URL. The page must expose the tag in its HTML `<head>` without JavaScript. A 403, JavaScript-only page or inaccessible source needs operator review; it does not mean identity is verified.
4. Record government email domains only when the official directory or office publishes that exact domain. `example.gov` does not implicitly authorize `other.example.gov`, and a shared legislature domain is not proof of a particular person's identity. Pair it with the politician-specific site control. Keep an empty domain list when email authority is unverified.
5. Have a second operator review the profile identity, official source and office authority. Record reviewer UUID from a known operator's existing account. Never elevate an account by copying `user_profiles.is_admin`; platform permissions come from server-managed `auth.users.raw_app_meta_data`.
6. Read the current profile and existing source row immediately before writing. Preserve the prior values in the release record. Apply one reviewed row, test with a consenting office or synthetic staging fixture, then proceed with the reviewed batch. Importing a source row sends no email.

## Exact SQL template

Run with bound parameters in a trusted operator session. The placeholders are not real politician IDs or office domains. Do not run the template with invented values. Browser roles cannot read or write this table.

```sql
BEGIN;
-- First confirm that the row is the reviewed person and office.
SELECT id, full_name, office, state, district, verification_tier
FROM public.politicians WHERE id = :politician_id;
SELECT politician_id, official_website_url, government_email_domains,
       evidence_url, reviewed_at, reviewed_by
FROM public.politician_verification_sources WHERE politician_id = :politician_id;

-- Bind all six values from the signed review record; domain array can be empty.
INSERT INTO public.politician_verification_sources (
  politician_id, official_website_url, government_email_domains,
  evidence_url, reviewed_at, reviewed_by
) VALUES (
  :politician_id, :reviewed_official_https_url, :reviewed_exact_gov_domain_array,
  :independent_official_directory_https_url, now(), :operator_user_id
)
ON CONFLICT (politician_id) DO UPDATE SET
  official_website_url = EXCLUDED.official_website_url,
  government_email_domains = EXCLUDED.government_email_domains,
  evidence_url = EXCLUDED.evidence_url,
  reviewed_at = EXCLUDED.reviewed_at,
  reviewed_by = EXCLUDED.reviewed_by;
COMMIT;
```

Keep the prior record and evidence in an operator-only change log. A changed source does not silently validate older pending challenges: the API and completion trigger recheck the reviewed URL/domain and evidence binding. Challenge records remain private; verification codes are cleared on successful completion. Do not run production OTP requests as a smoke test because they send email.

## Acceptance evidence

Local synthetic scenarios in `supabase/tests/security/launch_security.test.sql` prove: no anchor means no completion; an unrelated government domain is rejected; a claimant's arbitrary website is rejected; one completed method does not verify; two reviewed methods raise the tier; non-admin completion is rejected. `scripts/security-integration.test.ts` proves API auth, OTP attempt/expiry limits, no code disclosure, provider failure handling and exact reviewed URL selection. These use fake identities and mocked delivery, not actual offices.

Before public promotion: reviewed anchors must cover the initial office cohort, a real consenting office must complete delivery and meta-tag verification in a controlled rollout, and support must have a published ownership-dispute route. Do not advertise automated verification as universally available before those checks pass.
