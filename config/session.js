export const sessionConfig = {
  secret: process.env.SESSION_SECRET || "iscansupersecret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // set true in production HTTPS
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
};
