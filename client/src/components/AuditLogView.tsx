import { useEffect, useState, useMemo } from 'react';
import {
    Clock, User as UserIcon, Filter, RefreshCw, Search, AlertCircle,
    Calendar, MessageSquare, Bot, Briefcase, Tag, Send, FileText
} from 'lucide-react';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';

interface AuditEntry {
    id: string;
    action: string;
    user: string;
    targetType: string;
    targetId: string;
    targetName: string;
    summary: string;
    changes: string;
    origin: string;
    createdAt: string;
}

// Mapeo de targetType a icono para identificación visual rápida
const TYPE_ICON: Record<string, any> = {
    appointment: Calendar,
    contact: MessageSquare,
    bot: Bot,
    template: FileText,
    campaign: Send,
    agent: UserIcon
};

// Color por acción (semántica)
const ACTION_COLOR = (action: string, isDark: boolean): string => {
    if (action.endsWith('.cancel') || action.endsWith('.delete'))
        return isDark ? 'bg-rose-900/30 text-rose-300 border-rose-800' : 'bg-rose-50 text-rose-700 border-rose-200';
    if (action.endsWith('.create') || action.endsWith('.send'))
        return isDark ? 'bg-emerald-900/30 text-emerald-300 border-emerald-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (action.endsWith('.assign') || action.endsWith('.unassign'))
        return isDark ? 'bg-indigo-900/30 text-indigo-300 border-indigo-800' : 'bg-indigo-50 text-indigo-700 border-indigo-200';
    if (action === 'bot.toggle')
        return isDark ? 'bg-purple-900/30 text-purple-300 border-purple-800' : 'bg-purple-50 text-purple-700 border-purple-200';
    return isDark ? 'bg-slate-700 text-slate-300 border-slate-600' : 'bg-slate-100 text-slate-700 border-slate-200';
};

// Etiqueta amigable de la acción
const ACTION_LABEL: Record<string, string> = {
    'appointment.create': 'Cita reservada',
    'appointment.update': 'Cita modificada',
    'appointment.cancel': 'Cita cancelada',
    'appointment.delete': 'Cita borrada',
    'contact.assign': 'Asignación',
    'contact.unassign': 'Desasignación',
    'contact.status_change': 'Cambio de estado',
    'contact.update': 'Contacto editado',
    'bot.toggle': 'Laura activada/desactivada',
    'bot.config_update': 'Config bot',
    'template.create': 'Plantilla creada',
    'template.delete': 'Plantilla borrada',
    'campaign.create': 'Campaña creada',
    'campaign.update': 'Campaña editada',
    'campaign.delete': 'Campaña borrada',
    'campaign.send': 'Campaña enviada',
    'agent.create': 'Agente creado',
    'agent.delete': 'Agente borrado',
    'agent.update': 'Agente actualizado'
};

function formatDateTime(iso: string): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
    } catch { return iso; }
}

export default function AuditLogView() {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [warning, setWarning] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filterAction, setFilterAction] = useState<string>('');
    const [filterType, setFilterType] = useState<string>('');
    const [filterUser, setFilterUser] = useState<string>('');
    const [search, setSearch] = useState<string>('');

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (filterAction) params.set('action', filterAction);
            if (filterType) params.set('targetType', filterType);
            if (filterUser) params.set('user', filterUser);
            params.set('limit', '200');
            const r = await fetch(`${API_URL}/audit-log?${params.toString()}`);
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Error');
            setEntries(d.events || []);
            setWarning(d.warning || null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [filterAction, filterType, filterUser]);

    // Búsqueda en cliente (sobre summary/user/targetName)
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return entries;
        return entries.filter(e =>
            e.summary.toLowerCase().includes(q) ||
            e.user.toLowerCase().includes(q) ||
            e.targetName.toLowerCase().includes(q)
        );
    }, [entries, search]);

    // Lista de usuarios únicos y tipos vistos (para los selects)
    const uniqueUsers = useMemo(() => Array.from(new Set(entries.map(e => e.user))).filter(Boolean), [entries]);
    const uniqueActions = useMemo(() => Array.from(new Set(entries.map(e => e.action))).filter(Boolean), [entries]);

    return (
        <div className="max-w-6xl mx-auto space-y-5 pb-10">
            <div className={`border-b pb-4 ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <h1 className={`text-2xl font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                            <Clock className="text-indigo-600" /> Auditoría
                        </h1>
                        <p className={`text-sm mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Historial de cambios administrativos. Muestra los últimos 200 eventos.
                        </p>
                    </div>
                    <button
                        onClick={load}
                        disabled={loading}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700' : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'}`}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refrescar
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className={`p-4 rounded-2xl border ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
                <div className="flex items-center gap-2 mb-3">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <span className={`text-xs font-bold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Filtros</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar resumen / cliente..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 ${isDark ? 'bg-slate-800/50 border-slate-700 text-slate-200 focus:ring-indigo-500/30' : 'bg-white border-slate-200 text-slate-800 focus:ring-indigo-500/30'}`}
                        />
                    </div>
                    <select
                        value={filterAction}
                        onChange={(e) => setFilterAction(e.target.value)}
                        className={`w-full px-3 py-2 text-sm rounded-lg border ${isDark ? 'bg-slate-800/50 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}
                    >
                        <option value="">Todas las acciones</option>
                        {uniqueActions.map(a => (
                            <option key={a} value={a}>{ACTION_LABEL[a] || a}</option>
                        ))}
                    </select>
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className={`w-full px-3 py-2 text-sm rounded-lg border ${isDark ? 'bg-slate-800/50 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}
                    >
                        <option value="">Todos los tipos</option>
                        <option value="appointment">Citas</option>
                        <option value="contact">Contactos</option>
                        <option value="bot">Laura (bot)</option>
                        <option value="template">Plantillas</option>
                        <option value="campaign">Campañas</option>
                        <option value="agent">Agentes</option>
                    </select>
                    <select
                        value={filterUser}
                        onChange={(e) => setFilterUser(e.target.value)}
                        className={`w-full px-3 py-2 text-sm rounded-lg border ${isDark ? 'bg-slate-800/50 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}
                    >
                        <option value="">Todos los usuarios</option>
                        {uniqueUsers.map(u => (
                            <option key={u} value={u}>{u}</option>
                        ))}
                    </select>
                </div>
            </div>

            {warning && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${isDark ? 'bg-yellow-900/20 border-yellow-800/50' : 'bg-yellow-50 border-yellow-200'}`}>
                    <AlertCircle className={`w-5 h-5 flex-shrink-0 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
                    <p className={`text-sm ${isDark ? 'text-yellow-200' : 'text-yellow-800'}`}>{warning}</p>
                </div>
            )}

            {error && (
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${isDark ? 'bg-red-900/20 border-red-800/50' : 'bg-red-50 border-red-200'}`}>
                    <AlertCircle className={`w-5 h-5 flex-shrink-0 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                    <p className={`text-sm ${isDark ? 'text-red-200' : 'text-red-800'}`}>{error}</p>
                </div>
            )}

            {/* Lista de entradas */}
            <div className="space-y-2">
                {loading && entries.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 flex flex-col items-center gap-2">
                        <RefreshCw className="animate-spin" /> Cargando historial...
                    </div>
                ) : filtered.length === 0 ? (
                    <div className={`text-center py-12 rounded-2xl border ${isDark ? 'glass-panel border-white/5 text-slate-400' : 'bg-white border-slate-200 text-slate-500'}`}>
                        <Clock className="w-12 h-12 mx-auto mb-2 opacity-30" />
                        <p className="font-medium">No hay eventos con estos filtros.</p>
                    </div>
                ) : (
                    filtered.map(e => {
                        const Icon = TYPE_ICON[e.targetType] || Tag;
                        const color = ACTION_COLOR(e.action, isDark);
                        return (
                            <div key={e.id} className={`p-4 rounded-xl border flex items-start gap-3 transition ${isDark ? 'glass-panel border-white/5 hover:border-white/10' : 'bg-white border-slate-200 hover:border-slate-300'}`}>
                                <div className={`p-2 rounded-lg flex-shrink-0 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                                    <Icon className={`w-4 h-4 ${isDark ? 'text-slate-300' : 'text-slate-600'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${color}`}>
                                            {ACTION_LABEL[e.action] || e.action}
                                        </span>
                                        <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{e.user}</span>
                                        <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{formatDateTime(e.createdAt)}</span>
                                        {e.origin && (
                                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>{e.origin}</span>
                                        )}
                                    </div>
                                    <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{e.summary}</p>
                                    {e.changes && (
                                        <details className="mt-2">
                                            <summary className={`text-[11px] cursor-pointer ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                                                Ver detalles del cambio
                                            </summary>
                                            <pre className={`mt-1 text-[10px] p-2 rounded overflow-x-auto ${isDark ? 'bg-slate-900 text-slate-400' : 'bg-slate-50 text-slate-600'}`}>{e.changes}</pre>
                                        </details>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
