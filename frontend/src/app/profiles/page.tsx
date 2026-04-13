'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff, Lock, Plus, X } from 'lucide-react';
import { profileService, ProfileInfo } from '@/api/profileService';
import useStore from '@/store/useStore';
import { useT } from '@/i18n';
import { toast } from '@/store/useToastStore';

const PROFILE_COLORS = [
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-violet-500',
  'bg-pink-500',
  'bg-teal-500',
];

export default function ProfilesPage() {
  const t = useT();
  const router = useRouter();
  const { setToken, setUser, setProfile } = useStore();
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<ProfileInfo | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [selecting, setSelecting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', role: 'admin' as 'admin' | 'user', password: '' });
  const [showPass, setShowPass] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    profileService
      .getProfiles()
      .then((res) => setProfiles(res.data.profiles || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSelect(profile: ProfileInfo) {
    if (profile.hasPassword) {
      setSelectedProfile(profile);
      setPassword('');
      setError('');
      return;
    }
    await doSelect(profile.id);
  }

  async function doSelect(profileId: string, pwd?: string) {
    setSelecting(true);
    setError('');
    try {
      const res = await profileService.selectProfile(profileId, pwd);
      setToken(res.data.token);
      setUser({ username: res.data.profile.name, role: res.data.profile.role });
      setProfile(res.data.profile.id, res.data.profile.name);
      router.replace('/');
    } catch (err) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setError(axErr.response?.data?.error || t('profiles_wrong_password'));
    } finally {
      setSelecting(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      await profileService.createProfile({
        name: createForm.name.trim(),
        role: createForm.role,
        ...(createForm.password ? { password: createForm.password } : {}),
      });
      toast.success(t('users_created'));
      setShowCreate(false);
      setCreateForm({ name: '', role: 'admin', password: '' });
      const res = await profileService.getProfiles();
      setProfiles(res.data.profiles || []);
    } catch (err) {
      const axErr = err as { response?: { data?: { error?: string } } };
      toast.error(axErr.response?.data?.error || (err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProfile) return;
    await doSelect(selectedProfile.id, password);
  }

  if (loading) return null;

  // If no profiles exist, show a message + create modal
  if (profiles.length === 0) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.12) 0%, transparent 70%), #0d111a',
        }}
      >
        <div className="text-center">
          <Image
            src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/logo.png`}
            alt="Omnibus"
            width={56}
            height={56}
            className="mx-auto mb-5 rounded-2xl"
          />
          <h1 className="text-2xl font-bold text-ink mb-2">Omnibus</h1>
          <p className="text-ink-muted mb-6">{t('profiles_empty')}</p>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {t('profiles_create')}
          </button>
        </div>

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-surface-card border border-surface-border rounded-2xl p-6 w-full max-w-sm shadow-modal space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-ink">{t('profiles_create')}</h2>
                <button
                  onClick={() => setShowCreate(false)}
                  className="p-1 rounded-lg text-ink-dim hover:text-ink hover:bg-surface-elevated transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                    {t('users_name')}
                  </label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    className="input"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                    {t('users_role')}
                  </label>
                  <div className="input bg-surface-elevated/50 text-ink-dim cursor-not-allowed">
                    {t('users_role_admin')}
                  </div>
                  <p className="text-xs text-ink-faint mt-1">{t('profiles_first_admin')}</p>
                </div>

                <div>
                  <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                    {t('users_password_optional')}
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={createForm.password}
                      onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                      className="input pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-dim"
                    >
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="btn-secondary flex-1"
                  >
                    {t('profiles_back')}
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !createForm.name.trim()}
                    className="btn-primary flex-1"
                  >
                    {creating ? '...' : t('users_save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.12) 0%, transparent 70%), #0d111a',
      }}
    >
      <div className="w-full max-w-2xl">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          <Image
            src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/logo.png`}
            alt="Omnibus"
            width={56}
            height={56}
            className="mb-5 rounded-2xl"
          />
          <h1 className="text-2xl font-bold text-ink tracking-tight">{t('profiles_title')}</h1>
        </div>

        {/* Password prompt overlay */}
        {selectedProfile ? (
          <div className="max-w-sm mx-auto">
            <div className="bg-surface-card border border-surface-border rounded-2xl p-6 space-y-4 shadow-modal">
              <div className="flex flex-col items-center gap-3">
                <div
                  className={`w-16 h-16 rounded-full ${PROFILE_COLORS[profiles.indexOf(selectedProfile) % PROFILE_COLORS.length]} flex items-center justify-center`}
                >
                  <span className="text-2xl font-bold text-white">
                    {selectedProfile.name[0].toUpperCase()}
                  </span>
                </div>
                <p className="text-lg font-semibold text-ink">{selectedProfile.name}</p>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
                    {t('profiles_enter_password')}
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    className="input"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-red-400">
                    {error}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedProfile(null)}
                    className="btn-secondary flex-1"
                  >
                    {t('profiles_back')}
                  </button>
                  <button type="submit" disabled={selecting} className="btn-primary flex-1">
                    {selecting ? '...' : t('profiles_confirm')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <>
            {/* Profile grid */}
            <div className="flex flex-wrap justify-center gap-6">
              {profiles.map((profile, i) => (
                <button
                  key={profile.id}
                  onClick={() => handleSelect(profile)}
                  className="group flex flex-col items-center gap-3 p-4 rounded-2xl transition-all hover:bg-surface-elevated/50 w-32"
                >
                  <div
                    className={`w-20 h-20 rounded-full ${PROFILE_COLORS[i % PROFILE_COLORS.length]} flex items-center justify-center transition-transform group-hover:scale-110 relative`}
                  >
                    <span className="text-3xl font-bold text-white">
                      {profile.name[0].toUpperCase()}
                    </span>
                    {profile.hasPassword && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-surface-card border border-surface-border flex items-center justify-center">
                        <Lock className="w-3 h-3 text-ink-muted" />
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-medium text-ink-dim group-hover:text-ink transition-colors truncate max-w-full">
                    {profile.name}
                  </span>
                  <span className="text-[10px] text-ink-faint uppercase tracking-wide">
                    {profile.role === 'admin' ? t('users_role_admin') : t('users_role_user')}
                  </span>
                </button>
              ))}
            </div>

          </>
        )}
      </div>
    </div>
  );
}
