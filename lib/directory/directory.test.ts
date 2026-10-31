import assert from "node:assert/strict";
import test from "node:test";
import { decodeDirectoryCursor, encodeDirectoryCursor, readEmbeddedCount } from "./cursor";
import { arrangeDirectoryPeople } from "./presentation";
import { escapeLike, normalizeDirectoryFilters, parseDirectorySearch, quoteFilterValue, stateRecordValues } from "./search";
import { DirectoryInputError, type DirectoryFilters } from "./types";

test("search distinguishes federal and state offices and combined jurisdictions", () => {
  assert.deepEqual(parseDirectorySearch("California state senator").filters, { q: "", state: "CA", office: "state-senate" });
  assert.deepEqual(parseDirectorySearch("CA Congress House").filters, { q: "", state: "CA", office: "us-house" });
  assert.deepEqual(parseDirectorySearch("West Virginia U.S. Senate").filters, { q: "", state: "WV", office: "us-senate" });
  assert.deepEqual(parseDirectorySearch("California senate"), { filters: { q: "", state: "CA", office: "" }, officeChoices: ["us-senate", "state-senate"] });
  assert.deepEqual(parseDirectorySearch("ca senate"), { filters: { q: "", state: "CA", office: "" }, officeChoices: ["us-senate", "state-senate"] });
  assert.deepEqual(parseDirectorySearch("house").officeChoices, ["us-house", "state-house"]);
});

test("people, aliases, names with punctuation and state codes survive interpretation", () => {
  assert.equal(parseDirectorySearch("AOC").filters.q, "Alexandria Ocasio-Cortez");
  assert.equal(parseDirectorySearch("O'Rourke").filters.q, "O'Rourke");
  assert.equal(parseDirectorySearch("Lisa McCormick").filters.q, "Lisa McCormick");
  assert.deepEqual(parseDirectorySearch("Virginia Foxx").filters, { q: "Virginia Foxx", state: "", office: "" });
  assert.deepEqual(parseDirectorySearch("AL GREEN").filters, { q: "AL GREEN", state: "", office: "" });
  assert.equal(parseDirectorySearch("Washington Jones").filters.q, "Washington Jones");
  assert.equal(parseDirectorySearch("Washington").filters.state, "WA");
  assert.equal(parseDirectorySearch("new-york").filters.state, "NY");
  assert.equal(parseDirectorySearch("CA").filters.state, "CA");
  assert.deepEqual(stateRecordValues("CA"), ["CA", "California"]);
});

test("validation rejects overlong, control, unknown state and unknown office filters", () => {
  for (const input of [{ q: "a".repeat(101) }, { q: "name\nnext" }, { state: "Atlantis" }, { office: "senate" }]) {
    assert.throws(() => normalizeDirectoryFilters(input), DirectoryInputError);
  }
  assert.equal(normalizeDirectoryFilters({ state: "new-york" }).state, "NY");
});

test("cursor round trips names safely and is tied to all active filters", () => {
  const filters: DirectoryFilters = { q: "O'Neil", state: "CA", office: "us-house" };
  const cursor = { name: 'O\'Neil, "Junior" \\ Test', id: "127cdf41-9370-4aa7-82fc-c31936aac111", weekNumber: 202644 };
  const value = encodeDirectoryCursor(cursor, filters);
  assert.deepEqual(decodeDirectoryCursor(value, filters), cursor);
  for (const changed of [{ ...filters, q: "different" }, { ...filters, state: "NY" }, { ...filters, office: "us-senate" }]) {
    assert.throws(() => decodeDirectoryCursor(value, changed), DirectoryInputError);
  }
  for (const malformed of ["%", "a".repeat(1201), Buffer.from('{}').toString("base64url"), value + "="]) {
    assert.throws(() => decodeDirectoryCursor(malformed, filters), DirectoryInputError);
  }
  assert.equal(decodeDirectoryCursor(undefined, filters), null);
});

test("pagination preserves its question cohort across weekly resets and rejects malformed weeks", () => {
  const filters: DirectoryFilters = { q: "", state: "", office: "" };
  const cursor = { name: "Same Name", id: "127cdf41-9370-4aa7-82fc-c31936aac111", weekNumber: 202653 };
  assert.equal(decodeDirectoryCursor(encodeDirectoryCursor(cursor, filters), filters)?.weekNumber, 202653);
  for (const weekNumber of [0, 202600, 202654, 202601.5, 999999]) {
    assert.throws(() => decodeDirectoryCursor(encodeDirectoryCursor({ ...cursor, weekNumber }, filters), filters), DirectoryInputError);
  }
});

test("PostgREST grammar and SQL wildcards are escaped independently", () => {
  assert.equal(escapeLike("100%_\\"), "100\\%\\_\\\\");
  assert.equal(quoteFilterValue('x",id.gt.0)\\'), '"x\\",id.gt.0)\\\\"');
});

test("unknown or partial metrics fail closed instead of claiming no response", () => {
  assert.equal(readEmbeddedCount([{ count: 0 }]), 0);
  assert.equal(readEmbeddedCount([{ count: 2400 }]), 2400);
  for (const invalid of [null, [], [{ count: null }], [{ count: -1 }], [{ count: 1.5 }], [{ count: 1 }, { count: 2 }], [{ count: "0" }]]) {
    assert.throws(() => readEmbeddedCount(invalid));
  }
});

test("portrait presentation keeps every person, preserves group order and leaves source order unchanged", () => {
  const people = [
    { id: "a", photo_url: null },
    { id: "b", photo_url: "https://example.com/b.jpg" },
    { id: "c", photo_url: null },
    { id: "d", photo_url: "https://example.com/d.jpg" },
    { id: "e", photo_url: null },
  ];
  const arranged = arrangeDirectoryPeople(people);
  assert.deepEqual(arranged.map((person) => person.id), ["b", "d", "a", "c", "e"]);
  assert.deepEqual(people.map((person) => person.id), ["a", "b", "c", "d", "e"]);
  assert.notEqual(arranged, people);
  assert.equal(arranged.length, people.length);
  assert.equal(new Set(arranged).size, people.length);
  assert.deepEqual(arrangeDirectoryPeople([]), []);
  assert.deepEqual(arrangeDirectoryPeople(people.filter((person) => !person.photo_url)), [people[0], people[2], people[4]]);
});
