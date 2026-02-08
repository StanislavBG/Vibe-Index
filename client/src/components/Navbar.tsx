import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, User, Menu, X, Plus } from "lucide-react";

export function Navbar() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-base font-bold tracking-tight">
            Vibe Index
          </span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-4">
          <Link href="/" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Discover
          </Link>
          <Link href="/submit" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Submit
          </Link>

          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" className="gap-2">
                  <User className="w-4 h-4" />
                  {user?.username}
                </Button>
              </Link>
              <div className="text-xs text-muted-foreground">
                {(user?.freeListingsRemaining ?? 0) + (user?.paidListingCredits ?? 0)} credits | {user?.likesRemaining ?? 0} likes
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout.mutate()}
                className="gap-2"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/login")}
              >
                Log in
              </Button>
              <Button
                size="sm"
                onClick={() => navigate("/register")}
                className="rounded-lg"
              >
                Sign up
              </Button>
            </div>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl p-4 space-y-3">
          <Link href="/" onClick={() => setMenuOpen(false)} className="block py-2 text-sm font-medium">
            Discover
          </Link>
          <Link href="/submit" onClick={() => setMenuOpen(false)} className="block py-2 text-sm font-medium">
            Submit Project
          </Link>
          {isAuthenticated ? (
            <>
              <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block py-2 text-sm font-medium">
                Dashboard
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { logout.mutate(); setMenuOpen(false); }}
                className="w-full justify-start gap-2"
              >
                <LogOut className="w-4 h-4" />
                Log out
              </Button>
            </>
          ) : (
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { navigate("/login"); setMenuOpen(false); }}
                className="flex-1"
              >
                Log in
              </Button>
              <Button
                size="sm"
                onClick={() => { navigate("/register"); setMenuOpen(false); }}
                className="flex-1"
              >
                Sign up
              </Button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
