import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LogOut, 
  Package, 
  FileText, 
  Menu, 
  X, 
  Users, 
  LayoutDashboard, 
  FileBarChart, 
  Settings, 
  User as UserIcon,
  Search,
  Plus,
  Layers,
  ChevronDown
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/context/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/features/inventory/components/NotificationBell';
import { CommandPalette } from './CommandPalette';
import { ItemFormModal } from '@/features/inventory/components/ItemFormModal';
import { useItems } from '@/features/inventory/hooks/useItems';
import { useStockMutations } from '@/features/inventory/hooks/useStockMutations';
import type { InventoryItem } from '@/features/inventory/types';

const coreNav = [
  { name: 'Dashboard', to: '/inventory', icon: LayoutDashboard },
  { name: 'Daily Inventory', to: '/daily-inventory', icon: FileText },
  { name: 'Stock & Items', to: '/items', icon: Package },
];

const reportsNav = [
  { name: 'Reports & Exports', to: '/reports', icon: FileBarChart },
];

function SidebarNavigation({ closeMobileMenu }: { closeMobileMenu?: () => void }) {
  const { role, profile, user } = useAuth();
  const isAdmin = role === 'ADMIN';

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="flex flex-col h-full bg-[#0A0F1D] text-slate-300 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-800/80 shrink-0">
        <img 
          src="/pics/logo-icon.png" 
          alt="KUVENTORY" 
          className="h-8 w-auto object-contain" 
          onError={(e) => { e.currentTarget.style.display = 'none'; }} 
        />
        <div className="flex flex-col">
          <span className="font-bold text-lg text-white tracking-tight flex items-center gap-1.5">
            KUVENTORY
          </span>
          <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">
            Enterprise IMS
          </span>
        </div>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin">
        {/* Core Nav */}
        <div>
          <div className="px-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Operations
          </div>
          <nav className="space-y-0.5">
            {coreNav.map((item) => (
              <NavLink
                key={item.name}
                to={item.to}
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-blue-600/90 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Reports Nav */}
        <div>
          <div className="px-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Reports
          </div>
          <nav className="space-y-0.5">
            {reportsNav.map((item) => (
              <NavLink
                key={item.name}
                to={item.to}
                end={item.to === '/reports'}
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-blue-600/90 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.name}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* System Admin Nav */}
        {isAdmin && (
          <div>
            <div className="px-3 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              System Admin
            </div>
            <nav className="space-y-0.5">
              <NavLink
                to="/admin"
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-blue-600/90 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
                  )
                }
              >
                <Users className="h-4 w-4 shrink-0" />
                <span>Users & Roles</span>
              </NavLink>
              <NavLink
                to="/settings"
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                    isActive
                      ? "bg-blue-600/90 text-white font-semibold shadow-sm"
                      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
                  )
                }
              >
                <Settings className="h-4 w-4 shrink-0" />
                <span>Settings</span>
              </NavLink>
            </nav>
          </div>
        )}
      </div>

      {/* User Profile Footer Card */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 border border-slate-800/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-xs shrink-0 border border-blue-500/30">
              {profile?.first_name ? profile.first_name[0].toUpperCase() : 'U'}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-slate-100 truncate">
                {profile ? `${profile.first_name} ${profile.last_name}` : user?.email || 'User'}
              </span>
              <span className="text-[10px] text-slate-400 uppercase font-medium tracking-wide">
                {role === 'ADMIN' ? 'Administrator' : 'Staff Member'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Sign Out"
            className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
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

  const { createItem } = useItems();
  const { add } = useStockMutations();
  const { profile, user, role } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

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
    <div className="flex flex-col h-dvh min-h-dvh max-h-dvh bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* Top Header Bar */}
      <header className="h-16 shrink-0 bg-white border-b border-slate-200/90 flex items-center justify-between px-4 sm:px-6 z-20 shadow-xs">
        {/* Left Side: Menu Trigger & Location Badge */}
        <div className="flex items-center gap-3 sm:gap-6">
          <Button 
            variant="ghost" 
            className="p-1.5 h-9 w-9 md:hidden text-slate-600 hover:text-slate-900" 
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Location / Bodega Badge matching Mockup */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100/80 border border-slate-200/80">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
              <span className="hidden sm:inline">Warehouse:</span>
              <strong className="text-slate-900 uppercase tracking-tight">KUVENTORY KIOSK & BODEGA</strong>
            </div>
          </div>
        </div>

        {/* Center: Global Quick Search Button */}
        <div className="hidden lg:flex items-center max-w-md w-full mx-6">
          <button
            type="button"
            onClick={() => setIsCommandOpen(true)}
            className="w-full flex items-center justify-between px-3.5 py-1.5 text-xs text-slate-400 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg transition-all shadow-2xs group"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
              <span>Search inventory, SKU, or commands...</span>
            </span>
            <kbd className="px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 rounded">
              Ctrl + K
            </kbd>
          </button>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Quick Search Icon for tablet/mobile */}
          <button
            type="button"
            onClick={() => setIsCommandOpen(true)}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg lg:hidden"
            title="Search (Ctrl+K)"
          >
            <Search className="w-5 h-5" />
          </button>

          {/* Quick Action Dropdown */}
          <div className="relative">
            <Button
              onClick={() => setQuickActionOpen(!quickActionOpen)}
              className="h-9 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3 shadow-xs flex items-center gap-1.5"
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
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-40">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Quick Operations
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickActionOpen(false);
                      setIsNewItemModalOpen(true);
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2.5"
                  >
                    <Plus className="w-4 h-4 text-blue-600" />
                    Add New Inventory Item
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickActionOpen(false);
                      navigate('/daily-inventory');
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2.5"
                  >
                    <FileText className="w-4 h-4 text-emerald-600" />
                    Open Daily Inventory Sheet
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickActionOpen(false);
                      navigate('/items?tab=batches');
                    }}
                    className="w-full text-left px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-amber-50 hover:text-amber-700 flex items-center gap-2.5"
                  >
                    <Layers className="w-4 h-4 text-amber-600" />
                    View Stock Batches (FEFO)
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Notification Bell */}
          <NotificationBell />

          {/* User Profile Pill */}
          <div className="hidden sm:flex items-center gap-2.5 pl-3 border-l border-slate-200">
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-slate-900">
                {profile ? `${profile.first_name} ${profile.last_name}` : 'User'}
              </span>
              <span className="text-[10px] text-slate-500 uppercase font-semibold">
                {role}
              </span>
            </div>
            <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs border border-slate-200">
              <UserIcon className="w-4 h-4" />
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar Navigation */}
        <aside className="w-64 bg-[#0A0F1D] border-r border-slate-800/80 flex-col hidden md:flex shrink-0">
          <SidebarNavigation />
        </aside>

        {/* Mobile Drawer Navigation */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div 
              className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs" 
              onClick={() => setMobileMenuOpen(false)} 
            />
            <div className="relative flex w-72 max-w-xs flex-col bg-[#0A0F1D]">
              <div className="h-16 flex items-center px-4 border-b border-slate-800 justify-between">
                <span className="font-bold text-sm uppercase tracking-wider text-white">Menu Navigation</span>
                <Button 
                  variant="ghost" 
                  className="p-1.5 h-8 w-8 text-slate-400 hover:text-white" 
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <SidebarNavigation closeMobileMenu={() => setMobileMenuOpen(false)} />
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 h-full relative bg-slate-50/80 overflow-hidden">
          <div className="flex-1 overflow-y-auto pb-24 md:pb-8 overscroll-none scroll-smooth">
            <Outlet />
          </div>
          
          {/* Mobile Bottom Navigation Bar matching Mockup */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 flex items-center justify-around px-2 z-40 shadow-lg">
            <Link 
              to="/inventory" 
              className={cn(
                "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors", 
                location.pathname === '/inventory' ? "text-blue-600 font-bold" : "text-slate-500"
              )}
            >
              <LayoutDashboard className="w-5 h-5" />
              <span className="text-[10px]">Dash</span>
            </Link>
            <Link 
              to="/daily-inventory" 
              className={cn(
                "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors", 
                location.pathname === '/daily-inventory' ? "text-blue-600 font-bold" : "text-slate-500"
              )}
            >
              <FileText className="w-5 h-5" />
              <span className="text-[10px]">Daily Sheet</span>
            </Link>
            <Link 
              to="/items" 
              className={cn(
                "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors", 
                location.pathname === '/items' ? "text-blue-600 font-bold" : "text-slate-500"
              )}
            >
              <Package className="w-5 h-5" />
              <span className="text-[10px]">Items</span>
            </Link>
            <Link 
              to="/reports" 
              className={cn(
                "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors", 
                location.pathname.startsWith('/reports') ? "text-blue-600 font-bold" : "text-slate-500"
              )}
            >
              <FileBarChart className="w-5 h-5" />
              <span className="text-[10px]">Reports</span>
            </Link>
            <button 
              type="button"
              onClick={() => setMobileMenuOpen(true)} 
              className="flex flex-col items-center justify-center w-16 h-full gap-1 text-slate-500"
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
