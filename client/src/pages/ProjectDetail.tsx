import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Heart, ExternalLink, Share2, Globe, BookOpen, Github, Clock, Tag, ArrowLeft, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/Navbar";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { useProject, useLikeProject } from "@/hooks/use-projects";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { queryClient } from "@/lib/queryClient";

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

export default function ProjectDetail() {
  const [, params] = useRoute("/project/:id");
  const [, navigate] = useLocation();
  const projectId = params?.id ? parseInt(params.id) : null;
  const { data: project, isLoading } = useProject(projectId);
  const { isAuthenticated } = useAuth();
  const likeMutation = useLikeProject();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleLike = async () => {
    if (!isAuthenticated) {
      toast({ title: "Login required", description: "Create an account to like projects.", variant: "destructive" });
      return;
    }
    if (!project) return;
    try {
      await likeMutation.mutateAsync({
        projectId: project.id,
        action: project.liked ? "unlike" : "like",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}`] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to like", variant: "destructive" });
    }
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: project?.name || "Vibe-Coded Project",
          text: project?.shortDescription || "Check out this vibe-coded project!",
          url: shareUrl,
        });
      } catch {
        // User cancelled
      }
    } else {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: "Link copied!", description: "Share it with your friends." });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full relative">
        <BackgroundEffect />
        <Navbar />
        <div className="pt-24 pb-16 px-4">
          <div className="max-w-3xl mx-auto">
            <Card className="glass-card p-8 animate-pulse h-96" />
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen w-full relative">
        <BackgroundEffect />
        <Navbar />
        <div className="pt-24 pb-16 px-4 text-center">
          <h1 className="text-2xl font-bold mb-4">Project not found</h1>
          <Button onClick={() => navigate("/")}>Back to Home</Button>
        </div>
      </div>
    );
  }

  const tags = project.tags?.split(",").map((t) => t.trim()).filter(Boolean) || [];

  return (
    <div className="min-h-screen w-full relative">
      <BackgroundEffect />
      <Navbar />

      <div className="pt-24 pb-16 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-3xl mx-auto space-y-6"
        >
          {/* Back */}
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back to projects
          </Button>

          {/* Main Card */}
          <Card className="glass-card p-8 md:p-10">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <h1 className="text-3xl md:text-4xl font-black tracking-tight">
                    {project.name || new URL(project.url).hostname.replace("www.", "")}
                  </h1>
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline text-sm"
                  >
                    <Globe className="w-4 h-4" />
                    {project.url}
                  </a>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant={project.liked ? "default" : "outline"}
                    size="sm"
                    onClick={handleLike}
                    disabled={likeMutation.isPending}
                    className="gap-2 rounded-full"
                  >
                    <Heart className={`w-4 h-4 ${project.liked ? "fill-current" : ""}`} />
                    {project.likesCount}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleShare}
                    className="gap-2 rounded-full"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                    Share
                  </Button>
                </div>
              </div>

              {/* Description */}
              {project.shortDescription && (
                <p className="text-lg text-muted-foreground leading-relaxed">
                  {project.shortDescription}
                </p>
              )}

              {project.longDescription && (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <p>{project.longDescription}</p>
                </div>
              )}

              {/* Categories */}
              {project.categories && project.categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {project.categories.map((cat) => (
                    <Badge key={cat.id} className="rounded-full">
                      {cat.name}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Tags */}
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag, i) => (
                    <Badge key={i} variant="outline" className="rounded-full text-xs">
                      <Tag className="w-3 h-3 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Links */}
              <div className="flex flex-wrap gap-3 pt-4 border-t border-border/50">
                <a href={project.url} target="_blank" rel="noopener noreferrer">
                  <Button variant="default" size="sm" className="gap-2 rounded-full">
                    <ExternalLink className="w-4 h-4" />
                    Visit Project
                  </Button>
                </a>
                {project.demoUrl && (
                  <a href={project.demoUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-2 rounded-full">
                      <Globe className="w-4 h-4" />
                      Demo
                    </Button>
                  </a>
                )}
                {project.docsUrl && (
                  <a href={project.docsUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-2 rounded-full">
                      <BookOpen className="w-4 h-4" />
                      Docs
                    </Button>
                  </a>
                )}
                {project.repoUrl && (
                  <a href={project.repoUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-2 rounded-full">
                      <Github className="w-4 h-4" />
                      Source
                    </Button>
                  </a>
                )}
              </div>

              {/* Meta */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground pt-2">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  Submitted {timeAgo(project.createdAt)}
                </div>
                {project.pricingModel && (
                  <Badge variant="secondary" className="rounded-full text-xs">
                    {project.pricingModel}
                    {project.pricingDetails ? ` - ${project.pricingDetails}` : ""}
                  </Badge>
                )}
                {!project.claimed && (
                  <Badge variant="outline" className="rounded-full text-xs">
                    Unclaimed
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
