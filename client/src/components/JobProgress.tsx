import { useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Check, X, Globe, Search, Tag, Pencil, ArrowRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useJob } from "@/hooks/use-projects";

const STEPS = [
  { key: "fetching", label: "Fetching website", icon: Globe },
  { key: "analyzing", label: "Analyzing content", icon: Search },
  { key: "categorizing", label: "Assigning categories", icon: Tag },
  { key: "review", label: "Ready for review", icon: Pencil },
];

export function JobProgress({
  jobId,
  projectId,
  onClose,
  onDraftReady,
}: {
  jobId: number;
  projectId: number;
  onClose?: () => void;
  onDraftReady?: (jobResult: string) => void;
}) {
  const [, navigate] = useLocation();
  const { data: job } = useJob(jobId);

  const currentStep = job?.step || "waiting";
  const isReview = job?.status === "review";
  const isCompleted = job?.status === "completed";
  const isFailed = job?.status === "failed";
  const isRunning = !isCompleted && !isFailed && !isReview;

  // When draft is ready, notify parent
  useEffect(() => {
    if (isReview && job?.result && onDraftReady) {
      onDraftReady(job.result);
    }
  }, [isReview, job?.result, onDraftReady]);

  // If already completed (approved), redirect
  useEffect(() => {
    if (isCompleted) {
      const timer = setTimeout(() => {
        navigate(`/project/${projectId}`);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isCompleted, projectId, navigate]);

  const stepIndex = STEPS.findIndex((s) => s.key === currentStep);

  return (
    <Card className="glass-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">
          {isReview
            ? "Draft ready for your review"
            : isCompleted
              ? "Published"
              : isFailed
                ? "Analysis failed"
                : "Analyzing your project..."}
        </h3>
        {isRunning && (
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        )}
        {isReview && (
          <Pencil className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      <div className="space-y-3">
        {STEPS.map((step, i) => {
          const StepIcon = step.icon;
          const isActive = step.key === currentStep;
          const isDone = stepIndex > i || isCompleted;

          return (
            <motion.div
              key={step.key}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`flex items-center gap-3 text-sm ${
                isActive
                  ? "text-foreground"
                  : isDone
                    ? "text-muted-foreground"
                    : "text-muted-foreground/40"
              }`}
            >
              <div
                className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                  isDone
                    ? "bg-foreground text-background"
                    : isActive
                      ? "bg-muted border border-foreground/20"
                      : "bg-muted"
                }`}
              >
                {isDone ? (
                  <Check className="w-3.5 h-3.5" />
                ) : isActive && isRunning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <StepIcon className="w-3.5 h-3.5" />
                )}
              </div>
              <span className={isDone ? "line-through" : ""}>
                {step.label}
              </span>
            </motion.div>
          );
        })}
      </div>

      {job?.stepDetail && isRunning && (
        <p className="text-xs text-muted-foreground">{job.stepDetail}</p>
      )}

      <AnimatePresence>
        {isFailed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-2"
          >
            <div className="flex items-center gap-2 text-sm text-destructive">
              <X className="w-4 h-4" />
              <span>{job?.error || "Something went wrong during analysis."}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Don't worry — a basic listing was created from your URL. You can edit it from your dashboard.
            </p>
          </motion.div>
        )}

        {isCompleted && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-2"
          >
            <p className="text-xs text-muted-foreground">
              Redirecting to your project page...
            </p>
            <Button
              size="sm"
              onClick={() => navigate(`/project/${projectId}`)}
              className="gap-1"
            >
              View Project
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {isRunning && onClose && (
        <div className="pt-2 border-t border-border">
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Close and check back later from your dashboard
          </button>
        </div>
      )}
    </Card>
  );
}
