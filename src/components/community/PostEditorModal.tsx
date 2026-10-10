import React, { useState } from 'react';
import { X, Tag, FileText, Send, Sparkles, TrendingUp, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CommunityPost, PostCategory } from '../../types';
import { storageService } from '../../services/storageService';
import { firebaseRepository } from '../../services/firebaseRepository';

interface PostEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newPost: CommunityPost) => void;
  editPost?: CommunityPost | null;
  defaultSymbol?: string;
  defaultCategory?: PostCategory;
}

export const PostEditorModal: React.FC<PostEditorModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editPost,
  defaultSymbol,
  defaultCategory,
}) => {
  const { user, stocks, showToast } = useApp();

  const [category, setCategory] = useState<PostCategory>(
    editPost?.category || defaultCategory || (defaultSymbol ? 'discussion' : 'free')
  );
  const [title, setTitle] = useState(editPost?.title || '');
  const [content, setContent] = useState(editPost?.content || '');
  const [symbol, setSymbol] = useState(editPost?.symbol || defaultSymbol || '');
  const [tagsStr, setTagsStr] = useState(editPost?.tags?.join(', ') || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      showToast('제목과 내용을 모두 입력해주세요.', 'warning');
      return;
    }

    if (!user) {
      showToast('로그인이 필요합니다.', 'warning');
      return;
    }

    // Permission check for edit
    if (editPost && editPost.author.id !== user.id && user.role !== 'admin') {
      showToast('자신이 작성한 게시글만 수정할 수 있습니다.', 'error');
      return;
    }

    setIsSubmitting(true);
    const matchedStock = stocks.find(s => s.symbol === symbol);
    const tags = tagsStr
      .split(',')
      .map(t => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    if (matchedStock && !tags.includes(matchedStock.name)) {
      tags.unshift(matchedStock.name);
    }

    try {
      if (editPost) {
        // 1. Firebase update
        await firebaseRepository.updatePost(editPost.id, {
          category,
          title,
          content,
          symbol: symbol || undefined,
          symbolName: matchedStock?.name || undefined,
          tags,
        });

        // 2. Storage service update
        const updated = storageService.updatePost(editPost.id, {
          category,
          title,
          content,
          symbol: symbol || undefined,
          symbolName: matchedStock?.name || undefined,
          tags,
          updatedAt: '방금 전 (수정됨)',
        });

        showToast('게시글이 성공적으로 수정되었습니다.', 'success');
        if (updated) onSuccess(updated);
      } else {
        const postData = {
          author: {
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            badge: user.role === 'admin' ? '운영자' : user.tier,
            tier: user.tier,
          },
          category,
          title,
          content,
          symbol: symbol || undefined,
          symbolName: matchedStock?.name || undefined,
          tags,
        };

        // 1. Firebase Firestore create
        const firebaseDocId = await firebaseRepository.createPost(postData);

        // 2. Storage service create
        const created = storageService.createPost({
          ...postData,
        });
        created.id = firebaseDocId; // align ID with Firestore

        showToast('게시글이 성공적으로 등록되었습니다!', 'success');
        onSuccess(created);
      }

      onClose();
    } catch (err) {
      console.warn('Post save failed:', err);
      showToast('게시글 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
          <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-rose-500" />
            <span>{editPost ? '게시글 수정' : '새 게시글 작성'}</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Category & Stock Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                게시판 카테고리 <span className="text-rose-500">*</span>
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as PostCategory)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
              >
                <option value="free">💬 자유게시판</option>
                <option value="discussion">📊 종목토론</option>
                <option value="market">🌐 시장정보</option>
                <option value="invest">💡 투자정보</option>
                <option value="qa">❓ 질문/답변</option>
                {user?.role === 'admin' && <option value="notice">📢 공지사항 (관리자)</option>}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span>관련 종목 선택 {category === 'discussion' && <span className="text-rose-500 font-semibold">(추천)</span>}</span>
                {symbol && (
                  <button
                    type="button"
                    onClick={() => setSymbol('')}
                    className="text-[11px] text-slate-400 hover:text-rose-500"
                  >
                    선택 해제
                  </button>
                )}
              </label>
              <select
                value={symbol}
                onChange={e => setSymbol(e.target.value)}
                className={`w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-rose-500 ${
                  category === 'discussion' && !symbol 
                    ? 'border-amber-400/80 dark:border-amber-500/50' 
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <option value="">종목 없음 (일반 토론)</option>
                {stocks.map(s => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.name} ({s.symbol}) - {s.market} · {s.price.toLocaleString()}원
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              글 제목 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="투자자들의 시선을 사로잡는 명확한 제목을 입력하세요."
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 font-medium"
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              본문 내용 <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={8}
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="종목 분석 근거, 차트 지지/저항선, 수급 동향, 투자 아이디어를 자유롭고 품격 있게 작성해 주세요. (허위사실 유포 및 광고성 글은 제재 대상이 됩니다)"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 resize-none leading-relaxed"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              <span>해시태그 (쉼표로 구분)</span>
            </label>
            <input
              type="text"
              value={tagsStr}
              onChange={e => setTagsStr(e.target.value)}
              placeholder="예: 단타, HBM, 실적발표, 눌림목"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
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
              className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSubmitting ? '저장 중...' : editPost ? '게시글 수정 완료' : '게시글 등록하기'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
