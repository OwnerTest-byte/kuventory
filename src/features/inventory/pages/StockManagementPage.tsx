import { useState, useEffect } from 'react';
import { getInventory, getBatches } from '../api';
import type { InventoryStock, StockBatch } from '../types';
import { Button } from '@/components/ui/Button';
import { Plus, LogOut, ArrowRight, AlertTriangle, Package, Loader2 } from 'lucide-react';
import { AddBatchModal } from '../components/AddBatchModal';
import { ConsumeStockModal } from '../components/ConsumeStockModal';

export function StockManagementPage() {
  const [items, setItems] = useState<InventoryStock[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryStock | null>(null);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isConsumeModalOpen, setIsConsumeModalOpen] = useState(false);

  const fetchItems = async () => {
    try {
      const data = await getInventory();
      setItems(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBatches = async (itemId: string) => {
    try {
      const data = await getBatches(itemId);
      setBatches(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  useEffect(() => {
    if (selectedItem) {
      fetchBatches(selectedItem.id);
    } else {
      setBatches([]);
    }
  }, [selectedItem]);

  const handleBatchAdded = () => {
    fetchItems();
    if (selectedItem) fetchBatches(selectedItem.id);
  };

  const handleStockConsumed = () => {
    fetchItems();
    if (selectedItem) fetchBatches(selectedItem.id);
  };

  const isExpired = (expiryDate: string | null) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  const isExpiringSoon = (expiryDate: string | null) => {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diffTime = Math.abs(expiry.getTime() - now.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return !isExpired(expiryDate) && diffDays <= 30;
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in h-[calc(100vh-2rem)] md:h-auto flex flex-col">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Package className="w-8 h-8 text-blue-500" />
            Stock Management
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage physical inventory batches and apply FEFO rules.</p>
        </div>
      </header>

      <div className="flex flex-col md:flex-row h-full gap-6 overflow-hidden md:h-[600px]">
        {/* Items List */}
        <div className="w-full md:w-1/3 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="bg-slate-50 dark:bg-slate-900 px-4 py-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-widest">Select Item</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex items-center justify-center p-8 text-slate-500"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (
              items.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`w-full text-left p-3 rounded-lg mb-1 transition-colors ${
                    selectedItem?.id === item.id 
                      ? 'bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100 ring-1 ring-blue-200 dark:ring-blue-800' 
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium truncate pr-2">{item.name}</span>
                    <span className={`text-xs px-2 py-1 rounded font-medium whitespace-nowrap ${
                      selectedItem?.id === item.id 
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' 
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {item.total_quantity} {item.unit}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Batches View */}
        <div className="w-full md:w-2/3 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
          {selectedItem ? (
            <>
              <div className="bg-slate-50 dark:bg-slate-900 p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center flex-wrap gap-4 shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">{selectedItem.name} Batches</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Total Valid Stock: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedItem.total_quantity} {selectedItem.unit}</span></p>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                  <Button variant="outline" className="flex-1 md:flex-none bg-white dark:bg-slate-900" onClick={() => setIsConsumeModalOpen(true)}>
                    <LogOut className="w-4 h-4 mr-2" /> Consume
                  </Button>
                  <Button className="flex-1 md:flex-none" onClick={() => setIsAddModalOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Add Batch
                  </Button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                {batches.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-slate-500 h-full">
                    <Package className="w-12 h-12 mb-4 opacity-20" />
                    <p>No stock batches found.</p>
                  </div>
                ) : (
                  <>
                    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">FEFO Priority</div>
                    {batches.map((batch, index) => {
                      const expired = isExpired(batch.expiry_date);
                      const soon = isExpiringSoon(batch.expiry_date);
                      const isValid = !expired;
                      
                      // The first valid batch is NEXT OUT
                      const isNextOut = isValid && index === batches.findIndex(b => !isExpired(b.expiry_date));

                      return (
                        <div 
                          key={batch.id} 
                          className={`p-4 rounded-xl border relative transition-colors ${
                            expired ? 'border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900/50' :
                            soon ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900/50' :
                            isNextOut ? 'border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900/50' :
                            'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 mb-3">
                            <div className="flex flex-wrap items-center gap-2">
                              {isNextOut && (
                                <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400 text-xs px-2 py-1 rounded-md font-bold flex items-center gap-1 shadow-sm">
                                  <ArrowRight className="w-3 h-3" /> NEXT OUT
                                </span>
                              )}
                              {expired && (
                                <span className="bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400 text-xs px-2 py-1 rounded-md font-bold flex items-center gap-1 shadow-sm">
                                  <AlertTriangle className="w-3 h-3" /> EXPIRED
                                </span>
                              )}
                              {soon && (
                                <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 text-xs px-2 py-1 rounded-md font-bold flex items-center gap-1 shadow-sm">
                                  <AlertTriangle className="w-3 h-3" /> EXPIRING SOON
                                </span>
                              )}
                              <span className="font-mono text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                {batch.id.substring(0, 8)}
                              </span>
                            </div>
                            <div className="font-bold text-2xl text-slate-900 dark:text-white">
                              {batch.quantity} <span className="text-sm text-slate-500 font-normal">{selectedItem.unit}</span>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 text-sm mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/50">
                            <div>
                              <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Expiry Date</div>
                              <div className={`font-medium ${expired ? 'text-red-600 dark:text-red-400' : soon ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                {batch.expiry_date || 'No Expiry'}
                              </div>
                            </div>
                            <div>
                              <div className="text-slate-500 text-xs uppercase tracking-wider mb-1">Received Date</div>
                              <div className="font-medium text-slate-700 dark:text-slate-300">{batch.received_date}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>

              {isAddModalOpen && (
                <AddBatchModal 
                  item={selectedItem} 
                  onClose={() => setIsAddModalOpen(false)} 
                  onSuccess={handleBatchAdded} 
                />
              )}
              
              {isConsumeModalOpen && (
                <ConsumeStockModal 
                  item={selectedItem} 
                  onClose={() => setIsConsumeModalOpen(false)} 
                  onSuccess={handleStockConsumed} 
                />
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              <div className="text-center">
                <ArrowRight className="w-8 h-8 mx-auto mb-4 opacity-20 hidden md:block" />
                <p>Select an item from the list to view its batches</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
