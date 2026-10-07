import nodemailer from 'nodemailer';
import crypto from 'crypto';

/**
 * Creates an SMTP transporter configured with the Host Email service.
 * Server-only execution ensures EMAIL_PASS is never exposed to the client.
 */
function getSmtpTransporter() {
  const hostUser = process.env.EMAIL_USER;
  const hostPass = process.env.EMAIL_PASS;

  if (!hostUser || !hostPass) {
    throw new Error('Host email credentials (EMAIL_USER / EMAIL_PASS) are not configured.');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: hostUser,
      pass: hostPass,
    },
  });
}

/**
 * Generates a cryptographically random 6-digit verification code.
 */
export function generateSixDigitOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Sends a branded 6-digit verification email to the user.
 */
export async function sendOtpEmail({ recipientEmail, otpCode }) {
  const hostUser = process.env.EMAIL_USER;
  const transporter = getSmtpTransporter();

  const mailOptions = {
    from: `"Chat System" <${hostUser}>`,
    to: recipientEmail,
    subject: `Your Verification Code: ${otpCode}`,
    text: `Your Chat System 6-digit verification code is: ${otpCode}. This code will expire in 10 minutes.`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verification Code</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="min-height: 100vh; padding: 30px 15px;">
            <tr>
              <td align="center">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 480px; background-color: #ffffff; border-radius: 24px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0; overflow: hidden;">
                  
                  <!-- Top Gradient Accent Header -->
                  <tr>
                    <td style="padding: 32px 32px 24px 32px; background: linear-gradient(135deg, #1f6fb2 0%, #2ec4b6 100%); text-align: center;">
                      <div style="display: inline-block; width: 48px; height: 48px; background-color: rgba(255, 255, 255, 0.2); border-radius: 14px; line-height: 48px; font-size: 24px; text-align: center; margin-bottom: 12px; color: #ffffff;">
                        💬
                      </div>
                      <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">Chat System</h1>
                      <p style="margin: 6px 0 0 0; color: rgba(255, 255, 255, 0.9); font-size: 13px;">Email Verification Code</p>
                    </td>
                  </tr>

                  <!-- Card Body -->
                  <tr>
                    <td style="padding: 32px;">
                      <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 24px;">
                        Hello,
                      </p>
                      <p style="margin: 0 0 24px 0; color: #64748b; font-size: 14px; line-height: 22px;">
                        Thank you for registering. Please enter the following 6-digit verification code to confirm your email and complete your account setup:
                      </p>

                      <!-- 6-Digit Code Highlight Box -->
                      <div style="background-color: #f1f5f9; border: 1.5px dashed #cbd5e1; border-radius: 16px; padding: 20px; text-align: center; margin: 0 0 24px 0;">
                        <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #1f6fb2; display: inline-block; padding-left: 8px;">
                          ${otpCode}
                        </span>
                      </div>

                      <div style="background-color: #eff6ff; border-left: 3px solid #1f6fb2; padding: 12px 16px; border-radius: 8px; margin-bottom: 24px;">
                        <p style="margin: 0; color: #1e40af; font-size: 12px; line-height: 18px;">
                          ⏱️ <strong>Note:</strong> This code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.
                        </p>
                      </div>

                      <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 18px;">
                        If you did not request this registration code, please disregard this email.
                      </p>
                    </td>
                  </tr>

                  <!-- Card Footer -->
                  <tr>
                    <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
                      <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                        &copy; ${new Date().getFullYear()} Chat System. All rights reserved.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  };

  return transporter.sendMail(mailOptions);
}
