import React, { useState } from 'react';
import { 
  Sparkles, 
  Send, 
  Clock, 
  Search, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  DollarSign, 
  Newspaper, 
  Activity, 
  AlertCircle, 
  ShieldCheck, 
  ChevronRight,
  Database,
  CheckCircle2,
  HelpCircle,
  Key
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { aiBriefingClient, AiBriefingResponse } from '../../services/aiBriefingClient';
import { UserAiSettingsModal } from '../profile/UserAiSettingsModal';

export const StockInsightAiBriefing: React.FC = () => {
  const { stocks, navigateToStock, showToast, user, requireAuth } = useApp();

  const [query, setQuery] = useState<string>('삼성전자 오늘 왜 오르고 있어?');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('005930');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [briefing, setBriefing] = useState<AiBriefingResponse | null>(null);

  const exampleQuestions = [
    { text: '삼성전자 오늘 왜 오르고 있어?', symbol: '005930' },
    { text: 'SK하이닉스 수급 및 주요 데이터 브리핑해줘', symbol: '000660' },
    { text: '현대차 거래량 급증 및 뉴스 분석', symbol: '005380' },
    { text: '한미반도체 오늘 주가와 시장 상황 알려줘', symbol: '042700' },
  ];

  const handleRequest = async (targetQuery?: string, targetSymbol?: string) => {
    const q = (targetQuery || query).trim();
    if (!q) {
      showToast('질문을 입력해주세요.', 'error');
      return;
    }

    if (!user) {
      requireAuth('AI 종목 브리핑');
      return;
    }

    setIsLoading(true);
    try {
      const res = await aiBriefingClient.requestBriefing(q, targetSymbol || selectedSymbol, user.id);
      setBriefing(res);
      showToast(`${res.symbolName} AI 브리핑이 성공적으로 생성되었습니다.`, 'success');
    } catch (err: any) {
      const msg = err?.message || '브리핑 생성 중 오류가 발생했습니다.';
      showToast(msg, 'error');
      if (msg.includes('개인 Gemini AI 계정') || msg.includes('AI_NOT_CONNECTED')) {
        setIsAiModalOpen(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectExample = (ex: { text: string; symbol: string }) => {
    setQuery(ex.text);
    setSelectedSymbol(ex.symbol);
    handleRequest(ex.text, ex.symbol);
  };

  return (
    <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-lg text-slate-900 dark:text-white">
                Gemini 기반 AI 종목 브리핑
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-500/10 text-purple-500 border border-purple-500/20 font-mono">
                FACT-CHECKED AI
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Gemini가 임의로 숫자를 창작하지 않으며, 5대 전용 서버 함수로부터 실제 주가·거래량·공시 데이터를 조회한 뒤 구조화된 브리핑을 제공합니다.
            </p>
          </div>
        </div>

        {/* Server Data Functions Indicator & Key Settings */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAiModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-600 dark:text-purple-400 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <Key className="w-3.5 h-3.5" />
            <span>개인 AI 연결 설정</span>
          </button>
          <div className="hidden lg:flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500 dark:text-slate-400">
            <Database className="w-3.5 h-3.5 text-emerald-500" />
            <span>서버 함수 5개 연동</span>
          </div>
        </div>
      </div>

      {/* Input Form & Example chips */}
      <div className="space-y-3">
        <form
          onSubmit={e => {
            e.preventDefault();
            handleRequest();
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          {/* Stock selector dropdown */}
          <select
            value={selectedSymbol}
            onChange={e => setSelectedSymbol(e.target.value)}
            className="sm:w-44 px-3.5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
          >
            {stocks.map(s => (
              <option key={s.symbol} value={s.symbol}>
                {s.name} ({s.symbol})
              </option>
            ))}
          </select>

          {/* Question text input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="예: 삼성전자 오늘 왜 오르고 있어? (자연어로 질문하세요)"
              className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-purple-500"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/20 transition-all cursor-pointer shrink-0 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>데이터 수집 및 분석 중...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>AI 브리핑 받기</span>
              </>
            )}
          </button>
        </form>

        {/* Quick Example Question Chips */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-400 font-medium flex items-center gap-1">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>추천 질문:</span>
          </span>
          {exampleQuestions.map((ex, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectExample(ex)}
              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer text-[11px]"
            >
              {ex.text}
            </button>
          ))}
        </div>
      </div>

      {/* Briefing Result Display */}
      {briefing && (
        <div className="mt-4 p-5 sm:p-6 bg-slate-50 dark:bg-[#0c0f17] border border-purple-500/30 rounded-2xl space-y-5 animate-in fade-in duration-200">
          {/* Header of Result: Timestamp & Stock summary */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-black text-lg text-slate-900 dark:text-white">
                    {briefing.symbolName}
                  </h4>
                  <span className="font-mono text-xs text-slate-400">
                    {briefing.symbol}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                    Gemini 3.8 Flash
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  <span>데이터 기준 시간: {briefing.dataTimestamp}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => navigateToStock(briefing.symbol)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs self-start sm:self-auto"
            >
              <span>종목 상세 차트 보기</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Real Quote Facts Bar */}
          {briefing.quote && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 text-[10px] block">현재가</span>
                <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                  {briefing.quote.price.toLocaleString()}원
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 text-[10px] block">등락률</span>
                <span className={`font-mono font-bold text-sm ${
                  briefing.quote.change >= 0 ? 'text-rose-500' : 'text-blue-500'
                }`}>
                  {briefing.quote.change >= 0 ? '+' : ''}{briefing.quote.changePercent}%
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 text-[10px] block">당일 거래량</span>
                <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                  {briefing.quote.volume.toLocaleString()}주
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 text-[10px] block">거래대금</span>
                <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                  {briefing.quote.tradingValue.toLocaleString()}억
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 text-[10px] block">시가 / 전일종가</span>
                <span className="font-mono font-bold text-xs text-slate-700 dark:text-slate-300">
                  {briefing.quote.openPrice.toLocaleString()} / {briefing.quote.prevClose.toLocaleString()}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <span className="text-slate-400 text-[10px] block">고가 / 저가</span>
                <span className="font-mono font-bold text-xs text-slate-700 dark:text-slate-300">
                  {briefing.quote.highPrice.toLocaleString()} / {briefing.quote.lowPrice.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* 5-Section Markdown Content */}
          <div className="prose dark:prose-invert max-w-none text-xs sm:text-sm text-slate-800 dark:text-slate-200 space-y-4 leading-relaxed whitespace-pre-line bg-white dark:bg-[#131722] p-5 rounded-2xl border border-slate-200 dark:border-slate-800">
            {briefing.content}
          </div>

          {/* Guardrail & Compliance Notice */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
            <div className="space-y-0.5 leading-relaxed">
              <strong>투자자 유의사항 & AI 윤리 원칙:</strong>
              <p>
                본 브리핑은 서버로부터 전달된 검증된 수치 데이터만을 기반으로 생성되었으며, "무조건 오른다", "반드시 매수해야 한다"와 같은 단정적인 투자 권유는 포함하지 않습니다. 투자 결정의 최종 책임은 투자자 본인에게 있습니다.
              </p>
            </div>
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
