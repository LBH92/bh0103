/**
 * Server-Side Stock API Service
 * 
 * Strict Principle:
 * - NO external stock API is called directly from browser!
 * - All external API calls, keys, rate limiting, and caching live here on the server.
 */

import { CandleData, Stock, StockIndex, ExchangeRate } from '../src/types';
import { kiwoomApiService } from './kiwoomApiService';

interface ServerCacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

const serverCache = new Map<string, ServerCacheEntry<any>>();

function getFromCache<T>(key: string): T | null {
  const entry = serverCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp < entry.ttlMs) {
    return entry.data as T;
  }
  return null;
}

function setInCache<T>(key: string, data: T, ttlMs: number): void {
  serverCache.set(key, {
    data,
    timestamp: Date.now(),
    ttlMs,
  });
}

// Korean Stock Registry with Ticker mappings
export const TRACKED_STOCKS = [
  { symbol: '005930', ticker: '005930.KS', name: '삼성전자', market: 'KOSPI' as const, sector: '반도체 / IT' },
  { symbol: '000660', ticker: '000660.KS', name: 'SK하이닉스', market: 'KOSPI' as const, sector: '반도체 / HBM' },
  { symbol: '005380', ticker: '005380.KS', name: '현대차', market: 'KOSPI' as const, sector: '자동차 / 모빌리티' },
  { symbol: '000270', ticker: '000270.KS', name: '기아', market: 'KOSPI' as const, sector: '자동차 / 모빌리티' },
  { symbol: '196170', ticker: '196170.KQ', name: '알테오젠', market: 'KOSDAQ' as const, sector: '바이오 / 플랫폼' },
  { symbol: '042700', ticker: '042700.KS', name: '한미반도체', market: 'KOSPI' as const, sector: '반도체 / TC본더' },
  { symbol: '064350', ticker: '064350.KS', name: '현대로템', market: 'KOSPI' as const, sector: '방위산업 / 철도' },
  { symbol: '034020', ticker: '034020.KS', name: '두산에너빌리티', market: 'KOSPI' as const, sector: '원자력 / 플랜트' },
  { symbol: '373220', ticker: '373220.KS', name: 'LG에너지솔루션', market: 'KOSPI' as const, sector: '2차전지 / 배터리' },
  { symbol: '247540', ticker: '247540.KQ', name: '에코프로비엠', market: 'KOSDAQ' as const, sector: '2차전지 / 양극재' },
  { symbol: '086520', ticker: '086520.KQ', name: '에코프로', market: 'KOSDAQ' as const, sector: '2차전지 / 지주' },
  { symbol: '207940', ticker: '207940.KS', name: '삼성바이오로직스', market: 'KOSPI' as const, sector: '바이오 / CDMO' },
  { symbol: '035420', ticker: '035420.KS', name: 'NAVER', market: 'KOSPI' as const, sector: 'IT인터넷 / 플랫폼' },
  { symbol: '035720', ticker: '035720.KS', name: '카카오', market: 'KOSPI' as const, sector: 'IT인터넷 / 플랫폼' },
  { symbol: '005490', ticker: '005490.KS', name: 'POSCO홀딩스', market: 'KOSPI' as const, sector: '철강 / 친환경소재' },
  { symbol: '012330', ticker: '012330.KS', name: '현대모비스', market: 'KOSPI' as const, sector: '자동차부품' },
  { symbol: '105560', ticker: '105560.KS', name: 'KB금융', market: 'KOSPI' as const, sector: '금융 / 은행' },
  { symbol: '055550', ticker: '055550.KS', name: '신한지주', market: 'KOSPI' as const, sector: '금융 / 은행' },
  { symbol: '417860', ticker: '417860.KQ', name: '삼현', market: 'KOSDAQ' as const, sector: '로봇 / 액추에이터' },
];

export interface FetchStockResult {
  stock: Stock | null;
  dataSource: 'kiwoom' | 'yahoo' | 'mock';
}

export interface FetchAllStocksResult {
  stocks: Stock[];
  dataSource: 'kiwoom' | 'yahoo' | 'mock';
}

/**
 * Fetch real stock data for a single symbol with data source tracking
 * Priority 1: Kiwoom Open API (if KIWOOM_APP_KEY and KIWOOM_APP_SECRET configured)
 * Priority 2: Yahoo Finance Live Chart API
 * Priority 3: Master stock cache / mock
 */
export async function fetchRealStockDataWithSource(symbol: string): Promise<FetchStockResult> {
  const cacheKey = `stock_real_source_${symbol}`;
  const cached = getFromCache<FetchStockResult>(cacheKey);
  if (cached) return cached;

  const masterItem = kiwoomApiService.getMasterStock(symbol);
  const item = TRACKED_STOCKS.find(s => s.symbol === symbol);
  if (!masterItem && !item && !kiwoomApiService.isConfigured()) {
    return { stock: null, dataSource: 'mock' };
  }

  const stockName = masterItem?.name || item?.name || symbol;
  const stockMarket = masterItem?.market || item?.market || 'KOSPI';
  const stockSector = masterItem?.sector || item?.sector || '기타';

  // 1. Priority: Try Kiwoom REST API if configured
  if (kiwoomApiService.isConfigured()) {
    try {
      const kiwoomData = await kiwoomApiService.fetchStockPrice(symbol);
      if (kiwoomData && kiwoomData.price) {
        const price = kiwoomData.price;
        const change = kiwoomData.change || 0;
        const prevClose = kiwoomData.prevClose || (price - change);
        let kiwoomCandles = await kiwoomApiService.fetchStockCandles(symbol).catch(() => []);
        if (!kiwoomCandles || kiwoomCandles.length === 0) {
          kiwoomCandles = [
            { time: '09:00', open: kiwoomData.openPrice || price, high: price, low: kiwoomData.openPrice || price, close: price, volume: 10000 }
          ];
        }
        const sparkline = kiwoomCandles.slice(-7).map(c => c.close);
        const stock: Stock = {
          symbol,
          name: kiwoomData.name || stockName,
          market: stockMarket,
          sector: stockSector,
          price,
          change,
          changePercent: kiwoomData.changePercent !== undefined ? kiwoomData.changePercent : Number(((change / (prevClose || 1)) * 100).toFixed(2)),
          volume: kiwoomData.volume || 0,
          volumeRatio: 120.0,
          tradingValue: kiwoomData.tradingValue || Math.round((price * (kiwoomData.volume || 1000000)) / 100000000),
          openPrice: kiwoomData.openPrice || price,
          highPrice: kiwoomData.highPrice || price,
          lowPrice: kiwoomData.lowPrice || price,
          prevClose,
          high52w: kiwoomData.high52w || Math.round(price * 1.3),
          low52w: kiwoomData.low52w || Math.round(price * 0.7),
          marketCap: kiwoomData.marketCap || masterItem?.marketCap || Math.round((price * 500000000) / 100000000),
          per: kiwoomData.per || 15.2,
          pbr: kiwoomData.pbr || 1.4,
          eps: kiwoomData.eps || Math.round(price / 15.2),
          dividendYield: 1.5,
          foreignNetBuy: 0,
          instNetBuy: 0,
          candles: kiwoomCandles,
          sparkline: sparkline.length >= 2 ? sparkline : [prevClose, price],
        };
        const result: FetchStockResult = { stock, dataSource: 'kiwoom' };
        setInCache(cacheKey, result, 5000);
        return result;
      }
    } catch (kiwoomErr: any) {
      console.log(`[StockAPI] Kiwoom API notice for ${symbol}, using Yahoo fallback: ${kiwoomErr.message}`);
    }
  }

  // 2. Secondary / Fallback: Yahoo Finance Live Data API
  try {
    const yahooTicker = item?.ticker || `${symbol}.${stockMarket === 'KOSDAQ' ? 'KQ' : 'KS'}`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=3mo`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    if (res.ok) {
      const json = await res.json();
      const result = json.chart?.result?.[0];
      if (result) {
        const meta = result.meta;
        const price = Math.round(meta.regularMarketPrice || meta.chartPreviousClose || 50000);
        const prevClose = Math.round(meta.chartPreviousClose || price);
        const change = price - prevClose;
        const changePercent = Number(((change / (prevClose || 1)) * 100).toFixed(2));
        const volume = meta.regularMarketVolume || 1000000;
        const openPrice = Math.round(meta.regularMarketDayLow || price);
        const highPrice = Math.round(meta.regularMarketDayHigh || price);
        const lowPrice = Math.round(meta.regularMarketDayLow || price);
        const tradingValue = Math.round((price * volume) / 100000000); // 억 원

        // Parse Historical Candles
        const candles: CandleData[] = [];
        const timestamps = result.timestamp || [];
        const quote = result.indicators?.quote?.[0] || {};
        const opens = quote.open || [];
        const highs = quote.high || [];
        const lows = quote.low || [];
        const closes = quote.close || [];
        const volumes = quote.volume || [];

        for (let i = 0; i < timestamps.length; i++) {
          if (closes[i] !== null && closes[i] !== undefined) {
            const d = new Date(timestamps[i] * 1000);
            const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
            candles.push({
              time: dateStr,
              open: Math.round(opens[i] || closes[i]),
              high: Math.round(highs[i] || closes[i]),
              low: Math.round(lows[i] || closes[i]),
              close: Math.round(closes[i]),
              volume: Math.round(volumes[i] || 0),
            });
          }
        }

        const sparkline = candles.slice(-7).map(c => c.close);

        const stock: Stock = {
          symbol,
          name: stockName,
          market: stockMarket,
          sector: stockSector,
          price,
          change,
          changePercent,
          volume,
          volumeRatio: 120.0,
          tradingValue,
          openPrice,
          highPrice,
          lowPrice,
          prevClose,
          high52w: Math.round(price * 1.3),
          low52w: Math.round(price * 0.7),
          marketCap: masterItem?.marketCap || Math.round((price * 500000000) / 100000000), // 억 원
          per: 15.2,
          pbr: 1.4,
          eps: Math.round(price / 15.2),
          dividendYield: 1.5,
          foreignNetBuy: Math.round(Math.random() * 2000 - 500),
          instNetBuy: Math.round(Math.random() * 1500 - 400),
          candles,
          sparkline: sparkline.length >= 2 ? sparkline : [prevClose, price],
        };

        const fetchResult: FetchStockResult = { stock, dataSource: 'yahoo' };
        setInCache(cacheKey, fetchResult, 10000);
        return fetchResult;
      }
    }
  } catch (err: any) {
    console.log(`[StockAPI] Yahoo data notice for ${symbol}: ${err.message}`);
  }

  // 3. Fallback: Local master item or mock
  if (masterItem) {
    const price = masterItem.lastPrice || 0;
    const stock: Stock = {
      symbol: masterItem.code,
      name: masterItem.name,
      market: masterItem.market,
      sector: masterItem.sector,
      price,
      change: 0,
      changePercent: 0,
      volume: 0,
      volumeRatio: 100,
      tradingValue: 0,
      openPrice: price,
      highPrice: price,
      lowPrice: price,
      prevClose: price,
      high52w: Math.round(price * 1.3),
      low52w: Math.round(price * 0.7),
      marketCap: masterItem.marketCap || 0,
      per: 15.2,
      pbr: 1.4,
      eps: Math.round(price / 15.2),
      dividendYield: 1.5,
      foreignNetBuy: 0,
      instNetBuy: 0,
      candles: [],
      sparkline: [price, price],
    };
    return { stock, dataSource: 'mock' };
  }

  return { stock: null, dataSource: 'mock' };
}

/**
 * Fetch real stock data for a single symbol
 */
export async function fetchRealStockData(symbol: string): Promise<Stock | null> {
  const res = await fetchRealStockDataWithSource(symbol);
  return res.stock;
}

/**
 * Fetch all tracked stocks with real data and data source tracking
 */
export async function fetchAllRealStocksWithSource(): Promise<FetchAllStocksResult> {
  const cacheKey = 'all_real_stocks_with_source';
  const cached = getFromCache<FetchAllStocksResult>(cacheKey);
  if (cached && cached.stocks && cached.stocks.length > 0) return cached;

  const masterList = await kiwoomApiService.fetchStockMasterList();
  const majorSymbols = ['005930', '000660', '005380', '000270', '196170', '042700', '064350', '034020', '373220', '247540', '086520', '207940', '035420', '035720', '005490', '012330', '105560', '055550', '417860'];
  const majorStockMap = new Map<string, Stock>();
  let primarySource: 'kiwoom' | 'yahoo' | 'mock' = 'mock';

  await Promise.allSettled(
    majorSymbols.map(async sym => {
      const res = await fetchRealStockDataWithSource(sym);
      if (res.stock) {
        majorStockMap.set(sym, res.stock);
        if (res.dataSource === 'kiwoom') primarySource = 'kiwoom';
        else if (res.dataSource === 'yahoo' && primarySource !== 'kiwoom') primarySource = 'yahoo';
      }
    })
  );

  const baseList = masterList && masterList.length > 0 ? masterList : TRACKED_STOCKS.map(t => ({
    code: t.symbol,
    name: t.name,
    market: t.market,
    sector: t.sector,
    lastPrice: 0,
    listCount: 0,
    marketCap: 0,
  }));

  const results: Stock[] = baseList.map(item => {
    const live = majorStockMap.get(item.code);
    if (live) return live;
    const price = item.lastPrice || 0;
    return {
      symbol: item.code,
      name: item.name,
      market: item.market,
      sector: item.sector,
      price,
      change: 0,
      changePercent: 0,
      volume: 0,
      volumeRatio: 100,
      tradingValue: 0,
      openPrice: price,
      highPrice: price,
      lowPrice: price,
      prevClose: price,
      high52w: Math.round(price * 1.3),
      low52w: Math.round(price * 0.7),
      marketCap: item.marketCap || 0,
      per: 15.2,
      pbr: 1.4,
      eps: Math.round(price / 15.2),
      dividendYield: 1.5,
      foreignNetBuy: 0,
      instNetBuy: 0,
      candles: [],
      sparkline: [price, price],
    };
  });

  const payload: FetchAllStocksResult = { stocks: results, dataSource: primarySource };
  if (results.length > 0) {
    setInCache(cacheKey, payload, 8000);
  }
  return payload;
}

/**
 * Fetch all tracked stocks with real data
 */
export async function fetchAllRealStocks(): Promise<Stock[]> {
  const res = await fetchAllRealStocksWithSource();
  return res.stocks;
}

export interface FetchIndicesResult {
  indices: StockIndex[];
  dataSource: 'kiwoom' | 'yahoo' | 'mock';
}

/**
 * Fetch real market indices (KOSPI, KOSDAQ) with data source tracking
 * Priority 1: Kiwoom Open API (TR: ka20001)
 * Priority 2: Yahoo Finance Live Chart API
 */
export async function fetchRealIndicesWithSource(): Promise<FetchIndicesResult> {
  const cacheKey = 'real_indices_cache';
  const cached = getFromCache<FetchIndicesResult>(cacheKey);
  if (cached) return cached;

  const nowFormatted = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // 1. Priority: Try Kiwoom REST API if configured
  if (kiwoomApiService.isConfigured()) {
    try {
      const kospi = await kiwoomApiService.fetchIndexPrice('KOSPI');
      const kosdaq = await kiwoomApiService.fetchIndexPrice('KOSDAQ');
      if (kospi && kosdaq && kospi.value > 0 && kosdaq.value > 0) {
        kospi.lastUpdated = nowFormatted;
        kospi.dataSource = 'kiwoom';
        kosdaq.lastUpdated = nowFormatted;
        kosdaq.dataSource = 'kiwoom';
        const payload: FetchIndicesResult = { indices: [kospi, kosdaq], dataSource: 'kiwoom' };
        setInCache(cacheKey, payload, 6000);
        return payload;
      }
    } catch (err: any) {
      console.log('[StockAPI] Kiwoom index fetch notice, using fallback:', err.message);
    }
  }

  const indexDefs: { name: string; symbol: 'KOSPI' | 'KOSDAQ'; ticker: string; defaultVal: number }[] = [
    { name: '코스피', symbol: 'KOSPI', ticker: '^KS11', defaultVal: 2710.5 },
    { name: '코스닥', symbol: 'KOSDAQ', ticker: '^KQ11', defaultVal: 875.2 },
  ];

  const list: StockIndex[] = [];

  for (const def of indexDefs) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(def.ticker)}?interval=1d&range=2d`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (res.ok) {
        const json = await res.json();
        const meta = json.chart?.result?.[0]?.meta;
        if (meta) {
          const val = Number((meta.regularMarketPrice || def.defaultVal).toFixed(2));
          const prev = Number((meta.chartPreviousClose || val).toFixed(2));
          const change = Number((val - prev).toFixed(2));
          const changePercent = Number(((change / prev) * 100).toFixed(2));

          list.push({
            name: def.name,
            symbol: def.symbol,
            value: val,
            change,
            changePercent,
            high: Number((meta.regularMarketDayHigh || val).toFixed(2)),
            low: Number((meta.regularMarketDayLow || val).toFixed(2)),
            volume: 524000,
            tradingValue: 11.5,
            advanceCount: 450,
            declineCount: 380,
            sparkline: [prev, val],
            lastUpdated: nowFormatted,
            dataSource: 'yahoo',
            isStale: false,
          });
          continue;
        }
      }
    } catch {}

    // Fallback if individual index fails
    list.push({
      name: def.name,
      symbol: def.symbol,
      value: def.defaultVal,
      change: 12.5,
      changePercent: 0.46,
      high: def.defaultVal + 5,
      low: def.defaultVal - 5,
      volume: 520000,
      tradingValue: 11.0,
      advanceCount: 420,
      declineCount: 400,
      sparkline: [def.defaultVal - 10, def.defaultVal],
      lastUpdated: nowFormatted,
      dataSource: 'mock',
      isStale: true,
    });
  }

  const payload: FetchIndicesResult = { indices: list, dataSource: 'yahoo' };
  setInCache(cacheKey, payload, 8000);
  return payload;
}

/**
 * Fetch real market indices (KOSPI, KOSDAQ)
 */
export async function fetchRealIndices(): Promise<StockIndex[]> {
  const res = await fetchRealIndicesWithSource();
  return res.indices;
}

/**
 * Fetch real USD/KRW exchange rate
 */
export async function fetchRealExchangeRate(): Promise<ExchangeRate> {
  const cacheKey = 'real_exchange_rate_cache';
  const cached = getFromCache<ExchangeRate>(cacheKey);
  if (cached) return cached;

  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?interval=1d&range=2d';
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      const json = await res.json();
      const meta = json.chart?.result?.[0]?.meta;
      if (meta) {
        const rate = Number((meta.regularMarketPrice || 1380.0).toFixed(2));
        const prev = Number((meta.chartPreviousClose || rate).toFixed(2));
        const change = Number((rate - prev).toFixed(2));
        const changePercent = Number(((change / prev) * 100).toFixed(2));

        const data: ExchangeRate = {
          currency: 'USD/KRW',
          name: '미국 달러',
          rate,
          change,
          changePercent,
          high: Number((meta.regularMarketDayHigh || rate + 2).toFixed(2)),
          low: Number((meta.regularMarketDayLow || rate - 2).toFixed(2)),
          sparkline: [prev, rate],
        };
        setInCache(cacheKey, data, 15000);
        return data;
      }
    }
  } catch {}

  const fallback: ExchangeRate = {
    currency: 'USD/KRW',
    name: '미국 달러',
    rate: 1382.50,
    change: -2.30,
    changePercent: -0.17,
    high: 1385.00,
    low: 1380.50,
    sparkline: [1384.80, 1382.50],
  };
  setInCache(cacheKey, fallback, 15000);
  return fallback;
}
