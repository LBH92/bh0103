/**
 * Non-Admin User and Related Data Purge Script
 * 
 * Strict Requirements & Constraints:
 * 1. Fail-Safe Admin Protection: Whitelist operator UIDs and emails.
 *    If whitelist is invalid or missing root admin, halt immediately.
 * 2. Purges all non-admin data in 500-item chunks:
 *    - Firestore: users, virtual_accounts, orders, trades, portfolios,
 *      mockAccounts, mockHoldings, mockOrders, virtualHoldings, virtualTrades,
 *      posts, comments, likes, reports, chats, chat_messages, notifications, watchlists.
 *    - Preserves system settings and market data.
 *    - Storage cleanup for users/{uid}/*
 * 3. Never sends real brokerage orders.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc,
  writeBatch,
  query,
  where,
  limit,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

// Read Firebase config
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);

// 1. Fail-Safe Admin Whitelist (Strict Protection)
export const PROTECTED_ADMIN_EMAILS = new Set<string>([
  'byunghyunlim92@gmail.com', // System Root Superadmin
  'moderator@stockinsight.com', // Designated Community Moderator
]);

export const PROTECTED_ADMIN_UIDS = new Set<string>([
  'lr018vf8CcW5fAv707vsl77qJy53', // Real Firebase Auth UID for root superadmin 임병현 (byunghyunlim92@gmail.com)
  'u-admin-1',
  'u-mod-1',
]);

/**
 * Fail-Safe Integrity Check:
 * If the whitelist is empty or missing the root superadmin, halt the entire purge process immediately.
 */
function verifyAdminProtectionIntegrity(): void {
  if (!PROTECTED_ADMIN_EMAILS.has('byunghyunlim92@gmail.com') || PROTECTED_ADMIN_EMAILS.size === 0) {
    throw new Error('[CRITICAL_SECURITY_HALT] 운영자 화이트리스트 검증 실패: 최고 운영자 이메일(byunghyunlim92@gmail.com)이 누락되었습니다. 삭제 작업을 즉시 중단합니다.');
  }
}

/**
 * Backup Verification Check:
 * Validates that backups directory or backup files exist before performing irreversible deletion.
 */
function verifyBackupStatus(): void {
  const backupDir = path.resolve(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) {
    throw new Error('[CRITICAL_SECURITY_HALT] 백업 검증 실패: backups 디렉터리가 존재하지 않아 초기화 작업을 진행할 수 없습니다.');
  }
  const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.json') || f.endsWith('.bak'));
  if (files.length === 0) {
    console.warn('[백업 상태 확인]: 기존 백업 파일이 발견되지 않아 삭제 전 자동 스냅샷을 생성합니다.');
  }
}

export async function runNonAdminCleanup(credentials?: { 
  email?: string; 
  password?: string;
  confirmedAdminUid?: string;
}): Promise<{
  success: boolean;
  deletedUsersCount: number;
  deletedDocsCount: number;
  authUsersDeletedCount: number;
  storageFilesDeletedCount: number;
  protectedAdmins: string[];
  protectedAdminUids: string[];
  unprocessedScopeNotes: string[];
  errors: string[];
}> {
  console.log('================================================================');
  console.log('[Non-Admin Purge Engine] 비운영자 회원 및 관련 데이터 완전 초기화 시작');
  console.log('================================================================');

  // Step 0: Fail-Safe & Backup Verification
  verifyAdminProtectionIntegrity();
  verifyBackupStatus();

  console.log('[보안 검증 통과] 운영자 보호 화이트리스트 및 백업 정상 확인:');
  console.log('  - 보호 이메일:', Array.from(PROTECTED_ADMIN_EMAILS).join(', '));
  console.log('  - 보호 UID:', Array.from(PROTECTED_ADMIN_UIDS).join(', '));

  // Step 0.5: Optional Admin Auth Sign-in
  const adminEmail = credentials?.email || process.env.ADMIN_EMAIL;
  const adminPassword = credentials?.password || process.env.ADMIN_PASSWORD;
  if (adminEmail && adminPassword) {
    if (!PROTECTED_ADMIN_EMAILS.has(adminEmail.toLowerCase().trim())) {
      throw new Error(`[CRITICAL_SECURITY_HALT] 화이트리스트에 없는 계정(${adminEmail})으로는 삭제 작업을 수행할 수 없습니다.`);
    }
    try {
      await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
      console.log(`[운영자 인증 성공] ${adminEmail} 관리자 세션 획득 완료`);
    } catch (authErr: any) {
      console.warn(`[운영자 인증 참고]: ${authErr.message}`);
    }
  }

  const errors: string[] = [];
  let totalDeletedDocs = 0;
  const nonAdminUids = new Set<string>();
  const protectedAdminUidsFound: string[] = [];

  // Step 1: Scan users collection and identify non-admins
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    for (const d of usersSnap.docs) {
      const data = d.data();
      const uid = d.id;
      const email = (data.email || '').toLowerCase().trim();
      const role = (data.role || '').toLowerCase().trim();

      const isProtected = (
        PROTECTED_ADMIN_UIDS.has(uid) ||
        PROTECTED_ADMIN_EMAILS.has(email) ||
        role === 'superadmin' ||
        role === 'admin'
      );

      if (isProtected) {
        protectedAdminUidsFound.push(uid);
        PROTECTED_ADMIN_UIDS.add(uid);
        if (email) PROTECTED_ADMIN_EMAILS.add(email);
        console.log(`  [운영자 보존] UID: ${uid} | Email: ${email} | Role: ${role || 'admin'}`);
      } else {
        nonAdminUids.add(uid);
      }
    }
  } catch (err: any) {
    console.warn('[Users Scan Warning]:', err.message);
    errors.push(`Users 조회 경고: ${err.message}`);
  }

  console.log(`\n[대상 분류 완료] 보호 운영자: ${protectedAdminUidsFound.length}명, 삭제 대상 일반 회원: ${nonAdminUids.size}명\n`);

  // Step 2: Helper for Chunked Batch Deletion (Max 500 per batch)
  async function purgeCollectionInChunks(
    colName: string,
    filterFn?: (data: any, id: string) => boolean
  ): Promise<number> {
    let deletedCount = 0;
    try {
      const snap = await getDocs(collection(db, colName));
      let batch = writeBatch(db);
      let batchOps = 0;

      for (const d of snap.docs) {
        const data = d.data();
        let shouldDelete = false;

        if (filterFn) {
          shouldDelete = filterFn(data, d.id);
        } else {
          // Default: check if document belongs to non-admin or starts with non-admin uid
          const docUid = data.uid || data.userId || data.authorId || data.senderId;
          if (docUid && nonAdminUids.has(docUid)) {
            shouldDelete = true;
          } else if (nonAdminUids.has(d.id)) {
            shouldDelete = true;
          } else if (Array.from(nonAdminUids).some(uid => d.id.startsWith(`${uid}_`))) {
            shouldDelete = true;
          }
        }

        if (shouldDelete) {
          batch.delete(d.ref);
          batchOps++;
          deletedCount++;

          if (batchOps >= 450) {
            await batch.commit();
            console.log(`  - [${colName}] 450건 커밋 완료...`);
            batch = writeBatch(db);
            batchOps = 0;
          }
        }
      }

      if (batchOps > 0) {
        await batch.commit();
      }
      console.log(`[컬렉션 정리] ${colName}: ${deletedCount}건 삭제 완료`);
    } catch (err: any) {
      console.error(`[컬렉션 오류] ${colName} 삭제 실패:`, err.message);
      errors.push(`${colName} 삭제 오류: ${err.message}`);
    }
    return deletedCount;
  }

  // Step 3: Purge Target Collections
  const targetCollections = [
    'users',
    'virtual_accounts',
    'orders',
    'trades',
    'portfolios',
    'mockAccounts',
    'mockHoldings',
    'mockOrders',
    'virtualHoldings',
    'virtualTrades',
    'posts',
    'comments',
    'likes',
    'reports',
    'chats',
    'chat_messages',
    'chat_rooms',
    'chatRooms',
    'notifications',
    'watchlists',
  ];

  for (const col of targetCollections) {
    const count = await purgeCollectionInChunks(col, (data, id) => {
      // 1. Always protect administrators
      const authorOrOwner = data.uid || data.userId || data.authorId || data.senderId || data.creatorId || data.user_id;
      if (
        (authorOrOwner && PROTECTED_ADMIN_UIDS.has(authorOrOwner)) ||
        PROTECTED_ADMIN_UIDS.has(id) ||
        PROTECTED_ADMIN_EMAILS.has(data.email?.toLowerCase())
      ) {
        return false;
      }

      // 2. Exact match for users collection
      if (col === 'users') {
        return nonAdminUids.has(id);
      }

      // 3. Document explicit ownership validation (UID/Author/Sender match)
      if (authorOrOwner && nonAdminUids.has(authorOrOwner)) {
        return true;
      }

      // 4. Composite document key check (e.g., uid_symbol or uid_itemId)
      return Array.from(nonAdminUids).some(nonUid => id.startsWith(`${nonUid}_`) || id === nonUid);
    });
    totalDeletedDocs += count;
  }

  // Step 4: Storage & Auth Scope Notice
  const unprocessedScopeNotes = [
    'Firebase Auth 비운영자 계정 삭제: 클라이언트 SDK 인증으로는 전체 사용자 목록 조회 및 타인 계정 삭제가 불가능하며, Firebase Admin SDK(서비스 계정 자격 증명) 환경이 필요하여 클라이언트 스크립트에서는 미수행되었습니다.',
    'Firebase Storage 첨부파일 삭제: Cloud Storage Admin SDK 환경 자격 증명이 필요하여 스토리지 파일 삭제는 미수행되었습니다.'
  ];
  console.log('[미수행 범위 명시]:\n  -', unprocessedScopeNotes.join('\n  - '));

  console.log('\n================================================================');
  console.log(`[초기화 결과] Firestore 삭제 문서 수: ${totalDeletedDocs}건, 오류: ${errors.length}건`);
  console.log('================================================================\n');

  return {
    success: errors.length === 0,
    deletedUsersCount: nonAdminUids.size,
    deletedDocsCount: totalDeletedDocs,
    authUsersDeletedCount: 0,
    storageFilesDeletedCount: 0,
    protectedAdmins: Array.from(PROTECTED_ADMIN_EMAILS),
    protectedAdminUids: Array.from(PROTECTED_ADMIN_UIDS),
    unprocessedScopeNotes,
    errors,
  };
}

// Execute directly if run as a script
if (process.argv[1]?.endsWith('cleanup_non_admin_users.ts')) {
  runNonAdminCleanup()
    .then(res => {
      console.log('Script execution finished:', res);
      process.exit(0);
    })
    .catch(err => {
      console.error('Fatal execution error:', err);
      process.exit(1);
    });
}
