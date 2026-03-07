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
    render(<TasksPage isMobile={false} user={{ role: 'dean' }} lang="ar" />);
    expect(screen.getByRole('button', { name: 'إنشاء مهمة جديدة' })).toBeInTheDocument();
  });

  it('shows create task button for consultant user', () => {
    render(<TasksPage isMobile={false} user={{ role: 'consultant' }} lang="ar" />);
    expect(screen.getByRole('button', { name: 'إنشاء مهمة جديدة' })).toBeInTheDocument();
  });

  it('hides create task button for regular user', () => {
    render(<TasksPage isMobile={false} user={{ role: 'user' }} lang="ar" />);
    expect(screen.queryByRole('button', { name: 'إنشاء مهمة جديدة' })).not.toBeInTheDocument();
  });

  it('shows create task button when role comes from roles array', () => {
    render(<TasksPage isMobile={false} user={{ roles: [{ name: 'dean' }] }} lang="ar" />);
    expect(screen.getByRole('button', { name: 'إنشاء مهمة جديدة' })).toBeInTheDocument();
  });
});
