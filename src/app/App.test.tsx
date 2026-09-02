/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the foundation shell', () => {
    render(<App />);
    expect(screen.getByText('KUVENTORY Foundation')).toBeInTheDocument();
  });
});
