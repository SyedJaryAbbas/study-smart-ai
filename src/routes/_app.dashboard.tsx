import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, GraduationCap, FileText, Clock, AlertCircle } from "lucide-react";
import { formatDistanceToNow, isPast, differenceInDays } from "date-fns";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [profile, assignments, exams, notes] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle(),
        supabase.from("assignments").select("*").eq("completed", false).order("due_date", { ascending: true }).limit(5),
        supabase.from("exams").select("*").gte("exam_date", new Date().toISOString()).order("exam_date").limit(5),
        supabase.from("notes").select("*").order("created_at", { ascending: false }).limit(5),
      ]);
      return {
        profile: profile.data,
        assignments: assignments.data ?? [],
        exams: exams.data ?? [],
        notes: notes.data ?? [],
      };
    },
  });

  const firstName = data?.profile?.full_name?.split(" ")[0] ?? "there";
  const stats = [
    { label: "Pending tasks", value: data?.assignments.length ?? 0, icon: ClipboardList, to: "/assignments" },
    { label: "Upcoming exams", value: data?.exams.length ?? 0, icon: GraduationCap, to: "/exams" },
    { label: "Notes saved", value: data?.notes.length ?? 0, icon: FileText, to: "/notes" },
  ];

  return (
    <div>
      <PageHeader title={`Hi, ${firstName} 👋`} subtitle="Here's your day at a glance." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <Link key={s.label} to={s.to}>
            <Card className="p-5 hover:shadow-elegant hover:border-primary/30 transition-all cursor-pointer">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p className="text-3xl font-bold text-foreground mt-1">{s.value}</p>
                </div>
                <div className="h-10 w-10 rounded-xl bg-accent text-accent-foreground flex items-center justify-center">
                  <s.icon className="h-5 w-5" />
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" /> Upcoming assignments
            </h2>
            <Link to="/assignments" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {data?.assignments.length ? (
            <ul className="space-y-3">
              {data.assignments.map((a) => {
                const days = differenceInDays(new Date(a.due_date), new Date());
                const overdue = isPast(new Date(a.due_date));
                return (
                  <li key={a.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-secondary/50">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {overdue ? "Overdue" : `Due ${formatDistanceToNow(new Date(a.due_date), { addSuffix: true })}`}
                      </p>
                    </div>
                    <Badge variant={overdue ? "destructive" : days <= 2 ? "default" : "secondary"} className="shrink-0">
                      {a.priority}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon={ClipboardList} text="No pending assignments. Nice work!" />
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" /> Upcoming exams
            </h2>
            <Link to="/exams" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {data?.exams.length ? (
            <ul className="space-y-3">
              {data.exams.map((e) => {
                const days = differenceInDays(new Date(e.exam_date), new Date());
                return (
                  <li key={e.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-secondary/50">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{e.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 capitalize">{e.exam_type}</p>
                    </div>
                    <Badge variant={days <= 3 ? "destructive" : "secondary"}>
                      {days <= 0 ? "Today" : `${days}d`}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon={GraduationCap} text="No exams scheduled. Add one to start planning." />
          )}
        </Card>

        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Recent notes
            </h2>
            <Link to="/notes" className="text-xs text-primary hover:underline">View all</Link>
          </div>
          {data?.notes.length ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.notes.map((n) => (
                <div key={n.id} className="p-4 rounded-lg border border-border hover:border-primary/30 transition-colors">
                  <p className="font-medium text-sm text-foreground truncate">{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.description || "No description"}</p>
                </div>
              ))}
            </div>
          ) : (
            <Empty icon={FileText} text="No notes uploaded yet." />
          )}
        </Card>
      </div>
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
