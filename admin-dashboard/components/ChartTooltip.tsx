import React from 'react';

interface TooltipEntry {
  name: string;
  value: number | string;
  color: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  formatter?: (value: number | string, name: string) => [string, string];
  labelFormatter?: (label: string) => string;
  prefix?: string;
  suffix?: string;
}

const ChartTooltip: React.FC<ChartTooltipProps> = ({
  active, payload, label, formatter, labelFormatter, prefix = '', suffix = '',
}) => {
  if (!active || !payload || payload.length === 0) return null;

  const displayLabel = labelFormatter ? labelFormatter(label ?? '') : label;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 p-4 min-w-[148px] pointer-events-none">
      {displayLabel && (
        <p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-2.5 pb-2 border-b border-gray-100 dark:border-slate-800">
          {displayLabel}
        </p>
      )}
      <div className="space-y-2">
        {payload.map((entry, i) => {
          const [formattedValue, formattedName] = formatter
            ? formatter(entry.value, entry.name)
            : [`${prefix}${Number(entry.value).toLocaleString()}${suffix}`, entry.name];
          return (
            <div key={i} className="flex items-center gap-2.5">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-[11px] text-gray-500 dark:text-slate-400 font-semibold flex-1 truncate">
                {formattedName}
              </span>
              <span className="text-[12px] font-black text-gray-900 dark:text-white tabular-nums ml-1">
                {formattedValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChartTooltip;
