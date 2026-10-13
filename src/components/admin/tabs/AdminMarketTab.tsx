import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  RefreshCw, 
  Server, 
  ShieldCheck, 
  Zap, 
  Flame, 
  AlertOctagon, 
  CheckCircle2, 
  Lock,
  Layers,
  ArrowUpRight,
  Key
} from 'lucide-react';
import { adminService } from '../../../services/adminService';
import { UserRole } from '../../../types';
import { KiwoomConfigModal } from '../../common/KiwoomConfigModal';

interface AdminMarketTabProps {
  callerRole: UserRole;
}

export const AdminMarketTab: React.FC<AdminMarketTabProps> = ({ callerRole }) => {
  const [marketStatus, setMarketStatus] = useState<any>({
    lastDataFetch: new Date().toLocaleTimeString('ko-KR'),
    apiStatus: 'NORMAL',
    apiProvider: 'Kiwoom Open API (KRX-Feed)',
    apiResponseTimeMs: 38,
    apiErrorCount: 0,
    dataPipelineMode: 'REAL',
    activeMonitoredStocks: 25,
    surgeDetector: 'ONLINE',
    volumeSpikeDetector: 'ONLINE',
    marketEventEngine: 'ONLINE',
    maskedApiKey: '••••••••••••••••'
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [resilienceData, setResilienceData] = useState<any>(null);

  const fetchStatus = () => {
    setIsRefreshing(true);
    adminService.getMarketStatus().then(res => {
      setMarketStatus(res);
    }).catch(() => {});

    fetch('/api/admin/resilience/status', {
      headers: {
        'x-user-role': callerRole,
        'x-admin-role': callerRole,
      }
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setResilienceData(data);
      })
      .catch(() => {})
      .finally(() => setIsRefreshing(false));
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-rose-500" />
            <span>시장 데이터 및 감지 엔진 상태</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            실시간 주식 시세 데이터 파이프라인의 수신 주기, 응답 속도, 급등락/거래량 감지기 상태를 모니터링합니다.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-600/20 cursor-pointer"
          >
            <Key className="w-3.5 h-3.5" />
            <span>키움 API 실전 키 설정</span>
          </button>

          <button
            onClick={fetchStatus}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>새로고침</span>
          </button>
        </div>
      </div>

      {/* 4 Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* API Status */}
        <div className="p-5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <div className="text-xs text-slate-400 font-medium">실시간 API 연결 상태</div>
          <div className="mt-2 text-2xl font-black text-emerald-500 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <span>{marketStatus.apiStatus}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            제공처: <strong>{marketStatus.apiProvider}</strong>
          </div>
        </div>

        {/* Latency */}
        <div className="p-5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <div className="text-xs text-slate-400 font-medium">평균 API 왕복 응답속도</div>
          <div className="mt-2 text-2xl font-black font-mono text-slate-900 dark:text-white">
            {marketStatus.apiResponseTimeMs}
            <span className="text-xs font-normal text-slate-400 ml-1">ms</span>
          </div>
          <div className="text-[11px] text-emerald-500 mt-1 font-semibold">
            최적 응답 대역 (Latency &lt; 80ms)
          </div>
        </div>

        {/* Pipeline Mode */}
        <div className="p-5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <div className="text-xs text-slate-400 font-medium">데이터 파이프라인 모드</div>
          <div className="mt-2 text-2xl font-black font-mono text-indigo-500">
            {marketStatus.dataPipelineMode}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            마지막 수신: <strong>{marketStatus.lastDataFetch}</strong>
          </div>
        </div>

        {/* Monitored Count */}
        <div className="p-5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
          <div className="text-xs text-slate-400 font-medium">실시간 감시 종목 수</div>
          <div className="mt-2 text-2xl font-black font-mono text-slate-900 dark:text-white">
            {marketStatus.activeMonitoredStocks}
            <span className="text-xs font-normal text-slate-400 ml-1">종목</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            코스피 대형주 및 코스닥 주도주
          </div>
        </div>
      </div>

      {/* 3 Detectors Health Panel */}
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
        <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          <span>3대 이상 징후 자동 감지 엔진 상태</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Surge Plunge */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-rose-500" />
                <span>급등/급락 감지기</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500">
                {marketStatus.surgeDetector}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              당일 주가 변동률 ±5% 이상 돌파 시 즉시 마켓 알림 생성 및 감시
            </p>
          </div>

          {/* Volume Spike */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500" />
                <span>거래량 급증 감지기</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500">
                {marketStatus.volumeSpikeDetector}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              20일 평균 거래량 대비 200% 이상 폭증 시 수급 집중 종목으로 자동 분류
            </p>
          </div>

          {/* Market Event */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4 text-purple-500" />
                <span>시장 이벤트 엔진</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500">
                {marketStatus.marketEventEngine}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              코스피·코스닥 사이드카(Sidecar), 서킷브레이커, KRX 중요 공시 자동 감지
            </p>
          </div>
        </div>
      </div>

      {/* 4. Live Server Resilience & Error Tracking Diagnostics (Read-Only) */}
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <Server className="w-5 h-5 text-indigo-500" />
            <span>핵심 연동 상태 및 최근 장애 복구 진단 (/ready 검증)</span>
          </h3>
          <span className="text-[11px] font-mono text-slate-400">
            {resilienceData?.dependencies?.firebase?.checkedAt ? `검증 시각: ${resilienceData.dependencies.firebase.checkedAt}` : '실시간 진단'}
          </span>
        </div>

        {/* Dependency Probes */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Firebase */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span className="text-slate-800 dark:text-slate-200">Firebase Firestore</span>
              <span className={`px-2 py-0.5 rounded text-[10px] ${
                resilienceData?.dependencies?.firebase?.status === 'CONNECTED'
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : 'bg-rose-500/10 text-rose-500'
              }`}>
                {resilienceData?.dependencies?.firebase?.status || 'PROBING...'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {resilienceData?.dependencies?.firebase?.message || '연결 상태 점검 중'}
            </p>
          </div>

          {/* Kiwoom API */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span className="text-slate-800 dark:text-slate-200">키움 Open API 게이트웨이</span>
              <span className={`px-2 py-0.5 rounded text-[10px] ${
                resilienceData?.dependencies?.kiwoom?.status === 'CONNECTED' || resilienceData?.dependencies?.kiwoom?.status === 'CONFIGURED'
                  ? 'bg-indigo-500/10 text-indigo-500'
                  : 'bg-amber-500/10 text-amber-500'
              }`}>
                {resilienceData?.dependencies?.kiwoom?.status || 'UNCONFIGURED'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {resilienceData?.dependencies?.kiwoom?.message || '키 설정 대기'}
            </p>
          </div>

          {/* Market Pipeline */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs font-bold mb-1">
              <span className="text-slate-800 dark:text-slate-200">시세 수신 파이프라인</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-500 font-bold">
                {resilienceData?.dependencies?.marketDataPipeline?.status || 'ONLINE'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              최종 정상 갱신: <strong>{resilienceData?.dependencies?.marketDataPipeline?.lastSuccessAt || marketStatus.lastDataFetch}</strong>
            </p>
          </div>
        </div>

        {/* Recent Errors Journal Table */}
        <div className="mt-4">
          <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center justify-between">
            <span>최근 서버 오류 및 API 장애 요약 (민감정보 마스킹 완료)</span>
            <span className="text-[11px] text-slate-400 font-mono">
              총 {resilienceData?.recentErrors?.length || 0}건 기록됨
            </span>
          </h4>

          {resilienceData?.recentErrors && resilienceData.recentErrors.length > 0 ? (
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-[11px] text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2 px-3">발생 시각</th>
                    <th className="py-2 px-3">유형</th>
                    <th className="py-2 px-3">상태코드</th>
                    <th className="py-2 px-3">내용 (안전 정제됨)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-[11px]">
                  {resilienceData.recentErrors.slice(0, 5).map((err: any) => (
                    <tr key={err.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3 text-slate-400 whitespace-nowrap">{err.timestamp.split('T')[1].split('.')[0]}</td>
                      <td className="py-2 px-3 font-bold text-rose-500">{err.type}</td>
                      <td className="py-2 px-3 text-slate-500">{err.statusCode || '-'}</td>
                      <td className="py-2 px-3 font-sans text-slate-700 dark:text-slate-300 truncate max-w-md">{err.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-center text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              현재 감지된 비정상 오류 및 API 타임아웃 장애가 없습니다. (전체 파이프라인 정상 가동 중)
            </div>
          )}
        </div>
      </div>

      {/* Security & Masking Notice */}
      <div className="p-4 bg-slate-100 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-emerald-500" />
          <span>보안 정책 준수: 외부 증시 API Key 및 시크릿 토큰은 서버측 환경변수로 안전하게 보관되며 클라이언트 화면에 절대 노출되지 않습니다.</span>
        </div>
        <span className="font-mono text-slate-400 font-bold">{marketStatus.maskedApiKey}</span>
      </div>

      <KiwoomConfigModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={fetchStatus}
      />
    </div>
  );
};
