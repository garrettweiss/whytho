"""Analyze a captured public roster. Local files only; never changes the database."""
import collections
import csv
import itertools
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "outputs/politician-identity-audit-20261122"
raw = json.loads((OUT / "politicians.json").read_text())
rows = [r for r in raw if not r["is_test"]]
by_id = {r["id"]: r for r in rows}
states_text = (ROOT / "lib/search/states.ts").read_text()
state_map = {}
for code, name, slug in re.findall(r'code: "([A-Z]{2})", name: "([^"]+)", slug: "([^"]+)"', states_text):
    for value in [code, name, slug]:
        state_map[value.casefold()] = code
for code, name in [("PR", "Puerto Rico"), ("VI", "Virgin Islands"), ("GU", "Guam"), ("AS", "American Samoa"), ("MP", "Northern Mariana Islands"), ("DC", "District of Columbia")]:
    state_map[code.casefold()] = state_map[name.casefold()] = code

def state(r):
    value = (r.get("state") or "").strip()
    return state_map.get(value.casefold(), value.upper())

def name(value):
    text = unicodedata.normalize("NFKD", value or "").casefold()
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[^a-z0-9]+", " ", text).strip()
    return re.sub(r"^(?:dr|mr|mrs|ms|rep|sen|hon)\s+", "", text)

def office(r):
    return {"State Senate": "State Senator", "State House": "State Representative", "State Assembly": "State Representative", "State Assemblymember": "State Representative", "State Delegate": "State Representative"}.get(r.get("office"), r.get("office") or "")

def district(r):
    if office(r) in ["U.S. Senator", "Governor", "Lieutenant Governor", "President", "Vice President"]:
        return "statewide"
    value = str(r.get("district") or "").strip().casefold()
    if value.isdigit():
        return str(int(value))
    if value in ["at large", "at-large", "atlarge"]:
        return "0"
    return value

edges = collections.defaultdict(set)
def add(a, b, reason):
    if a != b:
        edges[tuple(sorted([a, b]))].add(reason)

def grouped(key):
    result = collections.defaultdict(list)
    for row in rows:
        value = key(row)
        if value:
            result[value].append(row["id"])
    return {k: v for k, v in result.items() if len(v) > 1}

for field in ["bioguide_id", "openstates_id", "govtrack_id", "votesmart_id"]:
    for ids in grouped(lambda r: r.get(field)).values():
        for a, b in itertools.combinations(ids, 2):
            add(a, b, "shared_" + field)
fec = collections.defaultdict(set)
for row in rows:
    for field in ["fec_id", "fec_candidate_id", "candidate_fec_id"]:
        if row.get(field):
            fec[row[field].strip().upper()].add(row["id"])
for ids in fec.values():
    for a, b in itertools.combinations(sorted(ids), 2):
        add(a, b, "shared_fec_identity")

for ids in grouped(lambda r: (name(r["full_name"]), state(r)) if state(r) else None).values():
    for a, b in itertools.combinations(ids, 2):
        left, right = by_id[a], by_id[b]
        if office(left) == office(right) and office(left) and district(left) == district(right) and district(left):
            add(a, b, "same_name_state_office_district")
        elif office(left) == office(right) and office(left):
            add(a, b, "same_name_state_office_review_district")
        else:
            add(a, b, "same_name_state_review_office")

# Wider discovery only: middle-name, initial, suffix and punctuation differences.
# Seat matching is evidence for review, never proof of identity.
for ids in grouped(lambda r: (state(r), office(r), district(r), name(r["full_name"]).split()[-1]) if state(r) and office(r) and district(r) and name(r["full_name"]) else None).values():
    for a, b in itertools.combinations(ids, 2):
        left, right = by_id[a], by_id[b]
        ln, rn = name(left["full_name"]).split(), name(right["full_name"]).split()
        if len(ln) < 2 or len(rn) < 2 or ln == rn:
            continue
        if ln[0] == rn[0] or (len(ln[0]) == 1 and ln[0] == rn[0][0]) or (len(rn[0]) == 1 and rn[0] == ln[0][0]):
            add(a, b, "same_seat_first_last_review_name")

# Exact multiword aliases may find nicknames. Surname-only aliases are excluded.
alias_index = collections.defaultdict(set)
for row in rows:
    for alias in [row["full_name"], *(row.get("aliases") or [])]:
        normalized = name(alias)
        if len(normalized.split()) >= 2 and state(row):
            alias_index[(normalized, state(row))].add(row["id"])
for ids in alias_index.values():
    for a, b in itertools.combinations(sorted(ids), 2):
        if name(by_id[a]["full_name"]) != name(by_id[b]["full_name"]) and office(by_id[a]) == office(by_id[b]) and district(by_id[a]) == district(by_id[b]):
            add(a, b, "shared_multiword_alias_same_seat_review")

adj = collections.defaultdict(set)
for a, b in edges:
    adj[a].add(b)
    adj[b].add(a)
seen = set()
components = []
for start in sorted(adj):
    if start in seen:
        continue
    stack, ids = [start], set()
    while stack:
        current = stack.pop()
        if current in ids:
            continue
        ids.add(current)
        stack.extend(adj[current] - ids)
    seen |= ids
    components.append(sorted(ids))

groups = []
for ids in components:
    members = [by_id[i] for i in ids]
    group_edges = [{"left": a, "right": b, "evidence": sorted(reasons)} for (a, b), reasons in edges.items() if a in ids and b in ids]
    reasons = set(itertools.chain.from_iterable(edge["evidence"] for edge in group_edges))
    conflicts = {field: sorted({r[field] for r in members if r.get(field)}) for field in ["bioguide_id", "openstates_id", "govtrack_id", "votesmart_id"]}
    conflicts = {field: values for field, values in conflicts.items() if len(values) > 1}
    exact_seat = len({(name(r["full_name"]), state(r), office(r), district(r)) for r in members}) == 1 and bool(district(members[0]))
    cross_source = any(r.get("bioguide_id") or r.get("openstates_id") for r in members) and any(r.get("candidate_fec_id") for r in members)
    shared_id = any(reason.startswith("shared_") and reason != "shared_multiword_alias_same_seat_review" for reason in reasons)
    if conflicts:
        tier = "identity_conflict_review"
    elif shared_id:
        tier = "shared_identifier_review"
    elif exact_seat and cross_source and len(ids) == 2:
        tier = "strong_cross_source_candidate"
    elif exact_seat:
        tier = "exact_seat_review"
    else:
        tier = "name_or_office_review"
    groups.append({"group_id": "identity-" + min(ids)[:8], "tier": tier, "ids": ids, "names": sorted({r["full_name"] for r in members}), "states": sorted({state(r) for r in members}), "identity_conflicts": conflicts, "edges": group_edges})
groups.sort(key=lambda g: (g["tier"], g["names"][0]))

# Additional nickname/suffix discovery stays outside the core connected groups.
# A shared surname and seat can also mean relatives or electoral opponents.
group_for_id = {id_: group["group_id"] for group in groups for id_ in group["ids"]}
def surname(r):
    parts = name(r["full_name"]).split()
    while parts and parts[-1] in {"jr", "sr", "ii", "iii", "iv"}:
        parts.pop()
    return parts[-1] if parts else ""

supplemental = []
for ids in grouped(lambda r: (state(r), office(r), district(r), surname(r)) if state(r) and office(r) and district(r) and surname(r) else None).values():
    for a, b in itertools.combinations(ids, 2):
        left, right = by_id[a], by_id[b]
        if group_for_id.get(a) and group_for_id.get(a) == group_for_id.get(b):
            continue
        official_candidate_pair = ((left.get("bioguide_id") or left.get("openstates_id")) and right.get("candidate_fec_id")) or ((right.get("bioguide_id") or right.get("openstates_id")) and left.get("candidate_fec_id"))
        if official_candidate_pair:
            supplemental.append({"ids": [a, b], "names": [left["full_name"], right["full_name"]], "state": state(left), "office": office(left), "district": district(left), "reason": "Same surname/seat across official and candidate sources; nickname, suffix, relatives or opponents require identity review."})

# Same normalized name in different states is a separate review list, not an edge:
# no transitive merging of unrelated people who happen to share a name.
cross_state = []
for normalized, ids in grouped(lambda r: name(r["full_name"])).items():
    if len({state(by_id[i]) for i in ids}) > 1:
        cross_state.append({"name": normalized, "ids": ids, "states": sorted({state(by_id[i]) for i in ids})})

summary = {
    "scope": "All non-test politician rows; candidates are proposals requiring identity validation, not confirmed duplicates.",
    "all_rows": len(raw), "non_test_rows": len(rows), "active_non_test": sum(r["is_active"] for r in rows),
    "candidate_groups": len(groups), "profiles_in_candidate_groups": len(seen),
    "potential_surplus_if_every_group_confirmed": sum(len(g["ids"]) - 1 for g in groups),
    "by_tier": dict(collections.Counter(g["tier"] for g in groups)),
    "cross_state_same_name_review_groups": len(cross_state),
    "supplemental_surname_seat_review_pairs": len(supplemental),
    "non_code_states": sum(bool(r["state"]) and r["state"] != state(r) for r in rows),
    "empty_states": sum(not r["state"] for r in rows),
    "unknown_states": sorted({r["state"] for r in rows if r["state"] and r["state"].casefold() not in state_map}),
}
(OUT / "candidate-groups.json").write_text(json.dumps(groups, indent=2) + "\n")
(OUT / "cross-state-name-review.json").write_text(json.dumps(cross_state, indent=2) + "\n")
(OUT / "supplemental-name-review.json").write_text(json.dumps(supplemental, indent=2) + "\n")
(OUT / "analysis-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
with (OUT / "candidate-profiles.csv").open("w", newline="") as handle:
    fields = ["group_id", "tier", "id", "slug", "full_name", "state", "office", "district", "is_candidate", "verification_tier", "bioguide_id", "openstates_id", "candidate_fec_id", "has_photo", "created_at"]
    writer = csv.DictWriter(handle, fieldnames=fields)
    writer.writeheader()
    for group in groups:
        for id_ in group["ids"]:
            row = by_id[id_]
            writer.writerow({field: group.get(field, bool(row["photo_url"]) if field == "has_photo" else row.get(field)) for field in fields})
print(json.dumps(summary, indent=2))
