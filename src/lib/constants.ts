import { HandCoins, LayoutTemplate, ShieldCheck } from 'lucide-react';
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
    title: 'Simple intro email',
    copy:
      'If you know a business owner who wants stronger growth support, I can connect you with Excalibur. Use my referral code when you reach out so everything is tracked correctly from the start.',
  },
  {
    title: 'Quick text message',
    copy:
      'I work with Excalibur and can point you in the right direction if you want to learn more. Mention my referral code when you message them so your request is linked to me.',
  },
  {
    title: 'Social post caption',
    copy:
      'If your business is ready for stronger growth support and clearer next steps, Excalibur is worth a look. If you reach out, use my referral code so your inquiry is connected to me.',
  },
];

export const featureCards = [
  {
    title: 'Your referrals stay connected',
    body: 'Every referral tied to your code shows up in one place, so you always know what belongs to you.',
    icon: ShieldCheck,
  },
  {
    title: 'Clear payout progress',
    body: 'You can see which referrals are moving forward and how much has already been paid out.',
    icon: HandCoins,
  },
  {
    title: 'Ready-to-share copy',
    body: 'Keep a few clean messages on hand so sharing feels easy when the right opportunity comes up.',
    icon: LayoutTemplate,
  },
];
