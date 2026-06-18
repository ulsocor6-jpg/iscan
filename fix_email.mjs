import fs from 'fs';
let content = fs.readFileSync('./src/controllers/authController.js', 'utf8');
const oldText = '<a href="${verifyLink}">Verify Account</a>';
const newText = '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px"><a href="${verifyLink}" style="background-color:#4F46E5;color:#ffffff;padding:12px 24px;text-decoration:none;border-radius:6px;font-family:Arial,sans-serif;font-size:16px;display:inline-block">Verify Account</a></td></tr></table><p style="font-family:Arial,sans-serif;color:#666">Or copy this link: ${verifyLink}</p>';
content = content.replace(oldText, newText);
fs.writeFileSync('./src/controllers/authController.js', content);
console.log('Done');
