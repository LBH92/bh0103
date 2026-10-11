import React, { useState, useEffect, useRef } from 'react';
import { 
  TrendingUp, 
  Search, 
  Bell, 
  User, 
  Moon, 
  Sun, 
  Radio, 
  Activity, 
  Shield, 
  Bookmark, 
  MessageSquare, 
  BarChart2, 
  Home, 
  Layers,
  ChevronDown,
  LogIn,
  LogOut,
  FileText,
  Key,
  Newspaper,
  Flame,
  Menu,
  X,
  MoreHorizontal,
  Briefcase
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ViewTab } from '../../types';
import { notificationService } from '../../services/notificationService';
import { KiwoomConfigModal } from '../common/KiwoomConfigModal';
import { getKRXMarketStatus, MarketStatusInfo } from '../../utils/marketHours';
import { isPreviewEnvironment } from '../../utils/environment';

export const Navbar: React.FC = () => {
  const {
    isDark,
    toggleTheme,
    activeTab,
    setActiveTab,
    indices,
    exchangeRate,
    stocks,
    navigateToStock,
    setIsSearchOpen,
    isSimulatingLiveTicks,
    toggleLiveSimulation,
    stockDataSource,
    toggleStockDataSource,
    isStockLoading,
    realtimeStatus,
    checkRealtimeConnection,
    user,
    isAuthenticated,
    logout,
    setIsAuthModalOpen,
    navigateToMyPosts,
  } = useApp();

  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);
  const [isKiwoomModalOpen, setIsKiwoomModalOpen] = useState(false);
  const [marketStatus, setMarketStatus] = useState<MarketStatusInfo>(() => getKRXMarketStatus());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on active tab change or browser navigation
  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileDropdownOpen(false);
  }, [activeTab]);

  // Handle outside click & escape key to close open menus
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (profileDropdownOpen && profileMenuRef.current && !profileMenuRef.current.contains(target)) {
        setProfileDropdownOpen(false);
      }
      if (mobileMenuOpen && mobileMenuRef.current && !mobileMenuRef.current.contains(target)) {
        // Only close if not clicking on the mobile toggle button
        const toggleBtn = (target as HTMLElement).closest?.('[data-mobile-toggle="true"]');
        if (!toggleBtn) {
          setMobileMenuOpen(false);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setProfileDropdownOpen(false);
        setMobileMenuOpen(false);
      }
    };

    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick, { passive: true });
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [profileDropdownOpen, mobileMenuOpen]);

  useEffect(() => {
    const updateMarket = () => setMarketStatus(getKRXMarketStatus());
    updateMarket();
    const timer = setInterval(updateMarket, 10000); // 10초마다 갱신
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    notificationService.getNotifications(user?.id)
      .then(res => setUnreadNotifCount(res.filter(n => !n.read).length))
      .catch(() => {});
    const interval = setInterval(() => {
      notificationService.getNotifications(user?.id)
        .then(res => setUnreadNotifCount(res.filter(n => !n.read).length))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // 7 Core Main Navigation Tabs (Always preserved and displayed)
  const mainNavItems: { tab: ViewTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { tab: 'home', label: '홈', icon: <Home className="w-3.5 h-3.5 shrink-0" /> },
    { tab: 'stocks', label: '종목', icon: <BarChart2 className="w-3.5 h-3.5 shrink-0" /> },
    { tab: 'ranking', label: '실시간 순위', icon: <Flame className="w-3.5 h-3.5 text-amber-500 shrink-0" />, badge: 'TOP' },
    { tab: 'insight', label: 'Stock Insight', icon: <Activity className="w-3.5 h-3.5 text-rose-500 shrink-0" />, badge: 'LIVE' },
    { tab: 'portfolio', label: '모의투자', icon: <Briefcase className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> },
    { tab: 'watchlist', label: '관심종목', icon: <Bookmark className="w-3.5 h-3.5 shrink-0" /> },
    { tab: 'community', label: '커뮤니티', icon: <Layers className="w-3.5 h-3.5 shrink-0" /> },
  ];

  // All navigation items for Mobile Responsive Drawer
  const allNavItems: { tab: ViewTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    ...mainNavItems,
    { tab: 'news', label: '뉴스/속보', icon: <Newspaper className="w-4 h-4 text-blue-500 shrink-0" /> },
    { tab: 'chat', label: '실시간 채팅', icon: <MessageSquare className="w-4 h-4 text-rose-500 shrink-0" />, badge: 'LIVE' },
    { 
      tab: 'alerts', 
      label: '알림', 
      icon: <Bell className="w-4 h-4 shrink-0" />, 
      badge: unreadNotifCount > 0 ? `${unreadNotifCount}` : undefined 
    },
    ...(user?.role === 'admin' ? [{ tab: 'admin' as ViewTab, label: '관리자', icon: <Shield className="w-4 h-4 text-indigo-500 shrink-0" /> }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800/80 bg-white/95 dark:bg-[#0c0f17]/95 backdrop-blur-md">
      {/* Top Real-time Market Ticker Ribbon */}
      <div className="hidden sm:flex items-center justify-between px-4 py-1.5 bg-slate-50 dark:bg-[#131722] border-b border-slate-200/70 dark:border-slate-800/50 text-xs font-mono gap-4">
        {/* Left: Ticker & Indices Isolated Container */}
        <div className="flex-1 overflow-hidden min-w-0 pr-2">
          <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-none whitespace-nowrap">
            {/* KRX Market Hours State Indicator */}
            <div 
              className="flex items-center gap-1.5 font-sans font-semibold shrink-0 cursor-default whitespace-nowrap"
              title={`한국 거래소(KRX) KST ${marketStatus.timeStringKST} (${marketStatus.detailLabel})`}
            >
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${
                  marketStatus.isOpen ? 'bg-emerald-400 opacity-75' : 'bg-slate-400 opacity-30'
                }`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  marketStatus.isOpen ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500'
                }`}></span>
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors ${
                marketStatus.isOpen 
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' 
                  : 'bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300/60 dark:border-slate-700'
              }`}>
                {marketStatus.statusLabel}
              </span>
            </div>

            {/* Indices */}
            {indices.map(idx => {
              const isUp = idx.change >= 0;
              return (
                <div key={idx.symbol} className="flex items-center gap-2 shrink-0 whitespace-nowrap">
                  <span className="font-semibold font-sans text-slate-700 dark:text-slate-300">{idx.name}</span>
                  <span className="font-bold text-slate-900 dark:text-white">{idx.value.toLocaleString()}</span>
                  <span className={isUp ? 'text-rose-500 font-bold' : 'text-blue-500 font-bold'}>
                    {isUp ? '▲' : '▼'} {Math.abs(idx.change).toFixed(2)} ({isUp ? '+' : ''}{idx.changePercent}%)
                  </span>
                </div>
              );
            })}

            {/* Exchange Rate */}
            <div className="flex items-center gap-2 shrink-0 whitespace-nowrap">
              <span className="font-semibold font-sans text-slate-700 dark:text-slate-300">원/달러</span>
              <span className="font-bold text-slate-900 dark:text-white">{exchangeRate.rate.toFixed(2)}원</span>
              <span className={exchangeRate.change >= 0 ? 'text-rose-500 font-bold' : 'text-blue-500 font-bold'}>
                {exchangeRate.change >= 0 ? '▲' : '▼'} {Math.abs(exchangeRate.change).toFixed(2)} ({exchangeRate.change >= 0 ? '+' : ''}{exchangeRate.changePercent}%)
              </span>
            </div>

            <div className="h-3 w-px bg-slate-300 dark:bg-slate-700 mx-1 shrink-0" />

            {/* Fast Top Movers Mini Ticker */}
            <div className="flex items-center gap-4 shrink-0">
              {stocks.slice(0, 4).map(s => {
                const isUp = s.change >= 0;
                return (
                  <button
                    key={s.symbol}
                    onClick={() => navigateToStock(s.symbol)}
                    className="flex items-center gap-1.5 hover:underline font-sans shrink-0 whitespace-nowrap"
                  >
                    <span className="text-slate-600 dark:text-slate-400">{s.name}</span>
                    <span className={`font-mono text-[11px] font-semibold ${isUp ? 'text-rose-500' : 'text-blue-500'}`}>
                      {isUp ? '+' : ''}{s.changePercent}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Data Source & Live Simulation Control */}
        <div className="flex items-center gap-2 shrink-0 whitespace-nowrap pl-2 border-l border-slate-200/60 dark:border-slate-800/60">
          {(() => {
            const isPreview = isPreviewEnvironment();
            const isMockMode = stockDataSource === 'MOCK' || isPreview;

            return (
              <>
                <button
                  onClick={toggleStockDataSource}
                  disabled={isStockLoading}
                  className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-sans font-bold transition-all border cursor-pointer ${
                    isMockMode
                      ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20'
                      : realtimeStatus === 'connected'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  }`}
                  title={
                    isMockMode
                      ? '현재 [시뮬레이션 데이터] 모드로 가상 틱 및 10단계 호가가 실시간 구동 중입니다.'
                      : '데이터 공급원: 실제 주식 API'
                  }
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isMockMode
                        ? 'bg-indigo-500 animate-pulse'
                        : realtimeStatus === 'connected'
                        ? 'bg-emerald-500 animate-pulse'
                        : 'bg-amber-500 animate-pulse'
                    }`}
                  />
                  <span>
                    {isMockMode
                      ? '[시뮬레이션 데이터]'
                      : realtimeStatus === 'connected'
                      ? '[키움 실시간 API]'
                      : '[API 연결 확인 중...]'}
                  </span>
                  {isStockLoading && <span className="animate-spin text-[10px]">⏳</span>}
                </button>

                {/* Real-time Connection Status Indicator & Config Button */}
                <button
                  onClick={() => setIsKiwoomModalOpen(true)}
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-sans font-medium transition-colors cursor-pointer border ${
                    isPreview
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                      : realtimeStatus === 'connected'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20'
                  }`}
                  title={
                    isPreview
                      ? '키움증권 Open API 설정 및 상태 확인 (현재 AI 스튜디오 프리뷰 환경에서는 시뮬레이션 데이터로 안전하게 동작합니다)'
                      : '실시간 키움 Open API 연결 및 실전 App Key/Secret 설정'
                  }
                >
                  <Radio
                    className={`w-3 h-3 ${
                      isPreview
                        ? 'text-indigo-500'
                        : realtimeStatus === 'connected'
                        ? 'text-emerald-500 animate-pulse'
                        : 'text-amber-500'
                    }`}
                  />
                  <span>
                    {isPreview
                      ? '키움 연동 (시뮬레이션)'
                      : realtimeStatus === 'connected'
                      ? '키움 실시간 연결됨'
                      : '키움 API 설정'}
                  </span>
                </button>
              </>
            );
          })()}
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-2 sm:gap-3">
          {/* Logo & 7 Core Main Menu Nav */}
          <div className="flex items-center gap-2 lg:gap-3 shrink-0">
            <button
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2 text-left group shrink-0 cursor-pointer mr-0.5"
            >
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-white shadow-md shadow-rose-500/20 group-hover:scale-105 transition-transform shrink-0">
                <TrendingUp className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <span className="font-black text-base tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                  병돌 인베스트먼트
                </span>
                <span className="hidden xl:inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-rose-500/10 text-rose-500 border border-rose-500/20 font-mono shrink-0">
                  KRX
                </span>
              </div>
            </button>

            {/* 7 Core Desktop Menu Tabs: shrink-0 guaranteed, compact padding & gap */}
            <nav className="hidden md:flex items-center gap-1 xl:gap-1.5 shrink-0">
              {mainNavItems.map(item => {
                const isActive = activeTab === item.tab;
                return (
                  <button
                    key={item.tab}
                    onClick={() => setActiveTab(item.tab)}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    {item.icon}
                    <span className="whitespace-nowrap shrink-0">{item.label}</span>
                    {item.badge && (
                      <span className="px-1 py-0.2 rounded-full text-[9px] font-black bg-rose-500 text-white shrink-0 animate-pulse">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Right Action Controls: Search, News, Live Chat, Alerts, Admin, Theme, Profile, Mobile Menu */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
            {/* Quick Search Button: Compact w-40 sm:w-44 */}
            <button
              onClick={() => setIsSearchOpen(true)}
              className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700/80 text-slate-600 dark:text-slate-300 text-xs border border-slate-200/80 dark:border-slate-700/60 transition-colors shrink-0 cursor-pointer w-40 sm:w-44"
              title="종목명/코드 검색 (단축키 ⌘K / Ctrl+K)"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-[11px] text-slate-400 whitespace-nowrap truncate">종목명/코드 검색...</span>
              </div>
              <kbd className="hidden sm:inline-flex items-center px-1 py-0.2 text-[9px] font-mono text-slate-400 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 shrink-0">
                ⌘K
              </kbd>
            </button>

            {/* News Button (Independent Flex Item) */}
            <button
              onClick={() => setActiveTab('news')}
              className={`hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                activeTab === 'news'
                  ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
              title="뉴스/속보"
            >
              <Newspaper className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span className="whitespace-nowrap shrink-0">뉴스</span>
            </button>

            {/* Live Chat Button (Independent Flex Item) */}
            <button
              onClick={() => setActiveTab('chat')}
              className={`hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                activeTab === 'chat'
                  ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
              title="실시간 채팅"
            >
              <MessageSquare className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span className="whitespace-nowrap shrink-0">채팅</span>
              <span className="px-1 py-0.2 rounded-full text-[9px] font-black bg-rose-500 text-white shrink-0">
                LIVE
              </span>
            </button>

            {/* Notification Alerts Button (Independent Flex Item) */}
            <button
              onClick={() => setActiveTab('alerts')}
              className={`flex items-center gap-1 p-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer relative ${
                activeTab === 'alerts'
                  ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
              title="알림"
            >
              <Bell className="w-4 h-4 shrink-0" />
              {unreadNotifCount > 0 && (
                <span className="px-1 py-0.2 min-w-4 text-center rounded-full text-[9px] font-black bg-rose-500 text-white shrink-0">
                  {unreadNotifCount}
                </span>
              )}
            </button>

            {/* Admin Console Quick Button (Admin Only, Independent Flex Item) */}
            {user?.role === 'admin' && (
              <button
                onClick={() => {
                  setActiveTab('admin');
                  window.history.pushState(null, '', '/admin/dashboard');
                }}
                className={`hidden xl:flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
                title="관리자 콘솔"
              >
                <Shield className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="whitespace-nowrap shrink-0">관리자</span>
              </button>
            )}

            {/* Dark / Light Toggle */}
            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
              title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
              aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Mobile Menu Hamburger Toggle */}
            <button
              data-mobile-toggle="true"
              onClick={() => setMobileMenuOpen(prev => !prev)}
              className="md:hidden p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
              aria-label="전체 메뉴 열기/닫기"
              aria-expanded={mobileMenuOpen}
              title="전체 메뉴"
            >
              {mobileMenuOpen ? <X className="w-5 h-5 text-rose-500" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Profile Dropdown / Login Button */}
            {!isAuthenticated || !user ? (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md shadow-rose-600/20 shrink-0 cursor-pointer whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5 shrink-0" />
                <span className="whitespace-nowrap">로그인</span>
              </button>
            ) : (
              <div ref={profileMenuRef} className="relative shrink-0">
                <button
                  onClick={() => setProfileDropdownOpen(prev => !prev)}
                  className="flex items-center gap-1.5 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                  aria-expanded={profileDropdownOpen}
                >
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-7 h-7 rounded-full object-cover ring-2 ring-rose-500/30 shrink-0"
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {user.name}
                    </span>
                    {user.role === 'admin' ? (
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 whitespace-nowrap">
                        총괄관리자
                      </span>
                    ) : (
                      <span className="hidden xl:inline-block px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500 whitespace-nowrap">
                        {user.tier}
                      </span>
                    )}
                  </div>
                  <ChevronDown className="w-3 h-3 text-slate-400 shrink-0 ml-0.5" />
                </button>

                {profileDropdownOpen && (
                  <div
                    className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
                    onClick={() => setProfileDropdownOpen(false)}
                  >
                    <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
                      <p className="text-[11px] font-semibold text-slate-400">내 계정</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{user.name}</p>
                      <p className="text-xs text-slate-400 truncate">{user.email}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-500">
                          {user.tier}
                        </span>
                        {user.role === 'admin' && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-500">
                            총괄관리자
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="py-1">
                      {/* 1. 내 프로필 */}
                      <button
                        onClick={() => setActiveTab('profile')}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
                      >
                        <User className="w-4 h-4 text-slate-400" />
                        <span>내 프로필</span>
                      </button>

                      {/* 2. 내 게시글 */}
                      <button
                        onClick={navigateToMyPosts}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
                      >
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span>내 게시글</span>
                      </button>

                      {/* 3. 관심종목 */}
                      <button
                        onClick={() => setActiveTab('watchlist')}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
                      >
                        <Bookmark className="w-4 h-4 text-slate-400" />
                        <span>관심종목</span>
                      </button>

                      {/* 4. 알림 설정 */}
                      <button
                        onClick={() => setActiveTab('alerts')}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors"
                      >
                        <Bell className="w-4 h-4 text-slate-400" />
                        <span>알림 설정</span>
                      </button>

                      {/* 관리자 바로가기 (관리자 전용: superadmin, admin, moderator) */}
                      {(user.role === 'admin' || user.role === 'superadmin' || user.role === 'moderator') && (
                        <button
                          onClick={() => {
                            setActiveTab('admin');
                            window.history.pushState(null, '', '/admin/dashboard');
                          }}
                          className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-left transition-colors"
                        >
                          <Shield className="w-4 h-4 text-rose-500" />
                          <span>관리자 콘솔</span>
                        </button>
                      )}
                    </div>

                    <div className="pt-1 border-t border-slate-200 dark:border-slate-800">
                      {/* 5. 로그아웃 */}
                      <button
                        onClick={logout}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-left transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>로그아웃</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Responsive Navigation Drawer (md:hidden) */}
      {mobileMenuOpen && (
        <div ref={mobileMenuRef} className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white/98 dark:bg-[#0c0f17]/98 backdrop-blur-md px-4 py-3 animate-in slide-in-from-top-2 duration-150 shadow-lg">
          <div className="grid grid-cols-2 gap-2">
            {allNavItems.map(item => {
              const isActive = activeTab === item.tab;
              return (
                <button
                  key={item.tab}
                  onClick={() => {
                    setActiveTab(item.tab);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold border border-rose-500/30'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {item.icon}
                    <span className="whitespace-nowrap">{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Kiwoom API Credentials & Live Diagnostics Modal */}
      <KiwoomConfigModal
        isOpen={isKiwoomModalOpen}
        onClose={() => setIsKiwoomModalOpen(false)}
        onSuccess={() => checkRealtimeConnection()}
      />
    </header>
  );
};
