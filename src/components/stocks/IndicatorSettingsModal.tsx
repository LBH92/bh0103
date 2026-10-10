import React from 'react';
import { IndicatorSettings } from '../../utils/chartIndicators';
import { X, Check } from 'lucide-react';

interface IndicatorSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: IndicatorSettings;
  onChange: (newSettings: IndicatorSettings) => void;
}

export const IndicatorSettingsModal: React.FC<IndicatorSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onChange,
}) => {
  if (!isOpen) return null;

  const updateMA = (key: string, value: any) => {
    onChange({
      ...settings,
      ma: { ...settings.ma, [key]: value },
    });
  };

  const updateEMA = (key: string, value: any) => {
    onChange({
      ...settings,
      ema: { ...settings.ema, [key]: value },
    });
  };

  const updateBollinger = (key: string, value: any) => {
    onChange({
      ...settings,
      bollinger: { ...settings.bollinger, [key]: value },
    });
  };

  const updateRSI = (key: string, value: any) => {
    onChange({
      ...settings,
      rsi: { ...settings.rsi, [key]: value },
    });
  };

  const updateMACD = (key: string, value: any) => {
    onChange({
      ...settings,
      macd: { ...settings.macd, [key]: value },
    });
  };

  const updateStochastic = (key: string, value: any) => {
    onChange({
      ...settings,
      stochastic: { ...settings.stochastic, [key]: value },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-bold text-base text-slate-900 dark:text-white">
            차트 보조지표 및 파라미터 설정
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto font-sans text-xs">
          {/* Moving Averages (MA) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                이동평균선 (MA)
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.ma.enabled}
                  onChange={(e) => updateMA('enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
              </label>
            </div>

            {settings.ma.enabled && (
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={settings.ma.ma5}
                    onChange={(e) => updateMA('ma5', e.target.checked)}
                    className="accent-amber-500"
                  />
                  <span className="font-semibold text-amber-500 font-mono">MA1</span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={settings.ma.period5}
                    onChange={(e) => updateMA('period5', Math.max(1, parseInt(e.target.value) || 5))}
                    className="w-14 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 font-mono text-center dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={settings.ma.ma20}
                    onChange={(e) => updateMA('ma20', e.target.checked)}
                    className="accent-purple-500"
                  />
                  <span className="font-semibold text-purple-500 font-mono">MA2</span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={settings.ma.period20}
                    onChange={(e) => updateMA('period20', Math.max(1, parseInt(e.target.value) || 20))}
                    className="w-14 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 font-mono text-center dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={settings.ma.ma60}
                    onChange={(e) => updateMA('ma60', e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span className="font-semibold text-emerald-500 font-mono">MA3</span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={settings.ma.period60}
                    onChange={(e) => updateMA('period60', Math.max(1, parseInt(e.target.value) || 60))}
                    className="w-14 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 font-mono text-center dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <input
                    type="checkbox"
                    checked={settings.ma.ma120}
                    onChange={(e) => updateMA('ma120', e.target.checked)}
                    className="accent-cyan-500"
                  />
                  <span className="font-semibold text-cyan-500 font-mono">MA4</span>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={settings.ma.period120}
                    onChange={(e) => updateMA('period120', Math.max(1, parseInt(e.target.value) || 120))}
                    className="w-14 px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 font-mono text-center dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* EMA (지수이동평균) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-slate-800 dark:text-slate-200 block">
                  지수이동평균 (EMA)
                </span>
                <span className="text-[11px] text-slate-400">최근 주가에 가중치를 둔 지수 이동평균</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.ema.enabled}
                  onChange={(e) => updateEMA('enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
              </label>
            </div>
            {settings.ema.enabled && (
              <div className="flex items-center gap-3 pt-1">
                <span className="text-slate-600 dark:text-slate-300">기간 (Period):</span>
                <input
                  type="number"
                  min="2"
                  max="200"
                  value={settings.ema.period}
                  onChange={(e) => updateEMA('period', Math.max(2, parseInt(e.target.value) || 20))}
                  className="w-16 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 font-mono text-center dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            )}
          </div>

          {/* Bollinger Bands */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-slate-800 dark:text-slate-200 block">
                  볼린저 밴드 (Bollinger Bands)
                </span>
                <span className="text-[11px] text-slate-400">상한/중심/하한선 변동성 밴드</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.bollinger.enabled}
                  onChange={(e) => updateBollinger('enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
              </label>
            </div>
            {settings.bollinger.enabled && (
              <div className="flex items-center gap-4 pt-1 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 dark:text-slate-300">기간:</span>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={settings.bollinger.period}
                    onChange={(e) => updateBollinger('period', Math.max(5, parseInt(e.target.value) || 20))}
                    className="w-14 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 font-mono text-center dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 dark:text-slate-300">표준편차 (k):</span>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    max="4"
                    value={settings.bollinger.stdDev}
                    onChange={(e) => updateBollinger('stdDev', parseFloat(e.target.value) || 2)}
                    className="w-14 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 font-mono text-center dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* VWAP */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="font-bold text-sm text-slate-800 dark:text-slate-200 block">
                거래량가중평균가 (VWAP)
              </span>
              <span className="text-[11px] text-slate-400">기관/외인 매매 주요 벤치마크 지표</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.vwap.enabled}
                onChange={(e) => onChange({ ...settings, vwap: { enabled: e.target.checked } })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
            </label>
          </div>

          {/* RSI (Relative Strength Index) */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-slate-800 dark:text-slate-200 block">
                  RSI (상대강도지수)
                </span>
                <span className="text-[11px] text-slate-400">과매수(70) / 과매도(30) 모멘텀 지표</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.rsi.enabled}
                  onChange={(e) => updateRSI('enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
              </label>
            </div>
            {settings.rsi.enabled && (
              <div className="flex items-center gap-3 pt-1">
                <span className="text-slate-600 dark:text-slate-300">기간 (Period):</span>
                <input
                  type="number"
                  min="2"
                  max="100"
                  value={settings.rsi.period}
                  onChange={(e) => updateRSI('period', Math.max(2, parseInt(e.target.value) || 14))}
                  className="w-16 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 font-mono text-center dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            )}
          </div>

          {/* MACD */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-slate-800 dark:text-slate-200 block">
                  MACD (이동평균 수렴확산)
                </span>
                <span className="text-[11px] text-slate-400">MACD선, 시그널선, 오실레이터 히스토그램</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.macd.enabled}
                  onChange={(e) => updateMACD('enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
              </label>
            </div>
            {settings.macd.enabled && (
              <div className="grid grid-cols-3 gap-2 pt-1 font-mono">
                <div>
                  <span className="text-[11px] text-slate-400 block mb-0.5">단기(Fast)</span>
                  <input
                    type="number"
                    min="2"
                    max="50"
                    value={settings.macd.fastPeriod}
                    onChange={(e) => updateMACD('fastPeriod', Math.max(2, parseInt(e.target.value) || 12))}
                    className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-center dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-0.5">장기(Slow)</span>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={settings.macd.slowPeriod}
                    onChange={(e) => updateMACD('slowPeriod', Math.max(5, parseInt(e.target.value) || 26))}
                    className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-center dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block mb-0.5">시그널</span>
                  <input
                    type="number"
                    min="2"
                    max="50"
                    value={settings.macd.signalPeriod}
                    onChange={(e) => updateMACD('signalPeriod', Math.max(2, parseInt(e.target.value) || 9))}
                    className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-center dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Stochastic */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-sm text-slate-800 dark:text-slate-200 block">
                  스토캐스틱 (Stochastic)
                </span>
                <span className="text-[11px] text-slate-400">%K 및 %D 오실레이터</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.stochastic.enabled}
                  onChange={(e) => updateStochastic('enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-500"></div>
              </label>
            </div>
            {settings.stochastic.enabled && (
              <div className="flex items-center gap-4 pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 dark:text-slate-300 font-mono">%K:</span>
                  <input
                    type="number"
                    min="2"
                    max="50"
                    value={settings.stochastic.kPeriod}
                    onChange={(e) => updateStochastic('kPeriod', Math.max(2, parseInt(e.target.value) || 14))}
                    className="w-14 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 font-mono text-center dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 dark:text-slate-300 font-mono">%D:</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={settings.stochastic.dPeriod}
                    onChange={(e) => updateStochastic('dPeriod', Math.max(1, parseInt(e.target.value) || 3))}
                    className="w-14 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 font-mono text-center dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-sm transition-colors flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>설정 적용 완료</span>
          </button>
        </div>
      </div>
    </div>
  );
};
