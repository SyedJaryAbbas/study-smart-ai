import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ClipboardList, GraduationCap, FileText, ArrowRight, CheckCircle2, BookOpen } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "StudyOwl — Know what to study, when to study" },
      { name: "description", content: "AI-powered academic management for university students. Track assignments, exams, and turn your notes into interactive practice sessions." },
    ],
  }),
});

const features = [
  { icon: FileText, title: "Smart Notes", desc: "Upload PDFs, slides, and notes — organized by course and instantly searchable." },
  { icon: ClipboardList, title: "Assignment Tracker", desc: "Due-date countdowns and AI suggestions for when to start each task." },
  { icon: GraduationCap, title: "Exam Planner", desc: "Turn syllabus chapters into a daily revision schedule that fits your timeline." },
  { icon: Sparkles, title: "AI Practice", desc: "Generate MCQs, short and long questions from your own notes — and get instant feedback on every answer." },
  { icon: BookOpen, title: "Study Planner", desc: "Daily revision targets that adapt to your timeline so nothing slips before exam day." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/"><Logo size={32} withWordmark /></Link>
          <nav className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/auth">
              <Button size="sm" className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-soft">
                Get started
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-hero">
        <div className="max-w-7xl mx-auto px-6 py-24 md:py-32 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-medium mb-6">
            <Sparkles className="h-3.5 w-3.5" /> Built for university students
          </div>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-foreground max-w-4xl mx-auto leading-[1.05]">
            Know what to study,{" "}
            <span className="text-gradient">when to study.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
            StudyOwl turns your lecture notes, deadlines, and syllabus into a clear daily plan — so you stop cramming and start staying ahead.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-elegant h-12 px-8 text-base">
                Start free <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/auth">
              <Button size="lg" variant="outline" className="h-12 px-8 text-base">
                I already have an account
              </Button>
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground">
            {["No credit card", "Free for students", "Works with any university"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
            Everything in one calm workspace
          </h2>
          <p className="mt-3 text-muted-foreground">
            No tab juggling. No sticky notes. Just one place built for the way students actually work.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="group p-6 rounded-2xl border border-border bg-card hover:shadow-elegant hover:border-primary/30 transition-all"
            >
              <div className="h-11 w-11 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center mb-4 shadow-soft">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg text-foreground">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="rounded-3xl bg-gradient-primary p-10 md:p-16 text-center shadow-elegant">
          <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground tracking-tight">
            Your smartest semester starts today.
          </h2>
          <p className="mt-3 text-primary-foreground/85 max-w-xl mx-auto">
            Join students who finally feel in control of their academic life.
          </p>
          <Link to="/auth" className="inline-block mt-7">
            <Button size="lg" variant="secondary" className="h-12 px-8 text-base font-semibold">
              Create your free account <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <Logo size={24} withWordmark />
          <p>© {new Date().getFullYear()} StudyOwl. Built with ♥ for students.</p>
        </div>
      </footer>
    </div>
  );
}
