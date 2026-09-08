import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
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
  Tags
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

const operationsNav = [
  { name: 'Dashboard', to: '/inventory', icon: LayoutDashboard },
  { name: 'Daily Inventory', to: '/daily-inventory', icon: FileText },
  { name: 'Stock & Items', to: '/items', icon: Package },
  { name: 'Stock Batches (FEFO)', to: '/items?tab=batches', icon: Layers },
  { name: 'Suppliers Directory', to: '/items?tab=suppliers', icon: Truck },
  { name: 'Categories', to: '/categories', icon: Tags },
];

const reportsNav = [
  { name: 'Reports & Exports', to: '/reports', icon: FileBarChart },
];

const preferencesNav = [
  { name: 'Settings', to: '/settings', icon: Settings },
];

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
          {/* Top Toggle Button in Collapsed Mode matching ChatGPT (Image 3) */}
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
          </div>
        </div>
      )}

      {/* Action shortcuts & Nav List */}
      <div className={cn(
        "flex-1 overflow-y-auto py-3 space-y-4 scrollbar-thin",
        isCollapsed ? "px-2" : "px-3"
      )}>
        {/* Top Primary Quick Action (Inspired by ChatGPT 'New chat' button) */}
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

        {/* Operations Section */}
        <div>
          {!isCollapsed && (
            <div className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Operations
            </div>
          )}
          <nav className="space-y-1">
            {operationsNav.map((item) => (
              <NavLink
                key={item.name}
                to={item.to}
                onClick={closeMobileMenu}
                title={isCollapsed ? item.name : undefined}
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-xl text-xs font-medium transition-all group",
                    isCollapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2",
                    isActive
                      ? "bg-primary/15 text-primary font-semibold border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && <span className="truncate">{item.name}</span>}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Reports Section */}
        <div>
          {!isCollapsed && (
            <div className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Analytics & Reports
            </div>
          )}
          <nav className="space-y-1">
            {reportsNav.map((item) => (
              <NavLink
                key={item.name}
                to={item.to}
                end={item.to === '/reports'}
                onClick={closeMobileMenu}
                title={isCollapsed ? item.name : undefined}
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-xl text-xs font-medium transition-all group",
                    isCollapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2",
                    isActive
                      ? "bg-primary/15 text-primary font-semibold border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && <span className="truncate">{item.name}</span>}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* System Section */}
        <div>
          {!isCollapsed && (
            <div className="px-3 pb-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Preferences
            </div>
          )}
          <nav className="space-y-1">
            {preferencesNav.map((item) => (
              <NavLink
                key={item.name}
                to={item.to}
                onClick={closeMobileMenu}
                title={isCollapsed ? item.name : undefined}
                className={({ isActive }) =>
                  cn(
                    "flex items-center rounded-xl text-xs font-medium transition-all group",
                    isCollapsed ? "justify-center w-10 h-10 mx-auto" : "gap-3 px-3 py-2",
                    isActive
                      ? "bg-primary/15 text-primary font-semibold border-l-2 border-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!isCollapsed && <span className="truncate">{item.name}</span>}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* User Profile & Theme Footer Card (Matching Image 1 & 3 bottom) */}
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
    <div className="flex flex-col h-dvh min-h-dvh max-h-dvh bg-background text-foreground overflow-hidden font-sans">
      {/* Top Header Bar (Google Cloud Console Style) */}
      <header className="h-16 shrink-0 bg-card border-b border-border flex items-center justify-between px-4 sm:px-6 z-20 shadow-2xs">
        {/* Left Side: Mobile Menu Trigger & Warehouse Location Badge */}
        <div className="flex items-center gap-3 sm:gap-4">
          <Button 
            variant="ghost" 
            className="p-1.5 h-9 w-9 md:hidden text-muted-foreground hover:text-foreground" 
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Location / Warehouse Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted/60 border border-border">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <span className="hidden sm:inline text-muted-foreground font-normal">Location:</span>
              <strong className="tracking-tight uppercase">KUVENTORY KIOSK & BODEGA</strong>
            </div>
          </div>
        </div>

        {/* Center: Global Quick Search Button (Google Cloud Search Input style) */}
        <div className="hidden lg:flex items-center max-w-md w-full mx-6">
          <button
            type="button"
            onClick={() => setIsCommandOpen(true)}
            className="w-full flex items-center justify-between px-3.5 py-2 text-xs text-muted-foreground bg-muted/40 hover:bg-muted/80 border border-border rounded-xl transition-all shadow-2xs group cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground" />
              <span>Search inventory, SKU, suppliers, or commands...</span>
            </span>
            <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground bg-card border border-border rounded">
              Ctrl + K
            </kbd>
          </button>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Search Icon for tablet/mobile */}
          <button
            type="button"
            onClick={() => setIsCommandOpen(true)}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl lg:hidden cursor-pointer"
            title="Search (Ctrl+K)"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Dark / Light Theme Toggle Button */}
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>

          {/* Quick Action Dropdown (Pure Solid Blue, No Gradient) */}
          <div className="relative">
            <Button
              onClick={() => setQuickActionOpen(!quickActionOpen)}
              className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs px-3.5 rounded-xl shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Quick Action</span>
              <ChevronDown className="w-3 h-3 ml-0.5 opacity-80" />
            </Button>

            {quickActionOpen && (
              <>
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setQuickActionOpen(false)} 
                />
                <div className="absolute right-0 mt-2 w-56 bg-card rounded-xl shadow-xl border border-border py-2 z-40">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Quick Operations
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickActionOpen(false);
                      setIsNewItemModalOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted flex items-center gap-2.5"
                  >
                    <Plus className="w-4 h-4 text-primary" />
                    Add New Inventory Item
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickActionOpen(false);
                      navigate('/daily-inventory');
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted flex items-center gap-2.5"
                  >
                    <FileText className="w-4 h-4 text-emerald-500" />
                    Open Daily Inventory Sheet
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickActionOpen(false);
                      navigate('/items?tab=batches');
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-foreground hover:bg-muted flex items-center gap-2.5"
                  >
                    <Layers className="w-4 h-4 text-amber-500" />
                    View Stock Batches (FEFO)
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Notification Bell */}
          <NotificationBell />

          {/* User Profile Pill */}
          <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-border">
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
              className="p-1 text-muted-foreground hover:text-rose-500 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar Navigation (ChatGPT mechanism, smoothly collapsible) */}
        <aside className={cn(
          "bg-card border-r border-border flex-col hidden md:flex shrink-0 transition-all duration-200 ease-in-out",
          isSidebarCollapsed ? "w-16" : "w-64"
        )}>
          <SidebarNavigation 
            isCollapsed={isSidebarCollapsed} 
            onToggleCollapse={toggleSidebar}
            onOpenSearch={() => setIsCommandOpen(true)}
            onOpenNewSheet={() => navigate('/daily-inventory')}
          />
        </aside>

        {/* Mobile Drawer Navigation */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div 
              className="fixed inset-0 bg-black/60 backdrop-blur-xs" 
              onClick={() => setMobileMenuOpen(false)} 
            />
            <div className="relative flex w-72 max-w-xs flex-col bg-card border-r border-border">
              <div className="h-16 flex items-center px-4 border-b border-border justify-between">
                <span className="font-bold text-sm uppercase tracking-wider text-foreground">Navigation Menu</span>
                <Button 
                  variant="ghost" 
                  className="p-1.5 h-8 w-8 text-muted-foreground hover:text-foreground" 
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
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

        {/* Main Content Area */}
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
                location.pathname === '/items' ? "text-primary font-bold" : "text-muted-foreground"
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
              className="flex flex-col items-center justify-center w-16 h-full gap-1 text-muted-foreground hover:text-foreground"
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
