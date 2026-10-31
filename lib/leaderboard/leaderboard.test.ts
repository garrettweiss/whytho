import assert from "node:assert/strict";
import test from "node:test";
import { collectCompletePages, leaderboardDisplayPage, rankOfficialResponses } from "./ranking";
import type { OfficialAnswerReference, RankingPolitician, RankingQuestion } from "./types";

const WEEK = 202644;
function politician(id: string, changes: Partial<RankingPolitician> = {}): RankingPolitician {
  return { id, slug: id, full_name: id, office: "U.S. Senator", state: "CA", party: null, photo_url: null, is_active: true, is_test: false, is_candidate: false, politician_type: "elected", ...changes };
}
function question(id: string, person: RankingPolitician, changes: Partial<RankingQuestion> = {}): RankingQuestion {
  return { id, politician_id: person.id, politicians: person, week_number: WEEK, net_upvotes: 10, status: "active", ...changes };
}
function answer(id: string, questionId: string, politicianId: string, changes: Partial<OfficialAnswerReference> = {}): OfficialAnswerReference {
  return { id, question_id: questionId, politician_id: politicianId, answer_type: "direct", is_ai_generated: false, is_draft: false, ...changes };
}

test("ranking counts distinct qualifying questions and only matching published official answers", () => {
  const person = politician("person");
  const first = question("q1", person);
  const questions = [first, first, question("q2", person), question("q3", person)];
  const answers = [answer("a1", "q1", person.id), answer("a2", "q1", person.id, { answer_type: "team_statement" }),
    answer("ai", "q2", person.id, { answer_type: "ai_analysis", is_ai_generated: true }),
    answer("draft", "q2", person.id, { is_draft: true }),
    answer("wrong-owner", "q3", "different"), answer("unknown", "missing", person.id)];
  const before = JSON.stringify({ questions, answers });
  const ranking = rankOfficialResponses(questions, answers, WEEK);
  assert.equal(ranking.length, 1);
  assert.equal(ranking[0]?.qualifyingQuestions, 3);
  assert.equal(ranking[0]?.answeredQualifying, 1);
  assert.ok(Math.abs((ranking[0]?.responseRate ?? 0) - 100 / 3) < 1e-9);
  assert.equal(JSON.stringify({ questions, answers }), before);
});

test("eligibility excludes low-vote, removed, other-week, inactive and test records", () => {
  const person = politician("person");
  const questions = [question("low", person, { net_upvotes: 9 }), question("removed", person, { status: "removed" }),
    question("older", person, { week_number: 202643 }), question("test", politician("test", { is_test: true })),
    question("inactive", politician("inactive", { is_active: false }))];
  assert.deepEqual(rankOfficialResponses(questions, [], WEEK), []);
  assert.equal(rankOfficialResponses([question("qualifies", person)], [], WEEK)[0]?.responseRate, 0);
});

test("equal rates share competition rank and volume only changes display order", () => {
  const a = politician("Alpha"), b = politician("Beta"), c = politician("Charlie"), d = politician("Delta");
  const questions = [question("a1", a), question("a2", a), ...[1,2,3,4].map(n => question(`b${n}`, b)), question("c1", c), question("d1", d)];
  const answers = [answer("aa", "a1", a.id), answer("ab1", "b1", b.id), answer("ab2", "b2", b.id), answer("ad", "d1", d.id)];
  const ranking = rankOfficialResponses(questions, answers, WEEK);
  assert.deepEqual(ranking.map(row => [row.full_name, row.responseRate, row.rank]), [["Delta", 100, 1], ["Beta", 50, 2], ["Alpha", 50, 2], ["Charlie", 0, 4]]);
});

test("all-zero rates share a rank without creating a false most-responsive ordering", () => {
  const ranking = rankOfficialResponses([question("a", politician("A")), question("b", politician("B"))], [], WEEK);
  assert.deepEqual(ranking.map(row => row.rank), [1, 1]);
});

test("complete paging includes eligible politicians beyond the first 1,000", async () => {
  const all = Array.from({ length: 1501 }, (_, index) => question(String(index).padStart(5, "0"), politician(`p${index}`)));
  let calls = 0;
  const questions = await collectCompletePages(async (after) => {
    calls += 1;
    return all.filter(row => after === null || row.id > after).slice(0, 500);
  });
  assert.equal(calls, 4);
  assert.equal(questions.length, 1501);
  const ranking = rankOfficialResponses(questions, [answer("last-answer", "01500", "p1500")], WEEK);
  assert.equal(ranking.length, 1501);
  assert.equal(ranking[0]?.id, "p1500");
  assert.equal(ranking[0]?.responseRate, 100);
});

test("paging proves the end of an exact full page and rejects incomplete or non-advancing scans", async () => {
  let calls = 0;
  const result = await collectCompletePages(async (after) => { calls += 1; return after === null ? [{ id: "a" }, { id: "b" }] : []; }, 2);
  assert.equal(calls, 2);
  assert.equal(result.length, 2);
  await assert.rejects(collectCompletePages(async () => [{ id: "a" }, { id: "b" }], 2), /did not advance/);
  await assert.rejects(collectCompletePages(async (after) => { if (after) throw new Error("read failed"); return [{ id: "a" }, { id: "b" }]; }, 2), /read failed/);
  await assert.rejects(collectCompletePages(async () => [{ id: "a" }, { id: "b" }], 1), /exceeded/);
});

test("display pagination does not alter ranks or accept unbounded page values", () => {
  assert.equal(leaderboardDisplayPage("2", 1501), 2);
  assert.equal(leaderboardDisplayPage("999999", 1501), 31);
  for (const value of ["-1", "2x", "1e3", "99999999999999", undefined]) assert.equal(leaderboardDisplayPage(value, 1501), 1);
  assert.equal(leaderboardDisplayPage("2", 0), 1);
});
