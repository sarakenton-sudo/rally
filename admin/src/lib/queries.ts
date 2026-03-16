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
  const { data, error } = await supabase.rpc('admin_dashboard_stats');
  if (error) throw error;
  const row = data?.[0];
  return {
    totalUsers: row?.total_users ?? 0,
    activeSessionsWeek: row?.active_sessions_week ?? 0,
    pendingErrors: row?.pending_errors ?? 0,
    pendingFeatureRequests: row?.pending_feature_requests ?? 0,
  };
}

// ---- Errors ----

export async function fetchErrors(
  opts: { status?: string; severity?: string; page?: number; pageSize?: number } = {}
) {
  const { status, severity, page = 0, pageSize = 50 } = opts;
  const { data, error } = await supabase.rpc('admin_list_errors', {
    status_filter: status || null,
    severity_filter: severity || null,
    page_size: pageSize,
    page_offset: page * pageSize,
  });
  if (error) throw error;
  return data ?? [];
}

export async function resolveError(errorId: string, adminUserId: string) {
  const { error } = await supabase.rpc('admin_update_error', {
    error_id: errorId,
    new_status: 'resolved',
    admin_id: adminUserId,
  });
  if (error) throw error;
}

export async function reviewError(errorId: string) {
  const { error } = await supabase.rpc('admin_update_error', {
    error_id: errorId,
    new_status: 'reviewed',
  });
  if (error) throw error;
}

// ---- Feature Requests ----

export async function fetchFeatureRequests(
  opts: { status?: string; page?: number; pageSize?: number } = {}
) {
  const { status, page = 0, pageSize = 50 } = opts;
  const { data, error } = await supabase.rpc('admin_list_feature_requests', {
    status_filter: status || null,
    page_size: pageSize,
    page_offset: page * pageSize,
  });
  if (error) throw error;
  return data ?? [];
}

export async function updateFeatureRequestStatus(
  id: string,
  status: string,
  adminResponse: string | null,
  adminUserId: string
) {
  const { error } = await supabase.rpc('admin_update_feature_request', {
    request_id: id,
    new_status: status,
    response_text: adminResponse,
    admin_id: adminUserId,
  });
  if (error) throw error;
}

// ---- Admin Notes ----

export async function fetchAdminNotes(targetUserId: string) {
  const { data, error } = await supabase.rpc('admin_list_notes', {
    target_id: targetUserId,
  });
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
  const { data, error } = await supabase.rpc('admin_session_stats', {
    days_back: days,
  });
  if (error) throw error;
  return data ?? [];
}

export async function fetchNotificationStats(days = 30) {
  const { data, error } = await supabase.rpc('admin_notification_stats', {
    days_back: days,
  });
  if (error) throw error;
  return data ?? [];
}

// ---- Forwarded Emails (Import Report) ----

export async function fetchEmails(
  opts: { source?: string; page?: number; pageSize?: number } = {}
) {
  const { source, page = 0, pageSize = 50 } = opts;
  const { data, error } = await supabase.rpc('admin_list_emails', {
    source_filter: source || null,
    page_size: pageSize,
    page_offset: page * pageSize,
  });
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
