import React, { useState } from 'react';
import { 
  Megaphone, 
  Plus, 
  Pin, 
  Trash2, 
  Edit3, 
  Eye, 
  Clock, 
  CheckCircle2, 
  Search 
} from 'lucide-react';
import { AdminNotice, UserRole } from '../../../types';
import { NoticeEditorModal } from '../modals/NoticeEditorModal';
import { ConfirmActionModal } from '../modals/ConfirmActionModal';

interface AdminNoticesTabProps {
  notices: AdminNotice[];
  callerRole: UserRole;
  onCreateNotice: (notice: Omit<AdminNotice, 'id' | 'viewCount' | 'createdAt'>) => void;
  onUpdateNotice: (id: string, updates: Partial<AdminNotice>) => void;
  onDeleteNotice: (id: string) => void;
  onTogglePin: (id: string) => void;
}

export const AdminNoticesTab: React.FC<AdminNoticesTabProps> = ({
  notices,
  callerRole,
  onCreateNotice,
  onUpdateNotice,
  onDeleteNotice,
  onTogglePin,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNotice, setEditingNotice] = useState<AdminNotice | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  const filteredNotices = notices.filter(n => {
    const q = searchTerm.trim().toLowerCase();
    return !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.author.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-purple-500" />
            <span>운영 공지사항 관리</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            전체 사용자에게 공지할 운영 정책, 점검 계획, 신규 기능 안내글을 작성 및 상단 고정합니다.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingNotice(null);
            setIsEditorOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>새 공지사항 작성</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative w-full max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="공지사항 제목, 내용 검색..."
          className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
        />
      </div>

      {/* Notices List */}
      <div className="space-y-3">
        {filteredNotices.map(notice => (
          <div
            key={notice.id}
            className={`p-5 rounded-2xl bg-white dark:bg-[#131722] border transition-all shadow-xs ${
              notice.isPinned
                ? 'border-purple-300 dark:border-purple-900/60 bg-purple-50/20 dark:bg-purple-950/10'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                {notice.isPinned && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500 text-white flex items-center gap-1">
                    <Pin className="w-3 h-3" />
                    <span>상단 고정</span>
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {notice.category}
                </span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {notice.author}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  · {notice.createdAt}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onTogglePin(notice.id)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    notice.isPinned
                      ? 'text-purple-600 bg-purple-100 dark:bg-purple-950/40'
                      : 'text-slate-400 hover:text-purple-600 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title={notice.isPinned ? '고정 해제' : '상단 고정'}
                >
                  <Pin className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setEditingNotice(notice);
                    setIsEditorOpen(true);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="수정"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setConfirmModal({
                      isOpen: true,
                      title: '공지사항 삭제',
                      description: `'${notice.title}' 공지글을 삭제하시겠습니까?`,
                      onConfirm: () => onDeleteNotice(notice.id),
                    });
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                  title="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug">
              {notice.title}
            </h3>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-2 whitespace-pre-wrap leading-relaxed line-clamp-3">
              {notice.content}
            </p>

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                <span>조회수 {notice.viewCount}회</span>
              </span>
              <span>커뮤니티 공지게시판 동기화됨</span>
            </div>
          </div>
        ))}
      </div>

      {/* Notice Editor Modal */}
      {isEditorOpen && (
        <NoticeEditorModal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          onSave={noticeData => {
            if (editingNotice) {
              onUpdateNotice(editingNotice.id, noticeData);
            } else {
              onCreateNotice(noticeData);
            }
          }}
          editingNotice={editingNotice}
        />
      )}

      {/* Confirm Modal */}
      <ConfirmActionModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        description={confirmModal.description}
      />
    </div>
  );
};
