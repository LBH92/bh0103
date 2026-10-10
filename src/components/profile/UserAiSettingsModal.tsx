import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Sparkles, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Trash2, 
  RefreshCw, 
  Lock, 
  HelpCircle,
  Eye,
  EyeOff,
  Cpu,
  Layers,
  Info
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { userAiConnectionClient } from '../../services/userAiConnectionClient';
import { UserAiConnectionStatus } from '../../types';

export const UserAiSettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { user, requireAuth, showToast } = useApp();

  const [connectionStatus, setConnectionStatus] = useState<UserAiConnectionStatus | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');
  const [showKeyText, setShowKeyText] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load user connection status on open
  useEffect(() => {
    if (isOpen && user?.id) {
      loadStatus();
    }
  }, [isOpen, user?.id]);

  const loadStatus = async () => {
    if (!user?.id) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const status = await userAiConnectionClient.getConnectionStatus(user.id);
      setConnectionStatus(status);
      if (status.model) {
        setSelectedModel(status.model);
      }
    } catch (err: any) {
      console.warn('Failed to load AI status:', err);
      setErrorMsg(err.message || 'AI 연결 상태를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) {
      requireAuth('개인 AI 계정 연결');
      return;
    }

    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setErrorMsg('Google Gemini API 키를 입력해주세요.');
      return;
    }

    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const newStatus = await userAiConnectionClient.connectKey(user.id, trimmed, selectedModel);
      setConnectionStatus(newStatus);
      setApiKeyInput('');
      showToast('개인 Gemini AI 계정이 성공적으로 검증 및 연결되었습니다!', 'success');
    } catch (err: any) {
      setErrorMsg(err.message || 'API 키 검증에 실패했습니다. 키 권한과 활성화 상태를 확인해주세요.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    if (!user?.id) return;
    if (!window.confirm('개인 AI 연결을 해제하시겠습니까? 해제 시 서버 보안 금고에서 자격 증명이 즉시 완전 삭제되며, AI 종목 브리핑 이용이 중단됩니다.')) {
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    try {
      const newStatus = await userAiConnectionClient.disconnectKey(user.id);
      setConnectionStatus(newStatus);
      showToast('개인 AI 연결이 안전하게 해제되었습니다.', 'info');
    } catch (err: any) {
      setErrorMsg(err.message || '연결 해제 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                개인 AI 계정 연결 설정
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                개인 Google AI Studio 계정 연동 및 과금 체계 기반 AI 이용
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Security & Architecture Banner */}
        <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-800/40 text-xs text-indigo-900 dark:text-indigo-200 space-y-2">
          <div className="flex items-center gap-2 font-bold text-indigo-700 dark:text-indigo-300">
            <ShieldCheck className="w-4 h-4 text-indigo-500 shrink-0" />
            <span>운영자 비용 차단 및 개인 계정 과금 정책</span>
          </div>
          <p className="text-[11px] leading-relaxed text-indigo-800/90 dark:text-indigo-300/90">
            본 플랫폼은 투명한 AI 이용을 위해 <strong>운영자 공용 API 비용을 철저히 차단</strong>하고,
            사용자가 소유한 <strong>공식 Google AI Studio 개인 계정의 쿼터 및 과금 체계</strong>로만 AI 브리핑을 실행합니다.
            키는 서버 내 <strong>AES-256-GCM 보안 금고</strong>에 암호화되어 보호되며 외부에 절대 노출되지 않습니다.
          </p>
        </div>

        {/* Current Status Box */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">현재 연결 상태</span>
            {isLoading ? (
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> 확인 중...
              </span>
            ) : connectionStatus?.connected ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                정상 연결됨 (개인 계정 과금)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                <AlertCircle className="w-3.5 h-3.5" />
                미연결 (AI 호출 차단 상태)
              </span>
            )}
          </div>

          {connectionStatus?.connected && (
            <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span className="text-slate-400">제공업체 / 모델</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  Google Gemini ({connectionStatus.model})
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span className="text-slate-400">마스킹된 키</span>
                <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                  {connectionStatus.keyMasked}
                </span>
              </div>
              {connectionStatus.connectedAt && (
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400">연결 일시</span>
                  <span className="font-mono text-[11px] text-slate-500">
                    {new Date(connectionStatus.connectedAt).toLocaleString('ko-KR')}
                  </span>
                </div>
              )}
              {connectionStatus.callCount !== undefined && (
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400">개인 계정 호출 횟수</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {connectionStatus.callCount} 회
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error message banner */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{errorMsg}</p>
          </div>
        )}

        {/* Input / Connection Form */}
        <form onSubmit={handleConnect} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              Google Gemini API 키 입력
            </label>
            <div className="relative">
              <input
                type={showKeyText ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={e => setApiKeyInput(e.target.value)}
                placeholder="AIzaSy... (Google AI Studio 발급 키)"
                disabled={isVerifying}
                className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-hidden focus:border-purple-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowKeyText(prev => !prev)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
              >
                {showKeyText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
              <Lock className="w-3 h-3 text-emerald-500 inline" />
              키는 브라우저나 Firestore에 평문 저장되지 않으며 서버 메모리 금고에만 암호화됩니다.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              사용 모델 선택
            </label>
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
            >
              <option value="gemini-3.8-flash">gemini-3.8-flash (권장: 고속 종목 시황 분석)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (초경량 초고속)</option>
            </select>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={isVerifying || !apiKeyInput.trim()}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/20 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isVerifying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>공식 API 실시간 검증 중...</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  <span>{connectionStatus?.connected ? '새 API 키로 교체 및 재연결' : '개인 계정 검증 및 연결'}</span>
                </>
              )}
            </button>

            {connectionStatus?.connected && (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={isLoading || isVerifying}
                className="py-3 px-4 border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
                <span>연결 해제</span>
              </button>
            )}
          </div>
        </form>

        {/* How to get API key guide */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-2">
          <div className="flex items-center justify-between font-bold text-slate-700 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-500" />
              API 키 발급 방법 (Google AI Studio)
            </span>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-600 hover:underline flex items-center gap-1 font-semibold"
            >
              <span>키 발급 페이지 바로가기</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <ol className="list-decimal list-inside space-y-1 text-slate-500 dark:text-slate-400 pl-1">
            <li>Google AI Studio에 본인의 Google 계정으로 로그인합니다.</li>
            <li><strong>Get API key</strong> 메뉴에서 새 프로젝트를 선택하고 API Key를 발급받습니다.</li>
            <li>발급된 키(AIzaSy...)를 위 입력창에 붙여넣고 검증 버튼을 누르면 연동이 완료됩니다.</li>
          </ol>
        </div>
      </div>
    </div>
  );
};
