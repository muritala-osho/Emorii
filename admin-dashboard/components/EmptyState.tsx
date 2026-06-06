import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon, title, description, action, className = '', compact = false,
}) => (
  <div
    className={`flex flex-col items-center justify-center text-center ${compact ? 'py-10 px-6' : 'py-20 px-6'} ${className}`}
  >
    <div className="h-16 w-16 rounded-2xl bg-gray-50 dark:bg-slate-800 flex items-center justify-center mb-4 text-gray-300 dark:text-slate-600 border border-gray-100 dark:border-slate-700">
      {icon}
    </div>
    <p className="text-sm font-black text-gray-700 dark:text-slate-200 mb-1">{title}</p>
    {description && (
      <p className="text-xs text-gray-400 dark:text-slate-500 max-w-xs leading-relaxed mt-0.5">
        {description}
      </p>
    )}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export default EmptyState;
