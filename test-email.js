import 'dotenv/config';   // loads .env into process.env
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});
try {
  await transporter.sendMail({
    from: '"iSCAN Test" <noreply@iscan.com>',
    to: process.env.EMAIL_USER,
    subject: 'Test email from iSCAN',
    html: '<p>If you see this, email delivery works.</p>'
  });
  console.log('✅ Email sent');
} catch (err) {
  console.error('❌ Email failed:', err.message);
}
