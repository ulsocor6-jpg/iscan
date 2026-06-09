import crypto from "crypto";
import { findUserByEmail, createUser } from "../models/userModel.js";
import { hashPassword, comparePassword } from "../../security/hash.js";
import { signToken } from "../../security/jwt.js";

export const registerUser = async (email, password) => {
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new Error("User already exists");
  }

  const hashed = await hashPassword(password);
  const user = {
    id: crypto.randomUUID(),
    email,
    passwordHash: hashed,
    role: "user",
    status: "active",
    createdAt: new Date()
  };

  return await createUser(user);
};

export const loginUser = async (email, password) => {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new Error("User not found");
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    throw new Error("Invalid credentials");
  }

  const token = signToken(user);

  return {
    message: "Login successful",
    token
  };
};
