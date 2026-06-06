import React from 'react';
import { Trash2, UserX, PauseCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useFocusTrap } from './FocusTrap';

type ConfirmType = 'ban' | 'unban' | 'delete' | 'suspend' | 'unsuspend';

interface ConfirmModalState {
  user: any;
  type: ConfirmType;
}

interface Props {
  confirmModal: ConfirmModalState | null;
  onClose: () => void;
  onConfirm: () => void;
  actionLoading: string | null;
  suspendDays: number;
  setSuspendDays: (n: number) => void;
}

const TITLES: Record<ConfirmType, string> = {
  delete:    'Delete Account',
  ban:       'Ban User',
  unban:     'Restore Access',
  suspend:   'Suspend User',
  unsuspend: 'Lift Suspension',
};

const ConfirmActionModal: React.FC<Props> = ({
  confirmModal,
  onClose,
  onConfirm,
  actionLoading,
  suspendDays,
  setSuspendDays,
}) => {
  const trapRef = useFocusTrap(confirmModal !== null);

  if (!confirmModal) return null;

  const { user, type } = confirmModal;
  const isDestructive = type === 'delete' || type === 'ban';
  const isSuspend     = type === 'suspend';
  const isRestore     = type === 'unban' || type === 'unsuspend';

  const iconBg = isDestructive ? 'bg-rose-100 dark:bg-rose-500/10'
    : isSuspend ? 'bg-amber-100 dark:bg-amber-500/10'
    : 'bg-emerald-100 dark:bg-emerald-500/10';

  const icon = type === 'delete'    ? <Trash2 size={24} className="text-rose-500" />
    : type === 'ban'       ? <UserX size={24} className="text-rose-500" />
    : type === 'suspend'   ? <PauseCircle size={24} className="text-amber-500" />
    : <CheckCircle2 size={24} className="text-emerald-500" />;

  const confirmBtnClass = isDestructive
    ? 'bg-rose-500 hover:bg-rose-600'
    : isSuspend ? 'bg-amber-500 hover:bg-amber-600'
    : 'bg-emerald-500 hover:bg-emerald-600';

  const bodyText = type === 'delete'
    ? `Permanently delete ${user.name}'s account? This cannot be undone.`
    : type === 'ban'
    ? `Ban ${user.name} from the platform?`
    : type === 'unban'
    ? `Restore full access for ${user.name}?`
    : type === 'suspend'
    ? `Suspend ${user.name} for how many days?`
    : `Remove ${user.name}'s suspension?`;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
    >
      <div
        ref={trapRef}
        className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl border border-white/10 p-8"
      >
        <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mx-auto mb-5 ${iconBg}`}>
          {icon}
        </div>

        <h3
          id="confirm-modal-title"
          className="text-lg font-black text-center dark:text-white mb-2"
        >
          {TITLES[type]}
        </h3>

        <p className="text-sm text-center text-gray-500 dark:text-slate-400 mb-6">
          {bodyText}
        </p>

        {isSuspend && (
          <div className="mb-6">
            <label
              htmlFor="suspend-days"
              className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2"
            >
              Suspension Duration
            </label>
            <select
              id="suspend-days"
              value={suspendDays}
              onChange={e => setSuspendDays(Number(e.target.value))}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-sm outline-none dark:text-white"
            >
              {[1, 3, 7, 14, 30, 90].map(d => (
                <option key={d} value={d}>{d} day{d > 1 ? 's' : ''}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-gray-100 dark:bg-slate-800 rounded-xl text-sm font-bold text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={actionLoading !== null}
            className={`flex-1 py-3 rounded-xl text-sm font-black text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${confirmBtnClass}`}
          >
            {actionLoading ? <Loader2 size={15} className="animate-spin" /> : null}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmActionModal;
