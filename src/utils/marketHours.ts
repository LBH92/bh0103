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

// 대한민국 주요 공휴일 (양력 기준 고정일 및 2025~2027 명절/대체공휴일)
const KRX_MULTI_YEAR_HOLIDAYS = new Set<string>([
  // 2025
  '2025-01-01', '2025-01-27', '2025-01-28', '2025-01-29', '2025-01-30',
  '2025-03-01', '2025-03-03', '2025-05-01', '2025-05-05', '2025-05-06',
  '2025-06-06', '2025-08-15', '2025-10-03', '2025-10-05', '2025-10-06',
  '2025-10-07', '2025-10-08', '2025-10-09', '2025-12-25', '2025-12-31',
  // 2026
  '2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01',
  '2026-03-02', '2026-05-01', '2026-05-05', '2026-05-24', '2026-05-25',
  '2026-06-06', '2026-08-15', '2026-08-17', '2026-09-24', '2026-09-25',
  '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25',
  '2026-12-31',
  // 2027
  '2027-01-01', '2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08',
  '2027-03-01', '2027-05-01', '2027-05-05', '2027-05-13', '2027-06-06',
  '2027-06-07', '2027-08-15', '2027-08-16', '2027-09-14', '2027-09-15',
  '2027-09-16', '2027-10-03', '2027-10-04', '2027-10-09', '2027-10-11',
  '2027-12-25', '2027-12-31'
]);

export function isKRXHoliday(dateKey: string, year: number): boolean {
  if (KRX_MULTI_YEAR_HOLIDAYS.has(dateKey)) return true;
  // 고정 양력 공휴일 (신정, 근로자의 날, 어린이날, 현충일, 광복절, 개천절, 한글날, 크리스마스, 연말폐장)
  const md = dateKey.slice(5);
  if (['01-01', '05-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25', '12-31'].includes(md)) {
    return true;
  }
  return false;
}

export function getKSTDate(date: Date = new Date()): Date {
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
  const isHoliday = isKRXHoliday(dateKey, year);

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
  const isPreMarket = totalSeconds >= (8 * 3600 + 30 * 60) && totalSeconds < marketOpenSeconds;
  const isAfterMarket = totalSeconds >= marketCloseSeconds && totalSeconds < (18 * 3600);
  const detailLabel = isPreMarket ? '장 시작 전 (시간외/동시호가)' : isAfterMarket ? '장후 시간외 거래' : totalSeconds < marketOpenSeconds ? '장 시작 전' : '정규장 마감';

  return {
    isOpen: false,
    statusLabel: '장마감 · 종가기준',
    detailLabel,
    isHoliday: false,
    isWeekend: false,
    timeStringKST,
  };
}

/**
 * 미국 주식시장(NYSE/NASDAQ) 공휴일 및 조기폐장일 동적 산출 함수
 * 
 * 특정 연도에 국한되지 않고 매년 연방 공휴일 규칙(Observed Day 포함)과 부활절(Good Friday) 알고리즘으로 동적 계산.
 */
export function getUSMarketHolidays(year: number): { holidays: Set<string>; earlyClose: Set<string> } {
  const holidays = new Set<string>();
  const earlyClose = new Set<string>();

  // 1. New Year's Day (Jan 1) - If Sunday -> Jan 2 observed. (If Saturday -> Dec 31 prior year)
  const ny = new Date(Date.UTC(year, 0, 1));
  if (ny.getUTCDay() === 0) holidays.add(`${year}-01-02`);
  else if (ny.getUTCDay() === 6) holidays.add(`${year - 1}-12-31`);
  else holidays.add(`${year}-01-01`);

  // Helper for Nth day-of-week in a month (0-indexed month)
  function getNthDayOfWeek(y: number, m: number, targetDay: number, n: number): number {
    const first = new Date(Date.UTC(y, m, 1));
    const firstDay = first.getUTCDay();
    const diff = (targetDay - firstDay + 7) % 7;
    return 1 + diff + (n - 1) * 7;
  }

  // 2. Martin Luther King Jr. Day (3rd Monday in Jan)
  holidays.add(`${year}-01-${String(getNthDayOfWeek(year, 0, 1, 3)).padStart(2, '0')}`);

  // 3. Washington's Birthday / Presidents' Day (3rd Monday in Feb)
  holidays.add(`${year}-02-${String(getNthDayOfWeek(year, 1, 1, 3)).padStart(2, '0')}`);

  // 4. Good Friday (Friday before Easter Sunday - Meeus/Jones/Butcher algorithm)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const easterMonth = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const easterDay = ((h + l - 7 * m + 114) % 31) + 1;
  const gf = new Date(Date.UTC(year, easterMonth, easterDay - 2));
  holidays.add(`${year}-${String(gf.getUTCMonth() + 1).padStart(2, '0')}-${String(gf.getUTCDate()).padStart(2, '0')}`);

  // 5. Memorial Day (Last Monday in May)
  const lastMay = new Date(Date.UTC(year, 4, 31));
  const mayMon = 31 - ((lastMay.getUTCDay() + 6) % 7);
  holidays.add(`${year}-05-${String(mayMon).padStart(2, '0')}`);

  // 6. Juneteenth National Independence Day (June 19)
  const jt = new Date(Date.UTC(year, 5, 19));
  if (jt.getUTCDay() === 0) holidays.add(`${year}-06-20`);
  else if (jt.getUTCDay() === 6) holidays.add(`${year}-06-18`);
  else holidays.add(`${year}-06-19`);

  // 7. Independence Day (July 4)
  const ind = new Date(Date.UTC(year, 6, 4));
  if (ind.getUTCDay() === 0) holidays.add(`${year}-07-05`);
  else if (ind.getUTCDay() === 6) holidays.add(`${year}-07-03`);
  else holidays.add(`${year}-07-04`);

  // 8. Labor Day (1st Monday in Sep)
  holidays.add(`${year}-09-${String(getNthDayOfWeek(year, 8, 1, 1)).padStart(2, '0')}`);

  // 9. Thanksgiving Day (4th Thursday in Nov)
  const thDay = getNthDayOfWeek(year, 10, 4, 4);
  holidays.add(`${year}-11-${String(thDay).padStart(2, '0')}`);

  // 10. Christmas Day (Dec 25)
  const xm = new Date(Date.UTC(year, 11, 25));
  if (xm.getUTCDay() === 0) holidays.add(`${year}-12-26`);
  else if (xm.getUTCDay() === 6) holidays.add(`${year}-12-24`);
  else holidays.add(`${year}-12-25`);

  // 조기 폐장일 (Early Close: 13:00 EST/EDT 조기 마감)
  // - 블랙 프라이데이 (추수감사절 다음날)
  earlyClose.add(`${year}-11-${String(thDay + 1).padStart(2, '0')}`);
  // - 크리스마스 이브 (12월 24일, 평일인 경우)
  if (xm.getUTCDay() !== 0 && xm.getUTCDay() !== 1 && xm.getUTCDay() !== 6) {
    earlyClose.add(`${year}-12-24`);
  }
  // - 독립기념일 전일 (7월 3일이 평일이고 7월 4일이 주중인 경우)
  if (ind.getUTCDay() >= 2 && ind.getUTCDay() <= 5) {
    earlyClose.add(`${year}-07-03`);
  }

  return { holidays, earlyClose };
}

/**
 * 미국 동부 표준시 (America/New_York IANA 타임존) 기준 시간 객체 파싱
 * 서버 로컬 타임존 환경에 독립적으로 동작하며 서머타임(EDT/EST)을 완벽하게 자동 처리.
 */
export function getUSDate(date: Date = new Date()): {
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
  hours: number;
  minutes: number;
  seconds: number;
  dateKey: string;
  timeStringUS: string;
  totalSeconds: number;
} {
  // Use Intl.DateTimeFormat to reliably extract America/New_York date & time components
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  let year = 2026;
  let month = 1;
  let day = 1;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let weekdayStr = 'Sun';

  for (const part of parts) {
    if (part.type === 'year') year = parseInt(part.value, 10);
    else if (part.type === 'month') month = parseInt(part.value, 10);
    else if (part.type === 'day') day = parseInt(part.value, 10);
    else if (part.type === 'hour') hours = parseInt(part.value, 10);
    else if (part.type === 'minute') minutes = parseInt(part.value, 10);
    else if (part.type === 'second') seconds = parseInt(part.value, 10);
    else if (part.type === 'weekday') weekdayStr = part.value;
  }

  // 24-hour normalize (sometimes hour12: false can return '24' for midnight in older engines)
  if (hours === 24) hours = 0;

  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = weekdayMap[weekdayStr] ?? 0;

  const monthStr = String(month).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  const dateKey = `${year}-${monthStr}-${dayStr}`;
  const timeStringUS = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;

  return {
    year,
    month,
    day,
    dayOfWeek,
    hours,
    minutes,
    seconds,
    dateKey,
    timeStringUS,
    totalSeconds,
  };
}

export function getUSMarketStatus(baseDate: Date = new Date()): MarketStatusInfo & { 
  session: 'REGULAR' | 'PRE_MARKET' | 'AFTER_MARKET' | 'CLOSED';
  isEarlyClose?: boolean;
} {
  const us = getUSDate(baseDate);
  const { holidays, earlyClose } = getUSMarketHolidays(us.year);

  const preMarketOpen = 4 * 3600; // 04:00 EDT/EST
  const marketOpen = 9 * 3600 + 30 * 60; // 09:30 EDT/EST
  const isEarlyCloseDay = earlyClose.has(us.dateKey);
  const marketClose = isEarlyCloseDay ? (13 * 3600) : (16 * 3600); // 13:00 (조기폐장) or 16:00 (정규폐장)
  const afterMarketClose = isEarlyCloseDay ? (17 * 3600) : (20 * 3600);

  const isWeekend = us.dayOfWeek === 0 || us.dayOfWeek === 6;
  const isHoliday = holidays.has(us.dateKey);

  if (isWeekend) {
    return {
      isOpen: false,
      statusLabel: '미국장 휴장',
      detailLabel: us.dayOfWeek === 6 ? '주말 휴장 (토요일)' : '주말 휴장 (일요일)',
      isHoliday: false,
      isWeekend: true,
      timeStringKST: us.timeStringUS,
      session: 'CLOSED',
    };
  }

  if (isHoliday) {
    return {
      isOpen: false,
      statusLabel: '미국장 휴장',
      detailLabel: '미국 공휴일 휴장 (NYSE/NASDAQ)',
      isHoliday: true,
      isWeekend: false,
      timeStringKST: us.timeStringUS,
      session: 'CLOSED',
    };
  }

  if (us.totalSeconds >= marketOpen && us.totalSeconds < marketClose) {
    return {
      isOpen: true,
      statusLabel: isEarlyCloseDay ? '정규장 (조기폐장일)' : '정규장 · 실시간',
      detailLabel: isEarlyCloseDay 
        ? '미국 정규 거래시간 (조기폐장: 09:30 ~ 13:00 EST/EDT)' 
        : '미국 정규 거래시간 (09:30 ~ 16:00 EST/EDT)',
      isHoliday: false,
      isWeekend: false,
      timeStringKST: us.timeStringUS,
      session: 'REGULAR',
      isEarlyClose: isEarlyCloseDay,
    };
  }

  if (us.totalSeconds >= preMarketOpen && us.totalSeconds < marketOpen) {
    return {
      isOpen: false,
      statusLabel: '프리마켓',
      detailLabel: '미국 프리마켓 (04:00 ~ 09:30 EST/EDT)',
      isHoliday: false,
      isWeekend: false,
      timeStringKST: us.timeStringUS,
      session: 'PRE_MARKET',
      isEarlyClose: isEarlyCloseDay,
    };
  }

  if (us.totalSeconds >= marketClose && us.totalSeconds < afterMarketClose) {
    return {
      isOpen: false,
      statusLabel: '애프터마켓',
      detailLabel: isEarlyCloseDay
        ? '미국 애프터마켓 (조기마감: 13:00 ~ 17:00 EST/EDT)'
        : '미국 애프터마켓 (16:00 ~ 20:00 EST/EDT)',
      isHoliday: false,
      isWeekend: false,
      timeStringKST: us.timeStringUS,
      session: 'AFTER_MARKET',
      isEarlyClose: isEarlyCloseDay,
    };
  }

  return {
    isOpen: false,
    statusLabel: '장마감',
    detailLabel: isEarlyCloseDay ? '미국 증시 조기마감' : '미국 증시 마감',
    isHoliday: false,
    isWeekend: false,
    timeStringKST: us.timeStringUS,
    session: 'CLOSED',
    isEarlyClose: isEarlyCloseDay,
  };
}

export interface TradingHoursValidation {
  canExecuteNow: boolean;
  canQueuePending: boolean;
  session: 'REGULAR' | 'PRE_MARKET' | 'AFTER_MARKET' | 'CLOSED';
  message: string;
  market: 'KRX' | 'US';
}

/**
 * 거래시간 검증: KRX(09:00~15:30), US(09:30~16:00 EST/EDT) 정규장 및 프리/애프터마켓, 휴장일 판별.
 * 불가 시간대 주문은 거절하거나 허용된 주문 유형(지정가)에 한해 대기(PENDING) 처리.
 */
export function validateMarketTradingHours(
  market: string = 'KRX',
  orderKind: 'MARKET' | 'LIMIT' = 'MARKET'
): TradingHoursValidation {
  const isUS = market.toUpperCase() === 'US' || market.toUpperCase() === 'NASDAQ' || market.toUpperCase() === 'NYSE' || market.toUpperCase() === 'GLOBAL';

  if (isUS) {
    const usStatus = getUSMarketStatus();
    if (usStatus.isOpen && usStatus.session === 'REGULAR') {
      return {
        canExecuteNow: true,
        canQueuePending: true,
        session: 'REGULAR',
        message: '미국 정규 거래시간 (즉시 체결 가능)',
        market: 'US',
      };
    }

    if (orderKind === 'MARKET') {
      return {
        canExecuteNow: false,
        canQueuePending: false,
        session: usStatus.session,
        message: `미국 정규장 마감 상태(${usStatus.detailLabel})에서는 시장가 주문이 불가합니다. 지정가 주문으로 접수 시 대기(PENDING) 등록됩니다.`,
        market: 'US',
      };
    }

    return {
      canExecuteNow: false,
      canQueuePending: true,
      session: usStatus.session,
      message: `정규장 외 시간(${usStatus.detailLabel})으로 지정가 주문이 대기(PENDING) 상태로 예약 접수됩니다.`,
      market: 'US',
    };
  }

  // KRX (국내 주식)
  const krxStatus = getKRXMarketStatus();
  if (krxStatus.isOpen) {
    return {
      canExecuteNow: true,
      canQueuePending: true,
      session: 'REGULAR',
      message: '국내 정규 거래시간 (09:00~15:30, 즉시 체결 가능)',
      market: 'KRX',
    };
  }

  if (orderKind === 'MARKET') {
    return {
      canExecuteNow: false,
      canQueuePending: false,
      session: 'CLOSED',
      message: `정규 거래시간 외(${krxStatus.detailLabel})에는 시장가 주문이 거절됩니다. 지정가 주문으로 접수 시 정규장 대기(PENDING) 처리됩니다.`,
      market: 'KRX',
    };
  }

  return {
    canExecuteNow: false,
    canQueuePending: true,
    session: 'CLOSED',
    message: `정규 거래시간 외(${krxStatus.detailLabel})로 지정가 주문이 대기(PENDING) 상태로 안전하게 접수됩니다.`,
    market: 'KRX',
  };
}
