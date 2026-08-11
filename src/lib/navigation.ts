import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Album,
  BookMarked,
  Boxes,
  CheckSquare,
  Dna,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  Layers,
  Mic2,
  Scale,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Users,
  Waves,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * The seventeen studio destinations, grouped by what they are for rather than
 * alphabetically — the grouping is itself an argument about how the work runs:
 * knowledge first, then the decision layer, then production, then governance.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        description: "What needs attention today",
      },
    ],
  },
  {
    label: "Knowledge",
    items: [
      {
        href: "/states",
        label: "States",
        icon: Gauge,
        description: "Self-reported dimensions and desired directions",
      },
      {
        href: "/mechanisms",
        label: "Mechanisms",
        icon: Boxes,
        description: "Method-independent mechanisms",
      },
      {
        href: "/interventions",
        label: "Interventions",
        icon: Layers,
        description: "Reusable intervention blocks",
      },
      {
        href: "/evidence",
        label: "Evidence",
        icon: BookMarked,
        description: "Sources, quality and verification",
      },
      {
        href: "/professionals",
        label: "Professionals",
        icon: Users,
        description: "Skills and review permissions",
      },
    ],
  },
  {
    label: "Decision",
    items: [
      {
        href: "/experiences",
        label: "Experiences",
        icon: Album,
        description: "Sessions in progress",
      },
      {
        href: "/composer",
        label: "Session Composer",
        icon: Sparkles,
        description: "State Engine, plan, script and timeline",
      },
      {
        href: "/dna",
        label: "Osora DNA",
        icon: Dna,
        description: "What stays stable across personalisation",
      },
    ],
  },
  {
    label: "Production",
    items: [
      { href: "/voices", label: "Voices", icon: Mic2, description: "Voice library and previews" },
      { href: "/sounds", label: "Sounds", icon: Waves, description: "Sound library and licences" },
      {
        href: "/audio-lab",
        label: "Audio Lab",
        icon: SlidersHorizontal,
        description: "Multitrack arrangement and measurement",
      },
    ],
  },
  {
    label: "Learning",
    items: [
      {
        href: "/experiments",
        label: "Experiments",
        icon: FlaskConical,
        description: "Controlled A/B tests",
      },
      {
        href: "/outcomes",
        label: "Outcomes",
        icon: Activity,
        description: "Pre/post state change and attribution",
      },
    ],
  },
  {
    label: "Governance",
    items: [
      {
        href: "/reviews",
        label: "Reviews",
        icon: CheckSquare,
        description: "Skill-matched review queue",
      },
      { href: "/rules", label: "Rules", icon: Scale, description: "Validation rules and severity" },
      { href: "/settings", label: "Settings", icon: Settings, description: "Providers and roles" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
