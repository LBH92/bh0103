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
  private localIndices: StockIndex[] = [...INITIAL_INDICES];
  private localExchange: ExchangeRate = { ...INITIAL_EXCHANGE_RATE };
  private subscribers: Set<(stocks: Stock[]) => void> = new Set();
  private timer: any = null;

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

    if (!this.timer) {
      this.timer = setInterval(() => {
        this.localStocks = this.localStocks.map(stock => {
          if (Math.random() > 0.4) return stock;
          const step = stock.price > 100000 ? 500 : (stock.price > 50000 ? 100 : 50);
          const dir = Math.random() > 0.48 ? 1 : -1;
          const delta = step * dir;
          const newPrice = Math.max(100, stock.price + delta);
          const newChange = stock.change + delta;
          const prevClose = stock.prevClose || (stock.price - stock.change);
          const newPct = Number(((newChange / prevClose) * 100).toFixed(2));
          return {
            ...stock,
            price: newPrice,
            change: newChange,
            changePercent: newPct,
            volume: stock.volume + Math.floor(Math.random() * 300) + 10,
            highPrice: Math.max(stock.highPrice, newPrice),
            lowPrice: Math.min(stock.lowPrice, newPrice),
          };
        });

        this.subscribers.forEach(cb => cb([...this.localStocks]));
      }, 3500);
    }

    return () => {
      this.subscribers.delete(callback);
      if (this.subscribers.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  subscribeExecutionTick(
    symbol: string,
    callback: (tick: { symbol: string; price: number; change: number; changePercent: number; volume: number; open: number; high: number; low: number; time: string }) => void
  ): () => void {
    const unsub = this.subscribeTicks((stocks) => {
      const target = stocks.find(s => s.symbol === symbol);
      if (target) {
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
      }
    });

    return unsub;
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
    const unsub = this.subscribeTicks((stocks) => {
      const target = stocks.find(s => s.symbol === symbol);
      if (target) {
        callback(generateOrderBook(target));
      }
    });

    return unsub;
  }
}
