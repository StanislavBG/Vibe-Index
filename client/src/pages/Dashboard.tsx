import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Plus, ExternalLink, Trash2, Heart, CreditCard, Loader2, Check, AlertCircle, Pencil, Share2, Trophy, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/Navbar";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { type Project, type Job, useBalance, useSocialShares, useSubmitSocialShare } from "@/hooks/use-projects";
import { useState } from "react";

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

const PLATFORMS = [
  { value: "twitter", label: "Twitter / X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "reddit", label: "Reddit" },
  { value: "mastodon", label: "Mastodon" },
  { value: "facebook", label: "Facebook" },
  { value: "other", label: "Other" },
];

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { data: balance } = useBalance();
  const { data: socialSharesList } = useSocialShares();
  const submitShare = useSubmitSocialShare();

  const [shareForm, setShareForm] = useState({ projectId: "", platform: "twitter", proofUrl: "" });
  const [showShareForm, setShowShareForm] = useState(false);

  const handleSubmitShare = async () => {
    if (!shareForm.projectId || !shareForm.proofUrl) {
      toast({ title: "Missing fields", description: "Project ID and proof URL are required.", variant: "destructive" });
      return;
    }
    try {
      await submitShare.mutateAsync({
        projectId: parseInt(shareForm.projectId),
        platform: shareForm.platform,
        proofUrl: shareForm.proofUrl,
      });
      toast({ title: "Share submitted", description: "We'll verify your post in 24 hours. Keep it live!" });
      setShareForm({ projectId: "", platform: "twitter", proofUrl: "" });
      setShowShareForm(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to submit share", variant: "destructive" });
    }
  };

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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="glass-card p-6">
              <div className="text-sm text-muted-foreground mb-1">Listing Credits</div>
              <div className="text-3xl font-bold">
                {balance?.totalListingCredits ?? ((user?.freeListingsRemaining ?? 0) + (user?.paidListingCredits ?? 0))}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {balance?.freeListingsRemaining ?? user?.freeListingsRemaining ?? 0} free + {balance?.paidListingCredits ?? user?.paidListingCredits ?? 0} earned/paid
              </div>
            </Card>
            <Card className="glass-card p-6">
              <div className="text-sm text-muted-foreground mb-1">Credit Progress</div>
              <div className="text-3xl font-bold flex items-center gap-2">
                <Trophy className="w-6 h-6 text-muted-foreground" />
                {balance?.earnedCredits ?? user?.earnedCredits ?? 0}%
              </div>
              <div className="mt-2">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-foreground rounded-full transition-all"
                    style={{ width: `${Math.min(balance?.earnedCredits ?? 0, 100)}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {100 - (balance?.earnedCredits ?? 0)} more to earn a listing
                </div>
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

          {/* Earn Credits Section */}
          <Card className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Share2 className="w-5 h-5 text-muted-foreground" />
                <div>
                  <div className="font-bold text-sm">Earn Listing Credits</div>
                  <div className="text-xs text-muted-foreground">Share other users' projects on social media. Each verified share earns 20% toward a new listing credit.</div>
                </div>
              </div>
              <Button
                variant={showShareForm ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowShareForm(!showShareForm)}
              >
                {showShareForm ? "Cancel" : "Submit Proof"}
              </Button>
            </div>

            {showShareForm && (
              <div className="border-t border-border pt-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Project ID</label>
                    <Input
                      placeholder="e.g. 42"
                      value={shareForm.projectId}
                      onChange={(e) => setShareForm(prev => ({ ...prev, projectId: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Platform</label>
                    <select
                      value={shareForm.platform}
                      onChange={(e) => setShareForm(prev => ({ ...prev, platform: e.target.value }))}
                      className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      {PLATFORMS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Proof URL</label>
                    <Input
                      placeholder="https://twitter.com/you/status/..."
                      value={shareForm.proofUrl}
                      onChange={(e) => setShareForm(prev => ({ ...prev, proofUrl: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Your post must stay live for 24 hours. We'll verify and credit your account automatically.
                  </p>
                  <Button size="sm" onClick={handleSubmitShare} disabled={submitShare.isPending}>
                    {submitShare.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    Submit
                  </Button>
                </div>
              </div>
            )}

            {/* Recent shares */}
            {socialSharesList && socialSharesList.length > 0 && (
              <div className="border-t border-border pt-4 mt-4 space-y-2">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Shares</h3>
                {socialSharesList.slice(0, 5).map((share) => (
                  <div key={share.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs rounded-md">{share.platform}</Badge>
                      <span className="text-muted-foreground text-xs truncate max-w-[200px]">{share.proofUrl}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">+{share.creditAmount}%</span>
                      {share.status === "pending" && (
                        <Badge variant="outline" className="text-xs rounded-md gap-1">
                          <Clock className="w-3 h-3" />
                          Pending
                        </Badge>
                      )}
                      {share.status === "verified" && (
                        <Badge variant="secondary" className="text-xs rounded-md gap-1">
                          <Check className="w-3 h-3" />
                          Verified
                        </Badge>
                      )}
                      {(share.status === "expired" || share.status === "rejected") && (
                        <Badge variant="destructive" className="text-xs rounded-md gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {share.status === "expired" ? "Expired" : "Rejected"}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
