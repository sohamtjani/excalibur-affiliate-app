import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
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
  Sparkles,
} from 'lucide-react';
import { z } from 'zod';
import { featureCards, marketingResources } from './lib/constants';
import { summarizePayouts } from './lib/payouts';
import { supabase, supabaseConfigError } from './lib/supabase';
import type { Lead, LeadStatus, Profile } from './lib/types';

const signInSchema = z.object({
  email: z.string().email('Use a valid email address.'),
  password: z.string().min(8, 'Enter your password.'),
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
        setError(caught instanceof Error ? caught.message : 'Unable to load your session.');
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

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return <FullScreenState icon={LoaderCircle} message="Loading your portal..." spin />;
  }

  if (error && !session) {
    return <FullScreenState icon={AlertCircle} message={error} accent="warn" />;
  }

  return (
    <Routes>
      <Route path="/" element={<AffiliatePortalPage session={session} profile={profile} />} />
      <Route path="/auth" element={<Navigate to="/" replace />} />
      <Route
        path="/dashboard"
        element={
          session && profile ? (
            profile.role === 'affiliate' ? (
              <AffiliateDashboard profile={profile} />
            ) : (
              <PartnerOnlyState />
            )
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AffiliatePortalPage({
  session,
  profile,
}: {
  session: Session | null;
  profile: Profile | null;
}) {
  const [mode, setMode] = useState<'signin' | 'activate' | 'magic'>('signin');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  const navigate = useNavigate();

  useEffect(() => {
    if (session && profile?.role === 'affiliate') {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate, profile, session]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        const parsed = signInSchema.parse(form);
        const { error } = await supabase!.auth.signInWithPassword(parsed);
        if (error) throw error;
      }

      if (mode === 'activate') {
        const parsed = signInSchema.parse(form);
        const { error } = await supabase!.auth.signUp({
          email: parsed.email,
          password: parsed.password,
        });
        if (error) throw error;
        setMessage('Your access request was sent. Check your email if confirmation is enabled.');
      }

      if (mode === 'magic') {
        if (!form.email) throw new Error('Enter your email address.');
        const { error } = await supabase!.auth.signInWithOtp({
          email: form.email,
          options: {
            shouldCreateUser: false,
          },
        });
        if (error) throw error;
        setMessage('A sign-in link is on its way to your inbox.');
      }
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'We could not sign you in.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 text-slate-950 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-4rem] h-80 w-80 rounded-full bg-cyan-300/40 blur-3xl" />
        <div className="absolute right-[-10rem] top-[12%] h-96 w-96 rounded-full bg-blue-500/25 blur-3xl" />
        <div className="absolute bottom-[-8rem] left-[18%] h-80 w-80 rounded-full bg-white/80 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col justify-between gap-8">
        <nav className="panel flex items-center justify-between rounded-full px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-soft">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Excalibur</p>
              <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">Affiliate Portal</p>
            </div>
          </div>
          <span className="rounded-full border border-sky-200 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
            Partners only
          </span>
        </nav>

        <section className="grid items-stretch gap-6 lg:grid-cols-[1.15fr,0.85fr]">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-gradient-to-br from-white via-sky-50 to-blue-100/80 p-8 shadow-[0_30px_90px_rgba(68,100,180,0.16)] sm:p-12">
            <div className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
            <div className="absolute right-[-4rem] top-[-2rem] h-64 w-64 rounded-full bg-blue-500/15 blur-3xl" />
            <div className="absolute bottom-[-4rem] left-[-3rem] h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />
            <div className="relative flex h-full flex-col justify-between gap-10">
              <div className="max-w-3xl">
                <span className="inline-flex rounded-full border border-sky-200 bg-white/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-600">
                  Private partner access
                </span>
                <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[0.93] tracking-[-0.05em] text-slate-950 sm:text-7xl">
                  A cleaner way for affiliates to check progress, payouts, and ready-to-share copy.
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                  This page is only for Excalibur affiliates. Sign in to see your referrals, where each one stands, and what you have earned so far.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {featureCards.map(({ icon: Icon, title, body }) => (
                  <article
                    key={title}
                    className="rounded-[1.5rem] border border-white/70 bg-white/78 p-5 shadow-[0_14px_35px_rgba(83,112,189,0.08)] backdrop-blur-xl"
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-900">{title}</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <section className="panel flex flex-col justify-between rounded-[2rem] p-6 sm:p-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">Welcome back</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950">
                Affiliate sign-in
              </h2>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                If your access was set up for you, use your email and password, activate your invite, or request a sign-in link.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2 rounded-3xl bg-slate-100/80 p-1.5">
              {[
                ['signin', 'Sign in'],
                ['activate', 'Activate'],
                ['magic', 'Email link'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value as 'signin' | 'activate' | 'magic')}
                  className={`rounded-[1.15rem] px-4 py-3 text-sm font-semibold transition ${
                    mode === value
                      ? 'bg-white text-slate-950 shadow-[0_12px_30px_rgba(65,96,176,0.15)]'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <FormInput
                label="Email address"
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
                className="flex w-full items-center justify-center gap-2 rounded-[1.35rem] bg-slate-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {mode === 'signin'
                  ? 'Open my portal'
                  : mode === 'activate'
                    ? 'Activate my access'
                    : 'Send my sign-in link'}
              </button>

              {message ? (
                <InlineStatus
                  message={message}
                  success={message.includes('way') || message.includes('sent') || message.includes('request')}
                />
              ) : null}
            </form>

            <div className="mt-8 rounded-[1.6rem] border border-sky-100 bg-white/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Need help?
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                If you were invited but still cannot get in, contact your Excalibur point of contact and ask them to confirm your affiliate access.
              </p>
            </div>
          </section>
        </section>
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

    void loadLeads();
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-5rem] h-80 w-80 rounded-full bg-cyan-300/35 blur-3xl" />
        <div className="absolute right-[-10rem] top-[10%] h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl space-y-6">
        <header className="panel rounded-[2rem] px-6 py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Affiliate portal</p>
              <h1 className="mt-3 text-5xl font-semibold tracking-[-0.05em] text-slate-950">
                Welcome back, {profile.name || 'partner'}.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
                Here is a live view of your referrals, current progress, and your ready-to-use share copy.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <span className="rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700">
                Code: {profile.referral_code ?? 'Pending'}
              </span>
              <button
                type="button"
                onClick={async () => {
                  await supabase!.auth.signOut();
                  navigate('/', { replace: true });
                }}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Referral code" value={profile.referral_code ?? 'Pending'} />
          <StatCard label="Total referrals" value={String(leads.length)} />
          <StatCard label="Paid milestones" value={String(payoutSummary.milestonesPaid)} />
          <StatCard label="Total earned" value={`$${payoutSummary.totalEarned}`} />
        </div>

        <section className="grid gap-6 xl:grid-cols-[1.35fr,0.85fr]">
          <div className="panel rounded-[2rem] p-6">
            <div className="mb-5">
              <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">Your referrals</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                Progress at a glance
              </h2>
            </div>

            {loading ? (
              <InlineStatus message="Loading your referrals..." success />
            ) : leads.length ? (
              <div className="space-y-3">
                {leads.map((lead) => (
                  <div
                    key={lead.id}
                    className="rounded-[1.6rem] border border-slate-200 bg-white/72 p-5 shadow-[0_16px_40px_rgba(70,98,167,0.08)]"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                          {lead.business_name}
                        </h3>
                        <p className="text-sm text-slate-500">{lead.contact_name}</p>
                        <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-2">
                            <Mail className="h-4 w-4 text-blue-600" />
                            {lead.contact_info?.email || 'No email listed'}
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <Phone className="h-4 w-4 text-blue-600" />
                            {lead.contact_info?.phone || 'No phone listed'}
                          </span>
                        </div>
                        {lead.notes ? (
                          <p className="mt-4 text-sm leading-6 text-slate-600">{lead.notes}</p>
                        ) : null}
                      </div>
                      <StatusBadge status={lead.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nothing here yet"
                body="When one of your referrals comes in, it will show up here automatically."
              />
            )}

            {message ? (
              <div className="mt-4">
                <InlineStatus message={message} />
              </div>
            ) : null}
          </div>

          <div className="panel rounded-[2rem] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">Share copy</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              Ready-to-send ideas
            </h2>
            <div className="mt-5 space-y-4">
              {marketingResources.map((resource) => (
                <ResourceCard key={resource.title} title={resource.title} copy={resource.copy} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function PartnerOnlyState() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="panel max-w-lg rounded-[2rem] p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-blue-600" />
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
          This page is for affiliates only
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Internal team access will live on a separate page. Use the affiliate portal only for partner sign-in.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Back to affiliate sign-in
        </Link>
      </div>
    </main>
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
    <article className="rounded-[1.6rem] border border-slate-200 bg-white/72 p-5 shadow-[0_14px_35px_rgba(70,98,167,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <h3 className="text-xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h3>
        <button
          type="button"
          onClick={() => void copyText()}
          className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:border-sky-300 hover:bg-white"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-600">{copy}</p>
    </article>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm text-slate-600">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[1.15rem] border border-slate-200 bg-white/88 px-4 py-3.5 text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel rounded-[1.75rem] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</p>
      <p className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-slate-950">{value}</p>
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
    <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
      {labels[status]}
    </span>
  );
}

function InlineStatus({ message, success = false }: { message: string; success?: boolean }) {
  return (
    <div
      className={`flex items-start gap-3 rounded-[1.15rem] border px-4 py-3 text-sm ${
        success
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}
    >
      {success ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <AlertCircle className="mt-0.5 h-4 w-4" />}
      <span>{message}</span>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[1.8rem] border border-dashed border-slate-200 bg-white/65 p-8 text-center">
      <h3 className="text-3xl font-semibold tracking-[-0.04em] text-slate-950">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
    </div>
  );
}

function FullScreenState({
  icon: Icon,
  message,
  accent = 'blue',
  spin = false,
}: {
  icon: typeof LoaderCircle;
  message: string;
  accent?: 'blue' | 'warn';
  spin?: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="panel max-w-lg rounded-[2rem] p-8 text-center">
        <Icon className={`mx-auto h-8 w-8 ${spin ? 'animate-spin' : ''} ${accent === 'warn' ? 'text-amber-500' : 'text-blue-600'}`} />
        <p className="mt-4 text-sm leading-6 text-slate-600">{message}</p>
      </div>
    </main>
  );
}

export default App;
