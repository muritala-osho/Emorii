import React, { useState } from 'react';
import { NAV_ITEMS } from '../constants';
import { AdminRole } from '../types';
import { LogOut, ChevronDown, X } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  adminRole: AdminRole;
  adminName: string;
  adminAvatar?: string;
  onLogout: () => void;
  pendingCounts?: { reports: number; verifications: number; tickets: number; unreadTickets: number; appeals: number; content: number; };
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

const SECTION_GROUPS = [
  { label: 'Overview',    ids: ['dashboard'] },
  { label: 'Management',  ids: ['users', 'verification', 'revoke-verification', 'reports', 'content', 'appeals', 'churn'] },
  { label: 'Revenue',     ids: ['payments', 'premium', 'analytics'] },
  { label: 'Support',     ids: ['support', 'agent'] },
  { label: 'Tools',       ids: ['broadcasts', 'icebreakers'] },
  { label: 'System',      ids: ['settings', 'sentry', 'push-health', 'profile'] },
];

const BADGE_MAP: Record<string, keyof NonNullable<SidebarProps['pendingCounts']>> = {
  reports:      'reports',
  verification: 'verifications',
  support:      'tickets',
  agent:        'unreadTickets',
  appeals:      'appeals',
  content:      'content',
};

const BADGE_COLOR: Record<string, string> = {
  reports:      'bg-rose-500',
  content:      'bg-rose-500',
  appeals:      'bg-amber-500',
  verification: 'bg-amber-500',
  support:      'bg-sky-500',
  agent:        'bg-sky-500',
};

const EmoriiLogo = () => {
  const [errored, setErrored] = React.useState(false);
  if (errored) {
    return (
      <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#0f766e,#14b8a6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#fff', fontSize: 22, fontWeight: 900, lineHeight: 1 }}>E</span>
      </div>
    );
  }
  return (
    <img
      src="/logo.png"
      alt="Emorii"
      width={52}
      height={52}
      style={{ borderRadius: 14, objectFit: 'cover' }}
      onError={() => setErrored(true)}
    />
  );
};

const SidebarContent: React.FC<SidebarProps & { onNavClick: (id: string) => void }> = ({
  activeTab,
  adminRole,
  adminName,
  adminAvatar,
  onLogout,
  pendingCounts,
  onNavClick,
}) => {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const filteredItems = NAV_ITEMS.filter(item => item.roles.includes(adminRole));

  const toggleSection = (label: string) => {
    setCollapsedSections(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const getBadge = (id: string): number => {
    const key = BADGE_MAP[id];
    if (!key || !pendingCounts) return 0;
    return pendingCounts[key] || 0;
  };

  return (
    <>
      <div
        className="flex items-center gap-3 px-4 py-5 border-b border-white/[0.06] cursor-pointer group"
        onClick={() => onNavClick('dashboard')}
      >
        <div className="shrink-0 group-hover:scale-105 transition-transform duration-200">
          <EmoriiLogo />
        </div>
        <div>
          <span className="text-[16px] font-black tracking-tight leading-none block">
            Emo<span className="text-teal-400">rii</span>
          </span>
          <span className="text-[9px] font-black text-teal-500/50 uppercase tracking-[0.18em] mt-0.5 block">
            Admin Portal
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar py-3">
        {SECTION_GROUPS.map(group => {
          const groupItems = filteredItems.filter(item => group.ids.includes(item.id));
          if (groupItems.length === 0) return null;
          const isCollapsed = collapsedSections[group.label];

          return (
            <div key={group.label} className="mb-1">
              <button
                onClick={() => toggleSection(group.label)}
                className="flex items-center justify-between w-full px-4 py-2 text-[9px] font-black text-teal-500/60 uppercase tracking-[0.18em] hover:text-teal-400 transition-colors"
                aria-expanded={!isCollapsed}
              >
                {group.label}
                <ChevronDown
                  size={10}
                  className={`transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                />
              </button>

              {!isCollapsed && (
                <nav className="space-y-0.5 px-2" aria-label={group.label}>
                  {groupItems.map(item => {
                    const isActive = activeTab === item.id;
                    const badge = getBadge(item.id);

                    return (
                      <button
                        key={item.id}
                        onClick={() => onNavClick(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`flex items-center justify-between w-full py-2.5 text-sm rounded-xl transition-all duration-200 group/item border-l-2 ${
                          isActive
                            ? 'bg-gradient-to-r from-teal-400/20 via-teal-400/8 to-transparent text-white font-bold border-teal-400 pl-[10px] pr-3'
                            : 'text-teal-100/60 hover:bg-white/[0.06] hover:text-teal-100 font-medium border-transparent pl-[10px] pr-3'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`shrink-0 transition-colors ${isActive ? 'text-teal-300' : 'text-teal-500/50 group-hover/item:text-teal-400/80'}`}>
                            {item.icon}
                          </span>
                          <span className="truncate text-[13px]">{item.label}</span>
                        </div>

                        {badge > 0 && (
                          <span key={badge} className={`shrink-0 h-5 min-w-[20px] px-1.5 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-badgePop ${BADGE_COLOR[item.id] || 'bg-rose-500'}`}>
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/[0.06] p-3">
        <button
          onClick={() => onNavClick('profile')}
          className="flex items-center w-full px-3 py-2.5 rounded-xl hover:bg-white/[0.05] transition-colors group mb-1"
          aria-label="View my profile"
        >
          <div className="relative shrink-0">
            <img
              src={adminAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(adminName)}&background=14b8a6&color=fff&bold=true`}
              className="h-8 w-8 rounded-xl ring-2 ring-white/10 group-hover:ring-teal-400/30 transition-all object-cover"
              alt="Admin avatar"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(adminName)}&background=14b8a6&color=fff&bold=true`;
              }}
            />
            <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 bg-emerald-500 rounded-full border-[1.5px] border-[#0d3d38]" />
          </div>
          <div className="ml-2.5 overflow-hidden text-left flex-1 min-w-0">
            <p className="text-[13px] font-bold text-white/90 truncate group-hover:text-teal-300 transition-colors leading-tight">
              {adminName}
            </p>
            <p className="text-[9px] text-teal-500/50 font-black uppercase tracking-widest leading-tight mt-0.5">
              {adminRole}
            </p>
          </div>
        </button>

        <button
          onClick={onLogout}
          className="flex items-center w-full px-3 py-2 text-[12px] font-semibold text-teal-100/30 hover:text-rose-400 hover:bg-rose-500/[0.06] rounded-xl transition-all group"
        >
          <LogOut size={13} className="mr-2 group-hover:-translate-x-0.5 transition-transform" />
          Sign out
        </button>
      </div>
    </>
  );
};

const Sidebar: React.FC<SidebarProps> = (props) => {
  const { isMobileOpen, onMobileClose, setActiveTab } = props;

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    onMobileClose?.();
  };

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Main navigation"
        className={`
          fixed md:static inset-y-0 left-0 z-50
          flex flex-col h-screen w-[220px] bg-gradient-to-b from-[#092e2b] via-[#0d3d38] to-[#0c3834] text-white shrink-0 border-r border-black/20 select-none
          transition-transform duration-300 ease-in-out
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {isMobileOpen && (
          <button
            onClick={onMobileClose}
            aria-label="Close navigation"
            className="absolute top-4 right-4 p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all md:hidden"
          >
            <X size={18} />
          </button>
        )}
        <SidebarContent {...props} onNavClick={handleNavClick} />
      </aside>
    </>
  );
};

export default Sidebar;
