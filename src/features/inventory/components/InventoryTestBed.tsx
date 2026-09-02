import { useState } from 'react';
import { useAuth } from '../../auth/context/AuthContext';
import { useInventory, useStockHistory } from '../hooks/useInventory';
import { useStockMutations } from '../hooks/useStockMutations';
import { Button } from '@/components/ui/Button';

export function InventoryTestBed() {
  const { user } = useAuth();
  const { data: inventory, isLoading } = useInventory();
  const { data: history } = useStockHistory();
  const mutations = useStockMutations();

  const [addQty, setAddQty] = useState('10');
  const [removeQty, setRemoveQty] = useState('5');
  const [errorMsg, setErrorMsg] = useState('');

  if (isLoading) return <div>Loading inventory...</div>;

  const item = inventory?.[0]; // We just pick the first item to test with

  if (!item) return <div>No inventory items found. Please run seed.sql.</div>;

  const handleAdd = async () => {
    try {
      setErrorMsg('');
      await mutations.add.mutateAsync({
        itemId: item.id,
        quantity: Number(addQty),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        receivedDate: new Date().toISOString().split('T')[0],
        userId: user!.id,
        reason: 'Test addition'
      });
    } catch (e: any) {
      setErrorMsg(e.message || 'Error adding stock');
    }
  };

  const handleRemove = async () => {
    try {
      setErrorMsg('');
      await mutations.remove.mutateAsync({
        itemId: item.id,
        quantity: Number(removeQty),
        userId: user!.id,
        reason: 'Test removal'
      });
    } catch (e: any) {
      setErrorMsg(e.message || 'Error removing stock');
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Phase 04: Inventory Engine Test Bed</h1>
      
      {errorMsg && (
        <div className="p-4 bg-red-100 text-red-700 rounded border border-red-300">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-2 gap-8">
        {/* Operations Panel */}
        <div className="bg-white p-6 rounded shadow border border-slate-200">
          <h2 className="text-lg font-semibold mb-4">Target Item: {item.name}</h2>
          <div className="text-3xl font-bold text-slate-800 mb-6">
            Current Stock: {item.total_quantity} {item.unit}
          </div>

          <div className="space-y-4">
            <div className="flex gap-2 items-center">
              <input 
                type="number" 
                value={addQty} 
                onChange={e => setAddQty(e.target.value)}
                className="border p-2 rounded w-24"
              />
              <Button onClick={handleAdd} disabled={mutations.add.isPending}>Add Stock</Button>
            </div>

            <div className="flex gap-2 items-center">
              <input 
                type="number" 
                value={removeQty} 
                onChange={e => setRemoveQty(e.target.value)}
                className="border p-2 rounded w-24"
              />
              <Button variant="destructive" onClick={handleRemove} disabled={mutations.remove.isPending}>Remove Stock (FEFO)</Button>
            </div>
          </div>
        </div>

        {/* History Panel */}
        <div className="bg-white p-6 rounded shadow border border-slate-200">
          <h2 className="text-lg font-semibold mb-4">Recent Movements</h2>
          <div className="space-y-2 h-64 overflow-y-auto">
            {history?.map(h => (
              <div key={h.movement_id} className="text-sm p-2 border-b flex justify-between">
                <div>
                  <span className={`font-bold ${h.type === 'ADD' ? 'text-green-600' : h.type === 'REMOVE' ? 'text-red-600' : 'text-orange-600'}`}>
                    {h.type}
                  </span>
                  {' '} {Math.abs(h.quantity_change)} {h.unit}
                </div>
                <div className="text-slate-500 text-xs">
                  {new Date(h.created_at).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
