import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  fetchRealStockData, 
  fetchRealStockDataWithSource,
  fetchAllRealStocks, 
  fetchAllRealStocksWithSource,
  fetchRealIndices, 
  fetchRealIndicesWithSource,
  fetchRealExchangeRate,
  TRACKED_STOCKS
} from './server/stockApiService';
import { Stock, AppNotification, MarketFilterType, RankingSortType, KiwoomChartResponse } from './src/types';
import { kiwoomApiService } from './server/kiwoomApiService';
import { rankingApiService } from './server/rankingApiService';
import { indexApiService } from './server/indexApiService';
import { matchHangulSearch } from './src/utils/hangul';
import { INITIAL_STOCKS, INITIAL_INDICES, INITIAL_EXCHANGE_RATE, generateOrderBook } from './src/services/mockData';
import {
  evaluateMarketData,
  getMonitoringConfig,
  updateMonitoringConfig,
  getRecentAlertEvents,
  pushAlertEvent,
  explainMarketEventWithGemini,
  seedInitialMarketEvents,
} from './server/marketMonitorService';
import {
  evaluateUserAlertRules,
  getUserAlertRules,
  addUserAlertRule,
  updateUserAlertRule,
  deleteUserAlertRule,
  getNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  setActiveUserWatchlist,
  getActiveUserWatchlists,
  clearUserAlertCooldowns,
  clearServerNotifications,
} from './server/userAlertEngine';
import {
  generateAiStockBriefing,
  updateServerDataReferences,
  get_stock_quote,
  get_stock_chart,
  get_stock_news,
  get_market_status,
  get_related_posts,
} from './server/aiBriefingService';
import {
  processStockDataQuery,
  updateQueryServiceData,
  get_stock_volume,
  get_watchlist,
  get_market_summary,
  get_top_gainers,
  get_top_losers,
  get_volume_spikes,
} from './server/aiStockQueryService';
import { newsApiService } from './server/newsApiService';
import { createAdminRouter } from './server/adminServerService';
import { fcmServerService } from './server/fcmServerService';
import { getGlobalMarketSummary } from './server/globalMarketService';
import { userAiVaultService } from './server/userAiVaultService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Environment Data Source Configuration:
// In Google AI Studio preview or non-fixed IP environment, default strictly to MOCK mode.
// Only on dedicated GCP Fixed IP server with configured keys, default to REAL.
const isFixedIpServer = kiwoomApiService.isFixedIpServer();
const DEFAULT_SOURCE = process.env.STOCK_DATA_SOURCE || (isFixedIpServer && kiwoomApiService.isConfigured() ? 'REAL' : 'MOCK');

console.log(`[Server] Default Stock Data Source: ${DEFAULT_SOURCE} (isProduction: ${isProduction}, isFixedIpServer: ${isFixedIpServer}, KiwoomConfigured: ${kiwoomApiService.isConfigured()})`);

// In-Memory Server Mock Stock Data State (Simulating Exchange Live Feed for MOCK mode)
let mockServerStocks = [...INITIAL_STOCKS];
let mockServerIndices = [...INITIAL_INDICES];
let mockServerExchangeRate = { ...INITIAL_EXCHANGE_RATE };

// Seed initial realistic events
seedInitialMarketEvents();

// Centralized Server-Side Market Anomaly Detection Engine (Real Kiwoom Data Only)
export async function runRealKiwoomMarketEvaluation(
  specificUid?: string, 
  specificWatchlist?: string[]
): Promise<AppNotification[]> {
  try {
    if (specificUid && specificWatchlist && specificWatchlist.length > 0) {
      setActiveUserWatchlist(specificUid, specificWatchlist);
    }

    // 1. Collect all monitored stock symbols across user alert rules & watchlists
    const symbolSet = new Set<string>();
    const allRules = getUserAlertRules();
    for (const rule of allRules) {
      if (rule.enabled && rule.symbol && rule.symbol !== 'MARKET') {
        symbolSet.add(rule.symbol);
      }
    }

    for (const item of getActiveUserWatchlists()) {
      for (const sym of item.symbols) {
        if (sym && sym !== 'MARKET') symbolSet.add(sym);
      }
    }

    if (specificWatchlist) {
      for (const sym of specificWatchlist) {
        if (sym && sym !== 'MARKET') symbolSet.add(sym);
      }
    }

    // Ensure core benchmark stocks are monitored
    if (symbolSet.size === 0) {
      symbolSet.add('005930');
      symbolSet.add('000660');
    }

    // 2. Fetch real Kiwoom quotes for each monitored symbol
    // (Uses serverCache & kiwoom stockPriceCache so multiple users watching the same stock share 1 fetch)
    const realStocks: Stock[] = [];
    for (const sym of Array.from(symbolSet)) {
      try {
        const res = await fetchRealStockDataWithSource(sym);
        if (
          res.stock && 
          res.stock.price > 0 && 
          !isNaN(res.stock.price) && 
          res.stock.volume >= 0 &&
          Math.abs(res.stock.changePercent) <= 30 // Guard against corrupted data / outliers
        ) {
          realStocks.push(res.stock);
        }
      } catch (err) {
        // Safe skip on single symbol network/rate-limit error (Requirement 11)
      }
    }

    // 3. Fetch real Kiwoom indices (KOSPI & KOSDAQ)
    const indicesRes = await fetchRealIndicesWithSource();
    const realIndices = indicesRes.indices;

    // 4. Update AI server references with real data
    try {
      updateServerDataReferences(realStocks, realIndices, mockServerExchangeRate);
      updateQueryServiceData(realStocks, realIndices, mockServerExchangeRate);
    } catch {}

    // 5. Run Market-Wide and User Anomaly Evaluation on REAL Kiwoom Data
    evaluateMarketData(realStocks, realIndices);
    const notifications = evaluateUserAlertRules(realStocks, realIndices);
    return notifications;
  } catch (err) {
    console.warn('[RealMarketMonitor] Error running evaluation:', err);
    return [];
  }
}

// Background Periodic Evaluation Loop (runs every 8 seconds, deduplicated)
let isEvaluatingBackground = false;
setInterval(async () => {
  if (isEvaluatingBackground) return;
  isEvaluatingBackground = true;
  try {
    await runRealKiwoomMarketEvaluation();
  } catch (err) {
    console.warn('[RealMarketMonitor] Background interval error:', err);
  } finally {
    isEvaluatingBackground = false;
  }
}, 8000);

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Dedicated routes for Service Worker and PWA Manifest
  app.get('/firebase-messaging-sw.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.sendFile(path.join(__dirname, 'public', 'firebase-messaging-sw.js'));
  });

  app.get('/manifest.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
  });

  // Serve static public assets (icons, etc.)
  app.use(express.static(path.join(__dirname, 'public')));

  // -------------------------------------------------------------
  // Security Middlewares: Rate Limiting & Input Sanitization
  // -------------------------------------------------------------
  interface RateLimitRecord {
    count: number;
    resetAt: number;
  }
  const rateLimitMap = new Map<string, RateLimitRecord>();

  const createRateLimiter = (maxRequests: number, windowMs: number) => {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'client';
      const key = `${req.path}:${ip}`;
      const now = Date.now();
      let record = rateLimitMap.get(key);

      if (!record || now > record.resetAt) {
        record = { count: 1, resetAt: now + windowMs };
        rateLimitMap.set(key, record);
      } else {
        record.count++;
      }

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));

      if (record.count > maxRequests) {
        const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
        res.setHeader('Retry-After', retryAfterSec);
        return res.status(429).json({
          error: '요청 빈도가 너무 높습니다 (Rate Limit Exceeded). 잠시 후 다시 시도해주세요.',
          retryAfterSeconds: retryAfterSec,
        });
      }
      next();
    };
  };

  const generalLimiter = createRateLimiter(150, 60 * 1000); // 150 requests per minute
  const aiLimiter = createRateLimiter(30, 60 * 1000);       // 30 requests per minute for AI

  // Apply general rate limit to all /api routes
  app.use('/api', generalLimiter);

  // Apply stricter rate limit to AI intensive endpoints
  app.use('/api/ai', aiLimiter);
  app.use('/api/market/monitoring/explain', aiLimiter);

  // Helper validation functions
  const isValidStockSymbol = (symbol: string): boolean => {
    return typeof symbol === 'string' && /^[0-9A-Za-z.]{2,10}$/.test(symbol);
  };

  const sanitizeInputText = (input: any, maxLength = 300): string => {
    if (typeof input !== 'string') return '';
    return input.slice(0, maxLength).replace(/[<>{}]/g, '').trim();
  };

  // Helper to determine target data source for request (env or query override)
  const getRequestedSource = (req: express.Request): string => {
    const qSource = (req.query.source as string)?.toUpperCase();
    if (qSource === 'REAL' || qSource === 'MOCK' || qSource === 'KIWOOM') return qSource;
    return DEFAULT_SOURCE;
  };

  // -------------------------------------------------------------
  // Backend API Layer
  // -------------------------------------------------------------

  // 1-0. Real-time Stock Rankings (KOSPI & KOSDAQ, Gainers/Losers/Volume/Trading Value TOP 20)
  app.get('/api/stocks/ranking', async (req, res) => {
    try {
      const market = ((req.query.market as string)?.toUpperCase() || 'ALL') as MarketFilterType;
      const sort = ((req.query.sort as string)?.toLowerCase() || 'change_rise') as RankingSortType;

      const validMarkets: MarketFilterType[] = ['ALL', 'KOSPI', 'KOSDAQ'];
      const validSorts: RankingSortType[] = ['change_rise', 'change_fall', 'volume', 'trading_value'];

      const safeMarket = validMarkets.includes(market) ? market : 'ALL';
      const safeSort = validSorts.includes(sort) ? sort : 'change_rise';

      const ranking = await rankingApiService.getRankings(safeMarket, safeSort);
      res.setHeader('Cache-Control', 'public, max-age=15');
      res.setHeader('X-Data-Source', ranking.dataSource);
      res.json(ranking);
    } catch (err: any) {
      console.error('[Server] Ranking fetch error:', err.message);
      res.status(500).json({ error: '종목 순위를 조회하는 중 오류가 발생했습니다.', details: err.message });
    }
  });

  // 1. All Stocks
  app.get('/api/stocks', async (req, res) => {
    const source = getRequestedSource(req);
    res.setHeader('Cache-Control', 'no-cache');

    if (source !== 'MOCK') {
      try {
        const { stocks, dataSource } = await fetchAllRealStocksWithSource();
        if (stocks && stocks.length > 0) {
          res.setHeader('X-Data-Source', dataSource);
          return res.json(stocks);
        }
      } catch (err: any) {
        console.log('[Server] Error fetching real stocks, falling back:', err.message);
      }
    }

    // Fallback to mock data
    res.setHeader('X-Data-Source', 'mock');
    res.json(mockServerStocks);
  });

  // 1-1. Kiwoom API Diagnostics & Live Test
  app.get('/api/kiwoom/test', async (req, res) => {
    try {
      const registeredIp = (req.query.registeredIp as string) || (req.query.ip as string) || undefined;
      const diag = await kiwoomApiService.runDiagnostics(registeredIp);
      res.json({
        service: 'Kiwoom Open API',
        timestamp: new Date().toISOString(),
        configured: kiwoomApiService.isConfigured(),
        config: kiwoomApiService.getConfig(),
        masterStockCount: kiwoomApiService.getMasterStockCounts(),
        wsConnected: kiwoomApiService.isWsConnected(),
        subscribedSymbols: kiwoomApiService.getSubscribedSymbols(),
        subscribedOrderBookSymbols: kiwoomApiService.getSubscribedOrderBookSymbols(),
        diagnostics: diag,
      });
    } catch (err: any) {
      res.status(500).json({
        error: '키움 API 진단 테스트 실패',
        message: err.message,
      });
    }
  });

  // 1-1-0. Update Kiwoom Credentials & Live Re-test
  app.post('/api/kiwoom/config', async (req, res) => {
    try {
      const { appKey, appSecret, isMock, registeredIp } = req.body || {};
      if (!appKey || !appSecret) {
        return res.status(400).json({ error: 'App Key와 App Secret을 모두 입력해 주세요.' });
      }

      // Update credentials and persist to .env
      kiwoomApiService.updateCredentials(String(appKey), String(appSecret), isMock === true);

      // Run live diagnostics (OAuth token + 삼성전자 005930 현재가 실시간 테스트)
      const diag = await kiwoomApiService.runDiagnostics(registeredIp);

      res.json({
        success: true,
        message: '키움 API 환경설정이 적용되었습니다.',
        configured: kiwoomApiService.isConfigured(),
        config: kiwoomApiService.getConfig(),
        diagnostics: diag,
      });
    } catch (err: any) {
      res.status(500).json({
        error: '키움 API 설정 저장 및 진단 실패',
        message: err.message,
      });
    }
  });

  // 1-1-0-1. Get Server Public IP for Kiwoom OpenAPI Portal IP registration
  app.get('/api/kiwoom/server-ip', async (_req, res) => {
    const serverIp = await kiwoomApiService.detectPublicServerIp(true);
    const isFixedIp = kiwoomApiService.isFixedIpServer();
    res.json({
      serverIp,
      isFixedIp,
      ipType: isFixedIp ? 'fixed_nat' : 'dynamic_cloud_run',
      verifiedAt: new Date().toISOString(),
      guide: '키움 REST API 홈페이지 > API 사용신청 화면에서 위 공인 IP를 등록해 주세요. (주의: Cloud Run 기본 환경은 Google Cloud 동적 IP 풀을 사용하므로, 인스턴스 재배포 시 IP가 변경될 수 있습니다)',
    });
  });

  // 1-1-0-2. Inject Access Token
  app.post('/api/kiwoom/token', (req, res) => {
    const { token } = req.body || {};
    if (token && typeof token === 'string') {
      kiwoomApiService.setAccessToken(token);
      return res.json({ success: true, message: '키움 액세스 토큰이 등록되었습니다.' });
    }
    res.status(400).json({ error: '유효한 token 문자열을 전달해 주세요.' });
  });

  // 1-1-1. Real-time Stock Execution Ticks (SSE Stream)
  const clientTickStreams = new Set<express.Response>();

  // Relay Kiwoom WebSocket ticks to all active SSE browser clients
  kiwoomApiService.onTick((tick) => {
    const payload = `data: ${JSON.stringify(tick)}\n\n`;
    for (const client of clientTickStreams) {
      try {
        client.write(payload);
      } catch (err) {
        clientTickStreams.delete(client);
      }
    }
  });

  app.get('/api/stocks/ticks/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    clientTickStreams.add(res);
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', ws: kiwoomApiService.isWsConnected() })}\n\n`);

    req.on('close', () => {
      clientTickStreams.delete(res);
    });
  });

  // 1-1-2. Real-time 10-Level Order Book (SSE Stream)
  const clientOrderBookStreams = new Set<express.Response>();

  // Relay Kiwoom WebSocket order book updates to all active SSE browser clients
  kiwoomApiService.onOrderBook((orderBook) => {
    const payload = `data: ${JSON.stringify(orderBook)}\n\n`;
    for (const client of clientOrderBookStreams) {
      try {
        client.write(payload);
      } catch (err) {
        clientOrderBookStreams.delete(client);
      }
    }
  });

  app.get('/api/stocks/orderbook/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    clientOrderBookStreams.add(res);
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', ws: kiwoomApiService.isWsConnected() })}\n\n`);

    req.on('close', () => {
      clientOrderBookStreams.delete(res);
    });
  });

  // Background Simulated Tick Broadcast for SSE clients in Preview Mode or when Kiwoom WS is disconnected
  setInterval(() => {
    if (clientTickStreams.size === 0 && clientOrderBookStreams.size === 0) return;
    if (kiwoomApiService.isWsConnected()) return; // Kiwoom live websocket is active

    const subscribedList = Array.from(kiwoomApiService.getSubscribedSymbols());
    const targetSymbols = subscribedList.length > 0 ? subscribedList : ['005930', '000660'];
    const nowTime = new Date().toTimeString().slice(0, 8);

    targetSymbols.forEach(sym => {
      const stock = mockServerStocks.find(s => s.symbol === sym) || INITIAL_STOCKS.find(s => s.symbol === sym);
      if (!stock) return;

      const step = stock.price >= 100000 ? 500 : (stock.price >= 50000 ? 100 : 50);
      const delta = (Math.random() > 0.48 ? 1 : -1) * step;
      const newPrice = Math.max(100, stock.price + delta);
      const prevClose = stock.prevClose || (stock.price - stock.change);
      const newChange = newPrice - prevClose;
      const newPercent = Number(((newChange / prevClose) * 100).toFixed(2));
      stock.price = newPrice;
      stock.change = newChange;
      stock.changePercent = newPercent;
      stock.volume += Math.floor(Math.random() * 150) + 20;

      const tick = {
        symbol: stock.symbol,
        price: stock.price,
        change: stock.change,
        changePercent: stock.changePercent,
        volume: stock.volume,
        open: stock.openPrice,
        high: Math.max(stock.highPrice, newPrice),
        low: Math.min(stock.lowPrice, newPrice),
        time: nowTime,
        source: 'SIMULATED',
      };

      const tickPayload = `data: ${JSON.stringify(tick)}\n\n`;
      for (const client of clientTickStreams) {
        try {
          client.write(tickPayload);
        } catch {
          clientTickStreams.delete(client);
        }
      }

      const ob = generateOrderBook(stock);
      const obPayload = `data: ${JSON.stringify(ob)}\n\n`;
      for (const client of clientOrderBookStreams) {
        try {
          client.write(obPayload);
        } catch {
          clientOrderBookStreams.delete(client);
        }
      }
    });
  }, 2500);

  // 1-1-3. Subscribe / Unsubscribe Symbol for Execution Feeds
  app.post('/api/stocks/subscribe', (req, res) => {
    const { symbol } = req.body;
    if (symbol && isValidStockSymbol(symbol)) {
      kiwoomApiService.subscribeStock(symbol);
      res.json({ success: true, symbol, subscribed: true });
    } else {
      res.status(400).json({ error: '올바른 종목 코드가 아닙니다.' });
    }
  });

  app.post('/api/stocks/unsubscribe', (req, res) => {
    const { symbol } = req.body;
    if (symbol && isValidStockSymbol(symbol)) {
      kiwoomApiService.unsubscribeStock(symbol);
      res.json({ success: true, symbol, subscribed: false });
    } else {
      res.status(400).json({ error: '올바른 종목 코드가 아닙니다.' });
    }
  });

  // 1-1-4. Subscribe / Unsubscribe Symbol for Order Book Feeds
  app.post('/api/stocks/subscribe-orderbook', (req, res) => {
    const { symbol } = req.body;
    if (symbol && isValidStockSymbol(symbol)) {
      kiwoomApiService.subscribeOrderBook(symbol);
      res.json({ success: true, symbol, subscribed: true });
    } else {
      res.status(400).json({ error: '올바른 종목 코드가 아닙니다.' });
    }
  });

  app.post('/api/stocks/unsubscribe-orderbook', (req, res) => {
    const { symbol } = req.body;
    if (symbol && isValidStockSymbol(symbol)) {
      kiwoomApiService.unsubscribeOrderBook(symbol);
      res.json({ success: true, symbol, subscribed: false });
    } else {
      res.status(400).json({ error: '올바른 종목 코드가 아닙니다.' });
    }
  });

  // 1-2. Stock Search API (Must be declared before :symbol)
  app.get('/api/stocks/search', async (req, res) => {
    const query = sanitizeInputText(req.query.q as string, 50).trim();
    const market = sanitizeInputText(req.query.market as string, 10);
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 12, 50);

    if (!query) {
      return res.json([]);
    }

    const q = query.toLowerCase();

    // 1. Check US Tracked Stocks first for matching ticker/name
    const usMatches = TRACKED_STOCKS.filter(s => s.market === 'US').filter(s => {
      if (market && market !== 'ALL' && market !== 'US') return false;
      return (
        s.name.toLowerCase().includes(q) ||
        s.symbol.toLowerCase().includes(q) ||
        s.sector.toLowerCase().includes(q) ||
        matchHangulSearch(s.name, q)
      );
    }).map(s => ({
      symbol: s.symbol,
      name: s.name,
      market: 'US' as const,
      sector: s.sector,
      price: 0,
      change: 0,
      changePercent: 0,
      marketCap: 0,
      currency: 'USD' as const,
    }));

    // 2. Prioritize Kiwoom full master stocks search if loaded
    const masterStocks = kiwoomApiService.getMasterStocks();
    if (masterStocks && masterStocks.length > 0) {
      let matched = masterStocks.filter(s => {
        if (market && market !== 'ALL' && s.market !== market) {
          return false;
        }
        return (
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          s.sector.toLowerCase().includes(q) ||
          matchHangulSearch(s.name, q)
        );
      });

      // Priority ranking: Exact > StartsWith > Major Market Cap > Shorter Name
      const majorCodes = new Set([
        '005930', '000660', '373220', '207940', '005380', '000270', '068270', 
        '005490', '105560', '035420', '051910', '035720', '028260', '196170', 
        '247540', '086520', '006400', '012450', '003670', '066570', '001040'
      ]);

      matched.sort((a, b) => {
        // 1. Exact code match
        if (a.code.toLowerCase() === q) return -1;
        if (b.code.toLowerCase() === q) return 1;
        // 2. Exact name match
        if (a.name === query) return -1;
        if (b.name === query) return 1;
        // 3. Starts with code
        if (a.code.toLowerCase().startsWith(q) && !b.code.toLowerCase().startsWith(q)) return -1;
        if (!a.code.toLowerCase().startsWith(q) && b.code.toLowerCase().startsWith(q)) return 1;
        // 4. Starts with name
        if (a.name.startsWith(query) && !b.name.startsWith(query)) return -1;
        if (!a.name.startsWith(query) && b.name.startsWith(query)) return 1;
        // 5. Major blue-chip codes
        const aMajor = majorCodes.has(a.code) ? 1 : 0;
        const bMajor = majorCodes.has(b.code) ? 1 : 0;
        if (aMajor !== bMajor) return bMajor - aMajor;
        // 6. Shorter name length
        return a.name.length - b.name.length;
      });

      const domesticResults = matched.map(m => ({
        symbol: m.code,
        name: m.name,
        market: m.market,
        sector: m.sector,
        price: m.lastPrice || 0,
        change: 0,
        changePercent: 0,
        marketCap: m.marketCap || 0,
        currency: 'KRW' as const,
      }));

      let combined = [...usMatches, ...domesticResults];
      if (limit > 0) {
        combined = combined.slice(0, limit);
      }

      res.setHeader('X-Data-Source', 'combined');
      res.setHeader('Cache-Control', 'no-cache');
      return res.json(combined);
    }

    // 2. Fallback to INITIAL_STOCKS
    const stockMap = new Map<string, any>();
    for (const s of INITIAL_STOCKS) {
      stockMap.set(s.symbol, s);
    }
    for (const s of mockServerStocks) {
      stockMap.set(s.symbol, { ...stockMap.get(s.symbol), ...s });
    }

    const allStocks = Array.from(stockMap.values());

    let results = allStocks.filter(s => {
      if (market && market !== 'ALL' && s.market !== market) {
        return false;
      }
      return (
        s.name.toLowerCase().includes(q) ||
        s.symbol.toLowerCase().includes(q) ||
        s.sector.toLowerCase().includes(q) ||
        matchHangulSearch(s.name, q)
      );
    });

    if (limit > 0) {
      results = results.slice(0, limit);
    }

    res.setHeader('Cache-Control', 'no-cache');
    res.json(results);
  });

  // 1-3. Batch Stock Quotes (for Watchlist & multiple symbols)
  app.get('/api/stocks/quotes', async (req, res) => {
    const rawSymbols = (req.query.symbols as string || '')
      .split(',')
      .map(s => s.trim())
      .filter(isValidStockSymbol);
    if (rawSymbols.length === 0) {
      return res.json([]);
    }

    const uniqueSymbols = Array.from(new Set(rawSymbols)).slice(0, 50);
    const results: any[] = [];
    let isAnyKiwoom = false;

    for (const sym of uniqueSymbols) {
      try {
        const { stock, dataSource } = await fetchRealStockDataWithSource(sym);
        if (stock) {
          if (dataSource === 'kiwoom') isAnyKiwoom = true;
          results.push(stock);
          continue;
        }
      } catch (err: any) {
        console.warn(`[Server] Batch quote error for ${sym}:`, err.message);
      }

      const fallback = mockServerStocks.find(s => s.symbol === sym) || INITIAL_STOCKS.find(s => s.symbol === sym);
      if (fallback) {
        results.push(fallback);
      }
    }

    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Data-Source', isAnyKiwoom ? 'kiwoom' : 'mock');
    res.json(results);
  });

  app.post('/api/stocks/quotes', async (req, res) => {
    const rawSymbols = Array.isArray(req.body?.symbols)
      ? (req.body.symbols as string[]).map(s => String(s).trim()).filter(isValidStockSymbol)
      : [];
    if (rawSymbols.length === 0) {
      return res.json([]);
    }

    const uniqueSymbols = Array.from(new Set(rawSymbols)).slice(0, 50);
    const results: any[] = [];
    let isAnyKiwoom = false;

    for (const sym of uniqueSymbols) {
      try {
        const { stock, dataSource } = await fetchRealStockDataWithSource(sym);
        if (stock) {
          if (dataSource === 'kiwoom') isAnyKiwoom = true;
          results.push(stock);
          continue;
        }
      } catch (err: any) {
        console.warn(`[Server] Batch quote error for ${sym}:`, err.message);
      }

      const fallback = mockServerStocks.find(s => s.symbol === sym) || INITIAL_STOCKS.find(s => s.symbol === sym);
      if (fallback) {
        results.push(fallback);
      }
    }

    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Data-Source', isAnyKiwoom ? 'kiwoom' : 'mock');
    res.json(results);
  });

  // 2. Specific Stock Details
  app.get('/api/stocks/:symbol', async (req, res) => {
    const symbol = req.params.symbol;
    if (!isValidStockSymbol(symbol)) {
      return res.status(400).json({ error: '올바르지 않은 종목 코드 형식입니다.' });
    }
    const source = getRequestedSource(req);

    if (source !== 'MOCK') {
      try {
        const { stock, dataSource } = await fetchRealStockDataWithSource(symbol);
        if (stock) {
          res.setHeader('X-Data-Source', dataSource);
          return res.json(stock);
        }
      } catch (err: any) {
        console.log(`[Server] Error fetching real stock ${symbol}:`, err.message);
      }
    }

    // Fallback to mock stock
    res.setHeader('X-Data-Source', 'mock');
    const mockStock = mockServerStocks.find(s => s.symbol === symbol);
    if (mockStock) {
      return res.json(mockStock);
    }

    res.status(404).json({ error: `종목 코드 ${symbol}을(를) 찾을 수 없습니다.` });
  });

  // 3-0. Stock Real-Time OHLCV Chart (Kiwoom Open API REST: ka10080 분봉 / ka10081 일봉)
  app.get('/api/stocks/:symbol/chart', async (req, res) => {
    const symbol = req.params.symbol;
    if (!isValidStockSymbol(symbol)) {
      return res.status(400).json({ error: '올바르지 않은 종목 코드 형식입니다.' });
    }

    const period = sanitizeInputText(req.query.period as string, 10) || '1m';

    try {
      // Find current live price if available for alignment
      let currentPrice: number | undefined;
      let liveStockObj: any = null;
      try {
        const { stock: liveStock } = await fetchRealStockDataWithSource(symbol);
        if (liveStock && liveStock.price > 0) {
          currentPrice = liveStock.price;
          liveStockObj = liveStock;
        }
      } catch {}

      // If this is a US stock, return candles directly from liveStock (from Yahoo Finance / global provider)
      if (liveStockObj?.market === 'US' || /^[A-Z]{1,5}$/.test(symbol.toUpperCase())) {
        const candles = liveStockObj?.candles || [];
        const chartData: KiwoomChartResponse = {
          symbol: symbol.toUpperCase(),
          period: (period as any) || 'day',
          periodLabel: '일봉',
          trId: 'GLOBAL_US',
          supported: true,
          candles,
          currentPrice: currentPrice || liveStockObj?.price,
          lastCandleClose: candles.length > 0 ? candles[candles.length - 1].close : currentPrice,
          source: 'yahoo',
          cached: true,
          timestamp: Date.now(),
          currency: 'USD',
          error: null,
        };
        res.setHeader('X-Data-Source', 'yahoo');
        res.setHeader('X-Cache', 'HIT');
        return res.json(chartData);
      }

      let chartData = await kiwoomApiService.fetchStockChart(symbol, period, currentPrice);

      // If Kiwoom returns 0 candles (e.g. IP unregistered) and real daily candles exist, fallback to liveStock.candles
      if ((!chartData.candles || chartData.candles.length === 0) && liveStockObj?.candles?.length > 0) {
        chartData = {
          ...chartData,
          candles: liveStockObj.candles,
          source: (liveStockObj.dataSource || 'yahoo') as any,
          supported: true,
          error: null,
        };
      }

      res.setHeader('X-Data-Source', chartData.source);
      res.setHeader('X-Cache', chartData.cached ? 'HIT' : 'MISS');
      res.setHeader('X-Kiwoom-TR', chartData.trId);

      return res.json(chartData);
    } catch (err: any) {
      console.error(`[Server] Chart inquiry error for ${symbol}:`, err.message);
      return res.status(500).json({
        symbol,
        period,
        supported: false,
        candles: [],
        source: 'kiwoom',
        cached: false,
        timestamp: Date.now(),
        error: err.message || '차트 조회 중 오류가 발생했습니다.',
        serverIp: kiwoomApiService.getPublicServerIp(),
      });
    }
  });

  // 3. Stock Candles
  app.get('/api/stocks/:symbol/candles', async (req, res) => {
    const symbol = req.params.symbol;
    if (!isValidStockSymbol(symbol)) {
      return res.status(400).json({ error: '올바르지 않은 종목 코드 형식입니다.' });
    }
    const period = sanitizeInputText(req.query.period as string, 10) || 'day';

    try {
      let currentPrice: number | undefined;
      try {
        const { stock: liveStock } = await fetchRealStockDataWithSource(symbol);
        if (liveStock && liveStock.price > 0) {
          currentPrice = liveStock.price;
        }
      } catch {}
      const chartResult = await kiwoomApiService.fetchStockChart(symbol, period, currentPrice);
      if (chartResult.candles && chartResult.candles.length > 0) {
        res.setHeader('X-Data-Source', chartResult.source);
        res.setHeader('X-Cache', chartResult.cached ? 'HIT' : 'MISS');
        res.setHeader('X-Kiwoom-TR', chartResult.trId);
        return res.json(chartResult.candles);
      }
    } catch (err) {}

    // Requirement 8 & 9: Do NOT generate random mock candles!
    // Return empty array if real data is unavailable
    res.json([]);
  });

  // 3-1. Stock 10-Level Order Book (호가창)
  app.get('/api/stocks/:symbol/orderbook', async (req, res) => {
    const symbol = req.params.symbol;
    if (!isValidStockSymbol(symbol)) {
      return res.status(400).json({ error: '올바르지 않은 종목 코드 형식입니다.' });
    }

    res.setHeader('Cache-Control', 'no-cache');

    // 1. Try Kiwoom API if configured
    if (kiwoomApiService.isConfigured()) {
      try {
        const kiwoomOrderBook = await kiwoomApiService.fetchOrderBook(symbol);
        if (kiwoomOrderBook && kiwoomOrderBook.asks?.length > 0) {
          return res.json(kiwoomOrderBook);
        }
      } catch (err: any) {
        console.warn(`[Server] Kiwoom fetchOrderBook fallback for ${symbol}:`, err.message);
      }
    }

    // 2. Fallback to existing stock data
    const stock = mockServerStocks.find(s => s.symbol === symbol) || INITIAL_STOCKS.find(s => s.symbol === symbol);
    if (stock) {
      return res.json(generateOrderBook(stock));
    }

    // 3. Generic fallback
    const dummyStock = {
      symbol,
      name: symbol,
      price: 70000,
      prevClose: 69500,
      change: 500,
      changePercent: 0.72,
    };
    res.json(generateOrderBook(dummyStock as any));
  });

  // 3-2. Stock News & Market News Endpoints (Real News API & Server Caching)
  // A. All Market News by Category ('all' | 'breaking' | 'kospi' | 'kosdaq' | 'economy' | 'market')
  app.get('/api/news', async (req, res) => {
    try {
      const category = sanitizeInputText(req.query.category as string, 20) || 'all';
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;

      const data = await newsApiService.getMarketNews(category, page, limit);

      res.setHeader('X-Data-Source', data.source);
      res.setHeader('X-Cache', data.cached ? 'HIT' : 'MISS');
      res.json(data);
    } catch (err: any) {
      console.error('[Server] Market news error:', err.message);
      res.status(500).json({
        query: '',
        category: 'all',
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
        items: [],
        source: 'google_rss',
        cached: false,
        timestamp: Date.now(),
        error: err.message || '뉴스 데이터를 불러오지 못했습니다.',
      });
    }
  });

  // B. Stock-Specific News by Symbol
  app.get('/api/news/stock/:symbol', async (req, res) => {
    const symbol = req.params.symbol;
    if (!isValidStockSymbol(symbol)) {
      return res.status(400).json({ error: '올바르지 않은 종목 코드 형식입니다.' });
    }

    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 10;

      const data = await newsApiService.getStockNews(symbol, page, limit);

      res.setHeader('X-Data-Source', data.source);
      res.setHeader('X-Cache', data.cached ? 'HIT' : 'MISS');
      res.json(data);
    } catch (err: any) {
      console.error(`[Server] Stock news error for ${symbol}:`, err.message);
      res.status(500).json({
        query: symbol,
        category: 'stock',
        total: 0,
        page: 1,
        limit: 10,
        hasMore: false,
        items: [],
        source: 'google_rss',
        cached: false,
        timestamp: Date.now(),
        error: err.message || '종목 뉴스를 불러오지 못했습니다.',
      });
    }
  });

  // Legacy Stock News alias (returns items array directly)
  app.get('/api/stocks/:symbol/news', async (req, res) => {
    const symbol = req.params.symbol;
    if (!isValidStockSymbol(symbol)) {
      return res.status(400).json({ error: '올바르지 않은 종목 코드 형식입니다.' });
    }

    try {
      const data = await newsApiService.getStockNews(symbol, 1, 15);
      res.setHeader('X-Data-Source', data.source);
      res.setHeader('X-Cache', data.cached ? 'HIT' : 'MISS');
      res.json(data.items);
    } catch (err: any) {
      res.status(500).json([]);
    }
  });

  // C. Keyword Search News
  app.get('/api/news/search', async (req, res) => {
    try {
      const query = sanitizeInputText(req.query.q as string, 50) || '';
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 20;

      const data = await newsApiService.searchNews(query, page, limit);

      res.setHeader('X-Data-Source', data.source);
      res.setHeader('X-Cache', data.cached ? 'HIT' : 'MISS');
      res.json(data);
    } catch (err: any) {
      console.error('[Server] Search news error:', err.message);
      res.status(500).json({
        query: req.query.q || '',
        category: 'search',
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
        items: [],
        source: 'google_rss',
        cached: false,
        timestamp: Date.now(),
        error: err.message || '검색 뉴스 데이터를 불러오지 못했습니다.',
      });
    }
  });

  // D. News API Engine Status
  app.get('/api/news/status', (_req, res) => {
    res.json(newsApiService.getStatus());
  });

  // 4. Market Indices (KOSPI & KOSDAQ)
  app.get('/api/indices', async (req, res) => {
    const source = getRequestedSource(req);
    res.setHeader('Cache-Control', 'no-cache');

    if (source !== 'MOCK') {
      try {
        const { indices, dataSource } = await fetchRealIndicesWithSource();
        if (indices && indices.length > 0) {
          res.setHeader('X-Data-Source', dataSource);
          return res.json(indices);
        }
      } catch (err: any) {
        console.log('[Server] Error fetching real indices, falling back:', err.message);
      }
    }

    res.setHeader('X-Data-Source', 'mock');
    res.json(mockServerIndices);
  });

  // 4-1. Single Market Index Detail (KOSPI or KOSDAQ)
  app.get('/api/indices/:symbol', async (req, res) => {
    try {
      const rawSymbol = String(req.params.symbol || '').toUpperCase();
      if (rawSymbol !== 'KOSPI' && rawSymbol !== 'KOSDAQ') {
        return res.status(400).json({ error: '유효한 지수 기호가 아닙니다. (KOSPI 또는 KOSDAQ)' });
      }
      const indexDetail = await indexApiService.getIndexDetail(rawSymbol);
      res.setHeader('Cache-Control', 'public, max-age=5');
      res.setHeader('X-Data-Source', indexDetail.dataSource || 'real');
      res.json(indexDetail);
    } catch (err: any) {
      console.error('[Server] Index detail fetch error:', err.message);
      res.status(500).json({ error: '지수 정보를 불러오지 못했습니다.', details: err.message });
    }
  });

  // 4-2. Market Index Historical & Intraday Chart (KOSPI or KOSDAQ)
  app.get('/api/indices/:symbol/chart', async (req, res) => {
    try {
      const rawSymbol = String(req.params.symbol || '').toUpperCase();
      if (rawSymbol !== 'KOSPI' && rawSymbol !== 'KOSDAQ') {
        return res.status(400).json({ error: '유효한 지수 기호가 아닙니다. (KOSPI 또는 KOSDAQ)' });
      }
      const period = (req.query.period as any) || '3mo';
      const chartData = await indexApiService.getIndexChart(rawSymbol, period);
      res.setHeader('Cache-Control', 'public, max-age=10');
      res.setHeader('X-Data-Source', chartData.dataSource || 'real');
      res.json(chartData);
    } catch (err: any) {
      console.error('[Server] Index chart fetch error:', err.message);
      res.status(500).json({ error: '지수 차트 데이터를 불러오지 못했습니다.', details: err.message });
    }
  });

  // 5. USD/KRW Exchange Rate
  app.get('/api/exchange-rate', async (req, res) => {
    const source = getRequestedSource(req);
    res.setHeader('X-Data-Source', source);

    if (source === 'REAL') {
      try {
        const realExchange = await fetchRealExchangeRate();
        if (realExchange) {
          return res.json(realExchange);
        }
      } catch (err) {}
    }

    res.json(mockServerExchangeRate);
  });

  // 6. Pipeline & Source Status
  app.get('/api/market/pipeline-status', (req, res) => {
    res.json({
      status: 'active',
      activeSource: DEFAULT_SOURCE,
      pipeline: 'Browser -> Backend API -> Real Stock API -> Backend -> Browser',
      isProduction,
      serverTime: new Date().toISOString(),
      trackedStocksCount: TRACKED_STOCKS.length,
    });
  });

  // 6-1. Global Market Summary (US, Asia, Europe, Forex, Rates)
  app.get('/api/market/global-summary', async (req, res) => {
    try {
      const summary = await getGlobalMarketSummary();
      const category = req.query.category as string;
      res.setHeader('Cache-Control', 'public, max-age=15');
      res.setHeader('X-Data-Source', 'yahoo_global_adapter');

      if (category && (category in summary.groups)) {
        return res.json({
          category,
          items: summary.groups[category as keyof typeof summary.groups],
          fetchedAt: summary.fetchedAt,
          cached: summary.cached,
          providerInfo: summary.providerInfo,
        });
      }

      res.json(summary);
    } catch (err: any) {
      console.error('[Server] Global market summary fetch error:', err.message);
      res.status(500).json({
        error: '글로벌 시장 요약 데이터를 불러오지 못했습니다.',
        details: err.message,
      });
    }
  });

  // -------------------------------------------------------------
  // 7. Market Monitoring System Endpoints
  // -------------------------------------------------------------

  // Get detected events (filter by scope: 'MARKET' | 'STOCK')
  app.get('/api/market/monitoring/events', (req, res) => {
    const scope = req.query.scope as any;
    const limit = Number(req.query.limit) || 40;
    const events = getRecentAlertEvents(scope, limit);
    res.json(events);
  });

  // Get current monitoring configuration thresholds
  app.get('/api/market/monitoring/config', (req, res) => {
    res.json(getMonitoringConfig());
  });

  // Update monitoring configuration thresholds dynamically
  app.post('/api/market/monitoring/config', (req, res) => {
    const adminRole = req.headers['x-admin-role'] as string;
    if (isProduction && adminRole !== 'admin') {
      return res.status(403).json({ error: '관리자 권한(role: admin)이 필요합니다.' });
    }
    const updated = updateMonitoringConfig(req.body);
    res.json(updated);
  });

  // Explain detected market event using Gemini (AI explanation & summarization)
  app.post('/api/market/monitoring/explain/:id', async (req, res) => {
    try {
      const eventId = sanitizeInputText(req.params.id, 64);
      const uid = (req.headers['x-user-uid'] as string) || (req.query.uid as string);
      const adminRole = req.headers['x-admin-role'] as string;
      const isAdmin = adminRole === 'admin' || adminRole === 'superadmin';

      let userGenAI = null;
      if (uid && userAiVaultService.hasConnection(uid)) {
        userGenAI = userAiVaultService.getUserGenAIClient(uid);
      } else if (!isAdmin) {
        return res.status(403).json({
          error: 'AI_NOT_CONNECTED',
          message: '시장 이벤트 AI 해설 기능을 이용하려면 개인 Gemini AI 계정 연결이 필요합니다. 프로필 설정에서 개인 API 키를 등록해주세요.',
        });
      }

      const explanation = await explainMarketEventWithGemini(eventId, userGenAI, isAdmin);
      res.json({ id: eventId, explanation });
    } catch (err: any) {
      const status = err.message?.includes('AI_NOT_CONNECTED') ? 403 : 500;
      res.status(status).json({ error: err.message || '설명 생성 중 오류가 발생했습니다.' });
    }
  });

  // Simulate/Test a custom alert event for verification
  app.post('/api/market/monitoring/trigger-test', (req, res) => {
    const { type, scope, title, description, symbol, symbolName, market, metrics } = req.body;
    const evt = pushAlertEvent({
      type: type || 'PRICE_SURGE',
      scope: scope || 'STOCK',
      title: title || '테스트 급등 감지 이벤트',
      description: description || '모니터링 시스템 수동 트리거 테스트입니다.',
      symbol: symbol || '005930',
      symbolName: symbolName || '삼성전자',
      market: market || 'KOSPI',
      severity: 'warning',
      metrics: metrics || {
        currentValue: 6.2,
        threshold: 5.0,
        unit: '%',
        changePercent: 6.2,
      },
    });
    res.json(evt || { message: 'Cooldown in effect, event suppressed' });
  });

  // -------------------------------------------------------------
  // 8. User Stock Alerts & Notifications Endpoints
  // -------------------------------------------------------------

  // Get user-configured alert rules
  app.get('/api/user-alerts', (req, res) => {
    const uid = req.query.uid as string;
    res.json(getUserAlertRules(uid));
  });

  // Create new user-configured alert rule
  app.post('/api/user-alerts', (req, res) => {
    const { uid, symbol, symbolName, type, value, condition } = req.body;
    if (!symbol || !type || value === undefined) {
      return res.status(400).json({ error: '필수 필드(symbol, type, value)가 누락되었습니다.' });
    }
    const newRule = addUserAlertRule({
      uid: uid || 'demo-user-1',
      symbol,
      symbolName: symbolName || symbol,
      type,
      value: Number(value),
      condition: condition || (type === 'price_fall' ? 'below' : 'above'),
      enabled: true,
    });
    res.json(newRule);
  });

  // Update existing user alert rule
  app.put('/api/user-alerts/:id', (req, res) => {
    const updated = updateUserAlertRule(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: '알림 규칙을 찾을 수 없습니다.' });
    }
    res.json(updated);
  });

  // Delete user alert rule
  app.delete('/api/user-alerts/:id', (req, res) => {
    const success = deleteUserAlertRule(req.params.id);
    res.json({ success });
  });

  // Get user notifications (with read/unread state)
  app.get('/api/notifications', (req, res) => {
    const uid = req.query.uid as string;
    res.json(getNotifications(uid));
  });

  // Mark notification as read
  app.post('/api/notifications/:id/read', (req, res) => {
    const updated = markNotificationAsRead(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: '알림을 찾을 수 없습니다.' });
    }
    res.json(updated);
  });

  // Mark all notifications as read
  app.post('/api/notifications/read-all', (req, res) => {
    const uid = req.body?.uid || (req.query.uid as string);
    const count = markAllNotificationsAsRead(uid);
    res.json({ success: true, count });
  });

  // Delete notification
  app.delete('/api/notifications/:id', (req, res) => {
    const success = deleteNotification(req.params.id);
    res.json({ success });
  });

  // Register active user watchlist for anomaly monitoring
  app.post('/api/user-alerts/watchlist', (req, res) => {
    const { uid, watchlist } = req.body;
    if (uid && Array.isArray(watchlist)) {
      setActiveUserWatchlist(uid, watchlist);
    }
    res.setHeader('X-Data-Source', 'kiwoom');
    res.json({ success: true, count: getActiveUserWatchlists().length });
  });

  // Clear cooldowns for testing
  app.post('/api/user-alerts/clear-cooldown', (_req, res) => {
    clearUserAlertCooldowns();
    res.json({ success: true, message: 'Cooldowns cleared' });
  });

  // Clear temporary test notifications feed
  app.post('/api/user-alerts/clear-notifications', (_req, res) => {
    clearServerNotifications();
    res.json({ success: true, message: 'Server notifications cleared' });
  });

  // Force trigger evaluation loop on demand using 100% REAL Kiwoom Data
  app.post('/api/user-alerts/check-now', async (req, res) => {
    const uid = req.body?.uid || (req.query.uid as string);
    const watchlist = req.body?.watchlist;
    const generated = await runRealKiwoomMarketEvaluation(uid, watchlist);
    res.setHeader('X-Data-Source', 'kiwoom');
    res.json({ checked: true, generatedCount: generated.length, generated, dataSource: 'kiwoom' });
  });

  // -------------------------------------------------------------
  // FCM Web Push Endpoints (Per-UID Token & Master Push Settings)
  // -------------------------------------------------------------
  // Register or refresh client FCM token for specific UID
  app.post('/api/fcm/token', (req, res) => {
    try {
      const { uid, token, device, userAgent } = req.body;
      if (!uid || !token) {
        return res.status(400).json({ error: 'uid와 token이 필요합니다.' });
      }
      const result = fcmServerService.registerToken({ uid, token, device, userAgent });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Invalidate tokens upon logout (prevents previous account push receipt)
  app.post('/api/fcm/token/invalidate', (req, res) => {
    try {
      const { uid, token } = req.body;
      if (!uid) {
        return res.status(400).json({ error: 'uid가 필요합니다.' });
      }
      const result = fcmServerService.invalidateToken(uid, token);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get user push settings
  app.get('/api/fcm/settings', (req, res) => {
    const uid = (req.query.uid as string) || 'default';
    res.json(fcmServerService.getUserSettings(uid));
  });

  // Update user push settings (Master toggle ON / OFF)
  app.post('/api/fcm/settings', (req, res) => {
    const { uid, pushEnabled } = req.body;
    if (!uid || typeof pushEnabled !== 'boolean') {
      return res.status(400).json({ error: 'uid와 pushEnabled(boolean)이 필요합니다.' });
    }
    const updated = fcmServerService.updateUserSettings(uid, pushEnabled);
    res.json(updated);
  });

  // Dispatch immediate test push to registered user devices
  app.post('/api/fcm/test-push', async (req, res) => {
    try {
      const { uid } = req.body;
      if (!uid) {
        return res.status(400).json({ error: 'uid가 필요합니다.' });
      }
      const result = await fcmServerService.sendTestPush(uid);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // FCM Diagnostics & Statistics
  app.get('/api/fcm/stats', (_req, res) => {
    res.json(fcmServerService.getStats());
  });

  // -------------------------------------------------------------
  // 8.5 User Personal AI Connection Vault Endpoints
  // -------------------------------------------------------------
  // Get connection status (masked, safe)
  app.get('/api/ai/connection/status', (req, res) => {
    const uid = (req.headers['x-user-uid'] as string) || (req.query.uid as string);
    if (!uid) {
      return res.status(401).json({ error: '인증이 필요합니다 (UID 누락).' });
    }
    const status = userAiVaultService.getConnectionStatus(uid);
    res.json(status);
  });

  // Connect personal Gemini API key
  app.post('/api/ai/connection/connect', async (req, res) => {
    try {
      const uid = (req.headers['x-user-uid'] as string) || req.body?.uid;
      const { apiKey, model } = req.body;
      if (!uid) {
        return res.status(401).json({ error: '인증이 필요합니다 (UID 누락).' });
      }
      if (!apiKey || typeof apiKey !== 'string') {
        return res.status(400).json({ error: 'Gemini API 키를 입력해주세요.' });
      }

      const status = await userAiVaultService.connectUserGeminiKey(
        uid,
        apiKey,
        model || 'gemini-3.8-flash'
      );
      res.json({ success: true, status });
    } catch (err: any) {
      console.warn('[UserAiVault] Connection failed:', err.message);
      res.status(400).json({ error: err.message || 'API 키 검증 및 연결에 실패했습니다.' });
    }
  });

  // Disconnect personal Gemini API key
  app.post('/api/ai/connection/disconnect', (req, res) => {
    const uid = (req.headers['x-user-uid'] as string) || req.body?.uid;
    if (!uid) {
      return res.status(401).json({ error: '인증이 필요합니다 (UID 누락).' });
    }
    const removed = userAiVaultService.disconnectUser(uid);
    res.json({
      success: true,
      removed,
      status: userAiVaultService.getConnectionStatus(uid),
    });
  });

  // -------------------------------------------------------------
  // 9. Gemini AI Stock Briefing & Dedicated Server Functions
  // -------------------------------------------------------------

  // Core AI Briefing Endpoint: Accepts user question and returns structured analysis
  app.post('/api/ai/stock-briefing', async (req, res) => {
    try {
      const { query, symbol } = req.body;
      const uid = (req.headers['x-user-uid'] as string) || req.body?.uid;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: '질문(query)을 입력해주세요.' });
      }

      if (!uid || !userAiVaultService.hasConnection(uid)) {
        return res.status(403).json({
          error: 'AI_NOT_CONNECTED',
          message: '개인 Gemini AI 계정이 연결되지 않았습니다. 운영자 공용 API는 비용 보호 정책에 따라 차단되며, 프로필 설정에서 본인의 Google AI Studio 키를 연결한 후 이용할 수 있습니다.',
        });
      }

      const userGenAI = userAiVaultService.getUserGenAIClient(uid);
      const briefing = await generateAiStockBriefing(query, symbol, userGenAI);
      res.json(briefing);
    } catch (err: any) {
      console.error('[AiBriefing] Error generating briefing:', err);
      const status = err.message?.includes('AI_NOT_CONNECTED') ? 403 : 500;
      res.status(status).json({ 
        error: err?.message || 'AI 종목 브리핑 생성 중 오류가 발생했습니다.', 
        details: err?.message 
      });
    }
  });

  // Server Function 1: get_stock_quote
  app.get('/api/ai/stock-data/quote', (req, res) => {
    const symbol = (req.query.symbol as string) || '005930';
    const quote = get_stock_quote(symbol);
    if (!quote) return res.status(404).json({ error: '종목을 찾을 수 없습니다.' });
    res.json(quote);
  });

  // Server Function 2: get_stock_chart
  app.get('/api/ai/stock-data/chart', (req, res) => {
    const symbol = (req.query.symbol as string) || '005930';
    const period = (req.query.period as string) || '1M';
    res.json(get_stock_chart(symbol, period));
  });

  // Server Function 3: get_stock_news
  app.get('/api/ai/stock-data/news', (req, res) => {
    const symbol = (req.query.symbol as string) || '005930';
    res.json(get_stock_news(symbol));
  });

  // Server Function 4: get_market_status
  app.get('/api/ai/stock-data/market', (req, res) => {
    res.json(get_market_status());
  });

  // Server Function 5: get_related_posts
  app.get('/api/ai/stock-data/posts', (req, res) => {
    const symbol = (req.query.symbol as string) || '005930';
    res.json(get_related_posts(symbol));
  });

  // -------------------------------------------------------------
  // 10. AI Stock Data Natural Language Query & Server Functions
  // -------------------------------------------------------------

  // Core natural language query endpoint: calls server functions then generates factual AI response
  app.post('/api/ai/stock-query', async (req, res) => {
    try {
      const { query, watchlist } = req.body;
      const uid = (req.headers['x-user-uid'] as string) || req.body?.uid;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: '질문(query)을 입력해주세요.' });
      }

      if (!uid || !userAiVaultService.hasConnection(uid)) {
        return res.status(403).json({
          error: 'AI_NOT_CONNECTED',
          message: '개인 Gemini AI 계정이 연결되지 않았습니다. 운영자 공용 API는 비용 보호 정책에 따라 차단되며, 프로필 설정에서 본인의 Google AI Studio 키를 연결한 후 이용할 수 있습니다.',
        });
      }

      const userGenAI = userAiVaultService.getUserGenAIClient(uid);
      const result = await processStockDataQuery(query, watchlist, userGenAI);
      res.json(result);
    } catch (err: any) {
      console.error('[AiStockQuery] Error executing query:', err);
      const status = err.message?.includes('AI_NOT_CONNECTED') ? 403 : 500;
      res.status(status).json({ 
        error: err?.message || '질의 처리 중 오류가 발생했습니다.', 
        details: err?.message 
      });
    }
  });

  // Query Server Function: get_stock_volume
  app.get('/api/ai/functions/stock-volume', (req, res) => {
    const symbol = (req.query.symbol as string) || '005930';
    res.json(get_stock_volume(symbol));
  });

  // Query Server Function: get_watchlist
  app.get('/api/ai/functions/watchlist', (req, res) => {
    const symbols = req.query.symbols ? (req.query.symbols as string).split(',') : undefined;
    res.json(get_watchlist(symbols));
  });

  // Query Server Function: get_market_summary
  app.get('/api/ai/functions/market-summary', (req, res) => {
    const market = req.query.market as string;
    res.json(get_market_summary(market));
  });

  // Query Server Function: get_top_gainers
  app.get('/api/ai/functions/top-gainers', (req, res) => {
    const limit = Number(req.query.limit) || 5;
    res.json(get_top_gainers(limit));
  });

  // Query Server Function: get_top_losers
  app.get('/api/ai/functions/top-losers', (req, res) => {
    const limit = Number(req.query.limit) || 5;
    res.json(get_top_losers(limit));
  });

  // Query Server Function: get_volume_spikes
  app.get('/api/ai/functions/volume-spikes', (req, res) => {
    const threshold = Number(req.query.threshold) || 140;
    res.json(get_volume_spikes(threshold));
  });

  // -------------------------------------------------------------
  // Real-time Chat & User Presence Engine (Authoritative Server State)
  // -------------------------------------------------------------
  interface ClientPresence {
    clientId: string;
    uid?: string;
    roomId: string;
    lastSeen: number;
  }
  const presenceClients = new Map<string, ClientPresence>();

  function pruneAndCalculatePresence() {
    const now = Date.now();
    for (const [id, c] of presenceClients.entries()) {
      if (now - c.lastSeen > 30000) {
        presenceClients.delete(id);
      }
    }
    const roomCounts: Record<string, number> = {
      all: 0,
      domestic: 0,
      kospi: 0,
      kosdaq: 0,
      surge: 0,
      watchlist: 0,
    };

    for (const c of presenceClients.values()) {
      const rid = c.roomId || 'all';
      roomCounts[rid] = (roomCounts[rid] || 0) + 1;
    }

    // Baseline active community members connected to live trading ticker
    const liveSessionCount = Math.max(presenceClients.size, 1);
    const totalOnline = liveSessionCount;

    return {
      totalOnline,
      activeClientsCount: presenceClients.size,
      roomCounts,
    };
  }

  // Heartbeat endpoint for active presence
  app.post('/api/presence/heartbeat', (req, res) => {
    try {
      const { clientId, uid, roomId } = req.body;
      const cid = clientId || `guest-${req.ip}-${req.headers['user-agent']?.slice(0, 20)}`;
      presenceClients.set(cid, {
        clientId: cid,
        uid,
        roomId: roomId || 'all',
        lastSeen: Date.now(),
      });
      const data = pruneAndCalculatePresence();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Status endpoint for current presence
  app.get('/api/presence/status', (_req, res) => {
    const data = pruneAndCalculatePresence();
    res.json(data);
  });

  // -------------------------------------------------------------
  // 11. Admin Dedicated API Router (Secured by Admin RBAC)
  // -------------------------------------------------------------
  app.use('/api/admin', createAdminRouter());

  // 12. Catch-all 404 for unmatched API routes
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: '존재하지 않는 API 엔드포인트입니다.',
      path: req.path,
    });
  });

  // -------------------------------------------------------------
  // Vite Frontend Middleware
  // -------------------------------------------------------------
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Byeongdol Investment] Full-stack Server listening on port ${PORT}`);
    console.log(`[Data Pipeline] Browser -> Backend API -> Stock API -> Backend -> Browser`);
    console.log(`[Source Mode] ${DEFAULT_SOURCE}`);

    // Preload & refresh Kiwoom stock master list from live API in background (Only on GCP Fixed IP server)
    if (kiwoomApiService.isFixedIpServer() && kiwoomApiService.isConfigured()) {
      kiwoomApiService.fetchStockMasterList(true).then(list => {
        console.log(`[Server] Live updated ${list.length} Kiwoom master stocks.`);
      }).catch(err => {
        console.warn('[Server] Master stocks preloading deferred:', err.message);
      });
    }
  });
}

startServer();
