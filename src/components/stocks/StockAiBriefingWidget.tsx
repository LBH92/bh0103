import React, { useState } from 'react';
import { Sparkles, Loader2, Target, ShieldAlert, TrendingUp, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Stock } from '../../types';
import { generateStockAiBriefing, AiStockBriefingResult } from '../../services/geminiService';

interface StockAiBriefingWidgetProps {
  stock: Stock;
}

export const StockAiBriefingWidget: React.FC<StockAiBriefingWidgetProps> = ({ stock }) => {
  const [briefing, setBriefing] = useState<AiStockBriefingResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const res = await generateStockAiBriefing(stock);
      setBriefing(res);
    } catch (err) {
      console.error('Failed to generate briefing:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const sentimentColors = {
    strong_buy: 'bg-rose-500/10 text-rose-500 border-rose-500/30',
    buy: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    hold: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    sell: 'bg-blue-500/10 text-blue-500 border-blue-500/30',
  };

  return (
    <div className="bg-gradient-to-br from-white via-slate-50 to-rose-50/20 dark:from-[#131722] dark:via-[#131722] dark:to-rose-950/20 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white shadow-md shadow-rose-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                Gemini AI 실시간 종목 브리핑
              </h3>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">
                AI 퀀트 모델
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              최신 재무지표, 실시간 수급, 거래량 급증률 및 차트 패턴 심층 분석
            </p>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          disabled={isLoading}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-slate-400 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all self-start sm:self-auto cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>AI 분석 중...</span>
            </>
          ) : (
            <>
              <RefreshCw className="w-3.5 h-3.5" />
              <span>{briefing ? '브리핑 다시 받기' : 'AI 종합 브리핑 분석'}</span>
            </>
          )}
        </button>
      </div>

      {briefing ? (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Top Rating & Target Price Band */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-white dark:bg-[#1a1f2e] border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-xs text-slate-400 block mb-1">AI 투자 의견</span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${
                  sentimentColors[briefing.sentiment]
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {briefing.sentimentLabel}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block mb-1">예상 적정 주가 밴드</span>
              <div className="font-mono font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <Target className="w-4 h-4 text-rose-500" />
                <span>{briefing.targetPriceRange.low.toLocaleString()}원</span>
                <span className="text-slate-400">~</span>
                <span className="text-rose-500">{briefing.targetPriceRange.high.toLocaleString()}원</span>
              </div>
            </div>
          </div>

          {/* Executive Summary */}
          <div className="p-3.5 rounded-xl bg-white dark:bg-[#1a1f2e] border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            <strong className="text-slate-900 dark:text-white block mb-1 font-semibold">
              💡 핵심 요약
            </strong>
            {briefing.summary}
          </div>

          {/* Catalysts & Risks */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-center gap-1.5 font-bold text-xs text-emerald-600 dark:text-emerald-400 mb-2">
                <TrendingUp className="w-3.5 h-3.5" />
                주요 상승 모멘텀 (Catalysts)
              </div>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                {briefing.catalysts.map((cat, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-emerald-500 shrink-0">•</span>
                    <span>{cat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20">
              <div className="flex items-center gap-1.5 font-bold text-xs text-rose-600 dark:text-rose-400 mb-2">
                <ShieldAlert className="w-3.5 h-3.5" />
                하방 리스크 요인 (Risks)
              </div>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                {briefing.risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-rose-500 shrink-0">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Technical Analyst View */}
          <div className="p-3 rounded-xl bg-white dark:bg-[#1a1f2e] border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-white block mb-1 font-semibold">
              📈 기술적 차트 견해
            </strong>
            {briefing.technicalView}
          </div>

          <p className="text-[11px] text-slate-400 text-right">
            * 본 브리핑은 투자 참고용 데이터이며 최종 투자 결정과 책임은 투자자 본인에게 있습니다.
          </p>
        </div>
      ) : (
        <div className="py-6 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
          <p className="text-xs sm:text-sm font-medium">
            'AI 종합 브리핑 분석' 버튼을 누르면 Gemini AI 모델이 즉시 심층 분석 리포트를 생성합니다.
          </p>
        </div>
      )}
    </div>
  );
};
