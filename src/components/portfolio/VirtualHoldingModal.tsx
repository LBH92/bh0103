import React, { useState, useEffect } from 'react';
import { X, Plus, DollarSign, Calendar, TrendingUp, AlertCircle, Check, Search, ArrowRight, Minus } from 'lucide-react';
import { VirtualHolding, Stock } from '../../types';
import { stockRepository } from '../../services/stockRepository';
import { portfolioService } from '../../services/portfolioService';

interface VirtualHoldingModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'create' | 'add_buy' | 'sell' | 'edit';
  holding?: VirtualHolding | null;
  onSuccess: () => void;
  uid?: string;
  defaultSymbol?: string;
}

export const VirtualHoldingModal: React.FC<VirtualHoldingModalProps> = ({
  isOpen,
  onClose,
  mode,
  holding,
  onSuccess,
  uid,
  defaultSymbol,
}) => {
  // Stock Search / Select State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Stock[]>([]);
  const [selectedStock, setSelectedStock] = useState<{ symbol: string; name: string; market: string; price: number } | null>(null);

  // Form Fields
  const [price, setPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setIsSubmitting(false);

      if (holding) {
        setSelectedStock({
          symbol: holding.symbol,
          name: holding.name,
          market: holding.market,
          price: holding.avgBuyPrice,
        });
        if (mode === 'edit') {
          setPrice(String(holding.avgBuyPrice));
          setQuantity(String(holding.quantity));
          setDate(holding.buyDate || new Date().toISOString().slice(0, 10));
          setMemo(holding.memo || '');
        } else if (mode === 'add_buy') {
          setPrice(String(holding.avgBuyPrice));
          setQuantity('');
          setDate(new Date().toISOString().slice(0, 10));
          setMemo('');
        } else if (mode === 'sell') {
          setPrice(String(holding.avgBuyPrice));
          setQuantity(String(holding.quantity)); // default 100%
          setDate(new Date().toISOString().slice(0, 10));
          setMemo('');
        }
      } else if (defaultSymbol) {
        stockRepository.getStock(defaultSymbol).then(s => {
          if (s) {
            setSelectedStock({
              symbol: s.symbol,
              name: s.name,
              market: s.market,
              price: s.price,
            });
            setPrice(String(s.price));
          }
        });
        setQuantity('');
        setDate(new Date().toISOString().slice(0, 10));
        setMemo('');
      } else {
        setSelectedStock(null);
        setPrice('');
        setQuantity('');
        setDate(new Date().toISOString().slice(0, 10));
        setMemo('');
      }
    }
  }, [isOpen, mode, holding, defaultSymbol]);

  // Search stocks
  useEffect(() => {
    if (!searchQuery.trim() || mode !== 'create' || selectedStock) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      stockRepository.searchStocks({ query: searchQuery, limit: 6 }).then(res => {
        setSearchResults(res);
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery, mode, selectedStock]);

  if (!isOpen) return null;

  // Real-time calculation previews
  const numPrice = parseFloat(price) || 0;
  const numQty = parseInt(quantity, 10) || 0;

  // Preview for Additional Buy: ((currentQty * currentAvg) + (newQty * newPrice)) / (currentQty + newQty)
  let addBuyPreview = null;
  if (mode === 'add_buy' && holding && numQty > 0 && numPrice > 0) {
    const newQty = holding.quantity + numQty;
    const newAvg = Math.round(((holding.quantity * holding.avgBuyPrice) + (numQty * numPrice)) / newQty);
    addBuyPreview = {
      newQty,
      newAvg,
      diffAvg: newAvg - holding.avgBuyPrice,
      totalAmount: Math.round(numQty * numPrice),
    };
  }

  // Preview for Sell: Realized P&L
  let sellPreview = null;
  if (mode === 'sell' && holding && numQty > 0 && numPrice > 0) {
    const grossSell = Math.round(numQty * numPrice);
    const costBasis = Math.round(numQty * holding.avgBuyPrice);
    const profit = grossSell - costBasis;
    const rate = holding.avgBuyPrice > 0 ? ((numPrice - holding.avgBuyPrice) / holding.avgBuyPrice) * 100 : 0;
    sellPreview = {
      grossSell,
      profit,
      rate,
      remainingQty: holding.quantity - numQty,
    };
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedStock) {
      setErrorMsg('종목을 선택해주세요.');
      return;
    }
    if (numPrice <= 0) {
      setErrorMsg('매매 단가는 0보다 커야 합니다.');
      return;
    }
    if (numQty <= 0) {
      setErrorMsg('수량은 1주 이상이어야 합니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'create') {
        await portfolioService.saveVirtualHolding(uid, {
          symbol: selectedStock.symbol,
          name: selectedStock.name,
          market: selectedStock.market,
          avgBuyPrice: numPrice,
          quantity: numQty,
          buyDate: date,
          memo,
        });
      } else if (mode === 'add_buy' && holding) {
        await portfolioService.addBuyVirtualHolding(uid, holding.id, numQty, numPrice, date, memo);
      } else if (mode === 'sell' && holding) {
        if (numQty > holding.quantity) {
          throw new Error(`보유 수량(${holding.quantity}주)을 초과하여 매도할 수 없습니다.`);
        }
        await portfolioService.sellVirtualHolding(uid, holding.id, numQty, numPrice, date, 0, 0, memo);
      } else if (mode === 'edit' && holding) {
        await portfolioService.saveVirtualHolding(
          uid,
          {
            symbol: holding.symbol,
            name: holding.name,
            market: holding.market,
            avgBuyPrice: numPrice,
            quantity: numQty,
            buyDate: date,
            memo,
          },
          holding.id
        );
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || '저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'create':
        return '가상 보유 종목 등록';
      case 'add_buy':
        return `'${holding?.name}' 추가 매수 기록`;
      case 'sell':
        return `'${holding?.name}' 매도 및 실현손익 기록`;
      case 'edit':
        return `'${holding?.name}' 보유 내역 수정`;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <span>{getTitle()}</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              실제 증권 계좌와 무관한 사용자 수기 입력 가상 포트폴리오입니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Stock Selection (only for create mode) */}
          {mode === 'create' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                종목 검색 및 선택
              </label>
              {selectedStock ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      {selectedStock.name}
                    </span>
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
                      {selectedStock.symbol}
                    </span>
                    <span className="text-[11px] px-1.5 py-0.5 rounded font-mono font-bold bg-rose-500/10 text-rose-500">
                      {selectedStock.market}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStock(null);
                      setPrice('');
                    }}
                    className="text-xs text-slate-400 hover:text-rose-500 font-semibold"
                  >
                    변경
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="종목명 또는 6자리 종목코드 입력 (예: 삼성전자, 005930)"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  {searchResults.length > 0 && (
                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a1f2c] shadow-lg">
                      {searchResults.map(stock => (
                        <button
                          type="button"
                          key={stock.symbol}
                          onClick={() => {
                            setSelectedStock({
                              symbol: stock.symbol,
                              name: stock.name,
                              market: stock.market,
                              price: stock.price,
                            });
                            setPrice(String(stock.price));
                            setSearchQuery('');
                            setSearchResults([]);
                          }}
                          className="w-full p-2.5 text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-900 dark:text-white">
                              {stock.name}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {stock.symbol}
                            </span>
                          </div>
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
                            {stock.price.toLocaleString()}원
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Current Holding Summary (for add_buy and sell) */}
          {holding && (mode === 'add_buy' || mode === 'sell') && (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="text-[11px] text-slate-400 block">현재 보유수량</span>
                <span className="font-bold font-mono text-slate-900 dark:text-white">
                  {holding.quantity.toLocaleString()}주
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">평균 매입단가</span>
                <span className="font-bold font-mono text-slate-900 dark:text-white">
                  {holding.avgBuyPrice.toLocaleString()}원
                </span>
              </div>
              <div>
                <span className="text-[11px] text-slate-400 block">총 매입금액</span>
                <span className="font-bold font-mono text-slate-900 dark:text-white">
                  {(holding.quantity * holding.avgBuyPrice).toLocaleString()}원
                </span>
              </div>
            </div>
          )}

          {/* 2. Price and Quantity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                {mode === 'sell' ? '매도 단가 (원)' : mode === 'add_buy' ? '추가 매수가 (원)' : '매수 단가 (원)'}
              </label>
              <input
                type="number"
                min="1"
                step="any"
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="예: 75000"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {mode === 'sell' ? '매도 수량 (주)' : mode === 'add_buy' ? '추가 매수 수량 (주)' : '보유 수량 (주)'}
                </label>
                {mode === 'sell' && holding && (
                  <div className="flex gap-1">
                    {[0.25, 0.5, 1].map(ratio => (
                      <button
                        type="button"
                        key={ratio}
                        onClick={() => setQuantity(String(Math.floor(holding.quantity * ratio)))}
                        className="px-1.5 py-0.5 text-[10px] rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-300"
                      >
                        {ratio === 1 ? '전량' : `${ratio * 100}%`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="number"
                min="1"
                max={mode === 'sell' && holding ? holding.quantity : undefined}
                step="1"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                placeholder="예: 10"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                required
              />
            </div>
          </div>

          {/* 3. Trade Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              {mode === 'sell' ? '매도 일자' : '매수 일자'}
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
              required
            />
          </div>

          {/* 4. Memo */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              투자 메모 / 매매 사유 (선택)
            </label>
            <input
              type="text"
              value={memo}
              onChange={e => setMemo(e.target.value)}
              placeholder="예: 분할 매수 2차 진입, 실적 발표 모멘텀"
              className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Real-time Calculated Previews */}
          {addBuyPreview && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1">
              <span className="font-bold text-emerald-600 dark:text-emerald-400 block">
                📊 추가 매수 후 평균단가 변동 시뮬레이션
              </span>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-600 dark:text-slate-300">새 총 보유수량:</span>
                <span className="font-bold text-slate-900 dark:text-white">{addBuyPreview.newQty.toLocaleString()}주</span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-600 dark:text-slate-300">새 평균 매입가:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {addBuyPreview.newAvg.toLocaleString()}원
                  <span className="text-[11px] ml-1 text-slate-400">
                    ({addBuyPreview.diffAvg >= 0 ? '+' : ''}{addBuyPreview.diffAvg.toLocaleString()}원)
                  </span>
                </span>
              </div>
            </div>
          )}

          {sellPreview && (
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs space-y-1 font-mono">
              <span className="font-bold text-blue-600 dark:text-blue-400 block font-sans">
                💰 매도 시 실현손익 계산 시뮬레이션
              </span>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300">매도 총액:</span>
                <span className="font-bold text-slate-900 dark:text-white">{sellPreview.grossSell.toLocaleString()}원</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-300">실현손익:</span>
                <span className={`font-bold ${sellPreview.profit >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
                  {sellPreview.profit >= 0 ? '+' : ''}{sellPreview.profit.toLocaleString()}원 ({sellPreview.profit >= 0 ? '+' : ''}{sellPreview.rate.toFixed(2)}%)
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>매도 후 잔여 수량:</span>
                <span>{sellPreview.remainingQty}주 {sellPreview.remainingQty === 0 ? '(전량 매도)' : ''}</span>
              </div>
            </div>
          )}

          {/* Footer Submit */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
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
                mode === 'sell'
                  ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
                  : 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? '처리 중...' : mode === 'sell' ? '매도 기록 저장' : '저장하기'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
