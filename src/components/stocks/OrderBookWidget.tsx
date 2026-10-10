import React, { useState, useEffect } from 'react';
import { Stock, OrderBook } from '../../types';
import { generateOrderBook } from '../../services/mockData';
import { stockRepository } from '../../services/stockRepository';

interface OrderBookWidgetProps {
  stock: Stock;
}

export const OrderBookWidget: React.FC<OrderBookWidgetProps> = ({ stock }) => {
  const [orderBook, setOrderBook] = useState<OrderBook>(() => generateOrderBook(stock));
  const [currentPrice, setCurrentPrice] = useState<number>(stock.price);
  const [change, setChange] = useState<number>(stock.change);
  const [changePercent, setChangePercent] = useState<number>(stock.changePercent);
  const [volume, setVolume] = useState<number>(stock.volume);
  const [isRealtime, setIsRealtime] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'10' | '5'>('10');

  // Sync state if parent stock prop changes
  useEffect(() => {
    setCurrentPrice(stock.price);
    setChange(stock.change);
    setChangePercent(stock.changePercent);
    setVolume(stock.volume);
    setOrderBook(generateOrderBook(stock));
  }, [stock.symbol, stock.price, stock.change, stock.changePercent, stock.volume]);

  // Connect to Real-time Order Book and Execution Tick via Kiwoom WebSocket & SSE
  useEffect(() => {
    let isSubscribed = true;

    // 1. Initial REST fetch for Order Book
    stockRepository.getOrderBook(stock.symbol).then(data => {
      if (isSubscribed && data && Array.isArray(data.asks) && data.asks.length > 0) {
        setOrderBook(data);
        if (data.currentPrice) {
          setCurrentPrice(data.currentPrice);
        }
      }
    }).catch(err => {
      console.warn('[OrderBookWidget] Initial order book fetch error, using fallback:', err);
    });

    // 2. Subscribe to Real-time 10-level Order Book (Kiwoom WS H0STASP0)
    const unsubOrderBook = stockRepository.subscribeOrderBook?.(stock.symbol, (realtimeOrderBook) => {
      if (!isSubscribed) return;
      if (realtimeOrderBook && realtimeOrderBook.symbol === stock.symbol) {
        setOrderBook(realtimeOrderBook);
        setIsRealtime(true);
      }
    });

    // 3. Subscribe to Real-time Execution Tick (Kiwoom WS H0STCNT0) for 현재가 / 등락률 / 거래량
    const unsubExecution = stockRepository.subscribeExecutionTick?.(stock.symbol, (tick) => {
      if (!isSubscribed) return;
      if (tick && tick.symbol === stock.symbol) {
        setCurrentPrice(tick.price);
        setChange(tick.change);
        setChangePercent(tick.changePercent);
        if (tick.volume > 0) {
          setVolume(prev => Math.max(prev, tick.volume));
        }
        setIsRealtime(true);
      }
    });

    // Cleanup: Unsubscribe on unmount or when stock.symbol changes to prevent duplicate subscriptions
    return () => {
      isSubscribed = false;
      unsubOrderBook?.();
      unsubExecution?.();
    };
  }, [stock.symbol]);

  const displayedAsks = viewMode === '5' ? orderBook.asks.slice(-5) : orderBook.asks;
  const displayedBids = viewMode === '5' ? orderBook.bids.slice(0, 5) : orderBook.bids;

  const total = orderBook.totalAskVolume + orderBook.totalBidVolume || 1;
  const askRatio = Math.round((orderBook.totalAskVolume / total) * 100);
  const bidRatio = 100 - askRatio;

  return (
    <div className="bg-white dark:bg-[#131722] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="font-bold text-sm text-slate-900 dark:text-white">
            실시간 10단계 호가창
          </h4>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {isRealtime ? '키움 실시간' : '실시간 연동'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setViewMode('10')}
              className={`px-2 py-0.5 rounded-md transition-colors ${
                viewMode === '10'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-bold shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              10호가
            </button>
            <button
              type="button"
              onClick={() => setViewMode('5')}
              className={`px-2 py-0.5 rounded-md transition-colors ${
                viewMode === '5'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-bold shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              5호가
            </button>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            단위: 주
          </span>
        </div>
      </div>

      {/* 10-Level Order Book Table */}
      <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden font-mono text-xs">
        {/* Asks (매도 10~1호가) */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-blue-50/20 dark:bg-blue-950/10 max-h-[260px] overflow-y-auto">
          {displayedAsks.map((ask, i) => {
            const isCurrent = ask.price === currentPrice;
            const askLevel = viewMode === '5' ? 5 - i : orderBook.asks.length - i;
            return (
              <div
                key={`ask-${ask.price}-${i}`}
                className={`relative flex items-center justify-between py-1.5 px-3 transition-colors ${
                  isCurrent ? 'ring-1 ring-rose-500 font-bold bg-rose-500/10' : 'hover:bg-blue-500/5'
                }`}
              >
                {/* Visual bar fill on right */}
                <div
                  className="absolute right-0 top-0 bottom-0 bg-blue-500/15 pointer-events-none transition-all duration-300"
                  style={{ width: `${ask.barPercent}%` }}
                />
                <div className="relative z-10 flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px]">
                  <span className="text-[10px] text-slate-400 font-sans">
                    {askLevel}호가
                  </span>
                  <span>{ask.volume.toLocaleString()}</span>
                </div>
                <span className="relative z-10 font-bold text-blue-600 dark:text-blue-400">
                  {ask.price > 0 ? ask.price.toLocaleString() : '-'}
                </span>
                <span className="relative z-10 text-[10px] text-blue-500">
                  {ask.changePercent > 0 ? '+' : ''}{ask.changePercent.toFixed(2)}%
                </span>
              </div>
            );
          })}
        </div>

        {/* Current Price Divider Bar (현재가, 등락률, 거래량 실시간 체결 데이터 반영) */}
        <div className="py-2 px-3 bg-slate-100 dark:bg-slate-800 font-bold flex items-center justify-between text-slate-900 dark:text-white border-y border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-sans">현재가</span>
            <span className="text-[11px] font-mono text-slate-400 font-normal">
              누적 {volume.toLocaleString()}주
            </span>
          </div>
          <span className="text-sm font-black text-rose-500 dark:text-rose-400">
            {currentPrice.toLocaleString()}원
          </span>
          <span className={`text-xs ${change >= 0 ? 'text-rose-500' : 'text-blue-500'}`}>
            {change >= 0 ? '+' : ''}{change.toLocaleString()} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
          </span>
        </div>

        {/* Bids (매수 1~10호가) */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-rose-50/20 dark:bg-rose-950/10 max-h-[260px] overflow-y-auto">
          {displayedBids.map((bid, i) => {
            const isCurrent = bid.price === currentPrice;
            const bidLevel = i + 1;
            return (
              <div
                key={`bid-${bid.price}-${i}`}
                className={`relative flex items-center justify-between py-1.5 px-3 transition-colors ${
                  isCurrent ? 'ring-1 ring-rose-500 font-bold bg-rose-500/10' : 'hover:bg-rose-500/5'
                }`}
              >
                {/* Visual bar fill on left */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-rose-500/15 pointer-events-none transition-all duration-300"
                  style={{ width: `${bid.barPercent}%` }}
                />
                <span className="relative z-10 text-[10px] text-rose-500">
                  {bid.changePercent > 0 ? '+' : ''}{bid.changePercent.toFixed(2)}%
                </span>
                <span className="relative z-10 font-bold text-rose-600 dark:text-rose-400">
                  {bid.price > 0 ? bid.price.toLocaleString() : '-'}
                </span>
                <div className="relative z-10 flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px]">
                  <span>{bid.volume.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-400 font-sans">
                    {bidLevel}호가
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Total Depth comparison bar */}
      <div className="mt-3 space-y-1">
        <div className="flex justify-between text-[11px] font-mono">
          <span className="text-blue-500 font-bold">
            매도잔량: {orderBook.totalAskVolume.toLocaleString()} ({askRatio}%)
          </span>
          <span className="text-rose-500 font-bold">
            매수잔량: {orderBook.totalBidVolume.toLocaleString()} ({bidRatio}%)
          </span>
        </div>
        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
          <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${askRatio}%` }} />
          <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${bidRatio}%` }} />
        </div>
      </div>
    </div>
  );
};
