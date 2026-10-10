import React from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface PriceBadgeProps {
  change: number;
  changePercent: number;
  price?: number;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showPrice?: boolean;
  showIcon?: boolean;
  showSign?: boolean;
  pill?: boolean;
}

export const PriceBadge: React.FC<PriceBadgeProps> = ({
  change,
  changePercent,
  price,
  size = 'md',
  showPrice = false,
  showIcon = true,
  showSign = true,
  pill = false,
}) => {
  const isUp = change > 0;
  const isDown = change < 0;
  const isFlat = change === 0;

  // Korean stock market styling: Red = Up, Blue = Down
  const textColor = isUp
    ? 'text-rose-500 dark:text-rose-400'
    : isDown
    ? 'text-blue-600 dark:text-blue-400'
    : 'text-slate-500 dark:text-slate-400';

  const bgColor = isUp
    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
    : isDown
    ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    : 'bg-slate-500/10 text-slate-500 dark:text-slate-400 border-slate-500/20';

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm font-semibold',
    lg: 'text-base font-bold',
    xl: 'text-xl font-bold',
  }[size];

  const sign = isUp ? '+' : '';

  const content = (
    <span className={`inline-flex items-center gap-1 font-mono tracking-tight ${textColor} ${sizeClasses}`}>
      {showIcon && (
        isUp ? (
          <ArrowUpRight className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
        ) : isDown ? (
          <ArrowDownRight className="w-3.5 h-3.5 shrink-0 stroke-[2.5]" />
        ) : (
          <Minus className="w-3 h-3 shrink-0" />
        )
      )}
      {showPrice && price !== undefined && (
        <span className="font-semibold text-slate-900 dark:text-white mr-1.5 font-sans">
          {price.toLocaleString()}원
        </span>
      )}
      <span>
        {showSign ? sign : ''}{changePercent.toFixed(2)}%
      </span>
      {change !== 0 && (
        <span className="text-[0.8em] opacity-80 ml-0.5">
          ({showSign ? sign : ''}{change.toLocaleString()})
        </span>
      )}
    </span>
  );

  if (pill) {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-semibold ${bgColor}`}>
        {content}
      </span>
    );
  }

  return content;
};
