import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Bell, Check, ChevronDown } from "lucide-react";
import { useCategories, useSubscribe } from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";

const FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const PRICING_OPTIONS = [
  { value: "all", label: "All projects" },
  { value: "free", label: "Free only" },
  { value: "paid", label: "Paid only" },
];

const INTEREST_SUGGESTIONS = [
  "AI tools", "SaaS", "Open source", "Developer experience",
  "Design systems", "No-code", "APIs", "Data visualization",
];

export function SubscribeSection() {
  const [email, setEmail] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [frequency, setFrequency] = useState("weekly");
  const [pricingFilter, setPricingFilter] = useState("all");
  const [interests, setInterests] = useState<string[]>([]);
  const [maxProjects, setMaxProjects] = useState(10);
  const [showPreferences, setShowPreferences] = useState(false);
  const { data: categories } = useCategories();
  const subscribeMutation = useSubscribe();
  const { toast } = useToast();

  const toggleCategory = (id: number) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((i) => i !== interest) : [...prev, interest]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || selectedCategories.length === 0) {
      toast({
        title: "Missing fields",
        description: "Please enter your email and select at least one category.",
        variant: "destructive",
      });
      return;
    }
    try {
      await subscribeMutation.mutateAsync({
        email,
        categoryIds: selectedCategories,
        frequency: frequency as "daily" | "weekly" | "monthly",
        interests: interests.length > 0 ? interests : undefined,
        pricingFilter,
        maxProjects,
      });
      toast({
        title: "Subscribed!",
        description: `You'll receive ${frequency} digests personalized to your interests.`,
      });
      setEmail("");
      setSelectedCategories([]);
      setInterests([]);
      setShowPreferences(false);
    } catch (err: any) {
      toast({
        title: "Subscription failed",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  return (
    <section className="px-4 py-16">
      <div className="max-w-3xl mx-auto">
        <Card className="glass-card p-8 md:p-12 text-center">
          <Bell className="w-8 h-8 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            Stay in the Loop
          </h2>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto text-sm">
            Get personalized digests of new vibe-coded projects. Our AI curates
            summaries based on your interests — whether one project or ten match,
            you'll get a great read.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Categories */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Categories
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {categories?.map((cat) => (
                  <Badge
                    key={cat.id}
                    variant={selectedCategories.includes(cat.id) ? "default" : "outline"}
                    className="cursor-pointer px-2.5 py-1 text-xs rounded-md transition-colors"
                    onClick={() => toggleCategory(cat.id)}
                  >
                    {selectedCategories.includes(cat.id) && (
                      <Check className="w-3 h-3 mr-1" />
                    )}
                    {cat.name}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Email + Subscribe */}
            <div className="flex gap-2 max-w-md mx-auto">
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
                required
              />
              <Button
                type="submit"
                className="h-10 px-5"
                disabled={subscribeMutation.isPending}
              >
                {subscribeMutation.isPending ? "..." : "Subscribe"}
              </Button>
            </div>

            {/* Preferences toggle */}
            <button
              type="button"
              onClick={() => setShowPreferences(!showPreferences)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 mx-auto"
            >
              <ChevronDown className={`w-3 h-3 transition-transform ${showPreferences ? "rotate-180" : ""}`} />
              Customize your digest
            </button>

            {showPreferences && (
              <div className="space-y-5 text-left max-w-md mx-auto pt-2 border-t border-border">
                {/* Frequency */}
                <div className="space-y-2">
                  <label className="text-xs font-medium">Frequency</label>
                  <div className="flex gap-2">
                    {FREQUENCIES.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setFrequency(f.value)}
                        className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                          frequency === f.value
                            ? "bg-foreground text-background border-foreground"
                            : "border-border hover:border-foreground/30"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pricing filter */}
                <div className="space-y-2">
                  <label className="text-xs font-medium">Pricing</label>
                  <div className="flex gap-2">
                    {PRICING_OPTIONS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setPricingFilter(p.value)}
                        className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                          pricingFilter === p.value
                            ? "bg-foreground text-background border-foreground"
                            : "border-border hover:border-foreground/30"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Interests */}
                <div className="space-y-2">
                  <label className="text-xs font-medium">Interests</label>
                  <p className="text-xs text-muted-foreground">
                    Our AI uses these to curate relevant project summaries for you.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {INTEREST_SUGGESTIONS.map((interest) => (
                      <Badge
                        key={interest}
                        variant={interests.includes(interest) ? "default" : "outline"}
                        className="cursor-pointer px-2 py-0.5 text-xs rounded-md transition-colors"
                        onClick={() => toggleInterest(interest)}
                      >
                        {interests.includes(interest) && <Check className="w-3 h-3 mr-1" />}
                        {interest}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Max projects */}
                <div className="space-y-2">
                  <label className="text-xs font-medium">
                    Projects per digest: <span className="text-muted-foreground">{maxProjects}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={25}
                    value={maxProjects}
                    onChange={(e) => setMaxProjects(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-foreground"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Focused (1)</span>
                    <span>Comprehensive (25)</span>
                  </div>
                </div>
              </div>
            )}
          </form>
        </Card>
      </div>
    </section>
  );
}
