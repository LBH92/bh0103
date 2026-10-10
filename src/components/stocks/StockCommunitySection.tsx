import React, { useState } from 'react';
import { Layers, MessageSquare, Heart, Eye, Plus, ArrowRight } from 'lucide-react';
import { Stock, CommunityPost } from '../../types';
import { useApp } from '../../context/AppContext';
import { storageService } from '../../services/storageService';
import { PostEditorModal } from '../community/PostEditorModal';

interface StockCommunitySectionProps {
  stock: Stock;
}

export const StockCommunitySection: React.FC<StockCommunitySectionProps> = ({ stock }) => {
  const { navigateToPost, requireAuth } = useApp();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [posts, setPosts] = useState<CommunityPost[]>(() => {
    const all = storageService.getPosts();
    return all.filter(p => p.symbol === stock.symbol || p.tags?.some(t => t.includes(stock.name)));
  });

  const handleOpenWrite = () => {
    if (!requireAuth('게시글 작성')) return;
    setIsEditorOpen(true);
  };

  const handlePostSaved = () => {
    const all = storageService.getPosts();
    setPosts(all.filter(p => p.symbol === stock.symbol || p.tags?.some(t => t.includes(stock.name))));
    setIsEditorOpen(false);
  };

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              주주 커뮤니티 토론글
            </h3>
            <p className="text-xs text-slate-400">
              '{stock.name}' 주주들의 실시간 매매 일지 및 차트 토론
            </p>
          </div>
        </div>

        <button
          onClick={handleOpenWrite}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-rose-600/20 self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>이 종목에 글쓰기</span>
        </button>
      </div>

      {/* Posts List */}
      {posts.length > 0 ? (
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {posts.map(post => (
            <div
              key={post.id}
              onClick={() => navigateToPost(post.id)}
              className="py-3.5 first:pt-1 last:pb-1 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl px-2 transition-colors cursor-pointer group"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs mb-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {post.author.name}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500 font-bold">
                    {post.author.badge}
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">{post.createdAt}</span>
                </div>

                <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-rose-500 transition-colors truncate">
                  {post.title}
                </h4>

                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {post.content}
                </p>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono text-slate-400 shrink-0">
                <span className="flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5 text-rose-500" />
                  {post.likes}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                  {post.commentsCount || post.comments?.length || 0}
                </span>
                <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-10 text-center text-slate-400 text-xs space-y-2">
          <p>아직 '{stock.name}'에 등록된 커뮤니티 글이 없습니다.</p>
          <button
            onClick={handleOpenWrite}
            className="text-rose-500 font-semibold hover:underline"
          >
            첫 번째 분석 글을 남겨보세요!
          </button>
        </div>
      )}

      {isEditorOpen && (
        <PostEditorModal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          onSuccess={handlePostSaved}
          defaultSymbol={stock.symbol}
        />
      )}
    </div>
  );
};
