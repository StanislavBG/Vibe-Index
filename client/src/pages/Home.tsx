import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Search,
  TrendingUp,
  Clock,
  Bell,
  Mic,
  MicOff,
  Loader2,
  Sparkles,
  X,
  Send,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useProjects, useCategories, useVoiceSearch, useSubscribe } from "@/hooks/use-projects";
import { ProjectCard } from "@/components/ProjectCard";
import { Navbar } from "@/components/Navbar";
import { useToast } from "@/hooks/use-toast";

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function Home() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>();
  const [sortBy, setSortBy] = useState("popular");
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  // Quick-submit panel
  const [submitUrl, setSubmitUrl] = useState("");

  // Inline subscribe panel
  const [subscribeEmail, setSubscribeEmail] = useState("");
  const [subscribeCats, setSubscribeCats] = useState<number[]>([]);
  const subscribeMutation = useSubscribe();

  const voiceSearch = useVoiceSearch();

  const debouncedSearch = useDebounce(search, 300);
  // When searching, default to relevance instead of popular
  const effectiveSort = debouncedSearch.trim()
    ? sortBy === "popular"
      ? "relevance"
      : sortBy
    : sortBy;

  const { data: categoriesData } = useCategories();
  const { data: projectsData, isLoading: projectsLoading } = useProjects({
    search: debouncedSearch.trim() || undefined,
    categoryId: selectedCategory,
    sort: effectiveSort,
    limit: 20,
  });

  // ── Voice recording ──────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size < 100) {
          toast({ title: "Too short", description: "Hold the mic button longer.", variant: "destructive" });
          return;
        }
        try {
          const result = await voiceSearch.mutateAsync(blob);
          setSearch(result.query);
          toast({ title: "Voice search", description: `Searching: "${result.query}"` });
        } catch (err: any) {
          toast({ title: "Voice search failed", description: err.message, variant: "destructive" });
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      toast({
        title: "Microphone access denied",
        description: "Allow mic access to use voice search.",
        variant: "destructive",
      });
    }
  }, [voiceSearch, toast]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const clearSearch = () => {
    setSearch("");
    setSortBy("popular");
  };

  // ── Subscribe helpers ────────────────────────────────────────────
  const toggleSubscribeCat = (id: number) => {
    setSubscribeCats((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subscribeEmail || subscribeCats.length === 0) {
      toast({
        title: "Missing fields",
        description: "Enter your email and select at least one category.",
        variant: "destructive",
      });
      return;
    }
    try {
      await subscribeMutation.mutateAsync({
        email: subscribeEmail,
        categoryIds: subscribeCats,
        frequency: "weekly",
      });
      toast({ title: "Subscribed!", description: "You'll receive weekly digests matched to your interests." });
      setSubscribeEmail("");
      setSubscribeCats([]);
    } catch (err: any) {
      toast({ title: "Subscription failed", description: err.message || "Something went wrong", variant: "destructive" });
    }
  };

  // ── Quick submit ─────────────────────────────────────────────────
  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (submitUrl.trim()) {
      navigate(`/submit?url=${encodeURIComponent(submitUrl.trim())}`);
    } else {
      navigate("/submit");
    }
  };

  const isSearching = debouncedSearch.trim().length > 0;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.04, delayChildren: 0.05 },
    },
  };

  const itemVariants = {
    hidden: { y: 8, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring", stiffness: 200, damping: 30 },
    },
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <BackgroundEffect />
      <Navbar>
        <div className="flex items-center gap-3">
          {/* Branding pill */}
          <div className="flex-shrink-0 hidden sm:flex items-center gap-2 pr-3 border-r border-border">
            <div>
              <h1 className="text-sm font-bold leading-tight tracking-tight">Vibe Index</h1>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Community project directory
              </p>
            </div>
          </div>

          {/* Search input + voice */}
          <div className="flex-1 flex gap-2 min-w-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search projects by name, description, or topic..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-10 h-10 text-sm"
              />
              {search && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={voiceSearch.isPending}
              className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all border ${
                isRecording
                  ? "bg-destructive text-destructive-foreground border-destructive animate-pulse"
                  : voiceSearch.isPending
                    ? "bg-muted border-border"
                    : "bg-background border-border hover:border-foreground/30 hover:bg-muted"
              }`}
              title={isRecording ? "Stop recording" : "Voice search"}
            >
              {voiceSearch.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isRecording ? (
                <MicOff className="w-4 h-4" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Sort controls + project count */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className="text-[11px] text-muted-foreground mr-1.5 hidden lg:inline tabular-nums">
              {projectsData?.total || 0} projects
            </span>
            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              {isSearching && (
                <Button
                  variant={effectiveSort === "relevance" ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 text-xs px-2.5 rounded-none border-0"
                  onClick={() => setSortBy("relevance")}
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  Best
                </Button>
              )}
              <Button
                variant={sortBy === "popular" && !isSearching ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs px-2.5 rounded-none border-0"
                onClick={() => setSortBy("popular")}
              >
                <TrendingUp className="w-3 h-3 mr-1" />
                Top
              </Button>
              <Button
                variant={sortBy === "newest" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 text-xs px-2.5 rounded-none border-0"
                onClick={() => setSortBy("newest")}
              >
                <Clock className="w-3 h-3 mr-1" />
                New
              </Button>
            </div>
          </div>
        </div>
      </Navbar>

      {/* ── HEADER: Categories ─────────────────────────────────────── */}
      <div className="pt-16 flex-shrink-0 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        {/* Category filter pills */}
        <div className="px-4 lg:px-6 py-2.5 flex items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant={!selectedCategory ? "default" : "outline"}
              className="cursor-pointer px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors"
              onClick={() => setSelectedCategory(undefined)}
            >
              All
            </Badge>
            {categoriesData?.map((cat) => (
              <Badge
                key={cat.id}
                variant={selectedCategory === cat.id ? "default" : "outline"}
                className="cursor-pointer px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors"
                onClick={() =>
                  setSelectedCategory(
                    selectedCategory === cat.id ? undefined : cat.id
                  )
                }
              >
                {cat.name}
              </Badge>
            ))}
          </div>
          {isSearching && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground ml-auto flex-shrink-0">
              <Sparkles className="w-3 h-3" />
              Semantic search active
            </div>
          )}
        </div>
      </div>

      {/* ── MAIN CONTENT: Project Grid + Sidebar ───────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Scrollable project grid */}
        <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4">
          {projectsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {[...Array(9)].map((_, i) => (
                <Card key={i} className="p-5 h-36 animate-pulse bg-muted/50" />
              ))}
            </div>
          ) : projectsData?.projects.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                {isSearching ? (
                  <>
                    <h3 className="text-base font-semibold mb-1">
                      No results for "{debouncedSearch}"
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Try different keywords or use voice search.
                    </p>
                    <Button variant="outline" size="sm" onClick={clearSearch}>
                      Clear Search
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="text-base font-semibold mb-1">No projects yet</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Be the first to submit a vibe-coded project.
                    </p>
                    <Button size="sm" onClick={() => navigate("/submit")}>
                      Submit a Project
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"
            >
              {projectsData?.projects.map((project) => (
                <motion.div key={project.id} variants={itemVariants}>
                  <ProjectCard project={project} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Right: Sidebar with SUBMIT + STAY IN THE LOOP */}
        <aside className="hidden lg:flex w-[300px] flex-shrink-0 border-l border-border/50 flex-col overflow-y-auto">
          {/* ── SUBMIT Panel ──────────────────────────────────────── */}
          <div className="p-4 pb-3 border-b border-border/50">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md bg-foreground text-background flex items-center justify-center">
                <Send className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-bold text-xs uppercase tracking-widest">
                Submit
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
              Drop a link — our AI builds your listing. Review and publish in
              under a minute.
            </p>
            <form onSubmit={handleQuickSubmit} className="space-y-2">
              <Input
                type="url"
                placeholder="https://your-project.com"
                value={submitUrl}
                onChange={(e) => setSubmitUrl(e.target.value)}
                className="h-9 text-xs"
              />
              <Button
                type="submit"
                className="w-full h-10 text-xs font-bold gap-2 group"
              >
                Submit Your Project
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </form>
            <p className="text-[10px] text-muted-foreground mt-2 text-center">
              3 free listings — no account needed
            </p>
          </div>

          {/* ── STAY IN THE LOOP Panel ────────────────────────────── */}
          <div className="p-4 flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md bg-foreground text-background flex items-center justify-center">
                <Bell className="w-3.5 h-3.5" />
              </div>
              <h3 className="font-bold text-xs uppercase tracking-widest">
                Stay in the Loop
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
              AI-curated weekly digests of new projects matched to your
              interests. Zero spam.
            </p>

            <form onSubmit={handleSubscribe} className="space-y-3 flex-1 flex flex-col">
              {/* Category picks */}
              <div>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Categories
                </p>
                <div className="flex flex-wrap gap-1">
                  {categoriesData?.map((cat) => (
                    <Badge
                      key={cat.id}
                      variant={
                        subscribeCats.includes(cat.id) ? "default" : "outline"
                      }
                      className="cursor-pointer px-1.5 py-0.5 text-[10px] rounded transition-colors"
                      onClick={() => toggleSubscribeCat(cat.id)}
                    >
                      {subscribeCats.includes(cat.id) && (
                        <Check className="w-2.5 h-2.5 mr-0.5" />
                      )}
                      {cat.name}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Email */}
              <Input
                type="email"
                placeholder="your@email.com"
                value={subscribeEmail}
                onChange={(e) => setSubscribeEmail(e.target.value)}
                className="h-9 text-xs"
                required
              />

              <Button
                type="submit"
                className="w-full h-10 text-xs font-bold gap-2 group"
                disabled={subscribeMutation.isPending}
              >
                {subscribeMutation.isPending
                  ? "Subscribing..."
                  : "Subscribe to Digest"}
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Button>

              <button
                type="button"
                onClick={() => navigate("/subscribe")}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors text-center"
              >
                Customize frequency & preferences →
              </button>
            </form>
          </div>
        </aside>
      </div>

      {/* ── MOBILE: Sticky bottom bar with both CTAs ───────────────── */}
      <div className="lg:hidden flex-shrink-0 border-t border-border bg-background/95 backdrop-blur-lg px-4 py-2 flex gap-2">
        <Button
          size="sm"
          className="flex-1 h-10 text-xs gap-1.5 font-bold"
          onClick={() => navigate("/submit")}
        >
          <Send className="w-3.5 h-3.5" />
          Submit Project
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 h-10 text-xs gap-1.5 font-bold"
          onClick={() => navigate("/subscribe")}
        >
          <Bell className="w-3.5 h-3.5" />
          Stay in the Loop
        </Button>
      </div>
    </div>
  );
}
