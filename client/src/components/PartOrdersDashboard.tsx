import { useState, useEffect, useMemo, type ReactNode } from 'react';
import {
    Package, PackageCheck, ArrowLeft, Plus, X, Search, RefreshCw,
    Download, Trash2, Loader2, AlertTriangle, Clock, RotateCcw
} from 'lucide-react';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';

// ==========================================================
//  PEDIDOS Y ABONOS A PROVEEDORES — panel de Recambios
// ==========================================================
// UN SOLO listado que junta pedidos (tabla PartOrders) y abonos (PartAbonos).
// Las pestañas filtran:
//   Pendientes → todo lo NO completado: pedidos no recibidos + abonos no abonados
//   Recibidos  → solo pedidos recibidos
//   Abonos     → todos los abonos (cualquier estado)
// Cada fila sabe si es 'order' o 'abono' (kind), y las acciones (marcar
// hecho, plazo, borrar) van al endpoint correcto. Solo lo ven Recambios/Taller.

type Kind = 'order' | 'abono';

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
    // Plazo prometido y flag "sin fecha" son excluyentes:
    //   etaDays: N   → cuenta atrás, alarma al pasarse.
    //   noEta: true  → "no hay fecha aún"; nunca salta alarma.
    //   ambos vacíos → sin decidir (respaldo de 3 días).
    etaDays: number | null;
    noEta: boolean;
    kind: Kind;          // lo añade el cliente al cargar (no viene del backend)
}

interface Props {
    onBack?: () => void;
    currentUser?: { username: string; role: string };
}

// Umbral de retraso de RESPALDO: solo se usa en registros SIN plazo prometido.
const DELAY_DAYS = 3;

// Endpoint según el tipo de registro.
const rootFor = (kind: Kind) => `${API_URL}/${kind === 'abono' ? 'part-abonos' : 'part-orders'}`;

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

// Plazos rápidos que suele dar el proveedor por teléfono ("48h", "5 días"…).
const ETA_PRESETS: { label: string; days: number }[] = [
    { label: '24h', days: 1 },
    { label: '48h', days: 2 },
    { label: '72h', days: 3 },
    { label: '5 días', days: 5 },
    { label: '7 días', days: 7 },
    { label: '10 días', days: 10 },
    { label: '15 días', days: 15 },
];

const hasEta = (o: PartOrder): boolean => o.etaDays !== null && Number.isFinite(o.etaDays as number);

// Textos que dependen del tipo (pedido vs abono).
const kindNoun = (k: Kind) => (k === 'abono' ? 'abono' : 'pedido');
const doneVerb = (k: Kind) => (k === 'abono' ? 'Marcar abonado' : 'Marcar recibido');
const doneNoun = (k: Kind) => (k === 'abono' ? 'Abonado' : 'Recibido');
const undoText = (k: Kind) => (k === 'abono'
    ? '¿Deshacer el abono de esta pieza? Volverá a contar como pendiente.'
    : '¿Deshacer la recepción de esta pieza? Volverá a contar como pendiente.');

// Estado calculado de un registro. La cuenta atrás usa el plazo (etaDays); si
// hay noEta nunca hay alarma; si no hay plazo NI noEta, cae al respaldo.
type OrderStatus =
    | { kind: 'arrived' }
    | { kind: 'overdue'; overdueDays: number }
    | { kind: 'due-today' }
    | { kind: 'due-tomorrow' }
    | { kind: 'counting'; remaining: number }
    | { kind: 'no-eta'; days: number }
    | { kind: 'pending'; days: number }
    | { kind: 'late-fallback'; days: number };

const computeStatus = (o: PartOrder): OrderStatus => {
    if (o.arrived) return { kind: 'arrived' };
    const d = daysSince(o.orderedAt);
    if (o.noEta) return { kind: 'no-eta', days: d };
    if (!hasEta(o)) {
        return d >= DELAY_DAYS ? { kind: 'late-fallback', days: d } : { kind: 'pending', days: d };
    }
    const remaining = (o.etaDays as number) - d;
    if (remaining < 0) return { kind: 'overdue', overdueDays: -remaining };
    if (remaining === 0) return { kind: 'due-today' };
    if (remaining === 1) return { kind: 'due-tomorrow' };
    return { kind: 'counting', remaining };
};

// ¿Pendiente y ya vencido? (con plazo → pasó el plazo; sin plazo → respaldo;
// "sin fecha" → NUNCA). Alimenta la tarjeta "Vencidos", el resaltado y el orden.
const isOverdue = (o: PartOrder): boolean => {
    if (o.arrived || o.noEta) return false;
    const k = computeStatus(o).kind;
    return k === 'overdue' || k === 'late-fallback';
};

export default function PartOrdersDashboard({ onBack, currentUser }: Props) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [items, setItems] = useState<PartOrder[]>([]);   // pedidos + abonos juntos
    const [tableMissing, setTableMissing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState<'pending' | 'arrived' | 'abonos'>('pending');
    const [search, setSearch] = useState('');
    const [showAdd, setShowAdd] = useState(false);
    const [saving, setSaving] = useState(false);
    // eta: '' = sin decidir, '__none__' = "sin fecha", '1'..'N' = días.
    const [form, setForm] = useState({ matricula: '', pieza: '', referencia: '', proveedor: '', eta: '' });
    const [etaModal, setEtaModal] = useState<PartOrder | null>(null);
    const [etaInput, setEtaInput] = useState('');
    const [etaSaving, setEtaSaving] = useState(false);

    // En la pestaña Abonos, "Añadir" crea un abono; en el resto, un pedido.
    const addKind: Kind = filter === 'abonos' ? 'abono' : 'order';

    const load = async (silent = false) => {
        if (silent) setRefreshing(true); else setLoading(true);
        try {
            // Pedidos y abonos en paralelo → un solo listado combinado.
            const [ro, ra] = await Promise.all([
                fetch(`${API_URL}/part-orders`),
                fetch(`${API_URL}/part-abonos`),
            ]);
            const combined: PartOrder[] = [];
            let missing = false;
            if (ro.ok) {
                const d = await ro.json();
                if (d.tableMissing) missing = true;
                (Array.isArray(d.orders) ? d.orders : []).forEach((o: any) => combined.push({ ...o, kind: 'order' }));
            }
            if (ra.ok) {
                const d = await ra.json();
                if (d.tableMissing) missing = true;
                (Array.isArray(d.orders) ? d.orders : []).forEach((o: any) => combined.push({ ...o, kind: 'abono' }));
            }
            setItems(combined);
            setTableMissing(missing);
        } catch (e) {
            console.error('[PartOrders] Error cargando:', e);
        } finally {
            setLoading(false); setRefreshing(false);
        }
    };

    useEffect(() => {
        load();
        // Refresco silencioso, pausado mientras un modal está abierto.
        const interval = setInterval(() => { if (!showAdd && !etaModal) load(true); }, 15000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showAdd, etaModal]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return items.filter(o => {
            // Filtro por pestaña.
            //   Pendientes → todo lo NO completado (pedidos + abonos pendientes)
            //   Recibidos  → solo pedidos recibidos
            //   Abonos     → todos los abonos
            if (filter === 'pending' && o.arrived) return false;
            if (filter === 'arrived' && !(o.kind === 'order' && o.arrived)) return false;
            if (filter === 'abonos' && o.kind !== 'abono') return false;
            // Búsqueda.
            if (!q) return true;
            return [o.matricula, o.pieza, o.referencia, o.proveedor, o.orderedBy]
                .some(v => (v || '').toLowerCase().includes(q));
        }).sort((a, b) => {
            // Los vencidos (a reclamar) suben arriba; luego los más recientes.
            const ao = isOverdue(a) ? 1 : 0;
            const bo = isOverdue(b) ? 1 : 0;
            if (ao !== bo) return bo - ao;
            return (b.orderedAt || '').localeCompare(a.orderedAt || '');
        });
    }, [items, filter, search]);

    // Tarjetas resumen: sobre TODO el conjunto (pedidos + abonos).
    const stats = useMemo(() => {
        const pending = items.filter(o => !o.arrived);
        return {
            pending: pending.length,
            late: pending.filter(isOverdue).length,
            done: items.filter(o => o.arrived).length,
        };
    }, [items]);

    const knownProviders = useMemo(
        () => Array.from(new Set(items.map(o => o.proveedor).filter(Boolean))).sort(),
        [items]
    );

    // Reemplaza en el listado el item editado (comparando por id + kind, porque
    // el backend no devuelve kind y hay que reponerlo).
    const replaceItem = (o: PartOrder, fresh: any) => {
        setItems(prev => prev.map(x => (x.id === o.id && x.kind === o.kind) ? { ...fresh, kind: o.kind } : x));
    };

    const markArrived = async (o: PartOrder, arrived: boolean) => {
        if (!arrived && !window.confirm(undoText(o.kind))) return;
        try {
            const r = await fetch(`${rootFor(o.kind)}/${o.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ arrived })
            });
            if (r.ok) {
                const d = await r.json();
                replaceItem(o, d.order);
            } else {
                const d = await r.json().catch(() => ({}));
                alert(d.error || `No se pudo actualizar el ${kindNoun(o.kind)}.`);
            }
        } catch { alert(`Error de conexión actualizando el ${kindNoun(o.kind)}.`); }
    };

    const removeOrder = async (o: PartOrder) => {
        if (!window.confirm(`¿Borrar el ${kindNoun(o.kind)} "${o.pieza || o.referencia}"? Esto no se puede deshacer.`)) return;
        try {
            const r = await fetch(`${rootFor(o.kind)}/${o.id}`, { method: 'DELETE' });
            if (r.ok) setItems(prev => prev.filter(x => !(x.id === o.id && x.kind === o.kind)));
            else alert(`No se pudo borrar el ${kindNoun(o.kind)}.`);
        } catch { alert(`Error de conexión borrando el ${kindNoun(o.kind)}.`); }
    };

    const createOrder = async () => {
        if (!form.pieza.trim() && !form.referencia.trim()) {
            alert('Indica al menos la pieza o la referencia.'); return;
        }
        setSaving(true);
        try {
            const noEta = form.eta === '__none__';
            const r = await fetch(rootFor(addKind), {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    matricula: form.matricula, pieza: form.pieza,
                    referencia: form.referencia, proveedor: form.proveedor,
                    etaDays: (noEta || form.eta.trim() === '') ? '' : form.eta,
                    noEta,
                    orderedBy: currentUser?.username || ''
                })
            });
            const d = await r.json().catch(() => ({}));
            if (r.ok && d.order) {
                setItems(prev => [{ ...d.order, kind: addKind }, ...prev]);
                setForm({ matricula: '', pieza: '', referencia: '', proveedor: '', eta: '' });
                setShowAdd(false);
            } else {
                alert(d.error || `No se pudo crear el ${kindNoun(addKind)}.`);
            }
        } catch { alert(`Error de conexión creando el ${kindNoun(addKind)}.`); }
        finally { setSaving(false); }
    };

    // Guarda el plazo de un registro. { days } fija etaDays; { noEta } marca
    // "sin fecha"; { clear } vuelve a "sin decidir". El backend hace la
    // exclusión mutua.
    const saveEta = async (o: PartOrder, mode: { days?: number; noEta?: boolean; clear?: boolean }) => {
        setEtaSaving(true);
        try {
            const body = mode.days !== undefined
                ? { etaDays: mode.days }
                : mode.noEta
                    ? { noEta: true }
                    : { etaDays: '', noEta: false };
            const r = await fetch(`${rootFor(o.kind)}/${o.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (r.ok) {
                const d = await r.json();
                replaceItem(o, d.order);
                setEtaModal(null);
            } else {
                const d = await r.json().catch(() => ({}));
                alert(d.error || 'No se pudo guardar el plazo.');
            }
        } catch { alert('Error de conexión guardando el plazo.'); }
        finally { setEtaSaving(false); }
    };

    const openEtaModal = (o: PartOrder) => {
        setEtaInput(o.noEta ? '__none__' : (o.etaDays != null ? String(o.etaDays) : ''));
        setEtaModal(o);
    };

    const downloadExcel = async () => {
        // Descarga el Excel del conjunto activo: en la pestaña Abonos, abonos;
        // en las demás, pedidos.
        const which = filter === 'abonos' ? 'part-abonos' : 'part-orders';
        const file = filter === 'abonos' ? 'abonos-proveedores.xlsx' : 'pedidos-piezas.xlsx';
        try {
            const r = await fetch(`${API_URL}/${which}/export`);
            if (!r.ok) {
                const d = await r.json().catch(() => ({}));
                alert(d.error || 'No se pudo generar el Excel.'); return;
            }
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = file; a.click();
            URL.revokeObjectURL(url);
        } catch { alert('Error de conexión generando el Excel.'); }
    };

    const chip = (cls: string, icon: ReactNode, text: string) => (
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase inline-flex items-center gap-1 ${cls}`}>{icon} {text}</span>
    );
    const chipFor = (o: PartOrder) => {
        const st = computeStatus(o);
        switch (st.kind) {
            case 'arrived':
                return chip('bg-green-500/20 text-green-600', <PackageCheck className="w-3 h-3" />, doneNoun(o.kind));
            case 'overdue':
                return chip('bg-red-500/20 text-red-500', <AlertTriangle className="w-3 h-3" />, `Reclamar · vencido hace ${st.overdueDays === 1 ? '1 día' : `${st.overdueDays} días`}`);
            case 'late-fallback':
                return chip('bg-red-500/20 text-red-500', <AlertTriangle className="w-3 h-3" />, `Retrasado · ${st.days} días`);
            case 'due-today':
                return chip('bg-orange-500/20 text-orange-500', <Clock className="w-3 h-3" />, 'Vence hoy');
            case 'due-tomorrow':
                return chip('bg-amber-500/20 text-amber-500', <Clock className="w-3 h-3" />, 'Vence mañana');
            case 'counting':
                return chip('bg-amber-500/20 text-amber-500', <Clock className="w-3 h-3" />, `Faltan ${st.remaining} días`);
            case 'no-eta':
                return chip(isDark ? 'bg-slate-700/50 text-slate-300' : 'bg-slate-200 text-slate-600', <Clock className="w-3 h-3" />, `Sin fecha · pendiente${st.days > 0 ? ` (${st.days === 1 ? '1 día' : `${st.days} días`})` : ''}`);
            case 'pending':
                return chip('bg-amber-500/20 text-amber-500', <Clock className="w-3 h-3" />, `Pendiente · ${st.days === 0 ? 'hoy' : st.days === 1 ? '1 día' : `${st.days} días`}`);
        }
    };

    // Cabecera de la columna de acción (marcar hecho).
    const doneColHeader = filter === 'abonos' ? 'Abono' : filter === 'pending' ? 'Recibido / Abono' : 'Recibido';

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
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Seguimiento de pedidos y abonos a proveedores · Recambios</p>
                    </div>
                    {refreshing && <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={downloadExcel} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition ${isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                        <Download className="w-4 h-4" /> Descargar Excel
                    </button>
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:shadow-lg hover:shadow-emerald-500/30 text-white font-semibold transition active:scale-[0.98]">
                        <Plus className="w-4 h-4" /> Añadir {kindNoun(addKind)}
                    </button>
                </div>
            </div>

            {/* ===== Aviso de setup (tabla sin crear en Airtable) ===== */}
            {tableMissing && (
                <div className={`mx-6 mt-4 p-4 rounded-xl border text-sm flex items-start gap-3 ${isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="font-bold mb-1">Falta crear una tabla en Airtable</p>
                        <p>Este panel usa dos tablas: <b>PartOrders</b> (pedidos) y <b>PartAbonos</b> (abonos), ambas con las columnas: <b>matricula, pieza, referencia, proveedor, orderedAt, arrivedAt, orderedBy</b> (texto de una línea), <b>arrived</b> y <b>noEta</b> (casilla) y <b>etaDays</b> (número). En cuanto existan, este panel funcionará solo.</p>
                    </div>
                </div>
            )}

            {/* ===== Tarjetas resumen ===== */}
            <div className="px-6 pt-4 grid grid-cols-3 gap-3 flex-shrink-0">
                {[
                    { label: 'Pendientes', value: stats.pending, cls: 'text-amber-500' },
                    { label: 'Vencidos · reclamar', value: stats.late, cls: 'text-red-500' },
                    { label: 'Completados', value: stats.done, cls: 'text-green-600' },
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
                {([['pending', 'Pendientes'], ['arrived', 'Recibidos'], ['abonos', 'Abonos']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setFilter(key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition inline-flex items-center gap-1.5 ${filter === key
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : (isDark ? 'text-slate-400 hover:text-slate-200 border border-white/10' : 'text-slate-500 hover:text-slate-700 border border-slate-200 bg-white')}`}>
                        {key === 'abonos' && <RotateCcw className="w-3.5 h-3.5" />}
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
                        {items.length === 0 ? 'Todavía no hay nada. Añade el primero con el botón verde.' : 'Ningún registro coincide con el filtro.'}
                    </div>
                ) : (
                    <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[900px]">
                                <thead className={`text-xs uppercase ${isDark ? 'bg-slate-800/60 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                                    <tr>
                                        <th className="px-4 py-2.5 text-left">Matrícula</th>
                                        <th className="px-4 py-2.5 text-left">Pieza</th>
                                        <th className="px-4 py-2.5 text-left">Referencia</th>
                                        <th className="px-4 py-2.5 text-left">Proveedor</th>
                                        <th className="px-4 py-2.5 text-left">Fecha</th>
                                        <th className="px-4 py-2.5 text-left">Plazo</th>
                                        <th className="px-4 py-2.5 text-left">Estado</th>
                                        <th className="px-4 py-2.5 text-left">{doneColHeader}</th>
                                        <th className="px-4 py-2.5"></th>
                                    </tr>
                                </thead>
                                <tbody className={isDark ? 'bg-slate-900/30' : 'bg-white'}>
                                    {filtered.map(o => {
                                        // Los ABONOS se distinguen del pedido con las LETRAS en rojo
                                        // (columnas de datos) y un fondo rojo flojito. El chip de
                                        // Estado y los botones conservan su color. Los pedidos
                                        // vencidos NO pintan la fila: se ven por su chip de Estado.
                                        const abono = o.kind === 'abono';
                                        const txt = (slate: string) => abono ? (isDark ? 'text-red-400' : 'text-red-500') : slate;
                                        return (
                                        <tr key={`${o.kind}-${o.id}`} className={`border-t ${isDark ? 'border-white/5' : 'border-slate-100'} ${abono ? (isDark ? 'bg-red-500/5' : 'bg-red-50') : ''}`}>
                                            <td className={`px-4 py-2.5 font-mono font-bold text-xs ${txt(isDark ? 'text-slate-200' : 'text-slate-800')}`}>{o.matricula || '—'}</td>
                                            <td className={`px-4 py-2.5 ${abono ? (isDark ? 'text-red-400' : 'text-red-500') : ''}`}>{o.pieza || '—'}</td>
                                            <td className={`px-4 py-2.5 font-mono text-xs ${txt(isDark ? 'text-slate-300' : 'text-slate-600')}`}>{o.referencia || '—'}</td>
                                            <td className={`px-4 py-2.5 font-semibold ${abono ? (isDark ? 'text-red-400' : 'text-red-500') : ''}`}>{o.proveedor || '—'}</td>
                                            <td className={`px-4 py-2.5 font-mono text-xs ${txt(isDark ? 'text-slate-400' : 'text-slate-500')}`}>{fmtDate(o.orderedAt)}</td>
                                            <td className="px-4 py-2.5">
                                                {hasEta(o) ? (
                                                    <button onClick={() => openEtaModal(o)} title="Cambiar el plazo prometido"
                                                        className={`text-xs font-bold px-2 py-1 rounded-md border transition ${isDark ? 'border-white/10 text-slate-200 hover:bg-white/5' : 'border-slate-200 text-slate-700 hover:bg-slate-100'}`}>
                                                        {o.etaDays} {o.etaDays === 1 ? 'día' : 'días'}
                                                    </button>
                                                ) : o.noEta ? (
                                                    <button onClick={() => openEtaModal(o)} title="Cambiar a un plazo o quitar"
                                                        className={`text-xs font-bold px-2 py-1 rounded-md border transition inline-flex items-center gap-1 ${isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                                                        Sin fecha
                                                    </button>
                                                ) : (
                                                    <button onClick={() => openEtaModal(o)} title="Fijar el plazo prometido por el proveedor"
                                                        className={`text-xs font-semibold px-2 py-1 rounded-md border border-dashed transition inline-flex items-center gap-1 ${isDark ? 'border-white/10 text-slate-500 hover:text-slate-300 hover:bg-white/5' : 'border-slate-300 text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}>
                                                        <Clock className="w-3 h-3" /> plazo
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5">{chipFor(o)}</td>
                                            <td className="px-4 py-2.5">
                                                {o.arrived ? (
                                                    <button onClick={() => markArrived(o, false)} title={`Pulsar para deshacer el estado "${doneNoun(o.kind)}"`}
                                                        className="text-xs font-bold text-green-600 inline-flex items-center gap-1 hover:opacity-70">
                                                        <PackageCheck className="w-3.5 h-3.5" /> {fmtDate(o.arrivedAt)}
                                                    </button>
                                                ) : (
                                                    <button onClick={() => markArrived(o, true)}
                                                        className={`text-xs font-bold px-2.5 py-1 rounded-md border border-dashed transition ${isDark ? 'border-amber-500/50 text-amber-400 hover:bg-amber-500/10' : 'border-amber-400 text-amber-600 hover:bg-amber-50'}`}>
                                                        {doneVerb(o.kind)}
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5 text-right">
                                                <button onClick={() => removeOrder(o)} title={`Borrar ${kindNoun(o.kind)}`}
                                                    className={`p-1.5 rounded-md transition ${isDark ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}>
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* ===== Modal: añadir a mano ===== */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowAdd(false)}>
                    <div onClick={e => e.stopPropagation()}
                        className={`w-full max-w-md flex flex-col rounded-2xl shadow-2xl ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}`}>
                        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                                    {addKind === 'abono' ? <RotateCcw className="w-5 h-5 text-white" /> : <Package className="w-5 h-5 text-white" />}
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Añadir {kindNoun(addKind)}</h2>
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
                                <input className={inputCls} list="part-providers" value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} placeholder="Ford / Colón…" />
                                <datalist id="part-providers">
                                    {knownProviders.map(p => <option key={p} value={p} />)}
                                </datalist>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wide mb-1.5">Plazo prometido <span className="text-slate-400 normal-case font-normal">(opcional)</span></label>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {ETA_PRESETS.map(p => (
                                        <button key={p.days} type="button" onClick={() => setForm(f => ({ ...f, eta: String(p.days) }))}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${String(p.days) === form.eta
                                                ? 'bg-emerald-600 text-white border-emerald-600'
                                                : (isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-100')}`}>
                                            {p.label}
                                        </button>
                                    ))}
                                    <button type="button" onClick={() => setForm(f => ({ ...f, eta: '__none__' }))}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${form.eta === '__none__'
                                            ? 'bg-slate-600 text-white border-slate-600'
                                            : (isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-100')}`}>
                                        Sin fecha
                                    </button>
                                </div>
                                {form.eta !== '__none__' && (
                                    <div className="flex items-center gap-2">
                                        <input type="number" min={0} className={inputCls} value={form.eta}
                                            onChange={e => setForm(f => ({ ...f, eta: e.target.value }))} placeholder="Días (p. ej. 2)" />
                                        {form.eta.trim() !== '' && (
                                            <button type="button" onClick={() => setForm(f => ({ ...f, eta: '' }))}
                                                className={`px-3 py-2 rounded-lg text-xs font-semibold border ${isDark ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:bg-slate-100'}`}>
                                                Quitar
                                            </button>
                                        )}
                                    </div>
                                )}
                                <p className={`text-[11px] mt-1.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {form.eta === '__none__'
                                        ? 'Pendiente sin plazo definido. No saltará alarma hasta que le pongas un plazo o lo marques como hecho.'
                                        : 'Lo que te diga el proveedor (48h = 2 días). Salta alarma de reclamación al pasarse.'}
                                </p>
                            </div>
                        </div>
                        <div className={`px-6 py-4 border-t flex justify-end gap-2 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                            <button onClick={() => setShowAdd(false)} className={`px-4 py-2 rounded-xl border text-sm font-semibold ${isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}>Cancelar</button>
                            <button onClick={createOrder} disabled={saving}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Guardar {kindNoun(addKind)}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ===== Modal: fijar / cambiar el plazo ===== */}
            {etaModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEtaModal(null)}>
                    <div onClick={e => e.stopPropagation()}
                        className={`w-full max-w-sm flex flex-col rounded-2xl shadow-2xl ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}`}>
                        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                                    <Clock className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Plazo de entrega</h2>
                                    <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{etaModal.pieza || etaModal.referencia || '—'}{etaModal.proveedor ? ` · ${etaModal.proveedor}` : ''}</p>
                                </div>
                            </div>
                            <button onClick={() => setEtaModal(null)} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/5 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-6 py-4 flex flex-col gap-3">
                            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {etaInput === '__none__'
                                    ? 'Marcado como "Sin fecha": el proveedor no ha dado plazo. No saltará alarma hasta que le pongas uno o lo marques como hecho.'
                                    : '¿Qué plazo te ha dado el proveedor? (48h = 2 días). Al pasarse sin marcar, saltará la alarma de reclamación.'}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {ETA_PRESETS.map(p => (
                                    <button key={p.days} type="button" onClick={() => setEtaInput(String(p.days))}
                                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${String(p.days) === etaInput
                                            ? 'bg-emerald-600 text-white border-emerald-600'
                                            : (isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-100')}`}>
                                        {p.label}
                                    </button>
                                ))}
                                <button type="button" onClick={() => setEtaInput('__none__')}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${etaInput === '__none__'
                                        ? 'bg-slate-600 text-white border-slate-600'
                                        : (isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-100')}`}>
                                    Sin fecha
                                </button>
                            </div>
                            {etaInput !== '__none__' && (
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wide mb-1.5">Días</label>
                                    <input type="number" min={0} autoFocus className={inputCls} value={etaInput}
                                        onChange={e => setEtaInput(e.target.value)} placeholder="p. ej. 2" />
                                </div>
                            )}
                        </div>
                        <div className={`px-6 py-4 border-t flex justify-between gap-2 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                            <div>
                                {(etaModal.etaDays != null || etaModal.noEta) && (
                                    <button onClick={() => saveEta(etaModal, { clear: true })} disabled={etaSaving}
                                        className={`px-4 py-2 rounded-xl border text-sm font-semibold transition disabled:opacity-40 ${isDark ? 'border-red-500/40 text-red-400 hover:bg-red-500/10' : 'border-red-200 text-red-500 hover:bg-red-50'}`}>
                                        Quitar
                                    </button>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setEtaModal(null)} className={`px-4 py-2 rounded-xl border text-sm font-semibold ${isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}>Cancelar</button>
                                <button onClick={() => {
                                    if (etaInput === '__none__') { saveEta(etaModal, { noEta: true }); return; }
                                    const t = etaInput.trim();
                                    if (t === '') { saveEta(etaModal, { clear: true }); return; }
                                    const n = Math.floor(Number(t));
                                    if (!Number.isFinite(n) || n < 0) { alert('Indica un número de días válido (0 o más).'); return; }
                                    saveEta(etaModal, { days: n });
                                }} disabled={etaSaving}
                                    className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">
                                    {etaSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
