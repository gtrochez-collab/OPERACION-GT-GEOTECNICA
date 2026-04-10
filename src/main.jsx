import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import HRModule from './HRModule.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HRModule />
  </StrictMode>,
)
