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
  Search,
  Plus,
  ChevronDown,
  Sun,
  Moon,
  Truck,
  RefreshCw,
  ChevronRight,
  TrendingUp,
  Bell,
  Crown
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { cn, formatUserDisplayName, formatRoleLabel, getUserInitials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/features/inventory/components/NotificationBell';
import { releaseSessionLease } from '@/features/auth/services/sessionLeaseService';
import { CommandPalette } from './CommandPalette';
import { ItemFormModal } from '@/features/inventory/components/ItemFormModal';
import { useItems } from '@/features/inventory/hooks/useItems';
import { useStockMutations } from '@/features/inventory/hooks/useStockMutations';
import type { InventoryItem } from '@/features/inventory/types';

// Custom SVG icon matching ChatGPT's exact sidebar toggle [ | ] icon
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

interface NavItem {
  name: string;
  to: string;
  icon: any;
  badge?: string;
}

// Unified Primary Navigation (Core destinations matching artisanal bistro IA)
const primaryNav: NavItem[] = [
  { name: 'Dashboard', to: '/inventory', icon: LayoutDashboard },
  { name: 'Inventory', to: '/items', icon: Package },
  { name: 'Daily Inventory', to: '/daily-inventory', icon: FileText },
  { name: 'Reports', to: '/reports', icon: FileBarChart },
  { name: 'Analytics', to: '/analytics', icon: TrendingUp },
  { name: 'Notifications', to: '/notifications', icon: Bell },
  { name: 'Settings', to: '/settings', icon: Settings },
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
  } else if (location.pathname === '/analytics') {
    section = 'Overview';
    page = 'Analytics';
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
      page = 'Items Catalog';
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
  } else if (location.pathname === '/settings' || location.pathname === '/admin') {
    section = 'Settings';
    if (tab === 'account') page = 'My Account & Password';
    else if (tab === 'restaurant' || tab === 'settings') page = 'Restaurant Profile';
    else if (tab === 'users') page = 'Staff & Users';
    else if (tab === 'notifications' || tab === 'preferences') page = 'Preferences & Alerts';
    else if (tab === 'activity' || tab === 'logs') page = 'Activity Audit Trail';
    else if (tab === 'master') page = 'Master Admin Console';
    else if (tab === 'about') page = 'About & Diagnostics';
    else page = 'System Settings';
  }

  return (
    <div className="px-4 sm:px-6 py-2 border-b border-border/50 bg-card/30 flex items-center gap-1.5 text-[11px] text-muted-foreground shrink-0 select-none relative z-10">
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
}

function SidebarNavigation({ 
  closeMobileMenu, 
  isCollapsed = false, 
  onToggleCollapse,
  onOpenSearch
}: SidebarNavigationProps) {
  const { role, profile, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  const isItemActive = (to: string) => {
    if (to === '/inventory') {
      return location.pathname === '/inventory';
    }

    if (to === '/items') {
      return location.pathname === '/items' || 
             location.pathname.startsWith('/items/') || 
             location.pathname === '/categories' || 
             location.pathname === '/stock' || 
             location.pathname === '/history';
    }

    if (to === '/daily-inventory') {
      return location.pathname === '/daily-inventory';
    }

    if (to === '/reports') {
      return location.pathname.startsWith('/reports');
    }

    if (to === '/settings?tab=master') {
      return (location.pathname === '/settings' || location.pathname === '/admin') && location.search.includes('tab=master');
    }

    if (to === '/settings') {
      return (location.pathname === '/settings' || location.pathname === '/admin') && !location.search.includes('tab=master');
    }

    return location.pathname === to;
  };

  const handleLogout = async () => {
    try {
      await releaseSessionLease();
    } catch (e) {
      console.warn('Error releasing session lease:', e);
    }
    await supabase.auth.signOut();
  };

  const userInitials = getUserInitials(profile || user?.email);
  const userDisplayName = formatUserDisplayName(profile, user?.email);

  const isMasterUser = role === 'MASTER_ADMIN' || user?.email === 'master@kuventory.com';
  const isAdminUser = role === 'ADMIN' || user?.email === 'admin@kuventory.com' || isMasterUser;

  const navList = [
    ...primaryNav,
    ...(isAdminUser ? [{ 
      name: 'Master Admin', 
      to: '/settings?tab=master', 
      icon: Crown, 
      badge: isMasterUser ? 'ROOT' : 'RESTRICTED' 
    }] : [])
  ];

  return (
    <div className="flex flex-col h-full bg-[#1F1816] text-[#FAF7F2] select-none transition-all duration-200 ease-in-out border-r border-[#2E2320]">
      {/* Top Header / Brand or Collapsed Toggle Rail */}
      {isCollapsed ? (
        <div className="h-18 shrink-0 flex flex-col items-center justify-center border-b border-[#2E2320] px-2 bg-[#1F1816]">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Open sidebar (Ctrl+[)"
            className="w-10 h-10 rounded-xl bg-[#2A201C] hover:bg-[#382C27] text-[#FAF7F2] flex items-center justify-center border border-[#3E302A] transition-all cursor-pointer shadow-xs"
          >
            <SidebarToggleIcon className="w-5 h-5 text-[#FAF7F2]" />
          </button>
        </div>
      ) : (
        <div className="h-18 shrink-0 flex items-center justify-between border-b border-[#2E2320] px-4 transition-all bg-[#1F1816]">
          <Link to="/inventory" className="flex items-center gap-3 min-w-0 group" onClick={closeMobileMenu}>
            <div className="w-9 h-9 rounded-xl bg-[#2A201C] border border-[#3E302A] p-1 flex items-center justify-center shrink-0 shadow-xs transition-colors group-hover:border-[#C5A059]/50">
              <img 
                src="/pics/logo-transparent.png" 
                alt="KUVENTORY" 
                className="h-7 w-auto object-contain" 
                onError={(e) => { e.currentTarget.src = '/pics/logo-original.png'; }} 
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm tracking-tight text-[#FAF7F2] leading-tight group-hover:text-[#DFB748] transition-colors">
                KUVENTORY
              </span>
              <span className="text-[11px] text-[#A89E93] font-medium tracking-normal truncate">
                Kape Uno Bistro
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-1">
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                title="Search (Ctrl+K)"
                className="p-2 rounded-lg text-[#A89E93] hover:text-[#FAF7F2] hover:bg-[#2A201C] transition-colors cursor-pointer"
              >
                <Search className="w-4 h-4" />
              </button>
            )}

            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Close sidebar (Ctrl+[)"
                className="p-2 rounded-lg text-[#A89E93] hover:text-[#FAF7F2] hover:bg-[#2A201C] transition-colors hidden md:flex items-center justify-center cursor-pointer"
              >
                <SidebarToggleIcon className="w-4 h-4" />
              </button>
            )}

            {closeMobileMenu && (
              <button
                type="button"
                onClick={closeMobileMenu}
                title="Close menu"
                className="p-2 rounded-lg text-[#A89E93] hover:text-[#FAF7F2] hover:bg-[#2A201C] transition-colors md:hidden flex items-center justify-center cursor-pointer"
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
        {/* Top Primary Quick Action */}
        {!isCollapsed ? (
          <div className="space-y-2">
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                className="flex items-center justify-between w-full px-3 py-2 text-xs text-[#A89E93] bg-[#2A201C]/60 hover:bg-[#2A201C] hover:text-[#FAF7F2] rounded-xl border border-[#382C27] transition-colors cursor-pointer group"
              >
                <span className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-[#A89E93] group-hover:text-[#FAF7F2]" />
                  <span>Search commands...</span>
                </span>
                <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#A89E93] bg-[#1F1816] border border-[#382C27] rounded">
                  Ctrl+K
                </kbd>
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 pb-1">
            {onOpenSearch && (
              <button
                type="button"
                onClick={onOpenSearch}
                title="Search & Commands (Ctrl+K)"
                aria-label="Search and Commands"
                className="w-10 h-10 rounded-xl text-[#A89E93] hover:text-[#FAF7F2] hover:bg-[#2A201C] flex items-center justify-center transition-colors cursor-pointer"
              >
                <Search className="w-4 h-4" />
              </button>
            )}
            <div className="h-px w-8 bg-[#2E2320] my-1" />
          </div>
        )}

        {/* Unified Primary Navigation List */}
        <nav className="space-y-1 pt-1">
          {navList.map((item) => {
            const active = isItemActive(item.to);
            return (
              <Link
                key={item.name}
                to={item.to}
                onClick={closeMobileMenu}
                title={isCollapsed ? item.name : undefined}
                className={cn(
                  "flex items-center rounded-xl text-xs font-semibold transition-all group",
                  isCollapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3.5 py-2.5",
                  active
                    ? "bg-[#611A1F] text-white font-bold shadow-xs border border-[#7D242B]"
                    : "text-[#A89E93] hover:bg-[#2A201C] hover:text-[#FAF7F2]"
                )}
              >
                <item.icon className={cn("h-4 w-4 shrink-0 transition-transform group-hover:scale-105", active ? "text-white" : "text-[#A89E93] group-hover:text-[#FAF7F2]")} />
                {!isCollapsed && <span className="truncate">{item.name}</span>}
                {!isCollapsed && item.badge && (
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#C5A059]/20 text-[#DFB748] border border-[#C5A059]/40">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User Profile & Theme Footer Card */}
      <div className={cn(
        "border-t border-[#2E2320] bg-[#1A1412] shrink-0",
        isCollapsed ? "p-2" : "p-3"
      )}>
        {isCollapsed ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="w-10 h-10 rounded-xl text-[#A89E93] hover:text-[#FAF7F2] hover:bg-[#2A201C] flex items-center justify-center transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-amber-200" />}
            </button>

            <Link
              to="/settings?tab=account"
              onClick={closeMobileMenu}
              title={`${userDisplayName} (${role === 'MASTER_ADMIN' ? 'Master Admin' : role === 'ADMIN' ? 'Administrator' : 'Staff'})`}
              className="h-9 w-9 rounded-full bg-[#611A1F] text-white flex items-center justify-center font-bold text-xs shrink-0 border border-[#C5A059]/40 cursor-pointer shadow-xs hover:ring-2 hover:ring-[#C5A059] transition-all"
            >
              {userInitials}
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              className="p-2 rounded-xl text-[#A89E93] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between p-2 rounded-xl bg-[#231A17] border border-[#342722] shadow-2xs">
            <Link 
              to="/settings?tab=account" 
              onClick={closeMobileMenu}
              title="Manage Account & Password"
              className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-90 transition-opacity cursor-pointer group"
            >
              <div className="h-9 w-9 rounded-full bg-[#611A1F] text-white flex items-center justify-center font-bold text-xs shrink-0 border border-[#C5A059]/40 shadow-xs group-hover:ring-2 group-hover:ring-[#C5A059] transition-all">
                {userInitials}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-[#FAF7F2] truncate group-hover:text-[#DFB748] transition-colors">
                  {userDisplayName}
                </span>
                <span className={cn(
                  "text-[9px] uppercase font-bold tracking-wider inline-block px-1.5 py-0.5 rounded w-fit mt-0.5 border",
                  role === 'MASTER_ADMIN' 
                    ? "bg-[#C5A059]/20 text-[#DFB748] border-[#C5A059]/40" 
                    : role === 'ADMIN'
                    ? "bg-[#611A1F]/30 text-[#E57373] border-[#611A1F]/50"
                    : "bg-[#2E7D32]/20 text-[#81C784] border-[#2E7D32]/30"
                )}>
                  {formatRoleLabel(role)}
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleTheme}
                title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                aria-label={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
                className="p-1.5 rounded-lg text-[#A89E93] hover:text-[#FAF7F2] hover:bg-[#2A201C] transition-colors cursor-pointer"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-amber-200" />}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign Out"
                aria-label="Sign Out"
                className="p-1.5 rounded-lg text-[#A89E93] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
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

  const userInitials = getUserInitials(profile || user?.email);
  const userDisplayName = formatUserDisplayName(profile, user?.email);

  const handleLogout = async () => {
    try {
      await releaseSessionLease();
    } catch (e) {
      console.warn('Error releasing session lease:', e);
    }
    await supabase.auth.signOut();
  };

  return (
    <div className="flex h-dvh min-h-dvh max-h-dvh bg-background text-foreground overflow-hidden font-sans">
      {/* 1. Desktop Sidebar Navigation (ChatGPT style full-height rail) */}
      <aside className={cn(
        "bg-card border-r border-border flex-col hidden md:flex shrink-0 h-full transition-all duration-200 ease-in-out z-30",
        isSidebarCollapsed ? "w-16" : "w-64"
      )}>
        <SidebarNavigation 
          isCollapsed={isSidebarCollapsed} 
          onToggleCollapse={toggleSidebar}
          onOpenSearch={() => setIsCommandOpen(true)}
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
            />
          </div>
        </div>
      )}

      {/* 3. Right Column: Top Header + Main Viewport Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* Top Header Bar for Main Content Area */}
        <header className="h-16 shrink-0 bg-card border-b border-border flex items-center justify-between px-2.5 sm:px-6 relative z-40 shadow-2xs gap-2">
          {/* Left Side: Mobile Menu Button (md:hidden) */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <Button 
              variant="ghost" 
              className="p-1.5 h-8 w-8 sm:h-9 sm:w-9 md:hidden text-muted-foreground hover:text-foreground shrink-0 cursor-pointer" 
              onClick={() => setMobileMenuOpen(true)}
              title="Open Menu"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
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

          {/* Right Side Actions */}
          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0 ml-auto">
            {/* Quick Search Icon for tablet/mobile */}
            <button
              type="button"
              onClick={() => setIsCommandOpen(true)}
              className="h-8 w-8 sm:h-9 sm:w-9 p-1.5 sm:p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl flex items-center justify-center cursor-pointer transition-colors lg:hidden"
              title="Search (Ctrl+K)"
              aria-label="Search items"
            >
              <Search className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Dark / Light Theme Toggle Button */}
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="h-8 w-8 sm:h-9 sm:w-9 p-1.5 sm:p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Toggle dark/light theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>

            {/* Quick Action Dropdown (Focused on Core Inventory Operations) */}
            <div className="relative">
              <Button
                onClick={() => setQuickActionOpen(!quickActionOpen)}
                className="h-8 sm:h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs px-2 sm:px-3.5 rounded-xl shadow-xs flex items-center gap-1 sm:gap-1.5 cursor-pointer"
                aria-label="Quick Action Menu"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Quick Action</span>
                <ChevronDown className="w-3 h-3 ml-0.5 opacity-80" />
              </Button>

              {quickActionOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setQuickActionOpen(false)} 
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-card rounded-xl shadow-2xl border border-border py-2 z-50 ring-1 ring-border/50">
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                       Inventory Actions
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickActionOpen(false);
                        setIsNewItemModalOpen(true);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 rounded-lg mx-auto flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <span className="p-1 rounded-md bg-primary/10 text-primary">
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                      Add New Item
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickActionOpen(false);
                        navigate('/items?tab=batches&action=add');
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 rounded-lg mx-auto flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <span className="p-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                      Receive Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickActionOpen(false);
                        navigate('/items?quick=adjust');
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 rounded-lg mx-auto flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <span className="p-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <RefreshCw className="w-3.5 h-3.5" />
                      </span>
                      Adjust Stock
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickActionOpen(false);
                        navigate('/items?tab=suppliers&action=new');
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 rounded-lg mx-auto flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <span className="p-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        <Truck className="w-3.5 h-3.5" />
                      </span>
                      Add Supplier
                    </button>
                    <div className="h-px bg-border/60 my-1 mx-2" />
                    <button
                      type="button"
                      onClick={() => {
                        setQuickActionOpen(false);
                        navigate('/daily-inventory');
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted/80 rounded-lg mx-auto flex items-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <span className="p-1 rounded-md bg-emerald-600/10 text-emerald-600 dark:text-emerald-400">
                        <FileText className="w-3.5 h-3.5" />
                      </span>
                      Open Daily Inventory
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Notification Bell */}
            <NotificationBell />

            {/* User Profile & Account */}
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-border">
              <Link
                to="/settings?tab=account"
                title={`Account: ${userDisplayName} (${formatRoleLabel(role)})`}
                className="flex items-center gap-2.5 px-2 py-1 rounded-xl hover:bg-muted/80 transition-colors group cursor-pointer"
              >
                <div className="h-8 w-8 rounded-full bg-[#611A1F] text-white flex items-center justify-center font-bold text-xs shrink-0 border border-[#C5A059]/40 shadow-2xs group-hover:ring-2 group-hover:ring-[#C5A059] transition-all">
                  {userInitials}
                </div>
                <div className="flex flex-col items-start leading-tight">
                  <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors max-w-32 truncate">
                    {userDisplayName}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    {formatRoleLabel(role)}
                  </span>
                </div>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="h-8 w-8 flex items-center justify-center rounded-xl text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Dynamic Contextual Breadcrumbs */}
        <AppBreadcrumbs />

        {/* Main Content Viewport */}
        <main className="flex-1 flex flex-col min-w-0 h-full relative z-0 isolate bg-background overflow-hidden">
          <div className="flex-1 overflow-y-auto pb-20 md:pb-8 overscroll-none scroll-smooth">
            <Outlet />
          </div>
          
          {/* Mobile Bottom Navigation Bar */}
          <nav aria-label="Mobile Navigation" className="md:hidden fixed bottom-0 left-0 right-0 h-16 pb-[env(safe-area-inset-bottom,0px)] bg-card border-t border-border flex items-center justify-around px-2 z-40 shadow-lg">
            <Link 
              to="/inventory" 
              className={cn(
                "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors min-h-[44px]", 
                location.pathname === '/inventory' ? "text-primary font-bold" : "text-muted-foreground"
              )}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="text-[10px]">Dash</span>
            </Link>
            <Link 
              to="/daily-inventory" 
              className={cn(
                "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors min-h-[44px]", 
                location.pathname === '/daily-inventory' ? "text-primary font-bold" : "text-muted-foreground"
              )}
            >
              <FileText className="w-5 h-5" />
              <span className="text-[10px]">Daily Sheet</span>
            </Link>
            <Link 
              to="/items" 
              className={cn(
                "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors min-h-[44px]", 
                location.pathname === '/items' && (!currentTab || currentTab === 'catalog') ? "text-primary font-bold" : "text-muted-foreground"
              )}
            >
              <Package className="w-5 h-5" />
              <span className="text-[10px]">Items</span>
            </Link>
            <Link 
              to="/reports" 
              className={cn(
                "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors min-h-[44px]", 
                location.pathname.startsWith('/reports') ? "text-primary font-bold" : "text-muted-foreground"
              )}
            >
              <FileBarChart className="w-5 h-5" />
              <span className="text-[10px]">Reports</span>
            </Link>
            <button 
              type="button" 
              onClick={() => setMobileMenuOpen(true)} 
              className="flex flex-col items-center justify-center w-16 h-full gap-1 text-muted-foreground hover:text-foreground cursor-pointer min-h-[44px]"
              aria-label="Open more menu options"
            >
              <Menu className="w-5 h-5" />
              <span className="text-[10px]">More</span>
            </button>
          </nav>
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
