import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  GraduationCap,
  Sparkles,
  Settings,
  LogOut,
} from "lucide-react";
import { Logo } from "./Logo";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const items = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/notes", label: "Notes", icon: FileText },
  { to: "/assignments", label: "Assignments", icon: ClipboardList },
  { to: "/exams", label: "Exams", icon: GraduationCap },
  { to: "/practice", label: "Practice", icon: Sparkles },
] as const;

export function AppSidebar() {
  const loc = useLocation();
  const nav = useNavigate();
  const { signOut, user } = useAuth();

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-sidebar-border">
        <Link to="/dashboard">
          <Logo size={32} withWordmark />
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map(({ to, label, icon: Icon }) => {
          const active = loc.pathname === to || loc.pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-soft"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-sidebar-border space-y-1">
        <Link
          to="/profile"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <Settings className="h-4 w-4" />
          Profile
        </Link>
        <button
          onClick={async () => { await signOut(); nav({ to: "/" }); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
        {user && (
          <div className="px-3 pt-3 text-xs text-muted-foreground truncate">
            {user.email}
          </div>
        )}
      </div>
    </aside>
  );
}
