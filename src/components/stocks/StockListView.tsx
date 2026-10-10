import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  Bookmark, 
  ChevronRight, 
  Sparkles,
  TrendingUp,
  SlidersHorizontal,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  X,
  Flame
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Stock } from '../../types';
import { PriceBadge } from '../common/PriceBadge';
import { matchHangulSearch } from '../../utils/hangul';
import { isSurgeGain, isSurgeLoss, isVolumeSurge } from '../../utils/marketThresholds';

export const StockListView: React.FC = () => {
  const { stocks, navigateToStock, watchlist, toggleWatchlist, isWatchlisted, setActiveTab } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [marketFilter, setMarketFilter] = useState<'ALL' | 'KOSPI' | 'KOSDAQ'>('ALL');
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');
  const [conditionFilter, setConditionFilter] = useState<'ALL' | 'SURGE' | 'PLUNGE' | 'VOLUME'>('ALL');
  const [sortField, setSortField] = useState<'marketCap' | 'tradingValue' | 'changePercent' | 'volume' | 'volumeRatio'>('marketCap');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Extract sectors
  const sectors = ['ALL', '반도체', '바이오', '2차전지', '방위산업', '자동차', 'IT인터넷'];

  // Filter with Chosung, partial, code, and name support + Condition Filters
  const filtered = stocks.filter(stock => {
    const matchesSearch =
      !searchTerm.trim() ||
      matchHangulSearch(stock.name, searchTerm) ||
      stock.symbol.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
      stock.sector.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesMarket = marketFilter === 'ALL' || stock.market === marketFilter;

    const matchesSector =
      sectorFilter === 'ALL' || stock.sector.toLowerCase().includes(sectorFilter.toLowerCase());

    const matchesCondition =
      conditionFilter === 'ALL' ||
      (conditionFilter === 'SURGE' && isSurgeGain(stock.changePercent)) ||
      (conditionFilter === 'PLUNGE' && isSurgeLoss(stock.changePercent)) ||
      (conditionFilter === 'VOLUME' && isVolumeSurge(stock.volumeRatio));

    return matchesSearch && matchesMarket && matchesSector && matchesCondition;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];
    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Page Title & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">
            국내 주식 종목 시세
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            코스피 및 코스닥 주요 상장 종목의 실시간 호가 및 재무 지표를 탐색하세요.
          </p>
        </div>

        {/* Actions & Search */}
        <div className="flex items-center gap-2.5 w-full md:w-auto">
          <button
            onClick={() => setActiveTab('ranking')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all cursor-pointer shrink-0"
            title="실시간 상승/하락/거래량/거래대금 TOP 20 보기"
          >
            <Flame className="w-4 h-4 text-amber-500" />
            <span>실시간 순위 TOP 20</span>
          </button>

          {/* Search Input */}
          <div className="relative flex-1 md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="종목명, 코드, 테마 검색..."
              className="w-full pl-9 pr-8 py-2 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex flex-col gap-3 p-3.5 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
        {/* Row 1: Condition Screener Tabs (+5% 이상, -5% 이하, 200% 이상) */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
          <span className="text-xs font-bold text-slate-400 mr-1 shrink-0">특징주 포착:</span>
          <button
            onClick={() => setConditionFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 ${
              conditionFilter === 'ALL'
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            전체 종목
          </button>
          <button
            onClick={() => setConditionFilter('SURGE')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
              conditionFilter === 'SURGE'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 border border-rose-500/20'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>급등 (+5% 이상)</span>
          </button>
          <button
            onClick={() => setConditionFilter('PLUNGE')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
              conditionFilter === 'PLUNGE'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 border border-blue-500/20'
            }`}
          >
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>급락 (-5% 이하)</span>
          </button>
          <button
            onClick={() => setConditionFilter('VOLUME')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
              conditionFilter === 'VOLUME'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/20'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>거래량 급증 (200% 이상)</span>
          </button>
        </div>

        {/* Row 2: Market & Sector Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          {/* Market Filter */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
            {(['ALL', 'KOSPI', 'KOSDAQ'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMarketFilter(m)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  marketFilter === m
                    ? 'bg-white dark:bg-[#1a1f2e] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {m === 'ALL' ? '전체 시장' : m}
              </button>
            ))}
          </div>

          {/* Sector Filter */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
            {sectors.map(sec => (
              <button
                key={sec}
                onClick={() => setSectorFilter(sec)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                  sectorFilter === sec
                    ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {sec === 'ALL' ? '모든 섹터' : sec}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stock Table & Mobile Responsive View */}
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        {/* Mobile View: High-Density List */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden font-sans">
          {sorted.map(stock => {
            const isWatch = isWatchlisted(stock.symbol);
            const isUp = stock.change >= 0;
            return (
              <div
                key={stock.symbol}
                onClick={() => navigateToStock(stock.symbol)}
                className="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                      {stock.name}
                    </span>
                    <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {stock.market}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                    <span className="font-mono">{stock.symbol}</span>
                    <span>·</span>
                    <span>{stock.sector}</span>
                    {isSurgeGain(stock.changePercent) && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                        급등 (+5%)
                      </span>
                    )}
                    {isSurgeLoss(stock.changePercent) && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                        급락 (-5%)
                      </span>
                    )}
                    {isVolumeSurge(stock.volumeRatio) && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                        거래량 급증 ({stock.volumeRatio}%)
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="font-bold font-mono text-sm text-slate-900 dark:text-white">
                      {stock.price.toLocaleString()}원
                    </div>
                    <PriceBadge change={stock.change} changePercent={stock.changePercent} size="sm" />
                  </div>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      toggleWatchlist(stock.symbol);
                    }}
                    className={`p-1.5 rounded-lg transition-colors ${
                      isWatch ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'
                    }`}
                  >
                    <Bookmark className={`w-4 h-4 ${isWatch ? 'fill-amber-500' : ''}`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop View: Full Data Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-semibold bg-slate-50/50 dark:bg-slate-800/30">
                <th className="py-3 px-4">종목정보</th>
                <th
                  onClick={() => handleSort('changePercent')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>현재가 / 등락</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('volume')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>거래량 (주)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('volumeRatio')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>거래량 급증비</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('tradingValue')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>거래대금</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort('marketCap')}
                  className="py-3 px-4 text-right cursor-pointer hover:text-slate-900 dark:hover:text-white"
                >
                  <div className="inline-flex items-center gap-1">
                    <span>시가총액</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right">외인 / 기관</th>
                <th className="py-3 px-4 text-center">관심</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
              {sorted.map(stock => {
                const isWatch = isWatchlisted(stock.symbol);
                return (
                  <tr
                    key={stock.symbol}
                    onClick={() => navigateToStock(stock.symbol)}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white group-hover:text-rose-500 transition-colors">
                              {stock.name}
                            </span>
                            <span className="text-xs font-mono text-slate-400">
                              {stock.symbol}
                            </span>
                            <span className="text-[10px] px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                              {stock.market}
                            </span>
                            {isSurgeGain(stock.changePercent) && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                                급등
                              </span>
                            )}
                            {isSurgeLoss(stock.changePercent) && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                급락
                              </span>
                            )}
                            {isVolumeSurge(stock.volumeRatio) && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                거래급증
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400">{stock.sector}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-bold font-mono text-slate-900 dark:text-white">
                        {stock.price.toLocaleString()}원
                      </div>
                      <PriceBadge change={stock.change} changePercent={stock.changePercent} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300">
                      {stock.volume.toLocaleString()}주
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs">
                      <span className={`font-bold ${stock.volumeRatio >= 200 ? 'text-amber-500' : 'text-slate-400'}`}>
                        {stock.volumeRatio}%
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300">
                      {stock.tradingValue.toLocaleString()}억 원
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300">
                      {stock.marketCap >= 10000
                        ? `${(stock.marketCap / 10000).toFixed(1)}조 원`
                        : `${stock.marketCap.toLocaleString()}억 원`}
                    </td>
                    <td className="py-3.5 px-4 text-right text-xs font-mono">
                      <div className={stock.foreignNetBuy >= 0 ? 'text-rose-500' : 'text-blue-500'}>
                        외: {stock.foreignNetBuy >= 0 ? '+' : ''}{stock.foreignNetBuy}억
                      </div>
                      <div className={stock.instNetBuy >= 0 ? 'text-rose-500' : 'text-blue-500'}>
                        기: {stock.instNetBuy >= 0 ? '+' : ''}{stock.instNetBuy}억
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => toggleWatchlist(stock.symbol)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isWatch
                            ? 'text-amber-500 hover:text-amber-600'
                            : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-300'
                        }`}
                        title={isWatch ? '관심종목 해제' : '관심종목 추가'}
                      >
                        <Bookmark className={`w-4 h-4 ${isWatch ? 'fill-amber-500' : ''}`} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
