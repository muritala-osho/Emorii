import React, { useEffect, useRef } from 'react';
import { CheckCircle, AlertCircle, X } from 'lucide-react';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface Props {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

const DURATION_MS: Record<Toast['type'], number> = { success: 4000, error: 6000 };

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(toast.id), DURATION_MS[toast.type]);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [toast.id, toast.type, onDismiss]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`animate-toastIn px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border backdrop-blur-md min-w-[260px] max-w-[400px] ${
        toast.type === 'success'
          ? 'bg-emerald-500/95 text-white border-emerald-400'
          : 'bg-rose-500/95 text-white border-rose-400'
      }`}
    >
      {toast.type === 'success'
        ? <CheckCircle size={17} className="shrink-0" />
        : <AlertCircle size={17} className="shrink-0" />}
      <span className="text-sm font-semibold flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="ml-1 p-1 hover:bg-white/20 rounded-lg transition-all shrink-0"
      >
        <X size={13} />
      </button>
    </div>
  );
}

const MAX_VISIBLE = 3;

const ToastContainer: React.FC<Props> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-6 right-6 z-[300] flex flex-col items-end gap-2 pointer-events-none"
    >
      {toasts.slice(-MAX_VISIBLE).map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
