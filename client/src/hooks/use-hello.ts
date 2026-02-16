import { useQuery } from "@tanstack/react-query";

export function useHello() {
  return useQuery({
    queryKey: ["/api/hello"],
    queryFn: async () => {
      const res = await fetch("/api/hello");
      if (!res.ok) throw new Error("Failed to fetch hello message");
      return res.json() as Promise<{ message: string }>;
    },
  });
}
