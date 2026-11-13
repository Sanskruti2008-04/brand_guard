import { useEffect, useState } from 'react';
import { Building2, Check, Fingerprint, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import '../styles/history-settings.css';

const label = value => value === 'admin' ? 'Administrator' : 'Employee / Creator';
const date = value => value ? new Date(value).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

export default function SettingsPage({ role = 'employee' }) {
  const isAdmin = role === 'admin';
  const toast = useToast();
  const { refresh } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ name: '', email: '', currentPassword: '' });
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [organization, setOrganization] = useState({ name: '', employeeRegistrationEnabled: true });
  const [busy, setBusy] = useState('');

  useEffect(() => {
    let cancelled = false;
    api('/settings')
      .then(result => {
        if (cancelled) return;
        setData(result);
        setProfile({ name: result.account.name, email: result.account.email, currentPassword: '' });
        setOrganization({ name: result.organization.name, employeeRegistrationEnabled: result.organization.employeeRegistrationEnabled });
      })
      .catch(error => toast(error.message, 'error'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function saveProfile(event) {
    event.preventDefault();
    setBusy('profile');
    try {
      const result = await api('/settings/profile', { method: 'PATCH', body: JSON.stringify(profile) });
      setData(current => ({ ...current, account: result.account }));
      setProfile(current => ({ ...current, name: result.account.name, email: result.account.email, currentPassword: '' }));
      await refresh();
      toast(result.message || 'Account details updated.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    if (password.newPassword !== password.confirmPassword) {
      toast('The new passwords do not match.', 'error');
      return;
    }
    setBusy('password');
    try {
      const result = await api('/settings/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword: password.currentPassword, newPassword: password.newPassword })
      });
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast(result.message || 'Password updated.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function saveOrganization(event) {
    event.preventDefault();
    setBusy('organization');
    try {
      const result = await api('/settings/organization', { method: 'PATCH', body: JSON.stringify(organization) });
      setData(current => ({ ...current, organization: result.organization }));
      setOrganization({ name: result.organization.name, employeeRegistrationEnabled: result.organization.employeeRegistrationEnabled });
      toast(result.message || 'Organisation settings updated.');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy('');
    }
  }

  if (loading && !data) return <div className="panel history-empty"><Fingerprint size={24}/><b>Loading settings…</b><span>Retrieving your account and workspace configuration.</span></div>;
  if (!data) return <div className="panel history-empty"><LockKeyhole size={24}/><b>Settings unavailable</b><span>Refresh the page or sign in again to continue.</span></div>;

  const stats = [
    [isAdmin ? 'Active employees' : 'Your documents', isAdmin ? data.stats.employees : data.stats.documents],
    ['Review records', data.stats.reviews],
    ['Awaiting decision', data.stats.awaitingDecision]
  ];

  return (
    <div className="settings-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">{isAdmin ? 'ADMINISTRATION / WORKSPACE CONFIGURATION' : 'CREATOR WORKSPACE / ACCOUNT'}</span>
          <h1>{isAdmin ? 'Organisation settings' : 'Account settings'}</h1>
          <p>{isAdmin ? 'Manage your organisation profile, employee registration and your own account credentials.' : 'Manage your profile and sign-in credentials. Your organisation controls workspace access and review permissions.'}</p>
        </div>
        <span className="admin-access-pill"><ShieldCheck size={15}/> {isAdmin ? 'ADMIN CONTROLS' : 'SECURE ACCOUNT'}</span>
      </div>

      {isAdmin && (
        <section className="work-panel settings-panel settings-org-panel">
          <div className="settings-panel-head">
            <span className="settings-panel-icon"><Building2 size={18}/></span>
            <div><span className="eyebrow">ORGANISATION PROFILE</span><h2>Workspace configuration</h2></div>
          </div>
          <form className="settings-form" onSubmit={saveOrganization}>
            <div className="settings-form-grid">
              <label className="field-label">Organisation name
                <input value={organization.name} onChange={event => setOrganization(current => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={120}/>
              </label>
              <label className="field-label">Workspace slug
                <input value={data.organization.slug} disabled/>
              </label>
            </div>
            <label className="settings-toggle">
              <input type="checkbox" checked={organization.employeeRegistrationEnabled} onChange={event => setOrganization(current => ({ ...current, employeeRegistrationEnabled: event.target.checked }))}/>
              <span><b>Allow employee self-registration</b><small>When off, people can still join through an administrator invitation, but the public sign-up form is closed.</small></span>
            </label>
            <div className="settings-form-foot">
              <p>Workspace slugs are permanent. Employee registration is additionally subject to the server-wide registration setting.</p>
              <button className="button button-dark button-small" disabled={busy === 'organization'}>{busy === 'organization' ? 'Saving…' : 'Save organisation'}</button>
            </div>
          </form>
        </section>
      )}

      <div className="settings-grid">
        <div className="settings-stack">
          <section className="work-panel settings-panel">
            <div className="settings-panel-head">
              <span className="settings-panel-icon"><UserRound size={18}/></span>
              <div><span className="eyebrow">ACCOUNT PROFILE</span><h2>Your details</h2></div>
            </div>
            <form className="settings-form" onSubmit={saveProfile}>
              <div className="settings-form-grid">
                <label className="field-label">Full name
                  <input value={profile.name} onChange={event => setProfile(current => ({ ...current, name: event.target.value }))} required minLength={2} maxLength={80} autoComplete="name"/>
                </label>
                <label className="field-label">Email address
                  <input type="email" value={profile.email} onChange={event => setProfile(current => ({ ...current, email: event.target.value }))} required maxLength={254} autoComplete="email"/>
                </label>
              </div>
              <label className="field-label">Current password
                <input type="password" value={profile.currentPassword} onChange={event => setProfile(current => ({ ...current, currentPassword: event.target.value }))} autoComplete="current-password" placeholder="Required only when changing your email"/>
              </label>
              <div className="settings-form-foot">
                <p><Mail size={13}/> Changing your email address requires your current password. Your role and organisation access cannot be changed here.</p>
                <button className="button button-dark button-small" disabled={busy === 'profile'}>{busy === 'profile' ? 'Saving…' : 'Save profile'}</button>
              </div>
            </form>
          </section>

          <section className="work-panel settings-panel">
            <div className="settings-panel-head">
              <span className="settings-panel-icon"><KeyRound size={18}/></span>
              <div><span className="eyebrow">SIGN-IN SECURITY</span><h2>Change password</h2></div>
            </div>
            <form className="settings-form" onSubmit={savePassword}>
              <label className="field-label">Current password
                <input type="password" value={password.currentPassword} onChange={event => setPassword(current => ({ ...current, currentPassword: event.target.value }))} required autoComplete="current-password"/>
              </label>
              <div className="settings-form-grid">
                <label className="field-label">New password
                  <input type="password" value={password.newPassword} onChange={event => setPassword(current => ({ ...current, newPassword: event.target.value }))} required minLength={10} maxLength={72} autoComplete="new-password" placeholder="10+ characters"/>
                </label>
                <label className="field-label">Confirm new password
                  <input type="password" value={password.confirmPassword} onChange={event => setPassword(current => ({ ...current, confirmPassword: event.target.value }))} required minLength={10} maxLength={72} autoComplete="new-password"/>
                </label>
              </div>
              <div className="settings-form-foot">
                <p><LockKeyhole size={13}/> Use at least 10 characters including a letter and a number. Your current password is required.</p>
                <button className="button button-dark button-small" disabled={busy === 'password'}>{busy === 'password' ? 'Updating…' : 'Update password'}</button>
              </div>
            </form>
          </section>
        </div>

        <aside className="settings-stack">
          <section className="work-panel settings-summary">
            <span className="settings-avatar">{data.account.name?.slice(0, 1).toUpperCase() || 'U'}</span>
            <span className="eyebrow">SIGNED-IN ACCOUNT</span>
            <h2>{data.account.name}</h2>
            <p className="settings-email">{data.account.email}</p>
            <dl className="settings-facts">
              <dt>Access level</dt><dd>{label(data.account.role)}</dd>
              <dt>Organisation</dt><dd>{data.organization.name}</dd>
              <dt>Member since</dt><dd>{date(data.account.createdAt)}</dd>
              <dt>Session</dt><dd><Check size={12}/> Secure cookie session</dd>
            </dl>
            <div className="settings-stats">
              {stats.map(([title, value]) => <div key={title}><strong>{value ?? 0}</strong><span>{title}</span></div>)}
            </div>
            <p className="settings-note"><ShieldCheck size={13}/> Human approval stays in control. Account and workspace changes are recorded in the organisation activity log.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
