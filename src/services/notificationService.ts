/**
 * Client Notification & User Alert Service
 * 
 * Manages:
 * 1. User custom alert rules for watchlist/stocks (6 alert types with custom threshold values)
 * 2. Generated notifications (saved in notifications collection, read/unread states)
 * 3. Navigation targets upon clicking notification
 */

import { UserAlertRule, AppNotification, AlertRuleType } from '../types';
import { db, auth } from './firebase';
import { 
  collection, 
  doc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit 
} from 'firebase/firestore';

class NotificationService {
  // -------------------------------------------------------------
  // User Alert Rules
  // -------------------------------------------------------------

  async getUserAlertRules(uid?: string): Promise<UserAlertRule[]> {
    try {
      const targetUid = uid || auth.currentUser?.uid || 'demo-user-1';
      const res = await fetch(`/api/user-alerts?uid=${targetUid}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('[NotificationService] Fetch user alerts failed, checking Firestore:', err);
    }

    // Firestore fallback
    try {
      if (auth.currentUser) {
        const q = query(collection(db, 'alerts'), where('uid', '==', auth.currentUser.uid));
        const snap = await getDocs(q);
        const rules: UserAlertRule[] = [];
        snap.forEach(d => {
          const data = d.data();
          rules.push({
            id: d.id,
            uid: data.uid,
            symbol: data.symbol,
            symbolName: data.symbolName || data.symbol,
            type: data.type as AlertRuleType,
            value: data.value,
            condition: data.condition,
            enabled: data.enabled ?? true,
            createdAt: data.createdAt,
          });
        });
        if (rules.length > 0) return rules;
      }
    } catch {}

    return [];
  }

  async addUserAlertRule(rule: Omit<UserAlertRule, 'id' | 'createdAt'>): Promise<UserAlertRule> {
    const targetUid = rule.uid || auth.currentUser?.uid || 'demo-user-1';
    const payload = { ...rule, uid: targetUid };

    // 1. Send to server backend engine
    let createdRule: UserAlertRule | null = null;
    try {
      const res = await fetch('/api/user-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        createdRule = await res.json();
      }
    } catch (err) {
      console.warn('[NotificationService] Post user alert rule failed:', err);
    }

    if (!createdRule) {
      createdRule = {
        ...payload,
        id: `rule_${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
    }

    // 2. Also sync to Firestore 'alerts' collection if signed in
    try {
      if (auth.currentUser) {
        const alertDocRef = doc(collection(db, 'alerts'), createdRule.id);
        await setDoc(alertDocRef, {
          id: createdRule.id,
          uid: auth.currentUser.uid,
          symbol: createdRule.symbol,
          symbolName: createdRule.symbolName,
          type: createdRule.type,
          value: createdRule.value,
          condition: createdRule.condition || 'above',
          enabled: createdRule.enabled,
          createdAt: createdRule.createdAt,
        });
      }
    } catch (err) {
      console.warn('[NotificationService] Firestore sync alert failed:', err);
    }

    return createdRule;
  }

  async updateUserAlertRule(id: string, updates: Partial<UserAlertRule>): Promise<UserAlertRule | null> {
    try {
      const res = await fetch(`/api/user-alerts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('[NotificationService] Update alert rule failed:', err);
    }

    try {
      if (auth.currentUser) {
        const ref = doc(db, 'alerts', id);
        await updateDoc(ref, updates as any);
      }
    } catch {}

    return null;
  }

  async deleteUserAlertRule(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/user-alerts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const data = await res.json();
        return data.success;
      }
    } catch (err) {
      console.warn('[NotificationService] Delete alert rule failed:', err);
    }

    try {
      if (auth.currentUser) {
        await deleteDoc(doc(db, 'alerts', id));
        return true;
      }
    } catch {}

    return false;
  }

  // -------------------------------------------------------------
  // Notifications (notifications collection)
  // -------------------------------------------------------------

  async getNotifications(uid?: string): Promise<AppNotification[]> {
    const targetUid = uid || auth.currentUser?.uid || 'demo-user-1';

    try {
      const res = await fetch(`/api/notifications?uid=${targetUid}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('[NotificationService] Fetch notifications failed:', err);
    }

    // Firestore fallback for notifications collection
    try {
      if (auth.currentUser) {
        const q = query(
          collection(db, 'notifications'),
          where('uid', '==', auth.currentUser.uid),
          orderBy('createdAt', 'desc'),
          limit(40)
        );
        const snap = await getDocs(q);
        const notifs: AppNotification[] = [];
        snap.forEach(d => {
          const data = d.data();
          notifs.push({
            id: d.id,
            uid: data.uid,
            alertId: data.alertId,
            type: data.type,
            title: data.title,
            message: data.message,
            stockSymbol: data.stockSymbol,
            stockName: data.stockName,
            targetType: data.targetType || 'stock',
            read: data.read ?? false,
            createdAt: data.createdAt,
            timestamp: new Date(data.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
          });
        });
        if (notifs.length > 0) return notifs;
      }
    } catch {}

    return [];
  }

  async markAsRead(id: string): Promise<AppNotification | null> {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      let updated: AppNotification | null = null;
      if (res.ok) {
        updated = await res.json();
      }
      // Also sync to Firestore
      try {
        const ref = doc(db, 'notifications', id);
        await updateDoc(ref, { 
          read: true, 
          readAt: new Date().toISOString() 
        });
      } catch {}
      return updated;
    } catch (err) {
      console.warn('[NotificationService] Mark read failed:', err);
    }
    return null;
  }

  async markAllAsRead(uid?: string): Promise<number> {
    const targetUid = uid || auth.currentUser?.uid || 'demo-user-1';
    let count = 0;
    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: targetUid }),
      });
      if (res.ok) {
        const data = await res.json();
        count = data.count || 0;
      }
    } catch (err) {
      console.warn('[NotificationService] Mark all read failed:', err);
    }

    // Sync all unread in Firestore
    try {
      const q = query(
        collection(db, 'notifications'),
        where('uid', '==', targetUid),
        where('read', '==', false)
      );
      const snap = await getDocs(q);
      const batchPromises = snap.docs.map(d => 
        updateDoc(d.ref, { read: true, readAt: new Date().toISOString() }).catch(() => {})
      );
      await Promise.all(batchPromises);
    } catch {}

    return count;
  }

  async deleteNotification(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
      let success = false;
      if (res.ok) {
        const data = await res.json();
        success = data.success;
      }
      try {
        await deleteDoc(doc(db, 'notifications', id));
      } catch {}
      return success;
    } catch (err) {
      console.warn('[NotificationService] Delete notification failed:', err);
    }
    return false;
  }

  async syncWatchlistForMonitoring(uid?: string, watchlist?: string[]): Promise<void> {
    const targetUid = uid || auth.currentUser?.uid || 'demo-user-1';
    if (!watchlist || watchlist.length === 0) return;
    try {
      await fetch('/api/user-alerts/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: targetUid, watchlist }),
      });
    } catch (err) {
      console.warn('[NotificationService] Sync watchlist failed:', err);
    }
  }

  async triggerServerCheck(uid?: string, watchlist?: string[]): Promise<any> {
    const targetUid = uid || auth.currentUser?.uid || 'demo-user-1';
    try {
      const res = await fetch('/api/user-alerts/check-now', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: targetUid, watchlist }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('[NotificationService] triggerServerCheck failed:', err);
    }
    return null;
  }
}

export const notificationService = new NotificationService();
