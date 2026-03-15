import { createAdminClient } from "@/lib/supabase/server";

interface AuditLogEntry {
  model: string;
  operation: string;
  input_tokens: number;
  output_tokens: number;
  prompt_hash?: string;
  related_id?: string;
  related_type?: string;
  result_summary?: string;
}

/**
 * Log every AI call to ai_audit_log — retained indefinitely per product rules.
 * Fire-and-forget: never throws so a logging failure can't block the main flow.
 */
export async function logAICall(entry: AuditLogEntry): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("ai_audit_log").insert({
      model: entry.model,
      operation: entry.operation,
      input_tokens: entry.input_tokens,
      output_tokens: entry.output_tokens,
      prompt_hash: entry.prompt_hash ?? null,
      related_id: entry.related_id ?? null,
      related_type: entry.related_type ?? null,
      result_summary: entry.result_summary ?? null,
    });
  } catch {
    // Intentionally silent — logging must never break the main flow
  }
}

/** Simple hash for prompt deduplication detection in the audit log */
export function hashPrompt(prompt: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(prompt.length, 1000); i++) {
    const char = prompt.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // convert to 32-bit int
  }
  return Math.abs(hash).toString(16);
}
