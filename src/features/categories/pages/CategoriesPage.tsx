import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Archive, Loader2, Tags } from 'lucide-react';
import type { Database } from '@/types/supabase';

type Category = Database['public']['Tables']['categories']['Row'];

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data: categories, isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('name');
      if (error) throw error;
      return data as Category[];
    }
  });

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('categories').insert({ name });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsAdding(false);
      setNewCatName('');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string, name: string }) => {
      const { error } = await supabase.from('categories').update({ name }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setEditingId(null);
    }
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    addMutation.mutate(newCatName.trim());
  };

  const handleEditSave = (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!editName.trim()) return;
    updateMutation.mutate({ id, name: editName.trim() });
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6 animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Tags className="w-8 h-8 text-blue-500" />
            Categories
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage inventory categories and groupings.</p>
        </div>
        
        <Button onClick={() => setIsAdding(true)} disabled={isAdding}>
          <Plus className="w-4 h-4 mr-2" /> Add Category
        </Button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        {isAdding && (
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <form onSubmit={handleAdd} className="flex items-center gap-3">
              <input
                autoFocus
                type="text"
                placeholder="Category Name (e.g. PORTION STOCK)"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                className="flex-1 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded shadow-sm px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <Button type="submit" disabled={!newCatName.trim() || addMutation.isPending}>
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
            </form>
          </div>
        )}

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {isLoading ? (
            <div className="p-8 text-center text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            </div>
          ) : categories?.length === 0 ? (
            <div className="p-8 text-center text-slate-500">No categories found.</div>
          ) : (
            categories?.map(cat => (
              <div key={cat.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                {editingId === cat.id ? (
                  <form onSubmit={(e) => handleEditSave(e, cat.id)} className="flex items-center gap-3 w-full">
                    <input
                      autoFocus
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 rounded shadow-sm px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                    <Button type="submit" disabled={!editName.trim() || updateMutation.isPending}>
                      {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </form>
                ) : (
                  <>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingId(cat.id); setEditName(cat.name); }}>
                        <Edit2 className="w-4 h-4 text-slate-500" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Archive not implemented" disabled>
                        <Archive className="w-4 h-4 text-slate-400" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
