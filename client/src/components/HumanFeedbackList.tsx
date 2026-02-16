import { useState } from "react";
import { Star, ChevronDown, ChevronUp, Users, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { useProjectHumanFeedback, type HumanFeedbackEntry } from "@/hooks/use-human-feedback";
import { timeAgo } from "@/lib/time";

const PAGE_SIZE = 20;

function getRatingColor(rating: number): string {
  if (rating <= 3) return "text-red-500";
  if (rating <= 6) return "text-yellow-500";
  return "text-green-500";
}

function getRatingBgClass(rating: number): string {
  if (rating <= 3) return "bg-red-500/10 text-red-500 border-red-500/20";
  if (rating <= 6) return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
  return "bg-green-500/10 text-green-500 border-green-500/20";
}

function sectionLabel(key: string): string {
  switch (key) {
    case "usability": return "Usability";
    case "marketFit": return "Market Fit";
    case "strengths": return "Strengths";
    case "improvements": return "Improvements";
    case "additionalNotes": return "Additional Notes";
    default: return key;
  }
}

function FeedbackEntry({ entry }: { entry: HumanFeedbackEntry }) {
  const [expanded, setExpanded] = useState(false);
  const sections = entry.sections;
  const sectionKeys = ["usability", "marketFit", "strengths", "improvements", "additionalNotes"] as const;
  const filledSections = sectionKeys.filter(
    (key) => sections[key] && sections[key]!.trim().length > 0
  );

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold uppercase">
            {entry.username?.[0] || "?"}
          </span>
          <span className="text-sm font-medium">{entry.username || "Anonymous"}</span>
          <Badge
            variant="outline"
            className={`text-xs rounded-md gap-1 border ${getRatingBgClass(entry.overallRating)}`}
          >
            <Star className="w-3 h-3 fill-current" />
            {entry.overallRating}/10
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">{timeAgo(entry.createdAt)}</span>
      </div>

      {/* Expandable sections */}
      {filledSections.length > 0 && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Hide details" : `Show details (${filledSections.length} sections)`}
          </button>

          {expanded && (
            <Accordion type="multiple" className="w-full">
              {filledSections.map((key) => (
                <AccordionItem key={key} value={key} className="border-b-0 border-t border-border/50">
                  <AccordionTrigger className="py-2 text-xs font-medium text-muted-foreground hover:no-underline">
                    {sectionLabel(key)}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed">
                    {sections[key]}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </>
      )}
    </div>
  );
}

interface HumanFeedbackListProps {
  projectId: number;
}

export function HumanFeedbackList({ projectId }: HumanFeedbackListProps) {
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useProjectHumanFeedback(projectId, PAGE_SIZE, offset);

  const feedback = data?.feedback ?? [];
  const total = data?.total ?? 0;
  const hasMore = offset + PAGE_SIZE < total;

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-20 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (feedback.length === 0 && offset === 0) {
    return (
      <div className="text-center py-8 space-y-2">
        <Users className="w-8 h-8 mx-auto text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          No community reviews yet. Be the first to review!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {feedback.map((entry) => (
        <FeedbackEntry key={entry.id} entry={entry} />
      ))}

      {/* Load more */}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
            className="gap-1.5"
          >
            Load more reviews
          </Button>
        </div>
      )}

      {total > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          Showing {Math.min(offset + PAGE_SIZE, total)} of {total} reviews
        </p>
      )}
    </div>
  );
}
