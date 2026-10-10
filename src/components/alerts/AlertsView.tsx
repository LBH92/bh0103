import React, { useState, useEffect } from 'react';
import { 
  Bell, 
  Trash2, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  DollarSign,
  Newspaper,
  Activity,
  CheckCircle2, 
  Plus, 
  ShieldAlert, 
  Clock, 
  Check, 
  ChevronRight,
  Filter,
  CheckCheck,
  RefreshCw,
  ExternalLink,
  Sliders,
  AlertCircle,
  Edit2,
  Smartphone,
  Send,
  Radio
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AppNotification, UserAlertRule, AlertRuleType } from '../../types';
import { notificationService } from '../../services/notificationService';
import { fcmPushService, PushStatus } from '../../services/fcmPushService';

export const AlertsView: React.FC = () => {
  const { stocks, watchlist, navigateToStock, setActiveTab, showToast, user } = useApp();

  // Top Level Tab: 'notifications' (알림 피드) vs 'rules' (조건 설정) vs 'push_settings' (푸시 알림 설정)
  const [activeMainTab, setActiveMainTab] = useState<'notifications' | 'rules' | 'push_settings'>('notifications');

  // Push Notification State
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [isTogglingPush, setIsTogglingPush] = useState<boolean>(false);
  const [isSendingTestPush, setIsSendingTestPush] = useState<boolean>(false);

  // Notifications State & Filter
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [isLoadingNotifs, setIsLoadingNotifs] = useState<boolean>(true);

  // User Alert Rules State
  const [rules, setRules] = useState<UserAlertRule[]>([]);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState<boolean>(false);

  // Edit Alert Rule State
  const [editingRule, setEditingRule] = useState<UserAlertRule | null>(null);
  const [editValue, setEditValue] = useState<number>(5.0);
  const [editEnabled, setEditEnabled] = useState<boolean>(true);

  // Form State for creating a new user alert rule
  const [ruleSymbol, setRuleSymbol] = useState<string>(stocks[0]?.symbol || '005930');
  const [ruleType, setRuleType] = useState<AlertRuleType>('price_rise');
  const [ruleValue, setRuleValue] = useState<number>(5.0); // 직접 입력할 기준값

  // Load notifications and rules from server
  const loadData = async () => {
    setIsLoadingNotifs(true);
    try {
      const [notifsData, rulesData] = await Promise.all([
        notificationService.getNotifications(user?.id),
        notificationService.getUserAlertRules(user?.id),
      ]);
      setNotifications(notifsData);
      setRules(rulesData);
    } catch (err) {
      console.warn('[AlertsView] loadData error:', err);
    } finally {
      setIsLoadingNotifs(false);
    }
  };

  const loadPushStatus = async () => {
    try {
      const status = await fcmPushService.getStatus(user?.id);
      setPushStatus(status);
    } catch (err) {
      console.warn('[AlertsView] loadPushStatus error:', err);
    }
  };

  const handleTogglePush = async () => {
    if (!user?.id) {
      showToast('로그인 후 푸시 알림을 설정할 수 있습니다.', 'warning');
      return;
    }

    setIsTogglingPush(true);
    try {
      if (pushStatus?.enabled) {
        // Turn OFF
        await fcmPushService.disablePush(user.id);
        showToast('전체 푸시 알림이 비활성화되었습니다.', 'info');
      } else {
        // Turn ON
        const res = await fcmPushService.enablePush(user.id);
        if (res.success) {
          showToast('전체 푸시 알림(FCM Web Push)이 성공적으로 활성화되었습니다!', 'success');
        } else {
          showToast(res.error || '푸시 알림 활성화에 실패했습니다.', 'error');
        }
      }
      await loadPushStatus();
    } catch (err: any) {
      showToast(err.message || '푸시 알림 상태 변경 실패', 'error');
    } finally {
      setIsTogglingPush(false);
    }
  };

  const handleSendTestPush = async () => {
    if (!user?.id) {
      showToast('로그인이 필요합니다.', 'warning');
      return;
    }
    if (!pushStatus?.enabled) {
      showToast('먼저 전체 푸시 알림을 켜주세요.', 'warning');
      return;
    }

    setIsSendingTestPush(true);
    try {
      const res = await fcmPushService.triggerTestPush(user.id);
      if (res.success) {
        showToast(res.message || '테스트 푸시가 성공적으로 전송되었습니다!', 'success');
      } else {
        showToast(res.message || '테스트 푸시 전송 실패', 'error');
      }
    } catch {
      showToast('테스트 푸시 요청 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSendingTestPush(false);
    }
  };

  useEffect(() => {
    loadData();
    loadPushStatus();
    // Poll notifications every 5 seconds to catch server-generated alerts
    const interval = setInterval(() => {
      notificationService.getNotifications(user?.id)
        .then(res => setNotifications(res))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Handle default value recommendation when type changes
  const handleTypeChange = (newType: AlertRuleType) => {
    setRuleType(newType);
    switch (newType) {
      case 'price_rise':
        setRuleValue(5.0); // 기본값: 5% 상승
        break;
      case 'price_fall':
        setRuleValue(3.0); // 기본값: 3% 하락
        break;
      case 'volume_spike':
        setRuleValue(200.0); // 기본값: 200%
        break;
      case 'trading_value_spike':
        setRuleValue(3000.0); // 기본값: 3,000억 원
        break;
      case 'related_news':
        setRuleValue(1);
        break;
      case 'market_event':
        setRuleValue(2.0); // 지수 2%
        break;
    }
  };

  // Create new rule
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    const st = stocks.find(s => s.symbol === ruleSymbol);
    const isMarket = ruleType === 'market_event' || ruleSymbol === 'MARKET';

    try {
      const newRule = await notificationService.addUserAlertRule({
        uid: user?.id || 'demo-user-1',
        symbol: isMarket ? 'MARKET' : (st?.symbol || ruleSymbol),
        symbolName: isMarket ? '국내 증시 전체' : (st?.name || ruleSymbol),
        type: ruleType,
        value: Number(ruleValue),
        condition: ruleType === 'price_fall' ? 'below' : 'above',
        enabled: true,
      });

      setRules(prev => [newRule, ...prev]);
      setIsRuleModalOpen(false);
      showToast(
        `${newRule.symbolName} [${getAlertTypeName(ruleType)}] 알림 조건(${ruleValue}${getAlertUnit(ruleType)})이 등록되었습니다.`,
        'success'
      );
    } catch {
      showToast('알림 조건 등록에 실패했습니다.', 'error');
    }
  };

  // Open rule edit modal
  const handleOpenEditRule = (rule: UserAlertRule) => {
    setEditingRule(rule);
    setEditValue(rule.value);
    setEditEnabled(rule.enabled);
  };

  // Submit rule edit
  const handleUpdateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;

    try {
      await notificationService.updateUserAlertRule(editingRule.id, {
        value: Number(editValue),
        enabled: editEnabled,
      });

      setRules(prev => prev.map(r => r.id === editingRule.id ? { ...r, value: Number(editValue), enabled: editEnabled } : r));
      setEditingRule(null);
      showToast(`${editingRule.symbolName} [${getAlertTypeName(editingRule.type)}] 기준값(${editValue}${getAlertUnit(editingRule.type)})이 성공적으로 수정되었습니다.`, 'success');
    } catch {
      showToast('알림 조건 수정에 실패했습니다.', 'error');
    }
  };

  // Sync user watchlist with server for background monitoring
  useEffect(() => {
    if (watchlist && watchlist.length > 0) {
      notificationService.syncWatchlistForMonitoring(user?.id, watchlist);
    }
  }, [user?.id, watchlist]);

  // Toggle rule enabled/disabled
  const handleToggleRule = async (ruleId: string, currentEnabled: boolean) => {
    try {
      await notificationService.updateUserAlertRule(ruleId, { enabled: !currentEnabled });
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, enabled: !currentEnabled } : r));
      showToast(`알림 규칙이 ${!currentEnabled ? '활성화' : '일시정지'}되었습니다.`, 'info');
    } catch {
      showToast('규칙 상태 변경 실패', 'error');
    }
  };

  // Delete rule
  const handleDeleteRule = async (ruleId: string) => {
    try {
      await notificationService.deleteUserAlertRule(ruleId);
      setRules(prev => prev.filter(r => r.id !== ruleId));
      showToast('알림 규칙이 삭제되었습니다.', 'info');
    } catch {
      showToast('규칙 삭제 실패', 'error');
    }
  };

  // Mark single notification as read
  const handleMarkAsRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await notificationService.markAsRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    await notificationService.markAllAsRead(user?.id);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    showToast('모든 알림을 읽음 처리했습니다.', 'success');
  };

  // Delete notification
  const handleDeleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await notificationService.deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    showToast('알림이 삭제되었습니다.', 'info');
  };

  // Click notification to navigate
  const handleNotificationClick = (notif: AppNotification) => {
    // 1. Mark as read immediately
    if (!notif.read) {
      notificationService.markAsRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, read: true } : n));
    }

    // 2. Navigate based on target type
    if (notif.targetType === 'market') {
      setActiveTab('insight');
    } else if (notif.stockSymbol) {
      navigateToStock(notif.stockSymbol);
    }
  };

  // Immediate server check trigger using 100% real Kiwoom API
  const handleCheckNow = async () => {
    showToast('키움 실시간 API 기반으로 이상 움직임을 검증 중입니다...', 'info');
    const res = await notificationService.triggerServerCheck(user?.id, watchlist);
    if (res && res.generatedCount > 0) {
      showToast(`${res.generatedCount}건의 새로운 시장 이상 알림이 포착되었습니다!`, 'success');
    } else {
      showToast('현재 새로운 이상 변동이 발생하지 않았습니다.', 'info');
    }
    loadData();
  };

  // Helpers
  const getAlertTypeName = (type: AlertRuleType) => {
    switch (type) {
      case 'price_rise': return '가격 상승';
      case 'price_fall': return '가격 하락';
      case 'volume_spike': return '거래량 급증';
      case 'trading_value_spike': return '거래대금 급증';
      case 'related_news': return '관련 뉴스';
      case 'market_event': return '시장 이벤트';
      default: return '알림';
    }
  };

  const getAlertUnit = (type: AlertRuleType) => {
    switch (type) {
      case 'price_rise':
      case 'price_fall': return '%';
      case 'volume_spike': return '%';
      case 'trading_value_spike': return '억 원';
      case 'related_news': return '';
      case 'market_event': return '%';
      default: return '';
    }
  };

  const getAlertBadge = (type: AlertRuleType | 'system') => {
    switch (type) {
      case 'price_rise':
        return { label: '가격 상승', color: 'bg-rose-500/10 text-rose-500 border-rose-500/30', icon: <TrendingUp className="w-3.5 h-3.5" /> };
      case 'price_fall':
        return { label: '가격 하락', color: 'bg-blue-500/10 text-blue-500 border-blue-500/30', icon: <TrendingDown className="w-3.5 h-3.5" /> };
      case 'volume_spike':
        return { label: '거래량 급증', color: 'bg-amber-500/10 text-amber-500 border-amber-500/30', icon: <Zap className="w-3.5 h-3.5" /> };
      case 'trading_value_spike':
        return { label: '거래대금 폭증', color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30', icon: <DollarSign className="w-3.5 h-3.5" /> };
      case 'related_news':
        return { label: '관련 뉴스', color: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/30', icon: <Newspaper className="w-3.5 h-3.5" /> };
      case 'market_event':
        return { label: '시장 이벤트', color: 'bg-purple-500/10 text-purple-500 border-purple-500/30', icon: <Activity className="w-3.5 h-3.5" /> };
      default:
        return { label: '시스템', color: 'bg-slate-100 dark:bg-slate-800 text-slate-600', icon: <Bell className="w-3.5 h-3.5" /> };
    }
  };

  // Filtering notifications
  const unreadCount = notifications.filter(n => !n.read).length;
  const filteredNotifications = notifications.filter(n => {
    if (readFilter === 'unread') return !n.read;
    if (readFilter === 'read') return n.read;
    return true;
  });

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-150">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#131722] p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
              <Bell className="w-5 h-5" />
            </span>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white">
              알림 및 감지 센터
            </h1>
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white animate-pulse">
                {unreadCount}건 읽지 않음
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            관심종목별 알림 조건(가격 상승·하락, 거래량·거래대금 급증, 뉴스, 시장 이벤트)을 직접 설정하고 서버에서 실시간 수신합니다.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
          <button
            onClick={handleCheckNow}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
            title="서버에서 알림 조건을 즉시 검증"
          >
            <RefreshCw className="w-3.5 h-3.5 text-rose-500" />
            <span>서버 알림 점검</span>
          </button>

          <button
            onClick={() => setIsRuleModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>새 알림 조건 설정</span>
          </button>
        </div>
      </div>

      {/* 1.5 Master Push Notification Control Bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-[#131722] to-slate-900 border border-slate-700/60 shadow-lg text-white">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className={`p-2.5 rounded-xl shrink-0 ${pushStatus?.enabled ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-slate-800 text-slate-400 border border-slate-700'}`}>
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-sm text-white">
                  실시간 휴대폰 푸시 알림 (FCM Web Push)
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  pushStatus?.enabled 
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}>
                  {pushStatus?.enabled ? '● 푸시 수신 중 (ON)' : '○ 푸시 꺼짐 (OFF)'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  {pushStatus?.platform === 'android' ? '🤖 Android' : pushStatus?.platform === 'ios' ? '🍎 iPhone' : '💻 Web'}
                  {pushStatus?.isPwa ? ' (PWA 홈 화면)' : ''}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                관심종목 급등·급락, 거래량/거래대금 폭증, VI, 사이드카 감지 시 앱이 꺼져 있어도(백그라운드/PWA 종료) 스마트폰으로 즉시 전송됩니다.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 self-end md:self-center shrink-0">
            {pushStatus?.enabled && (
              <button
                onClick={handleSendTestPush}
                disabled={isSendingTestPush}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer disabled:opacity-50"
                title="등록된 기기로 테스트 푸시 즉시 전송"
              >
                <Send className="w-3.5 h-3.5 text-rose-400" />
                <span>{isSendingTestPush ? '발송 중...' : '테스트 푸시 발송'}</span>
              </button>
            )}

            <button
              onClick={handleTogglePush}
              disabled={isTogglingPush}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50 shadow-sm ${
                pushStatus?.enabled
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <Radio className={`w-3.5 h-3.5 ${pushStatus?.enabled ? 'animate-pulse text-white' : 'text-slate-400'}`} />
              <span>{isTogglingPush ? '처리 중...' : pushStatus?.enabled ? '전체 푸시 알림 ON' : '전체 푸시 알림 켜기'}</span>
            </button>
          </div>
        </div>

        {/* Device specific guides for iOS & Android */}
        {pushStatus?.platform === 'ios' && !pushStatus.isPwa && (
          <div className="mt-3 pt-3 border-t border-slate-800 text-[11px] text-amber-300/90 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>iPhone(iOS 16.4+) 안내: Safari 하단 공유 버튼 [공유] &gt; <b>[홈 화면에 추가]</b> 후 해당 앱을 실행하여 알림을 허용해야 백그라운드 푸시가 정상 수신됩니다.</span>
          </div>
        )}
      </div>

      {/* 2. Top-Level Main Tabs: [실시간 수신 알림] vs [관심종목 알림 조건 관리] vs [푸시 알림 설정] */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl w-fit flex-wrap">
        <button
          onClick={() => setActiveMainTab('notifications')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeMainTab === 'notifications'
              ? 'bg-white dark:bg-[#1a1f2e] text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>수신 알림 피드</span>
          {unreadCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] flex items-center justify-center font-bold">
              {unreadCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveMainTab('rules')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeMainTab === 'rules'
              ? 'bg-white dark:bg-[#1a1f2e] text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>관심종목 알림 조건 설정 ({rules.length}개)</span>
        </button>

        <button
          onClick={() => setActiveMainTab('push_settings')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
            activeMainTab === 'push_settings'
              ? 'bg-white dark:bg-[#1a1f2e] text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>푸시 알림 설정</span>
          <span className={`w-2 h-2 rounded-full ${pushStatus?.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
        </button>
      </div>

      {/* ======================================================== */}
      {/* SECTION A: 수신 알림 피드 (Notifications Collection)     */}
      {/* ======================================================== */}
      {activeMainTab === 'notifications' && (
        <div className="space-y-4">
          {/* Sub Filters: 읽음 / 읽지 않음 구분 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setReadFilter('all')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  readFilter === 'all'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                전체 알림 ({notifications.length})
              </button>

              <button
                onClick={() => setReadFilter('unread')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                  readFilter === 'unread'
                    ? 'bg-rose-600 text-white'
                    : 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/10'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                <span>읽지 않음 ({unreadCount})</span>
              </button>

              <button
                onClick={() => setReadFilter('read')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  readFilter === 'read'
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                읽음 완료 ({notifications.length - unreadCount})
              </button>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>모두 읽음 처리</span>
              </button>
            )}
          </div>

          {/* Notification Cards List */}
          {filteredNotifications.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800">
              <Bell className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <h3 className="font-bold text-slate-700 dark:text-slate-300">
                {readFilter === 'unread' ? '읽지 않은 새로운 알림이 없습니다.' : '수신된 알림이 없습니다.'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                관심종목 알림 조건을 설정하면 서버에서 조건 충족 시 즉각 알림이 등록됩니다.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotifications.map(notif => {
                const badge = getAlertBadge(notif.type);
                const isUnread = !notif.read;

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer group flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      isUnread
                        ? 'bg-rose-50/20 dark:bg-rose-950/10 border-rose-300 dark:border-rose-900/50 shadow-xs hover:border-rose-400'
                        : 'bg-white dark:bg-[#131722] border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      {/* Unread indicator / Icon */}
                      <div className="relative shrink-0 mt-0.5">
                        <div className={`p-2.5 rounded-xl border ${badge.color}`}>
                          {badge.icon}
                        </div>
                        {isUnread && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-white dark:border-[#131722]" />
                        )}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] border ${badge.color}`}>
                            {badge.label}
                          </span>

                          {notif.stockName && (
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {notif.stockName}
                              {notif.stockSymbol && (
                                <span className="font-mono text-slate-400 ml-1">
                                  ({notif.stockSymbol})
                                </span>
                              )}
                            </span>
                          )}

                          {notif.metrics?.sidecarStatus && (
                            <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                              사이드카: {notif.metrics.sidecarStatus}
                            </span>
                          )}

                          <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            발생: {notif.timestamp}
                          </span>

                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            isUnread 
                              ? 'bg-rose-500 text-white' 
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}>
                            {isUnread ? '읽지 않음' : '읽음'}
                          </span>
                        </div>

                        <h4 className={`text-sm sm:text-base font-bold text-slate-900 dark:text-white group-hover:text-rose-500 transition-colors ${
                          isUnread ? 'font-black' : ''
                        }`}>
                          {notif.title}
                        </h4>

                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                          {notif.message}
                        </p>

                        {/* 감지 사유 명시 */}
                        {notif.reason && (
                          <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-semibold bg-rose-500/10 px-2.5 py-1 rounded-lg w-fit mt-1.5 border border-rose-500/20">
                            <span className="font-bold">감지 사유:</span>
                            <span>{notif.reason}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right side actions */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {isUnread && (
                        <button
                          onClick={e => handleMarkAsRead(e, notif.id)}
                          className="p-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors cursor-pointer"
                          title="읽음으로 표시"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={e => handleDeleteNotification(e, notif.id)}
                        className="p-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        title="알림 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="flex items-center text-xs font-bold text-rose-500 group-hover:translate-x-0.5 transition-transform pl-1">
                        <span>상세보기</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION B: 관심종목별 알림 조건 설정 (Alert Rules)       */}
      {/* ======================================================== */}
      {activeMainTab === 'rules' && (
        <div className="space-y-4">
          <div className="p-5 bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-rose-500" />
                <span>관심종목 맞춤 알림 조건 규칙 ({rules.length}개 설정됨)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                서버가 주식 데이터를 4초 주기로 실시간 검증하며, 직접 입력한 기준치 충족 시 notifications 컬렉션에 자동 저장됩니다.
              </p>
            </div>

            <button
              onClick={() => setIsRuleModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition-all cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>새 조건 추가하기</span>
            </button>
          </div>

          {/* Rules Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rules.map(rule => {
              const badge = getAlertBadge(rule.type);
              const currentStock = stocks.find(s => s.symbol === rule.symbol);

              return (
                <div
                  key={rule.id}
                  className={`p-5 rounded-2xl bg-white dark:bg-[#131722] border transition-all space-y-4 ${
                    rule.enabled
                      ? 'border-slate-200 dark:border-slate-800 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800/60 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-xl border ${badge.color}`}>
                        {badge.icon}
                      </div>
                      <div>
                        <h4
                          onClick={() => rule.symbol !== 'MARKET' && navigateToStock(rule.symbol)}
                          className={`font-bold text-base text-slate-900 dark:text-white ${
                            rule.symbol !== 'MARKET' ? 'hover:text-rose-500 cursor-pointer' : ''
                          }`}
                        >
                          {rule.symbolName}
                        </h4>
                        <span className="text-xs font-mono text-slate-400">
                          {rule.symbol}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenEditRule(rule)}
                        className="p-1.5 text-slate-400 hover:text-indigo-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="알림 기준값 수정"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="규칙 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Configured Threshold Value */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">감지 유형:</span>
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] border ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">설정 기준값:</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                        {rule.type === 'price_rise' && `+${rule.value}% 이상 상승`}
                        {rule.type === 'price_fall' && `-${Math.abs(rule.value)}% 이하 하락`}
                        {rule.type === 'volume_spike' && `평균 대비 ${rule.value}% 폭증`}
                        {rule.type === 'trading_value_spike' && `${rule.value.toLocaleString()}억 원 이상`}
                        {rule.type === 'related_news' && `공시·속보 발생 시`}
                        {rule.type === 'market_event' && `지수 변동 ±${rule.value}%`}
                      </span>
                    </div>

                    {currentStock && (
                      <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span className="text-slate-400">현재가:</span>
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                          {currentStock.price.toLocaleString()}원 ({currentStock.changePercent > 0 ? '+' : ''}{currentStock.changePercent}%)
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Status Toggle & Cooldown Indicator */}
                  <div className="pt-2 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-400 font-mono">
                      중복 방지 3분 쿨다운
                    </span>

                    <button
                      onClick={() => handleToggleRule(rule.id, rule.enabled)}
                      className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        rule.enabled
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {rule.enabled ? '감시 활성 (ON)' : '일시정지 (OFF)'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION C: 휴대폰 & 웹 푸시 알림 설정 (FCM Web Push)    */}
      {/* ======================================================== */}
      {activeMainTab === 'push_settings' && (
        <div className="space-y-6">
          {/* Main Push Toggle Card */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-2xl ${pushStatus?.enabled ? 'bg-rose-500/10 text-rose-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                  <Smartphone className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    전체 푸시 알림 (FCM Web Push)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    휴대폰(Android/iPhone PWA) 및 PC 브라우저로 실시간 주가 급등락, 거래량 폭증, VI, 사이드카 알림을 수신합니다.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleTogglePush}
                  disabled={isTogglingPush}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm disabled:opacity-50 flex items-center gap-2 ${
                    pushStatus?.enabled
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                      : 'bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white dark:text-slate-200'
                  }`}
                >
                  <Radio className={`w-3.5 h-3.5 ${pushStatus?.enabled ? 'animate-pulse text-white' : 'text-slate-400'}`} />
                  <span>{isTogglingPush ? '처리 중...' : pushStatus?.enabled ? '전체 푸시 활성화됨 (ON)' : '전체 푸시 알림 켜기'}</span>
                </button>
              </div>
            </div>

            {/* Diagnostics & Status Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* 1. Permission */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 block text-[11px] mb-1">브라우저 알림 권한</span>
                <span className={`font-bold text-sm ${pushStatus?.permission === 'granted' ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {pushStatus?.permission === 'granted' ? '✓ 허용됨 (Active)' : pushStatus?.permission === 'denied' ? '✕ 차단됨' : '! 요청 대기'}
                </span>
              </div>

              {/* 2. Device Platform */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 block text-[11px] mb-1">접속 기기 환경</span>
                <span className="font-bold text-sm text-slate-800 dark:text-slate-200">
                  {pushStatus?.platform === 'android' ? '🤖 Android' : pushStatus?.platform === 'ios' ? '🍎 iPhone' : '💻 데스크톱/웹'}
                  {pushStatus?.isPwa ? ' (PWA 홈 화면)' : ''}
                </span>
              </div>

              {/* 3. FCM Token */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 block text-[11px] mb-1">FCM 토큰 발급 상태</span>
                <span className={`font-bold text-sm ${pushStatus?.token ? 'text-emerald-500' : 'text-slate-400'}`}>
                  {pushStatus?.token ? '✓ 발급 및 서버 등록 완료' : '미등록 (알림 켜기 필요)'}
                </span>
              </div>

              {/* 4. Background Receiver */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
                <span className="text-slate-400 block text-[11px] mb-1">백그라운드 / 앱 종료 수신</span>
                <span className={`font-bold text-sm ${pushStatus?.supported ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {pushStatus?.supported ? '✓ Service Worker 대기' : '미지원'}
                </span>
              </div>
            </div>

            {/* Test Push Button */}
            <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs">
                  실제 기기 푸시 수신 테스트
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  현재 등록된 기기로 서버에서 실제 FCM 테스트 푸시 알림을 즉시 발송합니다.
                </p>
              </div>

              <button
                onClick={handleSendTestPush}
                disabled={isSendingTestPush || !pushStatus?.enabled}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 shrink-0 flex items-center gap-1.5 shadow-sm shadow-rose-600/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSendingTestPush ? '전송 중...' : '테스트 푸시 발송'}</span>
              </button>
            </div>
          </div>

          {/* Platform Specific PWA Guides */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Android Guide */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🤖</span>
                <h4 className="font-bold text-slate-900 dark:text-white">Android PWA 설치 및 수신 안내</h4>
              </div>
              <ul className="text-slate-500 dark:text-slate-400 space-y-1.5 list-disc list-inside text-[11px] leading-relaxed">
                <li>Chrome 또는 삼성 인터넷에서 우측 상단 메뉴 &gt; <b>[홈 화면에 추가]</b> 또는 <b>[앱 설치]</b>를 탭합니다.</li>
                <li>홈 화면의 병돌투자 아이콘으로 실행하면 완벽한 네이티브 앱 환경으로 동작합니다.</li>
                <li>앱이 종료되어 있거나 백그라운드 상태여도 키움 시장 이상 알림이 즉각 팝업 푸시로 수신됩니다.</li>
              </ul>
            </div>

            {/* iPhone iOS Guide */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🍎</span>
                <h4 className="font-bold text-slate-900 dark:text-white">iPhone(iOS 16.4+) PWA Web Push 안내</h4>
              </div>
              <ul className="text-slate-500 dark:text-slate-400 space-y-1.5 list-disc list-inside text-[11px] leading-relaxed">
                <li>Apple iOS 정책상 Safari 하단 공유 버튼(네모+화살표) &gt; <b>[홈 화면에 추가]</b>를 진행해야 웹 푸시가 활성화됩니다.</li>
                <li>홈 화면에 생성된 '병돌투자' 앱을 실행한 후 [전체 푸시 알림 켜기]를 눌러 알림 권한을 허용해주세요.</li>
                <li>화면이 꺼져 있거나 잠금 상태에서도 iOS 알림 센터와 배너로 푸시가 정상 전달됩니다.</li>
              </ul>
            </div>
          </div>

          {/* Security & Cooldown Info */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 space-y-2">
            <h5 className="font-bold text-slate-700 dark:text-slate-300">🔒 보안 및 중복 수신 방지 원칙</h5>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">서버 보안 비밀키 격리</span>
                FCM 서버 키는 백엔드 메모리에만 보관되며 클라이언트 번들에 절대 노출되지 않습니다.
              </div>
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">로그아웃 시 토큰 무효화</span>
                계정 로그아웃 시 기존 UID의 FCM 토큰이 즉시 삭제되어 타인 계정 알림 수신이 완벽 차단됩니다.
              </div>
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800">
                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-0.5">3~5분 쿨다운 중복 방지</span>
                동일 종목 동일 이상 변동에 대해 5분 쿨다운을 적용하여 알림 폭탄 및 배터리 소모를 방지합니다.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SECTION C: 새 알림 조건 등록 모달 (직접 기준값 입력)      */}
      {/* ======================================================== */}
      {isRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-rose-500" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  관심종목 알림 조건 등록
                </h3>
              </div>
              <button
                onClick={() => setIsRuleModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4 text-xs">
              {/* 1. 종목 선택 */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  대상 종목 선택
                </label>
                <select
                  value={ruleSymbol}
                  onChange={e => setRuleSymbol(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <optgroup label="관심 종목">
                    {stocks.filter(s => watchlist.includes(s.symbol)).map(s => (
                      <option key={s.symbol} value={s.symbol}>
                        ★ {s.name} ({s.symbol}) - {s.market}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="전체 종목">
                    {stocks.map(s => (
                      <option key={s.symbol} value={s.symbol}>
                        {s.name} ({s.symbol}) - {s.market}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="시장 전체">
                    <option value="MARKET">🏛️ 국내 증시 전체 (KOSPI/KOSDAQ)</option>
                  </optgroup>
                </select>
              </div>

              {/* 2. 6대 알림 종류 선택 */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                  알림 종류 선택 (6가지)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleTypeChange('price_rise')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      ruleType === 'price_rise'
                        ? 'bg-rose-500/10 border-rose-500 text-rose-500 shadow-2xs'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>가격 상승</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTypeChange('price_fall')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      ruleType === 'price_fall'
                        ? 'bg-blue-500/10 border-blue-500 text-blue-500 shadow-2xs'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span>가격 하락</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTypeChange('volume_spike')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      ruleType === 'volume_spike'
                        ? 'bg-amber-500/10 border-amber-500 text-amber-500 shadow-2xs'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>거래량 급증</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTypeChange('trading_value_spike')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      ruleType === 'trading_value_spike'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500 shadow-2xs'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>거래대금 급증</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTypeChange('related_news')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      ruleType === 'related_news'
                        ? 'bg-indigo-500/10 border-indigo-500 text-indigo-500 shadow-2xs'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Newspaper className="w-3.5 h-3.5" />
                    <span>관련 뉴스</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTypeChange('market_event')}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      ruleType === 'market_event'
                        ? 'bg-purple-500/10 border-purple-500 text-purple-500 shadow-2xs'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>시장 이벤트</span>
                  </button>
                </div>
              </div>

              {/* 3. 사용자가 직접 기준값 입력 (Direct Value Input) */}
              {ruleType !== 'related_news' && (
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    사용자 직접 기준값 입력 ({getAlertUnit(ruleType)})
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step={ruleType === 'trading_value_spike' ? '500' : '0.5'}
                      value={ruleValue}
                      onChange={e => setRuleValue(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm font-bold text-slate-900 dark:text-white"
                      placeholder="기준값을 입력하세요"
                      required
                    />
                    <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400 font-mono">
                      {getAlertUnit(ruleType)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {ruleType === 'price_rise' && `예: 5 입력 시 등락률 +5.0% 이상 돌파할 때 알림`}
                    {ruleType === 'price_fall' && `예: 3 입력 시 등락률 -3.0% 이하 급락할 때 알림`}
                    {ruleType === 'volume_spike' && `예: 200 입력 시 20일 평균 거래량 대비 200% 이상일 때 알림`}
                    {ruleType === 'trading_value_spike' && `예: 3000 입력 시 거래대금 3,000억 원 이상일 때 알림`}
                    {ruleType === 'market_event' && `예: 2 입력 시 지수 변동폭 ±2.0% 이상일 때 알림`}
                  </p>
                </div>
              )}

              {/* 중복 알림 방지 안내 */}
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] leading-relaxed">
                🛡️ <strong>중복 알림 방지 적용:</strong> 동일 종목의 동일 이벤트는 3분 동안 중복 발생하지 않도록 서버에서 제어합니다.
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRuleModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-sm cursor-pointer"
                >
                  알림 조건 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ======================================================== */}
      {/* SECTION D: 알림 조건 수정 모달 (기준값 수정)            */}
      {/* ======================================================== */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-indigo-500" />
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  알림 기준값 수정
                </h3>
              </div>
              <button
                onClick={() => setEditingRule(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateRule} className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white text-sm">
                    {editingRule.symbolName}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {editingRule.symbol}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">감지 유형:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {getAlertTypeName(editingRule.type)}
                  </span>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  새로운 기준값 입력 ({getAlertUnit(editingRule.type)})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step={editingRule.type === 'trading_value_spike' ? '500' : '0.5'}
                    value={editValue}
                    onChange={e => setEditValue(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm font-bold text-slate-900 dark:text-white"
                    placeholder="새로운 기준값을 입력하세요"
                    required
                  />
                  <span className="absolute right-3.5 top-2.5 text-xs font-bold text-slate-400 font-mono">
                    {getAlertUnit(editingRule.type)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  {editingRule.type === 'price_rise' && `예: 7 입력 시 전일 대비 +7.0% 이상 돌파할 때 알림`}
                  {editingRule.type === 'price_fall' && `예: 4 입력 시 전일 대비 -4.0% 이하 급락할 때 알림`}
                  {editingRule.type === 'volume_spike' && `예: 250 입력 시 20일 평균 거래량 대비 250% 이상일 때 알림`}
                  {editingRule.type === 'trading_value_spike' && `예: 5000 입력 시 거래대금 5,000억 원 이상일 때 알림`}
                  {editingRule.type === 'market_event' && `예: 3 입력 시 지수 변동폭 ±3.0% 이상일 때 알림`}
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  알림 감시 활성화 여부
                </span>
                <button
                  type="button"
                  onClick={() => setEditEnabled(!editEnabled)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    editEnabled
                      ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/30'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                  }`}
                >
                  {editEnabled ? '활성 (ON)' : '일시정지 (OFF)'}
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingRule(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm cursor-pointer"
                >
                  수정 내용 저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
