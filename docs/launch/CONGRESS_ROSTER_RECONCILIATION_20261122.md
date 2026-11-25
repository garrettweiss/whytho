# Congressional profile and account test coverage

November 22, 2026. A read-only check compared 539 currently serving members listed by the House and Senate with WhyTho's public profile records. It included the House delegates and Puerto Rico's resident commissioner. Two vacant House seats were excluded. Each active match used the official Bioguide ID, state and chamber, plus the district for House members. [House Clerk roster](https://clerk.house.gov/xml/lists/MemberData.xml) [Senate roster](https://www.senate.gov/general/contact_information/senators_cfm.xml)

| Result | Count | Follow-up |
|---|---:|---|
| One active profile with the expected office | 526 | Use the matched profile for public coverage and staging fixture selection. |
| One active profile with the expected territory and generic House office | 6 | The five delegates and one resident commissioner are covered by identity. Test their labels, claim flows and district filters. WhyTho currently stores their office as “U.S. Representative.” Check directory and verification rules before changing the stored office value. |
| No active profile with the official ID | 7 | Four have a matching federal candidate profile. Three need a separate federal profile after a final duplicate check. |

The [539-row test inventory](evidence/congress-account-roster-check-20261122.csv) records each member, office comparison, evidence and matched slug. All 532 matched slugs are unique. The roster check verifies which profile an account test should use. Connected sign-in, claiming and staff permissions still need their own persona tests and hosted checks.

## Proposed profile changes

| Official | Profile to use | Proposed action |
|---|---|---|
| James Gallagher, CA-01, G000607 | Existing `james-gallagher-ca` is a state legislative profile. | Create a separate federal profile with a neutral placeholder. Preserve the state record and its history. [House Clerk](https://clerk.house.gov/members/G000607) |
| Aisha Wahab, CA-14, W000832 | `dr-aisha-wahab-ca-district-14` | Attach the official ID to the federal candidate profile and mark its current office status. Keep the separate state senate profile and its history. [House Clerk](https://clerk.house.gov/members/W000832) |
| Everton Blair Jr., GA-13, B001328 | `everton-blair-ga-district-13` | Attach the official ID to the federal candidate profile and mark its current office status. Retain its slug and add the Clerk's name variant if needed. [House Clerk](https://clerk.house.gov/members/B001328) |
| Clay Fuller, GA-14, F000485 | `clay-fuller-ga-district-14` | Attach the official ID to the federal candidate profile and mark its current office status. [House Clerk](https://clerk.house.gov/members/F000485) |
| Analilia Mejia, NJ-11, M001246 | `analilia-mejia-nj-district-11` | Attach the official ID to the federal candidate profile and mark its current office status. [House Clerk](https://clerk.house.gov/members/M001246) |
| Alan Armstrong, OK Class II, A000383 | No same-person public profile found. | Create an office profile with a neutral placeholder after rechecking the seat. His official site says the office serves through November 30. Include the handoff in the acceptance test. [Official Senate office](https://www.armstrong.senate.gov/) |
| Darline Graham, SC Class II, G000608 | `lindsey-o-graham-sc-senator` is the predecessor's separate record and still carries an active candidate flag. | Create a separate office profile with a neutral placeholder. Review the predecessor's candidate and current-office flags as a separate correction while preserving the record. [Official Senate office biography](https://www.dgraham.senate.gov/) |

The four federal candidate records are still marked as candidates and have blank Bioguide IDs. Preserve their IDs, slugs, questions, votes and answers. Before applying any approved batch, recheck each official entry, the current profile and race status, and any competing federal record. Review incoming office claims separately. Government directory evidence confirms the identity and seat. Office account authority and portrait permissions each require their own evidence.

## Account acceptance

1. Use the full 539-member roster for the directory and profile mapping check. Re-run after the proposed changes and investigate any duplicate profile or wrong district.
2. In an isolated environment, exercise the existing account scenarios with controlled personas across a House district, a Senate seat, a delegate and the resident commissioner. Use the Gallagher or Wahab case for a state-to-federal transition and the Graham case for a successor. Make sure each claim stays tied to the intended profile.
3. Verify the predecessor's public history persists and their office permissions do not transfer to a successor. Test team-role changes and portrait replacement on the controlled account.
4. Record hosted sign-in and delivery results separately. Use a consenting office only after the recipient and scope are approved.

The claim function already checks whether the selected profile is active. The answer function checks membership against the question's profile ID. Before changing any real office status, the handoff test must establish who can handle a predecessor's historical corrections and when any former office permissions are retired. The profile flag alone does not express that policy.

No profile, public image or account was changed during the roster check.
