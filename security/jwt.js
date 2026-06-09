import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "jwtsecret";

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
