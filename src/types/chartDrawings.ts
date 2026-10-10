// Chart drawing tools and shapes model

export type DrawingToolType = 'none' | 'trendline' | 'horizontal' | 'vertical' | 'rectangle' | 'fibonacci';

export interface Point {
  x: number; // percentage (0 ~ 1) or candle index
  y: number; // price
  candleIndex: number;
}

export interface DrawingShape {
  id: string;
  type: DrawingToolType;
  color: string;
  lineWidth: number;
  // points
  startPoint: Point;
  endPoint?: Point;
}

export const FIBONACCI_LEVELS = [
  { level: 0, label: '0.0%', color: '#94a3b8' },
  { level: 0.236, label: '23.6%', color: '#38bdf8' },
  { level: 0.382, label: '38.2%', color: '#34d399' },
  { level: 0.5, label: '50.0%', color: '#fbbf24' },
  { level: 0.618, label: '61.8%', color: '#f87171' },
  { level: 0.786, label: '78.6%', color: '#c084fc' },
  { level: 1, label: '100.0%', color: '#94a3b8' },
];
