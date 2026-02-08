import { useState } from "react";
import { useLocation } from "wouter";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { motion } from "framer-motion";
import { ArrowRight, Search, Sparkles, TrendingUp, Clock, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useProjects, useCategories } from "@/hooks/use-projects";
import { ProjectCard } from "@/components/ProjectCard";
import { Navbar } from "@/components/Navbar";
import { SubscribeSection } from "@/components/SubscribeSection";

export default function Home() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>();
  const [sortBy, setSortBy] = useState("newest");
  const { data: categoriesData } = useCategories();
  const { data: projectsData, isLoading: projectsLoading } = useProjects({
    search: activeSearch || undefined,
    categoryId: selectedCategory,
    sort: sortBy,
    limit: 20,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(search);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.08, delayChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { type: "spring", stiffness: 100, damping: 20 },
    },
  };

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
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary font-medium text-sm">
              <Sparkles className="w-4 h-4" />
              Discover Vibe-Coded Projects
            </div>

            <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-[0.9]">
              VIBE
              <br />
              <span className="text-gradient">INDEX</span>
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground font-light max-w-2xl mx-auto leading-relaxed">
              The community-driven directory for{" "}
              <span className="font-semibold text-foreground">vibe-coded</span>{" "}
              projects. Drop a link, get discovered.
            </p>
          </motion.div>

          {/* Search + Submit */}
          <motion.div variants={itemVariants} className="max-w-2xl mx-auto space-y-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="Search projects by name, description, or tags..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 h-12 text-base rounded-xl bg-white/70 dark:bg-black/40 backdrop-blur-sm border-white/20"
                />
              </div>
              <Button type="submit" size="lg" className="h-12 rounded-xl px-6">
                Search
              </Button>
            </form>

            <div className="flex items-center justify-center gap-3">
              <Button
                onClick={() => navigate("/submit")}
                size="lg"
                className="rounded-xl bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-all shadow-lg shadow-primary/25 group"
              >
                Submit Your Project
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Categories Bar */}
      <section className="px-4 pb-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge
              variant={!selectedCategory ? "default" : "outline"}
              className="cursor-pointer px-4 py-2 text-sm rounded-full transition-all hover:scale-105"
              onClick={() => setSelectedCategory(undefined)}
            >
              All Projects
            </Badge>
            {categoriesData?.map((cat) => (
              <Badge
                key={cat.id}
                variant={selectedCategory === cat.id ? "default" : "outline"}
                className="cursor-pointer px-4 py-2 text-sm rounded-full transition-all hover:scale-105"
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
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              {projectsData?.total || 0} projects
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={sortBy === "newest" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSortBy("newest")}
              className="rounded-lg"
            >
              <Clock className="w-4 h-4 mr-1" />
              Newest
            </Button>
            <Button
              variant={sortBy === "popular" ? "default" : "ghost"}
              size="sm"
              onClick={() => setSortBy("popular")}
              className="rounded-lg"
            >
              <TrendingUp className="w-4 h-4 mr-1" />
              Popular
            </Button>
          </div>
        </div>
      </section>

      {/* Projects Grid */}
      <section className="px-4 pb-16">
        <div className="max-w-6xl mx-auto">
          {projectsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card
                  key={i}
                  className="glass-card p-6 h-48 animate-pulse"
                />
              ))}
            </div>
          ) : projectsData?.projects.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-20"
            >
              <Sparkles className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-xl font-bold mb-2">No projects yet</h3>
              <p className="text-muted-foreground mb-6">
                Be the first to submit a vibe-coded project!
              </p>
              <Button
                onClick={() => navigate("/submit")}
                className="rounded-xl"
              >
                Submit a Project
              </Button>
            </motion.div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
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

      {/* Subscribe Section */}
      <SubscribeSection />

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 px-4">
        <div className="max-w-6xl mx-auto text-center text-sm text-muted-foreground font-mono">
          VIBE INDEX — The Vibe-Coded Project Directory
        </div>
      </footer>
    </div>
  );
}
