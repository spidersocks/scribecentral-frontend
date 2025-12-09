// Root shell. Serves Medical Scribe at "/".
import React from 'react'

// If you want routing later, you can add react-router here.
// For now, render the app at root:
import { AuthGate } from './apps/MedicalScribe/AuthGate'
import MedicalScribeApp from './apps/MedicalScribe/App'

// Ensure Amplify is configured on app startup
import './aws/amplifyConfig'

export default function App() {
  return (
    <AuthGate>
      <MedicalScribeApp />
    </AuthGate>
  )
}