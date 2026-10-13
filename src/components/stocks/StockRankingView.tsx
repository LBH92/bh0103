import React, { useState, useEffect, useCallback } from 'react';
import { 
  Flame, 
  TrendingUp, 
  TrendingDown, 
  BarChart2, 
  DollarSign, 
  RefreshCw, 
  ChevronRight, 
  AlertTriangle, 
  Clock, 
  ArrowUpRight, 
  ArrowDownRight,
  Trophy,
  Activity,
  Layers,
  Sparkles,
  Info,
  ShieldCheck
} from 'lucide-react';
import { MarketFilterType, RankingSortType, StockRankingItem, StockRankingResponse } from '../../types';
import { useApp } from '../../context/AppContext';
import { getKRXMarketStatus } from '../../utils/marketHours';

export const StockRankingView: React.FC = () => {
  const { navigateToStock } = useApp();

  const [market, setMarket] = useState<MarketFilterType>('ALL');
  const [sort, setSort] = useState<RankingSortType>('change_rise');
  const [rankingData, setRankingData] = useState<StockRankingResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch Rankings from Server API
  const fetchRankings = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/stocks/ranking?market=${market}&sort=${sort}`);
      if (!res.ok) {
        throw new Error(`서버 응답 오류 (HTTP ${res.status})`);
      }
      const data: StockRankingResponse = await res.json();
      setRankingData(data);
    } catch (err: any) {
      console.error('[StockRanking] Fetch error:', err);
      setErrorMessage(err.message || '실시간 순위 데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [market, sort]);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  // Periodic Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchRankings(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchRankings]);

  const sortTabs: { id: RankingSortType; label: string; icon: React.ReactNode; desc: string; trId: string }[] = [
    { 
      id: 'change_rise', 
      label: '상승률 TOP 20', 
      icon: <TrendingUp className="w-4 h-4 text-rose-500" />,
      desc: '당일 주가 급등 및 전일 대비 상승폭 상위 종목',
      trId: 'ka10027',
    },
    { 
      id: 'change_fall', 
      label: '하락률 TOP 20', 
      icon: <TrendingDown className="w-4 h-4 text-blue-500" />,
      desc: '당일 주가 급락 및 전일 대비 하락폭 상위 종목',
      trId: 'ka10027',
    },
    { 
      id: 'volume', 
      label: '거래량 TOP 20', 
      icon: <BarChart2 className="w-4 h-4 text-emerald-500" />,
      desc: '당일 누적 거래량 상위 종목',
      trId: 'ka10030',
    },
    { 
      id: 'trading_value', 
      label: '거래대금 TOP 20', 
      icon: <DollarSign className="w-4 h-4 text-amber-500" />,
      desc: '시장 수급과 매매대금이 집중된 거래대금 상위 종목',
      trId: 'ka10032',
    },
  ];

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white font-black text-xs flex items-center justify-center shadow-md shadow-amber-500/20">
          1
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-slate-300 to-slate-500 text-white font-black text-xs flex items-center justify-center shadow-md shadow-slate-500/20">
          2
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-amber-600 to-amber-800 text-white font-black text-xs flex items-center justify-center shadow-md shadow-amber-700/20">
          3
        </span>
      );
    }
    return (
      <span className="w-7 h-7 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs flex items-center justify-center font-mono">
        {rank}
      </span>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150 max-w-7xl mx-auto pb-12">
      {/* 1. Header Banner & Status Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#131722] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>실시간 종목 순위</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 font-mono">
                  LIVE RANKING
                </span>
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                코스피·코스닥 시장별 당일 급등락, 거래량 및 거래대금 실시간 상위 20개 종목 순위
              </p>
            </div>
          </div>
        </div>

        {/* Data Source & Status & Refresh Action */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          {rankingData && (
            <>
              {/* Market Session Status Badge (정규장/장시작전/장마감/휴장일) */}
              {(() => {
                const krxStatus = getKRXMarketStatus(new Date());
                return (
                  <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl border ${
                    krxStatus.isOpen
                      ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400'
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${krxStatus.isOpen ? 'bg-rose-500 animate-pulse' : 'bg-slate-400'}`} />
                    <span>{krxStatus.statusLabel}</span>
                    <span className="text-[11px] opacity-75 font-normal">({krxStatus.detailLabel})</span>
                  </div>
                );
              })()}

              {/* Data Source Badge */}
              <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl border ${
                rankingData.dataSource === 'kiwoom'
                  ? 'bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30 text-purple-700 dark:text-purple-300'
                  : 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              }`}>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>
                  {rankingData.dataSource === 'kiwoom' ? '키움 Open API' : '실시간 거래소 시세'}
                  {rankingData.trId && <span className="font-mono text-[11px] ml-1 opacity-80">({rankingData.trId})</span>}
                </span>
              </div>

              {/* Timestamp */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>기준 시각: {rankingData.lastUpdated}</span>
              </div>
            </>
          )}

          <button
            onClick={() => fetchRankings(false)}
            disabled={isLoading || isRefreshing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 font-bold text-xs hover:bg-rose-100 dark:hover:bg-rose-500/25 transition-all cursor-pointer disabled:opacity-50"
            title="실시간 순위 새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
        </div>
      </div>

      {/* Stale Data Alert Notice (if upstream is delayed) */}
      {rankingData?.isStale && (
        <div className="flex items-center gap-2.5 p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            현재 거래소 시세 통신 지연으로 인해 마지막 정상 수신 데이터(갱신 시각: {rankingData.lastUpdated})가 안전하게 표시되고 있습니다.
          </span>
        </div>
      )}

      {/* Kiwoom API Notice Banner (if any information is returned) */}
      {rankingData?.kiwoomNotice && (
        <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 text-slate-600 dark:text-slate-300 text-xs">
          <Info className="w-4 h-4 shrink-0 text-slate-400 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold text-slate-700 dark:text-slate-200">연동 안내:</span>
            <span className="ml-1 text-[11px] text-slate-500 dark:text-slate-400">{rankingData.kiwoomNotice}</span>
          </div>
        </div>
      )}

      {/* 2. Market Switcher & Sort Criteria Tabs */}
      <div className="flex flex-col gap-3">
        {/* Market Filter (ALL / KOSPI / KOSDAQ) */}
        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800 w-fit">
          <button
            onClick={() => setMarket('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              market === 'ALL'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            전체 시장
          </button>
          <button
            onClick={() => setMarket('KOSPI')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              market === 'KOSPI'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>코스피</span>
            <span className="text-[10px] opacity-80">KOSPI</span>
          </button>
          <button
            onClick={() => setMarket('KOSDAQ')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              market === 'KOSDAQ'
                ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>코스닥</span>
            <span className="text-[10px] opacity-80">KOSDAQ</span>
          </button>
        </div>

        {/* 4 Ranking Sort Criteria Tabs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {sortTabs.map(tab => {
            const isActive = sort === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSort(tab.id)}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isActive
                    ? 'bg-white dark:bg-[#131722] border-rose-500 shadow-md ring-1 ring-rose-500/20'
                    : 'bg-white/60 dark:bg-[#131722]/60 border-slate-200 dark:border-slate-800 hover:bg-white dark:hover:bg-[#131722]'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800">
                      {tab.icon}
                    </span>
                    <span className={`text-xs sm:text-sm font-black ${
                      isActive ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'
                    }`}>
                      {tab.label}
                    </span>
                  </div>
                  {isActive && (
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                  <span className="line-clamp-1">{tab.desc}</span>
                  <span className="font-mono text-[9px] opacity-60 ml-1">{tab.trId}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Main Ranking Content Area */}
      {isLoading ? (
        /* Loading Skeleton */
        <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
          <div className="h-6 bg-slate-100 dark:bg-slate-800 rounded-lg w-1/4 animate-pulse"></div>
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-14 bg-slate-50 dark:bg-slate-800/40 rounded-xl animate-pulse"></div>
            ))}
          </div>
        </div>
      ) : errorMessage && !rankingData ? (
        /* Error State */
        <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{errorMessage}</p>
          <button
            onClick={() => fetchRankings(false)}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-xs"
          >
            다시 시도
          </button>
        </div>
      ) : rankingData && rankingData.items.length > 0 ? (
        /* Ranking View: Desktop Table + Mobile Card Layout */
        <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {/* Subheader Title */}
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300">
              {market === 'ALL' ? '전체 시장' : market} · {sortTabs.find(t => t.id === sort)?.label} (총 {rankingData.items.length}개 종목)
            </span>
            <span className="text-slate-400 font-mono text-[11px] hidden sm:inline">
              종목 클릭 시 상세 시세 및 10호가·차트로 이동합니다
            </span>
          </div>

          {/* Desktop Table View (Visible on md and above) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase bg-slate-50/30 dark:bg-slate-800/10">
                  <th className="py-3 px-4 w-16 text-center">순위</th>
                  <th className="py-3 px-4 min-w-[180px]">종목명 / 종목코드</th>
                  <th className="py-3 px-4 text-right">현재가</th>
                  <th className="py-3 px-4 text-right min-w-[120px]">등락률</th>
                  <th className="py-3 px-4 text-right min-w-[110px]">전일대비</th>
                  <th className="py-3 px-4 text-right min-w-[120px]">거래량</th>
                  <th className="py-3 px-4 text-right min-w-[110px]">거래대금</th>
                  <th className="py-3 px-4 text-center w-20">이동</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {rankingData.items.map((item) => {
                  const isUp = item.change > 0;
                  const isDown = item.change < 0;
                  const changeColor = isUp 
                    ? 'text-rose-600 dark:text-rose-400' 
                    : isDown 
                    ? 'text-blue-600 dark:text-blue-400' 
                    : 'text-slate-500 dark:text-slate-400';

                  return (
                    <tr
                      key={item.symbol}
                      onClick={() => navigateToStock(item.symbol)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group"
                    >
                      {/* Rank */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex justify-center">
                          {getRankBadge(item.rank)}
                        </div>
                      </td>

                      {/* Stock Name & Code */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="font-black text-sm text-slate-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                              {item.name}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[11px] text-slate-400 font-semibold">
                                {item.symbol}
                              </span>
                              <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                item.market === 'KOSPI'
                                  ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              }`}>
                                {item.market}
                              </span>
                              {item.sector && (
                                <span className="text-[10px] text-slate-400 truncate max-w-[90px] hidden sm:inline">
                                  {item.sector}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Current Price */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-sm text-slate-900 dark:text-white">
                        {item.price.toLocaleString()}원
                      </td>

                      {/* Change Percent (Red: Up, Blue: Down) */}
                      <td className="py-3.5 px-4 text-right">
                        <span className={`inline-flex items-center gap-0.5 font-bold font-mono text-sm px-2 py-0.5 rounded-lg ${
                          isUp 
                            ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400' 
                            : isDown 
                            ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}>
                          {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : isDown ? <ArrowDownRight className="w-3.5 h-3.5" /> : null}
                          <span>{item.changePercent > 0 ? `+${item.changePercent.toFixed(2)}` : item.changePercent.toFixed(2)}%</span>
                        </span>
                      </td>

                      {/* Change Amount */}
                      <td className={`py-3.5 px-4 text-right font-mono font-semibold text-xs ${changeColor}`}>
                        {item.change > 0 ? `▲ +${item.change.toLocaleString()}원` : item.change < 0 ? `▼ ${item.change.toLocaleString()}원` : '0원'}
                      </td>

                      {/* Volume */}
                      <td className="py-3.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300 font-medium">
                        {item.volume.toLocaleString()}주
                      </td>

                      {/* Trading Value */}
                      <td className="py-3.5 px-4 text-right font-mono text-slate-900 dark:text-white font-bold">
                        {item.tradingValue ? `${item.tradingValue.toLocaleString()}억` : '-'}
                      </td>

                      {/* Detail Link Arrow */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="p-1.5 rounded-lg text-slate-400 group-hover:text-rose-600 dark:group-hover:text-rose-400 group-hover:bg-slate-100 dark:group-hover:bg-slate-800 transition-colors inline-block">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View (Visible below md) */}
          <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {rankingData.items.map((item) => {
              const isUp = item.change > 0;
              const isDown = item.change < 0;
              const changeColor = isUp 
                ? 'text-rose-600 dark:text-rose-400' 
                : isDown 
                ? 'text-blue-600 dark:text-blue-400' 
                : 'text-slate-500 dark:text-slate-400';

              return (
                <div
                  key={item.symbol}
                  onClick={() => navigateToStock(item.symbol)}
                  className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer active:bg-slate-100"
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Rank & Name */}
                    <div className="flex items-center gap-3">
                      {getRankBadge(item.rank)}
                      <div>
                        <div className="font-black text-sm text-slate-900 dark:text-white">
                          {item.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[11px] text-slate-400 font-semibold">
                            {item.symbol}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                            item.market === 'KOSPI'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                              : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {item.market}
                          </span>
                          {item.sector && (
                            <span className="text-[10px] text-slate-400 truncate max-w-[80px]">
                              {item.sector}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Price & Change */}
                    <div className="text-right">
                      <div className="font-mono font-black text-sm text-slate-900 dark:text-white">
                        {item.price.toLocaleString()}원
                      </div>
                      <div className="mt-1">
                        <span className={`inline-flex items-center gap-0.5 font-bold font-mono text-xs px-1.5 py-0.5 rounded-md ${
                          isUp 
                            ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400' 
                            : isDown 
                            ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}>
                          {isUp ? <ArrowUpRight className="w-3 h-3" /> : isDown ? <ArrowDownRight className="w-3 h-3" /> : null}
                          <span>{item.changePercent > 0 ? `+${item.changePercent.toFixed(2)}` : item.changePercent.toFixed(2)}%</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Volume & Trading Value footer */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    <div>
                      <span>전일대비: </span>
                      <span className={`font-semibold ${changeColor}`}>
                        {item.change > 0 ? `▲+${item.change.toLocaleString()}원` : item.change < 0 ? `▼${item.change.toLocaleString()}원` : '0원'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span>거래량: <strong className="text-slate-700 dark:text-slate-300">{item.volume.toLocaleString()}</strong>주</span>
                      <span>거래대금: <strong className="text-slate-700 dark:text-slate-300">{item.tradingValue ? `${item.tradingValue}억` : '-'}</strong></span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 ml-1" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 text-xs">
          조회된 종목 순위 데이터가 없습니다.
        </div>
      )}
    </div>
  );
};
