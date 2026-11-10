import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  confirmReset: boolean;
}

/**
 * Catches render errors below it. Fallback offers Reload and a two-step
 * "Reset local data" (deletes the IndexedDB database, then reloads).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, confirmReset: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('OpenHorizon render error', error, info.componentStack);
  }

  private reset = () => {
    if (!this.state.confirmReset) {
      this.setState({ confirmReset: true });
      window.setTimeout(() => this.setState({ confirmReset: false }), 5000);
      return;
    }
    const req = indexedDB.deleteDatabase('openhorizon');
    const done = () => window.location.reload();
    req.onsuccess = done;
    req.onerror = done;
    req.onblocked = done;
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-dvh bg-bg">
        <EmptyState
          icon={AlertTriangle}
          title="Something went wrong"
          description="The app hit an unexpected error. Reloading usually fixes it."
          action={{ label: 'Reload', onClick: () => window.location.reload(), variant: 'primary' }}
          secondaryAction={{
            label: this.state.confirmReset ? 'Confirm delete' : 'Reset local data',
            onClick: this.reset,
            variant: 'danger',
          }}
        />
      </div>
    );
  }
}
