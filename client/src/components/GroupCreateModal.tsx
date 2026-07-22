import { useState, useEffect } from 'react';
import { X, Users, Search, Check, Loader2, AlertTriangle, Trash2, Smartphone } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { API_URL } from '../config/api';
import { normalizeForSearch } from '../utils/searchNormalize';
import type { ChatGroup } from './GroupChatWindow';
import type { Contact } from './Sidebar';

interface GroupCreateModalProps {
    socket: any;
    currentUser: string;
    /** Grupo a editar; si es null, se crea uno nuevo. */
    editing: ChatGroup | null;
    onClose: () => void;
    onSaved: (group: ChatGroup | null) => void;
}

const normalizePhone = (phone: string) => String(phone || '').replace(/\D/g, '');

export function GroupCreateModal({ socket, currentUser, editing, onClose, onSaved }: GroupCreateModalProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    // Contactos y agentes se piden por socket (mismos eventos que usa el Sidebar)
    // para que el modal no dependa de quién lo abra.
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
    useEffect(() => {
        if (!socket) return;
        const handleContacts = (d: any) => { if (Array.isArray(d)) setContacts(d); };
        const handleAgents = (l: any) => { if (Array.isArray(l)) setAgents(l); };
        socket.on('contacts_update', handleContacts);
        socket.on('agents_list', handleAgents);
        socket.emit('request_contacts');
        socket.emit('request_agents');
        return () => {
            socket.off('contacts_update', handleContacts);
            socket.off('agents_list', handleAgents);
        };
    }, [socket]);

    const [name, setName] = useState(editing?.name || '');
    const [selectedPhones, setSelectedPhones] = useState<string[]>(editing?.clientPhones || []);
    // Quien crea el grupo entra en él por defecto: es lo que espera cualquiera
    // que abre una conversación.
    const [selectedAgents, setSelectedAgents] = useState<string[]>(editing?.agentNames || [currentUser]);
    const [lineId, setLineId] = useState(editing?.lineId || '');
    const [clientsSeeEachOther, setClientsSeeEachOther] = useState(editing?.clientsSeeEachOther || false);

    const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
    const [clientQuery, setClientQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`${API_URL}/accounts`)
            .then(r => r.json())
            .then((list: { id: string; name: string }[]) => {
                setAccounts(list || []);
                if (!lineId && list?.length) setLineId(list[0].id);
            })
            .catch(() => setError('No se pudieron cargar las líneas de WhatsApp.'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const togglePhone = (phone: string) => {
        setSelectedPhones(prev => prev.includes(phone) ? prev.filter(p => p !== phone) : [...prev, phone]);
    };
    const toggleAgent = (agentName: string) => {
        setSelectedAgents(prev => prev.includes(agentName) ? prev.filter(a => a !== agentName) : [...prev, agentName]);
    };

    const filteredContacts = contacts.filter(c => {
        if (!clientQuery.trim()) return true;
        const q = normalizeForSearch(clientQuery);
        return normalizeForSearch(c.name || '').includes(q) || normalizePhone(c.phone).includes(normalizePhone(clientQuery));
    });

    const handleSave = async () => {
        setError(null);
        if (!name.trim()) return setError('Ponle un nombre al grupo.');
        if (selectedPhones.length === 0) return setError('Selecciona al menos un cliente.');
        if (selectedAgents.length === 0) return setError('Selecciona al menos un trabajador.');
        if (!lineId) return setError('Selecciona la línea de WhatsApp del grupo.');

        setSaving(true);
        try {
            const url = editing ? `${API_URL}/groups/${editing.id}` : `${API_URL}/groups`;
            const res = await fetch(url, {
                method: editing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    clientPhones: selectedPhones,
                    agentNames: selectedAgents,
                    lineId,
                    clientsSeeEachOther,
                    createdBy: currentUser
                })
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data?.error || 'No se pudo guardar el grupo.');
                return;
            }
            onSaved(data.group || null);
        } catch (e: any) {
            setError('Error de conexión al guardar el grupo.');
        } finally {
            setSaving(false);
        }
    };

    const handleArchive = async () => {
        if (!editing) return;
        if (!window.confirm(`¿Archivar el grupo "${editing.name}"?\n\nLos mensajes ya enviados NO se borran y los chats individuales de cada cliente quedan intactos.`)) return;
        setSaving(true);
        try {
            const res = await fetch(`${API_URL}/groups/${editing.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setError(d?.error || 'No se pudo archivar el grupo.');
                return;
            }
            onSaved(null);
        } catch {
            setError('Error de conexión al archivar el grupo.');
        } finally {
            setSaving(false);
        }
    };

    const inputCls = `w-full px-3 py-2 rounded-xl text-sm border outline-none focus:ring-2 focus:ring-indigo-500 ${isDark
        ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-500'
        : 'bg-white border-slate-200 text-slate-700 placeholder:text-slate-400'}`;
    const labelCls = `text-[10px] font-bold uppercase tracking-wide mb-1.5 block ${isDark ? 'text-slate-500' : 'text-slate-400'}`;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className={`w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Cabecera */}
                <div className={`p-4 border-b flex items-center gap-3 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                    <div className={`p-2 rounded-lg ${isDark ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}>
                        <Users size={20} />
                    </div>
                    <h2 className={`font-bold text-lg flex-1 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                        {editing ? 'Editar grupo' : 'Nuevo grupo'}
                    </h2>
                    <button onClick={onClose} className={`p-2 rounded-lg ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-400 hover:bg-slate-100'}`}>
                        <X size={18} />
                    </button>
                </div>

                {/* Cuerpo */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div>
                        <label className={labelCls}>Nombre del grupo</label>
                        <input value={name} onChange={e => setName(e.target.value)} className={inputCls}
                            placeholder="Ej: Presupuesto Golf GTI" autoFocus />
                    </div>

                    <div>
                        <label className={labelCls}>Línea de WhatsApp del grupo</label>
                        <div className="relative">
                            <Smartphone className={`absolute left-3 top-2.5 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                            <select value={lineId} onChange={e => setLineId(e.target.value)}
                                className={`${inputCls} pl-9 appearance-none cursor-pointer`}>
                                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                        </div>
                        <p className={`text-[10px] mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            Todo el grupo habla desde este número. Si se usaran varios, a cada cliente se le abrirían
                            varios chats distintos en su móvil.
                        </p>
                    </div>

                    {/* Trabajadores */}
                    <div>
                        <label className={labelCls}>Trabajadores ({selectedAgents.length})</label>
                        <div className="flex flex-wrap gap-1.5">
                            {agents.map(a => {
                                const on = selectedAgents.includes(a.name);
                                return (
                                    <button key={a.id} type="button" onClick={() => toggleAgent(a.name)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition flex items-center gap-1 ${on
                                            ? 'bg-indigo-600 border-indigo-600 text-white'
                                            : (isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-600' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300')}`}>
                                        {on && <Check size={12} />} {a.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Clientes */}
                    <div>
                        <label className={labelCls}>Clientes ({selectedPhones.length})</label>
                        <div className="relative mb-2">
                            <Search className={`absolute left-3 top-2.5 w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                            <input value={clientQuery} onChange={e => setClientQuery(e.target.value)}
                                className={`${inputCls} pl-9`} placeholder="Buscar cliente por nombre o teléfono..." />
                        </div>
                        <div className={`max-h-48 overflow-y-auto rounded-xl border ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                            {filteredContacts.length === 0 && (
                                <p className={`p-3 text-xs text-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Sin resultados.</p>
                            )}
                            {filteredContacts.slice(0, 100).map(c => {
                                const phone = normalizePhone(c.phone);
                                const on = selectedPhones.includes(phone);
                                return (
                                    <button key={c.id} type="button" onClick={() => togglePhone(phone)}
                                        className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition border-b last:border-b-0 ${isDark
                                            ? `border-slate-800 ${on ? 'bg-indigo-900/30' : 'hover:bg-slate-800'}`
                                            : `border-slate-100 ${on ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}`}>
                                        <span className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${on
                                            ? 'bg-indigo-600 border-indigo-600 text-white'
                                            : (isDark ? 'border-slate-600' : 'border-slate-300')}`}>
                                            {on && <Check size={12} />}
                                        </span>
                                        <span className={`flex-1 truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{c.name || phone}</span>
                                        <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{phone}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Privacidad */}
                    <button type="button" onClick={() => setClientsSeeEachOther(v => !v)}
                        className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition ${clientsSeeEachOther
                            ? (isDark ? 'bg-amber-900/20 border-amber-700' : 'bg-amber-50 border-amber-300')
                            : (isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200')}`}>
                        <span className={`mt-0.5 w-9 h-5 rounded-full flex items-center transition flex-shrink-0 ${clientsSeeEachOther ? 'bg-amber-500 justify-end' : (isDark ? 'bg-slate-600 justify-start' : 'bg-slate-300 justify-start')}`}>
                            <span className="w-4 h-4 bg-white rounded-full mx-0.5" />
                        </span>
                        <span>
                            <span className={`block text-sm font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                Los clientes se ven entre sí
                            </span>
                            <span className={`block text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {clientsSeeEachOther
                                    ? 'Cada cliente recibirá también los mensajes de los otros clientes, con su nombre (nunca su teléfono). Necesitas su consentimiento — RGPD.'
                                    : 'Recomendado. Cada cliente solo recibe los mensajes del equipo; no sabe que hay más clientes en el grupo.'}
                            </span>
                        </span>
                    </button>

                    {error && (
                        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
                            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> <span>{error}</span>
                        </div>
                    )}
                </div>

                {/* Pie */}
                <div className={`p-4 border-t flex gap-2 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                    {editing && (
                        <button onClick={handleArchive} disabled={saving}
                            className="px-3 py-2.5 rounded-xl text-sm font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition disabled:opacity-50 flex items-center gap-1.5">
                            <Trash2 size={15} /> Archivar
                        </button>
                    )}
                    <button onClick={onClose} disabled={saving}
                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition ${isDark
                            ? 'border-slate-700 text-slate-300 hover:bg-slate-800'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-2">
                        {saving && <Loader2 size={15} className="animate-spin" />}
                        {editing ? 'Guardar cambios' : 'Crear grupo'}
                    </button>
                </div>
            </div>
        </div>
    );
}
