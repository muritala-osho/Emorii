import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Skeleton } from './Skeleton';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  loading?: boolean;
  onClick?: () => void;
  sublabel?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title, value, change, changeLabel = 'vs last month', icon,
  loading = false, onClick, sublabel,
}) => {
  const styles = {
    text: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-card border border-gray-100 dark:border-slate-800 space-y-3">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-14 w-14 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick?.();
        }
      } : undefined}
      className={`bg-white dark:bg-slate-900 p-5 md:p-6 rounded-2xl shadow-card border border-gray-200 dark:border-slate-700 flex items-start justify-between transition-all duration-200 ${onClick ? 'cursor-pointer hover:border-emerald-400 hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-emerald-500' : ''}`}
      aria-label={onClick ? `${title}: ${value}. ${sublabel || 'Open details'}` : undefined}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-600 dark:text-slate-300 uppercase tracking-[0.08em] mb-2">
          {title}
        </p>
        <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight tabular-nums">
          {value}
        </h3>
        {sublabel && (
          <p className="text-xs text-slate-500 dark:text-slate-300 font-medium mt-1">{sublabel}</p>
        )}
        {change !== undefined && (
          <div className={`flex items-center mt-2.5 text-[11px] font-bold gap-1.5 ${change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg ${change >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-rose-50 dark:bg-rose-500/10'}`}>
              {change >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
              {Math.abs(change)}%
            </span>
            <span className="text-gray-500 dark:text-slate-300 font-medium text-xs">{changeLabel}</span>
          </div>
        )}
      </div>
      <div className={`p-3.5 rounded-2xl ${styles.bg} shrink-0 ml-4`}>
        {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<{ className: string; size: number }>, {
          className: styles.text,
          size: 22,
        })}
      </div>
    </div>
  );
};

export default StatCard;
