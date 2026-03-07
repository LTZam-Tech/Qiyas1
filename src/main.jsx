import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { AuthProvider } from './context/AuthContext.jsx'

const detectLang = () => {
  const htmlLang = document.documentElement.lang?.toLowerCase();
  if (htmlLang === 'en' || htmlLang === 'ar') return htmlLang;
  return navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
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
