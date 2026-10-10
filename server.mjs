// server.ts
import "dotenv/config";
import express2 from "express";
import { createServer as createViteServer } from "vite";
import path2 from "path";
import { fileURLToPath } from "url";

// server/kiwoomApiService.ts
import fs from "fs";
import path from "path";
var KiwoomApiService = class {
  constructor() {
    this.tokenState = {
      accessToken: null,
      tokenType: "Bearer",
      expiresAt: 0,
      lastIssuedAt: null,
      lastError: null
    };
    this.tokenPromise = null;
    this.tokenCooldownUntil = 0;
    // WebSocket State & Listeners
    this.ws = null;
    this.wsConnected = false;
    this.wsLoggedIn = false;
    this.subscribedSymbols = /* @__PURE__ */ new Set();
    this.tickListeners = /* @__PURE__ */ new Set();
    this.subscribedOrderBookSymbols = /* @__PURE__ */ new Set();
    this.orderBookListeners = /* @__PURE__ */ new Set();
    this.reconnectTimer = null;
    this.isConnectingWs = false;
    this.masterStocks = [];
    this.masterStocksMap = /* @__PURE__ */ new Map();
    this.masterStocksLoaded = false;
    this.masterStocksLoadingPromise = null;
    const isMock = process.env.KIWOOM_IS_MOCK !== "false";
    const appKey = process.env.KIWOOM_APP_KEY || "";
    const appSecret = process.env.KIWOOM_APP_SECRET || "";
    const baseUrl = isMock ? "https://mockapi.kiwoom.com" : "https://api.kiwoom.com";
    const wsUrl = isMock ? "wss://mockapi.kiwoom.com:10000/api/dostk/websocket" : "wss://api.kiwoom.com:10000/api/dostk/websocket";
    this.config = {
      appKey,
      appSecret,
      isMock,
      baseUrl,
      wsUrl
    };
    this.loadLocalMasterStocks();
  }
  loadLocalMasterStocks() {
    if (this.masterStocks.length > 0) return;
    try {
      const filePath = path.join(process.cwd(), "server", "data", "krxMasterStocks.json");
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf8");
        const list = JSON.parse(raw);
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
    } catch (e) {
      console.log("[Kiwoom API] Note reading local master stocks:", e.message);
    }
  }
  getConfig() {
    return {
      appKey: this.config.appKey ? `${this.config.appKey.slice(0, 4)}****` : "",
      hasAppSecret: !!this.config.appSecret,
      isMock: this.config.isMock,
      baseUrl: this.config.baseUrl,
      wsUrl: this.config.wsUrl
    };
  }
  isConfigured() {
    const appKey = process.env.KIWOOM_APP_KEY || this.config.appKey;
    const appSecret = process.env.KIWOOM_APP_SECRET || this.config.appSecret;
    return !!(appKey && appSecret);
  }
  refreshEnvConfig() {
    this.config.appKey = process.env.KIWOOM_APP_KEY || this.config.appKey;
    this.config.appSecret = process.env.KIWOOM_APP_SECRET || this.config.appSecret;
    if (process.env.KIWOOM_IS_MOCK !== void 0) {
      this.config.isMock = process.env.KIWOOM_IS_MOCK !== "false";
      this.config.baseUrl = this.config.isMock ? "https://mockapi.kiwoom.com" : "https://api.kiwoom.com";
      this.config.wsUrl = this.config.isMock ? "wss://mockapi.kiwoom.com:10000/api/dostk/websocket" : "wss://api.kiwoom.com:10000/api/dostk/websocket";
    }
  }
  /**
   * 1. Issue or Refresh OAuth 2.0 Access Token
   */
  async getAccessToken() {
    this.refreshEnvConfig();
    if (!this.isConfigured()) {
      throw new Error("KIWOOM_APP_KEY \uB610\uB294 KIWOOM_APP_SECRET \uD658\uACBD\uBCC0\uC218\uAC00 \uC11C\uBC84\uC5D0 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
    }
    const now = Date.now();
    if (this.tokenState.accessToken && this.tokenState.expiresAt > now + 6e4) {
      return this.tokenState.accessToken;
    }
    if (now < this.tokenCooldownUntil && this.tokenState.lastError) {
      throw new Error(this.tokenState.lastError);
    }
    if (this.tokenPromise) {
      return this.tokenPromise;
    }
    const tokenUrl = `${this.config.baseUrl}/oauth2/token`;
    console.log(`[Kiwoom API] Requesting OAuth token from ${tokenUrl}...`);
    this.tokenPromise = (async () => {
      try {
        const res = await fetch(tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8"
          },
          body: JSON.stringify({
            grant_type: "client_credentials",
            appkey: this.config.appKey,
            secretkey: this.config.appSecret
          })
        });
        const responseText = await res.text();
        let data = {};
        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error(`Kiwoom \uD1A0\uD070 \uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328 (HTTP ${res.status}): ${responseText.slice(0, 200)}`);
        }
        if (!res.ok || data.return_code !== void 0 && data.return_code !== 0) {
          const errorMsg = data.return_msg || data.msg1 || `HTTP ${res.status} \uC624\uB958`;
          this.tokenState.lastError = `[${data.return_code || res.status}] ${errorMsg}`;
          this.tokenCooldownUntil = Date.now() + 6e4;
          if (errorMsg.includes("8050") || errorMsg.includes("IP\uAC00 \uB4F1\uB85D\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4")) {
            console.log(`[Kiwoom API] \uC2E4\uC804 API \uC811\uADFC \uC548\uB0B4: \uD0A4\uC6C0 REST API \uD648\uD398\uC774\uC9C0 > API \uC0AC\uC6A9\uC2E0\uCCAD\uC5D0\uC11C \uC11C\uBC84 \uACF5\uC778 IP \uB4F1\uB85D\uC774 \uD544\uC694\uD569\uB2C8\uB2E4. (\uBBF8\uB4F1\uB85D \uC2DC Yahoo/Mock fallback\uC73C\uB85C \uC548\uC804\uD558\uAC8C \uC11C\uBE59\uB429\uB2C8\uB2E4)`);
          } else {
            console.log(`[Kiwoom API] Token notice: ${errorMsg}`);
          }
          throw new Error(`\uD0A4\uC6C0 OAuth \uD1A0\uD070 \uBC1C\uAE09 \uC2E4\uD328 (${res.status}): ${errorMsg}`);
        }
        const token = data.token || data.access_token;
        if (!token) {
          throw new Error(`\uC751\uB2F5\uC5D0 access_token\uC774 \uB204\uB77D\uB418\uC5C8\uC2B5\uB2C8\uB2E4: ${responseText}`);
        }
        const expiresIn = data.expires_in || 86400;
        this.tokenState = {
          accessToken: token,
          tokenType: data.token_type || "Bearer",
          expiresAt: now + expiresIn * 1e3,
          lastIssuedAt: now,
          lastError: null
        };
        this.tokenCooldownUntil = 0;
        console.log(`[Kiwoom API] OAuth token successfully issued. Expires in ${expiresIn}s.`);
        return token;
      } catch (err) {
        this.tokenState.lastError = err.message;
        this.tokenCooldownUntil = Date.now() + 6e4;
        throw err;
      } finally {
        this.tokenPromise = null;
      }
    })();
    return this.tokenPromise;
  }
  /**
   * Fetch Domestic Stock Master List (KOSPI mrkt_tp: '0', KOSDAQ mrkt_tp: '10')
   * Kiwoom REST API Endpoint: /api/dostk/stkinfo (TR: ka10099)
   */
  async fetchStockMasterList(forceRefresh = false) {
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
            method: "POST",
            headers: {
              "Content-Type": "application/json;charset=UTF-8",
              "authorization": `Bearer ${token}`,
              "appkey": this.config.appKey,
              "appsecret": this.config.appSecret,
              "api-id": "ka10099"
            },
            body: JSON.stringify({ mrkt_tp: "0" })
          }),
          fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json;charset=UTF-8",
              "authorization": `Bearer ${token}`,
              "appkey": this.config.appKey,
              "appsecret": this.config.appSecret,
              "api-id": "ka10099"
            },
            body: JSON.stringify({ mrkt_tp: "10" })
          })
        ]);
        const kospiData = await kospiRes.json();
        const kosdaqData = await kosdaqRes.json();
        const all = [];
        const map = /* @__PURE__ */ new Map();
        const processList = (list, market) => {
          if (!Array.isArray(list)) return;
          for (const item of list) {
            if (!item.code || !item.name) continue;
            const price = Math.abs(parseInt(item.lastPrice, 10)) || 0;
            const listCount = parseInt(item.listCount, 10) || 0;
            const marketCap = Math.round(price * listCount / 1e8);
            const stock = {
              code: item.code,
              name: item.name,
              market,
              sector: item.upName || "\uAE30\uD0C0",
              lastPrice: price,
              listCount,
              marketCap
            };
            all.push(stock);
            map.set(item.code, stock);
          }
        };
        processList(kospiData.list, "KOSPI");
        processList(kosdaqData.list, "KOSDAQ");
        if (all.length > 0) {
          this.masterStocks = all;
          this.masterStocksMap = map;
          this.masterStocksLoaded = true;
          console.log(`[Kiwoom API] Loaded ${all.length} master stocks from Kiwoom REST API (KOSPI: ${kospiData.list?.length || 0}, KOSDAQ: ${kosdaqData.list?.length || 0})`);
          try {
            const filePath = path.join(process.cwd(), "server", "data", "krxMasterStocks.json");
            fs.writeFileSync(filePath, JSON.stringify(all, null, 2), "utf8");
          } catch {
          }
        }
        return this.masterStocks;
      } catch (err) {
        console.log("[Kiwoom API] Master stocks load notice (using cached registry):", err.message);
        return this.masterStocks;
      } finally {
        this.masterStocksLoadingPromise = null;
      }
    })();
    return this.masterStocksLoadingPromise;
  }
  getMasterStocks() {
    return this.masterStocks;
  }
  getMasterStock(symbol) {
    return this.masterStocksMap.get(symbol);
  }
  getMasterStockCounts() {
    const kospi = this.masterStocks.filter((s) => s.market === "KOSPI").length;
    const kosdaq = this.masterStocks.filter((s) => s.market === "KOSDAQ").length;
    return {
      total: this.masterStocks.length,
      kospi,
      kosdaq
    };
  }
  /**
   * 2. Inquire Stock Current Price (주식기본정보 & 체결정보)
   * Kiwoom REST API Endpoint: /api/dostk/stkinfo
   * TR: ka10001 (기본정보: 현재가, 전일대비, 등락률, 시가, 고가, 저가, 거래량, 시총 등)
   * TR: ka10003 (체결정보: acc_trde_prica 원 단위 거래대금)
   */
  async fetchStockPrice(symbol) {
    const token = await this.getAccessToken();
    const url = `${this.config.baseUrl}/api/dostk/stkinfo`;
    const res1 = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "authorization": `Bearer ${token}`,
        "appkey": this.config.appKey,
        "appsecret": this.config.appSecret,
        "api-id": "ka10001"
      },
      body: JSON.stringify({ stk_cd: symbol })
    });
    const data1 = await res1.json();
    if (!res1.ok || data1.return_code !== void 0 && data1.return_code !== 0 && data1.return_code !== "0") {
      throw new Error(`Kiwoom \uC2DC\uC138 \uC870\uD68C(ka10001) \uC2E4\uD328: ${data1.return_msg || res1.status}`);
    }
    const price = Math.abs(parseInt(data1.cur_prc, 10)) || 0;
    const basePric = Math.abs(parseInt(data1.base_pric, 10)) || price;
    let change = parseInt(data1.pred_pre, 10) || 0;
    if (data1.pre_sig === "4" || data1.pre_sig === "5") {
      change = -Math.abs(change);
    } else if (data1.pre_sig === "1" || data1.pre_sig === "2") {
      change = Math.abs(change);
    }
    const changePercent = parseFloat(data1.flu_rt) || (basePric > 0 ? Number((change / basePric * 100).toFixed(2)) : 0);
    const volume = Math.abs(parseInt(data1.trde_qty, 10)) || 0;
    const openPrice = Math.abs(parseInt(data1.open_pric, 10)) || price;
    const highPrice = Math.abs(parseInt(data1.high_pric, 10)) || price;
    const lowPrice = Math.abs(parseInt(data1.low_pric, 10)) || price;
    const prevClose = basePric;
    const high52w = Math.abs(parseInt(data1["250hgst"] || data1.oyr_hgst, 10)) || Math.round(price * 1.3);
    const low52w = Math.abs(parseInt(data1["250lwst"] || data1.oyr_lwst, 10)) || Math.round(price * 0.7);
    const marketCap = Math.abs(parseInt(data1.mac, 10)) || Math.round(price * (parseInt(data1.flo_stk, 10) || 1e6) / 1e8);
    const per = parseFloat(data1.per) || 15.2;
    const pbr = parseFloat(data1.pbr) || 1.4;
    const eps = Math.abs(parseInt(data1.eps, 10)) || Math.round(price / 15.2);
    let tradingValue = 0;
    try {
      const res3 = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json;charset=UTF-8",
          "authorization": `Bearer ${token}`,
          "appkey": this.config.appKey,
          "appsecret": this.config.appSecret,
          "api-id": "ka10003"
        },
        body: JSON.stringify({ stk_cd: symbol })
      });
      if (res3.ok) {
        const data3 = await res3.json();
        const latestCntr = data3.cntr_infr?.[0];
        if (latestCntr && latestCntr.acc_trde_prica) {
          const rawWon = Number(latestCntr.acc_trde_prica);
          if (!isNaN(rawWon) && rawWon > 0) {
            tradingValue = Math.round(rawWon / 1e8);
          }
        }
      }
    } catch {
    }
    if (tradingValue <= 0) {
      tradingValue = Math.round(price * volume / 1e8);
    }
    return {
      symbol,
      name: data1.stk_nm || void 0,
      price,
      change,
      changePercent,
      volume,
      openPrice,
      highPrice,
      lowPrice,
      prevClose,
      tradingValue,
      // in 억 원
      high52w,
      low52w,
      marketCap,
      per,
      pbr,
      eps
    };
  }
  /**
   * 3. Inquire Index Current Price (KOSPI mrkt_tp: '0', inds_cd: '001'; KOSDAQ mrkt_tp: '1', inds_cd: '101')
   * Kiwoom REST API Endpoint: /api/dostk/sect (TR: ka20001)
   */
  async fetchIndexPrice(marketCode) {
    const isKospi = marketCode === "KOSPI";
    const mrkt_tp = isKospi ? "0" : "1";
    const inds_cd = isKospi ? "001" : "101";
    const name = isKospi ? "\uCF54\uC2A4\uD53C" : "\uCF54\uC2A4\uB2E5";
    const token = await this.getAccessToken();
    const url = `${this.config.baseUrl}/api/dostk/sect`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "authorization": `Bearer ${token}`,
        "appkey": this.config.appKey,
        "appsecret": this.config.appSecret,
        "api-id": "ka20001"
      },
      body: JSON.stringify({ mrkt_tp, inds_cd })
    });
    const data = await res.json();
    if (!res.ok || data.return_code !== void 0 && data.return_code !== 0 && data.return_code !== "0") {
      throw new Error(`Kiwoom \uC5C5\uC885/\uC9C0\uC218 \uC870\uD68C \uC2E4\uD328: ${data.return_msg || res.status}`);
    }
    const curPrc = Math.abs(parseFloat(data.cur_prc)) || 0;
    const change = parseFloat(data.pred_pre) || 0;
    const changePercent = parseFloat(data.flu_rt) || 0;
    const high = Math.abs(parseFloat(data.high_pric)) || curPrc;
    const low = Math.abs(parseFloat(data.low_pric)) || curPrc;
    const volume = Math.abs(parseInt(data.trde_qty, 10)) || 0;
    const tradingValue = Math.round((Math.abs(parseInt(data.trde_prica, 10)) || 0) / 100);
    const advanceCount = parseInt(data.rising, 10) || 450;
    const declineCount = parseInt(data.fall, 10) || 380;
    let sparkline = [];
    if (Array.isArray(data.inds_cur_prc_tm) && data.inds_cur_prc_tm.length > 0) {
      sparkline = data.inds_cur_prc_tm.map((item) => Math.abs(parseFloat(item.cur_prc_n))).filter((val) => !isNaN(val) && val > 0).reverse().slice(-10);
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
      sparkline
    };
  }
  /**
   * 4. Inquire Stock Daily Price History (주식일봉차트)
   * Kiwoom REST API Endpoint: /api/dostk/chart (TR: ka10081)
   */
  async fetchStockCandles(symbol) {
    const token = await this.getAccessToken();
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10).replace(/-/g, "");
    const url = `${this.config.baseUrl}/api/dostk/chart`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "authorization": `Bearer ${token}`,
        "appkey": this.config.appKey,
        "appsecret": this.config.appSecret,
        "api-id": "ka10081"
      },
      body: JSON.stringify({
        stk_cd: symbol,
        base_dt: today,
        upd_stkpc_tp: "1"
      })
    });
    const data = await res.json();
    if (!res.ok || data.return_code !== void 0 && data.return_code !== 0 && data.return_code !== "0") {
      throw new Error(`Kiwoom \uC77C\uBD09 \uCC28\uD2B8 \uC870\uD68C \uC2E4\uD328: ${data.return_msg || res.status}`);
    }
    const chartList = data.stk_dt_pole_chart_qry;
    if (!Array.isArray(chartList) || chartList.length === 0) {
      return [];
    }
    return chartList.map((item) => {
      const d = item.dt || "";
      const formattedDate = d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
      return {
        time: formattedDate,
        open: Math.abs(parseInt(item.open_pric, 10)) || 0,
        high: Math.abs(parseInt(item.high_pric, 10)) || 0,
        low: Math.abs(parseInt(item.low_pric, 10)) || 0,
        close: Math.abs(parseInt(item.cur_prc, 10)) || 0,
        volume: Math.abs(parseInt(item.trde_qty, 10)) || 0
      };
    }).reverse();
  }
  /**
   * 4-1. Inquire Stock 10-Level Order Book (국내주식 10단계 호가)
   * Kiwoom REST API Endpoint: /api/dostk/mrkcond (TR: ka10004)
   */
  async fetchOrderBook(symbol) {
    const token = await this.getAccessToken();
    const url = `${this.config.baseUrl}/api/dostk/mrkcond`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "authorization": `Bearer ${token}`,
        "appkey": this.config.appKey,
        "appsecret": this.config.appSecret,
        "api-id": "ka10004"
      },
      body: JSON.stringify({ stk_cd: symbol })
    });
    const data = await res.json();
    if (!res.ok || data.return_code !== void 0 && data.return_code !== 0 && data.return_code !== "0") {
      throw new Error(`Kiwoom \uD638\uAC00 \uC870\uD68C \uC2E4\uD328: ${data.return_msg || res.status}`);
    }
    const currentPrice = Math.abs(parseInt(data.sel_fpr_bid || data.buy_fpr_bid, 10)) || 0;
    const prevClose = currentPrice;
    const asks = [];
    for (let i = 10; i >= 1; i--) {
      const priceKey = i === 1 ? "sel_fpr_bid" : `sel_${i}th_pre_bid`;
      const volKey = i === 1 ? "sel_fpr_req" : `sel_${i}th_pre_req`;
      const askPrice = Math.abs(parseInt(data[priceKey], 10)) || 0;
      const vol = Math.abs(parseInt(data[volKey], 10)) || 0;
      const chg = prevClose > 0 && askPrice > 0 ? askPrice - prevClose : 0;
      const chgPct = prevClose > 0 && askPrice > 0 ? Number((chg / prevClose * 100).toFixed(2)) : 0;
      asks.push({
        price: askPrice,
        volume: vol,
        change: chg,
        changePercent: chgPct,
        barPercent: 0
      });
    }
    const bids = [];
    for (let i = 1; i <= 10; i++) {
      const priceKey = i === 1 ? "buy_fpr_bid" : `buy_${i}th_pre_bid`;
      const volKey = i === 1 ? "buy_fpr_req" : `buy_${i}th_pre_req`;
      const bidPrice = Math.abs(parseInt(data[priceKey], 10)) || 0;
      const vol = Math.abs(parseInt(data[volKey], 10)) || 0;
      const chg = prevClose > 0 && bidPrice > 0 ? bidPrice - prevClose : 0;
      const chgPct = prevClose > 0 && bidPrice > 0 ? Number((chg / prevClose * 100).toFixed(2)) : 0;
      bids.push({
        price: bidPrice,
        volume: vol,
        change: chg,
        changePercent: chgPct,
        barPercent: 0
      });
    }
    const maxVol = Math.max(...asks.map((a) => a.volume), ...bids.map((b) => b.volume), 1);
    asks.forEach((a) => a.barPercent = Math.min(100, Math.round(a.volume / maxVol * 100)));
    bids.forEach((b) => b.barPercent = Math.min(100, Math.round(b.volume / maxVol * 100)));
    const totalAskVolume = Math.abs(parseInt(data.tot_sel_req, 10)) || asks.reduce((sum, a) => sum + a.volume, 0);
    const totalBidVolume = Math.abs(parseInt(data.tot_buy_req, 10)) || bids.reduce((sum, b) => sum + b.volume, 0);
    return {
      symbol,
      currentPrice,
      asks,
      bids,
      totalAskVolume,
      totalBidVolume
    };
  }
  /**
   * 5. Complete Diagnostic Runner
   * Tests Token Issuance & 005930 (삼성전자) Inquiry
   */
  async runDiagnostics() {
    const result = {
      hasAppKey: !!this.config.appKey,
      hasAppSecret: !!this.config.appSecret,
      isMock: this.config.isMock,
      baseUrl: this.config.baseUrl,
      tokenTest: {
        attempted: false,
        success: false
      }
    };
    if (!this.isConfigured()) {
      result.tokenTest = {
        attempted: true,
        success: false,
        error: "\uD658\uACBD\uBCC0\uC218(KIWOOM_APP_KEY, KIWOOM_APP_SECRET)\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4."
      };
      return result;
    }
    result.tokenTest.attempted = true;
    try {
      const token = await this.getAccessToken();
      result.tokenTest.success = !!token;
      result.sampleStockTest = {
        symbol: "005930",
        attempted: true,
        success: false
      };
      try {
        const stockData = await this.fetchStockPrice("005930");
        result.sampleStockTest.success = true;
        result.sampleStockTest.stockData = stockData;
      } catch (stockErr) {
        result.sampleStockTest.error = stockErr.message;
      }
    } catch (err) {
      result.tokenTest.error = err.message;
    }
    return result;
  }
  // -------------------------------------------------------------
  // 6. Kiwoom WebSocket Real-time Execution Feed
  // -------------------------------------------------------------
  isWsConnected() {
    return this.wsConnected && this.wsLoggedIn;
  }
  getSubscribedSymbols() {
    return Array.from(this.subscribedSymbols);
  }
  getSubscribedOrderBookSymbols() {
    return Array.from(this.subscribedOrderBookSymbols);
  }
  onTick(listener) {
    this.tickListeners.add(listener);
    return () => {
      this.tickListeners.delete(listener);
    };
  }
  broadcastTick(tick) {
    for (const listener of this.tickListeners) {
      try {
        listener(tick);
      } catch (e) {
        console.warn("[Kiwoom WS] Error in tick listener:", e);
      }
    }
  }
  onOrderBook(listener) {
    this.orderBookListeners.add(listener);
    return () => {
      this.orderBookListeners.delete(listener);
    };
  }
  broadcastOrderBook(ob) {
    for (const listener of this.orderBookListeners) {
      try {
        listener(ob);
      } catch (e) {
        console.warn("[Kiwoom WS] Error in orderBook listener:", e);
      }
    }
  }
  /**
   * Connect to Kiwoom WebSocket server (Server-side only)
   * Official URL: wss://api.kiwoom.com:10000/api/dostk/websocket
   * Protocol: LOGIN frame handshake -> REG subscription frame
   */
  async connectWebSocket() {
    if (this.wsConnected && this.wsLoggedIn || this.isConnectingWs) {
      return this.wsConnected && this.wsLoggedIn;
    }
    if (!this.isConfigured()) {
      return false;
    }
    this.isConnectingWs = true;
    try {
      const token = await this.getAccessToken();
      const WSConstructor = globalThis.WebSocket;
      if (!WSConstructor) {
        console.warn("[Kiwoom WS] Global WebSocket not available in this Node runtime");
        this.isConnectingWs = false;
        return false;
      }
      console.log(`[Kiwoom WS] Connecting to ${this.config.wsUrl}...`);
      this.ws = new WSConstructor(this.config.wsUrl);
      this.ws.onopen = () => {
        console.log("[Kiwoom WS] Connection established. Sending LOGIN handshake...");
        this.wsConnected = true;
        this.isConnectingWs = false;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        try {
          const loginPacket = {
            trnm: "LOGIN",
            token
          };
          this.ws.send(JSON.stringify(loginPacket));
        } catch (err) {
          console.warn("[Kiwoom WS] Error sending LOGIN frame:", err.message);
        }
      };
      this.ws.onmessage = (event) => {
        this.handleWsMessage(event.data);
      };
      this.ws.onerror = (err) => {
        console.warn("[Kiwoom WS] WebSocket error:", err.message || err);
      };
      this.ws.onclose = (ev) => {
        console.log(`[Kiwoom WS] Connection closed (code=${ev.code}, reason=${ev.reason || "none"}). Scheduling reconnection in 30s...`);
        this.wsConnected = false;
        this.wsLoggedIn = false;
        this.isConnectingWs = false;
        this.ws = null;
        this.scheduleReconnect(3e4);
      };
      return true;
    } catch (err) {
      console.log("[Kiwoom WS] WebSocket connection notice:", err.message);
      this.isConnectingWs = false;
      this.scheduleReconnect(6e4);
      return false;
    }
  }
  scheduleReconnect(delayMs = 3e4) {
    if (this.reconnectTimer || !this.isConfigured()) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectWebSocket().catch(() => {
      });
    }, delayMs);
  }
  subscribeStock(symbol) {
    if (this.subscribedSymbols.has(symbol)) {
      return;
    }
    this.subscribedSymbols.add(symbol);
    console.log(`[Kiwoom WS] Subscribed to symbol: ${symbol} (Total: ${this.subscribedSymbols.size})`);
    if (this.wsConnected && this.wsLoggedIn && this.ws) {
      this.sendSubscribePacket(symbol);
    } else {
      this.connectWebSocket().catch(() => {
      });
    }
  }
  unsubscribeStock(symbol) {
    if (!this.subscribedSymbols.has(symbol)) return;
    this.subscribedSymbols.delete(symbol);
    console.log(`[Kiwoom WS] Unsubscribed from symbol: ${symbol}`);
    if (this.wsConnected && this.wsLoggedIn && this.ws) {
      this.sendUnsubscribePacket(symbol);
    }
  }
  sendSubscribePacket(symbol) {
    if (!this.ws) return;
    try {
      const packet = {
        trnm: "REG",
        grp_no: "1",
        refresh: "1",
        data: [
          {
            item: [symbol],
            type: ["0B"]
          }
        ]
      };
      this.ws.send(JSON.stringify(packet));
      console.log(`[Kiwoom WS] Sent REG (0B) packet for ${symbol}`);
    } catch (e) {
      console.warn(`[Kiwoom WS] Error sending subscribe packet for ${symbol}:`, e);
    }
  }
  sendUnsubscribePacket(symbol) {
    if (!this.ws) return;
    try {
      const packet = {
        trnm: "REMOVE",
        grp_no: "1",
        data: [
          {
            item: [symbol],
            type: ["0B"]
          }
        ]
      };
      this.ws.send(JSON.stringify(packet));
      console.log(`[Kiwoom WS] Sent REMOVE (0B) packet for ${symbol}`);
    } catch (e) {
      console.warn(`[Kiwoom WS] Error sending unsubscribe packet for ${symbol}:`, e);
    }
  }
  subscribeOrderBook(symbol) {
    if (this.subscribedOrderBookSymbols.has(symbol)) {
      return;
    }
    this.subscribedOrderBookSymbols.add(symbol);
    console.log(`[Kiwoom WS] Subscribed to order book for symbol: ${symbol} (Total: ${this.subscribedOrderBookSymbols.size})`);
    if (this.wsConnected && this.wsLoggedIn && this.ws) {
      this.sendOrderBookSubscribePacket(symbol, "1");
    } else {
      this.connectWebSocket().catch(() => {
      });
    }
  }
  unsubscribeOrderBook(symbol) {
    if (!this.subscribedOrderBookSymbols.has(symbol)) return;
    this.subscribedOrderBookSymbols.delete(symbol);
    console.log(`[Kiwoom WS] Unsubscribed from order book for symbol: ${symbol}`);
    if (this.wsConnected && this.wsLoggedIn && this.ws) {
      this.sendOrderBookSubscribePacket(symbol, "2");
    }
  }
  sendOrderBookSubscribePacket(symbol, trType = "1") {
    if (!this.ws) return;
    try {
      const packet = trType === "1" ? {
        trnm: "REG",
        grp_no: "1",
        refresh: "1",
        data: [
          {
            item: [symbol],
            type: ["0D"]
          }
        ]
      } : {
        trnm: "REMOVE",
        grp_no: "1",
        data: [
          {
            item: [symbol],
            type: ["0D"]
          }
        ]
      };
      this.ws.send(JSON.stringify(packet));
      console.log(`[Kiwoom WS] Sent OrderBook packet (${trType === "1" ? "REG" : "REMOVE"}) for ${symbol}`);
    } catch (e) {
      console.warn(`[Kiwoom WS] Error sending orderbook packet (${trType}) for ${symbol}:`, e);
    }
  }
  handleWsMessage(raw) {
    try {
      const text = typeof raw === "string" ? raw : raw.toString();
      if (!text) return;
      if (text.startsWith("{")) {
        const json = JSON.parse(text);
        if (json.trnm === "LOGIN") {
          if (json.return_code === 0) {
            this.wsLoggedIn = true;
            console.log("[Kiwoom WS] LOGIN handshake confirmed successfully!");
            for (const sym of this.subscribedSymbols) {
              this.sendSubscribePacket(sym);
            }
            for (const sym of this.subscribedOrderBookSymbols) {
              this.sendOrderBookSubscribePacket(sym, "1");
            }
          } else {
            console.warn("[Kiwoom WS] LOGIN Handshake Failed:", json.return_msg || json);
            this.wsLoggedIn = false;
          }
          return;
        }
        if (json.trnm === "REG") {
          if (json.return_code === 0) {
            console.log("[Kiwoom WS] REG subscription confirmed successfully");
          } else {
            console.warn("[Kiwoom WS] REG subscription returned non-zero code:", json);
          }
          return;
        }
        if (json.trnm === "PING" || json.header?.tr_id === "PINGPONG") {
          this.ws?.send(JSON.stringify({ trnm: "PONG" }));
          return;
        }
        if (json.trnm === "REAL" && json.item && json.values) {
          const symbol = json.item;
          const vals = json.values;
          if (json.type === "0B") {
            const price = Math.abs(parseInt(vals["10"], 10)) || 0;
            const change = parseInt(vals["11"], 10) || 0;
            const changePercent = parseFloat(vals["12"]) || 0;
            const volume = parseInt(vals["13"], 10) || 0;
            const open = Math.abs(parseInt(vals["16"], 10)) || price;
            const high = Math.abs(parseInt(vals["17"], 10)) || price;
            const low = Math.abs(parseInt(vals["18"], 10)) || price;
            const time = vals["20"] || (/* @__PURE__ */ new Date()).toTimeString().slice(0, 8);
            if (price > 0 && symbol) {
              const tick = {
                symbol,
                price,
                change,
                changePercent,
                volume,
                open,
                high,
                low,
                time,
                source: "KIWOOM_WS"
              };
              this.broadcastTick(tick);
            }
            return;
          }
          if (json.type === "0D" || json.type === "0A") {
            const asks = [];
            for (let i = 10; i >= 1; i--) {
              const askPrice = Math.abs(parseInt(vals[String(40 + i)], 10)) || 0;
              const vol = Math.abs(parseInt(vals[String(60 + i)], 10)) || 0;
              asks.push({
                price: askPrice,
                volume: vol,
                change: 0,
                changePercent: 0,
                barPercent: 0
              });
            }
            const bids = [];
            for (let i = 1; i <= 10; i++) {
              const bidPrice = Math.abs(parseInt(vals[String(50 + i)], 10)) || 0;
              const vol = Math.abs(parseInt(vals[String(70 + i)], 10)) || 0;
              bids.push({
                price: bidPrice,
                volume: vol,
                change: 0,
                changePercent: 0,
                barPercent: 0
              });
            }
            const maxVol = Math.max(...asks.map((a) => a.volume), ...bids.map((b) => b.volume), 1);
            asks.forEach((a) => a.barPercent = Math.min(100, Math.round(a.volume / maxVol * 100)));
            bids.forEach((b) => b.barPercent = Math.min(100, Math.round(b.volume / maxVol * 100)));
            const totalAskVolume = Math.abs(parseInt(vals["121"], 10)) || asks.reduce((sum, a) => sum + a.volume, 0);
            const totalBidVolume = Math.abs(parseInt(vals["125"], 10)) || bids.reduce((sum, b) => sum + b.volume, 0);
            const currentPrice = bids[0]?.price || asks[asks.length - 1]?.price || 0;
            const orderBook = {
              symbol,
              currentPrice,
              asks,
              bids,
              totalAskVolume,
              totalBidVolume
            };
            this.broadcastOrderBook(orderBook);
            return;
          }
        }
        return;
      }
      const parts = text.split("|");
      if (parts.length >= 4 && parts[1] === "H0STCNT0") {
        const body = parts[3];
        const fields = body.split("^");
        const symbol = fields[0];
        const time = fields[1] || (/* @__PURE__ */ new Date()).toTimeString().slice(0, 8);
        const price = Math.abs(parseInt(fields[2], 10)) || 0;
        const change = parseInt(fields[4], 10) || 0;
        const changePercent = parseFloat(fields[5]) || 0;
        const volume = parseInt(fields[12], 10) || 0;
        const open = Math.abs(parseInt(fields[7], 10)) || price;
        const high = Math.abs(parseInt(fields[8], 10)) || price;
        const low = Math.abs(parseInt(fields[9], 10)) || price;
        if (price > 0 && symbol) {
          const tick = {
            symbol,
            price,
            change,
            changePercent,
            volume,
            open,
            high,
            low,
            time,
            source: "KIWOOM_WS"
          };
          this.broadcastTick(tick);
        }
      } else if (parts.length >= 4 && parts[1] === "H0STASP0") {
        const body = parts[3];
        const fields = body.split("^");
        const symbol = fields[0];
        if (symbol) {
          const asks = [];
          for (let i = 10; i >= 1; i--) {
            const askPrice = Math.abs(parseInt(fields[2 + i], 10)) || 0;
            const vol = Math.abs(parseInt(fields[22 + i], 10)) || 0;
            asks.push({
              price: askPrice,
              volume: vol,
              change: 0,
              changePercent: 0,
              barPercent: 0
            });
          }
          const bids = [];
          for (let i = 1; i <= 10; i++) {
            const bidPrice = Math.abs(parseInt(fields[12 + i], 10)) || 0;
            const vol = Math.abs(parseInt(fields[32 + i], 10)) || 0;
            bids.push({
              price: bidPrice,
              volume: vol,
              change: 0,
              changePercent: 0,
              barPercent: 0
            });
          }
          const maxVol = Math.max(...asks.map((a) => a.volume), ...bids.map((b) => b.volume), 1);
          asks.forEach((a) => a.barPercent = Math.min(100, Math.round(a.volume / maxVol * 100)));
          bids.forEach((b) => b.barPercent = Math.min(100, Math.round(b.volume / maxVol * 100)));
          const totalAskVolume = Math.abs(parseInt(fields[43], 10)) || asks.reduce((sum, a) => sum + a.volume, 0);
          const totalBidVolume = Math.abs(parseInt(fields[44], 10)) || bids.reduce((sum, b) => sum + b.volume, 0);
          const currentPrice = bids[0]?.price || asks[asks.length - 1]?.price || 0;
          const orderBook = {
            symbol,
            currentPrice,
            asks,
            bids,
            totalAskVolume,
            totalBidVolume
          };
          this.broadcastOrderBook(orderBook);
        }
      }
    } catch (e) {
      console.warn("[Kiwoom WS] Parse error:", e);
    }
  }
  /**
   * Diagnostic test for WebSocket connection, LOGIN, and 005930 REG
   */
  async testWebSocketLive(symbol = "005930") {
    const WSConstructor = globalThis.WebSocket;
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
          try {
            ws.close();
          } catch {
          }
          resolve({ wsConnected, loginSuccess, regSuccess });
        }, 7e3);
        ws.onopen = () => {
          wsConnected = true;
          ws.send(JSON.stringify({ trnm: "LOGIN", token }));
        };
        ws.onmessage = (event) => {
          try {
            const json = JSON.parse(event.data);
            if (json.trnm === "LOGIN" && json.return_code === 0) {
              loginSuccess = true;
              ws.send(JSON.stringify({
                trnm: "REG",
                grp_no: "1",
                refresh: "1",
                data: [{ item: [symbol], type: ["0B"] }]
              }));
            } else if (json.trnm === "REG" && json.return_code === 0) {
              regSuccess = true;
              clearTimeout(timer);
              try {
                ws.close();
              } catch {
              }
              resolve({ wsConnected, loginSuccess, regSuccess });
            }
          } catch {
          }
        };
        ws.onerror = () => {
        };
        ws.onclose = () => {
          clearTimeout(timer);
          resolve({ wsConnected, loginSuccess, regSuccess });
        };
      });
    } catch {
      return { wsConnected: false, loginSuccess: false, regSuccess: false };
    }
  }
};
var kiwoomApiService = new KiwoomApiService();

// server/stockApiService.ts
var serverCache = /* @__PURE__ */ new Map();
function getFromCache(key) {
  const entry = serverCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp < entry.ttlMs) {
    return entry.data;
  }
  return null;
}
function setInCache(key, data, ttlMs) {
  serverCache.set(key, {
    data,
    timestamp: Date.now(),
    ttlMs
  });
}
var TRACKED_STOCKS = [
  { symbol: "005930", ticker: "005930.KS", name: "\uC0BC\uC131\uC804\uC790", market: "KOSPI", sector: "\uBC18\uB3C4\uCCB4 / IT" },
  { symbol: "000660", ticker: "000660.KS", name: "SK\uD558\uC774\uB2C9\uC2A4", market: "KOSPI", sector: "\uBC18\uB3C4\uCCB4 / HBM" },
  { symbol: "005380", ticker: "005380.KS", name: "\uD604\uB300\uCC28", market: "KOSPI", sector: "\uC790\uB3D9\uCC28 / \uBAA8\uBE4C\uB9AC\uD2F0" },
  { symbol: "000270", ticker: "000270.KS", name: "\uAE30\uC544", market: "KOSPI", sector: "\uC790\uB3D9\uCC28 / \uBAA8\uBE4C\uB9AC\uD2F0" },
  { symbol: "196170", ticker: "196170.KQ", name: "\uC54C\uD14C\uC624\uC820", market: "KOSDAQ", sector: "\uBC14\uC774\uC624 / \uD50C\uB7AB\uD3FC" },
  { symbol: "042700", ticker: "042700.KS", name: "\uD55C\uBBF8\uBC18\uB3C4\uCCB4", market: "KOSPI", sector: "\uBC18\uB3C4\uCCB4 / TC\uBCF8\uB354" },
  { symbol: "064350", ticker: "064350.KS", name: "\uD604\uB300\uB85C\uD15C", market: "KOSPI", sector: "\uBC29\uC704\uC0B0\uC5C5 / \uCCA0\uB3C4" },
  { symbol: "034020", ticker: "034020.KS", name: "\uB450\uC0B0\uC5D0\uB108\uBE4C\uB9AC\uD2F0", market: "KOSPI", sector: "\uC6D0\uC790\uB825 / \uD50C\uB79C\uD2B8" },
  { symbol: "373220", ticker: "373220.KS", name: "LG\uC5D0\uB108\uC9C0\uC194\uB8E8\uC158", market: "KOSPI", sector: "2\uCC28\uC804\uC9C0 / \uBC30\uD130\uB9AC" },
  { symbol: "247540", ticker: "247540.KQ", name: "\uC5D0\uCF54\uD504\uB85C\uBE44\uC5E0", market: "KOSDAQ", sector: "2\uCC28\uC804\uC9C0 / \uC591\uADF9\uC7AC" },
  { symbol: "086520", ticker: "086520.KQ", name: "\uC5D0\uCF54\uD504\uB85C", market: "KOSDAQ", sector: "2\uCC28\uC804\uC9C0 / \uC9C0\uC8FC" },
  { symbol: "207940", ticker: "207940.KS", name: "\uC0BC\uC131\uBC14\uC774\uC624\uB85C\uC9C1\uC2A4", market: "KOSPI", sector: "\uBC14\uC774\uC624 / CDMO" },
  { symbol: "035420", ticker: "035420.KS", name: "NAVER", market: "KOSPI", sector: "IT\uC778\uD130\uB137 / \uD50C\uB7AB\uD3FC" },
  { symbol: "035720", ticker: "035720.KS", name: "\uCE74\uCE74\uC624", market: "KOSPI", sector: "IT\uC778\uD130\uB137 / \uD50C\uB7AB\uD3FC" },
  { symbol: "005490", ticker: "005490.KS", name: "POSCO\uD640\uB529\uC2A4", market: "KOSPI", sector: "\uCCA0\uAC15 / \uCE5C\uD658\uACBD\uC18C\uC7AC" },
  { symbol: "012330", ticker: "012330.KS", name: "\uD604\uB300\uBAA8\uBE44\uC2A4", market: "KOSPI", sector: "\uC790\uB3D9\uCC28\uBD80\uD488" },
  { symbol: "105560", ticker: "105560.KS", name: "KB\uAE08\uC735", market: "KOSPI", sector: "\uAE08\uC735 / \uC740\uD589" },
  { symbol: "055550", ticker: "055550.KS", name: "\uC2E0\uD55C\uC9C0\uC8FC", market: "KOSPI", sector: "\uAE08\uC735 / \uC740\uD589" },
  { symbol: "417860", ticker: "417860.KQ", name: "\uC0BC\uD604", market: "KOSDAQ", sector: "\uB85C\uBD07 / \uC561\uCD94\uC5D0\uC774\uD130" }
];
async function fetchRealStockDataWithSource(symbol) {
  const cacheKey = `stock_real_source_${symbol}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;
  const masterItem = kiwoomApiService.getMasterStock(symbol);
  const item = TRACKED_STOCKS.find((s) => s.symbol === symbol);
  if (!masterItem && !item && !kiwoomApiService.isConfigured()) {
    return { stock: null, dataSource: "mock" };
  }
  const stockName = masterItem?.name || item?.name || symbol;
  const stockMarket = masterItem?.market || item?.market || "KOSPI";
  const stockSector = masterItem?.sector || item?.sector || "\uAE30\uD0C0";
  if (kiwoomApiService.isConfigured()) {
    try {
      const kiwoomData = await kiwoomApiService.fetchStockPrice(symbol);
      if (kiwoomData && kiwoomData.price) {
        const price = kiwoomData.price;
        const change = kiwoomData.change || 0;
        const prevClose = kiwoomData.prevClose || price - change;
        let kiwoomCandles = await kiwoomApiService.fetchStockCandles(symbol).catch(() => []);
        if (!kiwoomCandles || kiwoomCandles.length === 0) {
          kiwoomCandles = [
            { time: "09:00", open: kiwoomData.openPrice || price, high: price, low: kiwoomData.openPrice || price, close: price, volume: 1e4 }
          ];
        }
        const sparkline = kiwoomCandles.slice(-7).map((c) => c.close);
        const stock = {
          symbol,
          name: kiwoomData.name || stockName,
          market: stockMarket,
          sector: stockSector,
          price,
          change,
          changePercent: kiwoomData.changePercent !== void 0 ? kiwoomData.changePercent : Number((change / (prevClose || 1) * 100).toFixed(2)),
          volume: kiwoomData.volume || 0,
          volumeRatio: 120,
          tradingValue: kiwoomData.tradingValue || Math.round(price * (kiwoomData.volume || 1e6) / 1e8),
          openPrice: kiwoomData.openPrice || price,
          highPrice: kiwoomData.highPrice || price,
          lowPrice: kiwoomData.lowPrice || price,
          prevClose,
          high52w: kiwoomData.high52w || Math.round(price * 1.3),
          low52w: kiwoomData.low52w || Math.round(price * 0.7),
          marketCap: kiwoomData.marketCap || masterItem?.marketCap || Math.round(price * 5e8 / 1e8),
          per: kiwoomData.per || 15.2,
          pbr: kiwoomData.pbr || 1.4,
          eps: kiwoomData.eps || Math.round(price / 15.2),
          dividendYield: 1.5,
          foreignNetBuy: 0,
          instNetBuy: 0,
          candles: kiwoomCandles,
          sparkline: sparkline.length >= 2 ? sparkline : [prevClose, price]
        };
        const result = { stock, dataSource: "kiwoom" };
        setInCache(cacheKey, result, 5e3);
        return result;
      }
    } catch (kiwoomErr) {
      console.log(`[StockAPI] Kiwoom API notice for ${symbol}, using Yahoo fallback: ${kiwoomErr.message}`);
    }
  }
  try {
    const yahooTicker = item?.ticker || `${symbol}.${stockMarket === "KOSDAQ" ? "KQ" : "KS"}`;
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=3mo`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json"
      }
    });
    if (res.ok) {
      const json = await res.json();
      const result = json.chart?.result?.[0];
      if (result) {
        const meta = result.meta;
        const price = Math.round(meta.regularMarketPrice || meta.chartPreviousClose || 5e4);
        const prevClose = Math.round(meta.chartPreviousClose || price);
        const change = price - prevClose;
        const changePercent = Number((change / (prevClose || 1) * 100).toFixed(2));
        const volume = meta.regularMarketVolume || 1e6;
        const openPrice = Math.round(meta.regularMarketDayLow || price);
        const highPrice = Math.round(meta.regularMarketDayHigh || price);
        const lowPrice = Math.round(meta.regularMarketDayLow || price);
        const tradingValue = Math.round(price * volume / 1e8);
        const candles = [];
        const timestamps = result.timestamp || [];
        const quote = result.indicators?.quote?.[0] || {};
        const opens = quote.open || [];
        const highs = quote.high || [];
        const lows = quote.low || [];
        const closes = quote.close || [];
        const volumes = quote.volume || [];
        for (let i = 0; i < timestamps.length; i++) {
          if (closes[i] !== null && closes[i] !== void 0) {
            const d = new Date(timestamps[i] * 1e3);
            const dateStr = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
            candles.push({
              time: dateStr,
              open: Math.round(opens[i] || closes[i]),
              high: Math.round(highs[i] || closes[i]),
              low: Math.round(lows[i] || closes[i]),
              close: Math.round(closes[i]),
              volume: Math.round(volumes[i] || 0)
            });
          }
        }
        const sparkline = candles.slice(-7).map((c) => c.close);
        const stock = {
          symbol,
          name: stockName,
          market: stockMarket,
          sector: stockSector,
          price,
          change,
          changePercent,
          volume,
          volumeRatio: 120,
          tradingValue,
          openPrice,
          highPrice,
          lowPrice,
          prevClose,
          high52w: Math.round(price * 1.3),
          low52w: Math.round(price * 0.7),
          marketCap: masterItem?.marketCap || Math.round(price * 5e8 / 1e8),
          // 억 원
          per: 15.2,
          pbr: 1.4,
          eps: Math.round(price / 15.2),
          dividendYield: 1.5,
          foreignNetBuy: Math.round(Math.random() * 2e3 - 500),
          instNetBuy: Math.round(Math.random() * 1500 - 400),
          candles,
          sparkline: sparkline.length >= 2 ? sparkline : [prevClose, price]
        };
        const fetchResult = { stock, dataSource: "yahoo" };
        setInCache(cacheKey, fetchResult, 1e4);
        return fetchResult;
      }
    }
  } catch (err) {
    console.log(`[StockAPI] Yahoo data notice for ${symbol}: ${err.message}`);
  }
  if (masterItem) {
    const price = masterItem.lastPrice || 0;
    const stock = {
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
      sparkline: [price, price]
    };
    return { stock, dataSource: "mock" };
  }
  return { stock: null, dataSource: "mock" };
}
async function fetchRealStockData(symbol) {
  const res = await fetchRealStockDataWithSource(symbol);
  return res.stock;
}
async function fetchAllRealStocksWithSource() {
  const cacheKey = "all_real_stocks_with_source";
  const cached = getFromCache(cacheKey);
  if (cached && cached.stocks && cached.stocks.length > 0) return cached;
  const masterList = await kiwoomApiService.fetchStockMasterList();
  const majorSymbols = ["005930", "000660", "005380", "000270", "196170", "042700", "064350", "034020", "373220", "247540", "086520", "207940", "035420", "035720", "005490", "012330", "105560", "055550", "417860"];
  const majorStockMap = /* @__PURE__ */ new Map();
  let primarySource = "mock";
  await Promise.allSettled(
    majorSymbols.map(async (sym) => {
      const res = await fetchRealStockDataWithSource(sym);
      if (res.stock) {
        majorStockMap.set(sym, res.stock);
        if (res.dataSource === "kiwoom") primarySource = "kiwoom";
        else if (res.dataSource === "yahoo" && primarySource !== "kiwoom") primarySource = "yahoo";
      }
    })
  );
  const baseList = masterList && masterList.length > 0 ? masterList : TRACKED_STOCKS.map((t) => ({
    code: t.symbol,
    name: t.name,
    market: t.market,
    sector: t.sector,
    lastPrice: 0,
    listCount: 0,
    marketCap: 0
  }));
  const results = baseList.map((item) => {
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
      sparkline: [price, price]
    };
  });
  const payload = { stocks: results, dataSource: primarySource };
  if (results.length > 0) {
    setInCache(cacheKey, payload, 8e3);
  }
  return payload;
}
async function fetchRealIndices() {
  const cacheKey = "real_indices_cache";
  const cached = getFromCache(cacheKey);
  if (cached) return cached;
  if (kiwoomApiService.isConfigured()) {
    try {
      const [kospi, kosdaq] = await Promise.all([
        kiwoomApiService.fetchIndexPrice("KOSPI"),
        kiwoomApiService.fetchIndexPrice("KOSDAQ")
      ]);
      if (kospi && kosdaq) {
        const list2 = [kospi, kosdaq];
        setInCache(cacheKey, list2, 15e3);
        return list2;
      }
    } catch (err) {
      console.log("[StockAPI] Kiwoom index fetch unavailable, using Yahoo fallback:", err.message);
    }
  }
  const indexDefs = [
    { name: "\uCF54\uC2A4\uD53C", symbol: "KOSPI", ticker: "^KS11", defaultVal: 2710.5 },
    { name: "\uCF54\uC2A4\uB2E5", symbol: "KOSDAQ", ticker: "^KQ11", defaultVal: 875.2 }
  ];
  const list = [];
  for (const def of indexDefs) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(def.ticker)}?interval=1d&range=2d`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (res.ok) {
        const json = await res.json();
        const meta = json.chart?.result?.[0]?.meta;
        if (meta) {
          const val = Number((meta.regularMarketPrice || def.defaultVal).toFixed(2));
          const prev = Number((meta.chartPreviousClose || val).toFixed(2));
          const change = Number((val - prev).toFixed(2));
          const changePercent = Number((change / prev * 100).toFixed(2));
          list.push({
            name: def.name,
            symbol: def.symbol,
            value: val,
            change,
            changePercent,
            high: Number((meta.regularMarketDayHigh || val).toFixed(2)),
            low: Number((meta.regularMarketDayLow || val).toFixed(2)),
            volume: 524e3,
            tradingValue: 11.5,
            advanceCount: 450,
            declineCount: 380,
            sparkline: [prev, val]
          });
          continue;
        }
      }
    } catch {
    }
    list.push({
      name: def.name,
      symbol: def.symbol,
      value: def.defaultVal,
      change: 12.5,
      changePercent: 0.46,
      high: def.defaultVal + 5,
      low: def.defaultVal - 5,
      volume: 52e4,
      tradingValue: 11,
      advanceCount: 420,
      declineCount: 400,
      sparkline: [def.defaultVal - 10, def.defaultVal]
    });
  }
  setInCache(cacheKey, list, 15e3);
  return list;
}
async function fetchRealExchangeRate() {
  const cacheKey = "real_exchange_rate_cache";
  const cached = getFromCache(cacheKey);
  if (cached) return cached;
  try {
    const url = "https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?interval=1d&range=2d";
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (res.ok) {
      const json = await res.json();
      const meta = json.chart?.result?.[0]?.meta;
      if (meta) {
        const rate = Number((meta.regularMarketPrice || 1380).toFixed(2));
        const prev = Number((meta.chartPreviousClose || rate).toFixed(2));
        const change = Number((rate - prev).toFixed(2));
        const changePercent = Number((change / prev * 100).toFixed(2));
        const data = {
          currency: "USD/KRW",
          name: "\uBBF8\uAD6D \uB2EC\uB7EC",
          rate,
          change,
          changePercent,
          high: Number((meta.regularMarketDayHigh || rate + 2).toFixed(2)),
          low: Number((meta.regularMarketDayLow || rate - 2).toFixed(2)),
          sparkline: [prev, rate]
        };
        setInCache(cacheKey, data, 15e3);
        return data;
      }
    }
  } catch {
  }
  const fallback = {
    currency: "USD/KRW",
    name: "\uBBF8\uAD6D \uB2EC\uB7EC",
    rate: 1382.5,
    change: -2.3,
    changePercent: -0.17,
    high: 1385,
    low: 1380.5,
    sparkline: [1384.8, 1382.5]
  };
  setInCache(cacheKey, fallback, 15e3);
  return fallback;
}

// src/utils/hangul.ts
var HANGUL_BASE = 44032;
var HANGUL_END = 55203;
var CHOSUNG_LIST = [
  "\u3131",
  "\u3132",
  "\u3134",
  "\u3137",
  "\u3138",
  "\u3139",
  "\u3141",
  "\u3142",
  "\u3143",
  "\u3145",
  "\u3146",
  "\u3147",
  "\u3148",
  "\u3149",
  "\u314A",
  "\u314B",
  "\u314C",
  "\u314D",
  "\u314E"
];
var JUNGSUNG_LIST = [
  "\u314F",
  "\u3150",
  "\u3151",
  "\u3152",
  "\u3153",
  "\u3154",
  "\u3155",
  "\u3156",
  "\u3157",
  "\u3158",
  "\u3159",
  "\u315A",
  "\u315B",
  "\u315C",
  "\u315D",
  "\u315E",
  "\u315F",
  "\u3160",
  "\u3161",
  "\u3162",
  "\u3163"
];
var JONGSUNG_LIST = [
  "",
  "\u3131",
  "\u3132",
  "\u3133",
  "\u3134",
  "\u3135",
  "\u3136",
  "\u3137",
  "\u3139",
  "\u313A",
  "\u313B",
  "\u313C",
  "\u313D",
  "\u313E",
  "\u313F",
  "\u3140",
  "\u3141",
  "\u3142",
  "\u3144",
  "\u3145",
  "\u3146",
  "\u3147",
  "\u3148",
  "\u314A",
  "\u314B",
  "\u314C",
  "\u314D",
  "\u314E"
];
var COMPLEX_JONGSUNG_MAP = {
  "\u3133": "\u3131\u3145",
  "\u3135": "\u3134\u3148",
  "\u3136": "\u3134\u314E",
  "\u313A": "\u3139\u3131",
  "\u313B": "\u3139\u3141",
  "\u313C": "\u3139\u3142",
  "\u313D": "\u3139\u3145",
  "\u313E": "\u3139\u314C",
  "\u313F": "\u3139\u314D",
  "\u3140": "\u3139\u314E",
  "\u3144": "\u3142\u3145"
};
var COMPLEX_JUNGSUNG_MAP = {
  "\u3158": "\u3157\u314F",
  "\u3159": "\u3157\u3150",
  "\u315A": "\u3157\u3163",
  "\u315D": "\u315C\u3153",
  "\u315E": "\u315C\u3154",
  "\u315F": "\u315C\u3163",
  "\u3162": "\u3161\u3163"
};
function extractChosung(text) {
  if (!text) return "";
  let result = "";
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
function decomposeHangul(text) {
  if (!text) return "";
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= HANGUL_BASE && code <= HANGUL_END) {
      const offset = code - HANGUL_BASE;
      const cho = CHOSUNG_LIST[Math.floor(offset / 588)];
      const jung = JUNGSUNG_LIST[Math.floor(offset % 588 / 28)];
      const jong = JONGSUNG_LIST[offset % 28];
      result += cho;
      result += COMPLEX_JUNGSUNG_MAP[jung] || jung;
      if (jong) {
        result += COMPLEX_JONGSUNG_MAP[jong] || jong;
      }
    } else if (code >= 12593 && code <= 12643) {
      const ch = text[i];
      if (COMPLEX_JONGSUNG_MAP[ch]) {
        result += COMPLEX_JONGSUNG_MAP[ch];
      } else if (COMPLEX_JUNGSUNG_MAP[ch]) {
        result += COMPLEX_JUNGSUNG_MAP[ch];
      } else {
        result += ch;
      }
    } else {
      result += text[i].toLowerCase();
    }
  }
  return result;
}
function isChosungQuery(query) {
  if (!query) return false;
  const trimmed = query.replace(/\s+/g, "");
  const hasChosungChar = /[ㄱ-ㅎ]/.test(trimmed);
  const hasFullSyllable = /[가-힣]/.test(trimmed);
  return hasChosungChar && !hasFullSyllable;
}
function matchHangulSearch(target, query) {
  if (!query || !target) return false;
  const rawQuery = query.trim().toLowerCase();
  const rawTarget = target.toLowerCase();
  if (!rawQuery) return false;
  if (rawTarget.includes(rawQuery)) {
    return true;
  }
  const targetNoSpace = rawTarget.replace(/\s+/g, "");
  const queryNoSpace = rawQuery.replace(/\s+/g, "");
  if (targetNoSpace.includes(queryNoSpace)) {
    return true;
  }
  if (isChosungQuery(rawQuery)) {
    const targetChosung = extractChosung(rawTarget).replace(/\s+/g, "");
    if (targetChosung.includes(queryNoSpace)) {
      return true;
    }
  }
  const decomposedTarget = decomposeHangul(rawTarget).replace(/\s+/g, "");
  const decomposedQuery = decomposeHangul(rawQuery).replace(/\s+/g, "");
  if (decomposedTarget.includes(decomposedQuery)) {
    return true;
  }
  return false;
}

// src/services/mockData.ts
var INITIAL_EXCHANGE_RATE = {
  currency: "USD/KRW",
  name: "\uC6D0/\uB2EC\uB7EC \uD658\uC728",
  rate: 1348.5,
  change: -4.2,
  changePercent: -0.31,
  high: 1354.2,
  low: 1346.8,
  sparkline: [1352.7, 1353.5, 1351, 1349.8, 1350.5, 1347.9, 1348.5]
};
var INITIAL_INDICES = [
  {
    symbol: "KOSPI",
    name: "\uCF54\uC2A4\uD53C",
    value: 2684.52,
    change: 18.42,
    changePercent: 0.69,
    high: 2692.15,
    low: 2671.3,
    volume: 482910,
    tradingValue: 10.42,
    advanceCount: 542,
    declineCount: 321,
    sparkline: [2668, 2671, 2675, 2673, 2679, 2682, 2680, 2685, 2684.52]
  },
  {
    symbol: "KOSDAQ",
    name: "\uCF54\uC2A4\uB2E5",
    value: 872.1,
    change: -3.25,
    changePercent: -0.37,
    high: 879.4,
    low: 869.8,
    volume: 914200,
    tradingValue: 7.85,
    advanceCount: 680,
    declineCount: 840,
    sparkline: [876, 878, 875, 873, 871, 872, 870, 869, 872.1]
  }
];
function generateCandles(basePrice, volatility = 0.02, count = 30) {
  const candles = [];
  let price = basePrice * (1 - volatility * (count / 2));
  const now = /* @__PURE__ */ new Date();
  for (let i = count; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const change = (Math.random() - 0.48) * volatility * price;
    const open = Math.round(price);
    const close = Math.round(price + change);
    const high = Math.round(Math.max(open, close) + Math.random() * volatility * price * 0.8);
    const low = Math.round(Math.min(open, close) - Math.random() * volatility * price * 0.8);
    const volume = Math.round(5e5 + Math.random() * 25e5);
    candles.push({
      time: dateStr,
      open,
      high,
      low,
      close,
      volume
    });
    price = close;
  }
  return candles;
}
var INITIAL_STOCKS = [
  {
    symbol: "005930",
    name: "\uC0BC\uC131\uC804\uC790",
    market: "KOSPI",
    sector: "\uC804\uAE30\uC804\uC790 / \uBC18\uB3C4\uCCB4",
    price: 78500,
    change: 1800,
    changePercent: 2.35,
    volume: 18452090,
    volumeRatio: 142.5,
    tradingValue: 14482,
    high52w: 88800,
    low52w: 55300,
    marketCap: 4686280,
    // 468.6조
    per: 14.2,
    pbr: 1.25,
    eps: 5528,
    dividendYield: 2.15,
    openPrice: 77200,
    highPrice: 79100,
    lowPrice: 77e3,
    prevClose: 76700,
    foreignNetBuy: 2840,
    instNetBuy: 1490,
    candles: generateCandles(78500, 0.015),
    sparkline: [76500, 76800, 77200, 77500, 78100, 77900, 78500]
  },
  {
    symbol: "000660",
    name: "SK\uD558\uC774\uB2C9\uC2A4",
    market: "KOSPI",
    sector: "\uC804\uAE30\uC804\uC790 / \uBC18\uB3C4\uCCB4",
    price: 194500,
    change: 8500,
    changePercent: 4.57,
    volume: 6420110,
    volumeRatio: 215.3,
    tradingValue: 12480,
    high52w: 248500,
    low52w: 112e3,
    marketCap: 1416e3,
    per: 8.4,
    pbr: 1.95,
    eps: 23150,
    dividendYield: 0.85,
    openPrice: 188e3,
    highPrice: 196e3,
    lowPrice: 187500,
    prevClose: 186e3,
    foreignNetBuy: 3820,
    instNetBuy: 1910,
    candles: generateCandles(194500, 0.025),
    sparkline: [186e3, 187500, 19e4, 192500, 191e3, 193500, 194500]
  },
  {
    symbol: "196170",
    name: "\uC54C\uD14C\uC624\uC820",
    market: "KOSPI",
    sector: "\uBC14\uC774\uC624 / \uC81C\uC57D",
    price: 368e3,
    change: 24e3,
    changePercent: 6.98,
    volume: 1824e3,
    volumeRatio: 380.2,
    tradingValue: 6710,
    high52w: 395e3,
    low52w: 72e3,
    marketCap: 195800,
    per: 45.8,
    pbr: 18.2,
    eps: 8035,
    dividendYield: 0,
    openPrice: 345e3,
    highPrice: 372e3,
    lowPrice: 344e3,
    prevClose: 344e3,
    foreignNetBuy: 1250,
    instNetBuy: 840,
    candles: generateCandles(368e3, 0.04),
    sparkline: [344e3, 349e3, 355e3, 362e3, 36e4, 365e3, 368e3]
  },
  {
    symbol: "042700",
    name: "\uD55C\uBBF8\uBC18\uB3C4\uCCB4",
    market: "KOSPI",
    sector: "\uBC18\uB3C4\uCCB4 \uC7A5\uBE44 / TC\uBCF8\uB354",
    price: 114500,
    change: 9500,
    changePercent: 9.05,
    volume: 384e4,
    volumeRatio: 320.4,
    tradingValue: 4390,
    high52w: 187800,
    low52w: 48900,
    marketCap: 111e3,
    per: 32.1,
    pbr: 7.8,
    eps: 3567,
    dividendYield: 0.45,
    openPrice: 106e3,
    highPrice: 116500,
    lowPrice: 105500,
    prevClose: 105e3,
    foreignNetBuy: 950,
    instNetBuy: 620,
    candles: generateCandles(114500, 0.035),
    sparkline: [105e3, 107e3, 11e4, 112e3, 111500, 113e3, 114500]
  },
  {
    symbol: "064350",
    name: "\uD604\uB300\uB85C\uD15C",
    market: "KOSPI",
    sector: "\uBC29\uC704\uC0B0\uC5C5 / \uCCA0\uB3C4",
    price: 58400,
    change: 4100,
    changePercent: 7.55,
    volume: 421e4,
    volumeRatio: 280.1,
    tradingValue: 2450,
    high52w: 62300,
    low52w: 24300,
    marketCap: 63740,
    per: 18.5,
    pbr: 2.9,
    eps: 3156,
    dividendYield: 0.6,
    openPrice: 54600,
    highPrice: 59100,
    lowPrice: 54200,
    prevClose: 54300,
    foreignNetBuy: 540,
    instNetBuy: 780,
    candles: generateCandles(58400, 0.03),
    sparkline: [54300, 55200, 56400, 57100, 56800, 58e3, 58400]
  },
  {
    symbol: "034020",
    name: "\uB450\uC0B0\uC5D0\uB108\uBE4C\uB9AC\uD2F0",
    market: "KOSPI",
    sector: "\uC6D0\uC790\uB825 / \uD50C\uB79C\uD2B8",
    price: 21850,
    change: 1450,
    changePercent: 7.11,
    volume: 1682e4,
    volumeRatio: 295.6,
    tradingValue: 3670,
    high52w: 24100,
    low52w: 13400,
    marketCap: 139900,
    per: 26.4,
    pbr: 1.45,
    eps: 827,
    dividendYield: 0,
    openPrice: 20500,
    highPrice: 22300,
    lowPrice: 20400,
    prevClose: 20400,
    foreignNetBuy: 1120,
    instNetBuy: 640,
    candles: generateCandles(21850, 0.03),
    sparkline: [20400, 20800, 21200, 21500, 21300, 21700, 21850]
  },
  {
    symbol: "373220",
    name: "LG\uC5D0\uB108\uC9C0\uC194\uB8E8\uC158",
    market: "KOSPI",
    sector: "2\uCC28\uC804\uC9C0 / \uBC30\uD130\uB9AC",
    price: 382500,
    change: -12500,
    changePercent: -3.16,
    volume: 412e3,
    volumeRatio: 92.4,
    tradingValue: 1575,
    high52w: 52e4,
    low52w: 311e3,
    marketCap: 895e3,
    per: 65.4,
    pbr: 4.12,
    eps: 5848,
    dividendYield: 0,
    openPrice: 393e3,
    highPrice: 394500,
    lowPrice: 381e3,
    prevClose: 395e3,
    foreignNetBuy: -640,
    instNetBuy: -420,
    candles: generateCandles(382500, 0.025),
    sparkline: [395e3, 393e3, 39e4, 386e3, 388e3, 384e3, 382500]
  },
  {
    symbol: "247540",
    name: "\uC5D0\uCF54\uD504\uB85C\uBE44\uC5E0",
    market: "KOSDAQ",
    sector: "2\uCC28\uC804\uC9C0 \uC591\uADF9\uC7AC",
    price: 154200,
    change: -8400,
    changePercent: -5.17,
    volume: 125e4,
    volumeRatio: 185,
    tradingValue: 1920,
    high52w: 32e4,
    low52w: 148e3,
    marketCap: 150800,
    per: 85.2,
    pbr: 3.8,
    eps: 1810,
    dividendYield: 0.28,
    openPrice: 161e3,
    highPrice: 161500,
    lowPrice: 153e3,
    prevClose: 162600,
    foreignNetBuy: -820,
    instNetBuy: -560,
    candles: generateCandles(154200, 0.04),
    sparkline: [162600, 16e4, 158e3, 156500, 157e3, 155e3, 154200]
  },
  {
    symbol: "086520",
    name: "\uC5D0\uCF54\uD504\uB85C",
    market: "KOSDAQ",
    sector: "\uC9C0\uC8FC\uC0AC / 2\uCC28\uC804\uC9C0",
    price: 76800,
    change: -4300,
    changePercent: -5.3,
    volume: 241e4,
    volumeRatio: 160.2,
    tradingValue: 1850,
    high52w: 135e3,
    low52w: 74200,
    marketCap: 102200,
    per: 42.1,
    pbr: 2.9,
    eps: 1824,
    dividendYield: 0.15,
    openPrice: 80500,
    highPrice: 80800,
    lowPrice: 76500,
    prevClose: 81100,
    foreignNetBuy: -680,
    instNetBuy: -390,
    candles: generateCandles(76800, 0.038),
    sparkline: [81100, 80200, 79400, 78200, 78600, 77300, 76800]
  },
  {
    symbol: "005380",
    name: "\uD604\uB300\uCC28",
    market: "KOSPI",
    sector: "\uC790\uB3D9\uCC28 / \uBAA8\uBE4C\uB9AC\uD2F0",
    price: 248500,
    change: -2500,
    changePercent: -1,
    volume: 89e4,
    volumeRatio: 88,
    tradingValue: 2210,
    high52w: 298e3,
    low52w: 172e3,
    marketCap: 521e3,
    per: 4.8,
    pbr: 0.62,
    eps: 51770,
    dividendYield: 4.82,
    openPrice: 251e3,
    highPrice: 252500,
    lowPrice: 247e3,
    prevClose: 251e3,
    foreignNetBuy: 140,
    instNetBuy: -280,
    candles: generateCandles(248500, 0.015),
    sparkline: [251e3, 250500, 249e3, 248e3, 249500, 248e3, 248500]
  },
  {
    symbol: "000270",
    name: "\uAE30\uC544",
    market: "KOSPI",
    sector: "\uC790\uB3D9\uCC28 / \uBAA8\uBE4C\uB9AC\uD2F0",
    price: 102400,
    change: -1100,
    changePercent: -1.06,
    volume: 1204e3,
    volumeRatio: 90.5,
    tradingValue: 1230,
    high52w: 135e3,
    low52w: 78e3,
    marketCap: 408e3,
    per: 4.2,
    pbr: 0.78,
    eps: 24380,
    dividendYield: 5.46,
    openPrice: 103500,
    highPrice: 104200,
    lowPrice: 101800,
    prevClose: 103500,
    foreignNetBuy: 80,
    instNetBuy: -150,
    candles: generateCandles(102400, 0.015),
    sparkline: [103500, 103e3, 102500, 102e3, 102800, 102200, 102400]
  },
  {
    symbol: "035420",
    name: "NAVER",
    market: "KOSPI",
    sector: "IT\uC778\uD130\uB137 / \uD50C\uB7AB\uD3FC",
    price: 172500,
    change: 3200,
    changePercent: 1.89,
    volume: 782e3,
    volumeRatio: 125,
    tradingValue: 1350,
    high52w: 226e3,
    low52w: 151100,
    marketCap: 279e3,
    per: 18.2,
    pbr: 1.05,
    eps: 9478,
    dividendYield: 0.65,
    openPrice: 169500,
    highPrice: 173500,
    lowPrice: 169e3,
    prevClose: 169300,
    foreignNetBuy: 320,
    instNetBuy: 210,
    candles: generateCandles(172500, 0.02),
    sparkline: [169300, 17e4, 171200, 172e3, 171800, 172200, 172500]
  },
  {
    symbol: "035720",
    name: "\uCE74\uCE74\uC624",
    market: "KOSPI",
    sector: "IT\uC778\uD130\uB137 / \uD50C\uB7AB\uD3FC",
    price: 38450,
    change: 450,
    changePercent: 1.18,
    volume: 145e4,
    volumeRatio: 108,
    tradingValue: 557,
    high52w: 61900,
    low52w: 33500,
    marketCap: 171e3,
    per: 31.4,
    pbr: 1.12,
    eps: 1224,
    dividendYield: 0.16,
    openPrice: 38e3,
    highPrice: 38800,
    lowPrice: 37900,
    prevClose: 38e3,
    foreignNetBuy: 110,
    instNetBuy: 90,
    candles: generateCandles(38450, 0.02),
    sparkline: [38e3, 38100, 38300, 38600, 38400, 38350, 38450]
  },
  {
    symbol: "068270",
    name: "\uC140\uD2B8\uB9AC\uC628",
    market: "KOSPI",
    sector: "\uBC14\uC774\uC624 / \uBC14\uC774\uC624\uC2DC\uBC00\uB7EC",
    price: 198200,
    change: 4200,
    changePercent: 2.16,
    volume: 98e4,
    volumeRatio: 130.4,
    tradingValue: 1940,
    high52w: 241e3,
    low52w: 136e3,
    marketCap: 432e3,
    per: 34.2,
    pbr: 2.35,
    eps: 5795,
    dividendYield: 0.25,
    openPrice: 194500,
    highPrice: 199500,
    lowPrice: 194e3,
    prevClose: 194e3,
    foreignNetBuy: 450,
    instNetBuy: 310,
    candles: generateCandles(198200, 0.02),
    sparkline: [194e3, 195200, 196400, 197500, 197e3, 198e3, 198200]
  },
  {
    symbol: "012450",
    name: "\uD55C\uD654\uC5D0\uC5B4\uB85C\uC2A4\uD398\uC774\uC2A4",
    market: "KOSPI",
    sector: "\uBC29\uC704\uC0B0\uC5C5 / \uD56D\uACF5\uC6B0\uC8FC",
    price: 342e3,
    change: 22e3,
    changePercent: 6.88,
    volume: 812e3,
    volumeRatio: 260.5,
    tradingValue: 2780,
    high52w: 368e3,
    low52w: 97800,
    marketCap: 173e3,
    per: 24.5,
    pbr: 3.4,
    eps: 13959,
    dividendYield: 0.35,
    openPrice: 323e3,
    highPrice: 345e3,
    lowPrice: 322e3,
    prevClose: 32e4,
    foreignNetBuy: 890,
    instNetBuy: 480,
    candles: generateCandles(342e3, 0.035),
    sparkline: [32e4, 325e3, 331e3, 338e3, 336e3, 34e4, 342e3]
  },
  {
    symbol: "000250",
    name: "\uC0BC\uCC9C\uB2F9\uC81C\uC57D",
    market: "KOSDAQ",
    sector: "\uBC14\uC774\uC624 / \uACBD\uAD6C\uC6A9\uC778\uC290\uB9B0",
    price: 142e3,
    change: 18500,
    changePercent: 14.98,
    volume: 341e4,
    volumeRatio: 520,
    tradingValue: 4840,
    high52w: 169e3,
    low52w: 52400,
    marketCap: 33400,
    per: 98.4,
    pbr: 14.5,
    eps: 1443,
    dividendYield: 0,
    openPrice: 125e3,
    highPrice: 146e3,
    lowPrice: 124500,
    prevClose: 123500,
    foreignNetBuy: 610,
    instNetBuy: 420,
    candles: generateCandles(142e3, 0.05),
    sparkline: [123500, 127e3, 132e3, 138e3, 137e3, 14e4, 142e3]
  },
  {
    symbol: "207940",
    name: "\uC0BC\uC131\uBC14\uC774\uC624\uB85C\uC9C1\uC2A4",
    market: "KOSPI",
    sector: "\uBC14\uC774\uC624 / CDMO",
    price: 1045e3,
    change: 15e3,
    changePercent: 1.46,
    volume: 68400,
    volumeRatio: 110.2,
    tradingValue: 715,
    high52w: 111e4,
    low52w: 673e3,
    marketCap: 744e3,
    per: 68.2,
    pbr: 6.4,
    eps: 15322,
    dividendYield: 0,
    openPrice: 1032e3,
    highPrice: 1052e3,
    lowPrice: 103e4,
    prevClose: 103e4,
    foreignNetBuy: 240,
    instNetBuy: 180,
    candles: generateCandles(1045e3, 0.018),
    sparkline: [103e4, 1035e3, 104e4, 1048e3, 1042e3, 1044e3, 1045e3]
  },
  {
    symbol: "417860",
    name: "\uC0BC\uD604",
    market: "KOSDAQ",
    sector: "\uB85C\uBD07 / \uC2A4\uB9C8\uD2B8\uC561\uCD94\uC5D0\uC774\uD130",
    price: 43200,
    change: -3900,
    changePercent: -8.28,
    volume: 182e4,
    volumeRatio: 310,
    tradingValue: 786,
    high52w: 78e3,
    low52w: 39e3,
    marketCap: 4560,
    per: 35,
    pbr: 3.1,
    eps: 1234,
    dividendYield: 0,
    openPrice: 47e3,
    highPrice: 47500,
    lowPrice: 42800,
    prevClose: 47100,
    foreignNetBuy: -180,
    instNetBuy: -220,
    candles: generateCandles(43200, 0.045),
    sparkline: [47100, 46e3, 45200, 44e3, 44500, 43600, 43200]
  },
  {
    symbol: "005490",
    name: "POSCO\uD640\uB529\uC2A4",
    market: "KOSPI",
    sector: "\uCCA0\uAC15 / 2\uCC28\uC804\uC9C0\uC18C\uC7AC",
    price: 368e3,
    change: 6500,
    changePercent: 1.8,
    volume: 54e4,
    volumeRatio: 112.5,
    tradingValue: 1980,
    high52w: 538e3,
    low52w: 32e4,
    marketCap: 311e3,
    per: 16.4,
    pbr: 0.58,
    eps: 22450,
    dividendYield: 2.72,
    openPrice: 362e3,
    highPrice: 371e3,
    lowPrice: 361500,
    prevClose: 361500,
    foreignNetBuy: 410,
    instNetBuy: 220,
    candles: generateCandles(368e3, 0.02),
    sparkline: [361500, 363e3, 365e3, 366e3, 364e3, 367e3, 368e3]
  },
  {
    symbol: "105560",
    name: "KB\uAE08\uC735",
    market: "KOSPI",
    sector: "\uAE08\uC735 / \uC9C0\uC8FC\uC0AC",
    price: 88500,
    change: 2200,
    changePercent: 2.55,
    volume: 142e4,
    volumeRatio: 135,
    tradingValue: 1250,
    high52w: 94500,
    low52w: 48e3,
    marketCap: 356e3,
    per: 6.8,
    pbr: 0.52,
    eps: 13014,
    dividendYield: 3.85,
    openPrice: 86500,
    highPrice: 89200,
    lowPrice: 86300,
    prevClose: 86300,
    foreignNetBuy: 850,
    instNetBuy: 540,
    candles: generateCandles(88500, 0.015),
    sparkline: [86300, 86800, 87400, 88e3, 87800, 88300, 88500]
  },
  {
    symbol: "055550",
    name: "\uC2E0\uD55C\uC9C0\uC8FC",
    market: "KOSPI",
    sector: "\uAE08\uC735 / \uC740\uD589",
    price: 54800,
    change: 1100,
    changePercent: 2.05,
    volume: 189e4,
    volumeRatio: 128,
    tradingValue: 1030,
    high52w: 64500,
    low52w: 35200,
    marketCap: 279e3,
    per: 5.9,
    pbr: 0.48,
    eps: 9288,
    dividendYield: 4.1,
    openPrice: 53900,
    highPrice: 55200,
    lowPrice: 53700,
    prevClose: 53700,
    foreignNetBuy: 620,
    instNetBuy: 380,
    candles: generateCandles(54800, 0.015),
    sparkline: [53700, 54e3, 54400, 54600, 54300, 54700, 54800]
  },
  {
    symbol: "051910",
    name: "LG\uD654\uD559",
    market: "KOSPI",
    sector: "\uD654\uD559 / \uCCA8\uB2E8\uC18C\uC7AC",
    price: 326e3,
    change: -4500,
    changePercent: -1.36,
    volume: 245e3,
    volumeRatio: 88.5,
    tradingValue: 798,
    high52w: 524e3,
    low52w: 295e3,
    marketCap: 23e4,
    per: 24.2,
    pbr: 0.82,
    eps: 13471,
    dividendYield: 1.05,
    openPrice: 331e3,
    highPrice: 332e3,
    lowPrice: 324e3,
    prevClose: 330500,
    foreignNetBuy: -140,
    instNetBuy: -80,
    candles: generateCandles(326e3, 0.02),
    sparkline: [330500, 329e3, 327e3, 325500, 326500, 325e3, 326e3]
  },
  {
    symbol: "006400",
    name: "\uC0BC\uC131SDI",
    market: "KOSPI",
    sector: "2\uCC28\uC804\uC9C0 / \uC804\uC790\uC7AC\uB8CC",
    price: 358e3,
    change: -7e3,
    changePercent: -1.92,
    volume: 31e4,
    volumeRatio: 94,
    tradingValue: 1110,
    high52w: 504e3,
    low52w: 31e4,
    marketCap: 246e3,
    per: 18.5,
    pbr: 1.15,
    eps: 19351,
    dividendYield: 0.28,
    openPrice: 366e3,
    highPrice: 367e3,
    lowPrice: 356e3,
    prevClose: 365e3,
    foreignNetBuy: -210,
    instNetBuy: -150,
    candles: generateCandles(358e3, 0.02),
    sparkline: [365e3, 363e3, 361e3, 359e3, 36e4, 357e3, 358e3]
  },
  {
    symbol: "259960",
    name: "\uD06C\uB798\uD504\uD1A4",
    market: "KOSPI",
    sector: "\uAC8C\uC784 / \uC18C\uD504\uD2B8\uC6E8\uC5B4",
    price: 332e3,
    change: 14e3,
    changePercent: 4.4,
    volume: 42e4,
    volumeRatio: 185,
    tradingValue: 1390,
    high52w: 362e3,
    low52w: 152e3,
    marketCap: 161e3,
    per: 21.5,
    pbr: 2.85,
    eps: 15441,
    dividendYield: 0,
    openPrice: 32e4,
    highPrice: 335e3,
    lowPrice: 319e3,
    prevClose: 318e3,
    foreignNetBuy: 580,
    instNetBuy: 320,
    candles: generateCandles(332e3, 0.025),
    sparkline: [318e3, 321e3, 325e3, 328e3, 327e3, 33e4, 332e3]
  },
  {
    symbol: "329180",
    name: "HD\uD604\uB300\uC911\uACF5\uC5C5",
    market: "KOSPI",
    sector: "\uC870\uC120 / \uBC29\uC704\uC0B0\uC5C5",
    price: 184500,
    change: 7500,
    changePercent: 4.24,
    volume: 68e4,
    volumeRatio: 190,
    tradingValue: 1250,
    high52w: 206e3,
    low52w: 104e3,
    marketCap: 163e3,
    per: 32,
    pbr: 2.95,
    eps: 5765,
    dividendYield: 0,
    openPrice: 178e3,
    highPrice: 186e3,
    lowPrice: 177500,
    prevClose: 177e3,
    foreignNetBuy: 490,
    instNetBuy: 380,
    candles: generateCandles(184500, 0.03),
    sparkline: [177e3, 179e3, 181500, 183e3, 182e3, 184e3, 184500]
  },
  {
    symbol: "042660",
    name: "\uD55C\uD654\uC624\uC158",
    market: "KOSPI",
    sector: "\uC870\uC120 / \uC7A0\uC218\uD568\uBC29\uC0B0",
    price: 36200,
    change: 1850,
    changePercent: 5.39,
    volume: 582e4,
    volumeRatio: 260,
    tradingValue: 2100,
    high52w: 42e3,
    low52w: 20800,
    marketCap: 110900,
    per: 45,
    pbr: 2.65,
    eps: 804,
    dividendYield: 0,
    openPrice: 34500,
    highPrice: 36800,
    lowPrice: 34200,
    prevClose: 34350,
    foreignNetBuy: 780,
    instNetBuy: 420,
    candles: generateCandles(36200, 0.035),
    sparkline: [34350, 34800, 35300, 35800, 35500, 36e3, 36200]
  },
  {
    symbol: "000100",
    name: "\uC720\uD55C\uC591\uD589",
    market: "KOSPI",
    sector: "\uBC14\uC774\uC624 / \uD3D0\uC554\uC2E0\uC57D",
    price: 148500,
    change: 8500,
    changePercent: 6.07,
    volume: 312e4,
    volumeRatio: 290,
    tradingValue: 4630,
    high52w: 167e3,
    low52w: 54e3,
    marketCap: 118e3,
    per: 78.5,
    pbr: 4.8,
    eps: 1891,
    dividendYield: 0.35,
    openPrice: 141e3,
    highPrice: 151e3,
    lowPrice: 140500,
    prevClose: 14e4,
    foreignNetBuy: 920,
    instNetBuy: 610,
    candles: generateCandles(148500, 0.035),
    sparkline: [14e4, 142500, 145e3, 147500, 146e3, 148e3, 148500]
  },
  {
    symbol: "352820",
    name: "\uD558\uC774\uBE0C",
    market: "KOSPI",
    sector: "\uC5D4\uD130 / K-POP",
    price: 182e3,
    change: 3500,
    changePercent: 1.96,
    volume: 48e4,
    volumeRatio: 115,
    tradingValue: 873,
    high52w: 258e3,
    low52w: 157500,
    marketCap: 75800,
    per: 38,
    pbr: 2.45,
    eps: 4789,
    dividendYield: 0.38,
    openPrice: 179500,
    highPrice: 184500,
    lowPrice: 179e3,
    prevClose: 178500,
    foreignNetBuy: 220,
    instNetBuy: 180,
    candles: generateCandles(182e3, 0.02),
    sparkline: [178500, 18e4, 181200, 182500, 181800, 181500, 182e3]
  },
  {
    symbol: "066570",
    name: "LG\uC804\uC790",
    market: "KOSPI",
    sector: "\uAC00\uC804 / \uC804\uC7A5\uBD80\uD488",
    price: 98500,
    change: -1200,
    changePercent: -1.2,
    volume: 68e4,
    volumeRatio: 85,
    tradingValue: 670,
    high52w: 117e3,
    low52w: 89e3,
    marketCap: 161e3,
    per: 8.5,
    pbr: 0.72,
    eps: 11588,
    dividendYield: 1.52,
    openPrice: 99800,
    highPrice: 100500,
    lowPrice: 98100,
    prevClose: 99700,
    foreignNetBuy: -80,
    instNetBuy: -60,
    candles: generateCandles(98500, 0.015),
    sparkline: [99700, 99400, 99e3, 98600, 98800, 98300, 98500]
  },
  {
    symbol: "028300",
    name: "HLB",
    market: "KOSDAQ",
    sector: "\uBC14\uC774\uC624 / \uD56D\uC554\uC81C",
    price: 84200,
    change: 5400,
    changePercent: 6.85,
    volume: 245e4,
    volumeRatio: 310,
    tradingValue: 2060,
    high52w: 129e3,
    low52w: 29800,
    marketCap: 110200,
    per: 99.9,
    pbr: 11.2,
    eps: 842,
    dividendYield: 0,
    openPrice: 79500,
    highPrice: 85900,
    lowPrice: 79200,
    prevClose: 78800,
    foreignNetBuy: 640,
    instNetBuy: 390,
    candles: generateCandles(84200, 0.04),
    sparkline: [78800, 80200, 81800, 83500, 82900, 83900, 84200]
  },
  {
    symbol: "348370",
    name: "\uC5D4\uCF10",
    market: "KOSDAQ",
    sector: "2\uCC28\uC804\uC9C0 \uC804\uD574\uC561",
    price: 198e3,
    change: 11500,
    changePercent: 6.17,
    volume: 89e4,
    volumeRatio: 240,
    tradingValue: 1760,
    high52w: 358500,
    low52w: 52e3,
    marketCap: 38200,
    per: 52,
    pbr: 7.4,
    eps: 3807,
    dividendYield: 0,
    openPrice: 188e3,
    highPrice: 201e3,
    lowPrice: 187e3,
    prevClose: 186500,
    foreignNetBuy: 340,
    instNetBuy: 210,
    candles: generateCandles(198e3, 0.035),
    sparkline: [186500, 189e3, 192e3, 195500, 194e3, 197e3, 198e3]
  },
  {
    symbol: "141080",
    name: "\uB9AC\uAC00\uCF10\uBC14\uC774\uC624",
    market: "KOSDAQ",
    sector: "\uBC14\uC774\uC624 / ADC\uD56D\uC554",
    price: 122e3,
    change: 9800,
    changePercent: 8.73,
    volume: 175e4,
    volumeRatio: 340,
    tradingValue: 2130,
    high52w: 138e3,
    low52w: 39500,
    marketCap: 44200,
    per: 75,
    pbr: 8.9,
    eps: 1626,
    dividendYield: 0,
    openPrice: 113500,
    highPrice: 124500,
    lowPrice: 113e3,
    prevClose: 112200,
    foreignNetBuy: 520,
    instNetBuy: 410,
    candles: generateCandles(122e3, 0.04),
    sparkline: [112200, 114500, 117500, 120500, 119500, 121500, 122e3]
  },
  {
    symbol: "277810",
    name: "\uB808\uC778\uBCF4\uC6B0\uB85C\uBCF4\uD2F1\uC2A4",
    market: "KOSDAQ",
    sector: "\uB85C\uBD07 / \uD611\uB3D9\uB85C\uBD07",
    price: 138500,
    change: 5500,
    changePercent: 4.14,
    volume: 41e4,
    volumeRatio: 160,
    tradingValue: 567,
    high52w: 242e3,
    low52w: 121e3,
    marketCap: 26800,
    per: 99.9,
    pbr: 12.5,
    eps: 1385,
    dividendYield: 0,
    openPrice: 134e3,
    highPrice: 141e3,
    lowPrice: 133500,
    prevClose: 133e3,
    foreignNetBuy: 180,
    instNetBuy: 90,
    candles: generateCandles(138500, 0.03),
    sparkline: [133e3, 134500, 136e3, 138e3, 137e3, 138e3, 138500]
  },
  {
    symbol: "257720",
    name: "\uC2E4\uB9AC\uCF58\uD22C",
    market: "KOSDAQ",
    sector: "\uD654\uC7A5\uD488\uC720\uD1B5 / K\uBDF0\uD2F0",
    price: 46800,
    change: 3200,
    changePercent: 7.34,
    volume: 389e4,
    volumeRatio: 310,
    tradingValue: 1820,
    high52w: 54600,
    low52w: 7800,
    marketCap: 28500,
    per: 26.5,
    pbr: 6.8,
    eps: 1766,
    dividendYield: 0.55,
    openPrice: 44e3,
    highPrice: 47800,
    lowPrice: 43800,
    prevClose: 43600,
    foreignNetBuy: 670,
    instNetBuy: 420,
    candles: generateCandles(46800, 0.038),
    sparkline: [43600, 44500, 45300, 46200, 45800, 46500, 46800]
  }
];
var INITIAL_NEWS = [
  {
    id: "news-1",
    title: '"HBM \uD328\uAD8C \uAD73\uD78C\uB2E4" SK\uD558\uC774\uB2C9\uC2A4 19\uB9CC\uC6D0 \uB3CC\uD30C... \uC678\uC778\xB7\uAE30\uAD00 \uC30D\uB04C\uC774 \uB9E4\uC218',
    summary: "\uC5D4\uBE44\uB514\uC544\uD5A5 \uCC28\uC138\uB300 AI \uAC00\uC18D\uAE30 \uBA54\uBAA8\uB9AC \uB3C5\uC810 \uACF5\uAE09 \uAE30\uB300\uAC10\uC73C\uB85C \uC7A5\uC911 19\uB9CC6000\uC6D0\uAE4C\uC9C0 \uCE58\uC19F\uC73C\uBA70 52\uC8FC \uC2E0\uACE0\uAC00 \uAC00\uC2DC\uAD8C \uC9C4\uC785.",
    source: "\uD55C\uAD6D\uACBD\uC81C",
    time: "25\uBD84 \uC804",
    url: "#",
    relatedSymbols: ["000660", "005930", "042700"],
    sentiment: "positive"
  },
  {
    id: "news-2",
    title: "\uCF54\uC2A4\uD53C, \uBC18\uB3C4\uCCB4\xB7\uBC29\uC0B0\uC8FC \uB7A0\uB9AC\uC5D0 2680\uC120 \uC548\uCC29... \uCF54\uC2A4\uB2E5\uC740 2\uCC28\uC804\uC9C0 \uBD80\uC9C4\uC5D0 \uD63C\uC870\uC138",
    summary: "\uC6D0/\uB2EC\uB7EC \uD658\uC728 \uC548\uC815\uACFC \uBBF8\uAD6D \uC99D\uC2DC \uAC15\uC138 \uC601\uD5A5\uC73C\uB85C \uCF54\uC2A4\uD53C \uC9C0\uC218\uAC00 \uBC18\uB4F1\uC138\uB97C \uBCF4\uC774\uACE0 \uC788\uB294 \uBC18\uBA74, \uCF54\uC2A4\uB2E5\uC740 2\uCC28\uC804\uC9C0 \uC218\uAE09 \uACF5\uBC31\uC73C\uB85C \uC57D\uC138.",
    source: "\uB9E4\uC77C\uACBD\uC81C",
    time: "42\uBD84 \uC804",
    url: "#",
    relatedSymbols: ["005930", "064350", "247540"],
    sentiment: "neutral"
  },
  {
    id: "news-3",
    title: '\uC54C\uD14C\uC624\uC820, \uC2E0\uACE0\uAC00 \uB7A0\uB9AC \uACC4\uC18D..."\uBA38\uD06C \uD0A4\uD2B8\uB8E8\uB2E4SC \uC0C1\uC5C5\uD654 \uB85C\uC5F4\uD2F0 \uAC00\uC2DC\uD654"',
    summary: "\uC99D\uAD8C\uAC00\uC5D0\uC11C\uB294 \uC54C\uD14C\uC624\uC820\uC758 \uAE30\uC5C5\uAC00\uCE58\uAC00 \uD5A5\uD6C4 \uB3C5\uC810\uC801 \uD53C\uD558\uC8FC\uC0AC \uAE30\uC220\uB825\uC73C\uB85C \uC778\uD574 \uCD94\uAC00 \uC0C1\uC2B9 \uC5EC\uB825\uC774 \uCDA9\uBD84\uD558\uB2E4\uACE0 \uD3C9\uAC00\uD588\uB2E4.",
    source: "\uBA38\uB2C8\uD22C\uB370\uC774",
    time: "1\uC2DC\uAC04 \uC804",
    url: "#",
    relatedSymbols: ["196170", "068270"],
    sentiment: "positive"
  },
  {
    id: "news-4",
    title: "K-\uBC29\uC0B0 \uCCB4\uCF54\xB7\uD3F4\uB780\uB4DC \uC7AD\uD31F \uC787\uB530\uB77C... \uD604\uB300\uB85C\uD15C\xB7\uD55C\uD654\uC5D0\uC5B4\uB85C 52\uC8FC \uCD5C\uACE0\uAC00 \uACBD\uC2E0 \uC2DC\uB3C4",
    summary: "\uC720\uB7FD\uACFC \uC911\uB3D9\uBC1C \uC548\uBCF4 \uBD88\uC548 \uACE0\uC870\uB85C K2 \uC804\uCC28\uC640 K9 \uC790\uC8FC\uD3EC\uC758 \uCD94\uAC00 \uC218\uC8FC \uC18C\uC2DD\uC774 \uC784\uBC15\uD588\uB2E4\uB294 \uC18C\uC2DD\uC5D0 \uBC29\uC0B0 \uB300\uC7A5\uC8FC\uB4E4\uC774 \uAE09\uB4F1\uC138\uB2E4.",
    source: "\uC5F0\uD569\uC778\uD3EC\uB9E5\uC2A4",
    time: "2\uC2DC\uAC04 \uC804",
    url: "#",
    relatedSymbols: ["064350", "012450"],
    sentiment: "positive"
  },
  {
    id: "news-5",
    title: "2\uCC28\uC804\uC9C0 \uD14C\uB9C8\uC8FC, \uC720\uB7FD \uC804\uAE30\uCC28 \uD310\uB9E4 \uB454\uD654 \uC18C\uC2DD\uC5D0 \uC77C\uC81C\uD788 \uD558\uB77D \uC804\uD658",
    summary: "\uC5D0\uCF54\uD504\uB85C\uBE44\uC5E0, \uC5D0\uCF54\uD504\uB85C \uB4F1 \uC8FC\uC694 \uC591\uADF9\uC7AC \uC5C5\uCCB4\uB4E4\uC774 \uB2E8\uAE30 \uC2E4\uC801 \uBC18\uB4F1 \uC9C0\uC5F0 \uC6B0\uB824\uB85C 4~5%\uB300 \uD558\uB77D\uC138\uB97C \uAE30\uB85D \uC911\uC774\uB2E4.",
    source: "\uC774\uB370\uC77C\uB9AC",
    time: "3\uC2DC\uAC04 \uC804",
    url: "#",
    relatedSymbols: ["247540", "086520", "373220"],
    sentiment: "negative"
  }
];
var INITIAL_POSTS = [
  {
    id: "post-1",
    author: {
      id: "user-vip-1",
      name: "\uC5EC\uC758\uB3C4\uB2E8\uD0C0\uC694\uC815",
      avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80",
      badge: "\uC218\uC775\uB960 TOP 1%",
      tier: "\uB2E4\uC774\uC544"
    },
    category: "discussion",
    title: "[\uC885\uBAA9\uD1A0\uB860] SK\uD558\uC774\uB2C9\uC2A4 20\uB9CC\uC6D0 \uB3CC\uD30C \uC2DC\uB098\uB9AC\uC624\uC640 \uC800\uD56D\uC120 \uCCB4\uD06C",
    content: `\uC624\uB298 \uC678\uC778 \uC218\uAE09\uC774 3800\uC5B5 \uC774\uC0C1 \uB4E4\uC5B4\uC624\uACE0 \uC788\uC2B5\uB2C8\uB2E4.
\uC5D4\uBE44\uB514\uC544\uD5A5 \uCC28\uC138\uB300 HBM \uBB3C\uB7C9 \uBC30\uC815\uC774 \uC774\uBBF8 \uD655\uC815\uB41C \uC0C1\uD0DC\uC5D0\uC11C, 185,000\uC6D0\uC758 \uC804\uACE0\uC810 \uB9E4\uBB3C\uB300\uB97C \uC544\uC8FC \uAE54\uB054\uD55C \uAC70\uB798\uB7C9 \uC2E4\uB9B0 \uC7A5\uB300\uC591\uBD09\uC73C\uB85C \uB3CC\uD30C\uD588\uC2B5\uB2C8\uB2E4.

\uB2E8\uAE30 1\uCC28 \uBAA9\uD45C\uAC00\uB294 215,000\uC6D0 \uBD80\uADFC\uC73C\uB85C \uBCF4\uACE0 \uC788\uC73C\uBA70, 5\uC77C \uC774\uB3D9\uD3C9\uADE0\uC120(191,000\uC6D0) \uC774\uD0C8 \uC804\uAE4C\uC9C0\uB294 \uB20C\uB9BC\uBAA9\uB9C8\uB2E4 \uBD84\uD560 \uB9E4\uC218 \uAD00\uC810\uC774 \uC720\uD6A8\uD558\uB2E4\uACE0 \uBD05\uB2C8\uB2E4.

\uBC18\uB3C4\uCCB4 \uC18C\uBD80\uC7A5 \uB300\uC7A5\uC778 \uD55C\uBBF8\uBC18\uB3C4\uCCB4\uC640 \uD568\uAED8 \uC9DD\uC9D3\uAE30 \uB9E4\uB9E4 \uC804\uB7B5\uB3C4 \uAC15\uB825 \uCD94\uCC9C\uD569\uB2C8\uB2E4.

* \uD22C\uC790\uC758 \uCC45\uC784\uC740 \uBCF8\uC778\uC5D0\uAC8C \uC788\uC2B5\uB2C8\uB2E4. \uC131\uD22C\uD558\uC2ED\uC2DC\uC624!`,
    symbol: "000660",
    symbolName: "SK\uD558\uC774\uB2C9\uC2A4",
    likes: 142,
    likedBy: [],
    views: 3840,
    commentsCount: 24,
    createdAt: "15\uBD84 \uC804",
    isHot: true,
    tags: ["SK\uD558\uC774\uB2C9\uC2A4", "HBM", "\uAE30\uC220\uC801\uBD84\uC11D", "\uB2E8\uD0C0\uC804\uB7B5"],
    comments: [
      {
        id: "c-1",
        postId: "post-1",
        author: {
          id: "user-2",
          name: "\uD55C\uAC15\uBDF0\uAC00\uC790",
          avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80",
          badge: "\uC815\uD68C\uC6D0"
        },
        content: "\uBD84\uC11D \uAE54\uB054\uD558\uB124\uC694! \uC624\uB298 193,000\uC6D0\uC5D0 \uBD88\uD0C0\uAE30 \uD0D1\uC2B9\uD588\uC2B5\uB2C8\uB2E4. 20\uB9CC\uB2C9\uC2A4 \uAC00\uC988\uC544!",
        createdAt: "10\uBD84 \uC804",
        likes: 18
      },
      {
        id: "c-2",
        postId: "post-1",
        author: {
          id: "user-3",
          name: "\uAC00\uCE58\uD22C\uC790\uB7EC",
          avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80",
          badge: "\uC6B0\uC218\uD68C\uC6D0"
        },
        content: "\uC678\uC778 \uB9E4\uC218\uAC00 \uC9C4\uC9DC \uBB34\uC12D\uB124\uC694. \uC0BC\uC804 \uB35C\uC5B4\uB0B4\uACE0 \uD558\uC774\uB2C9\uC2A4\uB85C \uAC08\uC544\uD0C0\uAE38 \uC815\uB9D0 \uC798\uD588\uC2B5\uB2C8\uB2E4.",
        createdAt: "7\uBD84 \uC804",
        likes: 9
      }
    ]
  },
  {
    id: "post-2",
    author: {
      id: "user-vip-2",
      name: "\uBC14\uC774\uC624\uC2B9\uBD80\uC0AC",
      avatar: "https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop&q=80",
      badge: "\uBC14\uC774\uC624 \uC7A5\uC778",
      tier: "\uB9C8\uC2A4\uD130"
    },
    category: "invest",
    title: "[\uD22C\uC790\uC815\uBCF4] \uC54C\uD14C\uC624\uC820 +128% \uC911\uAC04 \uACB0\uC0B0 \uBC0F SC \uD50C\uB7AB\uD3FC \uAC00\uCE58 \uC0B0\uC815 \uB9AC\uD3EC\uD2B8",
    content: `\uC62C\uD574 \uCD08 16\uB9CC\uC6D0\uB300\uBD80\uD130 \uAFB8\uC900\uD788 \uB9E4\uC9D1\uD574\uC628 \uC54C\uD14C\uC624\uC820\uC785\uB2C8\uB2E4.
\uD0A4\uD2B8\uB8E8\uB2E4 \uD53C\uD558\uC8FC\uC0AC(SC) \uB3C5\uC810 \uACF5\uAE09 \uACC4\uC57D\uC5D0 \uB300\uD55C \uC2DC\uC7A5\uC758 \uC758\uAD6C\uC2EC\uC774 \uC644\uC804\uD788 \uD574\uC18C\uB418\uC5C8\uACE0, \uC774\uC81C\uB294 \uAE00\uB85C\uBC8C \uAE30\uC220\uC774\uC804 \uD50C\uB7AB\uD3FC \uAE30\uC5C5\uC73C\uB85C \uC7AC\uD3C9\uAC00\uBC1B\uACE0 \uC788\uC2B5\uB2C8\uB2E4.

\uCD1D \uD3C9\uAC00\uC190\uC775: +128.4% (\uD3C9\uAC00\uC775 8,400\uB9CC\uC6D0)
\uC544\uC9C1 \uB9E4\uB3C4\uD560 \uC0DD\uAC01 \uC804\uD600 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA38\uD06C \uC2B9\uC778 \uB098\uB294 \uB0B4\uB144\uAE4C\uC9C0 \uD640\uB529\uD569\uB2C8\uB2E4.`,
    symbol: "196170",
    symbolName: "\uC54C\uD14C\uC624\uC820",
    likes: 215,
    likedBy: [],
    views: 5920,
    commentsCount: 38,
    createdAt: "1\uC2DC\uAC04 \uC804",
    isHot: true,
    tags: ["\uC54C\uD14C\uC624\uC820", "\uC218\uC775\uC778\uC99D", "\uBC14\uC774\uC624", "\uC874\uBC84"],
    comments: [
      {
        id: "c-3",
        postId: "post-2",
        author: {
          id: "user-4",
          name: "\uC8FC\uB9B0\uC774\uD0C8\uCD9C\uAE30",
          avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80",
          badge: "\uC0C8\uC2F9"
        },
        content: "\uC6B0\uC640... \uBA58\uD0C8\uC774 \uB300\uB2E8\uD558\uC2ED\uB2C8\uB2E4. \uC800\uB7F0 \uC218\uC775\uB960\uC744 \uBCF4\uB824\uBA74 \uC5BC\uB9C8\uB098 \uD754\uB4E4\uAE30\uB97C \uACAC\uB38C\uC57C \uD560\uAE4C\uC694.",
        createdAt: "40\uBD84 \uC804",
        likes: 12
      }
    ]
  },
  {
    id: "post-3",
    author: {
      id: "user-5",
      name: "\uBC29\uC0B0\uC758\uD798",
      avatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80",
      badge: "\uBC29\uC0B0\uC804\uBB38",
      tier: "\uACE8\uB4DC"
    },
    category: "market",
    title: "[\uC2DC\uC7A5\uC815\uBCF4] \uD604\uB300\uB85C\uD15C & \uD55C\uD654\uC5D0\uC5B4\uB85C: \uD3F4\uB780\uB4DC 2\uCC28 \uC2E4\uD589\uACC4\uC57D\uACFC \uB8E8\uB9C8\uB2C8\uC544 \uC218\uC8FC \uBAA8\uBA58\uD140",
    content: `\uBC29\uC0B0 \uC139\uD130\uB294 \uB2E8\uC21C \uD14C\uB9C8\uAC00 \uC544\uB2C8\uB77C \uAD6C\uC870\uC801 \uC2E4\uC801 \uC131\uC7A5\uAE30\uC785\uB2C8\uB2E4.
\uC218\uC8FC\uC794\uACE0\uB9CC \uC218\uC2ED\uC870 \uC6D0\uC5D0 \uB2EC\uD558\uACE0, \uB0A9\uAE30 \uC900\uC218 \uB2A5\uB825 \uBA74\uC5D0\uC11C \uC11C\uBC29 \uAD6D\uAC00\uB4E4 \uC911 \uD55C\uAD6D\uC744 \uB300\uCCB4\uD560 \uC218 \uC788\uB294 \uB098\uB77C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.
\uC624\uB298 \uC7A5\uB300\uC591\uBD09\uC740 \uAE30\uAD00\uC758 \uD3EC\uD2B8\uD3F4\uB9AC\uC624 \uBE44\uC911 \uD655\uB300 \uC2E0\uD638\uD0C4\uC73C\uB85C \uBCF4\uC785\uB2C8\uB2E4.`,
    symbol: "064350",
    symbolName: "\uD604\uB300\uB85C\uD15C",
    likes: 89,
    likedBy: [],
    views: 2100,
    commentsCount: 15,
    createdAt: "2\uC2DC\uAC04 \uC804",
    isHot: false,
    tags: ["\uD604\uB300\uB85C\uD15C", "\uBC29\uC0B0", "\uD55C\uD654\uC5D0\uC5B4\uB85C\uC2A4\uD398\uC774\uC2A4", "\uC2E4\uC801\uC8FC"],
    comments: []
  },
  {
    id: "post-4",
    author: {
      id: "admin-1",
      name: "\uBCD1\uB3CC\uC778\uBCA0\uC2A4\uD2B8 \uC6B4\uC601\uC790",
      avatar: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100&auto=format&fit=crop&q=80",
      badge: "\uACF5\uC2DD\uC6B4\uC601\uC790",
      tier: "\uAD00\uB9AC\uC790"
    },
    category: "notice",
    title: "[\uACF5\uC9C0] \uAC74\uC804\uD55C \uC8FC\uC2DD \uD22C\uC790 \uCEE4\uBBA4\uB2C8\uD2F0 \uC774\uC6A9 \uADDC\uCE59 \uBC0F \uD5C8\uC704\uC0AC\uC2E4 \uC720\uD3EC \uC81C\uC7AC \uC548\uB0B4",
    content: `\uC548\uB155\uD558\uC138\uC694, \uBCD1\uB3CC \uC778\uBCA0\uC2A4\uD2B8\uBA3C\uD2B8 \uD68C\uC6D0 \uC5EC\uB7EC\uBD84.
\uCD5C\uADFC \uD2B9\uC815 \uC138\uB825\uC758 \uC885\uBAA9 \uB9AC\uB529, \uBBF8\uACF5\uAC1C \uC815\uBCF4 \uC0AC\uCE6D, \uBE44\uBC29\uC131 \uD5C8\uC704\uC0AC\uC2E4 \uC720\uD3EC \uAC8C\uC2DC\uAE00\uC774 \uAC10\uC9C0\uB418\uACE0 \uC788\uC2B5\uB2C8\uB2E4.
\uC801\uBC1C \uC2DC \uBB34\uD1B5\uBCF4 \uC601\uAD6C \uC774\uC6A9\uC815\uC9C0 \uBC0F \uAD00\uB828 \uAE30\uAD00 \uC2E0\uACE0 \uC870\uCE58\uB420 \uC218 \uC788\uC73C\uB2C8 \uC720\uC758\uD558\uC2DC\uAE30 \uBC14\uB78D\uB2C8\uB2E4.
\uC2E4\uC2DC\uAC04 \uC2E0\uACE0 \uAE30\uB2A5\uC744 \uC801\uADF9 \uD65C\uC6A9\uD574 \uC8FC\uC2DC\uAE30 \uBC14\uB78D\uB2C8\uB2E4.`,
    likes: 350,
    likedBy: [],
    views: 12400,
    commentsCount: 42,
    createdAt: "1\uC77C \uC804",
    isNotice: true,
    tags: ["\uACF5\uC9C0\uC0AC\uD56D", "\uCEE4\uBBA4\uB2C8\uD2F0\uC774\uC6A9\uADDC\uCE59", "\uD074\uB9B0\uCEA0\uD398\uC778"],
    comments: []
  },
  {
    id: "post-5",
    author: {
      id: "user-6",
      name: "\uBC30\uD130\uB9AC\uC544\uC800\uC528\uD32C",
      avatar: "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=100&auto=format&fit=crop&q=80",
      badge: "\uC5F4\uD608\uD68C\uC6D0",
      tier: "\uC2E4\uBC84"
    },
    category: "qa",
    title: "[\uC9C8\uBB38/\uB2F5\uBCC0] \uC5D0\uCF54\uD504\uB85C\uBE44\uC5E0 \uC9C0\uAE08 \uBC14\uB2E5\uC77C\uAE4C\uC694? \uBB3C\uD0C0\uAE30 \uC2DC\uC810 \uC9C8\uBB38\uB4DC\uB9BD\uB2C8\uB2E4.",
    content: `\uD3C9\uB2E8\uAC00 24\uB9CC\uC6D0\uC778\uB370 \uC9C0\uAE08 15\uB9CC\uC6D0\uC120\uAE4C\uC9C0 \uB0B4\uB824\uC654\uB124\uC694...
\uB9E4\uCD9C \uC5ED\uC131\uC7A5\uC774 \uBA48\uCD94\uB294 \uC2DC\uC810\uC774 \uC5B8\uC81C\uCBE4\uC77C\uAE4C\uC694? LFP \uBC30\uD130\uB9AC \uC591\uC0B0 \uC18C\uC2DD \uB098\uC624\uBA74 \uBC18\uB4F1\uD560 \uC218 \uC788\uC744\uC9C0 \uACE0\uC218\uB2D8\uB4E4 \uACE0\uACAC \uBD80\uD0C1\uB4DC\uB9BD\uB2C8\uB2E4.`,
    symbol: "247540",
    symbolName: "\uC5D0\uCF54\uD504\uB85C\uBE44\uC5E0",
    likes: 34,
    likedBy: [],
    views: 1820,
    commentsCount: 29,
    createdAt: "3\uC2DC\uAC04 \uC804",
    isHot: false,
    tags: ["\uC5D0\uCF54\uD504\uB85C\uBE44\uC5E0", "\uBB3C\uD0C0\uAE30", "2\uCC28\uC804\uC9C0", "\uACE0\uBBFC\uC0C1\uB2F4"],
    comments: []
  },
  {
    id: "post-6",
    author: {
      id: "user-7",
      name: "\uC5EC\uC758\uB3C4\uCE74\uD398\uC778",
      avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&auto=format&fit=crop&q=80",
      badge: "\uC77C\uBC18\uD68C\uC6D0",
      tier: "\uBE0C\uB860\uC988"
    },
    category: "free",
    title: "[\uC790\uC720\uAC8C\uC2DC\uD310] \uC624\uB298 \uC7A5 \uB9C8\uAC10\uD558\uACE0 \uCE58\uB9E5 \uD55C\uC794 \uD558\uC2E4 \uBD84\uB4E4 \uACC4\uC2E0\uAC00\uC694 \u314E\u314E",
    content: `\uC624\uB298 \uBC18\uB3C4\uCCB4 \uAE09\uB4F1 \uB355\uBD84\uC5D0 \uB4DC\uB514\uC5B4 \uBE68\uAC04\uBD88 \uBD24\uC2B5\uB2C8\uB2E4! \uB2E4\uB4E4 \uC624\uB298 \uB9E4\uB9E4 \uC5B4\uB5A0\uC168\uB098\uC694? \uC218\uC775 \uB098\uC2E0 \uBD84\uB4E4 \uBAA8\uB450 \uCD95\uD558\uB4DC\uB9BD\uB2C8\uB2E4.`,
    likes: 28,
    likedBy: [],
    views: 950,
    commentsCount: 12,
    createdAt: "4\uC2DC\uAC04 \uC804",
    isHot: false,
    tags: ["\uC790\uC720\uD1A0\uB860", "\uCE58\uB9E5", "\uC218\uC775\uCD95\uD558"],
    comments: []
  }
];
function generateOrderBook(stock) {
  const price = stock.price;
  const tick = price >= 1e5 ? 500 : price >= 5e4 ? 100 : 50;
  const asks = [];
  const bids = [];
  let totalAskVolume = 0;
  let totalBidVolume = 0;
  for (let i = 10; i >= 1; i--) {
    const askPrice = price + i * tick;
    const vol = Math.round(1500 + Math.random() * 8e3 * (11 - i));
    totalAskVolume += vol;
    const chg = askPrice - stock.prevClose;
    const chgPct = chg / stock.prevClose * 100;
    asks.push({
      price: askPrice,
      volume: vol,
      change: chg,
      changePercent: chgPct,
      barPercent: 0
    });
  }
  for (let i = 1; i <= 10; i++) {
    const bidPrice = price - (i - 1) * tick;
    const vol = Math.round(2e3 + Math.random() * 9500 * (11 - i));
    totalBidVolume += vol;
    const chg = bidPrice - stock.prevClose;
    const chgPct = chg / stock.prevClose * 100;
    bids.push({
      price: bidPrice,
      volume: vol,
      change: chg,
      changePercent: chgPct,
      barPercent: 0
    });
  }
  const maxVol = Math.max(...asks.map((a) => a.volume), ...bids.map((b) => b.volume), 1);
  asks.forEach((a) => a.barPercent = Math.min(100, Math.round(a.volume / maxVol * 100)));
  bids.forEach((b) => b.barPercent = Math.min(100, Math.round(b.volume / maxVol * 100)));
  return {
    symbol: stock.symbol,
    currentPrice: price,
    asks,
    bids,
    totalAskVolume,
    totalBidVolume
  };
}

// server/marketMonitorService.ts
import { GoogleGenAI } from "@google/genai";
var monitoringConfig = {
  PRICE_RISE_ALERT_PERCENT: Number(process.env.PRICE_RISE_ALERT_PERCENT) || 5,
  // 급등: +5% 이상
  PRICE_FALL_ALERT_PERCENT: Number(process.env.PRICE_FALL_ALERT_PERCENT) || -5,
  // 급락: -5% 이하
  VOLUME_SPIKE_MULTIPLIER: Number(process.env.VOLUME_SPIKE_MULTIPLIER) || 2,
  // 거래량 급증: 평균 대비 200% 이상 (2.0배)
  TRADING_VALUE_ALERT_THRESHOLD: Number(process.env.TRADING_VALUE_ALERT_THRESHOLD) || 3e3,
  // 거래대금 급증: 3,000억 원 이상
  MARKET_INDEX_ALERT_PERCENT: Number(process.env.MARKET_INDEX_ALERT_PERCENT) || 2,
  // 시장 급변: 지수 ±2% 이상
  SIDECAR_THRESHOLD_PERCENT: Number(process.env.SIDECAR_THRESHOLD_PERCENT) || 5,
  // 사이드카: 지수 ±5% 이상
  CIRCUIT_BREAKER_LV1_PERCENT: Number(process.env.CIRCUIT_BREAKER_LV1_PERCENT) || -8,
  // 서킷브레이커: 지수 -8% 이하
  ALERT_COOLDOWN_MS: Number(process.env.ALERT_COOLDOWN_MS) || 18e4,
  // 중복 방지 쿨다운: 3분 (180,000ms)
  MONITORING_INTERVAL_MS: 4e3,
  // 감지 주기: 4초
  ENABLED: true
};
var cooldownMap = /* @__PURE__ */ new Map();
var recentAlertEvents = [];
var geminiApiKey = process.env.GEMINI_API_KEY || "";
var genAI = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
function getMonitoringConfig() {
  return { ...monitoringConfig };
}
function updateMonitoringConfig(newConfig) {
  monitoringConfig = {
    ...monitoringConfig,
    ...newConfig
  };
  console.log("[MarketMonitor] Config updated:", monitoringConfig);
  return { ...monitoringConfig };
}
function getRecentAlertEvents(scope, limit = 30) {
  let list = recentAlertEvents;
  if (scope) {
    list = list.filter((e) => e.scope === scope);
  }
  return list.slice(0, limit);
}
function isUnderCooldown(key, cooldownMs) {
  const lastTime = cooldownMap.get(key);
  if (!lastTime) return false;
  return Date.now() - lastTime < cooldownMs;
}
function recordCooldown(key) {
  cooldownMap.set(key, Date.now());
}
function pushAlertEvent(event) {
  const cooldownKey = `${event.scope}_${event.symbol || event.market || "KRX"}_${event.type}`;
  if (isUnderCooldown(cooldownKey, monitoringConfig.ALERT_COOLDOWN_MS)) {
    return null;
  }
  const newEvent = {
    ...event,
    id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: Date.now(),
    timestamp: (/* @__PURE__ */ new Date()).toLocaleTimeString("ko-KR", { hour12: false })
  };
  recordCooldown(cooldownKey);
  recentAlertEvents = [newEvent, ...recentAlertEvents].slice(0, 60);
  console.log(`[MarketMonitor] \u{1F6A8} Alert Triggered: [${newEvent.scope}] [${newEvent.type}] ${newEvent.title}`);
  return newEvent;
}
function evaluateMarketData(stocks, indices) {
  if (!monitoringConfig.ENABLED) return [];
  const triggered = [];
  for (const stock of stocks) {
    if (stock.changePercent >= monitoringConfig.PRICE_RISE_ALERT_PERCENT) {
      const evt = pushAlertEvent({
        type: "PRICE_SURGE",
        scope: "STOCK",
        title: `${stock.name} \uAE09\uB4F1 \uBC1C\uC0DD (+${stock.changePercent.toFixed(2)}%)`,
        description: `\uC124\uC815 \uAE30\uC900(${monitoringConfig.PRICE_RISE_ALERT_PERCENT}% \uC774\uC0C1)\uC744 \uCD08\uACFC\uD558\uC5EC \uD604\uC7AC\uAC00 ${stock.price.toLocaleString()}\uC6D0\uC5D0 \uAC70\uB798 \uC911\uC785\uB2C8\uB2E4.`,
        symbol: stock.symbol,
        symbolName: stock.name,
        market: stock.market,
        severity: stock.changePercent >= 15 ? "urgent" : "warning",
        metrics: {
          currentValue: stock.changePercent,
          threshold: monitoringConfig.PRICE_RISE_ALERT_PERCENT,
          unit: "%",
          changePercent: stock.changePercent,
          volume: stock.volume,
          tradingValue: stock.tradingValue
        }
      });
      if (evt) triggered.push(evt);
    }
    if (stock.changePercent <= monitoringConfig.PRICE_FALL_ALERT_PERCENT) {
      const evt = pushAlertEvent({
        type: "PRICE_PLUNGE",
        scope: "STOCK",
        title: `${stock.name} \uAE09\uB77D \uACBD\uBCF4 (${stock.changePercent.toFixed(2)}%)`,
        description: `\uC124\uC815 \uAE30\uC900(${monitoringConfig.PRICE_FALL_ALERT_PERCENT}% \uC774\uD558)\uC5D0 \uB3C4\uB2EC\uD558\uC5EC \uD604\uC7AC\uAC00 ${stock.price.toLocaleString()}\uC6D0\uC73C\uB85C \uAE09\uB77D\uC138\uC785\uB2C8\uB2E4.`,
        symbol: stock.symbol,
        symbolName: stock.name,
        market: stock.market,
        severity: stock.changePercent <= -10 ? "urgent" : "warning",
        metrics: {
          currentValue: stock.changePercent,
          threshold: monitoringConfig.PRICE_FALL_ALERT_PERCENT,
          unit: "%",
          changePercent: stock.changePercent,
          volume: stock.volume,
          tradingValue: stock.tradingValue
        }
      });
      if (evt) triggered.push(evt);
    }
    const currentMultiplier = (stock.volumeRatio || 100) / 100;
    if (currentMultiplier >= monitoringConfig.VOLUME_SPIKE_MULTIPLIER) {
      const evt = pushAlertEvent({
        type: "VOLUME_SPIKE",
        scope: "STOCK",
        title: `${stock.name} \uAC70\uB798\uB7C9 \uAE09\uC99D (${stock.volumeRatio}% \uD3ED\uC99D)`,
        description: `20\uC77C \uD3C9\uADE0 \uAC70\uB798\uB7C9 \uB300\uBE44 ${currentMultiplier.toFixed(1)}\uBC30(\uAE30\uC900 ${monitoringConfig.VOLUME_SPIKE_MULTIPLIER}\uBC30 \uC774\uC0C1)\uC758 \uB300\uB7C9 \uC218\uAE09\uC774 \uC720\uC785\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`,
        symbol: stock.symbol,
        symbolName: stock.name,
        market: stock.market,
        severity: currentMultiplier >= 3 ? "urgent" : "info",
        metrics: {
          currentValue: stock.volumeRatio,
          threshold: monitoringConfig.VOLUME_SPIKE_MULTIPLIER * 100,
          unit: "%",
          volumeRatio: stock.volumeRatio,
          volume: stock.volume,
          tradingValue: stock.tradingValue
        }
      });
      if (evt) triggered.push(evt);
    }
    if (stock.tradingValue >= monitoringConfig.TRADING_VALUE_ALERT_THRESHOLD) {
      const evt = pushAlertEvent({
        type: "TRADING_VALUE_SPIKE",
        scope: "STOCK",
        title: `${stock.name} \uAC70\uB798\uB300\uAE08 \uD3ED\uC99D (${stock.tradingValue.toLocaleString()}\uC5B5 \uC6D0)`,
        description: `\uAE30\uC900 \uAC70\uB798\uB300\uAE08(${monitoringConfig.TRADING_VALUE_ALERT_THRESHOLD.toLocaleString()}\uC5B5 \uC6D0)\uC744 \uB3CC\uD30C\uD558\uBA70 \uC2DC\uC7A5 \uC8FC\uB3C4\uC8FC\uB85C \uC790\uAE08\uC774 \uC9D1\uC911\uB418\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`,
        symbol: stock.symbol,
        symbolName: stock.name,
        market: stock.market,
        severity: stock.tradingValue >= 1e4 ? "urgent" : "info",
        metrics: {
          currentValue: stock.tradingValue,
          threshold: monitoringConfig.TRADING_VALUE_ALERT_THRESHOLD,
          unit: "\uC5B5 \uC6D0",
          tradingValue: stock.tradingValue,
          volume: stock.volume
        }
      });
      if (evt) triggered.push(evt);
    }
  }
  for (const idx of indices) {
    const marketName = idx.symbol === "KOSPI" ? "\uCF54\uC2A4\uD53C" : "\uCF54\uC2A4\uB2E5";
    if (idx.changePercent <= monitoringConfig.CIRCUIT_BREAKER_LV1_PERCENT) {
      const evt = pushAlertEvent({
        type: "CIRCUIT_BREAKER",
        scope: "MARKET",
        title: `\u{1F6A8} ${marketName} \uC11C\uD0B7\uBE0C\uB808\uC774\uCEE4 1\uB2E8\uACC4 \uBC1C\uB3D9 \uACBD\uBCF4`,
        description: `${marketName} \uC9C0\uC218\uAC00 \uC804\uC77C \uB300\uBE44 ${idx.changePercent.toFixed(2)}% \uD3ED\uB77D\uD558\uC5EC \uC2DC\uC7A5 \uAC70\uB798\uAC00 20\uBD84\uAC04 \uC77C\uC2DC \uC911\uB2E8\uB429\uB2C8\uB2E4.`,
        market: idx.symbol,
        severity: "urgent",
        metrics: {
          currentValue: idx.changePercent,
          threshold: monitoringConfig.CIRCUIT_BREAKER_LV1_PERCENT,
          unit: "%",
          changePercent: idx.changePercent
        }
      });
      if (evt) triggered.push(evt);
    } else if (Math.abs(idx.changePercent) >= monitoringConfig.SIDECAR_THRESHOLD_PERCENT) {
      const isUp = idx.changePercent >= 0;
      const evt = pushAlertEvent({
        type: "SIDECAR",
        scope: "MARKET",
        title: `\u26A1 ${marketName} \uC0AC\uC774\uB4DC\uCE74(${isUp ? "\uB9E4\uC218\uD638\uAC00" : "\uB9E4\uB3C4\uD638\uAC00"}) \uD6A8\uB825\uC815\uC9C0 \uBC1C\uB3D9`,
        description: `${marketName} \uC9C0\uC218\uAC00 ${isUp ? "+" : ""}${idx.changePercent.toFixed(2)}% \uAE09\uBCC0\uD558\uC5EC \uD504\uB85C\uADF8\uB7A8 \uB9E4\uB9E4 \uD638\uAC00 \uD6A8\uB825\uC774 5\uBD84\uAC04 \uC815\uC9C0\uB429\uB2C8\uB2E4.`,
        market: idx.symbol,
        severity: "urgent",
        metrics: {
          currentValue: idx.changePercent,
          threshold: monitoringConfig.SIDECAR_THRESHOLD_PERCENT,
          unit: "%",
          changePercent: idx.changePercent
        }
      });
      if (evt) triggered.push(evt);
    } else if (Math.abs(idx.changePercent) >= monitoringConfig.MARKET_INDEX_ALERT_PERCENT) {
      const isUp = idx.changePercent >= 0;
      const evt = pushAlertEvent({
        type: "MARKET_TURBULENCE",
        scope: "MARKET",
        title: `\u26A0\uFE0F ${marketName} \uC2DC\uC7A5 \uAE09\uBCC0\uB3D9 \uAC10\uC9C0 (${isUp ? "+" : ""}${idx.changePercent.toFixed(2)}%)`,
        description: `${marketName} \uC9C0\uC218 \uBCC0\uB3D9\uC131\uC774 \uC784\uACC4\uCE58(\xB1${monitoringConfig.MARKET_INDEX_ALERT_PERCENT}%)\uB97C \uCD08\uACFC\uD558\uC5EC \uBCC0\uB3D9\uC131\uC774 \uD655\uB300\uB418\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`,
        market: idx.symbol,
        severity: "warning",
        metrics: {
          currentValue: idx.changePercent,
          threshold: monitoringConfig.MARKET_INDEX_ALERT_PERCENT,
          unit: "%",
          changePercent: idx.changePercent
        }
      });
      if (evt) triggered.push(evt);
    }
  }
  return triggered;
}
async function explainMarketEventWithGemini(eventId) {
  const event = recentAlertEvents.find((e) => e.id === eventId);
  if (!event) {
    throw new Error("\uC774\uBCA4\uD2B8\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  if (event.aiExplanation) {
    return event.aiExplanation;
  }
  const prompt = `\uB2F9\uC2E0\uC740 \uD55C\uAD6D \uC8FC\uC2DD\uC2DC\uC7A5 \uC2DC\uD669 \uC218\uC11D \uC560\uB110\uB9AC\uC2A4\uD2B8\uC785\uB2C8\uB2E4.
\uC544\uB798 \uC2DC\uC7A5 \uBAA8\uB2C8\uD130\uB9C1 \uC2DC\uC2A4\uD15C\uC774 \uC2E4\uC2DC\uAC04 \uC218\uCE58 \uACC4\uC0B0\uC744 \uD1B5\uD574 \uAC10\uC9C0\uD55C \uC774\uBCA4\uD2B8\uC5D0 \uB300\uD574 \uD22C\uC790\uC790\uB97C \uC704\uD55C \uBA85\uD655\uD558\uACE0 \uC804\uBB38\uC801\uC778 \uD574\uC124 \uBC0F \uC694\uC57D(2~3\uBB38\uC7A5, \uD55C\uAD6D\uC5B4)\uC744 \uC791\uC131\uD574\uC8FC\uC138\uC694.

[\uAC10\uC9C0 \uC774\uBCA4\uD2B8 \uC815\uBCF4]
- \uBD84\uB958: ${event.scope === "MARKET" ? "\uC2DC\uC7A5 \uC804\uCCB4 \uC870\uCE58" : "\uAC1C\uBCC4 \uC885\uBAA9 \uD2B9\uC774\uB3D9\uD5A5"} (${event.type})
- \uC81C\uBAA9: ${event.title}
- \uB300\uC0C1: ${event.symbolName || event.market || "\uAD6D\uB0B4 \uC99D\uC2DC"} ${event.symbol ? `(${event.symbol})` : ""}
- \uC138\uBD80 \uC218\uCE58: \uD604\uC7AC \uC218\uCE58 ${event.metrics.currentValue}${event.metrics.unit} (\uC124\uC815 \uC784\uACC4\uAC12: ${event.metrics.threshold}${event.metrics.unit})
${event.metrics.volumeRatio ? `- \uAC70\uB798\uB7C9 \uBC30\uC728: ${event.metrics.volumeRatio}%` : ""}
${event.metrics.tradingValue ? `- \uAC70\uB798\uB300\uAE08: ${event.metrics.tradingValue}\uC5B5 \uC6D0` : ""}

[\uC791\uC131 \uC694\uAD6C\uC0AC\uD56D]
1. \uD574\uB2F9 \uC774\uBCA4\uD2B8\uAC00 \uBC1C\uC0DD\uD55C \uBC30\uACBD\uACFC \uC2DC\uC7A5\uC5D0 \uBBF8\uCE58\uB294 \uD30C\uAE09 \uD6A8\uACFC\uB97C \uC804\uBB38\uC801\uC774\uBA74\uC11C\uB3C4 \uC27D\uAC8C \uC124\uBA85\uD558\uC138\uC694.
2. \uD22C\uC790\uC790\uAC00 \uCDE8\uD574\uC57C \uD560 \uB9AC\uC2A4\uD06C \uAD00\uB9AC \uBC0F \uB300\uC751 \uD301\uC744 \uD3EC\uD568\uD558\uC138\uC694.
3. 2~3\uBB38\uC7A5\uC758 \uC815\uAC08\uD55C \uBB38\uB2E8 \uD615\uD0DC\uB85C \uC791\uC131\uD558\uC138\uC694.`;
  try {
    if (genAI) {
      const response = await genAI.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt
      });
      const explanation = response.text?.trim() || generateFallbackExplanation(event);
      event.aiExplanation = explanation;
      return explanation;
    }
  } catch (err) {
    console.warn("[MarketMonitor] Gemini explanation failed, using financial heuristic:", err);
  }
  const fallback = generateFallbackExplanation(event);
  event.aiExplanation = fallback;
  return fallback;
}
function generateFallbackExplanation(event) {
  if (event.type === "PRICE_SURGE") {
    return `${event.symbolName || "\uD574\uB2F9 \uC885\uBAA9"}\uC740(\uB294) \uAC15\uD55C \uAE30\uAD00 \uBC0F \uC678\uAD6D\uC778\uC758 \uB9E4\uC218\uC138\uC640 \uD638\uC7AC\uC131 \uC218\uAE09\uC774 \uC720\uC785\uB418\uBA70 \uC124\uC815 \uAE30\uC900(+${event.metrics.threshold}%)\uC744 \uB118\uB294 \uAE09\uB4F1\uC138\uB97C \uAE30\uB85D \uC911\uC785\uB2C8\uB2E4. \uB2E8\uAE30 \uACFC\uC5F4 \uC591\uC0C1\uC774 \uB098\uD0C0\uB0A0 \uC218 \uC788\uC73C\uBBC0\uB85C \uBD84\uD560 \uB9E4\uB3C4 \uBC0F \uC9C0\uC9C0\uC120 \uD655\uC778 \uC804\uB7B5\uC774 \uC720\uD6A8\uD569\uB2C8\uB2E4.`;
  }
  if (event.type === "PRICE_PLUNGE") {
    return `${event.symbolName || "\uD574\uB2F9 \uC885\uBAA9"}\uC740(\uB294) \uCC28\uC775 \uC2E4\uD604 \uB9E4\uBB3C \uB610\uB294 \uD558\uBC29 \uC555\uB825\uC73C\uB85C \uC778\uD574 \uC784\uACC4\uCE58(${event.metrics.threshold}%) \uC774\uD558\uB85C \uAE09\uB77D\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4. \uC800\uAC00 \uB9E4\uC218 \uC2DC \uBC14\uB2E5\uAD8C \uD655\uC778\uACFC \uCD94\uAC00 \uBCC0\uB3D9\uC131 \uD655\uB300\uB97C \uBC29\uC9C0\uD558\uAE30 \uC704\uD55C \uC190\uC808 \uAE30\uC900 \uC810\uAC80\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.`;
  }
  if (event.type === "VOLUME_SPIKE") {
    return `\uD3C9\uADE0 \uAC70\uB798\uB7C9 \uB300\uBE44 ${event.metrics.currentValue}%\uC5D0 \uB2EC\uD558\uB294 \uD3ED\uBC1C\uC801 \uAC70\uB798\uB7C9\uC774 \uC2E4\uB9AC\uBA70 \uC8FC\uAC00 \uCD94\uC138 \uC804\uD658\uC758 \uC911\uC694\uD55C \uBCC0\uACE1\uC810\uC744 \uD615\uC131\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4. \uB300\uB7C9 \uAC70\uB798\uB97C \uC218\uBC18\uD55C \uC8FC\uAC00 \uBC29\uD5A5\uC131\uC774 \uD5A5\uD6C4 \uB2E8\uAE30 \uBAA8\uBA58\uD140\uC758 \uD575\uC2EC \uAE30\uC900\uC774 \uB429\uB2C8\uB2E4.`;
  }
  if (event.type === "TRADING_VALUE_SPIKE") {
    return `\uB2F9\uC77C \uAC70\uB798\uB300\uAE08\uC774 ${event.metrics.currentValue}\uC5B5 \uC6D0\uC5D0 \uB3C4\uB2EC\uD558\uBA70 \uC2DC\uC7A5 \uC804\uBC18\uC758 \uAC70\uB798 \uB300\uAE08\uC774 \uC9D1\uC911\uB418\uB294 \uC8FC\uB3C4\uC8FC \uC5ED\uD560\uC744 \uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4. \uC2DC\uC7A5\uC758 \uAD00\uC2EC\uB3C4\uAC00 \uADF9\uB300\uD654\uB41C \uC0C1\uD0DC\uC774\uBBC0\uB85C \uC7A5\uC911 \uBCC0\uB3D9\uC131\uC5D0 \uC720\uC758\uD558\uC2ED\uC2DC\uC624.`;
  }
  if (event.type === "SIDECAR") {
    return `\uC120\uBB3C \uBC0F \uC9C0\uC218 \uBCC0\uB3D9\uD3ED\uC774 \uC784\uACC4\uCE58(\xB15%)\uB97C \uCD08\uACFC\uD558\uC5EC \uD504\uB85C\uADF8\uB7A8 \uB9E4\uB9E4 \uD638\uAC00 \uD6A8\uB825\uC774 \uC77C\uC2DC \uC815\uC9C0\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uD30C\uC0DD\uC0C1\uD488 \uC218\uAE09 \uCDA9\uACA9\uC744 \uC644\uD654\uD558\uAE30 \uC704\uD55C \uC2DC\uC7A5 \uC870\uCE58\uC774\uBBC0\uB85C \uBCC0\uB3D9\uC131 \uC7A5\uC138\uC5D0 \uBB34\uB9AC\uD55C \uCD94\uACA9 \uB9E4\uB9E4\uB294 \uC790\uC81C\uD574\uC57C \uD569\uB2C8\uB2E4.`;
  }
  if (event.type === "CIRCUIT_BREAKER") {
    return `\uC99D\uC2DC\uAC00 8% \uC774\uC0C1 \uAE09\uB77D\uD568\uC5D0 \uB530\uB77C \uC11C\uD0B7\uBE0C\uB808\uC774\uCEE4 1\uB2E8\uACC4\uAC00 \uBC1C\uB3D9\uB418\uC5B4 \uC804 \uC885\uBAA9 \uB9E4\uB9E4\uAC00 \uC77C\uC2DC \uC911\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC2DC\uC7A5 \uACF5\uD3EC\uAC00 \uADF9\uB300\uD654\uB41C \uAD6D\uBA74\uC774\uBBC0\uB85C \uB0C9\uC815\uD55C \uC2DC\uC7A5 \uBD84\uC11D\uACFC \uD604\uAE08 \uBE44\uC911 \uC810\uAC80\uC774 \uAD8C\uACE0\uB429\uB2C8\uB2E4.`;
  }
  return `${event.title}\uC774(\uAC00) \uAC10\uC9C0\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC2DC\uC7A5 \uBCC0\uB3D9\uC131\uC774 \uD3C9\uC18C \uB300\uBE44 \uAE09\uC99D\uD558\uACE0 \uC788\uC73C\uBBC0\uB85C \uD22C\uC790 \uC9C0\uD45C \uBC0F \uC218\uAE09 \uD604\uD669\uC744 \uBA74\uBC00\uD788 \uAD00\uCC30\uD558\uC2DC\uAE30 \uBC14\uB78D\uB2C8\uB2E4.`;
}
function seedInitialMarketEvents() {
  if (recentAlertEvents.length > 0) return;
  pushAlertEvent({
    type: "VOLUME_SPIKE",
    scope: "STOCK",
    title: "\uD604\uB300\uB85C\uD15C \uAC70\uB798\uB7C9 \uAE09\uC99D (280.1% \uD3ED\uC99D)",
    description: "20\uC77C \uD3C9\uADE0 \uAC70\uB798\uB7C9 \uB300\uBE44 2.8\uBC30\uC758 \uB300\uB7C9 \uAE30\uAD00 \uC218\uAE09\uC774 \uC720\uC785\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    symbol: "064350",
    symbolName: "\uD604\uB300\uB85C\uD15C",
    market: "KOSPI",
    severity: "info",
    metrics: {
      currentValue: 280.1,
      threshold: 200,
      unit: "%",
      volumeRatio: 280.1,
      volume: 421e4,
      tradingValue: 2450
    }
  });
  pushAlertEvent({
    type: "PRICE_SURGE",
    scope: "STOCK",
    title: "\uB450\uC0B0\uC5D0\uB108\uBE4C\uB9AC\uD2F0 \uAE09\uB4F1 \uBC1C\uC0DD (+7.11%)",
    description: "\uC6D0\uC804 \uD14C\uB9C8 \uBC0F \uC218\uC8FC \uAE30\uB300\uAC10\uC73C\uB85C \uC124\uC815 \uAE30\uC900(+5.0% \uC774\uC0C1)\uC744 \uCD08\uACFC \uC0C1\uC2B9 \uC911\uC785\uB2C8\uB2E4.",
    symbol: "034020",
    symbolName: "\uB450\uC0B0\uC5D0\uB108\uBE4C\uB9AC\uD2F0",
    market: "KOSPI",
    severity: "warning",
    metrics: {
      currentValue: 7.11,
      threshold: 5,
      unit: "%",
      changePercent: 7.11,
      volume: 1682e4,
      tradingValue: 3670
    }
  });
  pushAlertEvent({
    type: "MARKET_TURBULENCE",
    scope: "MARKET",
    title: "\u26A0\uFE0F \uCF54\uC2A4\uB2E5 \uC2DC\uC7A5 \uAE09\uBCC0\uB3D9 \uAC10\uC9C0 (+0.95%)",
    description: "\uBC18\uB3C4\uCCB4 \uBC0F \uBC14\uC774\uC624 \uC885\uBAA9 \uB3D9\uBC18 \uAC15\uC138\uB85C \uC9C0\uC218 \uBCC0\uB3D9\uD3ED\uC774 \uD655\uB300\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    market: "KOSDAQ",
    severity: "info",
    metrics: {
      currentValue: 0.95,
      threshold: 2,
      unit: "%",
      changePercent: 0.95
    }
  });
}

// server/userAlertEngine.ts
var userAlertRules = [
  {
    id: "rule_samsung_rise",
    uid: "demo-user-1",
    symbol: "005930",
    symbolName: "\uC0BC\uC131\uC804\uC790",
    type: "price_rise",
    value: 5,
    // 삼성전자 5% 상승 시 알림
    condition: "above",
    enabled: true,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "rule_skhynix_fall",
    uid: "demo-user-1",
    symbol: "000660",
    symbolName: "SK\uD558\uC774\uB2C9\uC2A4",
    type: "price_fall",
    value: 3,
    // SK하이닉스 3% 하락 시 알림
    condition: "below",
    enabled: true,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "rule_volume_surge",
    uid: "demo-user-1",
    symbol: "005380",
    symbolName: "\uD604\uB300\uCC28",
    type: "volume_spike",
    value: 200,
    // 현대차 거래량 200% 급증 시 알림
    condition: "above",
    enabled: true,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "rule_trading_value",
    uid: "demo-user-1",
    symbol: "042700",
    symbolName: "\uD55C\uBBF8\uBC18\uB3C4\uCCB4",
    type: "trading_value_spike",
    value: 3e3,
    // 한미반도체 거래대금 3,000억 급증 시 알림
    condition: "above",
    enabled: true,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "rule_samsung_news",
    uid: "demo-user-1",
    symbol: "005930",
    symbolName: "\uC0BC\uC131\uC804\uC790",
    type: "related_news",
    value: 1,
    // 관련 뉴스 발생 시 알림
    condition: "event",
    enabled: true,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  },
  {
    id: "rule_market_event",
    uid: "demo-user-1",
    symbol: "MARKET",
    symbolName: "\uAD6D\uB0B4 \uC99D\uC2DC \uC804\uCCB4",
    type: "market_event",
    value: 2,
    // 지수 2% 급변동/사이드카 발동 시 알림
    condition: "event",
    enabled: true,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  }
];
var serverNotifications = [
  {
    id: "notif_init_1",
    uid: "demo-user-1",
    alertId: "rule_samsung_rise",
    type: "price_rise",
    title: "\u{1F680} [\uAC00\uACA9 \uC0C1\uC2B9] \uC0BC\uC131\uC804\uC790 +5.0% \uB3CC\uD30C \uC54C\uB9BC",
    message: "\uC124\uC815\uD558\uC2E0 \uBAA9\uD45C \uC870\uAC74(5.0% \uC0C1\uC2B9)\uC744 \uB3CC\uD30C\uD558\uC600\uC2B5\uB2C8\uB2E4. \uD604\uC7AC\uAC00 78,500\uC6D0\uC5D0 \uAC70\uB798 \uC911\uC785\uB2C8\uB2E4.",
    stockSymbol: "005930",
    stockName: "\uC0BC\uC131\uC804\uC790",
    targetType: "stock",
    read: false,
    // 읽지 않음
    createdAt: new Date(Date.now() - 1e3 * 60 * 12).toISOString(),
    timestamp: "12\uBD84 \uC804"
  },
  {
    id: "notif_init_2",
    uid: "demo-user-1",
    alertId: "rule_skhynix_fall",
    type: "price_fall",
    title: "\u{1F4C9} [\uAC00\uACA9 \uD558\uB77D] SK\uD558\uC774\uB2C9\uC2A4 -3.0% \uB3C4\uB2EC \uC8FC\uC758",
    message: "\uC124\uC815\uD558\uC2E0 \uB9AC\uC2A4\uD06C \uAD00\uB9AC \uAE30\uC900(-3.0% \uD558\uB77D)\uC5D0 \uB3C4\uB2EC\uD558\uC600\uC2B5\uB2C8\uB2E4. \uCC28\uD2B8 \uBC0F \uC218\uAE09\uC744 \uD655\uC778\uD558\uC138\uC694.",
    stockSymbol: "000660",
    stockName: "SK\uD558\uC774\uB2C9\uC2A4",
    targetType: "stock",
    read: false,
    // 읽지 않음
    createdAt: new Date(Date.now() - 1e3 * 60 * 45).toISOString(),
    timestamp: "45\uBD84 \uC804"
  },
  {
    id: "notif_init_3",
    uid: "demo-user-1",
    alertId: "rule_volume_surge",
    type: "volume_spike",
    title: "\u26A1 [\uAC70\uB798\uB7C9 \uAE09\uC99D] \uD604\uB300\uCC28 \uAC70\uB798\uB7C9 240% \uD3ED\uC99D",
    message: "20\uC77C \uD3C9\uADE0 \uAC70\uB798\uB7C9 \uB300\uBE44 200% \uC774\uC0C1\uC778 240% \uC218\uAE09\uC774 \uAE09\uC720\uC785\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    stockSymbol: "005380",
    stockName: "\uD604\uB300\uCC28",
    targetType: "stock",
    read: true,
    // 읽음
    createdAt: new Date(Date.now() - 1e3 * 60 * 180).toISOString(),
    timestamp: "3\uC2DC\uAC04 \uC804"
  },
  {
    id: "notif_init_4",
    uid: "demo-user-1",
    alertId: "rule_market_event",
    type: "market_event",
    title: "\u{1F3DB}\uFE0F [\uC2DC\uC7A5 \uC774\uBCA4\uD2B8] \uCF54\uC2A4\uB2E5 \uC9C0\uC218 \uAE09\uBCC0\uB3D9 \uAC10\uC9C0",
    message: "\uCF54\uC2A4\uB2E5 \uC9C0\uC218\uAC00 \uB2E8\uAE30 \uAE09\uB4F1\uB77D\uD558\uC5EC \uC2DC\uC7A5 \uBCC0\uB3D9\uC131 \uD655\uB300 \uC8FC\uC758\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.",
    targetType: "market",
    read: true,
    // 읽음
    createdAt: new Date(Date.now() - 1e3 * 60 * 360).toISOString(),
    timestamp: "6\uC2DC\uAC04 \uC804"
  }
];
var userAlertCooldownMap = /* @__PURE__ */ new Map();
var COOLDOWN_DURATION_MS = 18e4;
function getUserAlertRules(uid) {
  if (!uid || uid === "all") return userAlertRules;
  return userAlertRules.filter((r) => r.uid === uid || r.uid === "demo-user-1");
}
function addUserAlertRule(rule) {
  const newRule = {
    ...rule,
    id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  userAlertRules.unshift(newRule);
  console.log(`[UserAlertEngine] Added rule: [${newRule.symbolName}] ${newRule.type} (${newRule.value})`);
  return newRule;
}
function updateUserAlertRule(id, updates) {
  const index = userAlertRules.findIndex((r) => r.id === id);
  if (index === -1) return null;
  userAlertRules[index] = { ...userAlertRules[index], ...updates };
  return userAlertRules[index];
}
function deleteUserAlertRule(id) {
  const lenBefore = userAlertRules.length;
  userAlertRules = userAlertRules.filter((r) => r.id !== id);
  return userAlertRules.length < lenBefore;
}
function getNotifications(uid) {
  let list = serverNotifications;
  if (uid && uid !== "all") {
    list = list.filter((n) => n.uid === uid || n.uid === "demo-user-1");
  }
  return list;
}
function markNotificationAsRead(id) {
  const notif = serverNotifications.find((n) => n.id === id);
  if (notif) {
    notif.read = true;
    return notif;
  }
  return null;
}
function markAllNotificationsAsRead(uid) {
  let count = 0;
  for (const n of serverNotifications) {
    if (!uid || n.uid === uid || n.uid === "demo-user-1") {
      if (!n.read) {
        n.read = true;
        count++;
      }
    }
  }
  return count;
}
function deleteNotification(id) {
  const len = serverNotifications.length;
  serverNotifications = serverNotifications.filter((n) => n.id !== id);
  return serverNotifications.length < len;
}
function evaluateUserAlertRules(stocks, indices) {
  const generated = [];
  const now = Date.now();
  for (const rule of userAlertRules) {
    if (!rule.enabled) continue;
    const cooldownKey = `${rule.uid}_${rule.symbol}_${rule.type}`;
    const lastTrigger = userAlertCooldownMap.get(cooldownKey) || 0;
    if (now - lastTrigger < COOLDOWN_DURATION_MS) {
      continue;
    }
    let isTriggered = false;
    let title = "";
    let message = "";
    let targetType = "stock";
    let targetStock;
    if (rule.type === "market_event") {
      for (const idx of indices) {
        if (Math.abs(idx.changePercent) >= rule.value) {
          isTriggered = true;
          targetType = "market";
          const isUp = idx.changePercent >= 0;
          title = `\u{1F3DB}\uFE0F [\uC2DC\uC7A5 \uC774\uBCA4\uD2B8] ${idx.name} \uBCC0\uB3D9\uD3ED ${isUp ? "+" : ""}${idx.changePercent.toFixed(2)}% \uAC10\uC9C0`;
          message = `\uC124\uC815\uD558\uC2E0 \uAE30\uC900(\xB1${rule.value}%)\uC744 \uCD08\uACFC\uD558\uC5EC ${idx.name} \uC9C0\uC218\uAC00 \uAE09\uBCC0\uB3D9 \uC911\uC785\uB2C8\uB2E4.`;
          break;
        }
      }
    } else {
      targetStock = stocks.find((s) => s.symbol === rule.symbol);
      if (!targetStock) continue;
      switch (rule.type) {
        case "price_rise": {
          const targetPercent = Math.abs(rule.value);
          if (targetStock.changePercent >= targetPercent) {
            isTriggered = true;
            title = `\u{1F680} [\uAC00\uACA9 \uC0C1\uC2B9] ${targetStock.name} +${targetStock.changePercent.toFixed(2)}% \uB3CC\uD30C`;
            message = `\uC124\uC815\uD558\uC2E0 \uBAA9\uD45C \uC870\uAC74(+${targetPercent}% \uC774\uC0C1 \uC0C1\uC2B9)\uC744 \uCDA9\uC871\uD588\uC2B5\uB2C8\uB2E4. \uD604\uC7AC\uAC00 ${targetStock.price.toLocaleString()}\uC6D0\uC785\uB2C8\uB2E4.`;
          }
          break;
        }
        case "price_fall": {
          const targetFall = -Math.abs(rule.value);
          if (targetStock.changePercent <= targetFall) {
            isTriggered = true;
            title = `\u{1F4C9} [\uAC00\uACA9 \uD558\uB77D] ${targetStock.name} ${targetStock.changePercent.toFixed(2)}% \uB3C4\uB2EC \uC8FC\uC758`;
            message = `\uC124\uC815\uD558\uC2E0 \uB9AC\uC2A4\uD06C \uAD00\uB9AC \uAE30\uC900(-${Math.abs(rule.value)}% \uC774\uD558 \uD558\uB77D)\uC5D0 \uB3C4\uB2EC\uD588\uC2B5\uB2C8\uB2E4. \uD604\uC7AC\uAC00 ${targetStock.price.toLocaleString()}\uC6D0\uC785\uB2C8\uB2E4.`;
          }
          break;
        }
        case "volume_spike": {
          if (targetStock.volumeRatio >= rule.value) {
            isTriggered = true;
            title = `\u26A1 [\uAC70\uB798\uB7C9 \uAE09\uC99D] ${targetStock.name} \uAC70\uB798\uB7C9 ${targetStock.volumeRatio}% \uD3ED\uC99D`;
            message = `20\uC77C \uD3C9\uADE0 \uAC70\uB798\uB7C9 \uB300\uBE44 \uC124\uC815\uAC12(${rule.value}%)\uC744 \uCD08\uACFC\uD558\uB294 \uB300\uB7C9 \uC218\uAE09\uC774 \uC720\uC785\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`;
          }
          break;
        }
        case "trading_value_spike": {
          if (targetStock.tradingValue >= rule.value) {
            isTriggered = true;
            title = `\u{1F4B0} [\uAC70\uB798\uB300\uAE08 \uAE09\uC99D] ${targetStock.name} \uAC70\uB798\uB300\uAE08 ${targetStock.tradingValue.toLocaleString()}\uC5B5 \uB3CC\uD30C`;
            message = `\uC124\uC815\uD558\uC2E0 \uAC70\uB798\uB300\uAE08 \uAE30\uC900(${rule.value.toLocaleString()}\uC5B5 \uC6D0)\uC744 \uCD08\uACFC\uD558\uBA70 \uC2DC\uC7A5 \uC8FC\uB3C4\uC8FC\uB85C \uC790\uAE08\uC774 \uC9D1\uC911\uB418\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`;
          }
          break;
        }
        case "related_news": {
          if (Math.abs(targetStock.changePercent) >= 4) {
            isTriggered = true;
            title = `\u{1F4F0} [\uAD00\uB828 \uC18D\uBCF4] ${targetStock.name} \uC8FC\uC694 \uACF5\uC2DC \uBC0F \uC2DC\uD669 \uC18D\uBCF4 \uBC1C\uC0DD`;
            message = `${targetStock.name}\uC5D0 \uAD00\uD55C \uD55C\uAD6D\uAC70\uB798\uC18C(KRX) \uACF5\uC2DC \uBC0F \uC2DC\uC7A5 \uAD00\uC2EC \uC18D\uBCF4\uAC00 \uB4F1\uB85D\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`;
          }
          break;
        }
      }
    }
    if (isTriggered) {
      const nowObj = /* @__PURE__ */ new Date();
      const newNotification = {
        id: `notif_${now}_${Math.random().toString(36).substring(2, 6)}`,
        uid: rule.uid,
        alertId: rule.id,
        type: rule.type,
        title,
        message,
        stockSymbol: targetStock?.symbol,
        stockName: targetStock?.name,
        targetType,
        read: false,
        // 기본값: 읽지 않음
        createdAt: nowObj.toISOString(),
        timestamp: "\uBC29\uAE08 \uC804"
      };
      userAlertCooldownMap.set(cooldownKey, now);
      rule.lastTriggeredAt = now;
      serverNotifications = [newNotification, ...serverNotifications].slice(0, 50);
      generated.push(newNotification);
      console.log(`[UserAlertEngine] \u{1F514} Notification Generated: ${newNotification.title}`);
    }
  }
  return generated;
}

// server/aiBriefingService.ts
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";
var geminiApiKey2 = process.env.GEMINI_API_KEY || "";
var genAI2 = geminiApiKey2 ? new GoogleGenAI2({ apiKey: geminiApiKey2 }) : null;
var currentServerStocks = [...INITIAL_STOCKS];
var currentServerIndices = [...INITIAL_INDICES];
var currentExchangeRate = { ...INITIAL_EXCHANGE_RATE };
function updateServerDataReferences(stocks, indices, rate) {
  currentServerStocks = stocks;
  currentServerIndices = indices;
  currentExchangeRate = rate;
}
function get_stock_quote(symbol) {
  const stock = currentServerStocks.find((s) => s.symbol === symbol || s.name === symbol);
  if (!stock) return null;
  const now = /* @__PURE__ */ new Date();
  const kstTime = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(now);
  const prevClose = stock.prevClose || stock.price - stock.change;
  const openPrice = stock.candles && stock.candles.length > 0 ? stock.candles[stock.candles.length - 1].open : prevClose;
  return {
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
    sector: stock.sector,
    price: stock.price,
    // 현재가 (원)
    change: stock.change,
    // 전일 대비 변동폭 (원)
    changePercent: stock.changePercent,
    // 등락률 (%)
    volume: stock.volume,
    // 거래량 (주)
    volumeRatio: stock.volumeRatio || 100,
    // 20일 평균 대비 거래량 비율 (%)
    tradingValue: stock.tradingValue,
    // 거래대금 (억 원)
    openPrice,
    // 시가 (원)
    highPrice: stock.highPrice,
    // 고가 (원)
    lowPrice: stock.lowPrice,
    // 저가 (원)
    prevClose,
    // 전일 종가 (원)
    marketCap: stock.marketCap,
    // 시가총액 (조/억 원)
    per: stock.per,
    // PER
    pbr: stock.pbr,
    // PBR
    dividendYield: stock.dividendYield,
    // 배당수익률 (%)
    dataTimestamp: `${kstTime} KST`
    // 데이터 기준 시간
  };
}
function get_stock_chart(symbol, period = "1M") {
  const stock = currentServerStocks.find((s) => s.symbol === symbol || s.name === symbol);
  if (!stock || !stock.candles || stock.candles.length === 0) {
    return { error: "\uCC28\uD2B8 \uB370\uC774\uD130\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.", candles: [] };
  }
  const candles = stock.candles.slice(-15);
  const lastClose = stock.price;
  const firstClose = candles[0]?.close || lastClose;
  const periodReturn = ((lastClose - firstClose) / firstClose * 100).toFixed(2);
  const recent5 = candles.slice(-5);
  const ma5 = recent5.reduce((sum, c) => sum + c.close, 0) / recent5.length;
  return {
    symbol: stock.symbol,
    period,
    candleCount: candles.length,
    recentPeriodReturnPercent: `${periodReturn}%`,
    ma5: Math.round(ma5),
    isAboveMa5: lastClose >= ma5,
    recentCandlesSummary: candles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume
    }))
  };
}
function get_stock_news(symbol) {
  const stock = currentServerStocks.find((s) => s.symbol === symbol || s.name === symbol);
  const symbolName = stock ? stock.name : "";
  const matchedNews = INITIAL_NEWS.filter((n) => {
    if (n.relatedSymbols && n.relatedSymbols.includes(symbol)) return true;
    if (symbolName && (n.title.includes(symbolName) || n.summary.includes(symbolName))) return true;
    return false;
  }).slice(0, 4);
  if (matchedNews.length === 0) {
    return {
      status: "insufficient",
      message: "\uD574\uB2F9 \uC885\uBAA9\uC758 \uCD5C\uADFC \uACF5\uC2DC \uBC0F \uC18D\uBCF4 \uAE30\uC0AC \uB370\uC774\uD130\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.",
      articles: []
    };
  }
  return {
    status: "ok",
    count: matchedNews.length,
    articles: matchedNews.map((n) => ({
      title: n.title,
      source: n.source,
      publishedAt: n.time,
      summary: n.summary,
      sentiment: n.sentiment
    }))
  };
}
function get_market_status() {
  const kospi = currentServerIndices.find((i) => i.symbol === "KOSPI") || currentServerIndices[0];
  const kosdaq = currentServerIndices.find((i) => i.symbol === "KOSDAQ") || currentServerIndices[1];
  return {
    kospi: {
      name: "\uCF54\uC2A4\uD53C",
      value: kospi?.value || 2684.52,
      changePercent: `${kospi?.changePercent || 0}%`,
      tradingValue: `${kospi?.tradingValue || 0}\uC870 \uC6D0`,
      advanceCount: kospi?.advanceCount || 0,
      declineCount: kospi?.declineCount || 0
    },
    kosdaq: {
      name: "\uCF54\uC2A4\uB2E5",
      value: kosdaq?.value || 872.1,
      changePercent: `${kosdaq?.changePercent || 0}%`,
      tradingValue: `${kosdaq?.tradingValue || 0}\uC870 \uC6D0`
    },
    exchangeRate: {
      currency: currentExchangeRate.name || "\uC6D0/\uB2EC\uB7EC \uD658\uC728",
      rate: currentExchangeRate.rate,
      changePercent: `${currentExchangeRate.changePercent}%`
    }
  };
}
function get_related_posts(symbol) {
  const stock = currentServerStocks.find((s) => s.symbol === symbol || s.name === symbol);
  const symbolName = stock ? stock.name : "";
  const matched = INITIAL_POSTS.filter((p) => {
    if (p.symbol === symbol) return true;
    if (symbolName && (p.title.includes(symbolName) || p.content.includes(symbolName))) return true;
    return false;
  }).slice(0, 4);
  if (matched.length === 0) {
    return {
      status: "insufficient",
      message: "\uC5F0\uAD00 \uCEE4\uBBA4\uB2C8\uD2F0 \uD1A0\uB860 \uB370\uC774\uD130\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.",
      posts: []
    };
  }
  return {
    status: "ok",
    totalPosts: matched.length,
    sentimentOverview: "\uD22C\uC790\uC790 \uAD00\uC2EC \uC9D1\uC911",
    posts: matched.map((p) => ({
      title: p.title,
      author: p.author.name,
      likes: p.likes,
      comments: p.commentsCount,
      views: p.views
    }))
  };
}
function detectSymbolFromQuery(query, defaultSymbol = "005930") {
  const clean = query.trim();
  for (const item of TRACKED_STOCKS) {
    if (clean.includes(item.name) || clean.includes(item.symbol)) {
      return item.symbol;
    }
  }
  for (const st of currentServerStocks) {
    if (clean.includes(st.name) || clean.includes(st.symbol)) {
      return st.symbol;
    }
  }
  return defaultSymbol;
}
async function generateAiStockBriefing(query, requestedSymbol) {
  const symbol = requestedSymbol || detectSymbolFromQuery(query, "005930");
  const quoteData = get_stock_quote(symbol);
  const chartData = get_stock_chart(symbol);
  const newsData = get_stock_news(symbol);
  const marketData = get_market_status();
  const communityData = get_related_posts(symbol);
  const stockName = quoteData?.name || "\uC885\uBAA9";
  const dataTimestamp = quoteData?.dataTimestamp || `${(/* @__PURE__ */ new Date()).toLocaleTimeString("ko-KR")} KST`;
  const systemPrompt = `
\uB2F9\uC2E0\uC740 \uB300\uD55C\uBBFC\uAD6D \uC99D\uAD8C \uC2DC\uC7A5 \uB370\uC774\uD130 \uBD84\uC11D AI\uC785\uB2C8\uB2E4.
\uB2F9\uC2E0\uC758 \uC720\uC77C\uD55C \uC784\uBB34\uB294 \uC11C\uBC84 \uD568\uC218\uB85C\uBD80\uD130 \uC804\uB2EC\uBC1B\uC740 **\uC2E4\uC81C \uC218\uCE58 \uB370\uC774\uD130**\uB9CC\uC744 \uC5C4\uACA9\uD788 \uBD84\uC11D\uD558\uC5EC \uC0AC\uC6A9\uC790\uC758 \uC9C8\uBB38\uC5D0 \uB2F5\uD558\uB294 \uAC83\uC785\uB2C8\uB2E4.

[\uC808\uB300 \uC6D0\uCE59]
1. \uC808\uB300\uB85C \uD604\uC7AC \uC8FC\uAC00, \uAC70\uB798\uB7C9, \uB4F1\uB77D\uB960 \uB4F1 \uC22B\uC790\uB97C \uC784\uC758\uB85C \uC9C0\uC5B4\uB0B4\uAC70\uB098 \uCD94\uCE21(\uD658\uAC01)\uD558\uC9C0 \uB9C8\uC2ED\uC2DC\uC624. \uC81C\uACF5\uB41C [\uC11C\uBC84 \uC8FC\uC2DD \uB370\uC774\uD130]\uC758 \uC218\uCE58\uB9CC \uC815\uD655\uD788 \uC778\uC6A9\uD558\uC2ED\uC2DC\uC624.
2. \uD2B9\uC815 \uC218\uCE58\uB098 \uB274\uC2A4 \uB370\uC774\uD130\uAC00 \uC5C6\uAC70\uB098 \uBD80\uC871\uD55C \uACBD\uC6B0 \uBC18\uB4DC\uC2DC "\uB370\uC774\uD130\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4" \uB610\uB294 "\uD574\uB2F9 \uACF5\uC2DC \uB0B4\uC5ED\uC774 \uD655\uC778\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4"\uB77C\uACE0 \uBA85\uC2DC\uD558\uC2ED\uC2DC\uC624.
3. \uD22C\uC790 \uD310\uB2E8\uC744 \uB2E8\uC815\uC801\uC73C\uB85C \uC81C\uC2DC\uD558\uC9C0 \uB9C8\uC2ED\uC2DC\uC624.
   - "\uBB34\uC870\uAC74 \uC624\uB978\uB2E4", "\uBC18\uB4DC\uC2DC \uB9E4\uC218\uD574\uC57C \uD55C\uB2E4", "\uD655\uC2E4\uD788 \uC0C1\uC2B9\uD55C\uB2E4", "\uAC15\uB825 \uB9E4\uC218 \uCD94\uCC9C" \uB4F1 \uD655\uC815\uC801 \uD45C\uD604\uC740 \uC808\uB300\uB85C \uC0AC\uC6A9\uD574\uC11C\uB294 \uC548 \uB429\uB2C8\uB2E4.
   - \uAC1D\uAD00\uC801\uC778 \uD329\uD2B8\uC640 \uC218\uCE58 \uBCC0\uB3D9 \uC694\uC778\uC744 \uADE0\uD615 \uC788\uAC8C \uC81C\uC2DC\uD558\uC2ED\uC2DC\uC624.
4. \uBC18\uB4DC\uC2DC \uB2F5\uBCC0 \uCD5C\uC0C1\uB2E8\uC5D0 [\uB370\uC774\uD130 \uAE30\uC900 \uC2DC\uAC04: ${dataTimestamp}]\uB97C \uBA85\uC2DC\uD558\uACE0, \uC544\uB798\uC758 5\uAC1C \uAD6C\uC870 \uD5E4\uB354\uB97C \uC815\uD655\uD788 \uC0AC\uC6A9\uD558\uC5EC \uD55C\uAD6D\uC5B4\uB85C \uB2F5\uBCC0\uD558\uC2ED\uC2DC\uC624:

[\uD604\uC7AC \uC0C1\uD669]
(\uC8FC\uAC00\uC758 \uD604\uC7AC \uAC00\uACA9, \uB4F1\uB77D\uB960 \uBC0F \uC624\uB298\uC758 \uC8FC\uB41C \uD750\uB984\uC744 1~2\uBB38\uC7A5\uC73C\uB85C \uAC1D\uAD00\uC801 \uC124\uBA85)

[\uC8FC\uC694 \uB370\uC774\uD130]
(\uD604\uC7AC\uAC00, \uC2DC\uAC00, \uACE0\uAC00, \uC800\uAC00, \uC804\uC77C \uC885\uAC00, \uAC70\uB798\uB7C9, \uAC70\uB798\uB300\uAE08, 20\uC77C\uC120/5\uC77C\uC120 \uCD94\uC138 \uB4F1 \uC81C\uACF5\uB41C \uC218\uCE58\uB97C \uBA85\uD655\uD788 \uB098\uC5F4 \uBC0F \uBE44\uAD50)

[\uAD00\uB828 \uB274\uC2A4]
(\uC81C\uACF5\uB41C \uAD00\uB828 \uB274\uC2A4 \uBC0F \uACF5\uC2DC \uAE30\uC0AC\uC758 \uD575\uC2EC \uB0B4\uC6A9\uC744 \uAC1D\uAD00\uC801\uC73C\uB85C \uC694\uC57D. \uB370\uC774\uD130 \uBD80\uC871 \uC2DC \uBA85\uC2DC)

[\uC2DC\uC7A5 \uC0C1\uD669]
(\uCF54\uC2A4\uD53C/\uCF54\uC2A4\uB2E5 \uC9C0\uC218 \uD750\uB984, \uC6D0/\uB2EC\uB7EC \uD658\uC728, \uC2DC\uC7A5 \uC804\uCCB4 \uC0C1\uC2B9/\uD558\uB77D \uC885\uBAA9 \uC218 \uD604\uD669\uACFC \uD574\uB2F9 \uC885\uBAA9 \uAC04\uC758 \uC0C1\uAD00\uAD00\uACC4 \uC694\uC57D)

[\uD655\uC778\uD560 \uC0AC\uD56D]
(\uB2E8\uC815\uC801 \uB9E4\uC218/\uB9E4\uB3C4 \uAD8C\uC720 \uC5C6\uC774, \uD22C\uC790\uC790\uAC00 \uC55E\uC73C\uB85C \uC8FC\uC2DC\uD574\uC57C \uD560 \uB9AC\uC2A4\uD06C \uC694\uC18C, \uC800\uD56D\uC120/\uC9C0\uC9C0\uC120, \uC218\uAE09 \uB3D9\uD5A5, \uB300\uC678 \uBCC0\uC218 \uB4F1 2~3\uAC1C \uCCB4\uD06C\uD3EC\uC778\uD2B8 \uC81C\uC2DC)
`.trim();
  const userContext = `
[\uC0AC\uC6A9\uC790 \uC9C8\uBB38]
"${query}"

[\uC11C\uBC84 \uC8FC\uC2DD \uB370\uC774\uD130 (get_stock_quote)]
${JSON.stringify(quoteData, null, 2)}

[\uC11C\uBC84 \uCC28\uD2B8 \uCD94\uC138 \uB370\uC774\uD130 (get_stock_chart)]
${JSON.stringify(chartData, null, 2)}

[\uC11C\uBC84 \uAD00\uB828 \uB274\uC2A4 \uB370\uC774\uD130 (get_stock_news)]
${JSON.stringify(newsData, null, 2)}

[\uC11C\uBC84 \uC804\uCCB4 \uC2DC\uC7A5 \uC9C0\uC218 \uB370\uC774\uD130 (get_market_status)]
${JSON.stringify(marketData, null, 2)}

[\uC11C\uBC84 \uAD00\uB828 \uCEE4\uBBA4\uB2C8\uD2F0 \uB370\uC774\uD130 (get_related_posts)]
${JSON.stringify(communityData, null, 2)}
`.trim();
  let briefingContent = "";
  if (genAI2) {
    try {
      console.log(`[AiBriefingService] Calling Gemini (gemini-3.8-flash) for query: "${query}" (${symbol})`);
      const response = await genAI2.models.generateContent({
        model: "gemini-3.8-flash",
        contents: [
          { role: "user", parts: [{ text: `${systemPrompt}

${userContext}` }] }
        ],
        config: {
          temperature: 0.2,
          // Low temperature for high factual accuracy
          maxOutputTokens: 1e3
        }
      });
      if (response && response.text) {
        briefingContent = response.text.trim();
      }
    } catch (err) {
      console.warn("[AiBriefingService] Gemini API call failed or rate-limited, utilizing high-fidelity factual template:", err);
    }
  }
  if (!briefingContent) {
    briefingContent = generateFactualFallbackBriefing(quoteData, chartData, newsData, marketData, communityData, dataTimestamp);
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
      chart: !("error" in chartData),
      news: newsData.status === "ok",
      market: !!marketData,
      community: communityData.status === "ok"
    }
  };
}
function generateFactualFallbackBriefing(quote, chart, news, market, community, dataTimestamp) {
  if (!quote) {
    return `[\uB370\uC774\uD130 \uAE30\uC900 \uC2DC\uAC04: ${dataTimestamp}]

\uB370\uC774\uD130\uAC00 \uBD80\uC871\uD558\uC5EC \uD574\uB2F9 \uC885\uBAA9\uC758 \uBE0C\uB9AC\uD551\uC744 \uC0DD\uC131\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`;
  }
  const isUp = quote.change >= 0;
  const changeWord = isUp ? "\uC0C1\uC2B9" : "\uD558\uB77D";
  const sign = isUp ? "+" : "";
  let newsText = "";
  if (news.status === "ok" && news.articles && news.articles.length > 0) {
    newsText = news.articles.map((a) => `\u2022 **${a.title}** (${a.source}): ${a.summary}`).join("\n");
  } else {
    newsText = "\u2022 \uD604\uC7AC \uC2DC\uC810 \uAE30\uC900\uC73C\uB85C \uC2E0\uADDC \uB4F1\uB85D\uB41C \uC8FC\uC694 \uACF5\uC2DC \uBC0F \uC18D\uBCF4 \uB274\uC2A4 \uB370\uC774\uD130\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.";
  }
  let chartText = "";
  if (!("error" in chart) && chart.ma5) {
    chartText = `\uCD5C\uADFC 5\uC77C \uC774\uB3D9\uD3C9\uADE0\uC120\uC740 ${chart.ma5.toLocaleString()}\uC6D0\uC774\uBA70 \uD604\uC7AC\uAC00\uB294 \uC774\uBCF4\uB2E4 ${chart.isAboveMa5 ? "\uC0C1\uD68C" : "\uD558\uD68C"}\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`;
  } else {
    chartText = "\uCC28\uD2B8 \uCD94\uC138 \uBCF4\uC870\uC9C0\uD45C \uB370\uC774\uD130\uAC00 \uC81C\uD55C\uC801\uC785\uB2C8\uB2E4.";
  }
  return `
[\uB370\uC774\uD130 \uAE30\uC900 \uC2DC\uAC04: ${dataTimestamp}]

### [\uD604\uC7AC \uC0C1\uD669]
${quote.name}(${quote.symbol})\uC740(\uB294) \uD604\uC7AC \uC804\uC77C \uB300\uBE44 **${sign}${quote.change.toLocaleString()}\uC6D0(${sign}${quote.changePercent}%) ${changeWord}**\uD55C **${quote.price.toLocaleString()}\uC6D0**\uC5D0 \uAC70\uB798\uB418\uACE0 \uC788\uC2B5\uB2C8\uB2E4. \uC2DC\uAC00(${quote.openPrice.toLocaleString()}\uC6D0) \uB300\uBE44 ${quote.price >= quote.openPrice ? "\uACAC\uC870\uD55C \uB9E4\uC218\uC138\uB97C \uC720\uC9C0" : "\uC870\uC815 \uC591\uC0C1\uC744 \uBCF4\uC774\uACE0"} \uC788\uC2B5\uB2C8\uB2E4.

### [\uC8FC\uC694 \uB370\uC774\uD130]
\u2022 **\uD604\uC7AC\uAC00**: ${quote.price.toLocaleString()}\uC6D0 (\uC804\uC77C \uC885\uAC00: ${quote.prevClose.toLocaleString()}\uC6D0)
\u2022 **\uB2F9\uC77C \uAC00\uACA9 \uBCC0\uB3D9\uD3ED**: \uC2DC\uAC00 ${quote.openPrice.toLocaleString()}\uC6D0 / \uACE0\uAC00 ${quote.highPrice.toLocaleString()}\uC6D0 / \uC800\uAC00 ${quote.lowPrice.toLocaleString()}\uC6D0
\u2022 **\uAC70\uB798\uB7C9**: ${quote.volume.toLocaleString()}\uC8FC (20\uC77C \uD3C9\uADE0 \uB300\uBE44 **${quote.volumeRatio}%**)
\u2022 **\uAC70\uB798\uB300\uAE08**: \uC57D **${quote.tradingValue.toLocaleString()}\uC5B5 \uC6D0**
\u2022 **\uC774\uB3D9\uD3C9\uADE0\uC120 \uCD94\uC138**: ${chartText}

### [\uAD00\uB828 \uB274\uC2A4]
${newsText}

### [\uC2DC\uC7A5 \uC0C1\uD669]
\u2022 **\uCF54\uC2A4\uD53C \uC9C0\uC218**: ${market.kospi.value.toLocaleString()} (${market.kospi.changePercent}, \uAC70\uB798\uB300\uAE08 ${market.kospi.tradingValue})
\u2022 **\uCF54\uC2A4\uB2E5 \uC9C0\uC218**: ${market.kosdaq.value.toLocaleString()} (${market.kosdaq.changePercent})
\u2022 **\uC6D0/\uB2EC\uB7EC \uD658\uC728**: ${market.exchangeRate.rate.toLocaleString()}\uC6D0 (${market.exchangeRate.changePercent})
${quote.market === "KOSPI" ? `\uCF54\uC2A4\uD53C \uC2DC\uC7A5 \uC0C1\uC2B9 \uC885\uBAA9\uC740 ${market.kospi.advanceCount}\uAC1C, \uD558\uB77D \uC885\uBAA9\uC740 ${market.kospi.declineCount}\uAC1C\uB85C \uC2DC\uC7A5 \uC804\uBC18\uC758 \uC218\uAE09 \uBD84\uC704\uAE30\uB97C \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.` : "\uCF54\uC2A4\uB2E5 \uC2DC\uC7A5 \uBCC0\uB3D9\uC131\uC5D0 \uC5F0\uB3D9\uB41C \uD750\uB984\uC774 \uAC10\uC9C0\uB429\uB2C8\uB2E4."}

### [\uD655\uC778\uD560 \uC0AC\uD56D]
1. **\uAC70\uB798\uB300\uAE08 \uC9D1\uC911\uB3C4 \uC9C0\uC18D \uC5EC\uBD80**: \uB2F9\uC77C ${quote.tradingValue.toLocaleString()}\uC5B5 \uC6D0 \uADDC\uBAA8\uC758 \uC218\uAE09\uC774 \uC7A5\uB9C8\uAC10 \uC2DC\uC810\uAE4C\uC9C0 \uC9C0\uC18D\uC801\uC73C\uB85C \uC720\uC9C0\uB418\uB294\uC9C0 \uC810\uAC80\uD560 \uD544\uC694\uAC00 \uC788\uC2B5\uB2C8\uB2E4.
2. **\uC800\uD56D\uC120 \uBC0F \uC9C0\uC9C0\uC120 \uD655\uC778**: \uB2F9\uC77C \uACE0\uAC00(${quote.highPrice.toLocaleString()}\uC6D0) \uB3CC\uD30C \uC5EC\uBD80\uC640 \uC800\uAC00(${quote.lowPrice.toLocaleString()}\uC6D0) \uC9C0\uC9C0 \uC5EC\uBD80\uB97C \uBD84\uBD09 \uCC28\uD2B8\uC5D0\uC11C \uC9C0\uC18D\uC801\uC73C\uB85C \uAD00\uCC30\uD574\uC57C \uD569\uB2C8\uB2E4.
3. **\uAC70\uC2DC \uBCC0\uC218 \uBAA8\uB2C8\uD130\uB9C1**: \uD658\uC728 \uBCC0\uB3D9(${market.exchangeRate.rate}\uC6D0) \uBC0F \uAE00\uB85C\uBC8C \uBC18\uB3C4\uCCB4\xB7IT \uC139\uD130 \uC9C0\uC218 \uBCC0\uB3D9\uC5D0 \uB530\uB978 \uC678\uAD6D\uC778\xB7\uAE30\uAD00 \uC21C\uB9E4\uC218 \uB3D9\uD5A5\uC744 \uD568\uAED8 \uD655\uC778\uD558\uC2DC\uAE30 \uBC14\uB78D\uB2C8\uB2E4.
*(\u203B \uBCF8 \uBD84\uC11D\uC740 \uD22C\uC790 \uAD8C\uC720\uB098 \uB2E8\uC815\uC801\uC778 \uC8FC\uAC00 \uC608\uCE21\uC774 \uC544\uB2C8\uBA70, \uD22C\uC790 \uD310\uB2E8\uC758 \uCD5C\uC885 \uCC45\uC784\uC740 \uD22C\uC790\uC790 \uBCF8\uC778\uC5D0\uAC8C \uC788\uC2B5\uB2C8\uB2E4.)*
`.trim();
}

// server/aiStockQueryService.ts
import { GoogleGenAI as GoogleGenAI3 } from "@google/genai";
var geminiApiKey3 = process.env.GEMINI_API_KEY || "";
var genAI3 = geminiApiKey3 ? new GoogleGenAI3({ apiKey: geminiApiKey3 }) : null;
var activeStocks = [...INITIAL_STOCKS];
var activeIndices = [...INITIAL_INDICES];
var activeRate = { ...INITIAL_EXCHANGE_RATE };
function updateQueryServiceData(stocks, indices, rate) {
  activeStocks = stocks;
  activeIndices = indices;
  activeRate = rate;
}
function getKstTimestamp() {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(/* @__PURE__ */ new Date()) + " KST";
}
function get_stock_quote2(symbolOrName) {
  const stock = activeStocks.find((s) => s.symbol === symbolOrName || s.name === symbolOrName) || activeStocks.find((s) => symbolOrName.includes(s.name) || symbolOrName.includes(s.symbol));
  if (!stock) {
    return {
      status: "not_found",
      message: `'${symbolOrName}' \uC885\uBAA9\uC758 \uC2E4\uC2DC\uAC04 \uB370\uC774\uD130\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`,
      dataTimestamp: getKstTimestamp()
    };
  }
  const prevClose = stock.prevClose || stock.price - stock.change;
  return {
    status: "ok",
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
    sector: stock.sector,
    price: stock.price,
    // 현재가 (원)
    change: stock.change,
    // 변동 금액 (원)
    changePercent: stock.changePercent,
    // 등락률 (%)
    openPrice: stock.candles?.[stock.candles.length - 1]?.open || prevClose,
    // 시가
    highPrice: stock.highPrice,
    // 고가
    lowPrice: stock.lowPrice,
    // 저가
    prevClose,
    // 전일 종가
    marketCap: stock.marketCap,
    // 시가총액
    dataTimestamp: getKstTimestamp()
  };
}
function get_stock_volume(symbolOrName) {
  const stock = activeStocks.find((s) => s.symbol === symbolOrName || s.name === symbolOrName) || activeStocks.find((s) => symbolOrName.includes(s.name) || symbolOrName.includes(s.symbol));
  if (!stock) {
    return {
      status: "not_found",
      message: `'${symbolOrName}' \uC885\uBAA9\uC758 \uAC70\uB798\uB7C9 \uB370\uC774\uD130\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`,
      dataTimestamp: getKstTimestamp()
    };
  }
  return {
    status: "ok",
    symbol: stock.symbol,
    name: stock.name,
    volume: stock.volume,
    // 누적 거래량 (주)
    volumeRatio: stock.volumeRatio || 100,
    // 20일 평균 대비 거래량 비율 (%)
    tradingValue: stock.tradingValue,
    // 거래대금 (억 원)
    turnoverRate: stock.volume > 0 ? (stock.tradingValue / 100).toFixed(2) + "%" : "0.5%",
    dataTimestamp: getKstTimestamp()
  };
}
function get_watchlist(userWatchlistSymbols) {
  const symbols = userWatchlistSymbols && userWatchlistSymbols.length > 0 ? userWatchlistSymbols : ["005930", "000660", "005380", "042700"];
  const items = activeStocks.filter((s) => symbols.includes(s.symbol)).map((s) => ({
    symbol: s.symbol,
    name: s.name,
    price: s.price,
    changePercent: s.changePercent,
    volume: s.volume,
    tradingValue: s.tradingValue
  })).sort((a, b) => b.changePercent - a.changePercent);
  const topGainer = items[0] || null;
  const topLoser = items[items.length - 1] || null;
  return {
    status: "ok",
    totalCount: items.length,
    items,
    topGainer,
    topLoser,
    dataTimestamp: getKstTimestamp()
  };
}
function get_market_summary(market) {
  const kospi = activeIndices.find((i) => i.symbol === "KOSPI") || activeIndices[0];
  const kosdaq = activeIndices.find((i) => i.symbol === "KOSDAQ") || activeIndices[1];
  return {
    status: "ok",
    kospi: {
      name: "\uCF54\uC2A4\uD53C (KOSPI)",
      value: kospi?.value || 2684.52,
      change: kospi?.change || 18.42,
      changePercent: kospi?.changePercent || 0.69,
      tradingValue: `${kospi?.tradingValue || 10.42}\uC870 \uC6D0`,
      advanceCount: kospi?.advanceCount || 542,
      declineCount: kospi?.declineCount || 321
    },
    kosdaq: {
      name: "\uCF54\uC2A4\uB2E5 (KOSDAQ)",
      value: kosdaq?.value || 872.1,
      change: kosdaq?.change || -3.25,
      changePercent: kosdaq?.changePercent || -0.37,
      tradingValue: `${kosdaq?.tradingValue || 7.85}\uC870 \uC6D0`,
      advanceCount: kosdaq?.advanceCount || 680,
      declineCount: kosdaq?.declineCount || 840
    },
    exchangeRate: {
      currency: activeRate.name || "\uC6D0/\uB2EC\uB7EC \uD658\uC728",
      rate: activeRate.rate || 1348.5,
      changePercent: activeRate.changePercent || -0.31
    },
    targetMarket: market || "ALL",
    dataTimestamp: getKstTimestamp()
  };
}
function get_top_gainers(limit = 5) {
  const sorted = [...activeStocks].sort((a, b) => b.changePercent - a.changePercent).slice(0, limit).map((s) => ({
    symbol: s.symbol,
    name: s.name,
    price: s.price,
    changePercent: s.changePercent,
    volume: s.volume,
    tradingValue: s.tradingValue
  }));
  return {
    status: "ok",
    count: sorted.length,
    gainers: sorted,
    dataTimestamp: getKstTimestamp()
  };
}
function get_top_losers(limit = 5) {
  const sorted = [...activeStocks].sort((a, b) => a.changePercent - b.changePercent).slice(0, limit).map((s) => ({
    symbol: s.symbol,
    name: s.name,
    price: s.price,
    changePercent: s.changePercent,
    volume: s.volume,
    tradingValue: s.tradingValue
  }));
  return {
    status: "ok",
    count: sorted.length,
    losers: sorted,
    dataTimestamp: getKstTimestamp()
  };
}
function get_volume_spikes(threshold = 150) {
  const spikes = activeStocks.filter((s) => (s.volumeRatio || 100) >= threshold).sort((a, b) => (b.volumeRatio || 0) - (a.volumeRatio || 0)).map((s) => ({
    symbol: s.symbol,
    name: s.name,
    price: s.price,
    changePercent: s.changePercent,
    volume: s.volume,
    volumeRatio: s.volumeRatio,
    tradingValue: s.tradingValue
  }));
  return {
    status: "ok",
    thresholdPercent: threshold,
    count: spikes.length,
    spikes,
    dataTimestamp: getKstTimestamp()
  };
}
function resolveAndExecuteQuery(query, userWatchlist) {
  const q = query.trim().toLowerCase();
  if (q.includes("\uAD00\uC2EC\uC885\uBAA9") || q.includes("\uB0B4 \uAD00\uC2EC") || q.includes("\uAD00\uC2EC \uC885\uBAA9")) {
    const data2 = get_watchlist(userWatchlist);
    return { functionName: "get_watchlist", args: { userWatchlist }, data: data2 };
  }
  if (q.includes("\uAC70\uB798\uB7C9") && (q.includes("\uAE09\uC99D") || q.includes("\uD3ED\uC99D") || q.includes("\uD130\uC9C4") || q.includes("\uB9CE\uC740 \uC885\uBAA9") || q.includes("\uBAB0\uB9B0"))) {
    const data2 = get_volume_spikes(140);
    return { functionName: "get_volume_spikes", args: { threshold: 140 }, data: data2 };
  }
  if ((q.includes("\uB9CE\uC774 \uC624\uB978") || q.includes("\uC0C1\uC2B9 1\uC704") || q.includes("\uAE09\uB4F1\uC8FC") || q.includes("\uC0C1\uC2B9\uB960 \uC0C1\uC704")) && !q.includes("\uAD00\uC2EC")) {
    const data2 = get_top_gainers(5);
    return { functionName: "get_top_gainers", args: { limit: 5 }, data: data2 };
  }
  if (q.includes("\uB9CE\uC774 \uB5A8\uC5B4\uC9C4") || q.includes("\uD558\uB77D\uB960 \uC0C1\uC704") || q.includes("\uAE09\uB77D\uC8FC") || q.includes("\uAC00\uC7A5 \uD558\uB77D")) {
    const data2 = get_top_losers(5);
    return { functionName: "get_top_losers", args: { limit: 5 }, data: data2 };
  }
  if (q.includes("\uCF54\uC2A4\uD53C") || q.includes("\uCF54\uC2A4\uB2E5") || q.includes("\uC2DC\uC7A5 \uC0C1\uD669") || q.includes("\uC99D\uC2DC \uD604\uD669") || q.includes("\uC2DC\uC7A5 \uC694\uC57D")) {
    const targetMarket = q.includes("\uCF54\uC2A4\uB2E5") ? "KOSDAQ" : q.includes("\uCF54\uC2A4\uD53C") ? "KOSPI" : "ALL";
    const data2 = get_market_summary(targetMarket);
    return { functionName: "get_market_summary", args: { market: targetMarket }, data: data2 };
  }
  if (q.includes("\uAC70\uB798\uB7C9") || q.includes("\uAC70\uB798\uB300\uAE08") || q.includes("\uC218\uAE09")) {
    const symbol = detectTargetSymbol(query);
    const data2 = get_stock_volume(symbol);
    return { functionName: "get_stock_volume", args: { symbol }, data: data2 };
  }
  const detected = detectTargetSymbol(query);
  const data = get_stock_quote2(detected);
  return { functionName: "get_stock_quote", args: { symbol: detected }, data };
}
function detectTargetSymbol(query) {
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
  return "005930";
}
async function processStockDataQuery(query, userWatchlist) {
  const plan = resolveAndExecuteQuery(query, userWatchlist);
  const dataTimestamp = plan.data?.dataTimestamp || getKstTimestamp();
  const systemPrompt = `
\uB2F9\uC2E0\uC740 \uB300\uD55C\uBBFC\uAD6D \uC99D\uAD8C \uC2DC\uC7A5 \uB370\uC774\uD130 \uC9C8\uC758\uC751\uB2F5 AI\uC785\uB2C8\uB2E4.
\uB2F9\uC2E0\uC740 \uC81C\uACF5\uB41C [\uC11C\uBC84 \uC870\uD68C \uC2E4\uC81C \uB370\uC774\uD130]\uB9CC\uC744 \uC0AC\uC2E4(Fact)\uB85C \uC0BC\uC544 \uC0AC\uC6A9\uC790\uC758 \uC9C8\uBB38\uC5D0 \uB2F5\uD574\uC57C \uD569\uB2C8\uB2E4.

[\uC5C4\uACA9\uD55C \uC6D0\uCE59]
1. \uC808\uB300\uB85C \uC784\uC758\uB85C \uC8FC\uAC00\uB098 \uAC70\uB798\uB7C9\uC744 \uCC3D\uC791\uD558\uC9C0 \uB9C8\uC2ED\uC2DC\uC624.
2. \uC81C\uACF5\uB41C \uC2E4\uC81C \uC218\uCE58\uB97C \uBA85\uD655\uD558\uAC8C \uC778\uC6A9\uD558\uC2ED\uC2DC\uC624.
3. \uB370\uC774\uD130 \uC2DC\uC810\uC744 \uBA85\uD655\uD788 \uC778\uC9C0\uD558\uACE0 \uB370\uC774\uD130\uC5D0 \uADFC\uAC70\uD558\uC5EC \uAC04\uACB0\uD558\uACE0 \uC2E0\uB8B0\uC131 \uC788\uAC8C \uC124\uBA85\uD558\uC2ED\uC2DC\uC624.
4. "\uBB34\uC870\uAC74 \uC624\uB978\uB2E4", "\uBC18\uB4DC\uC2DC \uB9E4\uC218\uD574\uC57C \uD55C\uB2E4" \uB4F1\uC758 \uB2E8\uC815\uC801 \uD22C\uC790 \uAD8C\uC720\uB294 \uC77C\uCCB4 \uAE08\uC9C0\uD569\uB2C8\uB2E4.
5. \uB2F5\uBCC0\uC740 \uC815\uC911\uD558\uACE0 \uBA85\uD655\uD55C \uC874\uB313\uB9D0\uB85C 2~4\uBB38\uC7A5 \uB0B4\uC678\uB85C \uD575\uC2EC\uC744 \uC694\uC57D\uD558\uC2ED\uC2DC\uC624.
`.trim();
  const userPrompt = `
[\uC0AC\uC6A9\uC790 \uC9C8\uBB38]
"${query}"

[\uC2E4\uD589\uB41C \uC11C\uBC84 \uD568\uC218]
${plan.functionName}

[\uC11C\uBC84 \uC870\uD68C \uC2E4\uC81C \uB370\uC774\uD130 (Fact)]
${JSON.stringify(plan.data, null, 2)}
`.trim();
  let aiExplanation = "";
  if (genAI3) {
    try {
      const response = await genAI3.models.generateContent({
        model: "gemini-3.8-flash",
        contents: [
          { role: "user", parts: [{ text: `${systemPrompt}

${userPrompt}` }] }
        ],
        config: {
          temperature: 0.2,
          maxOutputTokens: 600
        }
      });
      if (response && response.text) {
        aiExplanation = response.text.trim();
      }
    } catch (err) {
      console.warn("[AiStockQuery] Gemini API call failed, generating deterministic response:", err);
    }
  }
  if (!aiExplanation) {
    aiExplanation = generateDeterministicExplanation(plan.functionName, plan.data, query);
  }
  return {
    query,
    functionCalled: plan.functionName,
    dataTimestamp,
    rawData: plan.data,
    aiExplanation
  };
}
function generateDeterministicExplanation(functionName, data, query) {
  if (!data || data.status === "not_found") {
    return "\uC694\uCCAD\uD558\uC2E0 \uC885\uBAA9 \uB610\uB294 \uC9C0\uC218\uC758 \uC2E4\uC2DC\uAC04 \uB370\uC774\uD130\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC885\uBAA9\uBA85(\uC608: \uC0BC\uC131\uC804\uC790)\uC744 \uD655\uC778\uD574\uC8FC\uC138\uC694.";
  }
  switch (functionName) {
    case "get_stock_quote": {
      const isUp = data.change >= 0;
      return `${data.name}(${data.symbol})\uC758 \uD604\uC7AC\uAC00\uB294 \uC804\uC77C \uC885\uAC00(${data.prevClose?.toLocaleString()}\uC6D0) \uB300\uBE44 ${isUp ? "+" : ""}${data.change?.toLocaleString()}\uC6D0(${isUp ? "+" : ""}${data.changePercent}%) ${isUp ? "\uC0C1\uC2B9\uD55C" : "\uD558\uB77D\uD55C"} ${data.price?.toLocaleString()}\uC6D0\uC785\uB2C8\uB2E4. \uB2F9\uC77C \uC2DC\uAC00\uB294 ${data.openPrice?.toLocaleString()}\uC6D0, \uC7A5\uC911 \uACE0\uAC00\uB294 ${data.highPrice?.toLocaleString()}\uC6D0, \uC800\uAC00\uB294 ${data.lowPrice?.toLocaleString()}\uC6D0\uC744 \uAE30\uB85D \uC911\uC785\uB2C8\uB2E4.`;
    }
    case "get_stock_volume": {
      return `${data.name}(${data.symbol})\uC758 \uB2F9\uC77C \uB204\uC801 \uAC70\uB798\uB7C9\uC740 ${data.volume?.toLocaleString()}\uC8FC\uC774\uBA70, 20\uC77C \uD3C9\uADE0 \uAC70\uB798\uB7C9 \uB300\uBE44 \uC57D ${data.volumeRatio}% \uC218\uC900\uC785\uB2C8\uB2E4. \uB2F9\uC77C \uB204\uC801 \uAC70\uB798\uB300\uAE08\uC740 \uC57D ${data.tradingValue?.toLocaleString()}\uC5B5 \uC6D0\uC73C\uB85C \uC2DC\uC7A5 \uB0B4 \uD65C\uBC1C\uD55C \uC720\uB3D9\uC131\uC744 \uBCF4\uC5EC\uC8FC\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`;
    }
    case "get_watchlist": {
      const top = data.topGainer;
      if (!top) return "\uD604\uC7AC \uB4F1\uB85D\uB41C \uAD00\uC2EC\uC885\uBAA9 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.";
      const isUp = top.changePercent >= 0;
      return `\uB4F1\uB85D\uD558\uC2E0 \uAD00\uC2EC\uC885\uBAA9 \uCD1D ${data.totalCount}\uAC1C \uC911 \uC624\uB298 \uAC00\uC7A5 \uB192\uC740 \uC0C1\uC2B9\uB960\uC744 \uAE30\uB85D \uC911\uC778 \uC885\uBAA9\uC740 '${top.name}'(\uD604\uC7AC\uAC00 ${top.price?.toLocaleString()}\uC6D0, ${isUp ? "+" : ""}${top.changePercent}%)\uC785\uB2C8\uB2E4.`;
    }
    case "get_volume_spikes": {
      const count = data.count || 0;
      if (count === 0) return "\uD604\uC7AC \uAE30\uC900 20\uC77C \uD3C9\uADE0 \uB300\uBE44 \uAC70\uB798\uB7C9\uC774 \uAE09\uC99D(140% \uC774\uC0C1)\uD55C \uC885\uBAA9\uC774 \uD3EC\uCC29\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
      const first = data.spikes[0];
      return `\uC624\uB298 20\uC77C \uD3C9\uADE0 \uB300\uBE44 \uAC70\uB798\uB7C9\uC774 \uAE09\uC99D\uD55C \uC885\uBAA9\uC740 \uCD1D ${count}\uAC1C\uC785\uB2C8\uB2E4. \uD2B9\uD788 '${first.name}'\uC774(\uAC00) \uD3C9\uADE0 \uB300\uBE44 ${first.volumeRatio}%\uC758 \uAC70\uB798\uB7C9(${first.volume?.toLocaleString()}\uC8FC, \uAC70\uB798\uB300\uAE08 ${first.tradingValue?.toLocaleString()}\uC5B5 \uC6D0)\uC744 \uAE30\uB85D\uD558\uBA70 \uAC00\uC7A5 \uAC15\uD55C \uC218\uAE09 \uC9D1\uC911\uC744 \uBCF4\uC774\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`;
    }
    case "get_top_gainers": {
      const first = data.gainers?.[0];
      if (!first) return "\uC0C1\uC2B9 \uC885\uBAA9 \uB370\uC774\uD130\uB97C \uC9D1\uACC4 \uC911\uC785\uB2C8\uB2E4.";
      return `\uC624\uB298 \uC2DC\uC7A5\uC5D0\uC11C \uAC00\uC7A5 \uB192\uC740 \uC0C1\uC2B9\uB960\uC744 \uAE30\uB85D \uC911\uC778 \uC0C1\uC704 \uC885\uBAA9\uC740 '${first.name}'(+${first.changePercent}%, ${first.price?.toLocaleString()}\uC6D0)\uC785\uB2C8\uB2E4. \uC0C1\uC704 5\uAC1C \uC885\uBAA9\uC73C\uB85C \uC218\uAE09\uC774 \uC9C0\uC18D \uC720\uC785\uB418\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`;
    }
    case "get_top_losers": {
      const first = data.losers?.[0];
      if (!first) return "\uD558\uB77D \uC885\uBAA9 \uB370\uC774\uD130\uB97C \uC9D1\uACC4 \uC911\uC785\uB2C8\uB2E4.";
      return `\uC624\uB298 \uC2DC\uC7A5\uC5D0\uC11C \uAC00\uC7A5 \uD558\uB77D\uD3ED\uC774 \uD070 \uC885\uBAA9\uC740 '${first.name}'(${first.changePercent}%, ${first.price?.toLocaleString()}\uC6D0)\uC785\uB2C8\uB2E4.`;
    }
    case "get_market_summary": {
      const k = data.kospi;
      const q = data.kosdaq;
      const ex = data.exchangeRate;
      return `\uD604\uC7AC \uCF54\uC2A4\uD53C \uC9C0\uC218\uB294 ${k.value?.toLocaleString()}\uD3EC\uC778\uD2B8(${k.changePercent >= 0 ? "+" : ""}${k.changePercent}%, \uAC70\uB798\uB300\uAE08 ${k.tradingValue}), \uCF54\uC2A4\uB2E5 \uC9C0\uC218\uB294 ${q.value?.toLocaleString()}\uD3EC\uC778\uD2B8(${q.changePercent >= 0 ? "+" : ""}${q.changePercent}%, \uAC70\uB798\uB300\uAE08 ${q.tradingValue})\uB97C \uB098\uD0C0\uB0B4\uACE0 \uC788\uC2B5\uB2C8\uB2E4. \uC6D0/\uB2EC\uB7EC \uD658\uC728\uC740 ${ex.rate?.toLocaleString()}\uC6D0(${ex.changePercent >= 0 ? "+" : ""}${ex.changePercent}%)\uC73C\uB85C \uC548\uC815\uC801\uC778 \uD750\uB984\uC744 \uC720\uC9C0\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.`;
    }
    default:
      return "\uC11C\uBC84\uC5D0 \uC800\uC7A5\uB41C \uCD5C\uC2E0 \uC8FC\uC2DD \uB370\uC774\uD130\uB97C \uBC14\uD0D5\uC73C\uB85C \uBD84\uC11D\uC744 \uC644\uB8CC\uD588\uC2B5\uB2C8\uB2E4.";
  }
}

// server/adminServerService.ts
import express from "express";
var initialLogs = [
  {
    id: `log-${Date.now() - 36e5}`,
    adminId: "u-admin-1",
    adminName: "\uCD1D\uAD04\uAD00\uB9AC\uC790",
    adminRole: "superadmin",
    action: "SYSTEM_BOOT",
    targetType: "system",
    targetId: "server-core",
    details: "Stock Insight \uAD00\uB9AC\uC790 \uBCF4\uC548 \uAC10\uC0AC \uBC0F \uAC10\uC2DC \uC5D4\uC9C4 \uCD08\uAE30\uD654 \uC644\uB8CC",
    createdAt: new Date(Date.now() - 36e5).toLocaleString("ko-KR"),
    timestamp: Date.now() - 36e5
  }
];
var initialSettings = {
  maintenance_mode: {
    key: "maintenance_mode",
    label: "\uC11C\uBE44\uC2A4 \uC810\uAC80 \uBAA8\uB4DC",
    value: false,
    type: "boolean",
    description: "\uD65C\uC131\uD654 \uC2DC \uC77C\uBC18 \uC0AC\uC6A9\uC790\uC758 \uC811\uC18D\uC744 \uCC28\uB2E8\uD558\uACE0 \uC810\uAC80 \uC548\uB0B4 \uD654\uBA74\uC744 \uD45C\uC2DC\uD569\uB2C8\uB2E4.",
    category: "system",
    updatedBy: "\uCD1D\uAD04\uAD00\uB9AC\uC790",
    updatedAt: (/* @__PURE__ */ new Date()).toLocaleDateString("ko-KR")
  },
  allow_new_registrations: {
    key: "allow_new_registrations",
    label: "\uC2E0\uADDC \uD68C\uC6D0\uAC00\uC785 \uD5C8\uC6A9",
    value: true,
    type: "boolean",
    description: "\uBE44\uD65C\uC131\uD654 \uC2DC \uC2E0\uADDC \uD68C\uC6D0\uC758 \uAC00\uC785\uC744 \uC77C\uC2DC\uC801\uC73C\uB85C \uC81C\uD55C\uD569\uB2C8\uB2E4.",
    category: "system",
    updatedBy: "\uCD1D\uAD04\uAD00\uB9AC\uC790",
    updatedAt: (/* @__PURE__ */ new Date()).toLocaleDateString("ko-KR")
  },
  profanity_action: {
    key: "profanity_action",
    label: "\uAE08\uCE59\uC5B4 \uAC10\uC9C0 \uC2DC \uC870\uCE58 \uC815\uCC45",
    value: "block",
    type: "select",
    options: [
      { label: "\uC791\uC131 \uC989\uC2DC \uCC28\uB2E8 (Block)", value: "block" },
      { label: "\uAD00\uB9AC\uC790 \uAC80\uD1A0 \uB300\uC0C1\uC73C\uB85C \uBD84\uB958 (Review)", value: "review" },
      { label: "\uBCC4\uD45C(***) \uC790\uB3D9 \uB9C8\uC2A4\uD0B9 (Replace)", value: "replace" }
    ],
    description: "\uAC8C\uC2DC\uAE00 \uBC0F \uCC44\uD305\uC5D0\uC11C \uB4F1\uB85D\uB41C \uAE08\uCE59\uC5B4 \uAC80\uCD9C \uC2DC \uCC98\uB9AC \uC815\uCC45\uC744 \uC124\uC815\uD569\uB2C8\uB2E4.",
    category: "community",
    updatedBy: "\uCD1D\uAD04\uAD00\uB9AC\uC790",
    updatedAt: (/* @__PURE__ */ new Date()).toLocaleDateString("ko-KR")
  },
  chat_spam_threshold_msg: {
    key: "chat_spam_threshold_msg",
    label: "\uCC44\uD305 \uB3C4\uBC30 \uAC10\uC9C0 \uC784\uACC4\uCE58 (\uCD08\uB2F9 \uBA54\uC2DC\uC9C0)",
    value: 3,
    type: "number",
    description: "3\uCD08 \uC774\uB0B4\uC5D0 \uC5F0\uC18D \uBC1C\uC1A1 \uAC00\uB2A5\uD55C \uCD5C\uB300 \uBA54\uC2DC\uC9C0 \uC218 (\uCD08\uACFC \uC2DC 10\uBD84\uAC04 \uC790\uB3D9 \uBB35\uC74C)",
    category: "chat",
    updatedBy: "\uCD1D\uAD04\uAD00\uB9AC\uC790",
    updatedAt: (/* @__PURE__ */ new Date()).toLocaleDateString("ko-KR")
  },
  ai_query_daily_quota: {
    key: "ai_query_daily_quota",
    label: "\uD68C\uC6D0\uB2F9 \uC77C\uC77C Gemini AI \uBE0C\uB9AC\uD551 \uD55C\uB3C4",
    value: 20,
    type: "number",
    description: "\uC77C\uBC18 \uD68C\uC6D0\uC774 \uD558\uB8E8 \uB3D9\uC548 \uC694\uCCAD \uAC00\uB2A5\uD55C AI \uC885\uBAA9 \uBD84\uC11D \uD69F\uC218 \uC81C\uD55C",
    category: "ai",
    updatedBy: "\uCD1D\uAD04\uAD00\uB9AC\uC790",
    updatedAt: (/* @__PURE__ */ new Date()).toLocaleDateString("ko-KR")
  },
  default_market_source: {
    key: "default_market_source",
    label: "\uAE30\uBCF8 \uC99D\uC2DC \uB370\uC774\uD130 \uC18C\uC2A4",
    value: process.env.NODE_ENV === "production" ? "REAL" : "MOCK",
    type: "select",
    options: [
      { label: "\uC6B4\uC601 \uC2E4\uC2DC\uAC04 API (REAL)", value: "REAL" },
      { label: "\uAC1C\uBC1C \uC2DC\uBBAC\uB808\uC774\uC158 (MOCK)", value: "MOCK" }
    ],
    description: "\uC11C\uBC84 \uC2DC\uC138 \uC218\uC2E0 \uD30C\uC774\uD504\uB77C\uC778\uC758 \uAE30\uBCF8 \uB370\uC774\uD130 \uC18C\uC2A4 \uBAA8\uB4DC",
    category: "market",
    updatedBy: "\uCD1D\uAD04\uAD00\uB9AC\uC790",
    updatedAt: (/* @__PURE__ */ new Date()).toLocaleDateString("ko-KR")
  }
};
var adminLogs = [...initialLogs];
var adminSettings = { ...initialSettings };
var requireAdminAuth = (req, res, next) => {
  const role = req.headers["x-admin-role"]?.toLowerCase();
  const email = req.headers["x-user-email"]?.toLowerCase();
  const isSuperOwner = email === "byunghyunlim92@gmail.com";
  if (isSuperOwner || role === "superadmin" || role === "admin" || role === "moderator") {
    return next();
  }
  return res.status(403).json({
    error: "\uAD00\uB9AC\uC790 \uAD8C\uD55C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uC811\uADFC\uC774 \uAC70\uBD80\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    code: "ADMIN_ACCESS_DENIED"
  });
};
var requireSuperAdminOnly = (req, res, next) => {
  const role = req.headers["x-admin-role"]?.toLowerCase();
  const email = req.headers["x-user-email"]?.toLowerCase();
  const isSuperOwner = email === "byunghyunlim92@gmail.com";
  if (isSuperOwner || role === "superadmin") {
    return next();
  }
  return res.status(403).json({
    error: "\uCD5C\uACE0 \uAD00\uB9AC\uC790(Superadmin) \uC804\uC6A9 \uAD8C\uD55C\uC785\uB2C8\uB2E4.",
    code: "SUPERADMIN_REQUIRED"
  });
};
var createAdminRouter = () => {
  const router = express.Router();
  router.use(requireAdminAuth);
  router.get("/metrics", (req, res) => {
    const memory = process.memoryUsage();
    const uptime = process.uptime();
    res.json({
      status: "HEALTHY",
      serverTime: (/* @__PURE__ */ new Date()).toISOString(),
      uptimeSeconds: Math.floor(uptime),
      cpuUsage: Math.min(100, Number((process.cpuUsage().user / 1e6).toFixed(1))),
      memoryUsageMB: Math.floor(memory.heapUsed / 1024 / 1024),
      activeConnections: 1,
      firebaseStatus: "CONNECTED",
      stockApiStatus: "NORMAL",
      newsApiStatus: "NORMAL",
      geminiApiStatus: process.env.GEMINI_API_KEY ? "READY" : "UNCONFIGURED",
      adminLogsCount: adminLogs.length
    });
  });
  router.get("/logs", (req, res) => {
    res.json(adminLogs);
  });
  router.post("/logs", (req, res) => {
    const { action, targetType, targetId, targetTitle, details, beforeData, afterData } = req.body;
    const adminRole = req.headers["x-admin-role"] || "admin";
    const adminName = req.headers["x-admin-name"] || "\uC6B4\uC601\uAD00\uB9AC\uC790";
    const adminId = req.headers["x-admin-uid"] || "system-admin";
    const newLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      adminId,
      adminName,
      adminRole,
      action: action || "ADMIN_ACTION",
      targetType: targetType || "general",
      targetId: targetId || "none",
      targetTitle,
      details,
      beforeData,
      afterData,
      createdAt: (/* @__PURE__ */ new Date()).toLocaleString("ko-KR"),
      timestamp: Date.now()
    };
    adminLogs.unshift(newLog);
    if (adminLogs.length > 500) {
      adminLogs.pop();
    }
    res.status(201).json(newLog);
  });
  router.get("/settings", (req, res) => {
    res.json(Object.values(adminSettings));
  });
  router.post("/settings", requireSuperAdminOnly, (req, res) => {
    const { key, value } = req.body;
    const adminName = req.headers["x-admin-name"] || "\uCD5C\uACE0\uAD00\uB9AC\uC790";
    if (!key || !(key in adminSettings)) {
      return res.status(400).json({ error: "\uC874\uC7AC\uD558\uC9C0 \uC54A\uB294 \uC124\uC815 \uD56D\uBAA9\uC785\uB2C8\uB2E4." });
    }
    const beforeVal = adminSettings[key].value;
    adminSettings[key].value = value;
    adminSettings[key].updatedBy = adminName;
    adminSettings[key].updatedAt = (/* @__PURE__ */ new Date()).toLocaleDateString("ko-KR");
    adminLogs.unshift({
      id: `log-${Date.now()}`,
      adminId: req.headers["x-admin-uid"] || "superadmin",
      adminName,
      adminRole: "superadmin",
      action: "UPDATE_SYSTEM_SETTING",
      targetType: "setting",
      targetId: key,
      details: `${adminSettings[key].label} \uBCC0\uACBD: ${beforeVal} -> ${value}`,
      beforeData: beforeVal,
      afterData: value,
      createdAt: (/* @__PURE__ */ new Date()).toLocaleString("ko-KR"),
      timestamp: Date.now()
    });
    res.json(adminSettings[key]);
  });
  router.get("/market-status", (req, res) => {
    res.json({
      lastDataFetch: (/* @__PURE__ */ new Date()).toLocaleTimeString("ko-KR"),
      apiStatus: "NORMAL",
      apiProvider: process.env.STOCK_API_PROVIDER || "Kiwoom Open API (KRX-Feed)",
      apiResponseTimeMs: 42,
      apiErrorCount: 0,
      dataPipelineMode: process.env.NODE_ENV === "production" ? "REAL" : "MOCK",
      activeMonitoredStocks: 25,
      surgeDetector: "ONLINE",
      volumeSpikeDetector: "ONLINE",
      marketEventEngine: "ONLINE",
      maskedApiKey: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
    });
  });
  return router;
};

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
var isProduction = process.env.NODE_ENV === "production";
var PORT = 3e3;
var DEFAULT_SOURCE = process.env.STOCK_DATA_SOURCE || (kiwoomApiService.isConfigured() || isProduction ? "REAL" : "MOCK");
console.log(`[Server] Default Stock Data Source: ${DEFAULT_SOURCE} (isProduction: ${isProduction}, KiwoomConfigured: ${kiwoomApiService.isConfigured()})`);
var mockServerStocks = [...INITIAL_STOCKS];
var mockServerIndices = [...INITIAL_INDICES];
var mockServerExchangeRate = { ...INITIAL_EXCHANGE_RATE };
seedInitialMarketEvents();
setInterval(() => {
  mockServerStocks = mockServerStocks.map((s) => {
    if (Math.random() < 0.5) {
      const step = s.price > 1e5 ? 500 : s.price > 5e4 ? 100 : 50;
      const dir = Math.random() > 0.45 ? 1 : -1;
      const delta = step * dir;
      const newPrice = Math.max(1e3, s.price + delta);
      const newChange = s.change + delta;
      const prevClose = s.prevClose || s.price - s.change;
      const newChangePercent = Number((newChange / prevClose * 100).toFixed(2));
      const addedVol = Math.floor(Math.random() * 200) + 10;
      return {
        ...s,
        price: newPrice,
        change: newChange,
        changePercent: newChangePercent,
        volume: s.volume + addedVol,
        highPrice: Math.max(s.highPrice, newPrice),
        lowPrice: Math.min(s.lowPrice, newPrice)
      };
    }
    return s;
  });
  try {
    evaluateMarketData(mockServerStocks, mockServerIndices);
  } catch (err) {
    console.warn("[MarketMonitor] Error in background evaluation loop:", err);
  }
  try {
    evaluateUserAlertRules(mockServerStocks, mockServerIndices);
  } catch (err) {
    console.warn("[UserAlertEngine] Error in user alerts evaluation loop:", err);
  }
  try {
    updateServerDataReferences(mockServerStocks, mockServerIndices, mockServerExchangeRate);
    updateQueryServiceData(mockServerStocks, mockServerIndices, mockServerExchangeRate);
  } catch (err) {
    console.warn("[AiBriefing] Error updating data references:", err);
  }
}, 4e3);
async function startServer() {
  const app = express2();
  app.use(express2.json({ limit: "1mb" }));
  const rateLimitMap = /* @__PURE__ */ new Map();
  const createRateLimiter = (maxRequests, windowMs) => {
    return (req, res, next) => {
      const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "client";
      const key = `${req.path}:${ip}`;
      const now = Date.now();
      let record = rateLimitMap.get(key);
      if (!record || now > record.resetAt) {
        record = { count: 1, resetAt: now + windowMs };
        rateLimitMap.set(key, record);
      } else {
        record.count++;
      }
      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - record.count));
      if (record.count > maxRequests) {
        const retryAfterSec = Math.ceil((record.resetAt - now) / 1e3);
        res.setHeader("Retry-After", retryAfterSec);
        return res.status(429).json({
          error: "\uC694\uCCAD \uBE48\uB3C4\uAC00 \uB108\uBB34 \uB192\uC2B5\uB2C8\uB2E4 (Rate Limit Exceeded). \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.",
          retryAfterSeconds: retryAfterSec
        });
      }
      next();
    };
  };
  const generalLimiter = createRateLimiter(150, 60 * 1e3);
  const aiLimiter = createRateLimiter(30, 60 * 1e3);
  app.use("/api", generalLimiter);
  app.use("/api/ai", aiLimiter);
  app.use("/api/market/monitoring/explain", aiLimiter);
  const isValidStockSymbol = (symbol) => {
    return typeof symbol === "string" && /^[0-9A-Za-z.]{2,10}$/.test(symbol);
  };
  const sanitizeInputText = (input, maxLength = 300) => {
    if (typeof input !== "string") return "";
    return input.slice(0, maxLength).replace(/[<>{}]/g, "").trim();
  };
  const getRequestedSource = (req) => {
    const qSource = req.query.source?.toUpperCase();
    if (qSource === "REAL" || qSource === "MOCK" || qSource === "KIWOOM") return qSource;
    return DEFAULT_SOURCE;
  };
  app.get("/api/stocks", async (req, res) => {
    const source = getRequestedSource(req);
    res.setHeader("Cache-Control", "no-cache");
    if (source !== "MOCK") {
      try {
        const { stocks, dataSource } = await fetchAllRealStocksWithSource();
        if (stocks && stocks.length > 0) {
          res.setHeader("X-Data-Source", dataSource);
          return res.json(stocks);
        }
      } catch (err) {
        console.log("[Server] Error fetching real stocks, falling back:", err.message);
      }
    }
    res.setHeader("X-Data-Source", "mock");
    res.json(mockServerStocks);
  });
  app.get("/api/kiwoom/test", async (req, res) => {
    try {
      const diag = await kiwoomApiService.runDiagnostics();
      res.json({
        service: "Kiwoom Open API",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        configured: kiwoomApiService.isConfigured(),
        config: kiwoomApiService.getConfig(),
        masterStockCount: kiwoomApiService.getMasterStockCounts(),
        wsConnected: kiwoomApiService.isWsConnected(),
        subscribedSymbols: kiwoomApiService.getSubscribedSymbols(),
        subscribedOrderBookSymbols: kiwoomApiService.getSubscribedOrderBookSymbols(),
        diagnostics: diag
      });
    } catch (err) {
      res.status(500).json({
        error: "\uD0A4\uC6C0 API \uC9C4\uB2E8 \uD14C\uC2A4\uD2B8 \uC2E4\uD328",
        message: err.message
      });
    }
  });
  const clientTickStreams = /* @__PURE__ */ new Set();
  kiwoomApiService.onTick((tick) => {
    const payload = `data: ${JSON.stringify(tick)}

`;
    for (const client of clientTickStreams) {
      try {
        client.write(payload);
      } catch (err) {
        clientTickStreams.delete(client);
      }
    }
  });
  app.get("/api/stocks/ticks/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    clientTickStreams.add(res);
    res.write(`data: ${JSON.stringify({ type: "CONNECTED", ws: kiwoomApiService.isWsConnected() })}

`);
    req.on("close", () => {
      clientTickStreams.delete(res);
    });
  });
  const clientOrderBookStreams = /* @__PURE__ */ new Set();
  kiwoomApiService.onOrderBook((orderBook) => {
    const payload = `data: ${JSON.stringify(orderBook)}

`;
    for (const client of clientOrderBookStreams) {
      try {
        client.write(payload);
      } catch (err) {
        clientOrderBookStreams.delete(client);
      }
    }
  });
  app.get("/api/stocks/orderbook/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    clientOrderBookStreams.add(res);
    res.write(`data: ${JSON.stringify({ type: "CONNECTED", ws: kiwoomApiService.isWsConnected() })}

`);
    req.on("close", () => {
      clientOrderBookStreams.delete(res);
    });
  });
  app.post("/api/stocks/subscribe", (req, res) => {
    const { symbol } = req.body;
    if (symbol && isValidStockSymbol(symbol)) {
      kiwoomApiService.subscribeStock(symbol);
      res.json({ success: true, symbol, subscribed: true });
    } else {
      res.status(400).json({ error: "\uC62C\uBC14\uB978 \uC885\uBAA9 \uCF54\uB4DC\uAC00 \uC544\uB2D9\uB2C8\uB2E4." });
    }
  });
  app.post("/api/stocks/unsubscribe", (req, res) => {
    const { symbol } = req.body;
    if (symbol && isValidStockSymbol(symbol)) {
      kiwoomApiService.unsubscribeStock(symbol);
      res.json({ success: true, symbol, subscribed: false });
    } else {
      res.status(400).json({ error: "\uC62C\uBC14\uB978 \uC885\uBAA9 \uCF54\uB4DC\uAC00 \uC544\uB2D9\uB2C8\uB2E4." });
    }
  });
  app.post("/api/stocks/subscribe-orderbook", (req, res) => {
    const { symbol } = req.body;
    if (symbol && isValidStockSymbol(symbol)) {
      kiwoomApiService.subscribeOrderBook(symbol);
      res.json({ success: true, symbol, subscribed: true });
    } else {
      res.status(400).json({ error: "\uC62C\uBC14\uB978 \uC885\uBAA9 \uCF54\uB4DC\uAC00 \uC544\uB2D9\uB2C8\uB2E4." });
    }
  });
  app.post("/api/stocks/unsubscribe-orderbook", (req, res) => {
    const { symbol } = req.body;
    if (symbol && isValidStockSymbol(symbol)) {
      kiwoomApiService.unsubscribeOrderBook(symbol);
      res.json({ success: true, symbol, subscribed: false });
    } else {
      res.status(400).json({ error: "\uC62C\uBC14\uB978 \uC885\uBAA9 \uCF54\uB4DC\uAC00 \uC544\uB2D9\uB2C8\uB2E4." });
    }
  });
  app.get("/api/stocks/search", async (req, res) => {
    const query = sanitizeInputText(req.query.q, 50).trim();
    const market = sanitizeInputText(req.query.market, 10);
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
    if (!query) {
      return res.json([]);
    }
    const q = query.toLowerCase();
    const masterStocks = kiwoomApiService.getMasterStocks();
    if (masterStocks && masterStocks.length > 0) {
      let matched = masterStocks.filter((s) => {
        if (market && market !== "ALL" && s.market !== market) {
          return false;
        }
        return s.name.toLowerCase().includes(q) || s.code.includes(q) || s.sector.toLowerCase().includes(q) || matchHangulSearch(s.name, q);
      });
      if (limit > 0) {
        matched = matched.slice(0, limit);
      }
      const results2 = matched.map((m) => ({
        symbol: m.code,
        name: m.name,
        market: m.market,
        sector: m.sector,
        price: m.lastPrice,
        marketCap: m.marketCap
      }));
      res.setHeader("Cache-Control", "no-cache");
      return res.json(results2);
    }
    const stockMap = /* @__PURE__ */ new Map();
    for (const s of INITIAL_STOCKS) {
      stockMap.set(s.symbol, s);
    }
    for (const s of mockServerStocks) {
      stockMap.set(s.symbol, { ...stockMap.get(s.symbol), ...s });
    }
    const allStocks = Array.from(stockMap.values());
    let results = allStocks.filter((s) => {
      if (market && market !== "ALL" && s.market !== market) {
        return false;
      }
      return s.name.toLowerCase().includes(q) || s.symbol.includes(q) || s.sector.toLowerCase().includes(q) || matchHangulSearch(s.name, q);
    });
    if (limit > 0) {
      results = results.slice(0, limit);
    }
    res.setHeader("Cache-Control", "no-cache");
    res.json(results);
  });
  app.get("/api/stocks/:symbol", async (req, res) => {
    const symbol = req.params.symbol;
    if (!isValidStockSymbol(symbol)) {
      return res.status(400).json({ error: "\uC62C\uBC14\uB974\uC9C0 \uC54A\uC740 \uC885\uBAA9 \uCF54\uB4DC \uD615\uC2DD\uC785\uB2C8\uB2E4." });
    }
    const source = getRequestedSource(req);
    if (source !== "MOCK") {
      try {
        const { stock, dataSource } = await fetchRealStockDataWithSource(symbol);
        if (stock) {
          res.setHeader("X-Data-Source", dataSource);
          return res.json(stock);
        }
      } catch (err) {
        console.log(`[Server] Error fetching real stock ${symbol}:`, err.message);
      }
    }
    res.setHeader("X-Data-Source", "mock");
    const mockStock = mockServerStocks.find((s) => s.symbol === symbol);
    if (mockStock) {
      return res.json(mockStock);
    }
    res.status(404).json({ error: `\uC885\uBAA9 \uCF54\uB4DC ${symbol}\uC744(\uB97C) \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.` });
  });
  app.get("/api/stocks/:symbol/candles", async (req, res) => {
    const symbol = req.params.symbol;
    if (!isValidStockSymbol(symbol)) {
      return res.status(400).json({ error: "\uC62C\uBC14\uB974\uC9C0 \uC54A\uC740 \uC885\uBAA9 \uCF54\uB4DC \uD615\uC2DD\uC785\uB2C8\uB2E4." });
    }
    const period = sanitizeInputText(req.query.period, 10) || "1M";
    const source = getRequestedSource(req);
    if (source !== "MOCK") {
      try {
        const realStock = await fetchRealStockData(symbol);
        if (realStock && realStock.candles && realStock.candles.length > 0) {
          return res.json(realStock.candles);
        }
      } catch (err) {
      }
    }
    const mockStock = mockServerStocks.find((s) => s.symbol === symbol);
    res.json(mockStock?.candles || []);
  });
  app.get("/api/stocks/:symbol/orderbook", async (req, res) => {
    const symbol = req.params.symbol;
    if (!isValidStockSymbol(symbol)) {
      return res.status(400).json({ error: "\uC62C\uBC14\uB974\uC9C0 \uC54A\uC740 \uC885\uBAA9 \uCF54\uB4DC \uD615\uC2DD\uC785\uB2C8\uB2E4." });
    }
    res.setHeader("Cache-Control", "no-cache");
    if (kiwoomApiService.isConfigured()) {
      try {
        const kiwoomOrderBook = await kiwoomApiService.fetchOrderBook(symbol);
        if (kiwoomOrderBook && kiwoomOrderBook.asks?.length > 0) {
          return res.json(kiwoomOrderBook);
        }
      } catch (err) {
        console.warn(`[Server] Kiwoom fetchOrderBook fallback for ${symbol}:`, err.message);
      }
    }
    const stock = mockServerStocks.find((s) => s.symbol === symbol) || INITIAL_STOCKS.find((s) => s.symbol === symbol);
    if (stock) {
      return res.json(generateOrderBook(stock));
    }
    const dummyStock = {
      symbol,
      name: symbol,
      price: 7e4,
      prevClose: 69500,
      change: 500,
      changePercent: 0.72
    };
    res.json(generateOrderBook(dummyStock));
  });
  app.get("/api/indices", async (req, res) => {
    const source = getRequestedSource(req);
    res.setHeader("X-Data-Source", source);
    if (source !== "MOCK") {
      try {
        const realIndices = await fetchRealIndices();
        if (realIndices && realIndices.length > 0) {
          return res.json(realIndices);
        }
      } catch (err) {
      }
    }
    res.json(mockServerIndices);
  });
  app.get("/api/exchange-rate", async (req, res) => {
    const source = getRequestedSource(req);
    res.setHeader("X-Data-Source", source);
    if (source === "REAL") {
      try {
        const realExchange = await fetchRealExchangeRate();
        if (realExchange) {
          return res.json(realExchange);
        }
      } catch (err) {
      }
    }
    res.json(mockServerExchangeRate);
  });
  app.get("/api/market/pipeline-status", (req, res) => {
    res.json({
      status: "active",
      activeSource: DEFAULT_SOURCE,
      pipeline: "Browser -> Backend API -> Real Stock API -> Backend -> Browser",
      isProduction,
      serverTime: (/* @__PURE__ */ new Date()).toISOString(),
      trackedStocksCount: TRACKED_STOCKS.length
    });
  });
  app.get("/api/market/monitoring/events", (req, res) => {
    const scope = req.query.scope;
    const limit = Number(req.query.limit) || 40;
    const events = getRecentAlertEvents(scope, limit);
    res.json(events);
  });
  app.get("/api/market/monitoring/config", (req, res) => {
    res.json(getMonitoringConfig());
  });
  app.post("/api/market/monitoring/config", (req, res) => {
    const adminRole = req.headers["x-admin-role"];
    if (isProduction && adminRole !== "admin") {
      return res.status(403).json({ error: "\uAD00\uB9AC\uC790 \uAD8C\uD55C(role: admin)\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." });
    }
    const updated = updateMonitoringConfig(req.body);
    res.json(updated);
  });
  app.post("/api/market/monitoring/explain/:id", async (req, res) => {
    try {
      const eventId = sanitizeInputText(req.params.id, 64);
      const explanation = await explainMarketEventWithGemini(eventId);
      res.json({ id: eventId, explanation });
    } catch (err) {
      res.status(500).json({ error: err.message || "\uC124\uBA85 \uC0DD\uC131 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." });
    }
  });
  app.post("/api/market/monitoring/trigger-test", (req, res) => {
    const { type, scope, title, description, symbol, symbolName, market, metrics } = req.body;
    const evt = pushAlertEvent({
      type: type || "PRICE_SURGE",
      scope: scope || "STOCK",
      title: title || "\uD14C\uC2A4\uD2B8 \uAE09\uB4F1 \uAC10\uC9C0 \uC774\uBCA4\uD2B8",
      description: description || "\uBAA8\uB2C8\uD130\uB9C1 \uC2DC\uC2A4\uD15C \uC218\uB3D9 \uD2B8\uB9AC\uAC70 \uD14C\uC2A4\uD2B8\uC785\uB2C8\uB2E4.",
      symbol: symbol || "005930",
      symbolName: symbolName || "\uC0BC\uC131\uC804\uC790",
      market: market || "KOSPI",
      severity: "warning",
      metrics: metrics || {
        currentValue: 6.2,
        threshold: 5,
        unit: "%",
        changePercent: 6.2
      }
    });
    res.json(evt || { message: "Cooldown in effect, event suppressed" });
  });
  app.get("/api/user-alerts", (req, res) => {
    const uid = req.query.uid;
    res.json(getUserAlertRules(uid));
  });
  app.post("/api/user-alerts", (req, res) => {
    const { uid, symbol, symbolName, type, value, condition } = req.body;
    if (!symbol || !type || value === void 0) {
      return res.status(400).json({ error: "\uD544\uC218 \uD544\uB4DC(symbol, type, value)\uAC00 \uB204\uB77D\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
    }
    const newRule = addUserAlertRule({
      uid: uid || "demo-user-1",
      symbol,
      symbolName: symbolName || symbol,
      type,
      value: Number(value),
      condition: condition || (type === "price_fall" ? "below" : "above"),
      enabled: true
    });
    res.json(newRule);
  });
  app.put("/api/user-alerts/:id", (req, res) => {
    const updated = updateUserAlertRule(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "\uC54C\uB9BC \uADDC\uCE59\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    }
    res.json(updated);
  });
  app.delete("/api/user-alerts/:id", (req, res) => {
    const success = deleteUserAlertRule(req.params.id);
    res.json({ success });
  });
  app.get("/api/notifications", (req, res) => {
    const uid = req.query.uid;
    res.json(getNotifications(uid));
  });
  app.post("/api/notifications/:id/read", (req, res) => {
    const updated = markNotificationAsRead(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: "\uC54C\uB9BC\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    }
    res.json(updated);
  });
  app.post("/api/notifications/read-all", (req, res) => {
    const uid = req.body?.uid || req.query.uid;
    const count = markAllNotificationsAsRead(uid);
    res.json({ success: true, count });
  });
  app.delete("/api/notifications/:id", (req, res) => {
    const success = deleteNotification(req.params.id);
    res.json({ success });
  });
  app.post("/api/user-alerts/check-now", (req, res) => {
    const generated = evaluateUserAlertRules(mockServerStocks, mockServerIndices);
    res.json({ checked: true, generatedCount: generated.length, generated });
  });
  app.post("/api/ai/stock-briefing", async (req, res) => {
    try {
      const { query, symbol } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "\uC9C8\uBB38(query)\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
      }
      const briefing = await generateAiStockBriefing(query, symbol);
      res.json(briefing);
    } catch (err) {
      console.error("[AiBriefing] Error generating briefing:", err);
      res.status(500).json({ error: "AI \uC885\uBAA9 \uBE0C\uB9AC\uD551 \uC0DD\uC131 \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.", details: err?.message });
    }
  });
  app.get("/api/ai/stock-data/quote", (req, res) => {
    const symbol = req.query.symbol || "005930";
    const quote = get_stock_quote(symbol);
    if (!quote) return res.status(404).json({ error: "\uC885\uBAA9\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
    res.json(quote);
  });
  app.get("/api/ai/stock-data/chart", (req, res) => {
    const symbol = req.query.symbol || "005930";
    const period = req.query.period || "1M";
    res.json(get_stock_chart(symbol, period));
  });
  app.get("/api/ai/stock-data/news", (req, res) => {
    const symbol = req.query.symbol || "005930";
    res.json(get_stock_news(symbol));
  });
  app.get("/api/ai/stock-data/market", (req, res) => {
    res.json(get_market_status());
  });
  app.get("/api/ai/stock-data/posts", (req, res) => {
    const symbol = req.query.symbol || "005930";
    res.json(get_related_posts(symbol));
  });
  app.post("/api/ai/stock-query", async (req, res) => {
    try {
      const { query, watchlist } = req.body;
      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "\uC9C8\uBB38(query)\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
      }
      const result = await processStockDataQuery(query, watchlist);
      res.json(result);
    } catch (err) {
      console.error("[AiStockQuery] Error executing query:", err);
      res.status(500).json({ error: "\uC9C8\uC758 \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.", details: err?.message });
    }
  });
  app.get("/api/ai/functions/stock-volume", (req, res) => {
    const symbol = req.query.symbol || "005930";
    res.json(get_stock_volume(symbol));
  });
  app.get("/api/ai/functions/watchlist", (req, res) => {
    const symbols = req.query.symbols ? req.query.symbols.split(",") : void 0;
    res.json(get_watchlist(symbols));
  });
  app.get("/api/ai/functions/market-summary", (req, res) => {
    const market = req.query.market;
    res.json(get_market_summary(market));
  });
  app.get("/api/ai/functions/top-gainers", (req, res) => {
    const limit = Number(req.query.limit) || 5;
    res.json(get_top_gainers(limit));
  });
  app.get("/api/ai/functions/top-losers", (req, res) => {
    const limit = Number(req.query.limit) || 5;
    res.json(get_top_losers(limit));
  });
  app.get("/api/ai/functions/volume-spikes", (req, res) => {
    const threshold = Number(req.query.threshold) || 140;
    res.json(get_volume_spikes(threshold));
  });
  app.use("/api/admin", createAdminRouter());
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(express2.static(path2.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path2.join(__dirname, "dist", "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Byeongdol Investment] Full-stack Server listening on port ${PORT}`);
    console.log(`[Data Pipeline] Browser -> Backend API -> Stock API -> Backend -> Browser`);
    console.log(`[Source Mode] ${DEFAULT_SOURCE}`);
    if (kiwoomApiService.isConfigured()) {
      kiwoomApiService.fetchStockMasterList().then((list) => {
        console.log(`[Server] Preloaded ${list.length} Kiwoom master stocks.`);
      }).catch((err) => {
        console.warn("[Server] Master stocks preloading deferred:", err.message);
      });
    }
  });
}
startServer();
