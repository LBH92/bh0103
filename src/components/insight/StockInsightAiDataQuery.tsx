import React, { useState } from 'react';
import { 
  Bot, 
  Search, 
  Clock, 
  Database, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  DollarSign, 
  Activity, 
  HelpCircle, 
  ChevronRight, 
  CheckCircle2, 
  Bookmark, 
  ArrowRight,
  ShieldCheck,
  BarChart2,
  Key
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { aiStockQueryClient, StockQueryExecutionResult } from '../../services/aiStockQueryClient';
import { UserAiSettingsModal } from '../profile/UserAiSettingsModal';

export const StockInsightAiDataQuery: React.FC = () => {
  const { watchlist, navigateToStock, showToast, user, requireAuth } = useApp();

  const [query, setQuery] = useState<string>('삼성전자 현재가 알려줘');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [result, setResult] = useState<StockQueryExecutionResult | null>(null);

  const exampleQueries = [
    { text: '삼성전자 현재가 알려줘', label: '현재가 조회', fn: 'get_stock_quote' },
    { text: '삼성전자 오늘 거래량 어때?', label: '거래량 조회', fn: 'get_stock_volume' },
    { text: '내 관심종목 중 오늘 가장 많이 오른 종목은?', label: '관심종목 랭킹', fn: 'get_watchlist' },
    { text: '오늘 거래량이 급증한 종목을 보여줘', label: '거래량 급증', fn: 'get_volume_spikes' },
    { text: '코스닥 시장 상황을 요약해줘', label: '시장 상황 요약', fn: 'get_market_summary' },
    { text: '오늘 시장에서 가장 많이 오른 종목은?', label: '상승률 상위', fn: 'get_top_gainers' },
  ];

  const handleExecuteQuery = async (targetQuery?: string) => {
    const q = (targetQuery || query).trim();
    if (!q) {
      showToast('질문을 입력해주세요.', 'error');
      return;
    }

    if (!user) {
      requireAuth('AI 주식 데이터 질의');
      return;
    }

    setIsLoading(true);
    try {
      const res = await aiStockQueryClient.submitQuery(q, watchlist, user.id);
      setResult(res);
      showToast(`'${res.functionCalled}' 함수를 통해 데이터를 조회했습니다.`, 'success');
    } catch (err: any) {
      const msg = err?.message || '질의 처리에 실패했습니다.';
      showToast(msg, 'error');
      if (msg.includes('개인 Gemini AI 계정') || msg.includes('AI_NOT_CONNECTED')) {
        setIsAiModalOpen(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectExample = (ex: { text: string }) => {
    setQuery(ex.text);
    handleExecuteQuery(ex.text);
  };

  // Helper to format Function Badge
  const getFunctionBadge = (fnName: string) => {
    switch (fnName) {
      case 'get_stock_quote':
        return { label: 'get_stock_quote (현재가)', color: 'bg-rose-500/10 text-rose-500 border-rose-500/30' };
      case 'get_stock_volume':
        return { label: 'get_stock_volume (거래량/수급)', color: 'bg-amber-500/10 text-amber-500 border-amber-500/30' };
      case 'get_watchlist':
        return { label: 'get_watchlist (관심종목)', color: 'bg-blue-500/10 text-blue-500 border-blue-500/30' };
      case 'get_market_summary':
        return { label: 'get_market_summary (지수 요약)', color: 'bg-purple-500/10 text-purple-500 border-purple-500/30' };
      case 'get_volume_spikes':
        return { label: 'get_volume_spikes (거래량 급증)', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' };
      case 'get_top_gainers':
        return { label: 'get_top_gainers (상승 상위)', color: 'bg-rose-600/10 text-rose-600 border-rose-600/30' };
      case 'get_top_losers':
        return { label: 'get_top_losers (하락 상위)', color: 'bg-blue-600/10 text-blue-600 border-blue-600/30' };
      default:
        return { label: fnName, color: 'bg-slate-100 text-slate-700' };
    }
  };

  return (
    <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0 mt-0.5">
            <Bot className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-lg text-slate-900 dark:text-white">
                AI 실시간 주식 데이터 자연어 질의
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 font-mono">
                FUNCTION CALLING
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              자연어 질문을 분석하여 서버 함수(현재가·거래량·관심종목·급증주·시장 요약)를 자동 실행하고 실제 데이터에 근거해 답변합니다.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIsAiModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-600 dark:text-purple-400 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <Key className="w-3.5 h-3.5" />
            <span>개인 AI 연결 설정</span>
          </button>
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-500">
            <Database className="w-3.5 h-3.5 text-blue-500" />
            <span>7개 서버 함수 지원</span>
          </div>
        </div>
      </div>

      {/* 2. Interactive Input Box */}
      <form
        onSubmit={e => {
          e.preventDefault();
          handleExecuteQuery();
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="자연어로 질문하세요 (예: 삼성전자 현재가 알려줘, 코스닥 시장 상황을 요약해줘)"
            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center justify-center gap-1.5 px-5 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer shrink-0 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>함수 실행 중...</span>
            </>
          ) : (
            <>
              <Bot className="w-4 h-4" />
              <span>질문하기</span>
            </>
          )}
        </button>
      </form>

      {/* 3. Example Queries Chips */}
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="text-slate-400 font-medium flex items-center gap-1 text-[11px]">
          <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
          <span>예시 질문:</span>
        </span>
        {exampleQueries.map((ex, idx) => (
          <button
            key={idx}
            onClick={() => handleSelectExample(ex)}
            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer text-[11px]"
          >
            "{ex.text}"
          </button>
        ))}
      </div>

      {/* 4. Result Display with Clear Separation: Raw Data vs AI Explanation */}
      {result && (
        <div className="p-5 rounded-2xl bg-slate-50 dark:bg-[#0c0f17] border border-blue-500/30 space-y-5 animate-in fade-in duration-200">
          {/* Header Ribbon of Result */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                "{result.query}"
              </span>
              <span className={`px-2 py-0.5 rounded-md font-mono font-bold text-[11px] border ${getFunctionBadge(result.functionCalled).color}`}>
                {getFunctionBadge(result.functionCalled).label}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>데이터 기준 시점: {result.dataTimestamp}</span>
            </div>
          </div>

          {/* ======================================================== */}
          {/* PART 1: 📊 [실제 조회된 원천 데이터 (Ground Truth Data)] */}
          {/* ======================================================== */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span>1. 실제 조회된 원천 주가/시장 데이터 (서버 반환 팩트)</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                AI 창작 수치 아님 (검증 완료)
              </span>
            </div>

            {/* A. Single Stock Quote Card */}
            {result.functionCalled === 'get_stock_quote' && result.rawData && (
              <div className="p-4 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-base text-slate-900 dark:text-white">
                      {result.rawData.name}
                    </span>
                    <span className="font-mono text-xs text-slate-400">
                      ({result.rawData.symbol}) - {result.rawData.market}
                    </span>
                  </div>
                  <button
                    onClick={() => navigateToStock(result.rawData.symbol)}
                    className="text-xs font-bold text-rose-500 hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>차트 보기</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 text-[10px] block">현재가</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                      {result.rawData.price?.toLocaleString()}원
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 text-[10px] block">전일 대비 등락률</span>
                    <span className={`font-mono font-bold text-sm ${
                      (result.rawData.change || 0) >= 0 ? 'text-rose-500' : 'text-blue-500'
                    }`}>
                      {(result.rawData.change || 0) >= 0 ? '+' : ''}{result.rawData.change?.toLocaleString()}원 ({(result.rawData.changePercent || 0) >= 0 ? '+' : ''}{result.rawData.changePercent}%)
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 text-[10px] block">시가 / 전일종가</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                      {result.rawData.openPrice?.toLocaleString()} / {result.rawData.prevClose?.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 text-[10px] block">장중 고가 / 저가</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                      {result.rawData.highPrice?.toLocaleString()} / {result.rawData.lowPrice?.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* B. Stock Volume Card */}
            {result.functionCalled === 'get_stock_volume' && result.rawData && (
              <div className="p-4 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-black text-base text-slate-900 dark:text-white">
                    {result.rawData.name} ({result.rawData.symbol}) 거래량 분석
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 text-[10px] block">당일 누적 거래량</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                      {result.rawData.volume?.toLocaleString()}주
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 text-[10px] block">20일 평균 대비 비율</span>
                    <span className="font-mono font-bold text-amber-500 text-sm">
                      {result.rawData.volumeRatio}%
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 text-[10px] block">누적 거래대금</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                      {result.rawData.tradingValue?.toLocaleString()}억 원
                    </span>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 text-[10px] block">회전율 (추정)</span>
                    <span className="font-mono font-bold text-slate-700 dark:text-slate-300 text-sm">
                      {result.rawData.turnoverRate}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* C. Watchlist Ranking Card */}
            {result.functionCalled === 'get_watchlist' && result.rawData && (
              <div className="p-4 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    내 관심종목 실시간 랭킹 (총 {result.rawData.totalCount}개)
                  </span>
                  {result.rawData.topGainer && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 text-[11px] font-bold">
                      상승 1위: {result.rawData.topGainer.name} (+{result.rawData.topGainer.changePercent}%)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                  {result.rawData.items?.map((item: any) => (
                    <div
                      key={item.symbol}
                      onClick={() => navigateToStock(item.symbol)}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">{item.name}</span>
                        <span className={`font-mono font-bold ${item.changePercent >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
                          {item.changePercent >= 0 ? '+' : ''}{item.changePercent}%
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-1">
                        {item.price?.toLocaleString()}원
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* D. Volume Spikes Card */}
            {result.functionCalled === 'get_volume_spikes' && result.rawData && (
              <div className="p-4 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    20일 평균 대비 거래량 급증({result.rawData.thresholdPercent}% 이상) 종목 (총 {result.rawData.count}개)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
                  {result.rawData.spikes?.map((st: any) => (
                    <div
                      key={st.symbol}
                      onClick={() => navigateToStock(st.symbol)}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">{st.name}</span>
                        <span className="font-mono font-bold text-amber-500">
                          {st.volumeRatio}% 폭증
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-1">
                        <span>{st.price?.toLocaleString()}원 ({st.changePercent > 0 ? '+' : ''}{st.changePercent}%)</span>
                        <span>{st.tradingValue?.toLocaleString()}억</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* E. Top Gainers & Losers Card */}
            {(result.functionCalled === 'get_top_gainers' || result.functionCalled === 'get_top_losers') && result.rawData && (
              <div className="p-4 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200 block pb-1 border-b border-slate-100 dark:border-slate-800">
                  {result.functionCalled === 'get_top_gainers' ? '시장 급등률 상위 순위' : '시장 급락률 상위 순위'}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
                  {(result.rawData.gainers || result.rawData.losers)?.map((st: any, idx: number) => (
                    <div
                      key={st.symbol}
                      onClick={() => navigateToStock(st.symbol)}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white">
                          #{idx + 1} {st.name}
                        </span>
                        <span className={`font-mono font-bold ${st.changePercent >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
                          {st.changePercent >= 0 ? '+' : ''}{st.changePercent}%
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-1">
                        {st.price?.toLocaleString()}원
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* F. Market Summary Card */}
            {result.functionCalled === 'get_market_summary' && result.rawData && (
              <div className="p-4 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 text-[10px] block">코스피 지수</span>
                    <span className="font-mono font-bold text-base text-slate-900 dark:text-white block mt-0.5">
                      {result.rawData.kospi?.value?.toLocaleString()}
                    </span>
                    <span className={`text-[11px] font-mono font-bold ${
                      (result.rawData.kospi?.change || 0) >= 0 ? 'text-rose-500' : 'text-blue-500'
                    }`}>
                      {(result.rawData.kospi?.change || 0) >= 0 ? '▲' : '▼'} {Math.abs(result.rawData.kospi?.change || 0)} ({(result.rawData.kospi?.changePercent || 0) >= 0 ? '+' : ''}{result.rawData.kospi?.changePercent}%)
                    </span>
                    <div className="text-[10px] text-slate-400 mt-1">거래대금 {result.rawData.kospi?.tradingValue}</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 text-[10px] block">코스닥 지수</span>
                    <span className="font-mono font-bold text-base text-slate-900 dark:text-white block mt-0.5">
                      {result.rawData.kosdaq?.value?.toLocaleString()}
                    </span>
                    <span className={`text-[11px] font-mono font-bold ${
                      (result.rawData.kosdaq?.change || 0) >= 0 ? 'text-rose-500' : 'text-blue-500'
                    }`}>
                      {(result.rawData.kosdaq?.change || 0) >= 0 ? '▲' : '▼'} {Math.abs(result.rawData.kosdaq?.change || 0)} ({(result.rawData.kosdaq?.changePercent || 0) >= 0 ? '+' : ''}{result.rawData.kosdaq?.changePercent}%)
                    </span>
                    <div className="text-[10px] text-slate-400 mt-1">거래대금 {result.rawData.kosdaq?.tradingValue}</div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 text-[10px] block">원/달러 환율</span>
                    <span className="font-mono font-bold text-base text-slate-900 dark:text-white block mt-0.5">
                      {result.rawData.exchangeRate?.rate?.toLocaleString()}원
                    </span>
                    <span className={`text-[11px] font-mono font-bold ${
                      (result.rawData.exchangeRate?.changePercent || 0) >= 0 ? 'text-rose-500' : 'text-blue-500'
                    }`}>
                      {(result.rawData.exchangeRate?.changePercent || 0) >= 0 ? '+' : ''}{result.rawData.exchangeRate?.changePercent}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* PART 2: 🤖 [Gemini AI 데이터 기반 분석 및 설명]          */}
          {/* ======================================================== */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
              <Bot className="w-4 h-4 text-purple-500" />
              <span>2. Gemini AI 데이터 근거 자연어 답변 및 분석</span>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#131722] border border-purple-500/20 shadow-2xs text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed space-y-2">
              <p className="whitespace-pre-line font-medium">
                {result.aiExplanation}
              </p>
            </div>
          </div>

          {/* Compliance & Accuracy Notice */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>AI는 오직 위 원천 수치 데이터에만 근거하여 답변하며, 임의로 수치를 생성하지 않습니다.</span>
          </div>
        </div>
      )}

      {/* User Personal AI Settings Modal */}
      <UserAiSettingsModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
      />
    </div>
  );
};
