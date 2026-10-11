/**
 * Market Monitoring Engine Types
 * 
 * Target Detections:
 * 1. 급등 (PRICE_SURGE)
 * 2. 급락 (PRICE_PLUNGE)
 * 3. 거래량 급증 (VOLUME_SPIKE)
 * 4. 거래대금 급증 (TRADING_VALUE_SPIKE)
 * 5. 시장 급변 (MARKET_TURBULENCE)
 * 6. 사이드카 (SIDECAR)
 * 7. 서킷브레이커 (CIRCUIT_BREAKER)
 */

export type MarketEventType =
  | 'PRICE_SURGE'          // 1. 급등
  | 'PRICE_PLUNGE'         // 2. 급락
  | 'VOLUME_SPIKE'         // 3. 거래량 급증
  | 'TRADING_VALUE_SPIKE'  // 4. 거래대금 급증
  | 'MARKET_TURBULENCE'    // 5. 시장 급변
  | 'SIDECAR'              // 6. 사이드카
  | 'CIRCUIT_BREAKER';     // 7. 서킷브레이커

export type EventScope = 'MARKET' | 'STOCK';

export interface MarketMonitoringConfig {
  PRICE_RISE_ALERT_PERCENT: number;       // e.g. 5.0 (%)
  PRICE_FALL_ALERT_PERCENT: number;       // e.g. -5.0 (%)
  VOLUME_SPIKE_MULTIPLIER: number;        // e.g. 2.0 (배, 즉 200%)
  TRADING_VALUE_ALERT_THRESHOLD: number;  // e.g. 3000 (억 원)
  MARKET_INDEX_ALERT_PERCENT: number;     // e.g. 2.0 (%)
  SIDECAR_THRESHOLD_PERCENT: number;      // e.g. 5.0 (%)
  CIRCUIT_BREAKER_LV1_PERCENT: number;    // e.g. -8.0 (%)
  ALERT_COOLDOWN_MS: number;              // e.g. 180000 (3분)
  MONITORING_INTERVAL_MS: number;         // e.g. 5000 (5초)
  ENABLED: boolean;
}

export interface MarketAlertMetrics {
  currentValue: number;
  threshold: number;
  unit: string;
  changePercent?: number;
  volumeRatio?: number;
  tradingValue?: number;
  volume?: number;
  sidecarStatus?: string;
  market?: string;
  indexValue?: number;
}

export interface MarketAlertEvent {
  id: string;
  type: MarketEventType;
  scope: EventScope;
  title: string;
  description: string;
  symbol?: string;
  symbolName?: string;
  market?: 'KOSPI' | 'KOSDAQ' | 'US' | 'ALL';
  metrics: MarketAlertMetrics;
  severity: 'urgent' | 'warning' | 'info';
  timestamp: string;
  createdAt: number;
  aiExplanation?: string;
  isAiLoading?: boolean;
}
