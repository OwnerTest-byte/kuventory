import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserCheck } from 'lucide-react';
import type { PublicSupportContact } from '@/features/admin/services/profileService';
import { SupportContactDirectory } from './SupportContactDirectory';

interface AdminContactModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: PublicSupportContact[];
  /** Context line explaining WHY an administrator must be contacted. */
  reason: string;
}

/**
 * Shared "Verify with an Administrator" pop-up used by the login
 * administrator-verification card and the recovery contact-admin panel.
 * Shows why contact is required and where to reach an administrator
 * (the same live directory as both surfaces — one data source).
 */
export function AdminContactModal({ open, onOpenChange, contacts, reason }: AdminContactModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-md p-5 rounded-2xl bg-card border-border shadow-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="space-y-1 text-left border-b border-border/60 pb-3">
          <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
            <UserCheck className="w-5 h-5 text-amber-500" />
            <span>Contact an Administrator</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {reason}
          </DialogDescription>
        </DialogHeader>

        <div className="py-3">
          <SupportContactDirectory
            contacts={contacts}
            emptyFallback={
              <div className="text-xs text-muted-foreground py-3 text-center">
                <p>No public support channels configured.</p>
                <p className="mt-1 text-[11px]">Please contact your branch supervisor directly.</p>
              </div>
            }
          />
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          className="w-full h-9 text-xs font-semibold rounded-xl border-border hover:bg-muted text-foreground"
        >
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}
