import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { useChatStore } from "@/stores/chatStore";
import { Search, ArrowRight, MessageSquare } from "lucide-react";

interface Props {
  onClose: () => void;
}

export function SpotlightWindow({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const createConversation = useChatStore((s) => s.createConversation);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const conversations = useChatStore((s) => s.conversations);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;

    // Create new conversation and send message
    const convId = await createConversation();
    await setActiveConversation(convId);
    sendMessage(trimmed, "claude-sonnet-4-5", false);
    onClose();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  // Filter recent conversations for quick access
  const recentConversations = conversations.slice(0, 5);

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div
        className="bg-bg-primary border border-border rounded-[var(--radius-lg)] w-[600px] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search size={18} className="text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Claude anything..."
            className="flex-1 bg-transparent text-text-primary text-base outline-none placeholder:text-text-muted"
          />
          {query.trim() && (
            <button
              onClick={handleSubmit}
              className="p-1.5 bg-accent text-text-inverse rounded-[var(--radius-sm)] hover:bg-accent-hover transition-colors"
            >
              <ArrowRight size={14} />
            </button>
          )}
        </div>

        {/* Recent conversations */}
        {recentConversations.length > 0 && !query && (
          <div className="p-2">
            <div className="text-[10px] text-text-muted uppercase tracking-wider px-2 py-1">
              Recent Conversations
            </div>
            {recentConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => {
                  setActiveConversation(conv.id);
                  onClose();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] hover:bg-bg-hover transition-colors text-left"
              >
                <MessageSquare size={14} className="text-text-muted flex-shrink-0" />
                <span className="text-sm text-text-primary truncate">
                  {conv.title || "Untitled"}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Quick actions when searching */}
        {query && (
          <div className="p-2">
            <button
              onClick={handleSubmit}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius-sm)] hover:bg-bg-hover transition-colors text-left"
            >
              <ArrowRight size={14} className="text-accent flex-shrink-0" />
              <span className="text-sm text-text-primary">
                Send as new conversation
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
