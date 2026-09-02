import { useState } from 'react';
import { Outlet, NavLink, Link } from 'react-router-dom';
import { LogOut, Package, FileText, Menu, X, Users, Tags, ArrowLeftRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/context/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { NotificationBell } from '@/features/inventory/components/NotificationBell';

export function AppLayout() {
  const { role, profile } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const primaryNav = [
    { name: 'Inventory', to: '/inventory', icon: Package },
    { name: 'Reports', to: '/reports', icon: FileText },
  ];

  const adminNav = role === 'ADMIN' ? [
    { name: 'Categories', to: '/categories', icon: Tags },
    { name: 'Stock Mgt', to: '/stock', icon: ArrowLeftRight },
    { name: 'Users', to: '/admin', icon: Users },
  ] : [];

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const SidebarContent = () => (
    <>
      <div className="h-16 flex items-center px-6 border-b border-slate-200 dark:border-slate-800">
        <Link to="/inventory" onClick={closeMobileMenu} className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold">K</span>
          </div>
          <span className="font-bold text-lg text-slate-900 dark:text-white">KUVENTORY</span>
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
                    ? "bg-slate-100 text-blue-600 dark:bg-slate-800 dark:text-blue-400"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-50"
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
                        ? "bg-slate-100 text-blue-600 dark:bg-slate-800 dark:text-blue-400"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-50"
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

      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-3 mb-4 px-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
              {profile?.first_name} {profile?.last_name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {role}
            </p>
          </div>
          <div className="hidden md:block">
            <NotificationBell />
          </div>
        </div>
        <Button data-testid="logout-button" variant="outline" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30" onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      
      {/* Desktop Sidebar */}
      <aside className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col hidden md:flex shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={closeMobileMenu} />
          <div className="relative flex w-64 max-w-xs flex-col bg-white dark:bg-slate-900">
            <Button variant="ghost" className="absolute right-2 top-2 p-2 h-9 w-9" onClick={closeMobileMenu}>
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
             <span className="font-bold text-lg text-slate-900 dark:text-white">KUVENTORY</span>
           </div>
           <div className="flex items-center gap-2">
             <NotificationBell />
           </div>
        </header>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 relative">
          <Outlet />
        </div>
      </main>
      
    </div>
  );
}
