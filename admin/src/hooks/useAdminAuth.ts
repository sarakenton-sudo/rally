import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

interface AdminUser {
  id: string;
  email: string;
  role: 'owner' | 'cs_rep';
  supabaseUser: User;
}

export function useAdminAuth() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAdmin();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAdmin();
    });

    return () => subscription.unsubscribe();
  }, []);

  async function checkAdmin() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setAdmin(null);
        setLoading(false);
        return;
      }

      const { data: adminRecords } = await supabase.rpc('get_admin_self');
      const adminRecord = adminRecords?.[0] ?? null;

      if (adminRecord) {
        setAdmin({
          id: adminRecord.id,
          email: adminRecord.email,
          role: adminRecord.role as 'owner' | 'cs_rep',
          supabaseUser: user,
        });
      } else {
        // Signed in but not an admin — sign them out of admin context
        await supabase.auth.signOut();
        setAdmin(null);
      }
    } catch {
      setAdmin(null);
    } finally {
      setLoading(false);
    }
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // checkAdmin will fire via onAuthStateChange
  }

  async function signOut() {
    await supabase.auth.signOut();
    setAdmin(null);
  }

  return { admin, loading, signIn, signOut };
}
