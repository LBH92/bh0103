/**
 * Client-Side Firebase Cloud Messaging (FCM) & Web Push Notification Service
 * 
 * Features:
 * - PWA Service Worker Registration (/firebase-messaging-sw.js)
 * - FCM Token generation & synchronization with backend per UID
 * - Master Push ON/OFF Toggle
 * - Platform detection (Android PWA, iPhone iOS 16.4+ Home Screen PWA, Web)
 * - Invalidation of tokens on logout (prevents previous account push receipt)
 * - Real-time foreground message handling
 */

import { getMessaging, getToken, deleteToken, onMessage, isSupported, Messaging } from 'firebase/messaging';
import { app } from './firebase';

export type DevicePlatform = 'android' | 'ios' | 'web';

export interface PushStatus {
  supported: boolean;
  permission: NotificationPermission;
  token: string | null;
  enabled: boolean;
  platform: DevicePlatform;
  isPwa: boolean;
}

class FcmPushService {
  private messaging: Messaging | null = null;
  private isInitAttempted = false;
  private onMessageUnsubscribe: (() => void) | null = null;

  /**
   * Check if running as installed standalone PWA
   */
  public isPwaStandalone(): boolean {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true ||
      document.referrer.includes('android-app://')
    );
  }

  /**
   * Detect current device platform
   */
  public getPlatform(): DevicePlatform {
    if (typeof navigator === 'undefined') return 'web';
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) return 'android';
    if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
    return 'web';
  }

  /**
   * Check if Web Push / Notification is supported in this browser
   */
  public async isSupported(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const hasApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    if (!hasApi) return false;
    try {
      return await isSupported();
    } catch {
      return false;
    }
  }

  /**
   * Get current push status
   */
  public async getStatus(uid?: string): Promise<PushStatus> {
    const supported = await this.isSupported();
    const permission: NotificationPermission = typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'denied';
    const cachedToken = typeof localStorage !== 'undefined' ? localStorage.getItem('fcm_token') : null;
    const cachedEnabled = typeof localStorage !== 'undefined' ? localStorage.getItem('fcm_push_enabled') !== 'false' : true;

    // Check with server if uid is provided
    let serverEnabled = cachedEnabled;
    if (uid) {
      try {
        const res = await fetch(`/api/fcm/settings?uid=${encodeURIComponent(uid)}`);
        if (res.ok) {
          const data = await res.json();
          serverEnabled = data.pushEnabled !== false;
        }
      } catch {
        // fallback to cached
      }
    }

    return {
      supported,
      permission,
      token: cachedToken,
      enabled: serverEnabled && permission === 'granted',
      platform: this.getPlatform(),
      isPwa: this.isPwaStandalone(),
    };
  }

  /**
   * Initialize messaging instance
   */
  private async getMessagingInstance(): Promise<Messaging | null> {
    if (this.messaging) return this.messaging;
    const supported = await this.isSupported();
    if (!supported) return null;

    try {
      this.messaging = getMessaging(app);
      return this.messaging;
    } catch (err) {
      console.warn('[FcmPushService] Failed to getMessaging:', err);
      return null;
    }
  }

  /**
   * Request notification permission and register FCM Web Push token
   */
  public async enablePush(uid: string): Promise<{ success: boolean; token?: string; error?: string }> {
    if (!uid) {
      return { success: false, error: '로그인이 필요한 기능입니다.' };
    }

    const supported = await this.isSupported();
    if (!supported) {
      return {
        success: false,
        error: '현재 브라우저 또는 환경에서 웹 푸시가 지원되지 않습니다. (iPhone의 경우 사파리 홈 화면에 추가 후 이용해주세요)',
      };
    }

    try {
      // 1. Request Browser Notification Permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return {
          success: false,
          error: '알림 권한이 거부되었습니다. 브라우저 설정에서 알림을 허용해주세요.',
        };
      }

      // 2. Register Service Worker explicitly
      let swRegistration: ServiceWorkerRegistration | undefined;
      if ('serviceWorker' in navigator) {
        try {
          swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
          await navigator.serviceWorker.ready;
          console.log('[FcmPushService] ServiceWorker registered with scope:', swRegistration.scope);
        } catch (swErr) {
          console.warn('[FcmPushService] ServiceWorker registration warning:', swErr);
        }
      }

      // 3. Obtain Firebase Messaging instance
      const messaging = await this.getMessagingInstance();
      if (!messaging) {
        return { success: false, error: 'Firebase Messaging 인스턴스를 초기화할 수 없습니다.' };
      }

      // 4. Retrieve FCM Token
      const token = await getToken(messaging, {
        serviceWorkerRegistration: swRegistration,
      });

      if (!token) {
        return { success: false, error: 'FCM 토큰을 발급받지 못했습니다.' };
      }

      console.log('[FcmPushService] FCM Token obtained:', token.substring(0, 15) + '...');

      // 5. Register token on server for this UID
      const platform = this.getPlatform();
      const res = await fetch('/api/fcm/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          token,
          device: platform,
          userAgent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '서버 토큰 등록 실패');
      }

      // 6. Update master push setting on server
      await fetch('/api/fcm/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, pushEnabled: true }),
      });

      // 7. Store in localStorage
      localStorage.setItem('fcm_token', token);
      localStorage.setItem('fcm_uid', uid);
      localStorage.setItem('fcm_push_enabled', 'true');

      // 8. Attach foreground message listener
      this.listenToForegroundMessages();

      return { success: true, token };
    } catch (err: any) {
      console.error('[FcmPushService] enablePush error:', err);
      return { success: false, error: err.message || '푸시 등록 중 오류가 발생했습니다.' };
    }
  }

  /**
   * Disable push notifications for this user (Master toggle OFF)
   */
  public async disablePush(uid: string): Promise<{ success: boolean }> {
    try {
      localStorage.setItem('fcm_push_enabled', 'false');

      if (uid) {
        await fetch('/api/fcm/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid, pushEnabled: false }),
        });
      }

      return { success: true };
    } catch (err) {
      console.warn('[FcmPushService] disablePush error:', err);
      return { success: false };
    }
  }

  /**
   * Invalidate and delete FCM token upon logout
   * Strictly prevents previous account notifications from reaching this device.
   */
  public async invalidateOnLogout(uid?: string): Promise<void> {
    try {
      const cachedToken = localStorage.getItem('fcm_token');
      const targetUid = uid || localStorage.getItem('fcm_uid');

      // 1. Delete token from Firebase Messaging SDK
      if (this.messaging) {
        try {
          await deleteToken(this.messaging);
        } catch (e) {
          console.warn('[FcmPushService] deleteToken error:', e);
        }
      }

      // 2. Invalidate on server
      if (targetUid) {
        await fetch('/api/fcm/token/invalidate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: targetUid, token: cachedToken }),
        }).catch(() => {});
      }

      // 3. Clean up local storage
      localStorage.removeItem('fcm_token');
      localStorage.removeItem('fcm_uid');
      console.log('[FcmPushService] Token invalidated on logout for UID:', targetUid);
    } catch (err) {
      console.warn('[FcmPushService] Error during logout token invalidation:', err);
    }
  }

  /**
   * Trigger a test push notification to verify delivery
   */
  public async triggerTestPush(uid: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch('/api/fcm/test-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid }),
      });
      const data = await res.json();
      return {
        success: data.success,
        message: data.message || (data.success ? '테스트 푸시가 발송되었습니다.' : '푸시 발송 실패'),
      };
    } catch (err: any) {
      return { success: false, message: err.message || '네트워크 오류' };
    }
  }

  /**
   * Setup real-time foreground message receiver
   */
  public listenToForegroundMessages(onReceive?: (payload: any) => void) {
    if (this.onMessageUnsubscribe) return;

    this.getMessagingInstance().then((messaging) => {
      if (!messaging) return;

      this.onMessageUnsubscribe = onMessage(messaging, (payload) => {
        console.log('[FcmPushService] Foreground push received:', payload);

        // Show native notification if allowed
        if ('Notification' in window && Notification.permission === 'granted') {
          const title = payload.notification?.title || payload.data?.title || '병돌 인베스트먼트';
          const options: NotificationOptions = {
            body: payload.notification?.body || payload.data?.body || payload.data?.message || '실시간 알림이 도착했습니다.',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-192x192.png',
            tag: payload.data?.stockSymbol || 'byeongdol-alert',
          };
          try {
            new Notification(title, options);
          } catch {
            // Safari / mobile might throw on new Notification in foreground
          }
        }

        if (onReceive) {
          onReceive(payload);
        }
      });
    });
  }
}

export const fcmPushService = new FcmPushService();
