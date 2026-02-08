import { useState } from "react";
import { useLocation } from "wouter";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { motion } from "framer-motion";
import { ArrowRight, Search, TrendingUp, Clock, Filter } from "lucide-react";
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

          {/* Search + Submit */}
          <motion.div variants={itemVariants} className="max-w-xl mx-auto space-y-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 h-11"
                />
              </div>
              <Button type="submit" className="h-11 px-5">
                Search
              </Button>
            </form>

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
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant={sortBy === "newest" ? "secondary" : "ghost"}
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
              <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
              <p className="text-muted-foreground mb-6 text-sm">
                Be the first to submit a vibe-coded project.
              </p>
              <Button onClick={() => navigate("/submit")}>
                Submit a Project
              </Button>
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

      {/* Subscribe Section */}
      <SubscribeSection />

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="max-w-6xl mx-auto text-center text-xs text-muted-foreground">
          Vibe Index
        </div>
      </footer>
    </div>
  );
}
