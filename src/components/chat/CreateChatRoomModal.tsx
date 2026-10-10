import React, { useState } from 'react';
import { MessageSquarePlus, X, Sparkles, Hash, TrendingUp, Check } from 'lucide-react';
import { Stock, ChatRoomInfo } from '../../types';
import { useApp } from '../../context/AppContext';
import { firebaseRepository } from '../../services/firebaseRepository';
import { storageService } from '../../services/storageService';

interface CreateChatRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newRoom: ChatRoomInfo) => void;
  availableStocks: Stock[];
}

const CATEGORIES = [
  { id: 'stock', label: '종목 주주방', icon: '📈' },
  { id: 'theme', label: '테마/업종', icon: '⚡' },
  { id: 'surge', label: '급등/수급', icon: '🔥' },
  { id: 'free', label: '자유 토론', icon: '💬' },
];

const ICONS = ['📈', '⚡', '🔥', '🇰🇷', '💎', '🚀', '⭐', '💰', '🤖', '💬', '🏛️', '📊'];

export const CreateChatRoomModal: React.FC<CreateChatRoomModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  availableStocks,
}) => {
  const { user, showToast } = useApp();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [category, setCategory] = useState('stock');
  const [selectedIcon, setSelectedIcon] = useState('📈');
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('채팅방 이름을 입력해주세요.', 'warning');
      return;
    }
    if (!desc.trim()) {
      showToast('채팅방 소개를 입력해주세요.', 'warning');
      return;
    }

    setIsSubmitting(true);
    const matchedStock = availableStocks.find(s => s.symbol === selectedSymbol);
    const finalName = name.trim();
    const finalDesc = desc.trim();

    const roomData: ChatRoomInfo = {
      id: `room-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: finalName,
      desc: finalDesc,
      icon: selectedIcon,
      count: 1,
      category,
      creatorId: user?.id || 'guest',
      creatorName: user?.name || '익명',
      symbol: matchedStock?.symbol,
      createdAt: new Date().toISOString(),
    };

    try {
      // 1. Firebase Firestore
      await firebaseRepository.createChatRoom(roomData);

      // 2. Storage fallback
      storageService.createCustomChatRoom(roomData);

      showToast(`'${finalName}' 채팅방이 개설되었습니다! 바로 입장합니다.`, 'success');
      onCreated(roomData);
      onClose();
    } catch (err) {
      console.warn('Chat room creation failed:', err);
      showToast('채팅방 개설 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-500">
              <MessageSquarePlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                새 채팅방 만들기
              </h3>
              <p className="text-xs text-slate-400">
                관심 종목이나 투자 주제로 실시간 주주 토론방을 개설하세요.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              채팅방 카테고리
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setCategory(cat.id);
                    setSelectedIcon(cat.icon);
                  }}
                  className={`flex items-center gap-1.5 p-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                    category === cat.id
                      ? 'border-rose-500 bg-rose-50/60 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span className="truncate">{cat.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Icon Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              대표 아이콘 선택
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {ICONS.map(ic => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setSelectedIcon(ic)}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg border cursor-pointer transition-all ${
                    selectedIcon === ic
                      ? 'border-rose-500 bg-rose-50 dark:bg-rose-500/20 shadow-xs scale-105'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Stock Association */}
          {category === 'stock' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                연결 종목 선택 (선택 사항)
              </label>
              <select
                value={selectedSymbol}
                onChange={e => {
                  setSelectedSymbol(e.target.value);
                  const s = availableStocks.find(st => st.symbol === e.target.value);
                  if (s && !name) {
                    setName(`${s.name} 주주 토론방`);
                    setDesc(`${s.name}(${s.symbol}) 실시간 호가 및 수급 정보 토론`);
                  }
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
              >
                <option value="">종목 연결 안 함 (일반 방)</option>
                {availableStocks.map(s => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.name} ({s.symbol}) - {s.market}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Room Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              채팅방 이름 *
            </label>
            <input
              type="text"
              required
              maxLength={40}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="예: 삼성전자 주주 소통방, 2차전지 반등 토론"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 font-medium"
            />
          </div>

          {/* Room Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              채팅방 소개 및 대화 규칙 *
            </label>
            <textarea
              required
              rows={2}
              maxLength={120}
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="방 참여자들에게 안내할 소개말과 대화 주제를 입력하세요."
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 font-medium resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-600/20 cursor-pointer transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSubmitting ? '개설 중...' : '채팅방 만들기 및 입장'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
