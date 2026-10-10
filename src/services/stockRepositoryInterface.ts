/**
 * Stock Repository Interface
 * Defines contract implemented by both MockStockRepository and RealStockRepository
 */

import { Stock, StockIndex, ExchangeRate, CandleData, StockNews, OrderBook, KiwoomChartPeriod, KiwoomChartResponse } from '../types';

export type ChartPeriod = '1m' | '5m' | '15m' | '30m' | '1h' | 'day' | '1D' | '1W' | '1M' | '3M' | '6M' | '1Y';

export interface VolumeAnalysisData {
  volumeRatio: number;
  volume: number;
  avgVolume20d: number;
  avgVolume5d: number;
  tradingValue: number;
  executionStrength: number;
  turnoverRatio: number;
  foreignNetBuy: number;
  instNetBuy: number;
  individualNetBuy: number;
}

export type StockDataSourceType = 'MOCK' | 'REAL';

export interface IStockRepository {
  /**
   * Get the current active data source type ('MOCK' | 'REAL')
   */
  getSourceType(): StockDataSourceType;

  /**
   * Get all stocks list
   */
  getAllStocks(forceRefresh?: boolean): Promise<Stock[]>;

  /**
   * Get single stock details by symbol
   */
  getStock(symbol: string): Promise<Stock | undefined>;

  /**
   * Search stocks by query
   */
  searchStocks(options: { query: string; limit?: number; market?: string }): Promise<Stock[]>;

  /**
   * Get historical chart candles
   */
  getChartCandles(symbol: string, period: ChartPeriod): Promise<CandleData[]>;

  /**
   * Get real Kiwoom Open API chart (TR ka10080 분봉, ka10081 일봉)
   */
  getKiwoomChart?(symbol: string, period: KiwoomChartPeriod): Promise<KiwoomChartResponse>;

  /**
   * Get related news
   */
  getRelatedNews(symbol: string): Promise<StockNews[]>;

  /**
   * Get volume & investor breakdown data
   */
  getVolumeAnalysis(symbol: string): Promise<VolumeAnalysisData>;

  /**
   * Get major market indices
   */
  getIndices(): Promise<StockIndex[]>;

  /**
   * Get USD/KRW exchange rate
   */
  getExchangeRate(): Promise<ExchangeRate>;

  /**
   * Real-time ticks subscription
   */
  subscribeTicks(callback: (stocks: Stock[]) => void): () => void;

  /**
   * Real-time single stock execution tick stream (Kiwoom WS / EventSource)
   */
  subscribeExecutionTick?(symbol: string, callback: (tick: { symbol: string; price: number; change: number; changePercent: number; volume: number; open: number; high: number; low: number; time: string }) => void): () => void;

  /**
   * Get multiple stocks quotes by symbols (for Watchlist & batch queries)
   */
  getStocksBySymbols?(symbols: string[]): Promise<Stock[]>;

  /**
   * Get 10-level Order Book (호가)
   */
  getOrderBook?(symbol: string): Promise<OrderBook>;

  /**
   * Real-time single stock order book stream (Kiwoom WS / EventSource)
   */
  subscribeOrderBook?(symbol: string, callback: (orderBook: OrderBook) => void): () => void;
}
