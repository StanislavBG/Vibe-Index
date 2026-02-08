import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
}

export interface Job {
  id: number;
  projectId: number;
  status: string;
  step: string | null;
  stepDetail: string | null;
  result: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
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
  job?: Job | null;
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
  return useQuery<{ projects: Project[]; total: number }>({ queryKey: [url], staleTime: 30 * 1000 });
}

export function useProject(id: number | null) {
  return useQuery<Project & { categories: Category[]; liked: boolean; job: Job | null }>({
    queryKey: [`/api/projects/${id}`],
    enabled: id !== null,
    staleTime: 30 * 1000,
  });
}

export function useCategories() {
  return useQuery<Category[]>({ queryKey: ["/api/categories"], staleTime: 5 * 60 * 1000 });
}

// Draft shape returned by scraper
export interface DraftData {
  name: string;
  shortDescription: string;
  longDescription: string;
  pricingModel: string;
  pricingDetails: string | null;
  tags: string[];
  suggestedCategories: string[];
  demoUrl: string | null;
  docsUrl: string | null;
  repoUrl: string | null;
}

export function useJob(jobId: number | null) {
  return useQuery<Job>({
    queryKey: [`/api/jobs/${jobId}`],
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 1000;
      // Stop polling when in review, completed, or failed
      if (data.status === "completed" || data.status === "failed" || data.status === "review") return false;
      return 1500;
    },
    staleTime: 0,
  });
}

// Update draft fields directly (typing edits)
export function useUpdateDraft() {
  return useMutation({
    mutationFn: async ({ jobId, updates }: { jobId: number; updates: Partial<DraftData> }) => {
      const res = await apiRequest("PATCH", `/api/jobs/${jobId}/draft`, updates);
      return res.json() as Promise<DraftData>;
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${jobId}`] });
    },
  });
}

// Refine draft with text feedback
export function useRefineDraft() {
  return useMutation({
    mutationFn: async ({ jobId, feedback }: { jobId: number; feedback: string }) => {
      const res = await apiRequest("POST", `/api/jobs/${jobId}/refine`, { feedback });
      return res.json() as Promise<DraftData>;
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${jobId}`] });
    },
  });
}

// Voice feedback: upload audio → transcribe → refine draft
export function useVoiceRefine() {
  return useMutation({
    mutationFn: async ({ jobId, audioBlob }: { jobId: number; audioBlob: Blob }) => {
      const formData = new FormData();
      formData.append("audio", audioBlob, "voice.webm");
      const res = await fetch(`/api/jobs/${jobId}/voice`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Voice processing failed" }));
        throw new Error(err.message);
      }
      return res.json() as Promise<{ transcript: string; draft: DraftData }>;
    },
    onSuccess: (_, { jobId }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/jobs/${jobId}`] });
    },
  });
}

// Approve draft and publish
export function useApproveDraft() {
  return useMutation({
    mutationFn: async (jobId: number) => {
      const res = await apiRequest("POST", `/api/jobs/${jobId}/approve`);
      return res.json() as Promise<{ message: string; project: Project }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-projects"] });
    },
  });
}

export function useSubmitProject() {
  return useMutation({
    mutationFn: async (data: { url: string }) => {
      const res = await apiRequest("POST", "/api/projects", data);
      return res.json() as Promise<{ project: Project; job: Job; anonymousToken?: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
}

// Voice search: upload audio → transcribe → return search query
export function useVoiceSearch() {
  return useMutation({
    mutationFn: async (audioBlob: Blob) => {
      const formData = new FormData();
      formData.append("audio", audioBlob, "search.webm");
      const res = await fetch("/api/search/voice", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Voice search failed" }));
        throw new Error(err.message);
      }
      return res.json() as Promise<{ query: string }>;
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
    mutationFn: async (data: {
      email: string;
      categoryIds: number[];
      frequency?: string;
      interests?: string[];
      pricingFilter?: string;
      maxProjects?: number;
    }) => {
      const res = await apiRequest("POST", "/api/subscribe", data);
      return res.json();
    },
  });
}
