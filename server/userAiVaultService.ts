/**
 * User AI Connection Vault Service (Server-Side)
 * 
 * Strict Security & Architecture Principles:
 * 1. User Isolation & Authentication:
 *    - Each user's AI credential is authenticated via Firebase ID Token (Bearer Token).
 *    - Client-supplied raw User IDs or forged headers are NEVER trusted.
 * 2. Secure Secret Storage:
 *    - Raw API keys are NEVER exposed in response JSON, logs, or errors.
 *    - Keys are stored encrypted with AES-256-GCM using a server-side encryption key.
 *    - Only masked versions (e.g. AIzaSy...8x1Q) are returned to the client for display.
 * 3. Operator Cost Shielding:
 *    - When a user calls AI services, the server verifies their individual AI credential.
 *    - If personal connection is not active or invalid, calls to the operator's public Gemini key
 *      are STRICTLY BLOCKED with a 402/403 status code and guidance.
 *    - NO automatic fallback to operator public keys for personal requests.
 * 4. Official Provider Verification:
 *    - When connecting, a lightweight test query is dispatched to the provider with the user's key
 *      to ensure validity before saving.
 *    - Disconnection immediately purges the credential from the server vault.
 */

import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { UserAiConnectionStatus } from '../src/types';

interface EncryptedVaultRecord {
  uid: string;
  provider: 'gemini';
  model: string;
  encryptedKey: string; // AES-256-GCM ciphertext hex
  iv: string;           // 12-byte IV hex
  authTag: string;      // 16-byte auth tag hex
  keyMasked: string;
  connectedAt: string;
  lastUsedAt?: string;
  callCount: number;
}

// Server Master Encryption Secret (Derived from process env or fallback persistent server seed)
const ENCRYPTION_SECRET = process.env.AI_VAULT_ENCRYPTION_KEY 
  || process.env.COOKIE_SECRET 
  || 'bd_invest_vault_master_seed_2026_secured_key_32b';

const CIPHER_KEY = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();

// In-Memory Secure Vault Storage (Keyed by verified UID)
const userVault = new Map<string, EncryptedVaultRecord>();

/**
 * Mask an API key securely (e.g. AIzaSy...4x8A)
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '****';
  const prefix = key.slice(0, 6);
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Encrypt secret with AES-256-GCM
 */
function encryptKey(plainKey: string): { ciphertext: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', CIPHER_KEY, iv);
  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag,
  };
}

/**
 * Decrypt secret with AES-256-GCM
 */
function decryptKey(record: EncryptedVaultRecord): string {
  const decipher = crypto.createDecipheriv('aes-256-gcm', CIPHER_KEY, Buffer.from(record.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(record.authTag, 'hex'));
  let decrypted = decipher.update(record.encryptedKey, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export const userAiVaultService = {
  /**
   * Get user connection status (safe, masked, no raw key)
   */
  getConnectionStatus(uid: string): UserAiConnectionStatus {
    const record = userVault.get(uid);
    if (!record) {
      return {
        connected: false,
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        verified: false,
        officialBillingNotice: '공식 Google AI Studio / Cloud Billing 개인 계정 기반 과금 체계가 적용됩니다. 키는 서버 AES-256-GCM 보안 금고에 안전하게 암호화 보관됩니다.',
      };
    }

    return {
      connected: true,
      provider: record.provider,
      model: record.model,
      connectedAt: record.connectedAt,
      keyMasked: record.keyMasked,
      verified: true,
      lastUsedAt: record.lastUsedAt,
      callCount: record.callCount,
      officialBillingNotice: '개인 Google AI Studio 계정에 연동되어 사용량이 개인 프로젝트 및 과금 계정에서 차감됩니다.',
    };
  },

  /**
   * Verify and connect user Gemini API key
   */
  async connectUserGeminiKey(
    uid: string, 
    rawApiKey: string, 
    model: string = 'gemini-3.8-flash'
  ): Promise<UserAiConnectionStatus> {
    const trimmed = rawApiKey.trim();
    if (!trimmed) {
      throw new Error('API 키가 입력되지 않았습니다.');
    }

    if (!trimmed.startsWith('AIza') && trimmed.length < 20) {
      throw new Error('유효하지 않은 Google Gemini API 키 형식입니다 (일반적으로 "AIza..."로 시작).');
    }

    // 1. Verify credentials directly with Google Gemini API
    try {
      const testAi = new GoogleGenAI({
        apiKey: trimmed,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      // Quick test probe
      const res = await testAi.models.generateContent({
        model,
        contents: 'ping',
        config: {
          maxOutputTokens: 5,
        },
      });

      if (!res) {
        throw new Error('Gemini API 응답을 확인할 수 없습니다.');
      }
    } catch (testErr: any) {
      const msg = testErr?.message || String(testErr);
      if (msg.includes('API_KEY_INVALID') || msg.includes('400') || msg.includes('403') || msg.includes('unauthorized')) {
        throw new Error('입력하신 Gemini API 키가 유효하지 않거나 인증에 실패했습니다. Google AI Studio에서 키 활성화 상태를 확인해주세요.');
      } else if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
        throw new Error('해당 개인 계정의 Gemini API 쿼터가 초과되었거나 과금 설정이 활성화되지 않았습니다.');
      }
      throw new Error(`개인 Gemini 계정 검증 실패: ${msg}`);
    }

    // 2. Encrypt and save securely in vault
    const { ciphertext, iv, authTag } = encryptKey(trimmed);
    const now = new Date().toISOString();

    const record: EncryptedVaultRecord = {
      uid,
      provider: 'gemini',
      model,
      encryptedKey: ciphertext,
      iv,
      authTag,
      keyMasked: maskApiKey(trimmed),
      connectedAt: now,
      callCount: 0,
    };

    userVault.set(uid, record);

    return this.getConnectionStatus(uid);
  },

  /**
   * Disconnect and permanently remove user's key from vault
   */
  disconnectUser(uid: string): boolean {
    const existed = userVault.delete(uid);
    return existed;
  },

  /**
   * Retrieve active GoogleGenAI client for the given authenticated user
   * Throws strictly if user is not connected, preventing operator cost fallback.
   */
  getUserGenAIClient(uid: string): { client: GoogleGenAI; model: string } {
    const record = userVault.get(uid);
    if (!record) {
      throw new Error('AI_NOT_CONNECTED: 개인 Gemini AI 계정이 연결되지 않았습니다. 프로필 또는 AI 설정에서 본인의 Google AI Studio 키를 연결해주세요.');
    }

    try {
      const plainKey = decryptKey(record);
      record.lastUsedAt = new Date().toISOString();
      record.callCount += 1;

      const client = new GoogleGenAI({
        apiKey: plainKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      return {
        client,
        model: record.model,
      };
    } catch (err: any) {
      throw new Error('AI_DECRYPTION_FAILED: 저장된 자격 증명을 복호화할 수 없습니다. 다시 연결해주세요.');
    }
  },

  /**
   * Check if a user has a valid active connection
   */
  hasConnection(uid: string): boolean {
    return userVault.has(uid);
  },
};
