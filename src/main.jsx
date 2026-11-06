import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Rotas from './Rotas.jsx'
import './index.css'

// Rotas.jsx decide qual tela mostrar (a landing page fica em "/")
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Rotas />
  </StrictMode>,
)
