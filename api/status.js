// Vercel Function "/api/status": open it in a browser to see which settings the live site can see.
// It only says yes/no for each one. It never shows a value.
import { mailConfigured } from './_mail.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const has = k => !!process.env[k];
  res.status(200).json({
    database: has('DATABASE_URL') || has('POSTGRES_URL'),
    emailSending: mailConfigured(),
    SMTP_USER: has('SMTP_USER'),
    SMTP_PASS: has('SMTP_PASS'),
    ADMIN_EMAILS: has('ADMIN_EMAILS'),
    GROQ_API_KEY: has('GROQ_API_KEY')
  });
}
