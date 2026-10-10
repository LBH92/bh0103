import React, { useState } from 'react';
import { ShieldAlert, X, AlertTriangle, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { firebaseRepository } from '../../services/firebaseRepository';
import { storageService } from '../../services/storageService';
import { adminService } from '../../services/adminService';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetType: 'post' | 'comment' | 'chat' | 'user';
  targetId: string;
  postId?: string;
  targetTitle?: string;
  targetContent: string;
  targetAuthorName: string;
}

const REPORT_REASONS = [
  '스팸, 홍보성 게시글 및 불법 리딩방 광고',
  '허위사실 유포 및 시세조종·선행매매 의심',
  '욕설, 비방 및 인신공격성 발언',
  '개인정보 노출 및 사생활 침해',
  '음란물 또는 부적절한 콘텐츠',
  '기타 서비스 이용 규정 위반',
];

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  targetType,
  targetId,
  postId,
  targetTitle,
  targetContent,
  targetAuthorName,
}) => {
  const { user, showToast } = useApp();
  const [selectedReason, setSelectedReason] = useState(REPORT_REASONS[0]);
  const [customDetail, setCustomDetail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast('로그인 후 신고 접수가 가능합니다.', 'warning');
      return;
    }

    setIsSubmitting(true);
    const finalReason = customDetail.trim() 
      ? `[${selectedReason}] ${customDetail.trim()}`
      : selectedReason;

    try {
      const reportPayload = {
        reporterId: user.id,
        reporterName: user.name,
        targetType,
        targetId,
        postId: postId || (targetType === 'post' ? targetId : ''),
        targetTitle: targetTitle || (targetType === 'chat' ? '채팅 메시지' : targetType === 'post' ? '게시글' : '댓글'),
        targetContent: targetContent.slice(0, 300),
        targetAuthorName,
        reason: finalReason,
      };

      // 1. Admin Service (saves to bd_admin_reports for real-time Admin Reports tab display)
      adminService.createReport({
        type: targetType,
        targetId,
        targetTitle: targetTitle || (targetContent ? targetContent.slice(0, 30) : '신고 항목'),
        targetContent: targetContent.slice(0, 300),
        targetAuthorName,
        reportedBy: user.name,
        reporterId: user.id,
        reason: finalReason,
      });

      // 2. Firebase Firestore
      await firebaseRepository.createReport(reportPayload);

      // 3. Storage fallback
      storageService.reportItem(reportPayload);

      showToast('신고가 정상 접수되었습니다. 관리자 검토 후 신속히 조치하겠습니다.', 'info');
      onClose();
    } catch (err) {
      console.warn('Report submit error:', err);
      showToast('신고 접수 중 문제가 발생했습니다.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getReportTitle = () => {
    switch (targetType) {
      case 'post': return '게시글 신고';
      case 'comment': return '댓글 신고';
      case 'chat': return '채팅 메시지 신고';
      case 'user': return '사용자 신고';
      default: return '신고 접수';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {getReportTitle()}
              </h3>
              <p className="text-xs text-slate-400">
                작성자: {targetAuthorName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target summary snippet */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 italic line-clamp-2">
          "{targetContent}"
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              신고 사유 선택
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {REPORT_REASONS.map(reason => (
                <label
                  key={reason}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                    selectedReason === reason
                      ? 'border-rose-500/50 bg-rose-50/50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="reportReason"
                    value={reason}
                    checked={selectedReason === reason}
                    onChange={() => setSelectedReason(reason)}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  <span>{reason}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              추가 설명 (선택)
            </label>
            <textarea
              rows={2}
              value={customDetail}
              onChange={e => setCustomDetail(e.target.value)}
              placeholder="구체적인 위반 사항이나 증거가 있다면 적어주세요."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 resize-none"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? '접수 중...' : '신고 접수하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
