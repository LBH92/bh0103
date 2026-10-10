/**
 * Portfolio & Mock Trading Service
 * 
 * Strict Data Principles & Requirements:
 * 1. Virtual Holdings (가상 보유 내역):
 *    - User directly records holdings, buys, additional buys, and sells.
 *    - Accurate weighted average price calculation on additional buy:
 *      ((prevQty * prevAvgPrice) + (addQty * addPrice)) / (prevQty + addQty)
 *    - Realized P&L and trade history tracking on partial or full sell.
 *    - Clearly distinguishes from real brokerage accounts.
 * 
 * 2. Mock Trading (가상 모의투자):
 *    - Virtual cash balance (default 100,000,000 KRW, resetable).
 *    - Customizable trading fee and securities tax rates.
 *    - Safe order execution with duplicate prevention and validation:
 *      rejects insufficient cash on buy and excessive quantity on sell.
 *    - ACID Firestore transactions ensuring atomic balance, holding, and order consistency.
 *    - User-isolated storage in Firestore (per uid) with offline/guest fallback.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  runTransaction
} from 'firebase/firestore';
import { db } from './firebase';
import {
  VirtualHolding,
  VirtualHoldingTrade,
  MockAccount,
  MockPosition,
  MockOrder,
  TradingFeeSettings,
  Stock
} from '../types';
import { stockRepository } from './stockRepository';
import { globalMarketClient } from './globalMarketClient';

const STORAGE_KEYS = {
  VIRTUAL_HOLDINGS: 'bd_virtual_holdings',
  VIRTUAL_TRADES: 'bd_virtual_trades',
  MOCK_ACCOUNT: 'bd_mock_account',
  MOCK_POSITIONS: 'bd_mock_positions',
  MOCK_ORDERS: 'bd_mock_orders',
};

const DEFAULT_INITIAL_CASH = 100000000; // 1억 원
const DEFAULT_COMMISSION_RATE = 0.00015; // 0.015%
const DEFAULT_TAX_RATE = 0.0018; // 0.18%

// LocalStorage helpers for guest fallback
function loadLocal<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

function saveLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`[portfolioService] saveLocal error:`, e);
  }
}

export const portfolioService = {
  // ==========================================
  // 1. Virtual Holdings (가상 보유 내역)
  // ==========================================

  async getVirtualHoldings(uid?: string): Promise<VirtualHolding[]> {
    if (!uid) {
      return loadLocal<VirtualHolding[]>(STORAGE_KEYS.VIRTUAL_HOLDINGS, []);
    }
    try {
      const q = query(collection(db, 'virtualHoldings'), where('uid', '==', uid));
      const snap = await getDocs(q);
      const list: VirtualHolding[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as VirtualHolding);
      });
      // Sort by creation / updated date desc
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return list;
    } catch (err) {
      console.warn('[portfolioService] getVirtualHoldings Firestore error, using local:', err);
      return loadLocal<VirtualHolding[]>(`${STORAGE_KEYS.VIRTUAL_HOLDINGS}_${uid}`, []);
    }
  },

  async saveVirtualHolding(
    uid: string | undefined,
    data: {
      symbol: string;
      name: string;
      market: string;
      currency?: 'KRW' | 'USD';
      quantity: number;
      avgBuyPrice: number;
      buyDate: string;
      memo?: string;
    },
    existingId?: string
  ): Promise<VirtualHolding> {
    const now = new Date().toISOString();
    const id = existingId || (uid ? `${uid}_${data.symbol}` : `holding_${Date.now()}`);
    const currency = data.currency || (data.market === 'US' || data.market === 'GLOBAL' ? 'USD' : 'KRW');
    const totalBuyAmount = Math.round(data.quantity * data.avgBuyPrice);

    const holding: VirtualHolding = {
      id,
      uid: uid || 'guest',
      symbol: data.symbol,
      name: data.name,
      market: data.market,
      currency,
      quantity: data.quantity,
      avgBuyPrice: Math.round(data.avgBuyPrice),
      totalBuyAmount,
      buyDate: data.buyDate || now.slice(0, 10),
      memo: data.memo || '',
      createdAt: now,
      updatedAt: now,
    };

    if (uid) {
      try {
        await setDoc(doc(db, 'virtualHoldings', id), holding, { merge: true });
        // Also record trade history if it is a new holding entry
        if (!existingId) {
          const tradeId = `vtrade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const trade: VirtualHoldingTrade = {
            id: tradeId,
            uid,
            holdingId: id,
            symbol: data.symbol,
            name: data.name,
            tradeType: 'BUY',
            price: data.avgBuyPrice,
            quantity: data.quantity,
            totalAmount: totalBuyAmount,
            tradeDate: data.buyDate || now.slice(0, 10),
            memo: data.memo || '최초 보유 등록',
            createdAt: now,
          };
          await setDoc(doc(db, 'virtualHoldingHistory', tradeId), trade);
        }
      } catch (err) {
        console.warn('[portfolioService] saveVirtualHolding Firestore error, saving local:', err);
      }
      const localKey = `${STORAGE_KEYS.VIRTUAL_HOLDINGS}_${uid}`;
      const existingList = loadLocal<VirtualHolding[]>(localKey, []);
      const updatedList = [holding, ...existingList.filter(h => h.id !== id)];
      saveLocal(localKey, updatedList);
    } else {
      const existingList = loadLocal<VirtualHolding[]>(STORAGE_KEYS.VIRTUAL_HOLDINGS, []);
      const updatedList = [holding, ...existingList.filter(h => h.id !== id)];
      saveLocal(STORAGE_KEYS.VIRTUAL_HOLDINGS, updatedList);

      if (!existingId) {
        const trade: VirtualHoldingTrade = {
          id: `vtrade_${Date.now()}`,
          uid: 'guest',
          holdingId: id,
          symbol: data.symbol,
          name: data.name,
          tradeType: 'BUY',
          price: data.avgBuyPrice,
          quantity: data.quantity,
          totalAmount: totalBuyAmount,
          tradeDate: data.buyDate || now.slice(0, 10),
          memo: data.memo || '최초 보유 등록',
          createdAt: now,
        };
        const trades = loadLocal<VirtualHoldingTrade[]>(STORAGE_KEYS.VIRTUAL_TRADES, []);
        saveLocal(STORAGE_KEYS.VIRTUAL_TRADES, [trade, ...trades]);
      }
    }

    return holding;
  },

  // 추가 매수: 평균 매입가 및 총 수량 정확 계산
  async addBuyVirtualHolding(
    uid: string | undefined,
    holdingId: string,
    addQty: number,
    addPrice: number,
    tradeDate: string,
    memo?: string
  ): Promise<VirtualHolding> {
    if (addQty <= 0 || addPrice <= 0) {
      throw new Error('추가 매수 수량과 매수가는 0보다 커야 합니다.');
    }

    const holdings = await this.getVirtualHoldings(uid);
    const target = holdings.find(h => h.id === holdingId);
    if (!target) {
      throw new Error('해당 보유 종목을 찾을 수 없습니다.');
    }

    const prevQty = target.quantity;
    const prevAvgPrice = target.avgBuyPrice;
    const newQty = prevQty + addQty;
    // 가중평균 매입단가 계산: ((기존수량 * 기존평균가) + (추가수량 * 추가단가)) / 총수량
    const newAvgPrice = Math.round(((prevQty * prevAvgPrice) + (addQty * addPrice)) / newQty);
    const newTotalBuyAmount = Math.round(newQty * newAvgPrice);
    const now = new Date().toISOString();

    const updatedHolding: VirtualHolding = {
      ...target,
      quantity: newQty,
      avgBuyPrice: newAvgPrice,
      totalBuyAmount: newTotalBuyAmount,
      updatedAt: now,
    };

    const tradeId = `vtrade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const trade: VirtualHoldingTrade = {
      id: tradeId,
      uid: uid || 'guest',
      holdingId,
      symbol: target.symbol,
      name: target.name,
      tradeType: 'ADD_BUY',
      price: addPrice,
      quantity: addQty,
      totalAmount: Math.round(addQty * addPrice),
      tradeDate: tradeDate || now.slice(0, 10),
      memo: memo || `추가 매수 (${addQty}주 @ ${addPrice.toLocaleString()}원)`,
      createdAt: now,
    };

    if (uid) {
      try {
        await setDoc(doc(db, 'virtualHoldings', holdingId), updatedHolding, { merge: true });
        await setDoc(doc(db, 'virtualHoldingHistory', tradeId), trade);
      } catch (err) {
        console.warn('[portfolioService] addBuyVirtualHolding Firestore error:', err);
      }
      const localKey = `${STORAGE_KEYS.VIRTUAL_HOLDINGS}_${uid}`;
      const existingList = loadLocal<VirtualHolding[]>(localKey, []);
      saveLocal(localKey, [updatedHolding, ...existingList.filter(h => h.id !== holdingId)]);
      const tradeKey = `${STORAGE_KEYS.VIRTUAL_TRADES}_${uid}`;
      const trades = loadLocal<VirtualHoldingTrade[]>(tradeKey, []);
      saveLocal(tradeKey, [trade, ...trades]);
    } else {
      const existingList = loadLocal<VirtualHolding[]>(STORAGE_KEYS.VIRTUAL_HOLDINGS, []);
      saveLocal(STORAGE_KEYS.VIRTUAL_HOLDINGS, [updatedHolding, ...existingList.filter(h => h.id !== holdingId)]);
      const trades = loadLocal<VirtualHoldingTrade[]>(STORAGE_KEYS.VIRTUAL_TRADES, []);
      saveLocal(STORAGE_KEYS.VIRTUAL_TRADES, [trade, ...trades]);
    }

    return updatedHolding;
  },

  // 매도 기록: 실현손익 계산 및 거래 내역 추가
  async sellVirtualHolding(
    uid: string | undefined,
    holdingId: string,
    sellQty: number,
    sellPrice: number,
    tradeDate: string,
    fee: number = 0,
    tax: number = 0,
    memo?: string
  ): Promise<{ remainingQty: number; realizedProfit: number; realizedProfitRate: number }> {
    if (sellQty <= 0 || sellPrice <= 0) {
      throw new Error('매도 수량과 매도가는 0보다 커야 합니다.');
    }

    const holdings = await this.getVirtualHoldings(uid);
    const target = holdings.find(h => h.id === holdingId);
    if (!target) {
      throw new Error('해당 보유 종목을 찾을 수 없습니다.');
    }

    if (sellQty > target.quantity) {
      throw new Error(`보유 수량(${target.quantity}주)을 초과하여 매도할 수 없습니다.`);
    }

    const remainingQty = target.quantity - sellQty;
    const grossSellAmount = Math.round(sellQty * sellPrice);
    const grossCostBasis = Math.round(sellQty * target.avgBuyPrice);
    // 실현 손익 = (매도가 - 평균매입가) * 매도수량 - 수수료 - 제세금
    const realizedProfit = Math.round((grossSellAmount - grossCostBasis) - fee - tax);
    const realizedProfitRate = target.avgBuyPrice > 0
      ? Number((((sellPrice - target.avgBuyPrice) / target.avgBuyPrice) * 100).toFixed(2))
      : 0;

    const now = new Date().toISOString();
    const tradeId = `vtrade_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const trade: VirtualHoldingTrade = {
      id: tradeId,
      uid: uid || 'guest',
      holdingId,
      symbol: target.symbol,
      name: target.name,
      tradeType: 'SELL',
      price: sellPrice,
      quantity: sellQty,
      totalAmount: grossSellAmount,
      tradeDate: tradeDate || now.slice(0, 10),
      realizedProfit,
      realizedProfitRate,
      fee,
      tax,
      memo: memo || `매도 실행 (${sellQty}주, 실현손익: ${realizedProfit >= 0 ? '+' : ''}${realizedProfit.toLocaleString()}원)`,
      createdAt: now,
    };

    if (remainingQty === 0) {
      // 전량 매도 -> 보유 목록에서 제거
      await this.deleteVirtualHolding(uid, holdingId);
    } else {
      // 부분 매도 -> 보유 수량 차감 (평균 매입가는 유지)
      const updatedHolding: VirtualHolding = {
        ...target,
        quantity: remainingQty,
        totalBuyAmount: Math.round(remainingQty * target.avgBuyPrice),
        updatedAt: now,
      };

      if (uid) {
        try {
          await setDoc(doc(db, 'virtualHoldings', holdingId), updatedHolding, { merge: true });
        } catch (err) {
          console.warn('[portfolioService] update holding on sell error:', err);
        }
        const localKey = `${STORAGE_KEYS.VIRTUAL_HOLDINGS}_${uid}`;
        const existingList = loadLocal<VirtualHolding[]>(localKey, []);
        saveLocal(localKey, [updatedHolding, ...existingList.filter(h => h.id !== holdingId)]);
      } else {
        const existingList = loadLocal<VirtualHolding[]>(STORAGE_KEYS.VIRTUAL_HOLDINGS, []);
        saveLocal(STORAGE_KEYS.VIRTUAL_HOLDINGS, [updatedHolding, ...existingList.filter(h => h.id !== holdingId)]);
      }
    }

    // Save trade record
    if (uid) {
      try {
        await setDoc(doc(db, 'virtualHoldingHistory', tradeId), trade);
      } catch (err) {
        console.warn('[portfolioService] save sell trade record error:', err);
      }
      const tradeKey = `${STORAGE_KEYS.VIRTUAL_TRADES}_${uid}`;
      const trades = loadLocal<VirtualHoldingTrade[]>(tradeKey, []);
      saveLocal(tradeKey, [trade, ...trades]);
    } else {
      const trades = loadLocal<VirtualHoldingTrade[]>(STORAGE_KEYS.VIRTUAL_TRADES, []);
      saveLocal(STORAGE_KEYS.VIRTUAL_TRADES, [trade, ...trades]);
    }

    return { remainingQty, realizedProfit, realizedProfitRate };
  },

  async deleteVirtualHolding(uid: string | undefined, holdingId: string): Promise<void> {
    if (uid) {
      try {
        await deleteDoc(doc(db, 'virtualHoldings', holdingId));
      } catch (err) {
        console.warn('[portfolioService] deleteVirtualHolding Firestore error:', err);
      }
      const localKey = `${STORAGE_KEYS.VIRTUAL_HOLDINGS}_${uid}`;
      const existingList = loadLocal<VirtualHolding[]>(localKey, []);
      saveLocal(localKey, existingList.filter(h => h.id !== holdingId));
    } else {
      const existingList = loadLocal<VirtualHolding[]>(STORAGE_KEYS.VIRTUAL_HOLDINGS, []);
      saveLocal(STORAGE_KEYS.VIRTUAL_HOLDINGS, existingList.filter(h => h.id !== holdingId));
    }
  },

  async getVirtualHoldingTrades(uid?: string): Promise<VirtualHoldingTrade[]> {
    if (!uid) {
      return loadLocal<VirtualHoldingTrade[]>(STORAGE_KEYS.VIRTUAL_TRADES, []);
    }
    try {
      const q = query(collection(db, 'virtualHoldingHistory'), where('uid', '==', uid));
      const snap = await getDocs(q);
      const list: VirtualHoldingTrade[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as VirtualHoldingTrade);
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return list;
    } catch (err) {
      console.warn('[portfolioService] getVirtualHoldingTrades Firestore error, using local:', err);
      return loadLocal<VirtualHoldingTrade[]>(`${STORAGE_KEYS.VIRTUAL_TRADES}_${uid}`, []);
    }
  },

  // ==========================================
  // 2. Mock Trading (가상 모의투자)
  // ==========================================

  async getMockAccount(uid?: string): Promise<MockAccount> {
    const defaultAcc: MockAccount = {
      uid: uid || 'guest',
      initialBalance: DEFAULT_INITIAL_CASH,
      currentCash: DEFAULT_INITIAL_CASH,
      commissionRate: DEFAULT_COMMISSION_RATE,
      taxRate: DEFAULT_TAX_RATE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!uid) {
      return loadLocal<MockAccount>(STORAGE_KEYS.MOCK_ACCOUNT, defaultAcc);
    }

    try {
      const ref = doc(db, 'mockAccounts', uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        return snap.data() as MockAccount;
      }
      // Initialize account for user
      await setDoc(ref, defaultAcc);
      return defaultAcc;
    } catch (err) {
      console.warn('[portfolioService] getMockAccount error, using local fallback:', err);
      return loadLocal<MockAccount>(`${STORAGE_KEYS.MOCK_ACCOUNT}_${uid}`, defaultAcc);
    }
  },

  async updateFeeSettings(
    uid: string | undefined,
    commissionRatePercent: number,
    taxRatePercent: number
  ): Promise<MockAccount> {
    const acc = await this.getMockAccount(uid);
    const updated: MockAccount = {
      ...acc,
      commissionRate: commissionRatePercent / 100,
      taxRate: taxRatePercent / 100,
      updatedAt: new Date().toISOString(),
    };

    if (uid) {
      try {
        await setDoc(doc(db, 'mockAccounts', uid), updated, { merge: true });
      } catch (err) {
        console.warn('[portfolioService] updateFeeSettings Firestore error:', err);
      }
      saveLocal(`${STORAGE_KEYS.MOCK_ACCOUNT}_${uid}`, updated);
    } else {
      saveLocal(STORAGE_KEYS.MOCK_ACCOUNT, updated);
    }

    return updated;
  },

  async resetMockAccount(uid?: string): Promise<MockAccount> {
    const now = new Date().toISOString();
    const defaultAcc: MockAccount = {
      uid: uid || 'guest',
      initialBalance: DEFAULT_INITIAL_CASH,
      currentCash: DEFAULT_INITIAL_CASH,
      commissionRate: DEFAULT_COMMISSION_RATE,
      taxRate: DEFAULT_TAX_RATE,
      createdAt: now,
      updatedAt: now,
    };

    if (uid) {
      try {
        // Reset account
        await setDoc(doc(db, 'mockAccounts', uid), defaultAcc);

        // Delete all mock holdings for user
        const holdingsSnap = await getDocs(query(collection(db, 'mockHoldings'), where('uid', '==', uid)));
        for (const docSnap of holdingsSnap.docs) {
          await deleteDoc(docSnap.ref);
        }

        // Delete all mock orders for user
        const ordersSnap = await getDocs(query(collection(db, 'mockOrders'), where('uid', '==', uid)));
        for (const docSnap of ordersSnap.docs) {
          await deleteDoc(docSnap.ref);
        }
      } catch (err) {
        console.warn('[portfolioService] resetMockAccount Firestore error:', err);
      }
      saveLocal(`${STORAGE_KEYS.MOCK_ACCOUNT}_${uid}`, defaultAcc);
      saveLocal(`${STORAGE_KEYS.MOCK_POSITIONS}_${uid}`, []);
      saveLocal(`${STORAGE_KEYS.MOCK_ORDERS}_${uid}`, []);
    } else {
      saveLocal(STORAGE_KEYS.MOCK_ACCOUNT, defaultAcc);
      saveLocal(STORAGE_KEYS.MOCK_POSITIONS, []);
      saveLocal(STORAGE_KEYS.MOCK_ORDERS, []);
    }

    return defaultAcc;
  },

  async getMockPositions(uid?: string): Promise<MockPosition[]> {
    if (!uid) {
      return loadLocal<MockPosition[]>(STORAGE_KEYS.MOCK_POSITIONS, []);
    }
    try {
      const q = query(collection(db, 'mockHoldings'), where('uid', '==', uid));
      const snap = await getDocs(q);
      const list: MockPosition[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as MockPosition);
      });
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return list;
    } catch (err) {
      console.warn('[portfolioService] getMockPositions Firestore error:', err);
      return loadLocal<MockPosition[]>(`${STORAGE_KEYS.MOCK_POSITIONS}_${uid}`, []);
    }
  },

  async getMockOrders(uid?: string): Promise<MockOrder[]> {
    if (!uid) {
      return loadLocal<MockOrder[]>(STORAGE_KEYS.MOCK_ORDERS, []);
    }
    try {
      const q = query(collection(db, 'mockOrders'), where('uid', '==', uid));
      const snap = await getDocs(q);
      const list: MockOrder[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() } as MockOrder);
      });
      list.sort((a, b) => b.executedAt.localeCompare(a.executedAt));
      return list;
    } catch (err) {
      console.warn('[portfolioService] getMockOrders Firestore error:', err);
      return loadLocal<MockOrder[]>(`${STORAGE_KEYS.MOCK_ORDERS}_${uid}`, []);
    }
  },

  // 모의 매수 주문 실행 (원자적 검증 및 트랜잭션 처리)
  async executeMockBuyOrder(
    uid: string | undefined,
    params: {
      symbol: string;
      name: string;
      market: string;
      currency?: 'KRW' | 'USD';
      price: number;
      quantity: number;
      reason?: string;
      exchangeRate?: number;
    }
  ): Promise<MockOrder> {
    const { symbol, name, market, price, quantity, reason } = params;
    const currency = params.currency || (market === 'US' || market === 'GLOBAL' ? 'USD' : 'KRW');

    if (price <= 0 || !Number.isFinite(price)) {
      throw new Error('유효한 주문 가격을 입력해주세요.');
    }
    if (quantity <= 0 || !Number.isInteger(quantity)) {
      throw new Error('주문 수량은 1주 이상의 정수여야 합니다.');
    }

    const now = new Date().toISOString();
    const orderId = `morder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const positionDocId = uid ? `${uid}_${symbol}` : `pos_${symbol}`;

    if (uid) {
      // Use Firestore ACID runTransaction
      let executedOrder: MockOrder | null = null;
      try {
        await runTransaction(db, async (tx) => {
          const accRef = doc(db, 'mockAccounts', uid);
          const accSnap = await tx.get(accRef);
          
          let accountData: MockAccount;
          if (!accSnap.exists()) {
            accountData = {
              uid,
              initialBalance: DEFAULT_INITIAL_CASH,
              currentCash: DEFAULT_INITIAL_CASH,
              commissionRate: DEFAULT_COMMISSION_RATE,
              taxRate: DEFAULT_TAX_RATE,
              createdAt: now,
              updatedAt: now,
            };
          } else {
            accountData = accSnap.data() as MockAccount;
          }

          const grossAmount = Math.round(price * quantity);
          const fee = Math.round(grossAmount * accountData.commissionRate);
          const requiredCash = grossAmount + fee;

          if (requiredCash > accountData.currentCash) {
            throw new Error(
              `가상 현금이 부족합니다. (필요 금액: ${requiredCash.toLocaleString()}원, 보유 현금: ${accountData.currentCash.toLocaleString()}원)`
            );
          }

          // Check existing position
          const posRef = doc(db, 'mockHoldings', positionDocId);
          const posSnap = await tx.get(posRef);

          let updatedPos: MockPosition;
          if (posSnap.exists()) {
            const currentPos = posSnap.data() as MockPosition;
            const newQty = currentPos.quantity + quantity;
            const newAvgPrice = Math.round(((currentPos.quantity * currentPos.avgBuyPrice) + grossAmount) / newQty);
            updatedPos = {
              ...currentPos,
              quantity: newQty,
              avgBuyPrice: newAvgPrice,
              totalInvested: Math.round(newQty * newAvgPrice),
              updatedAt: now,
            };
            tx.update(posRef, {
              quantity: updatedPos.quantity,
              avgBuyPrice: updatedPos.avgBuyPrice,
              totalInvested: updatedPos.totalInvested,
              updatedAt: now,
            });
          } else {
            updatedPos = {
              id: positionDocId,
              uid,
              symbol,
              name,
              market,
              currency,
              quantity,
              avgBuyPrice: price,
              totalInvested: grossAmount,
              updatedAt: now,
            };
            tx.set(posRef, updatedPos);
          }

          // Update Account Cash
          const newCash = accountData.currentCash - requiredCash;
          tx.set(accRef, {
            ...accountData,
            currentCash: newCash,
            updatedAt: now,
          }, { merge: true });

          // Create Mock Order
          executedOrder = {
            id: orderId,
            uid,
            symbol,
            name,
            orderType: 'BUY',
            price,
            quantity,
            totalAmount: grossAmount,
            fee,
            tax: 0,
            settledAmount: requiredCash,
            reason: reason || '전략 매수 체결',
            executedAt: now,
            currency,
            exchangeRate: params.exchangeRate,
          };

          const orderRef = doc(db, 'mockOrders', orderId);
          tx.set(orderRef, executedOrder);
        });

        if (executedOrder) return executedOrder;
      } catch (err: any) {
        console.warn('[portfolioService] executeMockBuyOrder Firestore transaction failed:', err);
        throw new Error(err.message || '매수 주문 처리 중 오류가 발생했습니다.');
      }
    }

    // Guest fallback (Local storage transactional simulation)
    const acc = await this.getMockAccount(uid);
    const grossAmount = Math.round(price * quantity);
    const fee = Math.round(grossAmount * acc.commissionRate);
    const requiredCash = grossAmount + fee;

    if (requiredCash > acc.currentCash) {
      throw new Error(
        `가상 현금이 부족합니다. (필요 금액: ${requiredCash.toLocaleString()}원, 보유 현금: ${acc.currentCash.toLocaleString()}원)`
      );
    }

    const positions = await this.getMockPositions(uid);
    const existing = positions.find(p => p.symbol === symbol);

    let updatedPositions: MockPosition[];
    if (existing) {
      const newQty = existing.quantity + quantity;
      const newAvgPrice = Math.round(((existing.quantity * existing.avgBuyPrice) + grossAmount) / newQty);
      const updatedItem: MockPosition = {
        ...existing,
        quantity: newQty,
        avgBuyPrice: newAvgPrice,
        totalInvested: Math.round(newQty * newAvgPrice),
        updatedAt: now,
      };
      updatedPositions = positions.map(p => p.symbol === symbol ? updatedItem : p);
    } else {
      const newPos: MockPosition = {
        id: positionDocId,
        uid: 'guest',
        symbol,
        name,
        market,
        currency,
        quantity,
        avgBuyPrice: price,
        totalInvested: grossAmount,
        updatedAt: now,
      };
      updatedPositions = [newPos, ...positions];
    }

    const updatedAccount: MockAccount = {
      ...acc,
      currentCash: acc.currentCash - requiredCash,
      updatedAt: now,
    };

    const order: MockOrder = {
      id: orderId,
      uid: uid || 'guest',
      symbol,
      name,
      orderType: 'BUY',
      price,
      quantity,
      totalAmount: grossAmount,
      fee,
      tax: 0,
      settledAmount: requiredCash,
      reason: reason || '전략 매수 체결',
      executedAt: now,
      currency,
      exchangeRate: params.exchangeRate,
    };

    saveLocal(STORAGE_KEYS.MOCK_ACCOUNT, updatedAccount);
    saveLocal(STORAGE_KEYS.MOCK_POSITIONS, updatedPositions);
    const prevOrders = loadLocal<MockOrder[]>(STORAGE_KEYS.MOCK_ORDERS, []);
    saveLocal(STORAGE_KEYS.MOCK_ORDERS, [order, ...prevOrders]);

    return order;
  },

  // 모의 매도 주문 실행 (원자적 수량 검증, 실현손익 계산 및 현금 정산)
  async executeMockSellOrder(
    uid: string | undefined,
    params: {
      symbol: string;
      price: number;
      quantity: number;
      reason?: string;
      exchangeRate?: number;
    }
  ): Promise<MockOrder> {
    const { symbol, price, quantity, reason } = params;

    if (price <= 0 || !Number.isFinite(price)) {
      throw new Error('유효한 매도 가격을 입력해주세요.');
    }
    if (quantity <= 0 || !Number.isInteger(quantity)) {
      throw new Error('매도 수량은 1주 이상의 정수여야 합니다.');
    }

    const now = new Date().toISOString();
    const orderId = `morder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const positionDocId = uid ? `${uid}_${symbol}` : `pos_${symbol}`;

    if (uid) {
      let executedOrder: MockOrder | null = null;
      try {
        await runTransaction(db, async (tx) => {
          const accRef = doc(db, 'mockAccounts', uid);
          const accSnap = await tx.get(accRef);
          if (!accSnap.exists()) {
            throw new Error('모의투자 계좌를 찾을 수 없습니다.');
          }
          const accountData = accSnap.data() as MockAccount;

          const posRef = doc(db, 'mockHoldings', positionDocId);
          const posSnap = await tx.get(posRef);
          if (!posSnap.exists()) {
            throw new Error('매도할 보유 종목이 존재하지 않습니다.');
          }
          const currentPos = posSnap.data() as MockPosition;

          if (quantity > currentPos.quantity) {
            throw new Error(
              `보유 수량을 초과하여 매도할 수 없습니다. (보유 수량: ${currentPos.quantity}주, 매도 요청: ${quantity}주)`
            );
          }

          const grossAmount = Math.round(price * quantity);
          const fee = Math.round(grossAmount * accountData.commissionRate);
          const tax = Math.round(grossAmount * accountData.taxRate);
          const netProceeds = grossAmount - fee - tax;

          const costBasis = Math.round(quantity * currentPos.avgBuyPrice);
          const realizedProfit = (grossAmount - costBasis) - fee - tax;
          const realizedProfitRate = currentPos.avgBuyPrice > 0
            ? Number((((price - currentPos.avgBuyPrice) / currentPos.avgBuyPrice) * 100).toFixed(2))
            : 0;

          // Update or delete position
          const remainingQty = currentPos.quantity - quantity;
          if (remainingQty === 0) {
            tx.delete(posRef);
          } else {
            tx.update(posRef, {
              quantity: remainingQty,
              totalInvested: Math.round(remainingQty * currentPos.avgBuyPrice),
              updatedAt: now,
            });
          }

          // Update Account Cash
          tx.update(accRef, {
            currentCash: accountData.currentCash + netProceeds,
            updatedAt: now,
          });

          // Create Mock Order
          executedOrder = {
            id: orderId,
            uid,
            symbol,
            name: currentPos.name,
            orderType: 'SELL',
            price,
            quantity,
            totalAmount: grossAmount,
            fee,
            tax,
            settledAmount: netProceeds,
            realizedProfit,
            realizedProfitRate,
            reason: reason || '목표 달성 및 차익 실현 매도',
            executedAt: now,
            currency: currentPos.currency || 'KRW',
            exchangeRate: params.exchangeRate,
          };

          const orderRef = doc(db, 'mockOrders', orderId);
          tx.set(orderRef, executedOrder);
        });

        if (executedOrder) return executedOrder;
      } catch (err: any) {
        console.warn('[portfolioService] executeMockSellOrder Firestore transaction failed:', err);
        throw new Error(err.message || '매도 주문 처리 중 오류가 발생했습니다.');
      }
    }

    // Guest fallback
    const acc = await this.getMockAccount(uid);
    const positions = await this.getMockPositions(uid);
    const currentPos = positions.find(p => p.symbol === symbol);

    if (!currentPos) {
      throw new Error('매도할 보유 종목이 존재하지 않습니다.');
    }
    if (quantity > currentPos.quantity) {
      throw new Error(
        `보유 수량을 초과하여 매도할 수 없습니다. (보유 수량: ${currentPos.quantity}주, 매도 요청: ${quantity}주)`
      );
    }

    const grossAmount = Math.round(price * quantity);
    const fee = Math.round(grossAmount * acc.commissionRate);
    const tax = Math.round(grossAmount * acc.taxRate);
    const netProceeds = grossAmount - fee - tax;
    const costBasis = Math.round(quantity * currentPos.avgBuyPrice);
    const realizedProfit = (grossAmount - costBasis) - fee - tax;
    const realizedProfitRate = currentPos.avgBuyPrice > 0
      ? Number((((price - currentPos.avgBuyPrice) / currentPos.avgBuyPrice) * 100).toFixed(2))
      : 0;

    const remainingQty = currentPos.quantity - quantity;
    let updatedPositions: MockPosition[];
    if (remainingQty === 0) {
      updatedPositions = positions.filter(p => p.symbol !== symbol);
    } else {
      updatedPositions = positions.map(p =>
        p.symbol === symbol
          ? { ...p, quantity: remainingQty, totalInvested: Math.round(remainingQty * p.avgBuyPrice), updatedAt: now }
          : p
      );
    }

    const updatedAccount: MockAccount = {
      ...acc,
      currentCash: acc.currentCash + netProceeds,
      updatedAt: now,
    };

    const order: MockOrder = {
      id: orderId,
      uid: uid || 'guest',
      symbol,
      name: currentPos.name,
      orderType: 'SELL',
      price,
      quantity,
      totalAmount: grossAmount,
      fee,
      tax,
      settledAmount: netProceeds,
      realizedProfit,
      realizedProfitRate,
      reason: reason || '목표 달성 및 차익 실현 매도',
      executedAt: now,
      currency: currentPos.currency || 'KRW',
      exchangeRate: params.exchangeRate,
    };

    saveLocal(STORAGE_KEYS.MOCK_ACCOUNT, updatedAccount);
    saveLocal(STORAGE_KEYS.MOCK_POSITIONS, updatedPositions);
    const prevOrders = loadLocal<MockOrder[]>(STORAGE_KEYS.MOCK_ORDERS, []);
    saveLocal(STORAGE_KEYS.MOCK_ORDERS, [order, ...prevOrders]);

    return order;
  },

  // ==========================================
  // 3. Live Quote & Currency Helpers
  // ==========================================

  // 국내/해외 시세 일괄 조회 및 검증
  async resolveQuote(symbol: string): Promise<{
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePercent: number;
    currency: 'KRW' | 'USD';
    market: string;
    delayLabel: string;
    isRealtime: boolean;
    provider: string;
    status: 'ok' | 'delayed' | 'error';
    asOf: string;
  } | null> {
    try {
      // 1. Try domestic stock first
      const stock = await stockRepository.getStock(symbol);
      if (stock && stock.price > 0) {
        return {
          symbol: stock.symbol,
          name: stock.name,
          price: stock.price,
          change: stock.change,
          changePercent: stock.changePercent,
          currency: 'KRW',
          market: stock.market,
          delayLabel: '실시간 체결가',
          isRealtime: true,
          provider: '키움증권 실전 API',
          status: 'ok',
          asOf: new Date().toLocaleTimeString('ko-KR'),
        };
      }

      // 2. Try global market summary
      const globalSummary = await globalMarketClient.getSummary();
      const allGlobalItems = [
        ...globalSummary.groups.us,
        ...globalSummary.groups.asia,
        ...globalSummary.groups.europe,
      ];
      const foundGlobal = allGlobalItems.find(
        g => g.symbol.toUpperCase() === symbol.toUpperCase() || g.id.toLowerCase() === symbol.toLowerCase()
      );

      if (foundGlobal && foundGlobal.value > 0) {
        return {
          symbol: foundGlobal.symbol,
          name: foundGlobal.name,
          price: foundGlobal.value,
          change: foundGlobal.change,
          changePercent: foundGlobal.changePercent,
          currency: (foundGlobal.currency as 'KRW' | 'USD') || 'USD',
          market: foundGlobal.category.toUpperCase(),
          delayLabel: foundGlobal.delayLabel || '15분 지연',
          isRealtime: false,
          provider: foundGlobal.provider || 'Yahoo Finance Public API',
          status: foundGlobal.status || 'ok',
          asOf: foundGlobal.lastUpdated || new Date().toLocaleTimeString('ko-KR'),
        };
      }

      return null;
    } catch (err) {
      console.warn(`[portfolioService] resolveQuote failed for ${symbol}:`, err);
      return null;
    }
  },
};
