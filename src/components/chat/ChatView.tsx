import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Send, 
  Users, 
  Flame, 
  TrendingUp, 
  TrendingDown, 
  ShieldAlert, 
  Trash2, 
  UserX, 
  VolumeX, 
  Volume2, 
  Check, 
  LogIn, 
  AlertTriangle,
  Lock,
  Sparkles,
  Info,
  Radio,
  Clock,
  Bookmark,
  EyeOff,
  Eye,
  Plus,
  ArrowLeft,
  ChevronRight
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ChatMessage, ChatRoomInfo } from '../../types';
import { firebaseRepository } from '../../services/firebaseRepository';
import { storageService } from '../../services/storageService';
import { filterProfanity, checkSpamViolation } from '../../utils/chatModerator';
import { ReportModal } from '../community/ReportModal';
import { CreateChatRoomModal } from './CreateChatRoomModal';

export const ChatView: React.FC = () => {
  const { 
    user, 
    stocks, 
    watchlist,
    showToast,
    requireAuth,
    isAuthenticated,
    setIsAuthModalOpen
  } = useApp();

  // 6 Official Chat Rooms
  const officialRooms: ChatRoomInfo[] = [
    { id: 'all', name: '전체 채팅', desc: '모든 투자자가 모여 대화하는 자유 광장', icon: '🌐', count: 1840 },
    { id: 'domestic', name: '국내주식', desc: '한국 주식시장 종합 장중 시황 & 토론', icon: '🇰🇷', count: 960 },
    { id: 'kospi', name: '코스피', desc: '코스피 대형주 및 외인·기관 수급 동향', icon: '📈', count: 520 },
    { id: 'kosdaq', name: '코스닥', desc: '바이오·IT·2차전지 테마 성장주 토론', icon: '⚡', count: 480 },
    { id: 'surge', name: '급등주', desc: '당일 거래량 급증 및 상한가 급등 종목 포착', icon: '🔥', count: 830 },
    { id: 'watchlist', name: '관심종목', desc: '나의 관심종목 실시간 시황 및 주주 토론', icon: '⭐', count: 310 },
  ];

  // User-created custom chat rooms (from storage & Firestore)
  const [customRooms, setCustomRooms] = useState<ChatRoomInfo[]>(() => storageService.getCustomChatRooms());
  const [activeRoomId, setActiveRoomId] = useState<string>('all');
  const [messages, setMessages] = useState<ChatMessage[]>(() => storageService.getChatMessages('all'));
  const [inputText, setInputText] = useState('');
  const [sentiment, setSentiment] = useState<'bull' | 'bear' | 'neutral'>('bull');
  
  // Real-time server presence online count
  const [onlineCount, setOnlineCount] = useState(2450);
  const [roomOnlineCounts, setRoomOnlineCounts] = useState<Record<string, number>>({});

  // Mobile View state ('list' for room selector, 'chat' for message feed)
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('chat');

  // Create Chat Room Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Client ID for presence tracking
  const [clientId] = useState(() => {
    try {
      const stored = sessionStorage.getItem('bd_presence_client_id');
      if (stored) return stored;
      const gen = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      sessionStorage.setItem('bd_presence_client_id', gen);
      return gen;
    } catch {
      return `c_${Date.now()}`;
    }
  });

  // Blocked and Muted Users local states
  const [blockedUsers, setBlockedUsers] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('bd_blocked_users') || '[]');
    } catch {
      return [];
    }
  });

  const [mutedUsers, setMutedUsers] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('bd_muted_users') || '[]');
    } catch {
      return [];
    }
  });

  // Restricted users from Firestore
  const [restrictedUsers, setRestrictedUsers] = useState<string[]>([]);

  // Report Modal state
  const [reportTarget, setReportTarget] = useState<{
    targetId: string;
    content: string;
    authorName: string;
  } | null>(null);

  // Hidden messages toggle for blocked users
  const [revealedMessages, setRevealedMessages] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isAdmin = user?.role === 'admin';

  // Merged rooms list
  const allRooms: ChatRoomInfo[] = [...officialRooms, ...customRooms];
  const activeRoom = allRooms.find(r => r.id === activeRoomId) || officialRooms[0];

  const isTestPlaceholder = (msg: ChatMessage) => {
    const content = (msg.message || '').trim();
    return content === 'ㄴㅁㅇㄹ' || content === 'asdf' || msg.id === 'QrPLPsnM48LWrtdnF8gU';
  };

  // Filter out test messages for regular public users, retain for admin to review/delete
  const displayMessages = messages.filter(msg => {
    if (isTestPlaceholder(msg)) {
      return isAdmin;
    }
    return true;
  });

  // 1. Subscribe to Chat Rooms from Firestore
  useEffect(() => {
    const unsub = firebaseRepository.subscribeChatRooms(remoteRooms => {
      if (remoteRooms && remoteRooms.length > 0) {
        setCustomRooms(prev => {
          const map = new Map<string, ChatRoomInfo>();
          prev.forEach(r => map.set(r.id, r));
          remoteRooms.forEach(r => map.set(r.id, r));
          return Array.from(map.values());
        });
      }
    });
    return () => unsub();
  }, []);

  // 2. Real-time User Presence & Concurrent Visitor Count
  useEffect(() => {
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
      } catch (e) {
        // Fallback gracefully
      }
    };

    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 10000);
    return () => clearInterval(interval);
  }, [clientId, user?.id, activeRoomId]);

  // 3. Subscribe to Real-time Chat Restrictions from Firestore
  useEffect(() => {
    const unsub = firebaseRepository.subscribeChatRestrictions(uids => {
      setRestrictedUsers(uids);
    });
    return () => unsub();
  }, []);

  // 4. Subscribe to Real-time Chat Messages for active room (Firestore + Storage + Cross-window Broadcast)
  useEffect(() => {
    // Initial fetch from storage fallback
    const localMsgs = storageService.getChatMessages(activeRoomId);
    if (localMsgs && localMsgs.length > 0) {
      setMessages(localMsgs);
    } else {
      setMessages([]);
    }

    // Subscribe to Firestore onSnapshot
    const unsubscribe = firebaseRepository.subscribeChat(activeRoomId, remoteMessages => {
      if (remoteMessages && remoteMessages.length > 0) {
        setMessages(remoteMessages);
      }
    });

    // Cross-tab real-time communication via BroadcastChannel
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('bd_live_chat_channel');
      bc.onmessage = (event) => {
        if (event.data?.roomId === activeRoomId && event.data?.message) {
          const newMsg: ChatMessage = event.data.message;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      };
    } catch {
      // BroadcastChannel unsupported fallback
    }

    // Storage event listener fallback
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'bd_chat_messages') {
        const fresh = storageService.getChatMessages(activeRoomId);
        setMessages(fresh);
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      unsubscribe();
      bc?.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, [activeRoomId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Save blocked & muted users to localStorage
  useEffect(() => {
    localStorage.setItem('bd_blocked_users', JSON.stringify(blockedUsers));
  }, [blockedUsers]);

  useEffect(() => {
    localStorage.setItem('bd_muted_users', JSON.stringify(mutedUsers));
  }, [mutedUsers]);

  // Enter Room Handler ("채팅방 입장")
  const handleEnterRoom = (room: ChatRoomInfo) => {
    if (room.id === activeRoomId) {
      setMobileView('chat');
      return;
    }
    setActiveRoomId(room.id);
    setMobileView('chat');
    showToast(`'${room.name}' 채널에 입장하였습니다.`, 'info');
  };

  // Create Room Handler ("채팅방 생성")
  const handleOpenCreateModal = () => {
    if (!requireAuth('채팅방 개설')) {
      return;
    }
    setIsCreateModalOpen(true);
  };

  const handleRoomCreated = (newRoom: ChatRoomInfo) => {
    setCustomRooms(prev => [newRoom, ...prev]);
    setActiveRoomId(newRoom.id);
    setMobileView('chat');
  };

  // Send Message with anti-spam and profanity filter
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth('실시간 채팅')) return;
    if (!user) return;

    const rawText = inputText.trim();
    if (!rawText) return;

    // Check if user is restricted
    if (restrictedUsers.includes(user.id)) {
      showToast('관리자에 의해 채팅 이용이 제한된 계정입니다.', 'error');
      return;
    }

    // Anti-Spam (도배 방지) check
    const spamCheck = checkSpamViolation(user.id, rawText);
    if (spamCheck.isSpam) {
      if (spamCheck.reason === 'duplicate') {
        showToast('동일한 메시지를 반복해서 전송할 수 없습니다. (도배 방지)', 'warning');
      } else {
        showToast('메시지를 너무 빠르게 전송하고 있습니다. 잠시 후 다시 시도해 주세요.', 'warning');
      }
      return;
    }

    // Profanity & Prohibited Keywords Filter (금칙어 필터)
    const { cleanText, hasProfanity } = filterProfanity(rawText);
    if (hasProfanity) {
      showToast('부적절한 단어나 시세조종 관련 금칙어가 감지되어 마스킹 처리되었습니다.', 'info');
    }

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const newMsgPayload = {
      roomId: activeRoomId,
      author: {
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        role: user.role === 'admin' ? '총괄운영자' : user.tier,
      },
      message: cleanText,
      timestamp: timeStr,
      sentiment,
    };

    // Optimistic local update & storage save
    const sent = storageService.sendChatMessage(newMsgPayload);
    setMessages(prev => {
      if (prev.some(m => m.id === sent.id)) return prev;
      return [...prev, sent];
    });
    setInputText('');

    // Cross-tab broadcast
    try {
      const bc = new BroadcastChannel('bd_live_chat_channel');
      bc.postMessage({ roomId: activeRoomId, message: sent });
      bc.close();
    } catch {
      // ignore
    }

    // Firebase Firestore send
    try {
      await firebaseRepository.sendChatMessage(newMsgPayload);
    } catch (err) {
      console.warn('Firebase chat send error:', err);
    }
  };

  // Block User
  const handleBlockUser = (targetUserId: string, targetUserName: string) => {
    if (targetUserId === user?.id) return;
    if (blockedUsers.includes(targetUserId)) {
      setBlockedUsers(prev => prev.filter(id => id !== targetUserId));
      showToast(`'${targetUserName}' 님의 차단이 해제되었습니다.`, 'info');
    } else {
      setBlockedUsers(prev => [...prev, targetUserId]);
      showToast(`'${targetUserName}' 님을 차단했습니다. 해당 사용자의 메시지는 숨겨집니다.`, 'warning');
    }
  };

  // Mute User
  const handleMuteUser = (targetUserId: string, targetUserName: string) => {
    if (targetUserId === user?.id) return;
    if (mutedUsers.includes(targetUserId)) {
      setMutedUsers(prev => prev.filter(id => id !== targetUserId));
      showToast(`'${targetUserName}' 님의 음소거가 해제되었습니다.`, 'info');
    } else {
      setMutedUsers(prev => [...prev, targetUserId]);
      showToast(`'${targetUserName}' 님을 뮤트(음소거)했습니다.`, 'info');
    }
  };

  // Admin: Delete Message
  const handleDeleteMessage = async (msgId: string) => {
    if (!isAdmin) return;
    if (window.confirm('관리자 권한으로 이 메시지를 삭제하시겠습니까?')) {
      await firebaseRepository.deleteChatMessage(msgId);
      setMessages(prev => prev.filter(m => m.id !== msgId));
      showToast('메시지가 삭제되었습니다.', 'info');
    }
  };

  // Admin: Restrict (Mute/Ban) User from chat
  const handleRestrictUser = async (targetUserId: string, targetUserName: string) => {
    if (!isAdmin || !user) return;
    const reason = prompt(`'${targetUserName}' 님의 채팅 이용을 제한하시겠습니까? 사유를 입력하세요:`, '커뮤니티 및 채팅 이용 규정 위반');
    if (!reason) return;

    await firebaseRepository.restrictChatUser(targetUserId, reason, user.id);
    showToast(`'${targetUserName}' 님의 채팅 이용을 제한했습니다.`, 'warning');
  };

  return (
    <div className="space-y-4 pb-16 animate-in fade-in duration-150 max-w-7xl mx-auto">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-rose-500" />
            <span>실시간 주주 라이브 톡</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            국내주식, 코스피, 코스닥, 급등주 및 주주 개설 채널에서 실시간 호가와 수급을 토론하세요.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Create Room Button */}
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>채팅방 만들기</span>
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <Users className="w-3.5 h-3.5" />
            <span>접속자 {onlineCount.toLocaleString()}명</span>
          </div>

          {isAdmin && (
            <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30">
              관리자 모드 활성
            </span>
          )}
        </div>
      </div>

      {/* Main Chat Layout (Left: Rooms List, Right: Live Feed) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 h-[650px] sm:h-[700px] max-h-[85vh]">
        {/* Room Sidebar (On mobile: hidden if mobileView === 'chat') */}
        <div className={`lg:col-span-1 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl p-3 flex flex-col gap-2 overflow-y-auto shadow-sm ${
          mobileView === 'chat' ? 'hidden lg:flex' : 'flex'
        }`}>
          {/* Mobile Back to Active Chat Bar */}
          <div className="lg:hidden flex items-center justify-between p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              현재 참여: <strong className="text-slate-900 dark:text-white">{activeRoom.name}</strong>
            </span>
            <button
              onClick={() => setMobileView('chat')}
              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold text-xs"
            >
              대화방으로 복귀
            </button>
          </div>

          <div className="px-2 py-1 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              채팅 채널 ({allRooms.length})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleOpenCreateModal}
                className="text-[11px] font-bold text-rose-500 hover:underline flex items-center gap-0.5 cursor-pointer"
                title="새 채팅방 만들기"
              >
                <Plus className="w-3 h-3" />
                <span>방 개설</span>
              </button>
              <span className="text-[10px] text-emerald-500 font-mono flex items-center gap-1 font-bold ml-1.5">
                <Radio className="w-3 h-3 animate-pulse" />
                LIVE
              </span>
            </div>
          </div>

          {/* Rooms List */}
          <div className="space-y-1.5 flex-1 overflow-y-auto pr-0.5">
            {allRooms.map(room => {
              const isActive = room.id === activeRoomId;
              const liveCount = roomOnlineCounts[room.id] !== undefined
                ? roomOnlineCounts[room.id]
                : (room.count || 1);

              return (
                <button
                  key={room.id}
                  onClick={() => handleEnterRoom(room)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all cursor-pointer group ${
                    isActive
                      ? 'bg-rose-50 dark:bg-rose-500/15 border border-rose-300 dark:border-rose-500/40 shadow-xs'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 border border-transparent'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base shrink-0">{room.icon}</span>
                      <span
                        className={`text-xs font-black truncate ${
                          isActive ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {room.name}
                      </span>
                      {isActive && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-rose-500 text-white shrink-0">
                          참여 중
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5 ml-6">
                      {room.desc}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] font-mono text-slate-400">
                      {liveCount}명
                    </span>
                    <ChevronRight className={`w-3 h-3 text-slate-300 transition-transform ${
                      isActive ? 'text-rose-500 translate-x-0.5' : 'group-hover:translate-x-0.5'
                    }`} />
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Notice Banner inside sidebar */}
          <div className="mt-auto p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-1 shrink-0">
            <div className="flex items-center gap-1 font-bold text-slate-700 dark:text-slate-300">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>클린 채팅 가이드</span>
            </div>
            <p className="leading-relaxed">
              시세조종, 허위사실 유포, 욕설은 자동 필터링 및 관리자 제재 대상이 됩니다.
            </p>
          </div>
        </div>

        {/* Chat Feed & Input (On mobile: hidden if mobileView === 'list') */}
        <div className={`lg:col-span-3 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-sm ${
          mobileView === 'list' ? 'hidden lg:flex' : 'flex'
        }`}>
          {/* Room Header */}
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Mobile Back to Channels List Button */}
              <button
                onClick={() => setMobileView('list')}
                className="lg:hidden p-1.5 -ml-1 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title="채널 목록으로 돌아가기"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>

              <span className="text-xl shrink-0">{activeRoom.icon}</span>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2 truncate">
                  <span className="truncate">{activeRoom.name}</span>
                  <span className="text-[11px] font-normal text-slate-400 hidden sm:inline">({activeRoom.desc})</span>
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-500 font-mono shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="hidden sm:inline">실시간 소켓 연결됨</span>
              <span className="sm:hidden">LIVE</span>
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 font-sans">
            {displayMessages.length > 0 ? (
              displayMessages.map(msg => {
                const isMe = Boolean(user && msg.author?.id === user.id);
                const authorId = msg.author?.id || 'unknown';
                const authorName = msg.author?.name || '익명 투자자';
                const isBlocked = blockedUsers.includes(authorId);
                const isMuted = mutedUsers.includes(authorId);
                const isRestrictedAuthor = restrictedUsers.includes(authorId);
                const isRevealed = revealedMessages[msg.id];
                const isTest = isTestPlaceholder(msg);

                // If user is blocked and not me, silence unless revealed
                if (isBlocked && !isRevealed) {
                  return (
                    <div
                      key={msg.id}
                      className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800/40 text-xs text-slate-400 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-1.5">
                        <UserX className="w-3.5 h-3.5" />
                        <span>차단된 사용자({authorName})의 메시지입니다.</span>
                      </span>
                      <button
                        onClick={() => setRevealedMessages(prev => ({ ...prev, [msg.id]: true }))}
                        className="text-rose-500 font-semibold hover:underline text-[11px] cursor-pointer"
                      >
                        내용 보기
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-2.5 group ${isMe ? 'flex-row-reverse' : ''}`}
                  >
                    {/* Profile Image */}
                    <img
                      src={msg.author?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80'}
                      alt={authorName}
                      className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-slate-200 dark:ring-slate-700"
                    />

                    {/* Message Bubble Container */}
                    <div className={`max-w-[80%] sm:max-w-[75%] space-y-1 ${isMe ? 'text-right' : ''}`}>
                      {/* 닉네임 & 작성시간 & 역할 */}
                      <div className={`flex items-center gap-1.5 text-[11px] ${isMe ? 'justify-end' : ''}`}>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          {authorName}
                        </span>

                        {msg.author?.role && (
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            msg.author.role.includes('운영자') || msg.author.role.includes('관리자')
                              ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}>
                            {msg.author.role}
                          </span>
                        )}

                        {isTest && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/30">
                            초기화 대상 (테스트)
                          </span>
                        )}

                        {isRestrictedAuthor && (
                          <span className="text-[10px] px-1 rounded bg-rose-500/10 text-rose-500 font-bold">
                            채팅제한됨
                          </span>
                        )}

                        {msg.sentiment === 'bull' && (
                          <span className="text-rose-500 font-bold text-[10px]">▲ 매수</span>
                        )}
                        {msg.sentiment === 'bear' && (
                          <span className="text-blue-500 font-bold text-[10px]">▼ 매도</span>
                        )}

                        <span className="text-slate-400 font-mono text-[10px]">
                          {msg.timestamp}
                        </span>
                      </div>

                      {/* Message Body */}
                      <div
                        className={`inline-block px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm text-left leading-relaxed break-words shadow-xs ${
                          isMe
                            ? 'bg-rose-600 text-white rounded-tr-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-tl-xs'
                        }`}
                      >
                        {msg.message}
                      </div>

                      {/* Action Menu (신고, 차단, 뮤트, 관리자 삭제/채팅제한) */}
                      <div className={`flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] ${
                        isMe ? 'justify-end' : 'justify-start'
                      }`}>
                        {!isMe && (
                          <>
                            {/* 신고 버튼 */}
                            <button
                              onClick={() => setReportTarget({
                                targetId: msg.id,
                                content: msg.message,
                                authorName: authorName,
                              })}
                              className="text-slate-400 hover:text-rose-500 p-1 rounded cursor-pointer transition-colors"
                              title="메시지 신고"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                            </button>

                            {/* 차단 버튼 */}
                            <button
                              onClick={() => handleBlockUser(authorId, authorName)}
                              className={`p-1 rounded cursor-pointer transition-colors ${isBlocked ? 'text-rose-500' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                              title={isBlocked ? '차단 해제' : '사용자 차단'}
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>

                            {/* 뮤트 버튼 */}
                            <button
                              onClick={() => handleMuteUser(authorId, authorName)}
                              className={`p-1 rounded cursor-pointer transition-colors ${isMuted ? 'text-amber-500' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                              title={isMuted ? '음소거 해제' : '사용자 뮤트'}
                            >
                              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                            </button>
                          </>
                        )}

                        {/* Admin Action: 메시지 삭제 */}
                        {isAdmin && (
                          <>
                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded cursor-pointer transition-colors"
                              title="관리자 권한: 메시지 삭제"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            </button>

                            {!isMe && (
                              <button
                                onClick={() => handleRestrictUser(authorId, authorName)}
                                className="text-amber-500 hover:text-amber-600 p-1 rounded font-bold text-[10px] cursor-pointer"
                                title="관리자 권한: 사용자 채팅 이용제한"
                              >
                                제한
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-20 text-center text-slate-400 text-xs space-y-1">
                <p>'{activeRoom.name}' 채널에 아직 전송된 메시지가 없습니다.</p>
                <p>첫 번째 메시지를 남겨 실시간 대화를 시작해보세요!</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Send Input Bar */}
          <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
            {!isAuthenticated ? (
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-400" />
                  <span>실시간 채팅에 참여하려면 로그인이 필요합니다.</span>
                </div>
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>로그인 / 회원가입</span>
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendMessage} className="space-y-2">
                <div className="flex items-center justify-between text-xs px-1">
                  {/* Sentiment Selector */}
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-slate-400 mr-1">투자 심리:</span>
                    <button
                      type="button"
                      onClick={() => setSentiment('bull')}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                        sentiment === 'bull'
                          ? 'bg-rose-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      ▲ 매수/상승
                    </button>
                    <button
                      type="button"
                      onClick={() => setSentiment('bear')}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                        sentiment === 'bear'
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      ▼ 매도/하락
                    </button>
                    <button
                      type="button"
                      onClick={() => setSentiment('neutral')}
                      className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                        sentiment === 'neutral'
                          ? 'bg-slate-700 text-white dark:bg-slate-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      중립
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                    금칙어 및 도배 자동 방지 적용 중
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    required
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder={`${activeRoom.name} 채널에 메시지를 입력하세요 (Enter로 전송)`}
                    className="flex-1 px-4 py-2.5 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 font-medium"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>전송</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Report Modal */}
      {reportTarget && (
        <ReportModal
          isOpen={Boolean(reportTarget)}
          onClose={() => setReportTarget(null)}
          targetType="chat"
          targetId={reportTarget.targetId}
          targetTitle={`[라이브톡 메시지] ${reportTarget.authorName}`}
          targetContent={reportTarget.content}
          targetAuthorName={reportTarget.authorName}
        />
      )}

      {/* Create Chat Room Modal */}
      {isCreateModalOpen && (
        <CreateChatRoomModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={handleRoomCreated}
          availableStocks={stocks}
        />
      )}
    </div>
  );
};
