/**
 * Client-Side Global Market Service
 * Fetches real global market data from /api/market/global-summary
 */

import { GlobalMarketSummaryResponse } from '../types';

class GlobalMarketClient {
  private cache: GlobalMarketSummaryResponse | null = null;
  private lastFetched: number = 0;
  private readonly TTL_MS = 15000; // 15 seconds client cache

  async getSummary(forceRefresh: boolean = false): Promise<GlobalMarketSummaryResponse> {
    const now = Date.now();
    if (!forceRefresh && this.cache && now - this.lastFetched < this.TTL_MS) {
      return this.cache;
    }

    const res = await fetch('/api/market/global-summary', {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`글로벌 시장 데이터 조회 실패 (HTTP ${res.status})`);
    }

    const data: GlobalMarketSummaryResponse = await res.json();
    this.cache = data;
    this.lastFetched = now;
    return data;
  }
}

export const globalMarketClient = new GlobalMarketClient();
