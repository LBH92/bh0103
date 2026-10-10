import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  Check,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Info,
  Calendar,
  Layers,
  Sliders,
  Save,
  Trash2,
  Bookmark,
  ChevronRight,
  ArrowRight,
  Sparkles,
  Compass,
  History
} from 'lucide-react';
import { CandleData, Stock, HistoricalSimulationRecord, HistoricalSimulationScenario } from '../../types';
import { historicalSimulationService } from '../../services/historicalSimulationService';
import { portfolioService } from '../../services/portfolioService';
import { useApp } from '../../context/AppContext';

interface HistoricalTradingSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  stockName: string;
  market?: string;
  candles?: CandleData[];
}

export const HistoricalTradingSimulatorModal: React.FC<HistoricalTradingSimulatorModalProps> = ({
  isOpen,
  onClose,
  symbol,
  stockName,
  market = 'KOSPI',
  candles: initialCandles = [],
}) => {
  const { user, showToast } = useApp();

  // Sub-tabs: 'simulate' | 'history'
  const [activeTab, setActiveTab] = useState<'simulate' | 'history'>('simulate');

  // Available candles state
  const [candles, setCandles] = useState<CandleData[]>([]);
  const [isLoadingCandles, setIsLoadingCandles] = useState<boolean>(false);

  // Simulation Parameters
  const [entryDateIndex, setEntryDateIndex] = useState<number>(0);
  const [buyPrice, setBuyPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('10');
  const [investmentBudget, setInvestmentBudget] = useState<string>('');
  const [targetRate, setTargetRate] = useState<string>('10'); // +10%
  const [stopLossRate, setStopLossRate] = useState<string>('-5'); // -5%
  const [notes, setNotes] = useState<string>('');

  // Replay Cursor (0 to candles.length - 1)
  // Look-ahead bias prevention: Only candles up to replayIndex are revealed!
  const [replayIndex, setReplayIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Manual exit point chosen during replay
  const [manualExitIndex, setManualExitIndex] = useState<number | null>(null);

  // Fee rates (pulled from mock account settings)
  const [commissionRate, setCommissionRate] = useState<number>(0.00015);
  const [taxRate, setTaxRate] = useState<number>(0.0018);

  // Saved simulations history
  const [savedSimulations, setSavedSimulations] = useState<HistoricalSimulationRecord[]>([]);

  // Load candles and fee settings
  useEffect(() => {
    if (isOpen) {
      setIsPlaying(false);
      setManualExitIndex(null);

      // Load fee settings
      portfolioService.getMockAccount(user?.id).then(acc => {
        if (acc) {
          setCommissionRate(acc.commissionRate || 0.00015);
          setTaxRate(acc.taxRate || 0.0018);
        }
      });

      // Load saved simulations
      historicalSimulationService.getSimulations(user?.id).then(setSavedSimulations);

      // Resolve candles
      if (initialCandles && initialCandles.length >= 5) {
        setCandles(initialCandles);
        // Default entry at roughly 1/3 of historical data
        const defaultEntry = Math.max(0, Math.floor(initialCandles.length * 0.3));
        setEntryDateIndex(defaultEntry);
        setReplayIndex(defaultEntry);
        setBuyPrice(String(initialCandles[defaultEntry].close));
      } else {
        setIsLoadingCandles(true);
        fetch(`/api/stocks/${symbol}/chart?period=day`)
          .then(res => res.json())
          .then(data => {
            if (data.candles && Array.isArray(data.candles) && data.candles.length > 0) {
              setCandles(data.candles);
              const defaultEntry = Math.max(0, Math.floor(data.candles.length * 0.3));
              setEntryDateIndex(defaultEntry);
              setReplayIndex(defaultEntry);
              setBuyPrice(String(data.candles[defaultEntry].close));
            }
          })
          .catch(err => {
            console.warn('[HistoricalSimulator] Fetch candles failed:', err);
          })
          .finally(() => setIsLoadingCandles(false));
      }
    }
  }, [isOpen, symbol, initialCandles, user?.id]);

  // Clean timer on unmount / close
  useEffect(() => {
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, []);

  // Sync buyPrice when entryDateIndex changes
  useEffect(() => {
    if (candles.length > 0 && entryDateIndex >= 0 && entryDateIndex < candles.length) {
      const candle = candles[entryDateIndex];
      setBuyPrice(String(candle.close));
      if (replayIndex < entryDateIndex) {
        setReplayIndex(entryDateIndex);
      }
      setManualExitIndex(null);
    }
  }, [entryDateIndex, candles]);

  // Calculate quantity from budget if budget changes
  const handleBudgetChange = (val: string) => {
    setInvestmentBudget(val);
    const numBudget = parseFloat(val);
    const numPrice = parseFloat(buyPrice);
    if (!isNaN(numBudget) && !isNaN(numPrice) && numPrice > 0) {
      const q = Math.floor(numBudget / numPrice);
      if (q > 0) setQuantity(String(q));
    }
  };

  // Replay playback controller
  const togglePlay = () => {
    if (isPlaying) {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      playTimerRef.current = setInterval(() => {
        setReplayIndex(prev => {
          if (prev >= candles.length - 1) {
            if (playTimerRef.current) clearInterval(playTimerRef.current);
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 700);
    }
  };

  const stepForward = () => {
    if (replayIndex < candles.length - 1) {
      setReplayIndex(prev => prev + 1);
    }
  };

  const stepBack = () => {
    if (replayIndex > entryDateIndex) {
      setReplayIndex(prev => prev - 1);
    }
  };

  if (!isOpen) return null;

  // Selected Entry & Replay Candle
  const entryCandle = candles[entryDateIndex];
  const replayCandle = candles[replayIndex];
  const numBuyPrice = parseFloat(buyPrice) || (entryCandle?.close ?? 0);
  const numQty = parseInt(quantity, 10) || 1;
  const numTargetRate = parseFloat(targetRate) || 10;
  const numStopLossRate = parseFloat(stopLossRate) || -5;
  const totalInvestment = Math.round(numBuyPrice * numQty);

  // Look-ahead bias prevention: visible candles for the chart
  // Only candles from 0 to replayIndex are visible!
  const visibleCandles = candles.slice(0, replayIndex + 1);

  // Current Replay P&L (Unrealized at the replay cursor date)
  let replayUnrealizedProfit = 0;
  let replayReturnRate = 0;
  let replayHoldingDays = 0;
  if (replayCandle && numBuyPrice > 0) {
    const curVal = Math.round(replayCandle.close * numQty);
    replayUnrealizedProfit = curVal - totalInvestment;
    replayReturnRate = totalInvestment > 0 ? (replayUnrealizedProfit / totalInvestment) * 100 : 0;
    replayHoldingDays = Math.max(0, replayIndex - entryDateIndex);
  }

  // Scenarios Configuration & Evaluation
  const scenariosConfig = useMemo(() => {
    const list = [
      {
        id: 'sc_conservative',
        name: '시나리오 1: 보수적 (목표 +5% / 손절 -3%)',
        targetRate: 5,
        stopLossRate: -3,
      },
      {
        id: 'sc_standard',
        name: `시나리오 2: 표준 (목표 +${numTargetRate}% / 손절 ${numStopLossRate}%)`,
        targetRate: numTargetRate,
        stopLossRate: numStopLossRate,
      },
      {
        id: 'sc_aggressive',
        name: '시나리오 3: 공격적 (목표 +20% / 손절 -8%)',
        targetRate: 20,
        stopLossRate: -8,
      },
    ];

    if (manualExitIndex !== null && candles[manualExitIndex]) {
      const exitCandle = candles[manualExitIndex];
      list.push({
        id: 'sc_manual',
        name: `시나리오 4: 선택 시점 매도 (${exitCandle.time})`,
        customExitDate: exitCandle.time,
        customExitPrice: exitCandle.close,
      } as any);
    } else if (replayIndex > entryDateIndex && replayCandle) {
      list.push({
        id: 'sc_current_replay',
        name: `시나리오 4: 현재 재생 시점 매도 (${replayCandle.time})`,
        customExitDate: replayCandle.time,
        customExitPrice: replayCandle.close,
      } as any);
    }

    return list;
  }, [numTargetRate, numStopLossRate, manualExitIndex, replayIndex, entryDateIndex, candles, replayCandle]);

  const evaluatedScenarios = useMemo(() => {
    if (!entryCandle || candles.length === 0 || numBuyPrice <= 0 || numQty <= 0) {
      return [];
    }
    return historicalSimulationService.evaluateScenarios({
      entryDate: entryCandle.time,
      entryPrice: numBuyPrice,
      quantity: numQty,
      candles,
      scenariosConfig,
      commissionRate,
      taxRate,
    });
  }, [entryCandle, numBuyPrice, numQty, candles, scenariosConfig, commissionRate, taxRate]);

  // Handle Save Simulation
  const handleSaveSimulation = async () => {
    if (!entryCandle) return;
    try {
      const record = await historicalSimulationService.saveSimulation(
        {
          uid: user?.id || 'guest',
          symbol,
          stockName,
          market,
          entryDate: entryCandle.time,
          entryPrice: numBuyPrice,
          quantity: numQty,
          totalInvestment,
          selectedExitDate: replayCandle?.time,
          selectedExitPrice: replayCandle?.close,
          netProfit: evaluatedScenarios[1]?.netProfit ?? replayUnrealizedProfit,
          returnRate: evaluatedScenarios[1]?.returnRate ?? replayReturnRate,
          holdingDays: replayHoldingDays,
          scenarios: evaluatedScenarios,
          notes,
        },
        user?.id
      );

      setSavedSimulations(prev => [record, ...prev]);
      showToast('시뮬레이션 결과가 안전하게 저장되었습니다.', 'success');
      setActiveTab('history');
    } catch (err: any) {
      showToast('시뮬레이션 저장 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleDeleteSimulation = async (id: string) => {
    if (!window.confirm('이 시뮬레이션 기록을 삭제하시겠습니까?')) return;
    await historicalSimulationService.deleteSimulation(id, user?.id);
    setSavedSimulations(prev => prev.filter(s => s.id !== id));
    showToast('시뮬레이션 기록이 삭제되었습니다.', 'info');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="w-full max-w-5xl bg-white dark:bg-[#131722] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-[#111520]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-500/10 text-rose-500">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  과거 차트 매매 시뮬레이터 & 시나리오 분석
                </h2>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-500">
                  {stockName} ({symbol})
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold">
                  {market}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                실제 과거 시세 데이터를 기반으로 매수·매도 타이밍과 목표가·손절가 도달 여부를 단계별로 검증합니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab Buttons */}
            <div className="flex p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl text-xs font-bold mr-1">
              <button
                onClick={() => setActiveTab('simulate')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeTab === 'simulate'
                    ? 'bg-white dark:bg-[#131722] text-rose-500 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>시뮬레이션</span>
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeTab === 'history'
                    ? 'bg-white dark:bg-[#131722] text-rose-500 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>저장 기록 ({savedSimulations.length})</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Disclaimer Banner (Requirement 2 & 3) */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold block">
                ⚠️ [과거 시뮬레이션 및 데이터 정확성 고지]
              </span>
              <p className="text-[11px] leading-relaxed">
                • 본 시뮬레이션은 <strong>실제 수집된 과거 일봉 시세(수정주가 기준, KST 정규장)</strong>만 사용하며, 데이터가 없는 구간은 임의 추정하지 않습니다.
                • 미래 시점 데이터 참조 방지(Look-ahead bias 방지)를 위해 시뮬레이션 진행 커서 이전의 캔들만 노출됩니다.
                • 과거의 시뮬레이션 결과는 미래의 수익이나 원금을 보장하지 않습니다.
              </p>
            </div>
          </div>

          {/* ============================================================== */}
          {/* TAB 1: SIMULATION & REPLAY */}
          {/* ============================================================== */}
          {activeTab === 'simulate' && (
            <div className="space-y-6">
              {/* 1. Parameter Settings Bar */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
                {/* Entry Date Selector */}
                <div>
                  <label className="text-[11px] font-sans font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center justify-between">
                    <span>1. 과거 매수일자 선택</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {candles.length}개 캔들 지원
                    </span>
                  </label>
                  <select
                    value={entryDateIndex}
                    onChange={e => setEntryDateIndex(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 bg-white dark:bg-[#1a1f2c] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    {candles.map((c, idx) => (
                      <option key={c.time} value={idx}>
                        {c.time} (종가: {c.close.toLocaleString()}원)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Buy Price */}
                <div>
                  <div className="flex items-center justify-between mb-1.5 font-sans">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      2. 매수 가격 (원)
                    </label>
                    {entryCandle && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        당일 저가 {entryCandle.low.toLocaleString()} ~ 고가 {entryCandle.high.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={buyPrice}
                    onChange={e => setBuyPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-[#1a1f2c] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                {/* Quantity & Budget */}
                <div>
                  <div className="flex items-center justify-between mb-1.5 font-sans">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      3. 매수 수량 (주)
                    </label>
                    <span className="text-[10px] text-slate-400">
                      투자금: {totalInvestment.toLocaleString()}원
                    </span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={quantity}
                    onChange={e => {
                      setQuantity(e.target.value);
                      const q = parseInt(e.target.value, 10);
                      if (q > 0 && numBuyPrice > 0) {
                        setInvestmentBudget(String(q * numBuyPrice));
                      }
                    }}
                    placeholder="수량 (예: 10주)"
                    className="w-full px-3 py-2 bg-white dark:bg-[#1a1f2c] border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                {/* Target & Stop Loss Rates */}
                <div>
                  <label className="text-[11px] font-sans font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                    4. 목표가 / 손절가 (%)
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={targetRate}
                        onChange={e => setTargetRate(e.target.value)}
                        className="w-full px-2 py-2 pr-5 bg-white dark:bg-[#1a1f2c] border border-slate-200 dark:border-slate-700 rounded-xl text-rose-500 font-bold focus:outline-none text-right"
                      />
                      <span className="absolute right-2 top-2 text-[10px] text-slate-400">%</span>
                    </div>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="-100"
                        max="0"
                        value={stopLossRate}
                        onChange={e => setStopLossRate(e.target.value)}
                        className="w-full px-2 py-2 pr-5 bg-white dark:bg-[#1a1f2c] border border-slate-200 dark:border-slate-700 rounded-xl text-blue-500 font-bold focus:outline-none text-right"
                      />
                      <span className="absolute right-2 top-2 text-[10px] text-slate-400">%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Replay Player & Look-Ahead Bias Prevention Chart View */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Play className="w-4 h-4 text-rose-500" />
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      과거 차트 리플레이 재생 (미래 데이터 참조 방지 뷰)
                    </h3>
                  </div>

                  {/* Replay Controls */}
                  <div className="flex items-center gap-2 self-start sm:self-auto font-mono text-xs">
                    <button
                      onClick={stepBack}
                      disabled={replayIndex <= entryDateIndex}
                      className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                      title="이전 거래일"
                    >
                      <SkipBack className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={togglePlay}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold font-sans transition-all shadow-sm ${
                        isPlaying
                          ? 'bg-amber-500 text-white'
                          : 'bg-rose-600 hover:bg-rose-500 text-white'
                      }`}
                    >
                      {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{isPlaying ? '일시정지' : '자동 재생'}</span>
                    </button>

                    <button
                      onClick={stepForward}
                      disabled={replayIndex >= candles.length - 1}
                      className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
                      title="다음 거래일"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => {
                        setManualExitIndex(replayIndex);
                        showToast(`${replayCandle?.time}을 매도 시점으로 선택했습니다.`, 'info');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold font-sans transition-all active:scale-95 ml-2"
                    >
                      이 시점에 매도 확정
                    </button>
                  </div>
                </div>

                {/* Timeline Slider */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                    <span>매수일: {entryCandle?.time}</span>
                    <span className="font-bold text-rose-500">
                      현재 재생 시점: {replayCandle?.time} (경과: {replayHoldingDays}거래일)
                    </span>
                    <span>마지막 데이터: {candles[candles.length - 1]?.time}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={candles.length - 1}
                    value={replayIndex}
                    onChange={e => setReplayIndex(parseInt(e.target.value, 10))}
                    className="w-full accent-rose-500 cursor-pointer"
                  />
                </div>

                {/* Mini Replay Chart Display */}
                <div className="h-48 sm:h-56 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 p-3 relative flex flex-col justify-between overflow-hidden">
                  {/* Watermark Notice */}
                  <div className="absolute top-2 right-3 text-[10px] font-mono text-slate-400 bg-white/80 dark:bg-black/50 px-2 py-0.5 rounded backdrop-blur-sm z-10">
                    공개된 캔들: {visibleCandles.length} / {candles.length} (미래 데이터 비공개)
                  </div>

                  {/* SVG Candle Renderer */}
                  <div className="flex-1 w-full relative">
                    {visibleCandles.length > 0 && (() => {
                      const maxPrice = Math.max(...visibleCandles.map(c => c.high));
                      const minPrice = Math.min(...visibleCandles.map(c => c.low));
                      const range = maxPrice - minPrice || 1;
                      const widthPct = 100 / visibleCandles.length;

                      return (
                        <svg className="w-full h-full overflow-visible">
                          {/* Entry Price Horizontal Line */}
                          {numBuyPrice > 0 && (
                            <line
                              x1="0%"
                              y1={`${100 - ((numBuyPrice - minPrice) / range) * 100}%`}
                              x2="100%"
                              y2={`${100 - ((numBuyPrice - minPrice) / range) * 100}%`}
                              stroke="#10b981"
                              strokeWidth="1.5"
                              strokeDasharray="4 2"
                            />
                          )}

                          {/* Candles */}
                          {visibleCandles.map((c, i) => {
                            const isUp = c.close >= c.open;
                            const isEntry = i === entryDateIndex;
                            const isCurrent = i === replayIndex;
                            const x = `${(i + 0.5) * widthPct}%`;
                            const yHigh = `${100 - ((c.high - minPrice) / range) * 100}%`;
                            const yLow = `${100 - ((c.low - minPrice) / range) * 100}%`;
                            const yOpen = `${100 - ((c.open - minPrice) / range) * 100}%`;
                            const yClose = `${100 - ((c.close - minPrice) / range) * 100}%`;
                            const bodyTop = Math.min(parseFloat(yOpen), parseFloat(yClose));
                            const bodyHeight = Math.max(2, Math.abs(parseFloat(yClose) - parseFloat(yOpen)));

                            return (
                              <g key={c.time}>
                                {/* Wick */}
                                <line
                                  x1={x}
                                  y1={yHigh}
                                  x2={x}
                                  y2={yLow}
                                  stroke={isUp ? '#f43f5e' : '#3b82f6'}
                                  strokeWidth="1.5"
                                />
                                {/* Body */}
                                <rect
                                  x={`calc(${x} - 2px)`}
                                  y={`${bodyTop}%`}
                                  width="5"
                                  height={`${bodyHeight}%`}
                                  fill={isUp ? '#f43f5e' : '#3b82f6'}
                                  stroke={isEntry ? '#10b981' : isCurrent ? '#ffffff' : 'none'}
                                  strokeWidth={isEntry || isCurrent ? '1.5' : '0'}
                                />
                              </g>
                            );
                          })}
                        </svg>
                      );
                    })()}
                  </div>

                  {/* Real-time Status Card at Cursor */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-3">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">현재 재생일 종가</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {replayCandle?.close.toLocaleString()}원
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-sans">진입가 대비 손익</span>
                        <span className={`font-bold ${replayUnrealizedProfit >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
                          {replayUnrealizedProfit >= 0 ? '+' : ''}{replayUnrealizedProfit.toLocaleString()}원 ({replayUnrealizedProfit >= 0 ? '+' : ''}{replayReturnRate.toFixed(2)}%)
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block font-sans">수수료(0.015%)·세금(0.18%)</span>
                      <span className="text-slate-500 text-[11px]">모의투자 설정 실시간 적용</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Exit Scenarios Comparison Table (Requirement 2) */}
              <div className="rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-rose-500" />
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      매도 시나리오별 결과 및 도달 여부 비교 분석
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    수수료율: {(commissionRate * 100).toFixed(3)}% | 거래세: {(taxRate * 100).toFixed(2)}%
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-[11px] text-slate-500 uppercase font-sans">
                        <th className="py-3 px-4 font-semibold">시나리오</th>
                        <th className="py-3 px-3 font-semibold">목표 / 손절 기준</th>
                        <th className="py-3 px-3 font-semibold">판정 결과</th>
                        <th className="py-3 px-3 font-semibold text-right">매도 체결일자</th>
                        <th className="py-3 px-3 font-semibold text-right">매도 체결가</th>
                        <th className="py-3 px-3 font-semibold text-right">거래비용 (수수료+세)</th>
                        <th className="py-3 px-3 font-semibold text-right">순손익</th>
                        <th className="py-3 px-4 font-semibold text-right">수익률 (보유일)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                      {evaluatedScenarios.map(sc => {
                        const isProfit = sc.netProfit >= 0;
                        const isHitTarget = sc.exitReason === '목표가 도달';
                        const isHitStop = sc.exitReason === '손절가 이탈';

                        return (
                          <tr key={sc.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/20 transition-colors">
                            <td className="py-3.5 px-4 font-sans font-bold text-slate-900 dark:text-white">
                              {sc.name}
                            </td>

                            <td className="py-3.5 px-3">
                              {sc.targetRate !== undefined ? (
                                <div className="text-[11px]">
                                  <span className="text-rose-500 font-bold">목표: +{sc.targetRate}% ({sc.targetPrice?.toLocaleString()}원)</span>
                                  <span className="text-slate-400 mx-1">/</span>
                                  <span className="text-blue-500 font-bold">손절: {sc.stopLossRate}% ({sc.stopLossPrice?.toLocaleString()}원)</span>
                                </div>
                              ) : (
                                <span className="text-slate-500 text-[11px]">지정일 매도</span>
                              )}
                            </td>

                            <td className="py-3.5 px-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-sans ${
                                isHitTarget
                                  ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                  : isHitStop
                                  ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}>
                                {sc.exitReason}
                              </span>
                            </td>

                            <td className="py-3.5 px-3 text-right">
                              {sc.exitDate || '-'}
                            </td>

                            <td className="py-3.5 px-3 text-right font-bold text-slate-900 dark:text-white">
                              {sc.exitPrice && sc.exitPrice > 0 ? `${sc.exitPrice.toLocaleString()}원` : '-'}
                            </td>

                            <td className="py-3.5 px-3 text-right text-slate-500 text-[11px]">
                              {(sc.fee + sc.tax).toLocaleString()}원
                            </td>

                            <td className="py-3.5 px-3 text-right">
                              <span className={`font-bold ${isProfit ? 'text-rose-500' : 'text-blue-500'}`}>
                                {isProfit ? '+' : ''}{sc.netProfit.toLocaleString()}원
                              </span>
                            </td>

                            <td className="py-3.5 px-4 text-right">
                              <span className={`font-bold block ${isProfit ? 'text-rose-500' : 'text-blue-500'}`}>
                                {isProfit ? '+' : ''}{sc.returnRate.toFixed(2)}%
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                {sc.holdingDays}거래일 보유
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 4. Strategy Notes & Save Button */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="시뮬레이션 전략 메모 (예: 2026년 8월 지지선 반등 매수 전략)"
                  className="w-full sm:flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                />

                <button
                  onClick={handleSaveSimulation}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-600/20 active:scale-95 shrink-0"
                >
                  <Save className="w-4 h-4" />
                  <span>시뮬레이션 결과 저장</span>
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: SAVED SIMULATION RECORDS */}
          {/* ============================================================== */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-rose-500" />
                  <span>내 과거 시뮬레이션 저장 기록 ({savedSimulations.length})</span>
                </h3>
                <span className="text-xs text-slate-400">
                  사용자 계정별로 안전하게 보관되며 실제 모의투자 잔고에는 영향을 주지 않습니다.
                </span>
              </div>

              {savedSimulations.length === 0 ? (
                <div className="py-16 text-center space-y-2 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-200 dark:border-slate-800">
                  <History className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
                  <h4 className="font-bold text-sm text-slate-700 dark:text-slate-300">
                    저장된 시뮬레이션 기록이 없습니다.
                  </h4>
                  <p className="text-xs text-slate-400">
                    '시뮬레이션' 탭에서 전략을 검증한 후 [시뮬레이션 결과 저장]을 눌러 보관하세요.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131722] overflow-hidden shadow-sm">
                  {savedSimulations.map(sim => {
                    const isProfit = (sim.netProfit ?? 0) >= 0;

                    return (
                      <div key={sim.id} className="p-4 sm:p-5 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-base text-slate-900 dark:text-white">
                                {sim.stockName} ({sim.symbol})
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                                진입일: {sim.entryDate} @ {sim.entryPrice.toLocaleString()}원 ({sim.quantity}주)
                              </span>
                            </div>
                            {sim.notes && (
                              <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                                💬 {sim.notes}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-4 self-start sm:self-auto">
                            <div className="text-right font-mono">
                              <span className="text-[11px] text-slate-400 block font-sans">최종 순손익 (수익률)</span>
                              <span className={`text-sm sm:text-base font-bold ${isProfit ? 'text-rose-500' : 'text-blue-500'}`}>
                                {isProfit ? '+' : ''}{sim.netProfit?.toLocaleString()}원 ({isProfit ? '+' : ''}{sim.returnRate?.toFixed(2)}%)
                              </span>
                            </div>

                            <button
                              onClick={() => handleDeleteSimulation(sim.id)}
                              className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                              title="기록 삭제"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Scenarios snapshot */}
                        {sim.scenarios && sim.scenarios.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/60 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                            {sim.scenarios.slice(0, 3).map(sc => (
                              <div key={sc.id} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                                <span className="font-sans font-semibold text-slate-600 dark:text-slate-400 block truncate">
                                  {sc.name}
                                </span>
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-slate-500">{sc.exitReason}</span>
                                  <span className={sc.netProfit >= 0 ? 'text-rose-500 font-bold' : 'text-blue-500 font-bold'}>
                                    {sc.returnRate >= 0 ? '+' : ''}{sc.returnRate.toFixed(2)}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
