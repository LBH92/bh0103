/**
 * Server-Side Market Monitoring Service
 * 
 * Strict Principle:
 * - Mathematical calculations and threshold checking are performed directly by the server (NOT Gemini).
 * - Gemini is used subsequently to explain or summarize detected events upon request.
 * - Prevents duplicate alerts via cooldown mapping.
 * - Separates MARKET-wide events from individual STOCK events.
 */

import { GoogleGenAI } from '@google/genai';
import { MarketAlertEvent, MarketMonitoringConfig, MarketEventType, EventScope } from '../src/types/marketMonitor';
import { Stock, StockIndex } from '../src/types';

// Default Configurable Settings (can be updated at runtime or via environment variables)
export let monitoringConfig: MarketMonitoringConfig = {
  PRICE_RISE_ALERT_PERCENT: Number(process.env.PRICE_RISE_ALERT_PERCENT) || 5.0,        // 급등: +5% 이상
  PRICE_FALL_ALERT_PERCENT: Number(process.env.PRICE_FALL_ALERT_PERCENT) || -5.0,       // 급락: -5% 이하
  VOLUME_SPIKE_MULTIPLIER: Number(process.env.VOLUME_SPIKE_MULTIPLIER) || 2.0,          // 거래량 급증: 평균 대비 200% 이상 (2.0배)
  TRADING_VALUE_ALERT_THRESHOLD: Number(process.env.TRADING_VALUE_ALERT_THRESHOLD) || 3000, // 거래대금 급증: 3,000억 원 이상
  MARKET_INDEX_ALERT_PERCENT: Number(process.env.MARKET_INDEX_ALERT_PERCENT) || 2.0,     // 시장 급변: 지수 ±2% 이상
  SIDECAR_THRESHOLD_PERCENT: Number(process.env.SIDECAR_THRESHOLD_PERCENT) || 5.0,       // 사이드카: 지수 ±5% 이상
  CIRCUIT_BREAKER_LV1_PERCENT: Number(process.env.CIRCUIT_BREAKER_LV1_PERCENT) || -8.0,  // 서킷브레이커: 지수 -8% 이하
  ALERT_COOLDOWN_MS: Number(process.env.ALERT_COOLDOWN_MS) || 180000,                   // 중복 방지 쿨다운: 3분 (180,000ms)
  MONITORING_INTERVAL_MS: 4000,                                                          // 감지 주기: 4초
  ENABLED: true,
};

// Cooldown tracking map: key -> last alert timestamp (ms)
const cooldownMap = new Map<string, number>();

// In-Memory Ring Buffer for Market Alert Events (kept on server)
let recentAlertEvents: MarketAlertEvent[] = [];

// Gemini Client initialization for explanation service
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const genAI = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;

export function getMonitoringConfig(): MarketMonitoringConfig {
  return { ...monitoringConfig };
}

export function updateMonitoringConfig(newConfig: Partial<MarketMonitoringConfig>): MarketMonitoringConfig {
  monitoringConfig = {
    ...monitoringConfig,
    ...newConfig,
  };
  console.log('[MarketMonitor] Config updated:', monitoringConfig);
  return { ...monitoringConfig };
}

export function getRecentAlertEvents(scope?: EventScope, limit: number = 30): MarketAlertEvent[] {
  let list = recentAlertEvents;
  if (scope) {
    list = list.filter(e => e.scope === scope);
  }
  return list.slice(0, limit);
}

/**
 * Check Cooldown to prevent duplicate spamming for same stock/market + event type
 */
function isUnderCooldown(key: string, cooldownMs: number): boolean {
  const lastTime = cooldownMap.get(key);
  if (!lastTime) return false;
  return Date.now() - lastTime < cooldownMs;
}

function recordCooldown(key: string): void {
  cooldownMap.set(key, Date.now());
}

/**
 * Add an event to server history if cooldown passes
 */
export function pushAlertEvent(event: Omit<MarketAlertEvent, 'id' | 'createdAt' | 'timestamp'>): MarketAlertEvent | null {
  const cooldownKey = `${event.scope}_${event.symbol || event.market || 'KRX'}_${event.type}`;
  
  if (isUnderCooldown(cooldownKey, monitoringConfig.ALERT_COOLDOWN_MS)) {
    return null; // Suppressed by cooldown
  }

  const newEvent: MarketAlertEvent = {
    ...event,
    id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: Date.now(),
    timestamp: new Date().toLocaleTimeString('ko-KR', { hour12: false }),
  };

  recordCooldown(cooldownKey);
  recentAlertEvents = [newEvent, ...recentAlertEvents].slice(0, 60);
  
  console.log(`[MarketMonitor] 🚨 Alert Triggered: [${newEvent.scope}] [${newEvent.type}] ${newEvent.title}`);
  return newEvent;
}

/**
 * Periodic Checker: Evaluates real mathematical criteria on stocks and indices
 */
export function evaluateMarketData(stocks: Stock[], indices: StockIndex[]): MarketAlertEvent[] {
  if (!monitoringConfig.ENABLED) return [];
  const triggered: MarketAlertEvent[] = [];

  // ==========================================
  // A. 개별 종목 감지 (EventScope: 'STOCK')
  // ==========================================
  for (const stock of stocks) {
    // 1. 급등 (PRICE_SURGE): 등락률 >= PRICE_RISE_ALERT_PERCENT
    if (stock.changePercent >= monitoringConfig.PRICE_RISE_ALERT_PERCENT) {
      const evt = pushAlertEvent({
        type: 'PRICE_SURGE',
        scope: 'STOCK',
        title: `${stock.name} 급등 발생 (+${stock.changePercent.toFixed(2)}%)`,
        description: `설정 기준(${monitoringConfig.PRICE_RISE_ALERT_PERCENT}% 이상)을 초과하여 현재가 ${stock.price.toLocaleString()}원에 거래 중입니다.`,
        symbol: stock.symbol,
        symbolName: stock.name,
        market: stock.market,
        severity: stock.changePercent >= 15 ? 'urgent' : 'warning',
        metrics: {
          currentValue: stock.changePercent,
          threshold: monitoringConfig.PRICE_RISE_ALERT_PERCENT,
          unit: '%',
          changePercent: stock.changePercent,
          volume: stock.volume,
          tradingValue: stock.tradingValue,
        },
      });
      if (evt) triggered.push(evt);
    }

    // 2. 급락 (PRICE_PLUNGE): 등락률 <= PRICE_FALL_ALERT_PERCENT
    if (stock.changePercent <= monitoringConfig.PRICE_FALL_ALERT_PERCENT) {
      const evt = pushAlertEvent({
        type: 'PRICE_PLUNGE',
        scope: 'STOCK',
        title: `${stock.name} 급락 경보 (${stock.changePercent.toFixed(2)}%)`,
        description: `설정 기준(${monitoringConfig.PRICE_FALL_ALERT_PERCENT}% 이하)에 도달하여 현재가 ${stock.price.toLocaleString()}원으로 급락세입니다.`,
        symbol: stock.symbol,
        symbolName: stock.name,
        market: stock.market,
        severity: stock.changePercent <= -10 ? 'urgent' : 'warning',
        metrics: {
          currentValue: stock.changePercent,
          threshold: monitoringConfig.PRICE_FALL_ALERT_PERCENT,
          unit: '%',
          changePercent: stock.changePercent,
          volume: stock.volume,
          tradingValue: stock.tradingValue,
        },
      });
      if (evt) triggered.push(evt);
    }

    // 3. 거래량 급증 (VOLUME_SPIKE): 현재 거래량 / 평균 거래량 >= VOLUME_SPIKE_MULTIPLIER
    // (stock.volumeRatio는 20일 평균 대비 백분율, 200% = 2.0배)
    const currentMultiplier = (stock.volumeRatio || 100) / 100;
    if (currentMultiplier >= monitoringConfig.VOLUME_SPIKE_MULTIPLIER) {
      const evt = pushAlertEvent({
        type: 'VOLUME_SPIKE',
        scope: 'STOCK',
        title: `${stock.name} 거래량 급증 (${stock.volumeRatio}% 폭증)`,
        description: `20일 평균 거래량 대비 ${currentMultiplier.toFixed(1)}배(기준 ${monitoringConfig.VOLUME_SPIKE_MULTIPLIER}배 이상)의 대량 수급이 유입되었습니다.`,
        symbol: stock.symbol,
        symbolName: stock.name,
        market: stock.market,
        severity: currentMultiplier >= 3.0 ? 'urgent' : 'info',
        metrics: {
          currentValue: stock.volumeRatio,
          threshold: monitoringConfig.VOLUME_SPIKE_MULTIPLIER * 100,
          unit: '%',
          volumeRatio: stock.volumeRatio,
          volume: stock.volume,
          tradingValue: stock.tradingValue,
        },
      });
      if (evt) triggered.push(evt);
    }

    // 4. 거래대금 급증 (TRADING_VALUE_SPIKE): 거래대금 >= TRADING_VALUE_ALERT_THRESHOLD
    if (stock.tradingValue >= monitoringConfig.TRADING_VALUE_ALERT_THRESHOLD) {
      const evt = pushAlertEvent({
        type: 'TRADING_VALUE_SPIKE',
        scope: 'STOCK',
        title: `${stock.name} 거래대금 폭증 (${stock.tradingValue.toLocaleString()}억 원)`,
        description: `기준 거래대금(${monitoringConfig.TRADING_VALUE_ALERT_THRESHOLD.toLocaleString()}억 원)을 돌파하며 시장 주도주로 자금이 집중되고 있습니다.`,
        symbol: stock.symbol,
        symbolName: stock.name,
        market: stock.market,
        severity: stock.tradingValue >= 10000 ? 'urgent' : 'info',
        metrics: {
          currentValue: stock.tradingValue,
          threshold: monitoringConfig.TRADING_VALUE_ALERT_THRESHOLD,
          unit: '억 원',
          tradingValue: stock.tradingValue,
          volume: stock.volume,
        },
      });
      if (evt) triggered.push(evt);
    }
  }

  // ==========================================
  // B. 시장 전체 이벤트 감지 (EventScope: 'MARKET')
  // ==========================================
  for (const idx of indices) {
    const marketName = idx.symbol === 'KOSPI' ? '코스피' : '코스닥';

    // 7. 서킷브레이커 (CIRCUIT_BREAKER): 지수 <= CIRCUIT_BREAKER_LV1_PERCENT (-8%)
    if (idx.changePercent <= monitoringConfig.CIRCUIT_BREAKER_LV1_PERCENT) {
      const evt = pushAlertEvent({
        type: 'CIRCUIT_BREAKER',
        scope: 'MARKET',
        title: `🚨 ${marketName} 서킷브레이커 1단계 발동 경보`,
        description: `${marketName} 지수가 전일 대비 ${idx.changePercent.toFixed(2)}% 폭락하여 시장 거래가 20분간 일시 중단됩니다.`,
        market: idx.symbol,
        severity: 'urgent',
        metrics: {
          currentValue: idx.changePercent,
          threshold: monitoringConfig.CIRCUIT_BREAKER_LV1_PERCENT,
          unit: '%',
          changePercent: idx.changePercent,
        },
      });
      if (evt) triggered.push(evt);
    }
    // 6. 사이드카 (SIDECAR): 지수 변동폭 절대값 >= SIDECAR_THRESHOLD_PERCENT (±5%)
    // 중요: 공식 선물 프로그램 호가 효력정지 데이터 미확인 시 '발동 확인 불가'로 명시
    else if (Math.abs(idx.changePercent) >= monitoringConfig.SIDECAR_THRESHOLD_PERCENT) {
      const isUp = idx.changePercent >= 0;
      const evt = pushAlertEvent({
        type: 'SIDECAR',
        scope: 'MARKET',
        title: `⚡ [${marketName}] 시장 급변 감지 (사이드카: 공식 발동 확인 불가)`,
        description: `${marketName} 지수가 ${isUp ? '+' : ''}${idx.changePercent.toFixed(2)}% 급변하였습니다. 거래소 공식 선물 프로그램 매매 호가 효력정지 데이터가 미제공되어 사이드카 공식 상태는 '발동 확인 불가'입니다.`,
        market: idx.symbol,
        severity: 'warning',
        metrics: {
          currentValue: idx.changePercent,
          threshold: monitoringConfig.SIDECAR_THRESHOLD_PERCENT,
          unit: '%',
          changePercent: idx.changePercent,
          sidecarStatus: '발동 확인 불가',
        },
      });
      if (evt) triggered.push(evt);
    }
    // 5. 시장 급변 (MARKET_TURBULENCE): 지수 변동폭 절대값 >= MARKET_INDEX_ALERT_PERCENT (±2%)
    else if (Math.abs(idx.changePercent) >= monitoringConfig.MARKET_INDEX_ALERT_PERCENT) {
      const isUp = idx.changePercent >= 0;
      const evt = pushAlertEvent({
        type: 'MARKET_TURBULENCE',
        scope: 'MARKET',
        title: `⚠️ ${marketName} 시장 급변동 감지 (${isUp ? '+' : ''}${idx.changePercent.toFixed(2)}%)`,
        description: `${marketName} 지수 변동성이 임계치(±${monitoringConfig.MARKET_INDEX_ALERT_PERCENT}%)를 초과하여 변동성이 확대되고 있습니다.`,
        market: idx.symbol,
        severity: 'warning',
        metrics: {
          currentValue: idx.changePercent,
          threshold: monitoringConfig.MARKET_INDEX_ALERT_PERCENT,
          unit: '%',
          changePercent: idx.changePercent,
        },
      });
      if (evt) triggered.push(evt);
    }
  }

  return triggered;
}

/**
 * Gemini Event Explainer Service
 * Uses Gemini API to explain or summarize the event after server numbers have been verified.
 * Strictly uses userGenAI if provided, or operator key only for admin.
 */
export async function explainMarketEventWithGemini(
  eventId: string,
  userGenAI?: { client: GoogleGenAI; model: string } | null,
  isAdmin: boolean = false
): Promise<string> {
  const event = recentAlertEvents.find(e => e.id === eventId);
  if (!event) {
    throw new Error('이벤트를 찾을 수 없습니다.');
  }

  if (event.aiExplanation) {
    return event.aiExplanation;
  }

  const prompt = `당신은 한국 주식시장 시황 수석 애널리스트입니다.
아래 시장 모니터링 시스템이 실시간 수치 계산을 통해 감지한 이벤트에 대해 투자자를 위한 명확하고 전문적인 해설 및 요약(2~3문장, 한국어)을 작성해주세요.

[감지 이벤트 정보]
- 분류: ${event.scope === 'MARKET' ? '시장 전체 조치' : '개별 종목 특이동향'} (${event.type})
- 제목: ${event.title}
- 대상: ${event.symbolName || event.market || '국내 증시'} ${event.symbol ? `(${event.symbol})` : ''}
- 세부 수치: 현재 수치 ${event.metrics.currentValue}${event.metrics.unit} (설정 임계값: ${event.metrics.threshold}${event.metrics.unit})
${event.metrics.volumeRatio ? `- 거래량 배율: ${event.metrics.volumeRatio}%` : ''}
${event.metrics.tradingValue ? `- 거래대금: ${event.metrics.tradingValue}억 원` : ''}

[작성 요구사항]
1. 해당 이벤트가 발생한 배경과 시장에 미치는 파급 효과를 전문적이면서도 쉽게 설명하세요.
2. 투자자가 취해야 할 리스크 관리 및 대응 팁을 포함하세요.
3. 2~3문장의 정갈한 문단 형태로 작성하세요.`;

  // Determine active client
  let activeGenAI: GoogleGenAI | null = null;
  let activeModel = 'gemini-3.8-flash';

  if (userGenAI?.client) {
    activeGenAI = userGenAI.client;
    activeModel = userGenAI.model || 'gemini-3.8-flash';
  } else if (isAdmin && genAI) {
    // Only verified admin may invoke operator internal key for system monitoring
    activeGenAI = genAI;
  } else {
    // Regular users without AI connection cannot invoke operator API
    throw new Error('AI_NOT_CONNECTED: 시장 이벤트 AI 해설 기능을 이용하려면 개인 Gemini AI 계정 연결이 필요합니다. 프로필 설정에서 개인 API 키를 등록해주세요.');
  }

  try {
    if (activeGenAI) {
      const response = await activeGenAI.models.generateContent({
        model: activeModel,
        contents: prompt,
      });

      const explanation = response.text?.trim() || generateFallbackExplanation(event);
      event.aiExplanation = explanation;
      return explanation;
    }
  } catch (err: any) {
    console.warn('[MarketMonitor] Gemini explanation failed:', err);
    throw new Error(`AI 해설 생성 중 오류가 발생했습니다: ${err.message || String(err)}`);
  }

  const fallback = generateFallbackExplanation(event);
  event.aiExplanation = fallback;
  return fallback;
}

function generateFallbackExplanation(event: MarketAlertEvent): string {
  if (event.type === 'PRICE_SURGE') {
    return `${event.symbolName || '해당 종목'}은(는) 강한 기관 및 외국인의 매수세와 호재성 수급이 유입되며 설정 기준(+${event.metrics.threshold}%)을 넘는 급등세를 기록 중입니다. 단기 과열 양상이 나타날 수 있으므로 분할 매도 및 지지선 확인 전략이 유효합니다.`;
  }
  if (event.type === 'PRICE_PLUNGE') {
    return `${event.symbolName || '해당 종목'}은(는) 차익 실현 매물 또는 하방 압력으로 인해 임계치(${event.metrics.threshold}%) 이하로 급락하고 있습니다. 저가 매수 시 바닥권 확인과 추가 변동성 확대를 방지하기 위한 손절 기준 점검이 필요합니다.`;
  }
  if (event.type === 'VOLUME_SPIKE') {
    return `평균 거래량 대비 ${event.metrics.currentValue}%에 달하는 폭발적 거래량이 실리며 주가 추세 전환의 중요한 변곡점을 형성하고 있습니다. 대량 거래를 수반한 주가 방향성이 향후 단기 모멘텀의 핵심 기준이 됩니다.`;
  }
  if (event.type === 'TRADING_VALUE_SPIKE') {
    return `당일 거래대금이 ${event.metrics.currentValue}억 원에 도달하며 시장 전반의 거래 대금이 집중되는 주도주 역할을 하고 있습니다. 시장의 관심도가 극대화된 상태이므로 장중 변동성에 유의하십시오.`;
  }
  if (event.type === 'SIDECAR') {
    return `선물 및 지수 변동폭이 임계치(±5%)를 초과하여 프로그램 매매 호가 효력이 일시 정지되었습니다. 파생상품 수급 충격을 완화하기 위한 시장 조치이므로 변동성 장세에 무리한 추격 매매는 자제해야 합니다.`;
  }
  if (event.type === 'CIRCUIT_BREAKER') {
    return `증시가 8% 이상 급락함에 따라 서킷브레이커 1단계가 발동되어 전 종목 매매가 일시 중단되었습니다. 시장 공포가 극대화된 국면이므로 냉정한 시장 분석과 현금 비중 점검이 권고됩니다.`;
  }
  return `${event.title}이(가) 감지되었습니다. 시장 변동성이 평소 대비 급증하고 있으므로 투자 지표 및 수급 현황을 면밀히 관찰하시기 바랍니다.`;
}

// Initial seed events for realistic instant visualization
export function seedInitialMarketEvents(): void {
  if (recentAlertEvents.length > 0) return;

  pushAlertEvent({
    type: 'VOLUME_SPIKE',
    scope: 'STOCK',
    title: '현대로템 거래량 급증 (280.1% 폭증)',
    description: '20일 평균 거래량 대비 2.8배의 대량 기관 수급이 유입되었습니다.',
    symbol: '064350',
    symbolName: '현대로템',
    market: 'KOSPI',
    severity: 'info',
    metrics: {
      currentValue: 280.1,
      threshold: 200,
      unit: '%',
      volumeRatio: 280.1,
      volume: 4210000,
      tradingValue: 2450,
    },
  });

  pushAlertEvent({
    type: 'PRICE_SURGE',
    scope: 'STOCK',
    title: '두산에너빌리티 급등 발생 (+7.11%)',
    description: '원전 테마 및 수주 기대감으로 설정 기준(+5.0% 이상)을 초과 상승 중입니다.',
    symbol: '034020',
    symbolName: '두산에너빌리티',
    market: 'KOSPI',
    severity: 'warning',
    metrics: {
      currentValue: 7.11,
      threshold: 5.0,
      unit: '%',
      changePercent: 7.11,
      volume: 16820000,
      tradingValue: 3670,
    },
  });

  pushAlertEvent({
    type: 'MARKET_TURBULENCE',
    scope: 'MARKET',
    title: '⚠️ 코스닥 시장 급변동 감지 (+0.95%)',
    description: '반도체 및 바이오 종목 동반 강세로 지수 변동폭이 확대되었습니다.',
    market: 'KOSDAQ',
    severity: 'info',
    metrics: {
      currentValue: 0.95,
      threshold: 2.0,
      unit: '%',
      changePercent: 0.95,
    },
  });
}
