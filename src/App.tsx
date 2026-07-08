import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
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
  ShieldCheck,
  UserRoundPlus,
  Wallet,
} from 'lucide-react';
import { z } from 'zod';
import { featureCards, leadStatuses, marketingResources } from './lib/constants';
import { getDueMilestones, getLeadStatusLabel, normalizeLeadStage, summarizePayouts } from './lib/payouts';
import { supabase, supabaseConfigError } from './lib/supabase';
import type { AffiliateInvite, Lead, LeadStatus, Profile } from './lib/types';
import excaliburLogo from './assets/excalibur-logo.png';

const signInSchema = z.object({
  email: z.string().email('Use a valid email address.'),
  password: z.string().min(8, 'Enter a password with at least 8 characters.'),
});

const verifySchema = z.object({
  email: z.string().email('Use a valid email address.'),
  accessCode: z.string().min(6, 'Enter the code you were given.'),
});

const inviteSchema = z.object({
  name: z.string().min(2, 'Enter a name.'),
  email: z.string().email('Use a valid email address.'),
  phone: z.string().optional(),
  referralCode: z.string().optional(),
  accessCode: z.string().optional(),
});

const leadFormSchema = z.object({
  businessName: z.string().min(2, 'Enter the business name.'),
  contactName: z.string().min(2, 'Enter the contact name.'),
  email: z.string().email('Use a valid email address.'),
  phone: z.string().min(7, 'Enter a valid phone number.'),
  referralCode: z.string().optional(),
  notes: z.string().optional(),
  website: z.string().max(0, 'Leave this field blank.'),
});

const profileSchema = z.object({
  id: z.string(),
  role: z.enum(['affiliate', 'admin']),
  is_admin: z.boolean(),
  is_active: z.boolean(),
  name: z.string(),
  referral_code: z.string().nullable(),
  contact_info: z.record(z.string(), z.any()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const leadSelect =
  'id,business_name,contact_name,contact_info,notes,affiliate_id,submitted_referral_code,status,submitted_at,closed_at,payout_timeline_days,tier_1_due_at,tier_1_paid_at,tier_2_due_at,tier_2_paid_at,updated_at';

const profileSelect =
  'id,role,is_admin,is_active,name,referral_code,contact_info,created_at,updated_at';

const inviteSelect =
  'id,email,name,phone,referral_code,access_code,invited_by,activation_issued_at,accepted_at,created_at,updated_at';

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
        .select(profileSelect)
        .eq('id', userId)
        .single();

      if (!active) return;

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
      <Route
        path="/dashboard"
        element={
          session && profile?.role === 'affiliate' ? (
            <AffiliateDashboard profile={profile} />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="/admin" element={<AdminPortalPage session={session} profile={profile} />} />
      <Route path="/admin.html" element={<AdminPortalPage session={session} profile={profile} />} />
      <Route path="/auth" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function BrandLockup({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={excaliburLogo}
        alt="Excalibur"
        className="h-11 w-auto rounded-xl object-contain sm:h-12"
      />
      <div>
        <p className="text-lg font-semibold tracking-[-0.03em] text-slate-950">Excalibur</p>
        <p className="text-[11px] uppercase tracking-[0.32em] text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function LeadIntakePage() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    businessName: '',
    contactName: '',
    email: '',
    phone: '',
    referralCode: (searchParams.get('ref') || searchParams.get('code') || '').toUpperCase(),
    notes: '',
    website: '',
  });

  useEffect(() => {
    const queryCode = (searchParams.get('ref') || searchParams.get('code') || '').toUpperCase();
    if (queryCode) {
      setForm((current) => ({ ...current, referralCode: queryCode }));
    }
  }, [searchParams]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);

    const lastSubmission = Number(window.localStorage.getItem('excalibur_lead_form_last_submission') || '0');
    if (Date.now() - lastSubmission < 60_000) {
      setMessage('Please wait a minute before sending another request.');
      return;
    }

    setLoading(true);

    try {
      const parsed = leadFormSchema.parse(form);

      const { error } = await supabase!.from('leads').insert({
        business_name: parsed.businessName,
        contact_name: parsed.contactName,
        contact_info: {
          email: parsed.email,
          phone: parsed.phone,
        },
        notes: parsed.notes || null,
        submitted_referral_code: parsed.referralCode || null,
      });

      if (error) throw error;

      window.localStorage.setItem('excalibur_lead_form_last_submission', String(Date.now()));
      setSubmitted(true);
      setForm({
        businessName: '',
        contactName: '',
        email: '',
        phone: '',
        referralCode: parsed.referralCode || '',
        notes: '',
        website: '',
      });
      setMessage('Your request was received. Excalibur will follow up soon.');
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'We could not send your request.');
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

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col gap-8">
        <nav className="panel flex items-center justify-between rounded-full px-5 py-3">
          <BrandLockup subtitle="Interest Form" />
          <span className="rounded-full border border-sky-200 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-600">
            Direct inquiries
          </span>
        </nav>

        <section className="grid items-stretch gap-6 lg:grid-cols-[1.05fr,0.95fr]">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-gradient-to-br from-white via-sky-50 to-blue-100/80 p-8 shadow-[0_30px_90px_rgba(68,100,180,0.16)] sm:p-12">
            <div className="absolute right-[-4rem] top-[-2rem] h-64 w-64 rounded-full bg-blue-500/15 blur-3xl" />
            <div className="absolute bottom-[-4rem] left-[-3rem] h-56 w-56 rounded-full bg-cyan-300/20 blur-3xl" />
            <div className="relative flex h-full flex-col justify-between gap-10">
              <div className="max-w-3xl">
                <span className="inline-flex rounded-full border border-sky-200 bg-white/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-600">
                  Tell us what you need
                </span>
                <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[0.93] tracking-[-0.05em] text-slate-950 sm:text-7xl">
                  Start the conversation with Excalibur.
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                  Share your business details and a short note about what you are looking for. If an affiliate sent you here, their code can be included automatically or added below.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <FeaturePill icon={Mail} title="Fast follow-up" body="Your request lands directly in the shared Excalibur pipeline." />
                <FeaturePill icon={ShieldCheck} title="Referral-safe" body="Affiliate codes are attached to the lead during submission." />
                <FeaturePill icon={ArrowRight} title="Simple next step" body="One clean form, then your team can take it from there." />
              </div>
            </div>
          </div>

          <section className="panel rounded-[2rem] p-6 sm:p-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">Get in touch</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950">
                Business interest form
              </h2>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Fill this out once and your request will be logged for review.
              </p>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
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
                label="Referral code (optional)"
                value={form.referralCode}
                onChange={(value) => setForm((current) => ({ ...current, referralCode: value.toUpperCase() }))}
              />
              <label className="block text-sm text-slate-600">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                  Notes
                </span>
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  rows={5}
                  className="w-full rounded-[1.15rem] border border-slate-200 bg-white/88 px-4 py-3.5 text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(event) => setForm((current) => ({ ...current, website: event.target.value }))}
                className="hidden"
                aria-hidden="true"
              />

              <button
                type="submit"
                disabled={loading || submitted}
                className="flex w-full items-center justify-center gap-2 rounded-[1.35rem] bg-slate-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {submitted ? 'Request sent' : 'Send interest form'}
              </button>

              {message ? (
                <InlineStatus
                  message={message}
                  success={message.includes('received') || message.includes('sent')}
                />
              ) : null}
            </form>
          </section>
        </section>
      </div>
    </main>
  );
}

function AffiliatePortalPage({
  session,
  profile,
}: {
  session: Session | null;
  profile: Profile | null;
}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'verify' | 'magic'>('signin');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    accessCode: '',
  });
  const [verifiedInvite, setVerifiedInvite] = useState<{
    inviteName: string;
    referralCode: string | null;
    activationNonce: string;
  } | null>(null);

  useEffect(() => {
    if (session && profile?.role === 'affiliate') {
      navigate('/dashboard', { replace: true });
    }

    if (session && profile?.role === 'admin') {
      navigate('/admin.html', { replace: true });
    }
  }, [navigate, profile, session]);

  useEffect(() => {
    setMessage(null);
    setVerifiedInvite(null);
    setForm((current) => ({
      ...current,
      password: '',
      confirmPassword: '',
      accessCode: '',
    }));
  }, [mode]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        const parsed = signInSchema.parse({ email: form.email, password: form.password });
        const { error } = await supabase!.auth.signInWithPassword(parsed);
        if (error) throw error;
      }

      if (mode === 'verify') {
        if (!verifiedInvite) {
          const parsed = verifySchema.parse({ email: form.email, accessCode: form.accessCode });
          const { data, error } = await supabase!.rpc('verify_affiliate_access', {
            email_input: parsed.email,
            access_code_input: parsed.accessCode,
          });

          if (error) throw error;

          const result = Array.isArray(data) ? data[0] : data;
          if (!result?.activation_nonce) {
            throw new Error('We could not verify that code. Try again.');
          }

          setVerifiedInvite({
            inviteName: result.invite_name,
            referralCode: result.referral_code ?? null,
            activationNonce: result.activation_nonce,
          });
          setMessage('Code verified. Choose your password to finish setting up your access.');
        } else {
          const parsed = signInSchema.parse({ email: form.email, password: form.password });

          if (form.password !== form.confirmPassword) {
            throw new Error('Your passwords do not match.');
          }

          const { error } = await supabase!.auth.signUp({
            email: parsed.email,
            password: parsed.password,
            options: {
              data: {
                activation_nonce: verifiedInvite.activationNonce,
              },
            },
          });

          if (error) throw error;

          setMessage(
            'Your account is almost ready. Check your inbox and verify your email before trying to sign in with your new password.',
          );
          setMode('signin');
        }
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
      setMessage(caught instanceof Error ? caught.message : 'We could not complete that request.');
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
          <BrandLockup subtitle="Affiliate Portal" />
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
                  Check your referrals, client progress, and payout timing in one place.
                </h1>
                <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                  If you have been approved as an Excalibur affiliate, use the unique access code you were given to set up your account. After that, you can come back anytime to track your referrals.
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
                Affiliate access
              </h2>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                Returning partners can sign in normally. First-time partners should verify their unique code before creating a password.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-2 rounded-3xl bg-slate-100/80 p-1.5">
              {[
                ['signin', 'Sign in'],
                ['verify', 'Verify code'],
                ['magic', 'Email link'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value as 'signin' | 'verify' | 'magic')}
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
                disabled={Boolean(verifiedInvite)}
              />

              {mode === 'signin' ? (
                <FormInput
                  label="Password"
                  type="password"
                  value={form.password}
                  onChange={(value) => setForm((current) => ({ ...current, password: value }))}
                />
              ) : null}

              {mode === 'verify' && !verifiedInvite ? (
                <FormInput
                  label="Unique access code"
                  value={form.accessCode}
                  onChange={(value) => setForm((current) => ({ ...current, accessCode: value.toUpperCase() }))}
                />
              ) : null}

              {mode === 'verify' && verifiedInvite ? (
                <>
                  <div className="rounded-[1.4rem] border border-sky-100 bg-white/70 p-4 text-sm text-slate-600">
                    <p className="font-semibold text-slate-900">{verifiedInvite.inviteName}</p>
                    <p className="mt-1">Referral code: {verifiedInvite.referralCode ?? 'Assigned on setup'}</p>
                  </div>
                  <FormInput
                    label="Create password"
                    type="password"
                    value={form.password}
                    onChange={(value) => setForm((current) => ({ ...current, password: value }))}
                  />
                  <FormInput
                    label="Confirm password"
                    type="password"
                    value={form.confirmPassword}
                    onChange={(value) => setForm((current) => ({ ...current, confirmPassword: value }))}
                  />
                </>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-[1.35rem] bg-slate-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {mode === 'signin'
                  ? 'Open my portal'
                  : mode === 'verify'
                    ? verifiedInvite
                      ? 'Create my account'
                      : 'Verify my code'
                    : 'Send my sign-in link'}
              </button>

              {message ? (
                <InlineStatus
                  message={message}
                  success={message.includes('ready') || message.includes('verified') || message.includes('way')}
                />
              ) : null}
            </form>

            <div className="mt-8 rounded-[1.6rem] border border-sky-100 bg-white/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Need help?</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                If your code is not working, contact your Excalibur point of contact so they can confirm your affiliate setup from the admin portal.
              </p>
            </div>
          </section>
        </section>

        <AffiliateAgreementFooter />
      </div>
    </main>
  );
}

function AffiliateAgreementFooter() {
  return (
    <footer className="panel rounded-[2rem] p-6 sm:p-8">
      <div className="max-w-5xl">
        <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">Affiliate agreement</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
          Registering for and participating in this portal constitutes acceptance of the agreement below.
        </h2>

        <article className="mt-6 rounded-[1.75rem] border border-white/70 bg-white/72 p-6 shadow-[0_16px_40px_rgba(70,98,167,0.08)]">
          <div className="border-b border-slate-200 pb-5">
            <p className="text-center text-2xl font-semibold tracking-[-0.04em] text-slate-950">EXCALIBUR</p>
            <h3 className="mt-2 text-center text-xl font-semibold text-slate-900">
              Referral &amp; Affiliate Partner Agreement
            </h3>
            <p className="mt-3 text-center text-sm leading-6 text-slate-600">
              <span className="font-semibold text-slate-700">Legal Jurisdiction:</span> United States (California)
              {' | '}
              <span className="font-semibold text-slate-700">Governing Law:</span> State of California, without
              regard to conflict-of-laws principles
            </p>
          </div>

          <div className="mt-6 space-y-6 text-sm leading-7 text-slate-700">
            <AgreementSection
              title="1. Purpose"
              body={'This Agreement is between Soham Jani, an individual doing business as Excalibur ("Company"), and the Partner. It sets the terms under which Company compensates an individual or business ("Partner") for referring new clients. It governs qualification, payout, and program conduct. It is not an employment, agency, or exclusivity agreement.'}
            />

            <AgreementSection title="2. Qualifying Referral">
              <p>
                A referral qualifies for compensation only if all of the following are true:
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5">
                <li>
                  The Partner submits the lead&apos;s name and contact information through Excalibur&apos;s official
                  referral form prior to any contact between Excalibur and the business.
                </li>
                <li>
                  Excalibur had no prior contact, ongoing conversation, or existing relationship with the referred
                  business at the time of submission.
                </li>
                <li>
                  The referred business subsequently signs an agreement with Excalibur and becomes an active, paying
                  client.
                </li>
              </ul>
              <p className="mt-3">
                Introductions, leads, or names that do not result in a signed, paying client earn no compensation. A
                referral submitted for a business Excalibur is already in contact with does not qualify, regardless of
                submission order.
              </p>
            </AgreementSection>

            <AgreementSection title="3. Payout Structure">
              <div className="overflow-x-auto">
                <table className="mt-3 w-full min-w-[640px] border-collapse overflow-hidden rounded-[1.2rem] border border-slate-200 text-left">
                  <thead className="bg-slate-100/80 text-slate-900">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Milestone</th>
                      <th className="px-4 py-3 font-semibold">Amount</th>
                      <th className="px-4 py-3 font-semibold">Trigger</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-200">
                      <td className="px-4 py-3 font-medium">Tier 1</td>
                      <td className="px-4 py-3">$200</td>
                      <td className="px-4 py-3">
                        Referred client is active and paying for 30 consecutive days (project-fee + retainer clients)
                        or 60 consecutive days (retainer-only clients, no project fee).
                      </td>
                    </tr>
                    <tr className="border-t border-slate-200">
                      <td className="px-4 py-3 font-medium">Tier 2</td>
                      <td className="px-4 py-3">$200</td>
                      <td className="px-4 py-3">
                        The referred client is active and paying for 6 consecutive months. Applies only to clients on
                        an ongoing retainer.
                      </td>
                    </tr>
                    <tr className="border-t border-slate-200 bg-slate-50/80">
                      <td className="px-4 py-3 font-semibold">Maximum Total</td>
                      <td className="px-4 py-3 font-semibold">$400</td>
                      <td className="px-4 py-3 font-semibold">
                        Per successfully referred, paying client. One-time project-only clients (no retainer) cap at
                        Tier 1 ($200 total).
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </AgreementSection>

            <AgreementSection
              title={'4. Definition of "Active, Paying"'}
              body={'A client is considered "active and paying" for a given period only if payment for that period was successfully collected by Excalibur and no refund or chargeback was issued for that payment. A milestone is triggered only if the client meets this standard on the milestone date itself. If a client has canceled, defaulted, or received a refund prior to a milestone date, that milestone is not triggered and no payment is owed for it.'}
            />
            <AgreementSection
              title="5. Earned Payments; No Clawback"
              body="Once a milestone under Section 3 is triggered and paid, that payment is fully earned and belongs to the Partner permanently. Excalibur will not reclaim, offset, or deduct any previously paid milestone amount, regardless of subsequent events including client cancellation, non-payment, dispute, or termination of this Agreement. This protection applies only to milestones already triggered as of the date of any relevant event; it does not create an entitlement to future, untriggered milestones."
            />
            <AgreementSection
              title="6. Payment Method, Timing, and Tax Reporting"
              body="All payments are issued via Stripe to the Partner's designated account. Excalibur will process payment within a commercially reasonable time after a milestone is confirmed, generally within 5 to 10 business days. Before any payment is issued, the Partner must submit a completed Form W-9 (or Form W-8BEN for non-U.S. persons) to Excalibur. Excalibur may withhold payment until a valid form is on file. The Partner is responsible for the accuracy of their payment and tax information and for all tax reporting obligations arising from payments received. Excalibur will issue Form 1099-NEC (or applicable equivalent) as required by law."
            />

            <AgreementSection title="7. Program Conduct">
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  Partners may not represent themselves as employees, agents, or official representatives of
                  Excalibur.
                </li>
                <li>
                  Partners may not make guarantees, promises, or claims about Excalibur&apos;s services, pricing, or
                  results beyond what Excalibur has published.
                </li>
                <li>
                  Partners may not submit fabricated, duplicate, or self-referred leads. Excalibur may deny or reverse
                  credit for any referral it determines, in good faith, to be fraudulent, spam, or made in bad faith
                  prior to any payment being triggered.
                </li>
                <li>
                  This Agreement does not create exclusivity in either direction. The Partner may refer through other
                  channels or programs, and Excalibur may run other referral or marketing arrangements concurrently.
                </li>
              </ul>
            </AgreementSection>

            <AgreementSection
              title="8. Non-Solicitation"
              body="For 12 months following the date a Partner is credited with a qualifying referral under Section 2, the Partner may not directly or indirectly solicit that referred client to terminate, reduce, or divert its business relationship with Excalibur, or to engage the Partner or any third party for services competitive with those Excalibur provides that client. This restriction applies only to clients referred under this Agreement and does not restrict the Partner's other business activity."
            />
            <AgreementSection
              title="9. Confidentiality"
              body={`Through participation in this program, the Partner may learn non-public information about Excalibur's clients, pricing, methods, or business operations ("Confidential Information"). The Partner agrees to use Confidential Information only as needed to participate in the referral program and not to disclose it to any third party, both during the term of this Agreement and after its termination. This obligation does not apply to information that is publicly available through no fault of the Partner or that the Partner is required to disclose by law.`}
            />
            <AgreementSection
              title="10. Independent Parties"
              body="The Partner is an independent third party, not an employee, joint venturer, or partner in the legal sense. Nothing in this Agreement creates an employment, agency, or fiduciary relationship between the Partner and Excalibur."
            />
            <AgreementSection
              title="11. Limitation of Liability"
              body="Excalibur's total aggregate liability to the Partner under this Agreement, for any claim arising out of or related to this Agreement, is limited to the total commissions actually paid to that Partner under this Agreement. In no event will Excalibur be liable for indirect, incidental, consequential, or punitive damages."
            />
            <AgreementSection
              title="12. Term and Termination"
              body="This Agreement remains in effect until terminated by either party with written notice delivered by email to the address on file (or, for Excalibur, to the Partner's registered email; for the Partner, to partners@excal.org) or by other written means acknowledged by both parties. Termination ends the Partner's ability to submit new qualifying referrals going forward. Termination does not affect milestones already triggered and owed as of the termination date, nor does it accelerate or forfeit milestones tied to referrals already submitted and pending as of that date, which remain governed by Sections 2 through 6. Sections 5, 6, 8, 9, 11, and 13 survive termination."
            />
            <AgreementSection
              title="13. Dispute Resolution"
              body="Any dispute arising out of or relating to this Agreement will be resolved by final and binding arbitration administered under the American Arbitration Association's Commercial Arbitration Rules, conducted by a single arbitrator in California (or remotely, by mutual agreement). Judgment on the arbitration award may be entered in any court of competent jurisdiction. Each party bears its own costs and fees unless the arbitrator determines otherwise. This clause does not prevent either party from seeking injunctive relief in court for breach of Section 9 (Confidentiality)."
            />
            <AgreementSection
              title="14. Changes to Program Terms"
              body="Excalibur may update payout amounts, milestone structures, or program terms for referrals submitted after the effective date of any change. Changes will not retroactively reduce compensation already earned or reduce the terms applicable to referrals submitted before the change took effect."
            />
            <AgreementSection
              title="15. Assignment"
              body="The Partner may not assign or transfer this Agreement or any rights under it without Excalibur's prior written consent. Excalibur may assign this Agreement in connection with a merger, acquisition, or sale of substantially all of its assets."
            />
            <AgreementSection
              title="16. Severability"
              body="If any provision of this Agreement is found unenforceable, that provision will be limited or removed to the minimum extent necessary, and the remaining provisions will remain in full force and effect."
            />
            <AgreementSection
              title="17. Electronic Signature and Acceptance"
              body={'This Agreement may be accepted electronically, including by clicking "I Agree," submitting the affiliate portal signup form, or providing an electronic signature. Electronic acceptance has the same legal effect as a handwritten signature.'}
            />
            <AgreementSection
              title="18. Business Structure"
              body={'Company is operated by Soham Jani as a sole proprietorship; it is not a registered corporation, limited liability company, or other separate legal entity. All rights, obligations, and liabilities of "Company" under this Agreement belong to Soham Jani individually, subject to the limitation of liability in Section 11.'}
            />
            <AgreementSection
              title="19. Entire Agreement"
              body="This document, together with the current published Referral Program brochure, represents the entire agreement between the Partner and Excalibur regarding the referral program and supersedes any prior verbal or written understanding on this subject."
            />
          </div>
        </article>
      </div>
    </footer>
  );
}

function AgreementSection({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="text-base font-semibold text-slate-950">{title}</h4>
      {body ? <p className="mt-2">{body}</p> : null}
      {children ? <div className="mt-2">{children}</div> : null}
    </section>
  );
}

function AffiliateDashboard({ profile }: { profile: Profile }) {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const payoutSummary = useMemo(() => summarizePayouts(leads), [leads]);
  const personalizedFormLink = profile.referral_code
    ? `https://sohamtjani.github.io/excalibur-lead-form/?ref=${encodeURIComponent(profile.referral_code)}`
    : 'https://sohamtjani.github.io/excalibur-lead-form/';

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
                This is your live view of incoming referrals, client progress, and payouts already sent.
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
          <StatCard label="Clients closed" value={String(payoutSummary.closedClients)} />
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
                        <p className="mt-4 text-sm leading-6 text-slate-600">
                          {buildAffiliateLeadSummary(lead)}
                        </p>
                        {lead.notes ? <p className="mt-3 text-sm leading-6 text-slate-500">{lead.notes}</p> : null}
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

          <div className="space-y-6">
            <div className="panel rounded-[2rem] p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">Your form link</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                Share your tracked page
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Anyone who uses this link will land on your personal interest form with your code already attached.
              </p>
              <div className="mt-5 rounded-[1.4rem] border border-slate-200 bg-white/72 p-4">
                <p className="break-all text-sm leading-6 text-slate-700">{personalizedFormLink}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <CopyButton label="Copy my form link" value={personalizedFormLink} />
                <a
                  href={personalizedFormLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  <ArrowRight className="h-4 w-4" />
                  Open form
                </a>
              </div>
            </div>

            <div className="panel rounded-[2rem] p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">Payouts</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                What has been paid
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <MiniStat label="Milestones paid" value={String(payoutSummary.milestonesPaid)} />
                <MiniStat label="Still pending" value={String(payoutSummary.pendingMilestones)} />
              </div>
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
          </div>
        </section>
      </div>
    </main>
  );
}

function AdminPortalPage({
  session,
  profile,
}: {
  session: Session | null;
  profile: Profile | null;
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session && profile?.role === 'affiliate') {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate, profile, session]);

  if (session && profile?.role === 'admin') {
    return <AdminDashboard profile={profile} />;
  }

  if (session && profile?.role !== 'admin') {
    return (
      <FullScreenState
        icon={ShieldCheck}
        message="This page is reserved for Excalibur admin access."
        accent="warn"
      />
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 text-slate-950 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[10%] top-[-6rem] h-96 w-96 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute right-[6%] top-[18%] h-80 w-80 rounded-full bg-cyan-300/20 blur-3xl" />
      </div>

      <div className="relative mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl gap-6 lg:grid-cols-[1fr,420px]">
        <section className="panel rounded-[2rem] p-8 sm:p-10">
          <div className="max-w-3xl">
            <span className="inline-flex rounded-full border border-sky-200 bg-white/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-slate-600">
              Internal admin
            </span>
            <h1 className="mt-6 text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-slate-950 sm:text-6xl">
              Manage affiliates, client progress, and payout reminders from one control room.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
              This page is for your side only. Create unique access codes, watch the lead pipeline, and handle payout milestones when they come due.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <FeaturePill icon={UserRoundPlus} title="Create affiliate access" body="Set up each partner before they ever create a password." />
            <FeaturePill icon={ShieldCheck} title="Track real client status" body="Move leads forward and start payout timing the moment a deal is closed." />
            <FeaturePill icon={Wallet} title="Catch due payouts" body="See every 30-day and 6-month payout reminder in one view." />
          </div>
        </section>

        <section className="panel flex flex-col justify-center rounded-[2rem] p-6 sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">Admin sign-in</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-[-0.04em] text-slate-950">
            Open your control room
          </h2>

          <form
            className="mt-6 space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setMessage(null);
              setLoading(true);

              try {
                const parsed = signInSchema.parse(form);
                const { error } = await supabase!.auth.signInWithPassword(parsed);
                if (error) throw error;
              } catch (caught) {
                setMessage(caught instanceof Error ? caught.message : 'We could not sign you in.');
              } finally {
                setLoading(false);
              }
            }}
          >
            <FormInput
              label="Email address"
              type="email"
              value={form.email}
              onChange={(value) => setForm((current) => ({ ...current, email: value }))}
            />
            <FormInput
              label="Password"
              type="password"
              value={form.password}
              onChange={(value) => setForm((current) => ({ ...current, password: value }))}
            />

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-[1.35rem] bg-slate-950 px-5 py-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Open admin portal
            </button>

            {message ? <InlineStatus message={message} /> : null}
          </form>
        </section>
      </div>
    </main>
  );
}

function AdminDashboard({ profile }: { profile: Profile }) {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [invites, setInvites] = useState<AffiliateInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    phone: '',
    referralCode: generateCode(8),
    accessCode: generateCode(10),
  });

  const affiliates = useMemo(
    () => profiles.filter((entry) => entry.role === 'affiliate').sort((a, b) => a.name.localeCompare(b.name)),
    [profiles],
  );
  const dueMilestones = useMemo(() => getDueMilestones(leads).sort((a, b) => a.dueAt.localeCompare(b.dueAt)), [leads]);
  const affiliateMap = useMemo(() => new Map(affiliates.map((entry) => [entry.id, entry])), [affiliates]);

  useEffect(() => {
    void loadAdminData();
  }, []);

  async function loadAdminData() {
    setLoading(true);
    setMessage(null);

    const [leadResult, profileResult, inviteResult] = await Promise.all([
      supabase!.from('leads').select(leadSelect).order('submitted_at', { ascending: false }),
      supabase!.from('profiles').select(profileSelect).order('created_at', { ascending: true }),
      supabase!.from('affiliate_invites').select(inviteSelect).order('created_at', { ascending: false }),
    ]);

    if (leadResult.error || profileResult.error || inviteResult.error) {
      setMessage(leadResult.error?.message || profileResult.error?.message || inviteResult.error?.message || 'Unable to load admin data.');
    } else {
      setLeads((leadResult.data as Lead[]) ?? []);
      setProfiles((profileResult.data as Profile[]) ?? []);
      setInvites((inviteResult.data as AffiliateInvite[]) ?? []);
    }

    setLoading(false);
  }

  async function createInvite(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setBusyKey('create-invite');

    try {
      const parsed = inviteSchema.parse(inviteForm);
      const { error } = await supabase!.from('affiliate_invites').insert({
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone || null,
        referral_code: parsed.referralCode || null,
        access_code: parsed.accessCode || null,
        invited_by: profile.id,
      });

      if (error) throw error;

      setInviteForm({
        name: '',
        email: '',
        phone: '',
        referralCode: generateCode(8),
        accessCode: generateCode(10),
      });
      setMessage('Affiliate access created.');
      await loadAdminData();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'We could not create that affiliate access.');
    } finally {
      setBusyKey(null);
    }
  }

  async function updateLead(leadId: string, patch: Partial<Lead>) {
    setMessage(null);
    setBusyKey(`lead-${leadId}`);

    const { error } = await supabase!.from('leads').update(patch).eq('id', leadId);

    if (error) {
      setMessage(error.message);
    } else {
      await loadAdminData();
    }

    setBusyKey(null);
  }

  async function toggleAffiliate(profileId: string, isActive: boolean) {
    setMessage(null);
    setBusyKey(`affiliate-${profileId}`);

    const { error } = await supabase!.from('profiles').update({ is_active: !isActive }).eq('id', profileId);

    if (error) {
      setMessage(error.message);
    } else {
      await loadAdminData();
    }

    setBusyKey(null);
  }

  async function deleteInvite(inviteId: string) {
    if (!window.confirm('Delete this pending affiliate setup?')) return;

    setMessage(null);
    setBusyKey(`invite-${inviteId}`);
    const { error } = await supabase!.from('affiliate_invites').delete().eq('id', inviteId);

    if (error) {
      setMessage(error.message);
    } else {
      await loadAdminData();
    }

    setBusyKey(null);
  }

  async function deleteLead(leadId: string) {
    if (!window.confirm('Delete this lead?')) return;

    setMessage(null);
    setBusyKey(`delete-lead-${leadId}`);
    const { error } = await supabase!.from('leads').delete().eq('id', leadId);

    if (error) {
      setMessage(error.message);
    } else {
      await loadAdminData();
    }

    setBusyKey(null);
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-5rem] h-80 w-80 rounded-full bg-cyan-300/35 blur-3xl" />
        <div className="absolute right-[-10rem] top-[8%] h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl space-y-6">
        <header className="panel rounded-[2rem] px-6 py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">Admin portal</p>
              <h1 className="mt-3 text-5xl font-semibold tracking-[-0.05em] text-slate-950">
                Excalibur control room
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
                Create affiliate access, manage the client pipeline, and catch payout reminders before anything slips.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to="/"
                className="rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Affiliate portal
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await supabase!.auth.signOut();
                  navigate('/admin.html', { replace: true });
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
          <StatCard label="Active affiliates" value={String(affiliates.filter((entry) => entry.is_active).length)} />
          <StatCard label="Pending setups" value={String(invites.filter((entry) => !entry.accepted_at).length)} />
          <StatCard label="Leads in system" value={String(leads.length)} />
          <StatCard label="Payout alerts" value={String(dueMilestones.length)} />
        </div>

        {message ? <InlineStatus message={message} success={message.includes('created')} /> : null}

        <section className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
          <div className="panel rounded-[2rem] p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">Payout reminders</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
                  What needs attention now
                </h2>
              </div>
              <button
                type="button"
                onClick={() => void loadAdminData()}
                className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Refresh
              </button>
            </div>

            {loading ? (
              <InlineStatus message="Loading your admin data..." success />
            ) : dueMilestones.length ? (
              <div className="space-y-3">
                {dueMilestones.map((item) => {
                  const lead = leads.find((entry) => entry.id === item.leadId);
                  if (!lead) return null;
                  const affiliate = lead.affiliate_id ? affiliateMap.get(lead.affiliate_id) : null;

                  return (
                    <div
                      key={`${item.leadId}-${item.tier}`}
                      className="rounded-[1.5rem] border border-amber-200 bg-amber-50/80 p-5"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
                            Tier {item.tier} payout due
                          </p>
                          <h3 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                            {lead.business_name}
                          </h3>
                          <p className="mt-2 text-sm text-slate-600">
                            Affiliate: {affiliate?.name || 'Unassigned'} • Amount: ${item.amount} • Due {formatDate(item.dueAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void updateLead(lead.id, {
                              [item.tier === 1 ? 'tier_1_paid_at' : 'tier_2_paid_at']: new Date().toISOString(),
                            } as Partial<Lead>)
                          }
                          disabled={busyKey === `lead-${lead.id}`}
                          className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white"
                        >
                          Mark paid
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No payout reminders right now" body="As 30-day and 6-month milestones come due, they will appear here automatically." />
            )}
          </div>

          <div className="panel rounded-[2rem] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">Create affiliate</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              Issue a new access code
            </h2>

            <form className="mt-5 space-y-4" onSubmit={createInvite}>
              <FormInput
                label="Affiliate name"
                value={inviteForm.name}
                onChange={(value) => setInviteForm((current) => ({ ...current, name: value }))}
              />
              <FormInput
                label="Email address"
                type="email"
                value={inviteForm.email}
                onChange={(value) => setInviteForm((current) => ({ ...current, email: value }))}
              />
              <FormInput
                label="Phone"
                value={inviteForm.phone}
                onChange={(value) => setInviteForm((current) => ({ ...current, phone: value }))}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <FormInput
                  label="Referral code"
                  value={inviteForm.referralCode}
                  onChange={(value) => setInviteForm((current) => ({ ...current, referralCode: value.toUpperCase() }))}
                />
                <FormInput
                  label="Access code"
                  value={inviteForm.accessCode}
                  onChange={(value) => setInviteForm((current) => ({ ...current, accessCode: value.toUpperCase() }))}
                />
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setInviteForm((current) => ({
                      ...current,
                      referralCode: generateCode(8),
                      accessCode: generateCode(10),
                    }))
                  }
                  className="rounded-full border border-slate-200 bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700"
                >
                  Generate fresh codes
                </button>
                <button
                  type="submit"
                  disabled={busyKey === 'create-invite'}
                  className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Save affiliate setup
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr,1fr]">
          <div className="panel rounded-[2rem] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">Affiliate roster</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              Pending and active partners
            </h2>

            <div className="mt-5 space-y-3">
              {invites.length ? (
                invites.map((invite) => (
                  <div key={invite.id} className="rounded-[1.5rem] border border-slate-200 bg-white/72 p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <h3 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">{invite.name}</h3>
                        <p className="mt-2 text-sm text-slate-600">
                          {invite.email} {invite.phone ? `• ${invite.phone}` : ''}
                        </p>
                        <p className="mt-3 text-sm text-slate-500">
                          Referral code: {invite.referral_code ?? 'Pending'} • Access code: {invite.access_code}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          {invite.accepted_at
                            ? `Account created ${formatDate(invite.accepted_at)}`
                            : 'Account not created yet'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <CopyButton label="Copy access code" value={invite.access_code} />
                        {!invite.accepted_at ? (
                          <button
                            type="button"
                            onClick={() => void deleteInvite(invite.id)}
                            disabled={busyKey === `invite-${invite.id}`}
                            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="No affiliates yet" body="Create an affiliate setup above to issue the first access code." />
              )}
            </div>

            <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-white/72 p-5">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Active accounts</p>
              <div className="mt-4 space-y-3">
                {affiliates.length ? (
                  affiliates.map((affiliate) => (
                    <div key={affiliate.id} className="flex flex-col gap-3 rounded-[1.2rem] border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-lg font-semibold text-slate-950">{affiliate.name}</p>
                        <p className="text-sm text-slate-500">
                          Code: {affiliate.referral_code ?? 'Pending'} • {affiliate.is_active ? 'Active' : 'Inactive'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void toggleAffiliate(affiliate.id, affiliate.is_active)}
                        disabled={busyKey === `affiliate-${affiliate.id}`}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                      >
                        {affiliate.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No affiliate accounts have been activated yet.</p>
                )}
              </div>
            </div>
          </div>

          <div className="panel rounded-[2rem] p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.26em] text-slate-500">Lead pipeline</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">
              Review and update referrals
            </h2>

            <div className="mt-5 space-y-4">
              {leads.length ? (
                leads.map((lead) => {
                  const affiliate = lead.affiliate_id ? affiliateMap.get(lead.affiliate_id) : null;

                  return (
                    <div key={lead.id} className="rounded-[1.5rem] border border-slate-200 bg-white/72 p-5">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <h3 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">
                              {lead.business_name}
                            </h3>
                            <p className="mt-2 text-sm text-slate-600">
                              {lead.contact_name} • {lead.contact_info?.email || 'No email'} • {lead.contact_info?.phone || 'No phone'}
                            </p>
                            <p className="mt-2 text-sm text-slate-500">
                              Affiliate: {affiliate?.name || 'Unassigned'} {affiliate?.referral_code ? `• ${affiliate.referral_code}` : ''}
                            </p>
                          </div>
                          <StatusBadge status={lead.status} />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block text-sm text-slate-600">
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                              Lead stage
                            </span>
                            <select
                              value={normalizeLeadStage(lead.status)}
                              onChange={(event) =>
                                void updateLead(lead.id, { status: event.target.value as LeadStatus })
                              }
                              className="w-full rounded-[1.15rem] border border-slate-200 bg-white/88 px-4 py-3.5 text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                            >
                              {leadStatuses.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block text-sm text-slate-600">
                            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                              First payout timing
                            </span>
                            <select
                              value={String(lead.payout_timeline_days ?? 30)}
                              onChange={(event) =>
                                void updateLead(lead.id, {
                                  payout_timeline_days: Number(event.target.value) as 30 | 60,
                                })
                              }
                              className="w-full rounded-[1.15rem] border border-slate-200 bg-white/88 px-4 py-3.5 text-slate-950 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                            >
                              <option value="30">30 days</option>
                              <option value="60">60 days</option>
                            </select>
                          </label>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <PayoutActionCard
                            title="Tier 1"
                            body={lead.tier_1_paid_at ? `Paid ${formatDate(lead.tier_1_paid_at)}` : lead.tier_1_due_at ? `Due ${formatDate(lead.tier_1_due_at)}` : 'Starts after the lead is closed'}
                            actionLabel={lead.tier_1_paid_at ? 'Undo paid' : 'Mark paid'}
                            onAction={() =>
                              void updateLead(lead.id, {
                                tier_1_paid_at: lead.tier_1_paid_at ? null : new Date().toISOString(),
                              })
                            }
                          />
                          <PayoutActionCard
                            title="Tier 2"
                            body={lead.tier_2_paid_at ? `Paid ${formatDate(lead.tier_2_paid_at)}` : lead.tier_2_due_at ? `Due ${formatDate(lead.tier_2_due_at)}` : 'Starts after the lead is closed'}
                            actionLabel={lead.tier_2_paid_at ? 'Undo paid' : 'Mark paid'}
                            onAction={() =>
                              void updateLead(lead.id, {
                                tier_2_paid_at: lead.tier_2_paid_at ? null : new Date().toISOString(),
                              })
                            }
                          />
                        </div>

                        {lead.notes ? <p className="text-sm leading-6 text-slate-500">{lead.notes}</p> : null}

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => void deleteLead(lead.id)}
                            disabled={busyKey === `delete-lead-${lead.id}`}
                            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                          >
                            Delete lead
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState title="No leads yet" body="Once leads are submitted into the shared database, they will appear here." />
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function FeaturePill({ icon: Icon, title, body }: { icon: typeof UserRoundPlus; title: string; body: string }) {
  return (
    <article className="rounded-[1.5rem] border border-white/70 bg-white/78 p-5 shadow-[0_14px_35px_rgba(83,112,189,0.08)] backdrop-blur-xl">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="text-xl font-semibold tracking-[-0.03em] text-slate-900">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{body}</p>
    </article>
  );
}

function PayoutActionCard({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="rounded-[1.25rem] border border-slate-200 bg-slate-50/70 p-4">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
      <button
        type="button"
        onClick={onAction}
        className="mt-4 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
      >
        {actionLabel}
      </button>
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

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1000);
      }}
      className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-slate-700"
    >
      <Copy className="h-4 w-4" />
      {copied ? 'Copied' : label}
    </button>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm text-slate-600">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[1.15rem] border border-slate-200 bg-white/88 px-4 py-3.5 text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100"
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

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-slate-200 bg-white/72 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-700">
      {getLeadStatusLabel(status)}
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
  accent = 'default',
  spin = false,
}: {
  icon: typeof AlertCircle;
  message: string;
  accent?: 'default' | 'warn';
  spin?: boolean;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="panel max-w-lg rounded-[2rem] p-8 text-center">
        <Icon className={`mx-auto h-8 w-8 ${accent === 'warn' ? 'text-amber-600' : 'text-blue-600'} ${spin ? 'animate-spin' : ''}`} />
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{message}</h1>
      </div>
    </main>
  );
}

function buildAffiliateLeadSummary(lead: Lead) {
  const stage = normalizeLeadStage(lead.status);

  if (stage === 'lead') {
    return `This referral was received on ${formatDate(lead.submitted_at)} and is still at the lead stage.`;
  }

  if (stage === 'contacted') {
    return 'This referral is currently being worked and has moved into active follow-up.';
  }

  if (lead.tier_2_paid_at) {
    return `Both payout milestones were completed. Final payment was sent on ${formatDate(lead.tier_2_paid_at)}.`;
  }

  if (lead.tier_1_paid_at && lead.tier_2_due_at) {
    return `The first payout was sent on ${formatDate(lead.tier_1_paid_at)}. The second payout is scheduled for ${formatDate(lead.tier_2_due_at)}.`;
  }

  if (lead.tier_1_due_at) {
    return `This referral became a client on ${formatDate(lead.closed_at)}. The first payout becomes due on ${formatDate(lead.tier_1_due_at)}.`;
  }

  return 'This referral has been closed and payout timing has started.';
}

function formatDate(value: string | null) {
  if (!value) return 'Pending';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function generateCode(length: number) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let output = '';

  while (output.length < length) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return output;
}

export default App;
