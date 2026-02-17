import { clerkMiddleware, getAuth, requireAuth as clerkRequireAuth } from "@clerk/express";
import { clerkClient } from "@clerk/express";
import { storage } from "./storage";
import { type Express, type Request, type Response, type NextFunction } from "express";
import { type User, type UserRole } from "@shared/schema";

declare global {
  namespace Express {
    interface Request {
      dbUser?: User;
    }
  }
}

export function setupAuth(app: Express) {
  app.use(clerkMiddleware());
}

export async function syncClerkUser(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = getAuth(req);
    if (!auth?.userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    let dbUser = await storage.getUserByClerkId(auth.userId);
    if (!dbUser) {
      const clerkUser = await clerkClient.users.getUser(auth.userId);
      const username = clerkUser.username || clerkUser.firstName || clerkUser.emailAddresses[0]?.emailAddress?.split("@")[0] || "user";
      const email = clerkUser.emailAddresses[0]?.emailAddress || "";
      dbUser = await storage.upsertUserFromClerk(auth.userId, username, email);
    }

    req.dbUser = dbUser;
    next();
  } catch (err) {
    console.error("Error syncing Clerk user:", err);
    return res.status(500).json({ message: "Failed to sync user" });
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

/**
 * Middleware: requires the user to have the "admin" role.
 * Must be placed AFTER syncClerkUser so req.dbUser is available.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.dbUser || req.dbUser.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

// Emails that should be promoted to admin on first sync or server startup.
// This is the single source of truth — no public endpoint can grant admin.
const ADMIN_EMAILS: string[] = [
  "stanislavbg@gmail.com",
  "derrick.ellis@gmail.com",
];

/**
 * Run once at startup: ensures every email in ADMIN_EMAILS has role = "admin".
 * Safe to call repeatedly — it's a no-op if the user doesn't exist yet or is
 * already admin. When the user signs up later, syncClerkUser will pick up
 * the role from the DB normally.
 */
export async function seedAdminUsers(): Promise<void> {
  for (const email of ADMIN_EMAILS) {
    await storage.promoteUserToAdmin(email);
  }
}
