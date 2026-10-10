import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  MessageSquare, 
  ShieldAlert, 
  MessagesSquare, 
  Megaphone, 
  Sparkles, 
  Bell, 
  Activity, 
  Lock, 
  Sliders, 
  ExternalLink, 
  LogOut, 
  Menu, 
  X, 
  Shield, 
  TrendingUp,
  ChevronRight,
  Sun,
  Moon
} from 'lucide-react';
import { AdminSubTab, UserProfile, UserRole } from '../../types';
import { useApp } from '../../context/AppContext';
import { auth } from '../../services/firebase';
import { signOut } from 'firebase/auth';

interface AdminLayoutProps {
  activeTab: AdminSubTab;
  onSelectTab: (tab: AdminSubTab) => void;
  onGoToSite: () => void;
  user: UserProfile;
  pendingReportsCount: number;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  activeTab,
  onSelectTab,
  onGoToSite,
  user,
  pendingReportsCount,
  children,
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const menuItems: { id: AdminSubTab; label: string; icon: React.ReactNode; badge?: number; minRole?: UserRole }[] = [
    { id: 'dashboard', label: '대시보드', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'users', label: '회원 관리', icon: <Users className="w-4 h-4" />, minRole: 'admin' },
    { id: 'posts', label: '게시글 관리', icon: <FileText className="w-4 h-4" /> },
    { id: 'comments', label: '댓글 관리', icon: <MessageSquare className="w-4 h-4" /> },
    { id: 'reports', label: '신고 관리', icon: <ShieldAlert className="w-4 h-4" />, badge: pendingReportsCount },
    { id: 'chat', label: '채팅 관리', icon: <MessagesSquare className="w-4 h-4" /> },
    { id: 'notices', label: '공지사항', icon: <Megaphone className="w-4 h-4" />, minRole: 'admin' },
    { id: 'filters', label: '금칙어 관리', icon: <Sparkles className="w-4 h-4" />, minRole: 'admin' },
    { id: 'alerts', label: '알림 관리', icon: <Bell className="w-4 h-4" />, minRole: 'admin' },
    { id: 'market', label: '시장 데이터', icon: <Activity className="w-4 h-4" /> },
    { id: 'logs', label: '관리자 로그', icon: <Lock className="w-4 h-4" /> },
    { id: 'settings', label: '시스템 설정', icon: <Sliders className="w-4 h-4" />, minRole: 'superadmin' },
  ];

  const handleLogout = async () => {
    try {
      await signOut(auth);
      onGoToSite();
    } catch {}
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'superadmin':
        return 'bg-amber-500 text-white shadow-xs';
      case 'admin':
        return 'bg-rose-600 text-white shadow-xs';
      case 'moderator':
        return 'bg-purple-600 text-white shadow-xs';
      default:
        return 'bg-slate-700 text-slate-300';
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-[#090c12] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-150">
      {/* 1. Admin Top Bar */}
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-[#0d111a]/95 border-b border-slate-200 dark:border-slate-800/80 backdrop-blur-md px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Left Brand & Mobile Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => onSelectTab('dashboard')}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-rose-500/20">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-black text-sm tracking-tight text-slate-900 dark:text-white">
                    Stock Insight
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-rose-500/10 text-rose-500 border border-rose-500/20">
                    ADMIN
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  통합 관제 콘솔
                </div>
              </div>
            </div>
          </div>

          {/* Right Admin Profile & Actions */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Quick Link: "사이트 바로가기" */}
            <button
              onClick={onGoToSite}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all shadow-xs"
              title="일반 사용자 홈으로 돌아가기"
            >
              <ExternalLink className="w-3.5 h-3.5 text-rose-500" />
              <span className="hidden sm:inline">사이트 바로가기</span>
            </button>

            {/* Admin Profile & Role Badge */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
              <img
                src={user.avatar}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700"
              />
              <div className="hidden md:block text-left text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-slate-900 dark:text-white truncate max-w-[120px]">
                    {user.name}
                  </span>
                  <span className={`text-[10px] font-black px-1.5 py-0.2 rounded ${getRoleBadge(user.role)}`}>
                    {user.role.toUpperCase()}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">
                  {user.email}
                </div>
              </div>
            </div>

            {/* Logout */}
            <button
              onClick={handleLogout}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
              title="관리자 로그아웃"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Body: Sidebar + Main Content */}
      <div className="flex-1 flex w-full max-w-[1700px] mx-auto">
        {/* Desktop Left Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-white dark:bg-[#0d111a] border-r border-slate-200 dark:border-slate-800/80 p-4 space-y-1 self-stretch">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
            관리자 내비게이션
          </div>

          {menuItems.map(item => {
            const isActive = activeTab === item.id;
            const isRestricted = item.minRole === 'superadmin' && user.role !== 'superadmin';

            return (
              <button
                key={item.id}
                disabled={isRestricted}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-rose-600 text-white font-bold shadow-md shadow-rose-600/20'
                    : isRestricted
                    ? 'opacity-30 text-slate-400 cursor-not-allowed'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span>{item.label}</span>
                </div>

                {Boolean(item.badge && item.badge > 0) && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isActive ? 'bg-white text-rose-600' : 'bg-rose-500 text-white'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          <div className="pt-6 mt-auto">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="font-bold text-slate-700 dark:text-slate-300">RBAC 보안 활성화</div>
              <div>세션: <strong className="text-emerald-500">HTTPS / TLS 1.3</strong></div>
              <div>규칙: <strong className="text-slate-500">Firestore v2</strong></div>
            </div>
          </div>
        </aside>

        {/* Mobile Drawer */}
        {isMobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex">
            <div className="w-72 bg-white dark:bg-[#0d111a] border-r border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between h-full animate-in slide-in-from-left duration-200">
              <div className="space-y-1">
                <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-black text-sm text-slate-900 dark:text-white">
                    관리자 메뉴
                  </span>
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-1 rounded-lg text-slate-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {menuItems.map(item => {
                  const isActive = activeTab === item.id;
                  const isRestricted = item.minRole === 'superadmin' && user.role !== 'superadmin';

                  return (
                    <button
                      key={item.id}
                      disabled={isRestricted}
                      onClick={() => {
                        onSelectTab(item.id);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-rose-600 text-white font-bold'
                          : isRestricted
                          ? 'opacity-30 text-slate-400 cursor-not-allowed'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {item.icon}
                        <span>{item.label}</span>
                      </div>
                      {Boolean(item.badge && item.badge > 0) && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onGoToSite();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  <ExternalLink className="w-4 h-4 text-rose-500" />
                  <span>일반 사이트로 이동</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content Area */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
