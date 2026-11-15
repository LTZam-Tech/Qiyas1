import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled with the app: installations make no internet calls (docs/phase1/09 §7)
import '@fontsource/ibm-plex-sans-arabic/300.css'
import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/500.css'
import '@fontsource/ibm-plex-sans-arabic/600.css'
import '@fontsource/ibm-plex-sans-arabic/700.css'
import '@fontsource/poppins/300.css'
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
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
