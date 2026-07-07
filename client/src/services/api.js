const BASE_URL = "/api";

// AUTH ENDPOINTS
export const endpoints = {
  REGISTER_API:            BASE_URL + "/auth/register",
  LOGIN_API:               BASE_URL + "/auth/login",
  VERIFY_EMAIL_API:        BASE_URL + "/auth/verify-email",
  RESEND_OTP_API:          BASE_URL + "/auth/resend-otp",
  REFRESH_API:             BASE_URL + "/auth/refresh",
  ME_API:                  BASE_URL + "/auth/me",
  LOGOUT_API:              BASE_URL + "/auth/logout",
  FORGOT_PASSWORD_API:     BASE_URL + "/auth/forgot-password",
  VERIFY_RESET_OTP_API:   BASE_URL + "/auth/verify-reset-otp",
  RESET_PASSWORD_API:      BASE_URL + "/auth/reset-password",
  // COMPLAINT ENDPOINTS
  ANALYZE_COMPLAINT_API:   BASE_URL + "/complaints/analyze",
  // ISSUE ENDPOINTS
  CREATE_ISSUE_API:        BASE_URL + "/issues",
  MY_ISSUES_API:           BASE_URL + "/issues/mine",
  VIEWPORT_ISSUES_API:     BASE_URL + "/issues/viewport",
  ME_TOO_API:              (id) => BASE_URL + "/issues/" + id + "/me-too",
  // UPLOAD ENDPOINTS
  UPLOAD_SIGNATURE_API:    BASE_URL + "/upload/signature",
  // SUPER ADMIN ENDPOINTS
  SA_STATS_API:            BASE_URL + "/super-admin/stats",
  SA_QUEUE_API:            BASE_URL + "/super-admin/queue",
  SA_ISSUE_DETAIL_API:     (id) => BASE_URL + "/super-admin/issues/" + id + "/detail",
  SA_VERIFY_API:           (id) => BASE_URL + "/super-admin/issues/" + id + "/verify",
  SA_REJECT_API:           (id) => BASE_URL + "/super-admin/issues/" + id + "/reject",
  SA_DEPARTMENTS_API:      BASE_URL + "/super-admin/departments",
  SA_STAFF_API:            BASE_URL + "/super-admin/staff",
  // ADMIN ENDPOINTS
  ADMIN_STATS_API:         BASE_URL + "/admin/stats",
  ADMIN_QUEUE_API:         BASE_URL + "/admin/queue",
  ADMIN_WORKERS_API:       BASE_URL + "/admin/workers",
  ADMIN_ASSIGN_API:        (id) => BASE_URL + "/admin/issues/" + id + "/assign",
};

