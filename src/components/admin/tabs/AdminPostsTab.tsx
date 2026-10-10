import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  Eye, 
  EyeOff, 
  Trash2, 
  RefreshCw, 
  Pin, 
  FileText, 
  MessageSquare, 
  Heart, 
  Clock, 
  CheckCircle2, 
  ArrowUpDown 
} from 'lucide-react';
import { CommunityPost, UserRole } from '../../../types';
import { ConfirmActionModal } from '../modals/ConfirmActionModal';

interface AdminPostsTabProps {
  posts: CommunityPost[];
  callerRole: UserRole;
  onUpdateStatus: (postId: string, status: 'published' | 'hidden' | 'deleted') => void;
  onToggleNotice: (postId: string, isNotice: boolean) => void;
}

export const AdminPostsTab: React.FC<AdminPostsTabProps> = ({
  posts,
  callerRole,
  onUpdateStatus,
  onToggleNotice,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'published' | 'hidden' | 'deleted' | 'notice'>('ALL');
  const [sortField, setSortField] = useState<'latest' | 'views' | 'comments' | 'likes'>('latest');
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);

  // Confirm modal state
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

  // Filter
  const filteredPosts = posts.filter(p => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = 
      !q || 
      p.title.toLowerCase().includes(q) || 
      p.content.toLowerCase().includes(q) || 
      p.author.name.toLowerCase().includes(q) ||
      p.symbolName?.toLowerCase().includes(q) ||
      p.symbol?.includes(q);

    if (!matchesSearch) return false;

    if (statusFilter === 'published') return (p.status || 'published') === 'published';
    if (statusFilter === 'hidden') return p.status === 'hidden';
    if (statusFilter === 'deleted') return p.status === 'deleted';
    if (statusFilter === 'notice') return Boolean(p.isNotice || p.category === 'notice');

    return true;
  });

  // Sort
  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (sortField === 'views') return b.views - a.views;
    if (sortField === 'comments') return (b.commentsCount || 0) - (a.commentsCount || 0);
    if (sortField === 'likes') return b.likes - a.likes;
    return (b.id || '').localeCompare(a.id || '');
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Top Header & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            게시글 및 공지 관리
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            등록된 게시글을 모니터링하고 숨김, 복원, 영구 삭제, 상단 공지글 지정을 수행합니다.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="제목, 내용, 작성자, 종목 검색..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* Filter and Sort Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs font-semibold">
          {[
            { id: 'ALL', label: `전체 (${posts.length})` },
            { id: 'published', label: `정상 게시 (${posts.filter(p => (p.status || 'published') === 'published').length})` },
            { id: 'hidden', label: `숨김 처리 (${posts.filter(p => p.status === 'hidden').length})` },
            { id: 'deleted', label: `삭제 (${posts.filter(p => p.status === 'deleted').length})` },
            { id: 'notice', label: `공지글 (${posts.filter(p => p.isNotice || p.category === 'notice').length})` },
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

        {/* Sort */}
        <div className="flex items-center gap-1.5 text-xs self-end sm:self-auto">
          <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={sortField}
            onChange={e => setSortField(e.target.value as any)}
            className="px-2.5 py-1.5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            <option value="latest">최신순</option>
            <option value="views">조회수순</option>
            <option value="comments">댓글수순</option>
            <option value="likes">좋아요순</option>
          </select>
        </div>
      </div>

      {/* Posts Desktop Table */}
      <div className="hidden md:block bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold bg-slate-50/50 dark:bg-slate-800/30">
              <th className="py-3 px-4">게시판 / 상태</th>
              <th className="py-3 px-4">제목 및 본문 요약</th>
              <th className="py-3 px-4">작성자</th>
              <th className="py-3 px-4 text-center">반응 (조회/댓글/좋아요)</th>
              <th className="py-3 px-4">작성일</th>
              <th className="py-3 px-4 text-right">관리 조치</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {sortedPosts.map(p => {
              const currentStatus = p.status || 'published';
              return (
                <tr 
                  key={p.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  {/* Category & Status */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        p.isNotice || p.category === 'notice'
                          ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}>
                        {p.isNotice ? '📌 공지' : p.category}
                      </span>
                      <span className={`text-[10px] font-semibold ${
                        currentStatus === 'published' ? 'text-emerald-500' :
                        currentStatus === 'hidden' ? 'text-amber-500 font-bold' : 'text-rose-500 font-bold'
                      }`}>
                        {currentStatus === 'published' ? '정상 게시' : (currentStatus === 'hidden' ? '숨김' : '삭제됨')}
                      </span>
                    </div>
                  </td>

                  {/* Title & snippet */}
                  <td className="py-3.5 px-4 max-w-md">
                    <div className="font-bold text-slate-900 dark:text-white truncate">
                      {p.title}
                    </div>
                    <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                      {p.content}
                    </div>
                    {p.symbolName && (
                      <span className="inline-block mt-1 text-[10px] text-rose-500 font-semibold bg-rose-50 dark:bg-rose-500/10 px-1.5 py-0.2 rounded">
                        #{p.symbolName} ({p.symbol})
                      </span>
                    )}
                  </td>

                  {/* Author */}
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <img src={p.author.avatar} alt={p.author.name} className="w-5 h-5 rounded-full object-cover" />
                      <span className="font-bold text-slate-800 dark:text-slate-200">{p.author.name}</span>
                    </div>
                  </td>

                  {/* Metrics */}
                  <td className="py-3.5 px-4 text-center font-mono text-slate-500 whitespace-nowrap">
                    <span>{p.views} / {p.commentsCount || p.comments?.length || 0} / {p.likes}</span>
                  </td>

                  {/* Date */}
                  <td className="py-3.5 px-4 text-slate-400 whitespace-nowrap font-mono">
                    {p.createdAt}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Notice pin */}
                      <button
                        onClick={() => onToggleNotice(p.id, !p.isNotice)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          p.isNotice 
                            ? 'bg-purple-500/10 text-purple-500' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-purple-500'
                        }`}
                        title={p.isNotice ? '공지 해제' : '상단 공지 지정'}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>

                      {/* Hide / Restore */}
                      {currentStatus === 'hidden' ? (
                        <button
                          onClick={() => onUpdateStatus(p.id, 'published')}
                          className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                          title="숨김 해제 (복원)"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => onUpdateStatus(p.id, 'hidden')}
                          className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 transition-colors"
                          title="게시글 숨김"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Soft Delete */}
                      {currentStatus === 'deleted' ? (
                        <button
                          onClick={() => onUpdateStatus(p.id, 'published')}
                          className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors"
                          title="게시글 복구"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: '게시글 삭제',
                              description: `'${p.title}' 게시글을 삭제하시겠습니까? (삭제 상태로 보관되며 필요 시 복구할 수 있습니다.)`,
                              onConfirm: () => onUpdateStatus(p.id, 'deleted'),
                            });
                          }}
                          className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors"
                          title="게시글 삭제"
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
        {sortedPosts.map(p => (
          <div
            key={p.id}
            className="p-4 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                p.isNotice ? 'bg-purple-500/10 text-purple-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}>
                {p.isNotice ? '📌 공지' : p.category}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">{p.createdAt}</span>
            </div>

            <h4 className="font-bold text-sm text-slate-900 dark:text-white leading-snug">
              {p.title}
            </h4>

            <p className="text-xs text-slate-500 line-clamp-2">
              {p.content}
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <span className="text-slate-500 font-semibold">{p.author.name}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdateStatus(p.id, p.status === 'hidden' ? 'published' : 'hidden')}
                  className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300 font-semibold text-[11px]"
                >
                  {p.status === 'hidden' ? '숨김해제' : '숨김'}
                </button>
                <button
                  onClick={() => onUpdateStatus(p.id, p.status === 'deleted' ? 'published' : 'deleted')}
                  className="px-2 py-1 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-lg font-bold text-[11px]"
                >
                  {p.status === 'deleted' ? '복구' : '삭제'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Confirm Action Modal */}
      <ConfirmActionModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        description={confirmModal.description}
        isDestructive={true}
      />
    </div>
  );
};
