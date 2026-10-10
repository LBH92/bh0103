import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight, 
  Zap, 
  DollarSign, 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  Settings, 
  Sparkles, 
  RefreshCw, 
  Filter, 
  ChevronRight, 
  Info,
  Check,
  X,
  Play
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { MarketAlertEvent, MarketMonitoringConfig, EventScope, MarketEventType } from '../../types/marketMonitor';
import { marketMonitorClient } from '../../services/marketMonitorClient';
import { StockInsightAiBriefing } from './StockInsightAiBriefing';
import { StockInsightAiDataQuery } from './StockInsightAiDataQuery';

export const StockInsightView: React.FC = () => {
  const { navigateToStock, showToast } = useApp();

  const [events, setEvents] = useState<MarketAlertEvent[]>([]);
  const [config, setConfig] = useState<MarketMonitoringConfig | null>(null);
  const [scopeFilter, setScopeFilter] = useState<'ALL' | 'STOCK' | 'MARKET'>('ALL');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isConfigOpen, setIsConfigOpen] = useState<boolean>(false);
  const [explainingEventId, setExplainingEventId] = useState<string | null>(null);

  // Editable config state for modal
  const [editConfig, setEditConfig] = useState<MarketMonitoringConfig | null>(null);

  const fetchMonitoringData = async () => {
    try {
      const [fetchedConfig, fetchedEvents] = await Promise.all([
        marketMonitorClient.getConfig(),
        marketMonitorClient.getEvents(scopeFilter === 'ALL' ? undefined : scopeFilter),
      ]);
      setConfig(fetchedConfig);
      setEditConfig(fetchedConfig);
      setEvents(fetchedEvents);
    } catch (err) {
      console.warn('[StockInsight] Error loading monitoring data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitoringData();
    // Auto refresh every 4 seconds to reflect live server monitoring ticks
    const intervalId = setInterval(() => {
      marketMonitorClient.getEvents(scopeFilter === 'ALL' ? undefined : scopeFilter)
        .then(res => setEvents(res))
        .catch(() => {});
    }, 4000);

    return () => clearInterval(intervalId);
  }, [scopeFilter]);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editConfig) return;

    try {
      const updated = await marketMonitorClient.updateConfig(editConfig);
      setConfig(updated);
      setIsConfigOpen(false);
      showToast('시장 모니터링 감지 설정이 업데이트되었습니다.', 'success');
    } catch {
      showToast('설정 저장 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleExplainWithGemini = async (eventId: string) => {
    setExplainingEventId(eventId);
    try {
      const explanation = await marketMonitorClient.explainEvent(eventId);
      setEvents(prev => prev.map(evt => evt.id === eventId ? { ...evt, aiExplanation: explanation } : evt));
      showToast('Gemini AI 이벤트 분석이 완료되었습니다.', 'success');
    } catch (err: any) {
      showToast('Gemini 분석 생성 실패: ' + (err.message || '오류 발생'), 'error');
    } finally {
      setExplainingEventId(null);
    }
  };

  const handleTriggerTest = async () => {
    try {
      const sample = await marketMonitorClient.triggerTestEvent({
        type: 'PRICE_SURGE',
        scope: 'STOCK',
        title: '삼성전자 급등 감지 테스트 (+5.80%)',
        description: '서버 실시간 수치 연산에 의한 급등 조건 충족 테스트 이벤트입니다.',
        symbol: '005930',
        symbolName: '삼성전자',
        market: 'KOSPI',
        metrics: {
          currentValue: 5.80,
          threshold: config?.PRICE_RISE_ALERT_PERCENT || 5.0,
          unit: '%',
          changePercent: 5.80,
        },
      });

      if ((sample as any).message) {
        showToast('중복 방지 쿨다운 적용 중입니다. 잠시 후 다시 시도하세요.', 'warning');
      } else {
        showToast('테스트 이벤트가 서버에서 성공적으로 감지되었습니다.', 'success');
        fetchMonitoringData();
      }
    } catch {
      showToast('테스트 이벤트 생성 실패', 'error');
    }
  };

  const getEventBadge = (type: MarketEventType) => {
    switch (type) {
      case 'PRICE_SURGE':
        return { label: '급등 감지', color: 'bg-rose-500/10 text-rose-500 border-rose-500/30', icon: <ArrowUpRight className="w-3.5 h-3.5" /> };
      case 'PRICE_PLUNGE':
        return { label: '급락 경보', color: 'bg-blue-500/10 text-blue-500 border-blue-500/30', icon: <ArrowDownRight className="w-3.5 h-3.5" /> };
      case 'VOLUME_SPIKE':
        return { label: '거래량 급증', color: 'bg-amber-500/10 text-amber-500 border-amber-500/30', icon: <Zap className="w-3.5 h-3.5" /> };
      case 'TRADING_VALUE_SPIKE':
        return { label: '거래대금 폭증', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30', icon: <DollarSign className="w-3.5 h-3.5" /> };
      case 'MARKET_TURBULENCE':
        return { label: '시장 급변동', color: 'bg-purple-500/10 text-purple-500 border-purple-500/30', icon: <Activity className="w-3.5 h-3.5" /> };
      case 'SIDECAR':
        return { label: '사이드카 발동', color: 'bg-orange-500/10 text-orange-500 border-orange-500/30 animate-pulse', icon: <AlertTriangle className="w-3.5 h-3.5" /> };
      case 'CIRCUIT_BREAKER':
        return { label: '서킷브레이커', color: 'bg-rose-600 text-white animate-pulse', icon: <ShieldAlert className="w-3.5 h-3.5" /> };
      default:
        return { label: '시장 알림', color: 'bg-slate-100 text-slate-700', icon: <Info className="w-3.5 h-3.5" /> };
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-150">
      {/* 1. Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#131722] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
              <Activity className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              Stock Insight 시장 모니터링 시스템
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              서버 감지 엔진 가동 중
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5">
            서버가 주식·지수 데이터를 실시간 수치 연산하여 7대 핵심 이벤트를 포착하고 중복 알림 방지(Cooldown)를 적용합니다.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-center flex-wrap">
          <button
            onClick={handleTriggerTest}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            title="테스트 알림을 서버로 전송하여 쿨다운 및 감지 검증"
          >
            <Play className="w-3.5 h-3.5 text-rose-500" />
            <span>테스트 감지</span>
          </button>

          <button
            onClick={() => setIsConfigOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>감지 조건 설정</span>
          </button>

          <button
            onClick={fetchMonitoringData}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 transition-colors cursor-pointer"
            title="새로고침"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. 7 Major Detection Targets Status Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
        <div className="p-3.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-rose-500 font-bold mb-1">
            <span className="flex items-center gap-1"><ArrowUpRight className="w-3 h-3" /> 1. 급등</span>
            <span className="text-[10px] font-mono">STOCK</span>
          </div>
          <div className="font-bold text-slate-900 dark:text-white text-sm font-mono">
            +{config?.PRICE_RISE_ALERT_PERCENT ?? 5.0}% 이상
          </div>
          <div className="text-[10px] text-slate-400 mt-1">등락률 기준</div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-blue-500 font-bold mb-1">
            <span className="flex items-center gap-1"><ArrowDownRight className="w-3 h-3" /> 2. 급락</span>
            <span className="text-[10px] font-mono">STOCK</span>
          </div>
          <div className="font-bold text-slate-900 dark:text-white text-sm font-mono">
            {config?.PRICE_FALL_ALERT_PERCENT ?? -5.0}% 이하
          </div>
          <div className="text-[10px] text-slate-400 mt-1">등락률 기준</div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-amber-500 font-bold mb-1">
            <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> 3. 거래량 급증</span>
            <span className="text-[10px] font-mono">STOCK</span>
          </div>
          <div className="font-bold text-slate-900 dark:text-white text-sm font-mono">
            {((config?.VOLUME_SPIKE_MULTIPLIER ?? 2.0) * 100).toFixed(0)}% 이상
          </div>
          <div className="text-[10px] text-slate-400 mt-1">20일 평균 대비 배수</div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-emerald-500 font-bold mb-1">
            <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> 4. 거래대금</span>
            <span className="text-[10px] font-mono">STOCK</span>
          </div>
          <div className="font-bold text-slate-900 dark:text-white text-sm font-mono">
            {(config?.TRADING_VALUE_ALERT_THRESHOLD ?? 3000).toLocaleString()}억
          </div>
          <div className="text-[10px] text-slate-400 mt-1">자금 집중 기준</div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-purple-500 font-bold mb-1">
            <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> 5. 시장 급변</span>
            <span className="text-[10px] font-mono">MARKET</span>
          </div>
          <div className="font-bold text-slate-900 dark:text-white text-sm font-mono">
            지수 ±{config?.MARKET_INDEX_ALERT_PERCENT ?? 2.0}%
          </div>
          <div className="text-[10px] text-slate-400 mt-1">코스피·코스닥</div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-orange-500 font-bold mb-1">
            <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> 6. 사이드카</span>
            <span className="text-[10px] font-mono">MARKET</span>
          </div>
          <div className="font-bold text-slate-900 dark:text-white text-sm font-mono">
            지수 ±{config?.SIDECAR_THRESHOLD_PERCENT ?? 5.0}%
          </div>
          <div className="text-[10px] text-slate-400 mt-1">호가 효력정지</div>
        </div>

        <div className="p-3.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between text-rose-600 font-bold mb-1">
            <span className="flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> 7. 서킷브레이커</span>
            <span className="text-[10px] font-mono">MARKET</span>
          </div>
          <div className="font-bold text-slate-900 dark:text-white text-sm font-mono">
            지수 {config?.CIRCUIT_BREAKER_LV1_PERCENT ?? -8.0}%
          </div>
          <div className="text-[10px] text-slate-400 mt-1">전 종목 매매중단</div>
        </div>
      </div>

      {/* 2.5 Gemini 기반 AI 자연어 주식 데이터 질의 & AI 종목 브리핑 시스템 */}
      <StockInsightAiDataQuery />
      <StockInsightAiBriefing />

      {/* 3. Scope Filters & Cooldown Note */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
          <button
            onClick={() => setScopeFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              scopeFilter === 'ALL'
                ? 'bg-white dark:bg-[#1a1f2e] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            전체 알림 피드 ({events.length})
          </button>
          <button
            onClick={() => setScopeFilter('STOCK')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              scopeFilter === 'STOCK'
                ? 'bg-white dark:bg-[#1a1f2e] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            🏢 개별 종목 이벤트 ({events.filter(e => e.scope === 'STOCK').length})
          </button>
          <button
            onClick={() => setScopeFilter('MARKET')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              scopeFilter === 'MARKET'
                ? 'bg-white dark:bg-[#1a1f2e] text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            🏛️ 시장 전체 조치 ({events.filter(e => e.scope === 'MARKET').length})
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>중복 방지 Cooldown: {((config?.ALERT_COOLDOWN_MS ?? 180000) / 1000).toFixed(0)}초</span>
        </div>
      </div>

      {/* 4. Events Feed */}
      <div className="space-y-3.5">
        {events.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800">
            <Activity className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3 animate-pulse" />
            <h3 className="font-bold text-slate-700 dark:text-slate-300">현재 감지된 시장 이벤트가 없습니다.</h3>
            <p className="text-xs text-slate-400 mt-1">
              설정된 임계값을 초과하는 급등·급락·거래량 폭증 발생 시 서버가 자동으로 감지합니다.
            </p>
          </div>
        ) : (
          events.map(event => {
            const badge = getEventBadge(event.type);
            const isExplaining = explainingEventId === event.id;

            return (
              <div
                key={event.id}
                className="p-5 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all space-y-3"
              >
                {/* Event Top Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2.5 py-1 rounded-md text-xs font-bold border flex items-center gap-1 ${badge.color}`}>
                      {badge.icon}
                      <span>{badge.label}</span>
                    </span>

                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {event.scope === 'MARKET' ? '시장 전체' : '개별 종목'}
                    </span>

                    {event.market && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {event.market}
                      </span>
                    )}

                    <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {event.timestamp}
                    </span>
                  </div>

                  {event.symbol && (
                    <button
                      onClick={() => navigateToStock(event.symbol!)}
                      className="text-xs font-bold text-rose-500 hover:underline flex items-center gap-1 self-start sm:self-center cursor-pointer"
                    >
                      <span>{event.symbolName} 종목 상세</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Event Content & Metrics */}
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {event.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    {event.description}
                  </p>
                </div>

                {/* Server Calculated Numeric Metrics Chips */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 font-mono text-xs">
                  <div className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                    <span className="text-slate-400 font-sans mr-1.5">감지 수치:</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {event.metrics.currentValue}{event.metrics.unit}
                    </span>
                  </div>

                  <div className="px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                    <span className="text-slate-400 font-sans mr-1.5">설정 임계값:</span>
                    <span className="font-bold">
                      {event.metrics.threshold}{event.metrics.unit}
                    </span>
                  </div>

                  {event.metrics.volumeRatio !== undefined && (
                    <div className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-500 font-bold border border-amber-500/20">
                      평균 대비 {event.metrics.volumeRatio}%
                    </div>
                  )}

                  {event.metrics.tradingValue !== undefined && (
                    <div className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/20">
                      거래대금 {event.metrics.tradingValue.toLocaleString()}억 원
                    </div>
                  )}
                </div>

                {/* Gemini AI Explanation Section */}
                <div className="pt-2">
                  {event.aiExplanation ? (
                    <div className="p-3.5 rounded-xl bg-purple-500/5 dark:bg-purple-950/20 border border-purple-500/20 text-xs text-slate-800 dark:text-slate-200 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-purple-600 dark:text-purple-400">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Gemini AI 시황 분석 및 투자 유의사항</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300 leading-relaxed font-sans">
                        {event.aiExplanation}
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleExplainWithGemini(event.id)}
                      disabled={isExplaining}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{isExplaining ? 'Gemini AI 분석 생성 중...' : 'Gemini AI 이벤트 해설 및 요약 받기'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 5. Config Modal for managing thresholds dynamically */}
      {isConfigOpen && editConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-rose-500" />
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                  시장 모니터링 감지 조건 설정
                </h3>
              </div>
              <button
                onClick={() => setIsConfigOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-700 dark:text-amber-400">
                💡 조건은 코드 하드코딩이 아닌 아래 설정값으로 서버에서 실시간 계산·관리됩니다.
              </div>

              {/* 1. 급등 */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  1. 급등 감지 기준 (PRICE_RISE_ALERT_PERCENT, %)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editConfig.PRICE_RISE_ALERT_PERCENT}
                  onChange={e => setEditConfig({ ...editConfig, PRICE_RISE_ALERT_PERCENT: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm"
                  required
                />
                <span className="text-[11px] text-slate-400">종목 등락률이 이 수치 이상일 때 급등 알림 생성</span>
              </div>

              {/* 2. 급락 */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  2. 급락 감지 기준 (PRICE_FALL_ALERT_PERCENT, %)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editConfig.PRICE_FALL_ALERT_PERCENT}
                  onChange={e => setEditConfig({ ...editConfig, PRICE_FALL_ALERT_PERCENT: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm"
                  required
                />
                <span className="text-[11px] text-slate-400">종목 등락률이 이 수치 이하일 때 급락 경보 생성 (음수 입력)</span>
              </div>

              {/* 3. 거래량 급증 */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  3. 거래량 급증 배수 (VOLUME_SPIKE_MULTIPLIER, 배)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={editConfig.VOLUME_SPIKE_MULTIPLIER}
                  onChange={e => setEditConfig({ ...editConfig, VOLUME_SPIKE_MULTIPLIER: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm"
                  required
                />
                <span className="text-[11px] text-slate-400">2.0 = 20일 평균 거래량 대비 200% 이상</span>
              </div>

              {/* 4. 거래대금 급증 */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  4. 거래대금 폭증 임계치 (TRADING_VALUE_ALERT_THRESHOLD, 억 원)
                </label>
                <input
                  type="number"
                  step="500"
                  value={editConfig.TRADING_VALUE_ALERT_THRESHOLD}
                  onChange={e => setEditConfig({ ...editConfig, TRADING_VALUE_ALERT_THRESHOLD: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm"
                  required
                />
              </div>

              {/* 5. 시장 급변 */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  5. 시장 급변 지수 임계치 (MARKET_INDEX_ALERT_PERCENT, %)
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={editConfig.MARKET_INDEX_ALERT_PERCENT}
                  onChange={e => setEditConfig({ ...editConfig, MARKET_INDEX_ALERT_PERCENT: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm"
                  required
                />
                <span className="text-[11px] text-slate-400">KOSPI / KOSDAQ 지수 ±변동폭 기준</span>
              </div>

              {/* 6. 사이드카 & 7. 서킷브레이커 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    6. 사이드카 기준 (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={editConfig.SIDECAR_THRESHOLD_PERCENT}
                    onChange={e => setEditConfig({ ...editConfig, SIDECAR_THRESHOLD_PERCENT: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    7. 서킷브레이커 기준 (%)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={editConfig.CIRCUIT_BREAKER_LV1_PERCENT}
                    onChange={e => setEditConfig({ ...editConfig, CIRCUIT_BREAKER_LV1_PERCENT: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm"
                    required
                  />
                </div>
              </div>

              {/* 8. 중복 방지 쿨다운 */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  8. 중복 알림 방지 Cooldown (ALERT_COOLDOWN_MS, 밀리초)
                </label>
                <input
                  type="number"
                  step="10000"
                  value={editConfig.ALERT_COOLDOWN_MS}
                  onChange={e => setEditConfig({ ...editConfig, ALERT_COOLDOWN_MS: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm"
                  required
                />
                <span className="text-[11px] text-slate-400">
                  {((editConfig.ALERT_COOLDOWN_MS) / 1000).toFixed(0)}초 동안 같은 종목의 동일 이벤트는 반복 발생하지 않습니다.
                </span>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsConfigOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-sm"
                >
                  설정 저장 및 즉시 적용
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
