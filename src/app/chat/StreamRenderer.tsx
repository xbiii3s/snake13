import { useChatStore } from "@/stores/chatStore";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { Brain, ChevronDown, ChevronRight, Bot, Loader } from "lucide-react";
import { useState } from "react";

export function StreamRenderer() {
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streaming = useChatStore((s) => s.streaming);
  const [thinkingOpen, setThinkingOpen] = useState(true);

  if (!isStreaming) return null;

  return (
    <div className="flex gap-3 px-4 py-3">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0 mt-1">
        <Bot size={14} className="text-accent" />
      </div>

      <div className="flex flex-col max-w-[80%] min-w-0">
        {/* Thinking section */}
        {(streaming.isThinking || streaming.thinkingText) && (
          <div className="mb-2">
            <button
              onClick={() => setThinkingOpen(!thinkingOpen)}
              className="flex items-center gap-1.5 text-xs text-accent/80 mb-1"
            >
              <Brain size={12} />
              {thinkingOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>
                {streaming.isThinking ? "Thinking..." : `Thought for ${(streaming.thinkingDuration / 1000).toFixed(1)}s`}
              </span>
              {streaming.isThinking && (
                <Loader size={10} className="animate-spin" />
              )}
            </button>
            {thinkingOpen && streaming.thinkingText && (
              <div className="bg-bg-secondary/50 border border-border rounded-[var(--radius-sm)] p-3 text-xs text-text-muted italic leading-relaxed">
                {streaming.thinkingText}
                {streaming.isThinking && <span className="animate-pulse ml-0.5">|</span>}
              </div>
            )}
          </div>
        )}

        {/* Content section */}
        {streaming.contentText && (
          <div>
            <MarkdownRenderer content={streaming.contentText} />
            <span className="inline-block w-2 h-4 bg-accent/60 animate-pulse ml-0.5 align-text-bottom" />
          </div>
        )}

        {/* Loading indicator when no content yet */}
        {!streaming.contentText && !streaming.isThinking && !streaming.thinkingText && (
          <div className="flex items-center gap-2 text-text-muted text-sm py-2">
            <Loader size={14} className="animate-spin" />
            <span>Generating...</span>
          </div>
        )}
      </div>
    </div>
  );
}
