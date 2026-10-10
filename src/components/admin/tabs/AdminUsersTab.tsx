import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  Shield, 
  UserX, 
  UserCheck, 
  VolumeX, 
  Volume2, 
  Eye, 
  AlertTriangle, 
  Check, 
  ChevronRight,
  ShieldAlert,
  Send,
  UserPlus
} from 'lucide-react';
import { UserProfile, UserRole } from '../../../types';
import { UserDetailModal } from '../modals/UserDetailModal';
import { ConfirmActionModal } from '../modals/ConfirmActionModal';

interface AdminUsersTabProps {
  users: UserProfile[];
  callerRole: UserRole;
  onSuspend: (userId: string, reason: string) => void;
  onUnsuspend: (userId: string) => void;
  onMute: (userId: string, durationDesc: string) => void;
  onUnmute: (userId: string) => void;
  onWarn: (userId: string, message: string) => void;
  onChangeRole: (userId: string, newRole: UserRole) => void;
}

export const AdminUsersTab: React.FC<AdminUsersTabProps> = ({
  users,
  callerRole,
  onSuspend,
  onUnsuspend,
  onMute,
  onUnmute,
  onWarn,
  onChangeRole,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'active' | 'suspended' | 'muted' | 'admin' | 'moderator'>('ALL');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    isDestructive: boolean;
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
    isDestructive: true,
  });

  // Filtered users
  const filteredUsers = users.filter(u => {
    const q = searchTerm.trim().toLowerCase();
    const matchesSearch = 
      !q || 
      u.name.toLowerCase().includes(q) || 
      u.email.toLowerCase().includes(q) || 
      u.id.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (filterType === 'active') return u.status !== 'suspended' && u.status !== 'deleted';
    if (filterType === 'suspended') return u.status === 'suspended';
    if (filterType === 'muted') return Boolean(u.chatRestricted);
    if (filterType === 'admin') return u.role === 'admin' || u.role === 'superadmin';
    if (filterType === 'moderator') return u.role === 'moderator';

    return true;
  });

  const isSuperAdmin = callerRole === 'superadmin';

  return (
    <div className="space-y-5 animate-in fade-in duration-150">
      {/* Top Header & Search/Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            회원 및 권한 관리
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            등록된 전체 사용자를 검색하고 상태 변경, 채팅 제한, 권한(Role) 조정을 수행합니다.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="닉네임, 이메일, UID 검색..."
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs font-semibold">
        {[
          { id: 'ALL', label: `전체 (${users.length})` },
          { id: 'active', label: `정상 (${users.filter(u => u.status !== 'suspended').length})` },
          { id: 'suspended', label: `이용 정지 (${users.filter(u => u.status === 'suspended').length})` },
          { id: 'muted', label: `채팅 제한 (${users.filter(u => u.chatRestricted).length})` },
          { id: 'admin', label: `관리자 (${users.filter(u => u.role === 'admin' || u.role === 'superadmin').length})` },
          { id: 'moderator', label: `운영진 (${users.filter(u => u.role === 'moderator').length})` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilterType(tab.id as any)}
            className={`px-3 py-1.5 rounded-xl shrink-0 transition-colors ${
              filterType === tab.id
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold shadow-xs'
                : 'bg-white dark:bg-[#131722] text-slate-500 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Users Desktop Table */}
      <div className="hidden md:block bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold bg-slate-50/50 dark:bg-slate-800/30">
              <th className="py-3 px-4">회원 정보</th>
              <th className="py-3 px-4">이메일 / UID</th>
              <th className="py-3 px-4">가입일 / 최근접속</th>
              <th className="py-3 px-4 text-center">권한 (Role)</th>
              <th className="py-3 px-4 text-center">상태</th>
              <th className="py-3 px-4 text-center">활동 수</th>
              <th className="py-3 px-4 text-right">관리 조치</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {filteredUsers.map(u => (
              <tr 
                key={u.id}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                onClick={() => setSelectedUser(u)}
              >
                {/* Profile */}
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2.5">
                    <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <span>{u.name}</span>
                        {u.email === 'byunghyunlim92@gmail.com' && (
                          <span className="text-[10px] text-amber-500 font-bold">★소유자</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400">{u.tier}</div>
                    </div>
                  </div>
                </td>

                {/* Email & UID */}
                <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-300">
                  <div>{u.email}</div>
                  <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{u.id}</div>
                </td>

                {/* Dates */}
                <td className="py-3.5 px-4 text-slate-500">
                  <div>{u.joinedDate}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{u.lastLoginAt || '-'}</div>
                </td>

                {/* Role */}
                <td className="py-3.5 px-4 text-center">
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                    u.role === 'superadmin' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                    u.role === 'admin' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                    u.role === 'moderator' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' :
                    'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>
                    {u.role.toUpperCase()}
                  </span>
                </td>

                {/* Status */}
                <td className="py-3.5 px-4 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      u.status === 'suspended' 
                        ? 'bg-rose-500 text-white' 
                        : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                    }`}>
                      {u.status === 'suspended' ? '이용정지' : '정상'}
                    </span>
                    {u.chatRestricted && (
                      <span className="text-[9px] text-amber-500 font-bold">
                        채팅제한
                      </span>
                    )}
                  </div>
                </td>

                {/* Counts */}
                <td className="py-3.5 px-4 text-center font-mono text-slate-500">
                  <span>글 {u.postCount || 0} / 댓 {u.commentCount || 0}</span>
                  {Boolean(u.reportedCount) && (
                    <div className="text-[10px] text-rose-500 font-bold">신고 {u.reportedCount}회</div>
                  )}
                </td>

                {/* Actions */}
                <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      onClick={() => setSelectedUser(u)}
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
                      title="상세보기"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {u.status === 'suspended' ? (
                      <button
                        onClick={() => {
                          setConfirmModal({
                            isOpen: true,
                            title: '회원 정지 해제',
                            description: `'${u.name}' 회원의 이용 정지를 해제하고 정상 상태로 복원하시겠습니까?`,
                            isDestructive: false,
                            onConfirm: () => onUnsuspend(u.id),
                          });
                        }}
                        className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                        title="정지 해제"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        disabled={u.role === 'superadmin'}
                        onClick={() => {
                          setConfirmModal({
                            isOpen: true,
                            title: '회원 이용 정지',
                            description: `정말로 '${u.name}' 회원을 정지하시겠습니까? 로그인 및 커뮤니티 작성이 차단됩니다.`,
                            isDestructive: true,
                            onConfirm: () => onSuspend(u.id, '관리자 일괄 조치'),
                          });
                        }}
                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 transition-colors disabled:opacity-20"
                        title="회원 정지"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List View */}
      <div className="md:hidden space-y-3">
        {filteredUsers.map(u => (
          <div
            key={u.id}
            onClick={() => setSelectedUser(u)}
            className="p-4 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-3 cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <img src={u.avatar} alt={u.name} className="w-9 h-9 rounded-full object-cover" />
                <div>
                  <div className="font-bold text-sm text-slate-900 dark:text-white">
                    {u.name}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono truncate max-w-[180px]">
                    {u.email}
                  </div>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                u.status === 'suspended' ? 'bg-rose-500 text-white' : 'bg-emerald-500/10 text-emerald-500'
              }`}>
                {u.status === 'suspended' ? '정지됨' : '정상'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <span className="text-slate-400">권한: <strong>{u.role}</strong></span>
              <span className="text-slate-400 font-mono">글 {u.postCount || 0} / 댓 {u.commentCount || 0}</span>
            </div>
          </div>
        ))}
      </div>

      {/* User Detail & Action Modal */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          callerRole={callerRole}
          onClose={() => setSelectedUser(null)}
          onSuspend={(uid, reason) => {
            onSuspend(uid, reason);
            setSelectedUser(null);
          }}
          onUnsuspend={(uid) => {
            onUnsuspend(uid);
            setSelectedUser(null);
          }}
          onMute={(uid, dur) => {
            onMute(uid, dur);
            setSelectedUser(null);
          }}
          onUnmute={(uid) => {
            onUnmute(uid);
            setSelectedUser(null);
          }}
          onWarn={(uid, msg) => {
            onWarn(uid, msg);
            setSelectedUser(null);
          }}
          onChangeRole={(uid, newRole) => {
            onChangeRole(uid, newRole);
            setSelectedUser(null);
          }}
        />
      )}

      {/* Confirm Action Modal */}
      <ConfirmActionModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        description={confirmModal.description}
        isDestructive={confirmModal.isDestructive}
      />
    </div>
  );
};
