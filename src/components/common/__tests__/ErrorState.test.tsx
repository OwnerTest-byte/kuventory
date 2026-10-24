// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ErrorState } from '../ErrorState';

describe('ErrorState — shared actionable error display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => cleanup());

  it('renders title, message, and a working retry action', () => {
    const onRetry = vi.fn();
    render(
      <ErrorState
        error={new Error('Failed to fetch')}
        operation="load the worksheet"
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Connection problem');
    expect(screen.getByRole('alert')).toHaveTextContent('Load the worksheet could not be completed.');
    expect(screen.getByRole('alert')).toHaveTextContent(/unsaved work is still on the screen/i);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('never renders internal jargon from the underlying error', () => {
    render(<ErrorState error={new Error('relation "public.items" does not exist')} operation="open the catalog" />);
    const alert = screen.getByRole('alert');
    expect(alert).not.toHaveTextContent('relation');
    expect(alert).not.toHaveTextContent('public.items');
  });

  it('hides the retry button when no safe recovery action is provided', () => {
    render(<ErrorState error={new Error('Forbidden: only administrators')} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('announces itself politely to assistive technology', () => {
    render(<ErrorState error={new Error('boom')} />);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'polite');
  });
});
