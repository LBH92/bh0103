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
  MockOrderFill,
  TradingFeeSettings,
  Stock,
  OrderBook
} from '../types';
import { stockRepository } from './stockRepository';
import { globalMarketClient } from './globalMarketClient';
import { validateMarketTradingHours } from '../utils/marketHours';

const STORAGE_KEYS = {
  VIRTUAL_HOLDINGS: 'bd_virtual_holdings',
  VIRTUAL_TRADES: 'bd_virtual_trades',
  MOCK_ACCOUNT: 'bd_mock_account',
  MOCK_POSITIONS: 'bd_mock_positions',
  MOCK_ORDERS: 'bd_mock_orders',
};

const DEFAULT_INITIAL_CASH = 100000000; // 1억 원 (KRW)
const DEFAULT_INITIAL_CASH_USD = 100000; // 10만 달러 (USD)
const DEFAULT_COMMISSION_RATE = 0.00015; // 0.015%
const DEFAULT_TAX_RATE = 0.0018; // 0.18%

// In-Memory Idempotency Cache to prevent duplicate submissions & double clicks
const idempotencyCache = new Map<string, { order: MockOrder; timestamp: number }>();

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
      initialBalanceUsd: DEFAULT_INITIAL_CASH_USD,
      currentCashUsd: DEFAULT_INITIAL_CASH_USD,
      commissionRate: DEFAULT_COMMISSION_RATE,
      taxRate: DEFAULT_TAX_RATE,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!uid) {
      const local = loadLocal<MockAccount>(STORAGE_KEYS.MOCK_ACCOUNT, defaultAcc);
      return {
        ...defaultAcc,
        ...local,
        currentCashUsd: local.currentCashUsd ?? DEFAULT_INITIAL_CASH_USD,
        initialBalanceUsd: local.initialBalanceUsd ?? DEFAULT_INITIAL_CASH_USD,
      };
    }

    try {
      const ref = doc(db, 'mockAccounts', uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data() as MockAccount;
        return {
          ...defaultAcc,
          ...data,
          currentCashUsd: data.currentCashUsd ?? DEFAULT_INITIAL_CASH_USD,
          initialBalanceUsd: data.initialBalanceUsd ?? DEFAULT_INITIAL_CASH_USD,
        };
      }
      // Initialize account for user
      await setDoc(ref, defaultAcc);
      return defaultAcc;
    } catch (err) {
      console.warn('[portfolioService] getMockAccount error, using local fallback:', err);
      const local = loadLocal<MockAccount>(`${STORAGE_KEYS.MOCK_ACCOUNT}_${uid}`, defaultAcc);
      return {
        ...defaultAcc,
        ...local,
        currentCashUsd: local.currentCashUsd ?? DEFAULT_INITIAL_CASH_USD,
        initialBalanceUsd: local.initialBalanceUsd ?? DEFAULT_INITIAL_CASH_USD,
      };
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
      initialBalanceUsd: DEFAULT_INITIAL_CASH_USD,
      currentCashUsd: DEFAULT_INITIAL_CASH_USD,
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

  // 모의 매수 주문 실행 (실제 호가 10단계 매수 잔량 순차 소진 Walking the book, 통화 분리, 거래시간 및 신선도 검증)
  async executeMockBuyOrder(
    uid: string | undefined,
    params: {
      symbol: string;
      name: string;
      market: string;
      currency?: 'KRW' | 'USD';
      orderKind?: 'MARKET' | 'LIMIT';
      price: number;
      quantity: number;
      reason?: string;
      exchangeRate?: number;
      idempotencyKey?: string;
      quoteTimestamp?: number | string;
    }
  ): Promise<MockOrder> {
    const { symbol, name, market, price, quantity, reason, orderKind = 'LIMIT', idempotencyKey, quoteTimestamp } = params;
    const currency = params.currency || (market === 'US' || market === 'GLOBAL' ? 'USD' : 'KRW');
    const isUSD = currency === 'USD';

    // 0. Idempotency Check (중복 주문 및 더블 클릭 방지)
    if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
      const cached = idempotencyCache.get(idempotencyKey)!;
      if (Date.now() - cached.timestamp < 10000) {
        return cached.order;
      }
    }

    if (price <= 0 || !Number.isFinite(price)) {
      throw new Error('유효한 주문 가격을 입력해주세요.');
    }
    if (quantity <= 0 || !Number.isInteger(quantity)) {
      throw new Error('주문 수량은 1주 이상의 정수여야 합니다.');
    }

    // 1. 시세 신선도 검증 (1분 이상 지연된 stale 데이터 체결 금지)
    if (quoteTimestamp) {
      const quoteTime = typeof quoteTimestamp === 'number' ? quoteTimestamp : new Date(quoteTimestamp).getTime();
      if (!isNaN(quoteTime)) {
        const ageMs = Date.now() - quoteTime;
        if (ageMs > 60000) {
          throw new Error(`시세 데이터가 1분 이상 지연되어 체결할 수 없습니다. (${Math.round(ageMs / 1000)}초 전 시세). 실시간 시세를 새로고침해주세요.`);
        }
      }
    }

    // 2. 거래시간 검증: KRX(09:00~15:30), US(09:30~16:00 EST/EDT)
    const tradingHours = validateMarketTradingHours(market, orderKind);
    if (!tradingHours.canExecuteNow && !tradingHours.canQueuePending) {
      throw new Error(tradingHours.message);
    }
    const isPendingOrder = !tradingHours.canExecuteNow;

    const now = new Date().toISOString();
    const orderId = `morder_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const positionDocId = uid ? `${uid}_${symbol}` : `pos_${symbol}`;

    // 3. 실제 호가창 조회 및 10단계 매도 잔량 순차 소진 (Walking the book)
    let orderBook: OrderBook | null = null;
    try {
      orderBook = await stockRepository.getOrderBook(symbol);
    } catch {
      orderBook = null;
    }

    const rawAsks = (orderBook?.asks || []).filter(a => a.price > 0);
    const sortedAsks = [...rawAsks].sort((a, b) => a.price - b.price);
    const bestAskPrice = sortedAsks[0]?.price || orderBook?.bestAskPrice || price;

    let fills: MockOrderFill[] = [];
    let filledQty = 0;
    let unfilledQty = quantity;
    let totalExecutedAmount = 0;
    let executionStatus: 'FILLED' | 'PARTIALLY_FILLED' | 'PENDING' = 'PENDING';

    if (isPendingOrder) {
      // 거래시간 외 또는 정규장 전 지정가 대기 접수
      executionStatus = 'PENDING';
      filledQty = 0;
      unfilledQty = quantity;
    } else if (orderKind === 'LIMIT' && price < bestAskPrice) {
      // 지정가 매수 희망가가 최우선 매도호가(Ask 1)보다 낮아 체결 불가 -> 대기(PENDING) 등록
      executionStatus = 'PENDING';
      filledQty = 0;
      unfilledQty = quantity;
    } else {
      // 시장가 또는 지정가 체결 조건 충족 (호가창 순차 소진)
      // 호가 조회 실패, 잔량 없음, 또는 유효하지 않은 호가인 경우 가짜 입력 가격으로 체결하지 않고 미체결(PENDING) 유지 또는 거절
      if (sortedAsks.length > 0) {
        for (let i = 0; i < sortedAsks.length; i++) {
          const ask = sortedAsks[i];
          // 지정가 매수는 매도호가가 지정가 이하일 때만 체결
          if (orderKind === 'LIMIT' && ask.price > price) break;
          // 호가 잔량이 0 이하이면 체결하지 않음
          if (ask.volume <= 0) continue;

          const availableVol = ask.volume;
          const takeQty = Math.min(unfilledQty, availableVol);
          if (takeQty > 0) {
            fills.push({
              price: ask.price,
              quantity: takeQty,
              amount: takeQty * ask.price,
              level: i + 1,
              executedAt: now,
            });
            totalExecutedAmount += takeQty * ask.price;
            filledQty += takeQty;
            unfilledQty -= takeQty;
          }
          if (unfilledQty === 0) break;
        }
      } else {
        // 호가 데이터 미수신 또는 유효 잔량 부재: 임의 입력가로 체결하지 않고 시장가는 거절, 지정가는 대기(PENDING) 유지
        if (orderKind === 'MARKET') {
          throw new Error('실시간 매도 호가 잔량을 확인할 수 없어 시장가 주문이 거절되었습니다. 호가창을 새로고침해주세요.');
        }
        executionStatus = 'PENDING';
        filledQty = 0;
        unfilledQty = quantity;
      }

      if (sortedAsks.length > 0) {
        executionStatus = unfilledQty === 0 ? 'FILLED' : filledQty > 0 ? 'PARTIALLY_FILLED' : 'PENDING';
      }
    }

    const avgFilledPrice = filledQty > 0
      ? (isUSD ? Number((totalExecutedAmount / filledQty).toFixed(2)) : Math.round(totalExecutedAmount / filledQty))
      : price;
    const executedGross = totalExecutedAmount;

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
              initialBalanceUsd: DEFAULT_INITIAL_CASH_USD,
              currentCashUsd: DEFAULT_INITIAL_CASH_USD,
              commissionRate: DEFAULT_COMMISSION_RATE,
              taxRate: DEFAULT_TAX_RATE,
              createdAt: now,
              updatedAt: now,
            };
          } else {
            accountData = accSnap.data() as MockAccount;
          }

          // 통화 분리 검증 (KRW vs USD)
          const availableCash = isUSD 
            ? (accountData.currentCashUsd ?? DEFAULT_INITIAL_CASH_USD) 
            : accountData.currentCash;
          const fee = isUSD 
            ? Number((executedGross * accountData.commissionRate).toFixed(2)) 
            : Math.round(executedGross * accountData.commissionRate);
          const requiredCash = isUSD ? Number((executedGross + fee).toFixed(2)) : (executedGross + fee);

          if (filledQty > 0 && requiredCash > availableCash) {
            throw new Error(
              `가상 현금이 부족합니다. (필요: ${isUSD ? '$' + requiredCash.toLocaleString() : requiredCash.toLocaleString() + '원'}, 보유: ${isUSD ? '$' + availableCash.toLocaleString() : availableCash.toLocaleString() + '원'})`
            );
          }

          // Check existing position
          const posRef = doc(db, 'mockHoldings', positionDocId);
          const posSnap = await tx.get(posRef);

          if (filledQty > 0) {
            if (posSnap.exists()) {
              const currentPos = posSnap.data() as MockPosition;
              const newQty = currentPos.quantity + filledQty;
              const newAvgPrice = isUSD
                ? Number((((currentPos.quantity * currentPos.avgBuyPrice) + executedGross) / newQty).toFixed(2))
                : Math.round(((currentPos.quantity * currentPos.avgBuyPrice) + executedGross) / newQty);
              tx.update(posRef, {
                quantity: newQty,
                avgBuyPrice: newAvgPrice,
                totalInvested: isUSD ? Number((newQty * newAvgPrice).toFixed(2)) : Math.round(newQty * newAvgPrice),
                updatedAt: now,
              });
            } else {
              const newPos: MockPosition = {
                id: positionDocId,
                uid,
                symbol,
                name,
                market,
                currency,
                quantity: filledQty,
                avgBuyPrice: avgFilledPrice,
                totalInvested: executedGross,
                updatedAt: now,
              };
              tx.set(posRef, newPos);
            }
          }

          // Update Account Cash (통화 분리 반영)
          if (filledQty > 0) {
            const updatedAccount: MockAccount = {
              ...accountData,
              currentCash: isUSD ? accountData.currentCash : accountData.currentCash - requiredCash,
              currentCashUsd: isUSD ? Number(((accountData.currentCashUsd ?? DEFAULT_INITIAL_CASH_USD) - requiredCash).toFixed(2)) : (accountData.currentCashUsd ?? DEFAULT_INITIAL_CASH_USD),
              updatedAt: now,
            };
            tx.set(accRef, updatedAccount, { merge: true });
          }

          // Create Mock Order
          executedOrder = {
            id: orderId,
            uid,
            symbol,
            name,
            orderType: 'BUY',
            orderKind,
            status: executionStatus,
            price: avgFilledPrice,
            quantity: filledQty > 0 ? filledQty : quantity,
            requestedQuantity: quantity,
            filledQuantity: filledQty,
            unfilledQuantity: unfilledQty,
            totalAmount: executedGross,
            fee: filledQty > 0 ? fee : 0,
            tax: 0,
            settledAmount: filledQty > 0 ? requiredCash : 0,
            reason: reason || (executionStatus === 'FILLED' ? '전략 매수 체결' : executionStatus === 'PARTIALLY_FILLED' ? `호가 잔량 순차 체결 (${filledQty}/${quantity}주)` : '정규장 대기 접수'),
            executedAt: now,
            currency,
            exchangeRate: params.exchangeRate,
            idempotencyKey,
            quoteSource: isUSD ? 'Yahoo Finance API' : '키움증권 실전 API',
            quoteTimestamp: new Date().toISOString(),
            isDelayedQuote: false,
            fills,
          };

          const orderRef = doc(db, 'mockOrders', orderId);
          tx.set(orderRef, executedOrder);
        });

        if (executedOrder) {
          if (idempotencyKey) {
            idempotencyCache.set(idempotencyKey, { order: executedOrder, timestamp: Date.now() });
          }
          return executedOrder;
        }
      } catch (err: any) {
        console.warn('[portfolioService] executeMockBuyOrder Firestore transaction failed:', err);
        throw new Error(err.message || '매수 주문 처리 중 오류가 발생했습니다.');
      }
    }

    // Guest fallback (Local storage transactional simulation)
    const acc = await this.getMockAccount(uid);
    const availableCash = isUSD ? (acc.currentCashUsd ?? DEFAULT_INITIAL_CASH_USD) : acc.currentCash;
    const fee = isUSD ? Number((executedGross * acc.commissionRate).toFixed(2)) : Math.round(executedGross * acc.commissionRate);
    const requiredCash = isUSD ? Number((executedGross + fee).toFixed(2)) : (executedGross + fee);

    if (filledQty > 0 && requiredCash > availableCash) {
      throw new Error(
        `가상 현금이 부족합니다. (필요: ${isUSD ? '$' + requiredCash.toLocaleString() : requiredCash.toLocaleString() + '원'}, 보유: ${isUSD ? '$' + availableCash.toLocaleString() : availableCash.toLocaleString() + '원'})`
      );
    }

    const positions = await this.getMockPositions(uid);
    const existing = positions.find(p => p.symbol === symbol);

    let updatedPositions: MockPosition[];
    if (filledQty > 0) {
      if (existing) {
        const newQty = existing.quantity + filledQty;
        const newAvgPrice = isUSD
          ? Number((((existing.quantity * existing.avgBuyPrice) + executedGross) / newQty).toFixed(2))
          : Math.round(((existing.quantity * existing.avgBuyPrice) + executedGross) / newQty);
        const updatedItem: MockPosition = {
          ...existing,
          quantity: newQty,
          avgBuyPrice: newAvgPrice,
          totalInvested: isUSD ? Number((newQty * newAvgPrice).toFixed(2)) : Math.round(newQty * newAvgPrice),
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
          quantity: filledQty,
          avgBuyPrice: avgFilledPrice,
          totalInvested: executedGross,
          updatedAt: now,
        };
        updatedPositions = [newPos, ...positions];
      }
    } else {
      updatedPositions = positions;
    }

    const updatedAccount: MockAccount = {
      ...acc,
      currentCash: isUSD ? acc.currentCash : acc.currentCash - (filledQty > 0 ? requiredCash : 0),
      currentCashUsd: isUSD ? Number(((acc.currentCashUsd ?? DEFAULT_INITIAL_CASH_USD) - (filledQty > 0 ? requiredCash : 0)).toFixed(2)) : acc.currentCashUsd,
      updatedAt: now,
    };

    const order: MockOrder = {
      id: orderId,
      uid: uid || 'guest',
      symbol,
      name,
      orderType: 'BUY',
      orderKind,
      status: executionStatus,
      price: avgFilledPrice,
      quantity: filledQty > 0 ? filledQty : quantity,
      requestedQuantity: quantity,
      filledQuantity: filledQty,
      unfilledQuantity: unfilledQty,
      totalAmount: executedGross,
      fee: filledQty > 0 ? fee : 0,
      tax: 0,
      settledAmount: filledQty > 0 ? requiredCash : 0,
      reason: reason || (executionStatus === 'FILLED' ? '전략 매수 체결' : executionStatus === 'PARTIALLY_FILLED' ? `호가 잔량 순차 체결 (${filledQty}/${quantity}주)` : '정규장 대기 접수'),
      executedAt: now,
      currency,
      exchangeRate: params.exchangeRate,
      idempotencyKey,
      quoteSource: isUSD ? 'Yahoo Finance API' : '키움증권 실전 API',
      quoteTimestamp: new Date().toISOString(),
      isDelayedQuote: false,
      fills,
    };

    saveLocal(STORAGE_KEYS.MOCK_ACCOUNT, updatedAccount);
    saveLocal(STORAGE_KEYS.MOCK_POSITIONS, updatedPositions);
    const prevOrders = loadLocal<MockOrder[]>(STORAGE_KEYS.MOCK_ORDERS, []);
    saveLocal(STORAGE_KEYS.MOCK_ORDERS, [order, ...prevOrders]);

    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, { order, timestamp: Date.now() });
    }

    return order;
  },

  // 모의 매도 주문 실행 (실제 호가 10단계 매수 잔량 순차 소진 Walking the book, 통화 분리, 실현손익 및 정산)
  async executeMockSellOrder(
    uid: string | undefined,
    params: {
      symbol: string;
      price: number;
      quantity: number;
      market?: string;
      orderKind?: 'MARKET' | 'LIMIT';
      reason?: string;
      exchangeRate?: number;
      idempotencyKey?: string;
      quoteTimestamp?: number | string;
    }
  ): Promise<MockOrder> {
    const { symbol, price, quantity, reason, orderKind = 'LIMIT', idempotencyKey, quoteTimestamp } = params;

    // 0. Idempotency Check (중복 주문 방지)
    if (idempotencyKey && idempotencyCache.has(idempotencyKey)) {
      const cached = idempotencyCache.get(idempotencyKey)!;
      if (Date.now() - cached.timestamp < 10000) {
        return cached.order;
      }
    }

    if (price <= 0 || !Number.isFinite(price)) {
      throw new Error('유효한 매도 가격을 입력해주세요.');
    }
    if (quantity <= 0 || !Number.isInteger(quantity)) {
      throw new Error('매도 수량은 1주 이상의 정수여야 합니다.');
    }

    // 1. 시세 신선도 검증
    if (quoteTimestamp) {
      const quoteTime = typeof quoteTimestamp === 'number' ? quoteTimestamp : new Date(quoteTimestamp).getTime();
      if (!isNaN(quoteTime)) {
        const ageMs = Date.now() - quoteTime;
        if (ageMs > 60000) {
          throw new Error(`시세 데이터가 1분 이상 지연되어 체결할 수 없습니다. (${Math.round(ageMs / 1000)}초 전 시세). 실시간 시세를 새로고침해주세요.`);
        }
      }
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

          const currency = currentPos.currency || 'KRW';
          const isUSD = currency === 'USD';
          const market = params.market || currentPos.market || (isUSD ? 'US' : 'KRX');

          // 거래시간 검증
          const tradingHours = validateMarketTradingHours(market, orderKind);
          if (!tradingHours.canExecuteNow && !tradingHours.canQueuePending) {
            throw new Error(tradingHours.message);
          }
          const isPendingOrder = !tradingHours.canExecuteNow;

          // 호가창 10단계 매수 잔량 순차 소진 (Walking the book)
          let orderBook: OrderBook | null = null;
          try {
            orderBook = await stockRepository.getOrderBook(symbol);
          } catch {
            orderBook = null;
          }

          const rawBids = (orderBook?.bids || []).filter(b => b.price > 0);
          const sortedBids = [...rawBids].sort((a, b) => b.price - a.price);
          const bestBidPrice = sortedBids[0]?.price || orderBook?.bestBidPrice || price;

          let fills: MockOrderFill[] = [];
          let filledQty = 0;
          let unfilledQty = quantity;
          let totalExecutedAmount = 0;
          let executionStatus: 'FILLED' | 'PARTIALLY_FILLED' | 'PENDING' = 'PENDING';

          if (isPendingOrder) {
            executionStatus = 'PENDING';
            filledQty = 0;
            unfilledQty = quantity;
          } else if (orderKind === 'LIMIT' && price > bestBidPrice) {
            // 지정가 매도 희망가가 최우선 매수호가(Bid 1)보다 높아 체결 불가 -> 대기 등록
            executionStatus = 'PENDING';
            filledQty = 0;
            unfilledQty = quantity;
          } else {
            if (sortedBids.length > 0) {
              for (let i = 0; i < sortedBids.length; i++) {
                const bid = sortedBids[i];
                // 지정가 매도는 매수호가가 지정가 이상일 때만 체결
                if (orderKind === 'LIMIT' && bid.price < price) break;
                // 호가 잔량이 0 이하이면 체결하지 않음
                if (bid.volume <= 0) continue;

                const availableVol = bid.volume;
                const takeQty = Math.min(unfilledQty, availableVol);
                if (takeQty > 0) {
                  fills.push({
                    price: bid.price,
                    quantity: takeQty,
                    amount: takeQty * bid.price,
                    level: i + 1,
                    executedAt: now,
                  });
                  totalExecutedAmount += takeQty * bid.price;
                  filledQty += takeQty;
                  unfilledQty -= takeQty;
                }
                if (unfilledQty === 0) break;
              }
            } else {
              // 호가 데이터 미수신 또는 잔량 부재 시 임의 가격 체결 금지
              if (orderKind === 'MARKET') {
                throw new Error('실시간 매수 호가 잔량을 확인할 수 없어 시장가 매도 주문이 거절되었습니다. 호가창을 새로고침해주세요.');
              }
              executionStatus = 'PENDING';
              filledQty = 0;
              unfilledQty = quantity;
            }

            if (sortedBids.length > 0) {
              executionStatus = unfilledQty === 0 ? 'FILLED' : filledQty > 0 ? 'PARTIALLY_FILLED' : 'PENDING';
            }
          }

          const avgFilledPrice = filledQty > 0
            ? (isUSD ? Number((totalExecutedAmount / filledQty).toFixed(2)) : Math.round(totalExecutedAmount / filledQty))
            : price;
          const grossAmount = totalExecutedAmount;

          const fee = isUSD ? Number((grossAmount * accountData.commissionRate).toFixed(2)) : Math.round(grossAmount * accountData.commissionRate);
          const tax = isUSD ? 0 : Math.round(grossAmount * accountData.taxRate);
          const netProceeds = isUSD ? Number((grossAmount - fee - tax).toFixed(2)) : (grossAmount - fee - tax);

          const costBasis = isUSD ? Number((filledQty * currentPos.avgBuyPrice).toFixed(2)) : Math.round(filledQty * currentPos.avgBuyPrice);
          const realizedProfit = filledQty > 0 ? (isUSD ? Number(((grossAmount - costBasis) - fee - tax).toFixed(2)) : ((grossAmount - costBasis) - fee - tax)) : 0;
          const realizedProfitRate = currentPos.avgBuyPrice > 0 && filledQty > 0
            ? Number((((avgFilledPrice - currentPos.avgBuyPrice) / currentPos.avgBuyPrice) * 100).toFixed(2))
            : 0;

          // Update or delete position
          if (filledQty > 0) {
            const remainingQty = currentPos.quantity - filledQty;
            if (remainingQty === 0) {
              tx.delete(posRef);
            } else {
              tx.update(posRef, {
                quantity: remainingQty,
                totalInvested: isUSD ? Number((remainingQty * currentPos.avgBuyPrice).toFixed(2)) : Math.round(remainingQty * currentPos.avgBuyPrice),
                updatedAt: now,
              });
            }

            // Update Account Cash (통화 분리 반영)
            tx.update(accRef, {
              currentCash: isUSD ? accountData.currentCash : accountData.currentCash + netProceeds,
              currentCashUsd: isUSD ? Number(((accountData.currentCashUsd ?? DEFAULT_INITIAL_CASH_USD) + netProceeds).toFixed(2)) : accountData.currentCashUsd,
              updatedAt: now,
            });
          }

          // Create Mock Order
          executedOrder = {
            id: orderId,
            uid,
            symbol,
            name: currentPos.name,
            orderType: 'SELL',
            orderKind,
            status: executionStatus,
            price: avgFilledPrice,
            quantity: filledQty > 0 ? filledQty : quantity,
            requestedQuantity: quantity,
            filledQuantity: filledQty,
            unfilledQuantity: unfilledQty,
            totalAmount: grossAmount,
            fee: filledQty > 0 ? fee : 0,
            tax: filledQty > 0 ? tax : 0,
            settledAmount: filledQty > 0 ? netProceeds : 0,
            realizedProfit: filledQty > 0 ? realizedProfit : undefined,
            realizedProfitRate: filledQty > 0 ? realizedProfitRate : undefined,
            reason: reason || (executionStatus === 'FILLED' ? '목표 달성 및 차익 실현 매도' : executionStatus === 'PARTIALLY_FILLED' ? `호가 잔량 순차 체결 (${filledQty}/${quantity}주)` : '정규장 대기 접수'),
            executedAt: now,
            currency,
            exchangeRate: params.exchangeRate,
            idempotencyKey,
            quoteSource: isUSD ? 'Yahoo Finance API' : '키움증권 실전 API',
            quoteTimestamp: new Date().toISOString(),
            isDelayedQuote: false,
            fills,
          };

          const orderRef = doc(db, 'mockOrders', orderId);
          tx.set(orderRef, executedOrder);
        });

        if (executedOrder) {
          if (idempotencyKey) {
            idempotencyCache.set(idempotencyKey, { order: executedOrder, timestamp: Date.now() });
          }
          return executedOrder;
        }
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

    const currency = currentPos.currency || 'KRW';
    const isUSD = currency === 'USD';
    const grossAmount = isUSD ? Number((price * quantity).toFixed(2)) : Math.round(price * quantity);
    const fee = isUSD ? Number((grossAmount * acc.commissionRate).toFixed(2)) : Math.round(grossAmount * acc.commissionRate);
    const tax = isUSD ? 0 : Math.round(grossAmount * acc.taxRate);
    const netProceeds = isUSD ? Number((grossAmount - fee - tax).toFixed(2)) : (grossAmount - fee - tax);
    const costBasis = isUSD ? Number((quantity * currentPos.avgBuyPrice).toFixed(2)) : Math.round(quantity * currentPos.avgBuyPrice);
    const realizedProfit = isUSD ? Number(((grossAmount - costBasis) - fee - tax).toFixed(2)) : ((grossAmount - costBasis) - fee - tax);
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
          ? {
              ...p,
              quantity: remainingQty,
              totalInvested: isUSD ? Number((remainingQty * p.avgBuyPrice).toFixed(2)) : Math.round(remainingQty * p.avgBuyPrice),
              updatedAt: now,
            }
          : p
      );
    }

    const updatedAccount: MockAccount = {
      ...acc,
      currentCash: isUSD ? acc.currentCash : acc.currentCash + netProceeds,
      currentCashUsd: isUSD ? Number(((acc.currentCashUsd ?? DEFAULT_INITIAL_CASH_USD) + netProceeds).toFixed(2)) : acc.currentCashUsd,
      updatedAt: now,
    };

    const order: MockOrder = {
      id: orderId,
      uid: uid || 'guest',
      symbol,
      name: currentPos.name,
      orderType: 'SELL',
      orderKind,
      status: 'FILLED',
      price,
      quantity,
      requestedQuantity: quantity,
      filledQuantity: quantity,
      unfilledQuantity: 0,
      totalAmount: grossAmount,
      fee,
      tax,
      settledAmount: netProceeds,
      realizedProfit,
      realizedProfitRate,
      reason: reason || '목표 달성 및 차익 실현 매도',
      executedAt: now,
      currency,
      exchangeRate: params.exchangeRate,
      idempotencyKey,
      quoteSource: isUSD ? 'Yahoo Finance API' : '키움증권 실전 API',
      quoteTimestamp: new Date().toISOString(),
      isDelayedQuote: false,
    };

    saveLocal(STORAGE_KEYS.MOCK_ACCOUNT, updatedAccount);
    saveLocal(STORAGE_KEYS.MOCK_POSITIONS, updatedPositions);
    const prevOrders = loadLocal<MockOrder[]>(STORAGE_KEYS.MOCK_ORDERS, []);
    saveLocal(STORAGE_KEYS.MOCK_ORDERS, [order, ...prevOrders]);

    if (idempotencyKey) {
      idempotencyCache.set(idempotencyKey, { order, timestamp: Date.now() });
    }

    return order;
  },

  // ==========================================
  // 3. Live Quote & Currency Helpers
  // ==========================================

  // 국내/해외 시세 일괄 조회 및 검증 (호가 기준가 및 신선도 타임스탬프 포함)
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
    quoteTimestamp: number;
    bestAskPrice?: number;
    bestBidPrice?: number;
  } | null> {
    try {
      // 1. Try domestic stock first
      const stock = await stockRepository.getStock(symbol);
      if (stock && stock.price > 0) {
        let bestAskPrice = stock.price;
        let bestBidPrice = stock.price;
        try {
          const ob = await stockRepository.getOrderBook(symbol);
          if (ob) {
            bestAskPrice = ob.bestAskPrice || (ob.asks?.length ? ob.asks[ob.asks.length - 1].price : stock.price);
            bestBidPrice = ob.bestBidPrice || (ob.bids?.length ? ob.bids[0].price : stock.price);
          }
        } catch {
          // fallback to stock.price
        }

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
          quoteTimestamp: Date.now(),
          bestAskPrice,
          bestBidPrice,
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
          quoteTimestamp: Date.now(),
          bestAskPrice: foundGlobal.value,
          bestBidPrice: foundGlobal.value,
        };
      }

      return null;
    } catch (err) {
      console.warn(`[portfolioService] resolveQuote failed for ${symbol}:`, err);
      return null;
    }
  },
};
