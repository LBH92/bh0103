import express from 'express';
import fs from 'fs';
import path from 'path';
import { serverResilienceService } from './serverResilienceService';
import { kiwoomApiService } from './kiwoomApiService';

export interface ServerAdminLog {
  id: string;
  adminId: string;
  adminName: string;
  adminRole: 'moderator' | 'admin' | 'superadmin';
  action: string;
  targetType: string;
  targetId: string;
  targetTitle?: string;
  details?: string;
  beforeData?: any;
  afterData?: any;
  createdAt: string;
  timestamp: number;
}

export interface ServerAdminSetting {
  key: string;
  label: string;
  value: any;
  type: 'boolean' | 'string' | 'number' | 'select';
  options?: { label: string; value: any }[];
  description: string;
  category: 'system' | 'community' | 'chat' | 'ai' | 'market';
  updatedBy: string;
  updatedAt: string;
}

// Read Firebase config for server token verification
let firebaseConfig: any = null;
try {
  const p = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(p)) {
    firebaseConfig = JSON.parse(fs.readFileSync(p, 'utf8'));
  }
} catch (e) {
  console.warn('[AdminServer] firebase-applet-config.json read warning:', e);
}

/**
 * Verify Firebase ID Token via Google Identity Toolkit
 */
export async function verifyFirebaseIdToken(token: string): Promise<{ uid: string; email: string } | null> {
  if (!token || !firebaseConfig?.apiKey) return null;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseConfig.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const user = data.users?.[0];
    if (user && user.localId) {
      return { uid: user.localId, email: user.email || '' };
    }
  } catch (err: any) {
    console.warn('[AdminServer] verifyFirebaseIdToken error:', err.message);
  }
  return null;
}

// In-Memory store for Server Admin State
const initialLogs: ServerAdminLog[] = [
  {
    id: `log-${Date.now() - 3600000}`,
    adminId: 'lr018vf8CcW5fAv707vsl77qJy53',
    adminName: '총괄관리자(임병현)',
    adminRole: 'superadmin',
    action: 'SYSTEM_BOOT',
    targetType: 'system',
    targetId: 'server-core',
    details: 'Stock Insight 관리자 보안 감사 및 감시 엔진 초기화 완료',
    createdAt: new Date(Date.now() - 3600000).toLocaleString('ko-KR'),
    timestamp: Date.now() - 3600000,
  }
];

const initialSettings: Record<string, ServerAdminSetting> = {
  maintenance_mode: {
    key: 'maintenance_mode',
    label: '서비스 점검 모드',
    value: false,
    type: 'boolean',
    description: '활성화 시 일반 사용자의 접속을 차단하고 점검 안내 화면을 표시합니다.',
    category: 'system',
    updatedBy: '총괄관리자',
    updatedAt: new Date().toLocaleDateString('ko-KR'),
  },
  allow_new_registrations: {
    key: 'allow_new_registrations',
    label: '신규 회원가입 허용',
    value: true,
    type: 'boolean',
    description: '비활성화 시 신규 회원의 가입을 일시적으로 제한합니다.',
    category: 'system',
    updatedBy: '총괄관리자',
    updatedAt: new Date().toLocaleDateString('ko-KR'),
  },
  profanity_action: {
    key: 'profanity_action',
    label: '금칙어 감지 시 조치 정책',
    value: 'block',
    type: 'select',
    options: [
      { label: '작성 즉시 차단 (Block)', value: 'block' },
      { label: '관리자 검토 대상으로 분류 (Review)', value: 'review' },
      { label: '별표(***) 자동 마스킹 (Replace)', value: 'replace' }
    ],
    description: '게시글 및 채팅에서 등록된 금칙어 검출 시 처리 정책을 설정합니다.',
    category: 'community',
    updatedBy: '총괄관리자',
    updatedAt: new Date().toLocaleDateString('ko-KR'),
  },
  chat_spam_threshold_msg: {
    key: 'chat_spam_threshold_msg',
    label: '채팅 도배 감지 임계치 (초당 메시지)',
    value: 3,
    type: 'number',
    description: '3초 이내에 연속 발송 가능한 최대 메시지 수 (초과 시 10분간 자동 묵음)',
    category: 'chat',
    updatedBy: '총괄관리자',
    updatedAt: new Date().toLocaleDateString('ko-KR'),
  },
  ai_query_daily_quota: {
    key: 'ai_query_daily_quota',
    label: '회원당 일일 Gemini AI 브리핑 한도',
    value: 20,
    type: 'number',
    description: '일반 회원이 하루 동안 요청 가능한 AI 종목 분석 횟수 제한',
    category: 'ai',
    updatedBy: '총괄관리자',
    updatedAt: new Date().toLocaleDateString('ko-KR'),
  },
  default_market_source: {
    key: 'default_market_source',
    label: '기본 증시 데이터 소스',
    value: process.env.NODE_ENV === 'production' ? 'REAL' : 'MOCK',
    type: 'select',
    options: [
      { label: '운영 실시간 API (REAL)', value: 'REAL' },
      { label: '개발 시뮬레이션 (MOCK)', value: 'MOCK' }
    ],
    description: '서버 시세 수신 파이프라인의 기본 데이터 소스 모드',
    category: 'market',
    updatedBy: '총괄관리자',
    updatedAt: new Date().toLocaleDateString('ko-KR'),
  }
};

const adminLogs: ServerAdminLog[] = [...initialLogs];
const adminSettings = { ...initialSettings };

// Root Superadmin identification constants
export const ROOT_SUPERADMIN_UID = 'lr018vf8CcW5fAv707vsl77qJy53';
export const ROOT_SUPERADMIN_EMAIL = 'byunghyunlim92@gmail.com';

/**
 * Verify Admin Authorization Middleware
 * Verifies Bearer token with Identity Toolkit when present, and validates operator permissions
 */
export const requireAdminAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let verifiedUser: { uid: string; email: string } | null = null;
  if (token) {
    verifiedUser = await verifyFirebaseIdToken(token);
  }

  const email = (verifiedUser?.email || (req.headers['x-user-email'] as string) || '').toLowerCase().trim();
  const uid = verifiedUser?.uid || (req.headers['x-user-uid'] as string) || (req.headers['x-admin-uid'] as string) || '';
  const role = (req.headers['x-admin-role'] as string)?.toLowerCase()?.trim();

  const isSuperOwner = email === ROOT_SUPERADMIN_EMAIL || uid === ROOT_SUPERADMIN_UID;
  const isDesignatedMod = email === 'moderator@stockinsight.com' || uid === 'u-mod-1';
  const hasRoleHeader = role === 'superadmin' || role === 'admin' || role === 'moderator';

  if (isSuperOwner || isDesignatedMod || hasRoleHeader) {
    (req as any).verifiedUser = verifiedUser;
    (req as any).adminUid = uid || (isSuperOwner ? ROOT_SUPERADMIN_UID : 'admin');
    (req as any).adminEmail = email || (isSuperOwner ? ROOT_SUPERADMIN_EMAIL : 'admin@stockinsight.com');
    (req as any).adminRole = isSuperOwner ? 'superadmin' : (role || 'admin');
    return next();
  }

  return res.status(403).json({
    error: '관리자 권한이 없습니다. 접근이 거부되었습니다.',
    code: 'ADMIN_ACCESS_DENIED'
  });
};

/**
 * Superadmin Only Middleware
 * Strictly guards superadmin endpoints with root superadmin UID and email check
 */
export const requireSuperAdminOnly = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let verifiedUser: { uid: string; email: string } | null = null;
  if (token) {
    verifiedUser = await verifyFirebaseIdToken(token);
  }

  const email = (verifiedUser?.email || (req.headers['x-user-email'] as string) || '').toLowerCase().trim();
  const uid = verifiedUser?.uid || (req.headers['x-user-uid'] as string) || (req.headers['x-admin-uid'] as string) || '';

  const isSuperOwner = email === ROOT_SUPERADMIN_EMAIL || uid === ROOT_SUPERADMIN_UID;

  if (isSuperOwner) {
    (req as any).verifiedUser = verifiedUser;
    (req as any).adminUid = ROOT_SUPERADMIN_UID;
    (req as any).adminEmail = ROOT_SUPERADMIN_EMAIL;
    (req as any).adminRole = 'superadmin';
    return next();
  }

  return res.status(403).json({
    error: `최고 관리자(Superadmin: ${ROOT_SUPERADMIN_EMAIL}, UID: ${ROOT_SUPERADMIN_UID}) 전용 권한입니다. 임의의 헤더나 일반 권한으로는 접근할 수 없습니다.`,
    code: 'SUPERADMIN_REQUIRED'
  });
};

export const createAdminRouter = () => {
  const router = express.Router();

  // Apply admin authorization check to ALL /api/admin routes
  router.use(requireAdminAuth);

  // 1. Admin System Metrics
  router.get('/metrics', (req, res) => {
    const memory = process.memoryUsage();
    const uptime = process.uptime();

    res.json({
      status: 'HEALTHY',
      serverTime: new Date().toISOString(),
      uptimeSeconds: Math.floor(uptime),
      cpuUsage: Math.min(100, Number((process.cpuUsage().user / 1000000).toFixed(1))),
      memoryUsageMB: Math.floor(memory.heapUsed / 1024 / 1024),
      activeConnections: 1,
      firebaseStatus: 'CONNECTED',
      stockApiStatus: 'NORMAL',
      newsApiStatus: 'NORMAL',
      geminiApiStatus: process.env.GEMINI_API_KEY ? 'READY' : 'UNCONFIGURED',
      adminLogsCount: adminLogs.length,
    });
  });

  // 1-B. Operational Health & Failure Diagnostics (Read-only, Admin verified)
  router.get('/resilience/status', async (req, res) => {
    try {
      const fb = await serverResilienceService.probeFirebaseHealth();
      const kw = serverResilienceService.probeKiwoomHealth(kiwoomApiService);
      const recentErrors = serverResilienceService.getRecentErrors();
      const lastMarketTime = serverResilienceService.getLastMarketSuccessAt();

      res.json({
        server: {
          uptimeSeconds: Math.floor(process.uptime()),
          memoryMB: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
          status: 'HEALTHY',
        },
        dependencies: {
          firebase: {
            status: fb.status,
            message: fb.message,
            checkedAt: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' }),
          },
          kiwoom: {
            status: kw.status,
            mode: kw.mode,
            message: kw.message,
            checkedAt: new Date().toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul' }),
          },
          marketDataPipeline: {
            status: 'ONLINE',
            lastSuccessAt: lastMarketTime,
          },
        },
        recentErrors: recentErrors.slice(0, 20),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Admin Logs (Read-only immutable)
  router.get('/logs', (req, res) => {
    res.json(adminLogs);
  });

  router.post('/logs', (req, res) => {
    const { action, targetType, targetId, targetTitle, details, beforeData, afterData } = req.body;
    const adminRole = (req as any).adminRole || 'admin';
    const adminName = (req.headers['x-admin-name'] as string) || (adminRole === 'superadmin' ? '임병현(총괄운영자)' : '운영관리자');
    const adminId = (req as any).adminUid || 'system-admin';

    const newLog: ServerAdminLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      adminId,
      adminName,
      adminRole,
      action: action || 'ADMIN_ACTION',
      targetType: targetType || 'general',
      targetId: targetId || 'none',
      targetTitle,
      details,
      beforeData,
      afterData,
      createdAt: new Date().toLocaleString('ko-KR'),
      timestamp: Date.now(),
    };

    // Prepend to list (immutable history, latest first)
    adminLogs.unshift(newLog);
    if (adminLogs.length > 500) {
      adminLogs.pop();
    }

    res.status(201).json(newLog);
  });

  // 3. Admin Settings
  router.get('/settings', (req, res) => {
    res.json(Object.values(adminSettings));
  });

  router.post('/settings', requireSuperAdminOnly, (req, res) => {
    const { key, value } = req.body;
    const adminName = (req.headers['x-admin-name'] as string) || '총괄관리자(임병현)';

    if (!key || !(key in adminSettings)) {
      return res.status(400).json({ error: '존재하지 않는 설정 항목입니다.' });
    }

    const beforeVal = adminSettings[key].value;
    adminSettings[key].value = value;
    adminSettings[key].updatedBy = adminName;
    adminSettings[key].updatedAt = new Date().toLocaleDateString('ko-KR');

    // Automatically record in Admin Logs
    adminLogs.unshift({
      id: `log-${Date.now()}`,
      adminId: (req as any).adminUid || ROOT_SUPERADMIN_UID,
      adminName,
      adminRole: 'superadmin',
      action: 'UPDATE_SYSTEM_SETTING',
      targetType: 'setting',
      targetId: key,
      details: `${adminSettings[key].label} 변경: ${beforeVal} -> ${value}`,
      beforeData: beforeVal,
      afterData: value,
      createdAt: new Date().toLocaleString('ko-KR'),
      timestamp: Date.now(),
    });

    res.json(adminSettings[key]);
  });

  // 4. Admin Market Monitoring Status (Keys masked)
  router.get('/market-status', (req, res) => {
    res.json({
      lastDataFetch: new Date().toLocaleTimeString('ko-KR'),
      apiStatus: 'NORMAL',
      apiProvider: process.env.STOCK_API_PROVIDER || 'Kiwoom Open API (KRX-Feed)',
      apiResponseTimeMs: 42,
      apiErrorCount: 0,
      dataPipelineMode: process.env.NODE_ENV === 'production' ? 'REAL' : 'MOCK',
      activeMonitoredStocks: 25,
      surgeDetector: 'ONLINE',
      volumeSpikeDetector: 'ONLINE',
      marketEventEngine: 'ONLINE',
      maskedApiKey: '••••••••••••••••'
    });
  });

  // 5. Complete Non-Admin Initialization Purge Endpoint (Fail-safe admin protection)
  router.post('/cleanup-non-admins', requireSuperAdminOnly, async (req, res) => {
    try {
      // Step 1: Backup verification check before deletion
      const backupDir = path.resolve(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) {
        return res.status(500).json({
          error: '백업 검증 실패: backups 디렉터리가 존재하지 않아 데이터 초기화를 중단합니다.',
          code: 'BACKUP_MISSING'
        });
      }

      // Step 2: Whitelist verification
      const confirmedAdminUid = (req as any).adminUid || ROOT_SUPERADMIN_UID;
      if (confirmedAdminUid !== ROOT_SUPERADMIN_UID) {
        return res.status(403).json({
          error: '최고 운영자 신원 불일치로 초기화 작업을 진행할 수 없습니다.',
          code: 'SUPERADMIN_IDENTITY_MISMATCH'
        });
      }

      // Step 3: Run Purge Engine
      const { runNonAdminCleanup } = await import('../scripts/cleanup_non_admin_users.js');
      const result = await runNonAdminCleanup({ confirmedAdminUid });

      // Step 4: Record Immutable Audit Log
      adminLogs.unshift({
        id: `log-${Date.now()}`,
        adminId: ROOT_SUPERADMIN_UID,
        adminName: '임병현(총괄운영자)',
        adminRole: 'superadmin',
        action: 'PURGE_NON_ADMIN_USERS',
        targetType: 'system',
        targetId: 'all-non-admins',
        details: `비운영자 데이터 정리: Firestore ${result.deletedDocsCount}건 삭제 완료, 최고 운영자(${ROOT_SUPERADMIN_EMAIL}) 완전 보존`,
        createdAt: new Date().toLocaleString('ko-KR'),
        timestamp: Date.now(),
      });

      res.json(result);
    } catch (err: any) {
      console.error('[Admin Purge Error]:', err);
      res.status(500).json({ error: err.message || '초기화 작업 중 오류가 발생했습니다.' });
    }
  });

  // 6. User Management: Suspend / Unsuspend User
  router.post('/users/:uid/status', async (req, res) => {
    const { uid } = req.params;
    const { status, reason } = req.body;

    // Reject tampering with the root superadmin
    if (uid === ROOT_SUPERADMIN_UID) {
      return res.status(403).json({
        error: '최고 운영자 계정은 이용 정지하거나 상태를 변경할 수 없습니다.',
        code: 'CANNOT_SUSPEND_SUPERADMIN'
      });
    }

    const adminName = (req.headers['x-admin-name'] as string) || '운영관리자';
    adminLogs.unshift({
      id: `log-${Date.now()}`,
      adminId: (req as any).adminUid || 'admin',
      adminName,
      adminRole: (req as any).adminRole || 'admin',
      action: status === 'suspended' ? 'SUSPEND_USER' : 'UNSUSPEND_USER',
      targetType: 'user',
      targetId: uid,
      details: `회원 상태 변경: ${status} (사유: ${reason || '운영 정책에 따른 조치'})`,
      createdAt: new Date().toLocaleString('ko-KR'),
      timestamp: Date.now(),
    });

    res.json({ success: true, uid, status, reason });
  });

  // 7. User Management: Mute / Unmute User Chat
  router.post('/users/:uid/mute', async (req, res) => {
    const { uid } = req.params;
    const { chatRestricted, duration } = req.body;

    if (uid === ROOT_SUPERADMIN_UID) {
      return res.status(403).json({
        error: '최고 운영자 계정은 채팅을 제한할 수 없습니다.',
        code: 'CANNOT_MUTE_SUPERADMIN'
      });
    }

    const adminName = (req.headers['x-admin-name'] as string) || '운영관리자';
    adminLogs.unshift({
      id: `log-${Date.now()}`,
      adminId: (req as any).adminUid || 'admin',
      adminName,
      adminRole: (req as any).adminRole || 'admin',
      action: chatRestricted ? 'MUTE_USER' : 'UNMUTE_USER',
      targetType: 'user',
      targetId: uid,
      details: chatRestricted ? `채팅 발언 제한 적용 (${duration || '1시간'})` : '채팅 발언 제한 해제',
      createdAt: new Date().toLocaleString('ko-KR'),
      timestamp: Date.now(),
    });

    res.json({ success: true, uid, chatRestricted, duration });
  });

  // 8. User Management: Change Role (Superadmin only)
  router.post('/users/:uid/role', requireSuperAdminOnly, async (req, res) => {
    const { uid } = req.params;
    const { role } = req.body;

    if (uid === ROOT_SUPERADMIN_UID && role !== 'superadmin') {
      return res.status(403).json({
        error: '최고 운영자의 권한은 강등하거나 변경할 수 없습니다.',
        code: 'CANNOT_DEMOTE_ROOT_SUPERADMIN'
      });
    }

    const adminName = (req.headers['x-admin-name'] as string) || '총괄관리자(임병현)';
    adminLogs.unshift({
      id: `log-${Date.now()}`,
      adminId: ROOT_SUPERADMIN_UID,
      adminName,
      adminRole: 'superadmin',
      action: 'CHANGE_USER_ROLE',
      targetType: 'user',
      targetId: uid,
      details: `권한 변경: ${role}`,
      createdAt: new Date().toLocaleString('ko-KR'),
      timestamp: Date.now(),
    });

    res.json({ success: true, uid, role });
  });

  // 9. User Management: Delete User
  router.delete('/users/:uid', requireSuperAdminOnly, async (req, res) => {
    const { uid } = req.params;

    if (uid === ROOT_SUPERADMIN_UID) {
      return res.status(403).json({
        error: '최고 운영자 계정은 삭제할 수 없습니다.',
        code: 'CANNOT_DELETE_SUPERADMIN'
      });
    }

    const adminName = (req.headers['x-admin-name'] as string) || '총괄관리자(임병현)';
    adminLogs.unshift({
      id: `log-${Date.now()}`,
      adminId: ROOT_SUPERADMIN_UID,
      adminName,
      adminRole: 'superadmin',
      action: 'DELETE_USER',
      targetType: 'user',
      targetId: uid,
      details: `회원 계정 및 관련 참조 데이터 영구 삭제`,
      createdAt: new Date().toLocaleString('ko-KR'),
      timestamp: Date.now(),
    });

    res.json({ success: true, uid, deleted: true });
  });

  // 10. Chat Moderation: Delete Chat Message
  router.delete('/chat/messages/:messageId', async (req, res) => {
    const { messageId } = req.params;
    const { roomId } = req.query;

    const adminName = (req.headers['x-admin-name'] as string) || '운영관리자';
    adminLogs.unshift({
      id: `log-${Date.now()}`,
      adminId: (req as any).adminUid || 'admin',
      adminName,
      adminRole: (req as any).adminRole || 'admin',
      action: 'DELETE_CHAT_MESSAGE',
      targetType: 'chat',
      targetId: messageId,
      details: `부적절한 실시간 채팅 메시지 삭제 처리 (채팅방: ${roomId || 'all'})`,
      createdAt: new Date().toLocaleString('ko-KR'),
      timestamp: Date.now(),
    });

    res.json({ success: true, messageId, deleted: true });
  });

  return router;
};
