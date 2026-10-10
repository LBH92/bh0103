import React, { useState } from 'react';
import { 
  X, 
  User, 
  Mail, 
  Calendar, 
  Clock, 
  Shield, 
  FileText, 
  MessageSquare, 
  AlertTriangle, 
  VolumeX, 
  Volume2, 
  UserX, 
  UserCheck, 
  Send
} from 'lucide-react';
import { UserProfile, UserRole } from '../../../types';

interface UserDetailModalProps {
  user: UserProfile | null;
  onClose: () => void;
  callerRole: UserRole;
  onSuspend: (userId: string, reason: string) => void;
  onUnsuspend: (userId: string) => void;
  onMute: (userId: string, durationDesc: string) => void;
  onUnmute: (userId: string) => void;
  onWarn: (userId: string, message: string) => void;
  onChangeRole: (userId: string, newRole: UserRole) => void;
}

export const UserDetailModal: React.FC<UserDetailModalProps> = ({
  user,
  onClose,
  callerRole,
  onSuspend,
  onUnsuspend,
  onMute,
  onUnmute,
  onWarn,
  onChangeRole,
}) => {
  if (!user) return null;

  const [warnMessage, setWarnMessage] = useState('');
  const [suspendReason, setSuspendReason] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>(user.role);
  const [activeTab, setActiveTab] = useState<'info' | 'actions'>('info');

  const isSuperAdmin = callerRole === 'superadmin';
  const isAdmin = isSuperAdmin || callerRole === 'admin';
  const isOwnerAccount = user.email === 'byunghyunlim92@gmail.com';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden scale-in-95 transition-all">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <img
              src={user.avatar}
              alt={user.name}
              className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-700"
            />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  {user.name}
                </h3>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  user.role === 'superadmin' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                  user.role === 'admin' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                  user.role === 'moderator' ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' :
                  'bg-slate-100 dark:bg-slate-800 text-slate-500'
                }`}>
                  {user.role.toUpperCase()}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  user.status === 'suspended' ? 'bg-rose-500 text-white' : 'bg-emerald-500/10 text-emerald-500'
                }`}>
                  {user.status === 'suspended' ? '정지됨' : '정상'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">{user.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-5 pt-2">
          <button
            onClick={() => setActiveTab('info')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'info'
                ? 'border-rose-500 text-rose-500'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            }`}
          >
            기본 정보 & 활동 통계
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors ${
              activeTab === 'actions'
                ? 'border-rose-500 text-rose-500'
                : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            }`}
          >
            제재 및 권한 변경
          </button>
        </div>

        {/* Body */}
        <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4 text-xs">
          {activeTab === 'info' ? (
            <>
              {/* Grid Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-medium">작성 게시글</span>
                  <span className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">
                    {user.postCount || 0}개
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-medium">작성 댓글</span>
                  <span className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">
                    {user.commentCount || 0}개
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] text-rose-500 block font-bold">신고 받은 횟수</span>
                  <span className="text-base font-bold font-mono text-rose-500 mt-0.5 block">
                    {user.reportedCount || 0}회
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[10px] text-slate-400 block font-medium">신고 접수한 횟수</span>
                  <span className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">
                    {user.reportSubmitCount || 0}회
                  </span>
                </div>
              </div>

              {/* Detail fields */}
              <div className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-400">UID:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 select-all">{user.id}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-400">가입 일자:</span>
                  <span className="text-slate-700 dark:text-slate-300">{user.joinedDate}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-400">최근 접속:</span>
                  <span className="text-slate-700 dark:text-slate-300">{user.lastLoginAt || '기록 없음'}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-400">채팅 제한 여부:</span>
                  <span className={user.chatRestricted ? 'text-rose-500 font-bold' : 'text-emerald-500'}>
                    {user.chatRestricted ? `제한됨 (${user.chatMutedUntil || '상세 사유 확인'})` : '정상 발언 가능'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-400">계정 상태:</span>
                  <span className={user.status === 'suspended' ? 'text-rose-500 font-bold' : 'text-slate-700 dark:text-slate-300'}>
                    {user.status === 'suspended' ? `이용 정지 (${user.suspendedReason || '규정 위반'})` : '정상 이용'}
                  </span>
                </div>
              </div>

              {user.bio && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] text-slate-400 block font-semibold mb-1">소개글:</span>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{user.bio}</p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {/* Role Change (Superadmin only) */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200">역할 및 권한 (Role) 변경</span>
                  {!isSuperAdmin && (
                    <span className="text-[10px] text-rose-500 font-semibold">
                      * 최고 관리자(superadmin) 전용
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    disabled={!isSuperAdmin || isOwnerAccount}
                    value={selectedRole}
                    onChange={e => setSelectedRole(e.target.value as UserRole)}
                    className="flex-1 px-3 py-2 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-700 rounded-lg text-xs disabled:opacity-50"
                  >
                    <option value="user">일반 사용자 (user)</option>
                    <option value="moderator">운영진 (moderator)</option>
                    <option value="admin">일반 관리자 (admin)</option>
                    <option value="superadmin">최고 관리자 (superadmin)</option>
                  </select>
                  <button
                    disabled={!isSuperAdmin || isOwnerAccount || selectedRole === user.role}
                    onClick={() => onChangeRole(user.id, selectedRole)}
                    className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs disabled:opacity-40 transition-colors"
                  >
                    권한 적용
                  </button>
                </div>
                {isOwnerAccount && (
                  <p className="text-[10px] text-slate-400">
                    * 시스템 최초 소유자 계정의 최고 관리자 권한은 고정되어 있습니다.
                  </p>
                )}
              </div>

              {/* Chat Mute / Unmute */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
                <span className="font-bold text-slate-800 dark:text-slate-200 block">채팅 발언 제한 (Mute)</span>
                <div className="flex items-center gap-2">
                  {user.chatRestricted ? (
                    <button
                      onClick={() => onUnmute(user.id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs transition-colors"
                    >
                      <Volume2 className="w-4 h-4" />
                      <span>채팅 제한 해제</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => onMute(user.id, '24시간 발언 제한')}
                      className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-xs transition-colors"
                    >
                      <VolumeX className="w-4 h-4" />
                      <span>채팅 24시간 제한</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Warning message */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
                <span className="font-bold text-slate-800 dark:text-slate-200 block">사용자 경고 알림 전송</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={warnMessage}
                    onChange={e => setWarnMessage(e.target.value)}
                    placeholder="경고 사유 입력 (예: 부적절한 언어 사용 주의)"
                    className="flex-1 px-3 py-2 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                  />
                  <button
                    disabled={!warnMessage.trim()}
                    onClick={() => {
                      onWarn(user.id, warnMessage.trim());
                      setWarnMessage('');
                    }}
                    className="px-3 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-900 text-white rounded-lg font-bold text-xs disabled:opacity-40 transition-colors flex items-center gap-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>발송</span>
                  </button>
                </div>
              </div>

              {/* Suspend / Unsuspend */}
              <div className="p-3.5 bg-rose-50/50 dark:bg-rose-950/10 rounded-xl border border-rose-200 dark:border-rose-900/40 space-y-2">
                <span className="font-bold text-rose-600 dark:text-rose-400 block">계정 정지 조치</span>
                {user.status === 'suspended' ? (
                  <button
                    onClick={() => onUnsuspend(user.id)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs transition-colors"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>정지 해제 및 계정 정상화</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={suspendReason}
                      onChange={e => setSuspendReason(e.target.value)}
                      placeholder="정지 사유 (예: 불법 리딩방 광고 3회 적발)"
                      className="w-full px-3 py-2 bg-white dark:bg-[#131722] border border-rose-200 dark:border-rose-900/60 rounded-lg text-xs"
                    />
                    <button
                      disabled={!suspendReason.trim()}
                      onClick={() => onSuspend(user.id, suspendReason.trim())}
                      className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs disabled:opacity-40 transition-colors"
                    >
                      <UserX className="w-4 h-4" />
                      <span>회원 이용 정지 실행</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
