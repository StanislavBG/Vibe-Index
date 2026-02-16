import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Star, Loader2, Send, Award } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { useSubmitHumanFeedback } from "@/hooks/use-human-feedback";
import { useToast } from "@/hooks/use-toast";

const humanFeedbackSchema = z.object({
  overallRating: z.number().min(1).max(10),
  usability: z.string().min(10, "Please write at least 10 characters"),
  marketFit: z.string().min(10, "Please write at least 10 characters"),
  strengths: z.string().min(10, "Please write at least 10 characters"),
  improvements: z.string().min(10, "Please write at least 10 characters"),
  additionalNotes: z.string().optional(),
});

type HumanFeedbackFormValues = z.infer<typeof humanFeedbackSchema>;

function getRatingColor(rating: number): string {
  if (rating <= 3) return "text-red-500";
  if (rating <= 6) return "text-yellow-500";
  return "text-green-500";
}

function getRatingLabel(rating: number): string {
  if (rating <= 2) return "Poor";
  if (rating <= 4) return "Below Average";
  if (rating <= 6) return "Average";
  if (rating <= 8) return "Good";
  return "Excellent";
}

interface HumanFeedbackFormProps {
  projectId: number;
}

export function HumanFeedbackForm({ projectId }: HumanFeedbackFormProps) {
  const submitFeedback = useSubmitHumanFeedback();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [earnedCredits, setEarnedCredits] = useState<number>(0);

  const form = useForm<HumanFeedbackFormValues>({
    resolver: zodResolver(humanFeedbackSchema),
    defaultValues: {
      overallRating: 5,
      usability: "",
      marketFit: "",
      strengths: "",
      improvements: "",
      additionalNotes: "",
    },
  });

  const currentRating = form.watch("overallRating");

  const onSubmit = async (values: HumanFeedbackFormValues) => {
    try {
      const result = await submitFeedback.mutateAsync({
        projectId,
        sections: {
          usability: values.usability,
          marketFit: values.marketFit,
          strengths: values.strengths,
          improvements: values.improvements,
          additionalNotes: values.additionalNotes || undefined,
        },
        overallRating: values.overallRating,
      });
      setEarnedCredits(result.creditAmount ?? 0);
      setSubmitted(true);
      toast({
        title: "Review submitted!",
        description: `Your community review has been published.${result.creditAmount ? ` You earned ${result.creditAmount}% toward a listing credit.` : ""}`,
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to submit review",
        variant: "destructive",
      });
    }
  };

  if (submitted) {
    return (
      <Card className="glass-card p-6">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-green-500">
            <Award className="w-6 h-6" />
            <span className="text-lg font-bold">Review Submitted!</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Thank you for your community review.
          </p>
          {earnedCredits > 0 && (
            <Badge variant="secondary" className="text-sm rounded-md gap-1.5 px-3 py-1">
              <Star className="w-3.5 h-3.5 fill-current" />
              You earned {earnedCredits}% toward a listing credit
            </Badge>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="glass-card p-6">
      <div className="space-y-5">
        {/* Credit indicator */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border">
          <Award className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="text-xs text-muted-foreground">
            You'll earn credits for this review
          </span>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            {/* Overall Rating */}
            <FormField
              control={form.control}
              name="overallRating"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Overall Rating</FormLabel>
                  <FormControl>
                    <div className="space-y-3">
                      <Slider
                        min={1}
                        max={10}
                        step={1}
                        value={[field.value]}
                        onValueChange={(val) => field.onChange(val[0])}
                        className="w-full"
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                        {Array.from({ length: 10 }, (_, i) => (
                          <span key={i + 1}>{i + 1}</span>
                        ))}
                      </div>
                    </div>
                  </FormControl>
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-1 text-sm font-semibold ${getRatingColor(currentRating)}`}>
                      <Star className="w-4 h-4 fill-current" />
                      {currentRating}/10
                    </div>
                    <span className="text-xs text-muted-foreground italic">
                      {getRatingLabel(currentRating)}
                    </span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Usability */}
            <FormField
              control={form.control}
              name="usability"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Usability</FormLabel>
                  <FormDescription>
                    How easy is it to use? What's the UX like?
                  </FormDescription>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the user experience, ease of navigation, design quality..."
                      className="min-h-[80px] text-sm resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Market Fit */}
            <FormField
              control={form.control}
              name="marketFit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Market Fit</FormLabel>
                  <FormDescription>
                    Who is this for? Does it solve a real problem?
                  </FormDescription>
                  <FormControl>
                    <Textarea
                      placeholder="Describe the target audience, problem being solved, competitive landscape..."
                      className="min-h-[80px] text-sm resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Strengths */}
            <FormField
              control={form.control}
              name="strengths"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Strengths</FormLabel>
                  <FormDescription>
                    What does this project do well?
                  </FormDescription>
                  <FormControl>
                    <Textarea
                      placeholder="Highlight the best features, unique aspects, technical achievements..."
                      className="min-h-[80px] text-sm resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Improvements */}
            <FormField
              control={form.control}
              name="improvements"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Improvements</FormLabel>
                  <FormDescription>
                    What could be better?
                  </FormDescription>
                  <FormControl>
                    <Textarea
                      placeholder="Suggest areas for improvement, missing features, bugs..."
                      className="min-h-[80px] text-sm resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Additional Notes (optional) */}
            <FormField
              control={form.control}
              name="additionalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Additional Notes{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormDescription>
                    Anything else?
                  </FormDescription>
                  <FormControl>
                    <Textarea
                      placeholder="Any other thoughts, comparisons, or context..."
                      className="min-h-[60px] text-sm resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={submitFeedback.isPending}
              className="w-full gap-2"
            >
              {submitFeedback.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {submitFeedback.isPending ? "Submitting..." : "Submit Review"}
            </Button>
          </form>
        </Form>
      </div>
    </Card>
  );
}
