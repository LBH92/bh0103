/**
 * Client Service for User Personal AI Connection & Cost Shielding
 */

import { UserAiConnectionStatus } from '../types';

export const userAiConnectionClient = {
  /**
   * Get user AI connection status
   */
  async getConnectionStatus(uid: string): Promise<UserAiConnectionStatus> {
    if (!uid) {
      return {
        connected: false,
        provider: 'gemini',
        model: 'gemini-3.8-flash',
        verified: false,
        officialBillingNotice: '로그인 후 개인 Google AI Studio API 키를 연결할 수 있습니다.',
      };
    }

    const res = await fetch(`/api/ai/connection/status?uid=${encodeURIComponent(uid)}`, {
      headers: {
        'x-user-uid': uid,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'AI 연결 상태를 조회하지 못했습니다.');
    }

    return await res.json();
  },

  /**
   * Connect personal Gemini API key
   */
  async connectKey(uid: string, apiKey: string, model: string = 'gemini-3.8-flash'): Promise<UserAiConnectionStatus> {
    const res = await fetch('/api/ai/connection/connect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-uid': uid,
      },
      body: JSON.stringify({
        uid,
        apiKey,
        model,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '개인 AI 계정 연결 및 검증에 실패했습니다.');
    }

    return data.status;
  },

  /**
   * Disconnect personal AI key
   */
  async disconnectKey(uid: string): Promise<UserAiConnectionStatus> {
    const res = await fetch('/api/ai/connection/disconnect', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-uid': uid,
      },
      body: JSON.stringify({ uid }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'AI 연결 해제에 실패했습니다.');
    }

    return data.status;
  },
};
