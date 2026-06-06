import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, ArrowRight } from 'lucide-react';
import { NAV_ITEMS } from '../constants';
import { AdminRole } from '../types';
import { useFocusTrap } from './FocusTrap';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
  adminRole: AdminRole;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const CommandPalette: React.FC<Props> = ({ isOpen, onClose, onNavigate, adminRole }) => {
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap(isOpen);

  const allowedItems = NAV_ITEMS.filter(item => item.roles.includes(adminRole));

  const results = query.trim()
    ? allowedItems.filter(item =>
        item.label.toLowerCase().includes(query.toLowerCase()) ||
        item.id.toLowerCase().includes(query.toLowerCase())
      )
    : allowedItems;

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setHighlighted(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  const handleSelect = useCallback((id: string) => {
    onNavigate(id);
    onClose();
  }, [onNavigate, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlighted(h => Math.min(h + 1, results.length - 1));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlighted(h => Math.max(h - 1, 0));
      }
      if (e.key === 'Enter' && results[highlighted]) {
        handleSelect(results[highlighted].id);
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, results, highlighted, handleSelect, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex items-start justify-center pt-[12vh] px-4 animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" />

      <div
        ref={trapRef}
        className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-800 overflow-hidden animate-scaleIn"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 dark:border-slate-800">
          <Search size={17} className="text-gray-400 dark:text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pages…"
            aria-label="Search pages"
            className="flex-1 bg-transparent outline-none text-sm font-medium text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500"
          />
          <div className="flex items-center gap-2 shrink-0">
            <kbd className="px-2 py-1 text-[10px] font-black bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 rounded-md tracking-widest">
              ESC
            </kbd>
            <button
              onClick={onClose}
              aria-label="Close command palette"
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-all"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="max-h-[360px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400 dark:text-slate-500 font-medium">
              No pages found for "{query}"
            </div>
          ) : (
            <ul role="listbox" className="py-1.5">
              {results.map((item, i) => (
                <li key={item.id} role="option" aria-selected={i === highlighted}>
                  <button
                    onMouseEnter={() => setHighlighted(i)}
                    onClick={() => handleSelect(item.id)}
                    className={`flex items-center justify-between w-full px-4 py-3 text-sm transition-colors text-left ${
                      i === highlighted
                        ? 'bg-teal-50 dark:bg-teal-500/10 text-teal-700 dark:text-teal-400'
                        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`${i === highlighted ? 'text-teal-500' : 'text-gray-400 dark:text-slate-500'}`}>
                        {item.icon}
                      </span>
                      <span className="font-medium">{item.label}</span>
                    </div>
                    {i === highlighted && (
                      <ArrowRight size={14} className="text-teal-500 shrink-0" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-2.5 border-t border-gray-100 dark:border-slate-800 flex items-center gap-4 text-[10px] font-black text-gray-300 dark:text-slate-600 uppercase tracking-widest">
          <span><kbd className="mr-1">↑↓</kbd> Navigate</span>
          <span><kbd className="mr-1">↵</kbd> Open</span>
          <span>{isMac ? '⌘K' : 'Ctrl+K'} Toggle</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
