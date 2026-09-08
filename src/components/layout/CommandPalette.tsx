import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { 
  Search, 
  LayoutDashboard, 
  FileText, 
  Package, 
  History, 
  Tags, 
  FileBarChart, 
  AlertTriangle, 
  Users, 
  Settings, 
  ArrowRight, 
  Plus
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getInventory } from '@/features/inventory/api';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenNewItem?: () => void;
}

export function CommandPalette({ isOpen, onClose, onOpenNewItem }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const { data: items = [] } = useQuery({
    queryKey: ['inventory'],
    queryFn: getInventory,
    enabled: isOpen,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Parent handles opening, but let's allow toggling
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const navLinks = [
    { label: 'Dashboard', path: '/inventory', icon: LayoutDashboard, category: 'Navigation' },
    { label: 'Daily Inventory Worksheet', path: '/daily-inventory', icon: FileText, category: 'Navigation' },
    { label: 'Inventory Items Catalog', path: '/items', icon: Package, category: 'Navigation' },
    { label: 'Global Stock Batches (FEFO)', path: '/items?tab=batches', icon: Tags, category: 'Navigation' },
    { label: 'Stock Movement History', path: '/items?tab=history', icon: History, category: 'Navigation' },
    { label: 'Item Categories', path: '/items?tab=categories', icon: Tags, category: 'Navigation' },
    { label: 'Reports Library', path: '/reports', icon: FileBarChart, category: 'Reports' },
    { label: 'Daily Reports', path: '/reports/inventory', icon: FileBarChart, category: 'Reports' },
    { label: 'Stock Movement Reports', path: '/reports/movement', icon: FileBarChart, category: 'Reports' },
    { label: 'Low Stock Alerts Report', path: '/reports/low-stock', icon: AlertTriangle, category: 'Reports' },
    { label: 'Expiry & FEFO Report', path: '/reports/expiry', icon: AlertTriangle, category: 'Reports' },
    { label: 'System Users', path: '/admin', icon: Users, category: 'System' },
    { label: 'System Settings', path: '/settings', icon: Settings, category: 'System' },
  ];

  const filteredLinks = navLinks.filter(l => 
    l.label.toLowerCase().includes(query.toLowerCase())
  );

  const filteredItems = items
    .filter(i => 
      !i.is_archived && 
      (i.item_name.toLowerCase().includes(query.toLowerCase()) || 
       i.item_code.toLowerCase().includes(query.toLowerCase()))
    )
    .slice(0, 6);

  const handleSelectPath = (path: string) => {
    navigate(path);
    onClose();
    setQuery('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden border border-border bg-card shadow-2xl rounded-xl text-foreground">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-border bg-card">
          <Search className="w-5 h-5 text-muted-foreground shrink-0 mr-3" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, page, or search items..."
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            autoFocus
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-semibold text-muted-foreground bg-muted border border-border rounded">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-3 bg-muted/20">
          {/* Action Shortcuts */}
          {query.trim() === '' && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Quick Actions
              </div>
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    handleSelectPath('/daily-inventory');
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-muted hover:text-primary transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-emerald-500" />
                    Open Today's Daily Inventory Sheet
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </button>
                {onOpenNewItem && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenNewItem();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-muted hover:text-primary transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Plus className="w-4 h-4 text-primary" />
                      Add New Inventory Item
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Matched Inventory Items */}
          {filteredItems.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Inventory Items
              </div>
              <div className="space-y-0.5">
                {filteredItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectPath(`/items/${item.id}`)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left hover:bg-card hover:shadow-xs transition-all border border-transparent hover:border-border"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-muted-foreground font-bold text-xs">
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">{item.item_name}</div>
                        <div className="text-xs text-muted-foreground">SKU: {item.item_code} • {item.category_name || 'Item'}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-foreground font-mono text-sm">{item.current_qty}</span>
                      <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Navigation Pages */}
          {filteredLinks.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                System Pages
              </div>
              <div className="space-y-0.5">
                {filteredLinks.map(link => (
                  <button
                    key={link.path + link.label}
                    type="button"
                    onClick={() => handleSelectPath(link.path)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-foreground hover:bg-card hover:shadow-xs transition-all border border-transparent hover:border-border"
                  >
                    <div className="flex items-center gap-2.5">
                      <link.icon className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-foreground">{link.label}</span>
                    </div>
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                      {link.category}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredItems.length === 0 && filteredLinks.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-muted/40 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>Navigate: <strong className="text-foreground">↑↓</strong></span>
            <span>Select: <strong className="text-foreground">Enter</strong></span>
          </div>
          <span>KUVENTORY</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
