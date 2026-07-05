import type { Lead, LeadStatus } from './types';

export function normalizeLeadStage(status: LeadStatus): 'lead' | 'contacted' | 'closed' {
  if (status === 'contacted') {
    return 'contacted';
  }

  if (status === 'lead' || status === 'new') {
    return 'lead';
  }

  return 'closed';
}

export function getLeadStatusLabel(status: LeadStatus) {
  const stage = normalizeLeadStage(status);

  if (stage === 'lead') return 'Lead';
  if (stage === 'contacted') return 'Contacted';
  return 'Closed';
}

export function summarizePayouts(leads: Lead[]) {
  return leads.reduce(
    (acc, lead) => {
      const stage = normalizeLeadStage(lead.status);

      acc.totalEarned += (lead.tier_1_paid_at ? 200 : 0) + (lead.tier_2_paid_at ? 200 : 0);
      acc.milestonesPaid += (lead.tier_1_paid_at ? 1 : 0) + (lead.tier_2_paid_at ? 1 : 0);

      if (stage === 'closed') {
        acc.closedClients += 1;
      }

      if (!lead.tier_1_paid_at && lead.tier_1_due_at) {
        acc.pendingMilestones += 1;
      }

      if (!lead.tier_2_paid_at && lead.tier_2_due_at) {
        acc.pendingMilestones += 1;
      }

      return acc;
    },
    {
      totalEarned: 0,
      milestonesPaid: 0,
      closedClients: 0,
      pendingMilestones: 0,
    },
  );
}

export function getDueMilestones(leads: Lead[], now = new Date()) {
  return leads.flatMap((lead) => {
    const dueItems: Array<{ leadId: string; amount: number; tier: 1 | 2; dueAt: string }> = [];

    if (lead.tier_1_due_at && !lead.tier_1_paid_at && new Date(lead.tier_1_due_at) <= now) {
      dueItems.push({ leadId: lead.id, amount: 200, tier: 1, dueAt: lead.tier_1_due_at });
    }

    if (lead.tier_2_due_at && !lead.tier_2_paid_at && new Date(lead.tier_2_due_at) <= now) {
      dueItems.push({ leadId: lead.id, amount: 200, tier: 2, dueAt: lead.tier_2_due_at });
    }

    return dueItems;
  });
}
