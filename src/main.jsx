import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import MedicalScribeDemo from './apps/MedicalScribe/MedicalScribeDemo.jsx'
import './index.css'

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename || undefined}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/medical-scribe/demo" element={<MedicalScribeDemo />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)