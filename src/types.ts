export type AIModelId =
  | 'gemini-3-flash-preview'
  | 'gemini-3.1-pro-preview'
  | 'gemini-3.1-flash-lite-preview';

export type NonoIdleAction =
  | 'breathing'
  | 'happy_bounce'
  | 'curious_tilt'
  | 'thinking_look'
  | 'peeking'
  | 'sleepy'
  | 'deep_sleep'
  | 'startled_wake'
  | 'excited_spin';

export type UserBehaviorContext =
  | 'clicked_nono'
  | 'dragged_nono'
  | 'woke_up'
  | 'startled_from_deep_sleep'
  | 'edited_notebook'
  | 'summarized_chat'
  | 'generated_post'
  | 'refined_post'
  | 'spawned_friend';

export interface ChatMessage {
  id: string;
  role: 'ave' | 'nono';
  text: string;
  timestamp: string;
}

export interface NonoNotebookData {
  actualProgressLog: string;
  styleGuidelines: string;
  useCustomStyleMimic: boolean;
  customSamplePosts: string;
}

export type BufferPlatform = 'threads' | 'x' | 'instagram' | 'facebook';

export interface MediaAttachment {
  id: string;
  type: 'image' | 'video';
  url: string;
  name: string;
  source: 'local' | 'cloud';
}

export interface RecommendedTimeSlot {
  id: string;
  label: string;
  timeString: string;
  dayPrefix: string;
  scheduledIso: string;
  reason: string;
}

export interface BufferPostConfig {
  content: string;
  platformContents: Record<BufferPlatform, string>;
  usePerPlatformCopy: boolean;
  platforms: BufferPlatform[];
  scheduleMode: 'recommended_slot' | 'queue' | 'custom_time' | 'now';
  scheduledTime: string;
  selectedSlotLabel?: string;
  hashtags: string[];
  mediaAttachments: MediaAttachment[];
  status: 'ready_to_schedule' | 'scheduled';
}
