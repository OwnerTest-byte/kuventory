import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LogOut, 
  Package, 
  FileText, 
  Menu, 
  X, 
  LayoutDashboard, 
  FileBarChart, 
  Settings, 
  User as UserIcon,
  Search,
  Plus,
  Layers,
  ChevronDown,
  Sun,
  Moon,
  PenSquare,
  Truck,
  Tags,
  History,
  Users,
  Activity,
  RefreshCw,
  ChevronRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/features/inventory/components/NotificationBell';
import { CommandPalette } from './CommandPalette';
import { ItemFormModal } from '@/features/inventory/components/ItemFormModal';
import { useItems } from '@/features/inventory/hooks/useItems';
import { useStockMutations } from '@/features/inventory/hooks/useStockMutations';
import type { InventoryItem } from '@/features/inventory/types';

// SVG icon for desktop sidebar toggle
function SidebarToggleIcon({ className }: { className?: string }) {
  return (
    <svg 
      className={cn("w-5 h-5", className)} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="3" />
      <path d="M9 3v18" />
    </svg>
  );
}

// Navigation route groupings
const overviewNav = [
  { name: 'Dashboard', to: '/inventory', icon: LayoutDashboard },
];

const inventoryNav = [
  { name: 'Items', to: '/items', icon: Package },
  { name: 'Batches', to: '/items?tab=batches', icon: Layers },
  { name: 'Movements', to: '/items?tab=history', icon: History },
];

const operationsNav = [
  { name: 'Daily Inventory', to: '/daily-inventory', icon: FileText },
];

const referenceNav = [
  { name: 'Suppliers', to: '/items?tab=suppliers', icon: Truck },
];

const reportsNav = [
  { name: 'Reports', to: '/reports', icon: FileBarChart },
];

const adminNav = [
  { name: 'Users', to: '/admin?tab=users', icon: Users },
  { name: 'Categories', to: '/items?tab=categories', icon: Tags },
  { name: 'Audit Logs', to: '/admin?tab=logs', icon: Activity },
  { name: 'Settings', to: '/admin?tab=settings', icon: Settings },
];

const accountNav = [
  { name: 'My Account', to: '/settings', icon: UserIcon },
];

// Collapsible breadcrumb component
function AppBreadcrumbs() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const tab = searchParams.get('tab');

  let section = 'Overview';
  let page = 'Dashboard';

  if (location.pathname === '/inventory') {
    section = 'Overview';
    page = 'Dashboard';
  } else if (location.pathname === '/daily-inventory') {
    section = 'Operations';
    page = 'Daily Inventory';
  } else if (location.pathname === '/items') {
    section = 'Inventory';
    if (tab === 'batches') {
      page = 'Batches';
    } else if (tab === 'history') {
      page = 'Movements';
    } else if (tab === 'suppliers') {
      section = 'Reference';
      page = 'Suppliers';
    } else if (tab === 'categories') {
      section = 'Administration';
      page = 'Categories';
    } else {
      page = 'Items';
    }
  } else if (location.pathname.startsWith('/items/')) {
    section = 'Inventory';
    page = 'Item Details';
  } else if (location.pathname.startsWith('/reports')) {
    section = 'Reports';
    if (location.pathname === '/reports/inventory') page = 'Daily Inventory Report';
    else if (location.pathname === '/reports/movement') page = 'Stock Movement Report';
    else if (location.pathname === '/reports/low-stock') page = 'Low Stock Report';
    else if (location.pathname === '/reports/expiry') page = 'Expiry & Waste Report';
    else page = 'Reports Library';
  } else if (location.pathname === '/settings') {
    section = 'Account';
    page = 'My Account';
  } else if (location.pathname === '/admin') {
    section = 'Administration';
    page = tab === 'logs' ? 'Audit Logs' : tab === 'settings' ? 'System Settings' : 'Users & Roles';
  }

  return (
    <div className="px-4 sm:px-6 py-2 border-b border-border/50 bg-card/30 flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0 select-none">
      <span className="hidden sm:inline font-medium hover:text-foreground transition-colors">{section}</span>
      <ChevronRight className="hidden sm:inline w-3 h-3 text-muted-foreground/60 shrink-0" />
      <span className="font-semibold text-foreground truncate">{page}</span>
    </div>
  );
}

interface SidebarNavigationProps {
  closeMobileMenu?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenSearch?: () => void;
  onOpenNewSheet?: () => void;
}

function SidebarNavigation({ 
  closeMobileMenu, 
  isCollapsed = false, 
  onToggleCollapse,
  onOpenSearch,
  onOpenNewSheet
}: SidebarNavigationProps) {
  const { role, profile, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab');

  const isItemActive = (to: string) => {
    const [path, query] = to.split('?');
    const targetParams = new URLSearchParams(query || '');
    const targetTab = targetParams.get('tab');

    // Handle /categories alias -> /items?tab=categories
    if (to === '/categories' || to === '/items?tab=categories') {
      return (location.pathname === '/items' && currentTab === 'categories') || location.pathname === '/categories';
    }

    // If path doesn't match, return false
    if (location.pathname !== path) {
      return false;
    }

    // If path is /items:
    if (path === '/items') {
      if (targetTab) {
        return currentTab === targetTab;
      }
      return !currentTab || currentTab === 'catalog';
    }

    // If path is /admin:
    if (path === '/admin') {
      if (targetTab) {
        return currentTab === targetTab;
      }
      return !currentTab || currentTab === 'users';
    }

    if (path === '/reports') {
      return location.pathname.startsWith('/reports');
    }

    if (path === '/settings') {
      return location.pathname === '/settings';
    }

    return true;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const userInitials = profile?.first_name 
    ? `${profile.first_name[0]}${profile.last_name ? profile.last_name[0] : ''}`.toUpperCase()
    : 'U';

  const userDisplayName = profile?.first_name
    ? `${profile.first_name} ${profile.last_name || ''}`.trim()
    : user?.email || 'User';

  return (
    <div className="flex flex-col h-full bg-card text-card-foreground select-none transition-all duration-200 ease-in-out border-r border-border">
      {/* Top Header / Brand or Collapsed Toggle Rail */}
      {isCollapsed ? (
        <div className="h-16 shrink-0 flex flex-col items-center justify-center border-b border-border px-2">
          {/* Top Toggle Button in Collapsed Rail Mode */}
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Open sidebar (Ctrl+[)"
            className="w-10 h-10 rounded-xl bg-muted/60 hover:bg-muted text-foreground flex items-center justify-center border border-border/60 transition-all cursor-pointer shadow-xs"
          >
            <SidebarToggleIcon className="w-5 h-5 text-foreground" />
          </button>
        </div>
      ) : (
        <div className="h-16 shrink-0 flex items-center justify-between border-b border-border px-4 transition-all">
          <Link to="/inventory" className="flex items-center gap-2.5 min-w-0" onClick={closeMobileMenu}>
            <img 
              src="/pics/logo-icon.png" 
              alt="KUVENTORY" 
              className="h-7 w-auto object-contain shrink-0" 
              onError={(e) => { e.currentTarget.style.display = 'none'; }} 
            />
            <span className="font-bold text-base tracking-tight text-foreground leading-tight">
              KUVENTORY
            </span>
          </Link>

          <div className="flex items-center gap-1">
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                title="Search (Ctrl+K)"
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                <Search className="w-4 h-4" />
              </button>
            )}

            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Close sidebar (Ctrl+[)"
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors hidden md:flex items-center justify-center cursor-pointer"
              >
                <SidebarToggleIcon className="w-4 h-4" />
              </button>
            )}

            {closeMobileMenu && (
              <button
                type="button"
                onClick={closeMobileMenu}
                title="Close menu"
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors md:hidden flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Action shortcuts & Nav List */}
      <div className={cn(
        "flex-1 overflow-y-auto py-3 space-y-4 scrollbar-thin",
        isCollapsed ? "px-2" : "px-3"
      )}>
        {/* Primary Quick Action Button */}
        {!isCollapsed ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onOpenNewSheet}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 font-semibold text-xs transition-colors cursor-pointer shadow-2xs group"
            >
              <PenSquare className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
              <span>Daily Worksheet</span>
            </button>

            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                className="flex items-center justify-between w-full px-3 py-2 text-xs text-muted-foreground bg-muted/40 hover:bg-muted/70 rounded-xl border border-border/50 transition-colors cursor-pointer group"
              >
                <span className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                  <span>Search commands...</span>
                </span>
                <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground bg-card border border-border rounded">
                  Ctrl+K
                </kbd>
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 pb-1">
            <button
              type="button"
              onClick={onOpenNewSheet}
              title="Daily Worksheet"
              className="w-10 h-10 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
            >
              <PenSquare className="w-4 h-4" />
            </button>
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                title="Search & Commands (Ctrl+K)"
                className="w-10 h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors cursor-pointer"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
            <div className="h-px w-8 bg-border/60 my-1" />
          </div>
        )}

        {/* OVERVIEW Section */}
        <div>
          {!isCollapsed && (
            <div className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Overview
            </div>
          )}
          <nav className="space-y-1">
            {overviewNav.map((item) => {
              const active = isItemActive(item.to);
              return (
                <Link
                  key={item.name}
                  to={item.to}
                  onClick={closeMobileMenu}
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    "flex items-center rounded-xl text-xs font-medium transition-all group",
                    isCollapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2",
                    active
                      ? "bg-primary/15 text-primary font-semibold border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* INVENTORY Section */}
        <div>
          {!isCollapsed && (
            <div className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Inventory
            </div>
          )}
          <nav className="space-y-1">
            {inventoryNav.map((item) => {
              const active = isItemActive(item.to);
              return (
                <Link
                  key={item.name}
                  to={item.to}
                  onClick={closeMobileMenu}
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    "flex items-center rounded-xl text-xs font-medium transition-all group",
                    isCollapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2",
                    active
                      ? "bg-primary/15 text-primary font-semibold border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* OPERATIONS Section */}
        <div>
          {!isCollapsed && (
            <div className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Operations
            </div>
          )}
          <nav className="space-y-1">
            {operationsNav.map((item) => {
              const active = isItemActive(item.to);
              return (
                <Link
                  key={item.name}
                  to={item.to}
                  onClick={closeMobileMenu}
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    "flex items-center rounded-xl text-xs font-medium transition-all group",
                    isCollapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2",
                    active
                      ? "bg-primary/15 text-primary font-semibold border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* REFERENCE Section */}
        <div>
          {!isCollapsed && (
            <div className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Reference
            </div>
          )}
          <nav className="space-y-1">
            {referenceNav.map((item) => {
              const active = isItemActive(item.to);
              return (
                <Link
                  key={item.name}
                  to={item.to}
                  onClick={closeMobileMenu}
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    "flex items-center rounded-xl text-xs font-medium transition-all group",
                    isCollapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2",
                    active
                      ? "bg-primary/15 text-primary font-semibold border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* REPORTS Section */}
        <div>
          {!isCollapsed && (
            <div className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Reports
            </div>
          )}
          <nav className="space-y-1">
            {reportsNav.map((item) => {
              const active = isItemActive(item.to);
              return (
                <Link
                  key={item.name}
                  to={item.to}
                  onClick={closeMobileMenu}
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    "flex items-center rounded-xl text-xs font-medium transition-all group",
                    isCollapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2",
                    active
                      ? "bg-primary/15 text-primary font-semibold border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* ADMINISTRATION Section (Admin Only) */}
        {role === 'ADMIN' && (
          <div>
            {!isCollapsed && (
              <div className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Administration
              </div>
            )}
            <nav className="space-y-1">
              {adminNav.map((item) => {
                const active = isItemActive(item.to);
                return (
                  <Link
                    key={item.name}
                    to={item.to}
                    onClick={closeMobileMenu}
                    title={isCollapsed ? item.name : undefined}
                    className={cn(
                      "flex items-center rounded-xl text-xs font-medium transition-all group",
                      isCollapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2",
                      active
                        ? "bg-primary/15 text-primary font-semibold border-l-2 border-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {!isCollapsed && <span className="truncate">{item.name}</span>}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        {/* ACCOUNT Section */}
        <div>
          {!isCollapsed && (
            <div className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Account
            </div>
          )}
          <nav className="space-y-1">
            {accountNav.map((item) => {
              const active = isItemActive(item.to);
              return (
                <Link
                  key={item.name}
                  to={item.to}
                  onClick={closeMobileMenu}
                  title={isCollapsed ? item.name : undefined}
                  className={cn(
                    "flex items-center rounded-xl text-xs font-medium transition-all group",
                    isCollapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2",
                    active
                      ? "bg-primary/15 text-primary font-semibold border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.name}</span>}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* User Profile & Theme Footer Card */}
      <div className={cn(
        "border-t border-border bg-muted/20 shrink-0",
        isCollapsed ? "p-2" : "p-3"
      )}>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2 py-1">
            {/* Theme Toggle Button in Collapsed Rail */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="w-10 h-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>

            {/* Avatar Pill */}
            <div 
              title={`${userDisplayName} (${role === 'ADMIN' ? 'Administrator' : 'Staff'})`}
              className="h-9 w-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs shrink-0 border border-primary/30 cursor-pointer shadow-xs"
            >
              {userInitials}
            </div>

            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 rounded-xl text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-2 rounded-xl bg-card border border-border/70 shadow-2xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-9 w-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs shrink-0 border border-primary/30 shadow-xs">
                {userInitials}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-foreground truncate">
                  {userDisplayName}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase font-medium tracking-wide">
                  {role === 'ADMIN' ? 'Administrator' : 'Staff Member'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleTheme}
                title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign Out"
                className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [quickActionOpen, setQuickActionOpen] = useState(false);
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [isSubmittingItem, setIsSubmittingItem] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('kuventory_sidebar_collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('kuventory_sidebar_collapsed', String(next));
      return next;
    });
  };

  const { theme, toggleTheme } = useTheme();
  const { createItem } = useItems();
  const { add } = useStockMutations();
  const { profile, user, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const currentTab = searchParams.get('tab');

  // Keyboard shortcut: Ctrl+[ to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '[') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!profile) return;
    const hasLoggedVisit = sessionStorage.getItem('has_logged_visit');
    if (!hasLoggedVisit) {
      supabase.from('visitor_logs').insert({
        user_id: profile.id,
        user_email: user?.email || 'unknown',
      }).then(({ error }) => {
        if (!error) {
          sessionStorage.setItem('has_logged_visit', 'true');
        }
      });
    }
  }, [profile, user]);

  const handleCreateItem = async (
    data: Omit<InventoryItem, 'id' | 'is_archived' | 'created_at' | 'updated_at' | 'current_qty'>,
    initialQty?: number
  ) => {
    setIsSubmittingItem(true);
    try {
      const newItem = await createItem(data);
      if (initialQty && initialQty > 0) {
        await add.mutateAsync({
          itemId: newItem.id,
          quantity: initialQty,
          reason: 'Initial Opening Stock Balance'
        });
      }
      setIsNewItemModalOpen(false);
    } finally {
      setIsSubmittingItem(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="flex h-dvh min-h-dvh max-h-dvh bg-background text-foreground overflow-hidden font-sans">
      {/* Desktop Sidebar Navigation Rail */}
      <aside className={cn(
        "bg-card border-r border-border flex-col hidden md:flex shrink-0 h-full transition-all duration-200 ease-in-out z-30",
        isSidebarCollapsed ? "w-16" : "w-64"
      )}>
        <SidebarNavigation 
          isCollapsed={isSidebarCollapsed} 
          onToggleCollapse={toggleSidebar}
          onOpenSearch={() => setIsCommandOpen(true)}
          onOpenNewSheet={() => navigate('/daily-inventory')}
        />
      </aside>

      {/* 2. Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs" 
            onClick={() => setMobileMenuOpen(false)} 
          />
          <div className="relative flex w-72 max-w-[85vw] flex-col bg-card border-r border-border h-full shadow-2xl">
            <SidebarNavigation 
              closeMobileMenu={() => setMobileMenuOpen(false)}
              onOpenSearch={() => {
                setMobileMenuOpen(false);
                setIsCommandOpen(true);
              }}
              onOpenNewSheet={() => {
                setMobileMenuOpen(false);
                navigate('/daily-inventory');
              }}
            />
          </div>
        </div>
      )}

      {/* 3. Right Column: Top Header + Main Viewport Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header Bar for Main Content Area */}
        <header className="h-16 shrink-0 bg-card border-b border-border flex items-center justify-between px-2.5 sm:px-6 z-20 shadow-2xs gap-2">
          {/* Left Side: Mobile Menu Button (md:hidden) & Warehouse Location Badge */}
          <div className="flex items-center gap-1.5 sm:gap-4 min-w-0 shrink-0">
            <Button 
              variant="ghost" 
              className="p-1.5 h-9 w-9 md:hidden text-muted-foreground hover:text-foreground shrink-0 cursor-pointer" 
              onClick={() => setMobileMenuOpen(true)}
              title="Open Menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            {/* Location / Warehouse Badge - Auto-compact on mobile */}
            <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 rounded-lg sm:rounded-xl bg-muted/60 border border-border shrink-0 max-w-[125px] sm:max-w-none" title="Location: KUVENTORY KIOSK & BODEGA">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <div className="flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-foreground truncate">
                <span className="hidden sm:inline text-muted-foreground font-normal">Location:</span>
                <strong className="tracking-tight uppercase truncate">
                  <span className="sm:hidden">BODEGA</span>
                  <span className="hidden sm:inline">KUVENTORY KIOSK & BODEGA</span>
                </strong>
              </div>
            </div>
          </div>

          {/* Center: Global Quick Search Button (Desktop) */}
          <div className="hidden lg:flex items-center max-w-md w-full mx-4 xl:mx-6">
            <button
              type="button"
              onClick={() => setIsCommandOpen(true)}
              className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-muted-foreground bg-muted/40 hover:bg-muted/80 border border-border rounded-xl transition-all shadow-2xs group cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
                <span>Search items, SKU, suppliers...</span>
              </span>
              <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground bg-card border border-border rounded">
                Ctrl + K
              </kbd>
            </button>
          </div>

          {/* Right Side Actions - Compact gap on mobile to prevent collision */}
          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
            {/* Quick Search Icon for tablet/mobile */}
            <button
              type="button"
              onClick={() => setIsCommandOpen(true)}
              className="p-1.5 sm:p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl lg:hidden cursor-pointer"
              title="Search (Ctrl+K)"
            >
              <Search className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Dark / Light Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="p-1.5 sm:p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>

            {/* Quick Action Dropdown (Compact icon-only on mobile, full button on desktop) */}
            <div className="relative">
              <Button
                onClick={() => setQuickActionOpen(!quickActionOpen)}
                title="Quick Actions"
                className="h-9 w-9 sm:w-auto p-0 sm:px-3.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-xs flex items-center justify-center sm:gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">Quick Action</span>
                <ChevronDown className="hidden sm:inline w-3 h-3 ml-0.5 opacity-80" />
              </Button>

              {quickActionOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-30" 
                    onClick={() => setQuickActionOpen(false)} 
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-card rounded-xl shadow-xl border border-border py-2 z-40">
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                       Inventory Actions
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickActionOpen(false);
                        setIsNewItemModalOpen(true);
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted flex items-center gap-2.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 text-primary" />
                      + Add Item
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickActionOpen(false);
                        navigate('/items?tab=batches&action=add');
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted flex items-center gap-2.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 text-emerald-500" />
                      + Receive Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickActionOpen(false);
                        navigate('/items?quick=adjust');
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted flex items-center gap-2.5 cursor-pointer"
                    >
                      <RefreshCw className="w-4 h-4 text-amber-500" />
                      + Adjust Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickActionOpen(false);
                        navigate('/items?tab=suppliers&action=new');
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted flex items-center gap-2.5 cursor-pointer"
                    >
                      <Truck className="w-4 h-4 text-blue-500" />
                      + Add Supplier
                    </button>
                    <div className="h-px bg-border/60 my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setQuickActionOpen(false);
                        navigate('/daily-inventory');
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted flex items-center gap-2.5 cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-emerald-600" />
                      Open Daily Inventory
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Notification Bell */}
            <NotificationBell />

            {/* User Profile Pill */}
            <div className="hidden sm:flex items-center gap-2.5 pl-2.5 border-l border-border">
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold text-foreground">
                  {profile ? `${profile.first_name} ${profile.last_name || ''}`.trim() : 'User'}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                  {role}
                </span>
              </div>
              <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs border border-primary/30">
                <UserIcon className="w-4 h-4" />
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="p-1 text-muted-foreground hover:text-rose-500 transition-colors cursor-pointer"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Dynamic Contextual Breadcrumbs */}
        <AppBreadcrumbs />

        {/* Main Content Viewport */}
        <main className="flex-1 flex flex-col min-w-0 h-full relative bg-background overflow-hidden">
          <div className="flex-1 overflow-y-auto pb-20 md:pb-8 overscroll-none scroll-smooth">
            <Outlet />
          </div>
          
          {/* Mobile Bottom Navigation Bar */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex items-center justify-around px-2 z-40 shadow-lg">
            <Link 
              to="/inventory" 
              className={cn(
                "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors", 
                location.pathname === '/inventory' ? "text-primary font-bold" : "text-muted-foreground"
              )}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="text-[10px]">Dash</span>
            </Link>
            <Link 
              to="/daily-inventory" 
              className={cn(
                "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors", 
                location.pathname === '/daily-inventory' ? "text-primary font-bold" : "text-muted-foreground"
              )}
            >
              <FileText className="w-5 h-5" />
              <span className="text-[10px]">Daily Sheet</span>
            </Link>
            <Link 
              to="/items" 
              className={cn(
                "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors", 
                location.pathname === '/items' && (!currentTab || currentTab === 'catalog') ? "text-primary font-bold" : "text-muted-foreground"
              )}
            >
              <Package className="w-5 h-5" />
              <span className="text-[10px]">Items</span>
            </Link>
            <Link 
              to="/reports" 
              className={cn(
                "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors", 
                location.pathname.startsWith('/reports') ? "text-primary font-bold" : "text-muted-foreground"
              )}
            >
              <FileBarChart className="w-5 h-5" />
              <span className="text-[10px]">Reports</span>
            </Link>
            <button 
              type="button" 
              onClick={() => setMobileMenuOpen(true)} 
              className="flex flex-col items-center justify-center w-16 h-full gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Menu className="w-5 h-5" />
              <span className="text-[10px]">More</span>
            </button>
          </div>
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        onOpenNewItem={() => setIsNewItemModalOpen(true)}
      />

      {/* Global Add Item Modal */}
      {isNewItemModalOpen && (
        <ItemFormModal
          isSubmitting={isSubmittingItem}
          onClose={() => setIsNewItemModalOpen(false)}
          onSubmit={handleCreateItem}
        />
      )}
    </div>
  );
}
