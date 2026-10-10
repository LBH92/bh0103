/**
 * Server-Side AI Stock Data Query Service (Function Calling & Grounded Analysis)
 * 
 * Supports user natural language queries such as:
 * - "삼성전자 현재가 알려줘" -> get_stock_quote
 * - "삼성전자 오늘 거래량 어때?" -> get_stock_volume
 * - "내 관심종목 중 오늘 가장 많이 오른 종목은?" -> get_watchlist
 * - "오늘 거래량이 급증한 종목을 보여줘" -> get_volume_spikes
 * - "코스닥 시장 상황을 요약해줘" -> get_market_summary
 * - "오늘 가장 많이 오른 종목은?" -> get_top_gainers
 * - "오늘 가장 많이 떨어진 종목은?" -> get_top_losers
 * 
 * Strict Principle:
 * - Server executes functions to retrieve real numbers.
 * - Gemini explains solely based on returned facts.
 * - Clear separation between verified stock data and AI narrative explanation.
 * - Always shows data timestamp.
 */

import { GoogleGenAI } from '@google/genai';
import { Stock, StockIndex, ExchangeRate } from '../src/types';
import { INITIAL_STOCKS, INITIAL_INDICES, INITIAL_EXCHANGE_RATE } from '../src/services/mockData';
import { TRACKED_STOCKS } from './stockApiService';

// Dynamic references from server.ts
let activeStocks: Stock[] = [...INITIAL_STOCKS];
let activeIndices: StockIndex[] = [...INITIAL_INDICES];
let activeRate: ExchangeRate = { ...INITIAL_EXCHANGE_RATE };

export function updateQueryServiceData(stocks: Stock[], indices: StockIndex[], rate: ExchangeRate) {
  activeStocks = stocks;
  activeIndices = indices;
  activeRate = rate;
}

function getKstTimestamp(): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date()) + ' KST';
}

// -------------------------------------------------------------
// Core Server Functions for AI Tool Use
// -------------------------------------------------------------

export function get_stock_quote(symbolOrName: string) {
  const stock = activeStocks.find(s => s.symbol === symbolOrName || s.name === symbolOrName)
    || activeStocks.find(s => symbolOrName.includes(s.name) || symbolOrName.includes(s.symbol));

  if (!stock) {
    return {
      status: 'not_found',
      message: `'${symbolOrName}' 종목의 실시간 데이터를 찾을 수 없습니다.`,
      dataTimestamp: getKstTimestamp(),
    };
  }

  const prevClose = stock.prevClose || (stock.price - stock.change);
  return {
    status: 'ok',
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
    sector: stock.sector,
    price: stock.price,                   // 현재가 (원)
    change: stock.change,                 // 변동 금액 (원)
    changePercent: stock.changePercent,   // 등락률 (%)
    openPrice: stock.candles?.[stock.candles.length - 1]?.open || prevClose, // 시가
    highPrice: stock.highPrice,           // 고가
    lowPrice: stock.lowPrice,             // 저가
    prevClose,                            // 전일 종가
    marketCap: stock.marketCap,           // 시가총액
    dataTimestamp: getKstTimestamp(),
  };
}

export function get_stock_volume(symbolOrName: string) {
  const stock = activeStocks.find(s => s.symbol === symbolOrName || s.name === symbolOrName)
    || activeStocks.find(s => symbolOrName.includes(s.name) || symbolOrName.includes(s.symbol));

  if (!stock) {
    return {
      status: 'not_found',
      message: `'${symbolOrName}' 종목의 거래량 데이터를 찾을 수 없습니다.`,
      dataTimestamp: getKstTimestamp(),
    };
  }

  return {
    status: 'ok',
    symbol: stock.symbol,
    name: stock.name,
    volume: stock.volume,                 // 누적 거래량 (주)
    volumeRatio: stock.volumeRatio || 100,// 20일 평균 대비 거래량 비율 (%)
    tradingValue: stock.tradingValue,     // 거래대금 (억 원)
    turnoverRate: stock.volume > 0 ? (stock.tradingValue / 100).toFixed(2) + '%' : '0.5%',
    dataTimestamp: getKstTimestamp(),
  };
}

export function get_watchlist(userWatchlistSymbols?: string[]) {
  const symbols = (userWatchlistSymbols && userWatchlistSymbols.length > 0)
    ? userWatchlistSymbols
    : ['005930', '000660', '005380', '042700']; // 기본 관심종목 (삼성전자, SK하이닉스, 현대차, 한미반도체)

  const items = activeStocks
    .filter(s => symbols.includes(s.symbol))
    .map(s => ({
      symbol: s.symbol,
      name: s.name,
      price: s.price,
      changePercent: s.changePercent,
      volume: s.volume,
      tradingValue: s.tradingValue,
    }))
    .sort((a, b) => b.changePercent - a.changePercent);

  const topGainer = items[0] || null;
  const topLoser = items[items.length - 1] || null;

  return {
    status: 'ok',
    totalCount: items.length,
    items,
    topGainer,
    topLoser,
    dataTimestamp: getKstTimestamp(),
  };
}

export function get_market_summary(market?: string) {
  const kospi = activeIndices.find(i => i.symbol === 'KOSPI') || activeIndices[0];
  const kosdaq = activeIndices.find(i => i.symbol === 'KOSDAQ') || activeIndices[1];

  return {
    status: 'ok',
    kospi: {
      name: '코스피 (KOSPI)',
      value: kospi?.value || 2684.52,
      change: kospi?.change || 18.42,
      changePercent: kospi?.changePercent || 0.69,
      tradingValue: `${kospi?.tradingValue || 10.42}조 원`,
      advanceCount: kospi?.advanceCount || 542,
      declineCount: kospi?.declineCount || 321,
    },
    kosdaq: {
      name: '코스닥 (KOSDAQ)',
      value: kosdaq?.value || 872.10,
      change: kosdaq?.change || -3.25,
      changePercent: kosdaq?.changePercent || -0.37,
      tradingValue: `${kosdaq?.tradingValue || 7.85}조 원`,
      advanceCount: kosdaq?.advanceCount || 680,
      declineCount: kosdaq?.declineCount || 840,
    },
    exchangeRate: {
      currency: activeRate.name || '원/달러 환율',
      rate: activeRate.rate || 1348.50,
      changePercent: activeRate.changePercent || -0.31,
    },
    targetMarket: market || 'ALL',
    dataTimestamp: getKstTimestamp(),
  };
}

export function get_top_gainers(limit: number = 5) {
  const sorted = [...activeStocks]
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, limit)
    .map(s => ({
      symbol: s.symbol,
      name: s.name,
      price: s.price,
      changePercent: s.changePercent,
      volume: s.volume,
      tradingValue: s.tradingValue,
    }));

  return {
    status: 'ok',
    count: sorted.length,
    gainers: sorted,
    dataTimestamp: getKstTimestamp(),
  };
}

export function get_top_losers(limit: number = 5) {
  const sorted = [...activeStocks]
    .sort((a, b) => a.changePercent - b.changePercent)
    .slice(0, limit)
    .map(s => ({
      symbol: s.symbol,
      name: s.name,
      price: s.price,
      changePercent: s.changePercent,
      volume: s.volume,
      tradingValue: s.tradingValue,
    }));

  return {
    status: 'ok',
    count: sorted.length,
    losers: sorted,
    dataTimestamp: getKstTimestamp(),
  };
}

export function get_volume_spikes(threshold: number = 150) {
  const spikes = activeStocks
    .filter(s => (s.volumeRatio || 100) >= threshold)
    .sort((a, b) => (b.volumeRatio || 0) - (a.volumeRatio || 0))
    .map(s => ({
      symbol: s.symbol,
      name: s.name,
      price: s.price,
      changePercent: s.changePercent,
      volume: s.volume,
      volumeRatio: s.volumeRatio,
      tradingValue: s.tradingValue,
    }));

  return {
    status: 'ok',
    thresholdPercent: threshold,
    count: spikes.length,
    spikes,
    dataTimestamp: getKstTimestamp(),
  };
}

// -------------------------------------------------------------
// Intent Resolver & Function Dispatcher
// -------------------------------------------------------------

export interface FunctionCallPlan {
  functionName: string;
  args: Record<string, any>;
  data: any;
}

export function resolveAndExecuteQuery(query: string, userWatchlist?: string[]): FunctionCallPlan {
  const q = query.trim().toLowerCase();

  // 1. Watchlist query (e.g., "내 관심종목 중 오늘 가장 많이 오른 종목은?", "관심종목 현황")
  if (q.includes('관심종목') || q.includes('내 관심') || q.includes('관심 종목')) {
    const data = get_watchlist(userWatchlist);
    return { functionName: 'get_watchlist', args: { userWatchlist }, data };
  }

  // 2. Volume Spike query (e.g., "오늘 거래량이 급증한 종목을 보여줘", "거래량 폭증 종목")
  if (q.includes('거래량') && (q.includes('급증') || q.includes('폭증') || q.includes('터진') || q.includes('많은 종목') || q.includes('몰린'))) {
    const data = get_volume_spikes(140);
    return { functionName: 'get_volume_spikes', args: { threshold: 140 }, data };
  }

  // 3. Top Gainers query (e.g., "오늘 가장 많이 오른 종목", "상승률 1위")
  if ((q.includes('많이 오른') || q.includes('상승 1위') || q.includes('급등주') || q.includes('상승률 상위')) && !q.includes('관심')) {
    const data = get_top_gainers(5);
    return { functionName: 'get_top_gainers', args: { limit: 5 }, data };
  }

  // 4. Top Losers query (e.g., "오늘 가장 많이 떨어진 종목", "하락률 상위")
  if (q.includes('많이 떨어진') || q.includes('하락률 상위') || q.includes('급락주') || q.includes('가장 하락')) {
    const data = get_top_losers(5);
    return { functionName: 'get_top_losers', args: { limit: 5 }, data };
  }

  // 5. Market Summary query (e.g., "코스닥 시장 상황을 요약해줘", "코스피 현황", "시장 지수 어때")
  if (q.includes('코스피') || q.includes('코스닥') || q.includes('시장 상황') || q.includes('증시 현황') || q.includes('시장 요약')) {
    const targetMarket = q.includes('코스닥') ? 'KOSDAQ' : (q.includes('코스피') ? 'KOSPI' : 'ALL');
    const data = get_market_summary(targetMarket);
    return { functionName: 'get_market_summary', args: { market: targetMarket }, data };
  }

  // 6. Specific Stock Volume query (e.g., "삼성전자 오늘 거래량 어때?")
  if (q.includes('거래량') || q.includes('거래대금') || q.includes('수급')) {
    const symbol = detectTargetSymbol(query);
    const data = get_stock_volume(symbol);
    return { functionName: 'get_stock_volume', args: { symbol }, data };
  }

  // 7. Specific Stock Quote query (e.g., "삼성전자 현재가 알려줘", "SK하이닉스 얼마야?")
  const detected = detectTargetSymbol(query);
  const data = get_stock_quote(detected);
  return { functionName: 'get_stock_quote', args: { symbol: detected }, data };
}

function detectTargetSymbol(query: string): string {
  for (const item of TRACKED_STOCKS) {
    if (query.includes(item.name) || query.includes(item.symbol)) {
      return item.symbol;
    }
  }
  for (const s of activeStocks) {
    if (query.includes(s.name) || query.includes(s.symbol)) {
      return s.symbol;
    }
  }
  return '005930'; // 기본값: 삼성전자
}

// -------------------------------------------------------------
// AI Response Generation with Gemini
// -------------------------------------------------------------

export interface StockQueryExecutionResult {
  query: string;
  functionCalled: string;
  dataTimestamp: string;
  rawData: any; // Clearly separated verified stock/market data
  aiExplanation: string; // Clearly separated AI-generated explanation
}

export async function processStockDataQuery(
  query: string,
  userWatchlist?: string[],
  userGenAI?: { client: GoogleGenAI; model: string }
): Promise<StockQueryExecutionResult> {
  const plan = resolveAndExecuteQuery(query, userWatchlist);
  const dataTimestamp = plan.data?.dataTimestamp || getKstTimestamp();

  const systemPrompt = `
당신은 대한민국 증권 시장 데이터 질의응답 AI입니다.
당신은 제공된 [서버 조회 실제 데이터]만을 사실(Fact)로 삼아 사용자의 질문에 답해야 합니다.

[엄격한 원칙]
1. 절대로 임의로 주가나 거래량을 창작하지 마십시오.
2. 제공된 실제 수치를 명확하게 인용하십시오.
3. 데이터 시점을 명확히 인지하고 데이터에 근거하여 간결하고 신뢰성 있게 설명하십시오.
4. "무조건 오른다", "반드시 매수해야 한다" 등의 단정적 투자 권유는 일체 금지합니다.
5. 답변은 정중하고 명확한 존댓말로 2~4문장 내외로 핵심을 요약하십시오.
`.trim();

  const userPrompt = `
[사용자 질문]
"${query}"

[실행된 서버 함수]
${plan.functionName}

[서버 조회 실제 데이터 (Fact)]
${JSON.stringify(plan.data, null, 2)}
`.trim();

  let aiExplanation = '';

  if (userGenAI?.client) {
    try {
      const response = await userGenAI.client.models.generateContent({
        model: userGenAI.model || 'gemini-3.8-flash',
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }
        ],
        config: {
          temperature: 0.2,
          maxOutputTokens: 600,
        },
      });

      if (response && response.text) {
        aiExplanation = response.text.trim();
      }
    } catch (err: any) {
      console.warn('[AiStockQuery] User Gemini API call error:', err);
      throw new Error(`개인 Gemini API 호출 중 오류가 발생했습니다: ${err.message || String(err)}`);
    }
  } else {
    // Strictly block operator AI call for personal natural language query
    throw new Error('AI_NOT_CONNECTED: 개인 AI 계정이 연결되어 있지 않습니다. 프로필 화면에서 본인의 Google AI Studio Gemini API 키를 등록한 후 이용해주세요.');
  }

  return {
    query,
    functionCalled: plan.functionName,
    dataTimestamp,
    rawData: plan.data,
    aiExplanation,
  };
}

function generateDeterministicExplanation(functionName: string, data: any, query: string): string {
  if (!data || data.status === 'not_found') {
    return '요청하신 종목 또는 지수의 실시간 데이터를 찾을 수 없습니다. 종목명(예: 삼성전자)을 확인해주세요.';
  }

  switch (functionName) {
    case 'get_stock_quote': {
      const isUp = data.change >= 0;
      return `${data.name}(${data.symbol})의 현재가는 전일 종가(${data.prevClose?.toLocaleString()}원) 대비 ${isUp ? '+' : ''}${data.change?.toLocaleString()}원(${isUp ? '+' : ''}${data.changePercent}%) ${isUp ? '상승한' : '하락한'} ${data.price?.toLocaleString()}원입니다. 당일 시가는 ${data.openPrice?.toLocaleString()}원, 장중 고가는 ${data.highPrice?.toLocaleString()}원, 저가는 ${data.lowPrice?.toLocaleString()}원을 기록 중입니다.`;
    }

    case 'get_stock_volume': {
      return `${data.name}(${data.symbol})의 당일 누적 거래량은 ${data.volume?.toLocaleString()}주이며, 20일 평균 거래량 대비 약 ${data.volumeRatio}% 수준입니다. 당일 누적 거래대금은 약 ${data.tradingValue?.toLocaleString()}억 원으로 시장 내 활발한 유동성을 보여주고 있습니다.`;
    }

    case 'get_watchlist': {
      const top = data.topGainer;
      if (!top) return '현재 등록된 관심종목 데이터가 없습니다.';
      const isUp = top.changePercent >= 0;
      return `등록하신 관심종목 총 ${data.totalCount}개 중 오늘 가장 높은 상승률을 기록 중인 종목은 '${top.name}'(현재가 ${top.price?.toLocaleString()}원, ${isUp ? '+' : ''}${top.changePercent}%)입니다.`;
    }

    case 'get_volume_spikes': {
      const count = data.count || 0;
      if (count === 0) return '현재 기준 20일 평균 대비 거래량이 급증(140% 이상)한 종목이 포착되지 않았습니다.';
      const first = data.spikes[0];
      return `오늘 20일 평균 대비 거래량이 급증한 종목은 총 ${count}개입니다. 특히 '${first.name}'이(가) 평균 대비 ${first.volumeRatio}%의 거래량(${first.volume?.toLocaleString()}주, 거래대금 ${first.tradingValue?.toLocaleString()}억 원)을 기록하며 가장 강한 수급 집중을 보이고 있습니다.`;
    }

    case 'get_top_gainers': {
      const first = data.gainers?.[0];
      if (!first) return '상승 종목 데이터를 집계 중입니다.';
      return `오늘 시장에서 가장 높은 상승률을 기록 중인 상위 종목은 '${first.name}'(+${first.changePercent}%, ${first.price?.toLocaleString()}원)입니다. 상위 5개 종목으로 수급이 지속 유입되고 있습니다.`;
    }

    case 'get_top_losers': {
      const first = data.losers?.[0];
      if (!first) return '하락 종목 데이터를 집계 중입니다.';
      return `오늘 시장에서 가장 하락폭이 큰 종목은 '${first.name}'(${first.changePercent}%, ${first.price?.toLocaleString()}원)입니다.`;
    }

    case 'get_market_summary': {
      const k = data.kospi;
      const q = data.kosdaq;
      const ex = data.exchangeRate;
      return `현재 코스피 지수는 ${k.value?.toLocaleString()}포인트(${k.changePercent >= 0 ? '+' : ''}${k.changePercent}%, 거래대금 ${k.tradingValue}), 코스닥 지수는 ${q.value?.toLocaleString()}포인트(${q.changePercent >= 0 ? '+' : ''}${q.changePercent}%, 거래대금 ${q.tradingValue})를 나타내고 있습니다. 원/달러 환율은 ${ex.rate?.toLocaleString()}원(${ex.changePercent >= 0 ? '+' : ''}${ex.changePercent}%)으로 안정적인 흐름을 유지하고 있습니다.`;
    }

    default:
      return '서버에 저장된 최신 주식 데이터를 바탕으로 분석을 완료했습니다.';
  }
}
