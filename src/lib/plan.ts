// Subscription plans, limits, and helpers.
export type Plan = "free" | "premium_monthly" | "semester_pass";

export type PracticeKind = "mcq" | "short" | "long" | "fill_blank";

export interface PlanInfo {
  id: Plan;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  highlight?: boolean;
  bullets: string[];
  notIncluded?: string[];
  durationDays?: number; // semester pass length
}

export const PLANS: Record<Plan, PlanInfo> = {
  free: {
    id: "free",
    name: "Free",
    price: "PKR 0",
    cadence: "forever",
    tagline: "Get started — perfect for trying StudyOwl.",
    bullets: [
      "Up to 5 note uploads / month",
      "Up to 2 courses",
      "Basic assignment tracker & reminders",
      "20 MCQs / month",
      "10 short questions / month",
    ],
    notIncluded: [
      "Long answers & fill-in-the-blanks",
      "AI written-answer evaluation",
      "Full exam scheduling",
      "Progress analytics",
    ],
  },
  premium_monthly: {
    id: "premium_monthly",
    name: "Premium",
    price: "PKR 499",
    cadence: "per month",
    tagline: "Everything you need during the semester.",
    highlight: true,
    bullets: [
      "Unlimited note uploads",
      "Unlimited courses & assignments",
      "Full exam scheduler & study planner",
      "Unlimited MCQs, short, long & fill-in-the-blanks",
      "AI written-answer evaluation",
      "Progress analytics",
      "Priority support",
    ],
  },
  semester_pass: {
    id: "semester_pass",
    name: "Semester Pass",
    price: "PKR 1,999",
    cadence: "for one semester",
    tagline: "One payment, full access for the whole term.",
    bullets: [
      "Everything in Premium",
      "Valid for ~6 months / one semester",
      "No recurring charges",
      "Great for exam season",
    ],
    durationDays: 180,
  },
};

export interface Limits {
  notesPerMonth: number; // -1 = unlimited
  courses: number;
  practicePerMonth: Record<PracticeKind, number>;
  writtenEvaluation: boolean;
  fullExamPlanner: boolean;
  analytics: boolean;
}

const UNLIMITED: Limits = {
  notesPerMonth: -1,
  courses: -1,
  practicePerMonth: { mcq: -1, short: -1, long: -1, fill_blank: -1 },
  writtenEvaluation: true,
  fullExamPlanner: true,
  analytics: true,
};

export const LIMITS: Record<Plan, Limits> = {
  free: {
    notesPerMonth: 5,
    courses: 2,
    practicePerMonth: { mcq: 20, short: 10, long: 0, fill_blank: 0 },
    writtenEvaluation: false,
    fullExamPlanner: false,
    analytics: false,
  },
  premium_monthly: UNLIMITED,
  semester_pass: UNLIMITED,
};

export const isUnlimited = (n: number) => n < 0;

export function remaining(limit: number, used: number) {
  if (isUnlimited(limit)) return Infinity;
  return Math.max(0, limit - used);
}

export function planLabel(p: Plan): string {
  return PLANS[p].name;
}
