export type Role = 'affiliate' | 'admin';

export type LeadStatus =
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
  } | null;
  notes: string | null;
  affiliate_id: string | null;
  submitted_referral_code: string | null;
  status: LeadStatus;
  submitted_at: string;
  updated_at: string;
}

export interface LeadWithAffiliate extends Lead {
  affiliate?: Pick<Profile, 'id' | 'name' | 'referral_code'> | null;
}
