import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { motion } from "framer-motion";
import { ArrowRight, Search, TrendingUp, Clock, Bell, Mic, MicOff, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useProjects, useCategories, useVoiceSearch } from "@/hooks/use-projects";
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
  const [sortBy, setSortBy] = useState("newest");
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const voiceSearch = useVoiceSearch();

  // Debounce search input — fires query 300ms after user stops typing
  const debouncedSearch = useDebounce(search, 300);

  // When there's a search query, default to relevance sort
  const effectiveSort = debouncedSearch.trim() ? (sortBy === "newest" ? "relevance" : sortBy) : sortBy;

  const { data: categoriesData } = useCategories();
  const { data: projectsData, isLoading: projectsLoading } = useProjects({
    search: debouncedSearch.trim() || undefined,
    categoryId: selectedCategory,
    sort: effectiveSort,
    limit: 20,
  });

  // Voice recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
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
      toast({ title: "Microphone access denied", description: "Allow mic access to use voice search.", variant: "destructive" });
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
    setSortBy("newest");
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06, delayChildren: 0.1 },
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

  const isSearching = debouncedSearch.trim().length > 0;

  return (
    <div className="min-h-screen w-full relative">
      <BackgroundEffect />
      <Navbar />

      {/* Hero Section */}
      <motion.section
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="pt-28 pb-16 px-4"
      >
        <div className="max-w-5xl mx-auto text-center space-y-8">
          <motion.div variants={itemVariants} className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary border border-border text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Project Directory
            </div>

            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter leading-[0.9]">
              Vibe Index
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground font-normal max-w-xl mx-auto leading-relaxed">
              The community directory for vibe-coded projects.
              <br className="hidden md:block" />
              Drop a link, get discovered.
            </p>
          </motion.div>

          {/* Search bar: type + voice */}
          <motion.div variants={itemVariants} className="max-w-xl mx-auto space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, description, or topic..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 pr-10 h-12 text-base"
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
                className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 transition-all border ${
                  isRecording
                    ? "bg-destructive text-destructive-foreground border-destructive animate-pulse"
                    : voiceSearch.isPending
                      ? "bg-muted border-border"
                      : "bg-background border-border hover:border-foreground/30 hover:bg-muted"
                }`}
                title={isRecording ? "Stop recording" : "Voice search"}
              >
                {voiceSearch.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="w-5 h-5" />
                ) : (
                  <Mic className="w-5 h-5" />
                )}
              </button>
            </div>

            {/* Search mode indicator */}
            {isSearching && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="w-3 h-3" />
                Semantic search across names, descriptions, and tags
              </div>
            )}

            <Button
              onClick={() => navigate("/submit")}
              size="lg"
              className="group"
            >
              Submit Your Project
              <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </motion.div>
        </div>
      </motion.section>

      {/* Categories Bar */}
      <section className="px-4 pb-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge
              variant={!selectedCategory ? "default" : "outline"}
              className="cursor-pointer px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
              onClick={() => setSelectedCategory(undefined)}
            >
              All
            </Badge>
            {categoriesData?.map((cat) => (
              <Badge
                key={cat.id}
                variant={selectedCategory === cat.id ? "default" : "outline"}
                className="cursor-pointer px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
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
        </div>
      </section>

      {/* Sort Controls */}
      <section className="px-4 pb-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {projectsData?.total || 0} projects
            {isSearching && ` matching "${debouncedSearch}"`}
          </span>
          <div className="flex items-center gap-1">
            {isSearching && (
              <Button
                variant={effectiveSort === "relevance" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setSortBy("relevance")}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                Relevance
              </Button>
            )}
            <Button
              variant={(!isSearching && sortBy === "newest") || (isSearching && effectiveSort === "newest") ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSortBy("newest")}
            >
              <Clock className="w-3.5 h-3.5 mr-1" />
              Newest
            </Button>
            <Button
              variant={sortBy === "popular" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setSortBy("popular")}
            >
              <TrendingUp className="w-3.5 h-3.5 mr-1" />
              Popular
            </Button>
          </div>
        </div>
      </section>

      {/* Projects Grid */}
      <section className="px-4 pb-16">
        <div className="max-w-6xl mx-auto">
          {projectsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="p-6 h-48 animate-pulse bg-muted/50" />
              ))}
            </div>
          ) : projectsData?.projects.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20"
            >
              {isSearching ? (
                <>
                  <h3 className="text-lg font-semibold mb-2">No results for "{debouncedSearch}"</h3>
                  <p className="text-muted-foreground mb-6 text-sm">
                    Try different keywords, or use voice search to describe what you're looking for.
                  </p>
                  <Button variant="outline" onClick={clearSearch}>
                    Clear Search
                  </Button>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
                  <p className="text-muted-foreground mb-6 text-sm">
                    Be the first to submit a vibe-coded project.
                  </p>
                  <Button onClick={() => navigate("/submit")}>
                    Submit a Project
                  </Button>
                </>
              )}
            </motion.div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {projectsData?.projects.map((project) => (
                <motion.div key={project.id} variants={itemVariants}>
                  <ProjectCard project={project} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </section>

      {/* Subscribe CTA */}
      <section className="px-4 py-16">
        <div className="max-w-3xl mx-auto">
          <Card className="glass-card p-8 md:p-10 flex flex-col md:flex-row items-center gap-6">
            <div className="flex-1 text-center md:text-left">
              <div className="flex items-center gap-2 justify-center md:justify-start mb-2">
                <Bell className="w-5 h-5 text-muted-foreground" />
                <h2 className="text-xl font-bold">Stay in the Loop</h2>
              </div>
              <p className="text-sm text-muted-foreground max-w-md">
                Get AI-curated digests of new projects matched to your interests.
                Choose your frequency, pick your categories, no spam ever.
              </p>
            </div>
            <Button
              onClick={() => navigate("/subscribe")}
              size="lg"
              className="gap-2 group flex-shrink-0"
            >
              Set Up Your Digest
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-6xl mx-auto text-center text-xs text-muted-foreground">
          Vibe Index
        </div>
      </footer>
    </div>
  );
}
