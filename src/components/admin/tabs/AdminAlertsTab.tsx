import React, { useState } from 'react';
import { 
  Bell, 
  Send, 
  Users, 
  User, 
  TrendingUp, 
  AlertTriangle, 
  Clock, 
  CheckCircle2 
} from 'lucide-react';
import { AdminNotificationItem, UserRole } from '../../../types';

interface AdminAlertsTabProps {
  notifications: AdminNotificationItem[];
  callerRole: UserRole;
  onSendNotification: (notification: Omit<AdminNotificationItem, 'id' | 'createdAt' | 'sentCount' | 'status'>) => void;
}

export const AdminAlertsTab: React.FC<AdminAlertsTabProps> = ({
  notifications,
  callerRole,
  onSendNotification,
}) => {
  const [targetType, setTargetType] = useState<'all' | 'user' | 'stock' | 'market' | 'system'>('all');
  const [targetId, setTargetId] = useState('');
  const [targetName, setTargetName] = useState('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<'normal' | 'high' | 'urgent'>('normal');

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    onSendNotification({
      targetType,
      targetId: targetId.trim() || undefined,
      targetName: targetName.trim() || undefined,
      title: title.trim(),
      message: message.trim(),
      priority,
      createdBy: callerRole === 'superadmin' ? '최고관리자' : '운영관리자',
    });

    setTitle('');
    setMessage('');
    setTargetId('');
    setTargetName('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <Bell className="w-6 h-6 text-sky-500" />
          <span>시스템 알림 및 전체 공지 발송</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          전체 회원 또는 특정 대상 사용자/종목에 대해 시스템 안내, 시장 변동 긴급 공지를 푸시 발송합니다.
        </p>
      </div>

      {/* Dispatch Console Form */}
      <form onSubmit={handleSend} className="p-5 sm:p-6 bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs space-y-4 text-xs">
        <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800">
          <Send className="w-4 h-4 text-rose-500" />
          <span>신규 시스템 알림 작성 및 전송</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Target Type */}
          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              발송 대상 선택
            </label>
            <select
              value={targetType}
              onChange={e => setTargetType(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
            >
              <option value="all">전체 사용자 (Broadcast)</option>
              <option value="user">특정 사용자 (Target UID)</option>
              <option value="stock">특정 종목 보유/관심자</option>
              <option value="market">시장 이벤트 (서킷/사이드카)</option>
              <option value="system">긴급 시스템 점검</option>
            </select>
          </div>

          {/* Conditional Target Input */}
          {targetType === 'user' && (
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                대상 사용자 UID
              </label>
              <input
                type="text"
                required
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
                placeholder="예: u-user-2"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          )}

          {targetType === 'stock' && (
            <div>
              <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                종목 코드
              </label>
              <input
                type="text"
                required
                value={targetId}
                onChange={e => setTargetId(e.target.value)}
                placeholder="예: 005930 (삼성전자)"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl"
              />
            </div>
          )}

          {/* Priority */}
          <div>
            <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              중요도 / 우선순위
            </label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl font-medium"
            >
              <option value="normal">보통 (일반 알림)</option>
              <option value="high">높음 (중요 공지)</option>
              <option value="urgent">긴급 (즉시 팝업/최우선)</option>
            </select>
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
            알림 제목
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="알림 제목을 간결하고 명확하게 입력하세요."
            className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium"
          />
        </div>

        {/* Message */}
        <div>
          <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
            알림 메시지 본문
          </label>
          <textarea
            required
            rows={3}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="사용자에게 전달될 알림의 상세 내용을 입력하세요."
            className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium resize-none leading-relaxed"
          />
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-xs transition-colors shadow-xs"
          >
            <Send className="w-4 h-4" />
            <span>알림 발송 실행</span>
          </button>
        </div>
      </form>

      {/* Broadcast History Table */}
      <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800 font-bold text-xs text-slate-800 dark:text-slate-200">
          알림 발송 이력 및 전송 결과
        </div>

        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold bg-slate-50/30 dark:bg-slate-800/20">
              <th className="py-3 px-4">대상</th>
              <th className="py-3 px-4">알림 제목 / 내용</th>
              <th className="py-3 px-4 text-center">우선순위</th>
              <th className="py-3 px-4 text-center">수신자 수</th>
              <th className="py-3 px-4">발송자 / 일시</th>
              <th className="py-3 px-4 text-center">상태</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {notifications.map(n => (
              <tr key={n.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                <td className="py-3.5 px-4 whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {n.targetType}
                  </span>
                </td>
                <td className="py-3.5 px-4 max-w-md">
                  <div className="font-bold text-slate-900 dark:text-white line-clamp-1">{n.title}</div>
                  <div className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{n.message}</div>
                </td>
                <td className="py-3.5 px-4 text-center whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    n.priority === 'urgent' ? 'bg-rose-500 text-white' :
                    n.priority === 'high' ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                  }`}>
                    {n.priority.toUpperCase()}
                  </span>
                </td>
                <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                  {(n.sentCount || 1).toLocaleString()}명
                </td>
                <td className="py-3.5 px-4 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                  <div>{n.createdBy}</div>
                  <div>{n.createdAt}</div>
                </td>
                <td className="py-3.5 px-4 text-center whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    전송완료
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
