import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Heart, 
  MessageSquare, 
  Eye, 
  Share2, 
  Trash2, 
  Edit3, 
  ShieldAlert, 
  Send, 
  ExternalLink, 
  Check, 
  TrendingUp,
  LogIn,
  Clock,
  CornerDownRight,
  MoreVertical,
  CheckCircle2,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CommunityPost, CommentItem } from '../../types';
import { storageService } from '../../services/storageService';
import { firebaseRepository } from '../../services/firebaseRepository';
import { PostEditorModal } from './PostEditorModal';
import { ReportModal } from './ReportModal';
import { PriceBadge } from '../common/PriceBadge';

interface PostDetailViewProps {
  postId: string;
}

export const PostDetailView: React.FC<PostDetailViewProps> = ({ postId }) => {
  const { 
    user, 
    stocks, 
    navigateToStock, 
    navigateToPostList,
    setActiveTab, 
    showToast,
    requireAuth,
    isAuthenticated,
    setIsAuthModalOpen
  } = useApp();

  const [post, setPost] = useState<CommunityPost | undefined>(() => storageService.getPostById(postId));
  const [commentText, setCommentText] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Editing comment state
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Report Modal state
  const [reportTarget, setReportTarget] = useState<{
    type: 'post' | 'comment';
    targetId: string;
    content: string;
    authorName: string;
  } | null>(null);

  // Comment pagination limit
  const [commentLimit, setCommentLimit] = useState(15);
  const visibleComments = (post?.comments || []).slice(0, commentLimit);
  const hasMoreComments = (post?.comments || []).length > commentLimit;

  // Load from Firestore & increment view count on mount
  useEffect(() => {
    let isSubscribed = true;
    firebaseRepository.getPostById(postId).then(remotePost => {
      if (isSubscribed && remotePost) {
        setPost(remotePost);
      }
    });

    // Increment views
    firebaseRepository.incrementPostView(postId);
    storageService.incrementViewCount(postId);

    return () => {
      isSubscribed = false;
    };
  }, [postId]);

  if (!post) {
    return (
      <div className="py-20 text-center space-y-3">
        <p className="text-slate-400">게시글을 찾을 수 없거나 이미 삭제되었습니다.</p>
        <button
          onClick={navigateToPostList}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
        >
          커뮤니티 목록으로 가기
        </button>
      </div>
    );
  }

  const isAuthor = Boolean(user && (user.id === post.author.id || user.role === 'admin'));
  const isLiked = Boolean(user && post.likedBy?.includes(user.id));
  const matchedStock = post.symbol ? stocks.find(s => s.symbol === post.symbol) : null;

  // Like Toggle
  const handleToggleLike = async () => {
    if (!requireAuth('게시글 추천')) return;
    if (!user) return;

    // Optimistic local update
    const updated = storageService.togglePostLike(post.id, user.id);
    if (updated) {
      setPost({ ...updated });
    }

    // Firestore update
    await firebaseRepository.togglePostLike(post.id, user.id);
  };

  // Delete Post
  const handleDeletePost = async () => {
    if (!isAuthor) {
      showToast('삭제 권한이 없습니다.', 'error');
      return;
    }

    if (window.confirm('정말 이 게시글을 삭제하시겠습니까?')) {
      await firebaseRepository.deletePost(post.id);
      storageService.deletePost(post.id);
      showToast('게시글이 삭제되었습니다.', 'info');
      navigateToPostList();
    }
  };

  // Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth('댓글 작성')) return;
    if (!user) return;
    if (!commentText.trim()) return;

    const newCommentItem: CommentItem = {
      id: `c-${Date.now()}`,
      postId: post.id,
      author: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        badge: user.role === 'admin' ? '운영자' : user.tier,
      },
      content: commentText.trim(),
      createdAt: '방금 전',
      likes: 0,
      likedBy: [],
    };

    // 1. Storage update
    storageService.addComment(post.id, user, commentText.trim());

    // 2. Firestore update
    await firebaseRepository.addComment(post.id, newCommentItem);

    const refreshed = storageService.getPostById(post.id);
    if (refreshed) setPost({ ...refreshed });
    setCommentText('');
    showToast('댓글이 등록되었습니다.', 'success');
  };

  // Start Comment Edit
  const handleStartCommentEdit = (c: CommentItem) => {
    setEditingCommentId(c.id);
    setEditingCommentText(c.content);
  };

  // Save Comment Edit
  const handleSaveCommentEdit = async (commentId: string) => {
    if (!editingCommentText.trim()) return;

    storageService.updateComment(post.id, commentId, editingCommentText.trim());
    await firebaseRepository.updateComment(post.id, commentId, editingCommentText.trim());

    const refreshed = storageService.getPostById(post.id);
    if (refreshed) setPost({ ...refreshed });
    setEditingCommentId(null);
    setEditingCommentText('');
    showToast('댓글이 수정되었습니다.', 'success');
  };

  // Delete Comment
  const handleDeleteComment = async (commentId: string, commentAuthorId: string) => {
    const canDelete = Boolean(user && (user.id === commentAuthorId || user.role === 'admin'));
    if (!canDelete) {
      showToast('댓글 삭제 권한이 없습니다.', 'error');
      return;
    }

    if (window.confirm('댓글을 삭제하시겠습니까?')) {
      storageService.deleteComment(post.id, commentId);
      await firebaseRepository.deleteComment(post.id, commentId);

      const refreshed = storageService.getPostById(post.id);
      if (refreshed) setPost({ ...refreshed });
      showToast('댓글이 삭제되었습니다.', 'info');
    }
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'free': return '💬 자유게시판';
      case 'discussion': return '📊 종목토론';
      case 'market': return '🌐 시장정보';
      case 'invest': return '💡 투자정보';
      case 'qa': return '❓ 질문/답변';
      case 'notice': return '📢 공지사항';
      default: return '💬 일반';
    }
  };

  return (
    <div className="space-y-6 pb-16 max-w-4xl mx-auto animate-in fade-in duration-150">
      {/* Back button & Action Menu */}
      <div className="flex items-center justify-between">
        <button
          onClick={navigateToPostList}
          className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>커뮤니티 목록으로 돌아가기</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Author/Admin Actions */}
          {isAuthor && (
            <>
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>수정</span>
              </button>
              <button
                onClick={handleDeletePost}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/40 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>삭제</span>
              </button>
            </>
          )}

          {/* Report Button */}
          <button
            onClick={() => setReportTarget({
              type: 'post',
              targetId: post.id,
              content: post.title + '\n' + post.content,
              authorName: post.author.name,
            })}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors cursor-pointer"
            title="게시글 신고"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
            <span>신고</span>
          </button>
        </div>
      </div>

      {/* Related Stock Top Card (요구사항: 게시글 상세 페이지에서는 관련 종목 정보를 상단에 표시한다) */}
      {matchedStock && (
        <div 
          onClick={() => navigateToStock(matchedStock.symbol)}
          className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-50/70 via-white to-slate-50/80 dark:from-rose-950/20 dark:via-[#131722] dark:to-slate-900/40 border border-rose-200/80 dark:border-rose-900/40 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group hover:border-rose-400 transition-all"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#131722] border border-rose-200 dark:border-rose-800/60 flex items-center justify-center text-rose-500 shrink-0 shadow-xs">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 font-mono">
                  {matchedStock.market}
                </span>
                <span className="text-xs font-mono font-bold text-slate-400">
                  {matchedStock.symbol}
                </span>
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white group-hover:text-rose-500 transition-colors">
                {matchedStock.name}
              </h3>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-6 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
            <div className="text-right">
              <div className="text-base sm:text-lg font-black font-mono text-slate-900 dark:text-white">
                {matchedStock.price.toLocaleString()}원
              </div>
              <PriceBadge change={matchedStock.change} changePercent={matchedStock.changePercent} size="sm" />
            </div>

            <div className="flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 group-hover:translate-x-1 transition-transform">
              <span>종목 상세 보기</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      )}

      {/* Main Post Card */}
      <div className="p-6 sm:p-8 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
        {/* Header Metadata */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {getCategoryLabel(post.category)}
            </span>

            <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {post.createdAt}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Eye className="w-3.5 h-3.5" />
                {post.views}
              </span>
            </div>
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-snug">
            {post.title}
          </h1>

          {/* Author info */}
          <div className="flex items-center gap-3 pt-2">
            <img
              src={post.author.avatar}
              alt={post.author.name}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-100 dark:ring-slate-800"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900 dark:text-white">
                  {post.author.name}
                </span>
                <span className="text-[11px] font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500">
                  {post.author.badge}
                </span>
              </div>
              <span className="text-xs text-slate-400">병돌 인베스트먼트 회원</span>
            </div>
          </div>
        </div>

        {/* Post Content */}
        <div className="prose dark:prose-invert max-w-none text-slate-800 dark:text-slate-200 text-sm sm:text-base leading-relaxed whitespace-pre-line py-4 border-y border-slate-100 dark:border-slate-800/80">
          {post.content}
        </div>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {post.tags.map(t => (
              <span
                key={t}
                className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg font-medium"
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        {/* Bottom Actions: Like, Comment count */}
        <div className="flex items-center justify-between pt-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggleLike}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isLiked
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-white' : ''}`} />
              <span>좋아요 ({post.likes})</span>
            </button>
          </div>

          <div className="text-xs text-slate-400 font-mono">
            댓글 {post.comments?.length || post.commentsCount || 0}개
          </div>
        </div>
      </div>

      {/* Comments Section */}
      <div className="p-6 sm:p-7 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-rose-500" />
          <span>댓글 ({post.comments?.length || post.commentsCount || 0})</span>
        </h3>

        {/* Add Comment Input Form */}
        {!isAuthenticated ? (
          <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-300">
            <span>🔒 댓글을 작성하려면 로그인이 필요합니다.</span>
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold flex items-center gap-1 self-start sm:self-auto cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>로그인하기</span>
            </button>
          </div>
        ) : (
          <form onSubmit={handleAddComment} className="flex gap-2">
            <input
              type="text"
              required
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              placeholder="동료 투자자들에게 따뜻하고 건설적인 댓글을 남겨주세요."
              className="flex-1 px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 font-medium"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 shadow-md shadow-rose-600/20 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>등록</span>
            </button>
          </form>
        )}

        {/* Comments List */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800/80 pt-2">
          {visibleComments.length > 0 ? (
            <>
              {visibleComments.map(c => {
                const isCommentAuthor = Boolean(user && (user.id === c.author.id || user.role === 'admin'));
                const isEditingThis = editingCommentId === c.id;

                return (
                  <div key={c.id} className="py-4 first:pt-0 last:pb-0 group space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <img
                          src={c.author.avatar}
                          alt={c.author.name}
                          className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-slate-200 dark:ring-slate-700"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-slate-900 dark:text-white">
                              {c.author.name}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold">
                              {c.author.badge}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">{c.createdAt}</span>
                            {c.updatedAt && (
                              <span className="text-[10px] text-slate-400 italic">({c.updatedAt})</span>
                            )}
                          </div>

                          {/* Inline Edit Form */}
                          {isEditingThis ? (
                            <div className="mt-2 space-y-2">
                              <textarea
                                rows={2}
                                value={editingCommentText}
                                onChange={e => setEditingCommentText(e.target.value)}
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 resize-none font-medium"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleSaveCommentEdit(c.id)}
                                  className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold cursor-pointer"
                                >
                                  저장
                                </button>
                                <button
                                  onClick={() => setEditingCommentId(null)}
                                  className="px-3 py-1 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 mt-1 leading-relaxed break-words">
                              {c.content}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Comment Actions: Edit, Delete, Report */}
                      {!isEditingThis && (
                        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity shrink-0">
                          {isCommentAuthor && (
                            <>
                              <button
                                onClick={() => handleStartCommentEdit(c)}
                                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors"
                                title="댓글 수정"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteComment(c.id, c.author.id)}
                                className="p-1 text-slate-400 hover:text-rose-500 rounded transition-colors"
                                title="댓글 삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setReportTarget({
                              type: 'comment',
                              targetId: c.id,
                              content: c.content,
                              authorName: c.author.name,
                            })}
                            className="p-1 text-slate-400 hover:text-amber-500 rounded transition-colors"
                            title="댓글 신고"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {hasMoreComments && (
                <div className="pt-3 text-center">
                  <button
                    onClick={() => setCommentLimit(prev => prev + 15)}
                    className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    이전 댓글 더보기 ({visibleComments.length} / {(post.comments || []).length})
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="py-8 text-center text-slate-400 text-xs">
              첫 번째 댓글의 주인공이 되어보세요!
            </div>
          )}
        </div>
      </div>

      {/* Edit Post Modal */}
      {isEditModalOpen && (
        <PostEditorModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSuccess={updated => {
            setPost(updated);
            setIsEditModalOpen(false);
          }}
          editPost={post}
        />
      )}

      {/* Report Modal */}
      {reportTarget && (
        <ReportModal
          isOpen={Boolean(reportTarget)}
          onClose={() => setReportTarget(null)}
          targetType={reportTarget.type}
          targetId={reportTarget.targetId}
          postId={post.id}
          targetContent={reportTarget.content}
          targetAuthorName={reportTarget.authorName}
        />
      )}
    </div>
  );
};
