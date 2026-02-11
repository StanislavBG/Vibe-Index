/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  MessageSquare, Mic, MicOff, Loader2, Send, FileText, Star, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  useFeedback, useCreateFeedback, useSummarizeFeedback,
  type FeedbackAnswer, type FeedbackData,
} from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";

// --- Rating scale labels ---
const RATING_LABELS: Record<number, string> = {
  1: "This is a vibe",
  2: "AI slop",
  3: "AI slop with a spark",
  4: "Has potential, needs work",
  5: "Not production-quality yet",
  6: "Getting somewhere",
  7: "Almost there",
  8: "Could ship this one day",
  9: "Nearly production-ready",
  10: "Super Bowl commercial ready",
};

// --- Follow-up questions by rating range ---
function getFollowUpQuestions(rating: number): string[] {
  if (rating <= 3) {
    return [
      "What feels most broken or unreliable?",
      "What would need to change for this to reach a 5?",
      "Is there anything here that shows promise?",
    ];
  }
  if (rating <= 5) {
    return [
      "What feels most broken or unreliable?",
      "What would need to change for this to be a 7?",
      "What part, if any, is working well?",
    ];
  }
  if (rating <= 7) {
    return [
      "What's the strongest aspect of this project?",
      "What would push this to an 8 or above?",
      "Any rough edges that stood out?",
    ];
  }
  if (rating <= 9) {
    return [
      "What makes this feel production-worthy?",
      "Is there anything that could still be improved?",
      "Would you recommend this to others? Why?",
    ];
  }
  return [
    "What makes this a 10 for you?",
    "How does this compare to similar tools you've used?",
    "What's the single most impressive thing about it?",
  ];
}

// --- Rating color ---
function getRatingColor(rating: number): string {
  if (rating <= 3) return "text-red-500";
  if (rating <= 5) return "text-orange-500";
  if (rating <= 7) return "text-yellow-500";
  if (rating <= 9) return "text-emerald-500";
  return "text-green-500";
}

function getRatingBg(rating: number): string {
  if (rating <= 3) return "bg-red-500/10";
  if (rating <= 5) return "bg-orange-500/10";
  if (rating <= 7) return "bg-yellow-500/10";
  if (rating <= 9) return "bg-emerald-500/10";
  return "bg-green-500/10";
}

// --- Time ago helper ---
function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// --- Voice input hook (Web Speech API) ---
function useVoiceInput(onResult: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const isSupported = typeof window !== "undefined" && (
    "SpeechRecognition" in window || "webkitSpeechRecognition" in window
  );

  const startListening = useCallback(() => {
    if (!isSupported) return;
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) onResult(transcript);
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isSupported, onResult]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  return { isListening, isSupported, startListening, stopListening };
}

// --- Individual feedback entry display ---
function FeedbackEntry({ entry }: { entry: FeedbackData }) {
  const [expanded, setExpanded] = useState(false);
  const parsedAnswers: FeedbackAnswer[] = entry.answers ? JSON.parse(entry.answers) : [];

  return (
    <div className="border border-border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${getRatingBg(entry.rating)} ${getRatingColor(entry.rating)}`}>
            <Star className="w-3 h-3 fill-current" />
            {entry.rating}/10
          </div>
          <span className="text-xs text-muted-foreground italic">
            {RATING_LABELS[entry.rating]}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{timeAgo(entry.createdAt)}</span>
      </div>

      {entry.summary && (
        <p className="text-sm text-muted-foreground leading-relaxed">{entry.summary}</p>
      )}

      {parsedAnswers.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? "Hide details" : "Show details"}
        </button>
      )}

      {expanded && parsedAnswers.length > 0 && (
        <div className="space-y-2 pl-3 border-l-2 border-border">
          {parsedAnswers.map((qa, i) => (
            <div key={i}>
              <p className="text-xs font-medium text-muted-foreground">{qa.question}</p>
              <p className="text-sm">{qa.answer}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
          A
        </span>
        <span>Anonymous</span>
      </div>
    </div>
  );
}

// --- Main Feedback Component ---
interface FeedbackComponentProps {
  projectId: number;
}

export function FeedbackComponent({ projectId }: FeedbackComponentProps) {
  const { data: feedbackData, isLoading } = useFeedback(projectId);
  const createFeedback = useCreateFeedback();
  const summarizeFeedback = useSummarizeFeedback();
  const { toast } = useToast();

  // Form state
  const [rating, setRating] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [summary, setSummary] = useState("");
  const [phase, setPhase] = useState<"rate" | "answer" | "summarize" | "review">("rate");
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);

  const questions = rating ? getFollowUpQuestions(rating) : [];

  // Voice input for the active question
  const handleVoiceResult = useCallback((text: string) => {
    setAnswers((prev) => ({
      ...prev,
      [activeQuestionIndex]: (prev[activeQuestionIndex] || "") + (prev[activeQuestionIndex] ? " " : "") + text,
    }));
  }, [activeQuestionIndex]);

  const { isListening, isSupported: voiceSupported, startListening, stopListening } = useVoiceInput(handleVoiceResult);

  // Auto-scroll to active question
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    if (phase === "answer" && questionRefs.current[activeQuestionIndex]) {
      questionRefs.current[activeQuestionIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeQuestionIndex, phase]);

  // Reset form
  const resetForm = () => {
    setRating(null);
    setAnswers({});
    setSummary("");
    setPhase("rate");
    setActiveQuestionIndex(0);
  };

  // Handle rating selection
  const handleRatingSelect = (value: number[]) => {
    setRating(value[0]);
  };

  const handleRatingConfirm = () => {
    if (rating) {
      setPhase("answer");
      setActiveQuestionIndex(0);
      setAnswers({});
    }
  };

  // Handle summarize
  const handleSummarize = async () => {
    if (!rating) return;
    const feedbackAnswers: FeedbackAnswer[] = questions.map((q, i) => ({
      question: q,
      answer: answers[i] || "",
    })).filter((a) => a.answer.trim());

    setPhase("summarize");
    try {
      const result = await summarizeFeedback.mutateAsync({ rating, answers: feedbackAnswers });
      setSummary(result.summary);
      setPhase("review");
    } catch {
      toast({ title: "Error", description: "Failed to generate summary", variant: "destructive" });
      setPhase("answer");
    }
  };

  // Handle publish
  const handlePublish = async () => {
    if (!rating) return;
    const feedbackAnswers: FeedbackAnswer[] = questions.map((q, i) => ({
      question: q,
      answer: answers[i] || "",
    })).filter((a) => a.answer.trim());

    try {
      await createFeedback.mutateAsync({
        projectId,
        rating,
        answers: feedbackAnswers.length > 0 ? feedbackAnswers : undefined,
        summary: summary || undefined,
      });
      toast({ title: "Feedback published", description: "Your anonymous feedback has been submitted." });
      resetForm();
    } catch {
      toast({ title: "Error", description: "Failed to submit feedback", variant: "destructive" });
    }
  };

  const hasAnswers = Object.values(answers).some((a) => a.trim());

  return (
    <Card className="glass-card p-6">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-bold text-sm">
              Feedback {feedbackData && feedbackData.count > 0 && `(${feedbackData.count})`}
            </h2>
          </div>
          {feedbackData?.averageRating && (
            <div className="flex items-center gap-1.5">
              <Star className={`w-3.5 h-3.5 fill-current ${getRatingColor(Math.round(feedbackData.averageRating))}`} />
              <span className="text-sm font-semibold">{feedbackData.averageRating}</span>
              <span className="text-xs text-muted-foreground">/10 avg</span>
            </div>
          )}
        </div>

        {/* Feedback Form */}
        <div className="border border-border rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Anonymous</Badge>
            <span className="text-xs text-muted-foreground">Your identity is never shared</span>
          </div>

          {/* Phase: Rate */}
          {phase === "rate" && (
            <div className="space-y-4">
              <div className="space-y-3">
                <label className="text-sm font-medium">Rate this project</label>
                <Slider
                  min={1}
                  max={10}
                  step={1}
                  value={rating ? [rating] : [5]}
                  onValueChange={handleRatingSelect}
                  className="w-full"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                  <span>1</span>
                  <span>2</span>
                  <span>3</span>
                  <span>4</span>
                  <span>5</span>
                  <span>6</span>
                  <span>7</span>
                  <span>8</span>
                  <span>9</span>
                  <span>10</span>
                </div>
              </div>

              {rating && (
                <div className="flex items-center justify-between">
                  <div className={`flex items-center gap-2 text-sm font-medium ${getRatingColor(rating)}`}>
                    <Star className="w-4 h-4 fill-current" />
                    <span>{rating}/10</span>
                    <span className="text-xs font-normal italic">&mdash; {RATING_LABELS[rating]}</span>
                  </div>
                  <Button size="sm" onClick={handleRatingConfirm}>
                    Next
                  </Button>
                </div>
              )}

              {/* Scale anchors */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                <span><strong>1:</strong> "This is a vibe"</span>
                <span><strong>5:</strong> "Not production-quality yet"</span>
                <span><strong>~2-3:</strong> "AI slop"</span>
                <span><strong>8+:</strong> "Could ship this one day"</span>
                <span></span>
                <span><strong>10:</strong> "Super Bowl commercial ready"</span>
              </div>
            </div>
          )}

          {/* Phase: Answer follow-up questions */}
          {phase === "answer" && rating && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2 text-sm font-medium ${getRatingColor(rating)}`}>
                  <Star className="w-4 h-4 fill-current" />
                  <span>{rating}/10</span>
                  <span className="text-xs font-normal italic">&mdash; {RATING_LABELS[rating]}</span>
                </div>
                <button
                  onClick={() => { setPhase("rate"); }}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                >
                  Change rating
                </button>
              </div>

              <div className="space-y-3">
                {questions.map((question, i) => (
                  <div
                    key={i}
                    ref={(el) => { questionRefs.current[i] = el; }}
                    className={`space-y-1.5 transition-opacity ${i === activeQuestionIndex ? "opacity-100" : "opacity-60"}`}
                  >
                    <label className="text-xs font-medium text-muted-foreground">
                      {question}
                    </label>
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="Type or use voice..."
                        value={answers[i] || ""}
                        onChange={(e) => setAnswers({ ...answers, [i]: e.target.value })}
                        onFocus={() => setActiveQuestionIndex(i)}
                        className="min-h-[50px] text-sm resize-none"
                        rows={2}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            if (i < questions.length - 1) {
                              setActiveQuestionIndex(i + 1);
                            }
                          }
                        }}
                      />
                      {voiceSupported && i === activeQuestionIndex && (
                        <Button
                          variant={isListening ? "destructive" : "outline"}
                          size="icon"
                          className="self-end flex-shrink-0 h-9 w-9"
                          onClick={isListening ? stopListening : startListening}
                          title={isListening ? "Stop recording" : "Record voice answer"}
                        >
                          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[10px] text-muted-foreground">
                  Ctrl+Enter to move to next question
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSummarize}
                    disabled={!hasAnswers || summarizeFeedback.isPending}
                    className="gap-1.5"
                  >
                    {summarizeFeedback.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    Summarize
                  </Button>
                  <Button
                    size="sm"
                    onClick={handlePublish}
                    disabled={!hasAnswers || createFeedback.isPending}
                    className="gap-1.5"
                  >
                    {createFeedback.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Publish
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Phase: Summarizing */}
          {phase === "summarize" && (
            <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating summary...
            </div>
          )}

          {/* Phase: Review summary before publishing */}
          {phase === "review" && rating && (
            <div className="space-y-4">
              <div className={`flex items-center gap-2 text-sm font-medium ${getRatingColor(rating)}`}>
                <Star className="w-4 h-4 fill-current" />
                <span>{rating}/10</span>
                <span className="text-xs font-normal italic">&mdash; {RATING_LABELS[rating]}</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Summary</label>
                <Textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="min-h-[60px] text-sm resize-none"
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setPhase("answer")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline"
                >
                  Edit answers
                </button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSummarize}
                    disabled={summarizeFeedback.isPending}
                    className="gap-1.5"
                  >
                    {summarizeFeedback.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    Re-summarize
                  </Button>
                  <Button
                    size="sm"
                    onClick={handlePublish}
                    disabled={createFeedback.isPending}
                    className="gap-1.5"
                  >
                    {createFeedback.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    Publish
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Existing feedback list */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-16 bg-muted/50 rounded animate-pulse" />
            ))}
          </div>
        ) : feedbackData && feedbackData.feedback.length > 0 ? (
          <div className="space-y-3">
            {feedbackData.feedback.map((entry) => (
              <FeedbackEntry key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No feedback yet. Be the first to rate this project!</p>
        )}
      </div>
    </Card>
  );
}
