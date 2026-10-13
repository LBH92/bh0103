export interface Stock {
  symbol: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ' | 'US';
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  volumeRatio: number; // vs 20-day avg (e.g., 340% for volume surge)
  tradingValue: number; // in 억 원 (KRW) or 백만 달러 (USD)
  high52w: number;
  low52w: number;
  marketCap: number; // in 조/억 원 (KRW) or 억 달러 (USD)
  per: number;
  pbr: number;
  eps: number;
  dividendYield: number;
  openPrice: number;
  highPrice: number;
  lowPrice: number;
  prevClose: number;
  foreignNetBuy: number; // 외인 순매수 (억 원)
  instNetBuy: number; // 기관 순매수 (억 원)
  candles: CandleData[];
  sparkline: number[];
  currency?: 'KRW' | 'USD';
  exchange?: string;
  delayStatus?: string;
  delayLabel?: string;
  marketSession?: 'REGULAR' | 'PRE' | 'POST' | 'CLOSED';
  lastUpdated?: string;
  dataSource?: 'kiwoom' | 'yahoo' | 'mock';
  nameEn?: string;
  productType?: 'EQUITY' | 'ETF' | 'INDEX';
}

export interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type KiwoomChartPeriod = '1m' | '5m' | '15m' | '30m' | '1h' | 'day';

export interface KiwoomChartResponse {
  symbol: string;
  period: KiwoomChartPeriod;
  periodLabel: string;
  trId: string;
  ticScope?: string;
  supported: boolean;
  candles: CandleData[];
  currentPrice?: number;
  lastCandleClose?: number;
  source: 'kiwoom' | 'yahoo' | 'mock';
  cached: boolean;
  timestamp: number;
  error?: string | null;
  serverIp?: string;
  currency?: 'KRW' | 'USD';
}

export interface StockIndex {
  symbol: 'KOSPI' | 'KOSDAQ';
  name: string;
  value: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open?: number;
  prevClose?: number;
  volume: number; // 천 주
  tradingValue: number; // 조 원
  advanceCount: number; // 상승 종목수
  declineCount: number; // 하락 종목수
  unchangedCount?: number; // 보합 종목수
  sparkline: number[];
  lastUpdated?: string;
  dataSource?: 'kiwoom' | 'yahoo' | 'cache' | 'mock';
  isStale?: boolean;
}

export type IndexChartPeriod = '1d' | '1mo' | '3mo' | '1y' | '3y' | 'day';

export interface IndexChartResponse {
  symbol: 'KOSPI' | 'KOSDAQ';
  name: string;
  period: IndexChartPeriod;
  periodLabel: string;
  candles: CandleData[];
  currentValue: number;
  prevClose: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  tradingValue: number;
  lastUpdated: string;
  dataSource: 'kiwoom' | 'yahoo' | 'cache' | 'mock';
  trId?: string;
  isStale?: boolean;
  error?: string | null;
}

export interface ExchangeRate {
  currency: string;
  name: string;
  rate: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  sparkline: number[];
}

export interface MarketEvent {
  id: string;
  type: 'sidecar' | 'circuit_breaker' | 'disclosure' | 'earnings' | 'macro';
  title: string;
  description: string;
  market?: 'KOSPI' | 'KOSDAQ' | 'US' | 'ALL';
  symbol?: string;
  symbolName?: string;
  timestamp: string; // 표기 시간 (e.g., 2024.08.05 11:00 KST)
  severity: 'urgent' | 'warning' | 'info';
  active: boolean; // 현재 장중 발동 상태 여부 (실제 실시간 확인 데이터가 있을 때만 true)
  sidecarType?: 'BUY' | 'SELL'; // 매수 사이드카 / 매도 사이드카
  triggerDateTime?: string; // 발동 기준 일시 (YYYY-MM-DD HH:mm:ss KST)
  sourceUrl?: string; // 신뢰할 수 있는 공식 거래소/보도 출처 URL
  lastVerifiedAt?: string; // 데이터 마지막 확인 시각
  isHistorical?: boolean; // 과거 실제 발동 기록 여부
  verifiedStatus?: 'VERIFIED_OFFICIAL' | 'INACTIVE' | 'UNVERIFIABLE'; // 데이터 검증 상태
}

export interface OrderBookLevel {
  price: number;
  volume: number;
  change: number;
  changePercent: number;
  barPercent: number;
}

export interface OrderBook {
  symbol: string;
  currentPrice: number;
  asks: OrderBookLevel[]; // 매도 호가 (10 levels, sorted descending)
  bids: OrderBookLevel[]; // 매수 호가 (10 levels, sorted descending)
  totalAskVolume: number;
  totalBidVolume: number;
  bestAskPrice?: number; // 최우선 매도호가 (Ask 1: 매수 체결 기준가)
  bestBidPrice?: number; // 최우선 매수호가 (Bid 1: 매도 체결 기준가)
}

export interface StockNews {
  id: string;
  title: string;
  summary: string;
  source: string;
  time: string;
  pubDate?: string;
  publishedAt?: number;
  timeAgo?: string;
  url: string;
  relatedSymbols?: string[];
  relatedSymbolName?: string;
  category?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export type UserRole = 'user' | 'moderator' | 'admin' | 'superadmin';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  tier: string;
  joinedDate: string;
  bio: string;
  postCount: number;
  commentCount: number;
  winRate?: number;
  status?: 'active' | 'suspended' | 'deleted';
  chatRestricted?: boolean;
  chatMutedUntil?: string;
  suspendedReason?: string;
  lastLoginAt?: string;
  reportedCount?: number;
  reportSubmitCount?: number;
}

export interface WatchlistItem {
  symbol: string;
  name: string;
  addedAt: string;
  memo?: string;
  targetPrice?: number;
  buyPrice?: number;
}

export type PostCategory = 'free' | 'discussion' | 'market' | 'invest' | 'qa' | 'notice';

export interface CommunityPost {
  id: string;
  author: {
    id: string;
    name: string;
    avatar: string;
    badge: string;
    tier: string;
  };
  category: PostCategory;
  title: string;
  content: string;
  symbol?: string;
  symbolName?: string;
  likes: number;
  likedBy?: string[];
  views: number;
  commentsCount: number;
  createdAt: string;
  updatedAt?: string;
  isHot?: boolean;
  isNotice?: boolean;
  tags: string[];
  comments?: CommentItem[];
  status?: 'published' | 'hidden' | 'deleted';
}

export interface CommentItem {
  id: string;
  postId: string;
  author: {
    id: string;
    name: string;
    avatar: string;
    badge: string;
  };
  content: string;
  createdAt: string;
  updatedAt?: string;
  likes: number;
  likedBy?: string[];
  status?: 'published' | 'hidden' | 'deleted';
}

export interface ReportItem {
  id: string;
  reporterId: string;
  reporterName: string;
  targetType: 'post' | 'comment' | 'chat' | 'user';
  targetId: string;
  postId?: string;
  targetTitle?: string;
  targetContent: string;
  targetAuthorName: string;
  reason: string;
  createdAt: string;
  status: 'pending' | 'resolved' | 'dismissed';
}

export interface ChatRoomInfo {
  id: string;
  name: string;
  desc: string;
  icon: string;
  count?: number;
  category?: string;
  creatorId?: string;
  creatorName?: string;
  symbol?: string;
  createdAt?: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  symbol?: string;
  author: {
    id: string;
    name: string;
    avatar: string;
    role?: string;
  };
  message: string;
  timestamp: string;
  sentiment?: 'bull' | 'bear' | 'neutral';
  likes: number;
}

export interface PriceAlert {
  id: string;
  symbol: string;
  symbolName: string;
  targetPrice: number;
  condition: 'above' | 'below';
  createdAt: string;
  isTriggered: boolean;
  note?: string;
}

export type AlertRuleType =
  | 'price_rise'           // 가격 상승
  | 'price_fall'           // 가격 하락
  | 'volume_spike'         // 거래량 급증
  | 'trading_value_spike'  // 거래대금 급증
  | 'related_news'         // 관련 뉴스
  | 'market_event';        // 시장 이벤트

export interface UserAlertRule {
  id: string;
  uid: string;
  symbol: string;
  symbolName: string;
  type: AlertRuleType;
  value: number; // 직접 입력한 기준값 (예: 5.0, 3.0, 200, 3000)
  condition?: 'above' | 'below' | 'event';
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt?: number;
}

export interface AppNotification {
  id: string;
  uid: string;
  alertId?: string;
  type: AlertRuleType | 'system';
  title: string;
  message: string;
  stockSymbol?: string;
  stockName?: string;
  reason?: string; // 감지 사유
  metrics?: {
    currentValue?: number;
    threshold?: number;
    unit?: string;
    price?: number;
    change?: number;
    changePercent?: number;
    volume?: number;
    tradingValue?: number;
    volumeRatio?: number;
    indexValue?: number;
    market?: string;
    sidecarStatus?: string;
  };
  targetType: 'stock' | 'market' | 'general';
  read: boolean; // 읽음 / 읽지 않음 상태 구분
  createdAt: string;
  timestamp: string;
}

export interface StockSmartAlert {
  id: string;
  symbol: string;
  symbolName: string;
  rise5Percent: boolean;      // ☑ +5% 상승
  fall5Percent: boolean;      // ☑ -5% 하락
  volume200Percent: boolean;  // ☑ 거래량 200%
  newsAlert: boolean;         // ☑ 뉴스 발생
  aiBriefingAlert: boolean;   // ☑ AI 브리핑
  updatedAt: string;
}

export interface AdminReport {
  id: string;
  type: 'post' | 'comment' | 'chat' | 'user';
  targetId: string;
  targetTitle: string;
  targetContent?: string;
  targetAuthorId?: string;
  targetAuthorName?: string;
  reportedBy: string;
  reporterId?: string;
  reason: string;
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
  handlerName?: string;
  handledAt?: string;
  actionTaken?: string;
  createdAt: string;
}

export interface AdminNotice {
  id: string;
  title: string;
  content: string;
  author: string;
  authorId?: string;
  isPinned: boolean;
  category: 'system' | 'event' | 'service' | 'maintenance';
  viewCount: number;
  createdAt: string;
}

export interface BannedWordItem {
  id: string;
  word: string;
  reason: string;
  severity: 'warning' | 'block' | 'mute';
  addedBy: string;
  createdAt: string;
}

export interface SystemMetricInfo {
  status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  cpuUsage: number;
  memoryUsage: number;
  uptimeSeconds: number;
  activeSockets: number;
  activeAlertRules: number;
  unprocessedReports: number;
  dbStatus: 'CONNECTED' | 'DISCONNECTED';
  geminiApiStatus: 'READY' | 'UNCONFIGURED';
  lastCheckedAt: string;
}

export type AdminSubTab = 
  | 'dashboard'
  | 'users'
  | 'posts'
  | 'comments'
  | 'reports'
  | 'chat'
  | 'notices'
  | 'filters'
  | 'alerts'
  | 'market'
  | 'logs'
  | 'settings';

export interface AdminLogItem {
  id: string;
  adminId: string;
  adminName: string;
  adminRole: UserRole;
  action: string;
  targetType: 'user' | 'post' | 'comment' | 'chat' | 'notice' | 'filter' | 'alert' | 'setting' | 'system';
  targetId: string;
  targetTitle?: string;
  details?: string;
  beforeData?: any;
  afterData?: any;
  createdAt: string;
  timestamp: number;
}

export interface AdminSettingItem {
  key: string;
  label: string;
  value: any;
  type: 'boolean' | 'string' | 'number' | 'select';
  options?: { label: string; value: any }[];
  description: string;
  category: 'system' | 'community' | 'chat' | 'ai' | 'market';
  updatedBy: string;
  updatedAt: string;
}

export interface AdminFilterItem {
  id: string;
  word: string;
  category: string;
  enabled: boolean;
  action: 'block' | 'review' | 'replace';
  severity: 'warning' | 'block' | 'mute';
  hitCount?: number;
  createdBy: string;
  createdAt: string;
}

export interface AdminNotificationItem {
  id: string;
  targetType: 'all' | 'user' | 'stock' | 'market' | 'system';
  targetId?: string;
  targetName?: string;
  title: string;
  message: string;
  priority: 'normal' | 'high' | 'urgent';
  createdBy: string;
  createdAt: string;
  sentCount?: number;
  status: 'sent' | 'scheduled';
}

export type MarketFilterType = 'ALL' | 'KOSPI' | 'KOSDAQ' | 'US';
export type RankingSortType = 'change_rise' | 'change_fall' | 'volume' | 'trading_value';

export interface StockRankingItem {
  rank: number;
  symbol: string;
  name: string;
  market: 'KOSPI' | 'KOSDAQ' | 'US';
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  tradingValue: number; // in 억 원
  openPrice?: number;
  highPrice?: number;
  lowPrice?: number;
  prevClose?: number;
}

export interface StockRankingResponse {
  market: MarketFilterType;
  sort: RankingSortType;
  total: number;
  items: StockRankingItem[];
  lastUpdated: string;
  isStale?: boolean;
  dataSource: 'kiwoom' | 'live' | 'cache';
  trId?: string;
  kiwoomNotice?: string;
}

export type ViewTab = 'home' | 'stocks' | 'ranking' | 'insight' | 'watchlist' | 'portfolio' | 'community' | 'chat' | 'alerts' | 'news' | 'profile' | 'admin';

// ==========================================
// Virtual Holdings (가상 보유 내역) Types
// ==========================================
export interface VirtualHolding {
  id: string; // Document ID (e.g. `${uid}_${symbol}`)
  uid: string; // User ID
  symbol: string; // e.g. "005930" or "AAPL"
  name: string; // 종목명
  market: string; // "KOSPI" | "KOSDAQ" | "US" | "GLOBAL"
  currency: 'KRW' | 'USD';
  quantity: number; // 총 보유 수량
  avgBuyPrice: number; // 평균 매입가
  totalBuyAmount: number; // 총 매입금액 (quantity * avgBuyPrice)
  buyDate: string; // 최초 매수일 (YYYY-MM-DD)
  memo?: string; // 투자 메모
  createdAt: string;
  updatedAt: string;
}

export interface VirtualHoldingTrade {
  id: string;
  uid: string;
  holdingId?: string;
  symbol: string;
  name: string;
  tradeType: 'BUY' | 'ADD_BUY' | 'SELL';
  price: number;
  quantity: number;
  totalAmount: number;
  tradeDate: string; // YYYY-MM-DD
  realizedProfit?: number; // 매도 시 실현손익
  realizedProfitRate?: number; // 매도 시 실현수익률 (%)
  fee?: number; // 거래 수수료
  tax?: number; // 증권거래세
  memo?: string; // 매매 사유/메모
  createdAt: string;
}

// ==========================================
// Mock Investment (모의 투자) Types
// ==========================================
export interface MockAccount {
  uid: string;
  initialBalance: number; // 초기 가상 자금 (기본 100,000,000 KRW)
  currentCash: number; // 보유 원화 현금 / 예수금 (KRW)
  initialBalanceUsd?: number; // 초기 가상 외화 자금 (기본 100,000 USD)
  currentCashUsd?: number; // 보유 외화 현금 / 예수금 (USD)
  commissionRate: number; // 매매 수수료율 (기본 0.015% = 0.00015, 설정 가능)
  taxRate: number; // 매도시 증권거래세율 (기본 0.18% = 0.0018, 설정 가능)
  createdAt: string;
  updatedAt: string;
}

export interface MockPosition {
  id: string; // Document ID: `${uid}_${symbol}`
  uid: string;
  symbol: string;
  name: string;
  market: string;
  currency: 'KRW' | 'USD';
  quantity: number;
  avgBuyPrice: number;
  totalInvested: number;
  updatedAt: string;
}

export interface MockOrderFill {
  price: number;
  quantity: number;
  amount: number;
  level: number;
  executedAt: string;
}

export interface MockOrder {
  id: string;
  uid: string;
  symbol: string;
  name: string;
  orderType: 'BUY' | 'SELL';
  orderKind?: 'MARKET' | 'LIMIT';
  status?: 'FILLED' | 'PARTIALLY_FILLED' | 'PENDING' | 'CANCELLED' | 'REJECTED';
  price: number;
  quantity: number;
  requestedQuantity?: number;
  filledQuantity?: number;
  unfilledQuantity?: number;
  totalAmount: number;
  fee: number;
  tax: number;
  settledAmount: number; // BUY: total + fee, SELL: total - fee - tax
  realizedProfit?: number; // SELL: (price - avgBuyPrice) * qty - fee - tax
  realizedProfitRate?: number;
  reason?: string; // 매매 사유
  executedAt: string;
  currency: 'KRW' | 'USD';
  exchangeRate?: number;
  idempotencyKey?: string;
  quoteSource?: string;
  quoteTimestamp?: string;
  isDelayedQuote?: boolean;
  rejectReason?: string;
  fills?: MockOrderFill[];
}

export interface TradingFeeSettings {
  commissionRatePercent: number; // 예: 0.015 (%)
  taxRatePercent: number; // 예: 0.18 (%)
}

// ==========================================
// Historical Simulation (과거 차트 매매 시뮬레이션)
// ==========================================
export interface HistoricalSimulationScenario {
  id: string;
  name: string; // e.g. "시나리오 A: 목표가 +10% / 손절가 -5%"
  targetRate?: number; // e.g. 10 (%)
  targetPrice?: number;
  stopLossRate?: number; // e.g. -5 (%)
  stopLossPrice?: number;
  customExitDate?: string;
  customExitPrice?: number;
  exitDate?: string;
  exitPrice?: number;
  exitReason: string; // "목표가 도달" | "손절가 이탈" | "지정일 매도" | "보유 중(미도달)"
  grossProfit: number;
  fee: number;
  tax: number;
  netProfit: number;
  returnRate: number;
  holdingDays: number;
  isHit: boolean;
}

export interface HistoricalSimulationRecord {
  id: string;
  uid: string;
  symbol: string;
  stockName: string;
  market: string;
  entryDate: string;
  entryPrice: number;
  quantity: number;
  totalInvestment: number;
  selectedExitDate?: string;
  selectedExitPrice?: number;
  netProfit?: number;
  returnRate?: number;
  holdingDays?: number;
  scenarios: HistoricalSimulationScenario[];
  notes?: string;
  createdAt: string;
}

export type GlobalMarketCategory = 'domestic' | 'us' | 'asia' | 'europe' | 'forex' | 'rates';

export interface GlobalMarketItem {
  id: string;
  category: 'us' | 'asia' | 'europe' | 'forex' | 'rates';
  name: string;
  symbol: string;
  value: number;
  displayValue?: string;
  change: number;
  changePercent: number;
  currency: string;
  unit?: string;
  high?: number;
  low?: number;
  open?: number;
  prevClose?: number;
  sparkline?: number[];
  provider: string;
  delayStatus: 'delayed_15m' | 'delayed_20m' | 'official_close' | 'official_notice';
  delayLabel: string;
  isRealtime: boolean;
  marketSession?: 'OPEN' | 'CLOSED' | 'PRE' | 'POST';
  marketTime?: string;
  lastUpdated: string;
  status: 'ok' | 'delayed' | 'error';
  errorMessage?: string;
}

export interface GlobalMarketSummaryResponse {
  groups: {
    us: GlobalMarketItem[];
    asia: GlobalMarketItem[];
    europe: GlobalMarketItem[];
    forex: GlobalMarketItem[];
    rates: GlobalMarketItem[];
  };
  fetchedAt: string;
  cached: boolean;
  providerInfo: {
    primary: string;
    description: string;
    disclaimer: string;
  };
}

// ==========================================
// User Personal AI Connection (개인 AI 계정 연결) Types
// ==========================================
export type AiProviderType = 'gemini';

export interface UserAiConnectionStatus {
  connected: boolean;
  provider: AiProviderType;
  model: string;
  connectedAt?: string;
  keyMasked?: string;
  verified: boolean;
  lastUsedAt?: string;
  callCount?: number;
  rateLimitStatus?: string;
  officialBillingNotice: string;
}

export interface UserAiConnectionUpdateRequest {
  apiKey: string;
  model?: string;
}

// Root Superadmin identification constants (Client-safe)
export const ROOT_SUPERADMIN_UID = 'lr018vf8CcW5fAv707vsl77qJy53';
export const ROOT_SUPERADMIN_EMAIL = 'byunghyunlim92@gmail.com';



