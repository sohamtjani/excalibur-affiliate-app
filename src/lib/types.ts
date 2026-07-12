export type Role = 'affiliate' | 'admin';

export type LeadStatus =
  | 'lead'
  | 'closed'
  | 'new'
  | 'contacted'
  | 'signed'
  | 'tier_1_paid'
  | 'tier_2_paid';

export interface Profile {
  id: string;
  role: Role;
  is_admin: boolean;
  is_active: boolean;
  name: string;
  referral_code: string | null;
  contact_info: {
    email?: string;
    phone?: string;
    notes?: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  business_name: string;
  contact_name: string;
  contact_info: {
    email?: string;
    phone?: string;
    help_needed?: string;
    presence_link?: string;
  } | null;
  notes: string | null;
  affiliate_id: string | null;
  submitted_referral_code: string | null;
  status: LeadStatus;
  submitted_at: string;
  closed_at: string | null;
  payout_timeline_days: 30 | 60;
  tier_1_due_at: string | null;
  tier_1_paid_at: string | null;
  tier_2_due_at: string | null;
  tier_2_paid_at: string | null;
  updated_at: string;
}

export interface LeadWithAffiliate extends Lead {
  affiliate?: Pick<Profile, 'id' | 'name' | 'referral_code'> | null;
}

export interface AffiliateInvite {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  referral_code: string | null;
  access_code: string;
  invited_by: string | null;
  activation_issued_at: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
}
