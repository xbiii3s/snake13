import { useEffect, useRef } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useAgentStore } from "@/stores/agentStore";
import { VirtualMessageBubble } from "./VirtualMessageBubble";
import { StreamRenderer } from "./StreamRenderer";
import { MessageInput } from "./MessageInput";
import { ToolCallCard } from "@/app/agent/ToolCallCard";
import { MessageSquare } from "lucide-react";
import { TemplatePicker } from "@/app/templates/TemplatePicker";
import { useVirtualMessages } from "@/hooks/useVirtualMessages";
import type { Message } from "@/types/message";

/** Stable empty array to prevent infinite re-render in useVirtualMessages */
const EMPTY_MESSAGES: Message[] = [];

export function ChatWindow() {
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const messages = useChatStore((s) =>
    s.activeConversationId ? (s.messages[s.activeConversationId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES,
  );
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingContent = useChatStore((s) => s.streaming.contentText);
  const agentCalls = useAgentStore((s) => s.activeCalls);
  const scrollRef = useRef<HTMLDivElement>(null);

  const {
    visibleMessages,
    topPadding,
    bottomPadding,
    measureMessage,
    isVirtualized,
    totalCount,
    renderedCount,
  } = useVirtualMessages(messages, scrollRef);

  // Auto-scroll to bottom when new messages or streaming content arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isStreaming, streamingContent]);

  if (!activeConversationId) {
    return (
      <div className="flex-1 flex flex-col">
        <EmptyState />
        <MessageInput />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
      >
        <div className="max-w-3xl mx-auto py-4">
          {messages.length === 0 && !isStreaming && (
            <div className="text-center py-12">
              <p className="text-sm text-text-muted">发送消息开始对话。</p>
            </div>
          )}

          {/* Virtual scroll top spacer */}
          {topPadding > 0 && <div style={{ height: topPadding }} />}

          {visibleMessages.map((msg) => (
            <VirtualMessageBubble
              key={msg.id}
              message={msg}
              onMeasure={measureMessage}
            />
          ))}

          {/* Virtual scroll bottom spacer */}
          {bottomPadding > 0 && <div style={{ height: bottomPadding }} />}

          {/* Agent tool calls */}
          {agentCalls.length > 0 && (
            <div className="px-4 py-2">
              {agentCalls.map((call) => (
                <ToolCallCard key={call.id} call={call} />
              ))}
            </div>
          )}

          <StreamRenderer />
        </div>
      </div>

      {/* Input + virtual scroll indicator */}
      <MessageInput />
      {isVirtualized && (
        <div className="text-center text-[10px] text-text-muted pb-1">
          显示 {renderedCount} / {totalCount} 条消息
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  const createConversation = useChatStore((s) => s.createConversation);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4 max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
          <MessageSquare size={28} className="text-accent" />
        </div>
        <h2 className="text-xl font-semibold text-text-primary">Claude Desktop Pro</h2>
        <p className="text-sm text-text-muted leading-relaxed">
          高性能 macOS Claude AI 桌面客户端，支持智能体和 MCP 协议。
        </p>
        <button
          onClick={() => createConversation()}
          className="px-6 py-2.5 rounded-[var(--radius-md)] bg-accent text-text-inverse text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          开始对话
        </button>

        <div className="mt-8">
          <TemplatePicker />
        </div>
      </div>
    </div>
  );
}
