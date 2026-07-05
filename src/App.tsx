import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Copy,
  LoaderCircle,
  LogOut,
  Mail,
  Phone,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { z } from 'zod';
import { featureCards, leadStatuses, marketingResources } from './lib/constants';
import { summarizePayouts } from './lib/payouts';
import { supabase, supabaseConfigError } from './lib/supabase';
import type { Lead, LeadStatus, LeadWithAffiliate, Profile } from './lib/types';

const leadSchema = z.object({
  businessName: z.string().min(2, 'Business name is required.'),
  contactName: z.string().min(2, 'Contact name is required.'),
  email: z.string().email('Use a valid email address.').or(z.literal('')),
  phone: z.string().min(7, 'Use a valid phone number.').or(z.literal('')),
  referralCode: z.string().max(40).optional(),
  notes: z.string().max(1000).optional(),
});

const signInSchema = z.object({
  email: z.string().email('Use a valid email address.'),
  password: z.string().min(8, 'Password is required.'),
});

const inviteSchema = z.object({
  name: z.string().min(2, 'Affiliate name is required.'),
  email: z.string().email('Use a valid email address.'),
  phone: z.string().optional(),
  referralCode: z.string().max(40).optional(),
});

const profileSchema = z.object({
  id: z.string(),
  role: z.enum(['affiliate', 'admin']),
  is_admin: z.boolean(),
  is_active: z.boolean(),
  name: z.string(),
  referral_code: z.string().nullable(),
  contact_info: z
    .object({
      email: z.string().optional(),
      phone: z.string().optional(),
      notes: z.string().optional(),
    })
    .nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const leadSelect =
  'id,business_name,contact_name,contact_info,notes,affiliate_id,submitted_referral_code,status,submitted_at,updated_at';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setError(supabaseConfigError);
      setLoading(false);
      return;
    }

    let active = true;

    supabase!.auth
      .getSession()
      .then(async ({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) {
          setError(sessionError.message);
        }

        setSession(data.session ?? null);
        if (data.session?.user) {
          await loadProfile(data.session.user.id);
        }
        setLoading(false);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Unable to load session.');
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase!.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        await loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    async function loadProfile(userId: string) {
      const { data, error: profileError } = await supabase!
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        setProfile(null);
        setError(profileError.message);
        return;
      }

      setProfile(profileSchema.parse(data));
      setError(null);
    }

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <FullScreenState icon={LoaderCircle} message="Loading Excalibur portal..." spin />;
  }

  if (error && !session) {
    return <FullScreenState icon={AlertCircle} message={error} accent="warn" />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage session={session} profile={profile} />} />
      <Route
        path="/auth"
        element={session ? <Navigate to="/dashboard" replace /> : <AuthPage />}
      />
      <Route
        path="/dashboard"
        element={
          session && profile ? (
            profile.role === 'admin' ? (
              <AdminDashboard profile={profile} />
            ) : (
              <AffiliateDashboard profile={profile} />
            )
          ) : (
            <Navigate to="/auth" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function LandingPage({
  session,
  profile,
}: {
  session: Session | null;
  profile: Profile | null;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [form, setForm] = useState({
    businessName: '',
    contactName: '',
    email: '',
    phone: '',
    referralCode: '',
    notes: '',
    website: '',
  });

  async function submitLead(event: React.FormEvent) {
    event.preventDefault();
    setStatus(null);

    const parsed = leadSchema.safeParse(form);
    if (!parsed.success) {
      setStatus(parsed.error.issues[0]?.message ?? 'Please review the form.');
      return;
    }

    if (!parsed.data.email && !parsed.data.phone) {
      setStatus('Provide either an email or phone number.');
      return;
    }

    if (form.website.trim()) {
      setStatus('Submission blocked.');
      return;
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed < 3000) {
      setStatus('Please take a moment to review your details and submit again.');
      return;
    }

    const lastSubmission = Number(localStorage.getItem('excalibur-last-lead-submit') ?? '0');
    if (Date.now() - lastSubmission < 60_000) {
      setStatus('Please wait one minute before submitting another lead.');
      return;
    }

    setSubmitting(true);
    const { error } = await supabase!.from('leads').insert({
      business_name: parsed.data.businessName,
      contact_name: parsed.data.contactName,
      contact_info: {
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
      },
      notes: parsed.data.notes || null,
      submitted_referral_code: parsed.data.referralCode?.trim() || null,
      status: 'new',
      submitted_at: new Date().toISOString(),
    });

    setSubmitting(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    localStorage.setItem('excalibur-last-lead-submit', String(Date.now()));
    setForm({
      businessName: '',
      contactName: '',
      email: '',
      phone: '',
      referralCode: '',
      notes: '',
      website: '',
    });
    setStatus('Lead submitted. Excalibur will review it shortly.');
  }

  return (
    <main className="min-h-screen overflow-hidden px-4 py-6 text-white sm:px-6 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <nav className="glass gold-ring flex items-center justify-between rounded-full px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 text-gold">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="font-serif text-2xl leading-none text-white">Excalibur</p>
              <p className="text-xs uppercase tracking-[0.34em] text-mist/70">Referral Command</p>
            </div>
          </div>
          <Link
            to={session && profile ? '/dashboard' : '/auth'}
            className="rounded-full border border-gold/45 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold hover:text-navy"
          >
            {session && profile ? 'Open Dashboard' : 'Affiliate Login'}
          </Link>
        </nav>

        <section className="grid gap-6 lg:grid-cols-[1.25fr,0.95fr]">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-hero-glow p-8 shadow-luxe sm:p-12">
            <div className="absolute right-0 top-0 h-72 w-72 rounded-full bg-gold/10 blur-3xl" />
            <div className="relative flex flex-col gap-8">
              <div className="max-w-2xl">
                <p className="mb-4 inline-flex items-center rounded-full border border-gold/30 bg-gold/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-gold">
                  Luxury Partner Portal
                </p>
                <h1 className="font-serif text-5xl leading-[0.95] text-white sm:text-7xl">
                  Referral intake, affiliate visibility, and admin control in one secure system.
                </h1>
                <p className="mt-6 max-w-xl text-base leading-7 text-mist/85 sm:text-lg">
                  Public leads flow in without login. Affiliates see only their own attribution and payout progress. Admins manage the full pipeline behind Supabase Auth and Row Level Security.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {featureCards.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="glass rounded-3xl p-5">
                    <Icon className="mb-4 h-6 w-6 text-gold" />
                    <h2 className="font-serif text-2xl text-white">{title}</h2>
                    <p className="mt-3 text-sm leading-6 text-mist/82">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <section className="glass gold-ring rounded-[2rem] p-6 sm:p-8">
            <div className="mb-6">
              <p className="text-sm uppercase tracking-[0.28em] text-gold/90">Lead Intake</p>
              <h2 className="mt-3 font-serif text-4xl text-white">Submit a business lead</h2>
              <p className="mt-3 text-sm leading-6 text-mist/80">
                Phone or email is required. Referral code is optional. Public submissions are validated client-side and inserted directly into Supabase.
              </p>
            </div>

            <form className="space-y-4" onSubmit={submitLead}>
              <input
                type="text"
                value={form.website}
                onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
              />
              <FormInput
                label="Business name"
                value={form.businessName}
                onChange={(value) => setForm((current) => ({ ...current, businessName: value }))}
              />
              <FormInput
                label="Contact name"
                value={form.contactName}
                onChange={(value) => setForm((current) => ({ ...current, contactName: value }))}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormInput
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(value) => setForm((current) => ({ ...current, email: value }))}
                />
                <FormInput
                  label="Phone"
                  value={form.phone}
                  onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
                />
              </div>
              <FormInput
                label="Referral code"
                value={form.referralCode}
                onChange={(value) => setForm((current) => ({ ...current, referralCode: value.toUpperCase() }))}
              />
              <FormTextarea
                label="Notes"
                value={form.notes}
                onChange={(value) => setForm((current) => ({ ...current, notes: value }))}
              />
              <button
                type="submit"
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-3 font-semibold text-navy transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Submit Lead
              </button>
              {status ? <InlineStatus message={status} success={status.startsWith('Lead submitted')} /> : null}
            </form>
          </section>
        </section>
      </div>
    </main>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'activate' | 'magic'>('signin');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        const parsed = signInSchema.parse({ email: form.email, password: form.password });
        const { error } = await supabase!.auth.signInWithPassword(parsed);
        if (error) throw error;
        navigate('/dashboard');
      }

      if (mode === 'activate') {
        const parsed = signInSchema.parse({ email: form.email, password: form.password });
        const { error } = await supabase!.auth.signUp({
          email: parsed.email,
          password: parsed.password,
        });
        if (error) throw error;
        setMessage('Invite activation submitted. Use the invited email address only.');
      }

      if (mode === 'magic') {
        if (!form.email) throw new Error('Email is required.');
        const { error } = await supabase!.auth.signInWithOtp({
          email: form.email,
          options: {
            shouldCreateUser: false,
          },
        });
        if (error) throw error;
        setMessage('Magic link sent to an existing affiliate or admin account.');
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="glass gold-ring w-full max-w-xl rounded-[2rem] p-8 sm:p-10">
        <Link to="/" className="text-sm uppercase tracking-[0.3em] text-gold/85">
          Back to intake
        </Link>
        <h1 className="mt-4 font-serif text-5xl text-white">Affiliate access</h1>
        <p className="mt-4 text-sm leading-6 text-mist/80">
          New affiliates must be created by an admin from inside the portal first. Admin accounts use the same auth stack but must be elevated in the `profiles` table.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl bg-white/5 p-1">
          {[
            ['signin', 'Sign in'],
            ['activate', 'Activate invite'],
            ['magic', 'Magic link'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value as 'signin' | 'activate' | 'magic')}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                mode === value ? 'bg-gold text-navy' : 'text-mist/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <FormInput
            label="Email"
            type="email"
            value={form.email}
            onChange={(value) => setForm((current) => ({ ...current, email: value }))}
          />

          {mode !== 'magic' ? (
            <FormInput
              label="Password"
              type="password"
              value={form.password}
              onChange={(value) => setForm((current) => ({ ...current, password: value }))}
            />
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-3 font-semibold text-navy transition hover:brightness-105 disabled:opacity-75"
          >
            {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {mode === 'signin' ? 'Sign in' : mode === 'activate' ? 'Activate invited account' : 'Email magic link'}
          </button>
          {message ? <InlineStatus message={message} success={message.includes('sent') || message.includes('submitted')} /> : null}
        </form>
      </div>
    </main>
  );
}

function AffiliateDashboard({ profile }: { profile: Profile }) {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const payoutSummary = useMemo(() => summarizePayouts(leads), [leads]);

  useEffect(() => {
    loadLeads();

    async function loadLeads() {
      const { data, error } = await supabase!
        .from('leads')
        .select(leadSelect)
        .order('submitted_at', { ascending: false });

      if (error) {
        setMessage(error.message);
      } else {
        setLeads((data as Lead[]) ?? []);
      }

      setLoading(false);
    }
  }, []);

  return (
    <DashboardShell profile={profile} title="Affiliate dashboard">
      <div className="grid gap-4 xl:grid-cols-4">
        <StatCard label="Referral code" value={profile.referral_code ?? 'Pending'} />
        <StatCard label="Total leads" value={String(leads.length)} />
        <StatCard label="Milestones paid" value={String(payoutSummary.milestonesPaid)} />
        <StatCard label="Total earned" value={`$${payoutSummary.totalEarned}`} />
      </div>

      <section className="grid gap-6 xl:grid-cols-[1.4fr,0.8fr]">
        <div className="glass rounded-[1.75rem] p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.28em] text-gold/85">Your leads</p>
              <h2 className="mt-2 font-serif text-3xl text-white">Read-only pipeline visibility</h2>
            </div>
            <button
              type="button"
              onClick={async () => {
                await supabase!.auth.signOut();
                navigate('/auth');
              }}
              className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-mist/75 transition hover:border-gold/40 hover:text-gold"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>

          {loading ? (
            <InlineStatus message="Loading leads..." success />
          ) : leads.length ? (
            <div className="space-y-3">
              {leads.map((lead) => (
                <div key={lead.id} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-serif text-2xl text-white">{lead.business_name}</h3>
                      <p className="text-sm text-mist/80">{lead.contact_name}</p>
                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-mist/72">
                        <span className="inline-flex items-center gap-2">
                          <Mail className="h-4 w-4 text-gold" />
                          {lead.contact_info?.email || 'No email'}
                        </span>
                        <span className="inline-flex items-center gap-2">
                          <Phone className="h-4 w-4 text-gold" />
                          {lead.contact_info?.phone || 'No phone'}
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>
                  {lead.notes ? <p className="mt-4 text-sm leading-6 text-mist/76">{lead.notes}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No leads yet"
              body="Once a prospect submits your code, they will appear here automatically."
            />
          )}
          {message ? <div className="mt-4"><InlineStatus message={message} /></div> : null}
        </div>

        <div className="glass rounded-[1.75rem] p-6">
          <p className="text-sm uppercase tracking-[0.28em] text-gold/85">Resource bank</p>
          <h2 className="mt-2 font-serif text-3xl text-white">Marketing captions</h2>
          <div className="mt-5 space-y-4">
            {marketingResources.map((resource) => (
              <ResourceCard key={resource.title} title={resource.title} copy={resource.copy} />
            ))}
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}

function AdminDashboard({ profile }: { profile: Profile }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [leads, setLeads] = useState<LeadWithAffiliate[]>([]);
  const [affiliates, setAffiliates] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '', phone: '', referralCode: '' });
  const [leadForm, setLeadForm] = useState({
    businessName: '',
    contactName: '',
    email: '',
    phone: '',
    referralCode: '',
    notes: '',
  });

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    const [leadResult, affiliateResult] = await Promise.all([
      supabase!
        .from('leads')
        .select(
          `${leadSelect},affiliate:profiles!leads_affiliate_id_fkey(id,name,referral_code)`,
        )
        .order('submitted_at', { ascending: false }),
      supabase!.from('profiles').select('*').order('created_at', { ascending: false }),
    ]);

    if (leadResult.error) {
      setMessage(leadResult.error.message);
    } else {
      setLeads(
        ((leadResult.data as Array<LeadWithAffiliate & { affiliate?: Array<LeadWithAffiliate['affiliate']> }>) ?? []).map(
          (lead) => ({
            ...lead,
            affiliate: Array.isArray(lead.affiliate) ? lead.affiliate[0] ?? null : lead.affiliate ?? null,
          }),
        ),
      );
      setMessage(null);
    }

    if (affiliateResult.error) {
      setMessage(affiliateResult.error.message);
    } else {
      setAffiliates((affiliateResult.data as Profile[]) ?? []);
    }

    setLoading(false);
  }

  async function updateLeadStatus(id: string, status: LeadStatus) {
    const { error } = await supabase!
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      setMessage(error.message);
      return;
    }
    await refresh();
  }

  async function deleteLead(id: string) {
    const { error } = await supabase!.from('leads').delete().eq('id', id);
    if (error) {
      setMessage(error.message);
      return;
    }
    await refresh();
  }

  async function createManualLead(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    const parsed = leadSchema.safeParse(leadForm);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message ?? 'Invalid lead.');
      return;
    }

    if (!parsed.data.email && !parsed.data.phone) {
      setMessage('Provide either an email or phone number.');
      return;
    }

    const { error } = await supabase!.from('leads').insert({
      business_name: parsed.data.businessName,
      contact_name: parsed.data.contactName,
      contact_info: {
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
      },
      notes: parsed.data.notes || null,
      submitted_referral_code: parsed.data.referralCode?.trim() || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setLeadForm({
      businessName: '',
      contactName: '',
      email: '',
      phone: '',
      referralCode: '',
      notes: '',
    });
    await refresh();
    setMessage('Lead created.');
  }

  async function inviteAffiliate(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);

    try {
      const parsed = inviteSchema.parse(inviteForm);
      const { error } = await supabase!.from('affiliate_invites').insert({
        email: parsed.email.toLowerCase(),
        name: parsed.name,
        phone: parsed.phone || null,
        referral_code: parsed.referralCode?.trim().toUpperCase() || null,
        invited_by: profile.id,
      });
      if (error) throw error;
      setInviteForm({ name: '', email: '', phone: '', referralCode: '' });
      setMessage('Affiliate invite created. They can now activate their account from the portal.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Unable to invite affiliate.');
    }
  }

  async function saveAffiliate(profileId: string, updates: Partial<Profile>) {
    const { error } = await supabase!.from('profiles').update(updates).eq('id', profileId);
    if (error) {
      setMessage(error.message);
      return;
    }
    await refresh();
  }

  const payoutTotals = useMemo(() => summarizePayouts(leads), [leads]);

  return (
    <DashboardShell profile={profile} title="Admin dashboard">
      <div className="grid gap-4 xl:grid-cols-4">
        <StatCard label="Total leads" value={String(leads.length)} />
        <StatCard label="Active affiliates" value={String(affiliates.filter((item) => item.role === 'affiliate' && item.is_active).length)} />
        <StatCard label="Milestones paid" value={String(payoutTotals.milestonesPaid)} />
        <StatCard label="Tracked payouts" value={`$${payoutTotals.totalEarned}`} />
      </div>

      <div className="grid gap-6 2xl:grid-cols-[0.8fr,1.2fr]">
        <div className="space-y-6">
          <section className="glass rounded-[1.75rem] p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-gold/85">Admin actions</p>
            <h2 className="mt-2 font-serif text-3xl text-white">Invite affiliate</h2>
            <form className="mt-5 space-y-4" onSubmit={inviteAffiliate}>
              <FormInput
                label="Affiliate name"
                value={inviteForm.name}
                onChange={(value) => setInviteForm((current) => ({ ...current, name: value }))}
              />
              <FormInput
                label="Affiliate email"
                type="email"
                value={inviteForm.email}
                onChange={(value) => setInviteForm((current) => ({ ...current, email: value }))}
              />
              <FormInput
                label="Phone"
                value={inviteForm.phone}
                onChange={(value) => setInviteForm((current) => ({ ...current, phone: value }))}
              />
              <FormInput
                label="Referral code"
                value={inviteForm.referralCode}
                onChange={(value) => setInviteForm((current) => ({ ...current, referralCode: value }))}
              />
              <button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold px-5 py-3 font-semibold text-navy transition hover:brightness-105">
                <Plus className="h-4 w-4" />
                Create Affiliate Invite
              </button>
            </form>
          </section>

          <section className="glass rounded-[1.75rem] p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-gold/85">Manual intake</p>
            <h2 className="mt-2 font-serif text-3xl text-white">Create lead</h2>
            <form className="mt-5 space-y-4" onSubmit={createManualLead}>
              <FormInput
                label="Business name"
                value={leadForm.businessName}
                onChange={(value) => setLeadForm((current) => ({ ...current, businessName: value }))}
              />
              <FormInput
                label="Contact name"
                value={leadForm.contactName}
                onChange={(value) => setLeadForm((current) => ({ ...current, contactName: value }))}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <FormInput
                  label="Email"
                  type="email"
                  value={leadForm.email}
                  onChange={(value) => setLeadForm((current) => ({ ...current, email: value }))}
                />
                <FormInput
                  label="Phone"
                  value={leadForm.phone}
                  onChange={(value) => setLeadForm((current) => ({ ...current, phone: value }))}
                />
              </div>
              <FormInput
                label="Referral code"
                value={leadForm.referralCode}
                onChange={(value) => setLeadForm((current) => ({ ...current, referralCode: value.toUpperCase() }))}
              />
              <FormTextarea
                label="Notes"
                value={leadForm.notes}
                onChange={(value) => setLeadForm((current) => ({ ...current, notes: value }))}
              />
              <button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-gold/45 px-5 py-3 font-semibold text-gold transition hover:bg-gold hover:text-navy">
                <Plus className="h-4 w-4" />
                Create Lead
              </button>
            </form>
          </section>
        </div>

        <div className="space-y-6">
          <section className="glass rounded-[1.75rem] p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.28em] text-gold/85">Pipeline</p>
                <h2 className="mt-2 font-serif text-3xl text-white">Lead management</h2>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await supabase!.auth.signOut();
                  navigate('/auth', { replace: true, state: { from: location.pathname } });
                }}
                className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-mist/75 transition hover:border-gold/40 hover:text-gold"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>

            {loading ? (
              <InlineStatus message="Loading admin data..." success />
            ) : leads.length ? (
              <div className="space-y-3">
                {leads.map((lead) => (
                  <div key={lead.id} className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h3 className="font-serif text-2xl text-white">{lead.business_name}</h3>
                        <p className="text-sm text-mist/76">
                          {lead.contact_name} · {lead.contact_info?.email || lead.contact_info?.phone || 'No contact'}
                        </p>
                        <p className="mt-2 text-xs uppercase tracking-[0.24em] text-gold/78">
                          Affiliate: {lead.affiliate?.name || 'Unattributed'} {lead.affiliate?.referral_code ? `(${lead.affiliate.referral_code})` : ''}
                        </p>
                        {lead.notes ? <p className="mt-3 text-sm leading-6 text-mist/76">{lead.notes}</p> : null}
                      </div>
                      <div className="flex flex-col gap-3">
                        <select
                          value={lead.status}
                          onChange={(event) => void updateLeadStatus(lead.id, event.target.value as LeadStatus)}
                          className="rounded-2xl border border-white/10 bg-navy/70 px-4 py-3 text-sm text-white focus:border-gold focus:outline-none"
                        >
                          {leadStatuses.map((status) => (
                            <option key={status.value} value={status.value}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void deleteLead(lead.id)}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-400/35 px-4 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-400/10"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No leads yet" body="Public and admin-created leads will appear here." />
            )}
          </section>

          <section className="glass rounded-[1.75rem] p-6">
            <p className="text-sm uppercase tracking-[0.28em] text-gold/85">Affiliate roster</p>
            <h2 className="mt-2 font-serif text-3xl text-white">Access and referral codes</h2>
            <div className="mt-5 space-y-3">
              {affiliates.length ? (
                affiliates.map((item) => (
                  <AffiliateEditor key={item.id} profile={item} onSave={saveAffiliate} />
                ))
              ) : (
                <EmptyState title="No affiliates yet" body="Invited affiliates will populate here after auth user creation." />
              )}
            </div>
            {message ? <div className="mt-4"><InlineStatus message={message} success={message.includes('sent') || message.includes('created')} /></div> : null}
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}

function DashboardShell({
  profile,
  title,
  children,
}: {
  profile: Profile;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="glass gold-ring flex flex-col gap-5 rounded-[2rem] px-6 py-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.34em] text-gold/85">{profile.role}</p>
            <h1 className="mt-3 font-serif text-5xl text-white">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-mist/76">
              Signed in as {profile.name || profile.contact_info?.email || profile.id}
            </p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-gold/45 px-4 py-2 text-sm font-semibold text-gold transition hover:bg-gold hover:text-navy"
          >
            Return to public page
          </Link>
        </header>
        {children}
      </div>
    </main>
  );
}

function AffiliateEditor({
  profile,
  onSave,
}: {
  profile: Profile;
  onSave: (id: string, updates: Partial<Profile>) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    name: profile.name,
    referral_code: profile.referral_code ?? '',
    is_active: profile.is_active,
    role: profile.role,
  });

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="grid gap-3 lg:grid-cols-[1.1fr,1fr,0.8fr,0.8fr,auto]">
        <FormInput
          label="Name"
          value={draft.name}
          onChange={(value) => setDraft((current) => ({ ...current, name: value }))}
          compact
        />
        <FormInput
          label="Referral code"
          value={draft.referral_code}
          onChange={(value) =>
            setDraft((current) => ({ ...current, referral_code: value.toUpperCase().replace(/\s+/g, '') }))
          }
          compact
        />
        <label className="text-sm text-mist/70">
          <span className="mb-2 block text-xs uppercase tracking-[0.24em] text-mist/60">Role</span>
          <select
            value={draft.role}
            onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value as Profile['role'] }))}
            className="w-full rounded-2xl border border-white/10 bg-navy/70 px-4 py-3 text-white focus:border-gold focus:outline-none"
          >
            <option value="affiliate">Affiliate</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="flex items-end gap-3 rounded-2xl border border-white/10 bg-navy/40 px-4 py-3 text-sm text-white">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(event) => setDraft((current) => ({ ...current, is_active: event.target.checked }))}
            className="h-4 w-4 accent-gold"
          />
          Active
        </label>
        <button
          type="button"
          onClick={() =>
            void onSave(profile.id, {
              name: draft.name,
              referral_code: draft.referral_code || null,
              is_active: draft.is_active,
              role: draft.role,
            })
          }
          className="rounded-2xl bg-gold px-5 py-3 text-sm font-semibold text-navy transition hover:brightness-105"
        >
          Save
        </button>
      </div>
      <p className="mt-3 text-xs uppercase tracking-[0.22em] text-mist/56">{profile.contact_info?.email || profile.id}</p>
    </div>
  );
}

function ResourceCard({ title, copy }: { title: string; copy: string }) {
  const [copied, setCopied] = useState(false);

  async function copyText() {
    await navigator.clipboard.writeText(copy);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <article className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-4">
        <h3 className="font-serif text-2xl text-white">{title}</h3>
        <button
          type="button"
          onClick={() => void copyText()}
          className="inline-flex items-center gap-2 rounded-full border border-gold/35 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold transition hover:bg-gold hover:text-navy"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-4 text-sm leading-6 text-mist/78">{copy}</p>
    </article>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = 'text',
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  compact?: boolean;
}) {
  return (
    <label className={`block text-sm text-mist/70 ${compact ? '' : ''}`}>
      <span className="mb-2 block text-xs uppercase tracking-[0.24em] text-mist/60">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-navy/70 px-4 py-3 text-white placeholder:text-mist/35 focus:border-gold focus:outline-none"
      />
    </label>
  );
}

function FormTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm text-mist/70">
      <span className="mb-2 block text-xs uppercase tracking-[0.24em] text-mist/60">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="w-full rounded-2xl border border-white/10 bg-navy/70 px-4 py-3 text-white placeholder:text-mist/35 focus:border-gold focus:outline-none"
      />
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-[1.75rem] p-5">
      <p className="text-xs uppercase tracking-[0.28em] text-gold/78">{label}</p>
      <p className="mt-3 font-serif text-4xl text-white">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const labels: Record<LeadStatus, string> = {
    new: 'New',
    contacted: 'Contacted',
    signed: 'Signed',
    tier_1_paid: 'Tier 1 Paid',
    tier_2_paid: 'Tier 2 Paid',
  };

  return (
    <span className="inline-flex items-center rounded-full border border-gold/28 bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-gold">
      {labels[status]}
    </span>
  );
}

function InlineStatus({ message, success = false }: { message: string; success?: boolean }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
        success
          ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100'
          : 'border-amber-400/25 bg-amber-400/10 text-amber-100'
      }`}
    >
      {success ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <AlertCircle className="mt-0.5 h-4 w-4" />}
      <span>{message}</span>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-white/12 bg-white/4 p-8 text-center">
      <h3 className="font-serif text-3xl text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-mist/74">{body}</p>
    </div>
  );
}

function FullScreenState({
  icon: Icon,
  message,
  accent = 'gold',
  spin = false,
}: {
  icon: typeof LoaderCircle;
  message: string;
  accent?: 'gold' | 'warn';
  spin?: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="glass gold-ring flex max-w-lg flex-col items-center rounded-[2rem] p-8 text-center">
        <Icon className={`h-8 w-8 ${spin ? 'animate-spin' : ''} ${accent === 'warn' ? 'text-amber-200' : 'text-gold'}`} />
        <p className="mt-4 text-sm leading-6 text-mist/80">{message}</p>
      </div>
    </main>
  );
}

export default App;
