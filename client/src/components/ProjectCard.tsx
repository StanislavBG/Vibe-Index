import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, ExternalLink, Clock } from "lucide-react";
import { type Project } from "@/hooks/use-projects";

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

function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export function ProjectCard({ project }: { project: Project }) {
  const [, navigate] = useLocation();

  return (
    <Card
      className="glass-card p-5 cursor-pointer hover:shadow-md transition-shadow duration-200 group flex flex-col h-full"
      onClick={() => navigate(`/project/${project.id}`)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate group-hover:text-foreground transition-colors">
            {project.name || getDomainFromUrl(project.url)}
          </h3>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <ExternalLink className="w-3 h-3" />
            <span className="truncate">{getDomainFromUrl(project.url)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground ml-2">
          <Heart className="w-4 h-4" />
          <span className="text-sm font-medium">{project.likesCount}</span>
        </div>
      </div>

      {project.shortDescription && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4 flex-1">
          {project.shortDescription}
        </p>
      )}

      {!project.shortDescription && (
        <p className="text-sm text-muted-foreground/50 italic mb-4 flex-1">
          No description provided
        </p>
      )}

      <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/50">
        <div className="flex items-center gap-2">
          {project.pricingModel && (
            <Badge variant="secondary" className="text-xs rounded-md">
              {project.pricingModel}
            </Badge>
          )}
          {!project.claimed && (
            <Badge variant="outline" className="text-xs rounded-md text-muted-foreground">
              Anonymous
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {timeAgo(project.createdAt)}
        </div>
      </div>
    </Card>
  );
}
