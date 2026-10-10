/**
 * Market Alert and Screening Thresholds
 * 
 * Criteria:
 * - 급등: +5% 이상
 * - 급락: -5% 이하
 * - 거래량 급증: 평균 거래량 대비 200% 이상
 */

export const MARKET_THRESHOLDS = {
  SURGE_GAIN: 5.0,        // +5% 이상
  SURGE_LOSS: -5.0,       // -5% 이하
  VOLUME_SURGE: 200.0,    // 200% 이상
} as const;

export function isSurgeGain(changePercent: number): boolean {
  return changePercent >= MARKET_THRESHOLDS.SURGE_GAIN;
}

export function isSurgeLoss(changePercent: number): boolean {
  return changePercent <= MARKET_THRESHOLDS.SURGE_LOSS;
}

export function isVolumeSurge(volumeRatio?: number): boolean {
  return (volumeRatio ?? 0) >= MARKET_THRESHOLDS.VOLUME_SURGE;
}
