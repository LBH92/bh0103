/**
 * Market Monitor Client Service
 * 
 * Communicates with backend monitoring engine:
 * - GET /api/market/monitoring/events
 * - GET /api/market/monitoring/config
 * - POST /api/market/monitoring/config
 * - POST /api/market/monitoring/explain/:id
 */

import { MarketAlertEvent, MarketMonitoringConfig, EventScope } from '../types/marketMonitor';

class MarketMonitorClient {
  async getConfig(): Promise<MarketMonitoringConfig> {
    try {
      const res = await fetch('/api/market/monitoring/config');
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('[MarketMonitorClient] getConfig failed:', err);
    }

    return {
      PRICE_RISE_ALERT_PERCENT: 5.0,
      PRICE_FALL_ALERT_PERCENT: -5.0,
      VOLUME_SPIKE_MULTIPLIER: 2.0,
      TRADING_VALUE_ALERT_THRESHOLD: 3000,
      MARKET_INDEX_ALERT_PERCENT: 2.0,
      SIDECAR_THRESHOLD_PERCENT: 5.0,
      CIRCUIT_BREAKER_LV1_PERCENT: -8.0,
      ALERT_COOLDOWN_MS: 180000,
      MONITORING_INTERVAL_MS: 4000,
      ENABLED: true,
    };
  }

  async updateConfig(newConfig: Partial<MarketMonitoringConfig>): Promise<MarketMonitoringConfig> {
    const res = await fetch('/api/market/monitoring/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    });

    if (!res.ok) {
      throw new Error('설정 저장에 실패했습니다.');
    }

    return await res.json();
  }

  async getEvents(scope?: EventScope): Promise<MarketAlertEvent[]> {
    try {
      const url = scope ? `/api/market/monitoring/events?scope=${scope}` : '/api/market/monitoring/events';
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
    } catch (err) {
      console.warn('[MarketMonitorClient] getEvents failed:', err);
    }
    return [];
  }

  async explainEvent(eventId: string, uid?: string, userRole?: string): Promise<string> {
    const headers: Record<string, string> = {};
    if (uid) headers['x-user-uid'] = uid;
    if (userRole) headers['x-admin-role'] = userRole;

    const res = await fetch(`/api/market/monitoring/explain/${eventId}`, {
      method: 'POST',
      headers,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err.error === 'AI_NOT_CONNECTED') {
        throw new Error(err.message || '시장 이벤트 AI 해설은 개인 Gemini AI 계정 연결 후 이용할 수 있습니다.');
      }
      throw new Error(err.error || 'AI 해설 생성에 실패했습니다.');
    }

    const data = await res.json();
    return data.explanation;
  }

  async triggerTestEvent(eventData?: any): Promise<MarketAlertEvent> {
    const res = await fetch('/api/market/monitoring/trigger-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventData || {}),
    });

    return await res.json();
  }
}

export const marketMonitorClient = new MarketMonitorClient();
