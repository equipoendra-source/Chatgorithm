import React from 'react';
import ReactDOM from 'react-dom/client';
import RecambiosApp from './RecambiosApp';
import '../index.css';
import { installAuthFetch } from '../config/authFetch';

// Igual que en Chatgorim: toda llamada a nuestra API lleva el token de sesión.
installAuthFetch();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <RecambiosApp />
    </React.StrictMode>,
);
