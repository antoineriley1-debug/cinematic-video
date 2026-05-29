'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CineStudio } from '@/components/CineStudio';

export default function Home() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user);
    });

    return () => subscription?.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div style={{ background: '#0a0908', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6b6258' }}>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ background: '#0a0908', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ maxWidth: 420, width: '100%', background: '#13110f', borderRadius: 16, padding: 32, border: '1px solid #2a2622' }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: '#f4efe9', marginBottom: 8 }}>CineStudio</h1>
          <p style={{ color: '#9a8f82', marginBottom: 32, fontSize: 14 }}>Premium video enhancement with professional color grading</p>
          <button
            onClick={() =>
              supabase.auth.signInWithOAuth({
                provider: 'github',
                options: { redirectTo: `${window.location.origin}/auth/callback` },
              })
            }
            style={{ width: '100%', padding: '12px 24px', background: '#e8a04b', color: '#0a0908', fontWeight: 600, fontSize: 14, borderRadius: 9, border: 'none', cursor: 'pointer' }}
          >
            🔐 Sign In with GitHub
          </button>
        </div>
      </div>
    );
  }

  return <CineStudio />;
}
