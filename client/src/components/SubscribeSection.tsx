import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Bell, Check } from "lucide-react";
import { useCategories, useSubscribe } from "@/hooks/use-projects";
import { useToast } from "@/hooks/use-toast";

export function SubscribeSection() {
  const [email, setEmail] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<number[]>([]);
  const { data: categories } = useCategories();
  const subscribeMutation = useSubscribe();
  const { toast } = useToast();

  const toggleCategory = (id: number) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || selectedCategories.length === 0) {
      toast({
        title: "Missing fields",
        description: "Please enter your email and select at least one category.",
        variant: "destructive",
      });
      return;
    }
    try {
      await subscribeMutation.mutateAsync({ email, categoryIds: selectedCategories });
      toast({
        title: "Subscribed!",
        description: "You'll receive email notifications for new projects in your selected categories.",
      });
      setEmail("");
      setSelectedCategories([]);
    } catch (err: any) {
      toast({
        title: "Subscription failed",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    }
  };

  return (
    <section className="px-4 py-16">
      <div className="max-w-3xl mx-auto">
        <Card className="glass-card p-8 md:p-12 text-center">
          <Bell className="w-10 h-10 mx-auto text-primary mb-4" />
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            Stay in the Loop
          </h2>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            Get notified when new vibe-coded projects are published in
            categories you care about.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-wrap gap-2 justify-center">
              {categories?.map((cat) => (
                <Badge
                  key={cat.id}
                  variant={selectedCategories.includes(cat.id) ? "default" : "outline"}
                  className="cursor-pointer px-3 py-1.5 text-xs rounded-full transition-all hover:scale-105"
                  onClick={() => toggleCategory(cat.id)}
                >
                  {selectedCategories.includes(cat.id) && (
                    <Check className="w-3 h-3 mr-1" />
                  )}
                  {cat.name}
                </Badge>
              ))}
            </div>

            <div className="flex gap-2 max-w-md mx-auto">
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-xl"
                required
              />
              <Button
                type="submit"
                className="h-11 rounded-xl px-6"
                disabled={subscribeMutation.isPending}
              >
                {subscribeMutation.isPending ? "..." : "Subscribe"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </section>
  );
}
