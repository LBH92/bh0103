/**
 * MockStockRepository
 * 
 * Provides mock/simulated stock market data for Development environment.
 * Zero external API dependency, zero rate limits, ultra-fast test execution.
 */

import { Stock, StockIndex, ExchangeRate, CandleData, StockNews, OrderBook, KiwoomChartPeriod, KiwoomChartResponse } from '../types';
import { IStockRepository, ChartPeriod, VolumeAnalysisData, StockDataSourceType } from './stockRepositoryInterface';
import { INITIAL_STOCKS, INITIAL_INDICES, INITIAL_EXCHANGE_RATE, INITIAL_NEWS, generateOrderBook } from './mockData';
import { matchHangulSearch } from '../utils/hangul';

export class MockStockRepository implements IStockRepository {
  private localStocks: Stock[] = [...INITIAL_STOCKS];
  private localIndices: StockIndex[] = INITIAL_INDICES.map(idx => ({ ...idx }));
  private localExchange: ExchangeRate = { ...INITIAL_EXCHANGE_RATE };
  private subscribers: Set<(stocks: Stock[]) => void> = new Set();
  private executionSubscribers: Map<string, Set<(tick: any) => void>> = new Map();
  private orderBookSubscribers: Map<string, Set<(ob: OrderBook) => void>> = new Map();
  private timer: any = null;

  private popularSymbols = ['005930', '000660', '005380', '035420', '035720', '373220', '247540', '196170'];

  private startSimulationTimer() {
    if (this.timer) return;

    this.timer = setInterval(() => {
      const nowTime = new Date().toTimeString().slice(0, 8);

      // 1. Simulate Smooth Indices Movement (KOSPI & KOSDAQ)
      this.localIndices = this.localIndices.map(idx => {
        const isKospi = idx.symbol === 'KOSPI';
        const step = isKospi ? 0.35 : 0.22;
        const dir = Math.random() > 0.49 ? 1 : -1;
        const delta = Number(((Math.random() * step) * dir).toFixed(2));
        const newValue = Number(Math.max(100, idx.value + delta).toFixed(2));
        const basePrev = isKospi ? 2605.50 : 863.00;
        const newChange = Number((newValue - basePrev).toFixed(2));
        const newChangePercent = Number(((newChange / basePrev) * 100).toFixed(2));

        return {
          ...idx,
          value: newValue,
          change: newChange,
          changePercent: newChangePercent,
          lastUpdated: `실시간 ${nowTime}`,
        };
      });

      // 2. Select Active Stocks to Tick (Focus on watched symbols + popular stocks)
      const watchedSymbols = new Set([
        ...Array.from(this.executionSubscribers.keys()),
        ...Array.from(this.orderBookSubscribers.keys()),
      ]);

      const tickedSymbols = new Set<string>();

      this.localStocks = this.localStocks.map(stock => {
        const isWatched = watchedSymbols.has(stock.symbol);
        const isPopular = this.popularSymbols.includes(stock.symbol);

        // Watched stocks tick ~75% of cycles, popular ~55%, others ~30%
        const tickChance = isWatched ? 0.75 : isPopular ? 0.55 : 0.30;
        if (Math.random() > tickChance) return stock;

        tickedSymbols.add(stock.symbol);

        const step = stock.price >= 100000 ? 500 : (stock.price >= 50000 ? 100 : 50);
        const dir = Math.random() > 0.48 ? 1 : -1;
        const delta = step * dir;
        const newPrice = Math.max(100, stock.price + delta);
        const prevClose = stock.prevClose || (stock.price - stock.change);
        const newChange = newPrice - prevClose;
        const newPct = Number(((newChange / prevClose) * 100).toFixed(2));
        const tradeQty = Math.floor(Math.random() * 250) + 20;

        return {
          ...stock,
          price: newPrice,
          change: newChange,
          changePercent: newPct,
          volume: stock.volume + tradeQty,
          highPrice: Math.max(stock.highPrice, newPrice),
          lowPrice: Math.min(stock.lowPrice, newPrice),
        };
      });

      // 3. Notify Overall Stock Subscribers
      this.subscribers.forEach(cb => {
        try {
          cb([...this.localStocks]);
        } catch {}
      });

      // 4. Notify Execution Tick Subscribers
      this.executionSubscribers.forEach((callbacks, sym) => {
        const stock = this.localStocks.find(s => s.symbol === sym);
        if (!stock) return;
        const tick = {
          symbol: stock.symbol,
          price: stock.price,
          change: stock.change,
          changePercent: stock.changePercent,
          volume: stock.volume,
          open: stock.openPrice,
          high: stock.highPrice,
          low: stock.lowPrice,
          time: nowTime,
        };
        callbacks.forEach(cb => {
          try {
            cb(tick);
          } catch {}
        });
      });

      // 5. Notify Order Book Subscribers
      this.orderBookSubscribers.forEach((callbacks, sym) => {
        const stock = this.localStocks.find(s => s.symbol === sym);
        if (!stock) return;
        const ob = generateOrderBook(stock);
        callbacks.forEach(cb => {
          try {
            cb(ob);
          } catch {}
        });
      });
    }, 2000);
  }

  private checkStopSimulationTimer() {
    const hasSubscribers =
      this.subscribers.size > 0 ||
      this.executionSubscribers.size > 0 ||
      this.orderBookSubscribers.size > 0;

    if (!hasSubscribers && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  getSourceType(): StockDataSourceType {
    return 'MOCK';
  }

  async getAllStocks(forceRefresh: boolean = false): Promise<Stock[]> {
    return [...this.localStocks];
  }

  async getStock(symbol: string): Promise<Stock | undefined> {
    return this.localStocks.find(s => s.symbol === symbol);
  }

  async searchStocks(options: { query: string; limit?: number; market?: string }): Promise<Stock[]> {
    const q = options.query.trim().toLowerCase();
    if (!q) return [];

    let filtered = this.localStocks.filter(s => {
      if (options.market && options.market !== 'ALL' && s.market !== options.market) {
        return false;
      }
      return (
        s.name.toLowerCase().includes(q) ||
        s.symbol.toLowerCase().includes(q) ||
        s.sector.toLowerCase().includes(q) ||
        matchHangulSearch(s.name, q)
      );
    });

    if (options.limit && options.limit > 0) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  async getStocksBySymbols(symbols: string[]): Promise<Stock[]> {
    const all = await this.getAllStocks();
    return symbols.map(sym => all.find(s => s.symbol === sym)).filter((s): s is Stock => Boolean(s));
  }

  async getChartCandles(symbol: string, period: ChartPeriod): Promise<CandleData[]> {
    const stock = await this.getStock(symbol);
    if (!stock || !stock.candles) return [];

    let result = stock.candles;
    if (period === '1D' || period === 'day') result = stock.candles.slice(-12);
    else if (period === '1W') result = stock.candles.slice(-7);
    else if (period === '1M') result = stock.candles.slice(-22);
    else if (period === '3M') result = stock.candles.slice(-66);
    else if (period === '6M') result = stock.candles;
    else if (period === '1Y') result = stock.candles;

    return result;
  }

  async getKiwoomChart(symbol: string, period: KiwoomChartPeriod): Promise<KiwoomChartResponse> {
    const candles = await this.getChartCandles(symbol, period as any);
    const trId = period === 'day' ? 'ka10081' : 'ka10080';
    return {
      symbol,
      period,
      periodLabel: period,
      trId,
      supported: true,
      candles,
      source: 'kiwoom',
      cached: false,
      timestamp: Date.now(),
      error: null,
    };
  }

  async getRelatedNews(symbol: string): Promise<StockNews[]> {
    const matched = INITIAL_NEWS.filter(n => n.relatedSymbols?.includes(symbol));
    return matched.length > 0 ? matched : INITIAL_NEWS.slice(0, 3);
  }

  async getVolumeAnalysis(symbol: string): Promise<VolumeAnalysisData> {
    const stock = await this.getStock(symbol);
    const volumeRatio = stock ? stock.volumeRatio : 120.5;
    const volume = stock ? stock.volume : 5000000;
    const avgVolume20d = Math.round(volume / (Math.max(10, volumeRatio) / 100));
    const avgVolume5d = Math.round(volume * 0.95);
    const tradingValue = stock ? stock.tradingValue : 2500;
    const executionStrength = stock ? (stock.change >= 0 ? 118.5 : 84.2) : 105.0;
    const turnoverRatio = Number(((volume / ((stock?.marketCap || 100000) * 1000)) * 100).toFixed(2)) || 2.45;
    const foreignNetBuy = stock ? stock.foreignNetBuy : 500;
    const instNetBuy = stock ? stock.instNetBuy : 300;
    const individualNetBuy = -(foreignNetBuy + instNetBuy);

    return {
      volumeRatio,
      volume,
      avgVolume20d,
      avgVolume5d,
      tradingValue,
      executionStrength,
      turnoverRatio,
      foreignNetBuy,
      instNetBuy,
      individualNetBuy,
    };
  }

  async getIndices(): Promise<StockIndex[]> {
    return [...this.localIndices];
  }

  async getExchangeRate(): Promise<ExchangeRate> {
    return { ...this.localExchange };
  }

  subscribeTicks(callback: (stocks: Stock[]) => void): () => void {
    this.subscribers.add(callback);
    this.startSimulationTimer();

    // Immediate callback with current snapshot
    try {
      callback([...this.localStocks]);
    } catch {}

    return () => {
      this.subscribers.delete(callback);
      this.checkStopSimulationTimer();
    };
  }

  subscribeExecutionTick(
    symbol: string,
    callback: (tick: { symbol: string; price: number; change: number; changePercent: number; volume: number; open: number; high: number; low: number; time: string }) => void
  ): () => void {
    let callbacks = this.executionSubscribers.get(symbol);
    if (!callbacks) {
      callbacks = new Set();
      this.executionSubscribers.set(symbol, callbacks);
    }
    callbacks.add(callback);
    this.startSimulationTimer();

    // Immediate callback with current stock tick
    const target = this.localStocks.find(s => s.symbol === symbol) || INITIAL_STOCKS.find(s => s.symbol === symbol);
    if (target) {
      try {
        callback({
          symbol: target.symbol,
          price: target.price,
          change: target.change,
          changePercent: target.changePercent,
          volume: target.volume,
          open: target.openPrice,
          high: target.highPrice,
          low: target.lowPrice,
          time: new Date().toTimeString().slice(0, 8),
        });
      } catch {}
    }

    return () => {
      const set = this.executionSubscribers.get(symbol);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.executionSubscribers.delete(symbol);
        }
      }
      this.checkStopSimulationTimer();
    };
  }

  async getOrderBook(symbol: string): Promise<OrderBook> {
    const stock = this.localStocks.find(s => s.symbol === symbol) || INITIAL_STOCKS.find(s => s.symbol === symbol);
    if (stock) {
      return generateOrderBook(stock);
    }
    return generateOrderBook({
      symbol,
      name: symbol,
      price: 70000,
      prevClose: 69500,
      change: 500,
      changePercent: 0.72,
    } as any);
  }

  subscribeOrderBook(
    symbol: string,
    callback: (orderBook: OrderBook) => void
  ): () => void {
    let callbacks = this.orderBookSubscribers.get(symbol);
    if (!callbacks) {
      callbacks = new Set();
      this.orderBookSubscribers.set(symbol, callbacks);
    }
    callbacks.add(callback);
    this.startSimulationTimer();

    // Immediate callback with current order book
    const target = this.localStocks.find(s => s.symbol === symbol) || INITIAL_STOCKS.find(s => s.symbol === symbol);
    if (target) {
      try {
        callback(generateOrderBook(target));
      } catch {}
    }

    return () => {
      const set = this.orderBookSubscribers.get(symbol);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.orderBookSubscribers.delete(symbol);
        }
      }
      this.checkStopSimulationTimer();
    };
  }
}
