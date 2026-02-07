// Shared API configuration for web and native apps

import { Capacitor } from '@capacitor/core';

// Central authentication server (always fixed - this is the main Chatgorithm server)
export const AUTH_SERVER_URL = 'https://chatgorithm-vubn.onrender.com';

// Detect if running in Capacitor native app (Android/iOS)
const isCapacitorNative = Capacitor.isNativePlatform();

// Detect if running in local web development
const isWebLocal = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    window.location.port !== '';

// For local development, use localhost for auth too
export const getAuthServerUrl = () => {
    if (isWebLocal) {
        return 'http://localhost:3000';
    }
    return AUTH_SERVER_URL;
};

// Get the company's backend URL from localStorage (set after company login)
export const getCompanyBackendUrl = (): string | null => {
    try {
        const configStr = localStorage.getItem('company_config');
        if (configStr) {
            const config = JSON.parse(configStr);
            return config.backendUrl || null;
        }
    } catch (e) {
        console.error('Error reading company config:', e);
    }
    return null;
};

// Legacy: Default backend URL (used before company login or as fallback)
const PRODUCTION_URL = 'https://chatgorithm-vubn.onrender.com';
const LOCAL_URL = 'http://localhost:3000';

export const API_BASE_URL = isCapacitorNative
    ? PRODUCTION_URL
    : (isWebLocal ? LOCAL_URL : PRODUCTION_URL);

export const API_URL = `${API_BASE_URL}/api`;

// Helper to check if we're in production environment
export const isProduction = !isWebLocal || isCapacitorNative;

console.log('🔧 API Config:', { isCapacitorNative, isWebLocal, AUTH_SERVER_URL: getAuthServerUrl() });

