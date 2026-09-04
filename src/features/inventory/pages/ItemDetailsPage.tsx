import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getItemById, getBatches, getStockMovementHistory, archiveItem } from '../api';
import { useItems } from '../hooks/useItems';
import { useStockMutations } from '../hooks/useStockMutations';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { 
  Package, 
  ArrowLeft, 
  Edit, 
  Archive, 
  Layers, 
  CheckCircle2, 
  AlertTriangle, 
  AlertOctagon, 
  RefreshCw,
  PlusCircle
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { StockUpdateModal } from '../components/StockUpdateModal';
import { ItemFormModal } from '../components/ItemFormModal';
import type { InventoryStock } from '../types';

export function ItemDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'overview' | 'batches' | 'history'>('overview');
  const [isUpdateStockOpen, setIsUpdateStockOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const { updateItem } = useItems();
  const { add, remove, adjust } = useStockMutations();

  // 1. Fetch Item Details
  const { data: item, isLoading: isLoadingItem, refetch: refetchItem } = useQuery({
    queryKey: ['item', id],
    queryFn: () => getItemById(id!),
    enabled: !!id,
  });

  // 2. Fetch Batches
  const { data: batches = [], isLoading: isLoadingBatches, refetch: refetchBatches } = useQuery({
    queryKey: ['batches', id],
    queryFn: () => getBatches(id!),
    enabled: !!id,
  });

  // 3. Fetch Transaction History
  const { data: history = [], isLoading: isLoadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: ['stock-history', id],
    queryFn: () => getStockMovementHistory(id!),
    enabled: !!id,
  });

  if (isLoadingItem) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
          <span className="text-sm font-medium">Loading item details...</span>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="p-8 max-w-7xl mx-auto text-center space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Item Not Found</h2>
        <p className="text-sm text-slate-500">The requested inventory item could not be located.</p>
        <Button onClick={() => navigate('/items')} variant="outline">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Catalog
        </Button>
      </div>
    );
  }

  const currentQty = Number(item.current_qty) || 0;
  const minQty = Number(item.min_qty) || 0;
  
  let statusBadge = {
    label: 'IN STOCK',
    className: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: <CheckCircle2 className="w-4 h-4 mr-1 text-emerald-600" />
  };

  if (currentQty <= 0) {
    statusBadge = {
      label: 'OUT OF STOCK',
      className: 'bg-rose-100 text-rose-800 border-rose-300',
      icon: <AlertOctagon className="w-4 h-4 mr-1 text-rose-600" />
    };
  } else if (currentQty <= minQty) {
    statusBadge = {
      label: 'LOW STOCK',
      className: 'bg-amber-100 text-amber-800 border-amber-300',
      icon: <AlertTriangle className="w-4 h-4 mr-1 text-amber-600" />
    };
  }

  const handleStockUpdateSubmit = async (data: any) => {
    try {
      if (data.action === 'add') {
        await add.mutateAsync({
          itemId: item.id,
          quantity: data.quantity,
          expiryDate: data.expiryDate,
          reason: data.reason
        });
      } else if (data.action === 'remove') {
        await remove.mutateAsync({
          itemId: item.id,
          quantity: data.quantity,
          reason: data.reason
        });
      } else if (data.action === 'adjust') {
        await adjust.mutateAsync({
          itemId: item.id,
          targetQuantity: data.quantity,
          reason: data.reason
        });
      }
      setIsUpdateStockOpen(false);
      refetchItem();
      refetchBatches();
      refetchHistory();
    } catch (err: any) {
      alert(err.message || 'Failed to update stock');
    }
  };

  const handleEditSubmit = async (formData: any) => {
    await updateItem({ id: item.id, ...formData });
    setIsEditModalOpen(false);
    refetchItem();
  };

  const handleToggleArchive = async () => {
    const confirmMsg = item.is_archived
      ? `Restore "${item.item_name}" to active inventory?`
      : `Are you sure you want to archive "${item.item_name}"?`;
    
    if (!window.confirm(confirmMsg)) return;

    setIsArchiving(true);
    try {
      await archiveItem(item.id, !item.is_archived);
      refetchItem();
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Breadcrumb matching Mockup Screen 3 */}
      <div className="flex items-center justify-between">
        <nav className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 font-medium">
          <Link to="/items" className="hover:text-blue-600 transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Inventory Items
          </Link>
          <span>/</span>
          <span className="text-slate-900 font-bold">{item.item_name}</span>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            onClick={() => setIsUpdateStockOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm shadow-xs flex items-center gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            Update Stock
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsEditModalOpen(true)}
            className="border-slate-300 text-slate-700 bg-white hover:bg-slate-50 font-semibold text-xs sm:text-sm shadow-xs flex items-center gap-1.5"
          >
            <Edit className="w-4 h-4" />
            Edit Item
          </Button>

          <Button
            variant="outline"
            onClick={handleToggleArchive}
            disabled={isArchiving}
            className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 font-semibold text-xs sm:text-sm shadow-xs flex items-center gap-1.5"
          >
            <Archive className="w-4 h-4" />
            {item.is_archived ? 'Restore' : 'Archive'}
          </Button>
        </div>
      </div>

      {/* Main Item Hero Card matching Mockup Screen 3 */}
      <Card className="bg-white border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-6 flex flex-col md:flex-row gap-6 items-start">
          {/* Left: Product Image */}
          <div className="w-full md:w-56 h-56 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center p-4 shrink-0 relative overflow-hidden">
            {item.image_path ? (
              <img 
                src={item.image_path} 
                alt={item.item_name} 
                className="max-h-full max-w-full object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement?.querySelector('.fallback-icon')?.classList.remove('hidden');
                }}
              />
            ) : null}
            <div className={`fallback-icon flex flex-col items-center justify-center text-slate-400 ${item.image_path ? 'hidden' : ''}`}>
              <Package className="w-16 h-16 text-slate-300 mb-2" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">No Image</span>
            </div>
          </div>

          {/* Right: Item Metadata & Specs */}
          <div className="flex-1 min-w-0 space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {item.item_code}
                </span>
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  {item.category_name || 'Uncategorized'}
                </span>
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                  {item.inventory_type}
                </span>
                {item.is_archived && (
                  <span className="text-xs font-bold text-slate-700 bg-slate-200 px-2 py-0.5 rounded">
                    ARCHIVED
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 uppercase">
                {item.item_name}
              </h1>
              {item.description && (
                <p className="text-sm text-slate-500 mt-1">{item.description}</p>
              )}
            </div>

            {/* Specifications Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50/70 border border-slate-200/80">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Unit Type</span>
                <span className="text-sm font-bold text-slate-800 uppercase">{item.unit}</span>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Unit Cost</span>
                <span className="text-sm font-bold text-slate-900 font-mono">
                  {item.unit_cost ? `₱${Number(item.unit_cost).toFixed(2)}` : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Supplier A</span>
                <span className="text-sm font-semibold text-slate-700 truncate block">
                  {item.supplier_a || 'None'}
                </span>
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Supplier B</span>
                <span className="text-sm font-semibold text-slate-700 truncate block">
                  {item.supplier_b || 'None'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation matching Mockup Screen 3 */}
        <div className="border-t border-slate-200 px-6 flex gap-8 bg-slate-50/50">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`py-3.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Stock Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('batches')}
            className={`py-3.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'batches'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Batches / Expiry (FEFO)
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700">
              {batches.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-3.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Stock History
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-200 text-slate-700">
              {history.length}
            </span>
          </button>
        </div>
      </Card>

      {/* Tab 1: Stock Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-white border-slate-200 shadow-xs">
              <CardContent className="p-5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Current Stock</span>
                <div className="mt-2 text-3xl font-bold font-mono text-slate-900">
                  {currentQty} <span className="text-xs font-normal text-slate-500 uppercase">{item.unit}</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">Active available count</div>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200 shadow-xs">
              <CardContent className="p-5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Minimum Threshold</span>
                <div className="mt-2 text-3xl font-bold font-mono text-slate-700">
                  {minQty} <span className="text-xs font-normal text-slate-500 uppercase">{item.unit}</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">Restock trigger limit</div>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200 shadow-xs">
              <CardContent className="p-5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Health Status</span>
                <div className="mt-2 flex items-center">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase border ${statusBadge.className}`}>
                    {statusBadge.icon}
                    {statusBadge.label}
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-500">Based on minimum quota</div>
              </CardContent>
            </Card>

            <Card className="bg-white border-slate-200 shadow-xs">
              <CardContent className="p-5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Last Updated</span>
                <div className="mt-2 text-base font-bold text-slate-800">
                  {item.updated_at ? format(new Date(item.updated_at), 'MMM dd, yyyy h:mm a') : 'N/A'}
                </div>
                <div className="mt-2 text-xs text-slate-500">Timestamp of last transaction</div>
              </CardContent>
            </Card>
          </div>

          {/* Quick FEFO advice banner */}
          <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 text-white rounded-lg">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider">FEFO Automatic Consumption Active</h4>
                <p className="text-xs text-blue-700 mt-0.5">
                  When stock is removed from this item, the system automatically pulls from the oldest expiring batch first.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setActiveTab('batches')}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs"
            >
              Inspect Batches
            </Button>
          </div>
        </div>
      )}

      {/* Tab 2: Batches / Expiry (FEFO) */}
      {activeTab === 'batches' && (
        <Card className="bg-white border-slate-200 shadow-xs">
          <CardHeader className="p-5 border-b border-slate-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Batches &amp; FEFO Allocation Queue
              </CardTitle>
              <span className="text-xs text-slate-500">Sorted by earliest expiration date</span>
            </div>
            <Button
              size="sm"
              onClick={() => setIsUpdateStockOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
            >
              <PlusCircle className="w-3.5 h-3.5 mr-1" /> Add New Batch
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[420px] overflow-y-auto overflow-x-auto relative overscroll-contain">
              <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 text-slate-500 shadow-xs">
                  <tr>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Batch Code</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Quantity</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Expiry Date</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Days Left</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">FEFO Priority</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingBatches ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-xs">
                        Loading batches...
                      </td>
                    </tr>
                  ) : batches.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400 text-xs">
                        No active stock batches recorded for this item.
                      </td>
                    </tr>
                  ) : (
                    batches.map((b, index) => {
                      const expiryDate = b.expiry_date ? new Date(b.expiry_date) : null;
                      const now = new Date();
                      const isExpired = expiryDate && expiryDate < now;
                      const daysLeft = expiryDate ? differenceInDays(expiryDate, now) : null;

                      let priorityBadge = 'bg-emerald-100 text-emerald-800';
                      let priorityText = 'NORMAL';

                      if (isExpired) {
                        priorityBadge = 'bg-rose-100 text-rose-800 font-bold';
                        priorityText = 'EXPIRED';
                      } else if (index === 0 && b.quantity > 0) {
                        priorityBadge = 'bg-rose-600 text-white font-bold animate-pulse';
                        priorityText = 'USE FIRST';
                      } else if (index === 1 && b.quantity > 0) {
                        priorityBadge = 'bg-amber-500 text-white font-bold';
                        priorityText = 'NEXT';
                      }

                      return (
                        <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-6 py-4 font-mono text-xs font-semibold text-slate-800">
                            {b.batch_code}
                          </td>
                          <td className="px-6 py-4 text-center font-mono font-bold text-slate-900">
                            {b.quantity} <span className="text-xs font-normal text-slate-500">{item.unit}</span>
                          </td>
                          <td className="px-6 py-4 text-xs font-medium text-slate-700">
                            {expiryDate ? format(expiryDate, 'MMM dd, yyyy') : 'No Expiry'}
                          </td>
                          <td className="px-6 py-4 text-center font-mono text-xs">
                            {daysLeft !== null ? (
                              <span className={isExpired ? 'text-rose-600 font-bold' : daysLeft <= 7 ? 'text-amber-600 font-bold' : 'text-slate-700'}>
                                {isExpired ? 'Expired' : `${daysLeft} days`}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${priorityBadge}`}>
                              {priorityText}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setIsUpdateStockOpen(true)}
                              className="h-7 text-xs font-semibold border-slate-300"
                            >
                              Update
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab 3: Stock History */}
      {activeTab === 'history' && (
        <Card className="bg-white border-slate-200 shadow-xs">
          <CardHeader className="p-5 border-b border-slate-100">
            <CardTitle className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Item Movement &amp; Audit Log
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[420px] overflow-y-auto overflow-x-auto relative overscroll-contain">
              <table className="w-full text-left text-sm whitespace-nowrap border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 text-slate-500 shadow-xs">
                  <tr>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Date / Time</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">User</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Action</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs text-center">Change</th>
                    <th className="px-6 py-3 font-bold uppercase tracking-wider text-xs">Reason / Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingHistory ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400 text-xs">
                        Loading transaction history...
                      </td>
                    </tr>
                  ) : history.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-slate-400 text-xs">
                        No transactions recorded for this item.
                      </td>
                    </tr>
                  ) : (
                    history.map((tx) => {
                      let badgeStyle = 'bg-slate-100 text-slate-700';
                      if (tx.action_type === 'ADD') badgeStyle = 'bg-emerald-100 text-emerald-800';
                      if (tx.action_type === 'REMOVE') badgeStyle = 'bg-rose-100 text-rose-800';
                      if (tx.action_type === 'ADJUST') badgeStyle = 'bg-blue-100 text-blue-800';

                      const prefix = tx.action_type === 'REMOVE' ? '-' : tx.action_type === 'ADD' ? '+' : '';

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-6 py-3.5 text-xs text-slate-500 font-medium">
                            {format(new Date(tx.created_at), 'MMM dd, yyyy h:mm a')}
                          </td>
                          <td className="px-6 py-3.5 text-xs font-semibold text-slate-800">
                            {tx.user_name || 'Staff User'}
                          </td>
                          <td className="px-6 py-3.5 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wide ${badgeStyle}`}>
                              {tx.action_type}
                            </span>
                          </td>
                          <td className="px-6 py-3.5 text-center font-mono text-xs font-bold text-slate-900">
                            {prefix}{Math.abs(tx.quantity)} {item.unit}
                          </td>
                          <td className="px-6 py-3.5 text-xs text-slate-600">
                            {tx.reason || 'Routine operation'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stock Update Modal */}
      {isUpdateStockOpen && (
        <StockUpdateModal
          isOpen={true}
          item={item as unknown as InventoryStock}
          batches={batches}
          onClose={() => setIsUpdateStockOpen(false)}
          onSubmit={handleStockUpdateSubmit}
        />
      )}

      {/* Edit Item Modal */}
      {isEditModalOpen && (
        <ItemFormModal
          item={item}
          isSubmitting={false}
          onClose={() => setIsEditModalOpen(false)}
          onSubmit={handleEditSubmit}
        />
      )}
    </div>
  );
}
