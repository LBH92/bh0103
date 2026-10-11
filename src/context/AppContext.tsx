import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User as FirebaseUser } from 'firebase/auth';
import { auth } from '../services/firebase';
import { firebaseRepository } from '../services/firebaseRepository';
import { Stock, StockIndex, ExchangeRate, MarketEvent, UserProfile, ViewTab } from '../types';
import { INITIAL_STOCKS, INITIAL_INDICES, INITIAL_EXCHANGE_RATE } from '../services/mockData';
import { storageService } from '../services/storageService';
import { stockRepository, StockDataSourceType } from '../services/stockRepository';
import { stockCache } from '../services/stockCache';
import { notificationService } from '../services/notificationService';
import { fcmPushService } from '../services/fcmPushService';
import { isPreviewEnvironment } from '../utils/environment';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
}

interface AppContextType {
  // Theme
  isDark: boolean;
  toggleTheme: () => void;

  // Navigation
  activeTab: ViewTab;
  setActiveTab: (tab: ViewTab) => void;
  selectedSymbol: string | null;
  navigateToStock: (symbol: string) => void;
  selectedIndexSymbol: 'KOSPI' | 'KOSDAQ' | null;
  navigateToIndex: (symbol: 'KOSPI' | 'KOSDAQ') => void;
  clearSelectedIndex: () => void;
  selectedPostId: string | null;
  setSelectedPostId: (postId: string | null) => void;
  navigateToPost: (postId: string) => void;
  navigateToPostList: () => void;
  communityAuthorFilter: string | null;
  setCommunityAuthorFilter: (authorId: string | null) => void;
  navigateToMyPosts: () => void;

  // Stocks & Indices
  stocks: Stock[];
  indices: StockIndex[];
  exchangeRate: ExchangeRate;
  getStock: (symbol: string) => Stock | undefined;
  isSimulatingLiveTicks: boolean;
  toggleLiveSimulation: () => void;
  stockDataSource: StockDataSourceType;
  toggleStockDataSource: () => void;
  isStockLoading: boolean;
  realtimeStatus: 'connected' | 'connecting' | 'failed';
  checkRealtimeConnection: () => Promise<void>;

  // Watchlist
  watchlist: string[];
  addToWatchlist: (symbol: string) => Promise<void>;
  removeFromWatchlist: (symbol: string) => Promise<void>;
  toggleWatchlist: (symbol: string) => void;
  reorderWatchlist: (newOrder: string[]) => void;
  isWatchlisted: (symbol: string) => boolean;
  refreshWatchlistQuotes: () => Promise<void>;

  // Market Events
  marketEvents: MarketEvent[];
  addMarketEvent: (event: Omit<MarketEvent, 'id' | 'timestamp' | 'active'>) => void;

  // Real Auth State
  firebaseUser: FirebaseUser | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  user: UserProfile | null;
  updateUser: (updates: Partial<UserProfile>) => void;
  logout: () => Promise<void>;
  requireAuth: (actionName?: string) => boolean;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;

  // Search Modal
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;

  // Toast
  toasts: ToastMessage[];
  showToast: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Theme
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('bd_theme');
      if (saved) return saved === 'dark';
      return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      localStorage.setItem('bd_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('bd_theme', 'light');
    }
  }, [isDark]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      const saved = localStorage.getItem('bd_theme');
      if (!saved) {
        setIsDark(e.matches);
      }
    };
    mediaQuery.addEventListener('change', handleMediaChange);
    return () => mediaQuery.removeEventListener('change', handleMediaChange);
  }, []);

  const toggleTheme = () => setIsDark(prev => !prev);

  // Navigation
  const [activeTab, setActiveTabState] = useState<ViewTab>('home');
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedIndexSymbol, setSelectedIndexSymbol] = useState<'KOSPI' | 'KOSDAQ' | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [communityAuthorFilter, setCommunityAuthorFilter] = useState<string | null>(null);

  const setActiveTab = (tab: ViewTab) => {
    setActiveTabState(tab);
    setSelectedIndexSymbol(null);
    setSelectedSymbol(null);
    if (tab !== 'community') {
      setSelectedPostId(null);
    }
    window.history.pushState(null, '', `/${tab === 'home' ? '' : tab}`);
  };

  const navigateToStock = (symbol: string) => {
    setSelectedSymbol(symbol);
    setSelectedIndexSymbol(null);
    setActiveTabState('stocks');
    window.history.pushState({ symbol }, '', `/stocks/${symbol}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToIndex = (symbol: 'KOSPI' | 'KOSDAQ') => {
    setSelectedIndexSymbol(symbol);
    setSelectedSymbol(null);
    setSelectedPostId(null);
    window.history.pushState({ indexSymbol: symbol }, '', `/indices/${symbol}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearSelectedIndex = () => {
    setSelectedIndexSymbol(null);
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setActiveTab('home');
    }
  };

  const navigateToPostList = () => {
    setSelectedPostId(null);
    setSelectedIndexSymbol(null);
    setActiveTabState('community');
    window.history.pushState(null, '', '/community');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navigateToPost = (postId: string) => {
    setSelectedPostId(postId);
    setSelectedIndexSymbol(null);
    setActiveTabState('community');
    window.history.pushState({ postId }, '', `/community?post=${postId}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sync /stocks/:symbol, /indices/:symbol, /community?post=:id, and tabs from URL on initial load and browser back/forward
  useEffect(() => {
    const handleUrlRoute = () => {
      const pathname = window.location.pathname;
      const search = window.location.search;
      const params = new URLSearchParams(search);

      // 0. Index detail: /indices/:symbol (KOSPI or KOSDAQ)
      const indexMatch = pathname.match(/\/indices\/([A-Za-z]+)/i);
      if (indexMatch && (indexMatch[1].toUpperCase() === 'KOSPI' || indexMatch[1].toUpperCase() === 'KOSDAQ')) {
        setSelectedIndexSymbol(indexMatch[1].toUpperCase() as 'KOSPI' | 'KOSDAQ');
        setSelectedSymbol(null);
        setSelectedPostId(null);
        return;
      } else {
        setSelectedIndexSymbol(null);
      }

      // 1. Stock detail: /stocks/:symbol
      const stockMatch = pathname.match(/\/stocks\/([0-9A-Za-z]+)/);
      if (stockMatch && stockMatch[1]) {
        setSelectedSymbol(stockMatch[1]);
        setActiveTabState('stocks');
        return;
      } else {
        setSelectedSymbol(null);
      }

      // 2. Community: /community?post=:id
      const postParam = params.get('post');
      if (pathname.startsWith('/community')) {
        setActiveTabState('community');
        if (postParam) {
          setSelectedPostId(postParam);
        } else {
          setSelectedPostId(null);
        }
        return;
      }

      // 3. Other views
      const cleanPath = pathname.replace(/^\//, '').split('/')[0];
      const validTabs: ViewTab[] = ['home', 'stocks', 'ranking', 'watchlist', 'community', 'chat', 'alerts', 'insight', 'profile', 'news', 'admin'];
      if (validTabs.includes(cleanPath as ViewTab)) {
        setActiveTabState(cleanPath as ViewTab);
        setSelectedPostId(null);
      } else if (!cleanPath) {
        setActiveTabState('home');
        setSelectedPostId(null);
      }
    };

    handleUrlRoute();
    window.addEventListener('popstate', handleUrlRoute);
    return () => window.removeEventListener('popstate', handleUrlRoute);
  }, []);

  const navigateToMyPosts = () => {
    if (!user) {
      requireAuth('내 게시글 확인');
      return;
    }
    setCommunityAuthorFilter(user.id);
    setActiveTab('community');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Stocks & Indices Data
  const [stocks, setStocks] = useState<Stock[]>(INITIAL_STOCKS);
  const [indices, setIndices] = useState<StockIndex[]>(INITIAL_INDICES);
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate>(INITIAL_EXCHANGE_RATE);
  const [isSimulatingLiveTicks, setIsSimulatingLiveTicks] = useState<boolean>(true);
  const [stockDataSource, setStockDataSource] = useState<StockDataSourceType>(() => stockRepository.getCurrentSource());
  const [isStockLoading, setIsStockLoading] = useState<boolean>(false);
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'connecting' | 'failed'>('connecting');

  const checkRealtimeConnection = async () => {
    setRealtimeStatus('connecting');
    const isPreview = isPreviewEnvironment();

    try {
      const res = await fetch('/api/kiwoom/test');
      if (res.ok) {
        const data = await res.json();
        if (data.configured && data.diagnostics?.tokenTest?.success) {
          setRealtimeStatus('connected');
        } else if (isPreview || data.isPreview) {
          // In Google AI Studio preview, keep realtime status connected to the simulated data engine
          setRealtimeStatus('connected');
          if (stockDataSource === 'REAL') {
            stockRepository.setSource('MOCK');
            setStockDataSource('MOCK');
          }
        } else {
          setRealtimeStatus('failed');
          // Auto fallback to MOCK mode when real API connection fails
          if (stockDataSource === 'REAL') {
            stockRepository.setSource('MOCK');
            setStockDataSource('MOCK');
          }
        }
      } else {
        if (isPreview) {
          setRealtimeStatus('connected');
          if (stockDataSource === 'REAL') {
            stockRepository.setSource('MOCK');
            setStockDataSource('MOCK');
          }
        } else {
          setRealtimeStatus('failed');
        }
      }
    } catch {
      if (isPreview) {
        setRealtimeStatus('connected');
        if (stockDataSource === 'REAL') {
          stockRepository.setSource('MOCK');
          setStockDataSource('MOCK');
        }
      } else {
        setRealtimeStatus('failed');
      }
    }
  };

  useEffect(() => {
    checkRealtimeConnection();
  }, [stockDataSource]);

  const toggleStockDataSource = async () => {
    const isPreview = isPreviewEnvironment();

    if (isPreview && stockDataSource === 'MOCK') {
      showToast('AI 스튜디오 미리보기 환경에서는 키움 고정 IP 검증 실패 방지를 위해 [시뮬레이션 데이터 모드]로 안전하게 유지됩니다.', 'info');
      return;
    }

    const nextSource = stockDataSource === 'REAL' ? 'MOCK' : 'REAL';
    setIsStockLoading(true);
    stockRepository.setSource(nextSource);
    setStockDataSource(nextSource);

    try {
      const freshStocks = await stockRepository.getAllStocks(true);
      if (freshStocks && freshStocks.length > 0) setStocks(freshStocks);
      const freshIndices = await stockRepository.getIndices();
      if (freshIndices && freshIndices.length > 0) setIndices(freshIndices);
      const freshExchange = await stockRepository.getExchangeRate();
      if (freshExchange) setExchangeRate(freshExchange);

      showToast(
        nextSource === 'REAL'
          ? '데이터 공급원이 [실제 주식 API (REAL)]로 전환되었습니다.'
          : '데이터 공급원이 [시뮬레이션 데이터 모드]로 전환되었습니다.',
        'info'
      );
    } catch {
      showToast('데이터 공급원 전환 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsStockLoading(false);
    }
  };

  // Auth State
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);

  // Watchlist (Per-User Isolation, Default empty, No mock data)
  const [watchlist, setWatchlist] = useState<string[]>([]);

  // Fetch live Kiwoom quotes for watchlist symbols and merge into stocks state
  const fetchWatchlistQuotes = async (symbolsToFetch?: string[]) => {
    const targetSymbols = symbolsToFetch || watchlist;
    if (!targetSymbols || targetSymbols.length === 0) return;

    try {
      const freshQuotes = await stockRepository.getStocksBySymbols(targetSymbols);
      if (freshQuotes && freshQuotes.length > 0) {
        setStocks(prev => {
          const map = new Map(prev.map(s => [s.symbol, s]));
          for (const s of freshQuotes) {
            const existing = map.get(s.symbol);
            map.set(s.symbol, { ...existing, ...s });
          }
          return Array.from(map.values());
        });
      }
    } catch (err) {
      console.warn('Failed to fetch watchlist quotes:', err);
    }
  };

  const refreshWatchlistQuotes = async () => {
    await fetchWatchlistQuotes();
  };

  // Periodic Watchlist Price Refresh (every 5 seconds)
  useEffect(() => {
    if (watchlist.length === 0) return;
    fetchWatchlistQuotes();
    const interval = setInterval(() => {
      fetchWatchlistQuotes();
    }, 5000);
    return () => clearInterval(interval);
  }, [watchlist.join(',')]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setIsAuthLoading(true);
      if (fbUser) {
        setFirebaseUser(fbUser);
        try {
          const profile = await firebaseRepository.syncUserProfile(
            fbUser.uid,
            fbUser.email || 'user@byeongdol.kr',
            fbUser.displayName || undefined,
            fbUser.photoURL || undefined
          );
          setUser(profile);

          // 5 & 6. Sync user's own watchlists from Firestore
          const remoteWatchlist = await firebaseRepository.getUserWatchlists(fbUser.uid);
          setWatchlist(remoteWatchlist || []);
          storageService.saveUserWatchlist(fbUser.uid, remoteWatchlist || []);
          if (remoteWatchlist && remoteWatchlist.length > 0) {
            fetchWatchlistQuotes(remoteWatchlist);
          }
        } catch (err) {
          console.warn('Failed to load user profile or watchlist from Firestore:', err);
        }
      } else {
        // 10. Clear user watchlist on logout to prevent data leaking
        setFirebaseUser(null);
        setUser(null);
        setWatchlist([]);
        storageService.clearWatchlist();
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const requireAuth = (actionName?: string): boolean => {
    if (!firebaseUser && !user) {
      showToast(actionName ? `${actionName} 기능은 로그인 후 이용 가능합니다.` : '로그인이 필요한 서비스입니다.', 'warning');
      setIsAuthModalOpen(true);
      return false;
    }
    return true;
  };

  const logout = async () => {
    try {
      if (user?.id) {
        // 10. Invalidate FCM Web Push token for logged out account to prevent push leakage
        await fcmPushService.invalidateOnLogout(user.id);
      }
      await signOut(auth);
      setFirebaseUser(null);
      setUser(null);
      // 10. Isolate and clear user watchlist upon logout
      setWatchlist([]);
      storageService.clearWatchlist();
      showToast('로그아웃되었습니다.', 'info');
      if (activeTab === 'admin') {
        setActiveTab('home');
      }
    } catch (err) {
      console.error('Logout error:', err);
      showToast('로그아웃 처리 중 오류가 발생했습니다.', 'error');
    }
  };

  const updateUser = (updates: Partial<UserProfile>) => {
    if (!user) return;
    const updated = { ...user, ...updates };
    setUser(updated);
    storageService.updateUser(updates);
    showToast('프로필 정보가 수정되었습니다.', 'success');
  };

  // Real-time Firestore sync for user's own watchlists
  useEffect(() => {
    if (!user?.id) {
      setWatchlist([]);
      return;
    }
    const unsub = firebaseRepository.subscribeUserWatchlists(user.id, (symbols) => {
      setWatchlist(symbols || []);
      storageService.saveUserWatchlist(user.id, symbols || []);
      if (symbols && symbols.length > 0) {
        fetchWatchlistQuotes(symbols);
        notificationService.syncWatchlistForMonitoring(user.id, symbols);
      }
    });
    return () => unsub();
  }, [user?.id]);

  // 1 & 2. Add to Watchlist (Duplicate prevention & Firestore sync)
  const addToWatchlist = async (symbol: string) => {
    if (!requireAuth('관심종목 저장')) {
      return;
    }
    if (!user?.id) return;

    // 8. Prevent duplicate additions
    if (watchlist.includes(symbol)) {
      showToast('이미 관심종목에 등록되어 있는 종목입니다.', 'info');
      return;
    }

    const updated = [...watchlist, symbol];
    setWatchlist(updated);
    storageService.saveUserWatchlist(user.id, updated);

    // Persist to Firestore
    try {
      await firebaseRepository.addWatchlist(user.id, symbol, updated.length);
    } catch (err) {
      console.warn('Firebase add watchlist failed:', err);
    }

    // Immediately fetch quote so it displays with real Kiwoom price right away
    fetchWatchlistQuotes([symbol]);

    const stock = stocks.find(s => s.symbol === symbol);
    const name = stock ? stock.name : symbol;
    showToast(`'${name}' 관심종목에 추가되었습니다.`, 'success');
  };

  // 9. Remove from Watchlist (Firestore sync & State update)
  const removeFromWatchlist = async (symbol: string) => {
    if (!user?.id) {
      if (!requireAuth('관심종목 관리')) return;
      return;
    }

    const updated = watchlist.filter(s => s !== symbol);
    setWatchlist(updated);
    storageService.saveUserWatchlist(user.id, updated);

    // Delete from Firestore
    try {
      await firebaseRepository.removeWatchlist(user.id, symbol);
    } catch (err) {
      console.warn('Firebase remove watchlist failed:', err);
    }

    const stock = stocks.find(s => s.symbol === symbol);
    const name = stock ? stock.name : symbol;
    showToast(`'${name}' 관심종목에서 삭제되었습니다.`, 'info');
  };

  const toggleWatchlist = (symbol: string) => {
    if (watchlist.includes(symbol)) {
      removeFromWatchlist(symbol);
    } else {
      addToWatchlist(symbol);
    }
  };

  const reorderWatchlist = (newOrder: string[]) => {
    setWatchlist(newOrder);
    if (user?.id) {
      storageService.saveUserWatchlist(user.id, newOrder);
      firebaseRepository.updateWatchlistOrder(user.id, newOrder);
    }
    showToast('관심종목 정렬 순서가 저장되었습니다.', 'info');
  };

  const isWatchlisted = (symbol: string) => watchlist.includes(symbol);
  const getStock = (symbol: string) => stocks.find(s => s.symbol === symbol);

  // Market Events
  const [marketEvents, setMarketEvents] = useState<MarketEvent[]>(() => storageService.getMarketEvents());

  const addMarketEvent = (eventData: Omit<MarketEvent, 'id' | 'timestamp' | 'active'>) => {
    const newEvent = storageService.broadcastMarketEvent(eventData);
    setMarketEvents(storageService.getMarketEvents());
    showToast(`시장 긴급 이벤트 발령: ${newEvent.title}`, 'warning');
  };

  // Search Modal
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      removeToast(id);
    }, 3500);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // -------------------------------------------------------------
  // Data Pipeline: API -> 서버 -> StockRepository -> Firebase/Cache -> 웹
  // -------------------------------------------------------------
  useEffect(() => {
    // Initial fetch from StockRepository (with L1/L2 cache acceleration)
    stockRepository.getAllStocks().then(res => {
      if (res && res.length > 0) setStocks(res);
    });
    stockRepository.getIndices().then(res => {
      if (res && res.length > 0) setIndices(res);
    });
    stockRepository.getExchangeRate().then(res => {
      if (res) setExchangeRate(res);
    });
  }, []);

  // Real-time stock ticks subscription through StockRepository
  useEffect(() => {
    if (!isSimulatingLiveTicks) return;

    const unsubTicks = stockRepository.subscribeTicks(freshStocks => {
      setStocks(freshStocks);
    });

    const indexInterval = setInterval(async () => {
      try {
        const freshIndices = await stockRepository.getIndices();
        if (freshIndices && freshIndices.length > 0) setIndices(freshIndices);
        const freshExchange = await stockRepository.getExchangeRate();
        if (freshExchange) setExchangeRate(freshExchange);
      } catch {}
    }, 2000);

    return () => {
      unsubTicks();
      clearInterval(indexInterval);
    };
  }, [isSimulatingLiveTicks]);

  const toggleLiveSimulation = () => {
    setIsSimulatingLiveTicks(prev => !prev);
    showToast(isSimulatingLiveTicks ? '실시간 시세 틱 정지' : '실시간 시세 틱 재개', 'info');
  };

  return (
    <AppContext.Provider
      value={{
        isDark,
        toggleTheme,
        activeTab,
        setActiveTab,
        selectedSymbol,
        navigateToStock,
        selectedIndexSymbol,
        navigateToIndex,
        clearSelectedIndex,
        selectedPostId,
        setSelectedPostId,
        navigateToPost,
        navigateToPostList,
        communityAuthorFilter,
        setCommunityAuthorFilter,
        navigateToMyPosts,
        stocks,
        indices,
        exchangeRate,
        getStock,
        isSimulatingLiveTicks,
        toggleLiveSimulation,
        stockDataSource,
        toggleStockDataSource,
        isStockLoading,
        realtimeStatus,
        checkRealtimeConnection,
        watchlist,
        addToWatchlist,
        removeFromWatchlist,
        toggleWatchlist,
        reorderWatchlist,
        isWatchlisted,
        refreshWatchlistQuotes,
        marketEvents,
        addMarketEvent,
        firebaseUser,
        isAuthenticated: !!firebaseUser,
        isAuthLoading,
        user,
        updateUser,
        logout,
        requireAuth,
        isAuthModalOpen,
        setIsAuthModalOpen,
        isSearchOpen,
        setIsSearchOpen,
        toasts,
        showToast,
        removeToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
