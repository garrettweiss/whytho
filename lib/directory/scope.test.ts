import test from "node:test";
import assert from "node:assert/strict";
import { constrainDirectoryFilters, directoryContextDefaults, federalChamberOffice, EXECUTIVE_OFFICES, NATIONAL_OFFICES, STATE_OFFICES, allowedOfficeValues } from "./scope";
import { normalizeDirectoryFilters, parseDirectorySearch } from "./search";
import { encodeDirectoryCursor, decodeDirectoryCursor } from "./cursor";
const empty = { q: "", state: "", office: "" };

test("scoped search and clearing preserve route geography and office level", () => {
  const context = { basePath: "/state/ca", state: "CA", scope: "state" as const };
  assert.deepEqual(constrainDirectoryFilters({ ...empty, q: "Tony", office: "state-senate" }, context), { q: "Tony", state: "CA", office: "state-senate", scope: "state" });
  assert.deepEqual(directoryContextDefaults(context), { ...empty, state: "CA", scope: "state" });
  assert.deepEqual(constrainDirectoryFilters(empty, context), directoryContextDefaults(context));
  assert.throws(() => constrainDirectoryFilters({ ...empty, state: "NY" }, context));
  assert.throws(() => constrainDirectoryFilters({ ...empty, office: "us-senate" }, context));
});

test("region scope retains both state and federal offices without allowing another state", () => {
  const context = { basePath: "/region/california", state: "CA" };
  assert.equal(constrainDirectoryFilters({ ...empty, office: "us-house" }, context).office, "us-house");
  assert.equal(constrainDirectoryFilters({ ...empty, office: "state-house" }, context).state, "CA");
  assert.throws(() => constrainDirectoryFilters({ ...empty, state: "TX" }, context));
});

test("U.S. officials preserves Cabinet, vice president, governors and legacy chamber links", () => {
  assert.equal(EXECUTIVE_OFFICES.length, 24);
  assert(NATIONAL_OFFICES.includes("Vice President"));
  assert(NATIONAL_OFFICES.includes("Governor"));
  assert(NATIONAL_OFFICES.includes("U.S. Representative"));
  assert(STATE_OFFICES.includes("Governor"));
  assert(!STATE_OFFICES.includes("Secretary of State"));
  assert(!STATE_OFFICES.includes("Secretary of Defense"));
  assert(!STATE_OFFICES.includes("Attorney General"));
  assert(STATE_OFFICES.includes("State Attorney General"));
  assert.deepEqual(["executive", "governors", "senate", "house", "other"].map(federalChamberOffice), ["executive", "governor", "us-senate", "us-house", ""]);
  assert(allowedOfficeValues("national")?.includes("executive"));
  assert(!allowedOfficeValues("national")?.includes("state-house"));
});

test("scope is validated and cursors cannot cross directory populations", () => {
  const filters = normalizeDirectoryFilters({ ...empty, scope: "state" });
  const cursor = encodeDirectoryCursor({ name: "Test Name", id: "00000000-0000-0000-0000-000000000001", weekNumber: 202644 }, filters);
  assert(decodeDirectoryCursor(cursor, filters));
  assert.throws(() => decodeDirectoryCursor(cursor, { ...empty, scope: "national" }));
  assert.throws(() => decodeDirectoryCursor(cursor, empty));
  assert.throws(() => normalizeDirectoryFilters({ scope: "arbitrary" }));
});

test("executive search does not mistake vice president for president", () => {
  assert.equal(parseDirectorySearch("vice president").filters.office, "vice-president");
  assert.equal(parseDirectorySearch("cabinet").filters.office, "executive");
  assert.equal(parseDirectorySearch("executive branch").filters.office, "executive");
});


test("full executive titles resolve as offices, including combined state searches", () => {
  assert.deepEqual(parseDirectorySearch("Secretary of State").filters, { q: "", state: "", office: "office-secretary-of-state" });
  assert.deepEqual(parseDirectorySearch("Attorney General DC").filters, { q: "", state: "DC", office: "office-attorney-general" });
  assert.equal(parseDirectorySearch("Secretary of Defense").filters.office, "office-secretary-of-defense");
  assert.deepEqual(parseDirectorySearch("California State Secretary of State").filters, { q: "", state: "CA", office: "office-state-secretary-of-state" });
  assert.equal(parseDirectorySearch("Lieutenant Governor").filters.office, "office-lieutenant-governor");
});
