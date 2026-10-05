import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { badgeVariants } from "@/components/ui/badge"
import type { VariantProps } from "class-variance-authority"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function stockStatusVariant(quantity: number, minQuantity: number): VariantProps<typeof badgeVariants>["variant"] {
  if (quantity <= 0) return "destructive";
  if (quantity <= minQuantity) return "outline";
  return "default";
}

export function formatUserDisplayName(
  profile?: { first_name?: string | null; last_name?: string | null; display_name?: string | null } | null,
  fallbackEmail?: string | null
): string {
  if (profile?.display_name && profile.display_name.trim()) {
    return profile.display_name.trim();
  }
  if (!profile?.first_name || !profile.first_name.trim()) {
    if (fallbackEmail) return fallbackEmail.split('@')[0];
    return 'User';
  }
  const first = profile.first_name.trim();
  const last = (profile.last_name || '').trim();
  if (!last) return first;
  
  // Prevent duplication like "Master Admin Admin"
  const firstLower = first.toLowerCase();
  const lastLower = last.toLowerCase();
  if (firstLower === lastLower || firstLower.endsWith(` ${lastLower}`) || firstLower.includes(lastLower)) {
    return first;
  }
  return `${first} ${last}`.trim();
}

export function formatRoleLabel(role?: string | null): string {
  if (!role) return 'Staff';
  switch (role.toUpperCase()) {
    case 'MASTER_ADMIN':
      return 'Master Admin';
    case 'ADMIN':
      return 'Admin';
    default:
      return 'Staff';
  }
}

export function getUserInitials(
  nameOrProfile?: { first_name?: string | null; last_name?: string | null; display_name?: string | null } | string | null
): string {
  if (!nameOrProfile) return 'U';
  if (typeof nameOrProfile === 'string') {
    const parts = nameOrProfile.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return parts[0][0]?.toUpperCase() || 'U';
  }
  const name = formatUserDisplayName(nameOrProfile);
  const parts = name.split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return parts[0][0]?.toUpperCase() || 'U';
}

