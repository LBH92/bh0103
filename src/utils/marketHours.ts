export interface MarketStatusInfo {
  isOpen: boolean;
  statusLabel: string; // "정규장 · 실시간" or "장마감 · 종가기준"
  detailLabel: string;
  isHoliday: boolean;
  isWeekend: boolean;
  timeStringKST: string;
}

/**
 * 한국 주식시장(KRX) 운영 시간 판정
 * 
 * - 평일(월~금) 09:00:00 ~ 15:30:00: "정규장 · 실시간"
 * - 그 외 시간: "장마감 · 종가기준"
 * - 주말(토, 일) 및 공휴일: "장마감 · 종가기준"
 */

// 2026년 대한민국 주요 공휴일 (양력 및 음력 명절 기준 YYYY-MM-DD)
const KRX_HOLIDAYS_2026 = new Set<string>([
  '2026-01-01', // 신정
  '2026-02-16', // 설날 연휴 (전날)
  '2026-02-17', // 설날
  '2026-02-18', // 설날 연휴 (다음날)
  '2026-03-01', // 3·1절
  '2026-03-02', // 3·1절 대체공휴일
  '2026-05-01', // 근로자의 날 (주식시장 휴장)
  '2026-05-05', // 어린이날
  '2026-05-24', // 부처님오신날
  '2026-05-25', // 부처님오신날 대체공휴일
  '2026-06-06', // 현충일
  '2026-08-15', // 광복절
  '2026-08-17', // 광복절 대체공휴일
  '2026-09-24', // 추석 연휴 (전날)
  '2026-09-25', // 추석
  '2026-09-26', // 추석 연휴 (다음날)
  '2026-10-03', // 개천절
  '2026-10-05', // 개천절 대체공휴일
  '2026-10-09', // 한글날
  '2026-12-25', // 성탄절
  '2026-12-31', // 연말 증시 휴장일
]);

export function getKSTDate(date: Date = new Date()): Date {
  // UTC millisecond + 9 hours
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  return new Date(utc + (9 * 60 * 60 * 1000));
}

export function getKRXMarketStatus(baseDate: Date = new Date()): MarketStatusInfo {
  const kst = getKSTDate(baseDate);

  const year = kst.getFullYear();
  const month = String(kst.getMonth() + 1).padStart(2, '0');
  const day = String(kst.getDate()).padStart(2, '0');
  const dateKey = `${year}-${month}-${day}`;

  const dayOfWeek = kst.getDay(); // 0: 일, 1: 월, ..., 6: 토
  const hours = kst.getHours();
  const minutes = kst.getMinutes();
  const seconds = kst.getSeconds();

  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  const marketOpenSeconds = 9 * 3600; // 09:00:00
  const marketCloseSeconds = 15 * 3600 + 30 * 60; // 15:30:00

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isHoliday = KRX_HOLIDAYS_2026.has(dateKey);

  const timeStringKST = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  if (isWeekend) {
    return {
      isOpen: false,
      statusLabel: '장마감 · 종가기준',
      detailLabel: dayOfWeek === 6 ? '주말 휴장 (토요일)' : '주말 휴장 (일요일)',
      isHoliday: false,
      isWeekend: true,
      timeStringKST,
    };
  }

  if (isHoliday) {
    return {
      isOpen: false,
      statusLabel: '장마감 · 종가기준',
      detailLabel: '공휴일/증시 휴장일',
      isHoliday: true,
      isWeekend: false,
      timeStringKST,
    };
  }

  // 평일
  if (totalSeconds >= marketOpenSeconds && totalSeconds < marketCloseSeconds) {
    return {
      isOpen: true,
      statusLabel: '정규장 · 실시간',
      detailLabel: '정규 거래 시간 (09:00 ~ 15:30)',
      isHoliday: false,
      isWeekend: false,
      timeStringKST,
    };
  }

  // 장 시작 전 또는 장마감 후
  const detailLabel = totalSeconds < marketOpenSeconds ? '장 시작 전' : '정규장 마감';
  return {
    isOpen: false,
    statusLabel: '장마감 · 종가기준',
    detailLabel,
    isHoliday: false,
    isWeekend: false,
    timeStringKST,
  };
}
