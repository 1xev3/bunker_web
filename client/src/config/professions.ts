import {
  Stethoscope, Cpu, GraduationCap, Shield, Sprout, Terminal,
  ChefHat, Hammer, Microscope, Plane, Zap, Wrench,
  Brain, Dna, FlaskConical, Settings, Flame, Crosshair,
  Skull, Eye, ShoppingBag, Banknote, Scale, Building2,
  Search, Gavel, AlertOctagon, Wine, Heart, Smile, Star,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface ProfessionDef {
  name: string;
  icon: LucideIcon;
}

export const PROFESSIONS: ProfessionDef[] = [
  { name: 'Врач',           icon: Stethoscope  },
  { name: 'Инженер',        icon: Cpu          },
  { name: 'Учитель',        icon: GraduationCap },
  { name: 'Военный',        icon: Shield       },
  { name: 'Фермер',         icon: Sprout       },
  { name: 'Программист',    icon: Terminal     },
  { name: 'Повар',          icon: ChefHat      },
  { name: 'Строитель',      icon: Hammer       },
  { name: 'Ученый',         icon: Microscope   },
  { name: 'Пилот',          icon: Plane        },
  { name: 'Электрик',       icon: Zap          },
  { name: 'Сантехник',      icon: Wrench       },
  { name: 'Психолог',       icon: Brain        },
  { name: 'Биолог',         icon: Dna          },
  { name: 'Химик',          icon: FlaskConical },
  { name: 'Механик',        icon: Settings     },
  { name: 'Сварщик',        icon: Flame        },
  { name: 'Охотник',        icon: Crosshair    },
  { name: 'Киллер',         icon: Skull        },
  { name: 'Шпион',          icon: Eye          },
  { name: 'Торговец',       icon: ShoppingBag  },
  { name: 'Банкир',         icon: Banknote     },
  { name: 'Юрист',          icon: Scale        },
  { name: 'Архитектор',     icon: Building2    },
  { name: 'Следователь',    icon: Search       },
  { name: 'Судья',          icon: Gavel        },
  { name: 'Бандит',         icon: AlertOctagon },
  { name: 'Бармен',         icon: Wine         },
  { name: 'Секс-работник',  icon: Heart        },
  { name: 'Клоун',          icon: Smile        },
  { name: 'Трюкач',         icon: Star         },
];

const PROFESSION_ICON_MAP = new Map(PROFESSIONS.map(p => [p.name, p.icon]));

export function getProfessionIcon(professionValue: string): LucideIcon | null {
  // profession is stored as "Врач (Профессионал)" — extract base name
  const baseName = professionValue.split(' (')[0];
  return PROFESSION_ICON_MAP.get(baseName) ?? null;
}
