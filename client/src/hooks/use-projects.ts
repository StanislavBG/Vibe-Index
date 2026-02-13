import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
}

export interface CanonicalTag {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  usageCount: number;
  createdAt: string;
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
  followsCount: number;
  commentsCount: number;
  status: string;
  claimed: boolean;
  createdAt: string;
  updatedAt: string;
  categories?: Category[];
  liked?: boolean;
  followed?: boolean;
  job?: Job | null;
}

export interface CommentData {
  id: number;
  projectId: number;
  userId: number;
  content: string;
  username: string;
  createdAt: string;
}

export interface SocialShareData {
  id: number;
  userId: number;
  projectId: number;
  platform: string;
  proofUrl: string;
  status: string;
  creditAmount: number;
  verifyAfter: string;
  verifiedAt: string | null;
  createdAt: string;
}

export interface BalanceData {
  freeListingsRemaining: number;
  paidListingCredits: number;
  earnedCredits: number;
  earnedCreditsNeeded: number;
  totalListingCredits: number;
  ledger: Array<{
    id: number;
    amount: number;
    type: string;
    description: string;
    createdAt: string;
  }>;
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
  return useQuery<Project & { categories: Category[]; canonicalTags: CanonicalTag[]; liked: boolean; job: Job | null }>({
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

export interface DigestPreferences {
  subscriptions: { id: number; userId: number; categoryId: number; createdAt: string }[];
  preferences: {
    id: number;
    userId: number;
    frequency: string;
    interests: string | null;
    pricingFilter: string | null;
    maxProjects: number;
  } | null;
}

export function useDigestPreferences() {
  return useQuery<DigestPreferences>({
    queryKey: ["/api/subscribe"],
    staleTime: 5 * 60 * 1000,
  });
}

export function useSubscribe() {
  return useMutation({
    mutationFn: async (data: {
      categoryIds: number[];
      frequency?: string;
      interests?: string[];
      pricingFilter?: string;
      maxProjects?: number;
    }) => {
      const res = await apiRequest("POST", "/api/subscribe", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscribe"] });
    },
  });
}

// === FOLLOWS ===

export function useFollowProject() {
  return useMutation({
    mutationFn: async ({ projectId, action }: { projectId: number; action: "follow" | "unfollow" }) => {
      const method = action === "follow" ? "POST" : "DELETE";
      const res = await apiRequest(method, `/api/projects/${projectId}/follow`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
  });
}

// === COMMENTS ===

export function useComments(projectId: number | null) {
  return useQuery<CommentData[]>({
    queryKey: [`/api/projects/${projectId}/comments`],
    enabled: projectId !== null,
    staleTime: 10 * 1000,
  });
}

export function useCreateComment() {
  return useMutation({
    mutationFn: async ({ projectId, content }: { projectId: number; content: string }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/comments`, { content });
      return res.json() as Promise<CommentData>;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/comments`] });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
    },
  });
}

export function useDeleteComment() {
  return useMutation({
    mutationFn: async ({ commentId }: { commentId: number }) => {
      const res = await apiRequest("DELETE", `/api/comments/${commentId}`);
      return res.json();
    },
  });
}

// === SOCIAL SHARES & BALANCE ===

export function useSocialShares() {
  return useQuery<SocialShareData[]>({
    queryKey: ["/api/social-shares"],
    staleTime: 30 * 1000,
  });
}

export function useSubmitSocialShare() {
  return useMutation({
    mutationFn: async (data: { projectId: number; platform: string; proofUrl: string }) => {
      const res = await apiRequest("POST", "/api/social-shares", data);
      return res.json() as Promise<SocialShareData>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-shares"] });
      queryClient.invalidateQueries({ queryKey: ["/api/balance"] });
    },
  });
}

export function useBalance() {
  return useQuery<BalanceData>({
    queryKey: ["/api/balance"],
    staleTime: 30 * 1000,
  });
}

// === TAGS (Controlled Vocabulary) ===

export function useCanonicalTags(search?: string) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const queryString = params.toString();
  const url = `/api/tags${queryString ? `?${queryString}` : ""}`;
  return useQuery<CanonicalTag[]>({
    queryKey: [url],
    staleTime: 60 * 1000,
  });
}

export function useTagSuggestions(query: string) {
  return useQuery<CanonicalTag[]>({
    queryKey: [`/api/tags/suggest?q=${encodeURIComponent(query)}`],
    enabled: query.trim().length > 0,
    staleTime: 10 * 1000,
  });
}

export interface TagResolution {
  input: string;
  normalized: string;
  canonical: CanonicalTag | null;
  isNew: boolean;
  suggestions: CanonicalTag[];
}

export function useResolveTags() {
  return useMutation({
    mutationFn: async (tags: string[]) => {
      const res = await apiRequest("POST", "/api/tags/resolve", { tags });
      return res.json() as Promise<TagResolution[]>;
    },
  });
}

export function useCreateTag() {
  return useMutation({
    mutationFn: async (data: { name: string; synonyms?: string[] }) => {
      const res = await apiRequest("POST", "/api/tags", data);
      return res.json() as Promise<CanonicalTag>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
    },
  });
}

// === FEEDBACK ===

export interface FeedbackAnswer {
  question: string;
  answer: string;
}

export interface FeedbackData {
  id: number;
  projectId: number;
  rating: number;
  answers: string | null;
  summary: string | null;
  fingerprint: string;
  createdAt: string;
}

export interface FeedbackListResponse {
  feedback: FeedbackData[];
  count: number;
  averageRating: number | null;
}

export function useFeedback(projectId: number | null) {
  return useQuery<FeedbackListResponse>({
    queryKey: [`/api/projects/${projectId}/feedback`],
    enabled: projectId !== null,
    staleTime: 10 * 1000,
  });
}

export function useCreateFeedback() {
  return useMutation({
    mutationFn: async ({ projectId, rating, answers, summary }: {
      projectId: number;
      rating: number;
      answers?: FeedbackAnswer[];
      summary?: string;
    }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/feedback`, {
        rating,
        answers,
        summary,
      });
      return res.json() as Promise<FeedbackData>;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/feedback`] });
    },
  });
}

// === ADMIN ===

export function useAdminAnalyze() {
  return useMutation({
    mutationFn: async (projectId: number) => {
      const res = await apiRequest("POST", `/api/admin/projects/${projectId}/analyze`);
      return res.json() as Promise<{ message: string; job: Job }>;
    },
    onSuccess: (_, projectId) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}`] });
    },
  });
}

export function useSummarizeFeedback() {
  return useMutation({
    mutationFn: async ({ rating, answers }: { rating: number; answers: FeedbackAnswer[] }) => {
      const res = await apiRequest("POST", "/api/feedback/summarize", { rating, answers });
      return res.json() as Promise<{ summary: string }>;
    },
  });
}

// === NOTIFICATIONS ===

export interface NotificationData {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  read: boolean;
  linkUrl: string | null;
  createdAt: string;
}

export function useNotifications() {
  return useQuery<{ notifications: NotificationData[]; unreadCount: number }>({
    queryKey: ["/api/notifications"],
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000, // poll every minute for new notifications
  });
}

export function useMarkNotificationRead() {
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/notifications/${id}/read`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notifications/read-all");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });
}
