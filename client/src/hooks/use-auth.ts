import { useUser, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useQuery } from "@tanstack/react-query";

export interface AuthUser {
  id: number;
  clerkId: string;
  username: string;
  email: string;
  freeListingsRemaining: number;
  paidListingCredits: number;
  likesRemaining: number;
  createdAt: string;
}

export function useAuth() {
  const { isSignedIn, isLoaded } = useClerkAuth();
  const { user: clerkUser } = useUser();

  const { data: dbUser, isLoading: dbLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (res.status === 401) return null;
        if (!res.ok) throw new Error("Failed to fetch user");
        return res.json();
      } catch {
        return null;
      }
    },
    enabled: !!isSignedIn,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    user: dbUser ?? null,
    isLoading: !isLoaded || (isSignedIn && dbLoading),
    isAuthenticated: !!isSignedIn && !!dbUser,
  };
}
