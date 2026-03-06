import { render, screen } from '@testing-library/react';
import Badge from './Badge.jsx';

describe('Badge', () => {
  it('renders mapped status text', () => {
    render(<Badge status="approved" />);
    expect(screen.getByText('معتمد')).toBeInTheDocument();
  });

  it('falls back to active badge when status unknown', () => {
    render(<Badge status="unknown-status" />);
    expect(screen.getByText('نشط')).toBeInTheDocument();
  });
});
