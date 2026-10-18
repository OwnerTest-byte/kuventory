import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LogOut, AlertTriangle, Loader2 } from 'lucide-react';

interface LogoutConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoggingOut?: boolean;
  hasUnsavedChanges?: boolean;
}

export const LogoutConfirmationModal: React.FC<LogoutConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoggingOut = false,
  hasUnsavedChanges = false,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoggingOut && onClose()}>
      <DialogContent 
        className="bg-card text-foreground border-border max-w-sm sm:max-w-md p-6 rounded-2xl shadow-xl"
        aria-describedby="logout-dialog-description"
      >
        <DialogHeader className="space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center mx-auto sm:mx-0 shadow-inner">
            {hasUnsavedChanges ? (
              <AlertTriangle className="w-6 h-6 text-amber-500" />
            ) : (
              <LogOut className="w-6 h-6 text-rose-500" />
            )}
          </div>
          <DialogTitle className="text-xl font-bold tracking-tight text-foreground text-center sm:text-left">
            Log out?
          </DialogTitle>
          <DialogDescription id="logout-dialog-description" className="text-xs sm:text-sm text-muted-foreground text-center sm:text-left leading-relaxed">
            {hasUnsavedChanges ? (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                You have unsaved changes in progress that will be discarded. Are you sure you want to log out without saving?
              </span>
            ) : (
              'Are you sure you want to log out?'
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-4 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isLoggingOut}
            className="w-full sm:w-auto border-border text-foreground hover:bg-muted font-semibold cursor-pointer h-10 px-4"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoggingOut}
            className="w-full sm:w-auto bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer h-10 px-4 shadow-sm"
          >
            {isLoggingOut ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Logging out...
              </>
            ) : (
              <>
                <LogOut className="w-4 h-4 mr-2" />
                Log Out
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
