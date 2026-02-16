import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

// --- Types ---

export interface HumanFeedbackSections {
  usability: string;
  marketFit: string;
  strengths: string;
  improvements: string;
  additionalNotes?: string;
}

export interface HumanFeedbackEntry {
  id: number;
  projectId: number;
  userId: number;
  username: string;
  sections: HumanFeedbackSections;
  overallRating: number;
  creditAmount: number;
  createdAt: string;
}

export interface HumanFeedbackListResponse {
  feedback: HumanFeedbackEntry[];
  total: number;
}

export interface MyFeedbackEntry extends HumanFeedbackEntry {
  projectName: string;
  projectUrl: string;
}

export interface Contributor {
  userId: number;
  username: string;
  role: "developer" | "registered_by" | "discovered_by";
}

// --- Hooks ---

export function useProjectHumanFeedback(projectId: number, limit?: number, offset?: number) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (offset) params.set("offset", String(offset));
  const queryString = params.toString();
  const url = `/api/projects/${projectId}/human-feedback${queryString ? `?${queryString}` : ""}`;
  return useQuery<HumanFeedbackListResponse>({
    queryKey: [url],
    enabled: projectId > 0,
    staleTime: 30 * 1000,
  });
}

export function useMyFeedback() {
  return useQuery<MyFeedbackEntry[]>({
    queryKey: ["/api/my-feedback"],
    staleTime: 30 * 1000,
  });
}

export function useMyFeedbackInbox() {
  return useQuery<HumanFeedbackEntry[]>({
    queryKey: ["/api/my-feedback-inbox"],
    staleTime: 30 * 1000,
  });
}

export function useSubmitHumanFeedback() {
  return useMutation({
    mutationFn: async ({ projectId, sections, overallRating }: {
      projectId: number;
      sections: HumanFeedbackSections;
      overallRating: number;
    }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/human-feedback`, {
        sections,
        overallRating,
      });
      return res.json() as Promise<HumanFeedbackEntry & { creditAmount: number }>;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${projectId}/human-feedback`] });
      queryClient.invalidateQueries({ queryKey: ["/api/my-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["/api/balance"] });
    },
  });
}

export function useProjectContributors(projectId: number) {
  return useQuery<Contributor[]>({
    queryKey: [`/api/projects/${projectId}/contributors`],
    enabled: projectId > 0,
    staleTime: 5 * 60 * 1000,
  });
}
