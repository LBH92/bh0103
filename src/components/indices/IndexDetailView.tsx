import React, { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, 
  Clock, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  ShieldCheck, 
  AlertTriangle, 
  BarChart2, 
  Activity, 
  Layers, 
  ChevronRight,
  Flame,
  Sparkles,
  Info
} from 'lucide-react';
import { StockIndex } from '../../types';
import { useApp } from '../../context/AppContext';
import { PriceBadge } from '../common/PriceBadge';
import { InteractiveIndexChart } from './InteractiveIndexChart';

interface IndexDetailViewProps {
  symbol: 'KOSPI' | 'KOSDAQ';
}

export const IndexDetailView: React.FC<IndexDetailViewProps> = ({ symbol }) => {
  const { indices, clearSelectedIndex, setActiveTab } = useApp();

  const initialIndex = indices.find(i => i.symbol === symbol);
  const [indexData, setIndexData] = useState<StockIndex | null>(initialIndex || null);
  const [isLoading, setIsLoading] = useState<boolean>(!initialIndex);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch Index Detail from Server API
  const fetchIndexDetail = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/indices/${symbol}`);
      if (!res.ok) {
        throw new Error(`서버 응답 오류 (HTTP ${res.status})`);
      }
      const data: StockIndex = await res.json();
      setIndexData(data);
    } catch (err: any) {
      console.error('[IndexDetail] Fetch error:', err);
      setErrorMessage(err.message || '지수 상세 정보를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchIndexDetail();
  }, [fetchIndexDetail]);

  // Periodic Auto-refresh every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      fetchIndexDetail(true);
    }, 15000);
    return () => clearInterval(timer);
  }, [fetchIndexDetail]);

  const index = indexData || initialIndex;
  const isUp = (index?.change || 0) > 0;
  const isDown = (index?.change || 0) < 0;

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-200 max-w-7xl mx-auto">
      {/* 1. Top Breadcrumb & Back Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={clearSelectedIndex}
          className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors self-start cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>이전 화면으로 돌아가기</span>
        </button>

        {/* Data Source & Status */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {index && (
            <>
              <div className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl border bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {index.dataSource === 'kiwoom' ? '키움 Open API' : '실시간 거래소 시세'}
                </span>
              </div>

              {index.lastUpdated && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>갱신: {index.lastUpdated}</span>
                </div>
              )}
            </>
          )}

          <button
            onClick={() => fetchIndexDetail(false)}
            disabled={isLoading || isRefreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 font-bold text-xs hover:bg-rose-100 dark:hover:bg-rose-500/25 transition-all cursor-pointer disabled:opacity-50"
            title="실시간 지수 새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
        </div>
      </div>

      {/* Stale Warning Banner (if upstream is delayed) */}
      {index?.isStale && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            현재 거래소 지수 통신 지연으로 인해 마지막 정상 수신 데이터(갱신 시각: {index.lastUpdated})가 안전하게 표시되고 있습니다.
          </span>
        </div>
      )}

      {/* 2. Main Header Card */}
      {index && (
        <div className="bg-white dark:bg-[#131722] p-5 sm:p-7 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <span className={`text-xs px-2.5 py-0.5 rounded-lg font-bold font-mono tracking-wider uppercase ${
                  symbol === 'KOSPI'
                    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                }`}>
                  {symbol}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {symbol === 'KOSPI' ? '유가증권시장 종합주가지수' : '코스닥시장 종합주가지수'}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-1">
                {index.name} 종합지수
              </h1>
            </div>

            {/* Large Price & PriceBadge */}
            <div className="flex flex-col sm:items-end">
              <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-slate-900 dark:text-white">
                {index.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <PriceBadge change={index.change} changePercent={index.changePercent} size="lg" />
              </div>
            </div>
          </div>

          {/* Key Statistics Grid (8 Metrics) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs font-mono">
            {/* 1. 시가 */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
              <span className="text-slate-400 font-sans text-[11px] block mb-1">시가</span>
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                {(index.open || index.value).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
            </div>

            {/* 2. 고가 */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
              <span className="text-slate-400 font-sans text-[11px] block mb-1">고가</span>
              <span className="font-bold text-rose-500 text-sm">
                {index.high.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
            </div>

            {/* 3. 저가 */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
              <span className="text-slate-400 font-sans text-[11px] block mb-1">저가</span>
              <span className="font-bold text-blue-500 text-sm">
                {index.low.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
            </div>

            {/* 4. 전일종가 */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
              <span className="text-slate-400 font-sans text-[11px] block mb-1">전일종가</span>
              <span className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                {(index.prevClose || (index.value - index.change)).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
            </div>

            {/* 5. 거래량 */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
              <span className="text-slate-400 font-sans text-[11px] block mb-1">거래량</span>
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                {index.volume.toLocaleString()}천주
              </span>
            </div>

            {/* 6. 거래대금 */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
              <span className="text-slate-400 font-sans text-[11px] block mb-1">거래대금</span>
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                {index.tradingValue}조원
              </span>
            </div>

            {/* 7. 상승 종목수 */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
              <span className="text-slate-400 font-sans text-[11px] block mb-1">상승 종목</span>
              <span className="font-bold text-rose-500 text-sm">
                ▲ {index.advanceCount}개
              </span>
            </div>

            {/* 8. 하락 종목수 */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
              <span className="text-slate-400 font-sans text-[11px] block mb-1">하락 종목</span>
              <span className="font-bold text-blue-500 text-sm">
                ▼ {index.declineCount}개
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Interactive Index Chart Section */}
      <section aria-label={`${symbol} 지수 캔들 차트`}>
        <InteractiveIndexChart
          symbol={symbol}
          currentValue={index?.value || 2700}
          prevClose={index?.prevClose || (index ? index.value - index.change : 2700)}
        />
      </section>

      {/* 4. Quick Action Footer: Link to Stock Ranking for this market */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-500">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900 dark:text-white">
              {symbol} 시장 실시간 종목 순위
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {symbol} 시장의 급등락, 거래량 및 거래대금 TOP 20 종목을 실시간으로 확인하세요
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            clearSelectedIndex();
            setActiveTab('ranking');
          }}
          className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
        >
          <span>{symbol} 실시간 순위 보기</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
