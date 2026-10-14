import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { AdminSubTab, UserProfile, UserRole } from '../../types';
import { adminService } from '../../services/adminService';
import { firebaseRepository } from '../../services/firebaseRepository';
import { AdminLayout } from './AdminLayout';
import { AdminDashboardTab } from './tabs/AdminDashboardTab';
import { AdminUsersTab } from './tabs/AdminUsersTab';
import { AdminPostsTab } from './tabs/AdminPostsTab';
import { AdminCommentsTab } from './tabs/AdminCommentsTab';
import { AdminReportsTab } from './tabs/AdminReportsTab';
import { AdminChatTab } from './tabs/AdminChatTab';
import { AdminNoticesTab } from './tabs/AdminNoticesTab';
import { AdminFiltersTab } from './tabs/AdminFiltersTab';
import { AdminAlertsTab } from './tabs/AdminAlertsTab';
import { AdminMarketTab } from './tabs/AdminMarketTab';
import { AdminLogsTab } from './tabs/AdminLogsTab';
import { AdminSettingsTab } from './tabs/AdminSettingsTab';
import { ShieldAlert, ArrowLeft, LogIn } from 'lucide-react';

export const AdminView: React.FC = () => {
  const { user, isAuthenticated, setActiveTab: setPublicTab, showToast, setIsAuthModalOpen } = useApp();

  // 1. Determine active subtab from URL pathname or hash (e.g. /admin/users -> 'users')
  const getSubTabFromUrl = (): AdminSubTab => {
    const path = window.location.pathname.replace(/^\/admin\/?/, '');
    const hash = window.location.hash.replace(/^#\/?admin\/?/, '');
    const target = (path || hash || 'dashboard').split('/')[0] as AdminSubTab;

    const validTabs: AdminSubTab[] = [
      'dashboard', 'users', 'posts', 'comments', 'reports', 
      'chat', 'notices', 'filters', 'alerts', 'market', 'logs', 'settings'
    ];

    return validTabs.includes(target) ? target : 'dashboard';
  };

  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>(getSubTabFromUrl);

  // Sync state when browser back/forward buttons are clicked
  useEffect(() => {
    const handlePopState = () => {
      setActiveSubTab(getSubTabFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Update browser URL on tab select
  const handleSelectTab = (tab: AdminSubTab) => {
    setActiveSubTab(tab);
    window.history.pushState(null, '', `/admin/${tab}`);
  };

  // Return to public site
  const handleGoToSite = () => {
    setPublicTab('home');
    window.history.pushState(null, '', '/');
  };

  // 2. Authoritative Data States
  const [users, setUsers] = useState<UserProfile[]>(() => adminService.getUsers());
  const [posts, setPosts] = useState(() => adminService.getPosts());
  const [comments, setComments] = useState(() => adminService.getAllComments());
  const [reports, setReports] = useState(() => adminService.getReports());
  const [chatMessages, setChatMessages] = useState(() => adminService.getChatMessages());
  const [notices, setNotices] = useState(() => adminService.getNotices());
  const [bannedWords, setBannedWords] = useState(() => adminService.getBannedWords());
  const [notifications, setNotifications] = useState(() => adminService.getNotifications());
  const [logs, setLogs] = useState(() => adminService.getAdminLogs());
  const [settings, setSettings] = useState(() => adminService.getSettings());
  const [serverStats, setServerStats] = useState<any>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => new Date().toLocaleTimeString('ko-KR'));
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'RECONNECTING' | 'ERROR'>('CONNECTED');

  // Manual refresh callback
  const handleManualRefresh = useCallback(async () => {
    setConnectionStatus('RECONNECTING');
    try {
      const stats = await adminService.fetchDashboardStats();
      if (stats) setServerStats(stats);
      setLastSyncTime(new Date().toLocaleTimeString('ko-KR'));
      setConnectionStatus('CONNECTED');
      showToast('통계 및 서버 연결 상태를 최신 데이터로 동기화했습니다.', 'info');
    } catch {
      setConnectionStatus('ERROR');
      showToast('서버 동기화 실패. 마지막 정상 데이터 상태를 유지합니다.', 'error');
    }
  }, [showToast]);

  // Real-time synchronization of Firebase Firestore and Server Stats
  useEffect(() => {
    let isMounted = true;

    // 1. Fetch server authoritative metrics & presence
    const syncServerStats = async () => {
      try {
        const stats = await adminService.fetchDashboardStats();
        if (isMounted && stats) {
          setServerStats(stats);
          setLastSyncTime(new Date().toLocaleTimeString('ko-KR'));
          setConnectionStatus('CONNECTED');
        }
      } catch (e) {
        if (isMounted) setConnectionStatus('ERROR');
      }
    };
    syncServerStats();
    const interval = setInterval(syncServerStats, 10000);

    // 2. Real-time Firebase Firestore Users Subscription
    const unsubUsers = firebaseRepository.subscribeUsers(
      liveUsers => {
        if (!isMounted) return;
        setUsers(liveUsers);
        adminService.saveUsers(liveUsers);
        setLastSyncTime(new Date().toLocaleTimeString('ko-KR'));
        setConnectionStatus('CONNECTED');
      },
      err => {
        console.warn('[AdminView] users onSnapshot warning:', err);
        if (isMounted) setConnectionStatus('ERROR');
      }
    );

    // 3. Real-time Firebase Firestore Posts Subscription
    const unsubPosts = firebaseRepository.subscribePosts(
      livePosts => {
        if (!isMounted) return;
        setPosts(livePosts);
        setComments(adminService.getAllComments(livePosts));
        setLastSyncTime(new Date().toLocaleTimeString('ko-KR'));
        setConnectionStatus('CONNECTED');
      },
      err => {
        console.warn('[AdminView] posts onSnapshot warning:', err);
        if (isMounted) setConnectionStatus('ERROR');
      }
    );

    // 4. Real-time Firebase Firestore Reports Subscription
    const unsubReports = firebaseRepository.subscribeReports(
      liveReports => {
        if (!isMounted) return;
        setReports(liveReports);
        adminService.saveReports(liveReports);
        setLastSyncTime(new Date().toLocaleTimeString('ko-KR'));
        setConnectionStatus('CONNECTED');
      },
      err => {
        console.warn('[AdminView] reports onSnapshot warning:', err);
        if (isMounted) setConnectionStatus('ERROR');
      }
    );

    // 5. Real-time Firebase Firestore Chat Messages Subscription
    const unsubChat = firebaseRepository.subscribeAllChat(
      liveChat => {
        if (!isMounted) return;
        setChatMessages(liveChat);
        setLastSyncTime(new Date().toLocaleTimeString('ko-KR'));
        setConnectionStatus('CONNECTED');
      },
      100,
      err => {
        console.warn('[AdminView] chat onSnapshot warning:', err);
        if (isMounted) setConnectionStatus('ERROR');
      }
    );

    const refreshLocalState = () => {
      setNotices(adminService.getNotices());
      setBannedWords(adminService.getBannedWords());
      setLogs(adminService.getAdminLogs());
      setSettings(adminService.getSettings());
    };
    refreshLocalState();
    window.addEventListener('storage', refreshLocalState);
    window.addEventListener('focus', syncServerStats);

    return () => {
      isMounted = false;
      clearInterval(interval);
      unsubUsers();
      unsubPosts();
      unsubReports();
      unsubChat();
      window.removeEventListener('storage', refreshLocalState);
      window.removeEventListener('focus', syncServerStats);
    };
  }, []);

  // 3. Strict Role-based Access Gate
  // Only moderator, admin, or superadmin can enter
  const isAuthorizedRole = user && (user.role === 'admin' || user.role === 'superadmin' || user.role === 'moderator');

  useEffect(() => {
    if (!isAuthenticated || !isAuthorizedRole) {
      window.history.replaceState(null, '', '/');
      setPublicTab('home');
      showToast('일반 사용자는 관리자 영역에 접근할 수 없습니다. 홈 화면으로 이동합니다.', 'warning');
    }
  }, [isAuthenticated, isAuthorizedRole, setPublicTab, showToast]);

  if (!isAuthenticated || !isAuthorizedRole) {
    return null;
  }

  const callerProfile = { id: user.id, name: user.name, role: user.role };
  const pendingReportsCount = reports.filter(r => r.status === 'pending').length;

  // 4. Render Active Subtab View
  const renderTabContent = () => {
    switch (activeSubTab) {
      case 'dashboard':
        return (
          <AdminDashboardTab
            onNavigateTab={handleSelectTab}
            users={users}
            posts={posts}
            reports={reports}
            chatMessages={chatMessages}
            serverStats={serverStats}
            lastSyncTime={lastSyncTime}
            connectionStatus={connectionStatus}
            onRefresh={handleManualRefresh}
          />
        );

      case 'users':
        return (
          <AdminUsersTab
            users={users}
            callerRole={user.role}
            onSuspend={async (uid, reason) => {
              const res = await adminService.suspendUser(uid, reason, callerProfile);
              if (res.success) {
                showToast(res.message, 'info');
              } else {
                showToast(res.message, 'error');
              }
              setLogs(adminService.getAdminLogs());
            }}
            onUnsuspend={async uid => {
              const res = await adminService.unsuspendUser(uid, callerProfile);
              if (res.success) {
                showToast(res.message, 'success');
              } else {
                showToast(res.message, 'error');
              }
              setLogs(adminService.getAdminLogs());
            }}
            onMute={async (uid, dur) => {
              const res = await adminService.muteUser(uid, dur, callerProfile);
              if (res.success) {
                showToast(res.message, 'info');
              } else {
                showToast(res.message, 'error');
              }
              setLogs(adminService.getAdminLogs());
            }}
            onUnmute={async uid => {
              const res = await adminService.unmuteUser(uid, callerProfile);
              if (res.success) {
                showToast(res.message, 'success');
              } else {
                showToast(res.message, 'error');
              }
              setLogs(adminService.getAdminLogs());
            }}
            onWarn={(uid, msg) => {
              adminService.warnUser(uid, msg, callerProfile);
              setLogs(adminService.getAdminLogs());
              showToast('경고 알림이 전송되었습니다.', 'info');
            }}
            onChangeRole={async (uid, newRole) => {
              const res = await adminService.changeUserRole(uid, newRole, user.role, callerProfile);
              if (res.success) {
                setLogs(adminService.getAdminLogs());
                showToast(res.message, 'success');
              } else {
                showToast(res.message, 'error');
              }
            }}
            onDeleteUser={async uid => {
              const res = await adminService.deleteUser(uid, callerProfile);
              if (res.success) {
                setLogs(adminService.getAdminLogs());
                showToast(res.message, 'success');
              } else {
                showToast(res.message, 'error');
              }
            }}
          />
        );

      case 'posts':
        return (
          <AdminPostsTab
            posts={posts}
            callerRole={user.role}
            onUpdateStatus={async (pid, status) => {
              await adminService.updatePostStatus(pid, status, callerProfile);
              setLogs(adminService.getAdminLogs());
              showToast(`게시글이 '${status}' 처리되었습니다.`, 'info');
            }}
            onToggleNotice={async (pid, isNotice) => {
              await adminService.toggleNoticePost(pid, isNotice, callerProfile);
              setLogs(adminService.getAdminLogs());
              showToast(isNotice ? '공지글로 지정되었습니다.' : '공지 지정이 해제되었습니다.', 'info');
            }}
          />
        );

      case 'comments':
        return (
          <AdminCommentsTab
            comments={comments}
            callerRole={user.role}
            onUpdateStatus={(cid, pid, status) => {
              adminService.updateCommentStatus(cid, pid, status, callerProfile);
              setComments(adminService.getAllComments());
              setLogs(adminService.getAdminLogs());
              showToast(`댓글이 '${status}' 처리되었습니다.`, 'info');
            }}
          />
        );

      case 'reports':
        return (
          <AdminReportsTab
            reports={reports}
            callerRole={user.role}
            onResolve={(rid, action) => {
              adminService.resolveReport(rid, action, user.name, callerProfile);
              setReports(adminService.getReports());
              setLogs(adminService.getAdminLogs());
              showToast('신고 처리가 완료되었습니다.', 'success');
            }}
            onDismiss={rid => {
              adminService.dismissReport(rid, user.name, callerProfile);
              setReports(adminService.getReports());
              setLogs(adminService.getAdminLogs());
              showToast('신고가 기각 처리되었습니다.', 'info');
            }}
            onHideContent={(type, targetId) => {
              if (type === 'post') {
                adminService.updatePostStatus(targetId, 'hidden', callerProfile);
                setPosts(adminService.getPosts());
              }
            }}
            onDeleteContent={(type, targetId) => {
              if (type === 'post') {
                adminService.updatePostStatus(targetId, 'deleted', callerProfile);
                setPosts(adminService.getPosts());
              } else if (type === 'chat') {
                adminService.deleteChatMessage(targetId, 'all', callerProfile);
                setChatMessages(adminService.getChatMessages());
              }
            }}
            onMuteUser={targetUserId => {
              adminService.muteUser(targetUserId, '신고 조치에 따른 발언 제한', callerProfile);
              setUsers(adminService.getUsers());
            }}
            onSuspendUser={(targetUserId, reason) => {
              adminService.suspendUser(targetUserId, reason, callerProfile);
              setUsers(adminService.getUsers());
            }}
          />
        );

      case 'chat':
        return (
          <AdminChatTab
            chatMessages={chatMessages}
            callerRole={user.role}
            onDeleteMessage={(mid, rid) => {
              adminService.deleteChatMessage(mid, rid, callerProfile);
              setChatMessages(adminService.getChatMessages(rid));
              setLogs(adminService.getAdminLogs());
              showToast('채팅 메시지가 삭제되었습니다.', 'info');
            }}
            onMuteUser={(uid, dur) => {
              adminService.muteUser(uid, dur, callerProfile);
              setUsers(adminService.getUsers());
              setLogs(adminService.getAdminLogs());
              showToast('사용자 채팅이 제한되었습니다.', 'info');
            }}
          />
        );

      case 'notices':
        return (
          <AdminNoticesTab
            notices={notices}
            callerRole={user.role}
            onCreateNotice={noticeData => {
              adminService.createNotice(noticeData, callerProfile);
              setNotices(adminService.getNotices());
              setPosts(adminService.getPosts());
              setLogs(adminService.getAdminLogs());
              showToast('새 공지사항이 등록되었습니다.', 'success');
            }}
            onUpdateNotice={(id, updates) => {
              adminService.updateNotice(id, updates, callerProfile);
              setNotices(adminService.getNotices());
              setLogs(adminService.getAdminLogs());
              showToast('공지사항이 수정되었습니다.', 'success');
            }}
            onDeleteNotice={id => {
              adminService.deleteNotice(id, callerProfile);
              setNotices(adminService.getNotices());
              setLogs(adminService.getAdminLogs());
              showToast('공지사항이 삭제되었습니다.', 'info');
            }}
            onTogglePin={id => {
              adminService.togglePinNotice(id);
              setNotices(adminService.getNotices());
              showToast('고정 상태가 변경되었습니다.', 'info');
            }}
          />
        );

      case 'filters':
        return (
          <AdminFiltersTab
            bannedWords={bannedWords}
            callerRole={user.role}
            onAddWord={(word, severity, cat, action) => {
              adminService.addBannedWord(word, severity, cat, action, user.name, callerProfile);
              setBannedWords(adminService.getBannedWords());
              setLogs(adminService.getAdminLogs());
              showToast('새 금칙어가 등록되었습니다.', 'success');
            }}
            onDeleteWord={id => {
              adminService.deleteBannedWord(id, callerProfile);
              setBannedWords(adminService.getBannedWords());
              setLogs(adminService.getAdminLogs());
              showToast('금칙어가 삭제되었습니다.', 'info');
            }}
            onToggleWord={(id, enabled) => {
              adminService.toggleBannedWord(id, enabled);
              setBannedWords(adminService.getBannedWords());
              showToast(enabled ? '금칙어가 활성화되었습니다.' : '금칙어가 비활성화되었습니다.', 'info');
            }}
          />
        );

      case 'alerts':
        return (
          <AdminAlertsTab
            notifications={notifications}
            callerRole={user.role}
            onSendNotification={notifData => {
              adminService.sendNotification(notifData, callerProfile);
              setNotifications(adminService.getNotifications());
              setLogs(adminService.getAdminLogs());
              showToast('알림 발송이 완료되었습니다.', 'success');
            }}
          />
        );

      case 'market':
        return <AdminMarketTab callerRole={user.role} />;

      case 'logs':
        return (
          <AdminLogsTab
            logs={logs}
            callerRole={user.role}
            onRefreshLogs={() => setLogs(adminService.getAdminLogs())}
          />
        );

      case 'settings':
        return (
          <AdminSettingsTab
            settings={settings}
            callerRole={user.role}
            onUpdateSetting={(key, val) => {
              const res = adminService.updateSetting(key, val, user.role, callerProfile);
              if (res.success) {
                setSettings(adminService.getSettings());
                setLogs(adminService.getAdminLogs());
                showToast(res.message, 'success');
              } else {
                showToast(res.message, 'error');
              }
            }}
          />
        );

      default:
        return (
          <AdminDashboardTab
            onNavigateTab={handleSelectTab}
            users={users}
            posts={posts}
            reports={reports}
          />
        );
    }
  };

  return (
    <AdminLayout
      activeTab={activeSubTab}
      onSelectTab={handleSelectTab}
      onGoToSite={handleGoToSite}
      user={user}
      pendingReportsCount={pendingReportsCount}
    >
      {renderTabContent()}
    </AdminLayout>
  );
};
