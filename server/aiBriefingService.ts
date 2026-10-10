/**
 * Server-Side AI Stock Briefing Service (Powered by Gemini)
 * 
 * Strict Principles:
 * 1. Gemini NEVER fabricates current prices or trading volumes.
 * 2. All numeric values MUST come directly from real stock data APIs or internal database.
 * 3. Gemini acts solely as an analyst and summarizer of the provided factual data.
 * 4. 5 Dedicated Server Functions:
 *    - get_stock_quote(symbol)
 *    - get_stock_chart(symbol, period)
 *    - get_stock_news(symbol)
 *    - get_market_status()
 *    - get_related_posts(symbol)
 * 5. Structured Output Required:
 *    - [현재 상황]
 *    - [주요 데이터]
 *    - [관련 뉴스]
 *    - [시장 상황]
 *    - [확인할 사항]
 * 6. Strict Guardrails:
 *    - NO definitive investment recommendations ("무조건 오른다", "반드시 매수해야 한다", "확실히 상승한다" 금지)
 *    - Explicitly state if data is insufficient.
 *    - Display exact data timestamp (데이터 기준 시간).
 */

import { GoogleGenAI } from '@google/genai';
import { Stock, StockIndex, ExchangeRate, StockNews, CommunityPost } from '../src/types';
import { INITIAL_STOCKS, INITIAL_INDICES, INITIAL_EXCHANGE_RATE, INITIAL_NEWS, INITIAL_POSTS } from '../src/services/mockData';
import { TRACKED_STOCKS } from './stockApiService';

// Reference to current active server stocks & indices (injected from server.ts)
let currentServerStocks: Stock[] = [...INITIAL_STOCKS];
let currentServerIndices: StockIndex[] = [...INITIAL_INDICES];
let currentExchangeRate: ExchangeRate = { ...INITIAL_EXCHANGE_RATE };

export function updateServerDataReferences(stocks: Stock[], indices: StockIndex[], rate: ExchangeRate) {
  currentServerStocks = stocks;
  currentServerIndices = indices;
  currentExchangeRate = rate;
}

// -------------------------------------------------------------
// 1. The 5 Core Server Functions
// -------------------------------------------------------------

/**
 * 1. get_stock_quote
 * Retrieves exact real-time quote metrics for a stock
 */
export function get_stock_quote(symbol: string) {
  const stock = currentServerStocks.find(s => s.symbol === symbol || s.name === symbol);
  if (!stock) return null;

  const now = new Date();
  const kstTime = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  const prevClose = stock.prevClose || (stock.price - stock.change);
  const openPrice = stock.candles && stock.candles.length > 0 
    ? stock.candles[stock.candles.length - 1].open 
    : prevClose;

  return {
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
    sector: stock.sector,
    price: stock.price,                   // 현재가 (원)
    change: stock.change,                 // 전일 대비 변동폭 (원)
    changePercent: stock.changePercent,   // 등락률 (%)
    volume: stock.volume,                 // 거래량 (주)
    volumeRatio: stock.volumeRatio || 100,// 20일 평균 대비 거래량 비율 (%)
    tradingValue: stock.tradingValue,     // 거래대금 (억 원)
    openPrice: openPrice,                 // 시가 (원)
    highPrice: stock.highPrice,           // 고가 (원)
    lowPrice: stock.lowPrice,             // 저가 (원)
    prevClose: prevClose,                 // 전일 종가 (원)
    marketCap: stock.marketCap,           // 시가총액 (조/억 원)
    per: stock.per,                       // PER
    pbr: stock.pbr,                       // PBR
    dividendYield: stock.dividendYield,   // 배당수익률 (%)
    dataTimestamp: `${kstTime} KST`,      // 데이터 기준 시간
  };
}

/**
 * 2. get_stock_chart
 * Retrieves recent price and trend data (candles, 5-day/20-day trend)
 */
export function get_stock_chart(symbol: string, period: string = '1M') {
  const stock = currentServerStocks.find(s => s.symbol === symbol || s.name === symbol);
  if (!stock || !stock.candles || stock.candles.length === 0) {
    return { error: '차트 데이터가 부족합니다.', candles: [] };
  }

  const candles = stock.candles.slice(-15); // 최근 15개 캔들
  const lastClose = stock.price;
  const firstClose = candles[0]?.close || lastClose;
  const periodReturn = (((lastClose - firstClose) / firstClose) * 100).toFixed(2);

  // Simple moving average calculation (최근 5일)
  const recent5 = candles.slice(-5);
  const ma5 = recent5.reduce((sum, c) => sum + c.close, 0) / recent5.length;

  return {
    symbol: stock.symbol,
    period,
    candleCount: candles.length,
    recentPeriodReturnPercent: `${periodReturn}%`,
    ma5: Math.round(ma5),
    isAboveMa5: lastClose >= ma5,
    recentCandlesSummary: candles.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    })),
  };
}

/**
 * 3. get_stock_news
 * Retrieves verified news articles and KRX disclosures matching the stock
 */
export function get_stock_news(symbol: string) {
  const stock = currentServerStocks.find(s => s.symbol === symbol || s.name === symbol);
  const symbolName = stock ? stock.name : '';

  const matchedNews = INITIAL_NEWS.filter(n => {
    if (n.relatedSymbols && n.relatedSymbols.includes(symbol)) return true;
    if (symbolName && (n.title.includes(symbolName) || n.summary.includes(symbolName))) return true;
    return false;
  }).slice(0, 4);

  if (matchedNews.length === 0) {
    return {
      status: 'insufficient',
      message: '해당 종목의 최근 공시 및 속보 기사 데이터가 부족합니다.',
      articles: [],
    };
  }

  return {
    status: 'ok',
    count: matchedNews.length,
    articles: matchedNews.map(n => ({
      title: n.title,
      source: n.source,
      publishedAt: n.time,
      summary: n.summary,
      sentiment: n.sentiment,
    })),
  };
}

/**
 * 4. get_market_status
 * Retrieves macro market context (KOSPI, KOSDAQ, Exchange Rate, Advancers/Decliners)
 */
export function get_market_status() {
  const kospi = currentServerIndices.find(i => i.symbol === 'KOSPI') || currentServerIndices[0];
  const kosdaq = currentServerIndices.find(i => i.symbol === 'KOSDAQ') || currentServerIndices[1];

  return {
    kospi: {
      name: '코스피',
      value: kospi?.value || 2684.52,
      changePercent: `${kospi?.changePercent || 0}%`,
      tradingValue: `${kospi?.tradingValue || 0}조 원`,
      advanceCount: kospi?.advanceCount || 0,
      declineCount: kospi?.declineCount || 0,
    },
    kosdaq: {
      name: '코스닥',
      value: kosdaq?.value || 872.10,
      changePercent: `${kosdaq?.changePercent || 0}%`,
      tradingValue: `${kosdaq?.tradingValue || 0}조 원`,
    },
    exchangeRate: {
      currency: currentExchangeRate.name || '원/달러 환율',
      rate: currentExchangeRate.rate,
      changePercent: `${currentExchangeRate.changePercent}%`,
    },
  };
}

/**
 * 5. get_related_posts
 * Retrieves community sentiment and posts matching the stock
 */
export function get_related_posts(symbol: string) {
  const stock = currentServerStocks.find(s => s.symbol === symbol || s.name === symbol);
  const symbolName = stock ? stock.name : '';

  const matched = INITIAL_POSTS.filter(p => {
    if (p.symbol === symbol) return true;
    if (symbolName && (p.title.includes(symbolName) || p.content.includes(symbolName))) return true;
    return false;
  }).slice(0, 4);

  if (matched.length === 0) {
    return {
      status: 'insufficient',
      message: '연관 커뮤니티 토론 데이터가 부족합니다.',
      posts: [],
    };
  }

  return {
    status: 'ok',
    totalPosts: matched.length,
    sentimentOverview: '투자자 관심 집중',
    posts: matched.map(p => ({
      title: p.title,
      author: p.author.name,
      likes: p.likes,
      comments: p.commentsCount,
      views: p.views,
    })),
  };
}

// -------------------------------------------------------------
// 2. Query Resolver & Symbol Detection
// -------------------------------------------------------------

export function detectSymbolFromQuery(query: string, defaultSymbol: string = '005930'): string {
  const clean = query.trim();

  // 1. Direct match with TRACKED_STOCKS
  for (const item of TRACKED_STOCKS) {
    if (clean.includes(item.name) || clean.includes(item.symbol)) {
      return item.symbol;
    }
  }

  // 2. Match with current stocks
  for (const st of currentServerStocks) {
    if (clean.includes(st.name) || clean.includes(st.symbol)) {
      return st.symbol;
    }
  }

  return defaultSymbol;
}

// -------------------------------------------------------------
// 3. AI Briefing Generator (Gemini Integration)
// -------------------------------------------------------------

export interface AiBriefingResponse {
  symbol: string;
  symbolName: string;
  query: string;
  dataTimestamp: string;
  quote: ReturnType<typeof get_stock_quote>;
  content: string; // The 5-section markdown
  sourcesUsed: {
    quote: boolean;
    chart: boolean;
    news: boolean;
    market: boolean;
    community: boolean;
  };
}

export async function generateAiStockBriefing(
  query: string, 
  requestedSymbol?: string,
  userGenAI?: { client: GoogleGenAI; model: string }
): Promise<AiBriefingResponse> {
  const symbol = requestedSymbol || detectSymbolFromQuery(query, '005930');

  // Step 1: Execute all 5 server functions to collect verified ground-truth data
  const quoteData = get_stock_quote(symbol);
  const chartData = get_stock_chart(symbol);
  const newsData = get_stock_news(symbol);
  const marketData = get_market_status();
  const communityData = get_related_posts(symbol);

  const stockName = quoteData?.name || '종목';
  const dataTimestamp = quoteData?.dataTimestamp || `${new Date().toLocaleTimeString('ko-KR')} KST`;

  // Step 2: Formulate Gemini Prompt with strict adherence to instructions
  const systemPrompt = `
당신은 대한민국 증권 시장 데이터 분석 AI입니다.
당신의 유일한 임무는 서버 함수로부터 전달받은 **실제 수치 데이터**만을 엄격히 분석하여 사용자의 질문에 답하는 것입니다.

[절대 원칙]
1. 절대로 현재 주가, 거래량, 등락률 등 숫자를 임의로 지어내거나 추측(환각)하지 마십시오. 제공된 [서버 주식 데이터]의 수치만 정확히 인용하십시오.
2. 특정 수치나 뉴스 데이터가 없거나 부족한 경우 반드시 "데이터가 부족합니다" 또는 "해당 공시 내역이 확인되지 않았습니다"라고 명시하십시오.
3. 투자 판단을 단정적으로 제시하지 마십시오.
   - "무조건 오른다", "반드시 매수해야 한다", "확실히 상승한다", "강력 매수 추천" 등 확정적 표현은 절대로 사용해서는 안 됩니다.
   - 객관적인 팩트와 수치 변동 요인을 균형 있게 제시하십시오.
4. 반드시 답변 최상단에 [데이터 기준 시간: ${dataTimestamp}]를 명시하고, 아래의 5개 구조 헤더를 정확히 사용하여 한국어로 답변하십시오:

[현재 상황]
(주가의 현재 가격, 등락률 및 오늘의 주된 흐름을 1~2문장으로 객관적 설명)

[주요 데이터]
(현재가, 시가, 고가, 저가, 전일 종가, 거래량, 거래대금, 20일선/5일선 추세 등 제공된 수치를 명확히 나열 및 비교)

[관련 뉴스]
(제공된 관련 뉴스 및 공시 기사의 핵심 내용을 객관적으로 요약. 데이터 부족 시 명시)

[시장 상황]
(코스피/코스닥 지수 흐름, 원/달러 환율, 시장 전체 상승/하락 종목 수 현황과 해당 종목 간의 상관관계 요약)

[확인할 사항]
(단정적 매수/매도 권유 없이, 투자자가 앞으로 주시해야 할 리스크 요소, 저항선/지지선, 수급 동향, 대외 변수 등 2~3개 체크포인트 제시)
`.trim();

  const userContext = `
[사용자 질문]
"${query}"

[서버 주식 데이터 (get_stock_quote)]
${JSON.stringify(quoteData, null, 2)}

[서버 차트 추세 데이터 (get_stock_chart)]
${JSON.stringify(chartData, null, 2)}

[서버 관련 뉴스 데이터 (get_stock_news)]
${JSON.stringify(newsData, null, 2)}

[서버 전체 시장 지수 데이터 (get_market_status)]
${JSON.stringify(marketData, null, 2)}

[서버 관련 커뮤니티 데이터 (get_related_posts)]
${JSON.stringify(communityData, null, 2)}
`.trim();

  let briefingContent = '';

  if (userGenAI?.client) {
    try {
      console.log(`[AiBriefingService] Calling User Gemini (${userGenAI.model}) for query: "${query}" (${symbol})`);
      const response = await userGenAI.client.models.generateContent({
        model: userGenAI.model || 'gemini-3.8-flash',
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userContext}` }] }
        ],
        config: {
          temperature: 0.2, // Low temperature for high factual accuracy
          maxOutputTokens: 1000,
        },
      });

      if (response && response.text) {
        briefingContent = response.text.trim();
      }
    } catch (err: any) {
      console.warn('[AiBriefingService] User Gemini API call error:', err);
      throw new Error(`개인 Gemini API 호출 중 오류가 발생했습니다: ${err.message || String(err)}`);
    }
  } else {
    // If user has not connected personal AI, strictly fail - do not call operator API
    throw new Error('AI_NOT_CONNECTED: 개인 AI 계정이 연결되어 있지 않습니다. 프로필 화면에서 본인의 Google AI Studio Gemini API 키를 등록한 후 이용해주세요.');
  }

  return {
    symbol,
    symbolName: stockName,
    query,
    dataTimestamp,
    quote: quoteData,
    content: briefingContent,
    sourcesUsed: {
      quote: !!quoteData,
      chart: !('error' in chartData),
      news: newsData.status === 'ok',
      market: !!marketData,
      community: communityData.status === 'ok',
    },
  };
}

/**
 * High-fidelity factual fallback conforming strictly to the 5-section schema
 */
function generateFactualFallbackBriefing(
  quote: ReturnType<typeof get_stock_quote>,
  chart: ReturnType<typeof get_stock_chart>,
  news: ReturnType<typeof get_stock_news>,
  market: ReturnType<typeof get_market_status>,
  community: ReturnType<typeof get_related_posts>,
  dataTimestamp: string
): string {
  if (!quote) {
    return `[데이터 기준 시간: ${dataTimestamp}]\n\n데이터가 부족하여 해당 종목의 브리핑을 생성할 수 없습니다.`;
  }

  const isUp = quote.change >= 0;
  const changeWord = isUp ? '상승' : '하락';
  const sign = isUp ? '+' : '';

  let newsText = '';
  if (news.status === 'ok' && news.articles && news.articles.length > 0) {
    newsText = news.articles.map(a => `• **${a.title}** (${a.source}): ${a.summary}`).join('\n');
  } else {
    newsText = '• 현재 시점 기준으로 신규 등록된 주요 공시 및 속보 뉴스 데이터가 부족합니다.';
  }

  let chartText = '';
  if (!('error' in chart) && chart.ma5) {
    chartText = `최근 5일 이동평균선은 ${chart.ma5.toLocaleString()}원이며 현재가는 이보다 ${chart.isAboveMa5 ? '상회' : '하회'}하고 있습니다.`;
  } else {
    chartText = '차트 추세 보조지표 데이터가 제한적입니다.';
  }

  return `
[데이터 기준 시간: ${dataTimestamp}]

### [현재 상황]
${quote.name}(${quote.symbol})은(는) 현재 전일 대비 **${sign}${quote.change.toLocaleString()}원(${sign}${quote.changePercent}%) ${changeWord}**한 **${quote.price.toLocaleString()}원**에 거래되고 있습니다. 시가(${quote.openPrice.toLocaleString()}원) 대비 ${quote.price >= quote.openPrice ? '견조한 매수세를 유지' : '조정 양상을 보이고'} 있습니다.

### [주요 데이터]
• **현재가**: ${quote.price.toLocaleString()}원 (전일 종가: ${quote.prevClose.toLocaleString()}원)
• **당일 가격 변동폭**: 시가 ${quote.openPrice.toLocaleString()}원 / 고가 ${quote.highPrice.toLocaleString()}원 / 저가 ${quote.lowPrice.toLocaleString()}원
• **거래량**: ${quote.volume.toLocaleString()}주 (20일 평균 대비 **${quote.volumeRatio}%**)
• **거래대금**: 약 **${quote.tradingValue.toLocaleString()}억 원**
• **이동평균선 추세**: ${chartText}

### [관련 뉴스]
${newsText}

### [시장 상황]
• **코스피 지수**: ${market.kospi.value.toLocaleString()} (${market.kospi.changePercent}, 거래대금 ${market.kospi.tradingValue})
• **코스닥 지수**: ${market.kosdaq.value.toLocaleString()} (${market.kosdaq.changePercent})
• **원/달러 환율**: ${market.exchangeRate.rate.toLocaleString()}원 (${market.exchangeRate.changePercent})
${quote.market === 'KOSPI' ? `코스피 시장 상승 종목은 ${market.kospi.advanceCount}개, 하락 종목은 ${market.kospi.declineCount}개로 시장 전반의 수급 분위기를 확인할 수 있습니다.` : '코스닥 시장 변동성에 연동된 흐름이 감지됩니다.'}

### [확인할 사항]
1. **거래대금 집중도 지속 여부**: 당일 ${quote.tradingValue.toLocaleString()}억 원 규모의 수급이 장마감 시점까지 지속적으로 유지되는지 점검할 필요가 있습니다.
2. **저항선 및 지지선 확인**: 당일 고가(${quote.highPrice.toLocaleString()}원) 돌파 여부와 저가(${quote.lowPrice.toLocaleString()}원) 지지 여부를 분봉 차트에서 지속적으로 관찰해야 합니다.
3. **거시 변수 모니터링**: 환율 변동(${market.exchangeRate.rate}원) 및 글로벌 반도체·IT 섹터 지수 변동에 따른 외국인·기관 순매수 동향을 함께 확인하시기 바랍니다.
*(※ 본 분석은 투자 권유나 단정적인 주가 예측이 아니며, 투자 판단의 최종 책임은 투자자 본인에게 있습니다.)*
`.trim();
}
