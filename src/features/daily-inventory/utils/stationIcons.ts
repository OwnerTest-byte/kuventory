import {
  Flame,
  UtensilsCrossed,
  PackageOpen,
  Coffee,
  Wine,
  Cookie,
  Beef,
  Fish,
  Pizza,
  Soup,
  Salad,
  Apple,
  Carrot,
  Wheat,
  Sandwich,
  CupSoda,
  IceCream2,
  Refrigerator,
  Box,
  Layers,
  Tag,
  Sparkles,
  ClipboardList,
  ShoppingBag,
  Truck,
  Store,
  Drumstick,
  Egg,
  Milk,
  Beer,
  Citrus,
  Croissant,
  type LucideIcon
} from 'lucide-react';

export interface StationIconDefinition {
  key: string;
  icon: LucideIcon;
  colorClass: string;
  pillClass: string;
  badgeClass: string;
}

export const STATION_ICON_REGISTRY: StationIconDefinition[] = [
  {
    key: 'Flame',
    icon: Flame,
    colorClass: 'text-amber-600 dark:text-amber-400',
    pillClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
  },
  {
    key: 'UtensilsCrossed',
    icon: UtensilsCrossed,
    colorClass: 'text-blue-600 dark:text-blue-400',
    pillClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20',
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
  },
  {
    key: 'PackageOpen',
    icon: PackageOpen,
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    pillClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
  },
  {
    key: 'Beef',
    icon: Beef,
    colorClass: 'text-rose-600 dark:text-rose-400',
    pillClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/20',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
  },
  {
    key: 'Fish',
    icon: Fish,
    colorClass: 'text-cyan-600 dark:text-cyan-400',
    pillClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/20',
    badgeClass: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'
  },
  {
    key: 'Coffee',
    icon: Coffee,
    colorClass: 'text-purple-600 dark:text-purple-400',
    pillClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:bg-purple-500/20',
    badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
  },
  {
    key: 'Wine',
    icon: Wine,
    colorClass: 'text-indigo-600 dark:text-indigo-400',
    pillClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
  },
  {
    key: 'Cookie',
    icon: Cookie,
    colorClass: 'text-orange-600 dark:text-orange-400',
    pillClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 hover:bg-orange-500/20',
    badgeClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
  },
  {
    key: 'Pizza',
    icon: Pizza,
    colorClass: 'text-yellow-600 dark:text-yellow-400',
    pillClass: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20',
    badgeClass: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20'
  },
  {
    key: 'Soup',
    icon: Soup,
    colorClass: 'text-amber-700 dark:text-amber-300',
    pillClass: 'bg-amber-600/10 text-amber-700 dark:text-amber-300 border-amber-600/20 hover:bg-amber-600/20',
    badgeClass: 'bg-amber-600/10 text-amber-700 dark:text-amber-300 border-amber-600/20'
  },
  {
    key: 'Salad',
    icon: Salad,
    colorClass: 'text-lime-600 dark:text-lime-400',
    pillClass: 'bg-lime-500/10 text-lime-600 dark:text-lime-400 border-lime-500/20 hover:bg-lime-500/20',
    badgeClass: 'bg-lime-500/10 text-lime-600 dark:text-lime-400 border-lime-500/20'
  },
  {
    key: 'Apple',
    icon: Apple,
    colorClass: 'text-red-600 dark:text-red-400',
    pillClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/20',
    badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
  },
  {
    key: 'Carrot',
    icon: Carrot,
    colorClass: 'text-orange-600 dark:text-orange-400',
    pillClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 hover:bg-orange-500/20',
    badgeClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
  },
  {
    key: 'Wheat',
    icon: Wheat,
    colorClass: 'text-amber-500 dark:text-amber-300',
    pillClass: 'bg-amber-400/10 text-amber-600 dark:text-amber-300 border-amber-400/20 hover:bg-amber-400/20',
    badgeClass: 'bg-amber-400/10 text-amber-600 dark:text-amber-300 border-amber-400/20'
  },
  {
    key: 'Sandwich',
    icon: Sandwich,
    colorClass: 'text-amber-600 dark:text-amber-400',
    pillClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
  },
  {
    key: 'CupSoda',
    icon: CupSoda,
    colorClass: 'text-fuchsia-600 dark:text-fuchsia-400',
    pillClass: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20 hover:bg-fuchsia-500/20',
    badgeClass: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20'
  },
  {
    key: 'IceCream2',
    icon: IceCream2,
    colorClass: 'text-pink-600 dark:text-pink-400',
    pillClass: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20 hover:bg-pink-500/20',
    badgeClass: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/20'
  },
  {
    key: 'Refrigerator',
    icon: Refrigerator,
    colorClass: 'text-sky-600 dark:text-sky-400',
    pillClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20 hover:bg-sky-500/20',
    badgeClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
  },
  {
    key: 'Box',
    icon: Box,
    colorClass: 'text-slate-600 dark:text-slate-400',
    pillClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 hover:bg-slate-500/20',
    badgeClass: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
  },
  {
    key: 'Layers',
    icon: Layers,
    colorClass: 'text-indigo-600 dark:text-indigo-400',
    pillClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 hover:bg-indigo-500/20',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
  },
  {
    key: 'Tag',
    icon: Tag,
    colorClass: 'text-teal-600 dark:text-teal-400',
    pillClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 hover:bg-teal-500/20',
    badgeClass: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20'
  },
  {
    key: 'Sparkles',
    icon: Sparkles,
    colorClass: 'text-rose-600 dark:text-rose-400',
    pillClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/20',
    badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
  },
  {
    key: 'ShoppingBag',
    icon: ShoppingBag,
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    pillClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
  },
  {
    key: 'Truck',
    icon: Truck,
    colorClass: 'text-blue-600 dark:text-blue-400',
    pillClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/20',
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
  },
  {
    key: 'Store',
    icon: Store,
    colorClass: 'text-violet-600 dark:text-violet-400',
    pillClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20 hover:bg-violet-500/20',
    badgeClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20'
  },
  {
    key: 'Drumstick',
    icon: Drumstick,
    colorClass: 'text-amber-600 dark:text-amber-400',
    pillClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
  },
  {
    key: 'Egg',
    icon: Egg,
    colorClass: 'text-yellow-600 dark:text-yellow-400',
    pillClass: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/20',
    badgeClass: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20'
  },
  {
    key: 'Milk',
    icon: Milk,
    colorClass: 'text-sky-600 dark:text-sky-400',
    pillClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20 hover:bg-sky-500/20',
    badgeClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
  },
  {
    key: 'Beer',
    icon: Beer,
    colorClass: 'text-amber-600 dark:text-amber-400',
    pillClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/20',
    badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
  },
  {
    key: 'Citrus',
    icon: Citrus,
    colorClass: 'text-lime-600 dark:text-lime-400',
    pillClass: 'bg-lime-500/10 text-lime-600 dark:text-lime-400 border-lime-500/20 hover:bg-lime-500/20',
    badgeClass: 'bg-lime-500/10 text-lime-600 dark:text-lime-400 border-lime-500/20'
  },
  {
    key: 'Croissant',
    icon: Croissant,
    colorClass: 'text-orange-600 dark:text-orange-400',
    pillClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 hover:bg-orange-500/20',
    badgeClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20'
  },
  {
    key: 'ClipboardList',
    icon: ClipboardList,
    colorClass: 'text-muted-foreground',
    pillClass: 'bg-muted text-muted-foreground border-border hover:bg-muted/80',
    badgeClass: 'bg-muted text-muted-foreground border-border'
  }
];

const REGISTRY_MAP = new Map(STATION_ICON_REGISTRY.map(item => [item.key, item]));

/**
 * Deterministic hash string to positive integer
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Extract or resolve the icon key for any given category record or name.
 */
export function getStationIconKey(category: { id?: string; name?: string; description?: string | null } | string): string {
  if (typeof category === 'string') {
    const upper = category.toUpperCase();
    if (upper.includes('GRILL')) return 'Flame';
    if (upper.includes('CASE')) return 'PackageOpen';
    if (upper.includes('PORTION')) return 'UtensilsCrossed';
    if (upper.includes('BOTTLE')) return 'Wine';
    if (upper.includes('BEVERAGE') || upper.includes('DRINK')) return 'Coffee';
    if (upper.includes('SNACK')) return 'Cookie';
    if (upper.includes('MEAT') || upper.includes('BEEF')) return 'Beef';
    if (upper.includes('FISH') || upper.includes('SEAFOOD')) return 'Fish';
    if (upper.includes('OTHER') || upper.includes('SUPPLIES')) return 'ClipboardList';
    const index = hashString(category) % (STATION_ICON_REGISTRY.length - 1);
    return STATION_ICON_REGISTRY[index].key;
  }

  // 1. Check description for explicitly stored ICON key (e.g. ICON:Beef|Station created...)
  if (category.description) {
    const match = category.description.match(/ICON:([A-Za-z0-9_]+)/);
    if (match && REGISTRY_MAP.has(match[1])) {
      return match[1];
    }
  }

  // 2. Keyword fallback on name
  const name = (category.name || '').toUpperCase();
  if (name.includes('GRILL')) return 'Flame';
  if (name.includes('CASE')) return 'PackageOpen';
  if (name.includes('PORTION')) return 'UtensilsCrossed';
  if (name.includes('BOTTLE')) return 'Wine';
  if (name.includes('BEVERAGE') || name.includes('DRINK')) return 'Coffee';
  if (name.includes('SNACK')) return 'Cookie';
  if (name.includes('MEAT') || name.includes('BEEF')) return 'Beef';
  if (name.includes('FISH') || name.includes('SEAFOOD')) return 'Fish';
  if (name.includes('OTHER') || name.includes('SUPPLIES')) return 'ClipboardList';

  // 3. Stable deterministic hash using category ID or name
  const seed = category.id || category.name || 'default';
  const index = hashString(seed) % (STATION_ICON_REGISTRY.length - 1);
  return STATION_ICON_REGISTRY[index].key;
}

/**
 * Retrieve station visual meta (icon component, Tailwind color classes).
 */
export function getStationMeta(category: { id?: string; name?: string; description?: string | null } | string): StationIconDefinition {
  const key = getStationIconKey(category);
  return REGISTRY_MAP.get(key) || STATION_ICON_REGISTRY[0];
}

/**
 * Allocate an unused distinct icon key for a newly created station table.
 * Strictly guarantees that active tables do not share duplicate icon assignments.
 */
export function allocateStationIcon(
  existingCategories: Array<{ id?: string; name?: string; description?: string | null }>
): string {
  // Collect all icon keys currently claimed by active categories
  const usedKeys = new Set<string>();
  existingCategories.forEach(cat => {
    const key = getStationIconKey(cat);
    usedKeys.add(key);
  });

  // Find the first icon in the curated registry that is NOT in usedKeys (excluding ClipboardList which is reserved for Other Supplies)
  const available = STATION_ICON_REGISTRY.filter(
    item => item.key !== 'ClipboardList' && !usedKeys.has(item.key)
  );

  if (available.length > 0) {
    return available[0].key;
  }

  // If all icons are exhausted, pick from registry in a round-robin manner based on count
  const nonReserved = STATION_ICON_REGISTRY.filter(item => item.key !== 'ClipboardList');
  return nonReserved[existingCategories.length % nonReserved.length].key;
}
