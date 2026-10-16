import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import MedicalScribeDemo from './apps/MedicalScribe/MedicalScribeDemo.jsx'
import ServerWarmupNotice from './apps/MedicalScribe/components/shared/ServerWarmupNotice.jsx'
import { apiClient } from './apps/MedicalScribe/utils/apiClient'
import './index.css'

const basename = import.meta.env.BASE_URL.replace(/\/$/, "");

function StethoscribeRoot() {
  useEffect(() => {
    apiClient.warmupBackend({ timeoutMs: 7000 }).catch(() => {});
  }, []);

  return (
    <>
      <ServerWarmupNotice />
      <BrowserRouter basename={basename || undefined}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/medical-scribe/demo" element={<MedicalScribeDemo />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StethoscribeRoot />
  </React.StrictMode>
)