// Technical Indicator calculation utilities for InteractiveStockChart
import { CandleData } from '../types';

export interface IndicatorSettings {
  ma: {
    enabled: boolean;
    ma5: boolean;
    ma20: boolean;
    ma60: boolean;
    ma120: boolean;
    period5: number;
    period20: number;
    period60: number;
    period120: number;
  };
  ema: {
    enabled: boolean;
    period: number;
  };
  bollinger: {
    enabled: boolean;
    period: number;
    stdDev: number;
  };
  vwap: {
    enabled: boolean;
  };
  rsi: {
    enabled: boolean;
    period: number;
  };
  macd: {
    enabled: boolean;
    fastPeriod: number;
    slowPeriod: number;
    signalPeriod: number;
  };
  stochastic: {
    enabled: boolean;
    kPeriod: number;
    dPeriod: number;
  };
  volume: {
    enabled: boolean;
  };
}

export const DEFAULT_INDICATOR_SETTINGS: IndicatorSettings = {
  ma: {
    enabled: true,
    ma5: true,
    ma20: true,
    ma60: true,
    ma120: false,
    period5: 5,
    period20: 20,
    period60: 60,
    period120: 120,
  },
  ema: {
    enabled: false,
    period: 20,
  },
  bollinger: {
    enabled: false,
    period: 20,
    stdDev: 2,
  },
  vwap: {
    enabled: false,
  },
  rsi: {
    enabled: false,
    period: 14,
  },
  macd: {
    enabled: false,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
  },
  stochastic: {
    enabled: false,
    kPeriod: 14,
    dPeriod: 3,
  },
  volume: {
    enabled: true,
  },
};

/**
 * Calculate Simple Moving Average (SMA)
 */
export function calculateSMA(candles: CandleData[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) {
      sum -= candles[i - period].close;
    }
    if (i >= period - 1) {
      result.push(sum / period);
    } else {
      result.push(null);
    }
  }
  return result;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
export function calculateEMA(candles: CandleData[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  if (candles.length === 0 || period <= 0) return result;
  const k = 2 / (period + 1);
  let ema: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const close = candles[i].close;
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      // First EMA is simple SMA
      let sum = 0;
      for (let j = 0; j < period; j++) sum += candles[j].close;
      ema = sum / period;
      result.push(ema);
    } else if (ema !== null) {
      ema = close * k + ema * (1 - k);
      result.push(ema);
    } else {
      result.push(null);
    }
  }
  return result;
}

/**
 * Calculate Bollinger Bands (Upper, Middle, Lower)
 */
export interface BollingerBandsResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
}

export function calculateBollingerBands(
  candles: CandleData[],
  period: number = 20,
  stdDevMultiplier: number = 2
): BollingerBandsResult {
  const upper: (number | null)[] = [];
  const middle: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      middle.push(null);
      lower.push(null);
    } else {
      const slice = candles.slice(i - period + 1, i + 1);
      const mean = slice.reduce((acc, c) => acc + c.close, 0) / period;
      const variance = slice.reduce((acc, c) => acc + Math.pow(c.close - mean, 2), 0) / period;
      const stdDev = Math.sqrt(variance);

      middle.push(mean);
      upper.push(mean + stdDevMultiplier * stdDev);
      lower.push(mean - stdDevMultiplier * stdDev);
    }
  }

  return { upper, middle, lower };
}

/**
 * Calculate VWAP (Volume Weighted Average Price)
 */
export function calculateVWAP(candles: CandleData[]): (number | null)[] {
  const result: (number | null)[] = [];
  let cumulativeTypicalVolume = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativeTypicalVolume += typicalPrice * c.volume;
    cumulativeVolume += c.volume;

    if (cumulativeVolume > 0) {
      result.push(cumulativeTypicalVolume / cumulativeVolume);
    } else {
      result.push(null);
    }
  }
  return result;
}

/**
 * Calculate RSI (Relative Strength Index)
 */
export function calculateRSI(candles: CandleData[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  if (candles.length <= period) {
    return candles.map(() => null);
  }

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // First values up to period are null
  for (let i = 0; i < period; i++) {
    result.push(null);
  }

  // First RSI
  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  let firstRsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
  result.push(firstRsi);

  // Subsequent smoothed RSIs
  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const currentGain = diff >= 0 ? diff : 0;
    const currentLoss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + currentGain) / period;
    avgLoss = (avgLoss * (period - 1) + currentLoss) / period;

    if (avgLoss === 0) {
      result.push(100);
    } else {
      rs = avgGain / avgLoss;
      result.push(100 - (100 / (1 + rs)));
    }
  }

  return result;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
export interface MACDResult {
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
}

export function calculateMACD(
  candles: CandleData[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MACDResult {
  const fastEMA = calculateEMA(candles, fastPeriod);
  const slowEMA = calculateEMA(candles, slowPeriod);

  const macdLine: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    const f = fastEMA[i];
    const s = slowEMA[i];
    if (f !== null && s !== null) {
      macdLine.push(f - s);
    } else {
      macdLine.push(null);
    }
  }

  // Calculate Signal line (EMA of MACD line)
  const signalLine: (number | null)[] = [];
  const validMacdValues: { index: number; val: number }[] = [];
  macdLine.forEach((val, idx) => {
    if (val !== null) validMacdValues.push({ index: idx, val });
  });

  if (validMacdValues.length >= signalPeriod) {
    const k = 2 / (signalPeriod + 1);
    let ema: number | null = null;
    let validCount = 0;

    for (let i = 0; i < candles.length; i++) {
      const val = macdLine[i];
      if (val === null) {
        signalLine.push(null);
      } else {
        validCount++;
        if (validCount < signalPeriod) {
          signalLine.push(null);
        } else if (validCount === signalPeriod) {
          const sliceSum = validMacdValues.slice(0, signalPeriod).reduce((acc, v) => acc + v.val, 0);
          ema = sliceSum / signalPeriod;
          signalLine.push(ema);
        } else if (ema !== null) {
          ema = val * k + ema * (1 - k);
          signalLine.push(ema);
        } else {
          signalLine.push(null);
        }
      }
    }
  } else {
    for (let i = 0; i < candles.length; i++) signalLine.push(null);
  }

  const histogram: (number | null)[] = [];
  for (let i = 0; i < candles.length; i++) {
    const m = macdLine[i];
    const s = signalLine[i];
    if (m !== null && s !== null) {
      histogram.push(m - s);
    } else {
      histogram.push(null);
    }
  }

  return { macdLine, signalLine, histogram };
}

/**
 * Calculate Stochastic Oscillator (%K and %D)
 */
export interface StochasticResult {
  kLine: (number | null)[];
  dLine: (number | null)[];
}

export function calculateStochastic(
  candles: CandleData[],
  kPeriod: number = 14,
  dPeriod: number = 3
): StochasticResult {
  const kLine: (number | null)[] = [];
  const dLine: (number | null)[] = [];

  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1) {
      kLine.push(null);
    } else {
      const slice = candles.slice(i - kPeriod + 1, i + 1);
      const lowestLow = Math.min(...slice.map(c => c.low));
      const highestHigh = Math.max(...slice.map(c => c.high));
      const currentClose = candles[i].close;

      const range = highestHigh - lowestLow;
      if (range === 0) {
        kLine.push(50);
      } else {
        const k = ((currentClose - lowestLow) / range) * 100;
        kLine.push(k);
      }
    }
  }

  // Calculate %D (SMA of %K)
  for (let i = 0; i < candles.length; i++) {
    if (i < kPeriod - 1 + dPeriod - 1) {
      dLine.push(null);
    } else {
      const slice = kLine.slice(i - dPeriod + 1, i + 1);
      if (slice.some(v => v === null)) {
        dLine.push(null);
      } else {
        const sum = (slice as number[]).reduce((acc: number, v: number) => acc + v, 0);
        dLine.push(sum / dPeriod);
      }
    }
  }

  return { kLine, dLine };
}
