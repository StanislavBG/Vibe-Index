import { useRoute, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Heart, ExternalLink, Share2, Globe, BookOpen, Github, Clock, Tag, ArrowLeft, Check, UserPlus, UserMinus, MessageSquare, Send, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/Navbar";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { useProject, useLikeProject, useFollowProject, useComments, useCreateComment, useDeleteComment } from "@/hooks/use-projects";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { Textarea } from "@/components/ui/textarea";

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
  const { user, isAuthenticated } = useAuth();
  const likeMutation = useLikeProject();
  const followMutation = useFollowProject();
  const { data: commentsList, isLoading: commentsLoading } = useComments(projectId);
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [commentText, setCommentText] = useState("");

  const handleFollow = async () => {
    if (!isAuthenticated) {
      toast({ title: "Login required", description: "Create an account to follow projects.", variant: "destructive" });
      return;
    }
    if (!project) return;
    try {
      await followMutation.mutateAsync({
        projectId: project.id,
        action: project.followed ? "unfollow" : "follow",
      });
      queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}`] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to follow", variant: "destructive" });
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim() || !project) return;
    try {
      await createComment.mutateAsync({ projectId: project.id, content: commentText.trim() });
      setCommentText("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to post comment", variant: "destructive" });
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      await deleteComment.mutateAsync({ commentId });
      if (project) {
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}/comments`] });
        queryClient.invalidateQueries({ queryKey: [`/api/projects/${project.id}`] });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to delete", variant: "destructive" });
    }
  };

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
      toast({ title: "Link copied!" });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full relative">
        <BackgroundEffect />
        <Navbar />
        <div className="pt-24 pb-16 px-4">
          <div className="max-w-2xl mx-auto">
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
          <h1 className="text-xl font-semibold mb-4">Project not found</h1>
          <Button onClick={() => navigate("/")}>Back to Home</Button>
        </div>
      </div>
    );
  }

  // Prefer canonical tags from the tagging service; fall back to legacy comma-separated tags
  const canonicalTags = project.canonicalTags || [];
  const legacyTags = project.tags?.split(",").map((t) => t.trim()).filter(Boolean) || [];
  const displayTags = canonicalTags.length > 0
    ? canonicalTags.map((t) => t.name)
    : legacyTags;

  return (
    <div className="min-h-screen w-full relative">
      <BackgroundEffect />
      <Navbar />

      <div className="pt-24 pb-16 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-2xl mx-auto space-y-5"
        >
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          <Card className="glass-card p-8">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                    {project.name || new URL(project.url).hostname.replace("www.", "")}
                  </h1>
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {project.url}
                  </a>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    variant={project.liked ? "default" : "outline"}
                    size="sm"
                    onClick={handleLike}
                    disabled={likeMutation.isPending}
                    className="gap-1.5"
                  >
                    <Heart className={`w-3.5 h-3.5 ${project.liked ? "fill-current" : ""}`} />
                    {project.likesCount}
                  </Button>
                  <Button
                    variant={project.followed ? "default" : "outline"}
                    size="sm"
                    onClick={handleFollow}
                    disabled={followMutation.isPending}
                    className="gap-1.5"
                  >
                    {project.followed ? <UserMinus className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                    {project.followed ? "Following" : "Follow"}
                    {project.followsCount > 0 && <span className="ml-0.5">{project.followsCount}</span>}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleShare}
                    className="gap-1.5"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                    Share
                  </Button>
                </div>
              </div>

              {project.shortDescription && (
                <p className="text-muted-foreground leading-relaxed">
                  {project.shortDescription}
                </p>
              )}

              {project.longDescription && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {project.longDescription}
                </p>
              )}

              {project.categories && project.categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {project.categories.map((cat) => (
                    <Badge key={cat.id} variant="secondary" className="rounded-md text-xs">
                      {cat.name}
                    </Badge>
                  ))}
                </div>
              )}

              {displayTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {displayTags.map((tag, i) => (
                    <Badge key={i} variant="outline" className="rounded-md text-xs">
                      <Tag className="w-3 h-3 mr-1" />
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Links */}
              <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
                <a href={project.url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" className="gap-1.5">
                    <ExternalLink className="w-3.5 h-3.5" />
                    Visit Project
                  </Button>
                </a>
                {project.demoUrl && (
                  <a href={project.demoUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Globe className="w-3.5 h-3.5" />
                      Demo
                    </Button>
                  </a>
                )}
                {project.docsUrl && (
                  <a href={project.docsUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      Docs
                    </Button>
                  </a>
                )}
                {project.repoUrl && (
                  <a href={project.repoUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <Github className="w-3.5 h-3.5" />
                      Source
                    </Button>
                  </a>
                )}
              </div>

              {/* Meta */}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {timeAgo(project.createdAt)}
                </span>
                {project.pricingModel && (
                  <Badge variant="secondary" className="rounded-md text-xs">
                    {project.pricingModel}
                    {project.pricingDetails ? ` - ${project.pricingDetails}` : ""}
                  </Badge>
                )}
                {!project.claimed && (
                  <Badge variant="outline" className="rounded-md text-xs">
                    Unclaimed
                  </Badge>
                )}
              </div>
            </div>
          </Card>

          {/* Comments Section */}
          <Card className="glass-card p-6">
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <h2 className="font-bold text-sm">
                  Comments {project.commentsCount > 0 && `(${project.commentsCount})`}
                </h2>
              </div>

              {/* Comment input */}
              {isAuthenticated ? (
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add a comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="min-h-[60px] text-sm resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        handleSubmitComment();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleSubmitComment}
                    disabled={!commentText.trim() || createComment.isPending}
                    className="self-end"
                  >
                    {createComment.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  <button onClick={() => navigate("/login")} className="underline hover:text-foreground transition-colors">
                    Log in
                  </button>{" "}
                  to leave a comment.
                </p>
              )}

              {/* Comments list */}
              {commentsLoading ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
                  ))}
                </div>
              ) : commentsList && commentsList.length > 0 ? (
                <div className="space-y-3">
                  {commentsList.map((comment) => (
                    <div key={comment.id} className="flex gap-3 group">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {comment.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold">{comment.username}</span>
                          <span className="text-xs text-muted-foreground">{timeAgo(comment.createdAt)}</span>
                          {user && user.id === comment.userId && (
                            <button
                              onClick={() => handleDeleteComment(comment.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">{comment.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No comments yet. Be the first!</p>
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
