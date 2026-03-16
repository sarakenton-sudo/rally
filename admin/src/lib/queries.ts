import { supabase } from './supabase';

// ---- Users ----

export async function fetchUsers(search?: string, page = 0, pageSize = 50) {
  const { data, error } = await supabase.rpc('admin_list_users', {
    search_query: search || null,
    page_size: pageSize,
    page_offset: page * pageSize,
  });
  if (error) throw error;
  return data ?? [];
}

// ---- Dashboard stats ----

export async function fetchDashboardStats() {
  const [_users, errors, features, sessions] = await Promise.all([
    supabase.rpc('admin_list_users', { page_size: 1, page_offset: 0 }),
    supabase.from('error_log').select('id', { count: 'exact', head: true }).eq('status', 'new'),
    supabase.from('feature_events').select('id', { count: 'exact', head: true }).eq('event_type', 'feature_request').eq('status', 'new'),
    supabase.from('app_sessions').select('id', { count: 'exact', head: true }).gte('started_at', new Date(Date.now() - 7 * 86400000).toISOString()),
  ]);

  // Get total user count separately
  const { data: allUsers } = await supabase.rpc('admin_list_users', { page_size: 10000, page_offset: 0 });

  return {
    totalUsers: allUsers?.length ?? 0,
    activeSessionsWeek: sessions.count ?? 0,
    pendingErrors: errors.count ?? 0,
    pendingFeatureRequests: features.count ?? 0,
  };
}

// ---- Errors ----

export async function fetchErrors(
  opts: { status?: string; severity?: string; page?: number; pageSize?: number } = {}
) {
  const { status, severity, page = 0, pageSize = 50 } = opts;
  let query = supabase
    .from('error_log')
    .select('*')
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (status) query = query.eq('status', status);
  if (severity) query = query.eq('severity', severity);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function resolveError(errorId: string, adminUserId: string) {
  const { error } = await supabase
    .from('error_log')
    .update({ status: 'resolved', resolved_by: adminUserId, resolved_at: new Date().toISOString() })
    .eq('id', errorId);
  if (error) throw error;
}

export async function reviewError(errorId: string) {
  const { error } = await supabase
    .from('error_log')
    .update({ status: 'reviewed' })
    .eq('id', errorId);
  if (error) throw error;
}

// ---- Feature Requests ----

export async function fetchFeatureRequests(
  opts: { status?: string; page?: number; pageSize?: number } = {}
) {
  const { status, page = 0, pageSize = 50 } = opts;
  let query = supabase
    .from('feature_events')
    .select('*')
    .eq('event_type', 'feature_request')
    .order('occurred_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function updateFeatureRequestStatus(
  id: string,
  status: string,
  adminResponse: string | null,
  adminUserId: string
) {
  const { error } = await supabase
    .from('feature_events')
    .update({
      status,
      admin_response: adminResponse,
      responded_by: adminUserId,
      responded_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

// ---- Admin Notes ----

export async function fetchAdminNotes(targetUserId: string) {
  const { data, error } = await supabase
    .from('admin_notes')
    .select('*')
    .eq('target_user_id', targetUserId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createAdminNote(adminUserId: string, targetUserId: string, note: string) {
  const { error } = await supabase.from('admin_notes').insert({
    admin_user_id: adminUserId,
    target_user_id: targetUserId,
    note,
  });
  if (error) throw error;
}

// ---- Usage / Sessions ----

export async function fetchSessionStats(days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from('app_sessions')
    .select('started_at, user_id')
    .gte('started_at', since)
    .order('started_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function fetchNotificationStats(days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from('notification_log')
    .select('sent_at, status, channel')
    .gte('sent_at', since)
    .order('sent_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// ---- Audit Log ----

export async function logAdminAction(
  adminUserId: string,
  action: string,
  targetTable?: string,
  targetId?: string,
  metadata?: Record<string, unknown>
) {
  await supabase.from('admin_audit_log').insert({
    admin_user_id: adminUserId,
    action,
    target_table: targetTable,
    target_id: targetId,
    metadata: metadata ?? {},
  });
}
