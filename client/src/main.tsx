import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App' // Importamos el componente principal
import './index.css'    // Importamos los estilos

console.log("🚀 Main.tsx se está ejecutando...");

// Buscamos el div con id "root" en el HTML
const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("❌ NO SE ENCUENTRA EL ELEMENTO 'root' EN EL HTML");
} else {
  // Si existe, "montamos" la aplicación React dentro
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
  console.log("✅ Aplicación montada correctamente");
}