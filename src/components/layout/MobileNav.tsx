import React from 'react';
import { Home, BarChart2, Layers, User, Search, Shield, Newspaper, Briefcase } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ViewTab } from '../../types';

export const MobileNav: React.FC = () => {
  const { activeTab, setActiveTab, setIsSearchOpen, user } = useApp();

  const isAdmin = user && (user.role === 'admin' || user.role === 'superadmin' || user.role === 'moderator');

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0c0f17]/95 border-t border-slate-200 dark:border-slate-800 backdrop-blur-lg pb-safe shadow-lg">
      <div className="flex items-center justify-around h-16 px-1 max-w-md mx-auto">
        {/* 1. Home */}
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 ${
            activeTab === 'home'
              ? 'text-rose-500 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
          aria-label="홈"
        >
          <div className={`p-1 rounded-xl transition-colors ${activeTab === 'home' ? 'bg-rose-500/10' : ''}`}>
            <Home className="w-5 h-5" />
          </div>
          <span className={`text-[10px] mt-0.5 tracking-tight ${activeTab === 'home' ? 'font-bold text-rose-500' : 'font-medium'}`}>
            홈
          </span>
        </button>

        {/* 2. Direct Search Modal Trigger */}
        <button
          onClick={() => setIsSearchOpen(true)}
          className="flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 text-rose-600 dark:text-rose-400 hover:opacity-80"
          aria-label="종목 검색"
        >
          <div className="p-1 rounded-xl bg-rose-500/10 transition-colors">
            <Search className="w-5 h-5 text-rose-500" />
          </div>
          <span className="text-[10px] mt-0.5 tracking-tight font-bold text-rose-500">
            검색
          </span>
        </button>

        {/* 3. Stocks */}
        <button
          onClick={() => setActiveTab('stocks')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 ${
            activeTab === 'stocks'
              ? 'text-rose-500 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
          aria-label="종목"
        >
          <div className={`p-1 rounded-xl transition-colors ${activeTab === 'stocks' ? 'bg-rose-500/10' : ''}`}>
            <BarChart2 className="w-5 h-5" />
          </div>
          <span className={`text-[10px] mt-0.5 tracking-tight ${activeTab === 'stocks' ? 'font-bold text-rose-500' : 'font-medium'}`}>
            종목
          </span>
        </button>

        {/* 3.5 Portfolio / Mock Trading */}
        <button
          onClick={() => setActiveTab('portfolio')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 ${
            activeTab === 'portfolio'
              ? 'text-emerald-500 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
          aria-label="모의투자"
        >
          <div className={`p-1 rounded-xl transition-colors ${activeTab === 'portfolio' ? 'bg-emerald-500/10' : ''}`}>
            <Briefcase className="w-5 h-5" />
          </div>
          <span className={`text-[10px] mt-0.5 tracking-tight ${activeTab === 'portfolio' ? 'font-bold text-emerald-500' : 'font-medium'}`}>
            모의투자
          </span>
        </button>

        {/* 4. News */}
        <button
          onClick={() => setActiveTab('news')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 ${
            activeTab === 'news'
              ? 'text-blue-500 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
          aria-label="뉴스"
        >
          <div className={`p-1 rounded-xl transition-colors ${activeTab === 'news' ? 'bg-blue-500/10' : ''}`}>
            <Newspaper className="w-5 h-5" />
          </div>
          <span className={`text-[10px] mt-0.5 tracking-tight ${activeTab === 'news' ? 'font-bold text-blue-500' : 'font-medium'}`}>
            뉴스
          </span>
        </button>

        {/* 4. Community */}
        <button
          onClick={() => setActiveTab('community')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 ${
            activeTab === 'community'
              ? 'text-rose-500 font-bold'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
          aria-label="커뮤니티"
        >
          <div className={`p-1 rounded-xl transition-colors ${activeTab === 'community' ? 'bg-rose-500/10' : ''}`}>
            <Layers className="w-5 h-5" />
          </div>
          <span className={`text-[10px] mt-0.5 tracking-tight ${activeTab === 'community' ? 'font-bold text-rose-500' : 'font-medium'}`}>
            커뮤니티
          </span>
        </button>

        {/* 5. Profile or Admin (if admin) */}
        {isAdmin ? (
          <button
            onClick={() => {
              setActiveTab('admin');
              window.history.pushState(null, '', '/admin/dashboard');
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 ${
              activeTab === 'admin'
                ? 'text-rose-500 font-bold'
                : 'text-rose-600 dark:text-rose-400 hover:opacity-80'
            }`}
            aria-label="관리자"
          >
            <div className={`p-1 rounded-xl transition-colors ${activeTab === 'admin' ? 'bg-rose-500/10' : ''}`}>
              <Shield className="w-5 h-5 text-rose-500" />
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight font-bold text-rose-500">
              관리자
            </span>
          </button>
        ) : (
          <button
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center justify-center flex-1 py-1 transition-all active:scale-95 ${
              activeTab === 'profile'
                ? 'text-rose-500 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            aria-label="내정보"
          >
            <div className={`p-1 rounded-xl transition-colors ${activeTab === 'profile' ? 'bg-rose-500/10' : ''}`}>
              <User className="w-5 h-5" />
            </div>
            <span className={`text-[10px] mt-0.5 tracking-tight ${activeTab === 'profile' ? 'font-bold text-rose-500' : 'font-medium'}`}>
              내정보
            </span>
          </button>
        )}
      </div>
    </nav>
  );
};
