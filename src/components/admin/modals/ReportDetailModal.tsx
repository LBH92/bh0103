import React from 'react';
import { 
  X, 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  User, 
  CheckCircle, 
  XCircle, 
  Trash2, 
  EyeOff, 
  VolumeX, 
  UserX,
  FileText,
  MessageSquare
} from 'lucide-react';
import { AdminReport, UserRole } from '../../../types';

interface ReportDetailModalProps {
  report: AdminReport | null;
  onClose: () => void;
  onResolve: (reportId: string, actionTaken: string) => void;
  onDismiss: (reportId: string) => void;
  onHideContent?: (targetType: string, targetId: string) => void;
  onDeleteContent?: (targetType: string, targetId: string) => void;
  onMuteUser?: (targetUserId: string) => void;
  onSuspendUser?: (targetUserId: string, reason: string) => void;
}

export const ReportDetailModal: React.FC<ReportDetailModalProps> = ({
  report,
  onClose,
  onResolve,
  onDismiss,
  onHideContent,
  onDeleteContent,
  onMuteUser,
  onSuspendUser,
}) => {
  if (!report) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden scale-in-95 transition-all">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                신고 상세 내역
              </h3>
              <span className="text-xs text-slate-400 font-mono">ID: {report.id}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4 text-xs">
          {/* Metadata Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 block font-medium">신고 대상 유형</span>
              <span className="text-sm font-bold uppercase text-slate-800 dark:text-slate-200 mt-0.5 block">
                {report.type === 'post' ? '게시글 (Post)' :
                 report.type === 'comment' ? '댓글 (Comment)' :
                 report.type === 'chat' ? '실시간 채팅 (Chat)' : '사용자 프로필 (User)'}
              </span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 block font-medium">신고 사유</span>
              <span className="text-sm font-bold text-rose-500 mt-0.5 block">
                {report.reason}
              </span>
            </div>
          </div>

          {/* Parties */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-400">신고자:</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{report.reportedBy}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60">
              <span className="text-slate-400">피신고자 (작성자):</span>
              <span className="font-semibold text-rose-500">{report.targetAuthorName || '미상/익명'}</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-400">접수 일시:</span>
              <span className="text-slate-600 dark:text-slate-400 font-mono">{report.createdAt}</span>
            </div>
          </div>

          {/* Reported Content Box */}
          <div className="space-y-1.5">
            <span className="font-bold text-slate-800 dark:text-slate-200">신고 대상 원문 / 본문</span>
            <div className="p-4 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-xs sm:text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
              <div className="font-bold mb-1 text-slate-900 dark:text-white">
                {report.targetTitle}
              </div>
              {report.targetContent && (
                <p className="text-slate-600 dark:text-slate-400 mt-1">
                  {report.targetContent}
                </p>
              )}
            </div>
          </div>

          {/* Resolution history if processed */}
          {report.status !== 'pending' && (
            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40 rounded-xl space-y-1">
              <span className="font-bold text-blue-600 dark:text-blue-400 block">처리 기록</span>
              <p className="text-slate-700 dark:text-slate-300">
                상태: <strong>{report.status === 'resolved' ? '처리완료' : '기각'}</strong>
              </p>
              <p className="text-slate-500">처리 담당자: {report.handlerName} ({report.handledAt})</p>
              <p className="text-slate-600 dark:text-slate-400">조치 내용: {report.actionTaken}</p>
            </div>
          )}

          {/* Quick Actions Panel */}
          {report.status === 'pending' && (
            <div className="p-3.5 bg-rose-50/50 dark:bg-rose-950/10 rounded-xl border border-rose-200 dark:border-rose-900/40 space-y-2.5">
              <span className="font-bold text-slate-800 dark:text-slate-200 block">관리자 즉시 제재 조치</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    onHideContent?.(report.type, report.targetId);
                    onResolve(report.id, '대상 콘텐츠 숨김 처리');
                    onClose();
                  }}
                  className="flex items-center justify-center gap-1.5 p-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 text-slate-800 dark:text-slate-200 rounded-lg font-bold transition-colors"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>콘텐츠 숨김</span>
                </button>
                <button
                  onClick={() => {
                    onDeleteContent?.(report.type, report.targetId);
                    onResolve(report.id, '대상 콘텐츠 즉시 삭제');
                    onClose();
                  }}
                  className="flex items-center justify-center gap-1.5 p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>콘텐츠 삭제</span>
                </button>
                {report.targetAuthorId && (
                  <>
                    <button
                      onClick={() => {
                        onMuteUser?.(report.targetAuthorId!);
                        onResolve(report.id, '작성자 채팅 24시간 제한');
                        onClose();
                      }}
                      className="flex items-center justify-center gap-1.5 p-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold transition-colors"
                    >
                      <VolumeX className="w-3.5 h-3.5" />
                      <span>작성자 채팅 제한</span>
                    </button>
                    <button
                      onClick={() => {
                        onSuspendUser?.(report.targetAuthorId!, `신고 누적 조치: ${report.reason}`);
                        onResolve(report.id, '작성자 회원 정지');
                        onClose();
                      }}
                      className="flex items-center justify-center gap-1.5 p-2 bg-rose-700 hover:bg-rose-600 text-white rounded-lg font-bold transition-colors"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      <span>작성자 계정 정지</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
          <div>
            {report.status === 'pending' && (
              <button
                onClick={() => {
                  onDismiss(report.id);
                  onClose();
                }}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition-colors"
              >
                신고 기각 (무효)
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition-colors"
            >
              닫기
            </button>
            {report.status === 'pending' && (
              <button
                onClick={() => {
                  onResolve(report.id, '신고 검토 후 경고 처리 완료');
                  onClose();
                }}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                처리 완료
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
