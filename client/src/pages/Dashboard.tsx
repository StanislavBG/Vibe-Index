import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Plus, ExternalLink, Trash2, Heart, CreditCard, Loader2, Check, AlertCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/Navbar";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type Project, type Job } from "@/hooks/use-projects";

type ProjectWithJob = Project & { job: Job | null };

function JobStatusBadge({ job }: { job: Job | null }) {
  if (!job) return null;

  if (job.status === "completed") {
    return (
      <Badge variant="secondary" className="text-xs rounded-md gap-1">
        <Check className="w-3 h-3" />
        Live
      </Badge>
    );
  }

  if (job.status === "failed") {
    return (
      <Badge variant="destructive" className="text-xs rounded-md gap-1">
        <AlertCircle className="w-3 h-3" />
        Failed
      </Badge>
    );
  }

  // Draft ready for review
  if (job.status === "review") {
    return (
      <Badge variant="outline" className="text-xs rounded-md gap-1 border-foreground/40">
        <Pencil className="w-3 h-3" />
        Needs review
      </Badge>
    );
  }

  // queued or running
  return (
    <Badge variant="outline" className="text-xs rounded-md gap-1 animate-pulse">
      <Loader2 className="w-3 h-3 animate-spin" />
      {job.step === "fetching" ? "Fetching..." :
       job.step === "analyzing" ? "Analyzing..." :
       job.step === "categorizing" ? "Categorizing..." :
       "Processing..."}
    </Badge>
  );
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const { data: myProjects, isLoading } = useQuery<ProjectWithJob[]>({
    queryKey: ["/api/my-projects"],
    enabled: isAuthenticated,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasRunning = data.some((p) => p.job && (p.job.status === "queued" || p.job.status === "running"));
      return hasRunning ? 3000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Project deleted", description: "Your listing credit has been restored." });
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen w-full relative">
        <BackgroundEffect />
        <Navbar />
        <div className="pt-24 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    navigate("/login");
    return null;
  }

  const runningCount = myProjects?.filter((p) => p.job && (p.job.status === "queued" || p.job.status === "running")).length ?? 0;

  return (
    <div className="min-h-screen w-full relative">
      <BackgroundEffect />
      <Navbar />

      <div className="pt-24 pb-16 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto space-y-8"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight">Dashboard</h1>
              <p className="text-muted-foreground mt-1">Manage your projects and credits</p>
            </div>
            <Button onClick={() => navigate("/submit")} className="gap-2">
              <Plus className="w-4 h-4" />
              New Project
            </Button>
          </div>

          {/* Credits Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="glass-card p-6">
              <div className="text-sm text-muted-foreground mb-1">Listing Credits</div>
              <div className="text-3xl font-bold">
                {(user?.freeListingsRemaining ?? 0) + (user?.paidListingCredits ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {user?.freeListingsRemaining ?? 0} free + {user?.paidListingCredits ?? 0} paid
              </div>
            </Card>
            <Card className="glass-card p-6">
              <div className="text-sm text-muted-foreground mb-1">Likes Remaining</div>
              <div className="text-3xl font-bold flex items-center gap-2">
                <Heart className="w-6 h-6 text-muted-foreground" />
                {user?.likesRemaining ?? 0}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Edit projects to earn more
              </div>
            </Card>
            <Card className="glass-card p-6">
              <div className="text-sm text-muted-foreground mb-1">My Projects</div>
              <div className="text-3xl font-bold">{myProjects?.length ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {runningCount > 0 ? `${runningCount} being analyzed` : "Published listings"}
              </div>
            </Card>
          </div>

          {/* Buy Credits CTA */}
          <Card className="glass-card p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
              <div>
                <div className="font-bold text-sm">Need more credits?</div>
                <div className="text-xs text-muted-foreground">$1 per additional listing or like credit (Stripe integration coming soon)</div>
              </div>
            </div>
            <Button variant="outline" size="sm" className="rounded-lg" disabled>
              Coming Soon
            </Button>
          </Card>

          {/* Projects List */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold">My Projects</h2>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => (
                  <Card key={i} className="glass-card p-6 h-24 animate-pulse" />
                ))}
              </div>
            ) : myProjects?.length === 0 ? (
              <Card className="glass-card p-8 text-center">
                <p className="text-muted-foreground mb-4">You haven't submitted any projects yet.</p>
                <Button onClick={() => navigate("/submit")}>
                  Submit Your First Project
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {myProjects?.map((project) => (
                  <Card key={project.id} className="glass-card p-5 flex items-center justify-between hover:shadow-lg transition-all">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold truncate">
                          {project.name || new URL(project.url).hostname.replace("www.", "")}
                        </h3>
                        <JobStatusBadge job={project.job} />
                        {project.status === "active" && (
                          <Badge variant="secondary" className="text-xs rounded-md flex-shrink-0">
                            {project.likesCount} likes
                          </Badge>
                        )}
                      </div>
                      <a
                        href={project.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {project.url}
                      </a>
                      {project.job && project.job.stepDetail && project.job.status === "running" && (
                        <p className="text-xs text-muted-foreground mt-1">{project.job.stepDetail}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/project/${project.id}`)}
                        className="gap-1"
                        disabled={project.status !== "active"}
                      >
                        View
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm("Delete this project? Your listing credit will be restored.")) {
                            deleteMutation.mutate(project.id);
                          }
                        }}
                        className="text-destructive hover:text-destructive gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
