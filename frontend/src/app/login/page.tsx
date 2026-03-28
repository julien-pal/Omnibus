'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff } from 'lucide-react';
import { authService } from '@/api/authService';
import useStore from '@/store/useStore';
import { useT } from '@/i18n';

export default function Login() {
  const t = useT();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setToken, setUser, token, authEnabled } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (token && !authEnabled) router.replace('/');
  }, [token, authEnabled]);

  async function handleSubmit(e: React.MouseEvent | React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await authService.login(username, password);
      setToken(res.data.token);
      setUser(res.data.user);
      router.replace('/');
    } catch (err) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setError(axErr.response?.data?.error || t('login_invalid'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen bg-surface-base flex items-center justify-center p-4"
      style={{
        background:
          'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.12) 0%, transparent 70%), #0d111a',
      }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Image src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/logo.png`} alt="Omnibus" width={56} height={56} className="mb-5 rounded-2xl shadow-glow-sm" />
          <h1 className="text-2xl font-bold text-ink tracking-tight">Omnibus</h1>
          <p className="text-sm text-ink-muted mt-1">{t('login_subtitle')}</p>
        </div>

        {/* Form card */}
        <div className="bg-surface-card border border-surface-border rounded-2xl p-6 space-y-4 shadow-modal">
          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
              {t('login_username_label')}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wide mb-1.5">
              {t('login_password_label')}
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink-dim transition-colors"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="btn-primary w-full py-2.5 mt-1"
          >
            {loading ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>{' '}
                {t('login_submitting')}
              </>
            ) : (
              t('login_submit')
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
