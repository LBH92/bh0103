import express from 'express';

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

// In-Memory store for Server Admin State
const initialLogs: ServerAdminLog[] = [
  {
    id: `log-${Date.now() - 3600000}`,
    adminId: 'u-admin-1',
    adminName: '총괄관리자',
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

/**
 * Verify Admin Authorization Middleware
 */
export const requireAdminAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const role = (req.headers['x-admin-role'] as string)?.toLowerCase();
  const email = (req.headers['x-user-email'] as string)?.toLowerCase();
  const isSuperOwner = email === 'byunghyunlim92@gmail.com';

  if (isSuperOwner || role === 'superadmin' || role === 'admin' || role === 'moderator') {
    return next();
  }

  return res.status(403).json({
    error: '관리자 권한이 없습니다. 접근이 거부되었습니다.',
    code: 'ADMIN_ACCESS_DENIED'
  });
};

/**
 * Superadmin Only Middleware
 */
export const requireSuperAdminOnly = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const role = (req.headers['x-admin-role'] as string)?.toLowerCase();
  const email = (req.headers['x-user-email'] as string)?.toLowerCase();
  const isSuperOwner = email === 'byunghyunlim92@gmail.com';

  if (isSuperOwner || role === 'superadmin') {
    return next();
  }

  return res.status(403).json({
    error: '최고 관리자(Superadmin) 전용 권한입니다.',
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

  // 2. Admin Logs (Read-only immutable)
  router.get('/logs', (req, res) => {
    res.json(adminLogs);
  });

  router.post('/logs', (req, res) => {
    const { action, targetType, targetId, targetTitle, details, beforeData, afterData } = req.body;
    const adminRole = (req.headers['x-admin-role'] as any) || 'admin';
    const adminName = (req.headers['x-admin-name'] as string) || '운영관리자';
    const adminId = (req.headers['x-admin-uid'] as string) || 'system-admin';

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
    const adminName = (req.headers['x-admin-name'] as string) || '최고관리자';

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
      adminId: (req.headers['x-admin-uid'] as string) || 'superadmin',
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

  return router;
};
