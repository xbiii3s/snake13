import { create } from "zustand";
import type { Conversation, CreateConversation } from "@/types/conversation";
import type { Message } from "@/types/message";
import type { StreamEvent, Usage } from "@/types/stream";
import * as ipc from "@/lib/ipc";
import { useAuthStore } from "@/stores/authStore";

interface StreamingState {
  thinkingText: string;
  contentText: string;
  isThinking: boolean;
  thinkingDuration: number;
}

interface ChatState {
  // Data
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;

  // Streaming
  isStreaming: boolean;
  streaming: StreamingState;
  lastUsage: Usage | null;

  // Actions
  loadConversations: () => Promise<void>;
  createConversation: (input?: CreateConversation) => Promise<string>;
  setActiveConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessage: (content: string, modelId: string, enableThinking?: boolean) => Promise<void>;
  cancelStream: () => void;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
}

export const useChatStore = create<ChatState>()((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  isStreaming: false,
  streaming: {
    thinkingText: "",
    contentText: "",
    isThinking: false,
    thinkingDuration: 0,
  },
  lastUsage: null,

  loadConversations: async () => {
    const conversations = await ipc.listConversations();
    set({ conversations });
  },

  createConversation: async (input) => {
    const conv = await ipc.createConversation(input ?? {});
    set((state) => ({
      conversations: [conv, ...state.conversations],
      activeConversationId: conv.id,
      messages: { ...state.messages, [conv.id]: [] },
    }));
    return conv.id;
  },

  setActiveConversation: async (id) => {
    set({ activeConversationId: id });

    // Load messages if not cached
    if (!get().messages[id]) {
      const messages = await ipc.listMessages(id);
      set((state) => ({
        messages: { ...state.messages, [id]: messages },
      }));
    }
  },

  deleteConversation: async (id) => {
    await ipc.deleteConversation(id);
    set((state) => {
      const conversations = state.conversations.filter((c) => c.id !== id);
      const newMessages = { ...state.messages };
      delete newMessages[id];
      return {
        conversations,
        messages: newMessages,
        activeConversationId:
          state.activeConversationId === id
            ? conversations[0]?.id ?? null
            : state.activeConversationId,
      };
    });
  },

  sendMessage: async (content, modelId, enableThinking = false) => {
    const convId = get().activeConversationId;
    if (!convId || get().isStreaming) return;

    // Reset streaming state
    set({
      isStreaming: true,
      streaming: {
        thinkingText: "",
        contentText: "",
        isThinking: false,
        thinkingDuration: 0,
      },
      lastUsage: null,
    });

    // Add user message to local state immediately
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: convId,
      parent_id: null,
      role: "user",
      content,
      model_used: null,
      tokens_in: 0,
      tokens_out: 0,
      cost: 0,
      thinking_content: null,
      thinking_duration_ms: null,
      attachments: "[]",
      tool_calls: "[]",
      created_at: new Date().toISOString(),
    };

    set((state) => ({
      messages: {
        ...state.messages,
        [convId]: [...(state.messages[convId] ?? []), tempUserMsg],
      },
    }));

    const handleEvent = (event: StreamEvent) => {
      const state = get();
      switch (event.type) {
        case "thinking_start":
          set({ streaming: { ...state.streaming, isThinking: true } });
          break;
        case "thinking_delta":
          set({
            streaming: {
              ...state.streaming,
              thinkingText: state.streaming.thinkingText + event.text,
            },
          });
          break;
        case "thinking_stop":
          set({
            streaming: {
              ...state.streaming,
              isThinking: false,
              thinkingDuration: event.duration_ms,
            },
          });
          break;
        case "content_delta":
          set({
            streaming: {
              ...state.streaming,
              contentText: state.streaming.contentText + event.text,
            },
          });
          break;
        case "message_stop":
          set({ lastUsage: event.usage });
          break;
      }
    };

    try {
      await ipc.chatSend({
        conversationId: convId,
        content,
        modelId,
        enableThinking,
        onEvent: handleEvent,
      });

      // Finalize: save the streamed content as a proper message
      const { streaming, lastUsage } = get();
      const assistantMsg: Message = {
        id: `msg-${Date.now()}`,
        conversation_id: convId,
        parent_id: tempUserMsg.id,
        role: "assistant",
        content: streaming.contentText,
        model_used: modelId,
        tokens_in: lastUsage?.input_tokens ?? 0,
        tokens_out: lastUsage?.output_tokens ?? 0,
        cost: lastUsage?.cost ?? 0,
        thinking_content: streaming.thinkingText || null,
        thinking_duration_ms: streaming.thinkingDuration || null,
        attachments: "[]",
        tool_calls: "[]",
        created_at: new Date().toISOString(),
      };

      set((state) => ({
        isStreaming: false,
        messages: {
          ...state.messages,
          [convId]: [...(state.messages[convId] ?? []), assistantMsg],
        },
      }));

      // Send desktop notification when response is complete and window is not focused
      if (!document.hasFocus()) {
        ipc.sendNotification(
          "Claude Desktop Pro",
          `Response complete: ${streaming.contentText.slice(0, 100)}${streaming.contentText.length > 100 ? "..." : ""}`,
        ).catch(() => {});
      }

      // Record usage stats
      if (lastUsage) {
        ipc.usageRecord(
          convId,
          modelId,
          lastUsage.input_tokens ?? 0,
          lastUsage.output_tokens ?? 0,
          lastUsage.cost ?? 0,
        ).catch((err) => console.error("Failed to record usage:", err));
      }

      // Auto-update conversation title if it's the first message
      const messages = get().messages[convId] ?? [];
      if (messages.length <= 2) {
        const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
        get().updateConversationTitle(convId, title);
      }
    } catch (err: unknown) {
      console.error("Chat send error:", err);
      set({ isStreaming: false });

      // Handle auth-related errors — trigger logout or show user-friendly message
      if (err && typeof err === "object" && "kind" in err) {
        const errorKind = (err as { kind: string }).kind;
        if (errorKind === "auth_required") {
          // Force logout — session expired
          useAuthStore.getState().logout();
        } else if (errorKind === "quota_exceeded") {
          // Show quota exceeded message — user can see this in the chat
          console.warn("Daily quota exceeded");
        }
      }
    }
  },

  cancelStream: () => {
    ipc.chatCancel();
    set({ isStreaming: false });
  },

  updateConversationTitle: async (id, title) => {
    await ipc.updateConversation(id, { title });
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, title } : c,
      ),
    }));
  },
}));
