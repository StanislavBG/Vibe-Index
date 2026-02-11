import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Heart, ExternalLink, Clock, Tag } from "lucide-react";
import { type Project } from "@/hooks/use-projects";
import { timeAgo } from "@/lib/time";

function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function getDisplayTags(project: Project): string[] {
  // Use legacy comma-separated tags field (canonical tags are resolved server-side on publish)
  if (project.tags) {
    return project.tags.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

export function ProjectCard({ project }: { project: Project }) {
  const [, navigate] = useLocation();
  const tags = getDisplayTags(project);

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
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-1">
          {project.shortDescription}
        </p>
      )}

      {!project.shortDescription && (
        <p className="text-sm text-muted-foreground/50 italic mb-3 flex-1">
          No description provided
        </p>
      )}

      {/* Tags row */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {tags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px] rounded-md gap-0.5 px-1.5 py-0 h-5 text-muted-foreground">
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </Badge>
          ))}
          {tags.length > 4 && (
            <span className="text-[10px] text-muted-foreground self-center">+{tags.length - 4}</span>
          )}
        </div>
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
