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
    totalReferrals: row?.total_referrals ?? 0,
    convertedReferrals: row?.converted_referrals ?? 0,
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

// ---- Import Attempts Report ----

export async function fetchImportReport(
  opts: { type?: string; page?: number; pageSize?: number } = {}
) {
  const { type, page = 0, pageSize = 50 } = opts;
  const { data, error } = await supabase.rpc('admin_import_report', {
    type_filter: type || null,
    page_size: pageSize,
    page_offset: page * pageSize,
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

// ---- Notification Templates ----

export async function fetchNotificationTemplates(
  opts: { channel?: string; category?: string; status?: string; page?: number; pageSize?: number } = {}
) {
  const { channel, category, status, page = 0, pageSize = 50 } = opts;
  const { data, error } = await supabase.rpc('admin_list_notification_templates', {
    channel_filter: channel || null,
    category_filter: category || null,
    status_filter: status || null,
    page_size: pageSize,
    page_offset: page * pageSize,
  });
  if (error) throw error;
  return data ?? [];
}

export async function fetchNotificationTemplate(templateId: string) {
  const { data, error } = await supabase.rpc('admin_get_notification_template', {
    template_id: templateId,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function updateNotificationTemplate(
  templateId: string,
  title: string,
  body: string,
  isActive: boolean,
  status: string,
  adminUserId: string,
  changeNote?: string
) {
  const { error } = await supabase.rpc('admin_update_notification_template', {
    p_template_id: templateId,
    new_title: title,
    new_body: body,
    new_is_active: isActive,
    new_status: status,
    admin_id: adminUserId,
    change_note: changeNote || null,
  });
  if (error) throw error;
}

export async function revertNotificationTemplate(
  templateId: string,
  targetVersion: number,
  adminUserId: string
) {
  const { error } = await supabase.rpc('admin_revert_notification_template', {
    p_template_id: templateId,
    target_version: targetVersion,
    admin_id: adminUserId,
  });
  if (error) throw error;
}

export async function fetchTemplateVersions(templateId: string) {
  const { data, error } = await supabase.rpc('admin_list_template_versions', {
    p_template_id: templateId,
  });
  if (error) throw error;
  return data ?? [];
}

export async function fetchDeliveryLog(
  opts: { channel?: string; type?: string; status?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number } = {}
) {
  const { channel, type, status, dateFrom, dateTo, page = 0, pageSize = 50 } = opts;
  const { data, error } = await supabase.rpc('admin_list_delivery_log', {
    channel_filter: channel || null,
    type_filter: type || null,
    status_filter: status || null,
    date_from: dateFrom || null,
    date_to: dateTo || null,
    page_size: pageSize,
    page_offset: page * pageSize,
  });
  if (error) throw error;
  return data ?? [];
}

// ---- Email Templates ----

export async function fetchEmailTemplates() {
  const { data, error } = await supabase.rpc('admin_list_email_templates');
  if (error) throw error;
  return data ?? [];
}

export async function fetchEmailTemplate(templateId: string) {
  const { data, error } = await supabase.rpc('admin_get_email_template', {
    template_id: templateId,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function updateEmailTemplate(
  templateId: string,
  subject: string,
  htmlBody: string,
  adminUserId: string
) {
  const { error } = await supabase.rpc('admin_update_email_template', {
    template_id: templateId,
    new_subject: subject,
    new_html_body: htmlBody,
    admin_id: adminUserId,
  });
  if (error) throw error;
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
