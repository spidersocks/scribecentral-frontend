import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import MedicalScribeDemo from './apps/MedicalScribe/MedicalScribeDemo.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/medical-scribe/demo" element={<MedicalScribeDemo />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)