import jwt from "jsonwebtoken";

if (!process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET is not set. Refusing to start with an insecure default — " +
    "set JWT_SECRET in your environment (Railway variables / .env)."
  );
}

const JWT_SECRET = process.env.JWT_SECRET;

export const signToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "15m" }
  );
};

export const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};
