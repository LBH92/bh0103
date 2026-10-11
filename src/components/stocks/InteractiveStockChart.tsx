import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CandleData, KiwoomChartPeriod, KiwoomChartResponse } from '../../types';
import { stockRepository } from '../../services/stockRepository';
import { 
  TrendingUp, 
  RefreshCw, 
  AlertTriangle, 
  Clock, 
  BarChart2, 
  Sliders, 
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Move,
  Trash2,
  Edit3,
  Layers,
  ChevronDown,
  Activity,
  Compass,
  Check
} from 'lucide-react';
import { 
  IndicatorSettings, 
  DEFAULT_INDICATOR_SETTINGS,
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  calculateVWAP,
  calculateRSI,
  calculateMACD,
  calculateStochastic
} from '../../utils/chartIndicators';
import { 
  DrawingToolType, 
  DrawingShape, 
  Point, 
  FIBONACCI_LEVELS 
} from '../../types/chartDrawings';
import { IndicatorSettingsModal } from './IndicatorSettingsModal';

interface InteractiveStockChartProps {
  symbol?: string;
  candles?: CandleData[];
  stockPrice: number;
  prevClose: number;
  currency?: 'KRW' | 'USD';
}

interface PeriodConfig {
  id: KiwoomChartPeriod;
  label: string;
  trId: 'ka10080' | 'ka10081';
  ticScope?: string;
  description: string;
  supported: boolean;
}

const KIWOOM_PERIODS: PeriodConfig[] = [
  { id: '1m', label: '1분', trId: 'ka10080', ticScope: '1', description: '1분봉 (TR ka10080)', supported: true },
  { id: '5m', label: '5분', trId: 'ka10080', ticScope: '5', description: '5분봉 (TR ka10080)', supported: true },
  { id: '15m', label: '15분', trId: 'ka10080', ticScope: '15', description: '15분봉 (TR ka10080)', supported: true },
  { id: '30m', label: '30분', trId: 'ka10080', ticScope: '30', description: '30분봉 (TR ka10080)', supported: true },
  { id: '1h', label: '60분', trId: 'ka10080', ticScope: '60', description: '60분봉 (TR ka10080)', supported: true },
  { id: 'day', label: '일봉', trId: 'ka10081', description: '일봉 (TR ka10081)', supported: true },
];

export const InteractiveStockChart: React.FC<InteractiveStockChartProps> = ({
  symbol,
  candles: initialCandles = [],
  stockPrice,
  prevClose,
  currency = 'KRW',
}) => {
  const isUSD = currency === 'USD';
  const formatPrice = (val: number) => {
    if (isUSD) {
      return `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    return `${val.toLocaleString()}원`;
  };
  // 1. Period & Type
  const [period, setPeriod] = useState<KiwoomChartPeriod>('1m');
  const [chartType, setChartType] = useState<'candle' | 'line'>('candle');

  // 2. Raw Data State from Kiwoom
  const [rawCandles, setRawCandles] = useState<CandleData[]>([]);
  const [chartMeta, setChartMeta] = useState<KiwoomChartResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [serverIp, setServerIp] = useState<string | null>(null);

  // 3. Zoom & Pan State (Window slicing into rawCandles)
  // viewCount: number of candles displayed in view (e.g., 50 by default)
  const [viewCount, setViewCount] = useState<number>(60);
  // viewOffset: offset from the end (0 = latest candles, >0 = panned back into history)
  const [viewOffset, setViewOffset] = useState<number>(0);

  // Dragging / Panning
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; offset: number } | null>(null);
  const touchStartDistRef = useRef<number | null>(null);

  // 4. Hover & Crosshair
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // 5. Indicators State
  const [indicators, setIndicators] = useState<IndicatorSettings>(DEFAULT_INDICATOR_SETTINGS);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isIndicatorMenuOpen, setIsIndicatorMenuOpen] = useState<boolean>(false);

  // 6. Drawing Tools State
  const [activeTool, setActiveTool] = useState<DrawingToolType>('none');
  const [shapes, setShapes] = useState<DrawingShape[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [drawingShape, setDrawingShape] = useState<Partial<DrawingShape> | null>(null);
  const [isDrawingMenuOpen, setIsDrawingMenuOpen] = useState<boolean>(false);

  // Active period configuration
  const currentPeriodConfig = useMemo(() => {
    return KIWOOM_PERIODS.find(p => p.id === period) || KIWOOM_PERIODS[0];
  }, [period]);

  // Fetch Kiwoom Chart from server (preserves caching and API structure)
  const loadChartData = useCallback(async (targetPeriod: KiwoomChartPeriod) => {
    if (!symbol) return;
    setIsLoading(true);
    setApiError(null);

    try {
      const res = await fetch(`/api/stocks/${symbol}/chart?period=${targetPeriod}`);
      const data: KiwoomChartResponse = await res.json();

      setChartMeta(data);

      if (data.serverIp) {
        setServerIp(data.serverIp);
      }

      if (data.error) {
        setApiError(data.error);
        setRawCandles([]);
      } else if (Array.isArray(data.candles)) {
        let candles = [...data.candles];

        // Align last candle close with current stock price
        if (stockPrice > 0 && candles.length > 0) {
          const lastIndex = candles.length - 1;
          const last = { ...candles[lastIndex] };
          last.close = stockPrice;
          if (stockPrice > last.high) last.high = stockPrice;
          if (stockPrice < last.low) last.low = stockPrice;
          candles[lastIndex] = last;
        }

        setRawCandles(candles);
        // Reset pan offset to latest, default view count based on data length
        setViewOffset(0);
        setViewCount(Math.min(candles.length, Math.max(30, Math.min(80, candles.length))));
      } else {
        setRawCandles([]);
      }
    } catch (err: any) {
      console.warn(`[InteractiveStockChart] Fetch error:`, err);
      setApiError(err.message || '키움 Open API 서버와 통신할 수 없습니다.');
      setRawCandles([]);
    } finally {
      setIsLoading(false);
    }
  }, [symbol, stockPrice]);

  // Re-fetch whenever symbol or period changes
  useEffect(() => {
    loadChartData(period);
  }, [symbol, period, loadChartData]);

  // Real-time execution tick listener from Kiwoom WebSocket/SSE
  useEffect(() => {
    if (!symbol) return;

    const unsubscribe = stockRepository.subscribeExecutionTick?.(symbol, (tick) => {
      setRawCandles(prev => {
        if (!prev || prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const updatedLast: CandleData = {
          ...last,
          close: tick.price,
          high: Math.max(last.high, tick.price),
          low: Math.min(last.low, tick.price),
          volume: last.volume + (tick.volume > 0 ? Math.round(tick.volume / 100) : 1),
        };
        return [...prev.slice(0, -1), updatedLast];
      });
    });

    return () => {
      unsubscribe?.();
    };
  }, [symbol]);

  // Calculate Visible Window of candles for current zoom/pan
  const visibleCandles = useMemo(() => {
    if (rawCandles.length === 0) return [];
    const count = Math.max(10, Math.min(rawCandles.length, viewCount));
    const maxOffset = Math.max(0, rawCandles.length - count);
    const clampedOffset = Math.max(0, Math.min(maxOffset, viewOffset));
    
    const startIndex = Math.max(0, rawCandles.length - count - clampedOffset);
    const endIndex = rawCandles.length - clampedOffset;
    return rawCandles.slice(startIndex, endIndex);
  }, [rawCandles, viewCount, viewOffset]);

  // Chart layout dimensions
  const width = 900;
  const paddingLeft = 15;
  const paddingRight = 75; // for price axis
  const innerWidth = width - paddingLeft - paddingRight;

  const hasSubChartRsi = indicators.rsi.enabled;
  const hasSubChartMacd = indicators.macd.enabled;
  const hasSubChartStoch = indicators.stochastic.enabled;
  const subChartCount = (hasSubChartRsi ? 1 : 0) + (hasSubChartMacd ? 1 : 0) + (hasSubChartStoch ? 1 : 0);

  const mainPriceHeight = 270;
  const volumeHeight = indicators.volume.enabled ? 65 : 0;
  const subChartHeight = 70;
  const bottomTimePadding = 30;
  const paddingTop = 25;

  const totalHeight = paddingTop + mainPriceHeight + volumeHeight + (subChartCount * subChartHeight) + bottomTimePadding;

  // Coordinate scales for main price area
  const minPrice = useMemo(() => {
    if (visibleCandles.length === 0) return 0;
    const lows = visibleCandles.map(c => c.low);
    return Math.min(...lows);
  }, [visibleCandles]);

  const maxPrice = useMemo(() => {
    if (visibleCandles.length === 0) return 1;
    const highs = visibleCandles.map(c => c.high);
    return Math.max(...highs);
  }, [visibleCandles]);

  const priceRange = useMemo(() => {
    const diff = maxPrice - minPrice;
    return diff > 0 ? diff : 100;
  }, [maxPrice, minPrice]);

  const maxVolume = useMemo(() => {
    if (visibleCandles.length === 0) return 1;
    return Math.max(...visibleCandles.map(c => c.volume)) || 1;
  }, [visibleCandles]);

  const getPriceY = useCallback((price: number) => {
    return paddingTop + mainPriceHeight - ((price - minPrice) / priceRange) * mainPriceHeight;
  }, [minPrice, priceRange, mainPriceHeight, paddingTop]);

  const getPriceFromY = useCallback((y: number) => {
    const ratio = (paddingTop + mainPriceHeight - y) / mainPriceHeight;
    return minPrice + ratio * priceRange;
  }, [minPrice, priceRange, mainPriceHeight, paddingTop]);

  const getCandleX = useCallback((indexInVisible: number) => {
    if (visibleCandles.length <= 1) return paddingLeft + innerWidth / 2;
    return paddingLeft + indexInVisible * (innerWidth / (visibleCandles.length - 1));
  }, [paddingLeft, innerWidth, visibleCandles.length]);

  const candleWidth = useMemo(() => {
    if (visibleCandles.length === 0) return 5;
    return Math.max(1.8, Math.min(22, (innerWidth / visibleCandles.length) * 0.72));
  }, [visibleCandles.length, innerWidth]);

  // Calculate Indicator series on rawCandles then slice corresponding visible part
  const {
    sma5Slice,
    sma20Slice,
    sma60Slice,
    sma120Slice,
    emaSlice,
    bollingerSlice,
    vwapSlice,
    rsiSlice,
    macdSlice,
    stochSlice,
  } = useMemo(() => {
    if (rawCandles.length === 0) {
      return {
        sma5Slice: [],
        sma20Slice: [],
        sma60Slice: [],
        sma120Slice: [],
        emaSlice: [],
        bollingerSlice: { upper: [], middle: [], lower: [] },
        vwapSlice: [],
        rsiSlice: [],
        macdSlice: { macdLine: [], signalLine: [], histogram: [] },
        stochSlice: { kLine: [], dLine: [] },
      };
    }

    const count = Math.max(10, Math.min(rawCandles.length, viewCount));
    const maxOffset = Math.max(0, rawCandles.length - count);
    const clampedOffset = Math.max(0, Math.min(maxOffset, viewOffset));
    const startIndex = Math.max(0, rawCandles.length - count - clampedOffset);
    const endIndex = rawCandles.length - clampedOffset;

    // SMA
    const sma5All = indicators.ma.enabled && indicators.ma.ma5 ? calculateSMA(rawCandles, indicators.ma.period5) : [];
    const sma20All = indicators.ma.enabled && indicators.ma.ma20 ? calculateSMA(rawCandles, indicators.ma.period20) : [];
    const sma60All = indicators.ma.enabled && indicators.ma.ma60 ? calculateSMA(rawCandles, indicators.ma.period60) : [];
    const sma120All = indicators.ma.enabled && indicators.ma.ma120 ? calculateSMA(rawCandles, indicators.ma.period120) : [];

    // EMA
    const emaAll = indicators.ema.enabled ? calculateEMA(rawCandles, indicators.ema.period) : [];

    // Bollinger
    const bbAll = indicators.bollinger.enabled ? calculateBollingerBands(rawCandles, indicators.bollinger.period, indicators.bollinger.stdDev) : { upper: [], middle: [], lower: [] };

    // VWAP
    const vwapAll = indicators.vwap.enabled ? calculateVWAP(rawCandles) : [];

    // RSI
    const rsiAll = indicators.rsi.enabled ? calculateRSI(rawCandles, indicators.rsi.period) : [];

    // MACD
    const macdAll = indicators.macd.enabled ? calculateMACD(rawCandles, indicators.macd.fastPeriod, indicators.macd.slowPeriod, indicators.macd.signalPeriod) : { macdLine: [], signalLine: [], histogram: [] };

    // Stochastic
    const stochAll = indicators.stochastic.enabled ? calculateStochastic(rawCandles, indicators.stochastic.kPeriod, indicators.stochastic.dPeriod) : { kLine: [], dLine: [] };

    return {
      sma5Slice: sma5All.slice(startIndex, endIndex),
      sma20Slice: sma20All.slice(startIndex, endIndex),
      sma60Slice: sma60All.slice(startIndex, endIndex),
      sma120Slice: sma120All.slice(startIndex, endIndex),
      emaSlice: emaAll.slice(startIndex, endIndex),
      bollingerSlice: {
        upper: bbAll.upper.slice(startIndex, endIndex),
        middle: bbAll.middle.slice(startIndex, endIndex),
        lower: bbAll.lower.slice(startIndex, endIndex),
      },
      vwapSlice: vwapAll.slice(startIndex, endIndex),
      rsiSlice: rsiAll.slice(startIndex, endIndex),
      macdSlice: {
        macdLine: macdAll.macdLine.slice(startIndex, endIndex),
        signalLine: macdAll.signalLine.slice(startIndex, endIndex),
        histogram: macdAll.histogram.slice(startIndex, endIndex),
      },
      stochSlice: {
        kLine: stochAll.kLine.slice(startIndex, endIndex),
        dLine: stochAll.dLine.slice(startIndex, endIndex),
      },
    };
  }, [rawCandles, viewCount, viewOffset, indicators]);

  // Line Path Generator helper
  const generateSeriesPath = useCallback((series: (number | null)[]) => {
    const points: string[] = [];
    for (let i = 0; i < series.length; i++) {
      const val = series[i];
      if (val !== null && val !== undefined) {
        const x = getCandleX(i);
        const y = getPriceY(val);
        points.push(`${points.length === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`);
      }
    }
    return points.join(' ');
  }, [getCandleX, getPriceY]);

  // Current display candle (hovered or latest)
  const display = useMemo(() => {
    if (hoverIndex !== null && visibleCandles[hoverIndex]) {
      return visibleCandles[hoverIndex];
    }
    if (visibleCandles.length > 0) {
      return visibleCandles[visibleCandles.length - 1];
    }
    return null;
  }, [hoverIndex, visibleCandles]);

  const isUp = display ? display.close >= display.open : true;
  const candleChange = display ? display.close - display.open : 0;
  const candleChangePercent = display && display.open > 0 ? ((candleChange / display.open) * 100).toFixed(2) : '0.00';

  // Sub-chart Y Layout Positions
  const volumeStartY = paddingTop + mainPriceHeight;
  let currentSubY = volumeStartY + volumeHeight;
  const rsiStartY = hasSubChartRsi ? (currentSubY += subChartHeight, currentSubY - subChartHeight) : 0;
  const macdStartY = hasSubChartMacd ? (currentSubY += subChartHeight, currentSubY - subChartHeight) : 0;
  const stochStartY = hasSubChartStoch ? (currentSubY += subChartHeight, currentSubY - subChartHeight) : 0;

  // Zoom Handler (Mouse Wheel)
  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (rawCandles.length === 0) return;

    const zoomFactor = e.deltaY > 0 ? 1.15 : 0.85; // deltaY > 0: zoom out, deltaY < 0: zoom in
    const newCount = Math.round(viewCount * zoomFactor);
    const clampedCount = Math.max(15, Math.min(rawCandles.length, newCount));
    setViewCount(clampedCount);
  };

  // Zoom In / Out Buttons
  const zoomIn = () => {
    setViewCount(prev => Math.max(15, Math.round(prev * 0.8)));
  };

  const zoomOut = () => {
    setViewCount(prev => Math.min(rawCandles.length, Math.round(prev * 1.25)));
  };

  const resetView = () => {
    setViewOffset(0);
    setViewCount(Math.min(rawCandles.length, 60));
  };

  const viewAllData = () => {
    setViewOffset(0);
    setViewCount(rawCandles.length);
  };

  // Panning & Drawing Mouse Event Handlers
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool !== 'none') {
      // Start drawing a shape
      if (svgRef.current && visibleCandles.length > 0) {
        const rect = svgRef.current.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        const svgX = (clientX / rect.width) * width;
        const svgY = (clientY / rect.height) * totalHeight;

        // Find nearest candle
        const candleIndex = Math.max(0, Math.min(visibleCandles.length - 1, Math.round(((svgX - paddingLeft) / innerWidth) * (visibleCandles.length - 1))));
        const price = getPriceFromY(svgY);

        const newPoint: Point = {
          x: svgX,
          y: price,
          candleIndex,
        };

        if (activeTool === 'horizontal' || activeTool === 'vertical') {
          // Instant 1-point creation
          const newShape: DrawingShape = {
            id: `draw_${Date.now()}`,
            type: activeTool,
            color: '#f43f5e',
            lineWidth: 1.5,
            startPoint: newPoint,
          };
          setShapes(prev => [...prev, newShape]);
          setActiveTool('none');
        } else {
          // 2-point creation (trendline, rectangle, fibonacci)
          setDrawingShape({
            id: `draw_${Date.now()}`,
            type: activeTool,
            color: activeTool === 'fibonacci' ? '#fbbf24' : '#38bdf8',
            lineWidth: 1.5,
            startPoint: newPoint,
          });
        }
      }
      return;
    }

    // Default: Pan mode
    setIsPanning(true);
    panStartRef.current = {
      x: e.clientX,
      offset: viewOffset,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || visibleCandles.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const svgX = (clientX / rect.width) * width;
    const svgY = (clientY / rect.height) * totalHeight;

    // Crosshair index
    const index = Math.round(((svgX - paddingLeft) / innerWidth) * (visibleCandles.length - 1));
    const clampedIndex = Math.max(0, Math.min(visibleCandles.length - 1, index));
    setHoverIndex(clampedIndex);
    setHoverPrice(getPriceFromY(svgY));

    // If Panning
    if (isPanning && panStartRef.current) {
      const deltaX = e.clientX - panStartRef.current.x;
      // Convert pixel delta to candle offset delta
      const candlePixelWidth = innerWidth / visibleCandles.length;
      const candleDelta = Math.round(deltaX / candlePixelWidth);
      const maxOffset = Math.max(0, rawCandles.length - viewCount);
      const newOffset = Math.max(0, Math.min(maxOffset, panStartRef.current.offset + candleDelta));
      setViewOffset(newOffset);
    }

    // If Drawing 2-point shape
    if (drawingShape && drawingShape.startPoint) {
      const candleIndex = Math.max(0, Math.min(visibleCandles.length - 1, Math.round(((svgX - paddingLeft) / innerWidth) * (visibleCandles.length - 1))));
      const price = getPriceFromY(svgY);
      setDrawingShape(prev => ({
        ...prev,
        endPoint: {
          x: svgX,
          y: price,
          candleIndex,
        },
      }));
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      panStartRef.current = null;
    }

    if (drawingShape && drawingShape.startPoint && drawingShape.endPoint) {
      setShapes(prev => [...prev, drawingShape as DrawingShape]);
      setDrawingShape(null);
      setActiveTool('none');
    }
  };

  const handleMouseLeave = () => {
    setIsPanning(false);
    panStartRef.current = null;
    setHoverIndex(null);
    setHoverPrice(null);
    if (drawingShape) {
      setDrawingShape(null);
      setActiveTool('none');
    }
  };

  // Touch Support (Mobile Pan & Pinch Zoom)
  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsPanning(true);
      panStartRef.current = {
        x: touch.clientX,
        offset: viewOffset,
      };
    } else if (e.touches.length === 2) {
      // Pinch zoom start
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      touchStartDistRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 1 && isPanning && panStartRef.current) {
      const touch = e.touches[0];
      const deltaX = touch.clientX - panStartRef.current.x;
      const candlePixelWidth = innerWidth / visibleCandles.length;
      const candleDelta = Math.round(deltaX / candlePixelWidth);
      const maxOffset = Math.max(0, rawCandles.length - viewCount);
      const newOffset = Math.max(0, Math.min(maxOffset, panStartRef.current.offset + candleDelta));
      setViewOffset(newOffset);

      if (svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const clientX = touch.clientX - rect.left;
        const svgX = (clientX / rect.width) * width;
        const index = Math.round(((svgX - paddingLeft) / innerWidth) * (visibleCandles.length - 1));
        const clampedIndex = Math.max(0, Math.min(visibleCandles.length - 1, index));
        setHoverIndex(clampedIndex);
      }
    } else if (e.touches.length === 2 && touchStartDistRef.current) {
      // Pinch zoom
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const ratio = touchStartDistRef.current / dist;
      if (Math.abs(ratio - 1) > 0.05) {
        const newCount = Math.round(viewCount * ratio);
        setViewCount(Math.max(15, Math.min(rawCandles.length, newCount)));
        touchStartDistRef.current = dist;
      }
    }
  };

  const handleTouchEnd = () => {
    setIsPanning(false);
    panStartRef.current = null;
    touchStartDistRef.current = null;
  };

  // Delete Shape
  const deleteSelectedShape = () => {
    if (selectedShapeId) {
      setShapes(prev => prev.filter(s => s.id !== selectedShapeId));
      setSelectedShapeId(null);
    }
  };

  const clearAllShapes = () => {
    setShapes([]);
    setSelectedShapeId(null);
    setDrawingShape(null);
    setActiveTool('none');
  };

  return (
    <div className="space-y-3 font-sans">
      {/* 1. Interactive Master Toolbar: 기간 | 지표 | 그리기 | 설정 | 초기화 */}
      <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-2.5 bg-slate-50 dark:bg-slate-900/70 p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        
        {/* Left Section: Period Selector & Candle/Line Switch */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Kiwoom TR info Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-500 border border-rose-500/20 text-xs font-bold font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
            <span>키움 {currentPeriodConfig.trId}</span>
          </div>

          {/* Period Tabs: 1분 / 5분 / 15분 / 30분 / 60분 / 일봉 */}
          <div className="flex p-0.5 bg-slate-200/60 dark:bg-slate-800 rounded-xl text-xs font-semibold overflow-x-auto scrollbar-none">
            {KIWOOM_PERIODS.map(p => {
              const isActive = period === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPeriod(p.id)}
                  disabled={!p.supported || isLoading}
                  className={`px-2.5 py-1 rounded-lg transition-all shrink-0 font-mono text-xs ${
                    isActive
                      ? 'bg-white dark:bg-rose-500 text-slate-900 dark:text-white font-bold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title={`${p.description} (실제 키움 데이터)`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Candle / Line Switch */}
          <div className="flex p-0.5 bg-slate-200/60 dark:bg-slate-800 rounded-xl text-xs font-semibold shrink-0">
            <button
              onClick={() => setChartType('candle')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                chartType === 'candle'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              봉
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                chartType === 'line'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              선
            </button>
          </div>
        </div>

        {/* Right Section: Indicators | Drawing Tools | Zoom & Pan | Settings | Reset */}
        <div className="flex items-center gap-1.5 flex-wrap justify-between xl:justify-end">
          {/* 1. Indicators Dropdown Menu */}
          <div className="relative">
            <button
              onClick={() => {
                setIsIndicatorMenuOpen(!isIndicatorMenuOpen);
                setIsDrawingMenuOpen(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80 transition-colors"
            >
              <Activity className="w-3.5 h-3.5 text-rose-500" />
              <span>지표 ({[
                indicators.ma.enabled ? 'MA' : null,
                indicators.bollinger.enabled ? 'BB' : null,
                indicators.rsi.enabled ? 'RSI' : null,
                indicators.macd.enabled ? 'MACD' : null,
                indicators.stochastic.enabled ? 'STOCH' : null,
              ].filter(Boolean).length})</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isIndicatorMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-52 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl p-2 z-40 text-xs space-y-1">
                <div className="px-2 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  보조지표 빠른 ON/OFF
                </div>

                <button
                  onClick={() => setIndicators(prev => ({ ...prev, ma: { ...prev.ma, enabled: !prev.ma.enabled } }))}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left font-medium"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    이동평균 (MA 5/20/60/120)
                  </span>
                  {indicators.ma.enabled && <Check className="w-3.5 h-3.5 text-rose-500" />}
                </button>

                <button
                  onClick={() => setIndicators(prev => ({ ...prev, bollinger: { ...prev.bollinger, enabled: !prev.bollinger.enabled } }))}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left font-medium"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    볼린저 밴드 (BB 20, 2)
                  </span>
                  {indicators.bollinger.enabled && <Check className="w-3.5 h-3.5 text-rose-500" />}
                </button>

                <button
                  onClick={() => setIndicators(prev => ({ ...prev, rsi: { ...prev.rsi, enabled: !prev.rsi.enabled } }))}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left font-medium"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                    RSI (상대강도지수 14)
                  </span>
                  {indicators.rsi.enabled && <Check className="w-3.5 h-3.5 text-rose-500" />}
                </button>

                <button
                  onClick={() => setIndicators(prev => ({ ...prev, macd: { ...prev.macd, enabled: !prev.macd.enabled } }))}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left font-medium"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    MACD (12, 26, 9)
                  </span>
                  {indicators.macd.enabled && <Check className="w-3.5 h-3.5 text-rose-500" />}
                </button>

                <button
                  onClick={() => setIndicators(prev => ({ ...prev, stochastic: { ...prev.stochastic, enabled: !prev.stochastic.enabled } }))}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left font-medium"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                    스토캐스틱 (14, 3)
                  </span>
                  {indicators.stochastic.enabled && <Check className="w-3.5 h-3.5 text-rose-500" />}
                </button>

                <button
                  onClick={() => setIndicators(prev => ({ ...prev, vwap: { enabled: !prev.vwap.enabled } }))}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-left font-medium"
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    VWAP (거래량가중평균가)
                  </span>
                  {indicators.vwap.enabled && <Check className="w-3.5 h-3.5 text-rose-500" />}
                </button>

                <div className="pt-1.5 border-t border-slate-100 dark:border-slate-700">
                  <button
                    onClick={() => {
                      setIsIndicatorMenuOpen(false);
                      setIsSettingsModalOpen(true);
                    }}
                    className="w-full text-center py-1.5 font-bold text-rose-500 hover:text-rose-600 rounded-lg hover:bg-rose-500/10 transition-colors"
                  >
                    기간값 및 상세 설정 열기 →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2. Drawing Tools Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setIsDrawingMenuOpen(!isDrawingMenuOpen);
                setIsIndicatorMenuOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors ${
                activeTool !== 'none'
                  ? 'bg-rose-500 text-white border-rose-600 shadow-xs'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/80'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>
                {activeTool === 'none'
                  ? `그리기 (${shapes.length})`
                  : activeTool === 'trendline'
                  ? '추세선 그리기'
                  : activeTool === 'horizontal'
                  ? '수평선 배치'
                  : activeTool === 'vertical'
                  ? '수직선 배치'
                  : activeTool === 'rectangle'
                  ? '사각형 박스'
                  : '피보나치 되돌림'}
              </span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isDrawingMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl p-2 z-40 text-xs space-y-1">
                <button
                  onClick={() => {
                    setActiveTool('trendline');
                    setIsDrawingMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left ${activeTool === 'trendline' ? 'bg-rose-500/10 text-rose-500 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <span className="w-2 h-0.5 bg-sky-400 rotate-45 inline-block"></span>
                  <span>추세선 (Trendline)</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTool('horizontal');
                    setIsDrawingMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left ${activeTool === 'horizontal' ? 'bg-rose-500/10 text-rose-500 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <span className="w-3 h-0.5 bg-rose-500 inline-block"></span>
                  <span>수평선 (지지/저항선)</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTool('vertical');
                    setIsDrawingMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left ${activeTool === 'vertical' ? 'bg-rose-500/10 text-rose-500 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <span className="w-0.5 h-3 bg-indigo-500 inline-block"></span>
                  <span>수직선 (시간 구분선)</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTool('rectangle');
                    setIsDrawingMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left ${activeTool === 'rectangle' ? 'bg-rose-500/10 text-rose-500 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <span className="w-3 h-2.5 border border-emerald-400 inline-block"></span>
                  <span>사각형 박스구간</span>
                </button>

                <button
                  onClick={() => {
                    setActiveTool('fibonacci');
                    setIsDrawingMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left ${activeTool === 'fibonacci' ? 'bg-rose-500/10 text-rose-500 font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                >
                  <Compass className="w-3.5 h-3.5 text-amber-500" />
                  <span>피보나치 되돌림</span>
                </button>

                {shapes.length > 0 && (
                  <div className="pt-1.5 border-t border-slate-100 dark:border-slate-700 space-y-1">
                    {selectedShapeId && (
                      <button
                        onClick={deleteSelectedShape}
                        className="w-full flex items-center gap-1.5 px-2 py-1 text-rose-500 hover:bg-rose-500/10 rounded-lg text-left font-semibold"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>선택 도형 삭제</span>
                      </button>
                    )}
                    <button
                      onClick={clearAllShapes}
                      className="w-full flex items-center gap-1.5 px-2 py-1 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-left"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>전체 그리기 삭제</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Settings Button */}
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="p-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            title="보조지표 기간값 상세설정"
          >
            <Sliders className="w-4 h-4" />
          </button>

          {/* 4. Zoom Controls (Zoom In / Zoom Out / Reset / All) */}
          <div className="flex items-center gap-1 bg-slate-200/50 dark:bg-slate-800/80 p-0.5 rounded-xl">
            <button
              onClick={zoomIn}
              className="p-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              title="확대 (줌 인)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={zoomOut}
              className="p-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              title="축소 (줌 아웃)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={viewAllData}
              className="px-2 py-0.5 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              title="전체 데이터 보기"
            >
              전체
            </button>
            <button
              onClick={resetView}
              className="p-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors"
              title="확대/축소 및 이동 초기화"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Refresh Data */}
          <button
            onClick={() => loadChartData(period)}
            disabled={isLoading}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="차트 데이터 새로고침"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-rose-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* 2. Middle Readout Bar: OHLCV & Time Hover Details */}
      {display && !isLoading && !apiError && (
        <div className="flex items-center justify-between flex-wrap gap-2 px-3 py-2 bg-slate-100/50 dark:bg-slate-900/40 rounded-xl text-xs font-mono border border-slate-200/40 dark:border-slate-800/40">
          <div className="flex items-center gap-2 text-slate-400">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-300">{display.time}</span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            <span>
              시: <strong className="text-slate-700 dark:text-slate-200">{display.open.toLocaleString()}</strong>
            </span>
            <span>
              고: <strong className="text-rose-500">{display.high.toLocaleString()}</strong>
            </span>
            <span>
              저: <strong className="text-blue-500">{display.low.toLocaleString()}</strong>
            </span>
            <span>
              종: <strong className={isUp ? 'text-rose-500 font-bold' : 'text-blue-500 font-bold'}>{display.close.toLocaleString()}</strong>
            </span>
            <span className={`font-bold ${isUp ? 'text-rose-500' : 'text-blue-500'}`}>
              ({isUp ? '+' : ''}{candleChangePercent}%)
            </span>
            <span className="text-slate-400 hidden sm:inline">
              거래량: <strong className="text-slate-300">{display.volume.toLocaleString()}주</strong>
            </span>
            {hoverPrice !== null && (
              <span className="text-slate-400 hidden md:inline">
                커서가: <strong className="text-amber-400">{Math.round(hoverPrice).toLocaleString()}원</strong>
              </span>
            )}
          </div>
        </div>
      )}

      {/* 3. Main Chart Canvas Area */}
      <div className="relative w-full rounded-2xl bg-white dark:bg-[#0c0f17] border border-slate-200 dark:border-slate-800/80 p-2 sm:p-3 overflow-hidden min-h-[420px] flex items-center justify-center select-none">
        
        {/* Loading State */}
        {isLoading && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white/80 dark:bg-[#0c0f17]/90 backdrop-blur-xs transition-opacity">
            <div className="w-10 h-10 border-3 border-rose-500 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              키움 Open API 실시간 차트 데이터 조회 중...
            </p>
            <p className="text-xs text-slate-400 font-mono mt-1">
              TR: {currentPeriodConfig.trId} ({currentPeriodConfig.description})
            </p>
          </div>
        )}

        {/* API Error State */}
        {!isLoading && apiError && (
          <div className="w-full max-w-lg p-5 my-6 rounded-2xl bg-rose-500/5 border border-rose-500/20 text-center space-y-3 z-10">
            <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-base font-bold text-rose-500">
                키움 Open API 실전 차트 통신 안내
              </h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed whitespace-pre-line">
                {apiError}
              </p>
            </div>
            {apiError.includes('8050') && serverIp && (
              <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-left font-mono text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-400">
                  <span>현재 서버 공인 IP:</span>
                  <span className="text-emerald-400 font-bold">{serverIp}</span>
                </div>
              </div>
            )}
            <button
              onClick={() => loadChartData(period)}
              className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs shadow-md transition-colors inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>차트 다시 시도</span>
            </button>
          </div>
        )}

        {/* Empty Data State */}
        {!isLoading && !apiError && rawCandles.length === 0 && (
          <div className="text-center py-12 space-y-2 text-slate-400">
            <BarChart2 className="w-10 h-10 mx-auto text-slate-600 opacity-60" />
            <p className="text-sm font-semibold text-slate-300">
              해당 주기의 키움 실전 거래 데이터가 존재하지 않습니다.
            </p>
            <p className="text-xs text-slate-500">
              장 개시 전이거나 최근 체결 이력이 없는 구간입니다. 임의의 데이터는 생성하지 않습니다.
            </p>
          </div>
        )}

        {/* Active Tool Mode Badge Overlay */}
        {activeTool !== 'none' && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-500 text-white text-xs font-bold shadow-lg animate-pulse">
            <span>도형 그리기 활성화: {activeTool}</span>
            <button
              onClick={() => setActiveTool('none')}
              className="text-white hover:text-rose-200 underline text-[11px]"
            >
              취소 (ESC)
            </button>
          </div>
        )}

        {/* SVG Interactive Canvas */}
        {!isLoading && !apiError && visibleCandles.length > 0 && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${totalHeight}`}
            className="w-full h-auto cursor-crosshair select-none touch-none"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <defs>
              <linearGradient id="areaGradientUp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* --- Main Chart: Grid Lines --- */}
            <line x1={paddingLeft} y1={paddingTop} x2={width - paddingRight} y2={paddingTop} stroke="currentColor" className="text-slate-200/50 dark:text-slate-800/80" strokeDasharray="3 3" />
            <line x1={paddingLeft} y1={paddingTop + mainPriceHeight * 0.25} x2={width - paddingRight} y2={paddingTop + mainPriceHeight * 0.25} stroke="currentColor" className="text-slate-200/50 dark:text-slate-800/80" strokeDasharray="3 3" />
            <line x1={paddingLeft} y1={paddingTop + mainPriceHeight * 0.5} x2={width - paddingRight} y2={paddingTop + mainPriceHeight * 0.5} stroke="currentColor" className="text-slate-200/50 dark:text-slate-800/80" strokeDasharray="3 3" />
            <line x1={paddingLeft} y1={paddingTop + mainPriceHeight * 0.75} x2={width - paddingRight} y2={paddingTop + mainPriceHeight * 0.75} stroke="currentColor" className="text-slate-200/50 dark:text-slate-800/80" strokeDasharray="3 3" />
            <line x1={paddingLeft} y1={paddingTop + mainPriceHeight} x2={width - paddingRight} y2={paddingTop + mainPriceHeight} stroke="currentColor" className="text-slate-200 dark:text-slate-800" />

            {/* Right Price Scale Axis */}
            <text x={width - 10} y={paddingTop + 10} fill="currentColor" className="text-[10px] text-slate-400 font-mono" textAnchor="end">
              {formatPrice(maxPrice)}
            </text>
            <text x={width - 10} y={paddingTop + mainPriceHeight * 0.5 + 4} fill="currentColor" className="text-[10px] text-slate-400 font-mono" textAnchor="end">
              {formatPrice(isUSD ? Number(((maxPrice + minPrice) / 2).toFixed(2)) : Math.round((maxPrice + minPrice) / 2))}
            </text>
            <text x={width - 10} y={paddingTop + mainPriceHeight - 4} fill="currentColor" className="text-[10px] text-slate-400 font-mono" textAnchor="end">
              {formatPrice(minPrice)}
            </text>

            {/* Bollinger Bands Shaded Area & Lines */}
            {indicators.bollinger.enabled && bollingerSlice.upper.length > 0 && (
              <g>
                <path
                  d={generateSeriesPath(bollingerSlice.upper)}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="1.2"
                  strokeDasharray="2 2"
                  opacity="0.75"
                />
                <path
                  d={generateSeriesPath(bollingerSlice.middle)}
                  fill="none"
                  stroke="#818cf8"
                  strokeWidth="1"
                  opacity="0.8"
                />
                <path
                  d={generateSeriesPath(bollingerSlice.lower)}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="1.2"
                  strokeDasharray="2 2"
                  opacity="0.75"
                />
              </g>
            )}

            {/* VWAP Line */}
            {indicators.vwap.enabled && vwapSlice.length > 0 && (
              <path
                d={generateSeriesPath(vwapSlice)}
                fill="none"
                stroke="#10b981"
                strokeWidth="1.5"
                opacity="0.9"
              />
            )}

            {/* EMA Line */}
            {indicators.ema.enabled && emaSlice.length > 0 && (
              <path
                d={generateSeriesPath(emaSlice)}
                fill="none"
                stroke="#ec4899"
                strokeWidth="1.4"
                opacity="0.9"
              />
            )}

            {/* Moving Average Lines (MA 5/20/60/120) */}
            {indicators.ma.enabled && (
              <g>
                {indicators.ma.ma5 && sma5Slice.length > 0 && (
                  <path d={generateSeriesPath(sma5Slice)} fill="none" stroke="#f59e0b" strokeWidth="1.4" opacity="0.85" />
                )}
                {indicators.ma.ma20 && sma20Slice.length > 0 && (
                  <path d={generateSeriesPath(sma20Slice)} fill="none" stroke="#a855f7" strokeWidth="1.4" opacity="0.85" />
                )}
                {indicators.ma.ma60 && sma60Slice.length > 0 && (
                  <path d={generateSeriesPath(sma60Slice)} fill="none" stroke="#10b981" strokeWidth="1.4" opacity="0.85" />
                )}
                {indicators.ma.ma120 && sma120Slice.length > 0 && (
                  <path d={generateSeriesPath(sma120Slice)} fill="none" stroke="#06b6d4" strokeWidth="1.4" opacity="0.85" />
                )}
              </g>
            )}

            {/* Current Real-time Price Line */}
            {stockPrice > 0 && stockPrice >= minPrice && stockPrice <= maxPrice && (
              <g>
                <line
                  x1={paddingLeft}
                  y1={getPriceY(stockPrice)}
                  x2={width - paddingRight}
                  y2={getPriceY(stockPrice)}
                  stroke="#ef4444"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                  opacity="0.6"
                />
                <rect
                  x={width - paddingRight + 2}
                  y={getPriceY(stockPrice) - 8}
                  width="70"
                  height="16"
                  fill="#ef4444"
                  rx="3"
                />
                <text
                  x={width - 10}
                  y={getPriceY(stockPrice) + 3}
                  fill="#ffffff"
                  className="text-[9px] font-mono font-bold"
                  textAnchor="end"
                >
                  {stockPrice.toLocaleString()}
                </text>
              </g>
            )}

            {/* Chart Type: Line */}
            {chartType === 'line' && (
              <path
                d={generateSeriesPath(visibleCandles.map(c => c.close))}
                fill="none"
                stroke="#f43f5e"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Chart Type: Candlestick */}
            {chartType === 'candle' && (
              <g>
                {visibleCandles.map((c, i) => {
                  const x = getCandleX(i);
                  const yHigh = getPriceY(c.high);
                  const yLow = getPriceY(c.low);
                  const yOpen = getPriceY(c.open);
                  const yClose = getPriceY(c.close);

                  const candleIsUp = c.close >= c.open;
                  const candleColor = candleIsUp ? '#ef4444' : '#3b82f6';
                  const bodyTop = Math.min(yOpen, yClose);
                  const bodyHeight = Math.max(1.5, Math.abs(yOpen - yClose));
                  const isHovered = hoverIndex === i;

                  return (
                    <g key={i}>
                      {/* Wick */}
                      <line
                        x1={x}
                        y1={yHigh}
                        x2={x}
                        y2={yLow}
                        stroke={candleColor}
                        strokeWidth="1.2"
                      />
                      {/* Body */}
                      <rect
                        x={x - candleWidth / 2}
                        y={bodyTop}
                        width={candleWidth}
                        height={bodyHeight}
                        fill={candleColor}
                        rx="0.5"
                        stroke={isHovered ? '#ffffff' : candleColor}
                        strokeWidth={isHovered ? 1.5 : 0.5}
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {/* Drawn Shapes (Lines, Fibonacci, Rectangles) */}
            {shapes.map((shape) => {
              const isSelected = selectedShapeId === shape.id;
              const y1 = getPriceY(shape.startPoint.y);
              const x1 = shape.startPoint.x;

              if (shape.type === 'horizontal') {
                return (
                  <g key={shape.id} onClick={() => setSelectedShapeId(shape.id)} className="cursor-pointer">
                    <line
                      x1={paddingLeft}
                      y1={y1}
                      x2={width - paddingRight}
                      y2={y1}
                      stroke={shape.color}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      strokeDasharray={isSelected ? '4 2' : undefined}
                    />
                    <text
                      x={width - paddingRight - 5}
                      y={y1 - 4}
                      fill={shape.color}
                      className="text-[9px] font-mono font-bold"
                      textAnchor="end"
                    >
                      {Math.round(shape.startPoint.y).toLocaleString()}원
                    </text>
                  </g>
                );
              }

              if (shape.type === 'vertical') {
                return (
                  <g key={shape.id} onClick={() => setSelectedShapeId(shape.id)} className="cursor-pointer">
                    <line
                      x1={x1}
                      y1={paddingTop}
                      x2={x1}
                      y2={paddingTop + mainPriceHeight}
                      stroke={shape.color}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                    />
                  </g>
                );
              }

              if (shape.endPoint) {
                const x2 = shape.endPoint.x;
                const y2 = getPriceY(shape.endPoint.y);

                if (shape.type === 'trendline') {
                  return (
                    <g key={shape.id} onClick={() => setSelectedShapeId(shape.id)} className="cursor-pointer">
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={shape.color}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                      />
                    </g>
                  );
                }

                if (shape.type === 'rectangle') {
                  const rx = Math.min(x1, x2);
                  const ry = Math.min(y1, y2);
                  const rw = Math.abs(x2 - x1);
                  const rh = Math.abs(y2 - y1);
                  return (
                    <g key={shape.id} onClick={() => setSelectedShapeId(shape.id)} className="cursor-pointer">
                      <rect
                        x={rx}
                        y={ry}
                        width={rw}
                        height={rh}
                        fill={shape.color}
                        fillOpacity="0.12"
                        stroke={shape.color}
                        strokeWidth={isSelected ? 2 : 1}
                      />
                    </g>
                  );
                }

                if (shape.type === 'fibonacci') {
                  const startY = y1;
                  const endY = y2;
                  const diffY = endY - startY;
                  const startP = shape.startPoint.y;
                  const endP = shape.endPoint.y;
                  const diffP = endP - startP;

                  return (
                    <g key={shape.id} onClick={() => setSelectedShapeId(shape.id)} className="cursor-pointer">
                      {FIBONACCI_LEVELS.map(f => {
                        const levelY = startY + diffY * f.level;
                        const levelPrice = startP + diffP * f.level;
                        return (
                          <g key={f.level}>
                            <line
                              x1={Math.min(x1, x2)}
                              y1={levelY}
                              x2={Math.max(x1, x2) + 60}
                              y2={levelY}
                              stroke={f.color}
                              strokeWidth="1"
                              strokeDasharray="2 2"
                            />
                            <text
                              x={Math.max(x1, x2) + 65}
                              y={levelY + 3}
                              fill={f.color}
                              className="text-[9px] font-mono"
                            >
                              {f.label} ({Math.round(levelPrice).toLocaleString()})
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                }
              }

              return null;
            })}

            {/* In-progress drawing shape preview */}
            {drawingShape && drawingShape.startPoint && drawingShape.endPoint && (
              <g className="pointer-events-none opacity-80">
                {drawingShape.type === 'trendline' && (
                  <line
                    x1={drawingShape.startPoint.x}
                    y1={getPriceY(drawingShape.startPoint.y)}
                    x2={drawingShape.endPoint.x}
                    y2={getPriceY(drawingShape.endPoint.y)}
                    stroke={drawingShape.color || '#38bdf8'}
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                )}
                {drawingShape.type === 'rectangle' && (
                  <rect
                    x={Math.min(drawingShape.startPoint.x, drawingShape.endPoint.x)}
                    y={Math.min(getPriceY(drawingShape.startPoint.y), getPriceY(drawingShape.endPoint.y))}
                    width={Math.abs(drawingShape.endPoint.x - drawingShape.startPoint.x)}
                    height={Math.abs(getPriceY(drawingShape.endPoint.y) - getPriceY(drawingShape.startPoint.y))}
                    fill="#38bdf8"
                    fillOpacity="0.15"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                )}
                {drawingShape.type === 'fibonacci' && (
                  <line
                    x1={drawingShape.startPoint.x}
                    y1={getPriceY(drawingShape.startPoint.y)}
                    x2={drawingShape.endPoint.x}
                    y2={getPriceY(drawingShape.endPoint.y)}
                    stroke="#fbbf24"
                    strokeWidth="1.5"
                  />
                )}
              </g>
            )}

            {/* --- Crosshair on hover (Price & Time Cursor) --- */}
            {hoverIndex !== null && visibleCandles[hoverIndex] && (
              <g className="pointer-events-none">
                {/* Vertical cursor line */}
                <line
                  x1={getCandleX(hoverIndex)}
                  y1={paddingTop}
                  x2={getCandleX(hoverIndex)}
                  y2={totalHeight - bottomTimePadding}
                  stroke="#94a3b8"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                />
                {/* Horizontal price cursor line */}
                <line
                  x1={paddingLeft}
                  y1={getPriceY(visibleCandles[hoverIndex].close)}
                  x2={width - paddingRight}
                  y2={getPriceY(visibleCandles[hoverIndex].close)}
                  stroke="#94a3b8"
                  strokeDasharray="2 2"
                  strokeWidth="1"
                />
                {/* Hover Price Tag on right scale */}
                <rect
                  x={width - paddingRight + 2}
                  y={getPriceY(visibleCandles[hoverIndex].close) - 8}
                  width="70"
                  height="16"
                  fill="#475569"
                  rx="3"
                />
                <text
                  x={width - 10}
                  y={getPriceY(visibleCandles[hoverIndex].close) + 3}
                  fill="#ffffff"
                  className="text-[9px] font-mono font-bold"
                  textAnchor="end"
                >
                  {visibleCandles[hoverIndex].close.toLocaleString()}
                </text>
              </g>
            )}

            {/* --- Sub-Chart: Volume --- */}
            {indicators.volume.enabled && (
              <g>
                <line
                  x1={paddingLeft}
                  y1={volumeStartY}
                  x2={width - paddingRight}
                  y2={volumeStartY}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                />
                <text x={paddingLeft + 5} y={volumeStartY + 12} fill="currentColor" className="text-[10px] text-slate-400 font-mono">
                  거래량 (Volume)
                </text>
                <text x={width - 10} y={volumeStartY + 12} fill="currentColor" className="text-[10px] text-slate-400 font-mono" textAnchor="end">
                  {maxVolume.toLocaleString()}
                </text>

                {visibleCandles.map((c, i) => {
                  const x = getCandleX(i);
                  const barH = Math.max(1, (c.volume / maxVolume) * (volumeHeight - 15));
                  const y = volumeStartY + volumeHeight - barH;
                  const barColor = c.close >= c.open ? '#ef4444' : '#3b82f6';
                  const isHovered = hoverIndex === i;

                  return (
                    <rect
                      key={`vol-${i}`}
                      x={x - candleWidth / 2}
                      y={y}
                      width={candleWidth}
                      height={barH}
                      fill={barColor}
                      opacity={isHovered ? '0.9' : '0.45'}
                    />
                  );
                })}
              </g>
            )}

            {/* --- Sub-Chart: RSI --- */}
            {hasSubChartRsi && (
              <g>
                <line
                  x1={paddingLeft}
                  y1={rsiStartY}
                  x2={width - paddingRight}
                  y2={rsiStartY}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                />
                <text x={paddingLeft + 5} y={rsiStartY + 12} fill="currentColor" className="text-[10px] text-slate-400 font-mono">
                  RSI ({indicators.rsi.period})
                </text>
                {/* 70 Overbought & 30 Oversold reference lines */}
                <line
                  x1={paddingLeft}
                  y1={rsiStartY + subChartHeight * 0.3}
                  x2={width - paddingRight}
                  y2={rsiStartY + subChartHeight * 0.3}
                  stroke="#ef4444"
                  strokeDasharray="2 2"
                  opacity="0.4"
                />
                <text x={width - 10} y={rsiStartY + subChartHeight * 0.3 + 3} fill="#ef4444" className="text-[8px] font-mono" textAnchor="end">
                  70
                </text>
                <line
                  x1={paddingLeft}
                  y1={rsiStartY + subChartHeight * 0.7}
                  x2={width - paddingRight}
                  y2={rsiStartY + subChartHeight * 0.7}
                  stroke="#3b82f6"
                  strokeDasharray="2 2"
                  opacity="0.4"
                />
                <text x={width - 10} y={rsiStartY + subChartHeight * 0.7 + 3} fill="#3b82f6" className="text-[8px] font-mono" textAnchor="end">
                  30
                </text>

                {/* RSI Line */}
                {(() => {
                  const points: string[] = [];
                  for (let i = 0; i < rsiSlice.length; i++) {
                    const val = rsiSlice[i];
                    if (val !== null) {
                      const x = getCandleX(i);
                      const y = rsiStartY + subChartHeight - (val / 100) * subChartHeight;
                      points.push(`${points.length === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`);
                    }
                  }
                  return points.length > 0 ? (
                    <path d={points.join(' ')} fill="none" stroke="#06b6d4" strokeWidth="1.5" />
                  ) : null;
                })()}
              </g>
            )}

            {/* --- Sub-Chart: MACD --- */}
            {hasSubChartMacd && (
              <g>
                <line
                  x1={paddingLeft}
                  y1={macdStartY}
                  x2={width - paddingRight}
                  y2={macdStartY}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                />
                <text x={paddingLeft + 5} y={macdStartY + 12} fill="currentColor" className="text-[10px] text-slate-400 font-mono">
                  MACD ({indicators.macd.fastPeriod}, {indicators.macd.slowPeriod}, {indicators.macd.signalPeriod})
                </text>

                {(() => {
                  const validHist = macdSlice.histogram.filter((v): v is number => v !== null);
                  const maxH = Math.max(...validHist.map(Math.abs), 1);
                  const midY = macdStartY + subChartHeight / 2;

                  return (
                    <>
                      {/* Zero line */}
                      <line x1={paddingLeft} y1={midY} x2={width - paddingRight} y2={midY} stroke="currentColor" className="text-slate-700" strokeDasharray="2 2" />

                      {/* Histogram bars */}
                      {macdSlice.histogram.map((val, i) => {
                        if (val === null) return null;
                        const x = getCandleX(i);
                        const h = (Math.abs(val) / maxH) * (subChartHeight / 2 - 4);
                        const y = val >= 0 ? midY - h : midY;
                        const color = val >= 0 ? '#ef4444' : '#3b82f6';
                        return (
                          <rect
                            key={`hist-${i}`}
                            x={x - candleWidth / 2}
                            y={y}
                            width={candleWidth}
                            height={Math.max(1, h)}
                            fill={color}
                            opacity="0.6"
                          />
                        );
                      })}

                      {/* MACD Line */}
                      {(() => {
                        const points: string[] = [];
                        for (let i = 0; i < macdSlice.macdLine.length; i++) {
                          const val = macdSlice.macdLine[i];
                          if (val !== null) {
                            const x = getCandleX(i);
                            const y = midY - (val / maxH) * (subChartHeight / 2 - 6);
                            points.push(`${points.length === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`);
                          }
                        }
                        return points.length > 0 ? (
                          <path d={points.join(' ')} fill="none" stroke="#f43f5e" strokeWidth="1.3" />
                        ) : null;
                      })()}

                      {/* Signal Line */}
                      {(() => {
                        const points: string[] = [];
                        for (let i = 0; i < macdSlice.signalLine.length; i++) {
                          const val = macdSlice.signalLine[i];
                          if (val !== null) {
                            const x = getCandleX(i);
                            const y = midY - (val / maxH) * (subChartHeight / 2 - 6);
                            points.push(`${points.length === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`);
                          }
                        }
                        return points.length > 0 ? (
                          <path d={points.join(' ')} fill="none" stroke="#38bdf8" strokeWidth="1.3" />
                        ) : null;
                      })()}
                    </>
                  );
                })()}
              </g>
            )}

            {/* --- Sub-Chart: Stochastic --- */}
            {hasSubChartStoch && (
              <g>
                <line
                  x1={paddingLeft}
                  y1={stochStartY}
                  x2={width - paddingRight}
                  y2={stochStartY}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                />
                <text x={paddingLeft + 5} y={stochStartY + 12} fill="currentColor" className="text-[10px] text-slate-400 font-mono">
                  스토캐스틱 ({indicators.stochastic.kPeriod}, {indicators.stochastic.dPeriod})
                </text>
                {/* 80 & 20 reference lines */}
                <line
                  x1={paddingLeft}
                  y1={stochStartY + subChartHeight * 0.2}
                  x2={width - paddingRight}
                  y2={stochStartY + subChartHeight * 0.2}
                  stroke="#ef4444"
                  strokeDasharray="2 2"
                  opacity="0.4"
                />
                <line
                  x1={paddingLeft}
                  y1={stochStartY + subChartHeight * 0.8}
                  x2={width - paddingRight}
                  y2={stochStartY + subChartHeight * 0.8}
                  stroke="#3b82f6"
                  strokeDasharray="2 2"
                  opacity="0.4"
                />

                {/* %K line */}
                {(() => {
                  const points: string[] = [];
                  for (let i = 0; i < stochSlice.kLine.length; i++) {
                    const val = stochSlice.kLine[i];
                    if (val !== null) {
                      const x = getCandleX(i);
                      const y = stochStartY + subChartHeight - (val / 100) * subChartHeight;
                      points.push(`${points.length === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`);
                    }
                  }
                  return points.length > 0 ? (
                    <path d={points.join(' ')} fill="none" stroke="#a855f7" strokeWidth="1.4" />
                  ) : null;
                })()}

                {/* %D line */}
                {(() => {
                  const points: string[] = [];
                  for (let i = 0; i < stochSlice.dLine.length; i++) {
                    const val = stochSlice.dLine[i];
                    if (val !== null) {
                      const x = getCandleX(i);
                      const y = stochStartY + subChartHeight - (val / 100) * subChartHeight;
                      points.push(`${points.length === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`);
                    }
                  }
                  return points.length > 0 ? (
                    <path d={points.join(' ')} fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="3 2" />
                  ) : null;
                })()}
              </g>
            )}

            {/* --- Bottom Time Axis Labels --- */}
            {visibleCandles
              .filter((_, i) => i % Math.max(1, Math.floor(visibleCandles.length / 6)) === 0)
              .map((c, i) => {
                const originalIndex = visibleCandles.indexOf(c);
                const x = getCandleX(originalIndex);
                return (
                  <text
                    key={`time-${i}`}
                    x={x}
                    y={totalHeight - 10}
                    fill="currentColor"
                    className="text-[10px] text-slate-400 font-mono"
                    textAnchor="middle"
                  >
                    {c.time}
                  </text>
                );
              })}
          </svg>
        )}
      </div>

      {/* 4. Bottom Footer: Indicators Legend & Guide */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 px-3 py-2 text-xs text-slate-400 font-mono">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 inline-block"></span>
            <span>상승</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-blue-500 inline-block"></span>
            <span>하락</span>
          </span>
          {indicators.ma.enabled && (
            <>
              {indicators.ma.ma5 && (
                <span className="flex items-center gap-1 text-amber-500 font-semibold">
                  <span className="w-2.5 h-0.5 bg-amber-500 inline-block"></span>
                  <span>MA{indicators.ma.period5}</span>
                </span>
              )}
              {indicators.ma.ma20 && (
                <span className="flex items-center gap-1 text-purple-400 font-semibold">
                  <span className="w-2.5 h-0.5 bg-purple-400 inline-block"></span>
                  <span>MA{indicators.ma.period20}</span>
                </span>
              )}
              {indicators.ma.ma60 && (
                <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                  <span className="w-2.5 h-0.5 bg-emerald-400 inline-block"></span>
                  <span>MA{indicators.ma.period60}</span>
                </span>
              )}
              {indicators.ma.ma120 && (
                <span className="flex items-center gap-1 text-cyan-400 font-semibold">
                  <span className="w-2.5 h-0.5 bg-cyan-400 inline-block"></span>
                  <span>MA{indicators.ma.period120}</span>
                </span>
              )}
            </>
          )}
          {indicators.bollinger.enabled && (
            <span className="flex items-center gap-1 text-indigo-400 font-semibold">
              <span className="w-2.5 h-0.5 bg-indigo-400 inline-block"></span>
              <span>BB({indicators.bollinger.period})</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>마우스 휠(확대/축소) • 드래그(좌우이동)</span>
          <span>•</span>
          <span>{visibleCandles.length}/{rawCandles.length}개 표시</span>
        </div>
      </div>

      {/* 5. Indicators Settings Modal */}
      <IndicatorSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={indicators}
        onChange={setIndicators}
      />
    </div>
  );
};
