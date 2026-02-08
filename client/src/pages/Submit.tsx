import { useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, ArrowRight, Info, FileText, UserPlus, ExternalLink, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/Navbar";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { JobProgress } from "@/components/JobProgress";
import { DraftEditor } from "@/components/DraftEditor";
import { useSubmitProject, type Project, type Job, type DraftData } from "@/hooks/use-projects";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

type ProjectWithJob = Project & { job: Job | null };

type SubmitPhase = "form" | "analyzing" | "review";

export default function Submit() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const submitMutation = useSubmitProject();
  const { toast } = useToast();

  const [url, setUrl] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("url") || "";
  });
  const [activeJob, setActiveJob] = useState<{ jobId: number; projectId: number } | null>(null);
  const [phase, setPhase] = useState<SubmitPhase>("form");
  const [draftData, setDraftData] = useState<DraftData | null>(null);

  // Fetch user's existing projects when logged in
  const { data: myProjects } = useQuery<ProjectWithJob[]>({
    queryKey: ["/api/my-projects"],
    enabled: isAuthenticated,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      const hasRunning = data.some((p) => p.job && (p.job.status === "queued" || p.job.status === "running"));
      return hasRunning ? 3000 : false;
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) {
      toast({ title: "URL required", description: "Please paste your project link.", variant: "destructive" });
      return;
    }
    try {
      const result = await submitMutation.mutateAsync({ url });
      if (result.anonymousToken) {
        localStorage.setItem(`vibe-token-${result.project.id}`, result.anonymousToken);
      }
      setActiveJob({ jobId: result.job.id, projectId: result.project.id });
      setPhase("analyzing");
    } catch (err: any) {
      const message = err.message || "Submission failed";
      if (message.includes("Anonymous submission limit")) {
        toast({
          title: "Limit reached",
          description: "You've used all 3 anonymous submissions. Create an account to submit more.",
          variant: "destructive",
        });
      } else if (message.includes("No listing credits")) {
        toast({
          title: "No credits remaining",
          description: "Purchase additional listing credits to submit more projects.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Error", description: message, variant: "destructive" });
      }
    }
  };

  // Called by JobProgress when scraper finishes and draft is ready
  const handleDraftReady = useCallback((jobResult: string) => {
    try {
      const parsed = JSON.parse(jobResult) as DraftData;
      setDraftData(parsed);
      setPhase("review");
    } catch {
      toast({ title: "Error", description: "Could not parse draft data", variant: "destructive" });
    }
  }, [toast]);

  const creditsRemaining = isAuthenticated
    ? (user?.freeListingsRemaining ?? 0) + (user?.paidListingCredits ?? 0)
    : null;

  const activeProjects = myProjects?.filter((p) => p.status === "active") ?? [];
  const pendingProjects = myProjects?.filter((p) => p.status === "pending") ?? [];

  return (
    <div className="min-h-screen w-full relative">
      <BackgroundEffect />
      <Navbar />

      <div className="pt-24 pb-16 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-lg mx-auto space-y-6"
        >
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
              {phase === "review" ? "Review Your Listing" : "Submit a Project"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {phase === "review"
                ? "Edit with typing or voice. Approve when it looks right."
                : "Paste a link. Our agent will analyze and build a draft for you to review."}
            </p>
            {phase === "form" && isAuthenticated && (
              <p className="text-xs text-muted-foreground">
                {creditsRemaining} listing {creditsRemaining === 1 ? "credit" : "credits"} remaining
              </p>
            )}
            {phase === "form" && !isAuthenticated && (
              <p className="text-xs text-muted-foreground">
                Up to 3 projects without an account
              </p>
            )}
          </div>

          <AnimatePresence mode="wait">
            {/* Phase 1: URL input form */}
            {phase === "form" && (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <Card className="glass-card p-6">
                  <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Project URL</label>
                      <div className="relative">
                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type="url"
                          placeholder="https://your-project.com"
                          value={url}
                          onChange={(e) => setUrl(e.target.value)}
                          className="pl-10 h-12 text-base"
                          required
                          autoFocus
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        We'll visit your site, extract details, and generate a draft for you to review.
                      </p>
                    </div>

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full h-12 group"
                      disabled={submitMutation.isPending}
                    >
                      {submitMutation.isPending ? "Starting analysis..." : "Analyze & Submit"}
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </Button>
                  </form>
                </Card>

                {/* Your projects section for logged-in users */}
                {isAuthenticated && myProjects && myProjects.length > 0 && (
                  <Card className="glass-card p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">Your Projects</h3>
                      <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Manage all
                      </Link>
                    </div>

                    <div className="space-y-2">
                      {pendingProjects.map((project) => (
                        <div key={project.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">
                                {project.name || new URL(project.url).hostname.replace("www.", "")}
                              </span>
                              <Badge variant="outline" className="text-[10px] rounded-md gap-1 animate-pulse flex-shrink-0">
                                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                {project.job?.step === "review" ? "Needs review" :
                                 project.job?.step === "fetching" ? "Fetching" :
                                 project.job?.step === "analyzing" ? "Analyzing" :
                                 project.job?.step === "categorizing" ? "Categorizing" :
                                 "Processing"}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}

                      {activeProjects.slice(0, 5).map((project) => (
                        <div key={project.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">
                                {project.name || new URL(project.url).hostname.replace("www.", "")}
                              </span>
                              <Badge variant="secondary" className="text-[10px] rounded-md gap-1 flex-shrink-0">
                                <Check className="w-2.5 h-2.5" />
                                Live
                              </Badge>
                              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                                {project.likesCount} likes
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => navigate(`/project/${project.id}`)}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}

                      {activeProjects.length > 5 && (
                        <Link href="/dashboard" className="block text-xs text-muted-foreground hover:text-foreground text-center pt-1 transition-colors">
                          +{activeProjects.length - 5} more projects
                        </Link>
                      )}
                    </div>
                  </Card>
                )}

                {/* Ownership messaging for anonymous users */}
                {!isAuthenticated && (
                  <Card className="glass-card p-5">
                    <div className="flex items-start gap-3">
                      <UserPlus className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <div className="space-y-1.5">
                        <h3 className="font-medium text-sm">Want to control your listing?</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Anonymous submissions are public but unclaimed. Create an account to edit
                          your project details, track likes, and manage your listings from a dashboard.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1 text-xs h-7"
                          onClick={() => navigate("/register")}
                        >
                          Create Account
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}

                {/* vibe-index.json info */}
                <Card className="glass-card p-5">
                  <div className="flex items-start gap-3">
                    <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="space-y-1.5">
                      <h3 className="font-medium text-sm">Want full control over your listing?</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Add a <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">vibe-index.json</code> file
                        to your site root. Our agent reads it first to build your page.
                      </p>
                      <details className="text-xs">
                        <summary className="cursor-pointer font-medium flex items-center gap-1 mt-1">
                          <FileText className="w-3.5 h-3.5" />
                          View template
                        </summary>
                        <pre className="mt-2 p-3 bg-muted rounded-lg text-[11px] overflow-x-auto font-mono">
{`{
  "name": "My Project",
  "description": "A short description",
  "longDescription": "Detailed description...",
  "pricing": "free | one-time | subscription | mixed",
  "pricingDetails": "$9.99/mo",
  "demo": "https://demo.example.com",
  "docs": "https://docs.example.com",
  "repo": "https://github.com/user/repo",
  "tags": ["ai", "developer-tools", "saas"],
  "categories": ["ai-ml", "dev-tools"]
}`}
                        </pre>
                      </details>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* Phase 2: Agent analyzing */}
            {phase === "analyzing" && activeJob && (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <JobProgress
                  jobId={activeJob.jobId}
                  projectId={activeJob.projectId}
                  onDraftReady={handleDraftReady}
                  onClose={() => {
                    setPhase("form");
                    setActiveJob(null);
                    setUrl("");
                    toast({
                      title: "Running in background",
                      description: "Check your dashboard to see the progress.",
                    });
                    if (isAuthenticated) {
                      navigate("/dashboard");
                    }
                  }}
                />
              </motion.div>
            )}

            {/* Phase 3: Draft review with typing + voice editing */}
            {phase === "review" && activeJob && draftData && (
              <motion.div
                key="review"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <DraftEditor
                  jobId={activeJob.jobId}
                  projectId={activeJob.projectId}
                  initialDraft={draftData}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
