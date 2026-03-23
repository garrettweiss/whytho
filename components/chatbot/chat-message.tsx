"use client";

import type { Message } from "ai";

interface ChatMessageProps {
  message: Message;
}

/** Renders a single chat message with basic formatting. */
export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  // Split on double newline for paragraph breaks, single newline preserved
  const content = typeof message.content === "string" ? message.content : "";

  if (!content && message.role === "assistant") {
    // Tool-call-only step — show nothing (streamText handles continuations)
    return null;
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`
          max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed
          ${
            isUser
              ? "bg-primary text-primary-foreground rounded-br-sm"
              : "bg-muted text-foreground rounded-bl-sm"
          }
        `}
      >
        {content.split("\n\n").map((paragraph, i) => (
          <p key={i} className={i > 0 ? "mt-2" : ""}>
            {paragraph.split("\n").map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {line}
              </span>
            ))}
          </p>
        ))}
      </div>
    </div>
  );
}

/** Animated typing indicator shown while Claude is thinking. */
export function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-3 flex gap-1 items-center">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
