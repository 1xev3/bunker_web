import {
  ArrowLeftRight,
  Globe,
  Heart,
  HeartOff,
  Leaf,
  Mars,
  Shield,
  Shuffle,
  User,
  Users,
  Venus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const GENDER_ICONS: Record<string, LucideIcon> = {
  gender_1: Mars,
  gender_2: Venus,
};

const RACE_ICONS: Record<string, LucideIcon> = {
  race_1: User,
  race_2: Shield,
  race_3: Leaf,
  race_4: Globe,
};

const GENDER_AFFIX_ICONS: Record<string, LucideIcon> = {
  affix_1: Users,
  affix_2: Heart,
  affix_3: Shuffle,
  affix_4: HeartOff,
  affix_5: ArrowLeftRight,
};

export function getGenderIcons(value: unknown): { genderIcon: LucideIcon | null; affixIcon: LucideIcon | null } {
  if (!value || typeof value !== 'object') return { genderIcon: null, affixIcon: null };
  const genderId = 'genderId' in value ? String(value.genderId) : '';
  const affixId = 'affixId' in value ? String(value.affixId) : '';
  return {
    genderIcon: GENDER_ICONS[genderId] ?? null,
    affixIcon: GENDER_AFFIX_ICONS[affixId] ?? null,
  };
}

export function getRaceIcon(value: unknown): LucideIcon | null {
  if (!value || typeof value !== 'object' || !('id' in value)) return null;
  return RACE_ICONS[String(value.id)] ?? null;
}
