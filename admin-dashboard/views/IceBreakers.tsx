import React, { useEffect, useState, useCallback } from 'react';
import { adminApi } from '../services/adminApi';
import { Plus, Edit2, Trash2, X, Save, Loader2, MessageCircleQuestion } from 'lucide-react';

interface IceBreaker {
  _id: string;
  category: string;
  question: string;
  relatedInterests: string[];
  isActive: boolean;
}

interface Props { showToast: (msg: string, type?: 'success' | 'error') => void; }

const CATEGORIES = ['general', 'music', 'movies', 'food', 'travel', 'sports', 'hobbies', 'dating', 'lifestyle'];

const empty = (): Omit<IceBreaker, '_id'> => ({
  category: 'general', question: '', relatedInterests: [], isActive: true,
});

const IceBreakers: React.FC<Props> = ({ showToast }) => {
  const [items, setItems] = useState<IceBreaker[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<(Omit<IceBreaker, '_id'> & { _id?: string }) | null>(null);
  const [interestsInput, setInterestsInput] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.listIcebreakers();
      setItems(data.items || []);
    } catch (e: any) {
      showToast(e.message || 'Failed to load icebreakers', 'error');
    } finally { setLoading(false); }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const startCreate = () => { setEditing(empty()); setInterestsInput(''); };
  const startEdit = (item: IceBreaker) => {
    setEditing({ ...item });
    setInterestsInput((item.relatedInterests || []).join(', '));
  };
  const cancel = () => { setEditing(null); setInterestsInput(''); };

  const save = async () => {
    if (!editing) return;
    if (!editing.question.trim()) { showToast('Question is required', 'error'); return; }
    setSaving(true);
    const payload = {
      category: editing.category,
      question: editing.question.trim(),
      relatedInterests: interestsInput.split(',').map((s) => s.trim()).filter(Boolean),
      isActive: editing.isActive,
    };
    try {
      if (editing._id) {
        await adminApi.updateIcebreaker(editing._id, payload);
        showToast('Icebreaker updated', 'success');
      } else {
        await adminApi.createIcebreaker(payload);
        showToast('Icebreaker created', 'success');
      }
      cancel();
      load();
    } catch (e: any) {
      showToast(e.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  const toggleActive = async (item: IceBreaker) => {
    try {
      await adminApi.updateIcebreaker(item._id, { isActive: !item.isActive });
      setItems((prev) => prev.map((x) => x._id === item._id ? { ...x, isActive: !x.isActive } : x));
    } catch (e: any) {
      showToast(e.message || 'Update failed', 'error');
    }
  };

  const remove = async (item: IceBreaker) => {
    if (!window.confirm(`Delete this icebreaker?\n\n"${item.question}"`)) return;
    try {
      await adminApi.deleteIcebreaker(item._id);
      setItems((prev) => prev.filter((x) => x._id !== item._id));
      showToast('Deleted', 'success');
    } catch (e: any) {
      showToast(e.message || 'Delete failed', 'error');
    }
  };

  const filtered = items.filter((i) => {
    if (filter !== 'all' && i.category !== filter) return false;
    if (search && !i.question.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = CATEGORIES.reduce<Record<string, number>>((acc, c) => {
    acc[c] = items.filter((i) => i.category === c).length;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <MessageCircleQuestion size={24} /> Icebreakers
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Conversation starters suggested in chat. Tag with interests to make them personalized.
          </p>
        </div>
        <button onClick={startCreate} className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg font-medium">
          <Plus size={18} /> New Icebreaker
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-full text-sm border ${filter === 'all' ? 'bg-rose-600 text-white border-rose-600' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700'}`}>
          All ({items.length})
        </button>
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setFilter(c)} className={`px-3 py-1.5 rounded-full text-sm border capitalize ${filter === c ? 'bg-rose-600 text-white border-rose-600' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700'}`}>
            {c} ({counts[c] || 0})
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search questions..."
          className="ml-auto px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-rose-600" size={32} /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">No icebreakers found.</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">Question</th>
                <th className="text-left px-4 py-3 font-medium">Interests</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map((item) => (
                <tr key={item._id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30">
                  <td className="px-4 py-3"><span className="capitalize text-xs font-medium px-2 py-1 rounded-full bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300">{item.category}</span></td>
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100 max-w-md">{item.question}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{(item.relatedInterests || []).join(', ') || '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(item)} className={`text-xs px-2 py-1 rounded-full ${item.isActive ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                      {item.isActive ? 'Active' : 'Hidden'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => startEdit(item)} className="p-1.5 text-gray-500 hover:text-rose-600"><Edit2 size={16} /></button>
                    <button onClick={() => remove(item)} className="p-1.5 text-gray-500 hover:text-red-600 ml-1"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={cancel}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-gray-900 dark:text-white">{editing._id ? 'Edit Icebreaker' : 'New Icebreaker'}</h3>
              <button onClick={cancel}><X size={20} className="text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Category</label>
                <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 capitalize">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Question (max 300 chars)</label>
                <textarea value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} rows={3} maxLength={300} placeholder="e.g. Burna Boy or Wizkid — and why?" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Related interests (comma-separated)</label>
                <input value={interestsInput} onChange={(e) => setInterestsInput(e.target.value)} placeholder="afrobeats, music, wizkid" className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
                <p className="text-xs text-gray-500 mt-1">Match these to user profile interests for personalized suggestions. Leave empty for "general" questions everyone sees.</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} className="rounded" />
                Active (shown to users)
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-700">
              <button onClick={cancel} className="px-4 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium disabled:opacity-60">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IceBreakers;
