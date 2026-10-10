import React, { useState, useEffect } from 'react';
import { 
  Bookmark, 
  Trash2, 
  Plus, 
  TrendingUp, 
  TrendingDown, 
  ArrowUp, 
  ArrowDown, 
  Clock, 
  ShieldCheck, 
  Lock, 
  LogIn,
  Search,
  GripVertical,
  RefreshCw,
  Zap
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PriceBadge } from '../common/PriceBadge';
import { MockTradeModal } from '../portfolio/MockTradeModal';

export const WatchlistView: React.FC = () => {
  const { 
    stocks, 
    watchlist, 
    toggleWatchlist, 
    reorderWatchlist, 
    navigateToStock, 
    setActiveTab, 
    setIsSearchOpen,
    isAuthenticated,
    setIsAuthModalOpen,
    user,
    isSimulatingLiveTicks,
    refreshWatchlistQuotes
  } = useApp();

  // Current timestamp for last update time
  const [lastUpdateTime, setLastUpdateTime] = useState(() => new Date().toLocaleTimeString('ko-KR'));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedTradeStock, setSelectedTradeStock] = useState<typeof stocks[0] | null>(null);

  useEffect(() => {
    if (watchlist.length > 0) {
      refreshWatchlistQuotes();
    }
  }, [watchlist.join(',')]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshWatchlistQuotes();
      setLastUpdateTime(new Date().toLocaleTimeString('ko-KR'));
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setLastUpdateTime(new Date().toLocaleTimeString('ko-KR'));
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Filter and preserve order from user's watchlist array
  const watchlistStocks = watchlist
    .map(symbol => stocks.find(s => s.symbol === symbol))
    .filter((s): s is typeof stocks[0] => Boolean(s));

  // Compute portfolio simulation statistics
  const totalValue = watchlistStocks.reduce((acc, cur) => acc + cur.price * 10, 0);
  const totalChange = watchlistStocks.reduce((acc, cur) => acc + cur.change * 10, 0);
  const totalChangePercent = totalValue > 0 ? (totalChange / (totalValue - totalChange)) * 100 : 0;

  // Move item up
  const handleMoveUp = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (index <= 0) return;
    const newOrder = [...watchlist];
    const temp = newOrder[index - 1];
    newOrder[index - 1] = newOrder[index];
    newOrder[index] = temp;
    reorderWatchlist(newOrder);
  };

  // Move item down
  const handleMoveDown = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (index >= watchlist.length - 1) return;
    const newOrder = [...watchlist];
    const temp = newOrder[index + 1];
    newOrder[index + 1] = newOrder[index];
    newOrder[index] = temp;
    reorderWatchlist(newOrder);
  };

  // If user is not authenticated, show sign-in prompt
  if (!isAuthenticated) {
    return (
      <div className="py-20 text-center max-w-md mx-auto space-y-4 animate-in fade-in duration-150">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center">
          <Bookmark className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white">
            나만의 관심종목을 관리하세요
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            로그인하시면 클라우드 Firestore에 관심종목이 안전하게 연동되며, 모든 기기에서 실시간 시세와 변동률을 확인할 수 있습니다.
          </p>
        </div>
        <button
          onClick={() => setIsAuthModalOpen(true)}
          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors shadow-md shadow-rose-600/20 inline-flex items-center gap-2"
        >
          <LogIn className="w-4 h-4" />
          <span>로그인 / 회원가입하기</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-150">
      {/* Page Title & Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Bookmark className="w-6 h-6 text-rose-500 fill-rose-500" />
              내 관심종목 포트폴리오
            </h2>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <ShieldCheck className="w-3 h-3" />
              <span>Firebase 동기화됨</span>
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 font-mono">
              <Zap className="w-3 h-3" />
              <span>Kiwoom 실전 시세</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {user?.name}님의 관심종목 실시간 시세, 거래대금 및 오늘의 변동 현황입니다.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs transition-all cursor-pointer disabled:opacity-50"
            title="키움 실시간 시세 새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-rose-500' : ''}`} />
            <span>{isRefreshing ? '조회중...' : '시세 새로고침'}</span>
          </button>

          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs shadow-md shadow-rose-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>관심종목 추가</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs text-slate-400 block mb-1">관심 종목 수</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {watchlistStocks.length} <span className="text-sm font-sans font-medium text-slate-400">개</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">
            위/아래 버튼으로 관심종목 순서 자유 변경
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs text-slate-400 block mb-1">10주 균등 매수 시뮬레이션 금액</span>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {totalValue.toLocaleString()} <span className="text-sm font-sans font-medium text-slate-400">원</span>
          </div>
          <span className="text-[11px] text-slate-400 block mt-1">
            가상 균등 포트폴리오 산출
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-xs text-slate-400 block mb-1">당일 평가 손익 (시뮬레이션)</span>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-black font-mono ${totalChange >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
              {totalChange >= 0 ? '+' : ''}{totalChange.toLocaleString()}원
            </span>
            <PriceBadge change={totalChange} changePercent={totalChangePercent} size="sm" showIcon={false} />
          </div>
          <span className="text-[11px] text-slate-400 block mt-1 flex items-center gap-1 font-mono">
            <Clock className="w-3 h-3 text-slate-400" />
            최근 갱신: {lastUpdateTime}
          </span>
        </div>
      </div>

      {/* Watchlist Main Table */}
      {watchlistStocks.length > 0 ? (
        <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          {/* Top table info bar */}
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-400 bg-slate-50/50 dark:bg-slate-800/20">
            <span>항목을 클릭하면 종목 상세 화면으로 이동합니다.</span>
            <div className="flex items-center gap-2 font-mono">
              <span className={`w-2 h-2 rounded-full ${isSimulatingLiveTicks ? 'bg-rose-500 animate-ping' : 'bg-slate-400'}`}></span>
              <span>마지막 시세 갱신: {lastUpdateTime}</span>
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs font-semibold bg-slate-50/50 dark:bg-slate-800/30">
                  <th className="py-3.5 px-4 text-center w-16">순서</th>
                  <th className="py-3.5 px-4">종목명 / 종목코드</th>
                  <th className="py-3.5 px-4 text-right">현재가</th>
                  <th className="py-3.5 px-4 text-right">등락률</th>
                  <th className="py-3.5 px-4 text-right">거래량</th>
                  <th className="py-3.5 px-4 text-right">거래대금</th>
                  <th className="py-3.5 px-4 text-right">오늘의 변동 (고/저)</th>
                  <th className="py-3.5 px-4 text-right">마지막 업데이트</th>
                  <th className="py-3.5 px-4 text-center w-20">삭제</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
                {watchlistStocks.map((stock, idx) => {
                  const isUp = stock.change >= 0;
                  return (
                    <tr
                      key={stock.symbol}
                      onClick={() => navigateToStock(stock.symbol)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    >
                      {/* 순서 변경 버튼 (Up/Down) */}
                      <td className="py-4 px-2 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            onClick={e => handleMoveUp(e, idx)}
                            disabled={idx === 0}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-20 text-slate-500"
                            title="위로 이동"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => handleMoveDown(e, idx)}
                            disabled={idx === watchlistStocks.length - 1}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-20 text-slate-500"
                            title="아래로 이동"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* 1. 종목명 & 종목코드 */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white group-hover:text-rose-500 transition-colors">
                            {stock.name}
                          </span>
                          <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold">
                            {stock.symbol}
                          </span>
                          <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                            {stock.market}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400 mt-0.5 block">{stock.sector}</span>
                      </td>

                      {/* 2. 현재가 */}
                      <td className="py-4 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {stock.price.toLocaleString()}원
                      </td>

                      {/* 3. 등락률 */}
                      <td className="py-4 px-4 text-right">
                        <PriceBadge change={stock.change} changePercent={stock.changePercent} size="sm" />
                      </td>

                      {/* 4. 거래량 */}
                      <td className="py-4 px-4 text-right font-mono text-xs text-slate-700 dark:text-slate-300">
                        {stock.volume.toLocaleString()}주
                      </td>

                      {/* 5. 거래대금 */}
                      <td className="py-4 px-4 text-right font-mono text-xs font-bold text-slate-900 dark:text-white">
                        {stock.tradingValue >= 10000 
                          ? `${(stock.tradingValue / 10000).toFixed(1)}조 원`
                          : `${stock.tradingValue.toLocaleString()}억 원`}
                      </td>

                      {/* 6. 오늘의 변동 */}
                      <td className="py-4 px-4 text-right font-mono text-xs">
                        <span className={isUp ? 'text-rose-500 font-bold' : 'text-blue-500 font-bold'}>
                          {isUp ? '+' : ''}{stock.change.toLocaleString()}원
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {stock.highPrice.toLocaleString()} / {stock.lowPrice.toLocaleString()}
                        </div>
                      </td>

                      {/* 7. 마지막 업데이트 시간 */}
                      <td className="py-4 px-4 text-right font-mono text-xs text-slate-400">
                        {lastUpdateTime}
                      </td>

                      {/* 거래 및 삭제 액션 */}
                      <td className="py-4 px-4 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5 font-sans">
                          <button
                            onClick={() => setSelectedTradeStock(stock)}
                            className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold transition-colors"
                            title="모의 매매 바로가기"
                          >
                            모의매매
                          </button>
                          <button
                            onClick={() => toggleWatchlist(stock.symbol)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                            title="관심종목에서 삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden font-sans">
            {watchlistStocks.map((stock, idx) => {
              const isUp = stock.change >= 0;
              return (
                <div
                  key={stock.symbol}
                  onClick={() => navigateToStock(stock.symbol)}
                  className="p-4 space-y-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                        {stock.name}
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        {stock.symbol}
                      </span>
                    </div>

                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={e => handleMoveUp(e, idx)}
                        disabled={idx === 0}
                        className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-20"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => handleMoveDown(e, idx)}
                        disabled={idx === watchlistStocks.length - 1}
                        className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-20"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedTradeStock(stock);
                        }}
                        className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-[10px]"
                      >
                        모의매매
                      </button>
                      <button
                        onClick={() => toggleWatchlist(stock.symbol)}
                        className="p-1 text-slate-400 hover:text-rose-500 ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="font-bold font-mono text-base text-slate-900 dark:text-white">
                        {stock.price.toLocaleString()}원
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        변동: {isUp ? '+' : ''}{stock.change.toLocaleString()}원
                      </div>
                    </div>
                    <PriceBadge change={stock.change} changePercent={stock.changePercent} size="sm" />
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500">
                    <div>
                      <span className="text-slate-400 block text-[10px]">거래량</span>
                      <span>{(stock.volume / 1000).toFixed(0)}k</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">거래대금</span>
                      <span>{stock.tradingValue.toLocaleString()}억</span>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-400 block text-[10px]">갱신시간</span>
                      <span>{lastUpdateTime}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="p-12 text-center bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
          <Bookmark className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
          <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200">
            아직 관심종목이 비어 있습니다
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 max-w-sm mx-auto">
            종목 상세 페이지에서 오른쪽 상단의 '관심종목 추가' 버튼을 누르거나 검색창을 통해 종목을 등록하세요.
          </p>
          <div className="pt-2">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 inline-flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>종목 검색하고 추가하기</span>
            </button>
          </div>
        </div>
      )}
      {/* Mock Trade Modal */}
      {selectedTradeStock && (
        <MockTradeModal
          isOpen={Boolean(selectedTradeStock)}
          onClose={() => setSelectedTradeStock(null)}
          symbol={selectedTradeStock.symbol}
          stockName={selectedTradeStock.name}
          defaultPrice={selectedTradeStock.price}
          initialType="BUY"
        />
      )}
    </div>
  );
};
