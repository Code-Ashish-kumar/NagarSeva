const BASE_URL = "/api";

// AUTH ENDPOINTS
export const endpoints = {
  REGISTER_API:     BASE_URL + "/auth/register",
  LOGIN_API:        BASE_URL + "/auth/login",
  VERIFY_EMAIL_API: BASE_URL + "/auth/verify-email",
  RESEND_OTP_API:   BASE_URL + "/auth/resend-otp",
  REFRESH_API:      BASE_URL + "/auth/refresh",
  ME_API:           BASE_URL + "/auth/me",
  LOGOUT_API:       BASE_URL + "/auth/logout",
};
