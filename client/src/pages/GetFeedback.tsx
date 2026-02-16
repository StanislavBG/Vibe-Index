import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, GitBranch, ArrowRight, Loader2, CheckCircle2, XCircle, AlertTriangle, Star, Eye, FileText, Search, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/Navbar";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { useSubmitFeedbackRequest, useFeedbackRequest, type FeedbackReport, type FeedbackScores } from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";

type Phase = "form" | "analyzing" | "report";

function ScoreBar({ label, score, icon: Icon }: { label: string; score: number; icon: React.ElementType }) {
  const pct = (score / 10) * 100;
  const color =
    score >= 8 ? "bg-emerald-500" :
    score >= 6 ? "bg-yellow-500" :
    score >= 4 ? "bg-orange-500" :
    "bg-red-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          {label}
        </span>
        <span className="font-bold tabular-nums">{score}/10</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

function OverallScore({ score }: { score: number }) {
  const color =
    score >= 8 ? "text-emerald-500 border-emerald-500/30" :
    score >= 6 ? "text-yellow-500 border-yellow-500/30" :
    score >= 4 ? "text-orange-500 border-orange-500/30" :
    "text-red-500 border-red-500/30";

  const label =
    score >= 8 ? "Excellent" :
    score >= 6 ? "Good" :
    score >= 4 ? "Needs work" :
    "Needs attention";

  return (
    <div className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 ${color}`}>
      <span className="text-4xl font-bold tabular-nums">{score}</span>
      <span className="text-xs font-medium mt-0.5">/10</span>
      <span className="text-xs mt-1 opacity-80">{label}</span>
    </div>
  );
}

function ReportView({ report }: { report: FeedbackReport }) {
  const { scores, strengths, suggestions, summary, repo } = report;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Summary */}
      <Card className="glass-card p-5">
        <p className="text-sm leading-relaxed">{summary}</p>
      </Card>

      {/* Scores */}
      <Card className="glass-card p-5 space-y-4">
        <h3 className="font-semibold text-sm">Scores</h3>
        <div className="flex gap-5">
          <OverallScore score={scores.overall} />
          <div className="flex-1 space-y-3">
            <ScoreBar label="Presentation" score={scores.presentation} icon={Eye} />
            <ScoreBar label="Documentation" score={scores.documentation} icon={FileText} />
            <ScoreBar label="Discoverability" score={scores.discoverability} icon={Search} />
            <ScoreBar label="Completeness" score={scores.completeness} icon={Package} />
          </div>
        </div>
      </Card>

      {/* Strengths */}
      {strengths.length > 0 && (
        <Card className="glass-card p-5 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Strengths
          </h3>
          <ul className="space-y-2">
            {strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-emerald-500 mt-0.5 flex-shrink-0">+</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <Card className="glass-card p-5 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            Suggestions
          </h3>
          <ul className="space-y-2">
            {suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="text-yellow-500 mt-0.5 flex-shrink-0">-</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Repo info */}
      {repo && (
        <Card className="glass-card p-5 space-y-3">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <GitBranch className="w-4 h-4 text-muted-foreground" />
            Repository
          </h3>
          <div className="flex flex-wrap gap-2">
            {repo.language && <Badge variant="secondary">{repo.language}</Badge>}
            {repo.license && <Badge variant="outline">{repo.license}</Badge>}
            {repo.stars !== null && (
              <Badge variant="outline" className="gap-1">
                <Star className="w-3 h-3" /> {repo.stars}
              </Badge>
            )}
            {repo.topics.map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
            ))}
          </div>
          {repo.hasReadme && (
            <p className="text-xs text-muted-foreground">
              README: {repo.readmeLength.toLocaleString()} characters
            </p>
          )}
        </Card>
      )}
    </motion.div>
  );
}

export default function GetFeedback() {
  const submitMutation = useSubmitFeedbackRequest();
  const { toast } = useToast();

  const [url, setUrl] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("form");
  const [activeRequest, setActiveRequest] = useState<number | null>(null);
  const [report, setReport] = useState<FeedbackReport | null>(null);

  const { data: requestData } = useFeedbackRequest(
    phase === "analyzing" ? activeRequest : null
  );

  // When the request completes, transition to report view
  if (requestData?.status === "completed" && requestData.report && phase === "analyzing") {
    setReport(requestData.report);
    setPhase("report");
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) {
      toast({ title: "URL required", description: "Please paste your project link.", variant: "destructive" });
      return;
    }
    try {
      const result = await submitMutation.mutateAsync({
        url,
        repoUrl: repoUrl || undefined,
      });
      setActiveRequest(result.feedbackRequestId);
      setPhase("analyzing");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to start feedback analysis", variant: "destructive" });
    }
  };

  const handleReset = () => {
    setPhase("form");
    setActiveRequest(null);
    setReport(null);
    setUrl("");
    setRepoUrl("");
  };

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
              {phase === "report" ? "Your Feedback Report" : "Get Feedback"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {phase === "report"
                ? "Here's how your project stacks up."
                : "Paste your project URL and optionally a Git repo for deeper analysis."}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {/* Phase 1: Input form */}
            {phase === "form" && (
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <Card className="glass-card p-6">
                  <form onSubmit={handleSubmit} className="space-y-4">
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
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        Git Repository <span className="text-muted-foreground font-normal">(optional)</span>
                      </label>
                      <div className="relative">
                        <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type="url"
                          placeholder="https://github.com/user/repo"
                          value={repoUrl}
                          onChange={(e) => setRepoUrl(e.target.value)}
                          className="pl-10 h-12 text-base"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Adding a repo lets us assess documentation, code health, and activity.
                      </p>
                    </div>

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full h-12 group"
                      disabled={submitMutation.isPending}
                    >
                      {submitMutation.isPending ? "Starting analysis..." : "Get Feedback"}
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </Button>
                  </form>
                </Card>

                <Card className="glass-card p-5">
                  <div className="space-y-2">
                    <h3 className="font-medium text-sm">What you'll get</h3>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      <li className="flex items-center gap-2"><Eye className="w-3.5 h-3.5" /> Presentation score — website quality, name, descriptions</li>
                      <li className="flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Documentation score — README quality, docs links, license</li>
                      <li className="flex items-center gap-2"><Search className="w-3.5 h-3.5" /> Discoverability score — tags, categories, SEO</li>
                      <li className="flex items-center gap-2"><Package className="w-3.5 h-3.5" /> Completeness score — links, pricing, repo activity</li>
                    </ul>
                  </div>
                </Card>
              </motion.div>
            )}

            {/* Phase 2: Analyzing */}
            {phase === "analyzing" && (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <Card className="glass-card p-8 text-center space-y-4">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {requestData?.stepDetail || "Starting analysis..."}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {repoUrl ? "Analyzing website and repository..." : "Analyzing website..."}
                    </p>
                  </div>
                  {requestData?.status === "failed" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 text-red-500">
                        <XCircle className="w-4 h-4" />
                        <span className="text-sm">Analysis failed</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{requestData.error}</p>
                      <Button variant="outline" size="sm" onClick={handleReset}>
                        Try again
                      </Button>
                    </div>
                  )}
                </Card>
              </motion.div>
            )}

            {/* Phase 3: Report */}
            {phase === "report" && report && (
              <motion.div
                key="report"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <ReportView report={report} />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleReset}
                >
                  Analyze another project
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
