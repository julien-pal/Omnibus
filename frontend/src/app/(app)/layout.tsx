'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import useStore from '@/store/useStore';
import { authService } from '@/api/authService';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { token, authEnabled, setAuthEnabled, setUser } = useStore();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    authService
      .me()
      .then((res) => {
        setAuthEnabled(res.data.authEnabled);
        if (res.data.user) setUser(res.data.user);
        if (res.data.authEnabled && !res.data.user) {
          router.push('/login');
        } else {
          setReady(true);
        }
      })
      .catch(() => {
        setReady(true);
      });
  }, [token]);

  if (!ready) return null;

  return <Layout>{children}</Layout>;
}
