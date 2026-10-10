import React from 'react';
import { 
  Users, 
  UserPlus, 
  Activity, 
  FileText, 
  MessageSquare, 
  ShieldAlert, 
  MessagesSquare, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  ArrowUpRight, 
  TrendingUp,
  Clock,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { adminService } from '../../../services/adminService';
import { AdminSubTab, UserProfile, CommunityPost, AdminReport } from '../../../types';

interface AdminDashboardTabProps {
  onNavigateTab: (tab: AdminSubTab) => void;
  users: UserProfile[];
  posts: CommunityPost[];
  reports: AdminReport[];
}

export const AdminDashboardTab: React.FC<AdminDashboardTabProps> = ({
  onNavigateTab,
  users,
  posts,
  reports,
}) => {
  const metrics = adminService.getDashboardMetrics();

  // Recent subsets
  const recentReports = reports.slice(0, 4);
  const recentUsers = users.slice(0, 4);
  const recentPosts = posts.slice(0, 4);

  // Weekly Activity Trend Data
  const trendDays = ['월', '화', '수', '목', '금', '토', '일'];
  const signupTrend = [12, 18, 15, 24, 30, 42, 28];
  const postTrend = [45, 62, 58, 80, 95, 110, 78];
  const reportTrend = [2, 1, 4, 3, 7, 5, 2];

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-2xl shadow-sm border border-slate-700/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-rose-500 text-white">
              LIVE MONITOR
            </span>
            <span className="text-xs text-slate-300 font-mono">
              실시간 증시 커뮤니티 통합 관제 센터
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black mt-1.5 tracking-tight">
            시스템 대시보드 및 운영 현황
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
            회원 활동, 게시글, 실시간 채팅, 이상 징후 및 외부 API 연결 상태를 실시간으로 모니터링합니다.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <div className="px-3.5 py-2 bg-white/10 backdrop-blur-md rounded-xl text-center border border-white/10">
            <span className="text-[10px] text-slate-300 block">시스템 가동시간</span>
            <span className="text-sm font-black font-mono text-emerald-400">99.98%</span>
          </div>
          <div className="px-3.5 py-2 bg-white/10 backdrop-blur-md rounded-xl text-center border border-white/10">
            <span className="text-[10px] text-slate-300 block">전체 상태</span>
            <span className="text-sm font-black text-emerald-400 flex items-center justify-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              정상
            </span>
          </div>
        </div>
      </div>

      {/* 2. 8 KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Users */}
        <div 
          onClick={() => onNavigateTab('users')}
          className="p-4 sm:p-5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">전체 회원 수</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-slate-900 dark:text-white">
            {metrics.totalUsers.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">명</span>
          </div>
          <div className="text-[11px] text-emerald-500 font-semibold mt-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>정상 계정 100% 보호 중</span>
          </div>
        </div>

        {/* Today Signups */}
        <div 
          onClick={() => onNavigateTab('users')}
          className="p-4 sm:p-5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">오늘 가입자 수</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 group-hover:scale-110 transition-transform">
              <UserPlus className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-slate-900 dark:text-white">
            {metrics.todaySignups.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">명</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            기본 권한: <strong>user</strong> 자동 부여
          </div>
        </div>

        {/* Active Users */}
        <div 
          onClick={() => onNavigateTab('users')}
          className="p-4 sm:p-5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">현재 활성 사용자</span>
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500 group-hover:scale-110 transition-transform">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-slate-900 dark:text-white">
            {metrics.activeUsers.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">명</span>
          </div>
          <div className="text-[11px] text-rose-500 font-semibold mt-1">
            정지 제재: {metrics.suspendedUsers}명
          </div>
        </div>

        {/* Total Posts */}
        <div 
          onClick={() => onNavigateTab('posts')}
          className="p-4 sm:p-5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">전체 게시글 수</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 group-hover:scale-110 transition-transform">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-slate-900 dark:text-white">
            {metrics.totalPosts.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">개</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            오늘 등록: <strong>+{metrics.todayPosts}개</strong>
          </div>
        </div>

        {/* Total Comments */}
        <div 
          onClick={() => onNavigateTab('comments')}
          className="p-4 sm:p-5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">전체 댓글 수</span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-500 group-hover:scale-110 transition-transform">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-slate-900 dark:text-white">
            {metrics.totalComments.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">개</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            게시글당 평균: <strong>{(metrics.totalComments / Math.max(1, metrics.totalPosts)).toFixed(1)}개</strong>
          </div>
        </div>

        {/* Pending Reports */}
        <div 
          onClick={() => onNavigateTab('reports')}
          className="p-4 sm:p-5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-rose-300 dark:hover:border-rose-800 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">미처리 신고 수</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 group-hover:scale-110 transition-transform">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-rose-500">
            {metrics.pendingReports}
            <span className="text-xs font-normal text-slate-400 ml-1">건</span>
          </div>
          <div className="text-[11px] text-rose-500 font-bold mt-1">
            {metrics.pendingReports > 0 ? '운영진 검토 필요' : '모두 조치 완료'}
          </div>
        </div>

        {/* Real-time Chat Users */}
        <div 
          onClick={() => onNavigateTab('chat')}
          className="p-4 sm:p-5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">현재 채팅 사용자 수</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500 group-hover:scale-110 transition-transform">
              <MessagesSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-slate-900 dark:text-white">
            {metrics.chatUsersCount.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">명</span>
          </div>
          <div className="text-[11px] text-emerald-500 font-semibold mt-1">
            6개 채팅방 활성 가동
          </div>
        </div>

        {/* Banned Words Filter */}
        <div 
          onClick={() => onNavigateTab('filters')}
          className="p-4 sm:p-5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer shadow-xs group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">등록 금칙어 필터</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500 group-hover:scale-110 transition-transform">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-black font-mono text-slate-900 dark:text-white">
            {metrics.bannedWordsCount}
            <span className="text-xs font-normal text-slate-400 ml-1">단어</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            자동 차단 엔진 작동 중
          </div>
        </div>
      </div>

      {/* 3. System Status Cards (Firebase, 주식 API, 뉴스 API, Gemini API) */}
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-500" />
              <span>핵심 인프라 & 외부 연동 서비스 상태</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              각 시스템의 응답성과 연결 상태를 실시간 점검합니다. (정상 / 주의 / 오류)
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('market')}
            className="text-xs font-bold text-rose-500 hover:underline flex items-center gap-1"
          >
            <span>상세 데이터 보기</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Firebase */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Firebase Auth & DB</div>
              <div className="font-bold text-sm text-slate-900 dark:text-white mt-1">Firestore 연결됨</div>
              <div className="text-[10px] text-slate-400 mt-0.5">보안 규칙 4단계 RBAC 활성</div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>정상</span>
            </span>
          </div>

          {/* 주식 API */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">외부 주식 시세 API</div>
              <div className="font-bold text-sm text-slate-900 dark:text-white mt-1">서버 파이프라인 가동</div>
              <div className="text-[10px] text-slate-400 mt-0.5">평균 응답속도: 38ms</div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>정상</span>
            </span>
          </div>

          {/* 뉴스 API */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">증권 속보 및 공시 API</div>
              <div className="font-bold text-sm text-slate-900 dark:text-white mt-1">KRX 공시 피드 연동</div>
              <div className="text-[10px] text-slate-400 mt-0.5">감지 엔진 상태: ONLINE</div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>정상</span>
            </span>
          </div>

          {/* Gemini API */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Gemini AI API 프록시</div>
              <div className="font-bold text-sm text-slate-900 dark:text-white mt-1">gemini-3.8-flash</div>
              <div className="text-[10px] text-slate-400 mt-0.5">서버 보안 프록시 경유</div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>정상</span>
            </span>
          </div>
        </div>
      </div>

      {/* 4. Weekly Trend Visual Bars */}
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
        <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1">
          주간 지표 통계 추이 (일별 가입자 / 게시글 / 신고)
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          최근 7일간의 사용자 가입 및 커뮤니티 생성 지표 추이입니다.
        </p>

        <div className="grid grid-cols-7 gap-2 pt-4">
          {trendDays.map((day, idx) => {
            const signup = signupTrend[idx];
            const post = postTrend[idx];
            const rep = reportTrend[idx];

            return (
              <div key={day} className="flex flex-col items-center">
                <div className="w-full flex items-end justify-center gap-1 h-32 bg-slate-50 dark:bg-slate-800/30 rounded-xl p-1.5">
                  {/* Signup bar (blue) */}
                  <div 
                    style={{ height: `${(signup / 50) * 100}%` }}
                    className="w-1/3 bg-blue-500 rounded-t-sm transition-all"
                    title={`가입: ${signup}명`}
                  />
                  {/* Post bar (purple) */}
                  <div 
                    style={{ height: `${(post / 120) * 100}%` }}
                    className="w-1/3 bg-indigo-500 rounded-t-sm transition-all"
                    title={`게시글: ${post}개`}
                  />
                  {/* Report bar (rose) */}
                  <div 
                    style={{ height: `${Math.max(10, (rep / 10) * 100)}%` }}
                    className="w-1/3 bg-rose-500 rounded-t-sm transition-all"
                    title={`신고: ${rep}건`}
                  />
                </div>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-400 mt-2">{day}</span>
                <span className="text-[10px] text-slate-400 font-mono mt-0.5">+{signup}</span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-center gap-6 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-blue-500" />
            <span className="text-slate-600 dark:text-slate-400">일별 회원가입</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-indigo-500" />
            <span className="text-slate-600 dark:text-slate-400">일별 게시글</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-rose-500" />
            <span className="text-slate-600 dark:text-slate-400">일별 접수 신고</span>
          </div>
        </div>
      </div>

      {/* 5. Three Columns: Recent Reports, Recent Members, Recent Posts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Recent Reports */}
        <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                <span>최근 접수된 신고</span>
              </h4>
              <button
                onClick={() => onNavigateTab('reports')}
                className="text-xs font-bold text-rose-500 hover:underline"
              >
                전체보기
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {recentReports.map(r => (
                <div key={r.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500">
                      {r.reason}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">{r.createdAt}</span>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
                    {r.targetTitle}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>신고자: {r.reportedBy}</span>
                    <span className={r.status === 'pending' ? 'text-amber-500 font-bold' : 'text-slate-400'}>
                      {r.status === 'pending' ? '접수(대기)' : '처리완료'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('reports')}
            className="w-full mt-3 py-2 text-center text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 transition-colors"
          >
            신고 관리 페이지 이동
          </button>
        </div>

        {/* Recent Registered Users */}
        <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-500" />
                <span>최근 가입 회원</span>
              </h4>
              <button
                onClick={() => onNavigateTab('users')}
                className="text-xs font-bold text-blue-500 hover:underline"
              >
                전체보기
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {recentUsers.map(u => (
                <div key={u.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <img src={u.avatar} alt={u.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate">{u.name}</div>
                      <div className="text-[10px] text-slate-400 truncate font-mono">{u.email}</div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      u.status === 'suspended' ? 'bg-rose-500 text-white' : 'bg-emerald-500/10 text-emerald-500'
                    }`}>
                      {u.status === 'suspended' ? '정지' : '정상'}
                    </span>
                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{u.joinedDate}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('users')}
            className="w-full mt-3 py-2 text-center text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 transition-colors"
          >
            회원 관리 페이지 이동
          </button>
        </div>

        {/* Recent Posts */}
        <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-500" />
                <span>최근 작성 게시글</span>
              </h4>
              <button
                onClick={() => onNavigateTab('posts')}
                className="text-xs font-bold text-indigo-500 hover:underline"
              >
                전체보기
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {recentPosts.map(p => (
                <div key={p.id} className="py-2.5 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700 dark:text-slate-300">{p.author.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">{p.createdAt}</span>
                  </div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
                    {p.title}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                    <span>조회 {p.views} · 댓글 {p.commentsCount || 0}</span>
                    <span className={p.isNotice ? 'text-purple-500 font-bold' : ''}>
                      {p.isNotice ? '공지글' : p.category}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('posts')}
            className="w-full mt-3 py-2 text-center text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 transition-colors"
          >
            게시글 관리 페이지 이동
          </button>
        </div>
      </div>
    </div>
  );
};
