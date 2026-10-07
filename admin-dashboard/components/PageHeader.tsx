import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  eyebrow?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, badge, eyebrow }) => (
  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div className="min-w-0">
      {eyebrow && (
        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-[0.16em] mb-2">
          {eyebrow}
        </p>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl md:text-[28px] font-bold text-gray-900 dark:text-white tracking-tight leading-tight">
          {title}
        </h1>
        {badge}
      </div>
      {subtitle && (
        <p className="text-sm text-gray-600 dark:text-slate-300 font-medium mt-2 leading-snug">
          {subtitle}
        </p>
      )}
    </div>
    {actions && (
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        {actions}
      </div>
    )}
  </div>
);

export default PageHeader;
