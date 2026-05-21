import { useState, useEffect, useMemo, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Login } from './components/Login';
import { CompanyLogin } from './components/CompanyLogin';
import { ChatWindow } from './components/ChatWindow';
import { Sidebar, Contact } from './components/Sidebar';
import { Settings } from './components/Settings';
import { MessageCircle, LogOut, Settings as SettingsIcon, WifiOff, ArrowLeft, Building2 } from 'lucide-react';
import ChatTemplateSelector from './components/ChatTemplateSelector';
// @ts-ignore
import CalendarDashboard from './components/CalendarDashboard';
// @ts-ignore
import CampaignsDashboard from './components/CampaignsDashboard';
import { TeamChat } from './components/TeamChat';
import { IncomingCallHandler } from './components/IncomingCallHandler';
import { pushNotificationService } from './services/pushNotifications';
import ErrorBoundary from './components/ErrorBoundary';
import { getAuthServerUrl } from './config/api';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { ThemeSelectionModal } from './components/ThemeSelectionModal';
import { startProductTour, shouldShowTour, markTourAsComplete, migrateTourStateFromLocalStorage } from './components/ProductTour';
import { AlertCenter } from './components/AlertCenter';
import { AppointmentToast, AppointmentNotification } from './components/AppointmentToast';

import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';

// Types
interface CompanyConfig {
    companyId: string;
    companyName: string;
    backendUrl: string;
    logoUrl?: string;
}

export interface QuickReply {
    id: string;
    title: string;
    content: string;
    shortcut: string;
}

// Helper to get saved company config
const getSavedCompanyConfig = (): CompanyConfig | null => {
    try {
        const saved = localStorage.getItem('company_config');
        if (saved) return JSON.parse(saved);
    } catch (e) { console.error("Error parsing company config", e); }
    return null;
};

// Helper to get saved user
const getSavedUser = () => {
    try {
        const saved = localStorage.getItem('chatgorithm_user') || sessionStorage.getItem('chatgorithm_user');
        if (saved) return JSON.parse(saved);
    } catch (e) { console.error("Error parsing user", e); }
    return null;
};

function App() {
    // THEME
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // COMPANY CONFIGURATION - First level of auth
    const [companyConfig, setCompanyConfig] = useState<CompanyConfig | null>(getSavedCompanyConfig);

    // USER AUTH - Second level of auth
    const [user, setUser] = useState<{ id?: string, username: string, role: string, preferences?: any, sessionToken?: string } | null>(getSavedUser);
    const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

    // VIEW STATE
    const [view, setView] = useState<'chat' | 'settings' | 'calendar' | 'team_chat' | 'campaigns'>('chat');
    const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

    // NUEVAS CITAS — toasts in-app + fecha a la que saltar al pinchar
    const [appointmentNotifs, setAppointmentNotifs] = useState<AppointmentNotification[]>([]);
    const [calendarInitialDate, setCalendarInitialDate] = useState<string | null>(null);

    // TEAM CHAT STATE
    const [teamChannel, setTeamChannel] = useState('general');
    const [mobileTeamChatActive, setMobileTeamChatActive] = useState(false); // Controls if mobile user is in a specific channel chat

    const [isConnected, setIsConnected] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
    const [typingStatus, setTypingStatus] = useState<{ [chatId: string]: string }>({});

    const [config, setConfig] = useState<{ departments: string[], statuses: string[], tags: string[] }>({
        departments: [],
        statuses: [],
        tags: []
    });

    const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);

    // PRODUCT TOUR STATE
    const [showThemeModal, setShowThemeModal] = useState(false);



    const handleTourComplete = () => {
        // Marcar el tour principal como completado en preferencias del servidor.
        // Esto se hace cuando el usuario cierra el modal de tema (= inicia el tour).
        // Marcamos como visto ANTES de iniciar el tour para que no se repita si recarga.
        markTourAsComplete('main', updateMyPreferences);
        setShowThemeModal(false);
        // Start driver.js tour
        setTimeout(() => startProductTour(), 500);
    };

    // SOCKET - Created dynamically based on company backend URL
    const socketRef = useRef<Socket | null>(null);

    // Create socket when company config is available
    const socket = useMemo(() => {
        if (!companyConfig?.backendUrl) {
            return null;
        }

        // Disconnect old socket if exists
        if (socketRef.current) {
            console.log('🔌 Desconectando socket anterior...');
            socketRef.current.disconnect();
        }

        console.log('🚀 Conectando socket a:', companyConfig.backendUrl);
        const newSocket = io(companyConfig.backendUrl, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: 10,
            reconnectionDelay: 1000
        });

        socketRef.current = newSocket;
        return newSocket;
    }, [companyConfig?.backendUrl]);

    // RE-AUTENTICACIÓN DEL SOCKET — crítico en móvil.
    // El socket se reconecta constantemente (cambio de red, app en segundo
    // plano). Cada reconexión es un socket nuevo que pierde la autenticación.
    // En cada evento 'connect' re-enviamos el token de sesión para que el
    // socket vuelva a estar autenticado y no se bloqueen chatMessage, etc.
    useEffect(() => {
        if (!socket) return;
        const reAuth = () => {
            // Leemos de localStorage para no depender del estado de React
            try {
                const saved = JSON.parse(localStorage.getItem('chatgorithm_user') || '{}');
                if (saved?.sessionToken) {
                    socket.emit('authenticate_socket', saved.sessionToken);
                    console.log('🔑 [Socket] Re-autenticando con token de sesión');
                }
            } catch (_) { /* sin token, el login normal autenticará */ }
        };
        socket.on('connect', reAuth);
        // Si el socket ya está conectado al montar este efecto, autenticar ya
        if (socket.connected) reAuth();
        return () => { socket.off('connect', reAuth); };
    }, [socket]);

    useEffect(() => {
        // El tour ahora se decide por las preferencias del usuario (servidor),
        // no por localStorage. Así cada usuario tiene su propio estado.
        if (!user || !socket) return;
        const prefs = user.preferences || {};

        // PASO 1: si el usuario tiene tours marcados en localStorage (sistema viejo)
        // y aún no tiene toursSeen en server, migramos para no molestarle con tours repetidos.
        const migrated = migrateTourStateFromLocalStorage(prefs, updateMyPreferences);
        if (migrated) return; // El próximo render tendrá las preferencias actualizadas

        // PASO 2: decidir si mostrar el modal de tema + tour principal
        if (shouldShowTour('main', prefs)) {
            setShowThemeModal(true);
        }
    }, [user, socket]);

    // Socket event handlers
    useEffect(() => {
        if (!socket) return;

        try {
            if (typeof Notification !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
                Notification.requestPermission();
            }
        } catch (e) {
            console.log('Push notifications handled by native layer');
        }

        if (user) socket.emit('register_presence', user.username);

        const onConnect = () => {
            console.log('✅ Socket conectado a', companyConfig?.backendUrl);
            setIsConnected(true);
            if (user) socket.emit('register_presence', user.username);
            socket.emit('request_config');
            socket.emit('request_quick_replies');
        };

        const onDisconnect = () => {
            console.log('❌ Socket desconectado');
            setIsConnected(false);
        };

        const onOnlineUsersUpdate = (users: string[]) => setOnlineUsers(users);

        const onRemoteTyping = (data: { user: string, phone: string }) => {
            if (data.user !== user?.username) {
                setTypingStatus(prev => ({ ...prev, [data.phone]: data.user }));
                setTimeout(() => setTypingStatus(prev => {
                    if (prev[data.phone] === data.user) {
                        const n = { ...prev };
                        delete n[data.phone];
                        return n;
                    }
                    return prev;
                }), 3000);
            }
        };

        socket.on('connect', onConnect);
        socket.on('disconnect', onDisconnect);
        socket.on('online_users_update', onOnlineUsersUpdate);
        socket.on('remote_typing', onRemoteTyping);

        // Nueva cita reservada (Laura o manual) → toast in-app
        const onNewAppointment = (data: any) => {
            if (!data || !data.appointmentId) return;
            const notif: AppointmentNotification = {
                id: `${data.appointmentId}-${Date.now()}`,
                appointmentId: data.appointmentId,
                dateISO: data.dateISO,
                clientName: data.clientName || 'Cliente',
                clientPhone: data.clientPhone || '',
                agenda: data.agenda || '',
                humanDate: data.humanDate || '',
                source: data.source === 'manual' ? 'manual' : 'bot'
            };
            setAppointmentNotifs(prev => [notif, ...prev].slice(0, 5));
        };
        socket.on('new_appointment', onNewAppointment);

        // Debug
        socket.onAny((event, ...args) => {
            console.log(`🔌 [SOCKET] ${event}`, args.length > 0 ? args : '');
        });

        socket.on('config_list', (list: any[]) => {
            const depts = list.filter(i => i.type === 'Department').map(i => i.name);
            const stats = list.filter(i => i.type === 'Status').map(i => i.name);
            const tags = list.filter(i => i.type === 'Tag').map(i => i.name);
            setConfig({
                departments: depts.length > 0 ? depts : ['Ventas', 'Taller', 'Admin'],
                statuses: stats.length > 0 ? stats : ['Nuevo', 'Abierto', 'Cerrado'],
                tags: tags
            });
        });

        socket.on('quick_replies_list', (list: QuickReply[]) => {
            setQuickReplies(list);
        });

        if (socket.connected) {
            socket.emit('request_config');
            socket.emit('request_quick_replies');
        }

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('config_list');
            socket.off('online_users_update');
            socket.off('remote_typing');
            socket.off('quick_replies_list');
            socket.off('new_appointment', onNewAppointment);
        };
    }, [socket, user, companyConfig?.backendUrl]);

    // Initialize push notifications for native platforms
    useEffect(() => {
        if (companyConfig?.backendUrl) {
            console.log('📱 [Push] Inicializando servicio nativo con:', companyConfig.backendUrl);
            pushNotificationService.initialize(companyConfig.backendUrl);
        }
    }, [companyConfig?.backendUrl]);

    // Handlers
    const handleCompanyLoginSuccess = (config: CompanyConfig) => {
        console.log('✅ Empresa autenticada:', config.companyName);
        setCompanyConfig(config);
    };

    const handleLogin = (u: string, r: string, p: string, m: boolean, prefs: any = {}, id?: string, sessionToken?: string) => {
        const newUser = { id, username: u, role: r, preferences: prefs, sessionToken };
        setUser(newUser);
        localStorage.setItem('chatgorithm_user', JSON.stringify(newUser));
    };

    // Helper para actualizar mis preferencias en servidor (y en estado local cuando responde).
    // Se pasa como prop a los componentes que lo necesiten (Settings, ChatWindow, etc.)
    // Hace MERGE en el servidor — solo pasas los campos que cambian.
    const updateMyPreferences = (partialPrefs: any) => {
        if (!socket) return;
        socket.emit('update_my_preferences', partialPrefs);
    };

    // Listener: cuando el servidor confirma la actualización, refrescamos el estado local
    useEffect(() => {
        if (!socket) return;
        const onUpdated = (newPrefs: any) => {
            setUser(prev => {
                if (!prev) return prev;
                const updated = { ...prev, preferences: newPrefs };
                localStorage.setItem('chatgorithm_user', JSON.stringify(updated));
                return updated;
            });
        };
        socket.on('my_preferences_updated', onUpdated);
        return () => { socket.off('my_preferences_updated', onUpdated); };
    }, [socket]);

    const handleLogout = () => {
        localStorage.removeItem('chatgorithm_user');
        setUser(null);
        setSelectedContact(null);
    };

    const handleCompanyLogout = () => {
        // Logout from company (will go to company login screen)
        localStorage.removeItem('company_config');
        localStorage.removeItem('chatgorithm_user');
        if (socketRef.current) {
            socketRef.current.disconnect();
            socketRef.current = null;
        }
        setCompanyConfig(null);
        setUser(null);
        setSelectedContact(null);
    };

    // Android back button handler
    // Configurar la barra de estado del APK al arrancar.
    // overlaysWebView(false) → la web NO se mete debajo de la barra de estado,
    // el SO le reserva su espacio. Así el header del chat no queda tapado.
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;
        (async () => {
            try {
                await StatusBar.setOverlaysWebView({ overlay: false });
                await StatusBar.setStyle({ style: Style.Dark });
                await StatusBar.setBackgroundColor({ color: '#0f172a' });
            } catch (e) {
                console.warn('[StatusBar] No se pudo configurar:', e);
            }
        })();
    }, []);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        const backButtonListener = CapacitorApp.addListener('backButton', () => {
            if (view === 'settings') { setView('chat'); return; }
            if (view === 'calendar') { setView('chat'); return; }
            if (view === 'campaigns') { setView('chat'); return; }
            if (selectedContact) { setSelectedContact(null); return; }
            if (view === 'team_chat' && mobileTeamChatActive) { setMobileTeamChatActive(false); return; }
            if (view === 'team_chat') { setView('chat'); return; }
            CapacitorApp.exitApp();
        });

        return () => {
            backButtonListener.then(l => l.remove());
        };
    }, [view, selectedContact, mobileTeamChatActive]);

    // ========================
    // RENDER FLOW
    // ========================

    // STEP 1: Company login (if no company config)
    if (!companyConfig) {
        return (
            <div className={`min-h-screen flex items-center justify-center p-4 relative overflow-hidden ${isDark
                ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-black text-slate-200'
                : 'bg-slate-50 text-slate-800'}`}>
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[120px]"></div>
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[120px]"></div>
                </div>
                <CompanyLogin
                    onSuccess={handleCompanyLoginSuccess}
                    authServerUrl={getAuthServerUrl()}
                />
            </div>
        );
    }

    // STEP 2: User login (if no user)
    if (!user || !socket) {
        return (
            <div className={`min-h-screen flex items-center justify-center p-4 relative overflow-hidden ${isDark
                ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-black text-slate-200'
                : 'bg-slate-50 text-slate-800'}`}>
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[120px]"></div>
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 blur-[120px]"></div>
                </div>
                {socket ? (
                    <div className="w-full max-w-md relative z-10">
                        <Login
                            onLogin={handleLogin}
                            socket={socket}
                            companyName={companyConfig.companyName}
                            onCompanyLogout={handleCompanyLogout}
                        />
                    </div>
                ) : (
                    <div className={`glass-card p-8 flex flex-col items-center relative z-10 ${!isDark && 'bg-white shadow-xl'}`}>
                        <div className="animate-spin w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full mb-4"></div>
                        <p className={`${isDark ? 'text-slate-300' : 'text-slate-600'} font-medium`}>Conectando a <span className="text-indigo-500 font-bold">{companyConfig.companyName}</span>...</p>
                    </div>
                )}
            </div>
        );
    }

    // Toast de nuevas citas — reutilizable en TODAS las vistas (chat, calendario, settings, etc).
    // Antes solo se renderizaba en la vista chat, así que las reservas hechas desde el calendario
    // emitían el evento pero el toast no estaba montado y no aparecía. Ahora siempre está visible.
    const appointmentToastNode = (
        <AppointmentToast
            notifications={appointmentNotifs}
            onOpen={(n) => {
                setCalendarInitialDate(n.dateISO.slice(0, 10));
                setView('calendar');
                setAppointmentNotifs(prev => prev.filter(x => x.id !== n.id));
            }}
            onDismiss={(id) => setAppointmentNotifs(prev => prev.filter(x => x.id !== id))}
        />
    );

    // Settings view
    if (view === 'settings') return (
        <>
            <Settings onBack={() => setView('chat')} socket={socket} currentUserRole={user.role} quickReplies={quickReplies} currentUser={user} updateMyPreferences={updateMyPreferences} />
            {appointmentToastNode}
        </>
    );

    // Calendar view
    if (view === 'calendar') {
        return (
            <div className={`h-screen w-screen overflow-hidden p-0 md:p-4 md:py-6 ${isDark
                ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-black text-slate-200'
                : 'bg-slate-100 text-slate-800'}`}>
                <div className={`flex w-full h-full max-w-[1920px] mx-auto overflow-hidden md:rounded-3xl relative shadow-2xl ${isDark ? 'glass-panel' : 'bg-white border border-slate-200'}`}>
                    <div className={`flex-1 flex flex-col relative h-full ${isDark ? 'bg-slate-900/40 backdrop-blur-md' : 'bg-white'}`}>
                        <button
                            onClick={() => setView('chat')}
                            className="absolute safe-top-4 left-4 md:left-6 z-50 glass-button-secondary p-2.5 rounded-full hover:bg-white/10 transition-all active:scale-95 group border border-white/10"
                            title="Volver al Chat"
                        >
                            <ArrowLeft className="w-6 h-6 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                        </button>
                        <CalendarDashboard readOnly={user.role === 'agent'} config={config} initialDate={calendarInitialDate} onInitialDateConsumed={() => setCalendarInitialDate(null)} />
                    </div>
                </div>
                {appointmentToastNode}
            </div>
        );
    }

    // Campaigns view
    if (view === 'campaigns') {
        return (
            <div className={`h-screen w-screen overflow-hidden p-0 md:p-4 md:py-6 ${isDark
                ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-black text-slate-200'
                : 'bg-slate-100 text-slate-800'}`}>
                <div className={`flex w-full h-full max-w-[1920px] mx-auto overflow-hidden md:rounded-3xl relative shadow-2xl ${isDark ? 'glass-panel' : 'bg-white border border-slate-200'}`}>
                    <div className={`flex-1 flex flex-col relative h-full overflow-hidden ${isDark ? 'bg-slate-900/40 backdrop-blur-md' : 'bg-white'}`}>
                        <CampaignsDashboard
                            readOnly={user.role === 'agent'}
                            currentUser={user}
                            onBack={() => setView('chat')}
                        />
                    </div>
                </div>
                {appointmentToastNode}
            </div>
        );
    }

    // Main app layout
    return (
        <div className={`h-screen w-screen overflow-hidden flex items-center justify-center p-0 md:p-4 md:py-6 ${isDark
            ? 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0f172a] to-black text-slate-200'
            : 'bg-slate-100 text-slate-800'}`}>
            <div className={`flex w-full h-full max-w-[1920px] mx-auto overflow-hidden md:rounded-3xl relative shadow-2xl border ${isDark ? 'glass-panel border-white/10' : 'bg-white border-slate-200'}`}>

                {/* Background Blobs for specific component area */}
                <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-purple-600/20 blur-[120px] animate-pulse"></div>
                    <div className="absolute top-[20%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px] animate-pulse animation-delay-2000"></div>
                    <div className="absolute bottom-[-10%] left-[20%] w-[40%] h-[40%] rounded-full bg-pink-600/10 blur-[120px] animate-pulse animation-delay-4000"></div>
                </div>

                {/* SIDEBAR */}
                <div className={`w-full md:w-80 flex-shrink-0 flex flex-col border-r h-full ${selectedContact || (view === 'team_chat' && mobileTeamChatActive && window.innerWidth < 768) ? 'hidden md:flex' : 'flex'} ${isDark
                    ? 'border-white/5 bg-slate-900/30 backdrop-blur-md'
                    : 'border-slate-200 bg-slate-50'}`}>

                    {/* Company indicator */}
                    <div className={`px-5 pb-4 safe-pt-header flex items-center gap-3 border-b backdrop-blur-sm ${isDark ? 'border-white/5 bg-white/5' : 'border-slate-200 bg-white'}`} id="tour-company-info">
                        {companyConfig.logoUrl ? (
                            <img
                                src={companyConfig.logoUrl}
                                alt={companyConfig.companyName}
                                className="h-8 max-w-[120px] object-contain rounded-lg"
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                        ) : (
                            <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
                                <Building2 className="w-4 h-4 text-white" />
                            </div>
                        )}
                        <span className={`font-semibold text-sm tracking-wide ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>{companyConfig.companyName}</span>
                    </div>

                    {/* Sidebar content */}
                    <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
                        <Sidebar
                            user={user} socket={socket}
                            onSelectContact={(c) => { setSelectedContact(c); setView('chat'); }}
                            selectedContactId={selectedContact?.id}
                            isConnected={isConnected} onlineUsers={onlineUsers} typingStatus={typingStatus}
                            setView={setView}
                            currentView={view}
                            selectedAccountId={selectedAccountId}
                            onSelectAccount={setSelectedAccountId}
                            teamChannel={teamChannel}
                            setTeamChannel={(channel) => {
                                setTeamChannel(channel);
                                setMobileTeamChatActive(true);
                            }}
                        />
                    </div>

                    {/* Footer */}
                    <div className={`p-4 border-t flex gap-3 z-20 items-center justify-between ${isDark ? 'border-white/5 bg-black/20 backdrop-blur-md' : 'border-slate-200 bg-slate-100'}`}>
                        <button id="tour-settings-btn" onClick={() => setView('settings')} className={`p-2.5 rounded-xl transition-all ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`} title="Configuración">
                            <SettingsIcon className="w-5 h-5" />
                        </button>

                        <div id="tour-user-profile" className={`flex items-center gap-3 px-4 py-2 rounded-xl border flex-1 justify-center ${isDark ? 'bg-white/5 border-white/5' : 'bg-white border-slate-200'}`}>
                            <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5)] ${isConnected ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 animate-pulse shadow-red-500/50'}`}></div>
                            <span className={`text-xs font-bold truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{user.username}</span>
                        </div>

                        <button onClick={handleLogout} className={`p-2.5 rounded-xl transition-all ${isDark ? 'text-slate-400 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-500 hover:text-red-600 hover:bg-red-50'}`} title="Cerrar sesión">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* MAIN AREA */}
                <main className={`flex-1 flex-col min-w-0 relative ${selectedContact || (view === 'team_chat' && mobileTeamChatActive && window.innerWidth < 768) || (view === 'team_chat' && window.innerWidth >= 768) ? 'flex' : 'hidden md:flex'} ${isDark ? 'bg-slate-900/20 backdrop-blur-sm' : 'bg-white'}`}>
                    <div className="flex-1 overflow-hidden relative flex flex-col h-full">
                        {!isConnected && <div className="absolute top-0 left-0 right-0 bg-red-500/90 backdrop-blur-sm text-white text-xs text-center z-50 flex items-center justify-center gap-2 font-bold shadow-lg safe-pt-2 pb-2"><div className="w-4 h-4 flex items-center justify-center"><WifiOff className="w-3 h-3" /></div><span>Sin conexión con el servidor.</span></div>}

                        {view === 'team_chat' ? (
                            <div className="flex flex-col h-full w-full relative">
                                <button onClick={() => setMobileTeamChatActive(false)} className="md:hidden absolute safe-top-4 left-4 z-50 p-2.5 rounded-full shadow-lg border border-white/10 bg-slate-800 text-slate-300 active:scale-95 transition-transform"><ArrowLeft className="w-5 h-5" /></button>
                                <TeamChat socket={socket} user={user} channel={teamChannel} />
                            </div>
                        )
                            : selectedContact ? (
                                // @ts-ignore
                                <ChatWindow
                                    socket={socket}
                                    user={user}
                                    contact={selectedContact}
                                    config={config}
                                    onBack={() => setSelectedContact(null)}
                                    onlineUsers={onlineUsers}
                                    typingInfo={typingStatus}
                                    onOpenTemplates={() => setShowTemplates(true)}
                                    quickReplies={quickReplies}
                                    currentAccountId={selectedContact.origin_phone_id || selectedAccountId || undefined}
                                    updateMyPreferences={updateMyPreferences}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                                    <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 flex items-center justify-center mb-6 animate-pulse">
                                        <MessageCircle className="w-12 h-12 text-indigo-400/50" />
                                    </div>
                                    <p className="font-semibold text-xl text-slate-300">Selecciona un chat</p>
                                    <p className="text-sm mt-2 text-slate-500 max-w-xs text-center">Gestiona tus comunicaciones o abre el menú para ver el Chat de Equipo</p>
                                </div>
                            )}
                    </div>
                </main>
            </div>

            {/* TEMPLATE SELECTOR MODAL */}
            <ChatTemplateSelector
                isOpen={showTemplates}
                onClose={() => setShowTemplates(false)}
                targetPhone={selectedContact?.phone || ""}
                senderName={user.username}
                // @ts-ignore
                originPhoneId={selectedContact?.origin_phone_id || selectedAccountId || undefined}
            />

            {/* Incoming call handler */}
            <IncomingCallHandler />

            {/* Centro de alertas — solo visible para admins. Escucha team_alert por socket. */}
            <AlertCenter socket={socket} isAdmin={user.role?.toLowerCase() === 'admin'} />

            {/* Toast de nuevas citas (Laura y manual). Al pinchar abre el calendario en el día. */}
            {appointmentToastNode}

            {/* THEME SELECTION - STRICT BLOCKING */}
            {showThemeModal && (
                <div className="fixed inset-0 z-[100] bg-black">
                    <ThemeSelectionModal onComplete={handleTourComplete} />
                </div>
            )}
        </div>
    );
}

function AppWithErrorBoundary() {
    return (
        <ThemeProvider>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </ThemeProvider>
    );
}

export default AppWithErrorBoundary;