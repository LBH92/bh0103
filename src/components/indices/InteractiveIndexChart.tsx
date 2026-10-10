import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  CandleData, 
  IndexChartPeriod, 
  IndexChartResponse 
} from '../../types';
import { 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  AlertTriangle, 
  Clock, 
  BarChart2, 
  ShieldCheck,
  Maximize2,
  Calendar,
  Layers
} from 'lucide-react';

interface InteractiveIndexChartProps {
  symbol: 'KOSPI' | 'KOSDAQ';
  currentValue: number;
  prevClose: number;
}

interface PeriodConfig {
  id: IndexChartPeriod;
  label: string;
  badge: string;
  description: string;
}

const INDEX_PERIODS: PeriodConfig[] = [
  { id: '1d', label: '1일', badge: '5분봉', description: '당일 장중 5분 단위 실시간 체결 지수' },
  { id: '1mo', label: '1개월', badge: '일봉', description: '최근 1개월 일별 지수 추이' },
  { id: '3mo', label: '3개월', badge: '일봉', description: '최근 3개월 일별 지수 추이' },
  { id: '1y', label: '1년', badge: '일봉', description: '최근 1년 일별 지수 추이' },
  { id: '3y', label: '3년', badge: '주봉', description: '최근 3년 주간 단위 중장기 지수 추이' },
];

export const InteractiveIndexChart: React.FC<InteractiveIndexChartProps> = ({
  symbol,
  currentValue,
  prevClose,
}) => {
  const [selectedPeriod, setSelectedPeriod] = useState<IndexChartPeriod>('3mo');
  const [chartData, setChartData] = useState<IndexChartResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Hover Tooltip State
  const [hoveredCandle, setHoveredCandle] = useState<CandleData | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState<number>(800);

  // Measure container width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setChartWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Fetch Index Chart Data from Server
  const fetchChart = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/indices/${symbol}/chart?period=${selectedPeriod}`);
      if (!res.ok) {
        throw new Error(`서버 응답 오류 (HTTP ${res.status})`);
      }
      const data: IndexChartResponse = await res.json();
      setChartData(data);
    } catch (err: any) {
      console.error('[IndexChart] Fetch error:', err);
      setErrorMessage(err.message || '지수 차트 데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [symbol, selectedPeriod]);

  useEffect(() => {
    fetchChart();
  }, [fetchChart]);

  const candles = useMemo(() => {
    return chartData?.candles || [];
  }, [chartData]);

  // Chart Dimensions & Calculations
  const chartHeight = 360;
  const padding = { top: 24, right: 65, bottom: 50, left: 16 };
  const plotWidth = Math.max(chartWidth - padding.left - padding.right, 200);
  const mainPlotHeight = chartHeight - padding.top - padding.bottom;
  const candleAreaHeight = mainPlotHeight * 0.75;
  const volumeAreaHeight = mainPlotHeight * 0.22;
  const volumeAreaTop = padding.top + candleAreaHeight + (mainPlotHeight * 0.03);

  const { minPrice, maxPrice, maxVolume } = useMemo(() => {
    if (candles.length === 0) {
      return { minPrice: currentValue * 0.95, maxPrice: currentValue * 1.05, maxVolume: 1000 };
    }
    let minP = Infinity;
    let maxP = -Infinity;
    let maxV = 0;

    for (const c of candles) {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
      if (c.volume > maxV) maxV = c.volume;
    }

    const priceBuffer = (maxP - minP) * 0.06 || 10;
    return {
      minPrice: Math.max(0, minP - priceBuffer),
      maxPrice: maxP + priceBuffer,
      maxVolume: maxV || 1,
    };
  }, [candles, currentValue]);

  // Scale Functions
  const priceToY = useCallback((price: number) => {
    if (maxPrice === minPrice) return padding.top + candleAreaHeight / 2;
    const ratio = (price - minPrice) / (maxPrice - minPrice);
    return padding.top + candleAreaHeight - ratio * candleAreaHeight;
  }, [minPrice, maxPrice, candleAreaHeight, padding.top]);

  const volumeToH = useCallback((vol: number) => {
    if (maxVolume <= 0) return 0;
    return (vol / maxVolume) * volumeAreaHeight;
  }, [maxVolume, volumeAreaHeight]);

  const candleWidth = useMemo(() => {
    if (candles.length <= 1) return 16;
    const available = plotWidth / candles.length;
    return Math.max(2, Math.min(22, available * 0.7));
  }, [plotWidth, candles.length]);

  const indexToX = useCallback((idx: number) => {
    if (candles.length <= 1) return padding.left + plotWidth / 2;
    const step = plotWidth / (candles.length - 1);
    return padding.left + idx * step;
  }, [candles.length, plotWidth, padding.left]);

  // Moving Average 5 & 20
  const ma5 = useMemo(() => {
    if (candles.length < 5) return [];
    return candles.map((_, i, arr) => {
      if (i < 4) return null;
      const sum = arr.slice(i - 4, i + 1).reduce((acc, cur) => acc + cur.close, 0);
      return sum / 5;
    });
  }, [candles]);

  const ma20 = useMemo(() => {
    if (candles.length < 20) return [];
    return candles.map((_, i, arr) => {
      if (i < 19) return null;
      const sum = arr.slice(i - 19, i + 1).reduce((acc, cur) => acc + cur.close, 0);
      return sum / 20;
    });
  }, [candles]);

  // Handle Mouse / Touch Move over SVG
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current || candles.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - padding.left;
    if (mouseX < 0 || mouseX > plotWidth) {
      setHoveredCandle(null);
      setHoverIndex(null);
      return;
    }

    const step = plotWidth / (candles.length - 1 || 1);
    const idx = Math.min(candles.length - 1, Math.max(0, Math.round(mouseX / step)));
    setHoveredCandle(candles[idx]);
    setHoverIndex(idx);
  };

  const handleMouseLeave = () => {
    setHoveredCandle(null);
    setHoverIndex(null);
  };

  // Price Grid Lines (4 horizontal ticks)
  const priceGridLines = useMemo(() => {
    const ticks = 4;
    const res: { price: number; y: number }[] = [];
    const step = (maxPrice - minPrice) / (ticks - 1 || 1);
    for (let i = 0; i < ticks; i++) {
      const p = minPrice + i * step;
      res.push({ price: p, y: priceToY(p) });
    }
    return res;
  }, [minPrice, maxPrice, priceToY]);

  const activeCandle = hoveredCandle || (candles.length > 0 ? candles[candles.length - 1] : null);

  return (
    <div className="bg-white dark:bg-[#131722] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-xs space-y-4">
      {/* 1. Header Toolbar: Period Selector & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
        {/* Period Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl w-fit">
          {INDEX_PERIODS.map(p => {
            const isSelected = selectedPeriod === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPeriod(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>{p.label}</span>
                <span className={`text-[10px] font-mono opacity-80 ${isSelected ? 'text-white' : 'text-slate-400'}`}>
                  {p.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Status Badges & Refresh Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {chartData && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-50 dark:bg-slate-800/40 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>갱신: {chartData.lastUpdated}</span>
            </div>
          )}

          <button
            onClick={() => fetchChart(false)}
            disabled={isLoading || isRefreshing}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-50"
            title="지수 차트 새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading || isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">새로고침</span>
          </button>
        </div>
      </div>

      {/* 2. OHLCV Info Banner (Dynamic on Hover) */}
      {activeCandle && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-sans font-medium">일시:</span>
            <span className="font-bold text-slate-900 dark:text-white">{activeCandle.time}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <div>
              <span className="text-slate-400 font-sans font-medium mr-1">시가</span>
              <span className="font-bold text-slate-900 dark:text-white">{activeCandle.open.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-400 font-sans font-medium mr-1">고가</span>
              <span className="font-bold text-rose-500">{activeCandle.high.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-400 font-sans font-medium mr-1">저가</span>
              <span className="font-bold text-blue-500">{activeCandle.low.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-400 font-sans font-medium mr-1">종가</span>
              <span className={`font-bold ${
                activeCandle.close >= activeCandle.open ? 'text-rose-500' : 'text-blue-500'
              }`}>
                {activeCandle.close.toLocaleString()}
              </span>
            </div>
            {activeCandle.volume > 0 && (
              <div className="hidden sm:block">
                <span className="text-slate-400 font-sans font-medium mr-1">거래량</span>
                <span className="font-bold text-slate-700 dark:text-slate-300">{activeCandle.volume.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Main Chart Canvas / SVG Container */}
      <div ref={containerRef} className="relative w-full overflow-hidden select-none">
        {isLoading ? (
          <div className="h-[360px] flex flex-col items-center justify-center space-y-3 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl">
            <RefreshCw className="w-8 h-8 text-rose-500 animate-spin" />
            <p className="text-xs text-slate-400 font-medium">실시간 {symbol} 지수 캔들 차트를 불러오는 중입니다...</p>
          </div>
        ) : errorMessage ? (
          <div className="h-[360px] flex flex-col items-center justify-center space-y-3 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-rose-500" />
            <p className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">{errorMessage}</p>
            {chartData?.lastUpdated && (
              <p className="text-[11px] text-slate-400">마지막 정상 수신: {chartData.lastUpdated}</p>
            )}
            <button
              onClick={() => fetchChart(false)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
            >
              다시 시도
            </button>
          </div>
        ) : candles.length === 0 ? (
          <div className="h-[360px] flex flex-col items-center justify-center space-y-2 bg-slate-50/50 dark:bg-slate-800/20 rounded-xl text-center">
            <BarChart2 className="w-8 h-8 text-slate-400" />
            <p className="text-xs text-slate-400">선택한 기간의 지수 차트 데이터가 없습니다.</p>
          </div>
        ) : (
          <svg
            width={chartWidth}
            height={chartHeight}
            className="w-full h-auto cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Background Grid Lines */}
            {priceGridLines.map((grid, idx) => (
              <g key={idx}>
                <line
                  x1={padding.left}
                  y1={grid.y}
                  x2={padding.left + plotWidth}
                  y2={grid.y}
                  stroke="currentColor"
                  className="text-slate-100 dark:text-slate-800/80"
                  strokeDasharray="3 3"
                />
                <text
                  x={padding.left + plotWidth + 6}
                  y={grid.y + 4}
                  fill="currentColor"
                  className="text-[10px] font-mono fill-slate-400"
                >
                  {grid.price.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </text>
              </g>
            ))}

            {/* Volume Area Divider */}
            <line
              x1={padding.left}
              y1={volumeAreaTop}
              x2={padding.left + plotWidth}
              y2={volumeAreaTop}
              stroke="currentColor"
              className="text-slate-200 dark:text-slate-800"
            />
            <text
              x={padding.left + plotWidth + 6}
              y={volumeAreaTop + 12}
              fill="currentColor"
              className="text-[9px] font-mono fill-slate-400"
            >
              거래량
            </text>

            {/* Volume Bars */}
            {candles.map((c, i) => {
              const x = indexToX(i);
              const h = volumeToH(c.volume);
              const y = volumeAreaTop + volumeAreaHeight - h;
              const isUp = c.close >= c.open;
              return (
                <rect
                  key={`vol-${i}`}
                  x={x - candleWidth / 2}
                  y={y}
                  width={candleWidth}
                  height={Math.max(1, h)}
                  className={isUp ? 'fill-rose-500/35' : 'fill-blue-500/35'}
                />
              );
            })}

            {/* Candle Wicks & Bodies */}
            {candles.map((c, i) => {
              const x = indexToX(i);
              const openY = priceToY(c.open);
              const closeY = priceToY(c.close);
              const highY = priceToY(c.high);
              const lowY = priceToY(c.low);
              const isUp = c.close >= c.open;
              const candleTop = Math.min(openY, closeY);
              const candleH = Math.max(1.5, Math.abs(closeY - openY));

              const candleColor = isUp ? '#f43f5e' : '#3b82f6';

              return (
                <g key={`candle-${i}`}>
                  {/* High/Low Wick Line */}
                  <line
                    x1={x}
                    y1={highY}
                    x2={x}
                    y2={lowY}
                    stroke={candleColor}
                    strokeWidth={1.5}
                  />
                  {/* Open/Close Body */}
                  <rect
                    x={x - candleWidth / 2}
                    y={candleTop}
                    width={candleWidth}
                    height={candleH}
                    fill={candleColor}
                    rx={1}
                  />
                </g>
              );
            })}

            {/* MA5 Line (Orange) */}
            {ma5.length > 0 && (
              <path
                d={ma5.reduce((acc, val, i) => {
                  if (val === null) return acc;
                  const x = indexToX(i);
                  const y = priceToY(val);
                  return acc ? `${acc} L ${x} ${y}` : `M ${x} ${y}`;
                }, '')}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={1.5}
                opacity={0.8}
              />
            )}

            {/* MA20 Line (Purple) */}
            {ma20.length > 0 && (
              <path
                d={ma20.reduce((acc, val, i) => {
                  if (val === null) return acc;
                  const x = indexToX(i);
                  const y = priceToY(val);
                  return acc ? `${acc} L ${x} ${y}` : `M ${x} ${y}`;
                }, '')}
                fill="none"
                stroke="#8b5cf6"
                strokeWidth={1.5}
                opacity={0.8}
              />
            )}

            {/* Crosshair on Hover */}
            {hoverIndex !== null && (
              <g>
                {/* Vertical Crosshair Line */}
                <line
                  x1={indexToX(hoverIndex)}
                  y1={padding.top}
                  x2={indexToX(hoverIndex)}
                  y2={chartHeight - padding.bottom}
                  stroke="#94a3b8"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                {/* Date/Time Tag at Bottom */}
                <text
                  x={indexToX(hoverIndex)}
                  y={chartHeight - padding.bottom + 16}
                  textAnchor="middle"
                  fill="currentColor"
                  className="text-[10px] font-mono font-bold fill-slate-700 dark:fill-slate-200"
                >
                  {candles[hoverIndex].time}
                </text>
              </g>
            )}

            {/* Time Axis Labels (Bottom 5 points) */}
            {candles.length > 1 && [0, Math.floor(candles.length / 4), Math.floor(candles.length / 2), Math.floor((candles.length * 3) / 4), candles.length - 1].map((idx) => {
              if (idx < 0 || idx >= candles.length) return null;
              const x = indexToX(idx);
              return (
                <text
                  key={`time-lbl-${idx}`}
                  x={x}
                  y={chartHeight - 12}
                  textAnchor="middle"
                  fill="currentColor"
                  className="text-[10px] font-mono fill-slate-400"
                >
                  {candles[idx].time}
                </text>
              );
            })}
          </svg>
        )}
      </div>

      {/* 4. Legend Footnote */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500"></span>
            <span>상승 (양봉)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500"></span>
            <span>하락 (음봉)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-amber-500"></span>
            <span>5일선</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-purple-500"></span>
            <span>20일선</span>
          </div>
        </div>

        <div>
          <span>실제 거래소 시세 데이터 연동</span>
        </div>
      </div>
    </div>
  );
};
