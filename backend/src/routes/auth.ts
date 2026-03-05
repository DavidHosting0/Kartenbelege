import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { db } from "../config/database.js";
import { env } from "../config/env.js";
import { requireAdmin, requireAuth, signAuthToken } from "../middleware/auth.js";

export const authRouter = Router();

const normalizeUsername = (value: string): string => value.trim().toLowerCase();

const setAuthCookie = (res: any, token: string): void => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7
  });
};

const ensureAdminUser = (): void => {
  const adminUsername = normalizeUsername(env.adminUsername);
  const existing = db.prepare("SELECT id, role FROM users WHERE email = ?").get(adminUsername) as
    | { id: string; role: "admin" | "user" }
    | undefined;
  if (existing) {
    if (existing.role !== "admin") {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
    }
    return;
  }

  if (env.adminPassword.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  }

  const passwordHash = bcrypt.hashSync(env.adminPassword, 12);
  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, 'admin')").run(
    uuidv4(),
    adminUsername,
    passwordHash
  );
};

ensureAdminUser();

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const normalizedUsername = normalizeUsername(username);
  const userRow = db
    .prepare("SELECT id, email, password_hash, role FROM users WHERE email = ?")
    .get(normalizedUsername) as { id: string; email: string; password_hash: string; role: "admin" | "user" } | undefined;

  if (!userRow) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, userRow.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const user = { id: userRow.id, username: userRow.email, role: userRow.role };
  const token = signAuthToken(user);
  setAuthCookie(res, token);
  return res.json({ user });
});

authRouter.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.get("/users", requireAuth, requireAdmin, (req, res) => {
  const users = db
    .prepare("SELECT id, email as username, role, created_at FROM users ORDER BY created_at DESC")
    .all() as Array<{ id: string; username: string; role: "admin" | "user"; created_at: string }>;

  res.json({ users });
});

authRouter.post("/users", requireAuth, requireAdmin, async (req, res) => {
  const { username, password, role } = req.body as {
    username?: string;
    password?: string;
    role?: "admin" | "user";
  };

  if (!username || !password || password.length < 8) {
    return res.status(400).json({ error: "Valid username and password (min 8 chars) are required" });
  }

  const normalizedUsername = normalizeUsername(username);
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedUsername);
  if (existing) {
    return res.status(409).json({ error: "Username already exists" });
  }

  const safeRole: "admin" | "user" = role === "admin" ? "admin" : "user";
  const userId = uuidv4();
  const passwordHash = await bcrypt.hash(password, 12);

  db.prepare("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)").run(
    userId,
    normalizedUsername,
    passwordHash,
    safeRole
  );

  res.status(201).json({
    user: {
      id: userId,
      username: normalizedUsername,
      role: safeRole
    }
  });
});

authRouter.delete("/users/:id", requireAuth, requireAdmin, (req, res) => {
  const targetId = req.params.id;
  if (!targetId) {
    return res.status(400).json({ error: "User id is required" });
  }

  if (req.user!.id === targetId) {
    return res.status(400).json({ error: "You cannot delete your own account" });
  }

  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(targetId) as
    | { id: string; role: "admin" | "user" }
    | undefined;
  if (!target) {
    return res.status(404).json({ error: "User not found" });
  }

  if (target.role === "admin") {
    const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number };
    if (adminCount.count <= 1) {
      return res.status(400).json({ error: "Cannot delete the last admin user" });
    }
  }

  db.prepare("DELETE FROM users WHERE id = ?").run(targetId);
  res.json({ ok: true });
});
