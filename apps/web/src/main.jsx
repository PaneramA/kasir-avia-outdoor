import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

if (typeof window !== 'undefined') {
  window.__aviaDeferredInstallPrompt = null

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    window.__aviaDeferredInstallPrompt = event
    window.dispatchEvent(new CustomEvent('avia-install-available'))
  })

  window.addEventListener('appinstalled', () => {
    window.__aviaDeferredInstallPrompt = null
    window.dispatchEvent(new CustomEvent('avia-install-installed'))
  })
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed:', error)
    })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
