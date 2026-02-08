import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useHello() {
  return useQuery({
    queryKey: [api.hello.path],
    queryFn: async () => {
      const res = await fetch(api.hello.path);
      if (!res.ok) throw new Error("Failed to fetch hello message");
      return api.hello.responses[200].parse(await res.json());
    },
  });
}
