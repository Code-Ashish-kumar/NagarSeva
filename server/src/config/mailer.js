const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/**
 * Send a 6-digit OTP to the given email.
 * @param {string} email
 * @param {string} otp
 * @param {'VERIFY_EMAIL'|'RESET_PASSWORD'} type
 */
async function sendOtpEmail(email, otp, type) {
  const subject =
    type === 'VERIFY_EMAIL'
      ? '✅ Verify your NagarSeva account'
      : '🔐 NagarSeva — Reset your password';

  const bodyText =
    type === 'VERIFY_EMAIL'
      ? `Your NagarSeva email verification code is: ${otp}\n\nThis code expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.`
      : `Your NagarSeva password reset code is: ${otp}\n\nThis code expires in ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.\nIf you didn't request this, ignore this email.`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'noreply@nagarseva.in',
    to:   email,
    subject,
    text: bodyText,
    html: buildOtpHtml(otp, type),
  });
}

function buildOtpHtml(otp, type) {
  const title =
    type === 'VERIFY_EMAIL' ? 'Email Verification' : 'Password Reset';
  const message =
    type === 'VERIFY_EMAIL'
      ? 'Enter this code to verify your NagarSeva account:'
      : 'Enter this code to reset your password:';

  return `
    <div style="font-family: 'Inter', Arial, sans-serif; max-width: 480px; margin: 0 auto; background: #0f172a; color: #f1f5f9; padding: 40px 32px; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #38bdf8; font-size: 28px; margin: 0;">🏙️ NagarSeva</h1>
        <p style="color: #64748b; margin: 4px 0 0;">${title}</p>
      </div>
      <p style="color: #94a3b8; font-size: 15px; line-height: 1.6;">${message}</p>
      <div style="background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #38bdf8; font-family: monospace;">${otp}</span>
      </div>
      <p style="color: #64748b; font-size: 13px; text-align: center;">
        This code expires in <strong style="color: #94a3b8;">${process.env.OTP_EXPIRY_MINUTES || 10} minutes</strong>.
        <br>Do not share it with anyone.
      </p>
    </div>
  `;
}

module.exports = { sendOtpEmail };
