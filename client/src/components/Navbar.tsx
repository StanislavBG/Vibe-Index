import { useState, useRef, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, type NotificationData } from "@/hooks/use-projects";
import { LogOut, Menu, X, Bell, CheckCheck, ExternalLink } from "lucide-react";
import { timeAgo } from "@/lib/time";

function NotificationBell() {
  const [, navigate] = useLocation();
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = data?.unreadCount ?? 0;
  const notifs = data?.notifications ?? [];

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleNotifClick = (notif: NotificationData) => {
    if (!notif.read) {
      markRead.mutate(notif.id);
    }
    if (notif.linkUrl) {
      navigate(notif.linkUrl);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="relative"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-foreground text-background rounded-full text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-background border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-xs font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              >
                <CheckCheck className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifs.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No notifications yet
              </div>
            ) : (
              notifs.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleNotifClick(notif)}
                  className={`w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-muted/50 transition-colors ${
                    !notif.read ? "bg-muted/30" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!notif.read && (
                      <div className="w-1.5 h-1.5 bg-foreground rounded-full mt-1.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{notif.title}</div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.message}</p>
                      <span className="text-[10px] text-muted-foreground/60 mt-1 block">{timeAgo(notif.createdAt)}</span>
                    </div>
                    {notif.linkUrl && (
                      <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Navbar({ children }: { children?: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLink = (href: string, label: string) => {
    const isActive = location === href || (href === "/" && location === "/");
    return (
      <Link
        href={href}
        className={`text-sm font-medium transition-colors ${
          isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
      <div className={`mx-auto px-4 lg:px-6 h-16 flex items-center gap-4 ${children ? '' : 'max-w-6xl justify-between'}`}>
        {children ? (
          <div className="flex-1 min-w-0">{children}</div>
        ) : (
          <Link href="/" className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight">
              Vibe Index
            </span>
          </Link>
        )}

        {/* Desktop Nav — three key flows */}
        <div className="hidden md:flex items-center gap-6 flex-shrink-0">
          <div className="flex items-center gap-5">
            {navLink("/", "Discover")}
            {navLink("/submit", "Submit")}
            {navLink("/subscribe", "Stay in the Loop")}
          </div>

          <div className="w-px h-5 bg-border" />

          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <Link href="/dashboard">
                <Button variant="ghost" size="sm" data-testid="link-dashboard">
                  Dashboard
                </Button>
              </Link>
              <div className="text-xs text-muted-foreground">
                {(user?.freeListingsRemaining ?? 0) + (user?.paidListingCredits ?? 0)} credits
              </div>
              <NotificationBell />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout()}
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
                data-testid="button-login"
              >
                Log in
              </Button>
              <Button
                size="sm"
                onClick={() => navigate("/register")}
                className="rounded-lg"
                data-testid="button-signup"
              >
                Sign up
              </Button>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="md:hidden"
          onClick={() => setMenuOpen(!menuOpen)}
          data-testid="button-mobile-menu"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl p-4 space-y-3">
          <Link href="/" onClick={() => setMenuOpen(false)} className="block py-2 text-sm font-medium">
            Discover
          </Link>
          <Link href="/submit" onClick={() => setMenuOpen(false)} className="block py-2 text-sm font-medium">
            Submit
          </Link>
          <Link href="/subscribe" onClick={() => setMenuOpen(false)} className="block py-2 text-sm font-medium">
            Stay in the Loop
          </Link>
          {isAuthenticated ? (
            <>
              <div className="border-t border-border/50 pt-3">
                <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="block py-2 text-sm font-medium">
                  Dashboard
                </Link>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { logout(); setMenuOpen(false); }}
                className="w-full justify-start gap-2"
              >
                <LogOut className="w-4 h-4" />
                Log out
              </Button>
            </>
          ) : (
            <div className="flex gap-2 pt-2 border-t border-border/50">
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
