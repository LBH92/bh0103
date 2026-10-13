import React, { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, DollarSign, AlertCircle, Check, Info, ShieldAlert } from 'lucide-react';
import { MockAccount, MockPosition, Stock } from '../../types';
import { portfolioService } from '../../services/portfolioService';
import { useApp } from '../../context/AppContext';

interface MockTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  stockName?: string;
  defaultPrice?: number;
  initialType?: 'BUY' | 'SELL';
  onTradeSuccess?: () => void;
}

export const MockTradeModal: React.FC<MockTradeModalProps> = ({
  isOpen,
  onClose,
  symbol,
  stockName,
  defaultPrice,
  initialType = 'BUY',
  onTradeSuccess,
}) => {
  const { user, showToast, exchangeRate } = useApp();

  const [orderType, setOrderType] = useState<'BUY' | 'SELL'>(initialType);
  const [orderKind, setOrderKind] = useState<'LIMIT' | 'MARKET'>('LIMIT');
  const [account, setAccount] = useState<MockAccount | null>(null);
  const [positions, setPositions] = useState<MockPosition[]>([]);
  const [currentHolding, setCurrentHolding] = useState<MockPosition | null>(null);

  // Quote State
  const [quote, setQuote] = useState<{
    price: number;
    name: string;
    currency: 'KRW' | 'USD';
    delayLabel: string;
    isRealtime: boolean;
    provider: string;
    status: 'ok' | 'delayed' | 'error';
    asOf: string;
    quoteTimestamp?: number;
    bestAskPrice?: number;
    bestBidPrice?: number;
  } | null>(null);

  const [inputPrice, setInputPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('1');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen && symbol) {
      setErrorMsg('');
      setIsSubmitting(false);
      setOrderType(initialType);
      setOrderKind('LIMIT');
      setQuantity('1');
      setReason('');

      // 1. Load account and positions
      portfolioService.getMockAccount(user?.id).then(setAccount);
      portfolioService.getMockPositions(user?.id).then(pos => {
        setPositions(pos);
        const match = pos.find(p => p.symbol === symbol);
        setCurrentHolding(match || null);
      });

      // 2. Resolve quote
      portfolioService.resolveQuote(symbol).then(q => {
        if (q) {
          setQuote(q);
          setInputPrice(String(q.price));
        } else if (defaultPrice) {
          setQuote({
            price: defaultPrice,
            name: stockName || symbol,
            currency: 'KRW',
            delayLabel: '체결가',
            isRealtime: true,
            provider: '키움 실전 API',
            status: 'ok',
            asOf: new Date().toLocaleTimeString('ko-KR'),
            quoteTimestamp: Date.now(),
            bestAskPrice: defaultPrice,
            bestBidPrice: defaultPrice,
          });
          setInputPrice(String(defaultPrice));
        }
      });
    }
  }, [isOpen, symbol, initialType, defaultPrice, stockName, user?.id]);

  if (!isOpen) return null;

  const isUSD = quote?.currency === 'USD';
  const currencySymbol = isUSD ? '$' : '원';

  const bestAsk = quote?.bestAskPrice || quote?.price || defaultPrice || 0;
  const bestBid = quote?.bestBidPrice || quote?.price || defaultPrice || 0;

  const numPrice = orderKind === 'MARKET'
    ? (orderType === 'BUY' ? bestAsk : bestBid)
    : (parseFloat(inputPrice) || 0);

  const numQty = parseInt(quantity, 10) || 0;
  const grossAmount = isUSD ? Number((numPrice * numQty).toFixed(2)) : Math.round(numPrice * numQty);

  const commissionRate = account?.commissionRate ?? 0.00015;
  const taxRate = account?.taxRate ?? 0.0018;

  const fee = isUSD ? Number((grossAmount * commissionRate).toFixed(2)) : Math.round(grossAmount * commissionRate);
  const tax = orderType === 'SELL' ? (isUSD ? 0 : Math.round(grossAmount * taxRate)) : 0;
  const totalSettled = orderType === 'BUY' 
    ? (isUSD ? Number((grossAmount + fee).toFixed(2)) : grossAmount + fee) 
    : (isUSD ? Number((grossAmount - fee - tax).toFixed(2)) : grossAmount - fee - tax);

  const availableCash = isUSD 
    ? (account?.currentCashUsd ?? 100000) 
    : (account?.currentCash ?? 0);
  const holdingQty = currentHolding?.quantity ?? 0;

  // Max buy qty calculation
  const maxBuyQty = numPrice > 0 ? Math.floor(availableCash / (numPrice * (1 + commissionRate))) : 0;

  const handleExecuteTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (numPrice <= 0) {
      setErrorMsg('유효한 주문 가격을 입력해주세요.');
      return;
    }
    if (numQty <= 0) {
      setErrorMsg('주문 수량은 1주 이상이어야 합니다.');
      return;
    }

    if (orderType === 'BUY' && totalSettled > availableCash) {
      setErrorMsg(`가상 ${isUSD ? '외화(USD)' : '원화(KRW)'} 잔고가 부족합니다. (필요: ${isUSD ? '$' : ''}${totalSettled.toLocaleString()}${isUSD ? '' : '원'}, 보유: ${isUSD ? '$' : ''}${availableCash.toLocaleString()}${isUSD ? '' : '원'})`);
      return;
    }

    if (orderType === 'SELL' && numQty > holdingQty) {
      setErrorMsg(`보유 수량(${holdingQty}주)을 초과하여 매도할 수 없습니다.`);
      return;
    }

    setIsSubmitting(true);
    const idempotencyKey = `mock_ord_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    try {
      if (orderType === 'BUY') {
        const order = await portfolioService.executeMockBuyOrder(user?.id, {
          symbol,
          name: quote?.name || stockName || symbol,
          market: quote?.currency === 'USD' ? 'US' : 'KOSPI',
          currency: quote?.currency || 'KRW',
          orderKind,
          price: numPrice,
          quantity: numQty,
          reason,
          exchangeRate: exchangeRate?.rate,
          idempotencyKey,
          quoteTimestamp: quote?.quoteTimestamp,
        });

        if (order.status === 'FILLED') {
          showToast(`'${quote?.name || symbol}' ${order.quantity}주 전량 매수 체결되었습니다. (${isUSD ? '$' : ''}${order.price.toLocaleString()}${isUSD ? '' : '원'})`, 'success');
        } else if (order.status === 'PARTIALLY_FILLED') {
          showToast(`'${quote?.name || symbol}' ${order.filledQuantity}주 부분 체결, ${order.unfilledQuantity}주 미체결 잔량 대기.`, 'info');
        } else {
          showToast(`'${quote?.name || symbol}' ${numQty}주 매수 주문이 대기(PENDING) 상태로 안전하게 접수되었습니다.`, 'info');
        }
      } else {
        const order = await portfolioService.executeMockSellOrder(user?.id, {
          symbol,
          market: quote?.currency === 'USD' ? 'US' : 'KOSPI',
          orderKind,
          price: numPrice,
          quantity: numQty,
          reason,
          exchangeRate: exchangeRate?.rate,
          idempotencyKey,
          quoteTimestamp: quote?.quoteTimestamp,
        });

        if (order.status === 'FILLED') {
          showToast(`'${quote?.name || symbol}' ${order.quantity}주 전량 매도 체결되었습니다. (${isUSD ? '$' : ''}${order.price.toLocaleString()}${isUSD ? '' : '원'})`, 'info');
        } else if (order.status === 'PARTIALLY_FILLED') {
          showToast(`'${quote?.name || symbol}' ${order.filledQuantity}주 부분 매도 체결되었습니다.`, 'info');
        } else {
          showToast(`'${quote?.name || symbol}' ${numQty}주 매도 주문이 대기(PENDING) 상태로 안전하게 접수되었습니다.`, 'info');
        }
      }

      onTradeSuccess?.();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || '모의 주문 체결 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base text-slate-900 dark:text-white">
                {quote?.name || stockName || symbol}
              </span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                {symbol}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                {quote?.provider || '키움 실전 API'}
              </span>
              <span>•</span>
              <span className="font-mono">{quote?.delayLabel || '실시간'}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Buy / Sell Tab Switcher */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-100 dark:bg-slate-800/80 m-4 mb-2 rounded-xl">
          <button
            type="button"
            onClick={() => {
              setOrderType('BUY');
              setErrorMsg('');
            }}
            className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              orderType === 'BUY'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>가상 매수</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOrderType('SELL');
              setErrorMsg('');
            }}
            className={`py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              orderType === 'SELL'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            <span>가상 매도</span>
          </button>
        </div>

        {/* Order Kind: 지정가 vs 시장가 */}
        <div className="flex items-center justify-between px-4 py-1 text-xs">
          <span className="font-bold text-slate-600 dark:text-slate-400">주문 유형</span>
          <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setOrderKind('LIMIT')}
              className={`px-3 py-1 rounded-md font-bold transition-colors ${
                orderKind === 'LIMIT'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              지정가
            </button>
            <button
              type="button"
              onClick={() => {
                setOrderKind('MARKET');
                setInputPrice(String(orderType === 'BUY' ? bestAsk : bestBid));
              }}
              className={`px-3 py-1 rounded-md font-bold transition-colors ${
                orderKind === 'MARKET'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              시장가 (호가 체결)
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleExecuteTrade} className="p-4 space-y-3.5">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Account Balance / Available Info Box */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs font-mono">
            <div>
              <span className="text-[11px] text-slate-400 block font-sans">
                {orderType === 'BUY' ? `주문 가능 현금 (${isUSD ? 'USD' : 'KRW'})` : '현재 보유 수량'}
              </span>
              <span className="font-bold text-slate-900 dark:text-white text-sm">
                {orderType === 'BUY'
                  ? `${isUSD ? '$' : ''}${availableCash.toLocaleString()}${isUSD ? '' : '원'}`
                  : `${holdingQty.toLocaleString()}주`}
              </span>
            </div>
            {orderType === 'BUY' ? (
              <div className="text-right">
                <span className="text-[11px] text-slate-400 block font-sans">최대 매수 가능</span>
                <span className="font-bold text-rose-500 text-sm">
                  {maxBuyQty.toLocaleString()}주
                </span>
              </div>
            ) : (
              currentHolding && (
                <div className="text-right">
                  <span className="text-[11px] text-slate-400 block font-sans">평균 매입단가</span>
                  <span className="font-bold text-slate-900 dark:text-white text-sm">
                    {isUSD ? '$' : ''}{currentHolding.avgBuyPrice.toLocaleString()}{isUSD ? '' : '원'}
                  </span>
                </div>
              )
            )}
          </div>

          {/* Price & Quantity Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {orderKind === 'MARKET' ? `체결 기준가 (${currencySymbol})` : `주문 희망가 (${currencySymbol})`}
                </label>
                {quote?.price && orderKind === 'LIMIT' && (
                  <button
                    type="button"
                    onClick={() => setInputPrice(String(quote.price))}
                    className="text-[10px] text-rose-500 hover:underline font-bold"
                  >
                    현재가 적용
                  </button>
                )}
              </div>
              <input
                type="number"
                min="0.01"
                step="any"
                value={orderKind === 'MARKET' ? (orderType === 'BUY' ? bestAsk : bestBid) : inputPrice}
                onChange={e => setInputPrice(e.target.value)}
                disabled={orderKind === 'MARKET'}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:opacity-75 disabled:cursor-not-allowed"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  주문 수량 (주)
                </label>
                {orderType === 'BUY' && maxBuyQty > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuantity(String(maxBuyQty))}
                    className="text-[10px] text-rose-500 hover:underline font-bold"
                  >
                    최대 {maxBuyQty}주
                  </button>
                )}
                {orderType === 'SELL' && holdingQty > 0 && (
                  <button
                    type="button"
                    onClick={() => setQuantity(String(holdingQty))}
                    className="text-[10px] text-blue-500 hover:underline font-bold"
                  >
                    전량 {holdingQty}주
                  </button>
                )}
              </div>
              <input
                type="number"
                min="1"
                max={orderType === 'SELL' ? holdingQty : maxBuyQty}
                step="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              />
            </div>
          </div>

          {/* Strategy / Reason Memo */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              매매 전략 사유 / 기록 노트
            </label>
            <input
              type="text"
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="예: 20일선 지지 반등 매수, 저항선 도달 분할 매도"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Order Settlement Summary */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 text-xs font-mono space-y-1.5">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span className="font-sans">주문 총액:</span>
              <span>{grossAmount.toLocaleString()}원</span>
            </div>
            <div className="flex items-center justify-between text-slate-500 text-[11px]">
              <span className="font-sans">수수료 ({(commissionRate * 100).toFixed(3)}%):</span>
              <span>{fee.toLocaleString()}원</span>
            </div>
            {orderType === 'SELL' && (
              <div className="flex items-center justify-between text-slate-500 text-[11px]">
                <span className="font-sans">증권거래세 ({(taxRate * 100).toFixed(2)}%):</span>
                <span>{tax.toLocaleString()}원</span>
              </div>
            )}
            <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-sm font-bold">
              <span className="font-sans text-slate-900 dark:text-white">
                {orderType === 'BUY' ? '최종 필요 현금:' : '예상 입금 현금:'}
              </span>
              <span className={orderType === 'BUY' ? 'text-rose-500' : 'text-blue-500'}>
                {totalSettled.toLocaleString()}원
              </span>
            </div>
          </div>

          {/* Disclaimer */}
          <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>실제 증권 계좌 주문이 아니며, 가상 자금으로 체결되는 모의 트레이딩입니다.</span>
          </div>

          {/* Footer Submit */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md active:scale-95 ${
                orderType === 'BUY'
                  ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? '주문 체결 중...'
                  : orderType === 'BUY'
                  ? '가상 매수 주문 실행'
                  : '가상 매도 주문 실행'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
