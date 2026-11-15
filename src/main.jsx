import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/ui.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { detectPreferredLang, isSupportedLang } from './i18n/index.js'

const detectLang = () => {
  const first = window.location.pathname.split('/').filter(Boolean)[0];
  return isSupportedLang(first) ? first : detectPreferredLang();
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary lang={detectLang()}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
