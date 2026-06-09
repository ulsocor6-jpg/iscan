// services/emailService.js
import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail', 
  auth: {
    user: 'your-email@gmail.com', // Use your business email
    pass: 'your-app-password'      // Get this from Google Account Security
  }
});

export const sendVerificationEmail = async (email, token) => {
  const url = `http://localhost:3000/api/v1/auth/verify?token=${token}`;
  
  await transporter.sendMail({
    from: '"iSCAN Security" <noreply@iscan.com>',
    to: email,
    subject: "Verify Your iSCAN Account",
    html: `<h1>Welcome to iSCAN</h1><p>Click the link below to verify your email:</p><a href="${url}">Verify Account</a>`
  });
};
