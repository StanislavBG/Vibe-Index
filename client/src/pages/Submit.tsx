import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Link2, ArrowRight, Check, Info, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { BackgroundEffect } from "@/components/BackgroundEffect";
import { useCategories, useSubmitProject } from "@/hooks/use-projects";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function Submit() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { data: categories } = useCategories();
  const submitMutation = useSubmitProject();
  const { toast } = useToast();

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const [showOptional, setShowOptional] = useState(false);

  const toggleCategory = (id: number) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) {
      toast({ title: "URL required", description: "Please paste your project link.", variant: "destructive" });
      return;
    }
    try {
      const project = await submitMutation.mutateAsync({
        url,
        name: name || undefined,
        shortDescription: description || undefined,
        categoryIds: selectedCategories.length > 0 ? selectedCategories : undefined,
      });
      toast({ title: "Project submitted!", description: "Your project is now live on Vibe Index." });
      navigate(`/project/${project.id}`);
    } catch (err: any) {
      const message = err.message || "Submission failed";
      if (message.includes("Anonymous submission limit")) {
        toast({
          title: "Limit reached",
          description: "You've used all 3 anonymous submissions. Create an account to submit more.",
          variant: "destructive",
        });
      } else if (message.includes("No listing credits")) {
        toast({
          title: "No credits remaining",
          description: "Purchase additional listing credits to submit more projects.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Error", description: message, variant: "destructive" });
      }
    }
  };

  const creditsRemaining = isAuthenticated
    ? (user?.freeListingsRemaining ?? 0) + (user?.paidListingCredits ?? 0)
    : null;

  return (
    <div className="min-h-screen w-full relative">
      <BackgroundEffect />
      <Navbar />

      <div className="pt-24 pb-16 px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-lg mx-auto space-y-8"
        >
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">
              Submit a Project
            </h1>
            <p className="text-sm text-muted-foreground">
              Just paste a link. We'll handle the rest.
            </p>
            {isAuthenticated && (
              <p className="text-xs text-muted-foreground">
                {creditsRemaining} listing {creditsRemaining === 1 ? "credit" : "credits"} remaining
              </p>
            )}
            {!isAuthenticated && (
              <p className="text-xs text-muted-foreground">
                Up to 3 projects without an account
              </p>
            )}
          </div>

          <Card className="glass-card p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Project URL</label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="url"
                    placeholder="https://your-project.com"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="pl-10 h-12 text-base"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowOptional(!showOptional)}
                className="text-muted-foreground text-xs"
              >
                {showOptional ? "Hide" : "Show"} optional details
              </Button>

              {showOptional && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Project Name</label>
                    <Input
                      placeholder="My Awesome Project"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Short Description</label>
                    <Textarea
                      placeholder="A brief description of what your project does..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="resize-none"
                      maxLength={300}
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground text-right">{description.length}/300</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Categories</label>
                    <div className="flex flex-wrap gap-1.5">
                      {categories?.map((cat) => (
                        <Badge
                          key={cat.id}
                          variant={selectedCategories.includes(cat.id) ? "default" : "outline"}
                          className="cursor-pointer px-2.5 py-1 text-xs rounded-md transition-colors"
                          onClick={() => toggleCategory(cat.id)}
                        >
                          {selectedCategories.includes(cat.id) && <Check className="w-3 h-3 mr-1" />}
                          {cat.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full h-12 group"
                disabled={submitMutation.isPending}
              >
                {submitMutation.isPending ? "Submitting..." : "Submit Project"}
                <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </form>
          </Card>

          <Card className="glass-card p-5">
            <div className="flex items-start gap-3">
              <Info className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="space-y-1.5">
                <h3 className="font-medium text-sm">Full control over your listing</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Add a <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">vibe-index.json</code> file
                  to your site root. We'll read it to generate your project page.
                </p>
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium flex items-center gap-1 mt-1">
                    <FileText className="w-3.5 h-3.5" />
                    View template
                  </summary>
                  <pre className="mt-2 p-3 bg-muted rounded-lg text-[11px] overflow-x-auto font-mono">
{`{
  "name": "My Project",
  "description": "A short description",
  "longDescription": "Detailed description...",
  "pricing": "free | one-time | subscription | mixed",
  "pricingDetails": "$9.99/mo",
  "demo": "https://demo.example.com",
  "docs": "https://docs.example.com",
  "repo": "https://github.com/user/repo",
  "tags": ["ai", "developer-tools", "saas"],
  "categories": ["ai-ml", "dev-tools"]
}`}
                  </pre>
                </details>
              </div>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
