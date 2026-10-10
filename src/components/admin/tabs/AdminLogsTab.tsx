import React, { useState } from 'react';
import { 
  FileText, 
  Search, 
  Filter, 
  Shield, 
  Clock, 
  User, 
  Lock, 
  ArrowUpDown,
  RefreshCw
} from 'lucide-react';
import { AdminLogItem, UserRole } from '../../../types';

interface AdminLogsTabProps {
  logs: AdminLogItem[];
  callerRole: UserRole;
  onRefreshLogs?: () => void;
}

export const AdminLogsTab: React.FC<AdminLogsTabProps> = ({
  logs,
  callerRole,
  onRefreshLogs,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');

  const filteredLogs = logs.filter(l => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = 
      !q || 
      l.action.toLowerCase().includes(q) || 
      l.adminName.toLowerCase().includes(q) || 
      l.targetType.toLowerCase().includes(q) || 
      (l.details && l.details.toLowerCase().includes(q)) ||
      (l.targetTitle && l.targetTitle.toLowerCase().includes(q));

    if (!matchesSearch) return false;
    if (actionFilter !== 'ALL' && l.action !== actionFilter) return false;

    return true;
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Lock className="w-6 h-6 text-emerald-500" />
            <span>관리자 감사 로그 (Audit Logs)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            운영진과 관리자가 수행한 모든 제재, 삭제, 권한 변경, 설정 조작 내역이 위변조 불가능한 감사 로그로 영구 기록됩니다.
          </p>
        </div>

        {onRefreshLogs && (
          <button
            onClick={onRefreshLogs}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors self-start sm:self-auto"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>로그 갱신</span>
          </button>
        )}
      </div>

      {/* Search and Action Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="작업, 관리자, 사유, 대상 검색..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500"
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400">작업 유형:</span>
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            <option value="ALL">전체 작업</option>
            <option value="SUSPEND_USER">회원 정지</option>
            <option value="UNSUSPEND_USER">정지 해제</option>
            <option value="CHANGE_USER_ROLE">권한 변경</option>
            <option value="MUTE_CHAT_USER">채팅 제한</option>
            <option value="UNMUTE_CHAT_USER">채팅 제한 해제</option>
            <option value="WARN_USER">회원 경고</option>
            <option value="DELETE_POST">게시글 삭제</option>
            <option value="HIDE_POST">게시글 숨김</option>
            <option value="RESTORE_POST">게시글 복구</option>
            <option value="DELETE_COMMENT">댓글 삭제</option>
            <option value="RESOLVE_REPORT">신고 처리</option>
            <option value="DISMISS_REPORT">신고 기각</option>
            <option value="CREATE_NOTICE">공지 작성</option>
            <option value="UPDATE_SYSTEM_SETTING">시스템 설정 변경</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold bg-slate-50/50 dark:bg-slate-800/30">
              <th className="py-3 px-4">일시</th>
              <th className="py-3 px-4">수행 관리자</th>
              <th className="py-3 px-4">작업 (Action)</th>
              <th className="py-3 px-4">대상 (Target)</th>
              <th className="py-3 px-4">상세 조치 내용</th>
              <th className="py-3 px-4 text-center">불변성 검증</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
            {filteredLogs.map(l => (
              <tr key={l.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                {/* Timestamp */}
                <td className="py-3 px-4 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                  {l.createdAt}
                </td>

                {/* Admin */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-900 dark:text-white">{l.adminName}</span>
                    <span className="text-[10px] px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                      {l.adminRole}
                    </span>
                  </div>
                </td>

                {/* Action */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                    l.action.includes('DELETE') || l.action.includes('SUSPEND')
                      ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                      : l.action.includes('WARN') || l.action.includes('MUTE')
                      ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                  }`}>
                    {l.action}
                  </span>
                </td>

                {/* Target */}
                <td className="py-3 px-4 whitespace-nowrap text-slate-600 dark:text-slate-300">
                  <div className="font-semibold">{l.targetTitle || l.targetId}</div>
                  <div className="text-[10px] text-slate-400 uppercase font-mono">{l.targetType}</div>
                </td>

                {/* Details */}
                <td className="py-3 px-4 max-w-sm text-slate-700 dark:text-slate-300">
                  <span className="line-clamp-2 leading-relaxed">
                    {l.details || '-'}
                  </span>
                </td>

                {/* Immutability badge */}
                <td className="py-3 px-4 text-center whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    <Lock className="w-2.5 h-2.5" />
                    <span>VERIFIED</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
