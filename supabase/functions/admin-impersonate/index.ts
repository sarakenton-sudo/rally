import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin owner via their JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller } } = await supabase.auth.getUser(token);
    if (!caller?.email) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminRecord } = await supabase
      .from('admin_users')
      .select('id, role')
      .eq('email', caller.email)
      .single();

    if (!adminRecord || adminRecord.role !== 'owner') {
      return new Response(JSON.stringify({ error: 'Only owners can impersonate' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { target_user_id } = await req.json();
    if (!target_user_id) {
      return new Response(JSON.stringify({ error: 'target_user_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate magic link for the target user
    const { data: targetUser } = await supabase.auth.admin.getUserById(target_user_id);
    if (!targetUser?.user?.email) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUser.user.email,
      options: {
        redirectTo: `${supabaseUrl.replace('.supabase.co', '')}.vercel.app/auth-callback`,
      },
    });

    if (linkError) {
      return new Response(JSON.stringify({ error: linkError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Log impersonation
    await supabase.from('admin_audit_log').insert({
      admin_user_id: adminRecord.id,
      action: 'impersonate_user',
      target_table: 'auth.users',
      target_id: target_user_id,
      metadata: { target_email: targetUser.user.email, caller_email: caller.email },
    });

    // The generated link has hashed_token etc. — construct the verification URL
    const properties = linkData?.properties;
    const verifyUrl = `${supabaseUrl}/auth/v1/verify?token=${properties?.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(supabaseUrl.replace('.supabase.co', '') + '.vercel.app/auth-callback')}`;

    return new Response(JSON.stringify({
      url: verifyUrl,
      email: targetUser.user.email,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
