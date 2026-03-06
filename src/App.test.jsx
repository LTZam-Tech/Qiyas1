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
  it('renders portal content area', async () => {
    renderApp();
    const content = await screen.findByRole('main', { name: /portal content/i });
    expect(content).toBeInTheDocument();
  });
});
