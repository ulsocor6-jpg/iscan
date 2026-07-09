import User from "../models/userModel.js";
import Wallet from "../models/walletModel.js";
import Ledger from "../models/ledgerModel.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { getUserBalance } from "../services/balanceService.js";
import { getLiveBalancesForWallet } from "../services/onchainBalanceService.js";
import eventStreamService from "../services/eventStreamService.js";

/**
 * GET /api/v1/admin/users
 * List all users (for the admin promote/demote UI).
 * Never returns password hashes or reset tokens.
 */
export async function listUsers(req, res) {
  try {
    const users = await User.find({})
      .select("_id firstName lastName email role kycTier isVerified createdAt")
      .sort({ createdAt: -1 });

    res.json({ success: true, count: users.length, users });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/v1/admin/users/:id/details
 * Full picture of one user for admin investigation: profile, live balance,
 * wallet doc, and recent ledger activity. Used when chasing down a support
 * issue or reconciling a disputed transaction.
 */
export async function getUserDetails(req, res) {
  try {
    const targetId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ success: false, error: "Invalid user id" });
    }
    const userId = new mongoose.Types.ObjectId(targetId);

    const user = await User.findById(userId)
      .select("-password -__v -resetPasswordToken -verificationToken")
      .lean();
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    const [balance, wallet, activityDocs, events] = await Promise.all([
      getUserBalance(userId),
      Wallet.findOne({ userId }).lean(),
      Ledger.find({ userId }).sort({ createdAt: -1 }).limit(200).lean(),
      eventStreamService.getUserEvents(String(userId)),
    ]);

    let onchainBalances = {};
    if (wallet) {
      try {
        onchainBalances = await getLiveBalancesForWallet(wallet);
      } catch (err) {
        onchainBalances = { error: err.message };
      }
    }

    const activity = activityDocs.map((e) => ({
      _id: e._id,
      referenceId: e.referenceId,
      transactionType: e.transactionType,
      debit: e.debit,
      credit: e.credit,
      currency: e.currency || "PHP",
      status: e.status,
      description: e.description,
      counterpartyAddress: e.counterpartyAddress || null,
      createdAt: e.createdAt,
    }));

    await eventStreamService.emit("admin.viewed_user_details", {
      userId: String(userId),
      targetEmail: user.email,
      adminId: req.user.id,
      adminEmail: req.user.email
    });

    res.json({
      success: true,
      user,
      balance,
      wallet: wallet || null,
      onchainBalances,
      activity,
      events: events.slice(0, 100),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/v1/admin/users/:id/impersonate
 * "Enter as this user" — issues a short-lived (30 min) token carrying the
 * target user's identity, and stashes the admin's own token in a separate
 * cookie so the session can be restored via /exit-impersonation.
 *
 * Guardrails:
 * - Cannot impersonate yourself.
 * - Cannot start a second impersonation while already impersonating
 *   (must exit first) — prevents nested/confused sessions.
 * - Every start/end is written to the permanent Event log, not just
 *   console output, since this is the single most sensitive admin action.
 */
export async function impersonateUser(req, res) {
  try {
    if (req.cookies?.iscan_admin_token) {
      return res.status(400).json({
        success: false,
        error: "Already impersonating a user. Exit that session first."
      });
    }

    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (String(target._id) === String(req.user.id)) {
      return res.status(400).json({ success: false, error: "You cannot impersonate yourself." });
    }

    const originalAdminToken =
      req.cookies?.iscan_token ||
      (req.headers.authorization || "").replace("Bearer ", "");

    const impersonationToken = jwt.sign(
      {
        id: target._id,
        email: target.email,
        firstName: target.firstName,
        role: target.role,
        impersonating: true,
        adminId: req.user.id,
        adminEmail: req.user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: "30m" }
    );

    const cookieOpts = {
      httpOnly: true,
      sameSite: "Lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 30 * 60 * 1000
    };

    // Stash the admin's real session so /exit-impersonation can restore it
    res.cookie("iscan_admin_token", originalAdminToken, cookieOpts);

    res.cookie("iscan_token", impersonationToken, cookieOpts);
    res.cookie("iscan_email", target.email, { sameSite: "Lax", secure: cookieOpts.secure, maxAge: cookieOpts.maxAge });
    res.cookie("iscan_name", `${target.firstName} ${target.lastName}`, { sameSite: "Lax", secure: cookieOpts.secure, maxAge: cookieOpts.maxAge });

    await eventStreamService.emit("admin.impersonation_start", {
      userId: String(target._id),
      targetEmail: target.email,
      adminId: req.user.id,
      adminEmail: req.user.email
    });

    res.json({
      success: true,
      impersonating: true,
      user: { id: target._id, email: target.email, firstName: target.firstName, role: target.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/v1/admin/users/:id/promote
 * Grants admin role to a user.
 */
export async function promoteUser(req, res) {
  try {
    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (target.role === "admin") {
      return res.status(400).json({ success: false, error: "User is already an admin" });
    }

    target.role = "admin";
    await target.save();

    await eventStreamService.emit("admin.user_promoted", {
      userId: String(target._id),
      targetEmail: target.email,
      adminId: req.user.id,
      adminEmail: req.user.email
    });

    res.json({
      success: true,
      user: { id: target._id, email: target.email, role: target.role },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/v1/admin/users/:id/demote
 * Revokes admin role. An admin cannot demote themselves
 * (prevents accidentally locking out the only admin account).
 */
export async function demoteUser(req, res) {
  try {
    const target = await User.findById(req.params.id);
    if (!target) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    if (String(target._id) === String(req.user.id)) {
      return res.status(400).json({
        success: false,
        error: "You cannot demote your own account.",
      });
    }

    if (target.role !== "admin") {
      return res.status(400).json({ success: false, error: "User is not an admin" });
    }

    target.role = "user";
    await target.save();

    await eventStreamService.emit("admin.user_demoted", {
      userId: String(target._id),
      targetEmail: target.email,
      adminId: req.user.id,
      adminEmail: req.user.email
    });

    res.json({
      success: true,
      user: { id: target._id, email: target.email, role: target.role },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
