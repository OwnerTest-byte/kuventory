import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface LegalModalProps {
  type: 'privacy' | 'terms' | null;
  onClose: () => void;
}

export const LegalModal: React.FC<LegalModalProps> = ({ type, onClose }) => {
  if (!type) return null;

  const isPrivacy = type === 'privacy';

  return (
    <Dialog open={!!type} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {isPrivacy ? 'Privacy & Data Protection Policy' : 'Terms of Operational Service'}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Effective Date: September 2026 | KUVENTORY Enterprise Standard
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm text-foreground/90 leading-relaxed py-2">
          {isPrivacy ? (
            <>
              <section className="space-y-1.5">
                <h3 className="font-bold text-foreground">1. Data Collection & Purpose</h3>
                <p className="text-muted-foreground text-xs leading-normal">
                  KUVENTORY processes operational inventory metrics, stock batches, audit histories, and staff authorization credentials exclusively for inventory control at Kape Uno Bistro. We do not sell, monetize, or transmit store data to external advertisers.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-foreground">2. Access Controls & Security</h3>
                <p className="text-muted-foreground text-xs leading-normal">
                  All communications are encrypted in transit via TLS 1.3. Role-based least-privilege security (RLS) restricts staff members to shift worksheets while administrative functions remain cryptographically protected.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-foreground">3. User Rights & Data Retention</h3>
                <p className="text-muted-foreground text-xs leading-normal">
                  In accordance with applicable data privacy regulations, authorized users may request an export of their shift movement records or request credential deactivation through an authorized system administrator.
                </p>
              </section>
            </>
          ) : (
            <>
              <section className="space-y-1.5">
                <h3 className="font-bold text-foreground">1. Authorized Operational Use</h3>
                <p className="text-muted-foreground text-xs leading-normal">
                  KUVENTORY is provided for certified staff and store administrators. Sharing credentials or attempting unauthorized privilege escalation is strictly prohibited and logged in the immutable audit stream.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-foreground">2. Inventory Record Integrity</h3>
                <p className="text-muted-foreground text-xs leading-normal">
                  Daily worksheet tallies finalized by staff create permanent inventory snapshots to prevent spoilage and ensure accounting consistency. Accurate count verification is the responsibility of active shift operators.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-foreground">3. System Availability & Continuity</h3>
                <p className="text-muted-foreground text-xs leading-normal">
                  KUVENTORY includes automated keepalive monitoring and redundant cloud storage to guarantee high uptime across bistro operating hours. Scheduled maintenance will be announced in advance.
                </p>
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
