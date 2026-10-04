# Component Mapping & Design System Architecture

## 1. Component Registry & Mapping Table

| UI Element | Source Component | Key Props / Variants | Used In Pages |
|---|---|---|---|
| **Button** | `src/components/ui/button.tsx` | `default`, `outline`, `ghost`, `destructive`, `sm`, `icon` | Global across all pages |
| **Badge** | `src/components/ui/badge.tsx` | `default`, `secondary`, `outline`, `destructive` | Catalog, Batches, Dashboard |
| **App Layout** | `src/components/layout/AppLayout.tsx` | Responsive Sidebar, Anti-collision Header, Mobile Nav | Root Layout for authenticated app |
| **Image Upload**| `src/features/inventory/components/ImageUploadInput.tsx` | `value`, `onChange`, local file + online URL | ItemFormModal, ItemDetailsPage |
| **Item Quick View**| `src/features/inventory/components/ItemQuickViewDrawer.tsx` | `item`, `isOpen`, `onClose`, `onUpdateStock` | ItemsCatalogPage |
| **Daily Sheet** | `src/features/daily-inventory/components/InventorySheet.tsx` | `session`, `isReadOnly`, `date` | DailyInventoryPage |
| **Daily Row** | `src/features/daily-inventory/components/InventoryRow.tsx` | `item`, `index`, `isReadOnly`, `date` | InventorySheet |
| **Command Palette**| `src/components/layout/CommandPalette.tsx` | Global search (`Ctrl+K`), route quick jumping | AppLayout |
| **Error Boundary**| `src/components/common/ErrorBoundary.tsx` | Catches uncaught render crashes with 1-click reload | App Root |

---

## 2. Directory Structure Conventions

```
src/
├── app/                  # Application root & code-split routing
├── components/           # Shared UI component primitives
│   ├── common/           # Error boundary, loaders
│   ├── layout/           # AppLayout, CommandPalette, Nav
│   └── ui/               # Button, Badge, Card, Dialog, Input, Table, Tabs
├── context/              # Global theme provider (Dark/Light)
├── features/             # Domain-driven feature packages
│   ├── admin/            # User management, audit logs, system settings
│   ├── auth/             # Login, guards (RequireAuth, RequireAdmin), context
│   ├── categories/       # Category management
│   ├── daily-inventory/  # Daily worksheet, autosave row, finalization
│   ├── inventory/        # Items catalog, stock batches, movements, quick drawer
│   └── reports/          # Snapshots library, exports (PDF/CSV/XLSX)
├── lib/                  # Supabase client singleton, tailwind merge utilities
└── types/                # Core TypeScript database & domain types
```
