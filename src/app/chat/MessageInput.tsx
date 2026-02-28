import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useAgentStore } from "@/stores/agentStore";
import { MODELS } from "@/types/model";
import { Send, Square, ChevronDown, Brain } from "lucide-react";
import { AgentToggle } from "@/app/agent/AgentToggle";

export function MessageInput() {
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState("claude-sonnet-4-5");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [enableThinking, setEnableThinking] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const agentEnabled = useAgentStore((s) => s.enabled);
  const setAgentEnabled = useAgentStore((s) => s.setEnabled);

  const isStreaming = useChatStore((s) => s.isStreaming);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const cancelStream = useChatStore((s) => s.cancelStream);

  const selectedModel = MODELS.find((m) => m.id === modelId) ?? MODELS[1]!;

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed, modelId, enableThinking);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, modelId, enableThinking, isStreaming, sendMessage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  };

  return (
    <div className="p-4 border-t border-border">
      <div className="flex flex-col gap-2">
        {/* Input area */}
        <div className="flex items-end gap-2 bg-bg-elevated rounded-[var(--radius-md)] p-3">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Send a message... (Enter to send, Shift+Enter for newline)"
            className="flex-1 bg-transparent text-text-primary text-sm resize-none outline-none placeholder:text-text-muted min-h-[24px] max-h-[200px] leading-relaxed"
            rows={1}
            disabled={isStreaming}
          />

          {isStreaming ? (
            <button
              onClick={cancelStream}
              className="p-2 rounded-[var(--radius-sm)] bg-error/20 text-error hover:bg-error/30 transition-colors"
              title="Stop generating"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!text.trim()}
              className="p-2 rounded-[var(--radius-sm)] bg-accent text-text-inverse hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Send message"
            >
              <Send size={16} />
            </button>
          )}
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            {/* Model selector */}
            <div className="relative">
              <button
                onClick={() => setShowModelPicker(!showModelPicker)}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors px-2 py-1 rounded hover:bg-bg-hover"
              >
                <span>{selectedModel.name}</span>
                <ChevronDown size={12} />
              </button>

              {showModelPicker && (
                <div className="absolute bottom-full left-0 mb-1 bg-bg-elevated border border-border rounded-[var(--radius-sm)] shadow-lg py-1 min-w-[200px] z-50">
                  {MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setModelId(model.id);
                        setShowModelPicker(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-bg-hover transition-colors ${
                        model.id === modelId ? "text-accent" : "text-text-primary"
                      }`}
                    >
                      <div className="font-medium">{model.name}</div>
                      <div className="text-xs text-text-muted">{model.description}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Agent toggle */}
            <AgentToggle
              enabled={agentEnabled}
              onToggle={() => setAgentEnabled(!agentEnabled)}
            />

            {/* Thinking toggle */}
            {selectedModel.capabilities.extended_thinking && (
              <button
                onClick={() => setEnableThinking(!enableThinking)}
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                  enableThinking
                    ? "text-accent bg-accent/10"
                    : "text-text-muted hover:text-text-secondary hover:bg-bg-hover"
                }`}
                title="Extended Thinking"
              >
                <Brain size={12} />
                <span>Thinking</span>
              </button>
            )}
          </div>

          <div className="text-xs text-text-muted">
            {text.length > 0 && <span>~{Math.ceil(text.length / 4)} tokens</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
