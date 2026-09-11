import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('KUVENTORY application error caught by boundary:', error.message, errorInfo.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/inventory';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4 text-foreground">
          <div className="max-w-md w-full bg-card p-6 sm:p-8 rounded-2xl border border-border shadow-lg text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-destructive/15 text-destructive mx-auto flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            
            <div className="space-y-1">
              <h2 className="text-xl font-bold tracking-tight">Something unexpected happened</h2>
              <p className="text-sm text-muted-foreground">
                We encountered an error while rendering this page. Your inventory data is safe.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2 justify-center">
              <Button 
                onClick={this.handleReload} 
                className="font-semibold gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Page
              </Button>
              <Button 
                variant="outline" 
                onClick={this.handleGoHome}
                className="border-border font-semibold"
              >
                Return to Dashboard
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
