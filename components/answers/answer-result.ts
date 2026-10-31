export type SavedAnswerResult = { answerId: string; isDraft: boolean };

/** The API, rather than the client's role hint, confirms publication. */
export function parseSavedAnswerResult(value: unknown): SavedAnswerResult {
  const result = value as Record<string, unknown> | null;
  if (!result || typeof result !== "object" || result.success !== true ||
    typeof result.answer_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.answer_id) ||
    typeof result.is_draft !== "boolean") {
    throw new Error("Your response may have been saved, but we could not confirm its status. Refresh to check before submitting again.");
  }
  return { answerId: result.answer_id, isDraft: result.is_draft };
}
