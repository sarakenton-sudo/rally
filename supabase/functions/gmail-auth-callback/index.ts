import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI') ?? '';
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // ============================================================
    // GET: Google OAuth callback — exchange code for tokens
    // ============================================================
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state'); // user_id
      const error = url.searchParams.get('error');

      if (error) {
        return redirectToApp(`rally://auth/gmail-callback?success=false&error=${encodeURIComponent(error)}`, state);
      }

      if (!code || !state) {
        return redirectToApp('rally://auth/gmail-callback?success=false&error=missing_params', state);
      }

      // State format: "userId" or "userId|web" (web platform indicator)
      const stateParts = state.split('|');
      const userId = stateParts[0];
      const isWeb = stateParts[1] === 'web';

      // Debug: log what we're sending (redacted)
      console.log('Token exchange starting...', {
        hasClientId: !!GOOGLE_CLIENT_ID,
        hasClientSecret: !!GOOGLE_CLIENT_SECRET,
        redirectUri: GOOGLE_REDIRECT_URI,
        codeLength: code.length,
      });

      // Exchange authorization code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      console.log('Token exchange response status:', tokenResponse.status);

      if (!tokenResponse.ok) {
        const err = await tokenResponse.text();
        console.error('Token exchange failed:', tokenResponse.status, err);
        const errorMsg = encodeURIComponent(`token_exchange_${tokenResponse.status}: ${err.substring(0, 200)}`);
        return redirectToApp(`rally://auth/gmail-callback?success=false&error=${errorMsg}`, state);
      }

      const tokens = await tokenResponse.json();
      const accessToken = tokens.access_token;
      const refreshToken = tokens.refresh_token;
      const expiresIn = tokens.expires_in ?? 3600;
      const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      if (!refreshToken) {
        console.error('No refresh token received — user may need to re-consent with access_type=offline&prompt=consent');
        return redirectToApp('rally://auth/gmail-callback?success=false&error=no_refresh_token', state);
      }

      // Fetch Gmail profile to get email address
      const profileResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!profileResponse.ok) {
        console.error('Failed to fetch Gmail profile');
        return redirectToApp('rally://auth/gmail-callback?success=false&error=profile_fetch_failed', state);
      }

      const profile = await profileResponse.json();
      const gmailEmail = profile.emailAddress;

      // Upsert gmail_tokens
      const { error: upsertError } = await supabase
        .from('gmail_tokens')
        .upsert({
          user_id: userId,
          access_token: accessToken,
          refresh_token: refreshToken,
          token_expires_at: tokenExpiresAt,
          gmail_email: gmailEmail,
          sync_errors: 0,
          is_active: true,
          last_history_id: profile.historyId ?? null,
        }, { onConflict: 'user_id' });

      if (upsertError) {
        console.error('Failed to store tokens:', upsertError);
        return redirectToApp('rally://auth/gmail-callback?success=false&error=storage_failed', state);
      }

      // Update team_config with connection status
      await supabase
        .from('team_config')
        .update({ gmail_connected: true, gmail_email: gmailEmail })
        .eq('user_id', userId);

      return redirectToApp(`rally://auth/gmail-callback?success=true&email=${encodeURIComponent(gmailEmail)}`, state);
    }

    // ============================================================
    // POST: Disconnect Gmail
    // ============================================================
    if (req.method === 'POST') {
      const body = await req.json();

      if (body.action !== 'disconnect') {
        return jsonResponse({ error: 'Unknown action' }, 400);
      }

      // Authenticate the user
      const authHeader = req.headers.get('authorization') ?? '';
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      // Get the stored token to revoke at Google
      const { data: gmailToken } = await supabase
        .from('gmail_tokens')
        .select('access_token, refresh_token')
        .eq('user_id', user.id)
        .single();

      if (gmailToken) {
        // Revoke token at Google (best-effort)
        const revokeToken = gmailToken.refresh_token || gmailToken.access_token;
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(revokeToken)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }).catch((err) => console.error('Token revocation failed:', err));

        // Delete from gmail_tokens
        await supabase
          .from('gmail_tokens')
          .delete()
          .eq('user_id', user.id);
      }

      // Update team_config
      await supabase
        .from('team_config')
        .update({ gmail_connected: false, gmail_email: null })
        .eq('user_id', user.id);

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('Gmail auth callback error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function redirectToApp(path: string, state?: string | null): Response {
  const isWeb = state?.includes('|web');
  let url: string;
  if (isWeb) {
    // For web, redirect to rally-hub.com with query params
    const params = path.split('?')[1] || '';
    url = `https://rally-hub.com/settings/email-connect?${params}`;
  } else {
    url = path;
  }
  return new Response(null, {
    status: 302,
    headers: { Location: url },
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
