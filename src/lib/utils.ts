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
