// services/emailService.js
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

export const sendVerificationEmail = async (email, token) => {
  const baseUrl = process.env.APP_URL || 'http://localhost:3000';
  const url = `${baseUrl}/api/v1/auth/verify?token=${token}`;

  await transporter.sendMail({
    from: '"iSCAN Security" <noreply@iscan.com>',
    to: email,
    subject: "Verify Your iSCAN Account",
    html: `<h1>Welcome to iSCAN</h1><p>Click the link below to verify your email:</p><a href="${url}">Verify Account</a>`
  });
};
