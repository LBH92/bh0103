import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Eye, 
  AlertTriangle,
  UserX,
  VolumeX,
  Trash2,
  EyeOff
} from 'lucide-react';
import { AdminReport, UserRole } from '../../../types';
import { ReportDetailModal } from '../modals/ReportDetailModal';

interface AdminReportsTabProps {
  reports: AdminReport[];
  callerRole: UserRole;
  onResolve: (reportId: string, actionTaken: string) => void;
  onDismiss: (reportId: string) => void;
  onHideContent?: (targetType: string, targetId: string) => void;
  onDeleteContent?: (targetType: string, targetId: string) => void;
  onMuteUser?: (targetUserId: string) => void;
  onSuspendUser?: (targetUserId: string, reason: string) => void;
}

export const AdminReportsTab: React.FC<AdminReportsTabProps> = ({
  reports,
  callerRole,
  onResolve,
  onDismiss,
  onHideContent,
  onDeleteContent,
  onMuteUser,
  onSuspendUser,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'investigating' | 'resolved' | 'dismissed'>('ALL');
  const [targetFilter, setTargetFilter] = useState<'ALL' | 'post' | 'comment' | 'chat' | 'user'>('ALL');
  const [selectedReport, setSelectedReport] = useState<AdminReport | null>(null);

  const filteredReports = reports.filter(r => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = 
      !q || 
      r.targetTitle.toLowerCase().includes(q) || 
      r.reportedBy.toLowerCase().includes(q) ||
      (r.targetAuthorName && r.targetAuthorName.toLowerCase().includes(q)) ||
      r.reason.toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (targetFilter !== 'ALL' && r.type !== targetFilter) return false;

    return true;
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Top Header & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-rose-500" />
            <span>신고 접수 및 제재 관리</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            욕설, 불법 리딩방 광고, 허위 시세조종 등 커뮤니티 및 채팅에서 접수된 신고를 검토하고 제재합니다.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="제목, 신고자, 피신고자, 사유 검색..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Status filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs font-semibold">
          {[
            { id: 'ALL', label: `전체 (${reports.length})` },
            { id: 'pending', label: `접수/대기 (${reports.filter(r => r.status === 'pending').length})` },
            { id: 'investigating', label: `검토중 (${reports.filter(r => r.status === 'investigating').length})` },
            { id: 'resolved', label: `처리완료 (${reports.filter(r => r.status === 'resolved').length})` },
            { id: 'dismissed', label: `기각 (${reports.filter(r => r.status === 'dismissed').length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl shrink-0 transition-colors ${
                statusFilter === tab.id
                  ? 'bg-rose-600 text-white font-bold shadow-xs'
                  : 'bg-white dark:bg-[#131722] text-slate-500 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Target filters */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-slate-400">대상:</span>
          <select
            value={targetFilter}
            onChange={e => setTargetFilter(e.target.value as any)}
            className="px-2.5 py-1.5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            <option value="ALL">전체 대상</option>
            <option value="post">게시글</option>
            <option value="comment">댓글</option>
            <option value="chat">실시간 채팅</option>
            <option value="user">사용자</option>
          </select>
        </div>
      </div>

      {/* Reports Table on Desktop */}
      <div className="hidden md:block bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold bg-slate-50/50 dark:bg-slate-800/30">
              <th className="py-3 px-4">대상 유형</th>
              <th className="py-3 px-4">신고 대상 제목 / 내용</th>
              <th className="py-3 px-4">신고 사유</th>
              <th className="py-3 px-4">신고자 / 피신고자</th>
              <th className="py-3 px-4">접수 일시</th>
              <th className="py-3 px-4 text-center">처리 상태</th>
              <th className="py-3 px-4 text-right">조치</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredReports.map(r => (
              <tr 
                key={r.id}
                onClick={() => setSelectedReport(r)}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
              >
                {/* Type */}
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {r.type}
                  </span>
                </td>

                {/* Title */}
                <td className="py-3.5 px-4 max-w-sm">
                  <div className="font-bold text-slate-900 dark:text-white line-clamp-1">
                    {r.targetTitle}
                  </div>
                  {r.targetContent && (
                    <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                      {r.targetContent}
                    </div>
                  )}
                </td>

                {/* Reason */}
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20">
                    {r.reason}
                  </span>
                </td>

                {/* Reporter / Target author */}
                <td className="py-3.5 px-4 whitespace-nowrap text-slate-500">
                  <div>신고자: <strong>{r.reportedBy}</strong></div>
                  <div className="text-[10px] text-rose-500">피신고: {r.targetAuthorName || '미상'}</div>
                </td>

                {/* Date */}
                <td className="py-3.5 px-4 text-slate-400 font-mono whitespace-nowrap">
                  {r.createdAt}
                </td>

                {/* Status */}
                <td className="py-3.5 px-4 text-center whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    r.status === 'pending' ? 'bg-amber-500 text-white' :
                    r.status === 'investigating' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                    r.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                    'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}>
                    {r.status === 'pending' ? '접수(대기)' :
                     r.status === 'investigating' ? '검토중' :
                     r.status === 'resolved' ? '조치완료' : '기각'}
                  </span>
                </td>

                {/* Actions */}
                <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setSelectedReport(r)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-[11px] transition-colors"
                    >
                      상세조치
                    </button>
                    {r.status === 'pending' && (
                      <button
                        onClick={() => onResolve(r.id, '신고 검토 후 경고 처리')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-colors"
                      >
                        승인
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="md:hidden space-y-3">
        {filteredReports.map(r => (
          <div
            key={r.id}
            onClick={() => setSelectedReport(r)}
            className="p-4 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-2.5 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500">
                {r.reason}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                r.status === 'pending' ? 'bg-amber-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}>
                {r.status === 'pending' ? '접수대기' : (r.status === 'resolved' ? '처리완료' : '기각')}
              </span>
            </div>

            <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-snug">
              {r.targetTitle}
            </h4>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
              <span>신고자: {r.reportedBy}</span>
              <span className="font-mono text-[10px]">{r.createdAt}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Report Detail Modal */}
      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onResolve={(id, action) => {
            onResolve(id, action);
            setSelectedReport(null);
          }}
          onDismiss={(id) => {
            onDismiss(id);
            setSelectedReport(null);
          }}
          onHideContent={onHideContent}
          onDeleteContent={onDeleteContent}
          onMuteUser={onMuteUser}
          onSuspendUser={onSuspendUser}
        />
      )}
    </div>
  );
};
