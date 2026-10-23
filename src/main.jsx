import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { iniciarBrillos } from './brillos.js'
import { vigilarVersion } from './version.js'

iniciarBrillos()
vigilarVersion()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
