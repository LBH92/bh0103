import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Flame, 
  Zap, 
  AlertOctagon, 
  ChevronRight, 
  Clock, 
  Bookmark, 
  ArrowUpRight, 
  ArrowDownRight,
  ExternalLink,
  MessageSquare,
  Eye,
  Heart,
  DollarSign,
  Activity,
  Layers,
  Search,
  X,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Newspaper,
  Globe,
  Info
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Stock, MarketEvent, StockNews, GlobalMarketCategory, GlobalMarketSummaryResponse, GlobalMarketItem } from '../../types';
import { PriceBadge } from '../common/PriceBadge';
import { MiniSparkline } from '../common/MiniSparkline';
import { newsService } from '../../services/newsService';
import { storageService } from '../../services/storageService';
import { isSurgeGain, isSurgeLoss, isVolumeSurge, MARKET_THRESHOLDS } from '../../utils/marketThresholds';
import { marketMonitorClient } from '../../services/marketMonitorClient';
import { globalMarketClient } from '../../services/globalMarketClient';
import { MarketAlertEvent } from '../../types/marketMonitor';
import { matchHangulSearch } from '../../utils/hangul';

export const HomeView: React.FC = () => {
  const { 
    indices, 
    stocks, 
    exchangeRate,
    marketEvents, 
    watchlist, 
    navigateToStock, 
    navigateToIndex,
    navigateToPost,
    setActiveTab,
    toggleWatchlist,
    isWatchlisted,
  } = useApp();

  const [activeMoverTab, setActiveMoverTab] = useState<'surge_gain' | 'surge_loss' | 'volume_surge' | 'popular'>('surge_gain');
  const [liveMonitorEvents, setLiveMonitorEvents] = useState<MarketAlertEvent[]>([]);
  const [homeSearchQuery, setHomeSearchQuery] = useState('');

  // Global Market Summary State
  const [marketCategory, setMarketCategory] = useState<GlobalMarketCategory>('domestic');
  const [globalSummary, setGlobalSummary] = useState<GlobalMarketSummaryResponse | null>(null);
  const [isGlobalLoading, setIsGlobalLoading] = useState<boolean>(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalLastFetched, setGlobalLastFetched] = useState<string>('');

  const fetchGlobalMarket = async (force: boolean = false) => {
    setIsGlobalLoading(true);
    setGlobalError(null);
    try {
      const data = await globalMarketClient.getSummary(force);
      setGlobalSummary(data);
      setGlobalLastFetched(data.fetchedAt);
    } catch (err: any) {
      console.warn('[HomeView] Global market fetch error:', err);
      setGlobalError(err.message || '글로벌 시장 요약 데이터를 불러오지 못했습니다.');
    } finally {
      setIsGlobalLoading(false);
    }
  };

  useEffect(() => {
    fetchGlobalMarket();
    const interval = setInterval(() => {
      fetchGlobalMarket();
    }, 25000);
    return () => clearInterval(interval);
  }, []);

  // Market News State (Real API integration)
  const [marketNewsCategory, setMarketNewsCategory] = useState<'all' | 'breaking' | 'market' | 'kospi' | 'kosdaq' | 'economy'>('all');
  const [marketNewsList, setMarketNewsList] = useState<StockNews[]>([]);
  const [isNewsLoading, setIsNewsLoading] = useState<boolean>(true);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsLastFetched, setNewsLastFetched] = useState<Date>(new Date());

  const fetchHomeNews = async (cat = marketNewsCategory) => {
    setIsNewsLoading(true);
    setNewsError(null);
    try {
      const res = await newsService.getMarketNews(cat, 1, 6);
      setMarketNewsList(res.items);
      setNewsLastFetched(new Date());
    } catch (err: any) {
      console.warn('[HomeView] News fetch error:', err);
      setNewsError(err.message || '뉴스 데이터를 불러오지 못했습니다.');
    } finally {
      setIsNewsLoading(false);
    }
  };

  useEffect(() => {
    fetchHomeNews(marketNewsCategory);
  }, [marketNewsCategory]);

  const homeSearchResults = homeSearchQuery.trim()
    ? stocks.filter(s =>
        s.name.toLowerCase().includes(homeSearchQuery.trim().toLowerCase()) ||
        s.symbol.toLowerCase().includes(homeSearchQuery.trim().toLowerCase()) ||
        s.sector.toLowerCase().includes(homeSearchQuery.trim().toLowerCase()) ||
        matchHangulSearch(s.name, homeSearchQuery)
      ).slice(0, 8)
    : [];

  useEffect(() => {
    marketMonitorClient.getEvents().then(res => setLiveMonitorEvents(res)).catch(() => {});
    const interval = setInterval(() => {
      marketMonitorClient.getEvents().then(res => setLiveMonitorEvents(res)).catch(() => {});
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  // Market indices
  const kospi = indices.find(i => i.symbol === 'KOSPI') || indices[0];
  const kosdaq = indices.find(i => i.symbol === 'KOSDAQ') || indices[1];

  // Market metrics calculations
  const totalTradingValue = (kospi.tradingValue + kosdaq.tradingValue).toFixed(2);
  const totalAdvanceCount = kospi.advanceCount + kosdaq.advanceCount;
  const totalDeclineCount = kospi.declineCount + kosdaq.declineCount;

  // 3. Market Movers Data (Criteria: 급등 +5% 이상, 급락 -5% 이하, 거래량 급증 200% 이상)
  // 급등 종목 (+5% 이상)
  const surgeGainersStrict = [...stocks].filter(s => isSurgeGain(s.changePercent)).sort((a, b) => b.changePercent - a.changePercent);
  const surgeGainers = surgeGainersStrict.length > 0 
    ? surgeGainersStrict.slice(0, 5) 
    : [...stocks].sort((a, b) => b.changePercent - a.changePercent).slice(0, 5);

  // 급락 종목 (-5% 이하)
  const surgeLosersStrict = [...stocks].filter(s => isSurgeLoss(s.changePercent)).sort((a, b) => a.changePercent - b.changePercent);
  const surgeLosers = surgeLosersStrict.length > 0 
    ? surgeLosersStrict.slice(0, 5) 
    : [...stocks].sort((a, b) => a.changePercent - b.changePercent).slice(0, 5);

  // 거래량 급증 종목 (평균 대비 200% 이상)
  const volumeSurgeStrict = [...stocks].filter(s => isVolumeSurge(s.volumeRatio)).sort((a, b) => b.volumeRatio - a.volumeRatio);
  const volumeSurge = volumeSurgeStrict.length > 0 
    ? volumeSurgeStrict.slice(0, 5) 
    : [...stocks].sort((a, b) => b.volumeRatio - a.volumeRatio).slice(0, 5);

  // 인기 종목 (거래대금 상위)
  const popularStocks = [...stocks].sort((a, b) => b.tradingValue - a.tradingValue).slice(0, 5);

  // 10. 사용자의 관심종목
  const watchlistStocks = stocks.filter(s => watchlist.includes(s.symbol));

  // Active Market Events (사이드카/서킷브레이커 등)
  const activeEvents = marketEvents.filter(e => e.active);

  // Latest Community Posts
  const communityPosts = storageService.getPosts().slice(0, 5);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-150">
      {/* 1. Real-time Hero Stock Search Bar */}
      <div className="relative bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <span>국내 주식 실시간 검색</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20 font-mono">
                LIVE
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              종목명, 종목코드(6자리), 한글 초성으로 국내 주요 상장 종목을 실시간 탐색하세요.
            </p>
          </div>
        </div>

        {/* Input Bar */}
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 text-rose-500 absolute left-4 pointer-events-none" />
            <input
              type="text"
              value={homeSearchQuery}
              onChange={e => setHomeSearchQuery(e.target.value)}
              placeholder="종목명, 종목코드, 초성 검색 (예: 삼성전자, 005930, ㅅㅅ, 에코프로)"
              className="w-full pl-11 pr-10 py-3 sm:py-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm sm:text-base text-slate-900 dark:text-white placeholder-slate-400 font-medium focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all"
            />
            {homeSearchQuery && (
              <button
                onClick={() => setHomeSearchQuery('')}
                className="absolute right-3.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                title="검색어 지우기"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Auto-complete Dropdown */}
          {homeSearchQuery.trim() && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-700/80 rounded-2xl shadow-2xl z-30 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in zoom-in-95 duration-100 max-h-80 overflow-y-auto">
              {homeSearchResults.length > 0 ? (
                homeSearchResults.map(s => (
                  <button
                    key={s.symbol}
                    onClick={() => {
                      navigateToStock(s.symbol);
                      setHomeSearchQuery('');
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-left transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                        {s.symbol}
                      </span>
                      <div className="truncate">
                        <span className="font-bold text-sm sm:text-base text-slate-900 dark:text-white group-hover:text-rose-500 transition-colors">
                          {s.name}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          {s.market} · {s.sector}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex items-center gap-3 shrink-0">
                      <div className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                        {s.price.toLocaleString()}원
                      </div>
                      <PriceBadge change={s.change} changePercent={s.changePercent} size="sm" />
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                  <div>일치하는 검색 결과가 없습니다: '<span className="text-rose-500 font-bold">{homeSearchQuery}</span>'</div>
                  <div className="text-[11px] text-slate-400">초성 검색 예: ㅅㅅ (삼성전자), ㅅㅋ (SK하이닉스), ㅇㅌ (알테오젠)</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Popular Keywords Chips */}
        <div className="flex items-center gap-2 mt-3 overflow-x-auto scrollbar-none pt-1">
          <span className="text-xs font-semibold text-slate-400 shrink-0 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            인기 검색:
          </span>
          {[
            { name: '삼성전자', symbol: '005930' },
            { name: 'SK하이닉스', symbol: '000660' },
            { name: '알테오젠', symbol: '196170' },
            { name: '현대차', symbol: '005380' },
            { name: '에코프로', symbol: '086520' },
            { name: '한미반도체', symbol: '042700' },
            { name: '두산에너빌리티', symbol: '034020' },
            { name: '카카오', symbol: '035720' },
            { name: 'POSCO홀딩스', symbol: '005490' },
            { name: 'HLB', symbol: '028300' },
          ].map(kw => (
            <button
              key={kw.symbol}
              onClick={() => navigateToStock(kw.symbol)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800/80 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 transition-colors shrink-0 cursor-pointer"
            >
              {kw.name}
            </button>
          ))}
        </div>
      </div>

      {/* 9. 긴급 시장 이벤트 (사이드카 / 서킷브레이커 등) */}
      {activeEvents.length > 0 && (
        <div className="space-y-2">
          {activeEvents.map(evt => (
            <div
              key={evt.id}
              className={`p-3.5 sm:p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                evt.severity === 'urgent'
                  ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-500/50'
                  : evt.severity === 'warning'
                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-500/40'
                  : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-500/40'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg shrink-0 ${
                  evt.severity === 'urgent' 
                    ? 'bg-rose-600 text-white animate-pulse' 
                    : 'bg-amber-500 dark:bg-amber-600 text-white'
                }`}>
                  <AlertOctagon className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className={`font-bold uppercase tracking-tight ${
                      evt.severity === 'urgent'
                        ? 'text-rose-600 dark:text-rose-400'
                        : evt.severity === 'warning'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}>
                      {evt.type === 'sidecar' ? '시장 조치 (사이드카 발동)' : evt.type === 'circuit_breaker' ? '서킷브레이커 (매매정지)' : '시장 주요 이벤트'}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 font-mono">[{evt.timestamp}]</span>
                    {evt.symbol && (
                      <span className="font-semibold text-amber-700 dark:text-amber-300">
                        {evt.symbolName} ({evt.symbol})
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                    {evt.title}
                  </h4>
                  <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-1 mt-0.5">
                    {evt.description}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setActiveTab('alerts')}
                className="self-end sm:self-center shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900/5 hover:bg-slate-900/10 dark:bg-white/10 dark:hover:bg-white/20 text-slate-700 dark:text-white border border-slate-200/60 dark:border-white/10 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <span>상세 확인</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stock Insight 실시간 시장 모니터링 레이더 */}
      {liveMonitorEvents.length > 0 && (
        <section aria-label="실시간 시장 모니터링 레이더">
          <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>Stock Insight 시장 모니터링 레이더</span>
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
                    실시간 {liveMonitorEvents.length}건 감지
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 truncate mt-1">
                  <span className="font-bold text-rose-500 shrink-0">{liveMonitorEvents[0].title}</span>
                  <span className="text-slate-400">·</span>
                  <span className="truncate text-slate-500 dark:text-slate-400">{liveMonitorEvents[0].description}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('insight')}
              className="self-end md:self-center shrink-0 px-3.5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <span>모니터링 상황판</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      )}

      {/* 2. 홈 화면 상단: 국내 및 글로벌 시장 핵심 지표 현황판 */}
      <section aria-label="글로벌 및 국내 시장 핵심 지표 현황">
        <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
          {/* Header & Category Selection Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500 shrink-0">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    시장 종합 현황
                  </h2>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                    marketCategory === 'domestic'
                      ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                      : marketCategory === 'rates'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                  }`}>
                    {marketCategory === 'domestic' ? 'KRX 실시간' : marketCategory === 'rates' ? '공식 고시' : '15~20분 지연 시세'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {marketCategory === 'domestic' && '코스피, 코스닥 지수 및 KRX 주요 시장 유동성 지표'}
                  {marketCategory === 'us' && '미국 3대 대표 지수(S&P 500, 나스닥, 다우) 및 주요 글로벌 빅테크'}
                  {marketCategory === 'asia' && '일본 닛케이 225, 중국 상하이 종합 및 선전 성분 지수'}
                  {marketCategory === 'europe' && '유럽 범유럽 STOXX 600, 독일 DAX 및 영국 FTSE 100'}
                  {marketCategory === 'forex' && '원/달러, 원/100엔, 원/위안, 원/유로 주요 통화 환율'}
                  {marketCategory === 'rates' && '한국은행·미 연준 공식 기준금리 및 미국 국채 금리'}
                </p>
              </div>
            </div>

            {/* Controls: Category Selector Tabs + Refresh */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 overflow-x-auto scrollbar-none text-xs font-semibold">
                {[
                  { key: 'domestic', label: '국내 (KOR)' },
                  { key: 'us', label: '미국 (USA)' },
                  { key: 'asia', label: '아시아 (Asia)' },
                  { key: 'europe', label: '유럽 (Europe)' },
                  { key: 'forex', label: '환율 (Forex)' },
                  { key: 'rates', label: '금리 (Rates)' },
                ].map(cat => (
                  <button
                    key={cat.key}
                    onClick={() => setMarketCategory(cat.key as GlobalMarketCategory)}
                    className={`px-2.5 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                      marketCategory === cat.key
                        ? 'bg-white dark:bg-[#131722] text-rose-600 dark:text-rose-400 font-bold shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              <button
                onClick={() => {
                  if (marketCategory !== 'domestic') {
                    fetchGlobalMarket(true);
                  }
                }}
                disabled={isGlobalLoading}
                title="데이터 새로고침"
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGlobalLoading ? 'animate-spin text-rose-500' : ''}`} />
              </button>
            </div>
          </div>

          {/* Tab 1: Domestic Market 6 Core Cards (Preserving existing layout & features) */}
          {marketCategory === 'domestic' && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y md:divide-y-0 lg:divide-x divide-slate-100 dark:divide-slate-800">
              {/* 1. 코스피 (Clickable Interactive Card) */}
              <div 
                onClick={() => navigateToIndex('KOSPI')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateToIndex('KOSPI'); } }}
                className="p-4 sm:p-5 flex flex-col justify-between cursor-pointer group hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-all select-none relative"
                title="코스피 상세 지수 차트 보기"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">코스피</span>
                    <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold">KOSPI</span>
                  </div>
                  <div className="flex items-center gap-0.5 text-[11px] font-bold text-rose-500 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <span>차트</span>
                    <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
                <div className="mt-2">
                  <div className="text-2xl sm:text-[26px] font-black font-mono tracking-tight text-slate-900 dark:text-white leading-tight group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                    {kospi.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="mt-1">
                    <PriceBadge change={kospi.change} changePercent={kospi.changePercent} size="sm" />
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>고 {kospi.high} / 저 {kospi.low}</span>
                  <span className="text-[10px] text-slate-400">
                    {kospi.lastUpdated ? kospi.lastUpdated.split(' ').slice(-1)[0] : '실시간'}
                  </span>
                </div>
              </div>

              {/* 2. 코스닥 (Clickable Interactive Card) */}
              <div 
                onClick={() => navigateToIndex('KOSDAQ')}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigateToIndex('KOSDAQ'); } }}
                className="p-4 sm:p-5 flex flex-col justify-between cursor-pointer group hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-all select-none relative"
                title="코스닥 상세 지수 차트 보기"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">코스닥</span>
                    <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">KOSDAQ</span>
                  </div>
                  <div className="flex items-center gap-0.5 text-[11px] font-bold text-rose-500 opacity-80 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <span>차트</span>
                    <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
                <div className="mt-2">
                  <div className="text-2xl sm:text-[26px] font-black font-mono tracking-tight text-slate-900 dark:text-white leading-tight group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
                    {kosdaq.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="mt-1">
                    <PriceBadge change={kosdaq.change} changePercent={kosdaq.changePercent} size="sm" />
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>고 {kosdaq.high} / 저 {kosdaq.low}</span>
                  <span className="text-[10px] text-slate-400">
                    {kosdaq.lastUpdated ? kosdaq.lastUpdated.split(' ').slice(-1)[0] : '실시간'}
                  </span>
                </div>
              </div>

              {/* 3. 원/달러 환율 */}
              <div className="p-4 sm:p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">원/달러 환율</span>
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">USD/KRW</span>
                </div>
                <div className="mt-2">
                  <div className="text-2xl sm:text-[26px] font-black font-mono tracking-tight text-slate-900 dark:text-white leading-tight">
                    {exchangeRate.rate.toFixed(2)}
                    <span className="text-xs font-normal text-slate-400 ml-1">원</span>
                  </div>
                  <div className="mt-1">
                    <PriceBadge change={exchangeRate.change} changePercent={exchangeRate.changePercent} size="sm" />
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>고 {exchangeRate.high}</span>
                  <span>저 {exchangeRate.low}</span>
                </div>
              </div>

              {/* 4. 총 거래대금 */}
              <div className="p-4 sm:p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">총 거래대금</span>
                  <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">KRX</span>
                </div>
                <div className="mt-2">
                  <div className="text-2xl sm:text-[26px] font-black font-mono tracking-tight text-slate-900 dark:text-white leading-tight">
                    {totalTradingValue}
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">조 원</span>
                  </div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
                    유동성 풍부 국면
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>코스피 {kospi.tradingValue}조</span>
                  <span>코스닥 {kosdaq.tradingValue}조</span>
                </div>
              </div>

              {/* 5. 상승 종목 수 */}
              <div className="p-4 sm:p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">상승 종목 수</span>
                  <span className="text-xs font-mono font-bold text-rose-500">▲ ADV</span>
                </div>
                <div className="mt-2">
                  <div className="text-2xl sm:text-[26px] font-black font-mono tracking-tight text-rose-500 leading-tight">
                    {totalAdvanceCount.toLocaleString()}
                    <span className="text-xs font-medium text-slate-400 ml-1">종목</span>
                  </div>
                  <div className="text-xs font-medium text-rose-500/80 mt-1">
                    코스피 {kospi.advanceCount} / 코스닥 {kosdaq.advanceCount}
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500"
                      style={{ width: `${(totalAdvanceCount / (totalAdvanceCount + totalDeclineCount)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* 6. 하락 종목 수 */}
              <div className="p-4 sm:p-5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400">하락 종목 수</span>
                  <span className="text-xs font-mono font-bold text-blue-500">▼ DEC</span>
                </div>
                <div className="mt-2">
                  <div className="text-2xl sm:text-[26px] font-black font-mono tracking-tight text-blue-500 leading-tight">
                    {totalDeclineCount.toLocaleString()}
                    <span className="text-xs font-medium text-slate-400 ml-1">종목</span>
                  </div>
                  <div className="text-xs font-medium text-blue-500/80 mt-1">
                    코스피 {kospi.declineCount} / 코스닥 {kosdaq.declineCount}
                  </div>
                </div>
                <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${(totalDeclineCount / (totalAdvanceCount + totalDeclineCount)) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tabs 2~6: Global Market Groups (US, Asia, Europe, Forex, Rates) */}
          {marketCategory !== 'domestic' && (
            <div>
              {globalError ? (
                <div className="p-8 text-center space-y-2">
                  <AlertCircle className="w-7 h-7 text-rose-500 mx-auto" />
                  <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">{globalError}</p>
                  <p className="text-xs text-slate-400">데이터 제공처 일시 지연 또는 네트워크 응답 대기 상태입니다.</p>
                  <button
                    onClick={() => fetchGlobalMarket(true)}
                    className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer transition-colors"
                  >
                    새로고침
                  </button>
                </div>
              ) : isGlobalLoading && !globalSummary ? (
                <div className="p-12 text-center space-y-3">
                  <RefreshCw className="w-6 h-6 text-rose-500 animate-spin mx-auto" />
                  <p className="text-xs text-slate-400">글로벌 시장 데이터(15~20분 지연 공시 시세)를 불러오는 중입니다...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4 p-4 sm:p-5">
                  {(globalSummary?.groups?.[marketCategory as keyof typeof globalSummary.groups] || []).map(item => (
                    <div
                      key={item.id}
                      className="p-4 rounded-xl border border-slate-100 dark:border-slate-800/90 bg-slate-50/50 dark:bg-slate-900/40 hover:border-slate-200 dark:hover:border-slate-700/80 transition-all flex flex-col justify-between"
                    >
                      <div>
                        {/* Header: Name, Symbol, Delay Pill */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                              {item.name}
                            </h3>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                {item.symbol}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                {item.currency}
                              </span>
                            </div>
                          </div>

                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                            item.delayStatus === 'official_notice'
                              ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                          }`}>
                            {item.delayLabel}
                          </span>
                        </div>

                        {/* Values or Error State */}
                        {item.status === 'error' ? (
                          <div className="my-4 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{item.errorMessage || '해당 데이터 일시 지연 상태'}</span>
                          </div>
                        ) : (
                          <div className="mt-3 flex items-baseline justify-between gap-2">
                            <div>
                              <div className="text-xl sm:text-2xl font-black font-mono tracking-tight text-slate-900 dark:text-white leading-tight">
                                {item.displayValue ? item.displayValue : (
                                  <>
                                    {item.value.toLocaleString(undefined, {
                                      minimumFractionDigits: item.category === 'rates' ? 3 : 2,
                                      maximumFractionDigits: item.category === 'rates' ? 3 : 2
                                    })}
                                    {item.unit && <span className="text-xs font-normal text-slate-400 ml-1">{item.unit}</span>}
                                  </>
                                )}
                              </div>
                              <div className="mt-1.5 flex items-center gap-1.5">
                                {item.change === 0 && item.category === 'rates' ? (
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-mono">
                                    동결 (변동 없음)
                                  </span>
                                ) : (
                                  <PriceBadge change={item.change} changePercent={item.changePercent} size="sm" />
                                )}
                              </div>
                            </div>

                            {/* Sparkline (if historical data exists) */}
                            {item.sparkline && item.sparkline.length >= 2 && (
                              <div className="shrink-0 pt-1">
                                <MiniSparkline data={item.sparkline} isUp={item.change >= 0} width={76} height={28} />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Footer: Provider and Source Timestamp */}
                      <div className="mt-3 pt-2.5 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 gap-2">
                        <span className="truncate" title={item.provider}>
                          {item.provider}
                        </span>
                        <span className="font-mono shrink-0">
                          {item.marketTime ? item.marketTime.replace(' (KST)', '') : (item.lastUpdated ? item.lastUpdated.replace(' (KST)', '') : '')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section Footer: Attribution & Principles Notice */}
          <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5 min-w-0">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">
                {marketCategory === 'domestic'
                  ? '국내 데이터: KRX 한국거래소 · 키움 Open API 및 야후 파이낸스 실시간/준실시간 연동'
                  : '해외 데이터: Yahoo Finance 공개 API · 한국은행(BOK) · 미국 연방준비제도(FRB) 공시 (15~20분 지연, 키움 API 미사용)'}
              </span>
            </div>
            {globalLastFetched && marketCategory !== 'domestic' && (
              <div className="font-mono text-[10px] text-slate-400 shrink-0">
                조회 시각: {globalLastFetched}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 내 관심종목 퀵 트래커 바 */}
      {watchlistStocks.length > 0 && (
        <section aria-label="내 관심종목 빠른 현황">
          <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <Bookmark className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                내 관심종목 ({watchlistStocks.length})
              </span>
            </div>

            <div className="flex items-center gap-4 overflow-x-auto scrollbar-none py-0.5">
              {watchlistStocks.map(stock => {
                const isUp = stock.change >= 0;
                return (
                  <button
                    key={stock.symbol}
                    onClick={() => navigateToStock(stock.symbol)}
                    className="flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800/70 px-2 py-1 rounded-lg transition-colors shrink-0 text-left"
                  >
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {stock.name}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                      {stock.price.toLocaleString()}원
                    </span>
                    <span className={`text-[11px] font-mono font-bold ${isUp ? 'text-rose-500' : 'text-blue-500'}`}>
                      {isUp ? '+' : ''}{stock.changePercent}%
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setActiveTab('watchlist')}
              className="text-xs font-bold text-rose-500 hover:underline shrink-0 hidden sm:inline-flex items-center"
            >
              전체 관리 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      )}

      {/* 3. 핵심 4대 시장 랭킹 섹션: 급등 종목, 급락 종목, 거래량 급증, 인기 종목 */}
      {/* Desktop: 4-Column High-Density Grid / Mobile: Tab Switcher + Full List */}
      <section aria-label="시장 핵심 순위">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-rose-500" />
              실시간 시장 주요 종목 랭킹
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              한국거래소(KRX) 장중 실시간 급등락 및 거래량 급증 모니터링
            </p>
          </div>

          <button
            onClick={() => setActiveTab('ranking')}
            className="text-xs font-bold text-rose-500 hover:underline flex items-center gap-0.5 cursor-pointer"
          >
            <span>실시간 종목 순위 전체보기 (TOP 20)</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile Tab Control for easy switching on small screens */}
        <div className="flex lg:hidden items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl mb-3 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveMoverTab('surge_gain')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${
              activeMoverTab === 'surge_gain' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-500'
            }`}
          >
            🚀 급등 (+5% 이상)
          </button>
          <button
            onClick={() => setActiveMoverTab('surge_loss')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${
              activeMoverTab === 'surge_loss' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500'
            }`}
          >
            📉 급락 (-5% 이하)
          </button>
          <button
            onClick={() => setActiveMoverTab('volume_surge')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${
              activeMoverTab === 'volume_surge' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-500'
            }`}
          >
            ⚡ 거래량 급증 (200% 이상)
          </button>
          <button
            onClick={() => setActiveMoverTab('popular')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${
              activeMoverTab === 'popular' ? 'bg-slate-700 text-white shadow-xs' : 'text-slate-500'
            }`}
          >
            🔥 거래대금 상위
          </button>
        </div>

        {/* 4-Column Grid on Desktop, Active Tab on Mobile */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Column 1: 급등 종목 */}
          <div className={`bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs ${activeMoverTab !== 'surge_gain' ? 'hidden lg:block' : ''}`}>
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-rose-500/5">
              <div className="flex items-center gap-1.5 font-bold text-xs text-rose-500">
                <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
                <span>급등 종목</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                +5% 이상
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {surgeGainers.map((stock, i) => (
                <div
                  key={stock.symbol}
                  onClick={() => navigateToStock(stock.symbol)}
                  className="px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-4 font-mono font-bold text-xs text-rose-500 shrink-0">
                      {i + 1}
                    </span>
                    <div className="truncate">
                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-rose-500 transition-colors truncate block">
                        {stock.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{stock.symbol}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold font-mono text-xs text-slate-900 dark:text-white">
                      {stock.price.toLocaleString()}원
                    </div>
                    <span className="font-mono text-xs font-bold text-rose-500">
                      +{stock.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 2: 급락 종목 */}
          <div className={`bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs ${activeMoverTab !== 'surge_loss' ? 'hidden lg:block' : ''}`}>
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-blue-500/5">
              <div className="flex items-center gap-1.5 font-bold text-xs text-blue-500">
                <ArrowDownRight className="w-4 h-4 stroke-[2.5]" />
                <span>급락 종목</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                -5% 이하
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {surgeLosers.map((stock, i) => (
                <div
                  key={stock.symbol}
                  onClick={() => navigateToStock(stock.symbol)}
                  className="px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-4 font-mono font-bold text-xs text-blue-500 shrink-0">
                      {i + 1}
                    </span>
                    <div className="truncate">
                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-blue-500 transition-colors truncate block">
                        {stock.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{stock.symbol}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold font-mono text-xs text-slate-900 dark:text-white">
                      {stock.price.toLocaleString()}원
                    </div>
                    <span className="font-mono text-xs font-bold text-blue-500">
                      {stock.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 3: 거래량 급증 */}
          <div className={`bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs ${activeMoverTab !== 'volume_surge' ? 'hidden lg:block' : ''}`}>
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-amber-500/5">
              <div className="flex items-center gap-1.5 font-bold text-xs text-amber-500">
                <Zap className="w-4 h-4" />
                <span>거래량 급증</span>
              </div>
              <span className="text-[10px] font-mono font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                200% 이상
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {volumeSurge.map((stock, i) => (
                <div
                  key={stock.symbol}
                  onClick={() => navigateToStock(stock.symbol)}
                  className="px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-4 font-mono font-bold text-xs text-amber-500 shrink-0">
                      {i + 1}
                    </span>
                    <div className="truncate">
                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-amber-500 transition-colors truncate block">
                        {stock.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {(stock.volume / 10000).toFixed(0)}만 주
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold font-mono text-xs text-amber-500">
                      {stock.volumeRatio}% 폭증
                    </div>
                    <span className={`font-mono text-[11px] font-bold ${stock.change >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
                      {stock.change >= 0 ? '+' : ''}{stock.changePercent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Column 4: 인기 종목 (거래대금 상위) */}
          <div className={`bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs ${activeMoverTab !== 'popular' ? 'hidden lg:block' : ''}`}>
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-500/5">
              <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800 dark:text-slate-200">
                <Flame className="w-4 h-4 text-rose-500" />
                <span>인기 종목</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">거래대금 기준</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {popularStocks.map((stock, i) => (
                <div
                  key={stock.symbol}
                  onClick={() => navigateToStock(stock.symbol)}
                  className="px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-4 font-mono font-bold text-xs text-slate-400 shrink-0">
                      {i + 1}
                    </span>
                    <div className="truncate">
                      <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-rose-500 transition-colors truncate block">
                        {stock.name}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {stock.tradingValue.toLocaleString()}억 원
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold font-mono text-xs text-slate-900 dark:text-white">
                      {stock.price.toLocaleString()}원
                    </div>
                    <span className={`font-mono text-[11px] font-bold ${stock.change >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
                      {stock.change >= 0 ? '+' : ''}{stock.changePercent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. 최신 뉴스 & 인기 커뮤니티 글 (2-Column Dense Grid) */}
      <section aria-label="시장 뉴스 및 주주 토론">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: 최신 시장 뉴스 (실제 뉴스 API 연동) */}
          <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-blue-500" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  시장 주요 뉴스 & 속보
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchHomeNews(marketNewsCategory)}
                  disabled={isNewsLoading}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  title="뉴스 새로고침"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isNewsLoading ? 'animate-spin text-blue-500' : ''}`} />
                </button>
                <button
                  onClick={() => setActiveTab('news')}
                  className="text-xs font-semibold text-blue-500 hover:text-blue-400 flex items-center gap-1 transition-colors"
                >
                  <span>전체보기</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40 flex items-center gap-1 overflow-x-auto scrollbar-none">
              {[
                { id: 'all', label: '전체' },
                { id: 'breaking', label: '⚡ 주요 속보' },
                { id: 'market', label: '국내 증시' },
                { id: 'kospi', label: '코스피' },
                { id: 'kosdaq', label: '코스닥' },
                { id: 'economy', label: '경제' },
              ].map(cat => {
                const isActive = marketNewsCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setMarketNewsCategory(cat.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                      isActive
                        ? 'bg-blue-500 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {/* Loading Skeleton */}
            {isNewsLoading && marketNewsList.length === 0 && (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(n => (
                  <div key={n} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 animate-pulse space-y-2">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700/50 rounded-sm w-3/4"></div>
                    <div className="h-3 bg-slate-200 dark:bg-slate-700/30 rounded-sm w-1/2"></div>
                  </div>
                ))}
              </div>
            )}

            {/* Error State */}
            {!isNewsLoading && newsError && marketNewsList.length === 0 && (
              <div className="p-6 text-center space-y-2">
                <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
                <p className="text-xs text-rose-400 font-semibold">{newsError}</p>
                <button
                  onClick={() => fetchHomeNews(marketNewsCategory)}
                  className="px-3 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-colors"
                >
                  다시 시도
                </button>
              </div>
            )}

            {/* Empty State */}
            {!isNewsLoading && !newsError && marketNewsList.length === 0 && (
              <div className="p-8 text-center text-slate-400 space-y-1">
                <Newspaper className="w-8 h-8 mx-auto text-slate-600 opacity-50" />
                <p className="text-xs text-slate-400">등록된 최신 뉴스가 없습니다.</p>
              </div>
            )}

            {/* Real News Items */}
            {marketNewsList.length > 0 && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 flex-1">
                {marketNewsList.map(news => (
                  <div key={news.id} className="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px]">
                          {news.source}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {news.timeAgo || news.time}
                        </span>
                      </div>
                      <a
                        href={news.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-blue-500 transition-colors"
                        title="원문 기사 보기"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    <a
                      href={news.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors leading-snug block"
                    >
                      {news.title}
                    </a>

                    {news.summary && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {news.summary}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Bottom Link to Full News Screen */}
            <div className="p-3 bg-slate-50 dark:bg-[#10141f] border-t border-slate-100 dark:border-slate-800 text-center">
              <button
                onClick={() => setActiveTab('news')}
                className="w-full py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-blue-500 dark:hover:text-blue-400 flex items-center justify-center gap-1 transition-colors"
              >
                <span>전체 뉴스 피드에서 더보기</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Right Column: 인기 커뮤니티 글 */}
          <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-500" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  인기 커뮤니티 글
                </h3>
              </div>
              <button
                onClick={() => setActiveTab('community')}
                className="text-xs font-bold text-rose-500 hover:underline flex items-center"
              >
                커뮤니티 전체 <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {communityPosts.map(post => (
                <div
                  key={post.id}
                  onClick={() => navigateToPost(post.id)}
                  className="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {post.author.name}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-amber-500 font-semibold">{post.author.badge}</span>
                    <span aria-hidden="true">·</span>
                    <span>{post.createdAt}</span>

                    {post.symbolName && (
                      <span className="font-semibold text-rose-500 ml-auto text-[11px]">
                        [{post.symbolName}]
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-rose-500 transition-colors line-clamp-1">
                    {post.title}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                    {post.content}
                  </p>

                  <div className="flex items-center gap-3 text-xs font-mono text-slate-400 mt-2">
                    <span className="flex items-center gap-1 hover:text-rose-500 transition-colors">
                      <Heart className="w-3.5 h-3.5" />
                      {post.likes}
                    </span>
                    <span className="flex items-center gap-1 hover:text-blue-500 transition-colors">
                      <MessageSquare className="w-3.5 h-3.5" />
                      {post.commentsCount || post.comments?.length || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      {post.views}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
