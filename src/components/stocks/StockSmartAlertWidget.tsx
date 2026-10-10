import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  Newspaper, 
  Sparkles, 
  CheckSquare, 
  Square, 
  ShieldCheck, 
  Send,
  AlertCircle
} from 'lucide-react';
import { Stock, StockSmartAlert } from '../../types';
import { storageService } from '../../services/storageService';
import { useApp } from '../../context/AppContext';
import { marketMonitorClient } from '../../services/marketMonitorClient';

interface StockSmartAlertWidgetProps {
  stock: Stock;
}

export const StockSmartAlertWidget: React.FC<StockSmartAlertWidgetProps> = ({ stock }) => {
  const { showToast } = useApp();

  const [alertConfig, setAlertConfig] = useState<StockSmartAlert>(() => 
    storageService.getSmartAlertForStock(stock.symbol, stock.name)
  );

  useEffect(() => {
    setAlertConfig(storageService.getSmartAlertForStock(stock.symbol, stock.name));
  }, [stock.symbol, stock.name]);

  const handleToggle = (rule: 'rise5Percent' | 'fall5Percent' | 'volume200Percent' | 'newsAlert' | 'aiBriefingAlert', label: string) => {
    const updated = storageService.toggleSmartAlertRule(stock.symbol, rule, stock.name);
    setAlertConfig({ ...updated });
    
    const isNowActive = updated[rule];
    showToast(
      `${stock.name} [${label}] 알림이 ${isNowActive ? '활성화' : '해제'}되었습니다.`,
      isNowActive ? 'success' : 'info'
    );
  };

  const handleTestAlert = async (type: string, title: string, desc: string) => {
    try {
      await marketMonitorClient.triggerTestEvent({
        type: 'PRICE_SURGE',
        scope: 'STOCK',
        title: `[알림 테스트] ${stock.name} ${title}`,
        description: desc,
        symbol: stock.symbol,
        symbolName: stock.name,
        market: stock.market,
        metrics: {
          currentValue: 5.2,
          threshold: 5.0,
          unit: '%',
          changePercent: 5.2,
        },
      });
      showToast(`${stock.name} 실시간 모니터링 알림이 정상 발송되었습니다.`, 'success');
    } catch {
      showToast('테스트 알림 전송 실패', 'error');
    }
  };

  const items = [
    {
      key: 'rise5Percent' as const,
      label: '+5% 상승',
      detail: '주가 등락률 +5.0% 이상 돌파 시 즉시 감지 알림',
      checked: alertConfig.rise5Percent,
      icon: <TrendingUp className="w-4 h-4 text-rose-500" />,
      tagColor: 'text-rose-500 bg-rose-500/10 border-rose-500/20',
      activeText: '+5% 급등 알림 ON',
    },
    {
      key: 'fall5Percent' as const,
      label: '-5% 하락',
      detail: '주가 등락률 -5.0% 이하 급락 시 즉각 리스크 경보',
      checked: alertConfig.fall5Percent,
      icon: <TrendingDown className="w-4 h-4 text-blue-500" />,
      tagColor: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
      activeText: '-5% 급락 알림 ON',
    },
    {
      key: 'volume200Percent' as const,
      label: '거래량 200%',
      detail: '20일 평균 거래량 대비 200% 이상 폭증 시 수급 집중 포착',
      checked: alertConfig.volume200Percent,
      icon: <Zap className="w-4 h-4 text-amber-500" />,
      tagColor: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
      activeText: '거래량 200% 알림 ON',
    },
    {
      key: 'newsAlert' as const,
      label: '뉴스 발생',
      detail: '한국거래소(KRX) 주요 공시 및 핵심 속보 기사 발생 시 실시간 푸시',
      checked: alertConfig.newsAlert,
      icon: <Newspaper className="w-4 h-4 text-indigo-500" />,
      tagColor: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20',
      activeText: '속보 공시 알림 ON',
    },
    {
      key: 'aiBriefingAlert' as const,
      label: 'AI 브리핑',
      detail: 'Gemini AI 기반 당일 장마감 요약 및 특이동향 심층 브리핑 제공',
      checked: alertConfig.aiBriefingAlert,
      icon: <Sparkles className="w-4 h-4 text-purple-500" />,
      tagColor: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
      activeText: 'AI 브리핑 알림 ON',
    },
  ];

  const activeCount = items.filter(i => i.checked).length;

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <span>{stock.name} 맞춤 감지 알림</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                {activeCount}개 활성
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              원하는 시장 조건이 발생했을 때 실시간으로 즉시 알림을 수신합니다.
            </p>
          </div>
        </div>

        <button
          onClick={() => handleTestAlert('급등 알림', '알림 수신 테스트', '설정된 조건에 따라 정상적으로 알림이 발송되었습니다.')}
          className="self-start sm:self-center flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
        >
          <Send className="w-3.5 h-3.5 text-rose-500" />
          <span>테스트 발송</span>
        </button>
      </div>

      {/* 5 Checklist Items */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(item => (
          <div
            key={item.key}
            onClick={() => handleToggle(item.key, item.label)}
            className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 select-none ${
              item.checked
                ? 'bg-slate-50/80 dark:bg-slate-800/40 border-slate-300 dark:border-slate-700 shadow-xs'
                : 'bg-white dark:bg-[#131722] border-slate-200 dark:border-slate-800/60 opacity-60 hover:opacity-100'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  className="text-slate-900 dark:text-white"
                  aria-label={item.label}
                >
                  {item.checked ? (
                    <CheckSquare className="w-5 h-5 text-rose-600 dark:text-rose-500 fill-rose-600/10" />
                  ) : (
                    <Square className="w-5 h-5 text-slate-400" />
                  )}
                </button>
                <div className="flex items-center gap-1.5">
                  {item.icon}
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    {item.label}
                  </span>
                </div>
              </div>

              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${item.checked ? item.tagColor : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-transparent'}`}>
                {item.checked ? 'ON' : 'OFF'}
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {item.detail}
            </p>
          </div>
        ))}

        {/* Status card */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/20 border border-dashed border-slate-200 dark:border-slate-800 flex flex-col justify-center gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-bold">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>서버 실시간 감지 연동</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            체크된 모든 조건은 서버 모니터링 엔진에서 4초 주기로 실시간 검증되며, 중복 방지 쿨다운이 적용됩니다.
          </p>
          <div className="text-[10px] font-mono text-slate-400">
            상태: {alertConfig.updatedAt}
          </div>
        </div>
      </div>
    </div>
  );
};
