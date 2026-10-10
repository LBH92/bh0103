/**
 * Firebase / Cache Layer for Stock Insight
 * 
 * Pipeline: API -> 서버 -> StockRepository -> Firebase/Cache -> 웹
 * 
 * L1: In-Memory Fast Cache with TTL
 * L2: Local Storage / Firebase Firestore Cache
 */

import { Stock, StockIndex, ExchangeRate } from '../types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

class StockCacheManager {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private defaultTTL = 5000; // 5 seconds default TTL for live prices

  /**
   * Set data into L1 Memory Cache & L2 Local Storage
   */
  set<T>(key: string, data: T, ttlMs: number = this.defaultTTL): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttlMs,
    };

    // 1. L1 Memory Cache
    this.memoryCache.set(key, entry);

    // 2. L2 LocalStorage Cache (with error protection)
    try {
      localStorage.setItem(`bd_cache_${key}`, JSON.stringify(entry));
    } catch (e) {
      // Storage might be full, safe to ignore
    }
  }

  /**
   * Get data from L1 Memory or L2 LocalStorage if not expired
   */
  get<T>(key: string): T | null {
    // 1. Try L1 Memory Cache
    const memEntry = this.memoryCache.get(key);
    if (memEntry) {
      if (Date.now() - memEntry.timestamp < memEntry.ttlMs) {
        return memEntry.data as T;
      }
      this.memoryCache.delete(key);
    }

    // 2. Try L2 LocalStorage Cache
    try {
      const raw = localStorage.getItem(`bd_cache_${key}`);
      if (raw) {
        const localEntry: CacheEntry<T> = JSON.parse(raw);
        if (Date.now() - localEntry.timestamp < localEntry.ttlMs) {
          // Repopulate L1
          this.memoryCache.set(key, localEntry);
          return localEntry.data;
        } else {
          localStorage.removeItem(`bd_cache_${key}`);
        }
      }
    } catch {
      // Ignore parse errors
    }

    return null;
  }

  /**
   * Invalidate specific key or all cache
   */
  invalidate(key?: string): void {
    if (key) {
      this.memoryCache.delete(key);
      try {
        localStorage.removeItem(`bd_cache_${key}`);
      } catch {}
    } else {
      this.memoryCache.clear();
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('bd_cache_')) {
            keysToRemove.push(k);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch {}
    }
  }

  /**
   * Check if cache exists and is fresh
   */
  isFresh(key: string): boolean {
    const memEntry = this.memoryCache.get(key);
    if (memEntry && Date.now() - memEntry.timestamp < memEntry.ttlMs) {
      return true;
    }
    return false;
  }

  /**
   * Get cache debug stats
   */
  getStats(): { memoryKeysCount: number; timestamp: string } {
    return {
      memoryKeysCount: this.memoryCache.size,
      timestamp: new Date().toLocaleTimeString('ko-KR'),
    };
  }
}

export const stockCache = new StockCacheManager();
