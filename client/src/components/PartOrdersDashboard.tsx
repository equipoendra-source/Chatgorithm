import { useState, useEffect, useMemo } from 'react';
import {
    Package, PackageCheck, ArrowLeft, Plus, X, Search, RefreshCw,
    Download, Trash2, Loader2, AlertTriangle, Clock
} from 'lucide-react';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';

// ==========================================================
//  PEDIDOS DE PIEZAS A PROVEEDORES — panel de Recambios
// ==========================================================
// Fase 1: alta manual + marcar llegada + export Excel. La fila se pinta en
// rojo cuando un pedido pendiente supera DELAY_DAYS días sin llegar.
// Fase 2 (pendiente): los pedidos se crearán solos al detectar el mensaje
// en clave enviado al proveedor por WhatsApp.
// Solo lo ven los perfiles con rol "Recambios" (gate en Sidebar/App).

interface PartOrder {
    id: string;
    matricula: string;
    pieza: string;
    referencia: string;
    proveedor: string;
    orderedAt: string;   // ISO
    arrived: boolean;
    arrivedAt: string;   // ISO
    orderedBy: string;
}

interface Props {
    onBack?: () => void;
    currentUser?: { username: string; role: string };
}

// Umbral de retraso: un pedido pendiente con >= este nº de días se marca en rojo.
const DELAY_DAYS = 3;

const daysSince = (iso: string): number => {
    if (!iso) return 0;
    const ms = Date.now() - new Date(iso).getTime();
    return Math.max(0, Math.floor(ms / 86400000));
};

const fmtDate = (iso: string): string => {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit' });
    } catch { return ''; }
};

export default function PartOrdersDashboard({ onBack, currentUser }: Props) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [orders, setOrders] = useState<PartOrder[]>([]);
    const [tableMissing, setTableMissing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<'all' | 'pending' | 'arrived'>('all');
    const [search, setSearch] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ matricula: '', pieza: '', referencia: '', proveedor: '' });

    const load = async (silent = false) => {
        if (silent) setRefreshing(true); else setLoading(true);
        try {
            const r = await fetch(`${API_URL}/part-orders`);
            if (r.ok) {
                const d = await r.json();
                setOrders(Array.isArray(d.orders) ? d.orders : []);
                setTableMissing(!!d.tableMissing);
            }
        } catch (e) {
            console.error('[PartOrders] Error cargando:', e);
        } finally {
            setLoading(false); setRefreshing(false);
        }
    };

    useEffect(() => {
        load();
        // Refresco silencioso, pausado mientras el modal de alta está abierto
        // para no pisar lo que el usuario esté escribiendo.
        const interval = setInterval(() => { if (!showAdd) load(true); }, 15000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showAdd]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return orders.filter(o => {
            if (filter === 'pending' && o.arrived) return false;
            if (filter === 'arrived' && !o.arrived) return false;
            if (!q) return true;
            return [o.matricula, o.pieza, o.referencia, o.proveedor, o.orderedBy]
                .some(v => (v || '').toLowerCase().includes(q));
        });
    }, [orders, filter, search]);

    const stats = useMemo(() => {
        const pending = orders.filter(o => !o.arrived);
        return {
            pending: pending.length,
            late: pending.filter(o => daysSince(o.orderedAt) >= DELAY_DAYS).length,
            arrived: orders.filter(o => o.arrived).length,
        };
    }, [orders]);

    // Lista de proveedores ya usados → datalist del formulario (autocompletar).
    const knownProviders = useMemo(
        () => Array.from(new Set(orders.map(o => o.proveedor).filter(Boolean))).sort(),
        [orders]
    );

    const markArrived = async (o: PartOrder, arrived: boolean) => {
        if (!arrived && !window.confirm('¿Deshacer la llegada de esta pieza? Volverá a contar como pendiente.')) return;
        try {
            const r = await fetch(`${API_URL}/part-orders/${o.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ arrived })
            });
            if (r.ok) {
                const d = await r.json();
                setOrders(prev => prev.map(x => x.id === o.id ? d.order : x));
            } else {
                const d = await r.json().catch(() => ({}));
                alert(d.error || 'No se pudo actualizar el pedido.');
            }
        } catch { alert('Error de conexión actualizando el pedido.'); }
    };

    const removeOrder = async (o: PartOrder) => {
        if (!window.confirm(`¿Borrar el pedido "${o.pieza || o.referencia}"? Esto no se puede deshacer.`)) return;
        try {
            const r = await fetch(`${API_URL}/part-orders/${o.id}`, { method: 'DELETE' });
            if (r.ok) setOrders(prev => prev.filter(x => x.id !== o.id));
            else alert('No se pudo borrar el pedido.');
        } catch { alert('Error de conexión borrando el pedido.'); }
    };

    const createOrder = async () => {
        if (!form.pieza.trim() && !form.referencia.trim()) {
            alert('Indica al menos la pieza o la referencia.'); return;
        }
        setSaving(true);
        try {
            const r = await fetch(`${API_URL}/part-orders`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, orderedBy: currentUser?.username || '' })
            });
            const d = await r.json().catch(() => ({}));
            if (r.ok && d.order) {
                setOrders(prev => [d.order, ...prev]);
                setForm({ matricula: '', pieza: '', referencia: '', proveedor: '' });
                setShowAdd(false);
            } else {
                alert(d.error || 'No se pudo crear el pedido.');
            }
        } catch { alert('Error de conexión creando el pedido.'); }
        finally { setSaving(false); }
    };

    // Descarga vía fetch → blob: el interceptor de auth añade el Bearer solo;
    // un <a href> directo no llevaría el token con ENFORCE_API_AUTH activo.
    const downloadExcel = async () => {
        try {
            const r = await fetch(`${API_URL}/part-orders/export`);
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                alert(d.error || 'No se pudo generar el Excel.'); return;
            }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'pedidos-piezas.xlsx'; a.click();
            URL.revokeObjectURL(url);
        } catch { alert('Error de conexión generando el Excel.'); }
    };

    const chipFor = (o: PartOrder) => {
        if (o.arrived) return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-green-500/20 text-green-600 inline-flex items-center gap-1"><PackageCheck className="w-3 h-3" /> Llegada</span>;
        const d = daysSince(o.orderedAt);
        if (d >= DELAY_DAYS) return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-red-500/20 text-red-500 inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Retrasado · {d} días</span>;
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-amber-500/20 text-amber-500 inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Pendiente · {d === 0 ? 'hoy' : d === 1 ? '1 día' : `${d} días`}</span>;
    };

    const inputCls = `w-full px-4 py-2.5 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200' : 'bg-white border-slate-200 text-slate-800'}`;

    return (
        <div className={`h-full w-full flex flex-col ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            {/* ===== Header ===== */}
            <div className={`px-6 py-4 border-b flex items-center justify-between flex-shrink-0 gap-3 flex-wrap ${isDark ? 'border-white/5 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/5 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`} title="Volver">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    )}
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                        <Package className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className={`text-xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Pedidos de Piezas</h1>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Seguimiento de pedidos a proveedores · Recambios</p>
                    </div>
                    {refreshing && <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={downloadExcel} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition ${isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                        <Download className="w-4 h-4" /> Descargar Excel
                    </button>
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:shadow-lg hover:shadow-emerald-500/30 text-white font-semibold transition active:scale-[0.98]">
                        <Plus className="w-4 h-4" /> Añadir pedido
                    </button>
                </div>
            </div>

            {/* ===== Aviso de setup (tabla sin crear en Airtable) ===== */}
            {tableMissing && (
                <div className={`mx-6 mt-4 p-4 rounded-xl border text-sm flex items-start gap-3 ${isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-bold mb-1">Falta crear la tabla en Airtable</p>
                        <p>Crea una tabla llamada <b>PartOrders</b> con las columnas: <b>matricula, pieza, referencia, proveedor, orderedAt, arrivedAt, orderedBy</b> (texto de una línea) y <b>arrived</b> (casilla de verificación). En cuanto exista, este panel funcionará solo — no hace falta redesplegar nada.</p>
                    </div>
                </div>
            )}

            {/* ===== Tarjetas resumen ===== */}
            <div className="px-6 pt-4 grid grid-cols-3 gap-3 flex-shrink-0">
                {[
                    { label: 'Pendientes', value: stats.pending, cls: 'text-amber-500' },
                    { label: `Retrasados (≥${DELAY_DAYS} días)`, value: stats.late, cls: 'text-red-500' },
                    { label: 'Llegadas', value: stats.arrived, cls: 'text-green-600' },
                ].map(s => (
                    <div key={s.label} className={`p-3 rounded-xl border ${isDark ? 'border-white/5 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{s.label}</p>
                        <p className={`text-2xl font-black ${s.cls}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* ===== Filtros ===== */}
            <div className="px-6 pt-4 pb-2 flex items-center gap-2 flex-wrap flex-shrink-0">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar matrícula, pieza, referencia…"
                        className={`w-full pl-9 pr-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200 placeholder-slate-500' : 'bg-white border-slate-200 text-slate-800'}`}
                    />
                </div>
                {([['all', 'Todos'], ['pending', 'Pendientes'], ['arrived', 'Llegadas']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setFilter(key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${filter === key
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : (isDark ? 'text-slate-400 hover:text-slate-200 border border-white/10' : 'text-slate-500 hover:text-slate-700 border border-slate-200 bg-white')}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* ===== Tabla ===== */}
            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">
                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
                ) : filtered.length === 0 ? (
                    <div className={`text-center py-16 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
                        {orders.length === 0 ? 'Todavía no hay pedidos. Añade el primero con el botón verde.' : 'Ningún pedido coincide con el filtro.'}
                    </div>
                ) : (
                    <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[760px]">
                                <thead className={`text-xs uppercase ${isDark ? 'bg-slate-800/60 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                                    <tr>
                                        <th className="px-4 py-2.5 text-left">Matrícula</th>
                                        <th className="px-4 py-2.5 text-left">Pieza</th>
                                        <th className="px-4 py-2.5 text-left">Referencia</th>
                                        <th className="px-4 py-2.5 text-left">Proveedor</th>
                                        <th className="px-4 py-2.5 text-left">Pedido</th>
                                        <th className="px-4 py-2.5 text-left">Estado</th>
                                        <th className="px-4 py-2.5 text-left">Llegada</th>
                                        <th className="px-4 py-2.5"></th>
                                    </tr>
                                </thead>
                                <tbody className={isDark ? 'bg-slate-900/30' : 'bg-white'}>
                                    {filtered.map(o => (
                                        <tr key={o.id} className={`border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                                            <td className={`px-4 py-2.5 font-mono font-bold text-xs ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{o.matricula || '—'}</td>
                                            <td className="px-4 py-2.5">{o.pieza || '—'}</td>
                                            <td className={`px-4 py-2.5 font-mono text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{o.referencia || '—'}</td>
                                            <td className="px-4 py-2.5 font-semibold">{o.proveedor || '—'}</td>
                                            <td className={`px-4 py-2.5 font-mono text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{fmtDate(o.orderedAt)}</td>
                                            <td className="px-4 py-2.5">{chipFor(o)}</td>
                                            <td className="px-4 py-2.5">
                                                {o.arrived ? (
                                                    <button onClick={() => markArrived(o, false)} title="Pulsar para deshacer la llegada"
                                                        className="text-xs font-bold text-green-600 inline-flex items-center gap-1 hover:opacity-70">
                                                        <PackageCheck className="w-3.5 h-3.5" /> {fmtDate(o.arrivedAt)}
                                                    </button>
                                                ) : (
                                                    <button onClick={() => markArrived(o, true)}
                                                        className={`text-xs font-bold px-2.5 py-1 rounded-md border border-dashed transition ${isDark ? 'border-amber-500/50 text-amber-400 hover:bg-amber-500/10' : 'border-amber-400 text-amber-600 hover:bg-amber-50'}`}>
                                                        Marcar llegada
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <button onClick={() => removeOrder(o)} title="Borrar pedido"
                                                    className={`p-1.5 rounded-md transition ${isDark ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* ===== Modal: añadir pedido a mano ===== */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowAdd(false)}>
                    <div onClick={e => e.stopPropagation()}
                        className={`w-full max-w-md flex flex-col rounded-2xl shadow-2xl ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}`}>
                        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                                    <Package className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Añadir pedido</h2>
                                    <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Se registra con la fecha de ahora</p>
                                </div>
                            </div>
                            <button onClick={() => setShowAdd(false)} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/5 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-6 py-4 flex flex-col gap-3">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide mb-1.5">Matrícula</label>
                                <input className={inputCls} value={form.matricula} onChange={e => setForm(f => ({ ...f, matricula: e.target.value.toUpperCase() }))} placeholder="1234-ABC" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide mb-1.5">Pieza</label>
                                <input className={inputCls} value={form.pieza} onChange={e => setForm(f => ({ ...f, pieza: e.target.value }))} placeholder="Embrague" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide mb-1.5">Referencia</label>
                                <input className={inputCls} value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} placeholder="REF-889" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide mb-1.5">Proveedor</label>
                                <input className={inputCls} list="part-orders-providers" value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} placeholder="Ford / Colón…" />
                                <datalist id="part-orders-providers">
                                    {knownProviders.map(p => <option key={p} value={p} />)}
                                </datalist>
                            </div>
                        </div>
                        <div className={`px-6 py-4 border-t flex justify-end gap-2 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                            <button onClick={() => setShowAdd(false)} className={`px-4 py-2 rounded-xl border text-sm font-semibold ${isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}>Cancelar</button>
                            <button onClick={createOrder} disabled={saving}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Guardar pedido
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
