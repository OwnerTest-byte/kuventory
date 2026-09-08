import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Plus, Edit2, Trash2, Loader2, Tags, AlertCircle } from 'lucide-react';
import type { Database } from '@/types/supabase';

type Category = Database['public']['Tables']['categories']['Row'];

export function CategoriesPage({ embedded }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      setDeleteError(null);
      const { data: linkedItems, error: checkError } = await supabase
        .from('inventory_items')
        .select('id')
        .eq('category_id', id)
        .limit(1);
      if (checkError) throw checkError;
      if (linkedItems && linkedItems.length > 0) {
        throw new Error('Cannot delete this category because active inventory items are assigned to it. Please reassign items first.');
      }
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setDeletingId(null);
      setDeleteError(null);
    },
    onError: (err: any) => {
      setDeleteError(err.message || 'Failed to delete category');
      setDeletingId(null);
    }
  });

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete the category "${name}"?`)) {
      setDeletingId(id);
      deleteMutation.mutate(id);
    }
  };

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
    <div className={embedded ? "space-y-4 max-w-4xl" : "p-4 md:p-8 max-w-4xl mx-auto space-y-6 animate-in fade-in text-foreground"}>
      {!embedded ? (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Tags className="w-8 h-8 text-primary" />
              Categories
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">Manage inventory categories and groupings.</p>
          </div>
          
          <Button onClick={() => setIsAdding(true)} disabled={isAdding} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
            <Plus className="w-4 h-4 mr-2" /> Add Category
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground font-medium">Manage inventory item categories, sections, and groupings.</p>
          <Button onClick={() => setIsAdding(true)} disabled={isAdding} size="sm" className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Category
          </Button>
        </div>
      )}

      <div className="bg-card rounded-xl shadow-xs border border-border overflow-hidden">
        {isAdding && (
          <div className="p-4 border-b border-border bg-muted/40">
            <form onSubmit={handleAdd} className="flex items-center gap-3">
              <input
                autoFocus
                type="text"
                placeholder="Category Name (e.g. PORTION STOCK)"
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                className="flex-1 border border-border bg-card text-foreground rounded shadow-xs px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
              />
              <Button type="submit" disabled={!newCatName.trim() || addMutation.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setIsAdding(false)}>Cancel</Button>
            </form>
          </div>
        )}

        {deleteError && (
          <div className="p-3 mx-4 mt-4 rounded-lg bg-destructive/15 border border-destructive/20 text-destructive text-xs font-semibold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />
              <span>{deleteError}</span>
            </div>
            <button onClick={() => setDeleteError(null)} className="text-destructive font-bold ml-2">×</button>
          </div>
        )}

        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
            </div>
          ) : categories?.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No categories found.</div>
          ) : (
            categories?.map(cat => (
              <div key={cat.id} className="p-4 flex items-center justify-between hover:bg-muted/40 transition-colors">
                {editingId === cat.id ? (
                  <form onSubmit={(e) => handleEditSave(e, cat.id)} className="flex items-center gap-3 w-full">
                    <input
                      autoFocus
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 border border-border bg-card text-foreground rounded shadow-xs px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                    />
                    <Button type="submit" disabled={!editName.trim() || updateMutation.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold">
                      {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                  </form>
                ) : (
                  <>
                    <span className="font-medium text-foreground">{cat.name}</span>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => { setEditingId(cat.id); setEditName(cat.name); }} className="text-muted-foreground hover:text-foreground">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        title="Delete Category"
                        onClick={() => handleDelete(cat.id, cat.name)}
                        disabled={deletingId === cat.id}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        {deletingId === cat.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-destructive" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
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
