import React, { useState } from 'react';

interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'circle' | 'square';
  ring?: string;
  className?: string;
  onClick?: () => void;
  hover?: boolean;
  status?: 'online' | 'offline' | 'away';
  alt?: string;
}

const SIZE_MAP = {
  xs: { img: 'h-7 w-7',   text: 'text-[9px]',  status: 'h-2 w-2 -bottom-px -right-px border',         font: 'font-black' },
  sm: { img: 'h-9 w-9',   text: 'text-[10px]', status: 'h-2.5 w-2.5 -bottom-0.5 -right-0.5 border-2', font: 'font-black' },
  md: { img: 'h-10 w-10', text: 'text-xs',     status: 'h-3 w-3 -bottom-0.5 -right-0.5 border-2',     font: 'font-black' },
  lg: { img: 'h-12 w-12', text: 'text-sm',     status: 'h-3.5 w-3.5 bottom-0 right-0 border-2',       font: 'font-bold'  },
  xl: { img: 'h-16 w-16', text: 'text-base',   status: 'h-4 w-4 bottom-0 right-0 border-2',           font: 'font-bold'  },
};

const STATUS_COLORS = {
  online:  'bg-emerald-500',
  offline: 'bg-slate-400',
  away:    'bg-amber-400',
};

const PALETTE = [
  'bg-teal-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-violet-500',
  'bg-rose-500',  'bg-amber-500', 'bg-emerald-500', 'bg-sky-500',
];

function getInitials(name?: string): string {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function getColorFromName(name?: string): string {
  if (!name) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

const Avatar: React.FC<AvatarProps> = ({
  src, name, size = 'md', shape = 'square', ring, className = '',
  onClick, hover = false, status, alt,
}) => {
  const [errored, setErrored] = useState(false);
  const s = SIZE_MAP[size];
  const shapeClass  = shape === 'circle' ? 'rounded-full' : 'rounded-xl';
  const ringClass   = ring ? `ring-2 ${ring}` : '';
  const hoverClass  = hover || onClick ? 'group-hover:scale-105 transition-transform duration-200' : '';
  const showImg     = src && !errored;
  const initials    = getInitials(name);
  const bgColor     = getColorFromName(name);

  const inner = showImg ? (
    <img
      src={src}
      alt={alt ?? name ?? 'User'}
      className={`${s.img} ${shapeClass} object-cover`}
      onError={() => setErrored(true)}
    />
  ) : (
    <div className={`${s.img} ${shapeClass} ${bgColor} flex items-center justify-center select-none`}>
      <span className={`text-white ${s.text} ${s.font}`}>{initials}</span>
    </div>
  );

  const wrapper = (
    <div className={`relative shrink-0 ${s.img} ${shapeClass} ${ringClass} ${hoverClass} ${className}`}>
      {inner}
      {status && (
        <span
          className={`absolute ${s.status} ${STATUS_COLORS[status]} rounded-full border-white dark:border-slate-900`}
          aria-hidden="true"
        />
      )}
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`relative shrink-0 ${s.img} ${shapeClass} ${ringClass} ${hoverClass} ${className} focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2`}
        aria-label={alt ?? name ?? 'View user'}
      >
        {inner}
        {status && (
          <span
            className={`absolute ${s.status} ${STATUS_COLORS[status]} rounded-full border-white dark:border-slate-900`}
            aria-hidden="true"
          />
        )}
      </button>
    );
  }

  return wrapper;
};

export default Avatar;
