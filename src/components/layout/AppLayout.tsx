import { useState, useEffect } from 'react';
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom';
import { LogOut, Package, FileText, Menu, X, Users, Tags, ArrowLeftRight, Bell, LayoutDashboard } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/context/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/features/inventory/components/NotificationBell';

const primaryNav = [
  { name: 'Dashboard', to: '/inventory', icon: LayoutDashboard },
  { name: 'Daily Inventory', to: '/daily-inventory', icon: FileText },
  { name: 'Items Catalog', to: '/items', icon: Package },
  { name: 'Stock Mgt', to: '/stock', icon: ArrowLeftRight },
  { name: 'Categories', to: '/categories', icon: Tags },
  { name: 'Reports', to: '/reports', icon: FileText },
  { name: 'Notifications', to: '/notifications', icon: Bell },
];

function SidebarContent({ closeMobileMenu }: { closeMobileMenu?: () => void }) {
  const { role, profile } = useAuth();
  
  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const adminNav = role === 'ADMIN' ? [
    { name: 'Users & Visitors', to: '/admin', icon: Users },
  ] : [];

  return (
    <>
      <div className="h-16 flex items-center px-6 border-b border-slate-800">
        <Link to="/inventory" onClick={closeMobileMenu} className="flex items-center gap-2">
          <img src="/logo-transparent.png" alt="KUVENTORY Logo" className="h-8 w-auto object-contain brightness-0 invert" />
          <span className="font-bold text-lg text-white tracking-tight">KUVENTORY</span>
        </Link>
      </div>
      
      <div className="flex-1 overflow-y-auto flex flex-col">
        <nav className="py-4 px-3 space-y-1">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-3">Main</div>
          {primaryNav.map((item) => (
            <NavLink
              key={item.name}
              to={item.to}
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-slate-800 text-blue-400"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-50"
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </NavLink>
          ))}
          
          {adminNav.length > 0 && (
            <>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-6 mb-2 px-3">Administration</div>
              {adminNav.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.to}
                  onClick={closeMobileMenu}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                      isActive
                        ? "bg-slate-800 text-blue-400"
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

      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {profile?.first_name} {profile?.last_name}
            </p>
            <p className="text-xs text-slate-400 truncate">
              {role}
            </p>
          </div>
          <div className="hidden md:block">
            <NotificationBell placement="top-left" />
          </div>
        </div>
        <Button data-testid="logout-button" variant="outline" className="w-full justify-start text-red-400 hover:bg-red-950/30 border-slate-700 bg-transparent hover:text-red-300" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </>
  );
}

export function AppLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeMobileMenu = () => setMobileMenuOpen(false);
  const { profile, user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    // Log visit once per session
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

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      
      {/* Desktop Sidebar */}
      <aside className="w-64 bg-slate-950 border-r border-slate-800 flex-col hidden md:flex shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={closeMobileMenu} />
          <div className="relative flex w-64 max-w-xs flex-col bg-slate-950 text-slate-300">
            <Button variant="ghost" className="absolute right-2 top-2 p-2 h-9 w-9 text-slate-400" onClick={closeMobileMenu}>
              <X className="h-5 w-5" />
            </Button>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 h-full">
        {/* Mobile Header */}
        <header className="h-16 shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 md:hidden">
           <div className="flex items-center gap-2">
             <Button variant="ghost" className="p-2 h-9 w-9" onClick={() => setMobileMenuOpen(true)}>
               <Menu className="h-6 w-6 text-slate-700 dark:text-slate-300" />
             </Button>
             <img src="/logo-transparent.png" alt="KUVENTORY Logo" className="h-7 w-auto object-contain" />
             <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">KUVENTORY</span>
           </div>
           <div className="flex items-center gap-2">
             <NotificationBell />
           </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 relative pb-16 md:pb-0">
          <Outlet />
        </div>
        
        {/* Mobile Bottom Nav */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-around px-2 z-40">
          <Link to="/inventory" className={cn("flex flex-col items-center justify-center w-16 h-full gap-1", location.pathname === '/inventory' ? "text-blue-600 dark:text-blue-400" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200")}>
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[10px] font-medium">Dashboard</span>
          </Link>
          <Link to="/items" className={cn("flex flex-col items-center justify-center w-16 h-full gap-1", location.pathname === '/items' ? "text-blue-600 dark:text-blue-400" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200")}>
            <Package className="w-5 h-5" />
            <span className="text-[10px] font-medium">Inventory</span>
          </Link>
          <Link to="/reports" className={cn("flex flex-col items-center justify-center w-16 h-full gap-1", location.pathname === '/reports' ? "text-blue-600 dark:text-blue-400" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200")}>
            <FileText className="w-5 h-5" />
            <span className="text-[10px] font-medium">Reports</span>
          </Link>
          <button onClick={() => setMobileMenuOpen(true)} className="flex flex-col items-center justify-center w-16 h-full gap-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200">
            <Menu className="w-5 h-5" />
            <span className="text-[10px] font-medium">Menu</span>
          </button>
        </div>
      </main>
      
    </div>
  );
}
