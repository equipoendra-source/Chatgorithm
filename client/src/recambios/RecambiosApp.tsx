import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { LogOut, Building2, ShieldAlert } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { CompanyLogin } from '../components/CompanyLogin';
import { Login } from '../components/Login';
import PartOrdersDashboard from '../components/PartOrdersDashboard';
import ErrorBoundary from '../components/ErrorBoundary';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { getAuthServerUrl } from '../config/api';
import { isPartsProfile } from '../utils/partsProfile';

// App aparte "Recambios": solo el panel de Pedidos de Piezas para Recambios y
// Taller. Usa el MISMO servidor, la misma empresa y los mismos usuarios que
// Chatgorim; el socket solo sirve para iniciar sesión y comprobar que la
// sesión sigue viva (los pedidos van por la API REST).

interface CompanyConfig {
    companyId: string;
    companyName: string;
    backendUrl: string;
    logoUrl?: string;
}

interface SessionUser {
    id?: string;
    username: string;
    role: string;
    preferences?: any;
    sessionToken?: string;
}

const USER_KEY = 'chatgorithm_user';

const getSavedCompanyConfig = (): CompanyConfig | null => {
    try {
        const saved = localStorage.getItem('company_config');
        if (saved) return JSON.parse(saved);
    } catch (e) { console.error('Error parsing company config', e); }
    return null;
};

const getSavedUser = (): SessionUser | null => {
    try {
        const saved = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
        if (saved) return JSON.parse(saved);
    } catch (e) { console.error('Error parsing user', e); }
    return null;
};

function Shell() {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [companyConfig, setCompanyConfig] = useState<CompanyConfig | null>(getSavedCompanyConfig);
    const [user, setUser] = useState<SessionUser | null>(getSavedUser);
    const [socket, setSocket] = useState<Socket | null>(null);

    // Socket hacia el servidor de la empresa.
    useEffect(() => {
        if (!companyConfig?.backendUrl) { setSocket(null); return; }
        const s = io(companyConfig.backendUrl, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
        });
        setSocket(s);
        return () => { s.disconnect(); };
    }, [companyConfig?.backendUrl]);

    const handleLogout = () => {
        try { localStorage.removeItem(USER_KEY); } catch (_) { /* no bloquear */ }
        try { sessionStorage.removeItem(USER_KEY); } catch (_) { /* no bloquear */ }
        setUser(null);
    };

    const handleCompanyLogout = () => {
        try { localStorage.removeItem('company_config'); } catch (_) { /* no bloquear */ }
        handleLogout();
        setCompanyConfig(null);
    };

    const handleLogin = (u: string, r: string, _p: string, _m: boolean, prefs: any = {}, id?: string, sessionToken?: string) => {
        const newUser: SessionUser = { id, username: u, role: r, preferences: prefs, sessionToken };
        setUser(newUser);
        localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    };

    // El socket se reconecta a menudo en el móvil (cambio de red, app en segundo
    // plano). En cada conexión se comprueba que el servidor sigue reconociendo
    // el token: sessionTokens vive en memoria del servidor y se borra en cada
    // redeploy, así que una sesión vieja se devuelve al login con un aviso claro.
    useEffect(() => {
        if (!socket || !user) return;
        const check = () => {
            if (user.sessionToken) socket.emit('authenticate_socket', user.sessionToken);
        };
        const onResult = (res: any) => {
            if (res?.ok) return;
            handleLogout();
            alert('Tu sesión ha caducado porque el servidor se reinició. Vuelve a iniciar sesión.');
        };
        socket.on('connect', check);
        socket.on('socket_authenticated', onResult);
        if (socket.connected) check();
        return () => {
            socket.off('connect', check);
            socket.off('socket_authenticated', onResult);
        };
    }, [socket, user]);

    // APK: barra de estado sin solaparse con la web y botón atrás de Android.
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;
        (async () => {
            try {
                await StatusBar.setOverlaysWebView({ overlay: false });
                await StatusBar.setStyle({ style: Style.Dark });
                await StatusBar.setBackgroundColor({ color: '#0f172a' });
            } catch (e) { console.warn('[StatusBar] No se pudo configurar:', e); }
        })();
        // Un solo panel: atrás sale de la app.
        const listener = CapacitorApp.addListener('backButton', () => { CapacitorApp.exitApp(); });
        return () => { listener.then(l => l.remove()); };
    }, []);

    const pageBg = isDark
        ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-black text-slate-200'
        : 'bg-slate-50 text-slate-800';

    // 1) Login de empresa
    if (!companyConfig) {
        return (
            <div className={`min-h-screen flex items-center justify-center p-4 ${pageBg}`}>
                <CompanyLogin onSuccess={setCompanyConfig} authServerUrl={getAuthServerUrl()} />
            </div>
        );
    }

    // 2) Login de usuario
    if (!user || !socket) {
        return (
            <div className={`min-h-screen flex items-center justify-center p-4 ${pageBg}`}>
                {socket ? (
                    <div className="w-full max-w-md">
                        <Login
                            onLogin={handleLogin}
                            socket={socket}
                            companyName={companyConfig.companyName}
                            onCompanyLogout={handleCompanyLogout}
                        />
                    </div>
                ) : (
                    <p className="font-medium">Conectando a <span className="text-indigo-500 font-bold">{companyConfig.companyName}</span>...</p>
                )}
            </div>
        );
    }

    // 3) Solo Recambios y Taller
    if (!isPartsProfile(user)) {
        return (
            <div className={`min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center ${pageBg}`}>
                <ShieldAlert className="w-12 h-12 text-amber-500" />
                <h1 className="text-lg font-bold">Esta app es solo para Recambios y Taller</h1>
                <p className="text-sm opacity-70 max-w-xs">Has entrado como «{user.username}». Inicia sesión con el perfil de Recambios o de Taller.</p>
                <button onClick={handleLogout} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold">Cambiar de usuario</button>
            </div>
        );
    }

    // 4) Panel de pedidos
    return (
        <div className={`h-screen w-screen flex flex-col overflow-hidden ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            <div className={`safe-pt-2 px-4 pb-2 flex items-center gap-2 border-b flex-shrink-0 ${isDark ? 'border-white/5 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                <Building2 className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span className="text-xs font-semibold truncate min-w-0">{companyConfig.companyName}</span>
                <span className="text-xs text-slate-400">·</span>
                <span className="text-xs font-bold truncate min-w-0">{user.username}</span>
                <button
                    onClick={handleLogout}
                    className={`ml-auto p-2 -mr-2 rounded-full ${isDark ? 'text-slate-300 active:bg-white/10' : 'text-slate-600 active:bg-slate-100'}`}
                    aria-label="Cerrar sesión"
                    title="Cerrar sesión"
                >
                    <LogOut className="w-4 h-4" />
                </button>
            </div>
            <div className="flex-1 min-h-0">
                <PartOrdersDashboard currentUser={user} />
            </div>
        </div>
    );
}

export default function RecambiosApp() {
    return (
        <ThemeProvider>
            <ErrorBoundary>
                <Shell />
            </ErrorBoundary>
        </ThemeProvider>
    );
}
