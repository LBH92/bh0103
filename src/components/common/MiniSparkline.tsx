import React from 'react';

interface MiniSparklineProps {
  data: number[];
  isUp: boolean;
  width?: number;
  height?: number;
}

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  data,
  isUp,
  width = 96,
  height = 36,
}) => {
  if (!data || data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 3;

  const points = data
    .map((val, idx) => {
      const x = padding + (idx / (data.length - 1)) * (width - padding * 2);
      const y = height - padding - ((val - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const strokeColor = isUp ? '#f43f5e' : '#3b82f6';
  const fillColor = isUp ? 'rgba(244, 63, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)';

  const firstX = padding;
  const lastX = width - padding;
  const polygonPoints = `${points} ${lastX},${height} ${firstX},${height}`;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${isUp ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity={0.25} />
          <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <polygon points={polygonPoints} fill={`url(#grad-${isUp ? 'up' : 'down'})`} />
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};
