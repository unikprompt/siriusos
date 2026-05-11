// SiriusOS Single — Subset of types needed for the lite package.
// Kept in a single file to minimize the copy-paste maintenance surface
// vs. the full package. Shape matches src/types/index.ts exactly so files
// copied from full work without modification.

export type Priority = 'urgent' | 'high' | 'normal' | 'low';

export const VALID_PRIORITIES: Priority[] = ['urgent', 'high', 'normal', 'low'];

export type EventCategory =
  | 'action'
  | 'error'
  | 'metric'
  | 'milestone'
  | 'heartbeat'
  | 'message'
  | 'task'
  | 'approval'
  | 'agent_activity';

export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

export type ApprovalCategory =
  | 'external-comms'
  | 'financial'
  | 'deployment'
  | 'data-deletion'
  | 'other';

export type Provider = 'anthropic' | 'openai';

export interface AgentConfig {
  startup_delay?: number;
  max_session_seconds?: number;
  max_crashes_per_day?: number;
  provider?: Provider;
  model?: string;
  working_directory?: string;
  enabled?: boolean;
  timezone?: string;
  day_mode_start?: string;
  day_mode_end?: string;
  communication_style?: string;
  approval_rules?: {
    always_ask: string[];
    never_ask: string[];
  };
  ctx_warning_threshold?: number;
  ctx_handoff_threshold?: number;
  runtime?: 'claude-code' | 'hermes' | 'codex';
  telegram_polling?: boolean;
  // Single-specific fields:
  agent_name?: string;
  language?: string;
  created_at?: string;
}

// Telegram

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  message_reaction?: TelegramMessageReaction;
}

export type TelegramReactionType =
  | { type: 'emoji'; emoji: string }
  | { type: 'custom_emoji'; custom_emoji_id: string };

export interface TelegramMessageReaction {
  chat: TelegramChat;
  user?: TelegramUser;
  message_id: number;
  date: number;
  old_reaction: TelegramReactionType[];
  new_reaction: TelegramReactionType[];
}

export interface TelegramMessage {
  message_id: number;
  date?: number;
  from?: TelegramUser;
  chat: TelegramChat;
  text?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramDocument;
  voice?: TelegramVoice;
  audio?: TelegramAudio;
  video?: TelegramVideo;
  video_note?: TelegramVideoNote;
  caption?: string;
  reply_to_message?: TelegramMessage;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  width: number;
  height: number;
}

export interface TelegramDocument {
  file_id: string;
  file_name?: string;
}

export interface TelegramVoice {
  file_id: string;
  duration: number;
}

export interface TelegramAudio {
  file_id: string;
  duration: number;
  file_name?: string;
}

export interface TelegramVideo {
  file_id: string;
  duration: number;
  file_name?: string;
}

export interface TelegramVideoNote {
  file_id: string;
  duration: number;
}

// Env (simplified for single-agent context)

export interface CtxEnv {
  instanceId: string;
  ctxRoot: string;
  frameworkRoot: string;
  agentName: string;
  agentDir: string;
  org: string;
  projectRoot: string;
  timezone?: string;
}

// BusPaths (used by logging.ts; simplified for single)

export interface BusPaths {
  ctxRoot: string;
  inbox: string;
  inflight: string;
  processed: string;
  logDir: string;
  stateDir: string;
  taskDir: string;
  approvalDir: string;
  analyticsDir: string;
  deliverablesDir: string;
}
