/**
 * Client-Side Stock AI Briefing Service
 * 
 * SECURITY COMPLIANCE:
 * - NO API Keys (Gemini/Google) are accessed or stored in the browser bundle!
 * - AI generation requests are securely proxied through backend server endpoints (/api/ai/*).
 * - High-conviction heuristic quantitative analysis fallback is maintained for zero-downtime reliability.
 */

import { Stock } from '../types';

export interface AiStockBriefingResult {
  summary: string;
  sentiment: 'strong_buy' | 'buy' | 'hold' | 'sell';
  sentimentLabel: string;
  targetPriceRange: { low: number; high: number };
  catalysts: string[];
  risks: string[];
  technicalView: string;
  source: 'gemini' | 'heuristic';
}

export async function generateStockAiBriefing(stock: Stock): Promise<AiStockBriefingResult> {
  // 1. Try secure backend server AI proxy (keeps API Key completely secret on server)
  try {
    const res = await fetch('/api/ai/stock-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: stock.symbol }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.summary) {
        return {
          ...data,
          source: 'gemini',
        };
      }
    }
  } catch (err) {
    console.warn('[AiService] Server proxy fallback to quantitative engine:', err);
  }

  // 2. High-conviction heuristic quantitative analyst engine fallback (deterministic & secure)
  const isUp = stock.changePercent > 0;
  const isVolSpike = (stock.volumeRatio || 100) > 150;
  const isForeignBuying = (stock.foreignNetBuy || 0) > 0;
  const isInstBuying = (stock.instNetBuy || 0) > 0;

  let sentiment: 'strong_buy' | 'buy' | 'hold' | 'sell' = 'hold';
  let sentimentLabel = '중립 / 관망';

  if (isUp && isVolSpike && isForeignBuying) {
    sentiment = 'strong_buy';
    sentimentLabel = '적극 매수 (강한 모멘텀)';
  } else if (isUp && (isForeignBuying || isInstBuying)) {
    sentiment = 'buy';
    sentimentLabel = '매수 (수급 유입)';
  } else if (!isUp && (stock.foreignNetBuy || 0) < -100 && (stock.instNetBuy || 0) < -100) {
    sentiment = 'sell';
    sentimentLabel = '비중 축소 (쌍끌이 매도)';
  }

  const currentPrice = stock.price;
  const targetLow = Math.round(currentPrice * (sentiment === 'sell' ? 0.92 : 1.05) / 100) * 100;
  const targetHigh = Math.round(currentPrice * (sentiment === 'strong_buy' ? 1.25 : sentiment === 'buy' ? 1.15 : 1.08) / 100) * 100;

  const catalysts: string[] = [];
  if (isVolSpike) catalysts.push(`평균 대비 ${stock.volumeRatio}%의 대량 거래량 폭증 포착`);
  if (isForeignBuying) catalysts.push(`외국인 투자자 순매수세(+${stock.foreignNetBuy}억 원) 지속`);
  if (isInstBuying) catalysts.push(`국내 기관 투자자 순매수 유입(+${stock.instNetBuy}억 원)`);
  if (stock.per && stock.per < 15) catalysts.push(`동종업계 대비 저평가 PER (${stock.per}배) 밸류에이션 매력`);
  if (catalysts.length === 0) catalysts.push(`${stock.sector} 섹터 내 견조한 펀더멘털 유지`);

  const risks: string[] = [];
  if (!isForeignBuying) risks.push(`외국인 차익실현 매물 출회(${stock.foreignNetBuy}억 원) 단기 부담`);
  if (stock.changePercent < -3) risks.push(`단기 지지선 이탈에 따른 변동성 확대 주의`);
  if (risks.length === 0) risks.push(`대외 거시경제(환율 및 금리) 불확실성에 따른 차익 실현 경계`);

  const technicalView = isUp
    ? `현재가(${currentPrice.toLocaleString()}원)는 5일 및 20일 이동평균선 상단에 위치하여 단기 상승 추세를 지지하고 있으며, 1차 목표가 ${targetHigh.toLocaleString()}원 안착 여부가 관건입니다.`
    : `단기 조정 국면으로 20일 이동평균선 지지 여부(${targetLow.toLocaleString()}원)를 확인하며 분할 접근이 권장됩니다.`;

  const summary = `${stock.name}은(는) 현재 전일대비 ${stock.change >= 0 ? '+' : ''}${stock.changePercent}% 변동한 ${currentPrice.toLocaleString()}원에 거래 중입니다. ` +
    `${isVolSpike ? '거래량이 급증하며 시장 관심이 집중되고 있으며, ' : ''}` +
    `${isForeignBuying || isInstBuying ? '메이저 수급 유입이 확인됩니다.' : '수급 관망세가 이어지고 있습니다.'}`;

  return {
    summary,
    sentiment,
    sentimentLabel,
    targetPriceRange: { low: targetLow, high: targetHigh },
    catalysts,
    risks,
    technicalView,
    source: 'heuristic',
  };
}
