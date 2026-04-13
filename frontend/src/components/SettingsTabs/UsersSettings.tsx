'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, Eye, EyeOff, Shield, User } from 'lucide-react';
import { profileService, ProfileInfo } from '@/api/profileService';
import { settingsService } from '@/api/settingsService';
import { useT, TranslationKey } from '@/i18n';
import { toast } from '@/store/useToastStore';

interface ProfileForm {
  name: string;
  role: 'admin' | 'user';
  password: string;
  removePassword: boolean;
}

const EMPTY_FORM: ProfileForm = { name: '', role: 'user', password: '', removePassword: false };

export default function UsersSettings() {
  const t = useT();
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // profile id or 'new'
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadProfiles();
  }, []);

  async function loadProfiles() {
    try {
      const authRes = await settingsService.getAuth();
      setProfiles(authRes.data.profiles || []);
      setAuthEnabled(authRes.data.enabled || false);
    } catch {}
  }

  async function handleAuthToggle() {
    const next = !authEnabled;
    setAuthEnabled(next);
    try {
      await settingsService.updateAuth({ enabled: next });
    } catch {
      setAuthEnabled(!next);
    }
  }

  function startAdd() {
    setEditing('new');
    setForm(EMPTY_FORM);
    setShowPass(false);
  }

  function startEdit(profile: ProfileInfo) {
    setEditing(profile.id);
    setForm({ name: profile.name, role: profile.role, password: '', removePassword: false });
    setShowPass(false);
  }

  function cancelEdit() {
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing === 'new') {
        await profileService.createProfile({
          name: form.name.trim(),
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
        });
        toast.success(t('users_created'));
      } else if (editing) {
        await profileService.updateProfile(editing, {
          name: form.name.trim(),
          role: form.role,
          ...(form.password ? { password: form.password } : {}),
          ...(form.removePassword ? { removePassword: true } : {}),
        });
        toast.success(t('users_updated'));
      }
      setEditing(null);
      setForm(EMPTY_FORM);
      await loadProfiles();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || (err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await profileService.deleteProfile(id);
      toast.success(t('users_deleted'));
      setDeleteConfirm(null);
      await loadProfiles();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || (err as Error).message);
    }
  }

  return (
    <div className="space-y-8">
      {/* Authentication toggle */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{t('auth_title')}</h2>
          <p className="text-sm text-ink-muted mt-1">{t('auth_desc')}</p>
        </div>

        <div className="flex items-center justify-between bg-surface-card border border-surface-border rounded-xl px-4 py-3.5">
          <div>
            <p className="text-sm font-medium text-ink">{t('auth_enable')}</p>
            <p className="text-xs text-ink-muted mt-0.5">{t('auth_enable_desc')}</p>
          </div>
          <button
            type="button"
            onClick={handleAuthToggle}
            className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
              authEnabled ? 'bg-indigo-500' : 'bg-surface-elevated border border-surface-border'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                authEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </section>

      <div className="border-t border-surface-border" />

      {/* Profiles list */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">{t('users_title')}</h2>
            <p className="text-sm text-ink-muted mt-1">{t('users_desc')}</p>
          </div>
          <button onClick={startAdd} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            {t('users_add')}
          </button>
        </div>

        <div className="space-y-2">
          {profiles.map((profile) => (
            <div key={profile.id}>
              {editing === profile.id ? (
                <ProfileFormCard
                  form={form}
                  setForm={setForm}
                  showPass={showPass}
                  setShowPass={setShowPass}
                  onSave={handleSave}
                  onCancel={cancelEdit}
                  saving={saving}
                  isEdit
                  hasPassword={profile.hasPassword}
                  t={t}
                />
              ) : (
                <div className="flex items-center justify-between bg-surface-card border border-surface-border rounded-xl px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-indigo-400">
                        {profile.name[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink flex items-center gap-2">
                        {profile.name}
                        {profile.role === 'admin' && (
                          <span className="text-[10px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-md font-medium uppercase">
                            {t('users_role_admin')}
                          </span>
                        )}
                        {profile.hasPassword && (
                          <span className="text-[10px] bg-surface-elevated text-ink-faint px-1.5 py-0.5 rounded-md">
                            PIN
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => startEdit(profile)}
                      className="p-2 rounded-lg text-ink-dim hover:text-ink hover:bg-surface-elevated transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {deleteConfirm === profile.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDelete(profile.id)}
                          className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="p-2 rounded-lg text-ink-dim hover:text-ink hover:bg-surface-elevated transition-colors text-xs"
                        >
                          {t('users_cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(profile.id)}
                        className="p-2 rounded-lg text-ink-dim hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* New profile form */}
          {editing === 'new' && (
            <ProfileFormCard
              form={form}
              setForm={setForm}
              showPass={showPass}
              setShowPass={setShowPass}
              onSave={handleSave}
              onCancel={cancelEdit}
              saving={saving}
              isEdit={false}
              hasPassword={false}
              t={t}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileFormCard({
  form,
  setForm,
  showPass,
  setShowPass,
  onSave,
  onCancel,
  saving,
  isEdit,
  hasPassword,
  t,
}: {
  form: ProfileForm;
  setForm: (f: ProfileForm) => void;
  showPass: boolean;
  setShowPass: (v: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  isEdit: boolean;
  hasPassword: boolean;
  t: (key: TranslationKey) => string;
}) {
  return (
    <div className="bg-surface-card border border-indigo-500/30 rounded-xl p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
            {t('users_name')}
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
            {t('users_role')}
          </label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'user' })}
            className="input"
          >
            <option value="admin">{t('users_role_admin')}</option>
            <option value="user">{t('users_role_user')}</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
          {t('users_password_optional')}
          {isEdit && hasPassword && (
            <span className="normal-case ml-1 text-ink-faint">{t('auth_password_set')}</span>
          )}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showPass ? 'text' : 'password'}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder={isEdit && hasPassword ? '••••••••' : ''}
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
          {isEdit && hasPassword && !form.password && (
            <button
              type="button"
              onClick={() => setForm({ ...form, removePassword: !form.removePassword })}
              className={`flex items-center gap-1.5 px-3 rounded-lg text-xs font-medium transition-colors flex-shrink-0 ${
                form.removePassword
                  ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                  : 'bg-surface-elevated text-ink-dim border border-surface-border hover:text-red-400 hover:border-red-500/30'
              }`}
            >
              <Trash2 className="w-3 h-3" />
              PIN
            </button>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-secondary text-sm">
          {t('users_cancel')}
        </button>
        <button onClick={onSave} disabled={saving || !form.name.trim()} className="btn-primary text-sm">
          {saving ? '...' : t('users_save')}
        </button>
      </div>
    </div>
  );
}
