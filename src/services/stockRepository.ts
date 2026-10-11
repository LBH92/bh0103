/**
 * StockRepository Delegator
 * 
 * Manages switching between:
 * - MockStockRepository (Development environment)
 * - RealStockRepository (Production / Real API environment)
 * 
 * Controlled via:
 * - import.meta.env.VITE_STOCK_DATA_SOURCE ('MOCK' | 'REAL')
 * - import.meta.env.PROD
 * - Runtime toggle (setSource)
 */

import { Stock, StockIndex, ExchangeRate, CandleData, StockNews, OrderBook, KiwoomChartPeriod, KiwoomChartResponse } from '../types';
import { 
  IStockRepository, 
  ChartPeriod, 
  VolumeAnalysisData, 
  StockDataSourceType 
} from './stockRepositoryInterface';
import { MockStockRepository } from './mockStockRepository';
import { RealStockRepository } from './realStockRepository';
import { isPreviewEnvironment } from '../utils/environment';

export type { ChartPeriod, VolumeAnalysisData, StockDataSourceType, IStockRepository, KiwoomChartPeriod, KiwoomChartResponse };

class StockRepositoryDelegator implements IStockRepository {
  private mockRepo = new MockStockRepository();
  private realRepo = new RealStockRepository();
  private activeSource: StockDataSourceType;

  constructor() {
    // In Google AI Studio preview or sandbox environment (run.app, localhost, webcontainer),
    // default automatically to MOCK mode for smooth testing without Kiwoom IP blocks
    const isPreview = isPreviewEnvironment();

    if (isPreview) {
      this.activeSource = 'MOCK';
    } else {
      const envSource = import.meta.env.VITE_STOCK_DATA_SOURCE as string | undefined;
      const isProd = import.meta.env.PROD;

      if (envSource === 'REAL' || isProd) {
        this.activeSource = 'REAL';
      } else {
        this.activeSource = 'MOCK';
      }

      // Check localStorage override if user changed it in settings
      try {
        const saved = localStorage.getItem('bd_stock_data_source') as StockDataSourceType | null;
        if (saved === 'MOCK' || saved === 'REAL') {
          this.activeSource = saved;
        }
      } catch {}
    }
  }

  public isPreview(): boolean {
    return isPreviewEnvironment();
  }

  private get activeRepo(): IStockRepository {
    return this.activeSource === 'REAL' ? this.realRepo : this.mockRepo;
  }

  getSourceType(): StockDataSourceType {
    return this.activeSource;
  }

  getCurrentSource(): StockDataSourceType {
    return this.activeSource;
  }

  setSource(source: StockDataSourceType): void {
    this.activeSource = source;
    try {
      localStorage.setItem('bd_stock_data_source', source);
    } catch {}
  }

  getAllStocks(forceRefresh?: boolean): Promise<Stock[]> {
    return this.activeRepo.getAllStocks(forceRefresh);
  }

  getStock(symbol: string): Promise<Stock | undefined> {
    return this.activeRepo.getStock(symbol);
  }

  searchStocks(options: { query: string; limit?: number; market?: string }): Promise<Stock[]> {
    return this.activeRepo.searchStocks(options);
  }

  getStocksBySymbols(symbols: string[]): Promise<Stock[]> {
    if (this.activeRepo.getStocksBySymbols) {
      return this.activeRepo.getStocksBySymbols(symbols);
    }
    return Promise.resolve([]);
  }

  getChartCandles(symbol: string, period: ChartPeriod): Promise<CandleData[]> {
    return this.activeRepo.getChartCandles(symbol, period);
  }

  getKiwoomChart(symbol: string, period: KiwoomChartPeriod): Promise<KiwoomChartResponse> {
    if (this.activeRepo.getKiwoomChart) {
      return this.activeRepo.getKiwoomChart(symbol, period);
    }
    return Promise.resolve({
      symbol,
      period,
      periodLabel: period,
      trId: period === 'day' ? 'ka10081' : 'ka10080',
      supported: true,
      candles: [],
      source: 'kiwoom',
      cached: false,
      timestamp: Date.now(),
      error: null,
    });
  }

  getRelatedNews(symbol: string): Promise<StockNews[]> {
    return this.activeRepo.getRelatedNews(symbol);
  }

  getVolumeAnalysis(symbol: string): Promise<VolumeAnalysisData> {
    return this.activeRepo.getVolumeAnalysis(symbol);
  }

  getIndices(): Promise<StockIndex[]> {
    return this.activeRepo.getIndices();
  }

  getExchangeRate(): Promise<ExchangeRate> {
    return this.activeRepo.getExchangeRate();
  }

  subscribeTicks(callback: (stocks: Stock[]) => void): () => void {
    return this.activeRepo.subscribeTicks(callback);
  }

  subscribeExecutionTick(
    symbol: string,
    callback: (tick: { symbol: string; price: number; change: number; changePercent: number; volume: number; open: number; high: number; low: number; time: string }) => void
  ): () => void {
    if (this.activeRepo.subscribeExecutionTick) {
      return this.activeRepo.subscribeExecutionTick(symbol, callback);
    }
    return () => {};
  }

  getOrderBook(symbol: string): Promise<OrderBook> {
    if (this.activeRepo.getOrderBook) {
      return this.activeRepo.getOrderBook(symbol);
    }
    return Promise.resolve({
      symbol,
      currentPrice: 70000,
      asks: [],
      bids: [],
      totalAskVolume: 0,
      totalBidVolume: 0,
    });
  }

  subscribeOrderBook(
    symbol: string,
    callback: (orderBook: OrderBook) => void
  ): () => void {
    if (this.activeRepo.subscribeOrderBook) {
      return this.activeRepo.subscribeOrderBook(symbol, callback);
    }
    return () => {};
  }
}

export const stockRepository = new StockRepositoryDelegator();
