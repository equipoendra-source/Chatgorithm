import { useState, useEffect, useRef } from 'react';
import {
    Users, Search, RefreshCw, UserCheck, Briefcase, Filter as FilterIcon,
    Smartphone, UserPlus, Upload, FileSpreadsheet, Phone, MessageSquare,
    User, ChevronDown, CheckCircle, Hash, Calendar as CalendarIcon, X
} from 'lucide-react';
import { PhoneDialer } from './PhoneDialer';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';

export interface Contact {
    id: string;
    phone: string;
    name?: string;
    status?: string;
    department?: string;
    assigned_to?: string;
    last_message?: any;
    last_message_time?: string;
    avatar?: string;
    email?: string;
    address?: string;
    notes?: string;
    signup_date?: string;
    tags?: string[];
    origin_phone_id?: string;
    unread_count?: number; // Added field
}

interface Agent { id: string; name: string; }
interface ConfigItem { id: string; name: string; type: string; }

interface SidebarProps {
    user: { username: string, role: string; preferences?: any };
    socket: any;
    onSelectContact: (contact: Contact) => void;
    selectedContactId?: string;
    isConnected?: boolean;
    onlineUsers: string[];
    typingStatus: { [chatId: string]: string };
    setView: (view: 'chat' | 'settings' | 'calendar' | 'team_chat') => void;
    currentView?: string;

    selectedAccountId: string | null;
    onSelectAccount: (id: string | null) => void;

    // Nuevas props para el Chat de Equipo integrado
    teamChannel?: string;
    setTeamChannel?: (channel: string) => void;
}

type ViewScope = 'all' | 'mine' | 'unassigned';

const normalizePhone = (phone: string) => {
    if (!phone) return "";
    return phone.replace(/\D/g, "");
};

const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '';
        const today = new Date();
        const isToday = date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear();
        if (isToday) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    } catch { return ''; }
};

const getInitial = (name?: any, phone?: any) => String(name || phone || "?").charAt(0).toUpperCase();

const cleanMessagePreview = (msg: any) => {
    if (!msg) return "Haz clic para ver";
    if (typeof msg === 'string') return msg.includes('[object Object]') ? "Mensaje" : msg;
    if (typeof msg === 'object') return "Mensaje";
    return String(msg);
};

export function Sidebar({
    user,
    socket,
    onSelectContact,
    selectedContactId,
    isConnected = true,
    onlineUsers = [],
    typingStatus = {},
    setView,
    currentView,
    selectedAccountId,
    onSelectAccount,
    teamChannel,
    setTeamChannel
}: SidebarProps) {

    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // State for initial load
    const [isLoadingContacts, setIsLoadingContacts] = useState(true);

    const [viewScope, setViewScope] = useState<ViewScope>('mine');
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [accounts, setAccounts] = useState<{ id: string, name: string }[]>([]);

    // Lista de Agentes para el Chat de Equipo
    const [teamAgents, setTeamAgents] = useState<Agent[]>([]);

    // Modales
    const [showAddContact, setShowAddContact] = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [showDialer, setShowDialer] = useState(false);

    // Forms
    const [newContactPhone, setNewContactPhone] = useState('');
    const [newContactName, setNewContactName] = useState('');
    const [newContactEmail, setNewContactEmail] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Importación
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);

    // Filtros
    const [activeFilters, setActiveFilters] = useState({ department: '', status: '', tag: '', agent: '' });
    const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
    const [availableDepts, setAvailableDepts] = useState<string[]>([]);
    const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [unreadCounts, setUnreadCounts] = useState<{ [phone: string]: number }>({});
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        audioRef.current = new Audio('/notification.mp3');
    }, []);

    // Actualizar unreadCounts cuando llegan contactos con info persistida
    useEffect(() => {
        const newUnreads: { [phone: string]: number } = {};
        contacts.forEach(c => {
            if (c.unread_count && c.unread_count > 0) {
                // Usamos normalizePhone para asegurar coincidencia con keys
                newUnreads[normalizePhone(c.phone)] = c.unread_count;
            }
        });
        // Mezclamos con lo que ya teníamos en memoria por si acaso, pero damos prioridad a lo que viene del server si es mayor?
        // No, mejor reemplazamos o sumamos. Si el server trae la verdad, usamos el server.
        // Pero el server solo actualiza al cargar.
        // Si ya tenemos un conteo local mayor, lo mantenemos?
        // Simplificación: al recibir lista completa, usamos sus contadores.
        if (Object.keys(newUnreads).length > 0) {
            setUnreadCounts(prev => ({ ...prev, ...newUnreads }));
        }
    }, [contacts]);

    // Cleanup unread count when viewing
    useEffect(() => {
        if (selectedContactId && contacts.length > 0) {
            const contact = contacts.find(c => c.id === selectedContactId);
            if (contact) {
                const phone = normalizePhone(contact.phone);
                if (unreadCounts[phone] > 0) {
                    setUnreadCounts(prev => {
                        const n = { ...prev };
                        delete n[phone];
                        return n;
                    });
                    // Notify server to clear persistent count
                    if (socket) socket.emit('mark_read', { phone: contact.phone });
                }
            }
        }
    }, [selectedContactId, contacts, unreadCounts, socket]);

    useEffect(() => {
        if (socket && isConnected) {
            socket.emit('request_contacts');
            socket.emit('request_agents');
            socket.emit('request_config');
            fetch(`${API_URL}/accounts`).then(r => r.json()).then(setAccounts).catch(() => { });
        }
    }, [socket, isConnected]);

    useEffect(() => {
        if (selectedContactId) {
            const contact = contacts.find(c => c.id === selectedContactId);
            if (contact) {
                const cleanP = normalizePhone(contact.phone);
                setUnreadCounts(prev => { const n = { ...prev }; delete n[cleanP]; return n; });
            }
        }
    }, [selectedContactId, contacts]);

    useEffect(() => {
        audioRef.current = new Audio('/notification.mp3');
        // Web Notification API - solo disponible en navegadores web
        try {
            if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
                Notification.requestPermission();
            }
        } catch (e) {
            console.log('Web Notifications not available');
        }
        if (!socket) return;

        const handleContactsUpdate = (d: any) => {
            if (Array.isArray(d)) {
                setContacts(d);
                setIsLoadingContacts(false);
            }
        };
        const handleAgents = (l: any) => {
            setAvailableAgents(l);
            setTeamAgents(l); // Guardamos también para el chat de equipo
        };
        const handleConfig = (l: any[]) => {
            setAvailableDepts(l.filter(i => i.type === 'Department').map(i => i.name));
            setAvailableStatuses(l.filter(i => i.type === 'Status').map(i => i.name));
            setAvailableTags(l.filter(i => i.type === 'Tag').map(i => i.name));
        };

        socket.on('contacts_update', handleContactsUpdate);
        socket.on('agents_list', handleAgents);
        socket.on('config_list', handleConfig);
        socket.on('contact_updated_notification', () => socket.emit('request_contacts'));

        // FIX: Named function to avoid unbinding ALL message listeners
        const handleSidebarMessage = (msg: any) => {
            const isMe = msg.sender === 'Agente' || msg.sender === user.username;
            if (!isMe) {
                let shouldNotify = true;
                const prefs = user.preferences || {};
                const contact = contacts.find(c => normalizePhone(c.phone) === normalizePhone(msg.sender));
                if (prefs.departments && prefs.departments.length > 0) {
                    if (contact && contact.department && !prefs.departments.includes(contact.department)) shouldNotify = false;
                }
                if (prefs.phoneIds && prefs.phoneIds.length > 0) {
                    if (msg.origin_phone_id && !prefs.phoneIds.includes(msg.origin_phone_id)) shouldNotify = false;
                }
                const isNewLead = contact?.status === 'Nuevo';
                if (isNewLead) {
                    if (prefs.notifyNewLeads === false) shouldNotify = false;
                    else shouldNotify = true;
                }
                if (shouldNotify) audioRef.current?.play().catch(() => { });
                const senderClean = normalizePhone(msg.sender);
                const currentContact = contacts.find(c => c.id === selectedContactId);
                const currentContactPhoneClean = currentContact ? normalizePhone(currentContact.phone) : null;
                if (senderClean !== currentContactPhoneClean) setUnreadCounts(prev => ({ ...prev, [senderClean]: (prev[senderClean] || 0) + 1 }));
            }
            socket.emit('request_contacts');
        };

        socket.on('message', handleSidebarMessage);

        const interval = setInterval(() => { if (isConnected) socket.emit('request_contacts'); }, 10000);

        return () => {
            socket.off('contacts_update', handleContactsUpdate);
            socket.off('agents_list', handleAgents);
            socket.off('config_list', handleConfig);
            socket.off('contact_updated_notification');
            socket.off('message', handleSidebarMessage); // FIX: Only remove THIS listener
            clearInterval(interval);
        };
    }, [socket, user.username, isConnected, selectedContactId, contacts, user.preferences]);

    const handleCreateContact = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanInput = newContactPhone.replace(/\D/g, '');
        if (cleanInput.length < 10 || cleanInput.length > 15) {
            alert("El número debe tener entre 10 y 15 dígitos numéricos.");
            return;
        }
        setIsCreating(true);
        try {
            const res = await fetch(`${API_URL}/contacts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: cleanInput,
                    name: newContactName,
                    email: newContactEmail,
                    originPhoneId: selectedAccountId || (accounts.length > 0 ? accounts[0].id : undefined)
                })
            });
            const data = await res.json();
            if (res.ok) {
                setShowAddContact(false);
                setNewContactPhone(''); setNewContactName(''); setNewContactEmail('');
                socket.emit('request_contacts');
                alert("Contacto guardado correctamente.");
            } else {
                alert("❌ Error: " + (data.error || "No se pudo crear."));
            }
        } catch (e) { alert("Error de conexión al crear contacto"); }
        finally { setIsCreating(false); }
    };

    const handleImport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!importFile) return;
        setImporting(true);
        const formData = new FormData();
        formData.append('file', importFile);
        formData.append('originPhoneId', selectedAccountId || accounts[0]?.id || 'default');
        try {
            const res = await fetch(`${API_URL}/contacts/import`, { method: 'POST', body: formData });
            const d = await res.json();
            if (d.success) {
                alert(`Importación completada: ${d.count} contactos.`);
                setShowImport(false);
                setImportFile(null);
                socket.emit('request_contacts');
            } else { alert("Error: " + d.error); }
        } catch (e) { alert("Error de conexión"); }
        finally { setImporting(false); }
    };

    const filteredContacts = contacts.filter(c => {
        if (selectedAccountId) {
            if (c.origin_phone_id && c.origin_phone_id !== selectedAccountId) return false;
        }
        const matchesSearch = (c.name || "").toLowerCase().includes(searchQuery.toLowerCase()) || (c.phone || "").includes(searchQuery);
        if (!matchesSearch) return false;
        if (viewScope === 'mine' && c.assigned_to !== user.username) return false;
        if (viewScope === 'unassigned' && c.assigned_to) return false;
        if (activeFilters.department && c.department !== activeFilters.department) return false;
        if (activeFilters.status && c.status !== activeFilters.status) return false;
        if (activeFilters.agent && c.assigned_to !== activeFilters.agent) return false;
        if (activeFilters.tag && (!c.tags || !c.tags.includes(activeFilters.tag))) return false;
        return true;
    });

    const updateFilter = (key: keyof typeof activeFilters, value: string) => {
        setActiveFilters(prev => ({ ...prev, [key]: value }));
    };

    const hasActiveFilters = Object.values(activeFilters).some(v => v !== '');

    const handleLineChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val === 'team_chat') {
            setView('team_chat');
        } else {
            setView('chat');
            onSelectAccount(val || null);
        }
    };

    return (
        <div className={`flex flex-col h-full w-full border-r ${isDark
            ? 'bg-transparent border-white/5'
            : 'bg-slate-50 border-gray-200'
            }`}>

            {/* HEADER */}
            <div className={`p-4 border-b shrink-0 ${isDark
                ? 'border-white/5 bg-slate-900/40 backdrop-blur-md'
                : 'border-gray-200 bg-white'
                }`}>
                <div className="mb-4">
                    <label className={`text-[10px] font-bold uppercase tracking-wide mb-1 block ${isDark
                        ? 'text-slate-500'
                        : 'text-slate-400'
                        }`}>
                        Canal Activo
                    </label>
                    <div className="flex gap-2" id="tour-line-selector">
                        <div className="relative flex-1">
                            <Smartphone className={`absolute left-3 top-2.5 w-4 h-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
                            <select
                                value={currentView === 'team_chat' ? 'team_chat' : (selectedAccountId || '')}
                                onChange={handleLineChange}
                                className={`w-full pl-9 pr-8 py-2 border-none rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer ${isDark
                                    ? 'glass-input hover:bg-slate-800/50'
                                    : 'bg-slate-100 text-slate-700'
                                    }`}
                            >
                                <option value="">Todas las Líneas</option>
                                {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.id.slice(-4)})</option>
                                ))}
                                <option disabled>──────────</option>
                                <option value="team_chat">👥 Chat Interno</option>
                            </select>
                            <ChevronDown className={`absolute right-3 top-3 w-3 h-3 pointer-events-none ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                        </div>

                        <div className="flex gap-1">
                            <button onClick={() => setShowDialer(true)} className={`p-2 rounded-lg transition shadow-sm border ${isDark
                                ? 'bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30'
                                : 'bg-purple-50 text-purple-600 border-purple-100 hover:bg-purple-100'
                                }`} title="Teléfono">
                                <Phone size={18} />
                            </button>
                            <button onClick={() => setShowAddContact(true)} className={`p-2 rounded-lg transition shadow-sm border ${isDark
                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30'
                                : 'bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100'
                                }`} title="Nuevo Contacto">
                                <UserPlus size={18} />
                            </button>
                            <button onClick={() => setShowImport(true)} className={`p-2 rounded-lg transition shadow-sm border ${isDark
                                ? 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30'
                                : 'bg-green-50 text-green-600 border-green-100 hover:bg-green-100'
                                }`} title="Importar CSV">
                                <Upload size={18} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* --- RENDERIZADO CONDICIONAL DE LA LISTA LATERAL --- */}

                {/* CASO 1: ESTAMOS EN CHAT DE EQUIPO (Muestra Canales) */}
                {currentView === 'team_chat' && (
                    <div className="animate-in fade-in">
                        <h2 className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-3">
                            Canales de Equipo
                        </h2>
                    </div>
                )}

                {/* CASO 2: ESTAMOS EN CHATS DE CLIENTES (Muestra Filtros) */}
                {currentView !== 'team_chat' && (
                    <>
                        <h2 className={`text-xs font-bold uppercase tracking-wider mb-3 flex justify-between items-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            Bandeja de Entrada
                            {!isConnected && <span className="text-[10px] text-red-500 animate-pulse font-bold flex items-center gap-1">● Sin conexión</span>}
                        </h2>

                        <div className="relative mb-3">
                            <Search className={`w-4 h-4 absolute left-3 top-2.5 ${isDark ? 'text-slate-400' : 'text-slate-400'}`} />
                            <input
                                type="text"
                                placeholder="Buscar chat..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className={`w-full pl-9 pr-4 py-2 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all ${isDark
                                    ? 'glass-input'
                                    : 'bg-slate-100 placeholder:text-slate-400'
                                    }`}
                            />
                        </div>

                        <div className="flex gap-2 items-center">
                            <div className={`flex p-1 rounded-xl flex-1 ${isDark ? 'glass-panel border-white/5' : 'bg-slate-100'}`}>
                                <button onClick={() => setViewScope('all')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all ${viewScope === 'all'
                                    ? (isDark ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-800 shadow-sm')
                                    : (isDark ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')
                                    }`}>Todos</button>
                                <button onClick={() => setViewScope('mine')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${viewScope === 'mine'
                                    ? (isDark ? 'bg-violet-600 text-white shadow-sm' : 'bg-white text-blue-600 shadow-sm')
                                    : (isDark ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')
                                    }`}>Míos</button>
                                <button onClick={() => setViewScope('unassigned')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${viewScope === 'unassigned'
                                    ? (isDark ? 'bg-orange-600 text-white shadow-sm' : 'bg-white text-orange-600 shadow-sm')
                                    : (isDark ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700')
                                    }`}>Libres</button>
                            </div>

                            <button onClick={() => setShowFilters(!showFilters)} className={`p-2 rounded-xl transition-all border ${showFilters || hasActiveFilters
                                ? (isDark ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-600')
                                : (isDark ? 'glass-button-secondary' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50')
                                }`} id="tour-filters">
                                {hasActiveFilters ? <FilterIcon className="w-4 h-4 fill-current" /> : <FilterIcon className="w-4 h-4" />}
                            </button>
                        </div>

                        {showFilters && (
                            <div className={`mt-3 p-3 rounded-xl border space-y-2 animate-in slide-in-from-top-2 fade-in duration-200 ${isDark
                                ? 'bg-slate-800/50 border-slate-700'
                                : 'bg-slate-50 border-slate-200'
                                }`}>
                                <div className="flex justify-between items-center mb-1">
                                    <span className={`text-[10px] font-bold uppercase ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Filtrar por:</span>
                                    {hasActiveFilters && <button onClick={() => setActiveFilters({ department: '', status: '', tag: '', agent: '' })} className="text-[10px] text-red-500 hover:underline">Borrar filtros</button>}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="relative">
                                        <select value={activeFilters.department} onChange={(e) => updateFilter('department', e.target.value)} className={`w-full appearance-none pl-7 pr-4 py-1.5 border rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none ${isDark
                                            ? 'bg-slate-700 border-slate-600 text-slate-300'
                                            : 'bg-white border-slate-200 text-slate-700'
                                            }`}>
                                            <option value="">Depto</option>
                                            {availableDepts.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                        <Briefcase className={`w-3 h-3 absolute left-2 top-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                                    </div>
                                    <div className="relative">
                                        <select value={activeFilters.status} onChange={(e) => updateFilter('status', e.target.value)} className={`w-full appearance-none pl-7 pr-4 py-1.5 border rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none ${isDark
                                            ? 'bg-slate-700 border-slate-600 text-slate-300'
                                            : 'bg-white border-slate-200 text-slate-700'
                                            }`}>
                                            <option value="">Estado</option>
                                            {availableStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                        <CheckCircle className={`w-3 h-3 absolute left-2 top-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                                    </div>
                                    <div className="relative">
                                        <select value={activeFilters.tag} onChange={(e) => updateFilter('tag', e.target.value)} className={`w-full appearance-none pl-7 pr-4 py-1.5 border rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none ${isDark
                                            ? 'bg-slate-700 border-slate-600 text-slate-300'
                                            : 'bg-white border-slate-200 text-slate-700'
                                            }`}>
                                            <option value="">Etiqueta</option>
                                            {availableTags.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                        <Hash className={`w-3 h-3 absolute left-2 top-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                                    </div>
                                    <div className="relative">
                                        <select value={activeFilters.agent} onChange={(e) => updateFilter('agent', e.target.value)} className={`w-full appearance-none pl-7 pr-4 py-1.5 border rounded-lg text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none ${isDark
                                            ? 'bg-slate-700 border-slate-600 text-slate-300'
                                            : 'bg-white border-slate-200 text-slate-700'
                                            }`}>
                                            <option value="">Agente</option>
                                            {availableAgents.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                                        </select>
                                        <User className={`w-3 h-3 absolute left-2 top-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* LISTA (CONTENIDO VARIABLE) */}
            <div className="flex-1 overflow-y-auto min-h-0" id="tour-chat-list">

                {/* LISTA MODO TEAM CHAT */}
                {currentView === 'team_chat' ? (
                    <div className="p-2 space-y-4">
                        {/* Canal General */}
                        <button
                            onClick={() => setTeamChannel && setTeamChannel('general')}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${teamChannel === 'general' ? (isDark ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-700 shadow-sm' : 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-sm') : (isDark ? 'text-slate-400 hover:bg-slate-700/50 border border-transparent' : 'text-slate-600 hover:bg-slate-50 border border-transparent')}`}
                        >
                            <div className={`p-2 rounded-full ${teamChannel === 'general' ? (isDark ? 'bg-indigo-800 text-white' : 'bg-indigo-200') : (isDark ? 'bg-slate-700' : 'bg-slate-200')}`}>
                                <Hash size={18} />
                            </div>
                            <span className="font-bold text-sm">General</span>
                        </button>

                        <div className="h-px bg-slate-100 mx-2"></div>

                        {/* Lista de Compañeros */}
                        <div>
                            <p className="px-3 text-xs font-bold text-slate-400 uppercase mb-2">Mensajes Directos</p>
                            <div className="space-y-1">
                                {teamAgents.filter(a => a.name !== user.username).map(agent => {
                                    const isSelected = teamChannel === agent.name;
                                    const isUserOnline = onlineUsers.includes(agent.name);
                                    return (
                                        <button
                                            key={agent.id}
                                            onClick={() => setTeamChannel && setTeamChannel(agent.name)}
                                            className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all ${isSelected ? (isDark ? 'bg-indigo-900/40 text-indigo-300 font-bold' : 'bg-indigo-50 text-indigo-700 font-bold') : (isDark ? 'text-slate-400 hover:bg-slate-700/50' : 'text-slate-600 hover:bg-slate-50')}`}
                                        >
                                            <div className="relative">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500'}`}>
                                                    {agent.name.charAt(0).toUpperCase()}
                                                </div>
                                                {isUserOnline && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white"></span>}
                                            </div>
                                            <span className="text-sm truncate">{agent.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ) : (
                    /* LISTA MODO CONTACTOS (NORMAL) */
                    <>
                        {filteredContacts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-40 text-slate-400 text-sm p-6 text-center">
                                <div className={`p-3 rounded-full mb-2 ${isConnected ? (isDark ? 'bg-slate-800' : 'bg-slate-100') : 'bg-red-50'}`}>
                                    {!isConnected ? (
                                        <RefreshCw className="w-5 h-5 text-red-400" />
                                    ) : isLoadingContacts ? (
                                        <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                                    ) : hasActiveFilters ? (
                                        <FilterIcon className="w-5 h-5 text-slate-400" />
                                    ) : (
                                        <MessageSquare className="w-5 h-5 text-slate-400" />
                                    )}
                                </div>
                                <p>
                                    {!isConnected ? "Esperando conexión..." :
                                        isLoadingContacts ? "Cargando chats..." :
                                            hasActiveFilters ? "No hay chats con estos filtros" :
                                                "No hay chats activos"}
                                </p>
                            </div>
                        ) : (
                            <ul className={`divide-y px-2 ${isDark ? 'divide-slate-700/0' : 'divide-gray-100'}`}>
                                {filteredContacts.map((contact) => {
                                    const isTyping = typingStatus[contact.phone];
                                    const unread = unreadCounts[normalizePhone(contact.phone)] || 0;
                                    const isSelected = selectedContactId === contact.id;

                                    return (
                                        <li key={contact.id || Math.random()} className="mb-2">
                                            <button onClick={() => onSelectContact(contact)} className={`w-full flex items-start gap-3 p-3 rounded-2xl transition-all text-left group ${isSelected
                                                ? (isDark ? 'bg-indigo-600/20 backdrop-blur-md border border-indigo-500/30 shadow-lg ring-1 ring-indigo-500/20' : 'bg-white border-l-4 border-blue-500 shadow-sm')
                                                : `border border-transparent ${isDark ? 'hover:bg-white/5' : 'border-l-4 border-transparent hover:bg-white'}`
                                                }`}>

                                                <div className="relative">
                                                    <div className={`h-10 w-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold overflow-hidden shadow-sm transition-transform group-hover:scale-105 ${isSelected ? 'ring-2 ring-blue-500 ring-offset-1' : ''} ${!contact.avatar ? (isSelected ? 'bg-blue-500' : (isDark ? 'bg-slate-600' : 'bg-slate-400')) : ''}`}>
                                                        {contact.avatar ? <img src={contact.avatar} alt="Avatar" className="w-full h-full object-cover" /> : getInitial(contact.name, contact.phone)}
                                                    </div>
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-baseline mb-1">
                                                        <span className={`text-sm font-bold truncate ${isSelected
                                                            ? 'text-blue-400'
                                                            : (isDark ? 'text-white' : 'text-slate-700')
                                                            }`}>{String(contact.name || contact.phone || "Desconocido")}</span>
                                                        <span className={`text-[10px] ml-2 whitespace-nowrap ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{formatTime(contact.last_message_time)}</span>
                                                    </div>

                                                    <div className="flex justify-between items-center w-full">
                                                        <p className={`text-xs truncate h-4 flex-1 pr-2 ${isTyping ? 'text-green-500 font-bold animate-pulse' : (isDark ? 'text-slate-400' : 'text-slate-500')}`}>
                                                            {isTyping ? "✍️ Escribiendo..." : cleanMessagePreview(contact.last_message)}
                                                        </p>

                                                        {unread > 0 && (() => {
                                                            // Badge morado si: asignado a mí, O en mi departamento sin asignar a otro
                                                            const isAssignedToMe = contact.assigned_to === user.username;
                                                            const prefs = user.preferences || {};
                                                            const myDepts = prefs.departments || [];
                                                            const isInMyDept = myDepts.length > 0 && contact.department && myDepts.includes(contact.department) && !contact.assigned_to;
                                                            const isNewLead = contact.status === 'Nuevo' && !contact.assigned_to && prefs.notifyNewLeads !== false;
                                                            const isMine = isAssignedToMe || isInMyDept || isNewLead;
                                                            return (
                                                                <span className={`flex-shrink-0 text-white text-[10px] font-bold h-5 min-w-[20px] px-1 rounded-full flex items-center justify-center shadow-sm animate-in zoom-in ${isMine ? 'bg-purple-600' : 'bg-gray-400'}`}>
                                                                    {unread > 99 ? '99+' : unread}
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>

                                                    <div className="flex gap-1 mt-2 flex-wrap items-center">
                                                        {contact.status === 'Nuevo' && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-bold rounded-md tracking-wide border border-emerald-200">NUEVO</span>}

                                                        {contact.tags && contact.tags.slice(0, 2).map(tag => (
                                                            <span key={tag} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-50 text-orange-700 border border-orange-100">
                                                                <Hash size={8} /> {tag}
                                                            </span>
                                                        ))}
                                                        {contact.tags && contact.tags.length > 2 && <span className="text-[9px] text-slate-400">+{contact.tags.length - 2}</span>}

                                                        {contact.department && <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-[9px] font-bold rounded-md border border-purple-100 uppercase tracking-wide flex items-center gap-1">{String(contact.department)}</span>}

                                                        {contact.assigned_to && <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-medium rounded border border-slate-200 flex items-center gap-1"><UserCheck className="w-3 h-3" /> {contact.assigned_to}</span>}

                                                        {!selectedAccountId && contact.origin_phone_id && (
                                                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[9px] font-mono rounded border border-gray-200">
                                                                #{contact.origin_phone_id.slice(-4)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </>
                )}
            </div>

            {/* FOOTER (Solo visible en chats, en team chat ya ves los usuarios arriba) */}
            {currentView !== 'team_chat' && (
                <div className={`border-t p-3 ${isDark ? 'bg-slate-900/40 backdrop-blur-md border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            Online ({onlineUsers.length})
                        </h3>
                        <button id="tour-calendar-btn" onClick={() => setView('calendar')} className={`p-1.5 border rounded-md transition shadow-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-400 hover:text-purple-400 hover:border-purple-500' : 'bg-white border-slate-200 text-slate-400 hover:text-purple-600 hover:border-purple-200'}`} title="Ver Agenda">
                            <CalendarIcon className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-2 mb-2">
                        {onlineUsers.map((agentName, idx) => (
                            <div key={idx} className={`flex items-center gap-1.5 px-2 py-1 border rounded-full shadow-sm group transition-colors cursor-default ${isDark ? 'bg-slate-700 border-slate-600 hover:border-blue-500' : 'bg-white border-slate-200 hover:border-blue-300'}`}>
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                <span className={`text-[10px] font-bold max-w-[80px] truncate ${isDark ? 'text-slate-300 group-hover:text-blue-400' : 'text-slate-600 group-hover:text-blue-600'}`}>
                                    {agentName === user.username ? 'Tú' : agentName}
                                </span>
                            </div>
                        ))}
                        {onlineUsers.length === 0 && <span className="text-[10px] text-slate-400 italic">Nadie más conectado</span>}
                    </div>
                </div>
            )}

            {/* MODALES */}
            {showAddContact && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className={`p-6 rounded-2xl w-full max-w-sm shadow-2xl ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                        <h3 className={`font-bold mb-4 text-lg ${isDark ? 'text-white' : 'text-slate-800'}`}>Nuevo Contacto</h3>
                        <form onSubmit={handleCreateContact} className="space-y-4">
                            <div><label className="text-xs font-bold text-slate-400 uppercase block mb-1">Teléfono</label><input required placeholder="Ej: 34600123456" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} className={`w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-200'}`} /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase block mb-1">Nombre</label><input required placeholder="Ej: Juan Pérez" value={newContactName} onChange={e => setNewContactName(e.target.value)} className={`w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-200'}`} /></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase block mb-1">Email (Opcional)</label><input placeholder="juan@email.com" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} className={`w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-200'}`} /></div>
                            <div className="flex gap-2 pt-2">
                                <button type="button" onClick={() => setShowAddContact(false)} className={`flex-1 py-3 font-bold rounded-xl transition ${isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-100 text-slate-600 hover:bg-gray-200'}`}>Cancelar</button>
                                <button type="submit" disabled={isCreating} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg transition disabled:opacity-50">{isCreating ? 'Guardando...' : 'Crear'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showImport && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className={`p-6 rounded-2xl w-full max-w-sm text-center shadow-2xl ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                        <div className={`p-4 rounded-full w-fit mx-auto mb-4 ${isDark ? 'bg-green-900/30' : 'bg-green-50'}`}><FileSpreadsheet className="text-green-600" size={32} /></div>
                        <h3 className={`font-bold text-lg mb-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>Importar Contactos (CSV)</h3>
                        <p className={`text-xs mb-6 p-2 rounded-lg border mx-auto w-fit ${isDark ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>Formato requerido: <code>Teléfono, Nombre, Email</code></p>
                        <div className="relative mb-6"><input type="file" accept=".csv" onChange={e => setImportFile(e.target.files?.[0] || null)} className={`block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold hover:file:bg-green-100 cursor-pointer ${isDark ? 'text-slate-400 file:bg-green-900/40 file:text-green-400' : 'text-slate-500 file:bg-green-50 file:text-green-700'}`} /></div>
                        <div className="flex gap-2">
                            <button onClick={() => setShowImport(false)} className={`flex-1 py-3 font-bold rounded-xl transition ${isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-100 text-slate-600 hover:bg-gray-200'}`}>Cancelar</button>
                            <button onClick={handleImport} disabled={!importFile || importing} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg disabled:opacity-50 transition">{importing ? 'Subiendo...' : 'Importar'}</button>
                        </div>
                    </div>
                </div>
            )}

            {showDialer && <PhoneDialer isOpen={showDialer} onClose={() => setShowDialer(false)} />}

        </div>
    );
}