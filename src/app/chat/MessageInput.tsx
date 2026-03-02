import { useState, useRef, useCallback, useEffect, type KeyboardEvent, type DragEvent } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useAgentStore } from "@/stores/agentStore";
import { MODELS } from "@/types/model";
import { Send, Square, ChevronDown, Brain, Paperclip, X, Image, FileText } from "lucide-react";
import { AgentToggle } from "@/app/agent/AgentToggle";
import type { Attachment } from "@/types/message";

/** Max file size: 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error(`文件 "${file.name}" 超过 10MB 限制`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1] ?? "";
      resolve({
        type: SUPPORTED_IMAGE_TYPES.includes(file.type) ? "image" : "file",
        name: file.name,
        mime_type: file.type || "application/octet-stream",
        data: base64,
        size: file.size,
      });
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

export function MessageInput() {
  const [text, setText] = useState("");
  const [modelId, setModelId] = useState("claude-sonnet-4-5");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [enableThinking, setEnableThinking] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close model picker on outside click
  useEffect(() => {
    if (!showModelPicker) return;
    const handleClick = () => setShowModelPicker(false);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [showModelPicker]);

  const agentEnabled = useAgentStore((s) => s.enabled);
  const setAgentEnabled = useAgentStore((s) => s.setEnabled);

  const isStreaming = useChatStore((s) => s.isStreaming);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const cancelStream = useChatStore((s) => s.cancelStream);

  const selectedModel = MODELS.find((m) => m.id === modelId) ?? MODELS[1]!;

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const newAttachments: Attachment[] = [];
    for (const file of fileArray) {
      try {
        const att = await fileToAttachment(file);
        newAttachments.push(att);
      } catch (err) {
        console.error("Failed to process file:", err);
      }
    }
    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if ((!trimmed && attachments.length === 0) || isStreaming) return;
    // Include attachment info in the message content
    let messageContent = trimmed;
    if (attachments.length > 0) {
      const fileList = attachments
        .map((a) => `[${a.type === "image" ? "Image" : "File"}: ${a.name} (${(a.size / 1024).toFixed(1)}KB)]`)
        .join("\n");
      messageContent = messageContent
        ? `${messageContent}\n\n${fileList}`
        : fileList;
    }
    sendMessage(messageContent, modelId, enableThinking);
    setText("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text, attachments, modelId, enableThinking, isStreaming, sendMessage]);

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
    <div
      className={`p-4 border-t transition-colors relative ${isDragging ? "border-accent bg-accent/5" : "border-border"}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.txt,.md,.json,.csv,.xml,.html,.js,.ts,.py,.rs,.go,.java,.c,.cpp,.h"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg-primary/80 border-2 border-dashed border-accent rounded-[var(--radius-md)] pointer-events-none">
          <div className="text-center">
            <Image size={32} className="text-accent mx-auto mb-2" />
            <p className="text-sm font-medium text-accent">拖放文件到这里</p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1">
            {attachments.map((att, idx) => (
              <div
                key={`${att.name}-${idx}`}
                className="flex items-center gap-1.5 bg-bg-elevated border border-border rounded-[var(--radius-sm)] px-2 py-1 text-xs group"
              >
                {att.type === "image" ? (
                  <Image size={12} className="text-accent flex-shrink-0" />
                ) : (
                  <FileText size={12} className="text-text-muted flex-shrink-0" />
                )}
                <span className="text-text-secondary truncate max-w-[120px]">{att.name}</span>
                <span className="text-text-muted">({(att.size / 1024).toFixed(0)}KB)</span>
                <button
                  onClick={() => removeAttachment(idx)}
                  className="text-text-muted hover:text-error transition-colors ml-0.5"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="flex items-end gap-2 bg-bg-elevated rounded-[var(--radius-md)] p-3">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="输入消息...（Enter 发送，Shift+Enter 换行）"
            className="flex-1 bg-transparent text-text-primary text-sm resize-none outline-none placeholder:text-text-muted min-h-[24px] max-h-[200px] leading-relaxed"
            rows={1}
            disabled={isStreaming}
          />

          {isStreaming ? (
            <button
              onClick={cancelStream}
              className="p-2 rounded-[var(--radius-sm)] bg-error/20 text-error hover:bg-error/30 transition-colors"
              title="停止生成"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!text.trim() && attachments.length === 0}
              className="p-2 rounded-[var(--radius-sm)] bg-accent text-text-inverse hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="发送消息"
            >
              <Send size={16} />
            </button>
          )}
        </div>

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            {/* Attach file button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 text-xs text-text-muted hover:text-text-secondary transition-colors px-2 py-1 rounded hover:bg-bg-hover"
              title="添加附件"
            >
              <Paperclip size={12} />
            </button>

            {/* Model selector */}
            <div className="relative">
              <button
                onClick={(e) => { e.stopPropagation(); setShowModelPicker(!showModelPicker); }}
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
                title="深度思考"
              >
                <Brain size={12} />
                <span>思考中</span>
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
