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
  // COMPLAINT ENDPOINTS
  ANALYZE_COMPLAINT_API:   BASE_URL + "/complaints/analyze",
  // ISSUE ENDPOINTS
  CREATE_ISSUE_API:        BASE_URL + "/issues",
  MY_ISSUES_API:           BASE_URL + "/issues/mine",
  VIEWPORT_ISSUES_API:     BASE_URL + "/issues/viewport",
  ME_TOO_API:              (id) => BASE_URL + "/issues/" + id + "/me-too",
  // UPLOAD ENDPOINTS
  UPLOAD_SIGNATURE_API:    BASE_URL + "/upload/signature",
};

