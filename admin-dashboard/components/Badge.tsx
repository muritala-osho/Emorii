import React from 'react';

export type BadgeVariant =
  | 'active' | 'warned' | 'suspended' | 'banned'
  | 'pending' | 'resolved' | 'dismissed'
  | 'high' | 'medium' | 'low'
  | 'verified' | 'unverified'
  | 'premium'
  | 'online' | 'offline'
  | 'open' | 'closed' | 'in-progress'
  | 'neutral';

export type BadgeSize = 'xs' | 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  label?: string;
  children?: React.ReactNode;
  size?: BadgeSize;
  dot?: boolean;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  active:       'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20',
  warned:       'bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-100 dark:border-orange-500/20',
  suspended:    'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-500/20',
  banned:       'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-500/20',
  pending:      'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-500/20',
  resolved:     'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20',
  dismissed:    'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  high:         'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-100 dark:border-rose-500/20',
  medium:       'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-500/20',
  low:          'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  verified:     'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-100 dark:border-cyan-500/20',
  unverified:   'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 border-gray-200 dark:border-slate-700',
  premium:      'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-100 dark:border-amber-500/20',
  online:       'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20',
  offline:      'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  open:         'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-100 dark:border-sky-500/20',
  closed:       'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  'in-progress':'bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-100 dark:border-violet-500/20',
  neutral:      'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 border-gray-200 dark:border-slate-700',
};

const DOT_COLORS: Record<string, string> = {
  active: 'bg-emerald-500', warned: 'bg-orange-500', suspended: 'bg-amber-500', banned: 'bg-rose-500',
  pending: 'bg-amber-500', resolved: 'bg-emerald-500', dismissed: 'bg-slate-400',
  high: 'bg-rose-500', medium: 'bg-amber-500', low: 'bg-slate-400',
  verified: 'bg-cyan-500', unverified: 'bg-gray-400', premium: 'bg-amber-500',
  online: 'bg-emerald-500', offline: 'bg-slate-400', open: 'bg-sky-500', closed: 'bg-slate-400',
  'in-progress': 'bg-violet-500', neutral: 'bg-gray-400',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  xs: 'px-1.5 py-0.5 text-[9px] rounded-md gap-1',
  sm: 'px-2.5 py-1 text-[10px] rounded-lg gap-1.5',
  md: 'px-3 py-1.5 text-xs rounded-xl gap-2',
};

const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral', label, children, size = 'sm', dot = false, className = '',
}) => {
  const content = label ?? children;
  return (
    <span
      className={`inline-flex items-center font-black uppercase tracking-wide border ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
    >
      {dot && (
        <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${DOT_COLORS[variant] ?? 'bg-gray-400'}`} />
      )}
      {content}
    </span>
  );
};

export default Badge;
