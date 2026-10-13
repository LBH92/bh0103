import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MessageSquare, 
  Send, 
  ChevronRight, 
  ChevronLeft, 
  X, 
  Users, 
  Shield, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Trash2, 
  RefreshCw, 
  Maximize2,
  Lock,
  VolumeX,
  Flag,
  ArrowDown
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ChatMessage, ChatRoomInfo } from '../../types';
import { firebaseRepository } from '../../services/firebaseRepository';
import { storageService } from '../../services/storageService';
import { filterProfanity, checkSpamViolation } from '../../utils/chatModerator';
import { ReportModal } from '../community/ReportModal';

interface SideChatPanelProps {
  onOpenFullChat?: () => void;
}

export const SideChatPanel: React.FC<SideChatPanelProps> = ({ onOpenFullChat }) => {
  const { 
    user, 
    requireAuth, 
    showToast, 
    isSideChatOpen, 
    setIsSideChatOpen, 
    toggleSideChat,
    unreadChatCount, 
    setUnreadChatCount,
    activeTab,
    setActiveTab
  } = useApp();

  const [activeRoomId, setActiveRoomId] = useState<string>('domestic');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState<string>('');
  const [sentiment, setSentiment] = useState<'neutral' | 'bull' | 'bear'>('neutral');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [onlineCount, setOnlineCount] = useState<number>(0);
  const [roomOnlineCounts, setRoomOnlineCounts] = useState<Record<string, number>>({});
  const [pageLimit, setPageLimit] = useState<number>(40);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [restrictedUsers, setRestrictedUsers] = useState<string[]>([]);
  const [reportTarget, setReportTarget] = useState<{ id: string; content: string; authorName: string } | null>(null);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState<boolean>(false);
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED'>('CONNECTED');
  const [lastReceivedTime, setLastReceivedTime] = useState<string>('');

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef<boolean>(false);
  const lastMessageCountRef = useRef<number>(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'moderator';

  // Preset main chat rooms
  const rooms: ChatRoomInfo[] = [
    { id: 'domestic', name: '국내주식', desc: '코스피/코스닥 실시간 장중 토론', icon: '🇰🇷' },
    { id: 'us', name: '미국주식', desc: '뉴욕/나스닥 실시간 시황', icon: '🇺🇸' },
    { id: 'general', name: '자유토론', desc: '실시간 투자 잡담', icon: '💬' },
  ];

  const currentRoom = rooms.find(r => r.id === activeRoomId) || rooms[0];

  // 1. Presence Heartbeat (Safe & Accurate Active Presence from server)
  useEffect(() => {
    let clientId = '';
    try {
      clientId = sessionStorage.getItem('bd_presence_client_id') || `c-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      sessionStorage.setItem('bd_presence_client_id', clientId);
    } catch {
      clientId = `c-${Date.now()}`;
    }

    const sendHeartbeat = async () => {
      try {
        const res = await fetch('/api/presence/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            uid: user?.id,
            roomId: activeRoomId,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.totalOnline === 'number') {
            setOnlineCount(data.totalOnline);
          }
          if (data.roomCounts) {
            setRoomOnlineCounts(data.roomCounts);
          }
        }
      } catch {
        // Safe silent fail
      }
    };

    sendHeartbeat();
    const timer = setInterval(sendHeartbeat, 10000);
    return () => clearInterval(timer);
  }, [user?.id, activeRoomId]);

  // 2. Subscribe to Chat Restrictions from Firestore
  useEffect(() => {
    const unsub = firebaseRepository.subscribeChatRestrictions(uids => {
      setRestrictedUsers(uids);
    });
    return () => unsub();
  }, []);

  // 3. Realtime Firestore Chat Message Subscription
  useEffect(() => {
    // Initial storage fallback
    const cached = storageService.getChatMessages(activeRoomId);
    if (cached && cached.length > 0) {
      setMessages(cached);
      lastMessageCountRef.current = cached.length;
    }

    const unsubscribe = firebaseRepository.subscribeChat(
      activeRoomId,
      (remoteMessages) => {
        setConnectionStatus('CONNECTED');
        setLastReceivedTime(new Date().toLocaleTimeString('ko-KR'));
        if (remoteMessages) {
          setMessages(remoteMessages);

          // Handle Unread Badge: If panel is collapsed and not on full chat view
          if (!isSideChatOpen && activeTab !== 'chat') {
            if (remoteMessages.length > lastMessageCountRef.current) {
              const diff = remoteMessages.length - lastMessageCountRef.current;
              setUnreadChatCount(prev => prev + diff);
            }
          } else {
            // Panel is open and active
            setUnreadChatCount(0);
          }

          lastMessageCountRef.current = remoteMessages.length;

          // Only auto-scroll to bottom if user is not reviewing older messages
          if (!isUserScrolledUpRef.current) {
            setTimeout(() => {
              if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
              }
            }, 60);
          }
        }
      },
      pageLimit,
      (err) => {
        console.warn('[SideChat] Firestore subscription warning:', err);
        setConnectionStatus('RECONNECTING');
      }
    );

    return () => {
      unsubscribe();
    };
  }, [activeRoomId, pageLimit, isSideChatOpen, activeTab, setUnreadChatCount]);

  // Clear unread count when opening side chat
  useEffect(() => {
    if (isSideChatOpen) {
      setUnreadChatCount(0);
    }
  }, [isSideChatOpen, setUnreadChatCount]);

  // Handle Scroll to detect if user is reading previous messages
  const handleScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 70;
    isUserScrolledUpRef.current = !isNearBottom;
    setShowScrollBottomBtn(!isNearBottom);

    // If scrolled to top, offer loading older messages
    if (el.scrollTop === 0 && messages.length >= pageLimit && !isLoadingMore) {
      setIsLoadingMore(true);
      setPageLimit(prev => prev + 30);
      setTimeout(() => setIsLoadingMore(false), 500);
    }
  };

  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
      isUserScrolledUpRef.current = false;
      setShowScrollBottomBtn(false);
    }
  };

  // Send Message
  const handleSendMessage = async () => {
    const rawText = inputText.trim();
    if (!rawText) return;

    if (!user) {
      requireAuth('채팅 참여');
      return;
    }

    if (rawText.length > 500) {
      showToast('메시지는 최대 500자까지 작성할 수 있습니다.', 'warning');
      return;
    }

    // Check Chat Restriction
    if (user.chatRestricted || restrictedUsers.includes(user.id)) {
      showToast('현재 계정은 채팅 이용이 제한되어 발언할 수 없습니다.', 'error');
      return;
    }

    // Rate Limiting & Anti-Spam Check
    const spamCheck = checkSpamViolation(user.id, rawText);
    if (spamCheck.isSpam) {
      if (spamCheck.reason === 'duplicate') {
        showToast('동일한 메시지를 반복 전송할 수 없습니다. (도배 방지)', 'warning');
      } else {
        showToast('메시지를 너무 빠르게 전송하고 있습니다. 잠시 후 다시 시도해 주세요.', 'warning');
      }
      return;
    }

    // Profanity Filter
    const { cleanText, hasProfanity } = filterProfanity(rawText);
    if (hasProfanity) {
      showToast('금칙어 또는 시세조종 관련 단어가 감지되어 필터링되었습니다.', 'info');
    }

    setIsSending(true);
    setSendError(null);

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const newMsgPayload = {
      roomId: activeRoomId,
      author: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        role: user.role === 'admin' || user.role === 'superadmin' ? '총괄운영자' : user.tier,
      },
      message: cleanText,
      timestamp: timeStr,
      sentiment,
    };

    try {
      // 1. Optimistic update
      const sent = storageService.sendChatMessage(newMsgPayload);
      setMessages(prev => {
        if (prev.some(m => m.id === sent.id)) return prev;
        return [...prev, sent];
      });

      setInputText('');
      isUserScrolledUpRef.current = false;
      scrollToBottom();

      // 2. Real Firestore Persistence with serverTimestamp
      await firebaseRepository.sendChatMessage(newMsgPayload);
    } catch (err: any) {
      console.error('Failed to send chat message:', err);
      setSendError('메시지 전송에 실패했습니다. 다시 시도해 주세요.');
      showToast('채팅 메시지 전송 실패. 네트워크 연결을 확인하세요.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Admin delete message
  const handleDeleteMessage = async (msgId: string) => {
    if (!isAdmin) return;
    try {
      await firebaseRepository.deleteChatMessage(msgId);
      setMessages(prev => prev.filter(m => m.id !== msgId));
      showToast('관리자 권한으로 메시지를 삭제했습니다.', 'info');
    } catch (err: any) {
      showToast(`삭제 실패: ${err.message}`, 'error');
    }
  };

  // Admin restrict user
  const handleRestrictUser = async (targetUserId: string, targetUserName: string) => {
    if (!isAdmin) return;
    try {
      await firebaseRepository.restrictChatUser(targetUserId, '운영자 실시간 조치', user!.id);
      showToast(`'${targetUserName}' 사용자의 채팅 발언을 제한했습니다.`, 'warning');
    } catch (err: any) {
      showToast(`채팅 제한 실패: ${err.message}`, 'error');
    }
  };

  const getRoleBadge = (role?: string) => {
    if (role === '총괄운영자' || role === 'admin' || role === 'superadmin') {
      return (
        <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20">
          운영자
        </span>
      );
    }
    return null;
  };

  return (
    <>
      {/* ------------------------------------------------------------- */}
      {/* 1. Desktop Side Panel (Right Fixed) */}
      {/* ------------------------------------------------------------- */}
      <aside 
        aria-label="실시간 채팅 사이드바"
        className={`hidden lg:flex flex-col fixed top-16 right-0 bottom-0 z-30 bg-white dark:bg-[#131722] border-l border-slate-200 dark:border-slate-800 transition-all duration-200 ease-in-out shadow-lg ${
          isSideChatOpen ? 'w-[340px] xl:w-[360px]' : 'w-12'
        }`}
      >
        {/* COLLAPSED STATE BAR */}
        {!isSideChatOpen && (
          <div className="flex-1 flex flex-col items-center justify-between py-4 select-none">
            <button
              onClick={toggleSideChat}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer relative"
              title="실시간 채팅 펼치기"
            >
              <ChevronLeft className="w-5 h-5 text-rose-500" />
              {unreadChatCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-rose-500 text-white font-bold text-[10px] flex items-center justify-center animate-pulse">
                  {unreadChatCount > 99 ? '99+' : unreadChatCount}
                </span>
              )}
            </button>

            {/* Vertical Label */}
            <div 
              onClick={toggleSideChat}
              className="cursor-pointer py-6 flex flex-col items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-rose-500 transition-colors"
            >
              <MessageSquare className="w-4 h-4 text-rose-500" />
              <span className="[writing-mode:vertical-lr] tracking-widest text-[11px] font-black">
                실시간 채팅
              </span>
              <span className="text-[10px] font-mono text-emerald-500">
                {onlineCount}명
              </span>
            </div>

            <button
              onClick={toggleSideChat}
              className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="실시간 채팅 펼치기"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* EXPANDED FULL PANEL CONTENT */}
        {isSideChatOpen && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/60 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">
                      실시간 채팅
                    </span>
                    <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {onlineCount > 0 ? `${onlineCount}명 접속` : '연결 중'}
                    </span>
                    {connectionStatus === 'RECONNECTING' ? (
                      <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">
                        재연결 중...
                      </span>
                    ) : lastReceivedTime ? (
                      <span className="text-[9px] font-mono text-slate-400 hidden xl:inline" title="마지막 정상 수신 시각">
                        {lastReceivedTime}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[170px]">
                    {currentRoom.name} · {currentRoom.desc}
                  </div>
                </div>
              </div>

              {/* Actions: Maximize / Collapse */}
              <div className="flex items-center gap-1">
                {onOpenFullChat ? (
                  <button
                    onClick={onOpenFullChat}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="전체 화면 채팅으로 이동"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={() => setActiveTab('chat')}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    title="채팅 전용 화면"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={toggleSideChat}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="패널 접기"
                >
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Room Tabs Selector */}
            <div className="flex items-center px-3 py-1.5 bg-white dark:bg-[#131722] border-b border-slate-100 dark:border-slate-800/80 gap-1 overflow-x-auto scrollbar-none text-[11px] font-bold shrink-0">
              {rooms.map(room => {
                const isActive = room.id === activeRoomId;
                const rCount = roomOnlineCounts[room.id] || 0;
                return (
                  <button
                    key={room.id}
                    onClick={() => setActiveRoomId(room.id)}
                    className={`px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 shrink-0 cursor-pointer ${
                      isActive
                        ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30'
                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <span>{room.icon}</span>
                    <span>{room.name}</span>
                    {rCount > 0 && (
                      <span className="text-[9px] font-mono opacity-70">
                        {rCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Message Feed Area */}
            <div 
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-3 space-y-3 text-xs divide-y divide-slate-100/60 dark:divide-slate-800/40 relative"
            >
              {/* Load older messages button if scrolled up */}
              {isLoadingMore && (
                <div className="text-center py-1 text-[11px] text-slate-400 flex items-center justify-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>이전 대화 불러오는 중...</span>
                </div>
              )}

              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-2">
                  <MessageSquare className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                  <p className="font-semibold text-xs text-slate-500 dark:text-slate-400">
                    아직 등록된 메시지가 없습니다.
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    첫 번째 메시지를 남겨 다른 주주들과 실시간 토론을 시작해 보세요!
                  </p>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isMine = user && msg.author?.id === user.id;
                  const isRestricted = restrictedUsers.includes(msg.author?.id);

                  return (
                    <div 
                      key={msg.id || idx}
                      className="pt-2.5 first:pt-0 group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 -mx-2 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        {/* Author info */}
                        <div className="flex items-center gap-1.5 min-w-0">
                          <img 
                            src={msg.author?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'} 
                            alt={msg.author?.name || 'User'} 
                            className="w-5 h-5 rounded-full object-cover shrink-0" 
                          />
                          <span className={`font-bold truncate text-[11px] ${
                            isMine ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-200'
                          }`}>
                            {msg.author?.name || '익명 투자자'}
                          </span>
                          {getRoleBadge(msg.author?.role)}
                          {msg.sentiment === 'bull' && (
                            <span className="flex items-center text-[9px] text-rose-500 font-bold px-1 rounded bg-rose-500/10">
                              <TrendingUp className="w-2.5 h-2.5 mr-0.5" /> 상승
                            </span>
                          )}
                          {msg.sentiment === 'bear' && (
                            <span className="flex items-center text-[9px] text-blue-500 font-bold px-1 rounded bg-blue-500/10">
                              <TrendingDown className="w-2.5 h-2.5 mr-0.5" /> 하락
                            </span>
                          )}
                        </div>

                        {/* Timestamp & Hover Action Menu */}
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[9px] font-mono text-slate-400">
                            {msg.timestamp}
                          </span>

                          {/* Action Menu (Delete for Admin / Report for User) */}
                          <div className="hidden group-hover:flex items-center gap-0.5">
                            {isAdmin && (
                              <>
                                <button
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                                  title="메시지 삭제"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                                <button
                                  onClick={() => handleRestrictUser(msg.author.id, msg.author.name)}
                                  className="p-1 rounded text-slate-400 hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                                  title="작성자 채팅 제한"
                                >
                                  <VolumeX className="w-3 h-3" />
                                </button>
                              </>
                            )}
                            {!isMine && (
                              <button
                                onClick={() => setReportTarget({ id: msg.id, content: msg.message, authorName: msg.author.name })}
                                className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="신고"
                              >
                                <Flag className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Message Content */}
                      <div className="mt-1 pl-6">
                        {isRestricted ? (
                          <div className="text-[11px] text-slate-400 italic bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-lg">
                            운영 정책에 따라 차단된 회원의 메시지입니다.
                          </div>
                        ) : (
                          <p className="text-[12px] text-slate-800 dark:text-slate-200 leading-relaxed break-words whitespace-pre-wrap">
                            {msg.message}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Quick Scroll to Bottom Floating Button */}
            {showScrollBottomBtn && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-36 right-4 z-20 p-2 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-md hover:scale-105 transition-all text-xs flex items-center gap-1 cursor-pointer"
                title="최신 메시지로 이동"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold">최신</span>
              </button>
            )}

            {/* Input Bar Area */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 shrink-0">
              {/* Sentiment Selector Bar */}
              <div className="flex items-center justify-between mb-1.5 text-[10px]">
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-semibold">의견:</span>
                  <button
                    type="button"
                    onClick={() => setSentiment(s => s === 'bull' ? 'neutral' : 'bull')}
                    className={`px-1.5 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                      sentiment === 'bull'
                        ? 'bg-rose-500 text-white shadow-xs'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    📈 상승
                  </button>
                  <button
                    type="button"
                    onClick={() => setSentiment(s => s === 'bear' ? 'neutral' : 'bear')}
                    className={`px-1.5 py-0.5 rounded font-bold transition-colors cursor-pointer ${
                      sentiment === 'bear'
                        ? 'bg-blue-500 text-white shadow-xs'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    📉 하락
                  </button>
                </div>

                <span className="text-slate-400 font-mono">
                  {inputText.length}/500
                </span>
              </div>

              {/* Text Input & Send */}
              {user ? (
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    rows={2}
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={isSending}
                    placeholder="실시간 증시 의견을 나눠보세요 (Enter: 전송, Shift+Enter: 줄바꿈)"
                    className="w-full pl-3 pr-10 py-2 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!inputText.trim() || isSending}
                    className="absolute right-2 bottom-2.5 p-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                    title="전송"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div 
                  onClick={() => requireAuth('채팅 메시지 작성')}
                  className="p-3 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl text-center cursor-pointer hover:border-rose-500 transition-colors"
                >
                  <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400">
                    <Lock className="w-3.5 h-3.5" />
                    <span>로그인 후 실시간 채팅에 참여하세요</span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    비로그인 상태에서는 실시간 채팅 읽기만 가능합니다
                  </p>
                </div>
              )}

              {/* Send Error Notice with Retry */}
              {sendError && (
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-rose-500 font-bold bg-rose-500/10 px-2 py-1 rounded-lg">
                  <span>{sendError}</span>
                  <button
                    onClick={handleSendMessage}
                    className="underline hover:text-rose-600 ml-1 cursor-pointer"
                  >
                    재시도
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* ------------------------------------------------------------- */}
      {/* 2. Mobile Floating Button & Bottom Sheet / Modal */}
      {/* ------------------------------------------------------------- */}
      <div className="lg:hidden">
        {/* Floating Chat Trigger Button (non-obstructive bottom right above mobile nav) */}
        {!isMobileOpen && (
          <button
            onClick={() => setIsMobileOpen(true)}
            className="fixed right-4 bottom-20 z-40 p-3 rounded-full bg-rose-600 text-white shadow-xl hover:bg-rose-500 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
            aria-label="실시간 채팅 열기"
          >
            <MessageSquare className="w-5 h-5" />
            {unreadChatCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-slate-900 text-white font-bold text-[10px] flex items-center justify-center border-2 border-white dark:border-slate-900">
                {unreadChatCount > 99 ? '99+' : unreadChatCount}
              </span>
            )}
          </button>
        )}

        {/* Mobile Chat Drawer Modal */}
        {isMobileOpen && (
          <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-[#0c0f17] animate-in slide-in-from-bottom duration-200">
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-rose-500" />
                <div>
                  <h3 className="font-black text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    <span>실시간 채팅</span>
                    <span className="text-[10px] font-mono font-bold text-emerald-500 px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20">
                      {onlineCount}명 접속
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    {currentRoom.name} 토론
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setIsMobileOpen(false);
                    setActiveTab('chat');
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  전체화면
                </button>
                <button
                  onClick={() => setIsMobileOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Room Selector */}
            <div className="flex items-center px-4 py-2 bg-slate-100 dark:bg-[#131722] gap-1.5 overflow-x-auto text-xs font-bold">
              {rooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => setActiveRoomId(room.id)}
                  className={`px-3 py-1.5 rounded-xl shrink-0 transition-colors ${
                    room.id === activeRoomId
                      ? 'bg-rose-600 text-white font-bold'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {room.icon} {room.name}
                </button>
              ))}
            </div>

            {/* Messages Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg, idx) => (
                <div key={msg.id || idx} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {msg.author?.name || '익명'}
                      </span>
                      {getRoleBadge(msg.author?.role)}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {msg.timestamp}
                    </span>
                  </div>
                  <div className="text-xs text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl break-words">
                    {msg.message}
                  </div>
                </div>
              ))}
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              {user ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSendMessage();
                    }}
                    placeholder="실시간 메시지 입력..."
                    className="flex-1 px-3 py-2 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!inputText.trim() || isSending}
                    className="px-3 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold disabled:opacity-40"
                  >
                    전송
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsMobileOpen(false);
                    requireAuth('채팅 참여');
                  }}
                  className="w-full py-2.5 bg-rose-600 text-white rounded-xl text-xs font-bold text-center"
                >
                  로그인하고 채팅 참여하기
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Report Modal */}
      {reportTarget && (
        <ReportModal
          isOpen={true}
          targetId={reportTarget.id}
          targetType="chat"
          targetTitle="실시간 채팅 메시지"
          targetContent={reportTarget.content}
          targetAuthorName={reportTarget.authorName}
          onClose={() => setReportTarget(null)}
        />
      )}
    </>
  );
};
