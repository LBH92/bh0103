/**
 * Comprehensive US Stock Master Service
 * 
 * Provides master catalog for major US stocks (NASDAQ, NYSE, AMEX)
 * - Covers Common Stocks (보통주) and ETFs (상장지수펀드)
 * - Supports ticker, English name, and Korean alias search
 * - Supports Hangul initial consonant (초성) search
 * - Real quote caching and price synchronization
 */

import { matchHangulSearch } from '../src/utils/hangul';

export interface UsStockMasterItem {
  symbol: string;        // e.g. 'AAPL'
  name: string;          // Korean display name e.g. '애플'
  nameEn: string;        // English name e.g. 'Apple Inc.'
  market: 'US';
  exchange: 'NASDAQ' | 'NYSE' | 'AMEX';
  sector: string;
  assetType: 'COMMON' | 'ETF' | 'ADR';
  aliases?: string[];    // Alternate search terms e.g. ['아이폰', 'iphone']
}

export const US_STOCK_MASTER: UsStockMasterItem[] = [
  // 1. Mega-cap Tech (Big Tech & Semis)
  { symbol: 'AAPL', name: '애플', nameEn: 'Apple Inc.', market: 'US', exchange: 'NASDAQ', sector: '빅테크 / 가전 / 스마트폰', assetType: 'COMMON', aliases: ['아이폰', 'iphone', 'mac', 'ipad'] },
  { symbol: 'NVDA', name: '엔비디아', nameEn: 'NVIDIA Corporation', market: 'US', exchange: 'NASDAQ', sector: '반도체 / AI가속기 / GPU', assetType: 'COMMON', aliases: ['엔비', 'gpu', 'geforce', 'h100', 'blackwell'] },
  { symbol: 'MSFT', name: '마이크로소프트', nameEn: 'Microsoft Corporation', market: 'US', exchange: 'NASDAQ', sector: '클라우드 / AI / 소프트웨어', assetType: 'COMMON', aliases: ['윈도우', 'azure', '애저', '오피스', 'copilot'] },
  { symbol: 'TSLA', name: '테슬라', nameEn: 'Tesla, Inc.', market: 'US', exchange: 'NASDAQ', sector: '전기차 / 자율주행 / 에너지', assetType: 'COMMON', aliases: ['모델y', '모델3', '사이버트럭', '일론머스크'] },
  { symbol: 'AMZN', name: '아마존', nameEn: 'Amazon.com, Inc.', market: 'US', exchange: 'NASDAQ', sector: '전자상거래 / 클라우드(AWS)', assetType: 'COMMON', aliases: ['aws', '프라임', '이커머스'] },
  { symbol: 'GOOGL', name: '알파벳 Class A (구글)', nameEn: 'Alphabet Inc. Class A', market: 'US', exchange: 'NASDAQ', sector: '검색 / AI / 클라우드', assetType: 'COMMON', aliases: ['구글', '유튜브', 'youtube', '안드로이드', '제미나이', 'gemini'] },
  { symbol: 'GOOG', name: '알파벳 Class C (구글)', nameEn: 'Alphabet Inc. Class C', market: 'US', exchange: 'NASDAQ', sector: '검색 / AI / 클라우드', assetType: 'COMMON', aliases: ['구글', '유튜브'] },
  { symbol: 'META', name: '메타 플랫폼스', nameEn: 'Meta Platforms, Inc.', market: 'US', exchange: 'NASDAQ', sector: 'SNS / 메타버스 / AI', assetType: 'COMMON', aliases: ['페이스북', 'facebook', '인스타그램', 'instagram', '라마', 'llama'] },
  { symbol: 'AVGO', name: '브로드컴', nameEn: 'Broadcom Inc.', market: 'US', exchange: 'NASDAQ', sector: '반도체 / 네트워크 / 커스텀ASIC', assetType: 'COMMON', aliases: ['통신반도체', 'vmware'] },
  { symbol: 'AMD', name: 'AMD', nameEn: 'Advanced Micro Devices, Inc.', market: 'US', exchange: 'NASDAQ', sector: '반도체 / CPU / GPU', assetType: 'COMMON', aliases: ['라데온', '라이젠', '리사수'] },
  { symbol: 'QCOM', name: '퀄컴', nameEn: 'QUALCOMM Incorporated', market: 'US', exchange: 'NASDAQ', sector: '모바일반도체 / AP / 통신', assetType: 'COMMON', aliases: ['스냅드래곤', '스냅'] },
  { symbol: 'ARM', name: 'ARM 홀딩스', nameEn: 'Arm Holdings plc', market: 'US', exchange: 'NASDAQ', sector: '반도체IP / 아키텍처', assetType: 'ADR', aliases: ['암', '코어텍스'] },
  { symbol: 'INTC', name: '인텔', nameEn: 'Intel Corporation', market: 'US', exchange: 'NASDAQ', sector: '반도체 / CPU / 파운드리', assetType: 'COMMON', aliases: ['코어', '제온'] },
  { symbol: 'SMCI', name: '슈퍼마이크로 컴퓨터', nameEn: 'Super Micro Computer, Inc.', market: 'US', exchange: 'NASDAQ', sector: 'AI서버 / 데이터센터', assetType: 'COMMON', aliases: ['슈마컴', '서버'] },
  { symbol: 'TXN', name: '텍사스 인스트루먼트', nameEn: 'Texas Instruments Incorporated', market: 'US', exchange: 'NASDAQ', sector: '아날로그반도체', assetType: 'COMMON', aliases: ['ti'] },
  { symbol: 'MU', name: '마이크론 테크놀로지', nameEn: 'Micron Technology, Inc.', market: 'US', exchange: 'NASDAQ', sector: '메모리반도체 / DRAM / NAND', assetType: 'COMMON', aliases: ['마이크론', 'dram'] },
  { symbol: 'ASML', name: 'ASML 홀딩', nameEn: 'ASML Holding N.V.', market: 'US', exchange: 'NASDAQ', sector: '반도체장비 / EUV노광기', assetType: 'ADR', aliases: ['euv', '노광'] },
  { symbol: 'TSM', name: 'TSMC', nameEn: 'Taiwan Semiconductor Manufacturing Co.', market: 'US', exchange: 'NYSE', sector: '파운드리 / 반도체위탁생산', assetType: 'ADR', aliases: ['대만반도체', '파운드리'] },

  // 2. Enterprise Software & AI
  { symbol: 'PLTR', name: '팔란티어 테크놀로지스', nameEn: 'Palantir Technologies Inc.', market: 'US', exchange: 'NYSE', sector: '빅데이터분석 / 방산AI', assetType: 'COMMON', aliases: ['팔란', '고담', '아폴로', '파운드리'] },
  { symbol: 'ORCL', name: '오라클', nameEn: 'Oracle Corporation', market: 'US', exchange: 'NYSE', sector: '데이터베이스 / 클라우드OCI', assetType: 'COMMON', aliases: ['db'] },
  { symbol: 'CRM', name: '세일즈포스', nameEn: 'Salesforce, Inc.', market: 'US', exchange: 'NYSE', sector: 'CRM소프트웨어 / 클라우드', assetType: 'COMMON', aliases: ['세포'] },
  { symbol: 'ADBE', name: '어도비', nameEn: 'Adobe Inc.', market: 'US', exchange: 'NASDAQ', sector: '크리에이티브소프트웨어 / AI', assetType: 'COMMON', aliases: ['포토샵', 'photoshop', '일러스트'] },
  { symbol: 'NFLX', name: '넷플릭스', nameEn: 'Netflix, Inc.', market: 'US', exchange: 'NASDAQ', sector: 'OTT / 스트리밍 / 엔터', assetType: 'COMMON', aliases: ['오징어게임', 'ott'] },
  { symbol: 'CRWD', name: '크라우드스트라이크', nameEn: 'CrowdStrike Holdings, Inc.', market: 'US', exchange: 'NASDAQ', sector: '사이버보안 / 엔드포인트', assetType: 'COMMON', aliases: ['보안'] },
  { symbol: 'SNOW', name: '스노우플레이크', nameEn: 'Snowflake Inc.', market: 'US', exchange: 'NYSE', sector: '데이터클라우드 / 웨어하우스', assetType: 'COMMON', aliases: ['스노우'] },
  { symbol: 'COIN', name: '코인베이스 글로벌', nameEn: 'Coinbase Global, Inc.', market: 'US', exchange: 'NASDAQ', sector: '가상자산거래소 / 핀테크', assetType: 'COMMON', aliases: ['비트코인', '코인'] },
  { symbol: 'UBER', name: '우버 테크놀로지스', nameEn: 'Uber Technologies, Inc.', market: 'US', exchange: 'NYSE', sector: '승차공유 / 배달 / 모빌리티', assetType: 'COMMON', aliases: ['우버이츠'] },
  { symbol: 'ABNB', name: '에어비앤비', nameEn: 'Airbnb, Inc.', market: 'US', exchange: 'NASDAQ', sector: '숙박공유 / 여행', assetType: 'COMMON', aliases: ['숙소'] },

  // 3. Healthcare & Pharmaceuticals
  { symbol: 'LLY', name: '일라이 릴리', nameEn: 'Eli Lilly and Company', market: 'US', exchange: 'NYSE', sector: '제약바이오 / 비만치료제', assetType: 'COMMON', aliases: ['마운자로', '젭바운드', '비만약'] },
  { symbol: 'NVO', name: '노보 노디스크', nameEn: 'Novo Nordisk A/S', market: 'US', exchange: 'NYSE', sector: '제약바이오 / 비만치료제', assetType: 'ADR', aliases: ['위고비', '오젬픽'] },
  { symbol: 'UNH', name: '유나이티드헬스 그룹', nameEn: 'UnitedHealth Group Incorporated', market: 'US', exchange: 'NYSE', sector: '건강보험 / 헬스케어서비스', assetType: 'COMMON', aliases: ['의료보험'] },
  { symbol: 'JNJ', name: '존슨앤드존슨', nameEn: 'Johnson & Johnson', market: 'US', exchange: 'NYSE', sector: '의료기기 / 제약', assetType: 'COMMON', aliases: ['존슨'] },
  { symbol: 'ABBV', name: '애브비', nameEn: 'AbbVie Inc.', market: 'US', exchange: 'NYSE', sector: '바이오제약 / 면역치료제', assetType: 'COMMON', aliases: ['휴미라'] },
  { symbol: 'MRK', name: '머크', nameEn: 'Merck & Co., Inc.', market: 'US', exchange: 'NYSE', sector: '제약바이오 / 면역항암제', assetType: 'COMMON', aliases: ['키트루다'] },
  { symbol: 'PFE', name: '화이자', nameEn: 'Pfizer Inc.', market: 'US', exchange: 'NYSE', sector: '제약 / 백신', assetType: 'COMMON', aliases: ['코로나백신'] },
  { symbol: 'ISRG', name: '인튜이티브 서지컬', nameEn: 'Intuitive Surgical, Inc.', market: 'US', exchange: 'NASDAQ', sector: '수술로봇 / 다빈치', assetType: 'COMMON', aliases: ['다빈치'] },

  // 4. Financials & Industrial Giants
  { symbol: 'BRK.B', name: '버크셔 해서웨이 B', nameEn: 'Berkshire Hathaway Inc. Class B', market: 'US', exchange: 'NYSE', sector: '복합지주회사 / 워런버핏', assetType: 'COMMON', aliases: ['버핏', '버크셔'] },
  { symbol: 'JPM', name: 'JP모건 체이스', nameEn: 'JPMorgan Chase & Co.', market: 'US', exchange: 'NYSE', sector: '투자은행 / 종합금융', assetType: 'COMMON', aliases: ['제이피모건', '체이스'] },
  { symbol: 'V', name: '비자', nameEn: 'Visa Inc.', market: 'US', exchange: 'NYSE', sector: '전자결제네트워크 / 신용카드', assetType: 'COMMON', aliases: ['비자카드'] },
  { symbol: 'MA', name: '마스터카드', nameEn: 'Mastercard Incorporated', market: 'US', exchange: 'NYSE', sector: '전자결제네트워크 / 신용카드', assetType: 'COMMON', aliases: ['마스터'] },
  { symbol: 'BAC', name: '뱅크오브아메리카', nameEn: 'Bank of America Corporation', market: 'US', exchange: 'NYSE', sector: '상업은행 / 금융', assetType: 'COMMON', aliases: ['boa'] },
  { symbol: 'GS', name: '골드만삭스', nameEn: 'The Goldman Sachs Group, Inc.', market: 'US', exchange: 'NYSE', sector: '투자은행 / 자산운용', assetType: 'COMMON', aliases: ['골드만'] },
  { symbol: 'MS', name: '모건스탠리', nameEn: 'Morgan Stanley', market: 'US', exchange: 'NYSE', sector: '투자은행 / 자산관리', assetType: 'COMMON', aliases: ['모건'] },

  // 5. Consumer & Retail & Industrial
  { symbol: 'WMT', name: '월마트', nameEn: 'Walmart Inc.', market: 'US', exchange: 'NYSE', sector: '대형유통 / 할인점', assetType: 'COMMON', aliases: ['유통'] },
  { symbol: 'COST', name: '코스트코 홀세일', nameEn: 'Costco Wholesale Corporation', market: 'US', exchange: 'NASDAQ', sector: '회원제할인마트', assetType: 'COMMON', aliases: ['코스트코'] },
  { symbol: 'HD', name: '홈디포', nameEn: 'The Home Depot, Inc.', market: 'US', exchange: 'NYSE', sector: '인테리어 / 주택자재유통', assetType: 'COMMON', aliases: ['건자재'] },
  { symbol: 'PG', name: '프록터 앤 갬블 (P&G)', nameEn: 'The Procter & Gamble Company', market: 'US', exchange: 'NYSE', sector: '생활소비재 / 위생용품', assetType: 'COMMON', aliases: ['피앤지', '다우니'] },
  { symbol: 'KO', name: '코카콜라', nameEn: 'The Coca-Cola Company', market: 'US', exchange: 'NYSE', sector: '음료 / 필수소비재', assetType: 'COMMON', aliases: ['콜라'] },
  { symbol: 'PEP', name: '펩시코', nameEn: 'PepsiCo, Inc.', market: 'US', exchange: 'NASDAQ', sector: '음료 / 스낵', assetType: 'COMMON', aliases: ['펩시', '레이즈'] },
  { symbol: 'MCD', name: '맥도날드', nameEn: 'McDonald\'s Corporation', market: 'US', exchange: 'NYSE', sector: '패스트푸드 / 프랜차이즈', assetType: 'COMMON', aliases: ['빅맥'] },
  { symbol: 'SBUX', name: '스타벅스', nameEn: 'Starbucks Corporation', market: 'US', exchange: 'NASDAQ', sector: '커피전문점 / 식음료', assetType: 'COMMON', aliases: ['스벅'] },
  { symbol: 'NKE', name: '나이키', nameEn: 'NIKE, Inc.', market: 'US', exchange: 'NYSE', sector: '스포츠의류 / 운동화', assetType: 'COMMON', aliases: ['조던'] },
  { symbol: 'DIS', name: '월트 디즈니', nameEn: 'The Walt Disney Company', market: 'US', exchange: 'NYSE', sector: '미디어엔터 / 테마파크', assetType: 'COMMON', aliases: ['디즈니플러스', '마블'] },
  { symbol: 'BA', name: '보잉', nameEn: 'The Boeing Company', market: 'US', exchange: 'NYSE', sector: '항공우주 / 민항기제조 / 방산', assetType: 'COMMON', aliases: ['항공기'] },
  { symbol: 'CAT', name: '캐터필러', nameEn: 'Caterpillar Inc.', market: 'US', exchange: 'NYSE', sector: '중장비 / 건설기계', assetType: 'COMMON', aliases: ['굴삭기'] },
  { symbol: 'GE', name: 'GE 에어로스페이스', nameEn: 'General Electric Company', market: 'US', exchange: 'NYSE', sector: '항공엔진 / 항공우주', assetType: 'COMMON', aliases: ['제너럴일렉트릭'] },

  // 6. Energy & Telecom
  { symbol: 'XOM', name: '엑슨모빌', nameEn: 'Exxon Mobil Corporation', market: 'US', exchange: 'NYSE', sector: '에너지 / 석유화학', assetType: 'COMMON', aliases: ['정유'] },
  { symbol: 'CVX', name: '셰브론', nameEn: 'Chevron Corporation', market: 'US', exchange: 'NYSE', sector: '에너지 / 석유가스', assetType: 'COMMON', aliases: ['정유'] },
  { symbol: 'T', name: 'AT&T', nameEn: 'AT&T Inc.', market: 'US', exchange: 'NYSE', sector: '통신서비스 / 5G', assetType: 'COMMON', aliases: ['통신'] },
  { symbol: 'VZ', name: '버라이즌 커뮤니케이션스', nameEn: 'Verizon Communications Inc.', market: 'US', exchange: 'NYSE', sector: '통신서비스 / 무선통신', assetType: 'COMMON', aliases: ['통신'] },

  // 7. Major Benchmark & Sector ETFs
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF', nameEn: 'SPDR S&P 500 ETF Trust', market: 'US', exchange: 'NYSE', sector: 'S&P 500 지수 추종 ETF', assetType: 'ETF', aliases: ['스파이', '에스앤피', 'snp500'] },
  { symbol: 'VOO', name: '뱅가드 S&P 500 ETF', nameEn: 'Vanguard S&P 500 ETF', market: 'US', exchange: 'NYSE', sector: 'S&P 500 지수 추종 ETF', assetType: 'ETF', aliases: ['뱅가드snp'] },
  { symbol: 'IVV', name: 'iShares Core S&P 500 ETF', nameEn: 'iShares Core S&P 500 ETF', market: 'US', exchange: 'NYSE', sector: 'S&P 500 지수 추종 ETF', assetType: 'ETF', aliases: ['아이셰어즈'] },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust (나스닥100)', nameEn: 'Invesco QQQ Trust', market: 'US', exchange: 'NASDAQ', sector: '나스닥 100 지수 추종 ETF', assetType: 'ETF', aliases: ['큐큐큐', '나스닥100'] },
  { symbol: 'SOXX', name: 'iShares 미국 반도체 ETF', nameEn: 'iShares Semiconductor ETF', market: 'US', exchange: 'NASDAQ', sector: '필라델피아 반도체 지수 ETF', assetType: 'ETF', aliases: ['속스', '반도체etf'] },
  { symbol: 'SMH', name: 'VanEck 반도체 ETF', nameEn: 'VanEck Semiconductor ETF', market: 'US', exchange: 'NASDAQ', sector: '반도체 대표기업 ETF', assetType: 'ETF', aliases: ['반도체etf'] },
  { symbol: 'TQQQ', name: 'ProShares UltraPro QQQ (나스닥 3배 레버리지)', nameEn: 'ProShares UltraPro QQQ', market: 'US', exchange: 'NASDAQ', sector: '나스닥 100 3배 레버리지 ETF', assetType: 'ETF', aliases: ['티큐', '레버리지'] },
  { symbol: 'SQQQ', name: 'ProShares UltraPro Short QQQ (나스닥 3배 인버스)', nameEn: 'ProShares UltraPro Short QQQ', market: 'US', exchange: 'NASDAQ', sector: '나스닥 100 3배 인버스(인버스) ETF', assetType: 'ETF', aliases: ['숏큐', '인버스'] },
  { symbol: 'SCHD', name: '슈왑 미국 배당 다우 ETF', nameEn: 'Schwab U.S. Dividend Equity ETF', market: 'US', exchange: 'NYSE', sector: '고배당성장 ETF', assetType: 'ETF', aliases: ['슈드', '배당etf'] },
  { symbol: 'TLT', name: 'iShares 20년 이상 미국 국채 ETF', nameEn: 'iShares 20+ Year Treasury Bond ETF', market: 'US', exchange: 'NASDAQ', sector: '미국 20년물 장기국채 ETF', assetType: 'ETF', aliases: ['미국채', '국채etf'] },
  { symbol: 'GLD', name: 'SPDR Gold Shares (금 ETF)', nameEn: 'SPDR Gold Shares', market: 'US', exchange: 'NYSE', sector: '금 현물 추종 ETF', assetType: 'ETF', aliases: ['금', '골드'] },
];

/**
 * Searches the US stock master with support for:
 * 1. Exact / partial ticker match (case-insensitive)
 * 2. English name partial match
 * 3. Korean name partial match
 * 4. Korean initial consonant (초성) match
 * 5. Aliases match
 */
export function searchUsStocks(query: string, limit: number = 20): UsStockMasterItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const matched = US_STOCK_MASTER.filter(item => {
    // 1. Ticker exact or partial
    if (item.symbol.toLowerCase().includes(q)) return true;
    // 2. English name partial
    if (item.nameEn.toLowerCase().includes(q)) return true;
    // 3. Korean name partial
    if (item.name.toLowerCase().includes(q)) return true;
    // 4. Hangul Chosung match
    if (matchHangulSearch(item.name, q)) return true;
    // 5. Aliases match
    if (item.aliases && item.aliases.some(a => a.toLowerCase().includes(q) || matchHangulSearch(a, q))) {
      return true;
    }
    return false;
  });

  // Relevance ranking
  matched.sort((a, b) => {
    // Exact symbol match is top priority
    if (a.symbol.toLowerCase() === q) return -1;
    if (b.symbol.toLowerCase() === q) return 1;

    // Starts with symbol
    if (a.symbol.toLowerCase().startsWith(q) && !b.symbol.toLowerCase().startsWith(q)) return -1;
    if (!a.symbol.toLowerCase().startsWith(q) && b.symbol.toLowerCase().startsWith(q)) return 1;

    // Exact Korean name match
    if (a.name.toLowerCase() === q) return -1;
    if (b.name.toLowerCase() === q) return 1;

    // Shorter symbols first
    return a.symbol.length - b.symbol.length;
  });

  return matched.slice(0, limit);
}

export function getUsStockBySymbol(symbol: string): UsStockMasterItem | undefined {
  const target = symbol.toUpperCase().trim();
  return US_STOCK_MASTER.find(item => item.symbol.toUpperCase() === target);
}
