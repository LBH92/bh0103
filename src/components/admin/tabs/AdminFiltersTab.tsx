import React, { useState } from 'react';
import { 
  Sparkles, 
  Plus, 
  Trash2, 
  Check, 
  X, 
  AlertTriangle, 
  Search, 
  ShieldAlert, 
  Sliders 
} from 'lucide-react';
import { AdminFilterItem, UserRole } from '../../../types';
import { ConfirmActionModal } from '../modals/ConfirmActionModal';

interface AdminFiltersTabProps {
  bannedWords: AdminFilterItem[];
  callerRole: UserRole;
  onAddWord: (word: string, severity: 'warning' | 'block' | 'mute', category: string, action: 'block' | 'review' | 'replace') => void;
  onDeleteWord: (id: string) => void;
  onToggleWord: (id: string, enabled: boolean) => void;
}

export const AdminFiltersTab: React.FC<AdminFiltersTabProps> = ({
  bannedWords,
  callerRole,
  onAddWord,
  onDeleteWord,
  onToggleWord,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [newWord, setNewWord] = useState('');
  const [newSeverity, setNewSeverity] = useState<'warning' | 'block' | 'mute'>('block');
  const [newCategory, setNewCategory] = useState('불법 유사투자');
  const [newAction, setNewAction] = useState<'block' | 'review' | 'replace'>('block');
  const [isAdding, setIsAdding] = useState(false);

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

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWord.trim()) return;
    onAddWord(newWord.trim(), newSeverity, newCategory, newAction);
    setNewWord('');
    setIsAdding(false);
  };

  const filteredWords = bannedWords.filter(w => {
    const q = searchTerm.trim().toLowerCase();
    return !q || w.word.toLowerCase().includes(q) || w.category?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-500" />
            <span>금칙어 및 콘텐츠 필터링 사전</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            사설 리딩방, 시세조종 유도, 욕설 단어를 관리하고 작성 차단 또는 관리자 검토 대상으로 분류합니다.
          </p>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>새 금칙어 추가</span>
        </button>
      </div>

      {/* Add New Word Form */}
      {isAdding && (
        <form onSubmit={handleCreate} className="p-5 bg-white dark:bg-[#131722] border border-amber-200 dark:border-amber-900/60 rounded-2xl shadow-sm space-y-4 text-xs animate-in slide-in-from-top-2">
          <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            <span>새 필터링 금칙어 등록</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                금칙어 단어/문구
              </label>
              <input
                type="text"
                required
                value={newWord}
                onChange={e => setNewWord(e.target.value)}
                placeholder="예: 100% 수익 보장"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                카테고리
              </label>
              <input
                type="text"
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                placeholder="예: 불법 리딩방"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                감지 시 조치 정책
              </label>
              <select
                value={newAction}
                onChange={e => setNewAction(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
              >
                <option value="block">작성 즉시 차단 (Block)</option>
                <option value="review">관리자 검토 대상 (Review)</option>
                <option value="replace">별표 자동 마스킹 (Replace)</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                제재 강도
              </label>
              <select
                value={newSeverity}
                onChange={e => setNewSeverity(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
              >
                <option value="block">차단 (Block)</option>
                <option value="mute">채팅 묵음 (Mute)</option>
                <option value="warning">단순 경고 (Warning)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl font-semibold"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold"
            >
              등록
            </button>
          </div>
        </form>
      )}

      {/* Search */}
      <div className="relative w-full max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="금칙어, 분류 검색..."
          className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
        />
      </div>

      {/* Words Table */}
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold bg-slate-50/50 dark:bg-slate-800/30">
              <th className="py-3 px-4">금칙어 문구</th>
              <th className="py-3 px-4">분류 / 등록자</th>
              <th className="py-3 px-4 text-center">조치 정책</th>
              <th className="py-3 px-4 text-center">제재 강도</th>
              <th className="py-3 px-4 text-center">누적 적발 수</th>
              <th className="py-3 px-4 text-center">활성 상태</th>
              <th className="py-3 px-4 text-right">삭제</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredWords.map(w => (
              <tr key={w.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                  "{w.word}"
                </td>
                <td className="py-3.5 px-4 text-slate-500">
                  <div>{w.category}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{w.createdBy} · {w.createdAt}</div>
                </td>
                <td className="py-3.5 px-4 text-center">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    w.action === 'block' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                    w.action === 'review' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                    'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>
                    {w.action === 'block' ? '즉시 차단' : (w.action === 'review' ? '검토 대상' : '마스킹')}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-center uppercase font-mono text-[10px] font-bold text-slate-500">
                  {w.severity}
                </td>
                <td className="py-3.5 px-4 text-center font-mono text-slate-700 dark:text-slate-300 font-bold">
                  {w.hitCount || 0}회
                </td>
                <td className="py-3.5 px-4 text-center">
                  <button
                    onClick={() => onToggleWord(w.id, !w.enabled)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                      w.enabled
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                    }`}
                  >
                    {w.enabled ? 'ON (적용)' : 'OFF (해제)'}
                  </button>
                </td>
                <td className="py-3.5 px-4 text-right">
                  <button
                    onClick={() => {
                      setConfirmModal({
                        isOpen: true,
                        title: '금칙어 삭제',
                        description: `'${w.word}' 금칙어를 삭제하시겠습니까?`,
                        onConfirm: () => onDeleteWord(w.id),
                      });
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                    title="삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
