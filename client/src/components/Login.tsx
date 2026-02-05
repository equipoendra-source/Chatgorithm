import React, { useState, useEffect } from 'react';
import { User, Lock, LogIn, Loader2, Plus, Building2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface Agent {
    id: string;
    name: string;
    role: string;
    hasPassword?: boolean;
    preferences?: any;
}

interface LoginProps {
    onLogin: (username: string, role: string, password: '', remember: boolean, preferences: any) => void;
    socket: any;
    companyName?: string;
    onCompanyLogout?: () => void;
}

export function Login({ onLogin, socket, companyName, onCompanyLogout }: LoginProps) {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [remember, setRemember] = useState(true);

    // Estado para modo manual (si no encuentra el usuario en la lista)
    const [isManual, setIsManual] = useState(false);
    const [manualUser, setManualUser] = useState('');

    const { theme } = useTheme();
    const isDark = theme === 'dark';

    useEffect(() => {
        if (socket) {
            setIsLoading(true);
            socket.emit('request_agents');

            const handleAgents = (list: Agent[]) => {
                setAgents(list);
                setIsLoading(false);
            };

            socket.on('agents_list', handleAgents);

            // Cleanup
            return () => {
                socket.off('agents_list', handleAgents);
            };
        }
    }, [socket]);

    const handleLoginAttempt = (agentName: string, pwd: string) => {
        setIsLoading(true);
        setError('');

        socket.emit('login_attempt', { name: agentName, password: pwd });

        socket.once('login_success', (data: { username: string, role: string, preferences: any }) => {
            setIsLoading(false);
            onLogin(data.username, data.role, '', remember, data.preferences || {});
        });

        socket.once('login_error', (msg: string) => {
            setIsLoading(false);
            setError(msg || 'Error de autenticación');
            if (msg) setPassword('');
        });
    };

    const handleCardClick = (agent: Agent) => {
        if (agent.hasPassword) {
            setSelectedAgent(agent);
            setError('');
            setPassword('');
        } else {
            // Login directo si no tiene password
            handleLoginAttempt(agent.name, '');
        }
    };

    const handlePasswordSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedAgent) {
            handleLoginAttempt(selectedAgent.name, password);
        } else if (isManual) {
            handleLoginAttempt(manualUser, password);
        }
    };

    const handleCompanyLogoutClick = () => {
        if (onCompanyLogout) {
            const confirmed = window.confirm(
                '¿Estás seguro de que quieres cerrar la sesión de la cuenta de empresa?\n\nTendrás que volver a introducir el ID de empresa y contraseña para acceder.'
            );
            if (confirmed) {
                onCompanyLogout();
            }
        }
    };

    return (
        <div className="w-full flex flex-col items-center justify-center font-sans relative z-10">

            {/* Company indicator */}
            {companyName && (
                <div className={`fixed top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${isDark
                    ? 'bg-slate-800/80 text-slate-300 border border-slate-700'
                    : 'bg-white/80 text-slate-600 border border-slate-200 shadow-sm'
                    }`}>
                    <Building2 className="w-3.5 h-3.5" />
                    <span>{companyName}</span>
                </div>
            )}

            <div className="mb-10 text-center relative">
                <div className="w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-6 overflow-hidden p-2 glass-panel border-white/10">
                    <img
                        src="/logo.png"
                        alt="Chatgorithm"
                        className="w-full h-full object-contain drop-shadow-md"
                    />
                </div>
                <h1 className={`text-4xl font-extrabold mb-2 tracking-tight ${isDark ? 'text-white' : 'text-slate-800'
                    }`}>Chatgorithm</h1>
                <p className={`text-lg font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Selecciona tu perfil para comenzar
                </p>
            </div>

            <div className="z-10 w-full max-w-6xl flex justify-center">
                {isLoading && agents.length === 0 ? (
                    <div className={`flex flex-col items-center gap-3 animate-pulse ${isDark ? 'text-slate-500' : 'text-slate-400'
                        }`}>
                        <Loader2 className="animate-spin w-8 h-8" />
                        <span className="font-medium">Cargando equipo...</span>
                    </div>
                ) : !selectedAgent && !isManual ? (
                    <div className="flex flex-wrap justify-center gap-6 w-full max-w-4xl px-4 perspective-1000">
                        {agents.map(agent => (
                            <button
                                key={agent.id}
                                onClick={() => handleCardClick(agent)}
                                className={`relative group w-40 h-52 rounded-3xl transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl flex flex-col items-center justify-center gap-4 border overflow-hidden ${isDark
                                    ? 'bg-slate-800/40 backdrop-blur-md border-white/5 shadow-xl shadow-black/20'
                                    : 'bg-white border-slate-100 shadow-lg hover:shadow-blue-200'
                                    }`}
                            >
                                {/* Gradient overlay on hover */}
                                <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${isDark
                                    ? 'bg-gradient-to-br from-blue-600/20 via-purple-600/10 to-transparent'
                                    : 'bg-gradient-to-br from-blue-50 to-white'
                                    }`}></div>

                                {/* Border glow effect for dark mode */}
                                {isDark && <div className="absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-transparent"></div>}

                                <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold transition-all duration-300 shadow-lg relative z-10 ${isDark
                                    ? 'bg-gradient-to-br from-slate-700 to-slate-800 text-slate-300 border border-slate-600/50 group-hover:from-blue-600 group-hover:to-purple-600 group-hover:text-white group-hover:border-transparent group-hover:shadow-blue-500/25'
                                    : 'bg-slate-100 text-slate-600 group-hover:bg-blue-600 group-hover:text-white'
                                    }`}>
                                    {agent.name.charAt(0).toUpperCase()}
                                </div>

                                <div className="text-center relative z-10 px-4">
                                    <h3 className={`font-bold text-base px-2 truncate w-full transition-colors ${isDark
                                        ? 'text-white group-hover:text-blue-400'
                                        : 'text-slate-800 group-hover:text-blue-700'
                                        }`}>{agent.name}</h3>
                                    <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mt-2 inline-block transition-all ${isDark
                                        ? 'bg-slate-700/80 text-slate-400 border border-slate-600/50 group-hover:bg-blue-500/20 group-hover:text-blue-300 group-hover:border-blue-500/50'
                                        : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-blue-500'
                                        }`}>{agent.role}</span>
                                </div>

                                {agent.hasPassword && (
                                    <div className={`absolute top-4 right-4 transition-colors ${isDark
                                        ? 'text-slate-500 group-hover:text-blue-400'
                                        : 'text-slate-300 group-hover:text-blue-400'
                                        }`}>
                                        <Lock size={16} />
                                    </div>
                                )}
                            </button>
                        ))}

                        {/* Botón para login manual */}
                        <button
                            onClick={() => setIsManual(true)}
                            className={`w-40 h-52 rounded-3xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-3 group ${isDark
                                ? 'bg-slate-800/30 backdrop-blur-xl border-slate-600/50 hover:border-blue-500/50 hover:bg-slate-800/50 text-slate-500 hover:text-blue-400'
                                : 'bg-slate-50/50 border-slate-300 hover:border-slate-400 hover:bg-slate-100 text-slate-400 hover:text-slate-600'
                                }`}
                        >
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform ${isDark
                                ? 'bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/50 group-hover:from-blue-600/50 group-hover:to-purple-600/50 group-hover:border-blue-500/50'
                                : 'bg-white'
                                }`}>
                                <Plus size={28} />
                            </div>
                            <span className="font-bold text-sm">Otro Usuario</span>
                        </button>
                    </div>
                ) : (
                    // PANTALLA DE LOGIN CONTRASEÑA
                    <div className={`p-8 rounded-3xl w-full max-w-sm animate-in fade-in zoom-in-95 duration-300 relative ${isDark
                        ? 'glass-panel'
                        : 'bg-white border-slate-100 border shadow-2xl'
                        }`}>
                        <button
                            onClick={() => { setSelectedAgent(null); setIsManual(false); setError(''); setPassword(''); }}
                            className={`absolute top-6 left-6 p-2 rounded-full transition ${isDark
                                ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
                                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                                }`}
                            title="Volver"
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                        </button>

                        <div className="text-center mb-8 mt-4">
                            {selectedAgent ? (
                                <>
                                    <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center text-4xl font-bold text-blue-600 mx-auto mb-4 border-4 border-white shadow-lg">
                                        {selectedAgent.name.charAt(0).toUpperCase()}
                                    </div>
                                    <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{selectedAgent.name}</h2>
                                    <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Introduce tu contraseña</p>
                                </>
                            ) : (
                                <>
                                    <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${isDark ? 'bg-slate-700 text-slate-500' : 'bg-slate-100 text-slate-400'
                                        }`}>
                                        <User className="w-10 h-10" />
                                    </div>
                                    <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Acceso Manual</h2>
                                </>
                            )}
                        </div>

                        <form onSubmit={handlePasswordSubmit} className="space-y-5">
                            {isManual && (
                                <div>
                                    <label className={`text-xs font-bold uppercase ml-2 mb-1 block ${isDark ? 'text-slate-500' : 'text-slate-400'
                                        }`}>Usuario</label>
                                    <input
                                        autoFocus
                                        type="text"
                                        value={manualUser}
                                        onChange={e => setManualUser(e.target.value)}
                                        className={`w-full p-4 outline-none font-medium ${isDark
                                            ? 'glass-input'
                                            : 'bg-slate-50 border-slate-200 text-slate-700 border rounded-xl focus:ring-2 focus:ring-blue-500'
                                            }`}
                                        placeholder="Ej: Admin"
                                    />
                                </div>
                            )}

                            <div>
                                <label className={`text-xs font-bold uppercase ml-2 mb-1 block ${isDark ? 'text-slate-500' : 'text-slate-400'
                                    }`}>Contraseña</label>
                                <input
                                    autoFocus={!isManual}
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className={`w-full p-4 outline-none font-medium tracking-wider ${isDark
                                        ? 'glass-input'
                                        : 'bg-slate-50 border-slate-200 text-slate-700 border rounded-xl focus:ring-2 focus:ring-blue-500'
                                        }`}
                                    placeholder="••••••"
                                />
                            </div>

                            {error && <div className="bg-red-50 text-red-500 text-sm p-4 rounded-xl text-center font-bold animate-pulse border border-red-100">{error}</div>}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className={`w-full font-bold py-4 shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 text-lg ${isDark
                                    ? 'glass-button'
                                    : 'bg-slate-900 hover:bg-slate-800 text-white shadow-slate-200 rounded-xl'
                                    }`}
                            >
                                {isLoading ? <Loader2 className="animate-spin" /> : <LogIn size={22} />}
                                {isLoading ? 'Verificando...' : 'Entrar'}
                            </button>
                        </form>
                    </div>
                )}
            </div>

            {/* Footer with company logout button */}
            <div className="fixed bottom-6 z-10 flex flex-col items-center gap-3">
                {onCompanyLogout && (
                    <button
                        onClick={handleCompanyLogoutClick}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium transition-all hover:scale-105 ${isDark
                            ? 'bg-slate-800/80 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/50'
                            : 'bg-white/80 text-slate-500 hover:text-red-500 border border-slate-200 hover:border-red-200 shadow-sm'
                            }`}
                    >
                        <Building2 className="w-3.5 h-3.5" />
                        Cambiar Empresa
                    </button>
                )}
                <span className={`text-xs font-medium tracking-wide ${isDark ? 'text-slate-600' : 'text-slate-400'
                    }`}>
                    © 2026 Chatgorithm • Secure System
                </span>
            </div>
        </div>
    );
}