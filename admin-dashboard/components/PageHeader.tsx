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
        <p className="text-[9px] font-black text-teal-500 dark:text-teal-400 uppercase tracking-[0.25em] mb-1.5">
          {eyebrow}
        </p>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight leading-none">
          {title}
        </h1>
        {badge}
      </div>
      {subtitle && (
        <p className="text-sm text-gray-500 dark:text-slate-400 font-medium mt-1.5 leading-snug">
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
