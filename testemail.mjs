import dotenv from 'dotenv';
dotenv.config({ path: '/home/uls/Desktop/iscansystem/.env' });
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

await transporter.sendMail({
  from: `"ISCAN System" <${process.env.EMAIL_USER}>`,
  to: process.env.EMAIL_USER,
  subject: 'Test Verification Link',
  html: `<!DOCTYPE html>
<html>
<body>
<p>Click below to verify:</p>
<a href="https://iscansystem.up.railway.app/api/v1/auth/verify-email?token=testtoken123" 
   style="background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">
   Verify Account
</a>
<br><br>
<p>Or copy: https://iscansystem.up.railway.app/api/v1/auth/verify-email?token=testtoken123</p>
</body>
</html>`
});

console.log('Email sent to', process.env.EMAIL_USER);
process.exit(0);
