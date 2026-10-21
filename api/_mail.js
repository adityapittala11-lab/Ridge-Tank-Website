// Sends the confirmation emails. Pick ONE way to send in Vercel > Settings > Environment Variables:
//   Gmail (easiest, no domain needed): SMTP_USER = a Gmail address, SMTP_PASS = its 16-character "app password"
//   Resend (if you own a domain):      RESEND_API_KEY and MAIL_FROM (an address on that domain)
// Optional: MAIL_FROM_NAME (default "Ridge Tank"), SITE_URL (default: the address the person signed up on).
// For testing on a computer, MAIL_DEV_FILE=/some/file.log writes each email there instead of sending it.
import fs from 'node:fs';

export function mailConfigured() {
  return !!(process.env.MAIL_DEV_FILE || (process.env.RESEND_API_KEY && process.env.MAIL_FROM) || (process.env.SMTP_USER && process.env.SMTP_PASS));
}

const fromName = () => process.env.MAIL_FROM_NAME || 'Ridge Tank';

export async function sendMail({ to, subject, text, html }) {
  if (process.env.MAIL_DEV_FILE) {
    fs.appendFileSync(process.env.MAIL_DEV_FILE, JSON.stringify({ to, subject, text }) + '\n');
    return;
  }
  if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${fromName()} <${process.env.MAIL_FROM}>`, to: [to], subject, text, html })
    });
    if (!r.ok) throw new Error('The email service refused the message.');
    return;
  }
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const nodemailer = (await import('nodemailer')).default;
    const t = nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port: Number(process.env.SMTP_PORT || 465), secure: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    await t.sendMail({ from: `"${fromName()}" <${process.env.SMTP_USER}>`, to, subject, text, html });
    return;
  }
  const e = new Error('Email is not set up.');
  e.code = 'NO_MAIL';
  throw e;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function confirmEmail(name, link) {
  const first = String(name || '').split(' ')[0] || 'there';
  return {
    subject: 'Confirm your Ridge Tank account',
    text: `Hi ${first},\n\nTap this link to confirm your email and finish signing up for Ridge Tank:\n${link}\n\nThe link works for 48 hours. If you didn't sign up, ignore this email.\n\nRidge Tank, Mountain Ridge High School`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0b1f15">
      <h2 style="margin:0 0 12px">Confirm your email</h2>
      <p>Hi ${esc(first)}, tap the button to finish signing up for Ridge Tank.</p>
      <p style="margin:24px 0"><a href="${esc(link)}" style="background:#1e8f5b;color:#fff;padding:14px 22px;text-decoration:none;font-weight:600;display:inline-block">Confirm my email</a></p>
      <p style="font-size:13px;color:#555">The link works for 48 hours. If you didn't sign up, ignore this email.<br>Button not working? Copy this into your browser:<br>${esc(link)}</p></div>`
  };
}
