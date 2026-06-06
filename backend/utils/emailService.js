const { Resend } = require('resend');
const logger = require('./logger');
const { logEmail } = require('./notificationLogger');

const resendClient = new Resend(process.env.RESEND_API_KEY);

async function resendSend({ to, subject, html, text, from, reply_to, userId, type }) {
  const sender = from || 'Emorii <noreply@emorii.com>';
  let data;
  try {
    const result = await resendClient.emails.send({
      from: sender,
      to: [to],
      subject,
      html,
      ...(text ? { text } : {}),
      ...(reply_to ? { reply_to } : {}),
    });
    if (result.error) {
      const errMessage = JSON.stringify(result.error).slice(0, 500);
      logEmail({ to, subject, html, userId, type, status: 'failed', errorMessage: errMessage }).catch(() => {});
      throw new Error(errMessage);
    }
    data = result.data;
  } catch (err) {
    logEmail({ to, subject, html, userId, type, status: 'failed', errorMessage: err?.message }).catch(() => {});
    throw err;
  }
  logEmail({ to, subject, html, userId, type, status: 'sent', providerId: data?.id || null }).catch(() => {});
  return data;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BRAND = {
  gradientStart: '#059669',   // emerald
  gradientEnd:   '#0EA5E9',   // sky blue
  primary:       '#059669',
  primaryLight:  '#E8FAF5',
  accent:        '#0EA5E9',
  accentLight:   '#E0F2FE',
};

const LOGO_URL = process.env.RENDER_EXTERNAL_URL
  ? `${process.env.RENDER_EXTERNAL_URL}/public/logo.png`
  : '';

const LOGO_BLOCK = LOGO_URL
  ? `<img src="${LOGO_URL}" alt="Emorii" width="120" height="120"
       style="border-radius: 20px; display: block; margin: 0 auto 14px auto;" />`
  : '';

const emailHeader = (title, subtitle = '') => `
  <tr>
    <td style="background: linear-gradient(135deg, ${BRAND.gradientStart} 0%, ${BRAND.gradientEnd} 100%);
               padding: 40px 30px; text-align: center;">
      ${LOGO_BLOCK}
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.3px;">
        ${title}
      </h1>
      ${subtitle ? `<p style="margin: 10px 0 0 0; color: rgba(255,255,255,0.88); font-size: 15px;">${escapeHtml(subtitle)}</p>` : ''}
    </td>
  </tr>
`;

const emailFooter = () => `
  <tr>
    <td style="background-color: #F8F9FA; padding: 28px 40px; border-top: 1px solid #E9ECEF; text-align: center;">
      <p style="margin: 0 0 10px 0; color: #666666; font-size: 13px;">
        Need help? <a href="mailto:support@emorii.com"
          style="color: ${BRAND.primary}; text-decoration: none; font-weight: 600;">
          support@emorii.com
        </a>
      </p>
      <div style="margin: 12px 0;">
        <a href="#" style="color: #999999; font-size: 11px; text-decoration: none; margin: 0 8px;">Privacy Policy</a>
        <span style="color: #CCCCCC;">|</span>
        <a href="#" style="color: #999999; font-size: 11px; text-decoration: none; margin: 0 8px;">Terms of Service</a>
      </div>
      <p style="margin: 0; color: #AAAAAA; font-size: 11px; line-height: 1.5;">
        © 2025 Emorii. All rights reserved.<br/>
        Making meaningful connections across Africa and beyond.
      </p>
    </td>
  </tr>
`;

const emailShell = (bodyRows) => `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f0f4f8;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8;padding:40px 20px;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0"
            style="background-color:#ffffff;border-radius:16px;overflow:hidden;
                   box-shadow:0 6px 24px rgba(0,0,0,0.10);">
            ${bodyRows}
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
`;

const getOTPEmailTemplate = (userName, otpCode) => emailShell(`
  ${emailHeader('Emorii', 'Connect with Your Perfect Match')}
  <tr>
    <td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px; font-weight: 700;">
        Hello ${escapeHtml(userName) || 'there'}! 👋
      </h2>
      <p style="margin: 0 0 28px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        We received a request to verify your email address.
        Use the code below to complete your registration:
      </p>

      <!-- OTP Box -->
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding: 28px 0;">
            <div style="background: linear-gradient(135deg, ${BRAND.primaryLight} 0%, ${BRAND.accentLight} 100%);
                        border: 2px dashed ${BRAND.accent};
                        border-radius: 14px; padding: 28px 32px; display: inline-block;">
              <p style="margin: 0 0 8px 0; color: #555555; font-size: 13px;
                         text-transform: uppercase; letter-spacing: 1.2px; font-weight: 600;">
                Your Verification Code
              </p>
              <p style="margin: 0; color: ${BRAND.primary}; font-size: 44px; font-weight: 800;
                         letter-spacing: 10px; font-family: 'Courier New', monospace;">
                ${otpCode}
              </p>
            </div>
          </td>
        </tr>
      </table>

      <p style="margin: 20px 0; color: #555555; font-size: 15px; line-height: 1.7;">
        This code expires in <strong style="color: ${BRAND.primary};">10 minutes</strong>.
        If you didn't request this, please ignore this email.
      </p>

      <div style="background-color: #FFF9E6; border-left: 4px solid #F59E0B;
                  padding: 14px 18px; margin: 24px 0; border-radius: 6px;">
        <p style="margin: 0; color: #92400E; font-size: 13px; line-height: 1.6;">
          <strong>🔒 Security Tip:</strong> Never share this code with anyone.
          Emorii will never ask for your verification code.
        </p>
      </div>
    </td>
  </tr>
  ${emailFooter()}
`);

const getWelcomeEmailTemplate = (userName) => emailShell(`
  ${emailHeader('Welcome to Emorii! 🎉')}
  <tr>
    <td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px; font-weight: 700;">
        Hi ${escapeHtml(userName)}! 👋
      </h2>
      <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        We're thrilled to have you join our community! Emorii is more than just a dating
        app — it's a platform where authentic connections happen.
      </p>

      <h3 style="margin: 28px 0 14px 0; color: #1a1a1a; font-size: 17px; font-weight: 700;">
        Get Started:
      </h3>
      <ul style="color: #555555; font-size: 15px; line-height: 1.9; padding-left: 20px; margin: 0 0 32px 0;">
        <li>Complete your profile with great photos</li>
        <li>Share your interests and what makes you unique</li>
        <li>Start swiping to find your perfect match</li>
        <li>Send friend requests and start chatting</li>
      </ul>

      <div style="text-align: center; margin: 36px 0;">
        <a href="#" style="display: inline-block;
           background: linear-gradient(135deg, ${BRAND.gradientStart} 0%, ${BRAND.gradientEnd} 100%);
           color: #ffffff; text-decoration: none; padding: 16px 42px;
           border-radius: 32px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px;">
          Complete Your Profile →
        </a>
      </div>

      <p style="margin: 24px 0 0 0; color: #AAAAAA; font-size: 14px; text-align: center; font-style: italic;">
        "Your perfect match is just a swipe away!" 💚
      </p>
    </td>
  </tr>
  ${emailFooter()}
`);

const getPasswordResetEmailTemplate = (userName, resetLink) => emailShell(`
  ${emailHeader('Password Reset Request')}
  <tr>
    <td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px; font-weight: 700;">
        Hi ${escapeHtml(userName)},
      </h2>
      <p style="margin: 0 0 24px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        We received a request to reset your password.
        Click the button below to create a new one:
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetLink}" style="display: inline-block;
           background: linear-gradient(135deg, ${BRAND.gradientStart} 0%, ${BRAND.gradientEnd} 100%);
           color: #ffffff; text-decoration: none; padding: 16px 42px;
           border-radius: 32px; font-size: 16px; font-weight: 700;">
          Reset Password
        </a>
      </div>

      <p style="margin: 20px 0; color: #555555; font-size: 14px; line-height: 1.7;">
        This link expires in <strong>30 minutes</strong>.
        If you didn't request a password reset, you can safely ignore this email.
      </p>

      <div style="background-color: #FFF9E6; border-left: 4px solid #F59E0B;
                  padding: 14px 18px; margin: 20px 0; border-radius: 6px;">
        <p style="margin: 0; color: #92400E; font-size: 13px;">
          For security, never share your password or reset link with anyone.
        </p>
      </div>
    </td>
  </tr>
  ${emailFooter()}
`);

const getBanNotificationTemplate = (userName, reason) => emailShell(`
  <tr>
    <td style="background: linear-gradient(135deg, #DC2626 0%, #EF4444 100%);
               padding: 40px 30px; text-align: center;">
      ${LOGO_BLOCK}
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
        Account Suspended
      </h1>
    </td>
  </tr>
  <tr>
    <td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px;">Hi ${escapeHtml(userName)},</h2>
      <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        Your Emorii account has been suspended due to a violation of our Community Guidelines.
      </p>
      <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        <strong>Reason:</strong> ${escapeHtml(reason) || 'Violation of community guidelines'}
      </p>
      <div style="background-color: #FFF9E6; border-left: 4px solid #F59E0B;
                  padding: 14px 18px; margin: 20px 0; border-radius: 6px;">
        <p style="margin: 0; color: #92400E; font-size: 14px; line-height: 1.6;">
          <strong>What happens next?</strong> You can submit an appeal through the Emorii
          app to have your case reviewed by our team.
        </p>
      </div>
      <p style="margin: 16px 0; color: #555555; font-size: 15px; line-height: 1.7;">
        If you believe this was a mistake, submit an appeal with your explanation.
        Our team will respond within 5–7 business days.
      </p>
    </td>
  </tr>
  ${emailFooter()}
`);

const getUnbanNotificationTemplate = (userName) => emailShell(`
  ${emailHeader("You're Back! 🎉")}
  <tr>
    <td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px;">Hi ${escapeHtml(userName)},</h2>
      <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        Great news! Your appeal has been approved and your account has been restored.
        You can now log back into Emorii.
      </p>
      <div style="background-color: ${BRAND.primaryLight}; border-left: 4px solid ${BRAND.primary};
                  padding: 14px 18px; margin: 20px 0; border-radius: 6px;">
        <p style="margin: 0; color: #065F46; font-size: 14px; line-height: 1.6;">
          <strong>Welcome back!</strong> Please review our Community Guidelines to ensure
          you understand our policies.
        </p>
      </div>
      <p style="margin: 16px 0; color: #555555; font-size: 15px; line-height: 1.7;">
        We're excited to have you back. Remember to treat all members with respect
        and follow our guidelines.
      </p>
    </td>
  </tr>
  ${emailFooter()}
`);

const getAppealDecisionTemplate = (userName, approved, adminResponse) => {
  const headerBg  = approved ? `linear-gradient(135deg, ${BRAND.gradientStart} 0%, ${BRAND.gradientEnd} 100%)` : 'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)';
  const noteBg    = approved ? BRAND.primaryLight : '#FEE2E2';
  const noteBorder= approved ? BRAND.primary      : '#DC2626';
  const noteText  = approved ? '#065F46'           : '#991B1B';
  const title     = approved ? 'Appeal Approved ✓' : 'Appeal Decision';

  return emailShell(`
    <tr>
      <td style="background: ${headerBg}; padding: 40px 30px; text-align: center;">
        ${LOGO_BLOCK}
        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">${title}</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 48px 40px;">
        <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px;">Hi ${escapeHtml(userName)},</h2>
        <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.7;">
          Your appeal has been reviewed by our team. Here is their decision:
        </p>
        <div style="background-color: ${noteBg}; border-left: 4px solid ${noteBorder};
                    padding: 14px 18px; margin: 20px 0; border-radius: 6px;">
          <p style="margin: 0; color: ${noteText}; font-size: 14px; line-height: 1.7;">
            ${escapeHtml(adminResponse) || (approved
              ? 'Your appeal has been approved. Your account has been restored.'
              : 'Your appeal has been reviewed. Please review our Community Guidelines for next steps.'
            )}
          </p>
        </div>
        ${!approved ? `
        <p style="margin: 16px 0; color: #555555; font-size: 15px; line-height: 1.7;">
          You can submit a new appeal in 30 days if you wish to challenge this decision.
        </p>` : ''}
      </td>
    </tr>
    ${emailFooter()}
  `);
};

const sendOTP = async (email, otp) => {
  try {
    await resendSend({
      to: email,
      subject: '🔐 Your Emorii Verification Code',
      html: getOTPEmailTemplate('there', otp),
    });
    logger.log('OTP sent successfully');
  } catch (error) {
    logger.error('Failed to send OTP:', error);
    throw error;
  }
};

const sendWelcomeEmail = async (email, userName) => {
  try {
    await resendSend({
      to: email,
      subject: '🎉 Welcome to Emorii — Let\'s Find Your Match!',
      html: getWelcomeEmailTemplate(userName),
    });
    logger.log('Welcome email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending welcome email:', error);
    throw new Error('Failed to send welcome email');
  }
};

const sendPasswordResetEmail = async (email, userName, resetToken) => {
  try {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    await resendSend({
      to: email,
      subject: '🔒 Reset Your Emorii Password',
      html: getPasswordResetEmailTemplate(userName, resetLink),
    });
    logger.log('Password reset email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

const sendBanNotificationEmail = async (email, userName, reason) => {
  try {
    await resendSend({
      to: email,
      subject: '⚠️ Your Emorii Account Has Been Suspended',
      html: getBanNotificationTemplate(userName, reason),
    });
    logger.log('Ban notification email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending ban notification email:', error);
    throw new Error('Failed to send ban notification email');
  }
};

const sendUnbanNotificationEmail = async (email, userName) => {
  try {
    await resendSend({
      to: email,
      subject: '✓ Your Appeal Was Approved — Welcome Back!',
      html: getUnbanNotificationTemplate(userName),
    });
    logger.log('Unban notification email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending unban notification email:', error);
    throw new Error('Failed to send unban notification email');
  }
};

const sendAppealDecisionEmail = async (email, userName, approved, adminResponse) => {
  try {
    await resendSend({
      to: email,
      subject: approved ? '✓ Your Appeal Was Approved!' : '⚠️ Appeal Decision',
      html: getAppealDecisionTemplate(userName, approved, adminResponse),
    });
    logger.log('Appeal decision email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending appeal decision email:', error);
    throw new Error('Failed to send appeal decision email');
  }
};

const getVerificationApprovedTemplate = (userName) => emailShell(`
  ${emailHeader('Identity Verified! ✓', 'You are now a verified Emorii member')}
  <tr>
    <td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px; font-weight: 700;">
        Congratulations, ${escapeHtml(userName)}! 🎉
      </h2>
      <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        Your ID verification has been reviewed and approved by our team.
        You now have the <strong style="color: ${BRAND.primary};">Verified Badge</strong> on your profile!
      </p>
      <div style="background-color: ${BRAND.primaryLight}; border-left: 4px solid ${BRAND.primary};
                  padding: 14px 18px; margin: 24px 0; border-radius: 6px;">
        <p style="margin: 0; color: #065F46; font-size: 14px; line-height: 1.6;">
          <strong>What this means:</strong> Your verified badge signals trust to other members,
          increases your match rate, and gives you priority visibility in search results.
        </p>
      </div>
      <p style="margin: 20px 0; color: #555555; font-size: 15px; line-height: 1.7;">
        Thank you for taking the time to verify your identity — it makes Emorii a safer
        and more authentic space for everyone.
      </p>
    </td>
  </tr>
  ${emailFooter()}
`);

const getVerificationRejectedTemplate = (userName, reason) => emailShell(`
  <tr>
    <td style="background: linear-gradient(135deg, #F59E0B 0%, #EF4444 100%);
               padding: 40px 30px; text-align: center;">
      ${LOGO_BLOCK}
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Verification Update</h1>
    </td>
  </tr>
  <tr>
    <td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px;">Hi ${escapeHtml(userName)},</h2>
      <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        Thank you for submitting your verification request. Unfortunately, after reviewing your
        submission, our team was unable to approve it at this time.
      </p>
      <div style="background-color: #FFF9E6; border-left: 4px solid #F59E0B;
                  padding: 14px 18px; margin: 20px 0; border-radius: 6px;">
        <p style="margin: 0; color: #92400E; font-size: 14px; line-height: 1.6;">
          <strong>Reason:</strong> ${escapeHtml(reason) || 'The submitted photos did not meet our verification requirements.'}
        </p>
      </div>
      <h3 style="margin: 28px 0 12px 0; color: #1a1a1a; font-size: 16px;">How to reapply successfully:</h3>
      <ul style="color: #555555; font-size: 14px; line-height: 1.9; padding-left: 20px; margin: 0 0 24px 0;">
        <li>Use a clear, front-facing photo of a valid government ID</li>
        <li>Ensure the ID is not expired, blurry, or partially covered</li>
        <li>Take your selfie in good lighting with your face clearly visible</li>
        <li>Make sure both photos are recent and unedited</li>
      </ul>
      <p style="margin: 16px 0; color: #555555; font-size: 15px; line-height: 1.7;">
        You can resubmit your verification from the <strong>Profile → Verification</strong> section
        of the Emorii app. We look forward to verifying you!
      </p>
    </td>
  </tr>
  ${emailFooter()}
`);

const getWarningEmailTemplate = (userName, reason) => emailShell(`
  <tr>
    <td style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%);
               padding: 40px 30px; text-align: center;">
      ${LOGO_BLOCK}
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Community Guideline Warning</h1>
    </td>
  </tr>
  <tr>
    <td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px;">Hi ${escapeHtml(userName)},</h2>
      <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        Our moderation team has reviewed a report related to your account and issued an official
        warning for behaviour that violates our Community Guidelines.
      </p>
      <div style="background-color: #FFF9E6; border-left: 4px solid #F59E0B;
                  padding: 14px 18px; margin: 20px 0; border-radius: 6px;">
        <p style="margin: 0; color: #92400E; font-size: 14px; line-height: 1.6;">
          <strong>Reason:</strong> ${escapeHtml(reason) || 'Behaviour that violates Emorii Community Guidelines.'}
        </p>
      </div>
      <p style="margin: 16px 0; color: #555555; font-size: 15px; line-height: 1.7;">
        This is a formal warning. If similar behaviour continues, your account may be suspended
        or permanently banned. Please review our <strong>Community Guidelines</strong> in the app.
      </p>
      <p style="margin: 16px 0; color: #AAAAAA; font-size: 13px;">
        If you believe this warning was issued in error, you can submit an appeal through the app.
      </p>
    </td>
  </tr>
  ${emailFooter()}
`);

const getSuspensionEmailTemplate = (userName, reason, durationDays) => emailShell(`
  <tr>
    <td style="background: linear-gradient(135deg, #DC2626 0%, #F59E0B 100%);
               padding: 40px 30px; text-align: center;">
      ${LOGO_BLOCK}
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Account Temporarily Suspended</h1>
    </td>
  </tr>
  <tr>
    <td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px;">Hi ${escapeHtml(userName)},</h2>
      <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        Following a review of your account, your access to Emorii has been
        temporarily suspended for <strong>${durationDays || 7} day${durationDays !== 1 ? 's' : ''}</strong>.
      </p>
      <div style="background-color: #FFF9E6; border-left: 4px solid #F59E0B;
                  padding: 14px 18px; margin: 20px 0; border-radius: 6px;">
        <p style="margin: 0; color: #92400E; font-size: 14px; line-height: 1.6;">
          <strong>Reason:</strong> ${escapeHtml(reason) || 'Repeated violation of Emorii Community Guidelines.'}
        </p>
      </div>
      <p style="margin: 16px 0; color: #555555; font-size: 15px; line-height: 1.7;">
        Your account will be automatically restored after the suspension period.
        During this time you will not be able to log in or access your matches and messages.
      </p>
      <p style="margin: 16px 0; color: #555555; font-size: 15px; line-height: 1.7;">
        If you believe this suspension was made in error, you can submit an appeal through the Emorii app.
        Our team will respond within 5–7 business days.
      </p>
    </td>
  </tr>
  ${emailFooter()}
`);

const getVerificationRevokedTemplate = (userName, reason) => emailShell(`
  <tr>
    <td style="background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%);
               padding: 40px 30px; text-align: center;">
      ${LOGO_BLOCK}
      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Verified Badge Removed</h1>
    </td>
  </tr>
  <tr>
    <td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px;">Hi ${escapeHtml(userName)},</h2>
      <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        We're writing to let you know that your verified badge on Emorii has been removed
        following a review by our trust &amp; safety team.
      </p>
      <div style="background-color: #FEF2F2; border-left: 4px solid #DC2626;
                  padding: 14px 18px; margin: 20px 0; border-radius: 6px;">
        <p style="margin: 0; color: #991B1B; font-size: 14px; line-height: 1.6;">
          <strong>Reason:</strong> ${escapeHtml(reason) || 'Your verification no longer meets our community standards.'}
        </p>
      </div>
      <p style="margin: 20px 0; color: #555555; font-size: 15px; line-height: 1.7;">
        Your account is still active, but you will no longer appear as verified to other members
        and access to the discovery feed will be paused until you re-verify.
      </p>
      <h3 style="margin: 28px 0 12px 0; color: #1a1a1a; font-size: 16px;">What happens next</h3>
      <ul style="color: #555555; font-size: 14px; line-height: 1.9; padding-left: 20px; margin: 0 0 24px 0;">
        <li>You can submit a new verification video at any time from <strong>Profile → Get Verified</strong></li>
        <li>Use a clear, well-lit recording that matches the photos on your profile</li>
        <li>If you believe this was a mistake, reply to this email or contact support from the app</li>
      </ul>
      <p style="margin: 16px 0; color: #555555; font-size: 15px; line-height: 1.7;">
        We take trust seriously to keep Emorii a safe space for everyone. Thank you for understanding.
      </p>
    </td>
  </tr>
  ${emailFooter()}
`);

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const sendVerificationApprovedEmail = async (email, userName) => {
  try {
    await resendSend({
      to: email,
      subject: '✓ Your Emorii Profile is Verified!',
      html: getVerificationApprovedTemplate(userName),
    });
    logger.log('Verification approved email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending verification approved email:', error);
  }
};

const sendVerificationRejectedEmail = async (email, userName, reason) => {
  try {
    await resendSend({
      to: email,
      subject: '⚠️ Emorii Verification Update',
      html: getVerificationRejectedTemplate(userName, reason),
    });
    logger.log('Verification rejected email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending verification rejected email:', error);
  }
};

const sendVerificationRevokedEmail = async (email, userName, reason) => {
  try {
    await resendSend({
      to: email,
      subject: 'Your Emorii verified badge has been removed',
      html: getVerificationRevokedTemplate(userName, reason),
    });
    logger.log('Verification revoked email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending verification revoked email:', error);
  }
};

const sendWarningEmail = async (email, userName, reason) => {
  try {
    await resendSend({
      to: email,
      subject: '⚠️ Community Guideline Warning — Emorii',
      html: getWarningEmailTemplate(userName, reason),
    });
    logger.log('Warning email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending warning email:', error);
  }
};

const sendSuspensionEmail = async (email, userName, reason, durationDays) => {
  try {
    await resendSend({
      to: email,
      subject: '⛔ Your Emorii Account Has Been Temporarily Suspended',
      html: getSuspensionEmailTemplate(userName, reason, durationDays),
    });
    logger.log('Suspension email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending suspension email:', error);
  }
};

const getSuspensionLiftedTemplate = (userName) => emailShell(`
  ${emailHeader("Suspension Lifted — Welcome Back! 🎉", "Your access has been automatically restored")}
  <tr>
    <td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px; font-weight: 700;">
        Hi ${escapeHtml(userName)},
      </h2>
      <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        Great news — your temporary suspension period has ended and your Emorii account
        has been <strong style="color: ${BRAND.primary};">automatically restored</strong>.
        You can log back in and pick up right where you left off.
      </p>
      <div style="background-color: ${BRAND.primaryLight}; border-left: 4px solid ${BRAND.primary};
                  padding: 14px 18px; margin: 24px 0; border-radius: 6px;">
        <p style="margin: 0; color: #065F46; font-size: 14px; line-height: 1.6;">
          <strong>Friendly reminder:</strong> Please review our Community Guidelines to help us
          keep Emorii a safe and welcoming space for everyone.
        </p>
      </div>
      <div style="text-align: center; margin: 36px 0;">
        <a href="#" style="display: inline-block;
           background: linear-gradient(135deg, ${BRAND.gradientStart} 0%, ${BRAND.gradientEnd} 100%);
           color: #ffffff; text-decoration: none; padding: 16px 42px;
           border-radius: 32px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px;">
          Open Emorii →
        </a>
      </div>
    </td>
  </tr>
  ${emailFooter()}
`);

const sendSuspensionLiftedEmail = async (email, userName) => {
  try {
    await resendSend({
      to: email,
      subject: '✅ Your Emorii Suspension Has Been Lifted',
      html: getSuspensionLiftedTemplate(userName),
    });
    logger.log('Suspension lifted email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending suspension lifted email:', error);
  }
};

const getNewMatchTemplate = (userName, matchName, matchPhoto) => emailShell(`
  ${emailHeader("It's a Match! 💚", `You and ${matchName} liked each other`)}
  <tr>
    <td style="padding: 48px 40px; text-align: center;">
      ${matchPhoto ? `
      <div style="margin: 0 auto 24px auto; width: 100px; height: 100px; border-radius: 50%;
                  overflow: hidden; border: 4px solid ${BRAND.primary}; display: inline-block;">
        <img src="${escapeHtml(matchPhoto)}" alt="${escapeHtml(matchName)}" width="100" height="100"
             style="object-fit: cover; width: 100%; height: 100%;" />
      </div>` : `
      <div style="margin: 0 auto 24px auto; width: 100px; height: 100px; border-radius: 50%;
                  background: linear-gradient(135deg, ${BRAND.gradientStart}, ${BRAND.gradientEnd});
                  display: inline-flex; align-items: center; justify-content: center;
                  font-size: 48px; line-height: 100px;">💚</div>`}
      <h2 style="margin: 0 0 12px 0; color: #1a1a1a; font-size: 24px; font-weight: 700;">
        Hi ${escapeHtml(userName)}! 👋
      </h2>
      <p style="margin: 0 0 20px 0; color: #555555; font-size: 17px; line-height: 1.7;">
        You and <strong style="color: ${BRAND.primary};">${escapeHtml(matchName)}</strong> have matched on Emorii!
        Don't leave them waiting — say hello first and start the conversation.
      </p>
      <div style="background-color: ${BRAND.primaryLight}; border-radius: 12px;
                  padding: 16px 20px; margin: 24px 0; text-align: left;">
        <p style="margin: 0; color: #065F46; font-size: 14px; line-height: 1.6;">
          💡 <strong>Ice Breaker tip:</strong> People who message within the first hour are
          3× more likely to get a reply. Go for it!
        </p>
      </div>
      <div style="text-align: center; margin: 36px 0;">
        <a href="#" style="display: inline-block;
           background: linear-gradient(135deg, ${BRAND.gradientStart} 0%, ${BRAND.gradientEnd} 100%);
           color: #ffffff; text-decoration: none; padding: 16px 42px;
           border-radius: 32px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px;">
          Message ${escapeHtml(matchName)} →
        </a>
      </div>
    </td>
  </tr>
  ${emailFooter()}
`);

const sendNewMatchEmail = async (email, userName, matchName, matchPhoto) => {
  try {
    await resendSend({
      to: email,
      subject: `💚 You matched with ${matchName} on Emorii!`,
      html: getNewMatchTemplate(userName, matchName, matchPhoto),
    });
    logger.log('New match email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending new match email:', error);
  }
};

const getSupportReplyTemplate = (userName, replyContent, ticketSubject) => emailShell(`
  ${emailHeader('Support Reply from Emorii 💬', 'Our team has responded to your enquiry')}
  <tr>
    <td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px; font-weight: 700;">
        Hi ${escapeHtml(userName)},
      </h2>
      <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        Our support team has replied to your ticket${ticketSubject ? ` regarding <strong>&ldquo;${escapeHtml(ticketSubject)}&rdquo;</strong>` : ''}.
        Here is their message:
      </p>
      <div style="background-color: #F8F9FA; border: 1px solid #E9ECEF; border-radius: 12px;
                  padding: 24px 28px; margin: 24px 0;">
        <p style="margin: 0 0 10px 0; color: #AAAAAA; font-size: 11px; font-weight: 700;
                   text-transform: uppercase; letter-spacing: 1px;">Emorii Support</p>
        <p style="margin: 0; color: #333333; font-size: 15px; line-height: 1.8; white-space: pre-wrap;">
          ${escapeHtml(replyContent)}
        </p>
      </div>
      <p style="margin: 20px 0; color: #555555; font-size: 15px; line-height: 1.7;">
        You can reply to this conversation directly from within the Emorii app under
        <strong>Settings → Help & Support</strong>.
      </p>
      <div style="text-align: center; margin: 36px 0;">
        <a href="#" style="display: inline-block;
           background: linear-gradient(135deg, ${BRAND.gradientStart} 0%, ${BRAND.gradientEnd} 100%);
           color: #ffffff; text-decoration: none; padding: 16px 42px;
           border-radius: 32px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px;">
          View Conversation →
        </a>
      </div>
    </td>
  </tr>
  ${emailFooter()}
`);

const sendSupportReplyEmail = async (email, userName, replyContent, ticketSubject) => {
  try {
    await resendSend({
      from: 'Emorii Support <support@emorii.com>',
      reply_to: 'support@emorii.com',
      to: email,
      subject: '💬 Emorii Support has replied to your ticket',
      html: getSupportReplyTemplate(userName, replyContent, ticketSubject),
      type: 'support_reply',
    });
    logger.log('Support reply email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending support reply email:', error);
  }
};

const getNewTicketNotificationTemplate = ({ userName, userEmail, category, subject, message, ticketId }) => emailShell(`
  ${emailHeader('New Support Ticket 🎫', 'A user needs your help')}
  <tr>
    <td style="padding: 40px 40px 0 40px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding: 12px 16px; background: #F8F9FA; border-radius: 8px; margin-bottom: 8px;">
            <p style="margin: 0; color: #888; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">From</p>
            <p style="margin: 4px 0 0 0; color: #1a1a1a; font-size: 15px; font-weight: 600;">${escapeHtml(userName)} &lt;${escapeHtml(userEmail)}&gt;</p>
          </td>
        </tr>
        <tr><td style="height: 8px;"></td></tr>
        <tr>
          <td style="padding: 12px 16px; background: #F8F9FA; border-radius: 8px;">
            <p style="margin: 0; color: #888; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Category</p>
            <p style="margin: 4px 0 0 0; color: #1a1a1a; font-size: 15px; font-weight: 600;">${escapeHtml(category)}</p>
          </td>
        </tr>
        <tr><td style="height: 8px;"></td></tr>
        <tr>
          <td style="padding: 12px 16px; background: #F8F9FA; border-radius: 8px;">
            <p style="margin: 0; color: #888; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Subject</p>
            <p style="margin: 4px 0 0 0; color: #1a1a1a; font-size: 15px; font-weight: 600;">${escapeHtml(subject)}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding: 24px 40px 0 40px;">
      <p style="margin: 0 0 10px 0; color: #888; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Message</p>
      <div style="background: #fff; border: 1px solid #E9ECEF; border-radius: 12px; padding: 24px 28px;">
        <p style="margin: 0; color: #333; font-size: 15px; line-height: 1.8; white-space: pre-wrap;">${escapeHtml(message)}</p>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding: 28px 40px 40px 40px;">
      <p style="margin: 0 0 16px 0; color: #888; font-size: 12px;">Ticket ID: <code style="background:#F0F0F0;padding:2px 6px;border-radius:4px;">${escapeHtml(String(ticketId))}</code></p>
      <div style="text-align: center;">
        <a href="${process.env.ADMIN_DASHBOARD_URL || '#'}"
           style="display: inline-block; background: linear-gradient(135deg, ${BRAND.gradientStart} 0%, ${BRAND.gradientEnd} 100%);
                  color: #fff; text-decoration: none; padding: 14px 36px;
                  border-radius: 32px; font-size: 15px; font-weight: 700;">
          Open Admin Dashboard →
        </a>
      </div>
    </td>
  </tr>
  ${emailFooter()}
`);

const sendNewTicketNotificationEmail = async ({ userName, userEmail, category, subject, message, ticketId }) => {
  const supportInbox = process.env.SUPPORT_EMAIL || 'support@emorii.com';
  try {
    await resendSend({
      from: 'Emorii Support <support@emorii.com>',
      to: supportInbox,
      subject: `🎫 New Support Ticket — ${subject || category}`,
      html: getNewTicketNotificationTemplate({ userName, userEmail, category, subject, message, ticketId }),
      type: 'support_new_ticket',
    });
    logger.log('[Support] New ticket notification sent to', supportInbox);
    return { success: true };
  } catch (error) {
    logger.error('[Support] Failed to send new ticket notification:', error.message);
  }
};

const getRenewalReminderTemplate = (userName, planName, renewalDate, daysLeft) => emailShell(`
  ${emailHeader('Subscription Renewal Reminder ⏰', `Your ${planName} plan renews soon`)}
  <tr>
    <td style="padding: 48px 40px;">
      <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px; font-weight: 700;">
        Hi ${escapeHtml(userName)},
      </h2>
      <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        Just a heads-up — your <strong style="color: ${BRAND.primary};">${escapeHtml(planName)} subscription</strong>
        is set to automatically renew in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>
        on <strong>${renewalDate}</strong>.
      </p>
      <div style="background-color: ${BRAND.accentLight}; border-left: 4px solid ${BRAND.accent};
                  padding: 14px 18px; margin: 24px 0; border-radius: 6px;">
        <p style="margin: 0; color: #0C4A6E; font-size: 14px; line-height: 1.6;">
          <strong>No action needed</strong> — your subscription will renew automatically.
          If you'd like to make any changes, please do so before your renewal date.
        </p>
      </div>
      <p style="margin: 16px 0; color: #555555; font-size: 15px; line-height: 1.7;">
        To manage your subscription, go to <strong>Profile → Premium → Manage Subscription</strong>
        in the Emorii app.
      </p>
      <div style="text-align: center; margin: 36px 0;">
        <a href="#" style="display: inline-block;
           background: linear-gradient(135deg, ${BRAND.gradientStart} 0%, ${BRAND.gradientEnd} 100%);
           color: #ffffff; text-decoration: none; padding: 16px 42px;
           border-radius: 32px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px;">
          Manage Subscription →
        </a>
      </div>
    </td>
  </tr>
  ${emailFooter()}
`);

const sendRenewalReminderEmail = async (email, userName, planName, renewalDate, daysLeft) => {
  try {
    await resendSend({
      to: email,
      subject: `⏰ Your Emorii ${planName} plan renews in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`,
      html: getRenewalReminderTemplate(userName, planName, renewalDate, daysLeft),
    });
    logger.log('Renewal reminder email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending renewal reminder email:', error);
  }
};

const getInactivityTemplate = (userName) => emailShell(`
  ${emailHeader('We miss you, ' + escapeHtml(userName) + '! 👋', 'New people are waiting to connect with you')}
  <tr>
    <td style="padding: 48px 40px; text-align: center;">
      <p style="margin: 0 0 20px 0; color: #555555; font-size: 16px; line-height: 1.7;">
        It's been a while since we last saw you on Emorii. While you've been away,
        <strong style="color: ${BRAND.primary};">new members have joined</strong> and your
        profile has been getting attention.
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 28px 0;">
        <tr>
          <td width="33%" style="text-align: center; padding: 16px;">
            <div style="font-size: 36px; margin-bottom: 8px;">💌</div>
            <p style="margin: 0; color: ${BRAND.primary}; font-size: 22px; font-weight: 800;">New</p>
            <p style="margin: 4px 0 0 0; color: #888888; font-size: 13px;">Likes waiting</p>
          </td>
          <td width="33%" style="text-align: center; padding: 16px;">
            <div style="font-size: 36px; margin-bottom: 8px;">🔥</div>
            <p style="margin: 0; color: ${BRAND.primary}; font-size: 22px; font-weight: 800;">Fresh</p>
            <p style="margin: 4px 0 0 0; color: #888888; font-size: 13px;">Profiles nearby</p>
          </td>
          <td width="33%" style="text-align: center; padding: 16px;">
            <div style="font-size: 36px; margin-bottom: 8px;">✨</div>
            <p style="margin: 0; color: ${BRAND.primary}; font-size: 22px; font-weight: 800;">Ready</p>
            <p style="margin: 4px 0 0 0; color: #888888; font-size: 13px;">Matches to explore</p>
          </td>
        </tr>
      </table>

      <div style="background-color: ${BRAND.primaryLight}; border-radius: 12px;
                  padding: 16px 20px; margin: 24px 0; text-align: left;">
        <p style="margin: 0; color: #065F46; font-size: 14px; line-height: 1.6;">
          💡 <strong>Pro tip:</strong> Profiles that are active regularly get up to
          <strong>5× more matches</strong>. Come back and boost your chances!
        </p>
      </div>

      <div style="text-align: center; margin: 36px 0;">
        <a href="#" style="display: inline-block;
           background: linear-gradient(135deg, ${BRAND.gradientStart} 0%, ${BRAND.gradientEnd} 100%);
           color: #ffffff; text-decoration: none; padding: 18px 50px;
           border-radius: 32px; font-size: 17px; font-weight: 700; letter-spacing: 0.3px;">
          Come Back to Emorii →
        </a>
      </div>

      <p style="margin: 0; color: #AAAAAA; font-size: 13px; line-height: 1.6;">
        Your perfect match could be just one swipe away. Don't keep them waiting! 💚
      </p>
    </td>
  </tr>
  ${emailFooter()}
`);

const getPremiumConfirmationTemplate = (userName, plan, expiresAt) => {
  const planLabel = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[plan] || plan;
  const planPrice = { day: '$0.99', week: '$4.99', month: '$9.99', year: '$49.99' }[plan] || '';
  const expiryStr = expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A';

  return emailShell(`
    ${emailHeader('Welcome to Emorii Premium! 🌟', 'Your premium membership is now active')}
    <tr>
      <td style="padding: 48px 40px;">
        <h2 style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 22px; font-weight: 700;">
          Congratulations, ${escapeHtml(userName)}! 🎉
        </h2>
        <p style="margin: 0 0 24px 0; color: #555555; font-size: 16px; line-height: 1.7;">
          Your <strong style="color: ${BRAND.primary};">Emorii Premium</strong> subscription
          is now active. Get ready to enjoy a whole new level of connection.
        </p>

        <div style="background: linear-gradient(135deg, ${BRAND.primaryLight} 0%, ${BRAND.accentLight} 100%);
                    border: 1px solid ${BRAND.accent}; border-radius: 14px; padding: 24px 28px; margin: 0 0 28px 0;">
          <p style="margin: 0 0 6px 0; color: #555555; font-size: 13px; text-transform: uppercase;
                     letter-spacing: 1px; font-weight: 600;">Subscription Details</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 12px;">
            <tr>
              <td style="color: #555555; font-size: 14px; padding: 5px 0;">Plan</td>
              <td style="color: #1a1a1a; font-size: 14px; font-weight: 700; text-align: right;">${escapeHtml(planLabel)}</td>
            </tr>
            ${planPrice ? `<tr>
              <td style="color: #555555; font-size: 14px; padding: 5px 0;">Amount Paid</td>
              <td style="color: #1a1a1a; font-size: 14px; font-weight: 700; text-align: right;">${escapeHtml(planPrice)}</td>
            </tr>` : ''}
            <tr>
              <td style="color: #555555; font-size: 14px; padding: 5px 0;">Access Until</td>
              <td style="color: #1a1a1a; font-size: 14px; font-weight: 700; text-align: right;">${escapeHtml(expiryStr)}</td>
            </tr>
          </table>
        </div>

        <h3 style="margin: 0 0 14px 0; color: #1a1a1a; font-size: 17px; font-weight: 700;">
          Your Premium Benefits:
        </h3>
        <ul style="color: #555555; font-size: 15px; line-height: 2; padding-left: 20px; margin: 0 0 32px 0;">
          <li>Unlimited Swipes — no daily cap</li>
          <li>See exactly who liked your profile</li>
          <li>10 Super Likes per day</li>
          <li>Unlimited Rewinds</li>
          <li>Advanced filters for better matches</li>
          <li>Incognito Mode — browse privately</li>
          <li>Read receipts in chat</li>
          <li>Priority visibility in discovery</li>
          <li>Ad-free experience</li>
        </ul>

        <div style="text-align: center; margin: 36px 0;">
          <a href="#" style="display: inline-block;
             background: linear-gradient(135deg, ${BRAND.gradientStart} 0%, ${BRAND.gradientEnd} 100%);
             color: #ffffff; text-decoration: none; padding: 16px 42px;
             border-radius: 32px; font-size: 16px; font-weight: 700; letter-spacing: 0.3px;">
            Start Exploring Premium →
          </a>
        </div>

        <p style="margin: 0; color: #AAAAAA; font-size: 13px; line-height: 1.6; text-align: center;">
          This is a confirmation of your in-app purchase. Billing is managed through the
          ${plan === 'day' || plan === 'week' || plan === 'month' || plan === 'year' ? 'App Store or Google Play' : 'store'}.
          For billing questions, contact the store directly.
        </p>
      </td>
    </tr>
    ${emailFooter()}
  `);
};

const sendPremiumConfirmationEmail = async (email, userName, plan, expiresAt) => {
  try {
    const planLabel = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }[plan] || plan;
    await resendSend({
      to: email,
      subject: `🌟 Your Emorii ${planLabel} Premium is Active!`,
      html: getPremiumConfirmationTemplate(userName, plan, expiresAt),
    });
    logger.log('Premium confirmation email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending premium confirmation email:', error);
  }
};

const sendInactivityEmail = async (email, userName) => {
  try {
    await resendSend({
      to: email,
      subject: `👋 ${userName}, we miss you! New matches are waiting`,
      html: getInactivityTemplate(userName),
    });
    logger.log('Inactivity email sent');
    return { success: true };
  } catch (error) {
    logger.error('Error sending inactivity email:', error);
  }
};

/**
 * Internal admin alert: notifies staff that a free Premium grant is about to expire,
 * so they can decide to extend it or let it lapse.
 */
const sendAdminGrantExpiryWarningEmail = async ({
  adminEmail,
  adminName,
  granteeName,
  granteeEmail,
  expiresAt,
  daysLeft,
  reason,
}) => {
  try {
    const safeName = escapeHtml(adminName || 'Admin');
    const safeGrantee = escapeHtml(granteeName || granteeEmail || 'a user');
    const safeEmail = escapeHtml(granteeEmail || '');
    const safeReason = escapeHtml(reason || '');
    const expiry = new Date(expiresAt).toLocaleString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const html = `
      <!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:40px 20px;">
          <tr><td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
              ${emailHeader('Admin Premium Grant Expiring', `${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`)}
              <tr><td style="padding:32px 40px;color:#1f2937;">
                <p style="margin:0 0 16px;">Hi ${safeName},</p>
                <p style="margin:0 0 20px;line-height:1.6;">
                  A complimentary Premium subscription you (or another admin) granted is about to expire.
                  Decide whether to extend it from the admin dashboard.
                </p>
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef3c7;border:1px solid #fde68a;border-radius:12px;padding:18px;margin:0 0 20px;">
                  <tr><td>
                    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;">Grantee</p>
                    <p style="margin:0 0 14px;font-size:16px;color:#1f2937;font-weight:600;">${safeGrantee}</p>
                    <p style="margin:0 0 14px;font-size:13px;color:#6b7280;">${safeEmail}</p>
                    <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;">Expires</p>
                    <p style="margin:0 0 14px;font-size:15px;color:#1f2937;">${expiry} <span style="color:#dc2626;font-weight:700;">(${daysLeft} day${daysLeft === 1 ? '' : 's'} left)</span></p>
                    ${safeReason ? `
                      <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:1px;">Reason</p>
                      <p style="margin:0;font-size:14px;color:#1f2937;font-style:italic;">"${safeReason}"</p>
                    ` : ''}
                  </td></tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
                  Open the admin dashboard → Premium Members to extend or let it lapse. No action means it will expire automatically.
                </p>
              </td></tr>
              <tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
                <p style="margin:0;font-size:12px;color:#9ca3af;">Emorii — Internal Admin Alert</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body></html>
    `;
    const text = `Admin Premium Grant Expiring\n\nGrantee: ${granteeName || granteeEmail}\nExpires: ${expiry} (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)${reason ? `\nReason: ${reason}` : ''}\n\nOpen the admin dashboard to extend or let it lapse.`;

    await resendSend({
      to: adminEmail,
      subject: `[Emorii Admin] Premium grant expiring in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — ${granteeName || granteeEmail}`,
      html,
      text,
    });
    return { success: true };
  } catch (error) {
    logger.error('Error sending admin grant expiry warning:', error?.message);
    return { success: false };
  }
};

module.exports = {
  sendOTP,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendBanNotificationEmail,
  sendUnbanNotificationEmail,
  sendAppealDecisionEmail,
  sendVerificationApprovedEmail,
  sendVerificationRejectedEmail,
  sendVerificationRevokedEmail,
  sendWarningEmail,
  sendSuspensionEmail,
  sendSuspensionLiftedEmail,
  sendNewMatchEmail,
  sendSupportReplyEmail,
  sendNewTicketNotificationEmail,
  sendRenewalReminderEmail,
  sendInactivityEmail,
  sendPremiumConfirmationEmail,
  sendAdminGrantExpiryWarningEmail,
  generateOTP,
};
