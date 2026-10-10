import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  Plus, 
  Search, 
  MessageSquare, 
  Heart, 
  Eye, 
  TrendingUp, 
  ArrowUpDown, 
  SlidersHorizontal, 
  UserCheck, 
  X, 
  Clock, 
  Sparkles,
  Filter
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CommunityPost, PostCategory } from '../../types';
import { storageService } from '../../services/storageService';
import { firebaseRepository } from '../../services/firebaseRepository';
import { matchHangulSearch } from '../../utils/hangul';
import { PostEditorModal } from './PostEditorModal';
import { PostDetailView } from './PostDetailView';

export const CommunityView: React.FC = () => {
  const { 
    selectedPostId, 
    navigateToPost, 
    navigateToStock,
    requireAuth,
    isAuthenticated,
    communityAuthorFilter,
    setCommunityAuthorFilter,
    user
  } = useApp();

  const [posts, setPosts] = useState<CommunityPost[]>(() => storageService.getPosts());
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [sortField, setSortField] = useState<'latest' | 'views' | 'comments' | 'likes'>('latest');
  const [searchTarget, setSearchTarget] = useState<'all' | 'title' | 'content' | 'author' | 'stock'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Subscribe to real-time posts from Firebase Firestore
  useEffect(() => {
    // 1. Initial load
    firebaseRepository.getPosts().then(remotePosts => {
      if (remotePosts && remotePosts.length > 0) {
        setPosts(remotePosts);
      }
    });

    // 2. Real-time subscription
    const unsubscribe = firebaseRepository.subscribePosts(remotePosts => {
      if (remotePosts && remotePosts.length > 0) {
        setPosts(remotePosts);
      }
    });

    return () => unsubscribe();
  }, []);

  // If a post is selected, render PostDetailView
  if (selectedPostId) {
    return <PostDetailView postId={selectedPostId} />;
  }

  // Categories (6 official categories + all)
  const categories: { id: string; label: string }[] = [
    { id: 'all', label: '전체 글' },
    { id: 'free', label: '💬 자유게시판' },
    { id: 'discussion', label: '📊 종목토론' },
    { id: 'market', label: '🌐 시장정보' },
    { id: 'invest', label: '💡 투자정보' },
    { id: 'qa', label: '❓ 질문/답변' },
    { id: 'notice', label: '📢 공지사항' },
  ];

  // Filter posts
  const filteredPosts = posts.filter(post => {
    // 1. Author Filter (e.g. from "내 게시글" menu)
    if (communityAuthorFilter && post.author.id !== communityAuthorFilter) {
      return false;
    }

    // 2. Category Filter
    if (activeCategory !== 'all' && post.category !== activeCategory) {
      return false;
    }

    // 3. Search Filter (지원: 제목, 내용, 작성자, 종목)
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;

    if (searchTarget === 'title') {
      return post.title.toLowerCase().includes(q) || matchHangulSearch(post.title, q);
    }
    if (searchTarget === 'content') {
      return post.content.toLowerCase().includes(q);
    }
    if (searchTarget === 'author') {
      return post.author.name.toLowerCase().includes(q) || matchHangulSearch(post.author.name, q);
    }
    if (searchTarget === 'stock') {
      return (
        (post.symbolName && (post.symbolName.toLowerCase().includes(q) || matchHangulSearch(post.symbolName, q))) ||
        (post.symbol && post.symbol.toLowerCase().includes(q))
      );
    }

    // searchTarget === 'all'
    const matchesTitle = post.title.toLowerCase().includes(q) || matchHangulSearch(post.title, q);
    const matchesContent = post.content.toLowerCase().includes(q);
    const matchesAuthor = post.author.name.toLowerCase().includes(q) || matchHangulSearch(post.author.name, q);
    const matchesStock =
      (post.symbolName && (post.symbolName.toLowerCase().includes(q) || matchHangulSearch(post.symbolName, q))) ||
      (post.symbol && post.symbol.toLowerCase().includes(q)) ||
      post.tags?.some(t => t.toLowerCase().includes(q) || matchHangulSearch(t, q));

    return matchesTitle || matchesContent || matchesAuthor || matchesStock;
  });

  // Sort posts (정렬: 최신순, 조회순, 댓글순, 좋아요순)
  const sortedPosts = [...filteredPosts].sort((a, b) => {
    // Notices always pin at the top
    if (a.category === 'notice' && b.category !== 'notice') return -1;
    if (b.category === 'notice' && a.category !== 'notice') return 1;

    switch (sortField) {
      case 'views':
        return b.views - a.views;
      case 'comments':
        return (b.commentsCount || b.comments?.length || 0) - (a.commentsCount || a.comments?.length || 0);
      case 'likes':
        return b.likes - a.likes;
      case 'latest':
      default:
        // Use ID timestamp or index
        return (b.id || '').localeCompare(a.id || '');
    }
  });

  // Pagination for high-volume performance (10 posts per batch)
  const PAGE_SIZE = 10;
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    setDisplayLimit(PAGE_SIZE);
  }, [activeCategory, searchQuery, searchTarget, sortField, communityAuthorFilter]);

  const paginatedPosts = sortedPosts.slice(0, displayLimit);
  const hasMore = sortedPosts.length > displayLimit;

  const handleOpenWriteModal = () => {
    if (!requireAuth('게시글 작성')) {
      return;
    }
    setIsEditorOpen(true);
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'discussion': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'market': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'invest': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'qa': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'notice': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'free':
      default: return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  const getCategoryLabel = (cat: string) => {
    const item = categories.find(c => c.id === cat);
    return item ? item.label.replace(/^[^\s]+\s*/, '') : '자유';
  };

  return (
    <div className="space-y-5 pb-16 animate-in fade-in duration-150">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="w-6 h-6 text-rose-500" />
            주주 커뮤니티 & 투자 토론
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            자유게시판, 종목토론, 시장·투자 정보, Q&A 및 공지사항을 실시간으로 확인하세요.
          </p>
        </div>

        <button
          onClick={handleOpenWriteModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs shadow-md shadow-rose-600/20 transition-all self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>새 글 작성하기</span>
        </button>
      </div>

      {/* Author Filter Banner if active */}
      {communityAuthorFilter && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-between text-xs text-rose-600 dark:text-rose-400">
          <div className="flex items-center gap-2 font-bold">
            <UserCheck className="w-4 h-4" />
            <span>내 게시글 모아보기 필터가 적용되어 있습니다.</span>
          </div>
          <button
            onClick={() => setCommunityAuthorFilter(null)}
            className="flex items-center gap-1 font-semibold hover:underline cursor-pointer"
          >
            <span>전체 글 보기</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Categories Bar */}
      <div className="p-2 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center gap-1.5 overflow-x-auto scrollbar-none">
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3.5 py-2 text-xs font-bold rounded-xl whitespace-nowrap transition-all cursor-pointer ${
              activeCategory === cat.id
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Search & Sort Controls Bar */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search target selector & Input */}
        <div className="flex items-center gap-2 flex-1 max-w-xl">
          <select
            value={searchTarget}
            onChange={e => setSearchTarget(e.target.value as any)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:border-rose-500"
          >
            <option value="all">전체 검색</option>
            <option value="title">제목</option>
            <option value="content">내용</option>
            <option value="author">작성자</option>
            <option value="stock">종목</option>
          </select>

          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="검색어를 입력하세요 (예: 삼성전자, 초성 ㅅㅅ, 배당)"
              className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Sort Tabs (정렬: 최신순, 조회순, 댓글순, 좋아요순) */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-bold self-end md:self-auto">
          <button
            onClick={() => setSortField('latest')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              sortField === 'latest'
                ? 'bg-white dark:bg-slate-700 text-rose-500 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            최신순
          </button>
          <button
            onClick={() => setSortField('views')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              sortField === 'views'
                ? 'bg-white dark:bg-slate-700 text-rose-500 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            조회순
          </button>
          <button
            onClick={() => setSortField('comments')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              sortField === 'comments'
                ? 'bg-white dark:bg-slate-700 text-rose-500 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            댓글순
          </button>
          <button
            onClick={() => setSortField('likes')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              sortField === 'likes'
                ? 'bg-white dark:bg-slate-700 text-rose-500 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            좋아요순
          </button>
        </div>
      </div>

      {/* Post List */}
      <div className="space-y-3">
        {paginatedPosts.length > 0 ? (
          <>
            {paginatedPosts.map(post => {
              const isNotice = post.category === 'notice';

              return (
                <div
                  key={post.id}
                  onClick={() => navigateToPost(post.id)}
                  className={`p-5 rounded-2xl bg-white dark:bg-[#131722] border transition-all cursor-pointer shadow-xs group ${
                    isNotice
                      ? 'border-purple-200 dark:border-purple-900/50 bg-purple-50/20 dark:bg-purple-950/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  {/* Top Row: Category, Author, Date, Related Stock */}
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${getCategoryBadge(post.category)}`}>
                        {getCategoryLabel(post.category)}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <img
                          src={post.author.avatar}
                          alt={post.author.name}
                          className="w-5 h-5 rounded-full object-cover"
                        />
                        <span className="font-bold text-xs text-slate-800 dark:text-slate-200">
                          {post.author.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500 font-bold">
                          {post.author.badge}
                        </span>
                      </div>

                      <span className="text-[11px] text-slate-400 font-mono">
                        · {post.createdAt}
                      </span>
                    </div>

                    {/* 관련 종목 정보 */}
                    {post.symbolName && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          if (post.symbol) navigateToStock(post.symbol);
                        }}
                        className="text-xs font-bold text-rose-500 hover:underline flex items-center gap-1 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-200 dark:border-rose-500/20"
                      >
                        <TrendingUp className="w-3 h-3" />
                        <span>{post.symbolName}</span>
                        {post.symbol && <span className="font-mono text-[10px] text-slate-400">({post.symbol})</span>}
                      </button>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="font-bold text-base text-slate-900 dark:text-white group-hover:text-rose-500 transition-colors leading-snug">
                    {post.title}
                  </h3>

                  {/* Content snippet */}
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                    {post.content}
                  </p>

                  {/* Tags & Statistics: 조회수, 댓글수, 좋아요 */}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {post.tags?.map(t => (
                        <span
                          key={t}
                          className="text-[11px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md font-medium"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                      <span className="flex items-center gap-1 hover:text-rose-500 transition-colors">
                        <Heart className="w-3.5 h-3.5" />
                        <span>{post.likes}</span>
                      </span>
                      <span className="flex items-center gap-1 hover:text-blue-500 transition-colors">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{post.commentsCount || post.comments?.length || 0}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" />
                        <span>{post.views}</span>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {hasMore && (
              <div className="pt-2 text-center">
                <button
                  onClick={() => setDisplayLimit(prev => prev + PAGE_SIZE)}
                  className="px-5 py-2.5 rounded-xl bg-white dark:bg-[#131722] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 transition-colors shadow-xs"
                >
                  게시글 더보기 ({paginatedPosts.length} / {sortedPosts.length})
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="py-16 text-center rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 space-y-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              조건에 맞는 게시글이 없습니다.
            </p>
            <p className="text-xs text-slate-400">
              새로운 주제로 첫 번째 토론 글을 작성해 보세요.
            </p>
          </div>
        )}
      </div>

      {/* Editor Modal */}
      {isEditorOpen && (
        <PostEditorModal
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          onSuccess={newPost => {
            setPosts(prev => [newPost, ...prev]);
            setIsEditorOpen(false);
          }}
          defaultCategory={activeCategory !== 'all' ? (activeCategory as PostCategory) : undefined}
        />
      )}
    </div>
  );
};
