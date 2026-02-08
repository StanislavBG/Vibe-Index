import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
}

export interface Project {
  id: number;
  url: string;
  name: string | null;
  shortDescription: string | null;
  longDescription: string | null;
  pricingModel: string | null;
  pricingDetails: string | null;
  demoUrl: string | null;
  docsUrl: string | null;
  repoUrl: string | null;
  tags: string | null;
  imageUrl: string | null;
  ownerId: number | null;
  likesCount: number;
  status: string;
  claimed: boolean;
  createdAt: string;
  updatedAt: string;
  categories?: Category[];
  liked?: boolean;
}

export function useProjects(opts: {
  search?: string;
  categoryId?: number;
  pricing?: string;
  sort?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const params = new URLSearchParams();
  if (opts.search) params.set("search", opts.search);
  if (opts.categoryId) params.set("category", String(opts.categoryId));
  if (opts.pricing) params.set("pricing", opts.pricing);
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.offset) params.set("offset", String(opts.offset));

  const queryString = params.toString();
  const url = `/api/projects${queryString ? `?${queryString}` : ""}`;

  return useQuery<{ projects: Project[]; total: number }>({
    queryKey: [url],
    staleTime: 30 * 1000,
  });
}

export function useProject(id: number | null) {
  return useQuery<Project & { categories: Category[]; liked: boolean }>({
    queryKey: [`/api/projects/${id}`],
    enabled: id !== null,
    staleTime: 30 * 1000,
  });
}

export function useCategories() {
  return useQuery<Category[]>({
    queryKey: ["/api/categories"],
    staleTime: 5 * 60 * 1000,
  });
}

export function useSubmitProject() {
  return useMutation({
    mutationFn: async (data: { url: string; name?: string; shortDescription?: string; categoryIds?: number[] }) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });
}

export function useLikeProject() {
  return useMutation({
    mutationFn: async ({ projectId, action }: { projectId: number; action: "like" | "unlike" }) => {
      const method = action === "like" ? "POST" : "DELETE";
      const res = await apiRequest(method, `/api/projects/${projectId}/like`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}

export function useSubscribe() {
  return useMutation({
    mutationFn: async (data: { email: string; categoryIds: number[] }) => {
      const res = await apiRequest("POST", "/api/subscribe", data);
      return res.json();
    },
  });
}
