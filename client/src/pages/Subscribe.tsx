import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Bell, Check, Shield, Clock, Sparkles,
  Mail, ArrowRight, Zap, LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { useCategories, useSubscribe, useDigestPreferences } from "@/hooks/use-projects";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const FREQUENCIES = [
  { value: "daily", label: "Daily", desc: "Every morning" },
  { value: "weekly", label: "Weekly", desc: "Every Monday" },
  { value: "monthly", label: "Monthly", desc: "First of the month" },
];

const PRICING_OPTIONS = [
  { value: "all", label: "All" },
  { value: "free", label: "Free only" },
  { value: "paid", label: "Paid only" },
];

const INTEREST_SUGGESTIONS = [
  "AI tools", "SaaS", "Open source", "Developer experience",
  "Design systems", "No-code", "APIs", "Data visualization",
  "Mobile apps", "Productivity", "E-commerce", "Education",
];

export default function Subscribe() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [frequency, setFrequency] = useState("weekly");
  const [pricingFilter, setPricingFilter] = useState("all");
  const [interests, setInterests] = useState<string[]>([]);
  const [maxProjects, setMaxProjects] = useState(10);
  const [submitted, setSubmitted] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const { data: categories } = useCategories();
  const { data: existingPrefs } = useDigestPreferences();
  const subscribeMutation = useSubscribe();
  const { toast } = useToast();

  // Load existing preferences when they arrive
  useEffect(() => {
    if (existingPrefs && !prefsLoaded) {
      if (existingPrefs.subscriptions.length > 0) {
        setSelectedCategories(existingPrefs.subscriptions.map(s => s.categoryId));
      }
      if (existingPrefs.preferences) {
        setFrequency(existingPrefs.preferences.frequency || "weekly");
        setPricingFilter(existingPrefs.preferences.pricingFilter || "all");
        setMaxProjects(existingPrefs.preferences.maxProjects || 10);
        if (existingPrefs.preferences.interests) {
          try {
            setInterests(JSON.parse(existingPrefs.preferences.interests));
          } catch { /* ignore */ }
        }
      }
      setPrefsLoaded(true);
    }
  }, [existingPrefs, prefsLoaded]);

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
    if (selectedCategories.length === 0) {
      toast({
        title: "Almost there",
        description: "Pick at least one category.",
        variant: "destructive",
      });
      return;
    }
    try {
      await subscribeMutation.mutateAsync({
        categoryIds: selectedCategories,
        frequency: frequency as "daily" | "weekly" | "monthly",
        interests: interests.length > 0 ? interests : undefined,
        pricingFilter,
        maxProjects,
      });
      setSubmitted(true);
    } catch (err: any) {
      toast({
        title: "Something went wrong",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { y: 16, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring", stiffness: 120, damping: 24 },
    },
  };

  const isEditing = prefsLoaded && existingPrefs && existingPrefs.subscriptions.length > 0;

  return (
    <div className="min-h-screen w-full relative">
      <BackgroundEffect />
      <Navbar />

      <div className="pt-24 pb-16 px-4">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-2xl mx-auto"
        >
          {/* Header */}
          <motion.div variants={itemVariants} className="text-center space-y-4 mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary border border-border text-muted-foreground text-xs font-medium tracking-wide uppercase">
              <Bell className="w-3.5 h-3.5" />
              Stay in the Loop
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tighter">
              Your personal<br />project digest
            </h1>
            <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
              Our AI curates a personalized summary of new vibe-coded projects
              based on what you care about. No spam, no noise — just the good stuff.
            </p>
          </motion.div>

          {/* Not authenticated — show sign-in prompt */}
          {!authLoading && !isAuthenticated ? (
            <motion.div variants={itemVariants}>
              <Card className="glass-card p-10 text-center">
                <LogIn className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
                <h2 className="text-xl font-bold mb-2">Sign in to subscribe</h2>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
                  Your digest preferences are tied to your account so we can
                  personalize based on your likes, follows, and interests.
                </p>
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" onClick={() => navigate("/login")}>
                    Log in
                  </Button>
                  <Button onClick={() => navigate("/register")}>
                    Sign up
                  </Button>
                </div>
              </Card>
            </motion.div>
          ) : submitted ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-6"
            >
              <Card className="glass-card p-10">
                <div className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center mx-auto mb-4">
                  <Check className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-bold mb-2">
                  {isEditing ? "Preferences updated" : "You're in"}
                </h2>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-6">
                  Your {frequency} digest will be composed based on your preferences.
                  Each email is uniquely curated to match your interests.
                </p>
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" onClick={() => navigate("/")}>
                    Discover Projects
                  </Button>
                  <Button onClick={() => { setSubmitted(false); }}>
                    Edit Preferences
                  </Button>
                </div>
              </Card>
            </motion.div>
          ) : (
            <>
              {/* Value props */}
              <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
                <Card className="glass-card p-4 text-center">
                  <Sparkles className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                  <div className="text-sm font-medium">AI-curated</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Each digest is written specifically for your interests
                  </p>
                </Card>
                <Card className="glass-card p-4 text-center">
                  <Shield className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                  <div className="text-sm font-medium">No spam, ever</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Only the frequency you choose. Unsubscribe in one click.
                  </p>
                </Card>
                <Card className="glass-card p-4 text-center">
                  <Zap className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
                  <div className="text-sm font-medium">Smart summaries</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Whether 1 or 50 projects match, you get a great read
                  </p>
                </Card>
              </motion.div>

              {/* Logged-in user info */}
              {user && (
                <motion.div variants={itemVariants} className="mb-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
                    <Mail className="w-3.5 h-3.5" />
                    Digests will be sent to <span className="font-medium text-foreground">{user.email}</span>
                  </div>
                </motion.div>
              )}

              {/* Main form */}
              <motion.div variants={itemVariants}>
                <Card className="glass-card p-6 md:p-8">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Step 1: Categories */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-foreground text-background text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                        <label className="text-sm font-semibold">What categories interest you?</label>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {categories?.map((cat) => (
                          <Badge
                            key={cat.id}
                            variant={selectedCategories.includes(cat.id) ? "default" : "outline"}
                            className="cursor-pointer px-3 py-1.5 text-xs rounded-md transition-colors"
                            onClick={() => toggleCategory(cat.id)}
                          >
                            {selectedCategories.includes(cat.id) && <Check className="w-3 h-3 mr-1" />}
                            {cat.name}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Step 2: Interests */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-foreground text-background text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                        <label className="text-sm font-semibold">Refine with interests</label>
                        <span className="text-xs text-muted-foreground">(optional)</span>
                      </div>
                      <p className="text-xs text-muted-foreground ml-8">
                        Our AI uses these keywords to prioritize and summarize projects for you.
                      </p>
                      <div className="flex flex-wrap gap-1.5 ml-8">
                        {INTEREST_SUGGESTIONS.map((interest) => (
                          <Badge
                            key={interest}
                            variant={interests.includes(interest) ? "default" : "outline"}
                            className="cursor-pointer px-2.5 py-1 text-xs rounded-md transition-colors"
                            onClick={() => toggleInterest(interest)}
                          >
                            {interests.includes(interest) && <Check className="w-3 h-3 mr-1" />}
                            {interest}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {/* Step 3: Frequency + Pricing */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-foreground text-background text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                        <label className="text-sm font-semibold">How often?</label>
                      </div>
                      <div className="grid grid-cols-3 gap-2 ml-8">
                        {FREQUENCIES.map((f) => (
                          <button
                            key={f.value}
                            type="button"
                            onClick={() => setFrequency(f.value)}
                            className={`p-3 rounded-lg border text-left transition-all ${
                              frequency === f.value
                                ? "bg-foreground text-background border-foreground"
                                : "border-border hover:border-foreground/30"
                            }`}
                          >
                            <div className="text-sm font-medium">{f.label}</div>
                            <div className={`text-xs mt-0.5 ${frequency === f.value ? "text-background/70" : "text-muted-foreground"}`}>{f.desc}</div>
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-3 ml-8 pt-1">
                        <span className="text-xs font-medium text-muted-foreground">Pricing filter:</span>
                        <div className="flex gap-1.5">
                          {PRICING_OPTIONS.map((p) => (
                            <button
                              key={p.value}
                              type="button"
                              onClick={() => setPricingFilter(p.value)}
                              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
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

                      <div className="ml-8 pt-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-muted-foreground">
                            Projects per digest
                          </span>
                          <span className="text-xs font-bold">{maxProjects}</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={25}
                          value={maxProjects}
                          onChange={(e) => setMaxProjects(parseInt(e.target.value))}
                          className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-foreground"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                          <span>Focused</span>
                          <span>Comprehensive</span>
                        </div>
                      </div>
                    </div>

                    {/* Submit */}
                    <Button
                      type="submit"
                      className="w-full h-11 gap-2 group"
                      disabled={subscribeMutation.isPending}
                    >
                      {subscribeMutation.isPending
                        ? "Saving..."
                        : isEditing
                          ? "Update Preferences"
                          : "Subscribe"}
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </Button>
                  </form>
                </Card>
              </motion.div>

              {/* Trust signals */}
              <motion.div variants={itemVariants} className="mt-6 text-center space-y-2">
                <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    No spam guarantee
                  </span>
                  <span className="flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    One-click unsubscribe
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Change frequency anytime
                  </span>
                </div>
              </motion.div>
            </>
          )}
        </motion.div>
      </div>

      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-6xl mx-auto text-center text-xs text-muted-foreground">
          Vibe Index
        </div>
      </footer>
    </div>
  );
}
