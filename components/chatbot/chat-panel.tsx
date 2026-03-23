"use client";

import { useChat } from "ai/react";
import { useEffect, useRef } from "react";
import { Send } from "lucide-react";
import { ChatMessage, TypingIndicator } from "./chat-message";

interface ChatPanelProps {
  pageContext: string | null;
  onClose: () => void;
}

const SUGGESTED_PROMPTS = [
  "How does WhyTho work?",
  "Who has the highest response rate?",
  "What happens when a politician doesn't answer?",
];

export function ChatPanel({ pageContext, onClose }: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat({
    api: "/api/chat",
    body: { pageContext },
    initialMessages: [
      {
        id: "welcome",
        role: "assistant",
        content: pageContext
          ? `Hi! I can help you explore questions and answers on this page, or answer anything about WhyTho. What would you like to know?`
          : "Hi! I'm the WhyTho Assistant. I can help you find politicians, explore their question records, answer questions about the platform, or post questions directly to a representative. What would you like to do?",
      },
    ],
  });

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const showSuggestions = messages.length <= 1 && !isLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card shrink-0">
        <div>
          <p className="text-sm font-semibold">WhyTho Assistant</p>
          <p className="text-xs text-muted-foreground">Ask anything about the platform or politicians</p>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
          aria-label="Close chat"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M12 4L4 12M4 4l8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} />
        ))}

        {isLoading && <TypingIndicator />}

        {error && (
          <p className="text-xs text-destructive text-center py-1">
            Something went wrong. Please try again.
          </p>
        )}

        {/* Suggested prompts */}
        {showSuggestions && (
          <div className="space-y-1.5 pt-1">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => {
                  const syntheticEvent = {
                    preventDefault: () => {},
                    target: { value: prompt },
                  } as unknown as React.ChangeEvent<HTMLInputElement>;
                  handleInputChange(syntheticEvent);
                  setTimeout(() => {
                    document
                      .querySelector<HTMLFormElement>("#chatbot-form")
                      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
                  }, 0);
                }}
                className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        id="chatbot-form"
        onSubmit={handleSubmit}
        className="px-3 py-3 border-t bg-card shrink-0"
      >
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as unknown as React.FormEvent<HTMLFormElement>);
              }
            }}
            placeholder="Ask about a politician, the platform..."
            rows={1}
            className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring min-h-[36px] max-h-[120px] overflow-y-auto"
            style={{ height: "36px" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "36px";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="shrink-0 w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity hover:opacity-90"
            aria-label="Send message"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/50 text-center mt-1.5">
          Politician summaries are based only on verified platform data.
        </p>
      </form>
    </div>
  );
}
