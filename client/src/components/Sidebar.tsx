import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
    Users, Search, RefreshCw, UserCheck, Briefcase, Filter as FilterIcon,
    Smartphone, UserPlus, Upload, FileSpreadsheet, Phone, MessageSquare,
    User, ChevronDown, CheckCircle, Hash, Calendar as CalendarIcon, X, Megaphone
} from 'lucide-react';
import { PhoneDialer } from './PhoneDialer';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';
import { colorForAccount, nameForAccount } from '../utils/accountColors';
import { normalizeForSearch } from '../utils/searchNormalize';

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
    ai_muted?: boolean; // Toggle IA on/off por chat (silenciar Laura)
    // Alarma de atención humana sin atender (derivado a dpto, pide humano,
    // cliente enfadado). Se pone sola al saltar la alarma y se limpia sola
    // cuando un agente contesta al chat.
    attention_pending?: boolean;
    attention_reason?: string;  // "derivado al equipo" / "pide hablar con una persona" / "parece molesto/a"
    attention_at?: string;      // ISO de cuándo saltó
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
    setView: (view: 'chat' | 'settings' | 'calendar' | 'team_chat' | 'campaigns') => void;
    currentView?: string;

    selectedAccountId: string | null;
    onSelectAccount: (id: string | null) => void;

    // Nuevas props para el Chat de Equipo integrado
    teamChannel?: string;
    setTeamChannel?: (channel: string) => void;
}

// 'attention' sustituye al antiguo 'unassigned' (Libres). "Libres" mostraba
// todos los chats sin agente, mezclando los urgentes con chats viejos que ya
// no importaban. "Atención" muestra solo los que tienen una alarma sin
// atender → es lo que de verdad hay que responder ya.
type ViewScope = 'all' | 'mine' | 'attention';

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
    const [newContactDepartment, setNewContactDepartment] = useState('');
    const [newContactTags, setNewContactTags] = useState('');
    const [newContactMatricula, setNewContactMatricula] = useState('');
    const [newContactMarca, setNewContactMarca] = useState('');
    const [newContactModelo, setNewContactModelo] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Importación
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importing, setImporting] = useState(false);

    // Filtros
    const [activeFilters, setActiveFilters] = useState({ department: '', status: '', tag: '', agent: '' });
    // Filtro especial "sin conversación": surface a los contactos creados a mano
    // (alta manual, sin ningún mensaje todavía) que de otro modo quedan hundidos
    // al fondo de la bandeja porque se ordena por last_message_time.
    const [onlyNoConv, setOnlyNoConv] = useState(false);
    const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
    const [availableDepts, setAvailableDepts] = useState<string[]>([]);
    const [availableStatuses, setAvailableStatuses] = useState<string[]>([]);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [unreadCounts, setUnreadCounts] = useState<{ [phone: string]: number }>({});
    // Contador de mensajes no leídos del chat de equipo, indexado por "clave
    // de visualización": 'general' para el canal general, o el username del
    // otro compañero para los DMs. No se persiste — se resetea al recargar la
    // app (mismo comportamiento que el contador de clientes en memoria).
    const [teamUnread, setTeamUnread] = useState<{ [channel: string]: number }>({});
    const audioRef = useRef<HTMLAudioElement | null>(null);
    // B1: Refs para preservar el scroll del Sidebar cuando llega un
    // contacts_update (polling 60s o cambios). listScrollRef apunta al
    // contenedor scroll; lastScrollTopRef guarda la posición previa al
    // re-render. Sin esto, cada update saltaba al inicio de la lista.
    const listScrollRef = useRef<HTMLDivElement | null>(null);
    const lastScrollTopRef = useRef<number>(0);

    useEffect(() => {
        audioRef.current = new Audio('/notification.mp3');
    }, []);

    // B1: Restaurar el scrollTop tras cada cambio en contacts. Sin esto,
    // el polling cada 60s reemplaza la lista entera y el navegador resetea
    // la posición al inicio. Usamos useLayoutEffect (síncrono, antes del
    // paint) para que el usuario no vea ni un flash de "saltó arriba".
    useLayoutEffect(() => {
        const el = listScrollRef.current;
        if (!el) return;
        const target = lastScrollTopRef.current;
        // Capear a scrollHeight - clientHeight por si la lista se acortó
        // (filtro nuevo, contacto eliminado). Sin esto, el navegador caparía
        // automáticamente pero queda más claro hacerlo explícito.
        const max = Math.max(0, el.scrollHeight - el.clientHeight);
        const next = Math.min(target, max);
        if (Math.abs(el.scrollTop - next) > 1) {
            el.scrollTop = next;
        }
    }, [contacts]);

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

        // contact_marked_read: el server emite esto cuando un mensaje llega
        // pero hay un agente con ese chat abierto (no se incrementa unread).
        // Aquí limpiamos también el contador LOCAL para que otros agentes
        // que tengan el Sidebar abierto (pero no ese chat) no vean un badge
        // fantasma — su contador local se incrementaría en línea 254 si no
        // hiciéramos esto.
        const handleContactMarkedRead = (data: { phone: string }) => {
            const p = normalizePhone(data?.phone || '');
            if (!p) return;
            setUnreadCounts(prev => {
                if (!(p in prev)) return prev;
                const n = { ...prev }; delete n[p]; return n;
            });
        };
        socket.on('contact_marked_read', handleContactMarkedRead);

        // Polling de seguridad cada 60s (antes 10s). El socket ya emite
        // 'contact_updated_notification' en cualquier cambio relevante, así
        // que el polling solo cubre desconexiones momentáneas. 10s generaba
        // ~6 lecturas/min/usuario contra Airtable (riesgo de cuota con
        // varios admins conectados).
        const interval = setInterval(() => { if (isConnected) socket.emit('request_contacts'); }, 60000);

        return () => {
            socket.off('contacts_update', handleContactsUpdate);
            socket.off('agents_list', handleAgents);
            socket.off('config_list', handleConfig);
            socket.off('contact_updated_notification');
            socket.off('message', handleSidebarMessage); // FIX: Only remove THIS listener
            socket.off('contact_marked_read', handleContactMarkedRead);
            clearInterval(interval);
        };
    }, [socket, user.username, isConnected, selectedContactId, contacts, user.preferences]);

    // ─── CHAT DE EQUIPO — contador de no leídos ──────────────────────────────
    // Escucha los mensajes que emite el server por socket 'team_message' y
    // mantiene un contador igual al del chat de clientes. La clave de
    // visualización es 'general' para el canal común, o el username del otro
    // compañero para los DMs (extraído del channelId "userA_userB" ordenado
    // alfabéticamente — misma convención que usa TeamChat.tsx al construirlo).
    //
    // Reglas:
    // - Ignora los mensajes enviados por uno mismo.
    // - Si estás viendo ese canal en ese momento, no incrementa (lo ves al
    //   instante en TeamChat, sería ruido).
    useEffect(() => {
        if (!socket || !user?.username) return;
        const me = user.username;
        const getDisplayKey = (channelId: string): string | null => {
            if (channelId === 'general') return 'general';
            // Formato: "userA_userB" (sorted). El "peer" es el que NO soy yo.
            if (channelId.startsWith(me + '_')) return channelId.substring(me.length + 1);
            if (channelId.endsWith('_' + me)) return channelId.substring(0, channelId.length - me.length - 1);
            return null; // mensaje que no me concierne
        };
        const handleTeamMessage = (msg: { sender?: string; channel?: string }) => {
            if (!msg?.channel || msg.sender === me) return;
            const key = getDisplayKey(msg.channel);
            if (!key) return;
            // Si justo estoy mirando ese canal, no marco como no leído.
            if (currentView === 'team_chat' && teamChannel === key) return;
            setTeamUnread(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
        };
        socket.on('team_message', handleTeamMessage);
        return () => { socket.off('team_message', handleTeamMessage); };
    }, [socket, user?.username, currentView, teamChannel]);

    // Al entrar a un canal de equipo, limpia su contador. Cubre tanto la
    // navegación dentro de team_chat como la primera entrada (teamChannel
    // arranca en 'general' por defecto desde App.tsx).
    useEffect(() => {
        if (currentView !== 'team_chat' || !teamChannel) return;
        setTeamUnread(prev => {
            if (!prev[teamChannel]) return prev;
            const n = { ...prev };
            delete n[teamChannel];
            return n;
        });
    }, [currentView, teamChannel]);

    const resetNewContactForm = () => {
        setNewContactPhone(''); setNewContactName('');
        setNewContactDepartment(''); setNewContactTags('');
        setNewContactMatricula(''); setNewContactMarca(''); setNewContactModelo('');
    };

    const handleCreateContact = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanInput = newContactPhone.replace(/\D/g, '');
        // 9 dígitos = número español sin prefijo (ej. 600123456). Lo aceptamos.
        if (cleanInput.length < 9 || cleanInput.length > 15) {
            alert("El número debe tener entre 9 y 15 dígitos numéricos.");
            return;
        }
        const tagsArr = newContactTags.split(',').map(t => t.trim()).filter(Boolean);
        setIsCreating(true);
        try {
            const res = await fetch(`${API_URL}/contacts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: cleanInput,
                    name: newContactName,
                    department: newContactDepartment,
                    tags: tagsArr,
                    matricula: newContactMatricula,
                    marca: newContactMarca,
                    modelo: newContactModelo,
                    originPhoneId: selectedAccountId || (accounts.length > 0 ? accounts[0].id : undefined)
                })
            });
            const data = await res.json();
            if (res.ok) {
                setShowAddContact(false);
                resetNewContactForm();
                socket.emit('request_contacts');
                alert(data.vehicleSaved ? "Contacto y vehículo guardados correctamente." : "Contacto guardado correctamente.");
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

    // Nº de alarmas SIN ATENDER, para el badge rojo de la pestaña "Atención".
    // Respeta la línea seleccionada (si estás viendo solo Recambios no cuenta
    // las de SYA Motor), pero NO el buscador ni la pestaña activa: el contador
    // tiene que cantar siempre cuántos clientes están colgados, estés donde estés.
    const attentionCount = contacts.filter(c => {
        if (!c.attention_pending) return false;
        if (selectedAccountId && c.origin_phone_id && c.origin_phone_id !== selectedAccountId) return false;
        return true;
    }).length;

    const filteredContacts = contacts.filter(c => {
        if (selectedAccountId) {
            if (c.origin_phone_id && c.origin_phone_id !== selectedAccountId) return false;
        }
        // Búsqueda tolerante a tildes / mayúsculas en el nombre (ej. "andres"
        // encuentra "Andrés"). Para el teléfono mantenemos comparación literal
        // porque los phones son solo dígitos tras cleanNumber server-side.
        const qNorm = normalizeForSearch(searchQuery);
        const matchesSearch = (qNorm === '' || normalizeForSearch(c.name).includes(qNorm)) || (c.phone || "").includes(searchQuery);
        if (!matchesSearch) return false;
        if (viewScope === 'mine' && c.assigned_to !== user.username) return false;
        if (viewScope === 'attention' && !c.attention_pending) return false;
        if (activeFilters.department && c.department !== activeFilters.department) return false;
        if (activeFilters.status && c.status !== activeFilters.status) return false;
        if (activeFilters.agent && c.assigned_to !== activeFilters.agent) return false;
        if (activeFilters.tag && (!c.tags || !c.tags.includes(activeFilters.tag))) return false;
        // "Sin conversación": contactos sin ningún mensaje (alta manual). Un
        // contacto con conversación siempre tiene last_message_time.
        if (onlyNoConv && c.last_message_time) return false;
        return true;
    });

    // Al filtrar "sin conversación" no hay last_message_time para ordenar, así
    // que los ordenamos alfabéticamente por nombre para que sean fáciles de
    // localizar (en el resto de vistas mantenemos el orden del servidor por
    // recencia de mensaje).
    if (onlyNoConv) {
        filteredContacts.sort((a, b) =>
            normalizeForSearch(a.name).localeCompare(normalizeForSearch(b.name))
        );
    }

    const updateFilter = (key: keyof typeof activeFilters, value: string) => {
        setActiveFilters(prev => ({ ...prev, [key]: value }));
    };

    const hasActiveFilters = Object.values(activeFilters).some(v => v !== '') || onlyNoConv;

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
                                <button onClick={() => setViewScope('attention')} className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all flex items-center justify-center gap-1 ${viewScope === 'attention'
                                    ? (isDark ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-red-600 shadow-sm')
                                    : (attentionCount > 0
                                        ? (isDark ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-700')
                                        : (isDark ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700'))
                                    }`}>
                                    Atención
                                    {attentionCount > 0 && (
                                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none ${viewScope === 'attention'
                                            ? (isDark ? 'bg-white/25 text-white' : 'bg-red-600 text-white')
                                            : 'bg-red-600 text-white animate-pulse'
                                            }`}>{attentionCount}</span>
                                    )}
                                </button>
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
                                    {hasActiveFilters && <button onClick={() => { setActiveFilters({ department: '', status: '', tag: '', agent: '' }); setOnlyNoConv(false); }} className="text-[10px] text-red-500 hover:underline">Borrar filtros</button>}
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
                                {/* Toggle "Sin conversación": muestra solo contactos creados a
                                    mano que aún no tienen ningún mensaje (alta manual). */}
                                <button
                                    type="button"
                                    onClick={() => setOnlyNoConv(v => !v)}
                                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-medium transition ${onlyNoConv
                                        ? (isDark ? 'bg-blue-900/40 border-blue-700 text-blue-300' : 'bg-blue-50 border-blue-300 text-blue-700')
                                        : (isDark ? 'bg-slate-700 border-slate-600 text-slate-300' : 'bg-white border-slate-200 text-slate-700')}`}
                                >
                                    <span className="flex items-center gap-1.5">
                                        <UserPlus className="w-3 h-3" />
                                        Sin conversación
                                    </span>
                                    <span className={`w-8 h-4 rounded-full flex items-center transition ${onlyNoConv ? 'bg-blue-500 justify-end' : (isDark ? 'bg-slate-600 justify-start' : 'bg-slate-300 justify-start')}`}>
                                        <span className="w-3 h-3 bg-white rounded-full mx-0.5" />
                                    </span>
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* LISTA (CONTENIDO VARIABLE) */}
            <div
                className="flex-1 overflow-y-auto min-h-0"
                id="tour-chat-list"
                ref={listScrollRef}
                onScroll={(e) => { lastScrollTopRef.current = (e.target as HTMLDivElement).scrollTop; }}
            >

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
                            <span className="font-bold text-sm flex-1 text-left">General</span>
                            {(teamUnread['general'] || 0) > 0 && (
                                <span className="flex-shrink-0 bg-purple-600 text-white text-[10px] font-bold h-5 min-w-[20px] px-1 rounded-full flex items-center justify-center shadow-sm animate-in zoom-in">
                                    {teamUnread['general'] > 99 ? '99+' : teamUnread['general']}
                                </span>
                            )}
                        </button>

                        <div className="h-px bg-slate-100 mx-2"></div>

                        {/* Lista de Compañeros */}
                        <div>
                            <p className="px-3 text-xs font-bold text-slate-400 uppercase mb-2">Mensajes Directos</p>
                            <div className="space-y-1">
                                {teamAgents.filter(a => a.name !== user.username).map(agent => {
                                    const isSelected = teamChannel === agent.name;
                                    const isUserOnline = onlineUsers.includes(agent.name);
                                    const unread = teamUnread[agent.name] || 0;
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
                                            <span className="text-sm truncate flex-1 text-left">{agent.name}</span>
                                            {unread > 0 && (
                                                <span className="flex-shrink-0 bg-purple-600 text-white text-[10px] font-bold h-5 min-w-[20px] px-1 rounded-full flex items-center justify-center shadow-sm animate-in zoom-in">
                                                    {unread > 99 ? '99+' : unread}
                                                </span>
                                            )}
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
                                {filteredContacts.map((contact, idx) => {
                                    const isTyping = typingStatus[contact.phone];
                                    const unread = unreadCounts[normalizePhone(contact.phone)] || 0;
                                    const isSelected = selectedContactId === contact.id;
                                    // Color por cuenta (línea de WhatsApp). Solo se aplica cuando
                                    // hay más de una cuenta activa: si solo hay un PhoneId no
                                    // aporta nada visual.
                                    const multiAccount = accounts.length > 1;
                                    const acc = multiAccount && contact.origin_phone_id ? colorForAccount(contact.origin_phone_id) : null;
                                    const accountFriendlyName = multiAccount && contact.origin_phone_id ? nameForAccount(contact.origin_phone_id, accounts) : '';

                                    return (
                                        <li key={contact.id || contact.phone || `idx-${idx}`} className="mb-2">
                                            <button
                                                onClick={() => onSelectContact(contact)}
                                                // Border-left coloreado por cuenta cuando NO está seleccionado.
                                                // Cuando está seleccionado, mantenemos el border azul/indigo
                                                // estándar para no confundir el feedback de selección.
                                                // Reservamos siempre 4px de border-left (transparente si no
                                                // hay cuenta) para que el ancho de los chats no cambie al
                                                // seleccionar uno.
                                                style={!isSelected && acc ? { borderLeftColor: acc.hex, borderLeftWidth: '4px', borderLeftStyle: 'solid' } : undefined}
                                                className={`w-full flex items-start gap-3 p-3 rounded-2xl transition-all text-left group ${isSelected
                                                    ? (isDark ? 'bg-indigo-600/20 backdrop-blur-md border border-indigo-500/30 shadow-lg ring-1 ring-indigo-500/20' : 'bg-white border-l-4 border-blue-500 shadow-sm')
                                                    : `border border-transparent border-l-4 ${acc ? '' : 'border-l-transparent'} ${isDark ? 'hover:bg-white/5' : 'hover:bg-white'}`
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

                                                        {!selectedAccountId && multiAccount && contact.origin_phone_id && acc && (
                                                            <span
                                                                className={`px-1.5 py-0.5 text-[9px] font-bold rounded border flex items-center gap-1 ${isDark ? `${acc.bgDark} ${acc.textDark} ${acc.borderDark}` : `${acc.bg} ${acc.text} ${acc.border}`}`}
                                                                title={`Línea: ${accountFriendlyName}`}
                                                            >
                                                                <Smartphone size={9} /> {accountFriendlyName}
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
                <div className={`border-t px-3 pt-3 safe-bottom-2 ${isDark ? 'bg-slate-900/40 backdrop-blur-md border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                            Online ({onlineUsers.length})
                        </h3>
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => setView('campaigns')} className={`p-1.5 border rounded-md transition shadow-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-400 hover:text-orange-400 hover:border-orange-500' : 'bg-white border-slate-200 text-slate-400 hover:text-orange-600 hover:border-orange-200'}`} title="Campañas de marketing">
                                <Megaphone className="w-4 h-4" />
                            </button>
                            <button id="tour-calendar-btn" onClick={() => setView('calendar')} className={`p-1.5 border rounded-md transition shadow-sm ${isDark ? 'bg-slate-700 border-slate-600 text-slate-400 hover:text-purple-400 hover:border-purple-500' : 'bg-white border-slate-200 text-slate-400 hover:text-purple-600 hover:border-purple-200'}`} title="Ver Agenda">
                                <CalendarIcon className="w-4 h-4" />
                            </button>
                        </div>
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
                    <div className={`rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[90vh] ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
                        <h3 className={`font-bold text-lg p-6 pb-3 flex-shrink-0 ${isDark ? 'text-white' : 'text-slate-800'}`}>Nuevo Contacto</h3>
                        <form onSubmit={handleCreateContact} className="flex flex-col flex-1 min-h-0">
                            <div className="space-y-4 px-6 overflow-y-auto flex-1">
                                <div><label className="text-xs font-bold text-slate-400 uppercase block mb-1">Teléfono *</label><input required placeholder="Ej: 34600123456" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value)} className={`w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-200'}`} /></div>
                                <div><label className="text-xs font-bold text-slate-400 uppercase block mb-1">Nombre *</label><input required placeholder="Ej: Juan Pérez" value={newContactName} onChange={e => setNewContactName(e.target.value)} className={`w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-200'}`} /></div>

                                {/* Vehículo — alimenta toda la postventa (recordatorios personalizados) */}
                                <div className={`rounded-xl border p-3 space-y-3 ${isDark ? 'bg-slate-900/40 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                                    <p className="text-xs font-bold text-slate-400 uppercase">🚗 Vehículo (opcional)</p>
                                    <div><label className="text-[11px] font-semibold text-slate-400 block mb-1">Matrícula</label><input placeholder="Ej: 1234ABC" value={newContactMatricula} onChange={e => setNewContactMatricula(e.target.value)} className={`w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none uppercase ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-200'}`} /></div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div><label className="text-[11px] font-semibold text-slate-400 block mb-1">Marca</label><input placeholder="Seat" value={newContactMarca} onChange={e => setNewContactMarca(e.target.value)} className={`w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-200'}`} /></div>
                                        <div><label className="text-[11px] font-semibold text-slate-400 block mb-1">Modelo</label><input placeholder="Ibiza" value={newContactModelo} onChange={e => setNewContactModelo(e.target.value)} className={`w-full p-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-200'}`} /></div>
                                    </div>
                                </div>

                                <div><label className="text-xs font-bold text-slate-400 uppercase block mb-1">Departamento (opcional)</label><input placeholder="Ej: Taller, Ventas..." value={newContactDepartment} onChange={e => setNewContactDepartment(e.target.value)} className={`w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-200'}`} /></div>
                                <div><label className="text-xs font-bold text-slate-400 uppercase block mb-1">Etiquetas (opcional)</label><input placeholder="Separadas por comas: VIP, flota..." value={newContactTags} onChange={e => setNewContactTags(e.target.value)} className={`w-full p-3 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-200'}`} /></div>
                            </div>
                            <div className="flex gap-2 p-6 pt-4 flex-shrink-0">
                                <button type="button" onClick={() => { setShowAddContact(false); resetNewContactForm(); }} className={`flex-1 py-3 font-bold rounded-xl transition ${isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-gray-100 text-slate-600 hover:bg-gray-200'}`}>Cancelar</button>
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