import { render, screen } from '@testing-library/react';
import Badge from './Badge.jsx';

describe('Badge', () => {
  it('renders mapped status text in Arabic by default', () => {
    render(<Badge status="approved" />);
    expect(screen.getByText('معتمد')).toBeInTheDocument();
  });

  it('renders mapped status text in English when lang=en', () => {
    render(<Badge status="approved" lang="en" />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('falls back to active badge when status unknown', () => {
    render(<Badge status="unknown-status" />);
    expect(screen.getByText('نشط')).toBeInTheDocument();
  });

  it('falls back to active badge in English when status unknown and lang=en', () => {
    render(<Badge status="unknown-status" lang="en" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
});
