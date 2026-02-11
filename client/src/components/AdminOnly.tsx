import { type ReactNode } from "react";
import { useAdmin } from "@/hooks/use-admin";

interface AdminOnlyProps {
  children: ReactNode;
  /** Optional fallback rendered for non-admin users (default: nothing) */
  fallback?: ReactNode;
}

/**
 * Renders children only when the current user is an admin.
 *
 * Usage:
 *   <AdminOnly>
 *     <button>Delete project</button>
 *   </AdminOnly>
 */
export function AdminOnly({ children, fallback = null }: AdminOnlyProps) {
  const { isAdmin, isLoading } = useAdmin();

  if (isLoading) return null;
  return isAdmin ? <>{children}</> : <>{fallback}</>;
}
