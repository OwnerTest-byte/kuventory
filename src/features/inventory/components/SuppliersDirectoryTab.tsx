import React, { useState, useMemo } from 'react';
import { useSuppliers, useSupplierMutations, type Supplier } from '../api/suppliers';
import { useItems } from '../hooks/useItems';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  Building2, 
  Search, 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  Loader2,
  Plus,
  Edit3,
  Package,
  Trash2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export const SuppliersDirectoryTab: React.FC = () => {
  const { data: suppliers = [], isLoading, error } = useSuppliers();
  const { items = [] } = useItems();
  const { createSupplier, updateSupplier, deleteSupplier } = useSupplierMutations();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [modalFeedback, setModalFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    lead_time_days: 1,
    notes: '',
  });

  const filteredSuppliers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return suppliers;
    return suppliers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.contact_person.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      s.phone.toLowerCase().includes(q) ||
      s.address.toLowerCase().includes(q)
    );
  }, [suppliers, searchQuery]);

  // Map of supplier name to supplied items count
  const supplierItemsCount = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((item) => {
      if (item.supplier_a) {
        counts[item.supplier_a.toLowerCase()] = (counts[item.supplier_a.toLowerCase()] || 0) + 1;
      }
      if (item.supplier_b) {
        counts[item.supplier_b.toLowerCase()] = (counts[item.supplier_b.toLowerCase()] || 0) + 1;
      }
    });
    return counts;
  }, [items]);

  // Open edit modal for an existing supplier
  const handleEditClick = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      name: supplier.name,
      contact_person: supplier.contact_person,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      lead_time_days: supplier.lead_time_days,
      notes: supplier.notes,
    });
    setModalFeedback(null);
  };

  // Open new supplier modal
  const handleNewClick = () => {
    setSelectedSupplier(null);
    setFormData({
      name: '',
      contact_person: '',
      phone: '',
      email: '',
      address: '',
      lead_time_days: 1,
      notes: '',
    });
    setModalFeedback(null);
    setIsNewModalOpen(true);
  };

  // Save changes (update existing or create new)
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setModalFeedback({ type: 'error', message: 'Supplier name is required.' });
      return;
    }

    try {
      if (selectedSupplier) {
        await updateSupplier.mutateAsync({
          id: selectedSupplier.id,
          name: formData.name.trim(),
          contact_person: formData.contact_person.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim(),
          address: formData.address.trim(),
          lead_time_days: Number(formData.lead_time_days) || 1,
          notes: formData.notes.trim(),
        });
        setModalFeedback({ type: 'success', message: 'Supplier information updated successfully!' });
        setTimeout(() => setSelectedSupplier(null), 1200);
      } else {
        await createSupplier.mutateAsync({
          name: formData.name.trim(),
          contact_person: formData.contact_person.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim(),
          address: formData.address.trim(),
          lead_time_days: Number(formData.lead_time_days) || 1,
          notes: formData.notes.trim(),
          payment_terms: 'COD',
          is_active: true,
        });
        setModalFeedback({ type: 'success', message: 'New supplier added to directory!' });
        setTimeout(() => setIsNewModalOpen(false), 1200);
      }
    } catch (err: any) {
      setModalFeedback({ type: 'error', message: err.message || 'Failed to save supplier.' });
    }
  };

  // Handle supplier delete
  const handleDeleteSupplier = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove supplier "${name}"?`)) return;
    try {
      await deleteSupplier.mutateAsync(id);
      setSelectedSupplier(null);
    } catch (err: any) {
      alert(err.message || 'Failed to remove supplier');
    }
  };

  const isModalSubmitting = createSupplier.isPending || updateSupplier.isPending;

  return (
    <div className="space-y-4">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border shadow-xs">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            Verified Suppliers Directory
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Registered food &amp; beverage vendors, contact hotlines, logistics locations, and lead times
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input 
              placeholder="Search vendor, contact, phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs bg-card border-border"
            />
          </div>
          <Button
            onClick={handleNewClick}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-9 shrink-0 gap-1.5"
          >
            <Plus className="w-4 h-4" /> Add Vendor
          </Button>
        </div>
      </div>

      {/* Directory Table with Responsive Slider Container */}
      <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden">
        <div className="table-slider-container max-h-[calc(100dvh-320px)] min-h-[350px] relative overscroll-contain">
          <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
            <thead className="bg-muted/60 sticky top-0 z-20 border-b border-border shadow-xs">
              <tr>
                <th className="px-4 py-3 font-bold text-foreground min-w-[200px] sticky left-0 z-30 bg-muted/95 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                  Vendor Name
                </th>
                <th className="px-4 py-3 font-bold text-foreground min-w-[150px]">Primary Contact</th>
                <th className="px-4 py-3 font-bold text-foreground min-w-[190px]">Contact Hotline &amp; Email</th>
                <th className="px-4 py-3 font-bold text-foreground min-w-[220px]">Logistics / Address</th>
                <th className="px-4 py-3 font-bold text-foreground text-center min-w-[100px]">Lead Time</th>
                <th className="px-4 py-3 font-bold text-foreground text-center min-w-[100px]">Items Linked</th>
                <th className="px-4 py-3 font-bold text-foreground text-right min-w-[120px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-primary" />
                    Loading verified supplier network...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-destructive">
                    Failed to load supplier records.
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    No suppliers matching &quot;{searchQuery}&quot;
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map(s => {
                  const linkedCount = supplierItemsCount[s.name.toLowerCase()] || 0;
                  return (
                    <tr 
                      key={s.id} 
                      className="hover:bg-muted/40 transition-colors group cursor-pointer"
                      onClick={() => handleEditClick(s)}
                    >
                      {/* Sticky Vendor Name */}
                      <td className="px-4 py-3 font-semibold text-foreground sticky left-0 z-10 bg-card group-hover:bg-muted/50 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                            {s.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-foreground leading-tight">{s.name}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[180px]">{s.notes || 'No description notes'}</p>
                          </div>
                        </div>
                      </td>

                      {/* Contact Person */}
                      <td className="px-4 py-3 text-foreground">
                        <span className="font-medium">{s.contact_person || '—'}</span>
                      </td>

                      {/* Hotline & Email */}
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400 space-y-1">
                        {s.phone ? (
                          <a 
                            href={`tel:${s.phone.replace(/[^0-9+]/g, '')}`} 
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium transition-colors"
                          >
                            <Phone className="w-3 h-3 shrink-0" />
                            <span>{s.phone}</span>
                          </a>
                        ) : null}
                        {s.email ? (
                          <a 
                            href={`mailto:${s.email}`} 
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors truncate max-w-[180px]"
                          >
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate">{s.email}</span>
                          </a>
                        ) : null}
                        {!s.phone && !s.email && <span className="text-slate-400">—</span>}
                      </td>

                      {/* Address */}
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        <div className="flex items-start gap-1.5 max-w-[220px]">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="text-[11px] leading-relaxed truncate">{s.address || 'Metro Manila'}</span>
                        </div>
                      </td>

                      {/* Lead Time */}
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-muted text-foreground font-semibold text-[11px]">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          {s.lead_time_days} {s.lead_time_days === 1 ? 'day' : 'days'}
                        </span>
                      </td>

                      {/* Items Linked */}
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold text-[11px] border border-primary/20">
                          <Package className="w-3 h-3" />
                          {linkedCount} items
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditClick(s);
                          }}
                          className="h-7 text-[11px] px-2.5 font-bold gap-1 border-border text-foreground hover:bg-muted"
                        >
                          <Edit3 className="w-3 h-3" />
                          View / Edit
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editable Supplier Modal (View / Edit / Create) */}
      <Dialog 
        open={!!selectedSupplier || isNewModalOpen} 
        onOpenChange={(open) => {
          if (!open) {
            setSelectedSupplier(null);
            setIsNewModalOpen(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              {selectedSupplier ? 'Supplier Contact & Details' : 'Register New Supplier'}
            </DialogTitle>
            <DialogDescription>
              {selectedSupplier
                ? 'View or update contact hotline, representative, and delivery parameters.'
                : 'Add a new verified vendor into the Kuventory supply chain network.'}
            </DialogDescription>
          </DialogHeader>

          {modalFeedback && (
            <div className={`p-3 text-xs rounded-md border flex items-center gap-2 ${
              modalFeedback.type === 'success' 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' 
                : 'bg-rose-50 border-rose-200 text-rose-700 font-semibold'
            }`}>
              {modalFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              )}
              {modalFeedback.message}
            </div>
          )}

          <form onSubmit={handleSaveSupplier} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-bold">Company / Vendor Name *</Label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. San Miguel Brewery Inc."
                  required
                  className="font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Primary Representative</Label>
                <Input
                  value={formData.contact_person}
                  onChange={e => setFormData({ ...formData, contact_person: e.target.value })}
                  placeholder="e.g. Roberto Santos"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Typical Lead Time (Days)</Label>
                <Input
                  type="number"
                  min="1"
                  max="90"
                  value={formData.lead_time_days}
                  onChange={e => setFormData({ ...formData, lead_time_days: parseInt(e.target.value) || 1 })}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Contact Phone / Hotline</Label>
                  {formData.phone && (
                    <a
                      href={`tel:${formData.phone.replace(/[^0-9+]/g, '')}`}
                      className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Phone className="w-3 h-3" /> Call
                    </a>
                  )}
                </div>
                <Input
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="e.g. +63 (02) 8632-3000"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold">Operations Email</Label>
                  {formData.email && (
                    <a
                      href={`mailto:${formData.email}`}
                      className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Mail className="w-3 h-3" /> Email
                    </a>
                  )}
                </div>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g. orders@smb.com.ph"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-bold">Warehouse / Logistics Address</Label>
                <Input
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                  placeholder="e.g. 40 San Miguel Ave, Mandaluyong City"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs font-bold">Notes &amp; Supplies Provided</Label>
                <Input
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="e.g. Fresh poultry distributor, direct delivery on Mondays"
                />
              </div>
            </div>

            <DialogFooter className="pt-3 flex sm:justify-between items-center w-full">
              {selectedSupplier ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => handleDeleteSupplier(selectedSupplier.id, selectedSupplier.name)}
                  className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs"
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Delete Supplier
                </Button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedSupplier(null);
                    setIsNewModalOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isModalSubmitting || !formData.name.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
                >
                  {isModalSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {selectedSupplier ? 'Save Changes' : 'Register Supplier'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
