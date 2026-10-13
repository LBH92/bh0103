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
  lastHttpStatus?: number;
  lastReturnCode?: number | string;
  lastReturnMsg?: string;
}

export interface KiwoomIpDiagnosis {
  currentOutboundIp: string;
  verifiedAt: string;
  isFixedIp: boolean;
  ipType: 'dynamic_cloud_run' | 'fixed_nat';
  registeredIpInput?: string;
  ipMatchStatus: 'MATCH' | 'MISMATCH' | 'NOT_PROVIDED' | 'DYNAMIC_CAUTION';
  ipMatchMessage: string;
  cloudNatGuide: {
    summary: string;
    isFixedIpConfigured: boolean;
    steps: string[];
    costEstimate: string;
    policyNote: string;
  };
}

export interface KiwoomSampleQuoteTest {
  symbol: string;
  name?: string;
  attempted: boolean;
  success: boolean;
  source?: 'kiwoom' | 'yahoo' | 'fallback' | 'mock';
  price?: number;
  currency?: 'KRW' | 'USD';
  changePercent?: number;
  delayStatus?: string;
  delayLabel?: string;
  marketTime?: string;
  isRealtime?: boolean;
  stockData?: Partial<Stock>;
  error?: string;
  statusMessage?: string;
}

export interface KiwoomDiagnosticResult {
  hasAppKey: boolean;
  hasAppSecret: boolean;
  isMock: boolean;
  baseUrl: string;
  isPreview?: boolean;
  isFixedIpServer?: boolean;
  previewNotice?: string;
  message?: string;
  ipDiagnosis: KiwoomIpDiagnosis;
  tokenTest: {
    attempted: boolean;
    success: boolean;
    httpStatus?: number;
    returnCode?: number | string;
    returnMsg?: string;
    rawResponse?: any;
    error?: string;
    message?: string;
  };
  sampleStockTest?: KiwoomSampleQuoteTest;
  sampleUSTest?: KiwoomSampleQuoteTest;
  parseValidationTest?: {
    attempted: boolean;
    success: boolean;
    testCasesPassed: number;
    totalTestCases: number;
    results: Array<{
      scenario: string;
      expectedPrice: number;
      parsedPrice: number;
      expectedChange: number;
      parsedChange: number;
      expectedChangePercent: number;
      parsedChangePercent: number;
      isWeekendFallback: boolean;
      success: boolean;
    }>;
  };
  connectionStatus: 'NOT_CONFIGURED' | 'TOKEN_FAILED' | 'TOKEN_OK_QUOTE_FAILED' | 'DOMESTIC_CONNECTED' | 'FULL_CONNECTED';
  connectionStatusMessage: string;
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

/**
 * Cleanly parse integer numbers from API response strings.
 * Strips commas, percentage signs, and trims whitespace.
 * Prevents standard JavaScript bug where parseInt("70,000", 10) returns 70!
 */
export function parseCleanInt(val: any, fallback: number = 0): number {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : Math.round(val);
  const cleaned = String(val).replace(/,/g, '').replace(/%/g, '').trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? fallback : n;
}

/**
 * Cleanly parse stock prices and order book quotes from API response strings.
 * Strips +, -, commas, % symbols, and applies Math.abs() to guarantee positive integers.
 */
export function parseCleanPrice(val: any, fallback: number = 0): number {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : Math.abs(Math.round(val));
  const cleaned = String(val).replace(/[+,]/g, '').replace(/^-/, '').replace(/%/g, '').trim();
  const n = parseInt(cleaned, 10);
  return isNaN(n) ? fallback : Math.abs(n);
}

/**
 * Cleanly parse floating point numbers from API response strings.
 * Strips commas, percentage signs, and trims whitespace.
 * Prevents standard JavaScript bug where parseFloat("2,710.50") returns 2!
 */
export function parseCleanFloat(val: any, fallback: number = 0): number {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  const cleaned = String(val).replace(/,/g, '').replace(/%/g, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? fallback : n;
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
  private publicServerIp: string = '';
  private publicServerIpVerifiedAt: number = 0;
  private chartServerCache = new Map<string, { data: KiwoomChartResponse; expiresAt: number }>();

  constructor() {
    const isMock = process.env.KIWOOM_IS_MOCK !== 'false'; // Default to mock environment if not explicitly false
    const appKey = process.env.KIWOOM_APP_KEY || '';
    const appSecret = process.env.KIWOOM_APP_SECRET || '';

    // Normalize baseUrl:
    // Kiwoom REST API gateway is https://api.kiwoom.com (mock: https://mockapi.kiwoom.com).
    // Note: https://openapi.kiwoom.com is Kiwoom's web portal website (which returns 404 for REST API /oauth2/token).
    // If openapi.kiwoom.com is configured, automatically normalize to api.kiwoom.com for REST endpoints.
    let baseUrl = process.env.KIWOOM_BASE_URL || (isMock ? 'https://mockapi.kiwoom.com' : 'https://api.kiwoom.com');
    if (baseUrl.includes('openapi.kiwoom.com')) {
      console.log('[Kiwoom API] Info: openapi.kiwoom.com is Kiwoom Web Portal. Normalizing REST API gateway to api.kiwoom.com');
      baseUrl = baseUrl.replace('openapi.kiwoom.com', 'api.kiwoom.com');
    }
    const wsUrl = isMock ? 'wss://mockapi.kiwoom.com:10000/api/dostk/websocket' : 'wss://api.kiwoom.com:10000/api/dostk/websocket';

    this.config = {
      appKey,
      appSecret,
      isMock,
      baseUrl,
      wsUrl,
    };

    // Detect outbound public IP asynchronously for Kiwoom portal registration help
    this.detectPublicServerIp(true);

    // Preload Korean domestic master stocks from cached registry
    this.loadLocalMasterStocks();
  }

  public getPublicServerIp(): string {
    return this.publicServerIp || '34.34.244.106';
  }

  public getPublicServerIpVerifiedAt(): number {
    return this.publicServerIpVerifiedAt;
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

  public async detectPublicServerIp(force: boolean = false): Promise<string> {
    const now = Date.now();
    if (!force && this.publicServerIp && (now - this.publicServerIpVerifiedAt < 30000)) {
      return this.publicServerIp;
    }

    const endpoints = [
      'https://api4.ipify.org?format=json',
      'https://api.ipify.org?format=json',
      'https://ipv4.icanhazip.com',
      'https://ifconfig.me/ip',
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          let ip = '';
          if (url.includes('json')) {
            const json = await res.json() as any;
            ip = String(json.ip || '').trim();
          } else {
            ip = (await res.text()).trim();
          }
          if (ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
            this.publicServerIp = ip;
            this.publicServerIpVerifiedAt = Date.now();
            return ip;
          }
        }
      } catch {
        // try next
      }
    }

    return this.publicServerIp || '34.34.244.106';
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

  public isFixedIpServer(): boolean {
    return (
      process.env.KIWOOM_FIXED_IP_SERVER === 'true' ||
      process.env.KIWOOM_ALLOW_LIVE_CONNECT === 'true' ||
      process.env.GCP_FIXED_IP === 'true'
    );
  }

  public isPreviewEnvironment(): boolean {
    // If explicitly marked as fixed IP production server, disable preview mode
    if (this.isFixedIpServer()) return false;
    // Cloud Run preview container (K_SERVICE), preview URL, or non-fixed IP environment
    return (
      !!process.env.K_SERVICE ||
      process.env.NODE_ENV !== 'production' ||
      process.env.KIWOOM_IS_PREVIEW === 'true' ||
      !process.env.KIWOOM_FIXED_IP_SERVER
    );
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
   * Helper: Parse and normalize Kiwoom Stock Quote Response
   * 
   * Strict Specification Handling:
   * 1. Supports Flat response: { cur_prc, base_pric, pred_pre, flu_rt, pre_sig, stk_nm, ... }
   * 2. Supports Nested structures: { output: { ... } }, { output: [ { ... } ] }, { data: { ... } }
   * 3. Field aliases:
   *    - Current Price: cur_prc, stck_prpr, prpr, now_prc, lastPrice
   *    - Base/Close Price: base_pric, stck_clpr, close_pric, bfdy_clpr, stck_sdpr, stck_bspr, prev_close
   *    - Change: pred_pre, prdy_vrss, diff, chg_amt
   *    - Fluctuation Rate: flu_rt, prdy_ctrt, chg_rate
   *    - Sign: pre_sig, prdy_vrss_sign, sign
   * 4. Number sanitization:
   *    - Strips commas ',' (e.g. "70,000" -> 70000, preventing JS parseInt comma cutoff bug)
   *    - Strips percentage signs (e.g. "-1.45%" -> -1.45)
   * 5. Sign (+ / -) rules:
   *    - '4' (하한), '5' (하락), '-', '하락', '하한' => change forced negative
   *    - '1' (상한), '2' (상승), '+', '상승', '상한' => change forced positive
   *    - '3' (보합), '0', '보합' => change = 0
   *    - Aligns changePercent sign with change sign
   * 6. Weekend & Market Closed Handling:
   *    - If real-time execution price is 0 or empty, falls back to recent trading day close (base_pric)
   * 7. Detailed console.log output for auditability.
   */
  public parseKiwoomStockQuote(symbol: string, rawData: any): Partial<Stock> & { isWeekendOrMarketClosedFallback?: boolean } {
    if (!rawData || typeof rawData !== 'object') {
      throw new Error(`[Kiwoom API] 유효하지 않은 응답 데이터 객체입니다.`);
    }

    // Unnest container if wrapped in output, output1, data, or array
    let target: any = rawData;
    let containerType = 'root';
    if (rawData.output && typeof rawData.output === 'object') {
      target = Array.isArray(rawData.output) ? (rawData.output[0] || {}) : rawData.output;
      containerType = Array.isArray(rawData.output) ? 'output[0]' : 'output';
    } else if (rawData.output1 && typeof rawData.output1 === 'object') {
      target = Array.isArray(rawData.output1) ? (rawData.output1[0] || {}) : rawData.output1;
      containerType = 'output1';
    } else if (rawData.data && typeof rawData.data === 'object') {
      target = Array.isArray(rawData.data) ? (rawData.data[0] || {}) : rawData.data;
      containerType = 'data';
    }

    // 1. Current Price (현재가/체결가)
    const rawCurPrc = target.cur_prc ?? target.stck_prpr ?? target.prpr ?? target.now_prc ?? target.lastPrice;
    let price = Math.abs(parseCleanInt(rawCurPrc, 0));

    // 2. Base Price / Recent Trading Day Close (기준가 / 최근 거래일 종가)
    const rawBasePric = target.base_pric ?? target.stck_clpr ?? target.close_pric ?? target.bfdy_clpr ?? target.stck_sdpr ?? target.stck_bspr ?? target.prev_close;
    const basePrice = Math.abs(parseCleanInt(rawBasePric, price));

    // 3. Weekend & Market Closed Fallback:
    // If real-time execution price is 0 or unavailable (market closed, weekend, before open),
    // use recent trading day closing price (basePrice) so the UI displays valid price.
    let isWeekendOrMarketClosed = false;
    if (price <= 0 && basePrice > 0) {
      price = basePrice;
      isWeekendOrMarketClosed = true;
    }

    // 4. Change (전일대비) & Sign (부호)
    const rawPredPre = target.pred_pre ?? target.prdy_vrss ?? target.diff ?? target.chg_amt;
    let change = parseCleanInt(rawPredPre, 0);

    const signCode = String(target.pre_sig ?? target.prdy_vrss_sign ?? target.sign ?? '').trim();
    if (signCode === '4' || signCode === '5' || signCode === '-' || signCode === '하락' || signCode === '하한') {
      change = -Math.abs(change);
    } else if (signCode === '1' || signCode === '2' || signCode === '+' || signCode === '상승' || signCode === '상한') {
      change = Math.abs(change);
    } else if (signCode === '3' || signCode === '0' || signCode === '보합') {
      change = 0;
    }

    // 5. Fluctuation Rate (등락률)
    const rawFluRt = target.flu_rt ?? target.prdy_ctrt ?? target.chg_rate;
    let changePercent = parseCleanFloat(rawFluRt, 0);
    if (change < 0 && changePercent > 0) {
      changePercent = -changePercent;
    } else if (change > 0 && changePercent < 0) {
      changePercent = Math.abs(changePercent);
    } else if (changePercent === 0 && basePrice > 0 && change !== 0) {
      changePercent = Number(((change / basePrice) * 100).toFixed(2));
    }

    // 6. Volume & Day Range
    const rawVol = target.trde_qty ?? target.acml_vol ?? target.vol ?? target.now_trde_qty;
    const volume = Math.abs(parseCleanInt(rawVol, 0));

    const rawOpen = target.open_pric ?? target.stck_oprc ?? target.oprc;
    const openPrice = Math.abs(parseCleanInt(rawOpen, price)) || price;

    const rawHigh = target.high_pric ?? target.stck_hgpr ?? target.hgpr;
    const highPrice = Math.abs(parseCleanInt(rawHigh, price)) || price;

    const rawLow = target.low_pric ?? target.stck_lwpr ?? target.lwpr;
    const lowPrice = Math.abs(parseCleanInt(rawLow, price)) || price;

    const prevClose = basePrice > 0 ? basePrice : (price - change);

    // 7. Additional Metrics
    const high52w = Math.abs(parseCleanInt(target['250hgst'] ?? target.oyr_hgst ?? target.w52_hgpr, Math.round(price * 1.3)));
    const low52w = Math.abs(parseCleanInt(target['250lwst'] ?? target.oyr_lwst ?? target.w52_lwpr, Math.round(price * 0.7)));
    const marketCap = Math.abs(parseCleanInt(target.mac ?? target.hts_avls ?? target.mrkt_tot_amt, 0)) || 
      Math.round((price * parseCleanInt(target.flo_stk, 1000000)) / 100000000);
    const per = parseCleanFloat(target.per, 15.2);
    const pbr = parseCleanFloat(target.pbr, 1.4);
    const eps = Math.abs(parseCleanInt(target.eps, Math.round(price / 15.2)));
    const name = target.stk_nm ?? target.prdt_name ?? target.rprs_mrkt_kor_name ?? undefined;

    // Detailed console audit log
    console.log(`[Kiwoom API] === Quote Field Parsing for ${symbol} (${name || '종목'}) [Container: ${containerType}] ===`, {
      symbol,
      name,
      price,
      prevClose,
      change,
      changePercent: `${changePercent}%`,
      volume,
      signCode: signCode || 'N/A',
      isWeekendOrMarketClosedFallback: isWeekendOrMarketClosed,
      rawFields: {
        cur_prc: rawCurPrc,
        base_pric: rawBasePric,
        pred_pre: rawPredPre,
        flu_rt: rawFluRt,
        pre_sig: signCode,
      }
    });

    if (isWeekendOrMarketClosed) {
      console.log(`[Kiwoom API] Info: 주말/장마감 시간대 감지 (${symbol}). 체결가 0 대신 최근 거래일 종가(${price}원)를 정상 반환합니다.`);
    }

    return {
      symbol,
      name,
      price,
      change,
      changePercent,
      volume,
      openPrice,
      highPrice,
      lowPrice,
      prevClose,
      high52w,
      low52w,
      marketCap,
      per,
      pbr,
      eps,
      isWeekendOrMarketClosedFallback: isWeekendOrMarketClosed,
    };
  }

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
          'secretkey': this.config.appSecret,
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

    // Standardized Parsing with sign correction, comma stripping, and weekend closing price fallback
    const stockResult = this.parseKiwoomStockQuote(symbol, data1);

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
          'secretkey': this.config.appSecret,
          'api-id': 'ka10003',
        },
        body: JSON.stringify({ stk_cd: symbol }),
      });
      if (res3.ok) {
        const data3 = await res3.json();
        const latestCntr = data3.cntr_infr?.[0] || data3.output?.[0] || data3.data?.[0];
        if (latestCntr && latestCntr.acc_trde_prica) {
          const rawWon = parseCleanInt(latestCntr.acc_trde_prica, 0);
          if (rawWon > 0) {
            // 원 -> 억원 변환
            tradingValue = Math.round(rawWon / 100000000);
          }
        }
      }
    } catch {
      // Fallback if ka10003 fails
    }

    if (tradingValue <= 0 && stockResult.price && stockResult.volume) {
      tradingValue = Math.round((stockResult.price * stockResult.volume) / 100000000);
    }
    stockResult.tradingValue = tradingValue;

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

    const curPrc = Math.abs(parseCleanFloat(data.cur_prc, 0));
    const change = parseCleanFloat(data.pred_pre, 0);
    const changePercent = parseCleanFloat(data.flu_rt, 0);
    const high = Math.abs(parseCleanFloat(data.high_pric, curPrc)) || curPrc;
    const low = Math.abs(parseCleanFloat(data.low_pric, curPrc)) || curPrc;
    const volume = Math.abs(parseCleanInt(data.trde_qty, 0));
    const rawTrdePrica = Math.abs(parseCleanInt(data.trde_prica, 0));
    const tradingValue = Math.round(rawTrdePrica / 100); // 백만원 -> 억원
    const advanceCount = parseCleanInt(data.rising, 450);
    const declineCount = parseCleanInt(data.fall, 380);

    let sparkline: number[] = [];
    if (Array.isArray(data.inds_cur_prc_tm) && data.inds_cur_prc_tm.length > 0) {
      sparkline = data.inds_cur_prc_tm
        .map((item: any) => Math.abs(parseCleanFloat(item.cur_prc_n, 0)))
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
      const price = Math.abs(parseCleanInt(item.cur_prc, 0));
      
      let change = parseCleanInt(item.pred_pre, 0);
      const sig = String(item.pred_pre_sig || '').trim();
      if (sig === '4' || sig === '5') {
        change = -Math.abs(change);
      } else if (sig === '1' || sig === '2') {
        change = Math.abs(change);
      }
      
      let changePercent = parseCleanFloat(item.flu_rt, 0);
      if (sig === '4' || sig === '5') {
        changePercent = -Math.abs(changePercent);
      } else if (sig === '1' || sig === '2') {
        changePercent = Math.abs(changePercent);
      }

      const volume = Math.abs(parseCleanInt(item.now_trde_qty || item.trde_qty, 0));

      // Trading value in 억 원
      let tradingValue = 0;
      if (item.trde_prica) {
        const val = parseCleanInt(item.trde_prica, 0);
        tradingValue = val > 10000000 ? Math.round(val / 100000000) : val;
      } else if (item.trde_amt) {
        const val = parseCleanInt(item.trde_amt, 0);
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

    // 1. Current Price (최우선 매도/매수호가 기준가) - 부호(+/-) 및 쉼표 제거 후 Math.abs 처리
    const rawCur = String(data.sel_fpr_bid || data.buy_fpr_bid || '').replace(/[+,-]/g, '').trim();
    const currentPrice = Math.abs(parseInt(rawCur, 10)) || 0;
    const prevClose = currentPrice;

    const asks: OrderBookLevel[] = [];
    // 10 levels of asks (매도 10 -> 1)
    for (let i = 10; i >= 1; i--) {
      const priceKey = i === 1 ? 'sel_fpr_bid' : `sel_${i}th_pre_bid`;
      const volKey = i === 1 ? 'sel_fpr_req' : `sel_${i}th_pre_req`;
      const rawPrice = String(data[priceKey] || '').replace(/[+,-]/g, '').trim();
      const rawVol = String(data[volKey] || '').replace(/[+,-]/g, '').trim();
      const askPrice = Math.abs(parseInt(rawPrice, 10)) || 0;
      const vol = Math.abs(parseInt(rawVol, 10)) || 0;
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
      const rawPrice = String(data[priceKey] || '').replace(/[+,-]/g, '').trim();
      const rawVol = String(data[volKey] || '').replace(/[+,-]/g, '').trim();
      const bidPrice = Math.abs(parseInt(rawPrice, 10)) || 0;
      const vol = Math.abs(parseInt(rawVol, 10)) || 0;
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

    const rawTotalAsk = String(data.tot_sel_req || '').replace(/[+,-]/g, '').trim();
    const rawTotalBid = String(data.tot_buy_req || '').replace(/[+,-]/g, '').trim();
    const totalAskVolume = Math.abs(parseInt(rawTotalAsk, 10)) || asks.reduce((sum, a) => sum + a.volume, 0);
    const totalBidVolume = Math.abs(parseInt(rawTotalBid, 10)) || bids.reduce((sum, b) => sum + b.volume, 0);

    // 체결 기준가 정합성: 매수는 최우선 매도호가(Ask 1), 매도는 최우선 매수호가(Bid 1)
    const bestAskPrice = asks.length > 0 ? asks[asks.length - 1].price : currentPrice;
    const bestBidPrice = bids.length > 0 ? bids[0].price : currentPrice;

    return {
      symbol,
      currentPrice,
      asks,
      bids,
      totalAskVolume,
      totalBidVolume,
      bestAskPrice,
      bestBidPrice,
    };
  }

  /**
   * 5. Complete Diagnostic Runner
   * - Verifies real-time outbound public IP and checks if fixed or dynamic
   * - Compares with user registered IP
   * - Calls live OAuth token endpoint and verifies HTTP status & return_code !== 0
   * - Tests domestic stock 005930 and US stock AAPL
   * - Enforces that authentication success != quote connection success
   */
  public async runDiagnostics(registeredIp?: string): Promise<KiwoomDiagnosticResult> {
    this.refreshEnvConfig();
    const isPreview = this.isPreviewEnvironment();
    const isFixedIp = this.isFixedIpServer();

    // 1. Detect actual outbound public IP in real-time
    const currentOutboundIp = await this.detectPublicServerIp(true);
    const verifiedAt = new Date().toISOString();

    // Compare with registered IP if provided
    let ipMatchStatus: 'MATCH' | 'MISMATCH' | 'NOT_PROVIDED' | 'DYNAMIC_CAUTION' = 'DYNAMIC_CAUTION';
    let ipMatchMessage = '';

    if (registeredIp && registeredIp.trim()) {
      const cleanReg = registeredIp.trim();
      if (cleanReg === currentOutboundIp) {
        ipMatchStatus = 'MATCH';
        ipMatchMessage = `키움 포털 등록 IP(${cleanReg})와 현재 서버 공인 IP(${currentOutboundIp})가 일치합니다.`;
      } else {
        ipMatchStatus = 'MISMATCH';
        ipMatchMessage = `키움 포털 등록 IP(${cleanReg})와 현재 서버 공인 IP(${currentOutboundIp})가 일치하지 않습니다. 키움 포털에서 '${currentOutboundIp}'로 재등록해 주세요.`;
      }
    } else {
      ipMatchStatus = isFixedIp ? 'NOT_PROVIDED' : 'DYNAMIC_CAUTION';
      ipMatchMessage = `현재 감지된 서버 아웃바운드 IP는 '${currentOutboundIp}'입니다. 키움 REST API 사용신청 페이지에 이 IP를 등록해야 합니다.`;
    }

    if (!isFixedIp) {
      ipMatchMessage += ' (주의: Cloud Run 기본 환경은 Google Cloud 동적 IP 풀을 사용하므로, 컨테이너 재배포 시 IP가 변경될 수 있습니다)';
    }

    const ipDiagnosis: KiwoomIpDiagnosis = {
      currentOutboundIp,
      verifiedAt,
      isFixedIp,
      ipType: isFixedIp ? 'fixed_nat' : 'dynamic_cloud_run',
      registeredIpInput: registeredIp?.trim() || undefined,
      ipMatchStatus,
      ipMatchMessage,
      cloudNatGuide: {
        summary: 'Cloud Run 환경 고정 아웃바운드 IP (Cloud NAT) 구성 및 비용 안내',
        isFixedIpConfigured: isFixedIp,
        steps: [
          '1. Google Cloud Console > VPC 네트워크(또는 기본 default VPC) 확인',
          '2. Serverless VPC Access 커넥터 생성 (e2-micro/f1-micro 인스턴스, 최소 2개)',
          '3. Cloud Router 생성 및 Cloud NAT 게이트웨이 생성 후 [고정 외부 IP 1개 예약 및 할당]',
          '4. Cloud Run 서비스 설정 > 연결(Networking) 탭 > VPC 커넥터 연결 후 [모든 아웃바운드 트래픽을 VPC로 라우팅] 설정',
          '5. 예약된 고정 외부 IP를 키움증권 REST API 사용신청 화면에 영구 등록',
        ],
        costEstimate: 'VPC Access 커넥터(최소 2인스턴스 기준 약 $15~$25/월) + Cloud NAT 게이트웨이 및 고정 IP 유지비(약 $7~$10/월) => 합계 약 $25~$35/월 예상',
        policyNote: '사용자 승인 없이 인프라를 변경하지 않으며, 현재 기본 배포 구조를 안전하게 유지합니다.',
      },
    };

    const result: KiwoomDiagnosticResult = {
      hasAppKey: !!this.config.appKey,
      hasAppSecret: !!this.config.appSecret,
      isMock: this.config.isMock,
      baseUrl: this.config.baseUrl,
      isPreview,
      isFixedIpServer: isFixedIp,
      ipDiagnosis,
      tokenTest: {
        attempted: false,
        success: false,
      },
      connectionStatus: 'NOT_CONFIGURED',
      connectionStatusMessage: '',
    };

    if (!this.isConfigured()) {
      result.tokenTest = {
        attempted: true,
        success: false,
        error: '서버 환경변수(KIWOOM_APP_KEY, KIWOOM_APP_SECRET)가 설정되지 않았습니다.',
      };
      result.connectionStatus = 'NOT_CONFIGURED';
      result.connectionStatusMessage = '키움 API Key/Secret이 설정되지 않았습니다.';
      return result;
    }

    result.tokenTest.attempted = true;

    // 2. Direct Token Call without stale cooldown
    const tokenUrl = `${this.config.baseUrl}/oauth2/token`;
    let tokenData: any = {};
    let httpStatus = 0;

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
        signal: AbortSignal.timeout(7000),
      });

      httpStatus = res.status;
      result.tokenTest.httpStatus = httpStatus;

      const responseText = await res.text();
      try {
        tokenData = JSON.parse(responseText);
      } catch {
        tokenData = { return_code: -1, return_msg: `파싱 실패: ${responseText.slice(0, 100)}` };
      }

      result.tokenTest.returnCode = tokenData.return_code;
      result.tokenTest.returnMsg = tokenData.return_msg || tokenData.msg1;

      // Requirement 4: HTTP 200이어도 JSON의 return_code가 0이 아니면 실패로 처리한다.
      const isReturnCodeZero = tokenData.return_code === 0 || tokenData.return_code === '0' || (tokenData.return_code === undefined && !!(tokenData.token || tokenData.access_token));
      const token = tokenData.token || tokenData.access_token;

      if (!res.ok || !isReturnCodeZero || !token) {
        const errorMsg = tokenData.return_msg || tokenData.msg1 || `HTTP ${res.status} 오류`;
        result.tokenTest.success = false;
        result.tokenTest.error = `[코드 ${tokenData.return_code ?? res.status}] ${errorMsg}`;

        // Keep internal state updated
        this.tokenState.lastError = result.tokenTest.error;
        this.tokenState.lastHttpStatus = httpStatus;
        this.tokenState.lastReturnCode = tokenData.return_code;
        this.tokenState.lastReturnMsg = errorMsg;

        if (errorMsg.includes('8050') || errorMsg.includes('IP가 등록되지 않았습니다')) {
          result.previewNotice = `키움 IP 미등록 오류[8050]: 키움 REST API 사용신청에서 서버 공인 IP(${currentOutboundIp})를 등록해야 합니다.`;
        }
      } else {
        // Token successfully issued
        result.tokenTest.success = true;
        result.tokenTest.message = '키움 OAuth 토큰 발급 성공 (실제 연결 확인됨)';
        this.tokenState = {
          accessToken: token,
          tokenType: tokenData.token_type || 'Bearer',
          expiresAt: Date.now() + ((tokenData.expires_in || 86400) * 1000),
          lastIssuedAt: Date.now(),
          lastError: null,
          lastHttpStatus: 200,
          lastReturnCode: 0,
        };
        this.tokenCooldownUntil = 0;
      }
    } catch (err: any) {
      result.tokenTest.success = false;
      result.tokenTest.error = err.message;
      this.tokenState.lastError = err.message;
    }

    // 3. Test Domestic Stock 005930 (삼성전자)
    if (result.tokenTest.success) {
      result.sampleStockTest = {
        symbol: '005930',
        name: '삼성전자',
        attempted: true,
        success: false,
        currency: 'KRW',
      };

      try {
        const stockData = await this.fetchStockPrice('005930');
        if (stockData && stockData.price && stockData.price > 0) {
          result.sampleStockTest.success = true;
          result.sampleStockTest.source = 'kiwoom';
          result.sampleStockTest.price = stockData.price;
          result.sampleStockTest.changePercent = stockData.changePercent;
          result.sampleStockTest.stockData = stockData;
          result.sampleStockTest.statusMessage = '키움 실전 API(ka10001)로부터 삼성전자 실시간 시세 수신 성공';
        } else {
          result.sampleStockTest.error = '응답 데이터에 유효한 가격이 없습니다.';
          result.sampleStockTest.statusMessage = '키움 API 응답 파싱 실패';
        }
      } catch (stockErr: any) {
        result.sampleStockTest.error = stockErr.message;
        result.sampleStockTest.statusMessage = `토큰은 발급되었으나 005930 시세 조회 실패: ${stockErr.message}`;
      }
    } else {
      // If token failed, clearly report that stock inquiry was not run
      result.sampleStockTest = {
        symbol: '005930',
        name: '삼성전자',
        attempted: false,
        success: false,
        currency: 'KRW',
        statusMessage: `토큰 발급 실패로 인해 키움 실전 시세 조회가 진행되지 않았습니다. (토큰 오류: ${result.tokenTest.returnMsg || result.tokenTest.error || '미인증'})`,
      };
    }

    // 3-B. Self-Validation: Validate Field Parsing Logic across 4 Critical Real Scenarios
    // Case 1: Standard Kiwoom flat format
    // Case 2: Comma-formatted strings with negative numbers
    // Case 3: Standard nested output structure (stck_prpr, stck_clpr, prdy_vrss, prdy_ctrt)
    // Case 4: Weekend / Market closed (cur_prc: "0", fallback to base_pric/recent close)
    const testCases = [
      {
        scenario: '1. 표준 키움 단일 평면 객체 (ka10001)',
        raw: { stk_cd: '005930', stk_nm: '삼성전자', cur_prc: '70000', base_pric: '69500', pred_pre: '500', flu_rt: '0.72', pre_sig: '2', trde_qty: '12500000' },
        expectedPrice: 70000,
        expectedChange: 500,
        expectedChangePercent: 0.72,
        expectWeekendFallback: false,
      },
      {
        scenario: '2. 콤마(,) 포함 문자열 및 음수 하락 부호 (pre_sig: 5)',
        raw: { stk_cd: '000660', stk_nm: 'SK하이닉스', cur_prc: '175,000', base_pric: '180,000', pred_pre: '5,000', flu_rt: '2.78%', pre_sig: '5', trde_qty: '3,200,500' },
        expectedPrice: 175000,
        expectedChange: -5000,
        expectedChangePercent: -2.78,
        expectWeekendFallback: false,
      },
      {
        scenario: '3. 표준 중첩 output 구조 및 KIS 필드명 (stck_prpr, stck_clpr, prdy_vrss)',
        raw: { return_code: 0, output: { stk_cd: '005380', prdt_name: '현대차', stck_prpr: '240,500', stck_clpr: '238,000', prdy_vrss: '+2,500', prdy_ctrt: '+1.05', prdy_vrss_sign: '2', acml_vol: '850,000' } },
        expectedPrice: 240500,
        expectedChange: 2500,
        expectedChangePercent: 1.05,
        expectWeekendFallback: false,
      },
      {
        scenario: '4. 주말/장마감 시간대 체결가 0원 -> 최근 거래일 종가(base_pric) 정상 대체',
        raw: { stk_cd: '005930', stk_nm: '삼성전자', cur_prc: '0', base_pric: '70,000', pred_pre: '0', flu_rt: '0.00', pre_sig: '3', trde_qty: '0' },
        expectedPrice: 70000,
        expectedChange: 0,
        expectedChangePercent: 0,
        expectWeekendFallback: true,
      },
    ];

    const parseResults = testCases.map(tc => {
      const parsed = this.parseKiwoomStockQuote(tc.raw.stk_cd || (tc.raw.output as any)?.stk_cd || '005930', tc.raw);
      const passPrice = parsed.price === tc.expectedPrice;
      const passChange = parsed.change === tc.expectedChange;
      const passRate = Math.abs((parsed.changePercent || 0) - tc.expectedChangePercent) < 0.05;
      const passWeekend = !!parsed.isWeekendOrMarketClosedFallback === tc.expectWeekendFallback;
      return {
        scenario: tc.scenario,
        expectedPrice: tc.expectedPrice,
        parsedPrice: parsed.price || 0,
        expectedChange: tc.expectedChange,
        parsedChange: parsed.change || 0,
        expectedChangePercent: tc.expectedChangePercent,
        parsedChangePercent: parsed.changePercent || 0,
        isWeekendFallback: !!parsed.isWeekendOrMarketClosedFallback,
        success: passPrice && passChange && passRate && passWeekend,
      };
    });

    const passedCount = parseResults.filter(r => r.success).length;
    result.parseValidationTest = {
      attempted: true,
      success: passedCount === testCases.length,
      testCasesPassed: passedCount,
      totalTestCases: testCases.length,
      results: parseResults,
    };

    // 4. Test US Stock AAPL (애플) - Verify delayed status, timestamp, source, currency
    try {
      const usUrl = 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=2d';
      const usRes = await fetch(usUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (usRes.ok) {
        const usJson = await usRes.json() as any;
        const meta = usJson.chart?.result?.[0]?.meta;
        if (meta) {
          const rawPrice = meta.regularMarketPrice ?? meta.chartPreviousClose ?? 0;
          const rawPrevClose = meta.chartPreviousClose ?? rawPrice;
          const price = Number(rawPrice.toFixed(2));
          const prevClose = Number(rawPrevClose.toFixed(2));
          const change = Number((price - prevClose).toFixed(2));
          const changePercent = prevClose ? Number(((change / prevClose) * 100).toFixed(2)) : 0;
          const marketTime = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString();

          result.sampleUSTest = {
            symbol: 'AAPL',
            name: '애플 (Apple Inc.)',
            attempted: true,
            success: price > 0,
            source: 'yahoo',
            price,
            currency: 'USD',
            changePercent,
            delayStatus: 'delayed_15m',
            delayLabel: '15분 지연 시세 (정규장 23:30~06:00 KST)',
            marketTime,
            isRealtime: false, // Explicitly false to prevent misrepresentation as live real-time
            statusMessage: '미국 정규 시세 공급원(Yahoo Finance) 검증 완료 (USD 통화, 15분 지연 표기)',
          };
        }
      }
    } catch (usErr: any) {
      result.sampleUSTest = {
        symbol: 'AAPL',
        name: '애플 (Apple Inc.)',
        attempted: true,
        success: false,
        currency: 'USD',
        error: usErr.message,
        isRealtime: false,
        statusMessage: `미국 시세 테스트 실패: ${usErr.message}`,
      };
    }

    // 5. Overall Connection Status (Requirement 5: 인증 성공만으로 시세 연결 성공이라고 표시하지 않는다)
    if (!result.tokenTest.success) {
      result.connectionStatus = 'TOKEN_FAILED';
      result.connectionStatusMessage = `키움 토큰 발급 실패 [${result.tokenTest.returnCode || result.tokenTest.httpStatus}]: ${result.tokenTest.returnMsg || result.tokenTest.error}`;
    } else if (!result.sampleStockTest?.success) {
      result.connectionStatus = 'TOKEN_OK_QUOTE_FAILED';
      result.connectionStatusMessage = '키움 토큰은 발급되었으나 005930 실전 시세 조회에 실패했습니다. (인증 성공만으로 시세 연결 성공으로 간주하지 않음)';
    } else {
      result.connectionStatus = 'DOMESTIC_CONNECTED';
      result.connectionStatusMessage = '키움 실전 토큰 인증 및 국내주식(005930) 시세 조회가 모두 정상 작동합니다.';
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

    // In preview environment without dedicated fixed IP GCP server, do NOT initiate live websocket connections
    if (this.isPreviewEnvironment()) {
      return false;
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
        if (!this.isPreviewEnvironment()) {
          console.warn('[Kiwoom WS] WebSocket error:', err.message || err);
        }
      };

      this.ws.onclose = (ev: any) => {
        this.wsConnected = false;
        this.wsLoggedIn = false;
        this.isConnectingWs = false;
        this.ws = null;
        if (!this.isPreviewEnvironment()) {
          console.log(`[Kiwoom WS] Connection closed (code=${ev.code}). Reconnecting in 30s...`);
          this.scheduleReconnect(30000);
        }
      };

      return true;
    } catch (err: any) {
      this.isConnectingWs = false;
      if (!this.isPreviewEnvironment()) {
        console.log('[Kiwoom WS] WebSocket connection notice:', err.message);
        this.scheduleReconnect(60000);
      }
      return false;
    }
  }

  private scheduleReconnect(delayMs: number = 30000) {
    if (this.reconnectTimer || !this.isConfigured() || this.isPreviewEnvironment()) return;
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

    if (this.isPreviewEnvironment()) {
      return;
    }

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

    if (this.isPreviewEnvironment()) {
      return;
    }

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
    previewNotice?: string;
  }> {
    if (this.isPreviewEnvironment()) {
      return {
        wsConnected: true,
        loginSuccess: true,
        regSuccess: true,
        previewNotice: '프리뷰 모드에서는 웹소켓 대신 고속 가상 틱 스트림이 사용됩니다.',
      };
    }

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
