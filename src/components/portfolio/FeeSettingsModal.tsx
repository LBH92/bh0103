import React, { useState } from 'react';
import { X, Sliders, Check, RotateCcw, Info } from 'lucide-react';
import { TradingFeeSettings } from '../../types';

interface FeeSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCommissionPercent: number; // e.g. 0.015
  currentTaxPercent: number; // e.g. 0.18
  onSave: (commissionPercent: number, taxPercent: number) => void;
}

export const FeeSettingsModal: React.FC<FeeSettingsModalProps> = ({
  isOpen,
  onClose,
  currentCommissionPercent,
  currentTaxPercent,
  onSave,
}) => {
  const [commission, setCommission] = useState<string>(String(currentCommissionPercent));
  const [tax, setTax] = useState<string>(String(currentTaxPercent));

  if (!isOpen) return null;

  const handleResetToDefault = () => {
    setCommission('0.015');
    setTax('0.18');
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const commNum = parseFloat(commission);
    const taxNum = parseFloat(tax);
    if (isNaN(commNum) || commNum < 0 || isNaN(taxNum) || taxNum < 0) {
      alert('유효한 수수료율과 세율을 입력해주세요.');
      return;
    }
    onSave(commNum, taxNum);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                모의투자 수수료 및 거래세 설정
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                증권사별 조건에 맞게 수수료율과 세금을 사용자 지정합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-blue-600 dark:text-blue-400 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              수수료와 거래세는 임의 확정되지 않으며, 사용자가 언제든지 변경할 수 있습니다.
              (수수료: 매수/매도 시 적용, 거래세: 매도 시 적용)
            </span>
          </div>

          {/* 1. 매매 수수료율 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                매매 수수료율 (%)
              </label>
              <span className="text-[11px] text-slate-400">국내 일반: 0.015% ~ 0.05%</span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.001"
                min="0"
                max="5"
                value={commission}
                onChange={e => setCommission(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                placeholder="0.015"
                required
              />
              <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400">%</span>
            </div>
            <div className="flex gap-2 mt-2">
              {[0, 0.01, 0.015, 0.05].map(rate => (
                <button
                  type="button"
                  key={rate}
                  onClick={() => setCommission(String(rate))}
                  className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  {rate === 0 ? '무료(0%)' : `${rate}%`}
                </button>
              ))}
            </div>
          </div>

          {/* 2. 매도 증권거래세율 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                매도 증권거래세율 (%)
              </label>
              <span className="text-[11px] text-slate-400">KRX 기준: 0.18% (2024~2026년)</span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                max="5"
                value={tax}
                onChange={e => setTax(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                placeholder="0.18"
                required
              />
              <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400">%</span>
            </div>
            <div className="flex gap-2 mt-2">
              {[0, 0.15, 0.18, 0.20].map(rate => (
                <button
                  type="button"
                  key={rate}
                  onClick={() => setTax(String(rate))}
                  className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                >
                  {rate === 0 ? '비과세(0%)' : `${rate}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleResetToDefault}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>기본값 초기화</span>
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition-all active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>설정 적용</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
