/**
 * Historical Chart Trading Simulation Service
 * 
 * Strict Requirements:
 * 1. Simulates past trade entry and exits based exclusively on real historical candles.
 * 2. Compares multiple exit scenarios (target price, stop-loss, custom date).
 * 3. Reuses fee & tax settings from mock trading (commission 0.015%, tax 0.18%).
 * 4. Strictly prevents look-ahead bias (future data leakage).
 * 5. Does NOT modify real portfolio or mock account balances.
 * 6. Supports user-isolated Firestore storage with local fallback.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { db } from './firebase';
import {
  CandleData,
  HistoricalSimulationRecord,
  HistoricalSimulationScenario
} from '../types';

const STORAGE_KEY = 'bd_historical_simulations';

function loadLocalSimulations(): HistoricalSimulationRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalSimulations(list: HistoricalSimulationRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('[historicalSimulationService] saveLocal error:', e);
  }
}

export const historicalSimulationService = {
  /**
   * Run Scenario Analysis on a series of historical candles
   * Strictly evaluates day-by-day starting from entry date.
   */
  evaluateScenarios(params: {
    entryDate: string;
    entryPrice: number;
    quantity: number;
    candles: CandleData[];
    scenariosConfig: Array<{
      id?: string;
      name: string;
      targetRate?: number; // e.g. 10 (%)
      stopLossRate?: number; // e.g. -5 (%)
      customExitDate?: string;
      customExitPrice?: number;
    }>;
    commissionRate?: number; // e.g. 0.00015
    taxRate?: number; // e.g. 0.0018
  }): HistoricalSimulationScenario[] {
    const {
      entryDate,
      entryPrice,
      quantity,
      candles,
      scenariosConfig,
      commissionRate = 0.00015,
      taxRate = 0.0018,
    } = params;

    const entryIdx = candles.findIndex(c => c.time === entryDate);
    if (entryIdx === -1 || entryPrice <= 0 || quantity <= 0) {
      return [];
    }

    const grossBuyAmount = Math.round(entryPrice * quantity);
    const buyFee = Math.round(grossBuyAmount * commissionRate);
    const subsequentCandles = candles.slice(entryIdx + 1);

    return scenariosConfig.map((sc, scIdx) => {
      const scenarioId = sc.id || `sc_${scIdx}_${Date.now()}`;
      const targetPrice = sc.targetRate !== undefined ? Math.round(entryPrice * (1 + sc.targetRate / 100)) : undefined;
      const stopLossPrice = sc.stopLossRate !== undefined ? Math.round(entryPrice * (1 + sc.stopLossRate / 100)) : undefined;

      let exitDate = '';
      let exitPrice = 0;
      let exitReason = '미도달(보유 중)';
      let holdingDays = 0;
      let isHit = false;

      // 1. If custom exit date is configured
      if (sc.customExitDate) {
        const foundIdx = subsequentCandles.findIndex(c => c.time === sc.customExitDate);
        if (foundIdx !== -1) {
          const exitCandle = subsequentCandles[foundIdx];
          exitDate = exitCandle.time;
          exitPrice = sc.customExitPrice && sc.customExitPrice > 0 ? sc.customExitPrice : exitCandle.close;
          exitReason = '지정일 매도';
          holdingDays = foundIdx + 1;
          isHit = true;
        }
      }

      // 2. Otherwise scan subsequent candles sequentially to check target vs stop-loss hit
      if (!isHit && (targetPrice !== undefined || stopLossPrice !== undefined)) {
        for (let i = 0; i < subsequentCandles.length; i++) {
          const candle = subsequentCandles[i];
          const hitTarget = targetPrice !== undefined && candle.high >= targetPrice;
          const hitStop = stopLossPrice !== undefined && candle.low <= stopLossPrice;

          if (hitTarget && hitStop) {
            // Both breached in the same candle: if opened below entry, stop loss hit first
            if (candle.open <= entryPrice) {
              exitPrice = stopLossPrice!;
              exitReason = '손절가 이탈';
            } else {
              exitPrice = targetPrice!;
              exitReason = '목표가 도달';
            }
            exitDate = candle.time;
            holdingDays = i + 1;
            isHit = true;
            break;
          } else if (hitTarget) {
            exitPrice = targetPrice!;
            exitDate = candle.time;
            exitReason = '목표가 도달';
            holdingDays = i + 1;
            isHit = true;
            break;
          } else if (hitStop) {
            exitPrice = stopLossPrice!;
            exitDate = candle.time;
            exitReason = '손절가 이탈';
            holdingDays = i + 1;
            isHit = true;
            break;
          }
        }
      }

      // 3. If neither target nor stop-loss hit by the end of available history
      if (!isHit) {
        if (subsequentCandles.length > 0) {
          const lastCandle = subsequentCandles[subsequentCandles.length - 1];
          exitDate = lastCandle.time;
          exitPrice = lastCandle.close;
          exitReason = '최근 시세(미도달)';
          holdingDays = subsequentCandles.length;
        } else {
          exitDate = entryDate;
          exitPrice = entryPrice;
          exitReason = '당일 진입(익일 데이터 없음)';
          holdingDays = 0;
        }
      }

      const grossSellAmount = Math.round(exitPrice * quantity);
      const sellFee = Math.round(grossSellAmount * commissionRate);
      const sellTax = Math.round(grossSellAmount * taxRate);
      const totalFees = buyFee + sellFee;
      const netProfit = (grossSellAmount - grossBuyAmount) - totalFees - sellTax;
      const returnRate = grossBuyAmount > 0 ? Number(((netProfit / grossBuyAmount) * 100).toFixed(2)) : 0;

      return {
        id: scenarioId,
        name: sc.name,
        targetRate: sc.targetRate,
        targetPrice,
        stopLossRate: sc.stopLossRate,
        stopLossPrice,
        customExitDate: sc.customExitDate,
        customExitPrice: sc.customExitPrice,
        exitDate,
        exitPrice,
        exitReason,
        grossProfit: grossSellAmount - grossBuyAmount,
        fee: totalFees,
        tax: sellTax,
        netProfit,
        returnRate,
        holdingDays,
        isHit,
      };
    });
  },

  /**
   * Save a completed simulation record to Firestore (with local fallback)
   */
  async saveSimulation(
    recordData: Omit<HistoricalSimulationRecord, 'id' | 'createdAt'>,
    uid?: string
  ): Promise<HistoricalSimulationRecord> {
    const now = new Date().toISOString();
    const id = `sim_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const fullRecord: HistoricalSimulationRecord = {
      ...recordData,
      id,
      uid: uid || 'guest',
      createdAt: now,
    };

    if (uid) {
      try {
        await setDoc(doc(db, 'historicalSimulations', id), fullRecord);
      } catch (err) {
        console.warn('[historicalSimulationService] Firestore save failed, saving local:', err);
      }
      const existing = loadLocalSimulations();
      saveLocalSimulations([fullRecord, ...existing]);
    } else {
      const existing = loadLocalSimulations();
      saveLocalSimulations([fullRecord, ...existing]);
    }

    return fullRecord;
  },

  /**
   * Get all simulation records for user
   */
  async getSimulations(uid?: string): Promise<HistoricalSimulationRecord[]> {
    if (!uid) {
      return loadLocalSimulations();
    }

    try {
      const q = query(collection(db, 'historicalSimulations'), where('uid', '==', uid));
      const snap = await getDocs(q);
      const list: HistoricalSimulationRecord[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as HistoricalSimulationRecord);
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return list;
    } catch (err) {
      console.warn('[historicalSimulationService] Firestore get failed, using local:', err);
      return loadLocalSimulations().filter(r => r.uid === uid || r.uid === 'guest');
    }
  },

  /**
   * Delete simulation record
   */
  async deleteSimulation(id: string, uid?: string): Promise<void> {
    if (uid) {
      try {
        await deleteDoc(doc(db, 'historicalSimulations', id));
      } catch (err) {
        console.warn('[historicalSimulationService] Firestore delete failed:', err);
      }
    }
    const existing = loadLocalSimulations();
    saveLocalSimulations(existing.filter(r => r.id !== id));
  },
};
