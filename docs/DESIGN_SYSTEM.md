# Design System

**Kuventory v2.0.0**

Kuventory utilizes **shadcn/ui** combined with **Tailwind CSS** to create a cohesive design system. The components are not installed as NPM packages, but rather copied into the `components/ui` directory, allowing for full customization.

## Base Configuration
The design tokens are defined in `index.css` via CSS variables and mapped in `tailwind.config.ts`.

## Components

### Cards (`Card`, `CardHeader`, `CardTitle`, `CardContent`)
- Used for grouping related metrics or forms.
- Inherit a subtle border and background color (`bg-card`).
- Shadows are kept minimal (`shadow-sm`) to keep the UI flat and modern.

### Buttons (`Button`)
- **Primary**: `bg-primary text-primary-foreground`. Used for primary actions (Submit, Save, Create).
- **Secondary**: `bg-secondary text-secondary-foreground`. Used for alternate actions.
- **Destructive**: `bg-destructive text-destructive-foreground`. Used for delete/remove actions.
- **Outline**: `border border-input bg-background`. Used for neutral actions (Cancel).
- **Ghost**: `hover:bg-accent hover:text-accent-foreground`. Used for icon buttons or low-priority actions.

### Tables (`Table`, `DataTable`)
- Powered by `@tanstack/react-table` for headless logic.
- Row hover states (`hover:bg-muted/50`) ensure clarity when scanning large data sets.
- Fixed header rows for long scrolling data sets.

### Forms (`Form`, `Input`, `Select`, `Label`)
- All form elements utilize `react-hook-form` adapters.
- **Validation**: Error states render the input border red (`border-destructive`) and display small helper text below the field.
- **Selects**: Utilize Radix UI primitives for accessible, stylable dropdowns.

### Dialogs / Modals (`Dialog`)
- Used exclusively for complex data entry (e.g., adding an inventory item or recording a sale).
- Modals trap focus and close upon outside click or hitting `ESC`.

### Charts (`Recharts`)
- Used heavily in Dashboards and Report pages.
- Tooltips are strictly styled to ensure text visibility across both light and dark themes (e.g., `#1F1F1F` backgrounds in Dark mode).

### Status Badges (`StatusBadge`)
- A custom component mapping statuses to specific colors:
  - `Completed`, `Delivered`, `Active`: Green/Success
  - `Pending`, `Low Stock`: Yellow/Warning
  - `Cancelled`, `Refunded`, `Out of Stock`: Red/Destructive
