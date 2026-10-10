// Korean Hangul Unicode constants & Jamo tables
const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;

export const CHOSUNG_LIST = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

export const JUNGSUNG_LIST = [
  'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
  'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'
];

export const JONGSUNG_LIST = [
  '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ',
  'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

// Complex Jamo expansion maps
const COMPLEX_JONGSUNG_MAP: Record<string, string> = {
  'ㄳ': 'ㄱㅅ',
  'ㄵ': 'ㄴㅈ',
  'ㄶ': 'ㄴㅎ',
  'ㄺ': 'ㄹㄱ',
  'ㄻ': 'ㄹㅁ',
  'ㄼ': 'ㄹㅂ',
  'ㄽ': 'ㄹㅅ',
  'ㄾ': 'ㄹㅌ',
  'ㄿ': 'ㄹㅍ',
  'ㅀ': 'ㄹㅎ',
  'ㅄ': 'ㅂㅅ',
};

const COMPLEX_JUNGSUNG_MAP: Record<string, string> = {
  'ㅘ': 'ㅗㅏ',
  'ㅙ': 'ㅗㅐ',
  'ㅚ': 'ㅗㅣ',
  'ㅝ': 'ㅜㅓ',
  'ㅞ': 'ㅜㅔ',
  'ㅟ': 'ㅜㅣ',
  'ㅢ': 'ㅡㅣ',
};

/**
 * Extracts Korean initial consonants (초성) from a given string.
 * Example: "삼성전자" -> "ㅅㅅㅈㅈ", "SK하이닉스" -> "skㅎㅇㄴㅅ"
 */
export function extractChosung(text: string): string {
  if (!text) return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= HANGUL_BASE && code <= HANGUL_END) {
      const chosungIndex = Math.floor((code - HANGUL_BASE) / 588);
      result += CHOSUNG_LIST[chosungIndex];
    } else {
      result += text[i].toLowerCase();
    }
  }
  return result;
}

/**
 * Decomposes Hangul syllables into individual atomic jamo (초성, 중성, 종성).
 * Fully expands complex jamo so partial IME strokes seamlessly match!
 * Example:
 * "삼성" -> "ㅅㅏㅁㅅㅓㅇ"
 * "SK하이닉스" -> "skㅎㅏㅇㅣㄴㅣㄱㅅㅡ"
 */
export function decomposeHangul(text: string): string {
  if (!text) return '';
  let result = '';

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    // 1. Complete Hangul Syllable (가 ~ 힣)
    if (code >= HANGUL_BASE && code <= HANGUL_END) {
      const offset = code - HANGUL_BASE;
      const cho = CHOSUNG_LIST[Math.floor(offset / 588)];
      const jung = JUNGSUNG_LIST[Math.floor((offset % 588) / 28)];
      const jong = JONGSUNG_LIST[offset % 28];

      result += cho;
      result += COMPLEX_JUNGSUNG_MAP[jung] || jung;
      if (jong) {
        result += COMPLEX_JONGSUNG_MAP[jong] || jong;
      }
    }
    // 2. Standalone Jamo (ㄱ ~ ㅎ, ㅏ ~ ㅣ)
    else if (code >= 0x3131 && code <= 0x3163) {
      const ch = text[i];
      if (COMPLEX_JONGSUNG_MAP[ch]) {
        result += COMPLEX_JONGSUNG_MAP[ch];
      } else if (COMPLEX_JUNGSUNG_MAP[ch]) {
        result += COMPLEX_JUNGSUNG_MAP[ch];
      } else {
        result += ch;
      }
    }
    // 3. Latin, Numbers, Symbols (converted to lowercase, spaces omitted for fuzzy match)
    else {
      result += text[i].toLowerCase();
    }
  }

  return result;
}

/**
 * Checks if a string consists exclusively of Korean consonants (초성) or alphanumeric characters.
 */
export function isChosungQuery(query: string): boolean {
  if (!query) return false;
  const trimmed = query.replace(/\s+/g, '');
  const hasChosungChar = /[ㄱ-ㅎ]/.test(trimmed);
  const hasFullSyllable = /[가-힣]/.test(trimmed);
  return hasChosungChar && !hasFullSyllable;
}

/**
 * Matches target string against query supporting:
 * 1. Full/Partial name match (case-insensitive, space-insensitive)
 * 2. Korean atomic Jamo decomposition search (e.g. '사' -> '삼성전자', '삼ㅅ' -> '삼성전자')
 * 3. Pure Chosung search (e.g. 'ㅅㅅ' -> '삼성전자', 'ㅅㅋ' -> 'SK하이닉스')
 * 4. Partial stock code match (e.g. '0059' -> '005930')
 */
export function matchHangulSearch(target: string, query: string): boolean {
  if (!query || !target) return false;

  const rawQuery = query.trim().toLowerCase();
  const rawTarget = target.toLowerCase();
  if (!rawQuery) return false;

  // 1. Direct Substring Match
  if (rawTarget.includes(rawQuery)) {
    return true;
  }

  // 2. Space-insensitive Substring Match
  const targetNoSpace = rawTarget.replace(/\s+/g, '');
  const queryNoSpace = rawQuery.replace(/\s+/g, '');
  if (targetNoSpace.includes(queryNoSpace)) {
    return true;
  }

  // 3. Pure Chosung Match (e.g. 'ㅅㅅㅈㅈ' or 'ㅅㅅ' -> '삼성전자')
  if (isChosungQuery(rawQuery)) {
    const targetChosung = extractChosung(rawTarget).replace(/\s+/g, '');
    if (targetChosung.includes(queryNoSpace)) {
      return true;
    }
  }

  // 4. Jamo Decomposition Prefix/Substring Match
  // This solves Korean IME keystroke states (e.g. '사', '삼ㅅ', '삼성저') matching '삼성전자'!
  const decomposedTarget = decomposeHangul(rawTarget).replace(/\s+/g, '');
  const decomposedQuery = decomposeHangul(rawQuery).replace(/\s+/g, '');

  if (decomposedTarget.includes(decomposedQuery)) {
    return true;
  }

  return false;
}
