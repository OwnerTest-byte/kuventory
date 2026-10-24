import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { normalizeUserError } from '@/lib/errors';

interface ErrorStateProps {
  /** Anything that was thrown, or a pre-normalized message. */
  error: unknown;
  /** Names the affected action, e.g. 'save this item' or 'load the worksheet'. */
  operation?: string;
  /** Primary recovery action. Provide when a retry/refresh is meaningful. */
  onRetry?: () => void;
  retryLabel?: string;
  isRetrying?: boolean;
  /** Compact variant for inline placement inside cards/forms. */
  compact?: boolean;
  className?: string;
}

/**
 * KUVENTORY shared actionable error display. Every failure states what
 * happened, what it means, and offers a real next step — never a raw
 * backend message, stack trace, or dead-end.
 */
export function ErrorState({
  error,
  operation,
  onRetry,
  retryLabel = 'Try Again',
  isRetrying = false,
  compact = false,
  className,
}: ErrorStateProps) {
  const normalized = normalizeUserError(error, operation);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'rounded-2xl border bg-amber-500/10 border-amber-500/25 text-left animate-in fade-in duration-200',
        compact ? 'p-3.5 flex items-start gap-2.5' : 'p-5 flex flex-col sm:flex-row sm:items-start gap-3',
        className
      )}
    >
      <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0">
        <AlertTriangle className="w-4 h-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-bold text-foreground break-words">{normalized.title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed break-words">{normalized.message}</p>
      </div>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
          className="h-8 text-xs font-bold shrink-0 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/15"
        >
          {isRetrying ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          )}
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
