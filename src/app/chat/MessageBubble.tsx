import { useState } from "react";
import type { Message } from "@/types/message";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { Copy, Check, ChevronDown, ChevronRight, Brain, User, Bot, GitBranch } from "lucide-react";
import { useChatStore } from "@/stores/chatStore";
import * as ipc from "@/lib/ipc";

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const [copied, setCopied] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);

  const isUser = message.role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex gap-3 px-4 py-3 group ${isUser ? "justify-end" : ""}`}>
      {/* Avatar */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 mt-1">
          <Bot size={14} className="text-accent" />
        </div>
      )}

      <div className={`flex flex-col max-w-[80%] min-w-0 ${isUser ? "items-end" : ""}`}>
        {/* Thinking block */}
        {message.thinking_content && (
          <div className="mb-2 w-full">
            <button
              onClick={() => setThinkingOpen(!thinkingOpen)}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors mb-1"
            >
              <Brain size={12} />
              {thinkingOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>
                Thinking
                {message.thinking_duration_ms
                  ? ` (${(message.thinking_duration_ms / 1000).toFixed(1)}s)`
                  : ""}
              </span>
            </button>
            {thinkingOpen && (
              <div className="bg-bg-secondary/50 border border-border rounded-[var(--radius-sm)] p-3 text-xs text-text-muted italic leading-relaxed">
                {message.thinking_content}
              </div>
            )}
          </div>
        )}

        {/* Message content */}
        <div
          className={`rounded-[var(--radius-md)] px-4 py-3 ${
            isUser
              ? "bg-accent/15 text-text-primary"
              : "bg-transparent"
          }`}
        >
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <MarkdownRenderer content={message.content} />
          )}
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-2 mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleCopy}
            className="text-text-muted hover:text-text-secondary transition-colors p-1"
            title="Copy"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>

          <button
            onClick={async () => {
              const forked = await ipc.forkConversation(message.conversation_id, message.id);
              useChatStore.getState().loadConversations();
              useChatStore.getState().setActiveConversation(forked.id);
            }}
            className="text-text-muted hover:text-text-secondary transition-colors p-1"
            title="Fork from here"
          >
            <GitBranch size={12} />
          </button>

          {!isUser && message.tokens_out > 0 && (
            <span className="text-[10px] text-text-muted">
              {message.tokens_in}↑ {message.tokens_out}↓
              {message.cost > 0 && ` · $${message.cost.toFixed(4)}`}
            </span>
          )}

          {message.model_used && (
            <span className="text-[10px] text-text-muted">{message.model_used}</span>
          )}
        </div>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-bg-elevated flex items-center justify-center flex-shrink-0 mt-1">
          <User size={14} className="text-text-secondary" />
        </div>
      )}
    </div>
  );
}
