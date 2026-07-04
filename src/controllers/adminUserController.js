import User from "../models/userModel.js";

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

    console.log(
      `[ADMIN ACTION] ${req.user.email} (${req.user.id}) promoted ${target.email} (${target._id}) to admin`
    );

    res.json({
      success: true,
      user: { id: target._id, email: target.email, role: target.role }
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
        error: "You cannot demote your own account."
      });
    }

    if (target.role !== "admin") {
      return res.status(400).json({ success: false, error: "User is not an admin" });
    }

    target.role = "user";
    await target.save();

    console.log(
      `[ADMIN ACTION] ${req.user.email} (${req.user.id}) demoted ${target.email} (${target._id}) to user`
    );

    res.json({
      success: true,
      user: { id: target._id, email: target.email, role: target.role }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
