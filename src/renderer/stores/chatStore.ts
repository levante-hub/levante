import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { ChatSession, Message } from "../../types/database";
import { ElectronMessage, ElectronChatStatus } from "@/hooks/useElectronChat";
import {
  createSessionActions,
  SessionState,
  SessionActions,
} from "./chat/sessionActions";
import {
  createMessageActions,
  MessageState,
  MessageActions,
} from "./chat/messageActions";
import {
  createStreamingActions,
  StreamingState,
  StreamingActions,
} from "./chat/streamingActions";

interface ChatStore
  extends SessionState,
    MessageState,
    StreamingState,
    SessionActions,
    MessageActions,
    StreamingActions {
  // Display state
  messages: ElectronMessage[];
  status: ElectronChatStatus;
  streamingMessage: ElectronMessage | null;

  // Session management
  currentSession: ChatSession | null;
  sessions: ChatSession[];
  loading: boolean;
  error: string | null;

  // Database messages (raw from DB)
  dbMessages: Message[];
  messagesOffset: number;
  hasMoreMessages: boolean;

  // Deep link state
  pendingPrompt: string | null;

  // Streaming callbacks
  onStreamFinish?: () => void;

  // Actions
  setStatus: (status: ElectronChatStatus) => void;
  setStreamingMessage: (message: ElectronMessage | null) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setOnStreamFinish: (callback?: () => void) => void;

  // Deep link actions
  setPendingPrompt: (prompt: string | null) => void;

  // Session actions
  setSessions: (sessions: ChatSession[]) => void;
  setCurrentSession: (session: ChatSession | null) => void;
  addSession: (session: ChatSession) => void;
  updateSession: (session: ChatSession) => void;
  removeSession: (sessionId: string) => void;

  // Message actions
  setDbMessages: (messages: Message[]) => void;
  addDbMessage: (message: Message) => void;
  appendDbMessages: (messages: Message[]) => void;

  // Computed/derived actions
  updateDisplayMessages: () => void;

  // API actions (async)
  refreshSessions: () => Promise<void>;
  createSession: (
    title?: string,
    model?: string
  ) => Promise<ChatSession | null>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<boolean>;
  updateSessionTitle: (sessionId: string, title: string) => Promise<boolean>;
  addMessage: (
    content: string,
    role: "user" | "assistant" | "system"
  ) => Promise<Message | null>;
  addMessageWithTools: (
    content: string,
    role: "user" | "assistant" | "system",
    toolCallsData?: any[] | null
  ) => Promise<Message | null>;
  sendMessage: (
    message: { text: string },
    options?: {
      body?: { model?: string; webSearch?: boolean; enableMCP?: boolean };
    }
  ) => Promise<void>;
  stopStreaming: () => Promise<void>;
  loadMoreMessages: () => Promise<void>;

  // UI actions
  startNewChat: () => void;
}

// Helper to convert DB Message to ElectronMessage
function convertToElectronMessage(dbMessage: Message): ElectronMessage {
  const parts: Array<{
    type: "text" | "source-url" | "reasoning" | "tool-call";
    text?: string;
    url?: string;
    toolCall?: {
      id: string;
      name: string;
      arguments: Record<string, any>;
      result?: {
        success: boolean;
        content?: string;
        error?: string;
      };
      status: "pending" | "running" | "success" | "error";
      serverId?: string;
      timestamp?: number;
    };
  }> = [];

  // Add text content
  if (dbMessage.content) {
    parts.push({ type: "text", text: dbMessage.content });
  }

  // Process tool calls from database
  if (dbMessage.tool_calls) {
    try {
      const toolCalls = JSON.parse(dbMessage.tool_calls);
      if (Array.isArray(toolCalls)) {
        toolCalls.forEach((toolCall) => {
          parts.push({
            type: "tool-call",
            toolCall: {
              id: toolCall.id,
              name: toolCall.name,
              arguments: toolCall.arguments || {},
              result: toolCall.result,
              status: toolCall.status || "success",
              serverId: toolCall.serverId,
              timestamp: toolCall.timestamp,
            },
          });
        });
      }
    } catch (error) {
      console.error(
        "[convertToElectronMessage] Failed to parse tool_calls JSON:",
        error
      );
    }
  }

  return {
    id: dbMessage.id,
    role: dbMessage.role,
    content: dbMessage.content,
    parts,
  };
}

export const useChatStore = create<ChatStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      messages: [],
      status: "ready",
      streamingMessage: null,
      currentSession: null,
      sessions: [],
      loading: false,
      error: null,
      dbMessages: [],
      messagesOffset: 0,
      hasMoreMessages: true,
      pendingPrompt: null,
      onStreamFinish: undefined,

      // Basic setters
      setError: (error) => set({ error }),
      setLoading: (loading) => set({ loading }),

      // Deep link actions
      setPendingPrompt: (prompt) => set({ pendingPrompt: prompt }),

      // Session actions
      ...createSessionActions(set, get),

      // Message actions
      ...createMessageActions(set, get),

      // Streaming actions
      ...createStreamingActions(set, get),
    }),
    { name: "chat-store" }
  )
);

// Export an initialization function
export const initializeChatStore = () => {
  useChatStore.getState().refreshSessions();
};
