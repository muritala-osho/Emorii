import React from 'react';
import {
  LayoutDashboard,
  Users,
  ShieldAlert,
  CreditCard,
  Crown,
  Settings,
  Activity,
  UserCheck,
  UserCircle,
  Megaphone,
  ImageOff,
  LifeBuoy,
  Gavel,
  TrendingDown,
  Headphones,
  ShieldOff,
  MessageCircleQuestion,
  AlertTriangle,
  Smartphone,
} from 'lucide-react';
import { AdminRole, PushTemplate } from './types';

export const NAV_ITEMS = [
  { id: 'dashboard',    label: 'Dashboard',          icon: <LayoutDashboard size={20} />, roles: [AdminRole.SUPER_ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT] },
  { id: 'users',        label: 'Citizens',            icon: <Users size={20} />,           roles: [AdminRole.SUPER_ADMIN, AdminRole.MODERATOR] },
  { id: 'verification',        label: 'Verification Requests', icon: <UserCheck size={20} />,  roles: [AdminRole.SUPER_ADMIN, AdminRole.MODERATOR] },
  { id: 'revoke-verification', label: 'Revoke Badge',          icon: <ShieldOff size={20} />, roles: [AdminRole.SUPER_ADMIN] },
  { id: 'reports',      label: 'Safety Hub',          icon: <ShieldAlert size={20} />,     roles: [AdminRole.SUPER_ADMIN, AdminRole.MODERATOR] },
  { id: 'appeals',      label: 'Appeals Queue',       icon: <Gavel size={20} />,           roles: [AdminRole.SUPER_ADMIN, AdminRole.MODERATOR] },
  { id: 'churn',        label: 'Churn Intelligence',  icon: <TrendingDown size={20} />,    roles: [AdminRole.SUPER_ADMIN] },
  { id: 'content',      label: 'Content Moderation',  icon: <ImageOff size={20} />,        roles: [AdminRole.SUPER_ADMIN, AdminRole.MODERATOR] },
  { id: 'support',      label: 'Support Desk',        icon: <LifeBuoy size={20} />,        roles: [AdminRole.SUPER_ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT] },
  { id: 'agent',        label: 'My Tickets',          icon: <Headphones size={20} />,      roles: [AdminRole.SUPPORT] },
  { id: 'payments',     label: 'Finances',            icon: <CreditCard size={20} />,      roles: [AdminRole.SUPER_ADMIN] },
  { id: 'premium',      label: 'Premium Members',     icon: <Crown size={20} />,           roles: [AdminRole.SUPER_ADMIN] },
  { id: 'analytics',    label: 'Intelligence',        icon: <Activity size={20} />,        roles: [AdminRole.SUPER_ADMIN] },
  { id: 'sentry',       label: 'Error Monitoring',    icon: <AlertTriangle size={20} />,   roles: [AdminRole.SUPER_ADMIN] },
  { id: 'push-health',  label: 'Push Health',         icon: <Smartphone size={20} />,      roles: [AdminRole.SUPER_ADMIN] },
  { id: 'broadcasts',   label: 'Broadcasts',          icon: <Megaphone size={20} />,       roles: [AdminRole.SUPER_ADMIN, AdminRole.MODERATOR] },
  { id: 'icebreakers',  label: 'Icebreakers',         icon: <MessageCircleQuestion size={20} />, roles: [AdminRole.SUPER_ADMIN, AdminRole.MODERATOR] },
  { id: 'profile',      label: 'My Profile',          icon: <UserCircle size={20} />,      roles: [AdminRole.SUPER_ADMIN, AdminRole.MODERATOR, AdminRole.SUPPORT] },
  { id: 'settings',     label: 'System Core',         icon: <Settings size={20} />,        roles: [AdminRole.SUPER_ADMIN] },
];

export const PUSH_TEMPLATES: PushTemplate[] = [
  { id: 'pt1', name: 'Weekend Boost',   category: 'Engagement', title: 'Weekend Boost is LIVE',     body: "Get 2x visibility for the next 24 hours. Don't miss out!" },
  { id: 'pt2', name: 'New Match Alert', category: 'Feature',    title: 'Someone likes you!',         body: 'You have a new admirer. Open Emorii to see who it is.' },
  { id: 'pt3', name: 'Premium Upsell',  category: 'Revenue',    title: 'Unlock Premium Features',   body: 'See who likes you instantly and unlock unlimited matches. Go Premium today.' },
  { id: 'pt4', name: 'Re-engagement',   category: 'Retention',  title: 'We miss you',               body: "It's been a while. New people are waiting to connect with you." },
  { id: 'pt5', name: 'Feature Launch',  category: 'Product',    title: 'New Feature Alert',         body: 'We just shipped something you will love. Come check it out.' },
];
