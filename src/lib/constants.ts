import { HandCoins, Landmark, ShieldCheck } from 'lucide-react';
import type { LeadStatus } from './types';

export const leadStatuses: Array<{ value: LeadStatus; label: string }> = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'signed', label: 'Signed' },
  { value: 'tier_1_paid', label: 'Tier 1 Paid' },
  { value: 'tier_2_paid', label: 'Tier 2 Paid' },
];

export const marketingResources = [
  {
    title: 'Owner-to-owner outreach',
    copy:
      'If you know a business owner who needs sharper systems, stronger outreach, or disciplined growth support, I can connect you directly with Excalibur. Mention my referral code so they start in the right pipeline.',
  },
  {
    title: 'Text message intro',
    copy:
      'I’ve been sending qualified businesses to Excalibur because they move fast and handle execution seriously. If you want an intro, use my referral code when you reach out so they can track it correctly.',
  },
  {
    title: 'LinkedIn caption',
    copy:
      'Strong operators know growth is rarely a traffic problem alone. If your business needs tighter sales systems, cleaner operations, and a direct path to revenue, Excalibur is worth a conversation. Use my referral code when you inquire.',
  },
];

export const featureCards = [
  {
    title: 'Protected partner attribution',
    body: 'Referral codes resolve automatically to the right affiliate record, then stay locked behind Supabase RLS.',
    icon: ShieldCheck,
  },
  {
    title: 'Milestone payout tracking',
    body: 'Track each lead from intake through Tier 1 and Tier 2 payouts with a fixed $400 cap per referral.',
    icon: HandCoins,
  },
  {
    title: 'Admin-grade oversight',
    body: 'Authenticated admins can manage affiliates, lead status changes, and account activity from a single dashboard.',
    icon: Landmark,
  },
];
