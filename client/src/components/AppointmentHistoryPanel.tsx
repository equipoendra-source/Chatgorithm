import React, { useEffect, useState } from 'react';
import { X, RefreshCw, CheckCircle2, XCircle, Bot, User, MessageCircle, PackageCheck } from 'lucide-react';
import { API_URL } from '../config/api';

export interface AppointmentEvent {
    id: string;
    // 'delivered' = un compañero marcó "Vehículo Entregado" en el cliente
    // (no es una cita en sí, pero aparece en el historial para que el equipo
    // se entere en tiempo real).
    type: 'booked' | 'cancelled' | 'delivered' | string;
    appointmentId: string;
    clientName: string;
    clientPhone: string;
    appointmentDate: string;
    agenda: string;
    source: 'bot' | 'manual' | 'client_whatsapp' | string;
    createdAt: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    isDark: boolean;
    socket?: any;
    onJumpToDay?: (dateISO: string) => void;
}

function fmtAppointmentDate(iso: string): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString('es-ES', {
            timeZone: 'Europe/Madrid',
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch { return ''; }
}

function fmtRelative(iso: string): string {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const diff = Date.now() - d.getTime();
        const sec = Math.floor(diff / 1000);
        if (sec < 60) return 'ahora mismo';
        const min = Math.floor(sec / 60);
        if (min < 60) return `hace ${min} min`;
        const h = Math.floor(min / 60);
        if (h < 24) return `hace ${h} h`;
        const days = Math.floor(h / 24);
        if (days < 7) return `hace ${days} d`;
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return ''; }
}

function sourceLabel(src: string): string {
    if (src === 'bot') return 'Laura (bot)';
    if (src === 'manual') return 'Equipo';
    if (src === 'client_whatsapp') return 'Cliente';
    return src || '—';
}

function SourceIcon({ src }: { src: string }) {
    if (src === 'bot') return <Bot className="w-3.5 h-3.5" />;
    if (src === 'manual') return <User className="w-3.5 h-3.5" />;
    if (src === 'client_whatsapp') return <MessageCircle className="w-3.5 h-3.5" />;
    return null;
}

export const AppointmentHistoryPanel: React.FC<Props> = ({ isOpen, onClose, isDark, socket, onJumpToDay }) => {
    const [events, setEvents] = useState<AppointmentEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [warning, setWarning] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'booked' | 'cancelled' | 'delivered'>('all');

    const fetchEvents = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/appointment-events?limit=100`);
            if (!res.ok) throw new Error('Error de servidor');
            const data = await res.json();
            setEvents(Array.isArray(data.events) ? data.events : []);
            setWarning(data.warning || null);
        } catch (e: any) {
            setError(e.message || 'Error cargando historial');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) fetchEvents();
    }, [isOpen]);

    useEffect(() => {
        if (!socket) return;
        const onEvent = (evt: any) => {
            if (!evt || (evt.type !== 'booked' && evt.type !== 'cancelled' && evt.type !== 'delivered')) return;
            setEvents(prev => [{
                id: `live-${evt.appointmentId}-${evt.createdAt}`,
                type: evt.type,
                appointmentId: evt.appointmentId || '',
                clientName: evt.clientName || '',
                clientPhone: evt.clientPhone || '',
                appointmentDate: evt.appointmentDate || '',
                agenda: evt.agenda || '',
                source: evt.source || '',
                createdAt: evt.createdAt || new Date().toISOString()
            }, ...prev].slice(0, 200));
        };
        socket.on('appointment_event', onEvent);
        return () => { socket.off('appointment_event', onEvent); };
    }, [socket]);

    if (!isOpen) return null;

    const filtered = events.filter(e => filter === 'all' ? true : e.type === filter);

    return (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-end md:justify-center bg-black/40 backdrop-blur-sm p-0 md:p-4" onClick={onClose}>
            <div
                className={`w-full md:w-[560px] md:max-w-[92vw] h-full md:h-auto md:max-h-[85vh] flex flex-col rounded-none md:rounded-2xl shadow-2xl border ${isDark ? 'bg-slate-900 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`flex items-center gap-3 px-4 py-3 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    <div className="flex-1">
                        <h2 className="text-lg font-bold">Historial de citas</h2>
                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Reservas y cancelaciones — últimos 100 eventos</p>
                    </div>
                    <button onClick={fetchEvents} disabled={loading} title="Refrescar" className={`p-2 rounded-lg transition ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'} ${loading ? 'opacity-50 cursor-wait' : ''}`}>
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={onClose} title="Cerrar" className={`p-2 rounded-lg transition ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'}`}>
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className={`flex flex-wrap gap-1 px-4 py-2 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    {(['all', 'booked', 'cancelled', 'delivered'] as const).map(k => (
                        <button
                            key={k}
                            onClick={() => setFilter(k)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold transition ${filter === k
                                ? (isDark ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-indigo-100 text-indigo-700 border border-indigo-200')
                                : (isDark ? 'text-slate-400 hover:bg-white/5' : 'text-slate-500 hover:bg-slate-100')}`}
                        >
                            {k === 'all' ? 'Todos' : k === 'booked' ? 'Reservas' : k === 'cancelled' ? 'Cancelaciones' : 'Entregas'}
                        </button>
                    ))}
                </div>

                {warning && (
                    <div className={`px-4 py-2 text-xs ${isDark ? 'bg-yellow-900/20 text-yellow-300 border-b border-yellow-700/30' : 'bg-yellow-50 text-yellow-800 border-b border-yellow-200'}`}>
                        ⚠️ {warning}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-2 py-2">
                    {loading && events.length === 0 ? (
                        <div className={`text-center py-12 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Cargando...</div>
                    ) : error ? (
                        <div className={`text-center py-12 text-sm ${isDark ? 'text-red-400' : 'text-red-600'}`}>{error}</div>
                    ) : filtered.length === 0 ? (
                        <div className={`text-center py-12 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Aún no hay eventos.</div>
                    ) : filtered.map(evt => {
                        // Tres tipos de evento, cada uno con su paleta:
                        //  - booked     → ámbar/amarillo (✓ nueva cita)
                        //  - cancelled  → rojo rosa     (✗ cancelada)
                        //  - delivered  → verde esmeralda (📦 vehículo entregado)
                        const isBooked = evt.type === 'booked';
                        const isDelivered = evt.type === 'delivered';
                        const isCancelled = evt.type === 'cancelled';
                        const palette = isBooked
                            ? { border: isDark ? 'border-amber-700/30' : 'border-amber-100', bg: isDark ? 'bg-amber-900/10 hover:bg-amber-900/20' : 'bg-amber-50/60 hover:bg-amber-100', icon: isDark ? 'text-amber-400' : 'text-amber-600', title: isDark ? 'text-amber-300' : 'text-amber-800' }
                            : isDelivered
                                ? { border: isDark ? 'border-emerald-700/30' : 'border-emerald-100', bg: isDark ? 'bg-emerald-900/10 hover:bg-emerald-900/20' : 'bg-emerald-50/60 hover:bg-emerald-100', icon: isDark ? 'text-emerald-400' : 'text-emerald-600', title: isDark ? 'text-emerald-300' : 'text-emerald-800' }
                                : { border: isDark ? 'border-rose-700/30' : 'border-rose-100', bg: isDark ? 'bg-rose-900/10 hover:bg-rose-900/20' : 'bg-rose-50/60 hover:bg-rose-100', icon: isDark ? 'text-rose-400' : 'text-rose-600', title: isDark ? 'text-rose-300' : 'text-rose-800' };
                        const title = isBooked ? 'Nueva cita' : isDelivered ? 'Vehículo entregado' : isCancelled ? 'Cancelada' : evt.type;
                        const IconComp = isBooked ? CheckCircle2 : isDelivered ? PackageCheck : XCircle;
                        return (
                            <button
                                key={evt.id}
                                onClick={() => {
                                    if (onJumpToDay && evt.appointmentDate) onJumpToDay(evt.appointmentDate.slice(0, 10));
                                    onClose();
                                }}
                                className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl mb-1 transition border ${palette.border} ${palette.bg}`}
                            >
                                <div className={`mt-0.5 flex-shrink-0 ${palette.icon}`}>
                                    <IconComp className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-sm font-bold ${palette.title}`}>
                                            {title}
                                        </span>
                                        <span className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>
                                            {evt.clientName || 'Sin nombre'}
                                        </span>
                                        {evt.agenda && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isDark ? 'bg-white/5 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                                                {evt.agenda}
                                            </span>
                                        )}
                                    </div>
                                    <div className={`text-xs mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                        {fmtAppointmentDate(evt.appointmentDate)}
                                    </div>
                                    <div className={`flex items-center gap-3 mt-1 text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        <span className="flex items-center gap-1"><SourceIcon src={evt.source} />{sourceLabel(evt.source)}</span>
                                        <span>·</span>
                                        <span>{fmtRelative(evt.createdAt)}</span>
                                        {evt.clientPhone && <><span>·</span><span className="truncate">{evt.clientPhone}</span></>}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
