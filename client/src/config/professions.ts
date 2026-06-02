import {
  AlertOctagon, Banknote, Brain, Building2, ChefHat, Cpu, Crosshair,
  Dna, Eye, Flame, FlaskConical, Gavel, GraduationCap, Hammer, Heart,
  Microscope, Plane, Scale, Search, Settings, Shield, ShoppingBag, Skull,
  Smile, Sprout, Star, Stethoscope, Terminal, Wine, Wrench, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const PROFESSION_ICONS: Record<string, LucideIcon> = {
  doctor_heal: Stethoscope,
  engineer_sabotage: Cpu,
  teacher_retrain: GraduationCap,
  soldier_cache: Shield,
  farmer_food: Sprout,
  programmer_scan: Terminal,
  cook_food: ChefHat,
  builder_supplies: Hammer,
  scientist_experiment: Microscope,
  pilot_reveal: Plane,
  electrician_shock: Zap,
  plumber_flood: Wrench,
  psychologist_therapy: Brain,
  biologist_mutation: Dna,
  chemist_mix: FlaskConical,
  mechanic_steal: Settings,
  welder_weld: Flame,
  hunter_food: Crosshair,
  killer_strip_inventory: Skull,
  spy_scan: Eye,
  trader_swap_inventory: ShoppingBag,
  banker_bribe: Banknote,
  lawyer_rewrite: Scale,
  architect_inspect: Building2,
  detective_reveal: Search,
  judge_verdict: Gavel,
  bandit_rob: AlertOctagon,
  bartender_mix: Wine,
  seduce_shift: Heart,
  clown_break: Smile,
  trickster_swap: Star,
};

export function getProfessionIcon(professionValue: unknown): LucideIcon | null {
  if (!professionValue || typeof professionValue !== 'object' || !('id' in professionValue)) return null;
  return PROFESSION_ICONS[String(professionValue.id)] ?? null;
}
