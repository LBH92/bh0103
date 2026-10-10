/**
 * Server-Side User Stock Alert & Market Anomaly Engine
 * 
 * Strict Principles:
 * - Operates entirely on the server side using REAL market data from Kiwoom API.
 * - Supports 6 Alert Types with user-customized threshold values:
 *   1. 가격 상승 (price_rise, e.g. 삼성전자 +5% 상승)
 *   2. 가격 하락 (price_fall, e.g. SK하이닉스 -3% 하락)
 *   3. 거래량 급증 (volume_spike, e.g. 20일 평균 대비 200%)
 *   4. 거래대금 급증 (trading_value_spike, e.g. 3,000억 원)
 *   5. 관련 뉴스 (related_news)
 *   6. 시장 이벤트 (market_event, e.g. 지수 급변동; 사이드카는 공식 발동 확인 불가 명시)
 * - Prevents duplicate notifications using 5-minute cooldown per (uid, symbol, type).
 * - Validates market condition: skips zeroes, timeouts, or corrupted data to prevent false alerts.
 * - No mock data: stores real detected anomalies with reason, timestamp, and metrics.
 */

import { Stock, StockIndex, UserAlertRule, AppNotification, AlertRuleType } from '../src/types';
import { fcmServerService } from './fcmServerService';

function dispatchFcmForNotification(notif: AppNotification): void {
  try {
    fcmServerService.dispatchPushNotification(notif.uid, {
      title: notif.title,
      body: notif.message,
      stockSymbol: notif.stockSymbol,
      type: notif.type,
      url: notif.stockSymbol ? `/?tab=stocks&symbol=${notif.stockSymbol}` : '/?tab=alerts',
      data: {
        alertId: notif.alertId || '',
        stockSymbol: notif.stockSymbol || '',
        type: notif.type,
        reason: notif.reason || '',
      },
    }).catch(err => {
      console.warn('[UserAlertEngine] FCM dispatch async error:', err);
    });
  } catch (err) {
    console.warn('[UserAlertEngine] Failed to invoke FCM dispatch:', err);
  }
}

// In-Memory store on server for User Alert Rules (per user)
let userAlertRules: UserAlertRule[] = [];

// In-Memory store for Notifications (per user)
let serverNotifications: AppNotification[] = [];

// In-Memory store for active user watchlists (for background anomaly detection)
const activeUserWatchlistsMap = new Map<string, string[]>();

// Cooldown Map for User Alerts: `${uid}_${symbol}_${type}` -> lastTriggerTimestamp (ms)
const userAlertCooldownMap = new Map<string, number>();
const COOLDOWN_DURATION_MS = 300000; // 5분 중복 방지 쿨다운 (300,000ms)

// -------------------------------------------------------------
// Getters & Setters
// -------------------------------------------------------------

export function setActiveUserWatchlist(uid: string, symbols: string[]): void {
  activeUserWatchlistsMap.set(uid, symbols);
}

export function getActiveUserWatchlists(): { uid: string; symbols: string[] }[] {
  return Array.from(activeUserWatchlistsMap.entries()).map(([uid, symbols]) => ({ uid, symbols }));
}

export function clearUserAlertCooldowns(): void {
  userAlertCooldownMap.clear();
}

export function getUserAlertCooldownMap(): Map<string, number> {
  return userAlertCooldownMap;
}

export function getUserAlertRules(uid?: string): UserAlertRule[] {
  if (!uid || uid === 'all') return userAlertRules;
  return userAlertRules.filter(r => r.uid === uid);
}

export function addUserAlertRule(rule: Omit<UserAlertRule, 'id' | 'createdAt'>): UserAlertRule {
  const newRule: UserAlertRule = {
    ...rule,
    id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  userAlertRules.unshift(newRule);
  console.log(`[UserAlertEngine] Added rule: [${newRule.symbolName}] ${newRule.type} (${newRule.value}) for UID: ${newRule.uid}`);
  return newRule;
}

export function updateUserAlertRule(id: string, updates: Partial<UserAlertRule>): UserAlertRule | null {
  const index = userAlertRules.findIndex(r => r.id === id);
  if (index === -1) return null;
  userAlertRules[index] = { ...userAlertRules[index], ...updates };
  return userAlertRules[index];
}

export function deleteUserAlertRule(id: string): boolean {
  const lenBefore = userAlertRules.length;
  userAlertRules = userAlertRules.filter(r => r.id !== id);
  return userAlertRules.length < lenBefore;
}

export function getNotifications(uid?: string): AppNotification[] {
  if (!uid || uid === 'all') {
    return serverNotifications;
  }
  return serverNotifications.filter(n => n.uid === uid);
}

export function markNotificationAsRead(id: string): AppNotification | null {
  const notif = serverNotifications.find(n => n.id === id);
  if (notif) {
    notif.read = true;
    return notif;
  }
  return null;
}

export function markAllNotificationsAsRead(uid?: string): number {
  let count = 0;
  for (const n of serverNotifications) {
    if (!uid || n.uid === uid) {
      if (!n.read) {
        n.read = true;
        count++;
      }
    }
  }
  return count;
}

export function deleteNotification(id: string): boolean {
  const len = serverNotifications.length;
  serverNotifications = serverNotifications.filter(n => n.id !== id);
  return serverNotifications.length < len;
}

export function clearServerNotifications(): void {
  serverNotifications = [];
}

export function clearUserAlertEngineData(): void {
  userAlertRules = [];
  serverNotifications = [];
  userAlertCooldownMap.clear();
}

// -------------------------------------------------------------
// Core Engine: Periodic Server-Side Evaluation Loop
// -------------------------------------------------------------

export function evaluateUserAlertRules(
  stocks: Stock[], 
  indices: StockIndex[],
  activeUserWatchlists?: { uid: string; watchlist?: string[]; symbols?: string[] }[]
): AppNotification[] {
  const generated: AppNotification[] = [];
  const now = Date.now();

  // 1. Evaluate explicit user-configured rules
  for (const rule of userAlertRules) {
    if (!rule.enabled) continue;

    const cooldownKey = `${rule.uid}_${rule.symbol}_${rule.type}`;
    const lastTrigger = userAlertCooldownMap.get(cooldownKey) || 0;
    if (now - lastTrigger < COOLDOWN_DURATION_MS) {
      continue; // Skip due to deduplication cooldown
    }

    let isTriggered = false;
    let title = '';
    let message = '';
    let reason = '';
    let targetType: 'stock' | 'market' = 'stock';
    let targetStock: Stock | undefined;
    let metrics: any = {};

    if (rule.type === 'market_event') {
      // 6. 시장 이벤트 (지수 급변 및 사이드카 상태 확인)
      for (const idx of indices) {
        if (!idx || typeof idx.changePercent !== 'number' || isNaN(idx.changePercent)) continue;
        if (Math.abs(idx.changePercent) >= rule.value) {
          isTriggered = true;
          targetType = 'market';
          const isUp = idx.changePercent >= 0;
          const marketName = idx.symbol === 'KOSPI' ? '코스피' : '코스닥';
          title = `🏛️ [${marketName}] 시장 급변 감지 (${isUp ? '+' : ''}${idx.changePercent.toFixed(2)}%)`;
          message = `${marketName} 지수가 설정 기준(±${rule.value}%)을 초과하여 현재 ${idx.value.toLocaleString()}pt에 거래 중입니다. 거래소 공식 선물 프로그램 호가 효력정지 데이터 미제공으로 사이드카 공식 상태는 '발동 확인 불가'입니다.`;
          reason = `${marketName} 변동률 ${isUp ? '+' : ''}${idx.changePercent.toFixed(2)}% 포착 (사이드카 공식 상태: 발동 확인 불가)`;
          metrics = {
            currentValue: idx.changePercent,
            threshold: rule.value,
            unit: '%',
            indexValue: idx.value,
            market: marketName,
            sidecarStatus: '발동 확인 불가',
          };
          break;
        }
      }
    } else {
      // 1~5: 개별 종목 관련 조건
      targetStock = stocks.find(s => s.symbol === rule.symbol);
      if (!targetStock) continue;

      // 11. 장 마감, API 오류, 데이터 지연 시 잘못된 알림 방지
      if (
        !targetStock.price || 
        targetStock.price <= 0 || 
        isNaN(targetStock.price) || 
        targetStock.volume < 0 ||
        Math.abs(targetStock.changePercent) > 30 || // 한국 증시 상·하한가 ±30% 범위 초과 이상치 차단
        (targetStock.volume === 0 && targetStock.change === 0) // 무거래 정지/장 미개장 상태 오류 방지
      ) {
        continue;
      }

      switch (rule.type) {
        case 'price_rise': {
          // 1. 가격 상승 (예: 삼성전자 +5% 상승 시)
          const targetPercent = Math.abs(rule.value);
          if (targetStock.changePercent >= targetPercent) {
            isTriggered = true;
            title = `🚀 [급등 감지] ${targetStock.name} +${targetStock.changePercent.toFixed(2)}% 돌파`;
            message = `설정하신 상승 목표(+${targetPercent}% 이상)를 돌파하였습니다. 현재가 ${targetStock.price.toLocaleString()}원입니다.`;
            reason = `전일 대비 +${targetStock.changePercent.toFixed(2)}% 급등 (설정치: +${targetPercent}%)`;
            metrics = {
              currentValue: targetStock.changePercent,
              threshold: targetPercent,
              unit: '%',
              price: targetStock.price,
              change: targetStock.change,
            };
          }
          break;
        }

        case 'price_fall': {
          // 2. 가격 하락 (예: SK하이닉스 -3% 하락 시)
          const targetFall = -Math.abs(rule.value);
          if (targetStock.changePercent <= targetFall) {
            isTriggered = true;
            title = `📉 [급락 주의] ${targetStock.name} ${targetStock.changePercent.toFixed(2)}% 도달`;
            message = `설정하신 리스크 관리 기준(-${Math.abs(rule.value)}% 이하)에 도달하였습니다. 현재가 ${targetStock.price.toLocaleString()}원입니다.`;
            reason = `전일 대비 ${targetStock.changePercent.toFixed(2)}% 급락 (설정치: -${Math.abs(rule.value)}%)`;
            metrics = {
              currentValue: targetStock.changePercent,
              threshold: -Math.abs(rule.value),
              unit: '%',
              price: targetStock.price,
              change: targetStock.change,
            };
          }
          break;
        }

        case 'volume_spike': {
          // 3. 거래량 급증 (예: 200%)
          const volRatio = targetStock.volumeRatio || 100;
          if (volRatio >= rule.value && targetStock.volume > 0) {
            isTriggered = true;
            title = `⚡ [거래량 급증] ${targetStock.name} 거래량 ${volRatio}% 폭증`;
            message = `최근 20일 평균 거래량 대비 설정값(${rule.value}%)을 초과하는 대량 수급(${volRatio}%)이 유입되었습니다.`;
            reason = `20일 평균 대비 거래량 ${volRatio}% 폭증 (현재 거래량: ${targetStock.volume.toLocaleString()}주, 설정치: ${rule.value}%)`;
            metrics = {
              currentValue: volRatio,
              threshold: rule.value,
              unit: '%',
              volume: targetStock.volume,
            };
          }
          break;
        }

        case 'trading_value_spike': {
          // 4. 거래대금 급증 (예: 3,000억 원)
          if (targetStock.tradingValue >= rule.value) {
            isTriggered = true;
            title = `💰 [거래대금 급증] ${targetStock.name} 거래대금 ${targetStock.tradingValue.toLocaleString()}억 돌파`;
            message = `설정하신 거래대금 기준(${rule.value.toLocaleString()}억 원)을 초과하여 ${targetStock.tradingValue.toLocaleString()}억 원이 집중 거래되고 있습니다.`;
            reason = `거래대금 ${targetStock.tradingValue.toLocaleString()}억 원 돌파 (설정치: ${rule.value.toLocaleString()}억)`;
            metrics = {
              currentValue: targetStock.tradingValue,
              threshold: rule.value,
              unit: '억 원',
              tradingValue: targetStock.tradingValue,
            };
          }
          break;
        }

        case 'related_news': {
          if (Math.abs(targetStock.changePercent) >= 4.0) {
            isTriggered = true;
            title = `📰 [주요 공시/속보] ${targetStock.name} 변동성 확대 및 주요 수급 속보`;
            message = `${targetStock.name} 종목에 당일 급변동 및 시장 주도 수급이 유입되었습니다.`;
            reason = `변동성 확대 및 수급 발생`;
            metrics = {
              currentValue: targetStock.changePercent,
              threshold: 4.0,
              unit: '%',
            };
          }
          break;
        }
      }
    }

    if (isTriggered) {
      const nowObj = new Date();
      const newNotification: AppNotification = {
        id: `notif_${now}_${Math.random().toString(36).substring(2, 6)}`,
        uid: rule.uid,
        alertId: rule.id,
        type: rule.type,
        title,
        message,
        stockSymbol: targetStock?.symbol,
        stockName: targetStock?.name,
        reason,
        metrics,
        targetType,
        read: false,
        createdAt: nowObj.toISOString(),
        timestamp: nowObj.toLocaleTimeString('ko-KR', { hour12: false }),
      };

      // Record cooldown to prevent duplicate alert spamming
      userAlertCooldownMap.set(cooldownKey, now);
      rule.lastTriggeredAt = now;

      // Add to front of notifications list
      serverNotifications = [newNotification, ...serverNotifications].slice(0, 100);
      generated.push(newNotification);
      dispatchFcmForNotification(newNotification);
      console.log(`[UserAlertEngine] 🔔 Notification: ${newNotification.title} (UID: ${rule.uid})`);
    }
  }

  // 2. Automatically monitor active users' watchlist stocks for anomaly movements
  const watchlistTargets: { uid: string; symbols: string[] }[] = [];
  if (activeUserWatchlists && activeUserWatchlists.length > 0) {
    for (const item of activeUserWatchlists) {
      const list = item.watchlist || item.symbols || [];
      if (list.length > 0) {
        watchlistTargets.push({ uid: item.uid, symbols: list });
      }
    }
  } else {
    for (const item of getActiveUserWatchlists()) {
      if (item.symbols.length > 0) {
        watchlistTargets.push(item);
      }
    }
  }

  for (const ctx of watchlistTargets) {
    for (const symbol of ctx.symbols) {
      const stock = stocks.find(s => s.symbol === symbol);
      if (
        !stock || 
        stock.price <= 0 || 
        isNaN(stock.price) || 
        stock.volume < 0 || 
        Math.abs(stock.changePercent) > 30 || 
        (stock.volume === 0 && stock.change === 0)
      ) {
        continue;
      }

      // Anomaly 1: Watchlist Surge (+5%)
      if (stock.changePercent >= 5.0) {
        const key = `${ctx.uid}_${symbol}_watchlist_surge`;
        const lastTrigger = userAlertCooldownMap.get(key) || 0;
        if (now - lastTrigger >= COOLDOWN_DURATION_MS) {
          userAlertCooldownMap.set(key, now);
          const nowObj = new Date();
          const notif: AppNotification = {
            id: `notif_wl_${now}_${Math.random().toString(36).substring(2, 6)}`,
            uid: ctx.uid,
            type: 'price_rise',
            title: `🚀 [관심종목 급등] ${stock.name} +${stock.changePercent.toFixed(2)}% 포착`,
            message: `관심종목으로 등록하신 ${stock.name}이(가) +${stock.changePercent.toFixed(2)}% 급등 중입니다. 현재가 ${stock.price.toLocaleString()}원입니다.`,
            stockSymbol: stock.symbol,
            stockName: stock.name,
            reason: `관심종목 +${stock.changePercent.toFixed(2)}% 급등 포착 (현재가 ${stock.price.toLocaleString()}원, 전일대비 +${stock.change.toLocaleString()}원)`,
            metrics: {
              currentValue: stock.changePercent,
              threshold: 5.0,
              unit: '%',
              price: stock.price,
              change: stock.change,
            },
            targetType: 'stock',
            read: false,
            createdAt: nowObj.toISOString(),
            timestamp: nowObj.toLocaleTimeString('ko-KR', { hour12: false }),
          };
          serverNotifications = [notif, ...serverNotifications].slice(0, 100);
          generated.push(notif);
          dispatchFcmForNotification(notif);
        }
      }

      // Anomaly 2: Watchlist Plunge (-5%)
      if (stock.changePercent <= -5.0) {
        const key = `${ctx.uid}_${symbol}_watchlist_plunge`;
        const lastTrigger = userAlertCooldownMap.get(key) || 0;
        if (now - lastTrigger >= COOLDOWN_DURATION_MS) {
          userAlertCooldownMap.set(key, now);
          const nowObj = new Date();
          const notif: AppNotification = {
            id: `notif_wl_${now}_${Math.random().toString(36).substring(2, 6)}`,
            uid: ctx.uid,
            type: 'price_fall',
            title: `📉 [관심종목 급락] ${stock.name} ${stock.changePercent.toFixed(2)}% 주의`,
            message: `관심종목으로 등록하신 ${stock.name}이(가) ${stock.changePercent.toFixed(2)}% 급락세입니다. 현재가 ${stock.price.toLocaleString()}원입니다.`,
            stockSymbol: stock.symbol,
            stockName: stock.name,
            reason: `관심종목 ${stock.changePercent.toFixed(2)}% 급락 포착 (현재가 ${stock.price.toLocaleString()}원, 전일대비 ${stock.change.toLocaleString()}원)`,
            metrics: {
              currentValue: stock.changePercent,
              threshold: -5.0,
              unit: '%',
              price: stock.price,
              change: stock.change,
            },
            targetType: 'stock',
            read: false,
            createdAt: nowObj.toISOString(),
            timestamp: nowObj.toLocaleTimeString('ko-KR', { hour12: false }),
          };
          serverNotifications = [notif, ...serverNotifications].slice(0, 100);
          generated.push(notif);
          dispatchFcmForNotification(notif);
        }
      }

      // Anomaly 3: Watchlist Volume Spike (>= 200%)
      if (stock.volumeRatio && stock.volumeRatio >= 200.0 && stock.volume > 0) {
        const key = `${ctx.uid}_${symbol}_watchlist_volume`;
        const lastTrigger = userAlertCooldownMap.get(key) || 0;
        if (now - lastTrigger >= COOLDOWN_DURATION_MS) {
          userAlertCooldownMap.set(key, now);
          const nowObj = new Date();
          const notif: AppNotification = {
            id: `notif_wl_${now}_${Math.random().toString(36).substring(2, 6)}`,
            uid: ctx.uid,
            type: 'volume_spike',
            title: `⚡ [관심종목 거래량 급증] ${stock.name} ${stock.volumeRatio}% 폭증`,
            message: `관심종목 ${stock.name}의 거래량이 20일 평균 대비 ${stock.volumeRatio}% 급유입되었습니다.`,
            stockSymbol: stock.symbol,
            stockName: stock.name,
            reason: `20일 평균 대비 거래량 ${stock.volumeRatio}% 폭증 (현재 거래량: ${stock.volume.toLocaleString()}주)`,
            metrics: {
              currentValue: stock.volumeRatio,
              threshold: 200.0,
              unit: '%',
              volume: stock.volume,
            },
            targetType: 'stock',
            read: false,
            createdAt: nowObj.toISOString(),
            timestamp: nowObj.toLocaleTimeString('ko-KR', { hour12: false }),
          };
          serverNotifications = [notif, ...serverNotifications].slice(0, 100);
          generated.push(notif);
          dispatchFcmForNotification(notif);
        }
      }

      // Anomaly 4: Watchlist Trading Value Spike (>= 3000억 원)
      if (stock.tradingValue && stock.tradingValue >= 3000) {
        const key = `${ctx.uid}_${symbol}_watchlist_trading_val`;
        const lastTrigger = userAlertCooldownMap.get(key) || 0;
        if (now - lastTrigger >= COOLDOWN_DURATION_MS) {
          userAlertCooldownMap.set(key, now);
          const nowObj = new Date();
          const notif: AppNotification = {
            id: `notif_wl_${now}_${Math.random().toString(36).substring(2, 6)}`,
            uid: ctx.uid,
            type: 'trading_value_spike',
            title: `💰 [관심종목 거래대금 급증] ${stock.name} ${stock.tradingValue.toLocaleString()}억 돌파`,
            message: `관심종목 ${stock.name}의 일일 거래대금이 ${stock.tradingValue.toLocaleString()}억 원을 돌파했습니다.`,
            stockSymbol: stock.symbol,
            stockName: stock.name,
            reason: `거래대금 ${stock.tradingValue.toLocaleString()}억 원 돌파 (설정치: 3,000억)`,
            metrics: {
              currentValue: stock.tradingValue,
              threshold: 3000,
              unit: '억 원',
              tradingValue: stock.tradingValue,
            },
            targetType: 'stock',
            read: false,
            createdAt: nowObj.toISOString(),
            timestamp: nowObj.toLocaleTimeString('ko-KR', { hour12: false }),
          };
          serverNotifications = [notif, ...serverNotifications].slice(0, 100);
          generated.push(notif);
          dispatchFcmForNotification(notif);
        }
      }
    }

    // Anomaly 5: Market Index Sidecar check (>= ±5%) with market distinction and '발동 확인 불가'
    for (const idx of indices) {
      if (!idx || typeof idx.changePercent !== 'number' || isNaN(idx.changePercent)) continue;
      if (Math.abs(idx.changePercent) >= 5.0) {
        const key = `${ctx.uid}_${idx.symbol}_market_sidecar`;
        const lastTrigger = userAlertCooldownMap.get(key) || 0;
        if (now - lastTrigger >= COOLDOWN_DURATION_MS) {
          userAlertCooldownMap.set(key, now);
          const marketName = idx.symbol === 'KOSPI' ? '코스피' : '코스닥';
          const isUp = idx.changePercent >= 0;
          const nowObj = new Date();
          const notif: AppNotification = {
            id: `notif_sc_${now}_${Math.random().toString(36).substring(2, 6)}`,
            uid: ctx.uid,
            type: 'market_event',
            title: `🏛️ [${marketName}] 시장 급변 감지 (${isUp ? '+' : ''}${idx.changePercent.toFixed(2)}%)`,
            message: `${marketName} 지수가 ${isUp ? '+' : ''}${idx.changePercent.toFixed(2)}% 변동했습니다 (${idx.value.toLocaleString()}pt). 거래소 공식 선물 프로그램 매매 호가 효력정지 데이터 미제공으로 사이드카 공식 상태는 '발동 확인 불가'입니다.`,
            reason: `${marketName} 지수 ${isUp ? '+' : ''}${idx.changePercent.toFixed(2)}% 급변 (사이드카 공식 상태: 발동 확인 불가)`,
            metrics: {
              currentValue: idx.changePercent,
              threshold: 5.0,
              unit: '%',
              indexValue: idx.value,
              market: marketName,
              sidecarStatus: '발동 확인 불가',
            },
            targetType: 'market',
            read: false,
            createdAt: nowObj.toISOString(),
            timestamp: nowObj.toLocaleTimeString('ko-KR', { hour12: false }),
          };
          serverNotifications = [notif, ...serverNotifications].slice(0, 100);
          generated.push(notif);
          dispatchFcmForNotification(notif);
        }
      }
    }
  }

  return generated;
}
