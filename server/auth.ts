import { clerkMiddleware, getAuth, requireAuth as clerkRequireAuth } from "@clerk/express";
import { clerkClient } from "@clerk/express";
import { storage } from "./storage";
import { type Express, type Request, type Response, type NextFunction } from "express";
import { type User } from "@shared/schema";

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
