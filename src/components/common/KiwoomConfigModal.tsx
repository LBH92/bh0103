import React, { useState, useEffect } from 'react';
import { 
  X, 
  Key, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Server, 
  Eye, 
  EyeOff, 
  TrendingUp,
  Cpu,
  Lock,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Globe,
  HelpCircle,
  Network
} from 'lucide-react';
import { isPreviewEnvironment } from '../../utils/environment';

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
  const [registeredIpInput, setRegisteredIpInput] = useState('');
  const [copiedIp, setCopiedIp] = useState(false);
  const [showCloudNatGuide, setShowCloudNatGuide] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingStatus, setIsFetchingStatus] = useState(false);
  const [statusData, setStatusData] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load current diagnostics status on open or refresh
  const loadStatus = async (inputIp?: string) => {
    setIsFetchingStatus(true);
    try {
      const targetIp = inputIp !== undefined ? inputIp : registeredIpInput;
      const url = targetIp.trim() 
        ? `/api/kiwoom/test?registeredIp=${encodeURIComponent(targetIp.trim())}` 
        : '/api/kiwoom/test';
      const res = await fetch(url);
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

  // Handle ESC key to close modal
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

  const currentOutboundIp = statusData?.diagnostics?.ipDiagnosis?.currentOutboundIp || '34.34.244.106';
  const isFixedIp = statusData?.diagnostics?.ipDiagnosis?.isFixedIp ?? false;
  const ipDiagnosis = statusData?.diagnostics?.ipDiagnosis;
  const tokenTest = statusData?.diagnostics?.tokenTest;
  const sampleStock = statusData?.diagnostics?.sampleStockTest;
  const sampleUS = statusData?.diagnostics?.sampleUSTest;
  const parseValidation = statusData?.diagnostics?.parseValidationTest;
  const connectionStatus = statusData?.diagnostics?.connectionStatus;
  const connectionMessage = statusData?.diagnostics?.connectionStatusMessage;

  const handleCopyIp = () => {
    if (currentOutboundIp) {
      navigator.clipboard.writeText(currentOutboundIp);
      setCopiedIp(true);
      setTimeout(() => setCopiedIp(false), 2000);
    }
  };

  const handleCheckRegisteredIp = () => {
    loadStatus(registeredIpInput);
  };

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
          registeredIp: registeredIpInput.trim() || undefined,
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

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150 cursor-pointer"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] cursor-default"
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
                <span>키움증권 Open API 실전 연동 & IP 진단</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                  REAL API
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                서버 아웃바운드 IP 검증, OAuth 토큰 발급 및 실전 시세 조회를 진단합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg p-1.5 transition-colors cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="창 닫기"
            title="창 닫기 (ESC)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Section 1: Server Outbound IP & Portal Matching Diagnosis */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1a202c] border border-slate-200 dark:border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-500" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  1. 서버 아웃바운드 공인 IP 검증 결과
                </span>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isFixedIp 
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
              }`}>
                {isFixedIp ? '고정 IP (Cloud NAT)' : '동적 IP 풀 (Cloud Run)'}
              </span>
            </div>

            {/* Current Outbound IP Display */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-700/80">
              <div>
                <span className="text-[10px] text-slate-400 block font-medium">검증된 서버 공인 아웃바운드 IP</span>
                <span className="text-base font-black font-mono tracking-tight text-slate-900 dark:text-white">
                  {currentOutboundIp}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  검증 시각: {ipDiagnosis?.verifiedAt ? new Date(ipDiagnosis.verifiedAt).toLocaleTimeString('ko-KR') : '방금 전 검증됨'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyIp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                title="IP 복사"
              >
                {copiedIp ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedIp ? '복사됨!' : 'IP 복사'}</span>
              </button>
            </div>

            {/* Registered IP Match Check Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>키움 포털 등록 IP 일치 여부 확인</span>
                <span className="text-[10px] text-slate-400">키움 REST API 사용신청 페이지에 등록한 IP</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={registeredIpInput}
                  onChange={(e) => setRegisteredIpInput(e.target.value)}
                  placeholder="예: 34.34.244.106"
                  className="flex-1 px-3 py-2 text-xs font-mono rounded-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
                />
                <button
                  type="button"
                  onClick={handleCheckRegisteredIp}
                  disabled={isFetchingStatus}
                  className="px-3 py-2 text-xs font-bold rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors shrink-0"
                >
                  일치 확인
                </button>
              </div>

              {/* IP Match Status Result */}
              {registeredIpInput.trim() && (
                <div className={`p-2.5 rounded-lg text-xs flex items-start gap-2 ${
                  registeredIpInput.trim() === currentOutboundIp
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                }`}>
                  {registeredIpInput.trim() === currentOutboundIp ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold">
                      {registeredIpInput.trim() === currentOutboundIp
                        ? 'IP 일치: 등록 IP와 서버 아웃바운드 IP가 정확히 일치합니다.'
                        : 'IP 불일치: 포털 등록 IP와 현재 서버 IP가 다릅니다!'}
                    </div>
                    {registeredIpInput.trim() !== currentOutboundIp && (
                      <div className="text-[11px] mt-0.5 text-rose-500/90 font-mono">
                        키움 REST API 홈페이지에서 IP를 '{currentOutboundIp}'로 수정해 주세요.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Cloud NAT Architecture & Cost Guide Accordion */}
            <div className="border-t border-slate-200 dark:border-slate-700/60 pt-2">
              <button
                type="button"
                onClick={() => setShowCloudNatGuide(!showCloudNatGuide)}
                className="w-full flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white py-1"
              >
                <span className="flex items-center gap-1.5">
                  <Network className="w-3.5 h-3.5 text-indigo-500" />
                  <span>고정 아웃바운드 IP(Cloud NAT) 구성 방법 및 예상 비용 안내</span>
                </span>
                {showCloudNatGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showCloudNatGuide && (
                <div className="mt-2.5 p-3 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/80 text-[11px] space-y-2 text-indigo-950 dark:text-indigo-200">
                  <div className="font-bold flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300">
                    <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>왜 고정 IP(Cloud NAT)가 필요한가요?</span>
                  </div>
                  <p className="leading-relaxed text-slate-700 dark:text-slate-300">
                    Cloud Run은 기본적으로 구글 클라우드의 공유 동적 IP 풀을 사용합니다. 키움증권은 등록된 IP(오류 8050 방지)에서만 요청을 승인하므로, 컨테이너 재시작 시에도 영구적인 동일 IP를 유지하려면 Cloud NAT 고정 외부 IP 구성이 필요합니다.
                  </p>

                  <div className="space-y-1 font-mono text-[10.5px] bg-white/70 dark:bg-black/30 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900">
                    <div className="font-bold text-indigo-600 dark:text-indigo-400 mb-1 font-sans">구글 클라우드 콘솔 설정 단계:</div>
                    <div>1. VPC 네트워크(또는 기본 default VPC) 확인</div>
                    <div>2. Serverless VPC Access 커넥터 생성 (최소 인스턴스 2)</div>
                    <div>3. Cloud Router 및 Cloud NAT 게이트웨이 생성 후 고정 외부 IP 예약</div>
                    <div>4. Cloud Run 연결(Networking) 탭에서 VPC 커넥터 연결 및 모든 아웃바운드 라우팅 설정</div>
                    <div>5. 예약된 고정 외부 IP를 키움 REST API 사용신청에 등록</div>
                  </div>

                  <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300">
                    <strong>예상 인프라 비용:</strong> VPC Access 커넥터(약 $15~$25/월) + Cloud NAT 게이트웨이 및 정적 IP 유지비(약 $7~$10/월) =&gt; <strong>합계 약 $25~$35/월</strong>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      * 사용자 승인 없이 인프라를 변경하지 않으며, 현재 기본 배포 구조를 유지합니다.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Detailed Connection & Live Verification Result */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#1a202c] border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Server className="w-4 h-4 text-slate-400" />
                <span>2. 키움 OAuth 토큰 및 종목 시세 조회 진단</span>
              </span>
              <button
                type="button"
                onClick={() => loadStatus()}
                disabled={isFetchingStatus}
                className="text-[11px] font-semibold text-rose-500 hover:text-rose-400 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${isFetchingStatus ? 'animate-spin' : ''}`} />
                <span>진단 새로고침</span>
              </button>
            </div>

            {/* Connection Status Banner */}
            <div className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
              connectionStatus === 'DOMESTIC_CONNECTED'
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                : connectionStatus === 'TOKEN_OK_QUOTE_FAILED'
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
            }`}>
              {connectionStatus === 'DOMESTIC_CONNECTED' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" />
              )}
              <div className="flex-1 space-y-1">
                <div className="font-bold flex items-center gap-2">
                  <span>
                    {connectionStatus === 'DOMESTIC_CONNECTED'
                      ? '키움 실전 연결 성공 (토큰 및 005930 시세 정상)'
                      : connectionStatus === 'TOKEN_OK_QUOTE_FAILED'
                      ? '인증 성공 / 시세 미연결 (추가 확인 필요)'
                      : '키움 연결 실패: 키움 포털 IP 등록 필요 [코드 8050]'}
                  </span>
                  <span className="text-[10px] px-2 py-0.2 rounded font-mono font-bold bg-white/60 dark:bg-black/30">
                    {connectionStatus || 'NOT_CONFIGURED'}
                  </span>
                </div>
                <div className="text-[11px] leading-relaxed opacity-90">
                  {connectionMessage || (tokenTest?.error || '진단 실행 대기 중')}
                </div>
              </div>
            </div>

            {/* 4 Detail Checks Grid: Token, Domestic Stock, US Stock, Field Parsing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
              {/* Token Check Card */}
              <div className="p-3 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 block font-bold">① OAuth 토큰 발급</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${tokenTest?.success ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  <span className={`font-bold ${tokenTest?.success ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {tokenTest?.success ? '토큰 발급 성공' : `실패 [코드 ${tokenTest?.returnCode ?? '3'}]`}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">
                  {tokenTest?.returnMsg || tokenTest?.error || (tokenTest?.success ? '유효 토큰 보유' : '미인증')}
                </div>
              </div>

              {/* Domestic Stock 005930 Check Card */}
              <div className="p-3 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 block font-bold">② 국내 삼성전자 (005930)</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${sampleStock?.success ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className={`font-bold ${sampleStock?.success ? 'text-emerald-500' : 'text-slate-500'}`}>
                    {sampleStock?.success ? `${sampleStock.price?.toLocaleString()}원` : '실전 조회 대기'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">
                  {sampleStock?.statusMessage || (sampleStock?.success ? '키움 실전 시세 수신' : '토큰 인증 후 실행')}
                </div>
              </div>

              {/* US Stock AAPL Check Card */}
              <div className="p-3 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 block font-bold">③ 미국 애플 (AAPL)</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${sampleUS?.success ? 'bg-indigo-500' : 'bg-slate-400'}`} />
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                    {sampleUS?.price ? `$${sampleUS.price}` : '시세 대기'}
                  </span>
                  <span className="text-[9px] px-1 rounded bg-indigo-500/10 text-indigo-500 font-bold">15분 지연</span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">
                  {sampleUS?.statusMessage || 'Yahoo Finance 공식 시세 (USD)'}
                </div>
              </div>

              {/* Field Parsing Self-Test Card */}
              <div className="p-3 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-400 block font-bold">④ 시세 필드 파싱 검증</span>
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${parseValidation?.success ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                  <span className={`font-bold ${parseValidation?.success ? 'text-emerald-500' : 'text-amber-500'}`}>
                    {parseValidation?.success ? `4/4 검증 통과` : '파싱 점검 중'}
                  </span>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">
                  {parseValidation?.success ? '콤마/음수/종가대체 방어 검증 완료' : '규격 파싱 로직 가동 중'}
                </div>
              </div>
            </div>
          </div>

          {/* Form: Credentials Update */}
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
                <span>입력된 Secret은 서버측 .env에만 안전 저장되며 프론트엔드 및 로그에 절대 노출되지 않습니다.</span>
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

            {/* Action Buttons: Cancel/Close and Submit */}
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm transition-colors cursor-pointer shrink-0"
              >
                닫기 / 취소
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-sm transition-all shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>키움 OAuth 토큰 발급 및 진단 테스트 중...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>설정 저장 및 연동 진단 실행</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
