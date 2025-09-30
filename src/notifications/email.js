import nodemailer from 'nodemailer';

export const notifyEmail = async ({ to, subject, text, html }) => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.FROM_EMAIL || 'no-reply@claims.local';
  if (!host || !user || !pass) return { ok: false, error: 'Missing SMTP configuration' };

  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  const info = await transporter.sendMail({ from, to, subject, text, html });
  return { ok: true, messageId: info.messageId };
};
