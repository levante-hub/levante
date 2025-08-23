import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './globals.css'

const AppWrapper = () => {
  // Enable StrictMode only in development (pattern from Expo)
  if (process.env.NODE_ENV === 'development') {
    return (
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  }
  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(<AppWrapper />)