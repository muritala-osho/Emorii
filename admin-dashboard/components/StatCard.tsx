import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Skeleton } from './Skeleton';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  color: string;
  loading?: boolean;
  onClick?: () => void;
  sublabel?: string;
}

const COLOR_MAP: Record<string, { text: string; bg: string; glow: string; border: string }> = {
  'bg-cyan-500':   { text: 'text-cyan-600 dark:text-cyan-400',   bg: 'bg-cyan-50 dark:bg-cyan-500/10',   glow: 'hover:shadow-glow-cyan',   border: 'hover:border-cyan-100 dark:hover:border-cyan-500/20' },
  'bg-rose-500':   { text: 'text-rose-600 dark:text-rose-400',   bg: 'bg-rose-50 dark:bg-rose-500/10',   glow: 'hover:shadow-glow-rose',   border: 'hover:border-rose-100 dark:hover:border-rose-500/20' },
  'bg-indigo-500': { text: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/10', glow: 'hover:shadow-glow-indigo', border: 'hover:border-indigo-100 dark:hover:border-indigo-500/20' },
  'bg-teal-500':   { text: 'text-teal-600 dark:text-teal-400',   bg: 'bg-teal-50 dark:bg-teal-500/10',   glow: 'hover:shadow-glow-teal',   border: 'hover:border-teal-100 dark:hover:border-teal-500/20' },
  'bg-amber-500':  { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', glow: '',                         border: '' },
  'bg-emerald-500':{ text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10', glow: '', border: '' },
  'bg-violet-500': { text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10', glow: '', border: '' },
};

const StatCard: React.FC<StatCardProps> = ({
  title, value, change, changeLabel = 'vs last month', icon, color,
  loading = false, onClick, sublabel,
}) => {
  const styles = COLOR_MAP[color] || COLOR_MAP['bg-teal-500'];

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
      onClick={onClick}
      className={`bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-card border border-gray-100 dark:border-slate-800 flex items-start justify-between transition-all duration-200 ${styles.glow} ${styles.border} ${onClick ? 'cursor-pointer hover:-translate-y-0.5' : 'hover:-translate-y-0.5 hover:shadow-card-hover'}`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.15em] mb-2">
          {title}
        </p>
        <h3 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight tabular-nums">
          {value}
        </h3>
        {sublabel && (
          <p className="text-[10px] text-slate-400 font-medium mt-1">{sublabel}</p>
        )}
        {change !== undefined && (
          <div className={`flex items-center mt-2.5 text-[11px] font-bold gap-1.5 ${change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
            <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg ${change >= 0 ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-rose-50 dark:bg-rose-500/10'}`}>
              {change >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
              {Math.abs(change)}%
            </span>
            <span className="text-gray-400 dark:text-slate-600 font-medium text-[10px]">{changeLabel}</span>
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
