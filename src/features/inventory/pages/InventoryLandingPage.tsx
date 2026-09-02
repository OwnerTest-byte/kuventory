import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getInventory } from '../api';
import { Package, AlertTriangle, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

export function InventoryLandingPage() {
  const { data: items, isLoading } = useQuery({
    queryKey: ['inventory'],
    queryFn: getInventory
  });

  const today = format(new Date(), 'MMM dd, yyyy');

  const warnings = items?.filter(item => 
    item.total_quantity <= item.min_quantity
  ) || [];

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Inventory Overview</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage daily stock and monitor inventory levels.</p>
      </header>

      {/* Primary Action */}
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
        <div className="space-y-2 text-center md:text-left">
          <h2 className="text-xl font-bold text-blue-900 dark:text-blue-100">Today's Inventory</h2>
          <p className="text-blue-700/80 dark:text-blue-300/80 font-medium">{today}</p>
        </div>
        <Link 
          to="/daily-inventory" 
          className="w-full md:w-auto inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-semibold h-12 px-8 rounded-lg shadow transition-colors"
        >
          Open Today's Inventory
          <ArrowRight className="ml-2 w-5 h-5" />
        </Link>
      </div>

      {/* Warnings & Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4 text-amber-600 dark:text-amber-500">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-semibold text-lg">Low Stock Alerts</h3>
          </div>
          
          {isLoading ? (
             <div className="text-slate-500 text-sm">Checking stock levels...</div>
          ) : warnings.length === 0 ? (
            <div className="text-slate-500 text-sm flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-green-500" />
               All stock levels are optimal.
            </div>
          ) : (
            <ul className="space-y-3">
              {warnings.map(w => (
                <li key={w.id} className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-800 last:border-0 pb-2 last:pb-0">
                  <span className="font-medium text-slate-700 dark:text-slate-300">{w.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-red-600 dark:text-red-400 font-bold">{w.total_quantity}</span>
                    <span className="text-slate-400 text-xs">/ min {w.min_quantity}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
           <div className="flex items-center gap-3 mb-4 text-slate-700 dark:text-slate-300">
            <Package className="w-5 h-5" />
            <h3 className="font-semibold text-lg">System Status</h3>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Total Active Items</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">{items?.length || 0}</span>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
}
