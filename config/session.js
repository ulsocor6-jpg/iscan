if (!process.env.SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET is not set. Refusing to start with an insecure default — " +
    "set SESSION_SECRET in your environment (Railway variables / .env)."
  );
}

export const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
};
