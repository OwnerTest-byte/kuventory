import { useState, useEffect, useRef, memo } from 'react';
import type { DailyInventoryItem } from '../types';
import { useUpsertDailyItem } from '../hooks/useDailyInventory';
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { AddStockModal } from './AddStockModal';

interface InventoryRowProps {
  item: DailyInventoryItem;
  isReadOnly: boolean;
  date: string;
}

export const InventoryRow = memo(function InventoryRow({ item, isReadOnly, date }: InventoryRowProps) {
  const [beg, setBeg] = useState(item.beg.toString());
  const [am, setAm] = useState(item.am.toString());
  const [pm, setPm] = useState(item.pm.toString());
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  const mutation = useUpsertDailyItem(date);
  
  // To prevent debouncing the initial load
  const isInitialMount = useRef(true);

  // Sync internal state if server state changes significantly (e.g. after a refresh)
  useEffect(() => {
    if (parseFloat(beg) !== item.beg) setBeg(item.beg.toString());
    if (parseFloat(am) !== item.am) setAm(item.am.toString());
    if (parseFloat(pm) !== item.pm) setPm(item.pm.toString());
  }, [item.beg, item.am, item.pm]);

  // Debounced auto-save effect
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    if (isReadOnly) return;

    const numBeg = parseFloat(beg) || 0;
    const numAm = parseFloat(am) || 0;
    const numPm = parseFloat(pm) || 0;

    // Only save if different from prop
    if (numBeg === item.beg && numAm === item.am && numPm === item.pm) {
      return;
    }

    setSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await mutation.mutateAsync({
          id: item.id,
          beg: numBeg,
          am: numAm,
          pm: numPm
        });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (e) {
        setSaveStatus('error');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [beg, am, pm, isReadOnly, item, mutation]);

  const inputClass = `w-full text-center p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${isReadOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white'}`;

  // Optimistic calculation for visual feedback while debouncing
  const optTotal = (parseFloat(beg) || 0) + item.add;
  const optEnding = optTotal - (parseFloat(am) || 0) - (parseFloat(pm) || 0);

  return (
    <>
      {/* DESKTOP VIEW */}
      <tr className="hidden md:table-row hover:bg-slate-50 group border-b border-slate-100 last:border-0">
        <td className="p-3 align-middle">
          <div className="font-medium text-slate-800">{item.inventory_items?.name}</div>
          <div className="text-xs text-slate-500">{item.inventory_items?.unit}</div>
        </td>
        <td className="p-2">
          <input 
            type="number" 
            min="0"
            step="0.01"
            value={beg} 
            onChange={e => setBeg(e.target.value)}
            disabled={isReadOnly}
            className={inputClass}
          />
        </td>
        <td className="p-2 relative">
          <div 
            onClick={() => !isReadOnly && setIsModalOpen(true)}
            className={`w-full text-center p-2 border rounded flex items-center justify-center ${
              isReadOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white cursor-pointer hover:border-indigo-500 hover:text-indigo-600'
            }`}
            title={isReadOnly ? "" : "Click to add stock"}
          >
            {item.add}
          </div>
        </td>
        <td className="p-2 bg-slate-100 font-bold text-center text-slate-700">
          {optTotal}
        </td>
        <td className="p-2">
          <input 
            type="number" 
            min="0"
            step="0.01"
            value={am} 
            onChange={e => setAm(e.target.value)}
            disabled={isReadOnly}
            className={inputClass}
          />
        </td>
        <td className="p-2">
          <input 
            type="number" 
            min="0"
            step="0.01"
            value={pm} 
            onChange={e => setPm(e.target.value)}
            disabled={isReadOnly}
            className={inputClass}
          />
        </td>
        <td className={`p-2 bg-slate-100 font-bold text-center ${optEnding < 0 ? 'text-red-600' : 'text-slate-700'}`}>
          {optEnding}
        </td>
        <td className="p-2 text-center align-middle">
          {saveStatus === 'saving' && <Loader2 className="w-4 h-4 animate-spin text-slate-400 inline" />}
          {saveStatus === 'saved' && <CheckCircle2 className="w-4 h-4 text-green-500 inline" />}
          {saveStatus === 'error' && <div title="Failed to save" className="inline-block"><AlertCircle className="w-4 h-4 text-red-500 inline" /></div>}
        </td>
      </tr>

      {/* MOBILE VIEW */}
      <tr className="md:hidden border-b border-slate-200 last:border-0">
        <td colSpan={8} className="p-4 bg-white">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="font-bold text-slate-800 text-lg">{item.inventory_items?.name}</div>
              <div className="text-sm text-slate-500">{item.inventory_items?.unit}</div>
            </div>
            <div className="h-6 w-6 flex items-center justify-center">
              {saveStatus === 'saving' && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
              {saveStatus === 'saved' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
              {saveStatus === 'error' && <div title="Failed to save"><AlertCircle className="w-5 h-5 text-red-500" /></div>}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 tracking-wider">BEG</label>
              <input 
                type="number" 
                min="0"
                step="0.01"
                value={beg} 
                onChange={e => setBeg(e.target.value)}
                disabled={isReadOnly}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 tracking-wider">ADD</label>
              <div 
                onClick={() => !isReadOnly && setIsModalOpen(true)}
                className={`w-full text-center p-2 border rounded flex items-center justify-center h-[42px] ${
                  isReadOnly ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : 'bg-white cursor-pointer hover:border-indigo-500 hover:text-indigo-600'
                }`}
              >
                {item.add}
              </div>
            </div>
          </div>

          <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-md mb-4 flex justify-between items-center">
            <span className="text-xs font-bold text-indigo-800 tracking-wider">TOTAL AVAILABLE</span>
            <span className="font-bold text-lg text-indigo-900">{optTotal}</span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 tracking-wider">AM (-)</label>
              <input 
                type="number" 
                min="0"
                step="0.01"
                value={am} 
                onChange={e => setAm(e.target.value)}
                disabled={isReadOnly}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1 tracking-wider">PM (-)</label>
              <input 
                type="number" 
                min="0"
                step="0.01"
                value={pm} 
                onChange={e => setPm(e.target.value)}
                disabled={isReadOnly}
                className={inputClass}
              />
            </div>
          </div>

          <div className={`p-3 rounded-md border flex justify-between items-center ${optEnding < 0 ? 'bg-red-50 border-red-200 text-red-700' : 'bg-slate-100 border-slate-200 text-slate-800'}`}>
            <span className="text-xs font-bold tracking-wider">ENDING INVENTORY</span>
            <span className="font-bold text-xl">{optEnding}</span>
          </div>
        </td>
      </tr>

      <AddStockModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        item={item}
        date={date}
      />
    </>
  );
});
