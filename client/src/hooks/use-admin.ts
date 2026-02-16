import { useAuth } from "./use-auth";

/**
 * Convenience hook for admin-gated UI.
 * Returns { isAdmin, isLoading } derived from the current user's role.
 */
export function useAdmin() {
  const { user, isLoading, isAuthenticated } = useAuth();

  return {
    isAdmin: isAuthenticated && user?.role === "admin",
    isLoading,
  };
}
