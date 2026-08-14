export const CONVERSATION_SPEEDS = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8] as const;
export type ConversationSpeed = typeof CONVERSATION_SPEEDS[number];

export const DEFAULT_CONVERSATION_SPEED: ConversationSpeed = 0.6;
export const CONVERSATION_SPEED_STORAGE_KEY = "masri-conversation-speed";

export function parseConversationSpeed(value: string | null): ConversationSpeed {
  const parsed = Number(value);
  return CONVERSATION_SPEEDS.includes(parsed as ConversationSpeed)
    ? parsed as ConversationSpeed
    : DEFAULT_CONVERSATION_SPEED;
}

export function stepConversationSpeed(current: ConversationSpeed, direction: -1 | 1): ConversationSpeed {
  const currentIndex = CONVERSATION_SPEEDS.indexOf(current);
  const nextIndex = Math.min(Math.max(currentIndex + direction, 0), CONVERSATION_SPEEDS.length - 1);
  return CONVERSATION_SPEEDS[nextIndex];
}
