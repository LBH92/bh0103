import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { AdminSubTab, UserProfile, UserRole } from '../../types';
import { adminService } from '../../services/adminService';
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

  // 2. Data States
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

  // Real-time synchronization of admin reports and data
  useEffect(() => {
    const refreshData = () => {
      setReports(adminService.getReports());
      setUsers(adminService.getUsers());
      setPosts(adminService.getPosts());
      setComments(adminService.getAllComments());
      setChatMessages(adminService.getChatMessages());
      setLogs(adminService.getAdminLogs());
    };
    refreshData();
    window.addEventListener('storage', refreshData);
    window.addEventListener('focus', refreshData);
    return () => {
      window.removeEventListener('storage', refreshData);
      window.removeEventListener('focus', refreshData);
    };
  }, [activeSubTab]);

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
          />
        );

      case 'users':
        return (
          <AdminUsersTab
            users={users}
            callerRole={user.role}
            onSuspend={(uid, reason) => {
              adminService.suspendUser(uid, reason, callerProfile);
              setUsers(adminService.getUsers());
              setLogs(adminService.getAdminLogs());
              showToast('사용자가 정지 처리되었습니다.', 'info');
            }}
            onUnsuspend={uid => {
              adminService.unsuspendUser(uid, callerProfile);
              setUsers(adminService.getUsers());
              setLogs(adminService.getAdminLogs());
              showToast('사용자 정지가 해제되었습니다.', 'success');
            }}
            onMute={(uid, dur) => {
              adminService.muteUser(uid, dur, callerProfile);
              setUsers(adminService.getUsers());
              setLogs(adminService.getAdminLogs());
              showToast('사용자 채팅이 제한되었습니다.', 'info');
            }}
            onUnmute={uid => {
              adminService.unmuteUser(uid, callerProfile);
              setUsers(adminService.getUsers());
              setLogs(adminService.getAdminLogs());
              showToast('채팅 제한이 해제되었습니다.', 'success');
            }}
            onWarn={(uid, msg) => {
              adminService.warnUser(uid, msg, callerProfile);
              setUsers(adminService.getUsers());
              setLogs(adminService.getAdminLogs());
              showToast('경고 알림이 전송되었습니다.', 'info');
            }}
            onChangeRole={(uid, newRole) => {
              const res = adminService.changeUserRole(uid, newRole, user.role, callerProfile);
              if (res.success) {
                setUsers(adminService.getUsers());
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
            onUpdateStatus={(pid, status) => {
              adminService.updatePostStatus(pid, status, callerProfile);
              setPosts(adminService.getPosts());
              setLogs(adminService.getAdminLogs());
              showToast(`게시글이 '${status}' 처리되었습니다.`, 'info');
            }}
            onToggleNotice={(pid, isNotice) => {
              adminService.toggleNoticePost(pid, isNotice, callerProfile);
              setPosts(adminService.getPosts());
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
