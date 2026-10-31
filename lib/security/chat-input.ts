export type ChatMessageInput = { role: "user" | "assistant"; content: string };
export function parseChatRequest(value: unknown): { messages: ChatMessageInput[]; pageContext: string | null } | null {
  if (!value || typeof value!=="object" || Array.isArray(value)) return null;
  const input=value as {messages?:unknown;pageContext?:unknown};
  if (!Array.isArray(input.messages) || input.messages.length<1 || input.messages.length>40) return null;
  let total=0;const messages:ChatMessageInput[]=[];
  for (const message of input.messages) {
    if (!message || typeof message!=="object" || !["user","assistant"].includes(message.role) || typeof message.content!=="string" || message.content.length>4000) return null;
    total+=message.content.length;
    if (total>24000) return null;
    // Copy only text and allowed roles. Never accept client tool results or system prompts.
    messages.push({role:message.role,content:message.content});
  }
  if (messages.at(-1)?.role!=="user") return null;
  if (input.pageContext!=null && (typeof input.pageContext!=="string" || input.pageContext.length>200)) return null;
  return {messages,pageContext:typeof input.pageContext==="string"?input.pageContext:null};
}
