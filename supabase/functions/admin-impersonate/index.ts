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
    const siteUrl = Deno.env.get('SITE_URL') || 'https://rally-hub.com';
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
        redirectTo: `${siteUrl}/auth-callback`,
      },
    });

    if (linkError) {
      return new Response(JSON.stringify({ error: linkError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // generateLink returns { properties: { action_link, hashed_token, ... } }
    // action_link is the full verification URL — just override its redirect_to
    const actionLink = linkData?.properties?.action_link;
    const hashedToken = linkData?.properties?.hashed_token;

    if (!actionLink && !hashedToken) {
      return new Response(JSON.stringify({ error: 'No link generated', debug: JSON.stringify(linkData) }), {
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

    // Use the action_link directly if available, otherwise construct manually
    let verifyUrl: string;
    if (actionLink) {
      // Replace the redirect_to in the action_link to point to our consumer app
      const url = new URL(actionLink);
      url.searchParams.set('redirect_to', `${siteUrl}/auth-callback`);
      verifyUrl = url.toString();
    } else {
      verifyUrl = `${supabaseUrl}/auth/v1/verify?token=${hashedToken}&type=magiclink&redirect_to=${encodeURIComponent(siteUrl + '/auth-callback')}`;
    }

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
