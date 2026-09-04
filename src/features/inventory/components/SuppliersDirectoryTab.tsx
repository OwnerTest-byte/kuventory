import React, { useState, useMemo } from 'react';
import { useSuppliers } from '../api/suppliers';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Building2, 
  Search, 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  CreditCard, 
  Loader2,
  ExternalLink
} from 'lucide-react';

export const SuppliersDirectoryTab: React.FC = () => {
  const { data: suppliers = [], isLoading, error } = useSuppliers();
  const [searchQuery, setSearchQuery] = useState('');

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

  return (
    <div className="space-y-4">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-600" />
            Verified Suppliers Directory
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Registered food & beverage vendors, contact hotlines, lead times, and payment terms
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input 
              placeholder="Search vendor, contact, phone..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>
          <span className="text-xs font-semibold px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
            {filteredSuppliers.length} Vendors
          </span>
        </div>
      </div>

      {/* Directory Table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="max-h-[calc(100dvh-320px)] overflow-auto overscroll-contain">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 dark:bg-slate-950/80 sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200 min-w-50 sticky left-0 z-10 bg-slate-50 dark:bg-slate-950/80 border-r border-slate-200/60 dark:border-slate-800/60">
                  Vendor Name
                </th>
                <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200 min-w-35">Primary Contact</th>
                <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200 min-w-45">Contact Hotline</th>
                <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200 min-w-55">Logistics / Address</th>
                <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200 text-center min-w-25">Lead Time</th>
                <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200 text-center min-w-25">Terms</th>
                <th className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200 text-right min-w-25">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading verified supplier network...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-rose-500">
                    Failed to load supplier records.
                  </td>
                </tr>
              ) : filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    No suppliers matching &quot;{searchQuery}&quot;
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    {/* Sticky Vendor Name */}
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white sticky left-0 z-10 bg-white dark:bg-slate-900 border-r border-slate-200/60 dark:border-slate-800/60 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                          {s.name.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white leading-tight">{s.name}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-45">{s.notes}</p>
                        </div>
                      </div>
                    </td>

                    {/* Contact Person */}
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      <span className="font-medium">{s.contact_person || '—'}</span>
                    </td>

                    {/* Hotline & Email */}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 space-y-1">
                      {s.phone && (
                        <a 
                          href={`tel:${s.phone.replace(/[^0-9+]/g, '')}`} 
                          className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 font-medium transition-colors"
                        >
                          <Phone className="w-3 h-3 shrink-0" />
                          <span>{s.phone}</span>
                        </a>
                      )}
                      {s.email && (
                        <a 
                          href={`mailto:${s.email}`} 
                          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors truncate max-w-45"
                        >
                          <Mail className="w-3 h-3 shrink-0" />
                          <span className="truncate">{s.email}</span>
                        </a>
                      )}
                    </td>

                    {/* Address */}
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                      <div className="flex items-start gap-1.5 max-w-60">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="text-[11px] leading-relaxed line-clamp-2">{s.address || 'Metro Manila'}</span>
                      </div>
                    </td>

                    {/* Lead Time */}
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-[11px]">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {s.lead_time_days} {s.lead_time_days === 1 ? 'day' : 'days'}
                      </span>
                    </td>

                    {/* Terms */}
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 font-bold text-[10px] border border-emerald-200 dark:border-emerald-800">
                        <CreditCard className="w-3 h-3" />
                        {s.payment_terms}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (s.email) window.location.href = `mailto:${s.email}?subject=Purchase%20Order%20Inquiry%20-%20Kuventory`;
                          else if (s.phone) window.location.href = `tel:${s.phone.replace(/[^0-9+]/g, '')}`;
                        }}
                        className="h-7 text-[11px] px-2.5 font-bold gap-1 text-slate-700 hover:text-blue-600"
                      >
                        Contact
                        <ExternalLink className="w-3 h-3" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
