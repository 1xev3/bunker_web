import { Mars, Venus, Bot, Biohazard, Globe, Users, Heart, Shuffle, HeartOff, ArrowLeftRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const GENDER_ICONS: Record<string, LucideIcon> = {
  'Мужчина':       Mars,
  'Женщина':       Venus,
  'Андроид':       Bot,
  'Мутант':        Biohazard,
  'Инопланетянин': Globe,
};

export const GENDER_AFFIX_ICONS: Record<string, LucideIcon> = {
  'Гетеросексуал': Users,
  'Гомосексуал':   Heart,
  'Бисексуал':     Shuffle,
  'Асексуал':      HeartOff,
  'Трансгендер':   ArrowLeftRight,
};

export function getGenderIcons(value: string): { genderIcon: LucideIcon | null; affixIcon: LucideIcon | null } {
  // format: "Мужчина Гетеросексуал (25 лет)"
  const [namePart] = value.split(' (');
  const [genderName, affixName] = namePart.split(' ');
  return {
    genderIcon: GENDER_ICONS[genderName] ?? null,
    affixIcon:  GENDER_AFFIX_ICONS[affixName] ?? null,
  };
}
