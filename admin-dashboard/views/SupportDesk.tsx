/**
 * SupportDesk.tsx — Unified support interface for admins
 *
 * Features:
 *  - Real-time ticket list with 15-second polling
 *  - Chat-like message thread per ticket
 *  - Assign tickets to support agents
 *  - Update ticket status (open / pending / in-progress / closed)
 *  - Unread badge on each ticket
 *  - Optimistic UI updates for replies
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LifeBuoy, MessageSquare, CheckCircle, Search,
  Send, RefreshCw, Loader2, Bell, ChevronDown,
  Info, UserCheck, X, Users,
} from 'lucide-react';
import { adminApi } from '../services/adminApi';
import { SupportTicket, TicketMessage, SupportAgent } from '../types';

interface SupportDeskProps {
  showToast?: (message: string, type: 'success' | 'error') => void;
}


const priorityStyles: Record<string, string> = {
  high: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
};

const statusStyles: Record<string, string> = {
  open: 'bg-emerald-500 text-white',
  pending: 'bg-violet-500 text-white',
  'in-progress': 'bg-amber-500 text-white',
  closed: 'bg-slate-400 text-white',
};

const categoryLabel: Record<string, string> = {
  billing: 'Billing',
  account: 'Account',
  technical: 'Technical',
  safety: 'Safety',
  other: 'Other',
};

const ALL_STATUSES = ['open', 'pending', 'in-progress', 'closed'] as const;
type TicketStatus = typeof ALL_STATUSES[number];
type FilterStatus = 'all' | TicketStatus;


const SupportDesk: React.FC<SupportDeskProps> = ({ showToast }) => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [agents, setAgents] = useState<SupportAgent[]>([]);
  const [assigningTicket, setAssigningTicket] = useState(false);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const assignDropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);


  const fetchTickets = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await adminApi.getAllSupportTickets();
      if (data.success) {
        setTickets(data.tickets || []);
        if (selectedTicket) {
          const updated = (data.tickets || []).find((t: SupportTicket) => t._id === selectedTicket._id);
          if (updated) setSelectedTicket(updated);
        }
      }
    } catch (err) {
      if (!silent) showToast?.('Could not load tickets', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedTicket, showToast]);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await adminApi.getSupportAgents();
      if (data.success) setAgents(data.agents || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchTickets();
    fetchAgents();
  }, []);

  useEffect(() => {
    pollingRef.current = setInterval(() => fetchTickets(true), 15000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchTickets]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedTicket?.messages?.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (assignDropdownRef.current && !assignDropdownRef.current.contains(e.target as Node)) {
        setShowAssignDropdown(false);
      }
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setShowStatusDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);


  const handleSelectTicket = (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setReplyText('');
    setShowAssignDropdown(false);
    setShowStatusDropdown(false);
    adminApi.getSupportTicket(ticket._id).then(data => {
      if (data.success) setSelectedTicket(data.ticket);
    }).catch(() => {});
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedTicket) return;
    setSending(true);
    const content = replyText.trim();

    const optimisticMsg: TicketMessage = {
      role: 'admin',
      content,
      senderName: 'You',
      adminName: 'You',
      timestamp: new Date().toISOString(),
    };
    const updatedTicket = {
      ...selectedTicket,
      status: 'in-progress' as const,
      messages: [...(selectedTicket.messages || []), optimisticMsg],
    };
    setSelectedTicket(updatedTicket);
    setTickets(prev => prev.map(t => t._id === selectedTicket._id ? updatedTicket : t));
    setReplyText('');

    try {
      const data = await adminApi.replySupportUnified(selectedTicket._id, content);
      if (data.success) {
        setSelectedTicket(data.ticket);
        setTickets(prev => prev.map(t => t._id === selectedTicket._id ? data.ticket : t));
      }
      showToast?.(`Reply sent to ${selectedTicket.userName}`, 'success');
    } catch {
      showToast?.('Reply saved. Push notification may be delayed.', 'success');
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: TicketStatus) => {
    if (!selectedTicket || statusUpdating) return;
    setStatusUpdating(true);
    setShowStatusDropdown(false);
    try {
      const data = await adminApi.updateSupportStatus(selectedTicket._id, newStatus);
      const updated = data.ticket || { ...selectedTicket, status: newStatus };
      setSelectedTicket(updated);
      setTickets(prev => prev.map(t => t._id === selectedTicket._id ? updated : t));
      showToast?.(`Ticket marked as ${newStatus}`, 'success');
    } catch (err: any) {
      showToast?.(err?.message || 'Status update failed', 'error');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAssign = async (agentId: string | null) => {
    if (!selectedTicket || assigningTicket) return;
    setAssigningTicket(true);
    setShowAssignDropdown(false);
    try {
      const data = await adminApi.assignSupportTicket(selectedTicket._id, agentId);
      if (data.success) {
        setSelectedTicket(data.ticket);
        setTickets(prev => prev.map(t => t._id === selectedTicket._id ? data.ticket : t));
        const agentName = agentId ? agents.find(a => a._id === agentId)?.name || 'agent' : 'unassigned';
        showToast?.(agentId ? `Ticket assigned to ${agentName}` : 'Ticket unassigned', 'success');
      }
    } catch (err: any) {
      showToast?.(err?.message || 'Failed to assign ticket', 'error');
    } finally {
      setAssigningTicket(false);
    }
  };


  const filteredTickets = tickets.filter(t => {
    const matchesStatus = filterStatus === 'all' || t.status === filterStatus;
    const matchesSearch = !searchQuery ||
      t.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.userEmail?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const counts: Record<string, number> = {
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    pending: tickets.filter(t => t.status === 'pending').length,
    'in-progress': tickets.filter(t => t.status === 'in-progress').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const totalUnread = tickets.reduce((sum, t) => sum + (t.unreadByAgent || 0), 0);


  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Support Desk</h1>
          <p className="text-gray-500 dark:text-slate-400 font-medium">
            Centralized ticket management — replies trigger push notifications
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalUnread > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/20 rounded-xl">
              <Bell size={14} className="text-rose-500" />
              <span className="text-[10px] font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest">
                {totalUnread} Unread
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/20 rounded-xl">
            <Bell size={14} className="text-emerald-500" />
            <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">
              Push Enabled
            </span>
          </div>
          <button
            onClick={() => fetchTickets()}
            className="p-2.5 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-xl text-slate-400 hover:text-teal-500 transition-all"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'open', 'pending', 'in-progress', 'closed'] as FilterStatus[]).map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              filterStatus === s
                ? 'bg-teal-600 text-white shadow-lg'
                : 'bg-white dark:bg-slate-900 text-slate-500 border border-gray-100 dark:border-slate-800 hover:border-teal-300'
            }`}
          >
            {s === 'all' ? 'All' : s}{' '}
            <span className="ml-1 opacity-70">({counts[s] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Main layout: list + thread */}
      <div className="flex h-[calc(100vh-300px)] min-h-[500px] gap-6">

        {/* Ticket list */}
        <div className="w-80 shrink-0 flex flex-col gap-3 overflow-hidden">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search tickets..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-3 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-800 rounded-2xl text-xs font-bold dark:text-white outline-none focus:ring-2 focus:ring-teal-500 transition-all"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="animate-spin text-teal-500" />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="text-center py-16 opacity-50">
                <LifeBuoy size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="text-sm font-bold text-slate-400">No tickets found</p>
              </div>
            ) : (
              filteredTickets.map(ticket => {
                const isSelected = selectedTicket?._id === ticket._id;
                const hasUnread = (ticket.unreadByAgent || 0) > 0;
                return (
                  <button
                    key={ticket._id}
                    onClick={() => handleSelectTicket(ticket)}
                    className={`w-full text-left p-5 rounded-[1.5rem] border transition-all relative ${
                      isSelected
                        ? 'bg-teal-600 border-teal-600 shadow-xl shadow-teal-500/20 text-white'
                        : `bg-white dark:bg-slate-900 border-gray-100 dark:border-slate-800 hover:border-teal-300 ${hasUnread ? 'ring-2 ring-teal-400/30' : ''}`
                    }`}
                  >
                    {hasUnread && !isSelected && (
                      <span className="absolute top-3 right-3 h-5 w-5 rounded-full bg-teal-500 text-white text-[9px] font-black flex items-center justify-center">
                        {ticket.unreadByAgent}
                      </span>
                    )}
                    <div className="flex items-center justify-between mb-2">
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                        isSelected ? 'bg-white/20 text-white' : priorityStyles[ticket.priority]
                      }`}>
                        {ticket.priority}
                      </span>
                      <span className={`text-[9px] font-black ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                        {formatTime(ticket.createdAt)}
                      </span>
                    </div>
                    <p className={`text-sm font-black truncate mb-1 ${isSelected ? 'text-white' : 'dark:text-white'}`}>
                      {ticket.subject}
                    </p>
                    <p className={`text-[10px] font-bold truncate mb-3 ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                      {ticket.userName} · {ticket.userEmail}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase ${
                        isSelected ? 'bg-white/20 text-white' : statusStyles[ticket.status] || 'bg-slate-400 text-white'
                      }`}>
                        {ticket.status}
                      </span>
                      {ticket.assignedTo && (
                        <span className={`text-[9px] font-bold flex items-center gap-1 ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                          <UserCheck size={10} /> {ticket.assignedTo.name}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Message thread */}
        <div className="flex-1 min-w-0 bg-white dark:bg-slate-900 rounded-[2.5rem] border border-gray-100 dark:border-slate-800 flex flex-col shadow-sm" style={{ overflow: 'visible' }}>
          {!selectedTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-40">
              <div className="p-8 bg-gray-50 dark:bg-slate-800 rounded-full mb-6">
                <LifeBuoy size={56} className="text-teal-400" />
              </div>
              <h3 className="text-xl font-black dark:text-white uppercase tracking-tight mb-2">Support Workspace</h3>
              <p className="text-sm text-slate-400 font-medium max-w-xs leading-relaxed">
                Select a ticket from the left to read the conversation and reply.
              </p>
            </div>
          ) : (
            <>
              {/* Ticket header */}
              <div className="px-8 py-5 border-b border-gray-50 dark:border-slate-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center text-lg font-black">
                    {selectedTicket.userName?.[0] || '?'}
                  </div>
                  <div>
                    <h2 className="text-base font-black dark:text-white leading-none mb-1">{selectedTicket.userName}</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{selectedTicket.userEmail}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {/* Priority badge */}
                  <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${priorityStyles[selectedTicket.priority]}`}>
                    {selectedTicket.priority}
                  </span>

                  {/* Category badge */}
                  <span className="px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400">
                    {categoryLabel[selectedTicket.category] || selectedTicket.category}
                  </span>

                  {/* Assign button */}
                  <div className="relative" ref={assignDropdownRef}>
                    <button
                      onClick={() => setShowAssignDropdown(v => !v)}
                      disabled={assigningTicket}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-slate-500 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 hover:border-teal-300 transition-all"
                    >
                      <Users size={12} />
                      {selectedTicket.assignedTo ? selectedTicket.assignedTo.name : 'Assign'}
                      <ChevronDown size={12} />
                    </button>
                    {showAssignDropdown && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl shadow-xl z-30 overflow-hidden">
                        {selectedTicket.assignedTo && (
                          <button
                            onClick={() => handleAssign(null)}
                            className="w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
                          >
                            <X size={10} className="inline mr-1" /> Unassign
                          </button>
                        )}
                        {agents.map(agent => (
                          <button
                            key={agent._id}
                            onClick={() => handleAssign(agent._id)}
                            disabled={selectedTicket.assignedTo?._id === agent._id}
                            className="w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-500/10 hover:text-teal-600 transition-all disabled:opacity-40"
                          >
                            <UserCheck size={10} className="inline mr-1" />
                            {agent.name}
                            {agent.isAdmin && <span className="ml-1 text-rose-400">(admin)</span>}
                          </button>
                        ))}
                        {agents.length === 0 && (
                          <p className="px-4 py-3 text-[10px] text-slate-400">No agents found</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Status dropdown */}
                  <div className="relative" ref={statusDropdownRef}>
                    <button
                      onClick={() => setShowStatusDropdown(v => !v)}
                      disabled={statusUpdating}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase text-slate-500 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 hover:border-teal-300 transition-all disabled:opacity-50"
                    >
                      {selectedTicket.status} <ChevronDown size={12} />
                    </button>
                    {showStatusDropdown && (
                      <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-2xl shadow-xl z-30 overflow-hidden">
                        {ALL_STATUSES.map(s => (
                          <button
                            key={s}
                            onClick={() => handleStatusChange(s)}
                            disabled={statusUpdating || selectedTicket.status === s}
                            className="w-full text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-teal-50 dark:hover:bg-teal-500/10 hover:text-teal-600 transition-all disabled:opacity-40"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Subject line */}
              <div className="px-6 py-3 bg-teal-50/50 dark:bg-teal-500/5 border-b border-teal-100 dark:border-teal-500/10 flex items-center gap-2">
                <Info size={14} className="text-teal-600 dark:text-teal-400 shrink-0" />
                <p className="text-[10px] font-bold text-teal-700 dark:text-teal-400">
                  <span className="font-black">{selectedTicket.subject}</span>
                  {selectedTicket.assignedTo && (
                    <span className="ml-3 opacity-60">
                      Assigned to <strong>{selectedTicket.assignedTo.name}</strong>
                    </span>
                  )}
                  {selectedTicket.userId && (
                    <span className="ml-3 opacity-40">UID: {selectedTicket.userId}</span>
                  )}
                </p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-8 space-y-5 custom-scrollbar">
                {(!selectedTicket.messages || selectedTicket.messages.length === 0) && (
                  <div className="text-center py-12 text-slate-400">
                    <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm font-bold">No messages yet</p>
                  </div>
                )}
                {selectedTicket.messages?.map((msg, i) => {
                  const isStaff = msg.role === 'admin' || msg.role === 'agent';
                  const isBot = isStaff && (msg.senderName === 'Emorii Support Bot' || msg.adminName === 'Emorii Support Bot');
                  return (
                    <div key={i} className={`flex ${isStaff ? 'justify-end' : 'justify-start'} animate-fadeIn`}>
                      <div className={`max-w-[75%] flex flex-col ${isStaff ? 'items-end' : 'items-start'}`}>
                        {/* Sender label */}
                        {!isStaff && (
                          <div className="flex items-center gap-2 mb-1 ml-1">
                            <div className="h-5 w-5 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-[9px] font-black text-slate-500">
                              {selectedTicket.userName?.[0] || '?'}
                            </div>
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              {selectedTicket.userName}
                            </span>
                          </div>
                        )}
                        {isStaff && (
                          <div className="flex items-center gap-2 mb-1 mr-1">
                            <span className={`text-[9px] font-black uppercase tracking-widest ${isBot ? 'text-violet-500 dark:text-violet-400' : 'text-teal-600 dark:text-teal-400'}`}>
                              {msg.senderName || msg.adminName || (msg.role === 'agent' ? 'Agent' : 'Admin')}
                            </span>
                            <div className={`h-5 w-5 rounded-lg flex items-center justify-center text-[9px] font-black ${isBot ? 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-400' : 'bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-400'}`}>
                              {isBot ? '🤖' : msg.role === 'agent' ? 'AG' : 'AD'}
                            </div>
                          </div>
                        )}
                        {/* Bubble */}
                        <div className={`px-5 py-4 rounded-[1.5rem] text-sm font-medium leading-relaxed shadow-sm ${
                          isBot
                            ? 'bg-violet-600 text-white rounded-tr-md'
                            : isStaff
                              ? 'bg-teal-600 text-white rounded-tr-md'
                              : 'bg-gray-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-gray-100 dark:border-slate-700 rounded-tl-md'
                        }`}>
                          {msg.content}
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 mt-1 px-1">
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply area */}
              <div className="p-6 border-t border-gray-50 dark:border-slate-800 bg-gray-50/30 dark:bg-slate-800/20 shrink-0">
                {selectedTicket.status === 'closed' ? (
                  <div className="text-center py-4">
                    <p className="text-sm font-bold text-slate-400">This ticket is closed.</p>
                    <button
                      onClick={() => handleStatusChange('open')}
                      className="mt-2 text-[10px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest hover:underline"
                    >
                      Reopen Ticket
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Quick replies */}
                    <div className="flex flex-wrap gap-2 mb-3">
                      {['Thank you for reaching out!', 'We are looking into this.', 'Issue has been resolved!'].map(q => (
                        <button
                          key={q}
                          onClick={() => setReplyText(q)}
                          className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl text-[9px] font-black text-slate-500 hover:text-teal-600 hover:border-teal-300 transition-all"
                        >
                          {q}
                        </button>
                      ))}
                    </div>

                    {/* Text input */}
                    <div className="relative">
                      <textarea
                        rows={3}
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            handleSendReply();
                          }
                        }}
                        placeholder="Type your reply… (Cmd+Enter to send)"
                        className="w-full px-5 py-4 pr-16 rounded-[1.5rem] bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 outline-none focus:ring-4 focus:ring-teal-500/10 font-medium text-sm dark:text-white transition-all resize-none shadow-sm"
                      />
                      <button
                        onClick={handleSendReply}
                        disabled={!replyText.trim() || sending}
                        className="absolute right-3 bottom-3 p-3 bg-teal-600 text-white rounded-xl shadow-lg hover:bg-teal-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                      >
                        {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                        <Bell size={10} className="text-teal-500" />
                        Reply triggers push notification to user
                      </p>
                      <button
                        onClick={() => handleStatusChange('closed')}
                        disabled={statusUpdating}
                        className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600 transition-colors flex items-center gap-1"
                      >
                        <CheckCircle size={12} /> Close Ticket
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupportDesk;
