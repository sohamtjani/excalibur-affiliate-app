import type { Lead, LeadStatus } from './types';

const statusAmount: Record<LeadStatus, number> = {
  new: 0,
  contacted: 0,
  signed: 0,
  tier_1_paid: 200,
  tier_2_paid: 400,
};

const statusMilestones: Record<LeadStatus, number> = {
  new: 0,
  contacted: 0,
  signed: 0,
  tier_1_paid: 1,
  tier_2_paid: 2,
};

export function summarizePayouts(leads: Lead[]) {
  return leads.reduce(
    (acc, lead) => {
      acc.totalEarned += statusAmount[lead.status];
      acc.milestonesPaid += statusMilestones[lead.status];
      return acc;
    },
    { totalEarned: 0, milestonesPaid: 0 },
  );
}
