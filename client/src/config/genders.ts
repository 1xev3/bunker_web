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

export const GENDER_ICONS: Record<string, LucideIcon> = {
  'Мужчина': Mars,
  'Женщина': Venus,
};

export const RACE_ICONS: Record<string, LucideIcon> = {
  'Человек': User,
  'Орк': Shield,
  'Эльф': Leaf,
  'Инопланетянин': Globe,
};

export const GENDER_AFFIX_ICONS: Record<string, LucideIcon> = {
  'Гетеросексуал': Users,
  'Гомосексуал': Heart,
  'Бисексуал': Shuffle,
  'Асексуал': HeartOff,
  'Трансгендер': ArrowLeftRight,
};

export function getGenderIcons(value: string): { genderIcon: LucideIcon | null; affixIcon: LucideIcon | null } {
  // format: "Мужчина Гетеросексуал (25 лет)"
  const [namePart] = value.split(' (');
  const [genderName, affixName] = namePart.split(' ');
  return {
    genderIcon: GENDER_ICONS[genderName] ?? null,
    affixIcon: GENDER_AFFIX_ICONS[affixName] ?? null,
  };
}

export function getRaceIcon(value: string): LucideIcon | null {
  return RACE_ICONS[value] ?? null;
}
