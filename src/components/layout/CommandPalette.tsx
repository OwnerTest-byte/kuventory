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
    { label: 'Global Stock Batches (FEFO)', path: '/stock', icon: Tags, category: 'Navigation' },
    { label: 'Stock Movement History', path: '/history', icon: History, category: 'Navigation' },
    { label: 'Item Categories', path: '/categories', icon: Tags, category: 'Navigation' },
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
      <DialogContent className="sm:max-w-xl p-0 overflow-hidden border border-slate-200 shadow-2xl rounded-xl">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200 bg-white">
          <Search className="w-5 h-5 text-slate-400 shrink-0 mr-3" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, page, or search items..."
            className="w-full bg-transparent text-sm text-slate-800 placeholder-slate-400 outline-none"
            autoFocus
          />
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-500 bg-slate-100 border border-slate-200 rounded">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-3 bg-slate-50/50">
          {/* Action Shortcuts */}
          {query.trim() === '' && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Quick Actions
              </div>
              <div className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => {
                    handleSelectPath('/daily-inventory');
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                >
                  <span className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    Open Today's Daily Inventory Sheet
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
                {onOpenNewItem && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenNewItem();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <Plus className="w-4 h-4 text-blue-600" />
                      Add New Inventory Item
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Matched Inventory Items */}
          {filteredItems.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Inventory Items
              </div>
              <div className="space-y-0.5">
                {filteredItems.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectPath(`/items/${item.id}`)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-left hover:bg-white hover:shadow-xs transition-all border border-transparent hover:border-slate-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900">{item.item_name}</div>
                        <div className="text-xs text-slate-500">SKU: {item.item_code} • {item.category_name || 'Item'}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-800 font-mono text-sm">{item.current_qty}</span>
                      <span className="text-xs text-slate-500 ml-1">{item.unit}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Navigation Pages */}
          {filteredLinks.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                System Pages
              </div>
              <div className="space-y-0.5">
                {filteredLinks.map(link => (
                  <button
                    key={link.path + link.label}
                    type="button"
                    onClick={() => handleSelectPath(link.path)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-white hover:shadow-xs transition-all border border-transparent hover:border-slate-200"
                  >
                    <div className="flex items-center gap-2.5">
                      <link.icon className="w-4 h-4 text-slate-500" />
                      <span className="font-medium text-slate-800">{link.label}</span>
                    </div>
                    <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                      {link.category}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {filteredItems.length === 0 && filteredLinks.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">
              No results found for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-slate-100/70 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>Navigate: <strong className="text-slate-700">↑↓</strong></span>
            <span>Select: <strong className="text-slate-700">Enter</strong></span>
          </div>
          <span>KUVENTORY Enterprise</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
