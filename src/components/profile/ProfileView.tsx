import React, { useState } from 'react';
import { 
  User, 
  Mail, 
  Calendar, 
  Award, 
  TrendingUp, 
  Bookmark, 
  FileText, 
  MessageSquare, 
  Edit2, 
  ShieldCheck, 
  Check, 
  LogOut,
  Bell,
  LogIn,
  Sparkles,
  Key
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { storageService } from '../../services/storageService';
import { UserAiSettingsModal } from './UserAiSettingsModal';

export const ProfileView: React.FC = () => {
  const { user, updateUser, watchlist, navigateToPost, setActiveTab, setIsAuthModalOpen, showToast, logout } = useApp();

  const [isEditing, setIsEditing] = useState(false);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [profileTab, setProfileTab] = useState<'my_posts' | 'my_comments' | 'settings'>('my_posts');

  if (!user) {
    return (
      <div className="py-20 text-center max-w-md mx-auto space-y-4 animate-in fade-in duration-150">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center">
          <User className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white">
            로그인이 필요한 서비스입니다
          </h3>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            병돌 인베스트먼트에 로그인하고 나만의 프로필 관리, 작성 글 모아보기, 관심종목을 확인하세요.
          </p>
        </div>
        <button
          onClick={() => setIsAuthModalOpen(true)}
          className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-colors shadow-md shadow-rose-600/20 inline-flex items-center gap-2"
        >
          <LogIn className="w-4 h-4" />
          <span>로그인 / 회원가입하기</span>
        </button>
      </div>
    );
  }

  const allPosts = storageService.getPosts();
  const myPosts = allPosts.filter(p => p.author.id === user.id || p.author.name === user.name);

  // My comments
  const myComments: { postId: string; postTitle: string; content: string; createdAt: string }[] = [];
  allPosts.forEach(p => {
    p.comments?.forEach(c => {
      if (c.author.id === user.id || c.author.name === user.name) {
        myComments.push({
          postId: p.id,
          postTitle: p.title,
          content: c.content,
          createdAt: c.createdAt,
        });
      }
    });
  });

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateUser({ name, bio });
    setIsEditing(false);
  };

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto animate-in fade-in duration-150">
      {/* Profile Header Card */}
      <div className="p-6 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src={user.avatar}
              alt={user.name}
              className="w-16 h-16 rounded-2xl object-cover ring-2 ring-rose-500/40"
            />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  {user.name}
                </h2>
                <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-amber-500/10 text-amber-500">
                  {user.tier}
                </span>
                {user.role === 'admin' && (
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-rose-500/10 text-rose-500">
                    총괄관리자
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-3">
                <span className="flex items-center gap-1 font-mono">
                  <Mail className="w-3.5 h-3.5" />
                  {user.email}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  가입 {user.joinedDate}
                </span>
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 font-medium">
                {user.bio}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
            <button
              onClick={() => setIsAiSettingsOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-purple-600/20 transition-all cursor-pointer"
              title="개인 AI (Gemini) 연결 및 과금 설정"
            >
              <Key className="w-3.5 h-3.5" />
              <span>AI 계정 연결</span>
            </button>
            <button
              onClick={() => setIsEditing(prev => !prev)}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>{isEditing ? '취소' : '프로필 편집'}</span>
            </button>
            <button
              onClick={logout}
              className="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/40 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-xs font-semibold text-rose-600 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>

        {/* Profile Edit Inline Form */}
        {isEditing && (
          <form onSubmit={handleSaveProfile} className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                닉네임 변경
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full sm:w-80 px-3.5 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                소개글 (바이오)
              </label>
              <input
                type="text"
                value={bio}
                onChange={e => setBio(e.target.value)}
                className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold"
            >
              수정사항 저장
            </button>
          </form>
        )}
      </div>

      {/* Stats Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 text-center">
          <span className="text-xs text-slate-400 block mb-1">작성한 게시글</span>
          <span className="text-xl font-black font-mono text-slate-900 dark:text-white">
            {myPosts.length} <span className="text-xs font-sans font-medium text-slate-400">개</span>
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 text-center">
          <span className="text-xs text-slate-400 block mb-1">작성한 댓글</span>
          <span className="text-xl font-black font-mono text-slate-900 dark:text-white">
            {myComments.length} <span className="text-xs font-sans font-medium text-slate-400">개</span>
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 text-center">
          <span className="text-xs text-slate-400 block mb-1">등록 관심종목</span>
          <span className="text-xl font-black font-mono text-slate-900 dark:text-white">
            {watchlist.length} <span className="text-xs font-sans font-medium text-slate-400">개</span>
          </span>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 text-center">
          <span className="text-xs text-slate-400 block mb-1">모의 승률 (추정)</span>
          <span className="text-xl font-black font-mono text-rose-500">
            {user.winRate || 72.5}%
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-fit">
        <button
          onClick={() => setProfileTab('my_posts')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            profileTab === 'my_posts'
              ? 'bg-white dark:bg-[#1a1f2e] text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          내가 쓴 글 ({myPosts.length})
        </button>
        <button
          onClick={() => setProfileTab('my_comments')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            profileTab === 'my_comments'
              ? 'bg-white dark:bg-[#1a1f2e] text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          내가 쓴 댓글 ({myComments.length})
        </button>
      </div>

      {/* Tab Contents */}
      {profileTab === 'my_posts' && (
        <div className="space-y-3">
          {myPosts.length > 0 ? (
            myPosts.map(post => (
              <div
                key={post.id}
                onClick={() => navigateToPost(post.id)}
                className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs text-slate-400 font-mono">{post.createdAt}</span>
                  {post.symbolName && (
                    <span className="text-xs font-semibold text-rose-500">
                      [{post.symbolName}]
                    </span>
                  )}
                </div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-rose-500 transition-colors">
                  {post.title}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                  {post.content}
                </p>
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 font-mono">
                  <span>추천 {post.likes}</span>
                  <span>댓글 {post.commentsCount || post.comments?.length || 0}</span>
                  <span>조회 {post.views}</span>
                </div>
              </div>
            ))
          ) : (
            <div className="py-12 text-center rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
              아직 작성한 게시글이 없습니다.
            </div>
          )}
        </div>
      )}

      {profileTab === 'my_comments' && (
        <div className="space-y-3">
          {myComments.length > 0 ? (
            myComments.map((c, i) => (
              <div
                key={i}
                onClick={() => navigateToPost(c.postId)}
                className="p-4 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer group"
              >
                <span className="text-[11px] text-slate-400 font-mono block mb-1">
                  원문: {c.postTitle} ({c.createdAt})
                </span>
                <p className="text-xs text-slate-800 dark:text-slate-200 font-medium group-hover:text-rose-500 transition-colors">
                  {c.content}
                </p>
              </div>
            ))
          ) : (
            <div className="py-12 text-center rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
              아직 작성한 댓글이 없습니다.
            </div>
          )}
        </div>
      )}

      {/* User Personal AI Settings Modal */}
      <UserAiSettingsModal
        isOpen={isAiSettingsOpen}
        onClose={() => setIsAiSettingsOpen(false)}
      />
    </div>
  );
};
