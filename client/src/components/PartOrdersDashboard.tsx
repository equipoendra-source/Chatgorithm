import { useState, useEffect, useMemo, useRef, Fragment, type ReactNode } from 'react';
import {
    Package, PackageCheck, ArrowLeft, Plus, X, Search, RefreshCw,
    Download, Trash2, Loader2, AlertTriangle, Clock, RotateCcw,
    ChevronRight, ChevronDown, FileText
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
// hecho, plazo, cantidad, borrar) van al endpoint correcto. Solo lo ven
// Recambios/Taller.
// Los pedidos de varias piezas que llegan en un mismo PDF (enviado al
// proveedor desde el chat) comparten `pedidoGrupo` y se enseñan como UN pedido
// desplegable, con acciones para todas sus piezas a la vez.

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
    // Unidades pedidas (Ctd.). null = no consta (registros antiguos o de plantilla).
    cantidad: number | null;
    // Mismo valor en todas las piezas de un PDF → se agrupan en un pedido.
    // '' = pieza suelta (plantilla o alta manual). Los abonos nunca lo tienen.
    pedidoGrupo: string;
    kind: Kind;          // lo añade el cliente al cargar (no viene del backend)
}

// Una fila de la tabla: un registro suelto o un pedido (varias piezas del mismo PDF).
type TableRow =
    | { type: 'single'; order: PartOrder }
    | { type: 'group'; id: string; items: PartOrder[] };

// El plazo se edita para un registro o para todas las piezas pendientes de un pedido.
type EtaTarget =
    | { type: 'one'; order: PartOrder }
    | { type: 'group'; items: PartOrder[] };

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

// 1 → "1" · 0.5 → "0,5". null → '' (quien llama pinta "—").
const fmtQty = (n: number | null): string =>
    n === null || n === undefined ? '' : n.toLocaleString('es-ES', { maximumFractionDigits: 2 });

// Cantidad escrita a mano → número, '' (sin cantidad) o null (no válida).
// Mismo rango que acepta el servidor: mayor que 0 y hasta 9999.
const parseQtyInput = (raw: string): number | '' | null => {
    const t = raw.trim().replace(',', '.');
    if (t === '') return '';
    const n = Number(t);
    // Se guarda con 2 decimales: lo que redondeado se queda en 0 no vale.
    const rounded = Math.round(n * 100) / 100;
    return Number.isFinite(n) && rounded > 0 && n <= 9999 ? rounded : null;
};
const QTY_ERROR = 'La cantidad tiene que ser un número mayor que 0 (hasta 9999). Déjala vacía si no la sabes.';

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

// Urgencia del estado (menor = peor). La cabecera de un pedido enseña el
// estado de su pieza más urgente: con una sola vencida, el pedido sale en rojo.
const statusSeverity = (o: PartOrder): number => {
    const st = computeStatus(o);
    switch (st.kind) {
        case 'overdue': return 0 - st.overdueDays / 1000;
        case 'late-fallback': return 1 - st.days / 1000;
        case 'due-today': return 2;
        case 'due-tomorrow': return 3;
        case 'counting': return 4 + st.remaining / 1000;
        case 'pending': return 5;
        case 'no-eta': return 6;
        case 'arrived': return 7;
    }
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
    const [form, setForm] = useState({ matricula: '', pieza: '', cantidad: '1', referencia: '', proveedor: '', eta: '' });
    // Edición del plazo: de un registro o de todas las piezas de un pedido.
    const [etaModal, setEtaModal] = useState<EtaTarget | null>(null);
    const [etaInput, setEtaInput] = useState('');
    const [etaSaving, setEtaSaving] = useState(false);
    // Edición de la cantidad (Ctd.) de un registro.
    const [qtyModal, setQtyModal] = useState<PartOrder | null>(null);
    const [qtyInput, setQtyInput] = useState('');
    const [qtySaving, setQtySaving] = useState(false);
    // Pedidos desplegados (por pedidoGrupo). Al entrar, todos replegados.
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    // Pedidos abiertos/cerrados a mano DURANTE una búsqueda (se olvida al
    // cambiar el texto): así, al borrar la búsqueda, todo vuelve como estaba.
    const [searchToggled, setSearchToggled] = useState<Set<string>>(() => new Set());

    // En la pestaña Abonos, "Añadir" crea un abono; en el resto, un pedido.
    const addKind: Kind = filter === 'abonos' ? 'abono' : 'order';

    // Cada lectura lleva un número y solo se aplica la ÚLTIMA. Además, cada
    // edición local sube `dataVersion`: una lectura que salió ANTES de guardar
    // y llega DESPUÉS no puede devolver a la tabla el dato viejo.
    const loadSeq = useRef(0);
    const dataVersion = useRef(0);
    const load = async (silent = false): Promise<void> => {
        const seq = ++loadSeq.current;
        const version = dataVersion.current;
        let retry = false;
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
            if (seq === loadSeq.current) {
                if (version === dataVersion.current) {
                    setItems(combined);
                    setTableMissing(missing);
                } else {
                    // Hubo una edición mientras se leía: esta lectura ya no
                    // vale, pero sigue siendo la última → se repite enseguida.
                    retry = true;
                }
            }
        } catch (e) {
            console.error('[PartOrders] Error cargando:', e);
        } finally {
            if (seq === loadSeq.current) { setLoading(false); setRefreshing(false); }
        }
        if (retry) return load(true);
    };

    // Cambios hechos aquí (crear, editar, borrar): se aplican ya en pantalla e
    // invalidan cualquier lectura que siga en vuelo.
    const setItemsLocal = (fn: (prev: PartOrder[]) => PartOrder[]) => {
        dataVersion.current++;
        setItems(fn);
    };

    // ¿Hay un modal abierto? Lo lee el refresco periódico sin tener que
    // re-crear el intervalo (ni recargar la tabla) al abrir o cerrar uno.
    const modalOpenRef = useRef(false);
    useEffect(() => { modalOpenRef.current = showAdd || !!etaModal || !!qtyModal; });

    useEffect(() => {
        load();
        // Refresco silencioso cada 15 s, pausado mientras un modal está abierto.
        const interval = setInterval(() => { if (!modalOpenRef.current) load(true); }, 15000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Filas de la tabla. Las piezas de un mismo PDF (mismo pedidoGrupo) forman
    // UN pedido desplegable; el resto son filas sueltas, como siempre.
    //   Pendientes → lo NO completado; un pedido está pendiente hasta que
    //                llegan TODAS sus piezas
    //   Recibidos  → solo pedidos recibidos (un pedido, si llegaron todas)
    //   Abonos     → todos los abonos (nunca van agrupados)
    // La búsqueda muestra un pedido si coincide cualquiera de sus piezas.
    const rows = useMemo<TableRow[]>(() => {
        const q = search.trim().toLowerCase();
        const matches = (o: PartOrder) => !q || [o.matricula, o.pieza, o.referencia, o.proveedor, o.orderedBy]
            .some(v => (v || '').toLowerCase().includes(q));
        const all: TableRow[] = [];
        const byGroup = new Map<string, PartOrder[]>();
        for (const o of items) {
            if (o.kind !== 'order' || !o.pedidoGrupo) { all.push({ type: 'single', order: o }); continue; }
            const list = byGroup.get(o.pedidoGrupo);
            if (list) list.push(o); else byGroup.set(o.pedidoGrupo, [o]);
        }
        for (const [id, list] of byGroup) {
            // Un "pedido" de una sola pieza (PDF de una línea, o le borraron
            // el resto) se ve como una fila normal.
            if (list.length === 1) { all.push({ type: 'single', order: list[0] }); continue; }
            // Orden del PDF: cada pieza se guardó con 1 ms de diferencia.
            list.sort((a, b) => (a.orderedAt || '').localeCompare(b.orderedAt || ''));
            all.push({ type: 'group', id, items: list });
        }
        const piecesOf = (r: TableRow) => r.type === 'single' ? [r.order] : r.items;
        const dateOf = (r: TableRow) => piecesOf(r)[0].orderedAt || '';
        return all.filter(r => {
            const pieces = piecesOf(r);
            if (filter === 'pending' && pieces.every(o => o.arrived)) return false;
            if (filter === 'arrived' && !pieces.every(o => o.kind === 'order' && o.arrived)) return false;
            if (filter === 'abonos' && !pieces.every(o => o.kind === 'abono')) return false;
            return pieces.some(matches);
        }).sort((a, b) => {
            // Los vencidos (a reclamar) suben arriba; luego los más recientes.
            const ao = piecesOf(a).some(isOverdue) ? 1 : 0;
            const bo = piecesOf(b).some(isOverdue) ? 1 : 0;
            if (ao !== bo) return bo - ao;
            return dateOf(b).localeCompare(dateOf(a));
        });
    }, [items, filter, search]);

    // La columna de la flecha solo aparece si hay algún pedido agrupado.
    const hasGroups = rows.some(r => r.type === 'group');

    // Al buscar se abren solos los pedidos con una PIEZA que coincide por
    // descripción o referencia: buscas una referencia y ves la pieza sin abrir
    // nada. Si solo coincide el proveedor o la matrícula (ya están en la
    // cabecera), el pedido sigue replegado.
    const searching = search.trim() !== '';
    const autoOpen = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return new Set<string>();
        const hit = (v: string) => (v || '').toLowerCase().includes(q);
        return new Set(rows.flatMap(r => {
            if (r.type !== 'group') return [];
            // Con varias matrículas la cabecera dice "Varias": buscar una de
            // ellas también tiene que enseñar la pieza.
            const variasMatriculas = new Set(r.items.map(o => o.matricula).filter(Boolean)).size > 1;
            return r.items.some(o => hit(o.pieza) || hit(o.referencia) || (variasMatriculas && hit(o.matricula))) ? [r.id] : [];
        }));
    }, [rows, search]);
    // Cambiar el texto de búsqueda olvida lo abierto/cerrado a mano en la anterior.
    const changeSearch = (value: string) => {
        setSearch(value);
        setSearchToggled(new Set());
    };

    const isOpen = (id: string) => searching ? autoOpen.has(id) !== searchToggled.has(id) : expanded.has(id);
    const toggleGroup = (id: string) => {
        const flip = (prev: Set<string>) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        };
        if (searching) setSearchToggled(flip); else setExpanded(flip);
    };

    // Tarjetas resumen: sobre TODO el conjunto (pedidos + abonos), por pieza.
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

    // Reemplaza en el listado los registros que devuelve el servidor tras
    // editarlos (comparando por id + kind, porque el backend no devuelve kind
    // y hay que reponerlo).
    const mergeItems = (kind: Kind, updated: any[]) => {
        const byId = new Map(updated.map(o => [o.id, o]));
        setItemsLocal(prev => prev.map(x => (x.kind === kind && byId.has(x.id)) ? { ...byId.get(x.id), kind } : x));
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
                mergeItems(o.kind, [d.order]);
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
            if (r.ok) setItemsLocal(prev => prev.filter(x => !(x.id === o.id && x.kind === o.kind)));
            else alert(`No se pudo borrar el ${kindNoun(o.kind)}.`);
        } catch { alert(`Error de conexión borrando el ${kindNoun(o.kind)}.`); }
    };

    const createOrder = async () => {
        if (!form.pieza.trim() && !form.referencia.trim()) {
            alert('Indica al menos la pieza o la referencia.'); return;
        }
        const qty = parseQtyInput(form.cantidad);
        if (qty === null) { alert(QTY_ERROR); return; }
        setSaving(true);
        try {
            const noEta = form.eta === '__none__';
            const r = await fetch(rootFor(addKind), {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    matricula: form.matricula, pieza: form.pieza,
                    // Ya validada y como número: el servidor no tiene que
                    // re-interpretar el texto (".5" o "1e3").
                    cantidad: qty,
                    referencia: form.referencia, proveedor: form.proveedor,
                    etaDays: (noEta || form.eta.trim() === '') ? '' : form.eta,
                    noEta,
                    orderedBy: currentUser?.username || ''
                })
            });
            const d = await r.json().catch(() => ({}));
            if (r.ok && d.order) {
                setItemsLocal(prev => [{ ...d.order, kind: addKind }, ...prev]);
                setForm({ matricula: '', pieza: '', cantidad: '1', referencia: '', proveedor: '', eta: '' });
                setShowAdd(false);
            } else {
                alert(d.error || `No se pudo crear el ${kindNoun(addKind)}.`);
            }
        } catch { alert(`Error de conexión creando el ${kindNoun(addKind)}.`); }
        finally { setSaving(false); }
    };

    // Guarda el plazo de un registro o de un pedido entero. { days } fija
    // etaDays; { noEta } marca "sin fecha"; { clear } vuelve a "sin decidir".
    // Un registro va por PUT y un pedido por bulk-update, con el mismo cuerpo;
    // el backend hace la exclusión mutua en los dos.
    const saveEta = async (target: EtaTarget, mode: { days?: number; noEta?: boolean; clear?: boolean }) => {
        setEtaSaving(true);
        try {
            const body = mode.days !== undefined
                ? { etaDays: mode.days }
                : mode.noEta
                    ? { noEta: true }
                    : { etaDays: '', noEta: false };
            let r: Response;
            let kind: Kind;
            if (target.type === 'one') {
                kind = target.order.kind;
                r = await fetch(`${rootFor(kind)}/${target.order.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
            } else {
                // "Plazo para todas": solo las piezas que faltan por recibir (si
                // ya llegaron todas, a todas, para que el plazo quede coherente).
                kind = 'order';
                const pending = target.items.filter(o => !o.arrived);
                const ids = (pending.length > 0 ? pending : target.items).map(o => o.id);
                r = await fetch(`${rootFor('order')}/bulk-update`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...body, ids })
                });
            }
            const d = await r.json().catch(() => ({}));
            if (r.ok) {
                mergeItems(kind, target.type === 'one' ? [d.order] : (d.orders || []));
                setEtaModal(null);
            } else {
                alert(d.error || 'No se pudo guardar el plazo.');
            }
        } catch { alert('Error de conexión guardando el plazo.'); }
        finally { setEtaSaving(false); }
    };

    const openEtaModal = (o: PartOrder) => {
        setEtaInput(o.noEta ? '__none__' : (o.etaDays != null ? String(o.etaDays) : ''));
        setEtaModal({ type: 'one', order: o });
    };

    // Piezas a las que afecta el plazo de un pedido: las pendientes, o todas
    // si ya llegaron. Lo usan la precarga, el guardado y el botón "Quitar".
    const etaPoolOf = (list: PartOrder[]) => {
        const pending = list.filter(o => !o.arrived);
        return pending.length > 0 ? pending : list;
    };

    // Plazo de un pedido entero. Si todas sus piezas pendientes comparten
    // plazo, se precarga; si no, el campo sale vacío.
    const openGroupEtaModal = (list: PartOrder[]) => {
        const values = new Set(etaPoolOf(list).map(o => o.noEta ? '__none__' : (o.etaDays != null ? String(o.etaDays) : '')));
        setEtaInput(values.size === 1 ? [...values][0] : '');
        setEtaModal({ type: 'group', items: list });
    };

    // "Marcar todo recibido": las piezas que faltaban, en una sola llamada.
    // Se puede deshacer pieza a pieza, como siempre.
    const markGroupArrived = async (list: PartOrder[]) => {
        const ids = list.filter(o => !o.arrived).map(o => o.id);
        if (ids.length === 0) return;
        try {
            const r = await fetch(`${rootFor('order')}/bulk-update`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, arrived: true })
            });
            const d = await r.json().catch(() => ({}));
            if (r.ok) mergeItems('order', d.orders || []);
            else alert(d.error || 'No se pudo actualizar el pedido.');
        } catch { alert('Error de conexión actualizando el pedido.'); }
    };

    // Borrar un pedido entero (p. ej. se mandó al proveedor equivocado).
    const removeGroup = async (list: PartOrder[]) => {
        const prov = list[0]?.proveedor ? ` de ${list[0].proveedor}` : '';
        if (!window.confirm(`¿Borrar el pedido completo${prov} (${list.length} piezas)? Esto no se puede deshacer.`)) return;
        try {
            const r = await fetch(`${rootFor('order')}/bulk-delete`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: list.map(o => o.id) })
            });
            if (r.ok) {
                const gone = new Set(list.map(o => o.id));
                setItemsLocal(prev => prev.filter(o => !(o.kind === 'order' && gone.has(o.id))));
            } else {
                const d = await r.json().catch(() => ({}));
                alert(d.error || 'No se pudo borrar el pedido.');
            }
        } catch { alert('Error de conexión borrando el pedido.'); }
    };

    const openQtyModal = (o: PartOrder) => {
        setQtyInput(o.cantidad != null ? String(o.cantidad).replace('.', ',') : '');
        setQtyModal(o);
    };

    // Guarda la cantidad de un registro. Vacío = quitarla ("—").
    const saveQty = async (o: PartOrder, raw: string) => {
        const qty = parseQtyInput(raw);
        if (qty === null) { alert(QTY_ERROR); return; }
        setQtySaving(true);
        try {
            const r = await fetch(`${rootFor(o.kind)}/${o.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cantidad: qty })
            });
            const d = await r.json().catch(() => ({}));
            if (r.ok && d.order) {
                mergeItems(o.kind, [d.order]);
                setQtyModal(null);
            } else {
                alert(d.error || 'No se pudo guardar la cantidad.');
            }
        } catch { alert('Error de conexión guardando la cantidad.'); }
        finally { setQtySaving(false); }
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
        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase inline-flex items-center gap-1 whitespace-nowrap ${cls}`}>{icon} {text}</span>
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

    const plazoButton = (onClick: () => void, title: string, label: ReactNode, style: 'set' | 'none' | 'empty') => (
        <button onClick={onClick} title={title}
            className={style === 'empty'
                ? `text-xs font-semibold px-2 py-1 rounded-md border border-dashed transition inline-flex items-center gap-1 whitespace-nowrap ${isDark ? 'border-white/10 text-slate-500 hover:text-slate-300 hover:bg-white/5' : 'border-slate-300 text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`
                : `text-xs font-bold px-2 py-1 rounded-md border transition inline-flex items-center gap-1 whitespace-nowrap ${style === 'set'
                    ? (isDark ? 'border-white/10 text-slate-200 hover:bg-white/5' : 'border-slate-200 text-slate-700 hover:bg-slate-100')
                    : (isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-100')}`}>
            {label}
        </button>
    );

    // Fila de un registro. Los ABONOS se distinguen del pedido SOLO con las
    // LETRAS en rojo (columnas de datos); sin fondo de fila. El chip de Estado y
    // los botones conservan su color. Dentro de un pedido (inGroup) se omite lo
    // que ya dice la cabecera — proveedor, fecha y la matrícula si es la misma —
    // para que el desplegable se lea sin ruido.
    const renderOrderRow = (o: PartOrder, inGroup?: { matricula: string }) => {
        const abono = o.kind === 'abono';
        const txt = (slate: string) => abono ? (isDark ? 'text-red-400' : 'text-red-500') : slate;
        return (
            <tr key={`${o.kind}-${o.id}`} className={`border-t ${isDark ? 'border-white/5' : 'border-slate-100'} ${inGroup ? (isDark ? 'bg-slate-900/60' : 'bg-slate-50/60') : ''}`}>
                {hasGroups && <td className={inGroup ? (isDark ? 'border-l-2 border-l-emerald-500/60' : 'border-l-2 border-l-emerald-400') : ''}></td>}
                <td className={`px-4 py-2.5 font-mono font-bold text-xs ${txt(isDark ? 'text-slate-200' : 'text-slate-800')}`}>
                    {inGroup ? (o.matricula && o.matricula !== inGroup.matricula ? o.matricula : '') : (o.matricula || '—')}
                </td>
                <td className={`px-4 py-2.5 ${inGroup ? 'pl-7' : ''} ${abono ? (isDark ? 'text-red-400' : 'text-red-500') : ''}`}>{o.pieza || '—'}</td>
                <td className="px-2 py-2.5 text-center">
                    <button onClick={() => openQtyModal(o)} title="Cambiar la cantidad"
                        className={`min-w-[2rem] text-xs font-bold px-1.5 py-1 rounded-md transition ${o.cantidad != null
                            ? txt(isDark ? 'text-slate-200' : 'text-slate-700') + (isDark ? ' hover:bg-white/5' : ' hover:bg-slate-100')
                            : (isDark ? 'text-slate-600 hover:bg-white/5' : 'text-slate-300 hover:bg-slate-100')}`}>
                        {o.cantidad != null ? fmtQty(o.cantidad) : '—'}
                    </button>
                </td>
                <td className={`px-4 py-2.5 font-mono text-xs ${txt(isDark ? 'text-slate-300' : 'text-slate-600')}`}>{o.referencia || '—'}</td>
                <td className={`px-4 py-2.5 font-semibold ${abono ? (isDark ? 'text-red-400' : 'text-red-500') : ''}`}>{inGroup ? '' : (o.proveedor || '—')}</td>
                <td className={`px-4 py-2.5 font-mono text-xs ${txt(isDark ? 'text-slate-400' : 'text-slate-500')}`}>{inGroup ? '' : fmtDate(o.orderedAt)}</td>
                <td className="px-4 py-2.5">
                    {hasEta(o)
                        ? plazoButton(() => openEtaModal(o), 'Cambiar el plazo prometido', `${o.etaDays} ${o.etaDays === 1 ? 'día' : 'días'}`, 'set')
                        : o.noEta
                            ? plazoButton(() => openEtaModal(o), 'Cambiar a un plazo o quitar', 'Sin fecha', 'none')
                            : plazoButton(() => openEtaModal(o), 'Fijar el plazo prometido por el proveedor', <><Clock className="w-3 h-3" /> plazo</>, 'empty')}
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
                            className={`text-xs font-bold px-2.5 py-1 rounded-md border border-dashed transition whitespace-nowrap ${isDark ? 'border-amber-500/50 text-amber-400 hover:bg-amber-500/10' : 'border-amber-400 text-amber-600 hover:bg-amber-50'}`}>
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
    };

    // Pedido de varias piezas (un PDF): cabecera que se despliega/repliega con
    // un clic y resume el pedido — matrícula, nº de piezas, proveedor, fecha,
    // el estado de la pieza más urgente y cuántas se han recibido. Sus botones
    // (plazo, marcar todo, borrar) actúan sobre todas las piezas a la vez.
    const renderGroup = (g: { id: string; items: PartOrder[] }) => {
        const list = g.items;
        const open = isOpen(g.id);
        const plates = Array.from(new Set(list.map(o => o.matricula).filter(Boolean)));
        const groupMatricula = plates.length === 1 ? plates[0] : '';
        const pending = list.filter(o => !o.arrived);
        const arrivedCount = list.length - pending.length;
        const worst = list.reduce((w, o) => (statusSeverity(o) < statusSeverity(w) ? o : w), list[0]);
        const lastArrival = list.map(o => o.arrivedAt).filter(Boolean).sort().pop() || '';
        // Plazo común de las piezas pendientes (de todas, si ya llegaron).
        const etaValues = new Set(etaPoolOf(list).map(o => o.noEta ? 'none' : (hasEta(o) ? String(o.etaDays) : '')));
        const etaValue = etaValues.size === 1 ? [...etaValues][0] : 'mixed';
        const preview = list.slice(0, 2).map(o => o.pieza || o.referencia).filter(Boolean).join(', ') + (list.length > 2 ? '…' : '');
        const stop = (e: { stopPropagation(): void }) => e.stopPropagation();
        const plazoTitle = 'Poner el mismo plazo a todas las piezas que faltan por recibir';
        return (
            <Fragment key={`group-${g.id}`}>
                <tr onClick={() => toggleGroup(g.id)}
                    className={`border-t cursor-pointer transition ${isDark ? 'border-white/5' : 'border-slate-100'} ${list.some(isOverdue)
                        ? (isDark ? 'bg-red-500/10 hover:bg-red-500/15' : 'bg-red-50 hover:bg-red-100/70')
                        : (isDark ? 'bg-slate-800/40 hover:bg-slate-800/70' : 'bg-slate-100/70 hover:bg-slate-100')}`}>
                    <td className="pl-2 py-2.5">
                        <button type="button" aria-expanded={open} aria-label={open ? 'Replegar el pedido' : 'Desplegar el pedido'}
                            onClick={e => { e.stopPropagation(); toggleGroup(g.id); }}
                            className={`p-1 rounded-md ${isDark ? 'text-slate-300 hover:bg-white/10' : 'text-slate-600 hover:bg-slate-200'}`}>
                            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                    </td>
                    <td className={`px-4 py-2.5 font-mono font-bold text-xs ${isDark ? 'text-slate-200' : 'text-slate-800'}`}
                        title={plates.length > 1 ? plates.join(', ') : undefined}>
                        {groupMatricula || (plates.length > 1 ? 'Varias' : '—')}
                    </td>
                    <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            <span className="font-bold whitespace-nowrap">Pedido · {list.length} piezas</span>
                            {!open && preview && <span className={`text-xs truncate max-w-[260px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{preview}</span>}
                        </div>
                    </td>
                    <td></td>
                    <td></td>
                    <td className="px-4 py-2.5 font-semibold">{list[0].proveedor || '—'}</td>
                    <td className={`px-4 py-2.5 font-mono text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{fmtDate(list[0].orderedAt)}</td>
                    <td className="px-4 py-2.5" onClick={stop}>
                        {etaValue === 'mixed'
                            ? plazoButton(() => openGroupEtaModal(list), plazoTitle, 'Varios', 'none')
                            : etaValue === 'none'
                                ? plazoButton(() => openGroupEtaModal(list), plazoTitle, 'Sin fecha', 'none')
                                : etaValue === ''
                                    ? plazoButton(() => openGroupEtaModal(list), plazoTitle, <><Clock className="w-3 h-3" /> plazo</>, 'empty')
                                    : plazoButton(() => openGroupEtaModal(list), plazoTitle, `${etaValue} ${etaValue === '1' ? 'día' : 'días'}`, 'set')}
                    </td>
                    <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                            {chipFor(worst)}
                            <span title={`${arrivedCount} de ${list.length} piezas recibidas`}
                                className={`text-[10px] font-bold whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {arrivedCount}/{list.length}
                            </span>
                        </div>
                    </td>
                    <td className="px-4 py-2.5" onClick={stop}>
                        {pending.length > 0 ? (
                            <button onClick={() => markGroupArrived(list)} title={`Marcar como recibidas las ${pending.length} piezas que faltan`}
                                className={`text-xs font-bold px-2.5 py-1 rounded-md border border-dashed transition whitespace-nowrap ${isDark ? 'border-amber-500/50 text-amber-400 hover:bg-amber-500/10' : 'border-amber-400 text-amber-600 hover:bg-amber-50'}`}>
                                Marcar todo
                            </button>
                        ) : (
                            <span className="text-xs font-bold text-green-600 inline-flex items-center gap-1">
                                <PackageCheck className="w-3.5 h-3.5" /> {fmtDate(lastArrival)}
                            </span>
                        )}
                    </td>
                    <td className="px-4 py-2.5 text-right" onClick={stop}>
                        <button onClick={() => removeGroup(list)} title="Borrar el pedido completo"
                            className={`p-1.5 rounded-md transition ${isDark ? 'text-slate-500 hover:text-red-400 hover:bg-red-500/10' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                        </button>
                    </td>
                </tr>
                {open && list.map(o => renderOrderRow(o, { matricula: groupMatricula }))}
            </Fragment>
        );
    };

    // ===== MÓVIL: tarjetas en vez de tabla =====
    // La tabla (10 columnas, 960px) solo se ve en PC (md:). En el móvil cada
    // pieza es una tarjeta y cada pedido de un PDF, una tarjeta desplegable.
    // Mismas acciones y mismos datos que las filas; solo cambia la forma.
    const mobileBtn = (extra: string) =>
        `text-xs font-bold px-3 py-2.5 rounded-lg border transition whitespace-nowrap inline-flex items-center justify-center gap-1.5 ${extra}`;
    const mobileNeutral = isDark ? 'border-white/10 text-slate-300 active:bg-white/5' : 'border-slate-200 text-slate-600 active:bg-slate-100';
    const mobileDoneBtn = isDark ? 'border-dashed border-amber-500/50 text-amber-400 active:bg-amber-500/10' : 'border-dashed border-amber-400 text-amber-600 active:bg-amber-50';
    const mobileTrash = (onClick: () => void, title: string) => (
        <button onClick={onClick} title={title} aria-label={title}
            className={`p-2.5 rounded-lg border flex-shrink-0 ${isDark ? 'border-white/10 text-slate-400 active:text-red-400 active:bg-red-500/10' : 'border-slate-200 text-slate-400 active:text-red-600 active:bg-red-50'}`}>
            <Trash2 className="w-4 h-4" />
        </button>
    );
    const mobilePlazo = (o: PartOrder) => hasEta(o)
        ? plazoButton(() => openEtaModal(o), 'Cambiar el plazo prometido', `${o.etaDays} ${o.etaDays === 1 ? 'día' : 'días'}`, 'set')
        : o.noEta
            ? plazoButton(() => openEtaModal(o), 'Cambiar a un plazo o quitar', 'Sin fecha', 'none')
            : plazoButton(() => openEtaModal(o), 'Fijar el plazo prometido por el proveedor', <><Clock className="w-3 h-3" /> plazo</>, 'empty');

    const renderOrderCard = (o: PartOrder, inGroup?: { matricula: string }) => {
        const abono = o.kind === 'abono';
        const red = abono ? (isDark ? 'text-red-400' : 'text-red-500') : '';
        const showPlate = inGroup ? !!o.matricula && o.matricula !== inGroup.matricula : true;
        const sub = [inGroup ? '' : o.proveedor, inGroup ? '' : fmtDate(o.orderedAt)].filter(Boolean).join(' · ');
        return (
            <div key={`card-${o.kind}-${o.id}`}
                className={`rounded-xl border p-3 ${isDark ? 'border-white/5 bg-slate-900/50' : 'border-slate-200 bg-white'} ${inGroup ? (isDark ? 'border-l-2 border-l-emerald-500/60' : 'border-l-2 border-l-emerald-400') : ''}`}>
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        {showPlate && (
                            <p className={`font-mono font-bold text-xs ${red || (isDark ? 'text-slate-200' : 'text-slate-800')}`}>{o.matricula || '—'}</p>
                        )}
                        <p className={`font-semibold text-sm break-words ${red}`}>{o.pieza || '—'}</p>
                        {o.referencia && (
                            <p className={`font-mono text-xs break-all ${red || (isDark ? 'text-slate-400' : 'text-slate-500')}`}>{o.referencia}</p>
                        )}
                    </div>
                    <button onClick={() => openQtyModal(o)} title="Cambiar la cantidad"
                        className={`flex-shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg border ${o.cantidad != null
                            ? (red || (isDark ? 'text-slate-200' : 'text-slate-700')) + (isDark ? ' border-white/10' : ' border-slate-200')
                            : (isDark ? 'text-slate-500 border-dashed border-white/10' : 'text-slate-400 border-dashed border-slate-300')}`}>
                        {o.cantidad != null ? `× ${fmtQty(o.cantidad)}` : 'Ctd. —'}
                    </button>
                </div>
                {sub && <p className={`text-xs mt-1 ${red || (isDark ? 'text-slate-400' : 'text-slate-500')}`}>{sub}</p>}
                <div className="flex items-center flex-wrap gap-2 mt-2.5">
                    {chipFor(o)}
                    {mobilePlazo(o)}
                </div>
                <div className="flex items-center gap-2 mt-3">
                    {o.arrived ? (
                        <button onClick={() => markArrived(o, false)} title={`Pulsar para deshacer el estado "${doneNoun(o.kind)}"`}
                            className={mobileBtn(`flex-1 text-green-600 ${isDark ? 'border-green-500/30' : 'border-green-200'}`)}>
                            <PackageCheck className="w-4 h-4" /> {doneNoun(o.kind)} {fmtDate(o.arrivedAt)}
                        </button>
                    ) : (
                        <button onClick={() => markArrived(o, true)} className={mobileBtn(`flex-1 ${mobileDoneBtn}`)}>
                            {doneVerb(o.kind)}
                        </button>
                    )}
                    {mobileTrash(() => removeOrder(o), `Borrar ${kindNoun(o.kind)}`)}
                </div>
            </div>
        );
    };

    const renderGroupCard = (g: { id: string; items: PartOrder[] }) => {
        const list = g.items;
        const open = isOpen(g.id);
        const plates = Array.from(new Set(list.map(o => o.matricula).filter(Boolean)));
        const groupMatricula = plates.length === 1 ? plates[0] : '';
        const pending = list.filter(o => !o.arrived);
        const arrivedCount = list.length - pending.length;
        const worst = list.reduce((w, o) => (statusSeverity(o) < statusSeverity(w) ? o : w), list[0]);
        const lastArrival = list.map(o => o.arrivedAt).filter(Boolean).sort().pop() || '';
        const etaValues = new Set(etaPoolOf(list).map(o => o.noEta ? 'none' : (hasEta(o) ? String(o.etaDays) : '')));
        const etaValue = etaValues.size === 1 ? [...etaValues][0] : 'mixed';
        const preview = list.slice(0, 2).map(o => o.pieza || o.referencia).filter(Boolean).join(', ') + (list.length > 2 ? '…' : '');
        const plazoTitle = 'Poner el mismo plazo a todas las piezas que faltan por recibir';
        const sub = [list[0].proveedor, fmtDate(list[0].orderedAt)].filter(Boolean).join(' · ');
        return (
            <div key={`gcard-${g.id}`}>
                <div className={`rounded-xl border ${list.some(isOverdue)
                    ? (isDark ? 'border-red-500/30 bg-red-500/10' : 'border-red-200 bg-red-50')
                    : (isDark ? 'border-white/5 bg-slate-800/40' : 'border-slate-200 bg-slate-100/70')}`}>
                    <button type="button" aria-expanded={open} onClick={() => toggleGroup(g.id)}
                        className="w-full text-left p-3 flex items-start gap-2">
                        {open ? <ChevronDown className="w-5 h-5 mt-0.5 flex-shrink-0 text-slate-400" /> : <ChevronRight className="w-5 h-5 mt-0.5 flex-shrink-0 text-slate-400" />}
                        <div className="min-w-0 flex-1">
                            <p className={`font-mono font-bold text-xs ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                {groupMatricula || (plates.length > 1 ? 'Varias matrículas' : '—')}
                            </p>
                            <p className="font-bold text-sm flex items-center gap-1.5">
                                <FileText className="w-4 h-4 text-emerald-500 flex-shrink-0" /> Pedido · {list.length} piezas
                            </p>
                            {sub && <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{sub}</p>}
                            {!open && preview && <p className={`text-xs mt-0.5 truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{preview}</p>}
                            <div className="flex items-center gap-2 mt-2">
                                {chipFor(worst)}
                                <span className={`text-[11px] font-bold whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{arrivedCount}/{list.length} recibidas</span>
                            </div>
                        </div>
                    </button>
                    <div className="px-3 pb-3 flex items-center gap-2 flex-wrap">
                        {etaValue === 'mixed'
                            ? plazoButton(() => openGroupEtaModal(list), plazoTitle, 'Plazo: varios', 'none')
                            : etaValue === 'none'
                                ? plazoButton(() => openGroupEtaModal(list), plazoTitle, 'Sin fecha', 'none')
                                : etaValue === ''
                                    ? plazoButton(() => openGroupEtaModal(list), plazoTitle, <><Clock className="w-3 h-3" /> plazo</>, 'empty')
                                    : plazoButton(() => openGroupEtaModal(list), plazoTitle, `${etaValue} ${etaValue === '1' ? 'día' : 'días'}`, 'set')}
                        <div className="flex items-center gap-2 ml-auto">
                            {pending.length > 0 ? (
                                <button onClick={() => markGroupArrived(list)} title={`Marcar como recibidas las ${pending.length} piezas que faltan`}
                                    className={mobileBtn(mobileDoneBtn)}>
                                    Marcar todo
                                </button>
                            ) : (
                                <span className="text-xs font-bold text-green-600 inline-flex items-center gap-1">
                                    <PackageCheck className="w-4 h-4" /> {fmtDate(lastArrival)}
                                </span>
                            )}
                            {mobileTrash(() => removeGroup(list), 'Borrar el pedido completo')}
                        </div>
                    </div>
                </div>
                {open && (
                    <div className="mt-2 ml-3 flex flex-col gap-2">
                        {list.map(o => renderOrderCard(o, { matricula: groupMatricula }))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={`h-full w-full flex flex-col ${isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            {/* ===== Header ===== */}
            <div className={`px-4 py-3 md:px-6 md:py-4 border-b flex items-center justify-between flex-shrink-0 gap-3 flex-wrap ${isDark ? 'border-white/5 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-3">
                    {onBack && (
                        <button onClick={onBack} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/5 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`} title="Volver">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    )}
                    <div className="hidden md:block p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
                        <Package className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h1 className={`text-base md:text-xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Pedidos de Piezas</h1>
                        <p className={`hidden md:block text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Seguimiento de pedidos y abonos a proveedores · Recambios</p>
                    </div>
                    {refreshing && <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={downloadExcel} aria-label="Descargar Excel" title="Descargar Excel" className={`flex items-center gap-2 px-3 md:px-4 py-2.5 rounded-xl border text-sm font-semibold transition ${isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                        <Download className="w-4 h-4" /> <span className="hidden md:inline">Descargar Excel</span>
                    </button>
                    <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:shadow-lg hover:shadow-emerald-500/30 text-white font-semibold transition active:scale-[0.98]">
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
                        <p>Este panel usa dos tablas: <b>PartOrders</b> (pedidos) y <b>PartAbonos</b> (abonos), ambas con las columnas: <b>matricula, pieza, referencia, proveedor, orderedAt, arrivedAt, orderedBy</b> (texto de una línea), <b>arrived</b> y <b>noEta</b> (casilla) y <b>etaDays</b> y <b>cantidad</b> (número). PartOrders lleva además <b>pedidoGrupo</b> (texto). En cuanto existan, este panel funcionará solo.</p>
                    </div>
                </div>
            )}

            {/* ===== Tarjetas resumen ===== */}
            <div className="px-4 md:px-6 pt-3 md:pt-4 grid grid-cols-3 gap-2 md:gap-3 flex-shrink-0">
                {[
                    { label: 'Pendientes', value: stats.pending, cls: 'text-amber-500' },
                    { label: 'Vencidos · reclamar', value: stats.late, cls: 'text-red-500' },
                    { label: 'Completados', value: stats.done, cls: 'text-green-600' },
                ].map(s => (
                    <div key={s.label} className={`p-2.5 md:p-3 rounded-xl border ${isDark ? 'border-white/5 bg-slate-900/40' : 'border-slate-200 bg-white'}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{s.label}</p>
                        <p className={`text-2xl font-black ${s.cls}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* ===== Filtros ===== */}
            <div className="px-4 md:px-6 pt-3 md:pt-4 pb-2 flex items-center gap-2 flex-wrap flex-shrink-0">
                <div className="relative flex-1 max-md:basis-full min-w-[200px] max-w-sm">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search} onChange={e => changeSearch(e.target.value)}
                        placeholder="Buscar matrícula, pieza, referencia…"
                        className={`w-full pl-9 pr-3 py-2 rounded-lg max-md:text-base md:text-sm border focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${isDark ? 'bg-slate-800/50 border-white/10 text-slate-200 placeholder-slate-500' : 'bg-white border-slate-200 text-slate-800'}`}
                    />
                </div>
                {([['pending', 'Pendientes'], ['arrived', 'Recibidos'], ['abonos', 'Abonos']] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setFilter(key)}
                        className={`px-3 py-1.5 max-md:flex-1 max-md:justify-center max-md:py-2.5 rounded-lg text-xs font-bold transition inline-flex items-center gap-1.5 ${filter === key
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : (isDark ? 'text-slate-400 hover:text-slate-200 border border-white/10' : 'text-slate-500 hover:text-slate-700 border border-slate-200 bg-white')}`}>
                        {key === 'abonos' && <RotateCcw className="w-3.5 h-3.5" />}
                        {label}
                    </button>
                ))}
            </div>

            {/* ===== Tabla ===== */}
            <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6 pt-2">
                {loading ? (
                    <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
                ) : rows.length === 0 ? (
                    <div className={`text-center py-16 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
                        {items.length === 0 ? 'Todavía no hay nada. Añade el primero con el botón verde.' : 'Ningún registro coincide con el filtro.'}
                    </div>
                ) : (<>
                    {/* Móvil: tarjetas */}
                    <div className="md:hidden flex flex-col gap-2.5">
                        {rows.map(r => r.type === 'single' ? renderOrderCard(r.order) : renderGroupCard(r))}
                    </div>
                    {/* PC: tabla */}
                    <div className={`hidden md:block rounded-xl border overflow-hidden ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[960px]">
                                <thead className={`text-xs uppercase ${isDark ? 'bg-slate-800/60 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                                    <tr>
                                        {hasGroups && <th className="w-9"></th>}
                                        <th className="px-4 py-2.5 text-left">Matrícula</th>
                                        <th className="px-4 py-2.5 text-left">Pieza</th>
                                        <th className="px-2 py-2.5 text-center" title="Cantidad">Ctd.</th>
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
                                    {rows.map(r => r.type === 'single' ? renderOrderRow(r.order) : renderGroup(r))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>)}
            </div>

            {/* ===== Modal: añadir a mano ===== */}
            {showAdd && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowAdd(false)}>
                    <div onClick={e => e.stopPropagation()}
                        className={`w-full max-w-md max-md:max-h-[90vh] max-md:overflow-y-auto flex flex-col rounded-2xl shadow-2xl ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}`}>
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
                            <div className="flex gap-3">
                                <div className="flex-1 min-w-0">
                                    <label className="block text-xs font-bold uppercase tracking-wide mb-1.5">Referencia</label>
                                    <input className={inputCls} value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))} placeholder="REF-889" />
                                </div>
                                <div className="w-24 flex-shrink-0">
                                    <label className="block text-xs font-bold uppercase tracking-wide mb-1.5">Cantidad</label>
                                    <input type="number" min={0} step="any" className={inputCls} value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} placeholder="1" />
                                </div>
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

            {/* ===== Modal: fijar / cambiar el plazo (de un registro o de un pedido) ===== */}
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
                                    <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                        {etaModal.type === 'one'
                                            ? `${etaModal.order.pieza || etaModal.order.referencia || '—'}${etaModal.order.proveedor ? ` · ${etaModal.order.proveedor}` : ''}`
                                            : `Pedido · ${etaModal.items.length} piezas${etaModal.items[0]?.proveedor ? ` · ${etaModal.items[0].proveedor}` : ''}`}
                                    </p>
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
                                {etaModal.type === 'group' && ' Se aplica a todas las piezas del pedido que faltan por recibir.'}
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
                                {/* En un pedido, "Quitar" mira las mismas piezas a las que afecta
                                    (las pendientes, o todas si ya llegaron): si no, podría salir
                                    y no hacer nada. */}
                                {(etaModal.type === 'one' ? [etaModal.order] : etaPoolOf(etaModal.items)).some(o => o.etaDays != null || o.noEta) && (
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
                                    if (t === '') {
                                        // En un pedido con plazos distintos el campo sale vacío: Guardar
                                        // sin elegir nada NO debe borrarlos. Para eso está "Quitar".
                                        if (etaModal.type === 'group') { setEtaModal(null); return; }
                                        saveEta(etaModal, { clear: true }); return;
                                    }
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

            {/* ===== Modal: cambiar la cantidad (Ctd.) de un registro ===== */}
            {qtyModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setQtyModal(null)}>
                    <div onClick={e => e.stopPropagation()}
                        className={`w-full max-w-xs flex flex-col rounded-2xl shadow-2xl ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900'}`}>
                        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                            <div className="min-w-0">
                                <h2 className="text-lg font-bold">Cantidad</h2>
                                <p className={`text-xs truncate ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>{qtyModal.pieza || qtyModal.referencia || '—'}</p>
                            </div>
                            <button onClick={() => setQtyModal(null)} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/5 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form className="px-6 py-4" onSubmit={e => { e.preventDefault(); saveQty(qtyModal, qtyInput); }}>
                            <label className="block text-xs font-bold uppercase tracking-wide mb-1.5">Unidades</label>
                            <input inputMode="decimal" autoFocus className={inputCls} value={qtyInput}
                                onChange={e => setQtyInput(e.target.value)} placeholder="p. ej. 2" />
                            <p className={`text-[11px] mt-1.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Déjalo vacío para quitarla.</p>
                        </form>
                        <div className={`px-6 py-4 border-t flex justify-end gap-2 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                            <button onClick={() => setQtyModal(null)} className={`px-4 py-2 rounded-xl border text-sm font-semibold ${isDark ? 'border-white/10 text-slate-300 hover:bg-white/5' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}>Cancelar</button>
                            <button onClick={() => saveQty(qtyModal, qtyInput)} disabled={qtySaving}
                                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">
                                {qtySaving && <Loader2 className="w-4 h-4 animate-spin" />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
