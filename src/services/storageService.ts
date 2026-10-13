import { Stock, CommunityPost, CommentItem, ChatMessage, PriceAlert, UserProfile, AdminReport, MarketEvent, ReportItem, StockSmartAlert, ChatRoomInfo } from '../types';
import { INITIAL_POSTS, INITIAL_CHAT_MESSAGES, INITIAL_USER, INITIAL_ADMIN_REPORTS, INITIAL_MARKET_EVENTS } from './mockData';

const STORAGE_KEYS = {
  WATCHLIST: 'bd_stock_watchlist',
  POSTS: 'bd_community_posts',
  CHAT: 'bd_chat_messages',
  ALERTS: 'bd_price_alerts',
  SMART_ALERTS: 'bd_smart_stock_alerts',
  USER: 'bd_user_profile',
  REPORTS: 'bd_admin_reports',
  EVENTS: 'bd_market_events',
  THEME: 'bd_theme_preference',
};

// Safe LocalStorage helpers
function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Error loading storage key "${key}":`, e);
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Error saving storage key "${key}":`, e);
  }
}

export const storageService = {
  // Watchlist (Per-User isolation & no mock defaults)
  getUserWatchlist(uid?: string): string[] {
    if (!uid) return [];
    return loadFromStorage<string[]>(`${STORAGE_KEYS.WATCHLIST}_${uid}`, []);
  },

  saveUserWatchlist(uid: string, list: string[]): void {
    if (!uid) return;
    saveToStorage(`${STORAGE_KEYS.WATCHLIST}_${uid}`, list);
  },

  getWatchlist(): string[] {
    return loadFromStorage<string[]>(STORAGE_KEYS.WATCHLIST, []);
  },

  saveWatchlist(list: string[]): void {
    saveToStorage(STORAGE_KEYS.WATCHLIST, list);
  },

  clearWatchlist(uid?: string): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.WATCHLIST);
      if (uid) {
        localStorage.removeItem(`${STORAGE_KEYS.WATCHLIST}_${uid}`);
      }
    } catch {}
  },

  // Community Posts
  getPosts(): CommunityPost[] {
    return loadFromStorage<CommunityPost[]>(STORAGE_KEYS.POSTS, []);
  },

  getPostById(id: string): CommunityPost | undefined {
    const posts = this.getPosts();
    return posts.find(p => p.id === id);
  },

  createPost(data: Omit<CommunityPost, 'id' | 'likes' | 'views' | 'commentsCount' | 'createdAt'>): CommunityPost {
    const posts = this.getPosts();
    const newPost: CommunityPost = {
      ...data,
      id: `post-${Date.now()}`,
      likes: 0,
      likedBy: [],
      views: 1,
      commentsCount: 0,
      createdAt: '방금 전',
      comments: [],
    };
    const updated = [newPost, ...posts];
    saveToStorage(STORAGE_KEYS.POSTS, updated);
    return newPost;
  },

  updatePost(id: string, updates: Partial<CommunityPost>): CommunityPost | null {
    const posts = this.getPosts();
    const index = posts.findIndex(p => p.id === id);
    if (index === -1) return null;
    posts[index] = { ...posts[index], ...updates };
    saveToStorage(STORAGE_KEYS.POSTS, posts);
    return posts[index];
  },

  deletePost(id: string): boolean {
    const posts = this.getPosts();
    const filtered = posts.filter(p => p.id !== id);
    saveToStorage(STORAGE_KEYS.POSTS, filtered);
    return filtered.length !== posts.length;
  },

  togglePostLike(postId: string, userId: string): CommunityPost | null {
    const posts = this.getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return null;

    post.likedBy = post.likedBy || [];
    const hasLiked = post.likedBy.includes(userId);
    if (hasLiked) {
      post.likedBy = post.likedBy.filter(uid => uid !== userId);
      post.likes = Math.max(0, post.likes - 1);
    } else {
      post.likedBy.push(userId);
      post.likes += 1;
    }
    saveToStorage(STORAGE_KEYS.POSTS, posts);
    return post;
  },

  addComment(postId: string, user: UserProfile, content: string): CommentItem | null {
    const posts = this.getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post) return null;

    const newComment: CommentItem = {
      id: `c-${Date.now()}`,
      postId,
      author: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        badge: user.role === 'admin' ? '운영자' : user.tier,
      },
      content,
      createdAt: '방금 전',
      likes: 0,
      likedBy: [],
    };

    post.comments = post.comments || [];
    post.comments.push(newComment);
    post.commentsCount = post.comments.length;
    saveToStorage(STORAGE_KEYS.POSTS, posts);
    return newComment;
  },

  incrementViewCount(postId: string): void {
    const posts = this.getPosts();
    const post = posts.find(p => p.id === postId);
    if (post) {
      post.views = (post.views || 0) + 1;
      saveToStorage(STORAGE_KEYS.POSTS, posts);
    }
  },

  updateComment(postId: string, commentId: string, newContent: string): CommentItem | null {
    const posts = this.getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post || !post.comments) return null;

    const comment = post.comments.find(c => c.id === commentId);
    if (!comment) return null;

    comment.content = newContent;
    comment.updatedAt = '방금 전 (수정됨)';
    saveToStorage(STORAGE_KEYS.POSTS, posts);
    return comment;
  },

  deleteComment(postId: string, commentId: string): boolean {
    const posts = this.getPosts();
    const post = posts.find(p => p.id === postId);
    if (!post || !post.comments) return false;

    post.comments = post.comments.filter(c => c.id !== commentId);
    post.commentsCount = post.comments.length;
    saveToStorage(STORAGE_KEYS.POSTS, posts);
    return true;
  },

  reportItem(report: Omit<ReportItem, 'id' | 'createdAt' | 'status'>): ReportItem {
    const reports = loadFromStorage<ReportItem[]>('bd_reports', []);
    const newReport: ReportItem = {
      ...report,
      id: `rep-${Date.now()}`,
      createdAt: new Date().toLocaleDateString('ko-KR') + ' ' + new Date().toLocaleTimeString('ko-KR'),
      status: 'pending',
    };
    reports.unshift(newReport);
    saveToStorage('bd_reports', reports);
    return newReport;
  },

  // Live Chat
  getCustomChatRooms(): ChatRoomInfo[] {
    return loadFromStorage<ChatRoomInfo[]>('bd_chat_rooms', []);
  },

  createCustomChatRoom(room: ChatRoomInfo): ChatRoomInfo {
    const list = this.getCustomChatRooms();
    const updated = [room, ...list];
    saveToStorage('bd_chat_rooms', updated);
    return room;
  },

  getChatMessages(roomId: string = 'all'): ChatMessage[] {
    const allMessages = loadFromStorage<ChatMessage[]>(STORAGE_KEYS.CHAT, []);
    return allMessages.filter(m => m.roomId === roomId);
  },

  sendChatMessage(message: Omit<ChatMessage, 'id' | 'timestamp' | 'likes'>): ChatMessage {
    const allMessages = loadFromStorage<ChatMessage[]>(STORAGE_KEYS.CHAT, []);
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    
    const newMsg: ChatMessage = {
      ...message,
      id: `chat-${Date.now()}`,
      timestamp: timeStr,
      likes: 0,
    };

    const updated = [...allMessages, newMsg];
    // Keep max 200 messages in storage
    if (updated.length > 200) {
      updated.splice(0, updated.length - 200);
    }
    saveToStorage(STORAGE_KEYS.CHAT, updated);
    return newMsg;
  },

  // Price & Market Alerts
  getAlerts(): PriceAlert[] {
    return loadFromStorage<PriceAlert[]>(STORAGE_KEYS.ALERTS, [
      {
        id: 'alert-1',
        symbol: '005930',
        symbolName: '삼성전자',
        targetPrice: 80000,
        condition: 'above',
        createdAt: '2026.09.28',
        isTriggered: false,
        note: '8만전자 돌파 시 비중 20% 추가 매수',
      },
      {
        id: 'alert-2',
        symbol: '000660',
        symbolName: 'SK하이닉스',
        targetPrice: 200000,
        condition: 'above',
        createdAt: '2026.09.29',
        isTriggered: false,
        note: '20만원 돌파시 1차 차익 실현',
      },
      {
        id: 'alert-3',
        symbol: '247540',
        symbolName: '에코프로비엠',
        targetPrice: 150000,
        condition: 'below',
        createdAt: '2026.09.30',
        isTriggered: true,
        note: '15만원 지지선 붕괴시 손절 검토',
      },
    ]);
  },

  addAlert(alert: Omit<PriceAlert, 'id' | 'createdAt' | 'isTriggered'>): PriceAlert {
    const alerts = this.getAlerts();
    const newAlert: PriceAlert = {
      ...alert,
      id: `alert-${Date.now()}`,
      createdAt: new Date().toLocaleDateString('ko-KR'),
      isTriggered: false,
    };
    const updated = [newAlert, ...alerts];
    saveToStorage(STORAGE_KEYS.ALERTS, updated);
    return newAlert;
  },

  deleteAlert(id: string): void {
    const alerts = this.getAlerts();
    saveToStorage(STORAGE_KEYS.ALERTS, alerts.filter(a => a.id !== id));
  },

  // Stock Smart Alerts (삼성전자 및 주요 종목 5대 감지 알림 규칙)
  getSmartAlerts(): StockSmartAlert[] {
    return loadFromStorage<StockSmartAlert[]>(STORAGE_KEYS.SMART_ALERTS, [
      {
        id: 'smart-005930',
        symbol: '005930',
        symbolName: '삼성전자',
        rise5Percent: true,       // ☑ +5% 상승
        fall5Percent: true,       // ☑ -5% 하락
        volume200Percent: true,   // ☑ 거래량 200%
        newsAlert: true,          // ☑ 뉴스 발생
        aiBriefingAlert: true,    // ☑ AI 브리핑
        updatedAt: '실시간 감지 활성화',
      },
      {
        id: 'smart-000660',
        symbol: '000660',
        symbolName: 'SK하이닉스',
        rise5Percent: true,
        fall5Percent: true,
        volume200Percent: true,
        newsAlert: true,
        aiBriefingAlert: true,
        updatedAt: '실시간 감지 활성화',
      },
    ]);
  },

  getSmartAlertForStock(symbol: string, defaultName?: string): StockSmartAlert {
    const alerts = this.getSmartAlerts();
    const existing = alerts.find(a => a.symbol === symbol);
    if (existing) return existing;

    const brandNew: StockSmartAlert = {
      id: `smart-${symbol}`,
      symbol,
      symbolName: defaultName || symbol,
      rise5Percent: true,
      fall5Percent: true,
      volume200Percent: true,
      newsAlert: true,
      aiBriefingAlert: true,
      updatedAt: '실시간 감지 활성화',
    };
    alerts.push(brandNew);
    saveToStorage(STORAGE_KEYS.SMART_ALERTS, alerts);
    return brandNew;
  },

  saveSmartAlert(alert: StockSmartAlert): void {
    const alerts = this.getSmartAlerts();
    const idx = alerts.findIndex(a => a.symbol === alert.symbol);
    const updatedAlert = {
      ...alert,
      updatedAt: new Date().toLocaleDateString('ko-KR') + ' ' + new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    };

    if (idx >= 0) {
      alerts[idx] = updatedAlert;
    } else {
      alerts.unshift(updatedAlert);
    }
    saveToStorage(STORAGE_KEYS.SMART_ALERTS, alerts);
  },

  toggleSmartAlertRule(
    symbol: string,
    rule: 'rise5Percent' | 'fall5Percent' | 'volume200Percent' | 'newsAlert' | 'aiBriefingAlert',
    symbolName?: string
  ): StockSmartAlert {
    const current = this.getSmartAlertForStock(symbol, symbolName);
    current[rule] = !current[rule];
    current.updatedAt = '방금 전 설정 변경';
    this.saveSmartAlert(current);
    return current;
  },

  // Market Events
  getMarketEvents(): MarketEvent[] {
    const events = loadFromStorage<MarketEvent[]>(STORAGE_KEYS.EVENTS, INITIAL_MARKET_EVENTS);
    if (!events || events.length === 0 || !events.some(e => e.sourceUrl?.includes('data.krx.co.kr'))) {
      saveToStorage(STORAGE_KEYS.EVENTS, INITIAL_MARKET_EVENTS);
      return INITIAL_MARKET_EVENTS;
    }
    return events;
  },

  broadcastMarketEvent(event: Omit<MarketEvent, 'id' | 'timestamp' | 'active'>): MarketEvent {
    const events = this.getMarketEvents();
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const newEvt: MarketEvent = {
      ...event,
      id: `evt-${Date.now()}`,
      timestamp: timeStr,
      active: true,
    };
    saveToStorage(STORAGE_KEYS.EVENTS, [newEvt, ...events]);
    return newEvt;
  },

  // Admin Reports
  getReports(): AdminReport[] {
    return loadFromStorage<AdminReport[]>(STORAGE_KEYS.REPORTS, []);
  },

  updateReportStatus(id: string, status: 'resolved' | 'dismissed'): void {
    const reports = this.getReports();
    const item = reports.find(r => r.id === id);
    if (item) {
      item.status = status;
      saveToStorage(STORAGE_KEYS.REPORTS, reports);
    }
  },

  // User Profile
  getUser(): UserProfile {
    return loadFromStorage<UserProfile>(STORAGE_KEYS.USER, INITIAL_USER);
  },

  updateUser(updates: Partial<UserProfile>): UserProfile {
    const user = this.getUser();
    const updated = { ...user, ...updates };
    saveToStorage(STORAGE_KEYS.USER, updated);
    return updated;
  },

  savePosts(posts: CommunityPost[]): void {
    saveToStorage(STORAGE_KEYS.POSTS, posts);
  },

  saveChatMessages(roomId: string, messages: ChatMessage[]): void {
    const allMessages = loadFromStorage<ChatMessage[]>(STORAGE_KEYS.CHAT, INITIAL_CHAT_MESSAGES);
    const otherRoomMsgs = allMessages.filter(m => m.roomId !== roomId);
    saveToStorage(STORAGE_KEYS.CHAT, [...otherRoomMsgs, ...messages]);
  },

  addNotification(notif: any): void {
    const notifs = loadFromStorage<any[]>('bd_user_notifications', []);
    notifs.unshift({
      ...notif,
      id: notif.id || `notif-${Date.now()}`,
      createdAt: new Date().toLocaleTimeString('ko-KR'),
      timestamp: new Date().toLocaleTimeString('ko-KR'),
      read: false,
    });
    saveToStorage('bd_user_notifications', notifs);
  },
};
