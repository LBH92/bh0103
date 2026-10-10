/**
 * Kiwoom Securities Open REST API Service (Server-side Only)
 * 
 * Strict Architecture:
 * - KIWOOM_APP_KEY and KIWOOM_APP_SECRET are NEVER exposed to the frontend.
 * - Handles OAuth2 client_credentials token issuance and auto-refresh.
 * - Supports Real environment (https://api.kiwoom.com) and Mock environment (https://mockapi.kiwoom.com).
 * - Implements stock quote inquiry (현재가, 등락률, 시가, 고가, 저가, 거래량 등).
 * - Implements market index inquiry (KOSPI 0001, KOSDAQ 1001).
 * - Provides full diagnostic test runner for connection validation.
 */

import fs from 'fs';
import path from 'path';
import { Stock, StockIndex, CandleData, OrderBook, OrderBookLevel, KiwoomChartPeriod, KiwoomChartResponse, StockRankingItem, MarketFilterType, RankingSortType } from '../src/types';

export interface KiwoomRealtimeTick {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  open: number;
  high: number;
  low: number;
  time: string;
  source: 'KIWOOM_WS' | 'SIMULATED';
}

export interface KiwoomConfig {
  appKey: string;
  appSecret: string;
  isMock: boolean;
  baseUrl: string;
  wsUrl: string;
}

export interface KiwoomTokenState {
  accessToken: string | null;
  tokenType: string;
  expiresAt: number; // Unix timestamp in ms
  lastIssuedAt: number | null;
  lastError: string | null;
}

export interface KiwoomDiagnosticResult {
  hasAppKey: boolean;
  hasAppSecret: boolean;
  isMock: boolean;
  baseUrl: string;
  tokenTest: {
    attempted: boolean;
    success: boolean;
    httpStatus?: number;
    returnCode?: number;
    returnMsg?: string;
    rawResponse?: any;
    error?: string;
  };
  sampleStockTest?: {
    symbol: string;
    attempted: boolean;
    success: boolean;
    httpStatus?: number;
    stockData?: Partial<Stock>;
    error?: string;
  };
}

export interface KiwoomMasterStock {
  code: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ';
  sector: string;
  lastPrice: number;
  listCount: number;
  marketCap: number; // in 억 원
}

class KiwoomApiService {
  private config: KiwoomConfig;
  private tokenState: KiwoomTokenState = {
    accessToken: null,
    tokenType: 'Bearer',
    expiresAt: 0,
    lastIssuedAt: null,
    lastError: null,
  };
  private tokenPromise: Promise<string> | null = null;
  private tokenCooldownUntil: number = 0;
  private publicServerIp: string = '34.34.244.85';
  private chartServerCache = new Map<string, { data: KiwoomChartResponse; expiresAt: number }>();

  constructor() {
    const isMock = process.env.KIWOOM_IS_MOCK !== 'false'; // Default to mock environment if not explicitly false
    const appKey = process.env.KIWOOM_APP_KEY || '';
    const appSecret = process.env.KIWOOM_APP_SECRET || '';
    const baseUrl = isMock ? 'https://mockapi.kiwoom.com' : 'https://api.kiwoom.com';
    const wsUrl = isMock ? 'wss://mockapi.kiwoom.com:10000/api/dostk/websocket' : 'wss://api.kiwoom.com:10000/api/dostk/websocket';

    this.config = {
      appKey,
      appSecret,
      isMock,
      baseUrl,
      wsUrl,
    };

    // Detect outbound public IP asynchronously for Kiwoom portal registration help
    this.detectPublicServerIp();

    // Preload Korean domestic master stocks from cached registry
    this.loadLocalMasterStocks();
  }

  public getPublicServerIp(): string {
    return this.publicServerIp;
  }

  public setAccessToken(token: string): void {
    if (!token) return;
    this.tokenState = {
      accessToken: token.trim(),
      tokenType: 'Bearer',
      expiresAt: Date.now() + 86400 * 1000,
      lastIssuedAt: Date.now(),
      lastError: null,
    };
    this.tokenCooldownUntil = 0;
    console.log('[Kiwoom API] Access token manually updated/injected.');
  }

  private async detectPublicServerIp() {
    try {
      const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const json = await res.json() as { ip?: string };
        if (json.ip) {
          this.publicServerIp = json.ip;
        }
      }
    } catch {
      // Fallback to initial value
    }
  }

  private loadLocalMasterStocks() {
    if (this.masterStocks.length > 0) return;
    try {
      const filePath = path.join(process.cwd(), 'server', 'data', 'krxMasterStocks.json');
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const list: KiwoomMasterStock[] = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          this.masterStocks = list;
          this.masterStocksMap.clear();
          for (const s of list) {
            this.masterStocksMap.set(s.code, s);
          }
          this.masterStocksLoaded = true;
          console.log(`[Kiwoom API] Loaded ${list.length} stocks from local master registry (KOSPI & KOSDAQ).`);
        }
      }
    } catch (e: any) {
      console.log('[Kiwoom API] Note reading local master stocks:', e.message);
    }
  }

  // WebSocket State & Listeners
  private ws: any = null;
  private wsConnected: boolean = false;
  private wsLoggedIn: boolean = false;
  private subscribedSymbols: Set<string> = new Set();
  private tickListeners: Set<(tick: KiwoomRealtimeTick) => void> = new Set();
  private subscribedOrderBookSymbols: Set<string> = new Set();
  private orderBookListeners: Set<(ob: OrderBook) => void> = new Set();
  private reconnectTimer: any = null;
  private isConnectingWs: boolean = false;

  public getConfig(): Omit<KiwoomConfig, 'appSecret'> & { hasAppSecret: boolean } {
    return {
      appKey: this.config.appKey ? `${this.config.appKey.slice(0, 4)}****` : '',
      hasAppSecret: !!this.config.appSecret,
      isMock: this.config.isMock,
      baseUrl: this.config.baseUrl,
      wsUrl: this.config.wsUrl,
    };
  }

  public isConfigured(): boolean {
    const appKey = process.env.KIWOOM_APP_KEY || this.config.appKey;
    const appSecret = process.env.KIWOOM_APP_SECRET || this.config.appSecret;
    return !!(appKey && appSecret);
  }

  private refreshEnvConfig() {
    this.config.appKey = process.env.KIWOOM_APP_KEY || this.config.appKey;
    this.config.appSecret = process.env.KIWOOM_APP_SECRET || this.config.appSecret;
    if (process.env.KIWOOM_IS_MOCK !== undefined) {
      this.config.isMock = process.env.KIWOOM_IS_MOCK !== 'false';
      this.config.baseUrl = this.config.isMock ? 'https://mockapi.kiwoom.com' : 'https://api.kiwoom.com';
      this.config.wsUrl = this.config.isMock ? 'wss://mockapi.kiwoom.com:10000/api/dostk/websocket' : 'wss://api.kiwoom.com:10000/api/dostk/websocket';
    }
  }

  public updateCredentials(appKey: string, appSecret: string, isMock: boolean = false) {
    this.config.appKey = appKey.trim();
    this.config.appSecret = appSecret.trim();
    this.config.isMock = isMock;
    this.config.baseUrl = isMock ? 'https://mockapi.kiwoom.com' : 'https://api.kiwoom.com';
    this.config.wsUrl = isMock ? 'wss://mockapi.kiwoom.com:10000/api/dostk/websocket' : 'wss://api.kiwoom.com:10000/api/dostk/websocket';
    process.env.KIWOOM_APP_KEY = this.config.appKey;
    process.env.KIWOOM_APP_SECRET = this.config.appSecret;
    process.env.KIWOOM_IS_MOCK = isMock ? 'true' : 'false';
    process.env.STOCK_DATA_SOURCE = 'REAL';

    // Clear previous token cache and cooldown
    this.tokenState = {
      accessToken: null,
      tokenType: 'Bearer',
      expiresAt: 0,
      lastIssuedAt: null,
      lastError: null,
    };
    this.tokenPromise = null;
    this.tokenCooldownUntil = 0;

    // Safely persist to .env file on disk
    try {
      const envPath = path.join(process.cwd(), '.env');
      const content = `KIWOOM_IS_MOCK=${isMock ? 'true' : 'false'}\nSTOCK_DATA_SOURCE=REAL\nKIWOOM_APP_KEY=${this.config.appKey}\nKIWOOM_APP_SECRET=${this.config.appSecret}\n`;
      fs.writeFileSync(envPath, content, 'utf8');
      console.log('[Kiwoom API] Credentials updated and safely persisted to .env (secrets masked in logs).');
    } catch (e: any) {
      console.log('[Kiwoom API] Note persisting .env:', e.message);
    }
  }

  /**
   * 1. Issue or Refresh OAuth 2.0 Access Token
   */
  public async getAccessToken(): Promise<string> {
    this.refreshEnvConfig();
    if (!this.isConfigured()) {
      throw new Error('KIWOOM_APP_KEY 또는 KIWOOM_APP_SECRET 환경변수가 서버에 설정되지 않았습니다.');
    }

    // Reuse valid token (refresh 60 seconds before expiration)
    const now = Date.now();
    if (this.tokenState.accessToken && this.tokenState.expiresAt > now + 60000) {
      return this.tokenState.accessToken;
    }

    // If recently failed, honor cooldown to prevent hammering Kiwoom API and flooding logs
    if (now < this.tokenCooldownUntil && this.tokenState.lastError) {
      throw new Error(this.tokenState.lastError);
    }

    // Deduplicate in-flight token requests
    if (this.tokenPromise) {
      return this.tokenPromise;
    }

    const tokenUrl = `${this.config.baseUrl}/oauth2/token`;
    console.log(`[Kiwoom API] Requesting OAuth token from ${tokenUrl}...`);

    this.tokenPromise = (async () => {
      try {
        const res = await fetch(tokenUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify({
            grant_type: 'client_credentials',
            appkey: this.config.appKey,
            secretkey: this.config.appSecret,
          }),
        });

        const responseText = await res.text();
        let data: any = {};
        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(`Kiwoom 토큰 응답 파싱 실패 (HTTP ${res.status}): ${responseText.slice(0, 200)}`);
        }

        if (!res.ok || data.return_code !== undefined && data.return_code !== 0) {
          const errorMsg = data.return_msg || data.msg1 || `HTTP ${res.status} 오류`;
          this.tokenState.lastError = `[${data.return_code || res.status}] ${errorMsg}`;
          this.tokenCooldownUntil = Date.now() + 60000; // 60s cooldown
          if (errorMsg.includes('8050') || errorMsg.includes('IP가 등록되지 않았습니다')) {
            console.log(`[Kiwoom API] 실전 API 접근 안내: 키움 REST API 홈페이지 > API 사용신청에서 서버 공인 IP 등록이 필요합니다. (미등록 시 Yahoo/Mock fallback으로 안전하게 서빙됩니다)`);
          } else {
            console.log(`[Kiwoom API] Token notice: ${errorMsg}`);
          }
          throw new Error(`키움 OAuth 토큰 발급 실패 (${res.status}): ${errorMsg}`);
        }

        const token = data.token || data.access_token;
        if (!token) {
          throw new Error(`응답에 access_token이 누락되었습니다: ${responseText}`);
        }

        const expiresIn = data.expires_in || 86400; // default 24h
        this.tokenState = {
          accessToken: token,
          tokenType: data.token_type || 'Bearer',
          expiresAt: now + (expiresIn * 1000),
          lastIssuedAt: now,
          lastError: null,
        };
        this.tokenCooldownUntil = 0;

        console.log(`[Kiwoom API] OAuth token successfully issued. Expires in ${expiresIn}s.`);
        return token;
      } catch (err: any) {
        this.tokenState.lastError = err.message;
        this.tokenCooldownUntil = Date.now() + 60000;
        throw err;
      } finally {
        this.tokenPromise = null;
      }
    })();

    return this.tokenPromise;
  }

  private masterStocks: KiwoomMasterStock[] = [];
  private masterStocksMap: Map<string, KiwoomMasterStock> = new Map();
  private masterStocksLoaded: boolean = false;
  private masterStocksLoadingPromise: Promise<KiwoomMasterStock[]> | null = null;

  /**
   * Fetch Domestic Stock Master List (KOSPI mrkt_tp: '0', KOSDAQ mrkt_tp: '10')
   * Kiwoom REST API Endpoint: /api/dostk/stkinfo (TR: ka10099)
   */
  public async fetchStockMasterList(forceRefresh: boolean = false): Promise<KiwoomMasterStock[]> {
    this.loadLocalMasterStocks();

    if (!forceRefresh && this.masterStocksLoaded && this.masterStocks.length > 0) {
      return this.masterStocks;
    }
    if (this.masterStocksLoadingPromise) {
      return this.masterStocksLoadingPromise;
    }
    this.masterStocksLoadingPromise = (async () => {
      try {
        const token = await this.getAccessToken();
        const url = `${this.config.baseUrl}/api/dostk/stkinfo`;

        const [kospiRes, kosdaqRes] = await Promise.all([
          fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json;charset=UTF-8',
              'authorization': `Bearer ${token}`,
              'appkey': this.config.appKey,
              'appsecret': this.config.appSecret,
              'api-id': 'ka10099',
            },
            body: JSON.stringify({ mrkt_tp: '0' }),
          }),
          fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json;charset=UTF-8',
              'authorization': `Bearer ${token}`,
              'appkey': this.config.appKey,
              'appsecret': this.config.appSecret,
              'api-id': 'ka10099',
            },
            body: JSON.stringify({ mrkt_tp: '10' }),
          }),
        ]);

        const kospiData = await kospiRes.json();
        const kosdaqData = await kosdaqRes.json();

        const all: KiwoomMasterStock[] = [];
        const map = new Map<string, KiwoomMasterStock>();

        const processList = (list: any[], market: 'KOSPI' | 'KOSDAQ') => {
          if (!Array.isArray(list)) return;
          for (const item of list) {
            if (!item.code || !item.name) continue;
            const price = Math.abs(parseInt(item.lastPrice, 10)) || 0;
            const listCount = parseInt(item.listCount, 10) || 0;
            const marketCap = Math.round((price * listCount) / 100000000); // 억 원
            const stock: KiwoomMasterStock = {
              code: item.code,
              name: item.name,
              market,
              sector: item.upName || '기타',
              lastPrice: price,
              listCount,
              marketCap,
            };
            all.push(stock);
            map.set(item.code, stock);
          }
        };

        processList(kospiData.list, 'KOSPI');
        processList(kosdaqData.list, 'KOSDAQ');

        if (all.length > 0) {
          this.masterStocks = all;
          this.masterStocksMap = map;
          this.masterStocksLoaded = true;
          console.log(`[Kiwoom API] Loaded ${all.length} master stocks from Kiwoom REST API (KOSPI: ${kospiData.list?.length || 0}, KOSDAQ: ${kosdaqData.list?.length || 0})`);
          try {
            const filePath = path.join(process.cwd(), 'server', 'data', 'krxMasterStocks.json');
            fs.writeFileSync(filePath, JSON.stringify(all, null, 2), 'utf8');
          } catch {}
        }
        return this.masterStocks;
      } catch (err: any) {
        console.log('[Kiwoom API] Master stocks load notice (using cached registry):', err.message);
        return this.masterStocks;
      } finally {
        this.masterStocksLoadingPromise = null;
      }
    })();
    return this.masterStocksLoadingPromise;
  }

  public getMasterStocks(): KiwoomMasterStock[] {
    return this.masterStocks;
  }

  public getMasterStock(symbol: string): KiwoomMasterStock | undefined {
    return this.masterStocksMap.get(symbol);
  }

  public getMasterStockCounts(): { total: number; kospi: number; kosdaq: number } {
    const kospi = this.masterStocks.filter(s => s.market === 'KOSPI').length;
    const kosdaq = this.masterStocks.filter(s => s.market === 'KOSDAQ').length;
    return {
      total: this.masterStocks.length,
      kospi,
      kosdaq,
    };
  }

  private stockPriceCache: Map<string, { data: Partial<Stock>; expiresAt: number }> = new Map();

  /**
   * 2. Inquire Stock Current Price (주식기본정보 & 체결정보)
   * Kiwoom REST API Endpoint: /api/dostk/stkinfo
   * TR: ka10001 (기본정보: 현재가, 전일대비, 등락률, 시가, 고가, 저가, 거래량, 시총 등)
   * TR: ka10003 (체결정보: acc_trde_prica 원 단위 거래대금)
   */
  public async fetchStockPrice(symbol: string): Promise<Partial<Stock>> {
    const cached = this.stockPriceCache.get(symbol);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const token = await this.getAccessToken();
    const url = `${this.config.baseUrl}/api/dostk/stkinfo`;

    // 1. Inquire Basic Price Info via ka10001 (with rate-limit retry)
    let data1: any = null;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;
      const res1 = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'authorization': `Bearer ${token}`,
          'appkey': this.config.appKey,
          'appsecret': this.config.appSecret,
          'api-id': 'ka10001',
        },
        body: JSON.stringify({ stk_cd: symbol }),
      });

      try {
        data1 = await res1.json();
      } catch {
        data1 = { return_code: -1, return_msg: `HTTP ${res1.status}` };
      }

      if (
        data1 &&
        (data1.return_code === 1700 ||
          data1.return_code === '1700' ||
          (data1.return_msg && data1.return_msg.includes('허용된 API 요청 개수')))
      ) {
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 250 * attempts));
          continue;
        }
      }

      if (!res1.ok || (data1.return_code !== undefined && data1.return_code !== 0 && data1.return_code !== '0')) {
        throw new Error(`Kiwoom 시세 조회(ka10001) 실패: ${data1.return_msg || res1.status}`);
      }
      break;
    }

    const price = Math.abs(parseInt(data1.cur_prc, 10)) || 0;
    const basePric = Math.abs(parseInt(data1.base_pric, 10)) || price;
    let change = parseInt(data1.pred_pre, 10) || 0;
    if (data1.pre_sig === '4' || data1.pre_sig === '5') {
      change = -Math.abs(change);
    } else if (data1.pre_sig === '1' || data1.pre_sig === '2') {
      change = Math.abs(change);
    }
    const changePercent = parseFloat(data1.flu_rt) || (basePric > 0 ? Number(((change / basePric) * 100).toFixed(2)) : 0);
    const volume = Math.abs(parseInt(data1.trde_qty, 10)) || 0;
    const openPrice = Math.abs(parseInt(data1.open_pric, 10)) || price;
    const highPrice = Math.abs(parseInt(data1.high_pric, 10)) || price;
    const lowPrice = Math.abs(parseInt(data1.low_pric, 10)) || price;
    const prevClose = basePric;
    const high52w = Math.abs(parseInt(data1['250hgst'] || data1.oyr_hgst, 10)) || Math.round(price * 1.3);
    const low52w = Math.abs(parseInt(data1['250lwst'] || data1.oyr_lwst, 10)) || Math.round(price * 0.7);
    const marketCap = Math.abs(parseInt(data1.mac, 10)) || Math.round((price * (parseInt(data1.flo_stk, 10) || 1000000)) / 100000000);
    const per = parseFloat(data1.per) || 15.2;
    const pbr = parseFloat(data1.pbr) || 1.4;
    const eps = Math.abs(parseInt(data1.eps, 10)) || Math.round(price / 15.2);

    // 2. Inquire Execution Info via ka10003 for acc_trde_prica (원 단위)
    let tradingValue = 0;
    try {
      const res3 = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'authorization': `Bearer ${token}`,
          'appkey': this.config.appKey,
          'appsecret': this.config.appSecret,
          'api-id': 'ka10003',
        },
        body: JSON.stringify({ stk_cd: symbol }),
      });
      if (res3.ok) {
        const data3 = await res3.json();
        const latestCntr = data3.cntr_infr?.[0];
        if (latestCntr && latestCntr.acc_trde_prica) {
          const rawWon = Number(latestCntr.acc_trde_prica);
          if (!isNaN(rawWon) && rawWon > 0) {
            // 원 -> 억원 변환
            tradingValue = Math.round(rawWon / 100000000);
          }
        }
      }
    } catch {
      // Fallback if ka10003 fails
    }

    if (tradingValue <= 0) {
      tradingValue = Math.round((price * volume) / 100000000);
    }

    const stockResult: Partial<Stock> = {
      symbol,
      name: data1.stk_nm || undefined,
      price,
      change,
      changePercent,
      volume,
      openPrice,
      highPrice,
      lowPrice,
      prevClose,
      tradingValue, // in 억 원
      high52w,
      low52w,
      marketCap,
      per,
      pbr,
      eps,
    };

    // Cache for 3 seconds to preserve API rate limits
    this.stockPriceCache.set(symbol, {
      data: stockResult,
      expiresAt: Date.now() + 3000,
    });

    return stockResult;
  }

  /**
   * 3. Inquire Index Current Price (KOSPI mrkt_tp: '0', inds_cd: '001'; KOSDAQ mrkt_tp: '1', inds_cd: '101')
   * Kiwoom REST API Endpoint: /api/dostk/sect (TR: ka20001)
   */
  public async fetchIndexPrice(marketCode: 'KOSPI' | 'KOSDAQ'): Promise<StockIndex> {
    const isKospi = marketCode === 'KOSPI';
    const mrkt_tp = isKospi ? '0' : '1';
    const inds_cd = isKospi ? '001' : '101';
    const name = isKospi ? '코스피' : '코스닥';

    const token = await this.getAccessToken();
    const url = `${this.config.baseUrl}/api/dostk/sect`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'api-id': 'ka20001',
      },
      body: JSON.stringify({ mrkt_tp, inds_cd }),
    });

    const data = await res.json();
    if (!res.ok || (data.return_code !== undefined && data.return_code !== 0 && data.return_code !== '0')) {
      throw new Error(`Kiwoom 업종/지수 조회 실패: ${data.return_msg || res.status}`);
    }

    const curPrc = Math.abs(parseFloat(data.cur_prc)) || 0;
    const change = parseFloat(data.pred_pre) || 0;
    const changePercent = parseFloat(data.flu_rt) || 0;
    const high = Math.abs(parseFloat(data.high_pric)) || curPrc;
    const low = Math.abs(parseFloat(data.low_pric)) || curPrc;
    const volume = Math.abs(parseInt(data.trde_qty, 10)) || 0;
    const tradingValue = Math.round((Math.abs(parseInt(data.trde_prica, 10)) || 0) / 100); // 백만원 -> 억원
    const advanceCount = parseInt(data.rising, 10) || 450;
    const declineCount = parseInt(data.fall, 10) || 380;

    let sparkline: number[] = [];
    if (Array.isArray(data.inds_cur_prc_tm) && data.inds_cur_prc_tm.length > 0) {
      sparkline = data.inds_cur_prc_tm
        .map((item: any) => Math.abs(parseFloat(item.cur_prc_n)))
        .filter((val: number) => !isNaN(val) && val > 0)
        .reverse()
        .slice(-10);
    }
    if (sparkline.length < 2) {
      sparkline = [curPrc - change, curPrc];
    }

    return {
      name,
      symbol: marketCode,
      value: curPrc,
      change,
      changePercent,
      high,
      low,
      volume,
      tradingValue: tradingValue > 0 ? tradingValue : 10,
      advanceCount,
      declineCount,
      sparkline,
    };
  }

  /**
   * 3-B. Inquire Stock Rankings via Kiwoom REST API
   * Endpoint: /api/dostk/rkinfo
   * TR: ka10027 (전일대비등락률상위 - 상승률/하락률)
   * TR: ka10030 (당일거래량상위)
   * TR: ka10032 (거래대금상위)
   */
  public async fetchStockRankings(
    market: MarketFilterType,
    sort: RankingSortType
  ): Promise<{ items: StockRankingItem[]; trId: string }> {
    const token = await this.getAccessToken();
    const url = `${this.config.baseUrl}/api/dostk/rkinfo`;

    // Map market filter to Kiwoom mrkt_tp ('001': KOSPI, '101': KOSDAQ, '000': ALL)
    let mrkt_tp = '000';
    if (market === 'KOSPI') mrkt_tp = '001';
    else if (market === 'KOSDAQ') mrkt_tp = '101';

    let trId = 'ka10027';
    let bodyPayload: Record<string, any> = {};

    if (sort === 'change_rise' || sort === 'change_fall') {
      trId = 'ka10027';
      bodyPayload = {
        mrkt_tp,
        sort_tp: sort === 'change_rise' ? '1' : '4', // 1: 상승률, 4: 하락률
        trde_qty_cnd: '0',
        stk_cnd: '0',
        crd_cnd: '0',
        updown_incls: '1',
        pric_cnd: '0',
        trde_prica_cnd: '0',
        stex_tp: '1',
      };
    } else if (sort === 'volume') {
      trId = 'ka10030';
      bodyPayload = {
        mrkt_tp,
        sort_tp: '1',
        mang_stk_incls: '0',
        crd_tp: '0',
        trde_qty_tp: '0',
        pric_tp: '0',
        trde_prica_tp: '0',
        mrkt_open_tp: '0',
        stex_tp: '1',
      };
    } else if (sort === 'trading_value') {
      trId = 'ka10032';
      bodyPayload = {
        mrkt_tp,
        mang_stk_incls: '0',
        stex_tp: '1',
      };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'api-id': trId,
        'cont-yn': 'N',
      },
      body: JSON.stringify(bodyPayload),
    });

    let data: any;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Kiwoom 순위 조회(${trId}) HTTP 응답 구문 분석 실패: ${res.status}`);
    }

    if (!res.ok || (data.return_code !== undefined && data.return_code !== 0 && data.return_code !== '0')) {
      throw new Error(`Kiwoom 순위 조회(${trId}) 실패 [code: ${data.return_code}]: ${data.return_msg || res.status}`);
    }

    // Extract ranking array depending on TR
    let rawList: any[] = [];
    if (trId === 'ka10027') {
      rawList = data.pred_pre_flu_rt_upper || data.output || [];
    } else if (trId === 'ka10030') {
      rawList = data.tdy_trde_qty_upper || data.output || [];
    } else if (trId === 'ka10032') {
      rawList = data.trde_prica_upper || data.output || [];
    }

    if (!Array.isArray(rawList)) {
      rawList = [];
    }

    const items: StockRankingItem[] = rawList.slice(0, 20).map((item: any, idx: number) => {
      const code = String(item.stk_cd || '').trim();
      const master = this.getMasterStock(code);
      const name = String(item.stk_nm || master?.name || code).trim();
      const price = Math.abs(parseInt(item.cur_prc, 10)) || 0;
      
      let change = parseInt(item.pred_pre, 10) || 0;
      const sig = String(item.pred_pre_sig || '').trim();
      if (sig === '4' || sig === '5') {
        change = -Math.abs(change);
      } else if (sig === '1' || sig === '2') {
        change = Math.abs(change);
      }
      
      let changePercent = parseFloat(item.flu_rt) || 0;
      if (sig === '4' || sig === '5') {
        changePercent = -Math.abs(changePercent);
      } else if (sig === '1' || sig === '2') {
        changePercent = Math.abs(changePercent);
      }

      const volume = Math.abs(parseInt(item.now_trde_qty || item.trde_qty, 10)) || 0;

      // Trading value in 억 원
      let tradingValue = 0;
      if (item.trde_prica) {
        const val = parseInt(item.trde_prica, 10) || 0;
        tradingValue = val > 10000000 ? Math.round(val / 100000000) : val;
      } else if (item.trde_amt) {
        const val = parseInt(item.trde_amt, 10) || 0;
        tradingValue = val > 10000000 ? Math.round(val / 100000000) : Math.round(val / 100);
      }
      if (tradingValue <= 0 && price > 0 && volume > 0) {
        tradingValue = Math.round((price * volume) / 100000000);
      }

      const stockMarket: 'KOSPI' | 'KOSDAQ' = master?.market || (market === 'KOSDAQ' ? 'KOSDAQ' : 'KOSPI');
      const sector = master?.sector || '기타';

      return {
        rank: idx + 1,
        symbol: code,
        name,
        market: stockMarket,
        sector,
        price,
        change,
        changePercent,
        volume,
        tradingValue,
        prevClose: price - change,
      };
    });

    return { items, trId };
  }

  /**
   * 4. Inquire Stock Daily Price History (주식일봉차트 - Legacy compatibility)
   * Kiwoom REST API Endpoint: /api/dostk/chart (TR: ka10081)
   */
  public async fetchStockCandles(symbol: string): Promise<CandleData[]> {
    return this.fetchStockDailyCandles(symbol);
  }

  /**
   * 4-A. Inquire Stock Minute Price History (주식분봉차트)
   * Kiwoom REST API Endpoint: /api/dostk/chart (TR: ka10080)
   * @param symbol 종목코드 (6자리)
   * @param ticScope 틱범위 ("1", "5", "15", "30", "60")
   */
  public async fetchStockMinuteCandles(symbol: string, ticScope: '1' | '5' | '15' | '30' | '60'): Promise<CandleData[]> {
    const token = await this.getAccessToken();
    const url = `${this.config.baseUrl}/api/dostk/chart`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'api-id': 'ka10080',
      },
      body: JSON.stringify({
        stk_cd: symbol,
        tic_scope: ticScope,
        upd_stkpc_tp: '1',
      }),
    });

    const data = await res.json();
    if (!res.ok || (data.return_code !== undefined && data.return_code !== 0 && data.return_code !== '0')) {
      throw new Error(`Kiwoom 분봉 차트 조회(ka10080, ${ticScope}분) 실패: ${data.return_msg || res.status}`);
    }

    const chartList = data.stk_min_pole_chart_qry;
    if (!Array.isArray(chartList) || chartList.length === 0) {
      return [];
    }

    return chartList.map((item: any) => {
      const tm = (item.cntr_tm || '').trim();
      let formattedTime = tm;
      if (tm.length === 14) {
        // "20261007153000" -> "10/07 15:30"
        formattedTime = `${tm.slice(4, 6)}/${tm.slice(6, 8)} ${tm.slice(8, 10)}:${tm.slice(10, 12)}`;
      } else if (tm.length === 12) {
        formattedTime = `${tm.slice(4, 6)}/${tm.slice(6, 8)} ${tm.slice(8, 10)}:${tm.slice(10, 12)}`;
      } else if (tm.length === 6) {
        formattedTime = `${tm.slice(0, 2)}:${tm.slice(2, 4)}`;
      }
      return {
        time: formattedTime,
        open: Math.abs(parseInt(item.open_pric, 10)) || 0,
        high: Math.abs(parseInt(item.high_pric, 10)) || 0,
        low: Math.abs(parseInt(item.low_pric, 10)) || 0,
        close: Math.abs(parseInt(item.cur_prc, 10)) || 0,
        volume: Math.abs(parseInt(item.trde_qty, 10)) || 0,
      };
    }).reverse();
  }

  /**
   * 4-B. Inquire Stock Daily Price History (주식일봉차트)
   * Kiwoom REST API Endpoint: /api/dostk/chart (TR: ka10081)
   */
  public async fetchStockDailyCandles(symbol: string, baseDt?: string): Promise<CandleData[]> {
    const token = await this.getAccessToken();
    const today = baseDt || new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const url = `${this.config.baseUrl}/api/dostk/chart`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'api-id': 'ka10081',
      },
      body: JSON.stringify({
        stk_cd: symbol,
        base_dt: today,
        upd_stkpc_tp: '1',
      }),
    });

    const data = await res.json();
    if (!res.ok || (data.return_code !== undefined && data.return_code !== 0 && data.return_code !== '0')) {
      throw new Error(`Kiwoom 일봉 차트 조회(ka10081) 실패: ${data.return_msg || res.status}`);
    }

    const chartList = data.stk_dt_pole_chart_qry;
    if (!Array.isArray(chartList) || chartList.length === 0) {
      return [];
    }

    return chartList.map((item: any) => {
      const d = (item.dt || '').trim();
      const formattedDate = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
      return {
        time: formattedDate,
        open: Math.abs(parseInt(item.open_pric, 10)) || 0,
        high: Math.abs(parseInt(item.high_pric, 10)) || 0,
        low: Math.abs(parseInt(item.low_pric, 10)) || 0,
        close: Math.abs(parseInt(item.cur_prc, 10)) || 0,
        volume: Math.abs(parseInt(item.trde_qty, 10)) || 0,
      };
    }).reverse();
  }

  /**
   * 4-C. Comprehensive Chart Dispatcher with Server Caching & Real-time Alignment
   * Supports: 1분 (ka10080), 5분 (ka10080), 15분 (ka10080), 30분 (ka10080), 1시간 (ka10080), 일봉 (ka10081)
   */
  public async fetchStockChart(
    symbol: string,
    periodInput: string = '1m',
    currentPrice?: number
  ): Promise<KiwoomChartResponse> {
    const rawPeriod = (periodInput || '1m').toLowerCase().trim();

    // Map input to standard period and Kiwoom TR info
    let period: KiwoomChartPeriod = '1m';
    let periodLabel = '1분';
    let trId = 'ka10080';
    let ticScope: '1' | '5' | '15' | '30' | '60' | undefined = '1';
    let ttlMs = 20000; // 20s server cache for minute charts

    if (rawPeriod === '1m' || rawPeriod === '1' || rawPeriod === '1분' || rawPeriod === '1min') {
      period = '1m';
      periodLabel = '1분';
      trId = 'ka10080';
      ticScope = '1';
      ttlMs = 20000;
    } else if (rawPeriod === '5m' || rawPeriod === '5' || rawPeriod === '5분' || rawPeriod === '5min') {
      period = '5m';
      periodLabel = '5분';
      trId = 'ka10080';
      ticScope = '5';
      ttlMs = 25000;
    } else if (rawPeriod === '15m' || rawPeriod === '15' || rawPeriod === '15분' || rawPeriod === '15min') {
      period = '15m';
      periodLabel = '15분';
      trId = 'ka10080';
      ticScope = '15';
      ttlMs = 30000;
    } else if (rawPeriod === '30m' || rawPeriod === '30' || rawPeriod === '30분' || rawPeriod === '30min') {
      period = '30m';
      periodLabel = '30분';
      trId = 'ka10080';
      ticScope = '30';
      ttlMs = 30000;
    } else if (rawPeriod === '1h' || rawPeriod === '60m' || rawPeriod === '60' || rawPeriod === '1시간' || rawPeriod === '60min') {
      period = '1h';
      periodLabel = '1시간';
      trId = 'ka10080';
      ticScope = '60';
      ttlMs = 45000;
    } else if (rawPeriod === 'day' || rawPeriod === '1d' || rawPeriod === '일' || rawPeriod === '일봉' || rawPeriod === '1d') {
      period = 'day';
      periodLabel = '일봉';
      trId = 'ka10081';
      ticScope = undefined;
      ttlMs = 60000; // 60s server cache for daily chart
    } else {
      // Unsupported period
      return {
        symbol,
        period: rawPeriod as any,
        periodLabel: periodInput,
        trId: 'NONE',
        supported: false,
        candles: [],
        source: 'kiwoom',
        cached: false,
        timestamp: Date.now(),
        error: `키움 Open API에서 지원하지 않는 차트 주기입니다: '${periodInput}' (지원 주기: 1분, 5분, 15분, 30분, 1시간, 일봉)`,
      };
    }

    // 1. Check Server-Side Cache (Requirement 10)
    const cacheKey = `chart_${symbol}_${period}`;
    const cached = this.chartServerCache.get(cacheKey);
    const now = Date.now();
    if (cached && now < cached.expiresAt) {
      // Re-align cached candles with real-time price if available
      let candles = [...cached.data.candles];
      if (currentPrice && currentPrice > 0 && candles.length > 0) {
        const last = { ...candles[candles.length - 1] };
        last.close = currentPrice;
        if (currentPrice > last.high) last.high = currentPrice;
        if (currentPrice < last.low) last.low = currentPrice;
        candles[candles.length - 1] = last;
      }
      return {
        ...cached.data,
        cached: true,
        currentPrice: currentPrice || cached.data.currentPrice,
        lastCandleClose: candles.length > 0 ? candles[candles.length - 1].close : undefined,
        candles,
      };
    }

    // 2. Inquire Real Kiwoom Open API Data
    try {
      let candles: CandleData[] = [];
      if (trId === 'ka10080' && ticScope) {
        candles = await this.fetchStockMinuteCandles(symbol, ticScope);
      } else if (trId === 'ka10081') {
        candles = await this.fetchStockDailyCandles(symbol);
      }

      // Requirement 4: Align last candle close with current live price
      if (currentPrice && currentPrice > 0 && candles.length > 0) {
        const last = { ...candles[candles.length - 1] };
        last.close = currentPrice;
        if (currentPrice > last.high) last.high = currentPrice;
        if (currentPrice < last.low) last.low = currentPrice;
        candles[candles.length - 1] = last;
      }

      const response: KiwoomChartResponse = {
        symbol,
        period,
        periodLabel,
        trId,
        ticScope,
        supported: true,
        candles,
        currentPrice,
        lastCandleClose: candles.length > 0 ? candles[candles.length - 1].close : undefined,
        source: 'kiwoom',
        cached: false,
        timestamp: now,
        error: null,
      };

      // Store in Server Cache
      this.chartServerCache.set(cacheKey, {
        data: response,
        expiresAt: now + ttlMs,
      });

      return response;
    } catch (err: any) {
      console.error(`[Kiwoom API] 차트 조회 실패 (${trId}, ${period}):`, err.message);
      const errResponse: KiwoomChartResponse = {
        symbol,
        period,
        periodLabel,
        trId,
        ticScope,
        supported: true,
        candles: [],
        source: 'kiwoom',
        cached: false,
        timestamp: now,
        error: err.message || '키움 Open API 차트 데이터를 가져오지 못했습니다.',
        serverIp: this.publicServerIp,
      };

      // Cache error state for 5s to prevent hammering Kiwoom API on rapid clicks
      this.chartServerCache.set(cacheKey, {
        data: errResponse,
        expiresAt: now + 5000,
      });

      return errResponse;
    }
  }

  /**
   * 4-1. Inquire Stock 10-Level Order Book (국내주식 10단계 호가)
   * Kiwoom REST API Endpoint: /api/dostk/mrkcond (TR: ka10004)
   */
  public async fetchOrderBook(symbol: string): Promise<OrderBook> {
    const token = await this.getAccessToken();
    const url = `${this.config.baseUrl}/api/dostk/mrkcond`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=UTF-8',
        'authorization': `Bearer ${token}`,
        'appkey': this.config.appKey,
        'appsecret': this.config.appSecret,
        'api-id': 'ka10004',
      },
      body: JSON.stringify({ stk_cd: symbol }),
    });

    const data = await res.json();
    if (!res.ok || (data.return_code !== undefined && data.return_code !== 0 && data.return_code !== '0')) {
      throw new Error(`Kiwoom 호가 조회 실패: ${data.return_msg || res.status}`);
    }

    const currentPrice = Math.abs(parseInt(data.sel_fpr_bid || data.buy_fpr_bid, 10)) || 0;
    const prevClose = currentPrice;

    const asks: OrderBookLevel[] = [];
    // 10 levels of asks (매도 10 -> 1)
    for (let i = 10; i >= 1; i--) {
      const priceKey = i === 1 ? 'sel_fpr_bid' : `sel_${i}th_pre_bid`;
      const volKey = i === 1 ? 'sel_fpr_req' : `sel_${i}th_pre_req`;
      const askPrice = Math.abs(parseInt(data[priceKey], 10)) || 0;
      const vol = Math.abs(parseInt(data[volKey], 10)) || 0;
      const chg = prevClose > 0 && askPrice > 0 ? askPrice - prevClose : 0;
      const chgPct = prevClose > 0 && askPrice > 0 ? Number(((chg / prevClose) * 100).toFixed(2)) : 0;
      asks.push({
        price: askPrice,
        volume: vol,
        change: chg,
        changePercent: chgPct,
        barPercent: 0,
      });
    }

    const bids: OrderBookLevel[] = [];
    // 10 levels of bids (매수 1 -> 10)
    for (let i = 1; i <= 10; i++) {
      const priceKey = i === 1 ? 'buy_fpr_bid' : `buy_${i}th_pre_bid`;
      const volKey = i === 1 ? 'buy_fpr_req' : `buy_${i}th_pre_req`;
      const bidPrice = Math.abs(parseInt(data[priceKey], 10)) || 0;
      const vol = Math.abs(parseInt(data[volKey], 10)) || 0;
      const chg = prevClose > 0 && bidPrice > 0 ? bidPrice - prevClose : 0;
      const chgPct = prevClose > 0 && bidPrice > 0 ? Number(((chg / prevClose) * 100).toFixed(2)) : 0;
      bids.push({
        price: bidPrice,
        volume: vol,
        change: chg,
        changePercent: chgPct,
        barPercent: 0,
      });
    }

    const maxVol = Math.max(...asks.map(a => a.volume), ...bids.map(b => b.volume), 1);
    asks.forEach(a => a.barPercent = Math.min(100, Math.round((a.volume / maxVol) * 100)));
    bids.forEach(b => b.barPercent = Math.min(100, Math.round((b.volume / maxVol) * 100)));

    const totalAskVolume = Math.abs(parseInt(data.tot_sel_req, 10)) || asks.reduce((sum, a) => sum + a.volume, 0);
    const totalBidVolume = Math.abs(parseInt(data.tot_buy_req, 10)) || bids.reduce((sum, b) => sum + b.volume, 0);

    return {
      symbol,
      currentPrice,
      asks,
      bids,
      totalAskVolume,
      totalBidVolume,
    };
  }

  /**
   * 5. Complete Diagnostic Runner
   * Tests Token Issuance & 005930 (삼성전자) Inquiry
   */
  public async runDiagnostics(): Promise<KiwoomDiagnosticResult> {
    const result: KiwoomDiagnosticResult = {
      hasAppKey: !!this.config.appKey,
      hasAppSecret: !!this.config.appSecret,
      isMock: this.config.isMock,
      baseUrl: this.config.baseUrl,
      tokenTest: {
        attempted: false,
        success: false,
      },
    };

    if (!this.isConfigured()) {
      result.tokenTest = {
        attempted: true,
        success: false,
        error: '환경변수(KIWOOM_APP_KEY, KIWOOM_APP_SECRET)가 설정되지 않았습니다.',
      };
      return result;
    }

    result.tokenTest.attempted = true;
    try {
      const token = await this.getAccessToken();
      result.tokenTest.success = !!token;

      // Sample stock test with 005930 (삼성전자)
      result.sampleStockTest = {
        symbol: '005930',
        attempted: true,
        success: false,
      };

      try {
        const stockData = await this.fetchStockPrice('005930');
        result.sampleStockTest.success = true;
        result.sampleStockTest.stockData = stockData;
      } catch (stockErr: any) {
        result.sampleStockTest.error = stockErr.message;
      }
    } catch (err: any) {
      result.tokenTest.error = err.message;
    }

    return result;
  }

  // -------------------------------------------------------------
  // 6. Kiwoom WebSocket Real-time Execution Feed
  // -------------------------------------------------------------

  public isWsConnected(): boolean {
    return this.wsConnected && this.wsLoggedIn;
  }

  public getSubscribedSymbols(): string[] {
    return Array.from(this.subscribedSymbols);
  }

  public getSubscribedOrderBookSymbols(): string[] {
    return Array.from(this.subscribedOrderBookSymbols);
  }

  public onTick(listener: (tick: KiwoomRealtimeTick) => void): () => void {
    this.tickListeners.add(listener);
    return () => {
      this.tickListeners.delete(listener);
    };
  }

  public broadcastTick(tick: KiwoomRealtimeTick) {
    for (const listener of this.tickListeners) {
      try {
        listener(tick);
      } catch (e) {
        console.warn('[Kiwoom WS] Error in tick listener:', e);
      }
    }
  }

  public onOrderBook(listener: (ob: OrderBook) => void): () => void {
    this.orderBookListeners.add(listener);
    return () => {
      this.orderBookListeners.delete(listener);
    };
  }

  public broadcastOrderBook(ob: OrderBook) {
    for (const listener of this.orderBookListeners) {
      try {
        listener(ob);
      } catch (e) {
        console.warn('[Kiwoom WS] Error in orderBook listener:', e);
      }
    }
  }

  /**
   * Connect to Kiwoom WebSocket server (Server-side only)
   * Official URL: wss://api.kiwoom.com:10000/api/dostk/websocket
   * Protocol: LOGIN frame handshake -> REG subscription frame
   */
  public async connectWebSocket(): Promise<boolean> {
    if ((this.wsConnected && this.wsLoggedIn) || this.isConnectingWs) {
      return this.wsConnected && this.wsLoggedIn;
    }

    if (!this.isConfigured()) {
      return false;
    }

    this.isConnectingWs = true;

    try {
      const token = await this.getAccessToken();

      // Using global WebSocket if available (Node built-in)
      const WSConstructor = (globalThis as any).WebSocket;
      if (!WSConstructor) {
        console.warn('[Kiwoom WS] Global WebSocket not available in this Node runtime');
        this.isConnectingWs = false;
        return false;
      }

      console.log(`[Kiwoom WS] Connecting to ${this.config.wsUrl}...`);
      this.ws = new WSConstructor(this.config.wsUrl);

      this.ws.onopen = () => {
        console.log('[Kiwoom WS] Connection established. Sending LOGIN handshake...');
        this.wsConnected = true;
        this.isConnectingWs = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }

        // 1. Send LOGIN handshake frame
        try {
          const loginPacket = {
            trnm: 'LOGIN',
            token,
          };
          this.ws.send(JSON.stringify(loginPacket));
        } catch (err: any) {
          console.warn('[Kiwoom WS] Error sending LOGIN frame:', err.message);
        }
      };

      this.ws.onmessage = (event: any) => {
        this.handleWsMessage(event.data);
      };

      this.ws.onerror = (err: any) => {
        console.warn('[Kiwoom WS] WebSocket error:', err.message || err);
      };

      this.ws.onclose = (ev: any) => {
        console.log(`[Kiwoom WS] Connection closed (code=${ev.code}, reason=${ev.reason || 'none'}). Scheduling reconnection in 30s...`);
        this.wsConnected = false;
        this.wsLoggedIn = false;
        this.isConnectingWs = false;
        this.ws = null;
        this.scheduleReconnect(30000);
      };

      return true;
    } catch (err: any) {
      console.log('[Kiwoom WS] WebSocket connection notice:', err.message);
      this.isConnectingWs = false;
      this.scheduleReconnect(60000);
      return false;
    }
  }

  private scheduleReconnect(delayMs: number = 30000) {
    if (this.reconnectTimer || !this.isConfigured()) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket().catch(() => {});
    }, delayMs);
  }

  public subscribeStock(symbol: string) {
    if (this.subscribedSymbols.has(symbol)) {
      return; // Prevent duplicate subscriptions
    }
    this.subscribedSymbols.add(symbol);
    console.log(`[Kiwoom WS] Subscribed to symbol: ${symbol} (Total: ${this.subscribedSymbols.size})`);

    if (this.wsConnected && this.wsLoggedIn && this.ws) {
      this.sendSubscribePacket(symbol);
    } else {
      this.connectWebSocket().catch(() => {});
    }
  }

  public unsubscribeStock(symbol: string) {
    if (!this.subscribedSymbols.has(symbol)) return;
    this.subscribedSymbols.delete(symbol);
    console.log(`[Kiwoom WS] Unsubscribed from symbol: ${symbol}`);

    if (this.wsConnected && this.wsLoggedIn && this.ws) {
      this.sendUnsubscribePacket(symbol);
    }
  }

  private sendSubscribePacket(symbol: string) {
    if (!this.ws) return;
    try {
      const packet = {
        trnm: 'REG',
        grp_no: '1',
        refresh: '1',
        data: [
          {
            item: [symbol],
            type: ['0B'],
          },
        ],
      };
      this.ws.send(JSON.stringify(packet));
      console.log(`[Kiwoom WS] Sent REG (0B) packet for ${symbol}`);
    } catch (e) {
      console.warn(`[Kiwoom WS] Error sending subscribe packet for ${symbol}:`, e);
    }
  }

  private sendUnsubscribePacket(symbol: string) {
    if (!this.ws) return;
    try {
      const packet = {
        trnm: 'REMOVE',
        grp_no: '1',
        data: [
          {
            item: [symbol],
            type: ['0B'],
          },
        ],
      };
      this.ws.send(JSON.stringify(packet));
      console.log(`[Kiwoom WS] Sent REMOVE (0B) packet for ${symbol}`);
    } catch (e) {
      console.warn(`[Kiwoom WS] Error sending unsubscribe packet for ${symbol}:`, e);
    }
  }

  public subscribeOrderBook(symbol: string) {
    if (this.subscribedOrderBookSymbols.has(symbol)) {
      return; // Prevent duplicate subscriptions
    }
    this.subscribedOrderBookSymbols.add(symbol);
    console.log(`[Kiwoom WS] Subscribed to order book for symbol: ${symbol} (Total: ${this.subscribedOrderBookSymbols.size})`);

    if (this.wsConnected && this.wsLoggedIn && this.ws) {
      this.sendOrderBookSubscribePacket(symbol, '1');
    } else {
      this.connectWebSocket().catch(() => {});
    }
  }

  public unsubscribeOrderBook(symbol: string) {
    if (!this.subscribedOrderBookSymbols.has(symbol)) return;
    this.subscribedOrderBookSymbols.delete(symbol);
    console.log(`[Kiwoom WS] Unsubscribed from order book for symbol: ${symbol}`);

    if (this.wsConnected && this.wsLoggedIn && this.ws) {
      this.sendOrderBookSubscribePacket(symbol, '2');
    }
  }

  private sendOrderBookSubscribePacket(symbol: string, trType: '1' | '2' = '1') {
    if (!this.ws) return;
    try {
      const packet = trType === '1' ? {
        trnm: 'REG',
        grp_no: '1',
        refresh: '1',
        data: [
          {
            item: [symbol],
            type: ['0D'],
          },
        ],
      } : {
        trnm: 'REMOVE',
        grp_no: '1',
        data: [
          {
            item: [symbol],
            type: ['0D'],
          },
        ],
      };
      this.ws.send(JSON.stringify(packet));
      console.log(`[Kiwoom WS] Sent OrderBook packet (${trType === '1' ? 'REG' : 'REMOVE'}) for ${symbol}`);
    } catch (e) {
      console.warn(`[Kiwoom WS] Error sending orderbook packet (${trType}) for ${symbol}:`, e);
    }
  }

  private handleWsMessage(raw: any) {
    try {
      const text = typeof raw === 'string' ? raw : raw.toString();
      if (!text) return;

      // Handle JSON packets
      if (text.startsWith('{')) {
        const json = JSON.parse(text);

        // 1. LOGIN Response
        if (json.trnm === 'LOGIN') {
          if (json.return_code === 0) {
            this.wsLoggedIn = true;
            console.log('[Kiwoom WS] LOGIN handshake confirmed successfully!');
            // Register active execution symbol subscriptions
            for (const sym of this.subscribedSymbols) {
              this.sendSubscribePacket(sym);
            }
            // Register active order book symbol subscriptions
            for (const sym of this.subscribedOrderBookSymbols) {
              this.sendOrderBookSubscribePacket(sym, '1');
            }
          } else {
            console.warn('[Kiwoom WS] LOGIN Handshake Failed:', json.return_msg || json);
            this.wsLoggedIn = false;
          }
          return;
        }

        // 2. REG Response
        if (json.trnm === 'REG') {
          if (json.return_code === 0) {
            console.log('[Kiwoom WS] REG subscription confirmed successfully');
          } else {
            console.warn('[Kiwoom WS] REG subscription returned non-zero code:', json);
          }
          return;
        }

        // 3. Heartbeat / PINGPONG
        if (json.trnm === 'PING' || json.header?.tr_id === 'PINGPONG') {
          this.ws?.send(JSON.stringify({ trnm: 'PONG' }));
          return;
        }

        // 4. REAL-TIME DATA (trnm: 'REAL')
        if (json.trnm === 'REAL' && json.item && json.values) {
          const symbol = json.item;
          const vals = json.values;

          // Type 0B: Real-time Execution Price (체결가)
          if (json.type === '0B') {
            const price = Math.abs(parseInt(vals['10'], 10)) || 0;
            const change = parseInt(vals['11'], 10) || 0;
            const changePercent = parseFloat(vals['12']) || 0;
            const volume = parseInt(vals['13'], 10) || 0;
            const open = Math.abs(parseInt(vals['16'], 10)) || price;
            const high = Math.abs(parseInt(vals['17'], 10)) || price;
            const low = Math.abs(parseInt(vals['18'], 10)) || price;
            const time = vals['20'] || new Date().toTimeString().slice(0, 8);

            if (price > 0 && symbol) {
              const tick: KiwoomRealtimeTick = {
                symbol,
                price,
                change,
                changePercent,
                volume,
                open,
                high,
                low,
                time,
                source: 'KIWOOM_WS',
              };
              this.broadcastTick(tick);
            }
            return;
          }

          // Type 0D or 0A: Order Book (호가잔량)
          if (json.type === '0D' || json.type === '0A') {
            const asks: OrderBookLevel[] = [];
            for (let i = 10; i >= 1; i--) {
              const askPrice = Math.abs(parseInt(vals[String(40 + i)], 10)) || 0;
              const vol = Math.abs(parseInt(vals[String(60 + i)], 10)) || 0;
              asks.push({
                price: askPrice,
                volume: vol,
                change: 0,
                changePercent: 0,
                barPercent: 0,
              });
            }

            const bids: OrderBookLevel[] = [];
            for (let i = 1; i <= 10; i++) {
              const bidPrice = Math.abs(parseInt(vals[String(50 + i)], 10)) || 0;
              const vol = Math.abs(parseInt(vals[String(70 + i)], 10)) || 0;
              bids.push({
                price: bidPrice,
                volume: vol,
                change: 0,
                changePercent: 0,
                barPercent: 0,
              });
            }

            const maxVol = Math.max(...asks.map(a => a.volume), ...bids.map(b => b.volume), 1);
            asks.forEach(a => a.barPercent = Math.min(100, Math.round((a.volume / maxVol) * 100)));
            bids.forEach(b => b.barPercent = Math.min(100, Math.round((b.volume / maxVol) * 100)));

            const totalAskVolume = Math.abs(parseInt(vals['121'], 10)) || asks.reduce((sum, a) => sum + a.volume, 0);
            const totalBidVolume = Math.abs(parseInt(vals['125'], 10)) || bids.reduce((sum, b) => sum + b.volume, 0);
            const currentPrice = bids[0]?.price || asks[asks.length - 1]?.price || 0;

            const orderBook: OrderBook = {
              symbol,
              currentPrice,
              asks,
              bids,
              totalAskVolume,
              totalBidVolume,
            };
            this.broadcastOrderBook(orderBook);
            return;
          }
        }

        return;
      }

      // Legacy pipe-delimited format fallback
      const parts = text.split('|');
      if (parts.length >= 4 && parts[1] === 'H0STCNT0') {
        const body = parts[3];
        const fields = body.split('^');
        const symbol = fields[0];
        const time = fields[1] || new Date().toTimeString().slice(0, 8);
        const price = Math.abs(parseInt(fields[2], 10)) || 0;
        const change = parseInt(fields[4], 10) || 0;
        const changePercent = parseFloat(fields[5]) || 0;
        const volume = parseInt(fields[12], 10) || 0;
        const open = Math.abs(parseInt(fields[7], 10)) || price;
        const high = Math.abs(parseInt(fields[8], 10)) || price;
        const low = Math.abs(parseInt(fields[9], 10)) || price;

        if (price > 0 && symbol) {
          const tick: KiwoomRealtimeTick = {
            symbol,
            price,
            change,
            changePercent,
            volume,
            open,
            high,
            low,
            time,
            source: 'KIWOOM_WS',
          };
          this.broadcastTick(tick);
        }
      } else if (parts.length >= 4 && parts[1] === 'H0STASP0') {
        const body = parts[3];
        const fields = body.split('^');
        const symbol = fields[0];
        if (symbol) {
          const asks: OrderBookLevel[] = [];
          for (let i = 10; i >= 1; i--) {
            const askPrice = Math.abs(parseInt(fields[2 + i], 10)) || 0;
            const vol = Math.abs(parseInt(fields[22 + i], 10)) || 0;
            asks.push({
              price: askPrice,
              volume: vol,
              change: 0,
              changePercent: 0,
              barPercent: 0,
            });
          }

          const bids: OrderBookLevel[] = [];
          for (let i = 1; i <= 10; i++) {
            const bidPrice = Math.abs(parseInt(fields[12 + i], 10)) || 0;
            const vol = Math.abs(parseInt(fields[32 + i], 10)) || 0;
            bids.push({
              price: bidPrice,
              volume: vol,
              change: 0,
              changePercent: 0,
              barPercent: 0,
            });
          }

          const maxVol = Math.max(...asks.map(a => a.volume), ...bids.map(b => b.volume), 1);
          asks.forEach(a => a.barPercent = Math.min(100, Math.round((a.volume / maxVol) * 100)));
          bids.forEach(b => b.barPercent = Math.min(100, Math.round((b.volume / maxVol) * 100)));

          const totalAskVolume = Math.abs(parseInt(fields[43], 10)) || asks.reduce((sum, a) => sum + a.volume, 0);
          const totalBidVolume = Math.abs(parseInt(fields[44], 10)) || bids.reduce((sum, b) => sum + b.volume, 0);
          const currentPrice = bids[0]?.price || asks[asks.length - 1]?.price || 0;

          const orderBook: OrderBook = {
            symbol,
            currentPrice,
            asks,
            bids,
            totalAskVolume,
            totalBidVolume,
          };

          this.broadcastOrderBook(orderBook);
        }
      }
    } catch (e) {
      console.warn('[Kiwoom WS] Parse error:', e);
    }
  }

  /**
   * Diagnostic test for WebSocket connection, LOGIN, and 005930 REG
   */
  public async testWebSocketLive(symbol: string = '005930'): Promise<{
    wsConnected: boolean;
    loginSuccess: boolean;
    regSuccess: boolean;
  }> {
    const WSConstructor = (globalThis as any).WebSocket;
    if (!WSConstructor) {
      return { wsConnected: false, loginSuccess: false, regSuccess: false };
    }

    try {
      const token = await this.getAccessToken();
      const wsUrl = this.config.wsUrl;

      return await new Promise((resolve) => {
        let wsConnected = false;
        let loginSuccess = false;
        let regSuccess = false;

        const ws = new WSConstructor(wsUrl);

        const timer = setTimeout(() => {
          try { ws.close(); } catch {}
          resolve({ wsConnected, loginSuccess, regSuccess });
        }, 7000);

        ws.onopen = () => {
          wsConnected = true;
          ws.send(JSON.stringify({ trnm: 'LOGIN', token }));
        };

        ws.onmessage = (event: any) => {
          try {
            const json = JSON.parse(event.data);
            if (json.trnm === 'LOGIN' && json.return_code === 0) {
              loginSuccess = true;
              ws.send(JSON.stringify({
                trnm: 'REG',
                grp_no: '1',
                refresh: '1',
                data: [{ item: [symbol], type: ['0B'] }]
              }));
            } else if (json.trnm === 'REG' && json.return_code === 0) {
              regSuccess = true;
              clearTimeout(timer);
              try { ws.close(); } catch {}
              resolve({ wsConnected, loginSuccess, regSuccess });
            }
          } catch {}
        };

        ws.onerror = () => {};
        ws.onclose = () => {
          clearTimeout(timer);
          resolve({ wsConnected, loginSuccess, regSuccess });
        };
      });
    } catch {
      return { wsConnected: false, loginSuccess: false, regSuccess: false };
    }
  }
}

export const kiwoomApiService = new KiwoomApiService();
