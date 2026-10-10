import React, { useState, useEffect } from 'react';
import { 
  X, 
  Key, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Server, 
  Globe, 
  Eye, 
  EyeOff, 
  TrendingUp,
  Cpu,
  Lock
} from 'lucide-react';

interface KiwoomConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const KiwoomConfigModal: React.FC<KiwoomConfigModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [isMock, setIsMock] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingStatus, setIsFetchingStatus] = useState(false);
  const [statusData, setStatusData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load current diagnostics status on open
  const loadStatus = async () => {
    setIsFetchingStatus(true);
    try {
      const res = await fetch('/api/kiwoom/test');
      if (res.ok) {
        const data = await res.json();
        setStatusData(data);
      }
    } catch (err: any) {
      console.log('Error fetching kiwoom status:', err.message);
    } finally {
      setIsFetchingStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStatus();
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appKey.trim() || !appSecret.trim()) {
      setErrorMessage('App Key와 App Secret을 모두 입력해 주세요.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/kiwoom/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appKey: appKey.trim(),
          appSecret: appSecret.trim(),
          isMock,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '설정 저장에 실패했습니다.');
      }

      setStatusData(data);
      setAppSecret(''); // Clear plain secret from memory

      if (data.diagnostics?.tokenTest?.success) {
        setSuccessMessage('키움 실전 OAuth 인증 및 토큰 발급에 성공했습니다!');
        onSuccess?.();
      } else if (data.diagnostics?.tokenTest?.error) {
        setErrorMessage(data.diagnostics.tokenTest.error);
      } else {
        setSuccessMessage('환경설정이 저장되었습니다.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || '서버 통신 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const isConfigured = statusData?.configured;
  const tokenSuccess = statusData?.diagnostics?.tokenTest?.success;
  const sampleStock = statusData?.diagnostics?.sampleStockTest;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="w-full max-w-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#181c28]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>키움증권 Open API 실전 연동 설정</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                  REAL API
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                서버 환경변수(.env)에 실전 App Key/Secret을 안전하게 저장하고 인증을 테스트합니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Current Status Box */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1a202c] border border-slate-200 dark:border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Server className="w-4 h-4 text-slate-400" />
                <span>현재 서버 연결 상태</span>
              </span>
              <button
                type="button"
                onClick={loadStatus}
                disabled={isFetchingStatus}
                className="text-[11px] font-semibold text-rose-500 hover:text-rose-400 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isFetchingStatus ? 'animate-spin' : ''}`} />
                <span>상태 새로고침</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">설정 상태</span>
                <span className={`font-bold ${isConfigured ? 'text-emerald-500' : 'text-slate-400'}`}>
                  {isConfigured ? 'configured=true' : '미설정'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">App Key 탑재</span>
                <span className={`font-bold ${statusData?.diagnostics?.hasAppKey ? 'text-emerald-500' : 'text-slate-400'}`}>
                  {statusData?.diagnostics?.hasAppKey ? 'hasAppKey=true' : '없음'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">App Secret 탑재</span>
                <span className={`font-bold ${statusData?.diagnostics?.hasAppSecret ? 'text-emerald-500' : 'text-slate-400'}`}>
                  {statusData?.diagnostics?.hasAppSecret ? 'hasAppSecret=true' : '없음'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">OAuth 토큰 인증</span>
                <span className={`font-bold ${tokenSuccess ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {tokenSuccess ? 'tokenTest=success' : '인증 대기/실패'}
                </span>
              </div>
            </div>

            {/* If Samsung Electronics tested */}
            {sampleStock?.success && sampleStock?.stockData && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>삼성전자(005930) 실시간 현재가 수신 성공</span>
                </div>
                <div className="font-mono font-bold text-slate-900 dark:text-white">
                  {sampleStock.stockData.price?.toLocaleString()}원 ({sampleStock.stockData.changePercent > 0 ? '+' : ''}{sampleStock.stockData.changePercent}%)
                </div>
              </div>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                실전투자 App Key
              </label>
              <input
                type="text"
                value={appKey}
                onChange={(e) => setAppKey(e.target.value)}
                placeholder="키움증권 발급 실전 App Key 입력"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#1a202c] border border-slate-200 dark:border-slate-700/80 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/40"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  실전투자 App Secret
                </label>
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="text-[11px] text-slate-400 hover:text-slate-300 flex items-center gap-1"
                >
                  {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{showSecret ? '비밀번호 숨기기' : '표시'}</span>
                </button>
              </div>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder="키움증권 발급 실전 App Secret 입력"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#1a202c] border border-slate-200 dark:border-slate-700/80 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/40"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3 text-emerald-500" />
                <span>입력된 Secret은 서버측 .env에만 저장되며 로그 및 프론트엔드에 절대 노출되지 않습니다.</span>
              </p>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{errorMessage}</div>
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>키움 OAuth 토큰 발급 및 진단 테스트 중...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>설정 저장 및 연동 테스트 실행</span>
                </>
              )}
            </button>
          </form>

          {/* IP Registration Guide */}
          <div className="p-4 rounded-xl bg-slate-100 dark:bg-[#181c28] border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Globe className="w-4 h-4 text-indigo-400" />
              <span>키움증권 실전투자 IP 등록 안내</span>
            </div>
            <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
              키움증권 실전투자 REST API는 등록된 공인 IP에서만 토큰 발급이 허용됩니다. 키움증권 홈페이지 &gt; Open API 신청 &gt; 사용 IP 등록에 서버 IP를 등록해 주세요:
            </p>
            <div className="font-mono font-bold bg-white dark:bg-[#0f121a] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-rose-500 flex items-center justify-between">
              <span>서버 아웃바운드 IP: 34.34.244.40 (또는 34.34.244.150)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
