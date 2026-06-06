import React, { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import NotificationCenter from './components/NotificationCenter';
import ErrorBoundary from './components/ErrorBoundary';
import ToastContainer, { Toast } from './components/ToastContainer';
import CommandPalette from './components/CommandPalette';
import DashboardHome from './views/DashboardHome';
import UserManagement from './views/UserManagement';
import Analytics from './views/Analytics';
import Payments from './views/Payments';
import PremiumMembers from './views/PremiumMembers';
import ReportsQueue from './views/ReportsQueue';
import SystemSettings from './views/SystemSettings';
import IDVerification from './views/IDVerification';
import AdminProfile from './views/AdminProfile';
import Broadcasts from './views/Broadcasts';
import ContentModeration from './views/ContentModeration';
import SupportDesk from './views/SupportDesk';
import AgentDashboard from './views/AgentDashboard';
import Appeals from './views/Appeals';
import ChurnIntelligence from './views/ChurnIntelligence';
import RevokeVerification from './views/RevokeVerification';
import IceBreakers from './views/IceBreakers';
import SentryMonitor from './views/SentryMonitor';
import PushHealth from './views/PushHealth';
import { AuthState, AdminRole } from './types';
import { NAV_ITEMS } from './constants';
import { LogIn, ShieldCheck, Sun, Moon, AlertCircle, Lock, Loader2, Search, Bell, BellOff, Menu, Eye, EyeOff } from 'lucide-react';
import { adminApi, clearToken, setOnAdminSessionExpired } from './services/adminApi';
import { AuthProvider } from './contexts/AuthContext';
import AccessDenied from './components/AccessDenied';

const ALL_TABS = ['dashboard', 'users', 'analytics', 'payments', 'premium', 'reports', 'content', 'settings', 'verification', 'revoke-verification', 'profile', 'broadcasts', 'icebreakers', 'support', 'agent', 'appeals', 'churn', 'sentry', 'push-health'];

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 60;
const BADGE_POLL_MS = 20_000;

const BADGE_CLEAR_MAP: Record<string, keyof PendingCounts> = {
  reports: 'reports',
  verification: 'verifications',
  appeals: 'appeals',
  content: 'content',
  support: 'tickets',
  agent: 'unreadTickets',
};

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard', users: 'User Management', analytics: 'Analytics',
  payments: 'Finances & Revenue', premium: 'Premium Members', reports: 'Safety Reports', content: 'Content Moderation',
  support: 'Support Desk', agent: 'My Tickets', settings: 'System Settings',
  verification: 'Verification Requests', 'revoke-verification': 'Revoke Verified Badge',
  broadcasts: 'Broadcasts', appeals: 'Appeals',
  churn: 'Churn Intelligence', profile: 'My Profile',
  sentry: 'Error Monitoring',
  'push-health': 'Push Notification Health',
};

interface PendingCounts { reports: number; verifications: number; tickets: number; unreadTickets: number; appeals: number; content: number; }

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const App: React.FC = () => {
  const [auth, setAuth] = useState<AuthState>(() => {
    try {
      const saved = localStorage.getItem('emorii_auth');
      return saved ? JSON.parse(saved) : { isAuthenticated: false, user: null };
    } catch {
      return { isAuthenticated: false, user: null };
    }
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('emorii_theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  const [activeTab, setActiveTabRaw] = useState(() => {
    try {
      const tab = new URLSearchParams(window.location.search).get('tab') || '';
      return ALL_TABS.includes(tab) ? tab : 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [pendingCounts, setPendingCounts] = useState<PendingCounts>({ reports: 0, verifications: 0, tickets: 0, unreadTickets: 0, appeals: 0, content: 0 });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabRaw(tab);
    setSidebarOpen(false);
    const countKey = BADGE_CLEAR_MAP[tab];
    if (countKey) {
      setPendingCounts(prev => ({ ...prev, [countKey]: 0 }));
    }
  }, []);

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastIdRef = useRef(0);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('emorii_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (auth.isAuthenticated) {
      localStorage.setItem('emorii_auth', JSON.stringify(auth));
    }
  }, [auth]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const [pushEnabled, setPushEnabled] = useState<boolean>(() => localStorage.getItem('push_enabled') === 'true');
  const pushSubRef = useRef<PushSubscription | null>(null);

  const registerPush = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { showToast('Notification permission denied.', 'error'); return; }

      const reg = await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;

      const keyData = await adminApi.getPushVapidKey();
      if (!keyData?.publicKey) return;

      const existing = await reg.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyData.publicKey,
      });
      pushSubRef.current = sub;

      await adminApi.subscribePush(sub.toJSON() as PushSubscriptionJSON);
      setPushEnabled(true);
      localStorage.setItem('push_enabled', 'true');
      showToast('Push notifications enabled.', 'success');
    } catch {
      showToast('Could not enable push notifications.', 'error');
    }
  }, [showToast]);

  const unregisterPush = useCallback(async () => {
    try {
      if (pushSubRef.current) {
        await adminApi.unsubscribePush(pushSubRef.current.endpoint);
        await pushSubRef.current.unsubscribe();
        pushSubRef.current = null;
      }
      setPushEnabled(false);
      localStorage.setItem('push_enabled', 'false');
      showToast('Push notifications disabled.', 'success');
    } catch {
      showToast('Could not disable push notifications.', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (!auth.isAuthenticated || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) { pushSubRef.current = sub; setPushEnabled(true); }
      });
    }).catch(() => {});

    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE_TAB' && event.data.tab) {
        setActiveTab(event.data.tab);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSWMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSWMessage);
  }, [auth.isAuthenticated, setActiveTab]);

  useEffect(() => {
    const label = PAGE_TITLES[activeTab];
    document.title = label ? `${label} · Emorii Admin` : 'Emorii Admin';
  }, [activeTab]);

  const handleLogout = useCallback((reason?: string) => {
    setAuth(prev => ({ isAuthenticated: false, user: prev.user }));
    localStorage.removeItem('emorii_auth');
    clearToken();
    setPendingCounts({ reports: 0, verifications: 0, tickets: 0, unreadTickets: 0, appeals: 0, content: 0 });
    showToast(reason || 'Session terminated safely.', reason ? 'error' : 'success');
  }, [showToast]);

  useEffect(() => {
    setOnAdminSessionExpired(() => {
      handleLogout('Your session has expired. Please sign in again.');
    });
    return () => { setOnAdminSessionExpired(null); };
  }, [handleLogout]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    const resetTimer = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(() => {
        handleLogout('Session expired due to inactivity. Please sign in again.');
      }, INACTIVITY_TIMEOUT_MS);
    };
    const events = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll', 'click'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [auth.isAuthenticated, handleLogout]);

  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const id = setInterval(() => {
      setLockoutRemaining(prev => {
        if (prev <= 1) { clearInterval(id); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [lockoutRemaining]);

  const fetchBadgeCounts = useCallback(async () => {
    if (!auth.isAuthenticated) return;
    try {
      const data = await adminApi.getBadgeCounts();
      if (data?.success && data.counts) {
        const c = data.counts;
        setPendingCounts(prev => ({
          reports:       c.reports       ?? prev.reports,
          verifications: c.verifications ?? prev.verifications,
          tickets:       c.tickets       ?? prev.tickets,
          unreadTickets: c.unreadTickets ?? prev.unreadTickets,
          appeals:       c.appeals       ?? prev.appeals,
          content:       c.content       ?? prev.content,
        }));
      }
    } catch {
    }
  }, [auth.isAuthenticated]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    fetchBadgeCounts();
    const interval = setInterval(fetchBadgeCounts, BADGE_POLL_MS);
    return () => clearInterval(interval);
  }, [auth.isAuthenticated, fetchBadgeCounts]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (auth.isAuthenticated) setPaletteOpen(o => !o);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [auth.isAuthenticated]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const canAccessTab = (tabId: string): boolean => {
    const role = auth.user?.role;
    if (!role) return false;
    const item = NAV_ITEMS.find(n => n.id === tabId);
    if (!item) return true;
    return item.roles.includes(role);
  };

  const getDefaultTabForRole = (role?: AdminRole): string => {
    if (role === AdminRole.SUPPORT) return 'agent';
    return 'dashboard';
  };

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.user?.role) return;
    if (!canAccessTab(activeTab)) {
      setActiveTab(getDefaultTabForRole(auth.user.role));
    }
  }, [auth.isAuthenticated, auth.user?.role, activeTab]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutRemaining > 0) return;
    setLoginLoading(true);
    setLoginError('');
    try {
      const data = await adminApi.login(loginEmail, loginPassword);
      const isAdmin = data.user?.isAdmin;
      const isAgent = data.user?.isSupportAgent;
      if (!isAdmin && !isAgent) {
        clearToken();
        setLoginError('Access denied. Staff privileges required.');
        setLoginLoading(false);
        return;
      }
      const isModerator = data.user?.isModerator || data.user?.role === 'moderator';
      const role = isAdmin ? AdminRole.SUPER_ADMIN : isModerator ? AdminRole.MODERATOR : AdminRole.SUPPORT;
      setLoginAttempts(0);
      setAuth({
        isAuthenticated: true,
        user: {
          name: data.user.name,
          role,
          email: data.user.email,
          avatar: data.user.photos?.[0]?.url || undefined,
        },
      });
      if (!isAdmin && isAgent) setActiveTab('agent');
      showToast(`Welcome back, ${data.user.name.split(' ')[0]}.`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed. Please try again.';
      const next = loginAttempts + 1;
      setLoginAttempts(next);
      if (next >= MAX_LOGIN_ATTEMPTS) {
        setLoginAttempts(0);
        setLockoutRemaining(LOCKOUT_SECONDS);
        setLoginError(`Too many failed attempts. Please wait ${LOCKOUT_SECONDS} seconds.`);
      } else {
        setLoginError(`${msg} (${MAX_LOGIN_ATTEMPTS - next} attempt${MAX_LOGIN_ATTEMPTS - next === 1 ? '' : 's'} remaining)`);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleUpdateAdminProfile = (updatedAdmin: AuthState['user']) => {
    setAuth(prev => ({ ...prev, user: updatedAdmin }));
  };

  if (!auth.isAuthenticated) {
    return (
      <div className="min-h-screen flex transition-colors duration-300">
        {/* ── Left brand panel (desktop only) ── */}
        <div className="hidden lg:flex flex-col w-[420px] xl:w-[460px] shrink-0 bg-gradient-to-br from-[#082622] via-[#0d3d38] to-[#0f4c45] relative overflow-hidden">
          <div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)', backgroundSize: '36px 36px' }} />
          <div className="absolute -top-32 -right-32 w-[420px] h-[420px] bg-teal-400/10 rounded-full blur-[100px] pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-[320px] h-[320px] bg-cyan-300/8 rounded-full blur-[80px] pointer-events-none" />

          <div className="relative z-10 flex flex-col h-full p-10">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-[12px] overflow-hidden border border-white/10 shrink-0">
                <img src="/logo.png" alt="Emorii" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              </div>
              <span className="text-white font-black tracking-tight text-[17px]">Emo<span className="text-teal-300">rii</span></span>
            </div>

            <div className="my-auto py-12">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-400/10 border border-teal-400/15 rounded-full mb-8">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-black text-teal-300/80 uppercase tracking-[0.18em]">All systems operational</span>
              </div>
              <h1 className="text-[42px] xl:text-[48px] font-black text-white leading-[1.05] tracking-tight mb-5">
                Staff<br />Command<br /><span className="text-teal-300">Center</span>
              </h1>
              <p className="text-teal-200/40 text-sm leading-relaxed max-w-[240px]">
                User management, moderation, revenue, and platform health — unified.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {[
                { label: 'JWT Auth',    icon: '🔐' },
                { label: 'Role-Based',  icon: '🛡️' },
                { label: 'Encrypted',   icon: '🔒' },
              ].map(item => (
                <div key={item.label} className="bg-white/[0.04] border border-white/[0.07] rounded-xl p-3 text-center">
                  <div className="text-lg mb-1.5">{item.icon}</div>
                  <div className="text-[8px] font-black text-teal-300/50 uppercase tracking-widest">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right form panel ── */}
        <div className="flex-1 flex flex-col items-center justify-center bg-white dark:bg-slate-950 p-8 relative overflow-hidden">
          <div className="absolute inset-0 lg:hidden bg-gradient-to-br from-teal-50/60 to-white dark:from-slate-950 dark:to-slate-900 pointer-events-none" />

          <button
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="absolute top-5 right-5 p-2.5 bg-gray-100 dark:bg-slate-800 border border-gray-200/50 dark:border-slate-700/50 rounded-xl text-gray-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-all"
          >
            {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
          </button>

          <div className="w-full max-w-[360px] relative z-10 animate-fadeIn">
            <div className="lg:hidden flex flex-col items-center mb-10">
              <div className="h-14 w-14 rounded-[18px] overflow-hidden border border-teal-200 dark:border-teal-800 mb-4 shadow-lg shadow-teal-500/10">
                <img src="/logo.png" alt="Emorii" className="w-full h-full object-cover" />
              </div>
              <span className="text-gray-900 dark:text-white font-black text-xl tracking-tight">Emo<span className="text-teal-500">rii</span> Admin</span>
            </div>

            <div className="mb-8">
              <h2 className="text-[30px] font-black text-gray-900 dark:text-white tracking-tight leading-none mb-2">
                Welcome back
              </h2>
              <p className="text-sm text-gray-400 dark:text-slate-500 font-medium">Sign in to your admin account to continue.</p>
            </div>

            <form onSubmit={handleLogin} noValidate className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5">
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  placeholder="admin@emorii.app"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  className="w-full px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700/80 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all dark:text-white text-sm placeholder:text-gray-300 dark:placeholder:text-slate-600 font-medium"
                  required
                />
              </div>

              <div>
                <label htmlFor="login-password" className="block text-xs font-bold text-gray-500 dark:text-slate-400 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    className="w-full px-4 py-3.5 pr-12 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700/80 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all dark:text-white text-sm placeholder:text-gray-300 dark:placeholder:text-slate-600 font-medium"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-gray-300 dark:text-slate-600 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {loginError && (
                <div role="alert" className="flex items-start gap-2.5 px-4 py-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl animate-fadeIn">
                  <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 leading-snug">{loginError}</span>
                </div>
              )}

              {lockoutRemaining > 0 && (
                <div role="alert" className="flex items-center gap-2.5 px-4 py-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl animate-fadeIn">
                  <Lock size={14} className="text-amber-500 shrink-0" />
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    Account locked — try again in {lockoutRemaining}s
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={loginLoading || lockoutRemaining > 0}
                className="w-full py-3.5 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 shadow-lg shadow-teal-600/20 transition-all flex items-center justify-center gap-2.5 text-sm active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed mt-1"
              >
                {loginLoading ? <Loader2 size={16} className="animate-spin" /> : lockoutRemaining > 0 ? <Lock size={16} /> : <LogIn size={16} />}
                {loginLoading ? 'Signing in…' : lockoutRemaining > 0 ? `Locked (${lockoutRemaining}s)` : 'Sign in'}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-100 dark:border-slate-800 flex items-center justify-center gap-2">
              <ShieldCheck size={11} className="text-teal-500/50" />
              <span className="text-[11px] text-gray-300 dark:text-slate-600 font-medium">JWT Protected · Role-Based Access · Admin Only</span>
            </div>
          </div>
        </div>

        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  const pageTitle = PAGE_TITLES[activeTab] || 'Dashboard';

  return (
    <AuthProvider auth={auth}>
      <div className="flex h-screen bg-gray-50 dark:bg-slate-950 overflow-hidden transition-colors duration-300">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          adminRole={auth.user?.role || AdminRole.SUPPORT}
          adminName={auth.user?.name || 'Admin'}
          adminAvatar={auth.user?.avatar}
          onLogout={handleLogout}
          pendingCounts={pendingCounts}
          isMobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-[60px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-b border-gray-100 dark:border-slate-800/80 flex items-center justify-between px-4 md:px-6 z-10 shrink-0 shadow-[0_1px_0_0_rgba(0,0,0,0.04)] dark:shadow-none">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation menu"
                className="md:hidden p-2 text-gray-500 dark:text-slate-400 hover:text-teal-600 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-all"
              >
                <Menu size={20} />
              </button>
              <div className="flex items-center gap-3">
                <h1 className="text-[15px] font-black text-gray-900 dark:text-white leading-none tracking-tight">
                  {pageTitle}
                </h1>
                <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-full">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                  <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.14em]">Live</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPaletteOpen(true)}
                aria-label={`Open command palette (${isMac ? '⌘K' : 'Ctrl+K'})`}
                className="hidden md:flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700/80 rounded-xl text-gray-400 dark:text-slate-500 hover:text-teal-500 dark:hover:text-teal-400 hover:border-teal-400/30 transition-all text-xs font-medium"
              >
                <Search size={13} />
                <span className="text-gray-300 dark:text-slate-600">Search…</span>
                <kbd className="ml-1 px-1.5 py-0.5 text-[9px] font-black bg-gray-100 dark:bg-slate-700 text-gray-400 dark:text-slate-500 rounded-md">
                  {isMac ? '⌘K' : 'Ctrl+K'}
                </kbd>
              </button>

              <NotificationCenter onNavigate={setActiveTab} />

              {'Notification' in window && (
                <button
                  onClick={pushEnabled ? unregisterPush : registerPush}
                  aria-label={pushEnabled ? 'Disable push notifications' : 'Enable push notifications'}
                  className={`relative p-2.5 rounded-xl transition-all border ${
                    pushEnabled
                      ? 'bg-teal-50 dark:bg-teal-500/10 border-teal-200 dark:border-teal-500/25 text-teal-600 dark:text-teal-400'
                      : 'bg-gray-50 dark:bg-slate-800 border-gray-200/80 dark:border-slate-700/80 text-gray-400 dark:text-slate-500 hover:text-teal-500 hover:border-teal-400/30'
                  }`}
                >
                  {pushEnabled ? <Bell size={15} /> : <BellOff size={15} />}
                  {pushEnabled && (
                    <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-teal-500 rounded-full border-2 border-white dark:border-slate-900" aria-hidden="true" />
                  )}
                </button>
              )}

              <button
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                className="p-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200/80 dark:border-slate-700/80 rounded-xl text-gray-400 dark:text-slate-500 hover:text-teal-500 dark:hover:text-teal-400 hover:border-teal-400/30 transition-all"
              >
                {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
              </button>

              <button
                onClick={() => setActiveTab('profile')}
                aria-label="View my profile"
                className="flex items-center gap-2.5 ml-1 pl-3 border-l border-gray-100 dark:border-slate-800 group"
              >
                <div className="hidden sm:flex flex-col items-end">
                  <p className="text-[13px] font-bold text-gray-900 dark:text-white leading-none group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                    {auth.user?.name?.split(' ')[0]}
                  </p>
                  <p className="text-[9px] text-teal-600 dark:text-teal-400 font-black uppercase tracking-widest mt-0.5">
                    {auth.user?.role}
                  </p>
                </div>
                <div className="relative">
                  <img
                    src={auth.user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(auth.user?.name || 'Admin')}&background=14b8a6&color=fff&bold=true`}
                    className="h-8 w-8 rounded-xl ring-2 ring-gray-100 dark:ring-slate-700 group-hover:ring-teal-400/40 transition-all object-cover"
                    alt="My profile"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(auth.user?.name || 'Admin')}&background=14b8a6&color=fff&bold=true`;
                    }}
                  />
                  <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 bg-emerald-500 rounded-full border-2 border-white dark:border-slate-900" aria-hidden="true" />
                </div>
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
            <div className="max-w-7xl mx-auto">
              <ErrorBoundary key={activeTab} onReset={() => setActiveTab('dashboard')}>
                {activeTab === 'dashboard'    && canAccessTab('dashboard')    && <DashboardHome onNavigate={setActiveTab} />}
                {activeTab === 'users'        && canAccessTab('users')        && <UserManagement showToast={showToast} />}
                {activeTab === 'analytics'    && canAccessTab('analytics')    && <Analytics />}
                {activeTab === 'payments'     && canAccessTab('payments')     && <Payments />}
                {activeTab === 'premium'      && canAccessTab('premium')      && <PremiumMembers />}
                {activeTab === 'reports'      && canAccessTab('reports')      && <ReportsQueue showToast={showToast} />}
                {activeTab === 'content'      && canAccessTab('content')      && <ContentModeration showToast={showToast} />}
                {activeTab === 'support'      && canAccessTab('support')      && <SupportDesk showToast={showToast} />}
                {activeTab === 'agent'        && canAccessTab('agent')        && <AgentDashboard showToast={showToast} />}
                {activeTab === 'settings'     && canAccessTab('settings')     && <SystemSettings showToast={showToast} />}
                {activeTab === 'verification'        && canAccessTab('verification')        && <IDVerification showToast={showToast} />}
                {activeTab === 'revoke-verification' && canAccessTab('revoke-verification') && <RevokeVerification showToast={showToast} />}
                {activeTab === 'broadcasts'   && canAccessTab('broadcasts')   && <Broadcasts showToast={showToast} />}
                {activeTab === 'appeals'      && canAccessTab('appeals')      && <Appeals showToast={showToast} />}
                {activeTab === 'churn'        && canAccessTab('churn')        && <ChurnIntelligence showToast={showToast} />}
                {activeTab === 'sentry'       && canAccessTab('sentry')       && <SentryMonitor />}
                {activeTab === 'push-health'  && canAccessTab('push-health')  && <PushHealth showToast={showToast} />}
                {activeTab === 'icebreakers'  && canAccessTab('icebreakers')  && <IceBreakers showToast={showToast} />}
                {activeTab === 'profile'      && canAccessTab('profile')      && <AdminProfile auth={auth} onUpdate={handleUpdateAdminProfile} showToast={showToast} />}

                {ALL_TABS.includes(activeTab) && !canAccessTab(activeTab) && (
                  <AccessDenied
                    currentRole={auth.user?.role}
                    requiredRoles={NAV_ITEMS.find(n => n.id === activeTab)?.roles}
                    section={NAV_ITEMS.find(n => n.id === activeTab)?.label}
                    onBack={() => setActiveTab(getDefaultTabForRole(auth.user?.role))}
                  />
                )}

                {!ALL_TABS.includes(activeTab) && (
                  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-12 bg-white dark:bg-slate-900 rounded-2xl border border-gray-100 dark:border-slate-800 animate-fadeIn">
                    <div className="h-14 w-14 rounded-2xl bg-gray-50 dark:bg-slate-800 flex items-center justify-center mx-auto mb-5 text-2xl">🔍</div>
                    <h3 className="text-xl font-black text-gray-900 dark:text-white mb-2">Module not found</h3>
                    <p className="text-sm text-gray-400 dark:text-slate-500 mb-8">This section is under development.</p>
                    <button
                      onClick={() => setActiveTab('dashboard')}
                      className="px-6 py-2.5 bg-teal-600 text-white font-bold text-sm rounded-xl hover:bg-teal-700 transition-all shadow-md shadow-teal-600/20"
                    >
                      Back to Dashboard
                    </button>
                  </div>
                )}
              </ErrorBoundary>
            </div>
          </div>
        </main>

        <CommandPalette
          isOpen={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onNavigate={setActiveTab}
          adminRole={auth.user?.role || AdminRole.SUPPORT}
        />

        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AuthProvider>
  );
};

export default App;
