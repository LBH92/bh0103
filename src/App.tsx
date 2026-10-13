import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/layout/Navbar';
import { MobileNav } from './components/layout/MobileNav';
import { SearchModal } from './components/layout/SearchModal';
import { AuthModal } from './components/layout/AuthModal';
import { ToastContainer } from './components/common/ToastContainer';
import { Footer } from './components/layout/Footer';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Views
import { HomeView } from './components/home/HomeView';
import { StockListView } from './components/stocks/StockListView';
import { StockDetailView } from './components/stocks/StockDetailView';
import { WatchlistView } from './components/watchlist/WatchlistView';
import { CommunityView } from './components/community/CommunityView';
import { ChatView } from './components/chat/ChatView';
import { AlertsView } from './components/alerts/AlertsView';
import { StockInsightView } from './components/insight/StockInsightView';
import { ProfileView } from './components/profile/ProfileView';
import { AdminView } from './components/admin/AdminView';
import { NewsView } from './components/news/NewsView';
import { StockRankingView } from './components/stocks/StockRankingView';
import { IndexDetailView } from './components/indices/IndexDetailView';
import { PortfolioView } from './components/portfolio/PortfolioView';
import { SideChatPanel } from './components/chat/SideChatPanel';

const MainLayout: React.FC = () => {
  const { 
    activeTab, 
    selectedSymbol, 
    selectedIndexSymbol,
    setActiveTab, 
    user, 
    isAuthenticated, 
    showToast,
    isSideChatOpen
  } = useApp();

  const isAuthorizedAdmin = Boolean(
    isAuthenticated && 
    user && 
    (user.role === 'admin' || user.role === 'superadmin' || user.role === 'moderator')
  );

  // Listen to /admin direct route navigation and subroutes
  // Strict rule: Non-admin or unauthenticated access MUST be rejected and redirected to '/' immediately.
  React.useEffect(() => {
    const handleLocationSync = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;

      if (path.startsWith('/admin') || hash.startsWith('#admin')) {
        if (isAuthorizedAdmin) {
          setActiveTab('admin');
        } else {
          // Reject direct URL access and redirect to home immediately (as required by spec)
          window.history.replaceState(null, '', '/');
          setActiveTab('home');
          showToast('관리자 전용 영역입니다. 인가된 관리자 계정만 접근할 수 있습니다.', 'warning');
        }
      }
    };

    handleLocationSync();
    window.addEventListener('popstate', handleLocationSync);
    return () => window.removeEventListener('popstate', handleLocationSync);
  }, [setActiveTab, isAuthorizedAdmin, showToast]);

  // If in Admin Mode and authorized, render the dedicated Admin System (completely separate AdminLayout)
  if (activeTab === 'admin' && isAuthorizedAdmin) {
    return (
      <>
        <AdminView />
        <SearchModal />
        <AuthModal />
        <ToastContainer />
      </>
    );
  }

  // Public User Layout
  const renderActiveView = () => {
    if (selectedIndexSymbol) {
      return <IndexDetailView symbol={selectedIndexSymbol} />;
    }

    switch (activeTab) {
      case 'home':
        return <HomeView />;
      case 'stocks':
        return selectedSymbol ? <StockDetailView symbol={selectedSymbol} /> : <StockListView />;
      case 'ranking':
        return <StockRankingView />;
      case 'insight':
        return <StockInsightView />;
      case 'watchlist':
        return <WatchlistView />;
      case 'portfolio':
        return <PortfolioView />;
      case 'community':
        return <CommunityView />;
      case 'chat':
        return <ChatView />;
      case 'alerts':
        return <AlertsView />;
      case 'news':
        return <NewsView />;
      case 'profile':
        return <ProfileView />;
      default:
        return <HomeView />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0c0f17] text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-150 relative">
      <Navbar />

      {/* Main Container with responsive right padding when SideChatPanel is open on lg screens */}
      <div className={`flex-1 flex flex-col transition-all duration-200 ${
        activeTab !== 'chat' && isSideChatOpen ? 'lg:pr-[340px] xl:pr-[360px]' : activeTab !== 'chat' ? 'lg:pr-12' : ''
      }`}>
        <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 md:pb-8">
          <ErrorBoundary fallbackTitle="화면을 불러오는 중 문제가 발생했습니다.">
            {renderActiveView()}
          </ErrorBoundary>
        </main>
        <Footer />
      </div>

      {/* Side Chat Panel (Only render when activeTab is not full chat) */}
      {activeTab !== 'chat' && (
        <SideChatPanel onOpenFullChat={() => setActiveTab('chat')} />
      )}

      <MobileNav />
      <SearchModal />
      <AuthModal />
      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
