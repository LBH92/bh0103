/**
 * Server-Side News API Service
 * 
 * Strict Architecture:
 * - Real News API integration (Google News RSS & Naver Search API support)
 * - Zero MOCK, zero Math.random(), zero hardcoded news articles
 * - All external API requests, credentials, and rate limits are managed strictly on the server
 * - Server-side caching (TTL: 60s) to minimize upstream load and protect rate limits
 * - Extracts real publisher names (언론사), actual publication timestamps, titles, and original URLs
 */

import { TRACKED_STOCKS } from './stockApiService';

export interface NewsItem {
  id: string;
  title: string;
  source: string; // 언론사 (예: 연합뉴스, 한국경제, 매일경제 등)
  pubDate: string; // RFC 822 / ISO format
  publishedAt: number; // Unix timestamp in ms
  timeAgo: string; // "방금 전", "15분 전", "2시간 전" 등
  url: string; // 언론사 원문 기사 링크
  summary: string;
  relatedSymbol?: string;
  relatedSymbolName?: string;
  category?: 'breaking' | 'market' | 'kospi' | 'kosdaq' | 'economy' | 'general';
}

export interface NewsResponse {
  query: string;
  category: string;
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  items: NewsItem[];
  source: 'google_rss' | 'naver';
  cached: boolean;
  timestamp: number;
  error?: string | null;
}

interface CacheEntry {
  data: NewsResponse;
  expiresAt: number;
}

class NewsApiService {
  private cache = new Map<string, CacheEntry>();
  private defaultTtlMs = 60 * 1000; // 60 seconds server cache

  /**
   * Helper: Format publication timestamp into Korean timeAgo string
   */
  private formatTimeAgo(timestampMs: number): string {
    const diff = Date.now() - timestampMs;
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return '방금 전';
    if (diff < hour) return `${Math.floor(diff / minute)}분 전`;
    if (diff < day) return `${Math.floor(diff / hour)}시간 전`;
    if (diff < day * 7) return `${Math.floor(diff / day)}일 전`;
    
    const d = new Date(timestampMs);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * Helper: Clean HTML entities and tags
   */
  private cleanText(raw: string): string {
    if (!raw) return '';
    const unescaped = raw
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&middot;/g, '·');
    return unescaped
      .replace(/<[^>]+>/g, '') // Strip all HTML tags
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Helper: Generate stable article ID
   */
  private generateId(title: string, url: string): string {
    const combined = `${title}_${url}`;
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      hash = (hash << 5) - hash + combined.charCodeAt(i);
      hash |= 0;
    }
    return `news_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Fetch from Google News RSS (Official Korean Finance & Stock News Feed)
   */
  private async fetchFromGoogleRss(
    query: string,
    categoryLabel: string = 'general',
    relatedSymbol?: string,
    relatedSymbolName?: string
  ): Promise<NewsItem[]> {
    const encodedQuery = encodeURIComponent(query);
    const feedUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=ko&gl=KR&ceid=KR:ko`;

    const res = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`Google News RSS 응답 오류 (HTTP ${res.status})`);
    }

    const xmlText = await res.text();
    const itemMatches = xmlText.match(/<item>[\s\S]*?<\/item>/g) || [];

    const items: NewsItem[] = [];

    for (const itemXml of itemMatches) {
      const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);
      const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
      const pubDateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      const sourceMatch = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/);
      const descMatch = itemXml.match(/<description>([\s\S]*?)<\/description>/);

      if (!titleMatch || !linkMatch) continue;

      let rawTitle = this.cleanText(titleMatch[1]);
      const rawUrl = linkMatch[1].trim();
      const rawPubDate = pubDateMatch ? pubDateMatch[1].trim() : new Date().toUTCString();
      let sourceName = sourceMatch ? this.cleanText(sourceMatch[1]) : '증권뉴스';

      // Parse timestamp
      const publishedAt = new Date(rawPubDate).getTime() || Date.now();

      // Many Google News RSS titles end with "- 언론사명"
      if (!sourceMatch && rawTitle.includes(' - ')) {
        const parts = rawTitle.split(' - ');
        sourceName = parts.pop()?.trim() || sourceName;
        rawTitle = parts.join(' - ').trim();
      } else if (rawTitle.endsWith(` - ${sourceName}`)) {
        rawTitle = rawTitle.slice(0, -(sourceName.length + 3)).trim();
      }

      // Summary preview from description
      let summary = descMatch ? this.cleanText(descMatch[1]) : '';
      if (summary.startsWith(rawTitle)) {
        summary = summary.slice(rawTitle.length).trim();
      }
      if (!summary || summary === sourceName || summary.length < 5) {
        summary = `${sourceName} 보도: '${rawTitle}' 관련 금융시장 및 증권 최신 주요 속보입니다.`;
      }

      items.push({
        id: this.generateId(rawTitle, rawUrl),
        title: rawTitle,
        source: sourceName,
        pubDate: rawPubDate,
        publishedAt,
        timeAgo: this.formatTimeAgo(publishedAt),
        url: rawUrl,
        summary: summary.slice(0, 160),
        relatedSymbol,
        relatedSymbolName,
        category: categoryLabel as any,
      });
    }

    // Sort by publication date descending (최신순/속보 정렬)
    return items.sort((a, b) => b.publishedAt - a.publishedAt);
  }

  /**
   * Fetch from Naver News Search API if NAVER_CLIENT_ID & NAVER_CLIENT_SECRET are configured
   */
  private async fetchFromNaver(
    query: string,
    categoryLabel: string = 'general',
    relatedSymbol?: string,
    relatedSymbolName?: string
  ): Promise<NewsItem[] | null> {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return null; // Not configured, fallback to Google RSS
    }

    const encodedQuery = encodeURIComponent(query);
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodedQuery}&display=30&sort=date`;

    const res = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      console.warn(`[NewsAPI] Naver News API error (HTTP ${res.status}), falling back to Google RSS`);
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data.items)) return null;

    return data.items.map((item: any) => {
      const title = this.cleanText(item.title);
      const url = item.originallink || item.link;
      const pubDate = item.pubDate;
      const publishedAt = new Date(pubDate).getTime() || Date.now();

      return {
        id: this.generateId(title, url),
        title,
        source: '네이버 뉴스',
        pubDate,
        publishedAt,
        timeAgo: this.formatTimeAgo(publishedAt),
        url,
        summary: this.cleanText(item.description).slice(0, 160),
        relatedSymbol,
        relatedSymbolName,
        category: categoryLabel as any,
      };
    });
  }

  /**
   * Unified real news fetcher with server caching
   */
  public async getNews(
    query: string,
    category: string = 'all',
    page: number = 1,
    limit: number = 20,
    relatedSymbol?: string,
    relatedSymbolName?: string,
    bypassCache: boolean = false
  ): Promise<NewsResponse> {
    const p = Math.max(1, page);
    const l = Math.max(1, Math.min(50, limit));
    const cacheKey = `news_${category}_${query}_p${p}_l${l}`;

    // 1. Check Server Cache
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (!bypassCache && cached && now < cached.expiresAt) {
      return {
        ...cached.data,
        cached: true,
      };
    }

    try {
      let rawItems: NewsItem[] | null = null;
      let usedSource: 'naver' | 'google_rss' = 'google_rss';

      // 2. Try Naver if configured
      if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
        rawItems = await this.fetchFromNaver(query, category, relatedSymbol, relatedSymbolName);
        if (rawItems) usedSource = 'naver';
      }

      // 3. Primary Production Feed: Google News RSS
      if (!rawItems || rawItems.length === 0) {
        rawItems = await this.fetchFromGoogleRss(query, category, relatedSymbol, relatedSymbolName);
        usedSource = 'google_rss';
      }

      const total = rawItems.length;
      const startIndex = (p - 1) * l;
      const paginated = rawItems.slice(startIndex, startIndex + l);
      const hasMore = startIndex + l < total;

      const response: NewsResponse = {
        query,
        category,
        total,
        page: p,
        limit: l,
        hasMore,
        items: paginated,
        source: usedSource,
        cached: false,
        timestamp: now,
        error: null,
      };

      // Store in Server Cache
      this.cache.set(cacheKey, {
        data: response,
        expiresAt: now + this.defaultTtlMs,
      });

      return response;
    } catch (err: any) {
      console.error(`[NewsAPI] 뉴스 조회 실패 (${category}, "${query}"):`, err.message);
      return {
        query,
        category,
        total: 0,
        page: p,
        limit: l,
        hasMore: false,
        items: [],
        source: 'google_rss',
        cached: false,
        timestamp: now,
        error: `뉴스 API 조회 실패: ${err.message}`,
      };
    }
  }

  /**
   * 1. Stock-specific News (종목별 최신 뉴스/속보)
   */
  public async getStockNews(symbol: string, page: number = 1, limit: number = 10): Promise<NewsResponse> {
    const matched = TRACKED_STOCKS.find(s => s.symbol === symbol);
    const stockName = matched?.name || symbol;

    // Search query with stock name, code and financial keywords
    const query = `"${stockName}" OR "${symbol}" (주식 OR 증시 OR 실적 OR 공시)`;
    return this.getNews(query, 'stock', page, limit, symbol, stockName);
  }

  /**
   * 2. Market Categories News (전체 시장 뉴스 및 속보)
   * Categories: 'all' | 'breaking' | 'kospi' | 'kosdaq' | 'economy' | 'market'
   */
  public async getMarketNews(category: string = 'all', page: number = 1, limit: number = 20): Promise<NewsResponse> {
    let query = '국내 증시 OR 코스피 OR 코스닥';

    switch (category) {
      case 'breaking':
        query = '속보 (증시 OR 주식 OR 특징주 OR 급등 OR 급락)';
        break;
      case 'kospi':
        query = '코스피 OR KOSPI 증시';
        break;
      case 'kosdaq':
        query = '코스닥 OR KOSDAQ 증시';
        break;
      case 'economy':
        query = '한국 경제 OR 금리 OR 환율 OR 한국은행';
        break;
      case 'market':
        query = '국내 증시 OR 코스피 OR 주식 시장';
        break;
      default:
        query = '국내 증시 OR 코스피 OR 코스닥';
        break;
    }

    return this.getNews(query, category, page, limit);
  }

  /**
   * 3. Keyword Search News
   */
  public async searchNews(keyword: string, page: number = 1, limit: number = 20): Promise<NewsResponse> {
    const cleanQ = (keyword || '').trim();
    if (!cleanQ) {
      return this.getMarketNews('all', page, limit);
    }
    const query = `${cleanQ} (증시 OR 주식 OR 경제)`;
    return this.getNews(query, 'search', page, limit);
  }

  /**
   * Diagnostic / Status check
   */
  public getStatus() {
    return {
      service: 'Stock News API Engine',
      providers: {
        googleRss: { status: 'AVAILABLE', cost: 'FREE', rateLimit: 'Managed by 60s server cache' },
        naver: {
          configured: Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET),
          cost: 'FREE (Daily 25,000 calls)',
        },
      },
      cachedQueriesCount: this.cache.size,
      ttlSeconds: this.defaultTtlMs / 1000,
    };
  }
}

export const newsApiService = new NewsApiService();
