import React, { useState, useEffect, useCallback } from 'react';
import { Newspaper, ExternalLink, Clock, RefreshCw, AlertCircle } from 'lucide-react';
import { Stock, StockNews } from '../../types';
import { newsService } from '../../services/newsService';

interface StockNewsSectionProps {
  stock: Stock;
}

export const StockNewsSection: React.FC<StockNewsSectionProps> = ({ stock }) => {
  const [newsList, setNewsList] = useState<StockNews[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const fetchNews = useCallback(async (targetPage: number = 1, append: boolean = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await newsService.getStockNews(stock.symbol, targetPage, 8);
      if (append) {
        setNewsList(prev => [...prev, ...data.items]);
      } else {
        setNewsList(data.items);
      }
      setHasMore(data.hasMore);
      setTotalCount(data.total);
      setPage(targetPage);
    } catch (err: any) {
      console.warn(`[StockNewsSection] News fetch failed for ${stock.symbol}:`, err);
      setError(err.message || '관련 뉴스를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [stock.symbol]);

  useEffect(() => {
    fetchNews(1, false);
  }, [fetchNews]);

  const handleLoadMore = () => {
    if (!isLoading && hasMore) {
      fetchNews(page + 1, true);
    }
  };

  return (
    <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
            <Newspaper className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              관련 뉴스 & 공시
            </h3>
            <p className="text-xs text-slate-400">
              '{stock.name}({stock.symbol})' 언론 보도 및 최신 이슈
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {totalCount > 0 && (
            <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
              총 {totalCount}건
            </span>
          )}

          <button
            onClick={() => fetchNews(1, false)}
            disabled={isLoading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="뉴스 새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && newsList.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3].map(n => (
            <div key={n} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/30 animate-pulse space-y-2">
              <div className="h-4 bg-slate-200 dark:bg-slate-700/50 rounded-sm w-3/4"></div>
              <div className="h-3 bg-slate-200 dark:bg-slate-700/30 rounded-sm w-1/2"></div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && newsList.length === 0 && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-center space-y-2">
          <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
          <p className="text-xs text-rose-400 font-semibold">{error}</p>
          <button
            onClick={() => fetchNews(1, false)}
            className="px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-colors"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && newsList.length === 0 && (
        <div className="text-center py-8 text-slate-400 space-y-1">
          <Newspaper className="w-8 h-8 mx-auto text-slate-600 opacity-50" />
          <p className="text-sm font-semibold text-slate-300">
            '{stock.name}' 관련 최신 뉴스가 없습니다.
          </p>
          <p className="text-xs text-slate-500">
            실시간 뉴스 피드에 등록된 기사가 없는 상태입니다.
          </p>
        </div>
      )}

      {/* Real News List */}
      {newsList.length > 0 && (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {newsList.map(item => (
            <div key={item.id} className="py-3.5 first:pt-1 last:pb-1 group">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 flex-1 min-w-0">
                  {/* Source and Time */}
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      {item.source}
                    </span>
                    <span className="text-slate-400 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {item.timeAgo || item.time}
                    </span>
                  </div>

                  {/* Title with original article link */}
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-blue-500 transition-colors block leading-snug"
                  >
                    {item.title}
                  </a>

                  {/* Summary */}
                  {item.summary && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {item.summary}
                    </p>
                  )}
                </div>

                {/* External link button */}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl text-slate-400 hover:text-blue-500 hover:bg-blue-500/10 transition-colors shrink-0"
                  title="언론사 원문 보기"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load More Button */}
      {hasMore && (
        <div className="pt-2 text-center">
          <button
            onClick={handleLoadMore}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors inline-flex items-center gap-1.5"
          >
            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
            <span>뉴스 더보기</span>
          </button>
        </div>
      )}
    </div>
  );
};
