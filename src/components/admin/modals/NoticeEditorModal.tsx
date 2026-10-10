import React, { useState } from 'react';
import { X, Pin, Megaphone } from 'lucide-react';
import { AdminNotice } from '../../../types';

interface NoticeEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (notice: Omit<AdminNotice, 'id' | 'viewCount' | 'createdAt'>) => void;
  editingNotice?: AdminNotice | null;
}

export const NoticeEditorModal: React.FC<NoticeEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingNotice,
}) => {
  if (!isOpen) return null;

  const [title, setTitle] = useState(editingNotice?.title || '');
  const [content, setContent] = useState(editingNotice?.content || '');
  const [category, setCategory] = useState<'system' | 'event' | 'service' | 'maintenance'>(
    editingNotice?.category || 'service'
  );
  const [isPinned, setIsPinned] = useState(editingNotice?.isPinned || false);
  const [author, setAuthor] = useState(editingNotice?.author || '총괄운영팀');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    onSave({
      title: title.trim(),
      content: content.trim(),
      category,
      isPinned,
      author: author.trim() || '총괄운영팀',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden scale-in-95 transition-all">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
              <Megaphone className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              {editingNotice ? '공지사항 수정' : '새 운영 공지사항 작성'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                카테고리
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium"
              >
                <option value="service">서비스 안내</option>
                <option value="system">시스템 공지</option>
                <option value="maintenance">서버 점검</option>
                <option value="event">이벤트</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                작성자 명의
              </label>
              <input
                type="text"
                value={author}
                onChange={e => setAuthor(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium"
                placeholder="예: 총괄운영팀"
              />
            </div>
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              공지 제목
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="공지사항 제목을 입력하세요."
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium"
            />
          </div>

          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              공지 본문 내용
            </label>
            <textarea
              required
              rows={6}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="회원들에게 안내할 공지 내용을 상세하게 작성하세요."
              className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium resize-none leading-relaxed"
            />
          </div>

          <div className="flex items-center gap-2 p-3 bg-purple-50/50 dark:bg-purple-950/20 rounded-xl border border-purple-100 dark:border-purple-900/40">
            <input
              type="checkbox"
              id="pinCheck"
              checked={isPinned}
              onChange={e => setIsPinned(e.target.checked)}
              className="rounded accent-purple-600 w-4 h-4 cursor-pointer"
            />
            <label htmlFor="pinCheck" className="font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1 cursor-pointer">
              <Pin className="w-3.5 h-3.5" />
              <span>게시판 최상단에 고정 (Pinned Notice)</span>
            </label>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-colors shadow-xs"
            >
              {editingNotice ? '수정 완료' : '공지 게시'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
