/**
 * Client-Side News Service
 * Communicates with backend /api/news endpoints.
 */

import { StockNews } from '../types';

export interface MarketNewsResponse {
  query: string;
  category: string;
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  items: StockNews[];
  source: 'google_rss' | 'naver';
  cached: boolean;
  timestamp: number;
  error?: string | null;
}

class NewsService {
  /**
   * Fetch market news by category
   */
  async getMarketNews(
    category: 'all' | 'breaking' | 'kospi' | 'kosdaq' | 'economy' | 'market' = 'all',
    page: number = 1,
    limit: number = 20,
    refresh: boolean = false
  ): Promise<MarketNewsResponse> {
    const url = `/api/news?category=${category}&page=${page}&limit=${limit}${refresh ? '&refresh=true' : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`뉴스 조회 실패 (HTTP ${res.status})`);
    }
    return res.json();
  }

  /**
   * Fetch stock specific news
   */
  async getStockNews(symbol: string, page: number = 1, limit: number = 10): Promise<MarketNewsResponse> {
    const url = `/api/news/stock/${symbol}?page=${page}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`종목 뉴스 조회 실패 (HTTP ${res.status})`);
    }
    return res.json();
  }

  /**
   * Search news by query
   */
  async searchNews(keyword: string, page: number = 1, limit: number = 20): Promise<MarketNewsResponse> {
    const url = `/api/news/search?q=${encodeURIComponent(keyword)}&page=${page}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`뉴스 검색 실패 (HTTP ${res.status})`);
    }
    return res.json();
  }
}

export const newsService = new NewsService();
