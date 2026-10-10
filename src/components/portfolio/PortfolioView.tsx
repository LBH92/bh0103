import React, { useState, useEffect, useMemo } from 'react';
import {
  Briefcase,
  TrendingUp,
  TrendingDown,
  Plus,
  RefreshCw,
  Sliders,
  RotateCcw,
  AlertTriangle,
  Info,
  Calendar,
  History,
  Trash2,
  Edit2,
  Check,
  ChevronRight,
  ShieldAlert,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  VirtualHolding,
  VirtualHoldingTrade,
  MockAccount,
  MockPosition,
  MockOrder,
  Stock
} from '../../types';
import { portfolioService } from '../../services/portfolioService';
import { VirtualHoldingModal } from './VirtualHoldingModal';
import { MockTradeModal } from './MockTradeModal';
import { FeeSettingsModal } from './FeeSettingsModal';
import { stockRepository } from '../../services/stockRepository';

export const PortfolioView: React.FC = () => {
  const { user, isAuthenticated, showToast, exchangeRate, stocks, navigateToStock, setActiveTab } = useApp();

  const [mainTab, setMainTab] = useState<'virtual' | 'mock'>('virtual');

  // Virtual Holdings State
  const [virtualHoldings, setVirtualHoldings] = useState<VirtualHolding[]>([]);
  const [virtualTrades, setVirtualTrades] = useState<VirtualHoldingTrade[]>([]);
  const [holdingModalOpen, setHoldingModalOpen] = useState<boolean>(false);
  const [holdingModalMode, setHoldingModalMode] = useState<'create' | 'add_buy' | 'sell' | 'edit'>('create');
  const [activeHolding, setActiveHolding] = useState<VirtualHolding | null>(null);

  // Mock Trading State
  const [mockAccount, setMockAccount] = useState<MockAccount | null>(null);
  const [mockPositions, setMockPositions] = useState<MockPosition[]>([]);
  const [mockOrders, setMockOrders] = useState<MockOrder[]>([]);
  const [feeModalOpen, setFeeModalOpen] = useState<boolean>(false);
  const [tradeModalOpen, setTradeModalOpen] = useState<boolean>(false);
  const [tradeModalSymbol, setTradeModalSymbol] = useState<string>('005930');
  const [tradeModalType, setTradeModalType] = useState<'BUY' | 'SELL'>('BUY');

  // Loading & Live Quote Cache
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [quotesMap, setQuotesMap] = useState<Map<string, {
    price: number;
    change: number;
    changePercent: number;
    currency: 'KRW' | 'USD';
    delayLabel: string;
    status: 'ok' | 'delayed' | 'error';
    asOf: string;
  }>>(new Map());

  // Load all data
  const loadData = async () => {
    try {
      const [vHoldings, vTrades, mAccount, mPositions, mOrders] = await Promise.all([
        portfolioService.getVirtualHoldings(user?.id),
        portfolioService.getVirtualHoldingTrades(user?.id),
        portfolioService.getMockAccount(user?.id),
        portfolioService.getMockPositions(user?.id),
        portfolioService.getMockOrders(user?.id),
      ]);

      setVirtualHoldings(vHoldings);
      setVirtualTrades(vTrades);
      setMockAccount(mAccount);
      setMockPositions(mPositions);
      setMockOrders(mOrders);

      // Fetch quotes for all symbols in holdings & positions
      const allSymbols = Array.from(new Set([
        ...vHoldings.map(h => h.symbol),
        ...mPositions.map(p => p.symbol),
      ]));

      if (allSymbols.length > 0) {
        const newMap = new Map();
        await Promise.all(
          allSymbols.map(async sym => {
            const q = await portfolioService.resolveQuote(sym);
            if (q) {
              newMap.set(sym, q);
            }
          })
        );
        setQuotesMap(newMap);
      }
    } catch (err) {
      console.warn('[PortfolioView] loadData error:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    showToast('보유 종목 시세 및 자산 현황을 갱신했습니다.', 'info');
  };

  // ==========================================
  // Virtual Holdings Calculations
  // ==========================================
  const virtualMetrics = useMemo(() => {
    let totalCostKRW = 0;
    let totalValuationKRW = 0;
    let totalRealizedProfitKRW = 0;
    const currentRate = exchangeRate?.rate || 1400;

    for (const h of virtualHoldings) {
      const quote = quotesMap.get(h.symbol);
      const isUSD = h.currency === 'USD';
      const costKRW = isUSD ? h.totalBuyAmount * currentRate : h.totalBuyAmount;
      totalCostKRW += costKRW;

      if (quote && quote.price > 0) {
        const val = quote.price * h.quantity;
        const valKRW = quote.currency === 'USD' ? val * currentRate : val;
        totalValuationKRW += valKRW;
      } else {
        // Fallback to cost if quote is pending
        totalValuationKRW += costKRW;
      }
    }

    for (const t of virtualTrades) {
      if (t.tradeType === 'SELL' && t.realizedProfit !== undefined) {
        totalRealizedProfitKRW += t.realizedProfit;
      }
    }

    const unrealizedProfitKRW = totalValuationKRW - totalCostKRW;
    const returnRatePercent = totalCostKRW > 0 ? (unrealizedProfitKRW / totalCostKRW) * 100 : 0;

    return {
      totalCostKRW,
      totalValuationKRW,
      unrealizedProfitKRW,
      returnRatePercent,
      totalRealizedProfitKRW,
      count: virtualHoldings.length,
    };
  }, [virtualHoldings, virtualTrades, quotesMap, exchangeRate?.rate]);

  // ==========================================
  // Mock Trading Calculations
  // ==========================================
  const mockMetrics = useMemo(() => {
    const cash = mockAccount?.currentCash ?? 100000000;
    const initial = mockAccount?.initialBalance ?? 100000000;
    let totalInvestedKRW = 0;
    let totalValuationKRW = 0;
    const currentRate = exchangeRate?.rate || 1400;

    for (const p of mockPositions) {
      const quote = quotesMap.get(p.symbol);
      const isUSD = p.currency === 'USD';
      const costKRW = isUSD ? p.totalInvested * currentRate : p.totalInvested;
      totalInvestedKRW += costKRW;

      if (quote && quote.price > 0) {
        const val = quote.price * p.quantity;
        const valKRW = quote.currency === 'USD' ? val * currentRate : val;
        totalValuationKRW += valKRW;
      } else {
        totalValuationKRW += costKRW;
      }
    }

    let totalRealizedProfitKRW = 0;
    for (const o of mockOrders) {
      if (o.orderType === 'SELL' && o.realizedProfit !== undefined) {
        totalRealizedProfitKRW += o.realizedProfit;
      }
    }

    const unrealizedProfitKRW = totalValuationKRW - totalInvestedKRW;
    const totalAssetsKRW = cash + totalValuationKRW;
    const totalReturnRatePercent = initial > 0 ? ((totalAssetsKRW - initial) / initial) * 100 : 0;

    return {
      cash,
      initial,
      totalInvestedKRW,
      totalValuationKRW,
      unrealizedProfitKRW,
      totalRealizedProfitKRW,
      totalAssetsKRW,
      totalReturnRatePercent,
      positionCount: mockPositions.length,
    };
  }, [mockAccount, mockPositions, mockOrders, quotesMap, exchangeRate?.rate]);

  const handleResetMockAccount = async () => {
    if (!window.confirm('가상 모의투자 계좌를 초기 자금(1억 원)으로 리셋하시겠습니까?\n모든 보유 종목과 주문 내역이 초기화됩니다.')) {
      return;
    }
    try {
      const newAcc = await portfolioService.resetMockAccount(user?.id);
      setMockAccount(newAcc);
      setMockPositions([]);
      setMockOrders([]);
      showToast('모의투자 계좌가 1억 원으로 초기화되었습니다.', 'info');
    } catch (err: any) {
      showToast('계좌 초기화 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleDeleteVirtualHolding = async (holdingId: string, name: string) => {
    if (!window.confirm(`'${name}' 가상 보유 기록을 삭제하시겠습니까?`)) return;
    try {
      await portfolioService.deleteVirtualHolding(user?.id, holdingId);
      setVirtualHoldings(prev => prev.filter(h => h.id !== holdingId));
      showToast(`'${name}' 보유 기록이 삭제되었습니다.`, 'info');
    } catch (err) {
      showToast('삭제 처리 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleOpenTradeForStock = (symbol: string, type: 'BUY' | 'SELL' = 'BUY') => {
    setTradeModalSymbol(symbol);
    setTradeModalType(type);
    setTradeModalOpen(true);
  };

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-200">
      {/* Top Header Card & Main Tab Switcher */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-500">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                  가상 보유 관리 & 모의투자
                </h1>
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-500/10 text-rose-500">
                  SIMULATOR
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                직접 입력 가상 포트폴리오 관리와 실시간 시세 기반 모의 트레이딩을 안전하게 진행하세요.
              </p>
            </div>
          </div>

          {/* Action buttons: Refresh & Settings */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title="시세 갱신"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-rose-500' : ''}`} />
              <span className="hidden sm:inline">시세 갱신</span>
            </button>

            {mainTab === 'mock' && (
              <button
                onClick={() => setFeeModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Sliders className="w-3.5 h-3.5 text-rose-500" />
                <span>수수료·세금 설정</span>
              </button>
            )}
          </div>
        </div>

        {/* Top 2 Primary Tabs */}
        <div className="flex items-center gap-2 mt-5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
          <button
            onClick={() => setMainTab('virtual')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              mainTab === 'virtual'
                ? 'bg-white dark:bg-[#131722] text-rose-600 dark:text-rose-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>가상 보유 내역 기록</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-500 font-mono">
              {virtualHoldings.length}
            </span>
          </button>

          <button
            onClick={() => setMainTab('mock')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
              mainTab === 'mock'
                ? 'bg-white dark:bg-[#131722] text-rose-600 dark:text-rose-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>실전 모의 투자 (가상 자금)</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-500 font-mono">
              {mockPositions.length}
            </span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 1. 가상 보유 내역 탭 (Virtual Holdings Tab) */}
      {/* ============================================================== */}
      {mainTab === 'virtual' && (
        <div className="space-y-6">
          {/* Statutory Clear Disclaimer Alert */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-sm block">
                ⚠️ [가상 보유 내역 안내 및 구분 고지]
              </span>
              <p className="leading-relaxed">
                본 화면은 <strong>실제 증권사 실계좌와 연결되지 않은 사용자 직접 입력 가상 포트폴리오</strong>입니다.
                보유 종목, 매수가, 수량을 직접 기록하여 현재가 연동 평가손익과 추가 매수 평균단가, 매도 시 실현손익을 분석하는 목적입니다.
              </p>
            </div>
          </div>

          {/* Virtual Metrics Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] text-slate-400 font-sans block mb-1">총 평가금액</span>
              <span className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white">
                {virtualMetrics.totalValuationKRW.toLocaleString()}원
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] text-slate-400 font-sans block mb-1">총 매입금액</span>
              <span className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white">
                {virtualMetrics.totalCostKRW.toLocaleString()}원
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] text-slate-400 font-sans block mb-1">평가손익 (수익률)</span>
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className={`text-base sm:text-lg font-black font-mono ${
                  virtualMetrics.unrealizedProfitKRW >= 0 ? 'text-rose-500' : 'text-blue-500'
                }`}>
                  {virtualMetrics.unrealizedProfitKRW >= 0 ? '+' : ''}
                  {virtualMetrics.unrealizedProfitKRW.toLocaleString()}원
                </span>
                <span className={`text-xs font-bold font-mono ${
                  virtualMetrics.returnRatePercent >= 0 ? 'text-rose-500' : 'text-blue-500'
                }`}>
                  ({virtualMetrics.returnRatePercent >= 0 ? '+' : ''}{virtualMetrics.returnRatePercent.toFixed(2)}%)
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] text-slate-400 font-sans block mb-1">누적 실현손익</span>
              <span className={`text-base sm:text-lg font-black font-mono ${
                virtualMetrics.totalRealizedProfitKRW >= 0 ? 'text-rose-500' : 'text-blue-500'
              }`}>
                {virtualMetrics.totalRealizedProfitKRW >= 0 ? '+' : ''}
                {virtualMetrics.totalRealizedProfitKRW.toLocaleString()}원
              </span>
            </div>

            <div className="col-span-2 lg:col-span-1 p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between lg:flex-col lg:items-start lg:justify-center">
              <div>
                <span className="text-[11px] text-slate-400 font-sans block mb-1">보유 종목 수</span>
                <span className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white">
                  {virtualMetrics.count}개 종목
                </span>
              </div>
              <button
                onClick={() => {
                  setActiveHolding(null);
                  setHoldingModalMode('create');
                  setHoldingModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-600/20 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>종목 추가 등록</span>
              </button>
            </div>
          </div>

          {/* Virtual Holdings Table / Card List */}
          <div className="rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-rose-500" />
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  가상 보유 종목 목록
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                기준 환율: {exchangeRate?.rate ? `${exchangeRate.rate.toFixed(2)}원/달러` : '1,400원'}
              </span>
            </div>

            {virtualHoldings.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center">
                  <Briefcase className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                  등록된 가상 보유 종목이 없습니다.
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  실제 보유 중인 국내/해외 주식을 등록하여 실시간 손익과 분할 매수 평단가를 체계적으로 계산해보세요.
                </p>
                <button
                  onClick={() => {
                    setActiveHolding(null);
                    setHoldingModalMode('create');
                    setHoldingModalOpen(true);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>첫 종목 등록하기</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/50 text-[11px] text-slate-500 dark:text-slate-400 uppercase">
                      <th className="py-3 px-4 font-semibold">종목명 / 코드</th>
                      <th className="py-3 px-3 font-semibold text-right">보유수량</th>
                      <th className="py-3 px-3 font-semibold text-right">평균 매입단가</th>
                      <th className="py-3 px-3 font-semibold text-right">현재가 (시세상태)</th>
                      <th className="py-3 px-3 font-semibold text-right">평가금액</th>
                      <th className="py-3 px-3 font-semibold text-right">평가손익 (수익률)</th>
                      <th className="py-3 px-4 font-semibold text-center">관리 액션</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {virtualHoldings.map(h => {
                      const quote = quotesMap.get(h.symbol);
                      const isUSD = h.currency === 'USD';
                      const currentRate = exchangeRate?.rate || 1400;

                      // Price & P&L calculations
                      const curPrice = quote?.price ?? 0;
                      const hasQuote = curPrice > 0;
                      const valuation = hasQuote ? curPrice * h.quantity : h.totalBuyAmount;
                      const profit = hasQuote ? (curPrice - h.avgBuyPrice) * h.quantity : 0;
                      const returnPct = h.avgBuyPrice > 0 && hasQuote ? ((curPrice - h.avgBuyPrice) / h.avgBuyPrice) * 100 : 0;

                      return (
                        <tr key={h.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="py-3.5 px-4 font-sans">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => navigateToStock(h.symbol)}
                                className="font-bold text-slate-900 dark:text-white hover:text-rose-500 text-left transition-colors flex items-center gap-1 group"
                              >
                                <span>{h.name}</span>
                                <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-rose-500" />
                              </button>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                                {h.symbol}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold font-mono bg-rose-500/10 text-rose-500">
                                {h.market}
                              </span>
                            </div>
                            {h.memo && (
                              <span className="text-[11px] text-slate-400 block mt-0.5 line-clamp-1">
                                💬 {h.memo}
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                            {h.quantity.toLocaleString()}주
                          </td>

                          <td className="py-3.5 px-3 text-right">
                            <span className="text-slate-900 dark:text-white font-semibold">
                              {isUSD ? `$${h.avgBuyPrice.toFixed(2)}` : `${h.avgBuyPrice.toLocaleString()}원`}
                            </span>
                            {isUSD && (
                              <span className="text-[10px] text-slate-400 block">
                                ≈ {Math.round(h.avgBuyPrice * currentRate).toLocaleString()}원
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-3 text-right">
                            {quote && quote.price > 0 ? (
                              <>
                                <span className="font-bold text-slate-900 dark:text-white block">
                                  {isUSD ? `$${curPrice.toFixed(2)}` : `${curPrice.toLocaleString()}원`}
                                </span>
                                <span className={`text-[10px] block ${quote.delayLabel.includes('실시간') ? 'text-emerald-500' : 'text-slate-400'}`}>
                                  {quote.delayLabel} ({quote.asOf})
                                </span>
                              </>
                            ) : (
                              <span className="text-[11px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded font-sans">
                                시세 확인 중
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                            {isUSD ? (
                              <>
                                <span>${valuation.toFixed(2)}</span>
                                <span className="text-[10px] text-slate-400 block font-normal">
                                  ≈ {Math.round(valuation * currentRate).toLocaleString()}원
                                </span>
                              </>
                            ) : (
                              `${valuation.toLocaleString()}원`
                            )}
                          </td>

                          <td className="py-3.5 px-3 text-right">
                            {hasQuote ? (
                              <div className={profit >= 0 ? 'text-rose-500 font-bold' : 'text-blue-500 font-bold'}>
                                <span>
                                  {profit >= 0 ? '+' : ''}
                                  {isUSD ? `$${profit.toFixed(2)}` : `${profit.toLocaleString()}원`}
                                </span>
                                <span className="text-[11px] block">
                                  ({profit >= 0 ? '+' : ''}{returnPct.toFixed(2)}%)
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 font-sans">
                              {/* 추가 매수 버튼 */}
                              <button
                                onClick={() => {
                                  setActiveHolding(h);
                                  setHoldingModalMode('add_buy');
                                  setHoldingModalOpen(true);
                                }}
                                className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold transition-colors"
                                title="추가 매수 기록 및 평단가 재계산"
                              >
                                +추가매수
                              </button>

                              {/* 매도 기록 버튼 */}
                              <button
                                onClick={() => {
                                  setActiveHolding(h);
                                  setHoldingModalMode('sell');
                                  setHoldingModalOpen(true);
                                }}
                                className="px-2 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-[11px] font-bold transition-colors"
                                title="매도 기록 및 실현손익 확정"
                              >
                                매도기록
                              </button>

                              {/* 수정 버튼 */}
                              <button
                                onClick={() => {
                                  setActiveHolding(h);
                                  setHoldingModalMode('edit');
                                  setHoldingModalOpen(true);
                                }}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                                title="수정"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* 삭제 버튼 */}
                              <button
                                onClick={() => handleDeleteVirtualHolding(h.id, h.name)}
                                className="p-1 rounded-lg text-slate-400 hover:text-rose-500"
                                title="삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Virtual Holding Trades History (매수 / 추가매수 / 매도 내역) */}
          <div className="rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-blue-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  가상 포트폴리오 거래 및 매도 실현 내역
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                총 {virtualTrades.length}건
              </span>
            </div>

            {virtualTrades.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                기록된 거래 내역이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-[11px] text-slate-500 uppercase">
                      <th className="py-2.5 px-4 font-semibold">거래일자</th>
                      <th className="py-2.5 px-3 font-semibold">구분</th>
                      <th className="py-2.5 px-3 font-semibold">종목명</th>
                      <th className="py-2.5 px-3 font-semibold text-right">체결단가</th>
                      <th className="py-2.5 px-3 font-semibold text-right">수량</th>
                      <th className="py-2.5 px-3 font-semibold text-right">거래총액</th>
                      <th className="py-2.5 px-3 font-semibold text-right">실현손익</th>
                      <th className="py-2.5 px-4 font-semibold">메모 / 사유</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {virtualTrades.map(t => {
                      const isSell = t.tradeType === 'SELL';
                      const isAdd = t.tradeType === 'ADD_BUY';

                      return (
                        <tr key={t.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20">
                          <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                            {t.tradeDate}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isSell
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                : isAdd
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/10 text-rose-500'
                            }`}>
                              {isSell ? '매도' : isAdd ? '추가매수' : '최초매수'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-sans font-bold text-slate-900 dark:text-white">
                            {t.name}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {t.price.toLocaleString()}원
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold">
                            {t.quantity.toLocaleString()}주
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {t.totalAmount.toLocaleString()}원
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {isSell && t.realizedProfit !== undefined ? (
                              <span className={t.realizedProfit >= 0 ? 'text-rose-500 font-bold' : 'text-blue-500 font-bold'}>
                                {t.realizedProfit >= 0 ? '+' : ''}{t.realizedProfit.toLocaleString()}원
                                <span className="text-[10px] block">
                                  ({t.realizedProfitRate && t.realizedProfitRate >= 0 ? '+' : ''}{t.realizedProfitRate?.toFixed(2)}%)
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-sans text-slate-500 text-[11px] truncate max-w-xs">
                            {t.memo || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. 모의 투자 탭 (Mock Paper Trading Tab) */}
      {/* ============================================================== */}
      {mainTab === 'mock' && (
        <div className="space-y-6">
          {/* Mock Trading Simulator Banner */}
          <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3 text-xs text-blue-800 dark:text-blue-300">
            <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-sm block">
                🎮 [실시간 가상 자금 모의 트레이딩 시뮬레이터]
              </span>
              <p className="leading-relaxed">
                실제 증권 거래나 금융 비용 청구 없이, <strong>초기 가상 자금 1억 원</strong>으로 실시간 키움 API 및 글로벌 시세 데이터를 활용해 매수·매도 주문을 체결하고 수익률을 시험해보는 공간입니다.
              </p>
            </div>
          </div>

          {/* Account Metrics Bar */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3.5">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] text-slate-400 font-sans block mb-1">총 평가자산</span>
              <span className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white">
                {mockMetrics.totalAssetsKRW.toLocaleString()}원
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] text-slate-400 font-sans block mb-1">보유 현금 (예수금)</span>
              <span className="text-base sm:text-lg font-black font-mono text-emerald-600 dark:text-emerald-400">
                {mockMetrics.cash.toLocaleString()}원
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] text-slate-400 font-sans block mb-1">주식 평가금액</span>
              <span className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white">
                {mockMetrics.totalValuationKRW.toLocaleString()}원
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] text-slate-400 font-sans block mb-1">평가손익</span>
              <span className={`text-base sm:text-lg font-black font-mono ${
                mockMetrics.unrealizedProfitKRW >= 0 ? 'text-rose-500' : 'text-blue-500'
              }`}>
                {mockMetrics.unrealizedProfitKRW >= 0 ? '+' : ''}
                {mockMetrics.unrealizedProfitKRW.toLocaleString()}원
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-[11px] text-slate-400 font-sans block mb-1">총 누적수익률</span>
              <span className={`text-base sm:text-lg font-black font-mono ${
                mockMetrics.totalReturnRatePercent >= 0 ? 'text-rose-500' : 'text-blue-500'
              }`}>
                {mockMetrics.totalReturnRatePercent >= 0 ? '+' : ''}
                {mockMetrics.totalReturnRatePercent.toFixed(2)}%
              </span>
            </div>

            <div className="col-span-2 lg:col-span-1 p-3 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between lg:flex-col lg:justify-center gap-2">
              <button
                onClick={() => handleOpenTradeForStock('005930', 'BUY')}
                className="w-full py-2 px-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-600/20 flex items-center justify-center gap-1.5 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>새 모의 주문</span>
              </button>
              <button
                onClick={handleResetMockAccount}
                className="w-full py-1.5 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors flex items-center justify-center gap-1"
                title="1억 원으로 초기화"
              >
                <RotateCcw className="w-3 h-3" />
                <span>계좌 초기화</span>
              </button>
            </div>
          </div>

          {/* Mock Holdings Table */}
          <div className="rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-rose-500" />
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  모의투자 보유 종목 포지션
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                수수료: {((mockAccount?.commissionRate ?? 0.00015) * 100).toFixed(3)}% | 거래세: {((mockAccount?.taxRate ?? 0.0018) * 100).toFixed(2)}%
              </span>
            </div>

            {mockPositions.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 mx-auto flex items-center justify-center">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">
                  현재 체결된 모의 보유 종목이 없습니다.
                </h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  종목 상세, 관심종목, 검색창에서 즉시 가상 매수를 실행해보세요.
                </p>
                <button
                  onClick={() => handleOpenTradeForStock('005930', 'BUY')}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 inline-flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>삼성전자 모의 매수해보기</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/50 text-[11px] text-slate-500 uppercase">
                      <th className="py-3 px-4 font-semibold">종목명 / 코드</th>
                      <th className="py-3 px-3 font-semibold text-right">보유수량</th>
                      <th className="py-3 px-3 font-semibold text-right">평균 매입단가</th>
                      <th className="py-3 px-3 font-semibold text-right">현재가 (시세상태)</th>
                      <th className="py-3 px-3 font-semibold text-right">평가금액</th>
                      <th className="py-3 px-3 font-semibold text-right">평가손익 (수익률)</th>
                      <th className="py-3 px-4 font-semibold text-center">주문 실행</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {mockPositions.map(p => {
                      const quote = quotesMap.get(p.symbol);
                      const curPrice = quote?.price ?? 0;
                      const hasQuote = curPrice > 0;
                      const valuation = hasQuote ? curPrice * p.quantity : p.totalInvested;
                      const profit = hasQuote ? (curPrice - p.avgBuyPrice) * p.quantity : 0;
                      const returnPct = p.avgBuyPrice > 0 && hasQuote ? ((curPrice - p.avgBuyPrice) / p.avgBuyPrice) * 100 : 0;

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="py-3.5 px-4 font-sans">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => navigateToStock(p.symbol)}
                                className="font-bold text-slate-900 dark:text-white hover:text-rose-500 text-left transition-colors flex items-center gap-1 group"
                              >
                                <span>{p.name}</span>
                                <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-rose-500" />
                              </button>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                                {p.symbol}
                              </span>
                            </div>
                          </td>

                          <td className="py-3.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                            {p.quantity.toLocaleString()}주
                          </td>

                          <td className="py-3.5 px-3 text-right font-semibold text-slate-900 dark:text-white">
                            {p.avgBuyPrice.toLocaleString()}원
                          </td>

                          <td className="py-3.5 px-3 text-right">
                            {quote && quote.price > 0 ? (
                              <>
                                <span className="font-bold text-slate-900 dark:text-white block">
                                  {curPrice.toLocaleString()}원
                                </span>
                                <span className="text-[10px] text-slate-400 block">
                                  {quote.delayLabel}
                                </span>
                              </>
                            ) : (
                              <span className="text-amber-500 text-[11px]">확인 중</span>
                            )}
                          </td>

                          <td className="py-3.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                            {valuation.toLocaleString()}원
                          </td>

                          <td className="py-3.5 px-3 text-right">
                            {hasQuote ? (
                              <div className={profit >= 0 ? 'text-rose-500 font-bold' : 'text-blue-500 font-bold'}>
                                <span>{profit >= 0 ? '+' : ''}{profit.toLocaleString()}원</span>
                                <span className="text-[11px] block">
                                  ({profit >= 0 ? '+' : ''}{returnPct.toFixed(2)}%)
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          <td className="py-3.5 px-4 text-center font-sans">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenTradeForStock(p.symbol, 'BUY')}
                                className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-[11px] font-bold transition-colors"
                              >
                                추가 매수
                              </button>
                              <button
                                onClick={() => handleOpenTradeForStock(p.symbol, 'SELL')}
                                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-colors shadow-sm"
                              >
                                가상 매도
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Mock Orders History */}
          <div className="rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-rose-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  모의 주문 체결 내역
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                총 {mockOrders.length}건
              </span>
            </div>

            {mockOrders.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                체결된 모의 주문 내역이 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-[11px] text-slate-500 uppercase">
                      <th className="py-2.5 px-4 font-semibold">체결일시</th>
                      <th className="py-2.5 px-3 font-semibold">구분</th>
                      <th className="py-2.5 px-3 font-semibold">종목명</th>
                      <th className="py-2.5 px-3 font-semibold text-right">체결단가</th>
                      <th className="py-2.5 px-3 font-semibold text-right">체결수량</th>
                      <th className="py-2.5 px-3 font-semibold text-right">정산금액</th>
                      <th className="py-2.5 px-3 font-semibold text-right">실현손익</th>
                      <th className="py-2.5 px-4 font-semibold">매매 전략/사유</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                    {mockOrders.map(o => {
                      const isSell = o.orderType === 'SELL';

                      return (
                        <tr key={o.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/20">
                          <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                            {new Date(o.executedAt).toLocaleString('ko-KR')}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isSell
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                : 'bg-rose-500/10 text-rose-500'
                            }`}>
                              {isSell ? '가상 매도' : '가상 매수'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-sans font-bold text-slate-900 dark:text-white">
                            {o.name}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {o.price.toLocaleString()}원
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold">
                            {o.quantity.toLocaleString()}주
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {o.settledAmount.toLocaleString()}원
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {isSell && o.realizedProfit !== undefined ? (
                              <span className={o.realizedProfit >= 0 ? 'text-rose-500 font-bold' : 'text-blue-500 font-bold'}>
                                {o.realizedProfit >= 0 ? '+' : ''}{o.realizedProfit.toLocaleString()}원
                                <span className="text-[10px] block">
                                  ({o.realizedProfitRate && o.realizedProfitRate >= 0 ? '+' : ''}{o.realizedProfitRate?.toFixed(2)}%)
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 font-sans text-slate-500 text-[11px] truncate max-w-xs">
                            {o.reason || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* Modals */}
      {/* ============================================================== */}
      <VirtualHoldingModal
        isOpen={holdingModalOpen}
        onClose={() => setHoldingModalOpen(false)}
        mode={holdingModalMode}
        holding={activeHolding}
        onSuccess={loadData}
        uid={user?.id}
      />

      <MockTradeModal
        isOpen={tradeModalOpen}
        onClose={() => setTradeModalOpen(false)}
        symbol={tradeModalSymbol}
        initialType={tradeModalType}
        onTradeSuccess={loadData}
      />

      <FeeSettingsModal
        isOpen={feeModalOpen}
        onClose={() => setFeeModalOpen(false)}
        currentCommissionPercent={(mockAccount?.commissionRate ?? 0.00015) * 100}
        currentTaxPercent={(mockAccount?.taxRate ?? 0.0018) * 100}
        onSave={async (c, t) => {
          const updated = await portfolioService.updateFeeSettings(user?.id, c, t);
          setMockAccount(updated);
          showToast(`수수료율(${c}%)과 거래세율(${t}%)이 적용되었습니다.`, 'success');
        }}
      />
    </div>
  );
};
