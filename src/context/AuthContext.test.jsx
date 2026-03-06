import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from './AuthContext';
import useAuth from './useAuth';
import * as authStorage from '../lib/authStorage';
import * as httpClient from '../lib/httpClient';

// Mock modules
vi.mock('../lib/authStorage');
vi.mock('../lib/httpClient');

// Test component that uses useAuth
function TestComponent() {
  const { user, login, logout, isLoading } = useAuth();
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <div>
      {user ? (
        <>
          <div data-testid="user-email">{user.email}</div>
          <div data-testid="user-role">{user.role}</div>
          <button onClick={logout}>Logout</button>
        </>
      ) : (
        <button onClick={() => login({ email: 'test@test.com', password: 'pass' })}>
          Login
        </button>
      )}
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with no user when no token exists', async () => {
    vi.mocked(authStorage.getAccessToken).mockReturnValue(null);
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
    
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('validates existing token on mount', async () => {
    const mockToken = 'mock-token';
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'admin',
    };
    
    vi.mocked(authStorage.getAccessToken).mockReturnValue(mockToken);
    vi.mocked(httpClient.request).mockResolvedValue({
      success: true,
      data: { user: mockUser },
    });
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent(mockUser.email);
    });
    
    expect(screen.getByTestId('user-role')).toHaveTextContent(mockUser.role);
  });

  it('handles login successfully', async () => {
    const mockToken = 'new-token';
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'user',
    };
    
    vi.mocked(authStorage.getAccessToken).mockReturnValue(null);
    vi.mocked(httpClient.request).mockResolvedValue({
      success: true,
      data: {
        accessToken: mockToken,
        user: mockUser,
      },
    });
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
    
    const loginButton = screen.getByText('Login');
    await userEvent.click(loginButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('user-email')).toHaveTextContent(mockUser.email);
    });
    
    expect(authStorage.setAccessToken).toHaveBeenCalledWith(mockToken);
  });

  it('handles logout', async () => {
    const mockUser = {
      id: 1,
      email: 'test@example.com',
      fullName: 'Test User',
      role: 'admin',
    };
    
    vi.mocked(authStorage.getAccessToken).mockReturnValue('mock-token');
    vi.mocked(httpClient.request).mockResolvedValue({
      success: true,
      data: { user: mockUser },
    });
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });
    
    const logoutButton = screen.getByText('Logout');
    await userEvent.click(logoutButton);
    
    await waitFor(() => {
      expect(screen.getByText('Login')).toBeInTheDocument();
    });
    
    expect(authStorage.clearAccessToken).toHaveBeenCalled();
  });
});
