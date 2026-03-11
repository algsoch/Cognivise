import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// NOTE: StrictMode intentionally removed — it double-mounts effects in dev,
// which creates two simultaneous WebSocket connections and duplicates every
// AI message in the conversation log.
ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
