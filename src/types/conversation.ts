/** A conversation (chat session) */
export interface Conversation {
  id: string;
  title: string;
  folder_id: string | null;
  parent_message_id: string | null;
  model_id: string;
  system_prompt: string | null;
  agent_mode: boolean;
  pinned: boolean;
  tags: string[];
  token_total: number;
  cost_total: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

/** Input to create a new conversation */
export interface CreateConversation {
  title?: string;
  model_id?: string;
  system_prompt?: string;
  folder_id?: string;
  agent_mode?: boolean;
}

/** Input to update a conversation */
export interface UpdateConversation {
  title?: string;
  folder_id?: string | null;
  model_id?: string;
  system_prompt?: string | null;
  agent_mode?: boolean;
  pinned?: boolean;
  tags?: string[];
  archived?: boolean;
}
