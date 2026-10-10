import React, { useState, useEffect, useCallback } from 'react';
import { 
  Newspaper, 
  Search, 
  RefreshCw, 
  Clock, 
  ExternalLink, 
  TrendingUp, 
  Zap, 
  Layers, 
  DollarSign, 
  Filter, 
  AlertCircle,
  X,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { StockNews } from '../../types';
import { newsService } from '../../services/newsService';

type NewsCategory = 'all' | 'breaking' | 'market' | 'kospi' | 'kosdaq' | 'economy';

interface CategoryOption {
  id: NewsCategory;
  label: string;
  icon?: React.ReactNode;
}

const CATEGORIES: CategoryOption[] = [
  { id: 'all', label: '전체 뉴스' },
  { id: 'breaking', label: '⚡ 주요 속보', icon: <Zap className="w-3.5 h-3.5 text-amber-500" /> },
  { id: 'market', label: '국내 증시', icon: <TrendingUp className="w-3.5 h-3.5 text-rose-500" /> },
  { id: 'kospi', label: '코스피' },
  { id: 'kosdaq', label: '코스닥' },
  { id: 'economy', label: '경제', icon: <DollarSign className="w-3.5 h-3.5 text-emerald-500" /> },
];

export const NewsView: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<NewsCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [newsList, setNewsList] = useState<StockNews[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());

  const fetchNews = useCallback(async (cat: NewsCategory, q: string, targetPage: number = 1, append: boolean = false) => {
    setIsLoading(true);
    setError(null);

    try {
      let res;
      if (q.trim()) {
        res = await newsService.searchNews(q.trim(), targetPage, 15);
      } else {
        res = await newsService.getMarketNews(cat, targetPage, 15);
      }

      if (append) {
        setNewsList(prev => [...prev, ...res.items]);
      } else {
        setNewsList(res.items);
      }

      setHasMore(res.hasMore);
      setTotalCount(res.total);
      setPage(targetPage);
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      console.warn('[NewsView] Error fetching news:', err);
      setError(err.message || '뉴스 데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews(activeCategory, activeSearch, 1, false);
  }, [activeCategory, activeSearch, fetchNews]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchQuery.trim());
    setPage(1);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setActiveSearch('');
    setPage(1);
  };

  const handleRefresh = () => {
    fetchNews(activeCategory, activeSearch, 1, false);
  };

  const handleLoadMore = () => {
    if (!isLoading && hasMore) {
      fetchNews(activeCategory, activeSearch, page + 1, true);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-[#131722] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold">
              <Newspaper className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              실시간 증시 뉴스 & 속보
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            주요 경제 언론사의 실시간 보도 및 코스피·코스닥 시장 핵심 이슈
          </p>
        </div>

        {/* Action button & Status */}
        <div className="flex items-center gap-3 self-end sm:self-center">
          <span className="text-[11px] font-mono text-slate-400">
            기준: {lastRefreshedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
            <span>새로고침</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar Row */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none p-1 bg-slate-100 dark:bg-slate-900/60 rounded-xl border border-slate-200/60 dark:border-slate-800">
          {CATEGORIES.map(cat => {
            const isActive = activeCategory === cat.id && !activeSearch;
            return (
              <button
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id);
                  setActiveSearch('');
                  setSearchQuery('');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="뉴스 키워드 검색 (예: 금리, 반도체)"
            className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-hidden focus:border-blue-500 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </form>
      </div>

      {/* Active Search Badge */}
      {activeSearch && (
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <span>검색어:</span>
          <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 font-bold">
            "{activeSearch}"
          </span>
          <button
            onClick={handleClearSearch}
            className="text-slate-400 hover:text-rose-400 text-[11px] underline ml-1"
          >
            검색 초기화
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && newsList.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(n => (
            <div key={n} className="p-5 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 animate-pulse space-y-2.5">
              <div className="h-4 bg-slate-200 dark:bg-slate-700/50 rounded-sm w-2/3"></div>
              <div className="h-3 bg-slate-200 dark:bg-slate-700/30 rounded-sm w-full"></div>
              <div className="h-3 bg-slate-200 dark:bg-slate-700/20 rounded-sm w-1/4"></div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && newsList.length === 0 && (
        <div className="p-8 rounded-2xl bg-white dark:bg-[#131722] border border-rose-500/20 text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            뉴스를 불러오지 못했습니다
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {error}
          </p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-colors inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>다시 시도</span>
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && newsList.length === 0 && (
        <div className="p-12 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 text-center space-y-2">
          <Newspaper className="w-12 h-12 text-slate-600 mx-auto opacity-50" />
          <h3 className="text-base font-bold text-slate-300">
            등록된 뉴스가 없습니다
          </h3>
          <p className="text-xs text-slate-500">
            해당 조건의 기사를 찾지 못했습니다. 다른 카테고리나 검색어로 확인해 보세요.
          </p>
        </div>
      )}

      {/* News Articles Grid / List */}
      {newsList.length > 0 && (
        <div className="space-y-3">
          {newsList.map(item => (
            <div
              key={item.id}
              className="p-5 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-all shadow-xs group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  {/* Top Metadata: Publisher & Publishing Time */}
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {item.source}
                    </span>
                    <span className="text-slate-400 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {item.timeAgo || item.time}
                    </span>
                  </div>

                  {/* Headline Title */}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-base sm:text-lg text-slate-900 dark:text-white group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors block leading-snug tracking-tight"
                  >
                    {item.title}
                  </a>

                  {/* Summary Snippet */}
                  {item.summary && (
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {item.summary}
                    </p>
                  )}
                </div>

                {/* Direct Link Icon */}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-blue-500/10 hover:text-blue-500 text-slate-400 transition-colors shrink-0 group-hover:bg-blue-500/10 group-hover:text-blue-500"
                  title="원문 기사 보기 (새 창)"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination / Load More Footer */}
      {hasMore && (
        <div className="pt-4 text-center">
          <button
            onClick={handleLoadMore}
            disabled={isLoading}
            className="px-6 py-2.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 font-bold text-xs text-slate-700 dark:text-slate-200 transition-all inline-flex items-center gap-2 shadow-xs hover:shadow-sm"
          >
            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" /> : null}
            <span>뉴스 더보기 (다음 페이지)</span>
          </button>
        </div>
      )}
    </div>
  );
};
