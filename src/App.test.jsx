import { render, screen } from '@testing-library/react';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';

function renderApp() {
  return render(
    <AuthProvider>
      <App />
    </AuthProvider>,
  );
}

describe('App', () => {
  it('renders login page when user is not authenticated', async () => {
    renderApp();
    const loginButton = await screen.findByRole('button', { name: /Login|تسجيل الدخول/i });
    expect(loginButton).toBeInTheDocument();
  });
});
