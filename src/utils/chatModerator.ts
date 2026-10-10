/**
 * Chat Moderation Utility for Stock Insight
 * Includes bad words filter, anti-spam, and rate-limiting
 */

// Profanity & illegal stock manipulation keywords
const PROHIBITED_KEYWORDS = [
  // Stock manipulation & illegal advisory
  '시세조종',
  '주가조작',
  '작전주',
  '선행매매',
  '불법리딩',
  '유료리딩',
  '리딩방',
  '단톡방초대',
  '텔레그램방',
  '원금보장',
  '100%수익',
  '대포통장',
  '자전거래',
  '통정매매',
  // Common Korean profanities & abusive slurs
  '개새끼',
  '개새',
  '씨발',
  '시발',
  '병신',
  '지랄',
  '좆',
  '존나',
  '새끼',
  '미친놈',
  '미친년',
  '닥쳐',
  '꺼져',
];

/**
 * Filters prohibited words and replaces them with asterisks
 */
export function filterProfanity(text: string): { cleanText: string; hasProfanity: boolean; matchedWords: string[] } {
  let cleanText = text;
  let hasProfanity = false;
  const matchedWords: string[] = [];

  for (const word of PROHIBITED_KEYWORDS) {
    const regex = new RegExp(word, 'gi');
    if (regex.test(cleanText)) {
      hasProfanity = true;
      if (!matchedWords.includes(word)) {
        matchedWords.push(word);
      }
      cleanText = cleanText.replace(regex, '*'.repeat(word.length));
    }
  }

  return { cleanText, hasProfanity, matchedWords };
}

/**
 * In-memory anti-spam rate limiter
 */
interface UserSpamState {
  lastMessage: string;
  lastMessageTime: number;
}

const userSpamMap = new Map<string, UserSpamState>();

export function checkSpamViolation(
  userId: string, 
  message: string
): { isSpam: boolean; reason?: 'duplicate' | 'cooldown' } {
  const now = Date.now();
  const trimmed = message.trim().toLowerCase();
  const state = userSpamMap.get(userId);

  if (!state) {
    userSpamMap.set(userId, { lastMessage: trimmed, lastMessageTime: now });
    return { isSpam: false };
  }

  // 1. Cooldown check: 1.2 seconds between messages
  if (now - state.lastMessageTime < 1200) {
    return { isSpam: true, reason: 'cooldown' };
  }

  // 2. Duplicate check: same message within 7 seconds
  if (state.lastMessage === trimmed && now - state.lastMessageTime < 7000) {
    return { isSpam: true, reason: 'duplicate' };
  }

  // Update state
  userSpamMap.set(userId, { lastMessage: trimmed, lastMessageTime: now });
  return { isSpam: false };
}
