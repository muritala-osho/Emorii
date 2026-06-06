import React from 'react';

interface SkeletonProps {
  className?: string;
  circle?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', circle }) => (
  <div
    className={`skeleton ${circle ? 'rounded-full' : ''} ${className}`}
    aria-hidden="true"
  />
);

export const SkeletonStatCard: React.FC = () => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-gray-100 dark:border-slate-800 shadow-card">
    <div className="flex items-start justify-between">
      <div className="flex-1 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-14 w-14 rounded-2xl" />
    </div>
  </div>
);

export const SkeletonTableRow: React.FC<{ cols?: number }> = ({ cols = 5 }) => (
  <tr>
    {Array.from({ length: cols }).map((_, i) => (
      <td key={i} className="px-6 py-4">
        <Skeleton className={`h-4 ${i === 0 ? 'w-32' : i === cols - 1 ? 'w-16' : 'w-24'}`} />
      </td>
    ))}
  </tr>
);

export const SkeletonCard: React.FC<{ lines?: number }> = ({ lines = 3 }) => (
  <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-gray-100 dark:border-slate-800 space-y-3">
    <Skeleton className="h-5 w-40" />
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`} />
    ))}
  </div>
);

export const SkeletonList: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800">
        <Skeleton circle className="h-12 w-12 shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-7 w-16 rounded-xl" />
      </div>
    ))}
  </div>
);

export default Skeleton;
