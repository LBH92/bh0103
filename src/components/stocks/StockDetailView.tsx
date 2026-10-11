import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Bookmark, 
  Bell, 
  Share2, 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Check, 
  Sparkles,
  Layers,
  Activity,
  Newspaper,
  Briefcase,
  Compass
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Stock } from '../../types';
import { stockRepository } from '../../services/stockRepository';
import { PriceBadge } from '../common/PriceBadge';
import { InteractiveStockChart } from './InteractiveStockChart';
import { OrderBookWidget } from './OrderBookWidget';
import { StockAiBriefingWidget } from './StockAiBriefingWidget';
import { StockVolumeSection } from './StockVolumeSection';
import { StockNewsSection } from './StockNewsSection';
import { StockCommunitySection } from './StockCommunitySection';
import { StockSmartAlertWidget } from './StockSmartAlertWidget';
import { storageService } from '../../services/storageService';
import { isSurgeGain, isSurgeLoss, isVolumeSurge } from '../../utils/marketThresholds';
import { getKRXMarketStatus, MarketStatusInfo } from '../../utils/marketHours';
import { MockTradeModal } from '../portfolio/MockTradeModal';
import { VirtualHoldingModal } from '../portfolio/VirtualHoldingModal';
import { HistoricalTradingSimulatorModal } from './HistoricalTradingSimulatorModal';

interface StockDetailViewProps {
  symbol: string;
}

export const StockDetailView: React.FC<StockDetailViewProps> = ({ symbol }) => {
  const { 
    stocks, 
    watchlist, 
    toggleWatchlist, 
    isWatchlisted, 
    setActiveTab, 
    showToast,
    requireAuth
  } = useApp();

  const initialStock = stocks.find(s => s.symbol === symbol);
  const [stockDetail, setStockDetail] = useState<Stock | null>(initialStock || null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(!initialStock);
  const [liveTick, setLiveTick] = useState<Partial<Stock> | null>(null);
  const [marketStatus, setMarketStatus] = useState<MarketStatusInfo>(() => getKRXMarketStatus());

  useEffect(() => {
    const updateMarket = () => setMarketStatus(getKRXMarketStatus());
    updateMarket();
    const timer = setInterval(updateMarket, 10000);
    return () => clearInterval(timer);
  }, []);

  // Fetch full live stock data from Kiwoom REST API
  useEffect(() => {
    let isSubscribed = true;
    const existing = stocks.find(s => s.symbol === symbol);
    if (existing) {
      setStockDetail(existing);
    } else {
      setIsLoadingDetail(true);
    }

    stockRepository.getStock(symbol)
      .then((res: Stock | undefined) => {
        if (isSubscribed && res) {
          setStockDetail(res);
        }
      })
      .catch((err: any) => {
        console.warn(`[StockDetailView] Error loading ${symbol}:`, err);
      })
      .finally(() => {
        if (isSubscribed) {
          setIsLoadingDetail(false);
        }
      });

    return () => {
      isSubscribed = false;
    };
  }, [symbol, stocks]);

  // Subscribe to live tick updates
  useEffect(() => {
    setLiveTick(null);
    const unsub = stockRepository.subscribeExecutionTick?.(symbol, (tick) => {
      setLiveTick({
        price: tick.price,
        change: tick.change,
        changePercent: tick.changePercent,
        volume: tick.volume,
        highPrice: tick.high,
        lowPrice: tick.low,
      });
    });
    return () => {
      unsub?.();
    };
  }, [symbol]);

  const baseStock: Stock = stockDetail || initialStock || {
    symbol,
    name: symbol,
    market: 'KOSPI',
    sector: '기타',
    price: 0,
    change: 0,
    changePercent: 0,
    volume: 0,
    volumeRatio: 100,
    tradingValue: 0,
    openPrice: 0,
    highPrice: 0,
    lowPrice: 0,
    prevClose: 0,
    high52w: 0,
    low52w: 0,
    marketCap: 0,
    per: 0,
    pbr: 0,
    eps: 0,
    dividendYield: 0,
    foreignNetBuy: 0,
    instNetBuy: 0,
    candles: [],
    sparkline: [],
  };

  const stock: Stock = {
    ...baseStock,
    ...(liveTick ? {
      price: liveTick.price || baseStock.price,
      change: liveTick.change !== undefined ? liveTick.change : baseStock.change,
      changePercent: liveTick.changePercent !== undefined ? liveTick.changePercent : baseStock.changePercent,
      volume: liveTick.volume || baseStock.volume,
      highPrice: liveTick.highPrice || baseStock.highPrice,
      lowPrice: liveTick.lowPrice || baseStock.lowPrice,
    } : {}),
  };

  const isWatch = isWatchlisted(stock.symbol);

  // Price Alert Modal State
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [targetAlertPrice, setTargetAlertPrice] = useState(stock.price);
  const [alertNote, setAlertNote] = useState('');

  // Mock Trade & Virtual Holding Modal States
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [isHoldingModalOpen, setIsHoldingModalOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

  const handleCreateAlert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth('알림 생성')) return;
    storageService.addAlert({
      symbol: stock.symbol,
      symbolName: stock.name,
      targetPrice: targetAlertPrice,
      condition: targetAlertPrice >= stock.price ? 'above' : 'below',
      note: alertNote || `${stock.name} 목표가 ${targetAlertPrice.toLocaleString()}원 도달 알림`,
    });
    showToast(`'${stock.name}' ${targetAlertPrice.toLocaleString()}원 목표가 알림이 등록되었습니다.`, 'success');
    setIsAlertModalOpen(false);
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      showToast('종목 상세 링크가 클립보드에 복사되었습니다.', 'info');
    }
  };

  const isUp = stock.change >= 0;

  return (
    <div className="space-y-6 pb-16 animate-in fade-in duration-200">
      {/* Top Header Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
            } else {
              setActiveTab('stocks');
            }
          }}
          className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors self-start cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>이전 화면으로 돌아가기</span>
        </button>

        {/* Top-Right Action Buttons: Watchlist & Alert & Share */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleShare}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="공유하기"
          >
            <Share2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => setIsTradeModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95"
            title="실시간 시세 기반 모의 매매"
          >
            <TrendingUp className="w-4 h-4" />
            <span>모의 매매</span>
          </button>

          <button
            onClick={() => setIsSimulatorOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold transition-all active:scale-95"
            title="과거 차트 매매 시뮬레이션 및 시나리오 분석"
          >
            <Compass className="w-4 h-4 text-rose-500" />
            <span>차트 시뮬레이션</span>
          </button>

          <button
            onClick={() => setIsHoldingModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
            title="가상 보유 내역 등록"
          >
            <Briefcase className="w-4 h-4 text-emerald-500" />
            <span>보유 기록</span>
          </button>

          <button
            onClick={() => {
              if (!requireAuth('알림 생성')) return;
              setIsAlertModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
          >
            <Bell className="w-4 h-4 text-amber-500" />
            <span>가격 알림</span>
          </button>

          {/* 오른쪽/상단 관심종목 추가 버튼 */}
          <button
            onClick={() => toggleWatchlist(stock.symbol)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
              isWatch
                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
            }`}
          >
            <Bookmark className={`w-4 h-4 ${isWatch ? 'fill-amber-500 text-amber-500' : 'text-white'}`} />
            <span>{isWatch ? '관심종목 등록됨' : '관심종목 추가'}</span>
          </button>
        </div>
      </div>

      {/* Top Comprehensive Stock Overview Card */}
      <div className="p-6 sm:p-7 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        {/* Main Title, Market, and Real-time Price */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* 1. 종목명 */}
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                {stock.name}
              </h1>
              {/* 2. 종목코드 */}
              <span className="font-mono text-sm px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-700/60">
                {stock.symbol}
              </span>
              {/* 3. 시장 */}
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 font-mono">
                {stock.market}
              </span>
              <span className="text-xs text-slate-400 font-medium">
                {stock.sector}
              </span>

              {isSurgeGain(stock.changePercent) && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-500/10 text-rose-500 border border-rose-500/30 flex items-center gap-1 font-sans animate-pulse">
                  🔥 급등 (+5% 이상)
                </span>
              )}
              {isSurgeLoss(stock.changePercent) && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-blue-500/10 text-blue-500 border border-blue-500/30 flex items-center gap-1 font-sans">
                  🔻 급락 (-5% 이하)
                </span>
              )}
              {isVolumeSurge(stock.volumeRatio) && (
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30 flex items-center gap-1 font-sans">
                  ⚡ 거래량 급증 (200% 이상: {stock.volumeRatio}%)
                </span>
              )}
            </div>

            {/* 4. 현재가 & 5. 전일 대비 & 6. 등락률 */}
            <div className="flex items-baseline gap-3.5 mt-3">
              <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-slate-900 dark:text-white">
                {stock.currency === 'USD' ? `$${stock.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${stock.price.toLocaleString()}원`}
              </span>
              <div className="flex items-center gap-2">
                <span className={`text-base sm:text-lg font-bold font-mono ${isUp ? 'text-rose-500' : 'text-blue-500'}`}>
                  {isUp ? '▲' : '▼'} {stock.currency === 'USD' ? `$${Math.abs(stock.change).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${Math.abs(stock.change).toLocaleString()}원`}
                </span>
                <PriceBadge change={stock.change} changePercent={stock.changePercent} size="lg" />
              </div>
            </div>
          </div>

          {/* Quick Real-time & Operating Status Tags */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs font-mono self-start lg:self-center">
            {/* Market Status (KRX or US Session) */}
            {stock.market === 'US' ? (
              <div 
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-sans font-bold shadow-sm bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30"
                title="미국 정규장 23:30 ~ 익일 06:00 (한국 시간 KST 기준)"
              >
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span>미국 나스닥/NYSE {stock.delayLabel || '15분 지연 시세'}</span>
              </div>
            ) : (
              <div 
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-sans font-bold shadow-sm ${
                  marketStatus.isOpen
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300/60 dark:border-slate-700'
                }`}
                title={`한국 시간(KST) ${marketStatus.timeStringKST} (${marketStatus.detailLabel})`}
              >
                <span className={`w-2 h-2 rounded-full ${
                  marketStatus.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`} />
                <span>{marketStatus.statusLabel}</span>
              </div>
            )}

            {/* API 연동 뱃지 */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-sans font-semibold ${
              stock.market === 'US' 
                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${stock.market === 'US' ? 'bg-purple-500' : 'bg-blue-500'}`}></span>
              <span>{stock.market === 'US' ? '글로벌 공식 시세 (USD)' : '키움 실전 API'}</span>
            </div>
            {stock.lastUpdated && (
              <span className="text-[11px] text-slate-400 font-sans">
                {stock.lastUpdated} 갱신
              </span>
            )}
          </div>
        </div>

        {/* 13 Key Price & Trading Statistics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4 text-xs font-mono">
          {/* 7. 시가 (Open) */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
            <span className="text-slate-400 font-sans text-[11px] block mb-1">시가</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">
              {stock.currency === 'USD' ? `$${stock.openPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${stock.openPrice.toLocaleString()}원`}
            </span>
          </div>

          {/* 8. 고가 (High) */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
            <span className="text-slate-400 font-sans text-[11px] block mb-1">고가</span>
            <span className="font-bold text-rose-500 text-sm">
              {stock.currency === 'USD' ? `$${stock.highPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${stock.highPrice.toLocaleString()}원`}
            </span>
          </div>

          {/* 9. 저가 (Low) */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
            <span className="text-slate-400 font-sans text-[11px] block mb-1">저가</span>
            <span className="font-bold text-blue-500 text-sm">
              {stock.currency === 'USD' ? `$${stock.lowPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${stock.lowPrice.toLocaleString()}원`}
            </span>
          </div>

          {/* 10. 거래량 (Volume) */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
            <span className="text-slate-400 font-sans text-[11px] block mb-1">거래량</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">
              {stock.volume.toLocaleString()}주
            </span>
          </div>

          {/* 11. 거래대금 (Trading Value) */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
            <span className="text-slate-400 font-sans text-[11px] block mb-1">거래대금</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">
              {stock.currency === 'USD'
                ? `$${stock.tradingValue.toLocaleString()}M`
                : (stock.tradingValue >= 10000
                  ? `${(stock.tradingValue / 10000).toFixed(1)}조`
                  : `${stock.tradingValue.toLocaleString()}억`)}
            </span>
          </div>

          {/* 12. 52주 최고가 */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
            <span className="text-slate-400 font-sans text-[11px] block mb-1">52주 최고</span>
            <span className="font-bold text-rose-500 text-sm">
              {stock.currency === 'USD' ? `$${stock.high52w.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${stock.high52w.toLocaleString()}원`}
            </span>
          </div>

          {/* 13. 52주 최저가 */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80">
            <span className="text-slate-400 font-sans text-[11px] block mb-1">52주 최저</span>
            <span className="font-bold text-blue-500 text-sm">
              {stock.currency === 'USD' ? `$${stock.low52w.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `${stock.low52w.toLocaleString()}원`}
            </span>
          </div>
        </div>
      </div>

      {/* Main Chart Area & 10-Level Orderbook Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Interactive Candlestick / Line Chart (Periods: 1D, 1W, 1M, 3M, 6M, 1Y) */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-rose-500" />
              <span>{stock.market === 'US' ? '미국 주식 시세 차트' : '실시간 주가 차트'}</span>
            </h3>
            <span className="text-xs text-slate-400">
              {stock.market === 'US' ? '글로벌 공식 일봉 차트 (USD)' : '키움 Open API 실전 차트 (1분·5분·15분·30분·1시간·일봉)'}
            </span>
          </div>

          <InteractiveStockChart
            symbol={stock.symbol}
            candles={stock.candles}
            stockPrice={stock.price}
            prevClose={stock.prevClose}
            currency={stock.currency}
          />
        </div>

        {/* Right 1 Col: 10-Level Order Book (호가창) */}
        <div className="h-full">
          <OrderBookWidget stock={stock} />
        </div>
      </div>

      {/* Valuation & Market Cap Metrics Card */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm">
        <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-3">
          기업 가치평가 및 배당 정보
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs font-mono">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <span className="text-slate-400 font-sans text-[11px] block">시가총액</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">
              {stock.marketCap >= 10000
                ? `${(stock.marketCap / 10000).toFixed(1)}조 원`
                : `${stock.marketCap.toLocaleString()}억 원`}
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <span className="text-slate-400 font-sans text-[11px] block">PER</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">{stock.per}배</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <span className="text-slate-400 font-sans text-[11px] block">PBR</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">{stock.pbr}배</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <span className="text-slate-400 font-sans text-[11px] block">EPS</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">{stock.eps.toLocaleString()}원</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <span className="text-slate-400 font-sans text-[11px] block">배당수익률</span>
            <span className="font-bold text-emerald-500 text-sm">{stock.dividendYield}%</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <span className="text-slate-400 font-sans text-[11px] block">전일 종가</span>
            <span className="font-bold text-slate-900 dark:text-white text-sm">{stock.prevClose.toLocaleString()}원</span>
          </div>
        </div>
      </div>

      {/* Bottom Sections in specified order: Volume -> Related News -> Community -> Alerts -> AI Briefing */}
      <div className="space-y-6">
        {/* 1. 거래량 정보 및 투자자별 매매동향 */}
        <StockVolumeSection stock={stock} />

        {/* 2. 관련 뉴스 & 언론 보도 (Requirement 7: 차트 -> 거래량 아래에 관련 뉴스) */}
        <StockNewsSection stock={stock} />

        {/* 3. 관련 커뮤니티 게시글 및 종목 토론 */}
        <StockCommunitySection stock={stock} />

        {/* 4. 맞춤 감지 스마트 알림 구독 위젯 */}
        <StockSmartAlertWidget stock={stock} />

        {/* 5. AI 실시간 스마트 브리핑 */}
        <StockAiBriefingWidget stock={stock} />
      </div>

      {/* Price Alert Modal */}
      {isAlertModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="w-full max-w-md bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  목표 주가 알림 설정
                </h3>
              </div>
              <button
                onClick={() => setIsAlertModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAlert} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  종목
                </label>
                <input
                  type="text"
                  disabled
                  value={`${stock.name} (${stock.symbol})`}
                  className="w-full px-3.5 py-2 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  목표 도달 가격 (원)
                </label>
                <input
                  type="number"
                  required
                  min={100}
                  step={50}
                  value={targetAlertPrice}
                  onChange={e => setTargetAlertPrice(Number(e.target.value))}
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white font-mono"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  현재가 {stock.price.toLocaleString()}원 기준{' '}
                  {targetAlertPrice >= stock.price ? '이상 돌파 시' : '이하 하락 시'} 발송됩니다.
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  메모 (선택)
                </label>
                <input
                  type="text"
                  value={alertNote}
                  onChange={e => setAlertNote(e.target.value)}
                  placeholder="예: 지지선 이탈 시 전량 손절 대응"
                  className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAlertModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20"
                >
                  알림 등록하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Mock Trade Modal */}
      <MockTradeModal
        isOpen={isTradeModalOpen}
        onClose={() => setIsTradeModalOpen(false)}
        symbol={stock.symbol}
        stockName={stock.name}
        defaultPrice={stock.price}
        initialType="BUY"
      />

      {/* Virtual Holding Modal */}
      <VirtualHoldingModal
        isOpen={isHoldingModalOpen}
        onClose={() => setIsHoldingModalOpen(false)}
        mode="create"
        defaultSymbol={stock.symbol}
        onSuccess={() => {}}
      />
    </div>
  );
};
