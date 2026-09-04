import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { LogOut, Package, FileText, Menu, X, Users, Tags, LayoutDashboard, History, FileBarChart, AlertTriangle, Archive, Settings, User as UserIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/context/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/features/inventory/components/NotificationBell';

const primaryNav = [
  { name: 'Dashboard', to: '/inventory', icon: LayoutDashboard },
  { name: 'Daily Inventory', to: '/daily-inventory', icon: FileText },
  { name: 'Inventory Items', to: '/items', icon: Package },
  { name: 'Stock History', to: '/history', icon: History },
  { name: 'Categories', to: '/categories', icon: Tags },
  { name: 'Reports', to: '/reports', icon: FileBarChart },
  { name: 'Notifications', to: '/notifications', icon: AlertTriangle },
  { name: 'Archive', to: '/archive', icon: Archive },
];

function SidebarContent({ closeMobileMenu }: { closeMobileMenu?: () => void }) {
  const { role } = useAuth();
  
  const systemNav = role === 'ADMIN' ? [
    { name: 'Users', to: '/admin', icon: Users },
    { name: 'Settings', to: '/settings', icon: Settings },
  ] : [];

  return (
    <>
      <div className="flex-1 overflow-y-auto flex flex-col">
        <nav className="py-4 px-3 space-y-1">
          {primaryNav.map((item) => (
            <NavLink
              key={item.name}
              to={item.to}
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-slate-800 text-primary"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-50"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </NavLink>
          ))}
          
          {systemNav.length > 0 && (
            <>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-8 mb-2 px-3">Admin Only</div>
              {systemNav.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.to}
                  onClick={closeMobileMenu}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-slate-800 text-primary"
                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-50"
                    )
                  }
                >
                  <item.icon className="h-5 w-5" />
                  {item.name}
                </NavLink>
              ))}
            </>
          )}
        </nav>
      </div>
    </>
  );
}

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobileMenu = () => setMobileMenuOpen(false);
  const { profile, user, role } = useAuth();
  const location = useLocation();

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
  }, [profile]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* Top Bar (Desktop & Mobile) */}
      <header className="h-16 shrink-0 bg-card border-b border-border flex items-center justify-between px-4 sm:px-6 z-10">
        <div className="flex items-center gap-4">
          <Button variant="ghost" className="p-2 h-9 w-9 md:hidden" onClick={() => setMobileMenuOpen(true)}>
            <Menu className="h-6 w-6 text-foreground" />
          </Button>
          <Link to="/inventory" className="flex items-center gap-3">
            <img src="/logo-icon.png" alt="KUVENTORY Logo" className="h-8 w-auto object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <span className="font-bold text-xl text-foreground tracking-tight hidden sm:block">KUVENTORY</span>
          </Link>
        </div>
        <div className="flex items-center gap-4 sm:gap-6">
          <NotificationBell />
          <div className="hidden sm:flex items-center gap-3 border-l border-border pl-6">
            <div className="flex flex-col items-end">
              <span className="text-sm font-medium text-foreground">{profile?.first_name} {profile?.last_name}</span>
              <span className="text-xs text-muted-foreground uppercase">{role}</span>
            </div>
            <div className="h-9 w-9 bg-muted rounded-full flex items-center justify-center text-muted-foreground">
              <UserIcon className="h-5 w-5" />
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-destructive ml-2" title="Logout">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="w-64 bg-slate-950 border-r border-border flex-col hidden md:flex shrink-0">
          <SidebarContent />
        </aside>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={closeMobileMenu} />
            <div className="relative flex w-64 max-w-xs flex-col bg-slate-950 text-slate-300">
              <div className="h-16 flex items-center px-4 border-b border-slate-800 justify-between">
                <span className="font-bold text-lg text-white">Menu</span>
                <Button variant="ghost" className="p-2 h-9 w-9 text-slate-400 hover:text-white" onClick={closeMobileMenu}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <SidebarContent closeMobileMenu={closeMobileMenu} />
              <div className="p-4 border-t border-slate-800">
                <Button variant="outline" className="w-full justify-start text-red-400 hover:bg-red-950/30 border-slate-700 bg-transparent hover:text-red-300" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 flex flex-col min-w-0 h-full relative bg-slate-50/50 dark:bg-background">
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-20 md:pb-6">
            <Outlet />
          </div>
          
          {/* Mobile Bottom Nav */}
          <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex items-center justify-around px-2 z-40">
            <Link to="/inventory" className={cn("flex flex-col items-center justify-center w-16 h-full gap-1", location.pathname === '/inventory' ? "text-primary" : "text-muted-foreground")}>
              <LayoutDashboard className="w-5 h-5" />
              <span className="text-[10px] font-medium">Dash</span>
            </Link>
            <Link to="/items" className={cn("flex flex-col items-center justify-center w-16 h-full gap-1", location.pathname === '/items' ? "text-primary" : "text-muted-foreground")}>
              <Package className="w-5 h-5" />
              <span className="text-[10px] font-medium">Items</span>
            </Link>
            <Link to="/reports" className={cn("flex flex-col items-center justify-center w-16 h-full gap-1", location.pathname.startsWith('/reports') ? "text-primary" : "text-muted-foreground")}>
              <FileBarChart className="w-5 h-5" />
              <span className="text-[10px] font-medium">Reports</span>
            </Link>
            <button onClick={() => setMobileMenuOpen(true)} className="flex flex-col items-center justify-center w-16 h-full gap-1 text-muted-foreground">
              <Menu className="w-5 h-5" />
              <span className="text-[10px] font-medium">Menu</span>
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}
