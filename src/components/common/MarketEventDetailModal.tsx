import React, { useEffect } from 'react';
import { 
  X, 
  AlertOctagon, 
  ShieldAlert, 
  TrendingUp, 
  FileText, 
  BarChart2, 
  Clock, 
  Globe, 
  ExternalLink, 
  AlertTriangle,
  Info,
  ArrowRight,
  RefreshCw,
  Building2,
  CheckCircle2
} from 'lucide-react';
import { MarketEvent } from '../../types';

interface MarketEventDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: MarketEvent | null;
  onNavigateToStock?: (symbol: string) => void;
}

export const MarketEventDetailModal: React.FC<MarketEventDetailModalProps> = ({
  isOpen,
  onClose,
  event,
  onNavigateToStock,
}) => {
  // ESC key handler to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Error / Not found fallback state
  if (!event) {
    return (
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150 cursor-pointer"
        onClick={onClose}
      >
        <div 
          className="w-full max-w-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 cursor-default text-center"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              시장 이벤트 정보를 찾을 수 없습니다
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              요청하신 이벤트 데이터가 이미 종료되었거나 식별자가 올바르지 않습니다.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Event category metadata
  const getEventBadge = () => {
    switch (event.type) {
      case 'sidecar':
        return {
          label: '시장 조치 (사이드카 발동)',
          icon: <AlertOctagon className="w-4 h-4" />,
          color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
          accent: 'border-l-4 border-l-amber-500',
        };
      case 'circuit_breaker':
        return {
          label: '시장 조치 (서킷브레이커 매매중단)',
          icon: <ShieldAlert className="w-4 h-4" />,
          color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
          accent: 'border-l-4 border-l-rose-500',
        };
      case 'disclosure':
        return {
          label: 'KRX 주요 공시 이벤트',
          icon: <FileText className="w-4 h-4" />,
          color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
          accent: 'border-l-4 border-l-purple-500',
        };
      case 'earnings':
        return {
          label: '실적 발표 서프라이즈',
          icon: <BarChart2 className="w-4 h-4" />,
          color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
          accent: 'border-l-4 border-l-emerald-500',
        };
      case 'macro':
      default:
        return {
          label: '거시경제 주요 시장 이벤트',
          icon: <TrendingUp className="w-4 h-4" />,
          color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
          accent: 'border-l-4 border-l-blue-500',
        };
    }
  };

  const badge = getEventBadge();

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150 cursor-pointer"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#181c28]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-2 rounded-xl shrink-0 ${
              event.severity === 'urgent' 
                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' 
                : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
            }`}>
              {badge.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badge.color}`}>
                  {badge.label}
                </span>
                {event.market && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    {event.market}
                  </span>
                )}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                  event.severity === 'urgent'
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                }`}>
                  {event.severity === 'urgent' ? '긴급 시장조치' : event.severity === 'warning' ? '주의' : '정보'}
                </span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate mt-1">
                시장 이벤트 상세 정보
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg p-1.5 transition-colors cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0 ml-2"
            aria-label="창 닫기"
            title="창 닫기 (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Main Title & Time Card */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1a202c] border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1.5 font-mono">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>발생 시각: {event.timestamp}</span>
              </span>
              <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{event.active ? '실시간 발동 중' : '발동 해제/종료'}</span>
              </span>
            </div>

            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white leading-snug">
              {event.title}
            </h2>

            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed pt-1">
              {event.description}
            </p>
          </div>

          {/* Related Stock (If Available) */}
          {event.symbol && (
            <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold block">
                    영향 대상 종목
                  </span>
                  <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                    {event.symbolName || event.symbol}
                    <span className="font-mono text-xs font-normal text-slate-400 ml-1.5">
                      ({event.symbol})
                    </span>
                  </div>
                </div>
              </div>

              {onNavigateToStock && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToStock(event.symbol!);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors flex items-center gap-1 shrink-0 cursor-pointer shadow-sm"
                >
                  <span>종목 시세 보기</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Market Regulation / Operating Rules Box */}
          <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/80 space-y-2 text-xs">
            <div className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>한국거래소(KRX) 시장 조치 제도 안내</span>
            </div>

            {event.type === 'sidecar' ? (
              <div className="space-y-1.5 text-slate-700 dark:text-slate-300 leading-relaxed text-[11.5px]">
                <div>
                  <strong>발동 요건:</strong> 선물시장이 기준가 대비 6%(코스닥) / 5%(코스피) 이상 급변하여 1분간 지속될 때 발동됩니다.
                </div>
                <div>
                  <strong>조치 효과:</strong> 발동 시점부터 <strong>5분간 프로그램 매매호가의 효력이 정지</strong>되며, 5분이 경과하면 자동 해제됩니다. (1일 1회만 발동되며, 장 개시 후 5분 전 및 장 종료 40분 전에는 발동되지 않음)
                </div>
                <div>
                  <strong>투자 유의:</strong> 선물 시장의 일시적 수급 왜곡 현상으로 인해 개별 현물 종목의 변동성이 확대될 수 있으므로 분할 매매가 권장됩니다.
                </div>
              </div>
            ) : event.type === 'circuit_breaker' ? (
              <div className="space-y-1.5 text-slate-700 dark:text-slate-300 leading-relaxed text-[11.5px]">
                <div>
                  <strong>발동 요건:</strong> 코스피/코스닥 지수가 전일 대비 8%(1단계), 15%(2단계), 20%(3단계) 하락 시 순차 발동됩니다.
                </div>
                <div>
                  <strong>조치 효과:</strong> 1~2단계 발동 시 <strong>20분간 전 종목 매매거래가 전면 중단</strong>되며, 이후 10분간 단일가 호가 접수 후 거래가 재개됩니다. 3단계 발동 시 당일 시장이 조기 종료됩니다.
                </div>
              </div>
            ) : (
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed text-[11.5px]">
                본 이벤트는 한국거래소(KRX) 공시 데이터 및 글로벌 시장 피드를 기반으로 자동 감지되었습니다. 시장 급변 시 모의투자 계좌의 지정가 주문은 시장 조건 충족 여부에 따라 순차 체결됩니다.
              </p>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#181c28]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-bold transition-colors cursor-pointer"
          >
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  );
};
