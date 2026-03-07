import { render, screen } from '@testing-library/react';
import TasksPage from './TasksPage.jsx';

vi.mock('../hooks/useTasksData.js', () => ({
  default: () => ({
    data: [],
    isLoading: false,
    error: '',
    refetch: vi.fn(),
  }),
}));

vi.mock('../context/useAuth.js', () => ({
  default: () => ({ user: null }),
}));

describe('TasksPage role-based create action', () => {
  it('shows create task button for dean user', () => {
    render(<TasksPage isMobile={false} user={{ role: 'dean' }} />);
    expect(screen.getByRole('button', { name: 'إنشاء مهمة جديدة' })).toBeInTheDocument();
  });

  it('shows create task button for consultant user', () => {
    render(<TasksPage isMobile={false} user={{ role: 'consultant' }} />);
    expect(screen.getByRole('button', { name: 'إنشاء مهمة جديدة' })).toBeInTheDocument();
  });

  it('hides create task button for regular user', () => {
    render(<TasksPage isMobile={false} user={{ role: 'user' }} />);
    expect(screen.queryByRole('button', { name: 'إنشاء مهمة جديدة' })).not.toBeInTheDocument();
  });

  it('shows create task button when role comes from roles array', () => {
    render(<TasksPage isMobile={false} user={{ roles: [{ name: 'dean' }] }} />);
    expect(screen.getByRole('button', { name: 'إنشاء مهمة جديدة' })).toBeInTheDocument();
  });
});
