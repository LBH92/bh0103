import React, { useState } from 'react';
import { 
  MessagesSquare, 
  Trash2, 
  VolumeX, 
  Volume2, 
  UserX, 
  AlertTriangle, 
  Radio, 
  Sparkles, 
  Clock, 
  User 
} from 'lucide-react';
import { ChatMessage, UserRole } from '../../../types';
import { ConfirmActionModal } from '../modals/ConfirmActionModal';

interface AdminChatTabProps {
  chatMessages: ChatMessage[];
  callerRole: UserRole;
  onDeleteMessage: (messageId: string, roomId: string) => void;
  onMuteUser: (userId: string, durationDesc: string) => void;
}

export const AdminChatTab: React.FC<AdminChatTabProps> = ({
  chatMessages,
  callerRole,
  onDeleteMessage,
  onMuteUser,
}) => {
  const rooms = [
    { id: 'all', name: '전체 광장', icon: '🌐' },
    { id: 'domestic', name: '국내주식', icon: '🇰🇷' },
    { id: 'kospi', name: '코스피', icon: '📈' },
    { id: 'kosdaq', name: '코스닥', icon: '⚡' },
    { id: 'surge', name: '급등주', icon: '🔥' },
    { id: 'watchlist', name: '관심종목', icon: '⭐' },
  ];

  const [activeRoomId, setActiveRoomId] = useState('all');
  const [spamFilterOnly, setSpamFilterOnly] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
  });

  // Filter messages for active room and spam detection
  const roomMessages = chatMessages.filter(m => (m.roomId || 'all') === activeRoomId);

  const isSuspicious = (text: string) => {
    return text.includes('100%') || 
           text.includes('수익 보장') || 
           text.includes('텔레그램') || 
           text.includes('카톡방') || 
           text.includes('원금보장') ||
           text.includes('리딩') ||
           text.includes('ㅋㅋㅋ') && text.length > 50;
  };

  const displayedMessages = spamFilterOnly 
    ? roomMessages.filter(m => isSuspicious(m.message)) 
    : roomMessages;

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <MessagesSquare className="w-6 h-6 text-purple-500" />
            <span>실시간 채팅 감시 및 제재</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            6개 채팅방의 실시간 대화를 감시하고 불법 리딩방 유도, 도배, 비방 메시지를 즉시 차단합니다.
          </p>
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl text-xs font-bold self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>실시간 WebSocket 스트림 연결됨</span>
        </div>
      </div>

      {/* Room Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs font-semibold">
          {rooms.map(room => (
            <button
              key={room.id}
              onClick={() => setActiveRoomId(room.id)}
              className={`px-3 py-1.5 rounded-xl shrink-0 transition-colors flex items-center gap-1.5 ${
                activeRoomId === room.id
                  ? 'bg-purple-600 text-white font-bold shadow-xs'
                  : 'bg-white dark:bg-[#131722] text-slate-500 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
              }`}
            >
              <span>{room.icon}</span>
              <span>{room.name}</span>
            </button>
          ))}
        </div>

        {/* Spam toggle */}
        <button
          onClick={() => setSpamFilterOnly(!spamFilterOnly)}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 border ${
            spamFilterOnly
              ? 'bg-amber-500 text-white border-amber-600'
              : 'bg-white dark:bg-[#131722] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>이상 징후/의심 메시지만 필터링</span>
        </button>
      </div>

      {/* Chat Messages List */}
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>선택된 방: <strong>{rooms.find(r => r.id === activeRoomId)?.name}</strong> (메시지 {displayedMessages.length}개)</span>
          <span className="font-mono text-[11px]">최근 50개 메시지 버퍼</span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[550px] overflow-y-auto">
          {displayedMessages.length > 0 ? (
            displayedMessages.map(msg => {
              const suspicious = isSuspicious(msg.message);
              return (
                <div 
                  key={msg.id}
                  className={`p-4 flex items-start justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                    suspicious ? 'bg-amber-500/5 dark:bg-amber-500/10' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <img 
                      src={msg.author.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=60&auto=format&fit=crop&q=80'} 
                      alt={msg.author.name} 
                      className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-slate-200 dark:ring-slate-700" 
                    />
                    <div className="flex-1 min-w-0 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 dark:text-white">
                          {msg.author.name}
                        </span>
                        {msg.author.role && (
                          <span className="text-[10px] px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 font-mono">
                            {msg.author.role}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono">
                          {msg.timestamp}
                        </span>
                        {suspicious && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-500 text-white flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            <span>도배/스팸 의심</span>
                          </span>
                        )}
                      </div>

                      <p className="mt-1 text-slate-800 dark:text-slate-200 leading-relaxed font-sans break-words text-xs sm:text-sm">
                        {msg.message}
                      </p>
                    </div>
                  </div>

                  {/* Message Admin Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: '사용자 채팅 24시간 제한',
                          description: `'${msg.author.name}' 회원의 채팅 발언 권한을 24시간 동안 정지하시겠습니까?`,
                          onConfirm: () => onMuteUser(msg.author.id, '부적절 채팅으로 인한 24시간 묵음'),
                        });
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
                      title="작성자 채팅 제한"
                    >
                      <VolumeX className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        setConfirmModal({
                          isOpen: true,
                          title: '메시지 즉시 삭제',
                          description: '해당 메시지를 채팅창에서 즉시 삭제하시겠습니까? 일반 사용자 화면에서 보이지 않게 됩니다.',
                          onConfirm: () => onDeleteMessage(msg.id, activeRoomId),
                        });
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                      title="메시지 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 text-center text-xs text-slate-400">
              현재 방에 표시할 채팅 메시지가 없습니다.
            </div>
          )}
        </div>
      </div>

      {/* Confirm Modal */}
      <ConfirmActionModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        description={confirmModal.description}
      />
    </div>
  );
};
