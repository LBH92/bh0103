import React, { useState } from 'react';
import { 
  Search, 
  Eye, 
  EyeOff, 
  Trash2, 
  RefreshCw, 
  MessageSquare, 
  User, 
  Clock 
} from 'lucide-react';
import { CommentItem, UserRole } from '../../../types';
import { ConfirmActionModal } from '../modals/ConfirmActionModal';

interface AdminCommentsTabProps {
  comments: { comment: CommentItem; postTitle: string; postId: string }[];
  callerRole: UserRole;
  onUpdateStatus: (commentId: string, postId: string, status: 'published' | 'hidden' | 'deleted') => void;
}

export const AdminCommentsTab: React.FC<AdminCommentsTabProps> = ({
  comments,
  callerRole,
  onUpdateStatus,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'published' | 'hidden' | 'deleted'>('ALL');

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

  const filteredComments = comments.filter(c => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = 
      !q || 
      c.comment.content.toLowerCase().includes(q) || 
      c.comment.author.name.toLowerCase().includes(q) ||
      c.postTitle.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    const currentStatus = c.comment.status || 'published';
    if (statusFilter === 'published') return currentStatus === 'published';
    if (statusFilter === 'hidden') return currentStatus === 'hidden';
    if (statusFilter === 'deleted') return currentStatus === 'deleted';

    return true;
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Top Header & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            댓글 및 답변 관리
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            커뮤니티 전체 게시글에 등록된 댓글을 모니터링하고 악성 댓글을 숨김 또는 삭제 처리합니다.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="댓글 내용, 작성자, 원본 게시글 검색..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs font-semibold">
        {[
          { id: 'ALL', label: `전체 댓글 (${comments.length})` },
          { id: 'published', label: `정상 댓글 (${comments.filter(c => (c.comment.status || 'published') === 'published').length})` },
          { id: 'hidden', label: `숨김 처리 (${comments.filter(c => c.comment.status === 'hidden').length})` },
          { id: 'deleted', label: `삭제됨 (${comments.filter(c => c.comment.status === 'deleted').length})` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id as any)}
            className={`px-3 py-1.5 rounded-xl shrink-0 transition-colors ${
              statusFilter === tab.id
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold shadow-xs'
                : 'bg-white dark:bg-[#131722] text-slate-500 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table on Desktop */}
      <div className="hidden md:block bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold bg-slate-50/50 dark:bg-slate-800/30">
              <th className="py-3 px-4">작성자</th>
              <th className="py-3 px-4">댓글 내용</th>
              <th className="py-3 px-4">대상 게시글</th>
              <th className="py-3 px-4">작성일</th>
              <th className="py-3 px-4 text-center">상태</th>
              <th className="py-3 px-4 text-right">관리 조치</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredComments.map(({ comment, postTitle, postId }) => {
              const currentStatus = comment.status || 'published';
              return (
                <tr key={comment.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  {/* Author */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <img src={comment.author.avatar} alt={comment.author.name} className="w-6 h-6 rounded-full object-cover" />
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{comment.author.name}</div>
                        <div className="text-[10px] text-slate-400">{comment.author.badge}</div>
                      </div>
                    </div>
                  </td>

                  {/* Content */}
                  <td className="py-3.5 px-4 max-w-sm">
                    <div className="text-slate-800 dark:text-slate-200 font-medium line-clamp-2">
                      {comment.content}
                    </div>
                  </td>

                  {/* Post title */}
                  <td className="py-3.5 px-4 max-w-[200px] text-slate-500">
                    <span className="truncate block font-semibold hover:text-rose-500 cursor-pointer">
                      {postTitle}
                    </span>
                  </td>

                  {/* Date */}
                  <td className="py-3.5 px-4 text-slate-400 font-mono whitespace-nowrap">
                    {comment.createdAt}
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4 text-center whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      currentStatus === 'published' ? 'bg-emerald-500/10 text-emerald-500' :
                      currentStatus === 'hidden' ? 'bg-amber-500/10 text-amber-500' : 'bg-rose-500/10 text-rose-500'
                    }`}>
                      {currentStatus === 'published' ? '정상' : (currentStatus === 'hidden' ? '숨김' : '삭제')}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {currentStatus === 'hidden' ? (
                        <button
                          onClick={() => onUpdateStatus(comment.id, postId, 'published')}
                          className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                          title="숨김 해제"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => onUpdateStatus(comment.id, postId, 'hidden')}
                          className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 hover:bg-amber-500/20"
                          title="댓글 숨김"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {currentStatus === 'deleted' ? (
                        <button
                          onClick={() => onUpdateStatus(comment.id, postId, 'published')}
                          className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20"
                          title="댓글 복구"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: '댓글 삭제',
                              description: `'${comment.author.name}' 님의 댓글을 삭제하시겠습니까?`,
                              onConfirm: () => onUpdateStatus(comment.id, postId, 'deleted'),
                            });
                          }}
                          className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                          title="댓글 삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="md:hidden space-y-3">
        {filteredComments.map(({ comment, postTitle, postId }) => (
          <div
            key={comment.id}
            className="p-4 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-2.5"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200">{comment.author.name}</span>
              <span className="text-[10px] text-slate-400 font-mono">{comment.createdAt}</span>
            </div>

            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {comment.content}
            </p>

            <div className="text-[11px] text-slate-400 truncate">
              게시글: <strong>{postTitle}</strong>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => onUpdateStatus(comment.id, postId, comment.status === 'hidden' ? 'published' : 'hidden')}
                className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 font-semibold text-[11px]"
              >
                {comment.status === 'hidden' ? '숨김해제' : '숨김'}
              </button>
              <button
                onClick={() => onUpdateStatus(comment.id, postId, comment.status === 'deleted' ? 'published' : 'deleted')}
                className="px-2 py-1 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-lg font-bold text-[11px]"
              >
                {comment.status === 'deleted' ? '복구' : '삭제'}
              </button>
            </div>
          </div>
        ))}
      </div>

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
