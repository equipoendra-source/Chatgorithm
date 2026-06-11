import React, { useState, useEffect } from 'react';
import {
    Calendar as CalendarIcon, Clock, Plus, Trash2, User, CheckCircle,
    RefreshCw, Phone, ChevronLeft, ChevronRight, Zap, X, Save, Eye, Loader2, Layers, History, Wrench,
    PackageCheck, Search, RotateCcw, FileText, Upload
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { API_URL as API_URL_BASE } from '../config/api';
import { AppointmentHistoryPanel } from './AppointmentHistoryPanel';

interface Appointment {
    id: string;
    date: string;
    status: 'Available' | 'Booked';
    agenda?: string;
    incident?: boolean;   // cita inesperada del mismo día (incidente)
    clientPhone?: string;
    clientName?: string;
    matricula?: string;
    marca?: string;
    modelo?: string;
    extra?: string;
    notas?: string;
    field1?: string;
    field2?: string;
    field3?: string;
    field4?: string;
    field5?: string;
    // Línea de WhatsApp por la que entró el cliente (derivado de
    // Contacts.origin_phone_id en el backend). Se usa para filtrar el
    // calendario por cuenta en el Sidebar multi-cuenta.
    originPhoneId?: string;
    // Duración del slot en minutos. Solo el "líder" de un bloque de cita
    // tiene durationMin > 0; los slots secundarios (cuando una cita ocupa
    // varios huecos) lo dejan en 0. Lo usa el indicador "Xh libres / Yh"
    // del calendario.
    durationMin?: number;
    // Tipo de servicio elegido al reservar (ej. "Avería", "Revisión").
    // Se guarda en el líder del bloque. El panel "Averías" filtra por aquí
    // para mostrar al equipo humano las citas que requieren llamar al cliente.
    serviceType?: string;
    // Fecha en la que el vehículo fue entregado al cliente (formato ISO).
    // Null/vacío = aún pendiente de entrega. Cuando tiene valor, la cita
    // desaparece del panel "Pendientes de entrega". También es el ancla real
    // para campañas postventa por días desde la entrega.
    deliveredAt?: string | null;
    // Username del trabajador que marcó la entrega. Solo informativo.
    deliveredBy?: string;
    // URL de la factura del cliente (subida a Cloudinary). Se adjunta y envía
    // por WhatsApp al marcar "Vehículo Entregado".
    invoiceUrl?: string;
    // Estado actual del contacto (Contacts.status). Lo manda el backend al
    // cargar /api/appointments. Lo usamos para colorear el slot en el
    // calendario: si vale "Vehículo Entregado", la cita se pinta en verde
    // aunque deliveredAt esté vacío. Y viceversa: si está en "Cerrado", la
    // cita NO sale verde aunque deliveredAt tenga fecha histórica.
    clientStatus?: string;
}

interface FieldLabelEntry { label: string; placeholder: string; key: string; description: string; }
interface FieldLabels {
    field1: FieldLabelEntry;
    field2: FieldLabelEntry;
    field3: FieldLabelEntry;
    field4: FieldLabelEntry;
    field5: FieldLabelEntry;
}

const DEFAULT_FIELD_LABELS: FieldLabels = {
    field1: { label: 'Matrícula', placeholder: 'Ej: 1234ABC', key: 'licensePlate', description: '' },
    field2: { label: 'Marca', placeholder: 'Ej: Ford', key: 'carBrand', description: '' },
    field3: { label: 'Modelo', placeholder: 'Ej: Focus', key: 'carModel', description: '' },
    field4: { label: 'Año / Kms', placeholder: 'Ej: 2020 · 80.000 km', key: 'yearKms', description: '' },
    field5: { label: 'Notas', placeholder: 'Notas adicionales', key: 'notes', description: '' }
};

// `isAppointmentDelivered` (deliveredAt de la cita concreta) se sigue usando
// para el panel "Pendientes de Entrega" y los badges/acciones de ese panel —
// ahí sí queremos distinguir si ESA cita en particular ya fue entregada.
const isAppointmentDelivered = (a: { deliveredAt?: string | null }): boolean => !!a.deliveredAt;

// Decide el color VERDE del slot en el calendario. Regla simple solicitada
// por el equipo: si el Estado del Cliente es "Vehículo Entregado", la cita
// va en verde; cualquier otro estado (Abierto, Nuevo, Cerrado, sin estado)
// va en amarillo. Comparación normalizada (NFD + minúsculas + trim) para
// que tildes o variaciones de mayúsculas en el single-select de Airtable
// no rompan el match.
const isClientStatusDelivered = (clientStatus?: string | null): boolean => {
    const norm = (s: string) => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
    return norm(clientStatus || '') === 'vehiculo entregado';
};

// Verde en el calendario SOLO si la cita se entregó DE VERDAD (deliveredAt con
// fecha) Y el cliente sigue en "Vehículo Entregado".
//
// Por qué exigir deliveredAt: clientStatus se resuelve en el backend por número
// de teléfono, pero las citas guardan el móvil SIN prefijo (689…) mientras que
// los contactos lo guardan CON prefijo (34689…). Como nunca casan exactamente,
// el backend cae al respaldo por los últimos 9 dígitos y una cita puede heredar
// el "Vehículo Entregado" de OTRO contacto con los mismos 9 dígitos → falso
// verde (citas pasadas nunca entregadas saliendo en verde). deliveredAt es un
// dato propio de la cita (lo pone el botón Entregas / el modal al entregar), así
// que es infalible: si está vacío, la cita NO se entregó y va en amarillo.
const shouldPaintDelivered = (s: { clientStatus?: string | null; deliveredAt?: string | null }): boolean =>
    isClientStatusDelivered(s.clientStatus) && !!s.deliveredAt;

// Tipo de servicio con duración variable dentro de una agenda
interface AgendaService {
    id: string;
    name: string;
    durationMin: number;   // duración real del servicio en minutos
}

// Una agenda = una línea de citas independiente con su propio horario
interface Agenda {
    id: string;
    name: string;
    description: string;   // servicios que cubre — ayuda al bot a deducir la agenda
    days: number[];        // 0=Domingo, 1=Lunes ... 6=Sábado
    startTime: string;
    endTime: string;
    duration: number;      // granularidad del slot (minutos)
    services: AgendaService[];  // tipos de servicio con duración variable
}

// Días de la semana para el selector (etiqueta + valor getDay)
const WEEK_DAYS: { label: string; value: number }[] = [
    { label: 'L', value: 1 }, { label: 'M', value: 2 }, { label: 'X', value: 3 },
    { label: 'J', value: 4 }, { label: 'V', value: 5 }, { label: 'S', value: 6 },
    { label: 'D', value: 0 },
];

const AGENDA_COLORS = ['#8b5cf6', '#0ea5e9', '#f59e0b', '#ec4899', '#10b981', '#ef4444'];

interface CalendarDashboardProps {
    readOnly?: boolean;
    config?: { departments: string[]; statuses: string[]; tags: string[] };
    // Día al que saltar al abrir (formato YYYY-MM-DD). Usado al pinchar el toast de nueva cita.
    initialDate?: string | null;
    // Callback para que el padre limpie initialDate tras consumirlo (evita re-saltar al volver).
    onInitialDateConsumed?: () => void;
    // Socket conectado al servidor. Si se pasa, el calendario escucha
    // `appointment_changed` y `new_appointment` para refrescarse en tiempo real
    // cuando una cita cambia (típico cuando el bot cancela una cita por
    // WhatsApp y el calendar está abierto en otra pestaña). Además el panel
    // de Historial usa este socket para añadir nuevos eventos al instante.
    socket?: any;
    // Filtro de cuenta heredado del Sidebar. null = todas las líneas.
    // Cuando hay valor, ocultamos las citas reservadas que no pertenezcan a
    // esa cuenta. Los huecos Available se siguen mostrando para que el
    // trabajador pueda reservar — no tienen origen propio.
    selectedAccountId?: string | null;
}

// Helper para obtener el username actual desde localStorage. Se usa para
// rellenar `actorUsername` en las llamadas que registran cambios en el
// audit log del servidor (PUT/DELETE de citas, cancelaciones, etc.).
// Sin esto el audit log mostraría 'system' para todas las acciones desde
// el panel web y perdería el 80% de su utilidad.
function getCurrentUsername(): string {
    try {
        const raw = localStorage.getItem('chatgorithm_user') || sessionStorage.getItem('chatgorithm_user');
        if (!raw) return 'system';
        const u = JSON.parse(raw);
        return (u && u.username) || 'system';
    } catch { return 'system'; }
}

const CalendarDashboard: React.FC<CalendarDashboardProps> = ({ readOnly = false, config, initialDate, onInitialDateConsumed, socket, selectedAccountId }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const API_URL = API_URL_BASE;

    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [slotDuration, setSlotDuration] = useState(60);
    // Vista activa del calendario: día / semana / mes
    const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');

    // Si nos pasan initialDate (desde el toast de nueva cita), saltamos al día y abrimos vista día
    useEffect(() => {
        if (!initialDate) return;
        const [y, m, d] = initialDate.split('-').map(Number);
        if (!y || !m || !d) return;
        setCurrentDate(new Date(y, m - 1, d));
        setViewMode('day');
        onInitialDateConsumed?.();
    }, [initialDate, onInitialDateConsumed]);

    // Agendas (líneas de cita independientes)
    const [agendas, setAgendas] = useState<Agenda[]>([]);
    const [showAgendaModal, setShowAgendaModal] = useState(false);
    const [showHistoryPanel, setShowHistoryPanel] = useState(false);
    // Panel de Averías: muestra todas las citas Booked cuyo serviceType
    // contenga "avería" para que el equipo humano las llame y confirme duración.
    const [showBreakdownsModal, setShowBreakdownsModal] = useState(false);
    // Panel "Pendientes de entrega": citas Booked en el pasado sin DeliveredAt.
    // Sirve para que el trabajador marque qué vehículos ya se han entregado
    // (sin tener que buscar la cita original en el calendario por fecha).
    const [showPendingDeliveryModal, setShowPendingDeliveryModal] = useState(false);
    const [deliverySearchQuery, setDeliverySearchQuery] = useState('');
    const [deliveringId, setDeliveringId] = useState<string | null>(null); // spinner del botón
    const [undeliveringId, setUndeliveringId] = useState<string | null>(null);
    const [draftAgendas, setDraftAgendas] = useState<Agenda[]>([]);
    const [savingAgendas, setSavingAgendas] = useState(false);
    const [agendaFilter, setAgendaFilter] = useState<string>('');  // '' = todas

    // Modal Edición
    const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
    const [editStatus, setEditStatus] = useState('');
    const [editName, setEditName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editPrefix, setEditPrefix] = useState('34');
    const [editMatricula, setEditMatricula] = useState('');
    const [editMarca, setEditMarca] = useState('');
    const [editModelo, setEditModelo] = useState('');
    const [editExtra, setEditExtra] = useState('');
    const [editNotas, setEditNotas] = useState('');
    // Incidente: marca manual/automática de cita inesperada del mismo día
    const [editIncident, setEditIncident] = useState(false);
    // Estado del CLIENTE (contacto) — distinto del estado de la cita.
    // Permite marcar "Vehículo Entregado" y demás estados desde el calendario.
    const [editContactStatus, setEditContactStatus] = useState('');
    const [originalContactStatus, setOriginalContactStatus] = useState('');
    const [loadingContactStatus, setLoadingContactStatus] = useState(false);
    // Factura del cliente adjunta a la cita (se envía al marcar entregado).
    const [invoiceUrl, setInvoiceUrl] = useState('');
    const [uploadingInvoice, setUploadingInvoice] = useState(false);

    // Etiquetas dinámicas según sector configurado en el wizard de Laura
    const [fieldLabels, setFieldLabels] = useState<FieldLabels>(DEFAULT_FIELD_LABELS);

    // Tipo de servicio elegido al crear cita manualmente. Si la agenda del
    // slot tiene servicios configurados (ej. Avería 240min, Revisión 120min),
    // el agente puede elegir uno y la reserva ocupará automáticamente todos
    // los slots consecutivos necesarios — igual que hace Laura por WhatsApp.
    // '' = sin servicio = solo 1 slot (comportamiento clásico).
    const [editService, setEditService] = useState<string>('');

    // AUTOCOMPLETADO POR TELÉFONO al crear cita. Cuando el agente teclea el
    // teléfono del cliente en el modal, debounce 300ms y consulta:
    //   GET /api/contacts/:phone   → datos del cliente (name, status, etc.)
    //   GET /api/contacts/:phone/vehicles → lista de vehículos activos
    // Si el cliente existe rellenamos name y, si tiene vehículos, los campos
    // field1..5 con el primero (o el seleccionado en el <select> si hay >1).
    // Solo se dispara al CREAR cita (slot Available → Booked), no al editar
    // una reserva ya existente (para no pisar datos manuales del agente).
    interface VehicleLite { id: string; matricula: string; marca: string; modelo: string; extra: string; notas: string; }
    const [vehicles, setVehicles] = useState<VehicleLite[]>([]);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
    const [contactLookup, setContactLookup] = useState<null | {
        found: boolean; name?: string; status?: string;
        assigned_to?: string; department?: string; tags?: string[];
        vehicleCount: number;
    }>(null);
    const [lookingUpContact, setLookingUpContact] = useState(false);
    const lookupAbortRef = React.useRef<AbortController | null>(null);
    const lookupDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    // Recuerda qué vehículo aplicó el autocompletado por última vez. Sirve
    // para saber si los campos field1..5 contienen aún los valores del
    // autocompletado (en ese caso, limpiarlos al cambiar a un cliente nuevo
    // es seguro) o si el agente los ha editado (entonces NO los pisamos).
    const lastAppliedVehicleRef = React.useRef<VehicleLite | null>(null);
    // Equivalente para el nombre: si el agente cambia el teléfono a otro
    // cliente, queremos actualizar el nombre — pero solo si el actual lo
    // puso el autocompletado (no si el agente lo está editando a mano).
    const lastAppliedNameRef = React.useRef<string | null>(null);

    // Crear Manual
    const [newDate, setNewDate] = useState('');
    const [newTime, setNewTime] = useState('');
    const [newAgenda, setNewAgenda] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const timeInputRef = React.useRef<HTMLInputElement>(null);
    const createFormRef = React.useRef<HTMLDivElement>(null);

    const handleQuickAddDate = (isoDate: string) => {
        setNewDate(isoDate);
        setTimeout(() => {
            createFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            timeInputRef.current?.focus();
        }, 100);
    };

    // Refresco en tiempo real: cuando el bot cancela/reserva o se actualiza
    // una cita en otro lugar, refrescamos los datos. Hacemos un debounce
    // simple (300ms) para coalescer eventos que lleguen en ráfaga (p.ej.
    // bloques de varios slots).
    useEffect(() => {
        if (!socket) return;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const scheduleRefresh = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => { fetchData(); }, 300);
        };
        // appointment_changed: cambios estructurales (status, datos).
        // new_appointment / appointment_cancelled: notificaciones específicas.
        // appointment_event: registro de auditoría (creación, cancelación,
        //   marcar como incidente, etc.) — antes solo lo usaba el panel
        //   histórico, ahora también disparamos refresh del calendario para
        //   que cualquier acción quede reflejada al instante.
        socket.on('appointment_changed', scheduleRefresh);
        socket.on('new_appointment', scheduleRefresh);
        socket.on('appointment_cancelled', scheduleRefresh);
        socket.on('appointment_event', scheduleRefresh);
        return () => {
            if (timer) clearTimeout(timer);
            socket.off('appointment_changed', scheduleRefresh);
            socket.off('new_appointment', scheduleRefresh);
            socket.off('appointment_cancelled', scheduleRefresh);
            socket.off('appointment_event', scheduleRefresh);
        };
    }, [socket]);

    useEffect(() => {
        fetchData();
        // Cargar los field labels configurados en el wizard del bot
        fetch(`${API_URL}/bot/field-labels`)
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d && d.field1 && d.field2 && d.field3 && d.field4) setFieldLabels(d); })
            .catch(() => { /* fallback a default */ });
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const resApps = await fetch(`${API_URL}/appointments`);
            const dataApps = await resApps.json();
            if (Array.isArray(dataApps)) {
                setAppointments(dataApps);
            }

            const resSched = await fetch(`${API_URL}/schedule`);
            const dataSched = await resSched.json();
            if (dataSched && dataSched.duration) {
                setSlotDuration(dataSched.duration);
            }
            if (dataSched && Array.isArray(dataSched.agendas)) {
                setAgendas(dataSched.agendas);
                // Default de la agenda en el formulario de creación manual
                setNewAgenda(prev => prev || (dataSched.agendas[0]?.name ?? ''));
            }
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    // ---- Gestión de agendas ----
    const openAgendaModal = () => {
        // Si no hay agendas, arrancamos con una por defecto
        setDraftAgendas(agendas.length > 0
            ? JSON.parse(JSON.stringify(agendas))
            : [{ id: 'ag1', name: 'General', description: '', days: [1, 2, 3, 4, 5], startTime: '09:00', endTime: '18:00', duration: 60, services: [] }]);
        setShowAgendaModal(true);
    };

    const addDraftAgenda = () => {
        setDraftAgendas(prev => [...prev, {
            id: `ag${Date.now()}`, name: '', description: '', days: [1, 2, 3, 4, 5],
            startTime: '09:00', endTime: '18:00', duration: 60, services: []
        }]);
    };

    // Gestión de servicios dentro de una agenda
    const addService = (agendaIdx: number) => {
        setDraftAgendas(prev => prev.map((a, idx) => idx === agendaIdx
            ? { ...a, services: [...(a.services || []), { id: `svc${Date.now()}`, name: '', durationMin: a.duration || 60 }] }
            : a
        ));
    };

    const updateService = (agendaIdx: number, svcIdx: number, patch: Partial<AgendaService>) => {
        setDraftAgendas(prev => prev.map((a, idx) => {
            if (idx !== agendaIdx) return a;
            const services = (a.services || []).map((s, si) => si === svcIdx ? { ...s, ...patch } : s);
            return { ...a, services };
        }));
    };

    const removeService = (agendaIdx: number, svcIdx: number) => {
        setDraftAgendas(prev => prev.map((a, idx) => {
            if (idx !== agendaIdx) return a;
            return { ...a, services: (a.services || []).filter((_, si) => si !== svcIdx) };
        }));
    };

    const updateDraftAgenda = (i: number, patch: Partial<Agenda>) => {
        setDraftAgendas(prev => prev.map((a, idx) => idx === i ? { ...a, ...patch } : a));
    };

    const removeDraftAgenda = (i: number) => {
        setDraftAgendas(prev => prev.filter((_, idx) => idx !== i));
    };

    const toggleDraftDay = (i: number, day: number) => {
        setDraftAgendas(prev => prev.map((a, idx) => {
            if (idx !== i) return a;
            const days = a.days.includes(day) ? a.days.filter(d => d !== day) : [...a.days, day];
            return { ...a, days };
        }));
    };

    const handleSaveAgendas = async () => {
        // Validación
        const valid = draftAgendas.filter(a => a.name.trim() && a.days.length > 0);
        if (valid.length === 0) return alert('Cada agenda necesita un nombre y al menos un día.');
        const names = valid.map(a => a.name.trim().toLowerCase());
        if (new Set(names).size !== names.length) return alert('Hay agendas con el mismo nombre. Deben ser únicos.');
        setSavingAgendas(true);
        try {
            const res = await fetch(`${API_URL}/schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agendas: valid })
            });
            const data = await res.json();
            if (!res.ok || !data.success) { alert('Error: ' + (data.error || 'desconocido')); return; }
            alert('✅ Agendas guardadas. Los huecos se están generando, puede tardar unos segundos.');
            setShowAgendaModal(false);
            setTimeout(fetchData, 2000);
        } catch (e) { alert('Error de conexión guardando agendas'); }
        finally { setSavingAgendas(false); }
    };

    // Helper: ejecuta la consulta al backend para autocompletar la ficha
    // del cliente desde el teléfono. Cancela peticiones en curso (race) y
    // tolera errores de red sin bloquear el formulario.
    const fetchContactByPhone = React.useCallback(async (phone: string, prefix: string) => {
        const cleaned = phone.replace(/\D/g, '');
        // Aún no hay número suficiente para una búsqueda razonable
        if (cleaned.length < 9) {
            setContactLookup(null);
            setVehicles([]);
            setSelectedVehicleId('');
            return;
        }
        const full = `${prefix}${cleaned}`;
        // Cancelar fetch previo si existía (race condition: el usuario teclea más rápido que la red)
        lookupAbortRef.current?.abort();
        const ac = new AbortController();
        lookupAbortRef.current = ac;
        setLookingUpContact(true);
        try {
            const [contactRes, vehiclesRes] = await Promise.all([
                fetch(`${API_URL}/contacts/${encodeURIComponent(full)}`, { signal: ac.signal }),
                fetch(`${API_URL}/contacts/${encodeURIComponent(full)}/vehicles`, { signal: ac.signal })
            ]);
            if (ac.signal.aborted) return;
            const contact = contactRes.ok ? await contactRes.json() : { found: false };
            const vehData = vehiclesRes.ok ? await vehiclesRes.json() : { vehicles: [] };
            const vehList: VehicleLite[] = Array.isArray(vehData?.vehicles) ? vehData.vehicles : [];
            setVehicles(vehList);
            if (contact?.found) {
                setContactLookup({
                    found: true,
                    name: contact.name || '',
                    status: contact.status || '',
                    assigned_to: contact.assigned_to || '',
                    department: contact.department || '',
                    tags: Array.isArray(contact.tags) ? contact.tags : [],
                    vehicleCount: vehList.length
                });
                // Autocompletar nombre: si el campo está vacío O si contiene
                // el nombre que el último autocompletado había aplicado (es
                // decir, el agente NO ha tocado el campo), lo sobrescribimos
                // con el nuevo. Si el agente lo editó a mano (no coincide con
                // lastAppliedNameRef), respetamos su input.
                //
                // OJO: capturamos `previousAppliedName` ANTES de mutar el ref.
                // El functional updater de setEditName es lazy (React lo evalúa
                // después de que el código siga corriendo), y si leyéramos
                // lastAppliedNameRef.current DENTRO del updater, ya tendría el
                // valor NUEVO porque la asignación lastAppliedNameRef.current = newName
                // de abajo es síncrona. Sin esta captura, al cambiar de Diego
                // a Pedro la comparación "Diego === Pedro" fallaba y el nombre
                // se quedaba con "Diego" para siempre.
                const newName = contact.name || '';
                const previousAppliedName = lastAppliedNameRef.current;
                setEditName(prev => {
                    if (!prev) return newName;
                    if (previousAppliedName !== null && prev === previousAppliedName) return newName;
                    return prev; // agente lo editó a mano, no pisar
                });
                lastAppliedNameRef.current = newName;
                // Si hay vehículos, seleccionar el primero y rellenar los field1-5.
                if (vehList.length > 0) {
                    const v = vehList[0];
                    setSelectedVehicleId(v.id);
                    setEditMatricula(v.matricula || '');
                    setEditMarca(v.marca || '');
                    setEditModelo(v.modelo || '');
                    setEditExtra(v.extra || '');
                    setEditNotas(v.notas || '');
                    lastAppliedVehicleRef.current = v;
                } else {
                    setSelectedVehicleId('');
                    lastAppliedVehicleRef.current = null;
                }
            } else {
                setContactLookup({ found: false, vehicleCount: 0 });
                setSelectedVehicleId('');
                // Si los field1..5 contenían valores del último vehículo
                // autocompletado (es decir, el agente NO ha editado), limpiarlos
                // al cambiar a un cliente nuevo evita la UX confusa de
                // "Cliente nuevo" con matrícula del cliente anterior. Usamos
                // functional updaters para leer el state REAL — no el closure
                // del fetchContactByPhone, que puede estar desactualizado tras
                // el await. Si el agente editó un campo concreto, se respeta;
                // los demás (que coinciden con el último vehículo aplicado)
                // se limpian. Decisión por-campo, no atómica, pero pragmática.
                const last = lastAppliedVehicleRef.current;
                if (last) {
                    setEditMatricula(prev => prev === (last.matricula || '') ? '' : prev);
                    setEditMarca(prev => prev === (last.marca || '') ? '' : prev);
                    setEditModelo(prev => prev === (last.modelo || '') ? '' : prev);
                    setEditExtra(prev => prev === (last.extra || '') ? '' : prev);
                    setEditNotas(prev => prev === (last.notas || '') ? '' : prev);
                }
                lastAppliedVehicleRef.current = null;
                // Igual con el nombre: si el nombre actual lo puso el autocompletado
                // anterior, lo limpiamos al ir a un cliente nuevo. Si el agente lo
                // editó, respetamos su input.
                const lastName = lastAppliedNameRef.current;
                if (lastName !== null) {
                    setEditName(prev => prev === lastName ? '' : prev);
                }
                lastAppliedNameRef.current = null;
            }
        } catch (e: any) {
            if (e?.name === 'AbortError') return; // silencioso, fue cancelado
            console.warn('[fetchContactByPhone] Error:', e?.message);
            // No bloqueamos el form: el agente puede rellenar a mano.
        } finally {
            if (!ac.signal.aborted) setLookingUpContact(false);
        }
    }, []); // sin deps de fields — usamos functional updaters, no leemos closure

    // Cierre del modal de cita encapsulado: limpia también el autocompletado
    // para que la próxima apertura no muestre indicadores residuales.
    const closeBookingModal = React.useCallback(() => {
        lookupAbortRef.current?.abort();
        if (lookupDebounceRef.current) clearTimeout(lookupDebounceRef.current);
        lastAppliedVehicleRef.current = null;
        lastAppliedNameRef.current = null;
        setSelectedAppt(null);
        setContactLookup(null);
        setVehicles([]);
        setSelectedVehicleId('');
        setEditService('');
        setLookingUpContact(false);
    }, []);

    // Debounce 300ms para llamar a fetchContactByPhone. SOLO en modo creación
    // (slot Available que se pasa a Booked), no en edición de cita ya
    // reservada — no queremos pisar los datos que el agente puso a mano la
    // primera vez.
    useEffect(() => {
        const isCreatingNew = !!selectedAppt && selectedAppt.status === 'Available' && editStatus === 'Booked' && !readOnly;
        if (!isCreatingNew) return;
        if (lookupDebounceRef.current) clearTimeout(lookupDebounceRef.current);
        lookupDebounceRef.current = setTimeout(() => {
            fetchContactByPhone(editPhone, editPrefix);
        }, 300);
        return () => { if (lookupDebounceRef.current) clearTimeout(lookupDebounceRef.current); };
    }, [editPhone, editPrefix, editStatus, selectedAppt?.id, selectedAppt?.status, readOnly, fetchContactByPhone]);

    const handleOpenEdit = (appt: Appointment) => {
        // Resetear estado de autocompletado al abrir un slot nuevo
        lookupAbortRef.current?.abort();
        lastAppliedVehicleRef.current = null;
        lastAppliedNameRef.current = null;
        setContactLookup(null);
        setVehicles([]);
        setSelectedVehicleId('');
        // Precargamos el servicio actual de la cita si la estamos editando ya
        // Booked. Para slots Available recién abiertos viene vacío → "sin servicio".
        setEditService(appt.serviceType || '');
        setSelectedAppt(appt);
        setEditStatus(appt.status);
        setEditName(appt.clientName || '');
        // Separar prefijo de país y número. Los números españoles son de 9 dígitos:
        // lo que sobra por delante se trata como prefijo. Si solo hay 9 dígitos,
        // se asume prefijo 34 (España) por defecto.
        {
            const cleaned = (appt.clientPhone || '').replace(/\D/g, '');
            if (cleaned.length > 9) {
                setEditPrefix(cleaned.slice(0, -9));
                setEditPhone(cleaned.slice(-9));
            } else {
                setEditPrefix('34');
                setEditPhone(cleaned);
            }
        }
        setEditMatricula(appt.matricula || appt.field1 || '');
        setEditMarca(appt.marca || appt.field2 || '');
        setEditModelo(appt.modelo || appt.field3 || '');
        setEditExtra(appt.extra || appt.field4 || '');
        setEditNotas(appt.notas || appt.field5 || '');
        setEditIncident(!!appt.incident);
        setInvoiceUrl(appt.invoiceUrl || '');
        // Cargar el estado del contacto (cliente) asociado a esta cita
        setEditContactStatus('');
        setOriginalContactStatus('');
        if (appt.clientPhone) {
            setLoadingContactStatus(true);
            fetch(`${API_URL}/contacts/${encodeURIComponent(appt.clientPhone)}`)
                .then(r => r.ok ? r.json() : null)
                .then(d => {
                    if (d && d.found) {
                        setEditContactStatus(d.status || '');
                        setOriginalContactStatus(d.status || '');
                    }
                })
                .catch(() => { /* sin estado */ })
                .finally(() => setLoadingContactStatus(false));
        }
    };

    // Sube la factura a Cloudinary (reusa /team/upload) y guarda la URL en la
    // cita. Al marcar "Vehículo Entregado", el backend la envía por WhatsApp.
    const handleInvoiceUpload = async (file: File | undefined | null) => {
        if (!file || !selectedAppt) return;
        setUploadingInvoice(true);
        try {
            const fd = new FormData();
            fd.append('file', file, file.name);
            const up = await fetch(`${API_URL}/team/upload`, { method: 'POST', body: fd });
            const upData = await up.json();
            if (!up.ok || !upData.url) { alert('No se pudo subir la factura.'); return; }
            const save = await fetch(`${API_URL}/appointments/${selectedAppt.id}/invoice`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoiceUrl: upData.url })
            });
            const saveData = await save.json();
            if (save.ok) setInvoiceUrl(upData.url);
            else alert('❌ ' + (saveData.error || 'No se pudo guardar la factura.'));
        } catch {
            alert('Error de conexión al subir la factura.');
        } finally {
            setUploadingInvoice(false);
        }
    };

    const handleInvoiceRemove = async () => {
        if (!selectedAppt) return;
        setUploadingInvoice(true);
        try {
            const save = await fetch(`${API_URL}/appointments/${selectedAppt.id}/invoice`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoiceUrl: '' })
            });
            if (save.ok) setInvoiceUrl('');
        } catch { /* sin bloqueo */ }
        finally { setUploadingInvoice(false); }
    };

    const handleUpdateAppt = async () => {
        if (!selectedAppt) return;
        // service se envía siempre que la cita acabe en Booked: al CREAR
        // (Available → Booked) para reservar el bloque desde cero, y al
        // EDITAR (Booked → Booked) para que el backend ajuste el tamaño
        // del bloque (crecer / mengar / re-etiquetar) según el servicio
        // elegido. En cancelaciones (→ Available) no tiene sentido enviarlo.
        const isCreating = selectedAppt.status === 'Available' && editStatus === 'Booked';
        const isEditingBooked = selectedAppt.status === 'Booked' && editStatus === 'Booked';
        try {
            const res = await fetch(`${API_URL}/appointments/${selectedAppt.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: editStatus,
                    clientName: editName,
                    clientPhone: editPhone,
                    phonePrefix: editPrefix,
                    matricula: editMatricula,
                    marca: editMarca,
                    modelo: editModelo,
                    extra: editExtra,
                    notas: editNotas,
                    incident: editIncident,
                    service: isCreating
                        ? (editService || undefined)
                        : (isEditingBooked ? editService : undefined),
                    actorUsername: getCurrentUsername()
                })
            });
            if (!res.ok) {
                // Mostrar el mensaje específico que devuelve el backend
                // (ej. "No hay slots consecutivos suficientes para Avería...")
                // en lugar de un genérico "Error guardando".
                const err = await res.json().catch(() => ({}));
                alert(err.error || 'Error guardando');
                return;
            }

            // Si cambió el estado del cliente, guardarlo (dispara la lógica de postventa)
            // Pasamos también el nombre porque si el contacto aún no existe (cliente
            // walk-in apuntado a mano en la agenda sin haber escrito por WhatsApp),
            // el backend lo crea sobre la marcha con ese nombre. Sin el name acabaría
            // como "Cliente 1234" en la ficha.
            if (selectedAppt.clientPhone && editContactStatus && editContactStatus !== originalContactStatus) {
                try {
                    const resStatus = await fetch(`${API_URL}/contacts/${encodeURIComponent(selectedAppt.clientPhone)}/status`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: editContactStatus, name: editName || selectedAppt.clientName || '' })
                    });
                    if (!resStatus.ok) {
                        const err = await resStatus.json().catch(() => ({}));
                        alert('La cita se guardó, pero el estado del cliente no: ' + (err.error || 'error'));
                    }
                } catch (e) {
                    alert('La cita se guardó, pero falló al actualizar el estado del cliente.');
                }
            }

            // Sincronizar deliveredAt de ESTA cita con el cambio de Estado del
            // Cliente. Como el color del slot se basa SOLO en appointment.deliveredAt
            // (no en contact.status, para no pintar verdes futuras citas del mismo
            // cliente), tenemos que decirle al endpoint dedicado que marque o
            // desmarque la entrega para esta cita en concreto.
            //  - Si cambias a "Vehículo Entregado" desde el modal → /deliver setea
            //    deliveredAt + deliveredBy (y dispara el evento 'delivered' del
            //    historial).
            //  - Si cambias FUERA de "Vehículo Entregado" (a Cerrado, Abierto…) →
            //    /undeliver limpia deliveredAt (y cancela la postventa pendiente).
            // Comparación normalizada para evitar fallos por tildes/case.
            const norm = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
            const wasDelivered = norm(originalContactStatus) === 'vehiculo entregado';
            const nowDelivered = norm(editContactStatus) === 'vehiculo entregado';
            if (!wasDelivered && nowDelivered) {
                try {
                    await fetch(`${API_URL}/appointments/${selectedAppt.id}/deliver`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ actorUsername: getCurrentUsername() })
                    });
                } catch (_) { /* tolerante: si falla, el color no se actualiza pero el resto sí */ }
            } else if (wasDelivered && !nowDelivered) {
                try {
                    await fetch(`${API_URL}/appointments/${selectedAppt.id}/undeliver`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ actorUsername: getCurrentUsername() })
                    });
                } catch (_) { /* idem */ }
            }

            await fetchData();
            setSelectedAppt(null);
        } catch (e) { alert("Error de conexión"); }
    };

    const handleCancelBooking = async () => {
        if (!selectedAppt) return;
        if (!window.confirm("¿Cancelar esta reserva? El hueco quedará libre para nuevas citas.")) return;
        try {
            const res = await fetch(`${API_URL}/appointments/${selectedAppt.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'Available',
                    clientName: '',
                    clientPhone: '',
                    matricula: '',
                    marca: '',
                    modelo: '',
                    actorUsername: getCurrentUsername()
                })
            });
            if (res.ok) { await fetchData(); setSelectedAppt(null); }
            else alert("Error al cancelar la reserva");
        } catch (e) { alert("Error de conexión"); }
    };

    const handleCreateSlot = async () => {
        if (!newDate || !newTime) return alert("Selecciona fecha y hora");
        setIsCreating(true);
        try {
            const isoDate = new Date(`${newDate}T${newTime}`).toISOString();
            const res = await fetch(`${API_URL}/appointments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: isoDate, status: 'Available', agenda: agendas.length > 0 ? newAgenda : '' })
            });
            // Antes no se comprobaba res.ok: si el backend devolvía un error, el
            // hueco no se creaba pero el usuario no veía nada. Ahora mostramos el
            // mensaje real del servidor.
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(err.error || 'Error creando hueco');
                return;
            }
            await fetchData();
            setNewDate('');
            setNewTime('');
        } catch (e) { alert("Error creando hueco"); }
        finally { setIsCreating(false); }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Seguro que quieres borrar este hueco?")) return;
        await fetch(`${API_URL}/appointments/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actorUsername: getCurrentUsername() })
        });
        setAppointments(prev => prev.filter(a => a.id !== id));
        if (selectedAppt?.id === id) setSelectedAppt(null);
    };

    // Formatea "HH:MM - HH:MM" para un slot. Si el slot es líder de un bloque
    // multi-slot (durationMin > slotDuration), usa esa duración para calcular
    // el fin del bloque. Si no, usa slotDuration (1 hueco). Sin esto, una
    // avería de 4h se veía como "13:00 - 14:00" en lugar de "13:00 - 17:00".
    const formatTimeRange = (isoString: string, durationMin?: number) => {
        try {
            const start = new Date(isoString);
            const dur = (durationMin && durationMin > 0) ? durationMin : slotDuration;
            const end = new Date(start.getTime() + dur * 60000);
            const startStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const endStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            return `${startStr} - ${endStr}`;
        } catch { return "--:--"; }
    };

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const days = new Date(year, month + 1, 0).getDate();
        const firstDay = new Date(year, month, 1).getDay();
        const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;
        return { days, firstDay: adjustedFirstDay };
    };

    const { days: totalDays, firstDay } = getDaysInMonth(currentDate);
    const blanks = Array(firstDay).fill(null);
    const daysArray = Array.from({ length: totalDays }, (_, i) => i + 1);

    const getSlotsForDay = (day: number) => {
        return appointments.filter(a => {
            const d = new Date(a.date);
            const sameDay = d.getDate() === day && d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
            if (!sameDay) return false;
            if (agendaFilter && (a.agenda || '') !== agendaFilter) return false;
            // Filtro por línea de WhatsApp (Sidebar). Solo aplica a citas
            // RESERVADAS: los huecos Available no tienen línea de origen y se
            // siguen mostrando para que el trabajador pueda reservar.
            if (selectedAccountId && a.status === 'Booked' && a.originPhoneId && a.originPhoneId !== selectedAccountId) return false;
            return true;
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    };

    // Color asignado a cada agenda (estable por su posición en la lista)
    const agendaColor = (name?: string): string => {
        if (!name) return '#94a3b8';
        const idx = agendas.findIndex(a => a.name === name);
        return AGENDA_COLORS[(idx >= 0 ? idx : 0) % AGENDA_COLORS.length];
    };

    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const weekDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    // Helper para saber qué día de la semana cae un número (1..31)
    const getDayOfWeekName = (dayNum: number) => {
        const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayNum);
        // getDay: 0=Dom, 1=Lun...
        const idx = d.getDay() === 0 ? 6 : d.getDay() - 1;
        return weekDays[idx];
    };

    // ───────── Vistas rápidas (Día / Semana) ─────────
    const today = new Date();

    const toIsoDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const isSameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    const fmtTime = (iso: string) => {
        try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
        catch { return '--:--'; }
    };

    // Quita acentos/diacríticos y pasa a minúsculas — para comparar serviceType
    // de forma tolerante ("Avería", "averia", "AVERIA" se igualan).
    // ̀-ͯ = Combining Diacritical Marks (acentos tras NFD).
    const normalizeStr = (s: string) =>
        (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const isBreakdownService = (serviceType?: string) =>
        !!serviceType && normalizeStr(serviceType).includes('aver');

    // Citas de tipo Avería pendientes de llamar: Booked + serviceType
    // contiene "aver" que AÚN NO HAN TERMINADO. Una avería desaparece del panel
    // en cuanto la cita acaba (fecha de inicio + duración < ahora), porque ya
    // no tiene sentido llamar para confirmar la duración. Filtra por agenda y
    // línea de WhatsApp igual que el resto del calendario.
    //
    // Sólo cuenta LÍDERES de bloque (requiere clientName y durationMin>0).
    // Los slots secundarios de una avería (Booked sin clientName) podrían
    // heredar ServiceType por corrupción de datos — descartarlos evita contar
    // 4 veces la misma cita y mostrar entradas sin teléfono.
    const breakdownAppointments = (() => {
        const now = Date.now();
        return appointments.filter(a => {
            if (a.status !== 'Booked') return false;
            if (!isBreakdownService(a.serviceType)) return false;
            if (!a.clientName || !a.clientName.trim()) return false;
            if ((a.durationMin || 0) <= 0) return false;
            // La cita ya terminó (fin = inicio + duración) → desaparece del panel.
            const endTime = new Date(a.date).getTime() + (a.durationMin || 0) * 60 * 1000;
            if (endTime < now) return false;
            if (agendaFilter && (a.agenda || '') !== agendaFilter) return false;
            if (selectedAccountId && a.originPhoneId && a.originPhoneId !== selectedAccountId) return false;
            return true;
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    })();

    // Citas PENDIENTES DE ENTREGA: el coche aún no se ha devuelto al cliente.
    //
    // Criterio:
    //  - status='Booked' (no canceladas, no plantillas Available)
    //  - clientName no vacío (líder de bloque — descarta secundarios de avería)
    //  - durationMin > 0 (refuerzo del criterio anterior)
    //  - deliveredAt sin valor (aún no entregado)
    //  - fecha de la cita en el pasado (no tiene sentido entregar antes)
    //  - respeta filtros de agenda y línea de WhatsApp como el resto
    //
    // Sin filtro de cuántos días atrás: el usuario puede tener una cita de hace
    // 2 meses sin marcar. Se muestra TODO el backlog para que pueda limpiarlo.
    // El badge de antigüedad (verde/ámbar/rojo) avisa visualmente del retraso.
    const pendingDeliveryAppointments = (() => {
        const now = Date.now();
        return appointments.filter(a => {
            if (a.status !== 'Booked') return false;
            if (!a.clientName || !a.clientName.trim()) return false;
            if ((a.durationMin || 0) <= 0) return false;
            if (a.deliveredAt) return false; // ya entregada
            if (new Date(a.date).getTime() > now) return false; // cita futura, no se puede entregar aún
            if (agendaFilter && (a.agenda || '') !== agendaFilter) return false;
            if (selectedAccountId && a.originPhoneId && a.originPhoneId !== selectedAccountId) return false;
            return true;
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // más reciente arriba
    })();

    // Lunes de la semana que contiene `date`
    const getWeekStart = (date: Date) => {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const dow = d.getDay() === 0 ? 6 : d.getDay() - 1; // 0 = Lunes
        d.setDate(d.getDate() - dow);
        return d;
    };

    // HORAS LIBRES / TOTALES DEL DÍA — para el indicador del calendario.
    //
    // Lógica:
    //   - Suma los minutos OCUPADOS contando solo los slots Booked con
    //     durationMin > 0 (los líderes). Los slots secundarios (cuando una
    //     cita ocupa varios huecos) tienen durationMin=0 y se ignoran
    //     porque sumarían dos veces. Si un Booked líder tiene durationMin=0
    //     (cita pre-feature o registro corrupto), se usa la granularidad
    //     estimada del día como fallback.
    //   - Suma los minutos LIBRES como `availableCount × granularidad`.
    //     Los Available no guardan durationMin en Airtable, hay que estimar.
    //   - Granularidad: diferencia entre los dos primeros slots del día. Si
    //     solo hay 1 slot, se usa `slotDuration` (state local, default 60).
    //
    // Devuelve null si el día no tiene slots — el render no pinta nada.
    const computeDayHours = (daySlots: Appointment[]): { freeHours: number, totalHours: number } | null => {
        if (!daySlots || daySlots.length === 0) return null;
        const sorted = [...daySlots].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        // Granularidad = duración estándar de cada slot. Tomamos la MÍNIMA
        // diferencia entre slots consecutivos (no la primera) y la capamos a
        // 120min como máximo razonable. Antes usábamos sorted[1]-sorted[0]
        // que fallaba si el día tenía huecos: ej. slots a 10:00 y 16:00 →
        // diff=6h, absurda para citas de 1h. La mínima entre todos los pares
        // refleja mejor la "unidad" del día; el cap evita valores extremos
        // cuando hay solo 2 slots muy separados.
        let granularityMin = slotDuration;
        if (sorted.length >= 2) {
            let minDiff = Infinity;
            for (let i = 1; i < sorted.length; i++) {
                const d = Math.round((new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 60000);
                if (d > 0 && d < minDiff) minDiff = d;
            }
            if (minDiff !== Infinity) granularityMin = Math.min(minDiff, 120);
        }
        let bookedMin = 0;
        let availableCount = 0;
        let suspiciousLeaderCount = 0; // líderes corruptos sin durationMin
        for (let i = 0; i < sorted.length; i++) {
            const s = sorted[i];
            if (s.status === 'Booked') {
                if (s.durationMin && s.durationMin > 0) {
                    bookedMin += s.durationMin;
                } else {
                    // durationMin=0 puede ser:
                    //   (a) un slot secundario de un bloque cuya cita líder ya
                    //       sumamos (caso normal con citas multi-slot) → NO sumar.
                    //   (b) un líder corrupto/pre-feature en Airtable → SÍ sumar
                    //       como granularidad para no ocultar horas ocupadas.
                    // Heurística: si el slot ANTERIOR no es Booked, es líder huérfano.
                    const prev = i > 0 ? sorted[i - 1] : null;
                    const isLikelySecondary = prev && prev.status === 'Booked';
                    if (!isLikelySecondary) {
                        bookedMin += granularityMin;
                        suspiciousLeaderCount++;
                    }
                }
            } else if (s.status === 'Available') {
                availableCount++;
            }
        }
        if (suspiciousLeaderCount > 0) {
            console.warn(`[CalendarHours] ${suspiciousLeaderCount} slot(s) Booked sin durationMin en este día. Contados como granularidad (${granularityMin}min). Revisa el campo DurationMin en Airtable.`);
        }
        const freeMin = availableCount * granularityMin;
        const totalMin = bookedMin + freeMin;
        if (totalMin === 0) return null;
        return {
            freeHours: Math.round((freeMin / 60) * 10) / 10,
            totalHours: Math.round((totalMin / 60) * 10) / 10
        };
    };

    // Formatea solo las horas libres como "5h libres" (compacto, sin decimales
    // innecesarios). El total ya está implícito en el badge "X/Y Ocupados" de
    // al lado, así que no lo repetimos en el indicador.
    const formatFreeHours = (h: { freeHours: number }): string => {
        const f = Number.isInteger(h.freeHours) ? `${h.freeHours}` : h.freeHours.toFixed(1);
        return `${f}h libres`;
    };

    // Agrupa visualmente bloques multi-slot. Una cita de "Avería" (240min con
    // grid 60min) ocupa 4 slots en Airtable: el LÍDER con ClientName + datos
    // + DurationMin=240, y 3 SECUNDARIOS solo con Status=Booked + ClientPhone
    // (sin ClientName) para bloquear los huecos. Si renderizamos todos los
    // slots tal cual, salen 4 entradas separadas con "Cliente" en 3 de ellas.
    // Este helper oculta los secundarios: solo deja Available y líderes.
    // El líder se renderiza con su rango horario real (formatTimeRange usa
    // durationMin) → una sola entrada "13:00 - 17:00 · Alex".
    //
    // Criterio: un slot Booked es secundario si su clientName está vacío.
    // (En el backend solo el líder lleva ClientName; los secundarios no.)
    // Líder corrupto pre-feature con durationMin=0 pero clientName presente
    // se conserva — se renderiza como cita de 1 slot, comportamiento idéntico
    // al anterior. Huérfano (Booked sin clientName y sin líder) se oculta.
    const collapseBookedBlocks = (slots: Appointment[]): Appointment[] => {
        // Ordenamos defensivamente por fecha (los callers ya lo hacen, pero
        // así el helper es seguro si alguien lo invoca con array sin ordenar).
        const sorted = [...slots].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        // Trackeamos el último líder Booked visto. Si un secundario (Booked
        // sin clientName) aparece DESPUÉS de un líder con mismo clientPhone
        // y agenda, es parte de ese bloque → ocultar. Si aparece sin líder
        // antecesor (HUÉRFANO por datos corruptos / sync roto / edición
        // manual en Airtable), lo conservamos para que el agente pueda
        // hacer click y liberarlo. Sin esto un huérfano se hace invisible
        // pero seguiría contando en el badge "X/Y Ocupados".
        const result: Appointment[] = [];
        let lastLeader: Appointment | null = null;
        for (const s of sorted) {
            if (s.status !== 'Booked') {
                result.push(s);
                continue;
            }
            const name = (s.clientName ?? '').trim();
            if (name !== '') {
                // Líder: conservar y recordar
                result.push(s);
                lastLeader = s;
                continue;
            }
            // Booked sin clientName → secundario o huérfano
            const isLikelySecondary = lastLeader
                && (lastLeader.agenda || '') === (s.agenda || '')
                && (lastLeader.clientPhone || '') === (s.clientPhone || '');
            if (!isLikelySecondary) {
                // Huérfano → conservar para que el admin pueda actuar
                result.push(s);
            }
            // Si es secundario, no se añade al result (se oculta).
        }
        return result;
    };

    // Citas de una fecha concreta (objeto Date), aplicando el filtro de agenda
    const getSlotsForDate = (dateObj: Date) =>
        appointments
            .filter(a => {
                const d = new Date(a.date);
                if (!isSameDay(d, dateObj)) return false;
                if (agendaFilter && (a.agenda || '') !== agendaFilter) return false;
                return true;
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Las 7 fechas (Lun..Dom) de la semana que contiene currentDate
    const weekDates: Date[] = (() => {
        const ws = getWeekStart(currentDate);
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(ws);
            d.setDate(ws.getDate() + i);
            return d;
        });
    })();

    // Navegación contextual: avanza/retrocede según la vista activa
    const shiftDate = (dir: number) => {
        setCurrentDate(prev => {
            const d = new Date(prev);
            if (viewMode === 'month') d.setMonth(d.getMonth() + dir);
            else if (viewMode === 'week') d.setDate(d.getDate() + dir * 7);
            else d.setDate(d.getDate() + dir);
            return d;
        });
    };

    const goToday = () => setCurrentDate(new Date());

    // Abrir la vista de día concreto al pulsar un día en mes/semana
    const openDayView = (d: Date) => { setCurrentDate(new Date(d)); setViewMode('day'); };

    // Título de la cabecera según la vista activa
    const headerTitle: string = (() => {
        if (viewMode === 'day') {
            return currentDate.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
        }
        if (viewMode === 'week') {
            const ws = weekDates[0], we = weekDates[6];
            return ws.getMonth() === we.getMonth()
                ? `${ws.getDate()} – ${we.getDate()} ${monthNames[ws.getMonth()]} ${we.getFullYear()}`
                : `${ws.getDate()} ${monthNames[ws.getMonth()].slice(0, 3)} – ${we.getDate()} ${monthNames[we.getMonth()].slice(0, 3)} ${we.getFullYear()}`;
        }
        return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    })();

    // Chip compacto de cita — usado en la vista de Semana
    const renderChip = (s: Appointment) => {
        // Para bloques multi-slot el líder muestra hora inicio-fin (ej. "13:00-17:00").
        // Para citas de 1 hueco o Available, solo la hora de inicio.
        const isMultiSlotLeader = s.status === 'Booked' && (s.durationMin || 0) > slotDuration;
        // Tres estados visuales: entregado (verde) > reservado (ámbar) > libre (azul).
        // El delivered tiene prioridad sobre booked porque una cita entregada
        // técnicamente sigue siendo Booked en el modelo, pero queremos que el
        // equipo la distinga de un vistazo en el calendario.
        //
        // OJO: el criterio es el ESTADO ACTUAL del cliente, no la fecha histórica
        // deliveredAt. Así si después de entregar el coche el compañero cambia el
        // status a "Cerrado", la cita deja de mostrarse en verde.
        const isDelivered = shouldPaintDelivered(s);
        const isBooked = s.status === 'Booked';
        return (
            <div
                key={s.id}
                onClick={() => handleOpenEdit(s)}
                className={`text-xs px-2.5 py-1.5 rounded-lg cursor-pointer transition flex items-center gap-1.5 border ${isDelivered
                    ? (isDark ? 'bg-emerald-700/80 border-emerald-400 text-white hover:bg-emerald-600/90' : 'bg-emerald-400 border-emerald-600 text-emerald-950 hover:bg-emerald-500')
                    : isBooked
                        ? (isDark ? 'bg-amber-700/80 border-amber-400 text-white hover:bg-amber-600/90' : 'bg-amber-400 border-amber-600 text-amber-950 hover:bg-amber-500')
                        : (isDark ? 'bg-sky-700/70 border-sky-400 text-white hover:bg-sky-600/80' : 'bg-sky-400 border-sky-600 text-sky-950 hover:bg-sky-500')
                    }`}
            >
                {agendas.length > 1 && s.agenda && (
                    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: agendaColor(s.agenda) }} title={s.agenda} />
                )}
                {s.incident && <Zap size={11} className="text-amber-500 flex-shrink-0" />}
                <span className="font-bold font-mono flex-shrink-0">
                    {isMultiSlotLeader ? formatTimeRange(s.date, s.durationMin) : fmtTime(s.date)}
                </span>
                {s.status === 'Booked'
                    ? <span className="truncate font-medium">{s.clientName || 'Cliente'}</span>
                    : <span className="opacity-60">Libre</span>}
            </div>
        );
    };

    return (
        <div className={`p-4 md:p-8 h-full overflow-y-auto relative safe-pb-20 md:safe-pb-8 ${isDark ? 'bg-transparent' : 'bg-slate-50'}`}>
            <div className="max-w-6xl mx-auto space-y-6">

                {/* HEADER RESPONSIVE */}
                <div className={`flex flex-col gap-3 p-4 rounded-2xl shadow-sm border ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
                    {/* Fila 1: navegación + acciones */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-3">
                        <div className="flex items-center gap-1.5 w-full md:w-auto justify-between md:justify-start">
                            <button onClick={() => shiftDate(-1)} className={`p-2 rounded-full transition ${isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}><ChevronLeft /></button>
                            <h2 className={`text-base md:text-xl font-bold text-center capitalize md:min-w-[200px] ${isDark ? 'text-white' : 'text-slate-800'}`}>{headerTitle}</h2>
                            <button onClick={() => shiftDate(1)} className={`p-2 rounded-full transition ${isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}><ChevronRight /></button>
                            <button onClick={goToday} className={`ml-1 px-3 py-1.5 rounded-xl text-xs font-bold transition ${isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Hoy</button>
                        </div>

                        <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end items-center">
                            {/* Filtro por agenda */}
                            {agendas.length > 1 && (
                                <select
                                    value={agendaFilter}
                                    onChange={e => setAgendaFilter(e.target.value)}
                                    className={`p-2 rounded-xl text-sm border outline-none ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-100 border-slate-200 text-slate-700'}`}
                                    title="Filtrar por agenda"
                                >
                                    <option value="">Todas las agendas</option>
                                    {agendas.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                                </select>
                            )}
                            {/* Panel de Averías: lista de citas con tipo "Avería" pendientes de llamar */}
                            <button
                                onClick={() => setShowBreakdownsModal(true)}
                                className={`relative px-3 py-2 rounded-xl transition flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-amber-300 bg-amber-900/30 hover:bg-amber-900/50' : 'text-amber-700 bg-amber-50 hover:bg-amber-100'}`}
                                title="Ver citas de Avería pendientes para llamar al cliente"
                            >
                                <Wrench size={18} />
                                <span className="hidden md:inline">Averías</span>
                                {breakdownAppointments.length > 0 && (
                                    <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${isDark ? 'bg-amber-500 text-amber-950' : 'bg-amber-600 text-white'}`}>
                                        {breakdownAppointments.length}
                                    </span>
                                )}
                            </button>
                            {/* Panel "Pendientes de entrega": citas Booked en el pasado sin DeliveredAt */}
                            <button
                                onClick={() => setShowPendingDeliveryModal(true)}
                                className={`relative px-3 py-2 rounded-xl transition flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-emerald-300 bg-emerald-900/30 hover:bg-emerald-900/50' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}
                                title="Buscar"
                            >
                                <Search size={18} />
                                <span className="hidden md:inline">Buscar</span>
                                {pendingDeliveryAppointments.length > 0 && (
                                    <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${isDark ? 'bg-emerald-500 text-emerald-950' : 'bg-emerald-600 text-white'}`}>
                                        {pendingDeliveryAppointments.length}
                                    </span>
                                )}
                            </button>
                            {/* Historial de reservas y cancelaciones */}
                            <button
                                onClick={() => setShowHistoryPanel(true)}
                                className={`px-3 py-2 rounded-xl transition flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-indigo-300 bg-indigo-900/30 hover:bg-indigo-900/50' : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100'}`}
                                title="Ver historial de reservas y cancelaciones"
                            >
                                <History size={18} />
                                <span className="hidden md:inline">Historial</span>
                            </button>
                            {/* Configurar agendas */}
                            {!readOnly && (
                                <button onClick={openAgendaModal} className={`px-3 py-2 rounded-xl transition flex items-center gap-2 text-sm font-semibold ${isDark ? 'text-purple-300 bg-purple-900/30 hover:bg-purple-900/50' : 'text-purple-700 bg-purple-50 hover:bg-purple-100'}`} title="Configurar agendas y horarios">
                                    <Layers size={18} />
                                    <span className="hidden md:inline">Agendas</span>
                                </button>
                            )}
                            <button onClick={fetchData} className={`p-2 rounded-xl transition ${isDark ? 'text-slate-400 hover:text-blue-400 bg-slate-700 hover:bg-slate-600' : 'text-slate-400 hover:text-blue-600 bg-slate-100 hover:bg-blue-50'}`} title="Refrescar">
                                <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                            </button>
                        </div>
                    </div>

                    {/* Fila 2: selector de vista (Día / Semana / Mes) */}
                    <div className={`flex gap-1 p-1 rounded-xl ${isDark ? 'bg-slate-900/50' : 'bg-slate-100'}`}>
                        {([['day', 'Día'], ['week', 'Semana'], ['month', 'Mes']] as const).map(([mode, label]) => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${viewMode === mode
                                    ? (isDark ? 'bg-purple-600 text-white shadow' : 'bg-white text-purple-700 shadow-sm')
                                    : (isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-700')
                                    }`}
                            >{label}</button>
                        ))}
                    </div>
                </div>

                {/* Aviso si no hay agendas configuradas */}
                {!readOnly && !loading && agendas.length === 0 && (
                    <div className={`p-4 rounded-2xl border-l-4 border-amber-500 text-sm ${isDark ? 'bg-amber-500/10 text-amber-200' : 'bg-amber-50 text-amber-800'}`}>
                        ⚠️ No tienes ninguna agenda configurada. Pulsa <strong>"Agendas"</strong> para crear los horarios en los que el bot ofrecerá citas.
                    </div>
                )}

                {/* CREAR MANUAL (Oculto en ReadOnly) */}
                {!readOnly && (
                    <div ref={createFormRef} className={`p-4 rounded-2xl border shadow-sm flex flex-col md:flex-row items-end gap-4 animate-in slide-in-from-top-2 ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
                        <div className="w-full md:flex-1">
                            <label className="text-xs font-bold text-slate-400 block mb-1 uppercase">Fecha</label>
                            <input
                                type="date"
                                value={newDate}
                                onChange={e => setNewDate(e.target.value)}
                                className={`w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none ${isDark
                                    ? 'bg-slate-700 border-slate-600 text-white scheme-dark'
                                    : 'border-slate-200 bg-white'
                                    }`}
                            />
                        </div>
                        <div className="w-full md:flex-1">
                            <label className="text-xs font-bold text-slate-400 block mb-1 uppercase">Hora Inicio</label>
                            <input
                                ref={timeInputRef}
                                type="time"
                                value={newTime}
                                onChange={e => setNewTime(e.target.value)}
                                className={`w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none ${isDark
                                    ? 'bg-slate-700 border-slate-600 text-white scheme-dark'
                                    : 'border-slate-200 bg-white'
                                    }`}
                            />
                        </div>
                        {agendas.length > 0 && (
                            <div className="w-full md:flex-1">
                                <label className="text-xs font-bold text-slate-400 block mb-1 uppercase">Agenda</label>
                                <select
                                    value={newAgenda}
                                    onChange={e => setNewAgenda(e.target.value)}
                                    className={`w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'border-slate-200 bg-white'}`}
                                >
                                    {agendas.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                                </select>
                            </div>
                        )}
                        <button onClick={handleCreateSlot} disabled={isCreating} className="w-full md:w-auto bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg shadow-md active:scale-95 transition flex items-center justify-center gap-2">
                            {isCreating ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                            Crear
                        </button>
                    </div>
                )}

                {/* ═══════════ VISTA MES ═══════════ */}
                {/* En móvil: Lista vertical (flex-col). En Desktop: Grid (grid-cols-7) */}
                {viewMode === 'month' && (
                <div className={`flex flex-col md:grid md:grid-cols-7 bg-transparent rounded-none md:rounded-2xl shadow-none md:shadow-sm border-none md:border md:overflow-hidden gap-3 md:gap-0 ${isDark ? 'md:bg-slate-800 md:border-slate-700' : 'md:bg-white md:border-slate-200'}`}>

                    {/* Cabecera Días (Solo Desktop) */}
                    <div className="hidden md:contents">
                        {weekDays.map(d => (
                            <div key={d} className={`p-3 text-center text-xs font-bold uppercase tracking-wide border-b ${isDark ? 'text-slate-400 border-slate-700/50 bg-slate-900/40' : 'text-slate-400 border-slate-200 bg-slate-50'}`}>{d}</div>
                        ))}
                    </div>

                    {/* Celdas Días */}
                    <div className="contents">
                        {/* Espacios en blanco (Solo Desktop) */}
                        {blanks.map((_, i) => <div key={`blank-${i}`} className={`hidden md:block border-b border-r min-h-[140px] ${isDark ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50/30 border-slate-100'}`}></div>)}

                        {daysArray.map(day => {
                            const slots = getSlotsForDay(day);
                            const booked = slots.filter(s => s.status === 'Booked').length;
                            const total = slots.length;
                            const dayName = getDayOfWeekName(day); // Para móvil
                            const hoursInfo = computeDayHours(slots);

                            return (
                                <div key={day} className={`rounded-2xl md:rounded-none shadow-sm md:shadow-none border md:border-0 md:border-b md:border-r p-4 md:p-2 min-h-auto md:min-h-[140px] transition-colors group relative ${isDark
                                    ? 'bg-slate-800 md:bg-transparent border-slate-700 md:border-slate-700 hover:bg-slate-700/50'
                                    : 'bg-white md:bg-transparent border-slate-200 md:border-slate-100 hover:bg-slate-50'
                                    }`}>

                                    {/* Cabecera del Día */}
                                    <div className="flex justify-between items-center md:items-start mb-3 md:mb-2">
                                        <div className="flex items-center gap-2">
                                            <span
                                                onClick={(e) => { e.stopPropagation(); openDayView(new Date(currentDate.getFullYear(), currentDate.getMonth(), day)); }}
                                                title="Ver este día"
                                                className={`text-sm font-bold w-8 h-8 md:w-6 md:h-6 flex items-center justify-center rounded-full cursor-pointer ${slots.length > 0 ? (isDark ? 'bg-purple-600 text-white' : 'bg-slate-800 text-white') : (isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-400')}`}>
                                                {day}
                                            </span>
                                            {/* Nombre del día (Solo visible en Móvil) */}
                                            <span className={`md:hidden text-sm font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{dayName}</span>
                                        </div>

                                        {total > 0 && (
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${booked === total
                                                    ? (isDark ? 'bg-red-900/30 text-red-400 border border-red-800/50' : 'bg-red-100 text-red-600')
                                                    : (isDark ? 'bg-sky-900/30 text-sky-400 border border-sky-800/50' : 'bg-sky-100 text-sky-600')
                                                    }`}>
                                                    {booked}/{total} <span className="hidden md:inline">Ocupados</span>
                                                </span>
                                                {/* Pill de horas libres: solo se muestra si quedan huecos disponibles.
                                                    Si el día está completo, el badge rojo de arriba ya dice todo y
                                                    repetirlo con "0h libres" sería ruido. Color sky/teal suave para
                                                    diferenciar visualmente del badge de ocupados. */}
                                                {hoursInfo && hoursInfo.freeHours > 0 && (
                                                    <span
                                                        title={`${formatFreeHours(hoursInfo)} de un total de ${Number.isInteger(hoursInfo.totalHours) ? hoursInfo.totalHours : hoursInfo.totalHours.toFixed(1)}h`}
                                                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isDark ? 'bg-sky-500/10 text-sky-300 border-sky-500/30' : 'bg-sky-50 text-sky-700 border-sky-200'}`}
                                                    >
                                                        <Clock className="w-2.5 h-2.5" />
                                                        {formatFreeHours(hoursInfo)}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Lista de Citas */}
                                    <div className="space-y-2 md:space-y-1 max-h-none md:max-h-[100px] overflow-y-visible md:overflow-y-auto pr-1 custom-scrollbar">
                                        {slots.length === 0 && <p className={`md:hidden text-xs italic ml-2 ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>Sin citas programadas</p>}

                                        {collapseBookedBlocks(slots).map(s => (
                                            <div
                                                key={s.id}
                                                onClick={() => handleOpenEdit(s)}
                                                className={`text-xs md:text-[10px] px-3 py-2 md:px-2 md:py-1.5 rounded-lg md:rounded cursor-pointer transition flex justify-between items-center border ${shouldPaintDelivered(s)
                                                    ? (isDark
                                                        ? 'bg-emerald-700/80 border-emerald-400 text-white hover:bg-emerald-600/90'
                                                        : 'bg-emerald-400 border-emerald-600 text-emerald-950 hover:bg-emerald-500')
                                                    : s.status === 'Booked'
                                                        ? (isDark
                                                            ? 'bg-amber-700/80 border-amber-400 text-white hover:bg-amber-600/90'
                                                            : 'bg-amber-400 border-amber-600 text-amber-950 hover:bg-amber-500')
                                                        : (isDark
                                                            ? 'bg-sky-700/70 border-sky-400 text-white hover:bg-sky-600/80'
                                                            : 'bg-sky-400 border-sky-600 text-sky-950 hover:bg-sky-500')
                                                    }`}
                                            >
                                                <div className="flex flex-col md:flex-row md:items-center gap-1">
                                                    <span className="font-bold font-mono flex items-center gap-1">
                                                        {agendas.length > 1 && s.agenda && (
                                                            <span
                                                                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                                                style={{ backgroundColor: agendaColor(s.agenda) }}
                                                                title={s.agenda}
                                                            />
                                                        )}
                                                        {s.incident && <Zap size={11} className="text-amber-500 flex-shrink-0" />}
                                                        {formatTimeRange(s.date, s.durationMin)}
                                                    </span>
                                                    {/* Nombre de la agenda (visible si hay varias) */}
                                                    {agendas.length > 1 && s.agenda && (
                                                        <span className="text-[9px] font-semibold uppercase tracking-wide opacity-70 truncate max-w-[90px]">
                                                            {s.agenda}
                                                        </span>
                                                    )}
                                                    {/* En móvil mostramos el nombre del cliente si está reservado */}
                                                    {s.status === 'Booked' && (
                                                        <span className={`md:hidden text-[10px] font-medium truncate max-w-[120px] ${shouldPaintDelivered(s)
                                                            ? (isDark ? 'text-emerald-400' : 'text-emerald-500')
                                                            : (isDark ? 'text-amber-400' : 'text-amber-500')}`}>
                                                            • {s.clientName || 'Cliente'}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    {s.status === 'Booked' && <User size={12} className="md:w-[10px] md:h-[10px]" />}

                                                    {!readOnly && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                                                            className="md:hidden md:group-hover:block text-red-400 hover:text-red-600 p-1"
                                                        >
                                                            <Trash2 size={14} className="md:w-[10px] md:h-[10px]" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Botón rápido + */}
                                    {!readOnly && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleQuickAddDate(`${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
                                            }}
                                            className={`absolute bottom-2 right-2 md:opacity-0 md:group-hover:opacity-100 border p-1.5 rounded-lg shadow-sm transition ${isDark
                                                ? 'bg-slate-700 border-slate-600 text-purple-400 hover:bg-slate-600'
                                                : 'bg-white border-slate-200 text-purple-600 hover:bg-purple-50'
                                                }`}
                                            title="Añadir a este día"
                                        >
                                            <Plus size={14} />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
                )}

                {/* ═══════════ VISTA SEMANA ═══════════ */}
                {viewMode === 'week' && (
                    <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
                        {weekDates.map(d => {
                            const slots = getSlotsForDate(d);
                            const booked = slots.filter(s => s.status === 'Booked').length;
                            const isToday = isSameDay(d, today);
                            const dowIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
                            const hoursInfo = computeDayHours(slots);
                            return (
                                <div key={d.toISOString()} className={`rounded-2xl border p-3 flex flex-col min-h-[120px] ${isToday
                                    ? (isDark ? 'bg-purple-900/20 border-purple-700' : 'bg-purple-50 border-purple-300')
                                    : (isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200')
                                    }`}>
                                    {/* Cabecera del día (pulsable → vista de día) */}
                                    <button onClick={() => openDayView(d)} className="flex items-center justify-between mb-2 w-full">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${isToday ? 'bg-purple-600 text-white'
                                                : slots.length > 0 ? (isDark ? 'bg-slate-700 text-white' : 'bg-slate-800 text-white')
                                                    : (isDark ? 'bg-slate-700/50 text-slate-500' : 'bg-slate-100 text-slate-400')
                                                }`}>{d.getDate()}</span>
                                            <span className={`text-sm font-bold capitalize ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{weekDays[dowIdx]}</span>
                                        </div>
                                        {slots.length > 0 && (
                                            <div className="flex flex-col items-end gap-1">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${booked === slots.length
                                                    ? (isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-600')
                                                    : (isDark ? 'bg-sky-900/30 text-sky-400' : 'bg-sky-100 text-sky-600')
                                                    }`}>{booked}/{slots.length}</span>
                                                {hoursInfo && hoursInfo.freeHours > 0 && (
                                                    <span
                                                        title={`${formatFreeHours(hoursInfo)} de un total de ${Number.isInteger(hoursInfo.totalHours) ? hoursInfo.totalHours : hoursInfo.totalHours.toFixed(1)}h`}
                                                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${isDark ? 'bg-sky-500/10 text-sky-300 border-sky-500/30' : 'bg-sky-50 text-sky-700 border-sky-200'}`}
                                                    >
                                                        <Clock className="w-2.5 h-2.5" />
                                                        {formatFreeHours(hoursInfo)}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </button>
                                    {/* Citas del día */}
                                    <div className="space-y-1.5 flex-1">
                                        {slots.length === 0 && (
                                            <p className={`text-xs italic ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>Sin citas</p>
                                        )}
                                        {collapseBookedBlocks(slots).map(renderChip)}
                                    </div>
                                    {!readOnly && (
                                        <button
                                            onClick={() => handleQuickAddDate(toIsoDate(d))}
                                            className={`mt-2 w-full py-1.5 rounded-lg border border-dashed text-xs font-semibold flex items-center justify-center gap-1 transition ${isDark
                                                ? 'border-slate-600 text-slate-400 hover:border-purple-500 hover:text-purple-300'
                                                : 'border-slate-300 text-slate-400 hover:border-purple-400 hover:text-purple-600'}`}
                                        >
                                            <Plus size={12} /> Añadir
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ═══════════ VISTA DÍA ═══════════ */}
                {viewMode === 'day' && (() => {
                    const slots = getSlotsForDate(currentDate);
                    const booked = slots.filter(s => s.status === 'Booked').length;
                    const free = slots.length - booked;
                    return (
                        <div className="space-y-3">
                            {/* Resumen del día */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className={`p-3 rounded-2xl border text-center ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                                    <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{slots.length}</div>
                                    <div className="text-[11px] font-semibold uppercase text-slate-400">Huecos</div>
                                </div>
                                <div className={`p-3 rounded-2xl border-2 text-center ${isDark ? 'bg-amber-700/60 border-amber-400' : 'bg-amber-300 border-amber-600'}`}>
                                    <div className={`text-2xl font-bold ${isDark ? 'text-amber-100' : 'text-amber-900'}`}>{booked}</div>
                                    <div className={`text-[11px] font-semibold uppercase ${isDark ? 'text-amber-200' : 'text-amber-800'}`}>Reservadas</div>
                                </div>
                                <div className={`p-3 rounded-2xl border-2 text-center ${isDark ? 'bg-sky-700/60 border-sky-400' : 'bg-sky-300 border-sky-600'}`}>
                                    <div className={`text-2xl font-bold ${isDark ? 'text-sky-100' : 'text-sky-900'}`}>{free}</div>
                                    <div className={`text-[11px] font-semibold uppercase ${isDark ? 'text-sky-200' : 'text-sky-800'}`}>Libres</div>
                                </div>
                            </div>

                            {/* Estado vacío */}
                            {slots.length === 0 && (
                                <div className={`p-10 rounded-2xl border text-center ${isDark ? 'bg-slate-800 border-slate-700 text-slate-500' : 'bg-white border-slate-200 text-slate-400'}`}>
                                    <CalendarIcon size={36} className="mx-auto mb-2 opacity-40" />
                                    <p className="text-sm font-medium">No hay huecos este día</p>
                                </div>
                            )}

                            {/* Lista de citas del día — secundarios ocultos para que un bloque multi-slot
                                aparezca como UNA sola entrada con su rango horario completo. */}
                            <div className="space-y-2">
                                {collapseBookedBlocks(slots).map(s => {
                                    const start = new Date(s.date);
                                    // Si el slot es líder de un bloque multi-slot (durationMin > slotDuration),
                                    // usamos esa duración real para calcular el fin. Si no, slotDuration normal.
                                    const dur = (s.status === 'Booked' && s.durationMin && s.durationMin > 0) ? s.durationMin : slotDuration;
                                    const end = new Date(start.getTime() + dur * 60000);
                                    const isBooked = s.status === 'Booked';
                                    const isDelivered = shouldPaintDelivered(s);
                                    return (
                                        <div
                                            key={s.id}
                                            onClick={() => handleOpenEdit(s)}
                                            className={`flex items-stretch gap-3 p-3 rounded-2xl border-2 cursor-pointer transition ${isDelivered
                                                ? (isDark ? 'bg-emerald-700/70 border-emerald-400 hover:bg-emerald-600/80' : 'bg-emerald-300 border-emerald-600 hover:bg-emerald-400')
                                                : isBooked
                                                    ? (isDark ? 'bg-amber-700/70 border-amber-400 hover:bg-amber-600/80' : 'bg-amber-300 border-amber-600 hover:bg-amber-400')
                                                    : (isDark ? 'bg-slate-800 border-slate-700 hover:bg-slate-700/60' : 'bg-white border-slate-200 hover:bg-slate-50')
                                                }`}
                                        >
                                            {/* Bloque horario */}
                                            <div className="flex flex-col items-center justify-center min-w-[64px]">
                                                <span className={`text-lg font-bold font-mono leading-tight ${isDark ? 'text-white' : 'text-slate-800'}`}>
                                                    {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <span className="text-[11px] font-mono text-slate-400">
                                                    {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            {/* Barra de color de la agenda */}
                                            <div className="w-1.5 rounded-full self-stretch flex-shrink-0" style={{ backgroundColor: isBooked ? agendaColor(s.agenda) : (isDark ? '#334155' : '#e2e8f0') }} />
                                            {/* Contenido */}
                                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                                {isBooked ? (
                                                    <>
                                                        <span className={`font-bold text-sm truncate ${isDark ? 'text-white' : 'text-slate-800'}`}>
                                                            {s.clientName || 'Cliente'}
                                                        </span>
                                                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                                                            {s.clientPhone && <span className="flex items-center gap-1"><Phone size={11} />{s.clientPhone}</span>}
                                                            {agendas.length > 1 && s.agenda && (
                                                                <span className="flex items-center gap-1">
                                                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: agendaColor(s.agenda) }} />
                                                                    {s.agenda}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <span className={`text-sm font-semibold ${isDark ? 'text-sky-400' : 'text-sky-600'}`}>
                                                        Hueco libre{agendas.length > 1 && s.agenda ? ` · ${s.agenda}` : ''}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Etiqueta de estado + incidente */}
                                            <div className="flex flex-col items-end justify-center gap-1 flex-shrink-0">
                                                {s.incident && (
                                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 border ${isDark ? 'bg-amber-600/80 text-white border-amber-300' : 'bg-amber-500 text-white border-amber-700'}`}><Zap size={11} />Sin Cita</span>
                                                )}
                                                {isDelivered
                                                    ? <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 border ${isDark ? 'bg-emerald-600/90 text-white border-emerald-300' : 'bg-emerald-600 text-white border-emerald-800'}`}><PackageCheck size={11} />Entregado</span>
                                                    : isBooked
                                                        ? <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 border ${isDark ? 'bg-amber-600/90 text-white border-amber-300' : 'bg-amber-500 text-white border-amber-700'}`}><User size={11} />Reservada</span>
                                                        : <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${isDark ? 'bg-sky-600/90 text-white border-sky-300' : 'bg-sky-500 text-white border-sky-700'}`}>Libre</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Añadir hueco al día */}
                            {!readOnly && (
                                <button
                                    onClick={() => handleQuickAddDate(toIsoDate(currentDate))}
                                    className={`w-full py-3 rounded-2xl border-2 border-dashed font-semibold text-sm flex items-center justify-center gap-2 transition ${isDark
                                        ? 'border-slate-600 text-slate-400 hover:border-purple-500 hover:text-purple-300'
                                        : 'border-slate-300 text-slate-500 hover:border-purple-400 hover:text-purple-600'}`}
                                >
                                    <Plus size={16} /> Añadir hueco a este día
                                </button>
                            )}
                        </div>
                    );
                })()}

            </div>

            {/* MODAL EDICIÓN CITA */}
            {selectedAppt && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className={`rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh] ${isDark ? 'glass-panel border-white/5' : 'bg-white'}`}>
                        <div className={`p-4 border-b flex justify-between items-center flex-shrink-0 ${isDark ? 'border-white/5 bg-slate-900/30' : 'border-slate-100 bg-slate-50'}`}>
                            <h3 className={`font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                                {readOnly ? <Eye size={18} className="text-blue-500" /> : <CalendarIcon size={18} className="text-purple-500" />}
                                {readOnly ? 'Detalles Cita' : 'Gestionar Cita'}
                            </h3>
                            <button onClick={closeBookingModal} className={`p-1 rounded-full transition ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-400 hover:text-slate-600'}`}><X size={20} /></button>
                        </div>

                        <div className="p-6 space-y-4 overflow-y-auto flex-1">
                            <div className={`text-center mb-6 p-4 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                                <div className={`text-2xl font-bold font-mono ${isDark ? 'text-white' : 'text-slate-800'}`}>
                                    {/* Pasamos durationMin para que un bloque multi-slot
                                        (ej. Avería 2h en 2 huecos de 1h) muestre "13:00 - 15:00"
                                        en lugar de "13:00 - 14:00". Sin esto el header del modal
                                        contradecía visualmente el chip del calendario. */}
                                    {formatTimeRange(selectedAppt.date, selectedAppt.durationMin)}
                                </div>
                                <div className="text-sm text-slate-500 font-medium uppercase tracking-wide mt-1">
                                    {new Date(selectedAppt.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                                </div>
                                {/* Badge del tipo de servicio (Avería / Reparación / Revisión…)
                                    para que el trabajador sepa de un vistazo qué tipo de cita es
                                    sin tener que mirar el panel de Averías o la agenda. Resaltado
                                    en ámbar si es Avería porque requiere llamar al cliente. */}
                                {selectedAppt.status === 'Booked' && selectedAppt.serviceType && (
                                    <div className="mt-3 flex items-center justify-center">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border ${isBreakdownService(selectedAppt.serviceType)
                                            ? (isDark ? 'bg-amber-900/30 text-amber-300 border-amber-700' : 'bg-amber-100 text-amber-800 border-amber-300')
                                            : (isDark ? 'bg-blue-900/30 text-blue-300 border-blue-700' : 'bg-blue-100 text-blue-800 border-blue-300')}`}>
                                            {isBreakdownService(selectedAppt.serviceType) ? <Wrench size={12} /> : <CalendarIcon size={12} />}
                                            {selectedAppt.serviceType}
                                            {selectedAppt.durationMin ? ` · ${selectedAppt.durationMin >= 60 ? `${Math.floor(selectedAppt.durationMin / 60)}h${selectedAppt.durationMin % 60 ? ` ${selectedAppt.durationMin % 60}min` : ''}` : `${selectedAppt.durationMin}min`}` : ''}
                                        </span>
                                    </div>
                                )}
                                {/* Badge de "Vehículo entregado": si la cita ya se marcó como
                                    entregada (desde el panel de Entregas o aquí mismo), se muestra
                                    en verde con la hora y quién lo hizo. Indica que la secuencia
                                    postventa ya está en marcha. */}
                                {/* Badge "Vehículo entregado" solo si el estado ACTUAL del
                                    cliente es ese. Antes nos basábamos solo en
                                    selectedAppt.deliveredAt (fecha histórica) y el badge
                                    seguía apareciendo aunque el compañero hubiera cambiado
                                    el estado del cliente a "Cerrado" después de entregar.
                                    Mostramos el badge si: o bien el estado actual lo
                                    indica, o (si aún no se ha cargado el estado del
                                    contacto vía fetch) hay deliveredAt — para no perder la
                                    señal el primer momento al abrir el modal. */}
                                {selectedAppt.deliveredAt && (
                                    <div className="mt-3 flex flex-col items-center gap-1">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border ${isDark ? 'bg-emerald-900/30 text-emerald-300 border-emerald-700' : 'bg-emerald-100 text-emerald-800 border-emerald-300'}`}>
                                            <PackageCheck size={12} />
                                            Vehículo entregado
                                        </span>
                                        {selectedAppt.deliveredAt && (
                                            <span className="text-[11px] text-slate-400">
                                                {new Date(selectedAppt.deliveredAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                {selectedAppt.deliveredBy ? ` · ${selectedAppt.deliveredBy}` : ''}
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Estado</label>
                                <select
                                    value={editStatus}
                                    onChange={(e) => setEditStatus(e.target.value)}
                                    className={`w-full p-3 border rounded-xl focus:ring-2 focus:ring-purple-500 outline-none transition ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-200'}`}
                                    disabled={readOnly}
                                >
                                    <option value="Available">🟢 Disponible</option>
                                    <option value="Booked">🔴 Reservada</option>
                                </select>
                            </div>

                            {/* Incidente — cita inesperada / urgente del mismo día */}
                            <div className={`flex items-center justify-between p-3 rounded-xl border ${editIncident
                                ? (isDark ? 'bg-amber-900/20 border-amber-700' : 'bg-amber-50 border-amber-200')
                                : (isDark ? 'bg-slate-900/40 border-slate-700' : 'bg-slate-50 border-slate-200')}`}>
                                <div className="flex items-center gap-2">
                                    <Zap size={16} className={editIncident ? 'text-amber-500' : 'text-slate-400'} />
                                    <div>
                                        <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-700'}`}>Sin Cita</span>
                                        <p className="text-[11px] text-slate-400">Cliente atendido sin reserva previa</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { if (!readOnly) setEditIncident(v => !v); }}
                                    disabled={readOnly}
                                    title={editIncident ? 'Quitar marca de Sin Cita' : 'Marcar como Sin Cita'}
                                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${editIncident ? 'bg-amber-500' : (isDark ? 'bg-slate-600' : 'bg-slate-300')} ${readOnly ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${editIncident ? 'translate-x-5' : ''}`} />
                                </button>
                            </div>

                            {(editStatus === 'Booked' || readOnly) && (
                                <div className={`p-4 rounded-xl border space-y-3 animate-in slide-in-from-top-2 ${isDark ? 'bg-purple-900/20 border-purple-800' : 'bg-purple-50 border-purple-100'}`}>
                                    {/* Teléfono va PRIMERO: al teclearlo se autocompleta el resto.
                                        Antes el orden era Nombre → Teléfono, pero como el teléfono
                                        es el que dispara la búsqueda lo movimos arriba para que el
                                        flujo natural sea "pones teléfono → ves quién es → ves nombre/vehículo". */}
                                    <div>
                                        <label className={`text-xs font-bold uppercase mb-1 block ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>Teléfono</label>
                                        <div className="flex gap-2">
                                            <div className="relative w-24 flex-shrink-0">
                                                <span className={`absolute left-2 top-1/2 -translate-y-1/2 text-sm font-bold pointer-events-none ${isDark ? 'text-purple-400' : 'text-purple-500'}`}>+</span>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={editPrefix}
                                                    onChange={(e) => setEditPrefix(e.target.value.replace(/\D/g, ''))}
                                                    list="phone-prefixes"
                                                    className={`w-full p-2 pl-5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none ${isDark ? 'bg-slate-800 border-purple-900 text-white' : 'border-purple-200'}`}
                                                    placeholder="34"
                                                    disabled={readOnly}
                                                />
                                            </div>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={editPhone}
                                                onChange={(e) => setEditPhone(e.target.value)}
                                                className={`flex-1 min-w-0 p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none ${isDark ? 'bg-slate-800 border-purple-900 text-white' : 'border-purple-200'}`}
                                                placeholder="Ej: 609123815"
                                                disabled={readOnly}
                                            />
                                        </div>
                                        <datalist id="phone-prefixes">
                                            <option value="34">España</option>
                                            <option value="351">Portugal</option>
                                            <option value="33">Francia</option>
                                            <option value="39">Italia</option>
                                            <option value="49">Alemania</option>
                                            <option value="44">Reino Unido</option>
                                            <option value="1">EE.UU. / Canadá</option>
                                            <option value="212">Marruecos</option>
                                            <option value="376">Andorra</option>
                                        </datalist>
                                        <p className={`text-[10px] mt-1 ${isDark ? 'text-purple-400/70' : 'text-purple-500/80'}`}>Prefijo del país (sin +) y número. Por defecto España (34). Puedes escribir cualquier otro prefijo.</p>
                                    </div>

                                    {/* INDICADOR DE AUTOCOMPLETADO — solo al CREAR cita (slot Available → Booked).
                                        Al teclear el teléfono, busca en Airtable y muestra si el cliente existe ya.
                                        Si existe, los campos de abajo se han rellenado solos (name + field1..5 del vehículo).
                                        Si tiene varios vehículos, se muestra un <select> entre el indicador y los campos. */}
                                    {!readOnly && selectedAppt.status === 'Available' && editStatus === 'Booked' && editPhone.replace(/\D/g, '').length >= 9 && (
                                        <>
                                            {lookingUpContact ? (
                                                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${isDark ? 'bg-slate-800/60 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
                                                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="50 50" /></svg>
                                                    <span>Buscando cliente…</span>
                                                </div>
                                            ) : contactLookup?.found ? (
                                                <div className={`px-3 py-2 rounded-lg text-xs space-y-1 ${isDark ? 'bg-emerald-900/30 border border-emerald-700/40 text-emerald-200' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
                                                    <div className="flex items-center gap-2 font-bold">
                                                        <span>✅ Cliente encontrado:</span>
                                                        <span>{contactLookup.name || '(sin nombre)'}</span>
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${isDark ? 'bg-emerald-800/40' : 'bg-emerald-100'}`}>
                                                            {contactLookup.vehicleCount} {contactLookup.vehicleCount === 1 ? 'vehículo' : 'vehículos'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] opacity-90">
                                                        {contactLookup.status && <span>Estado: <b>{contactLookup.status}</b></span>}
                                                        {contactLookup.assigned_to && <span>Asignado a: <b>{contactLookup.assigned_to}</b></span>}
                                                        {contactLookup.department && <span>Dpto: <b>{contactLookup.department}</b></span>}
                                                    </div>
                                                    {contactLookup.tags && contactLookup.tags.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mt-1">
                                                            {contactLookup.tags.map(t => (
                                                                <span key={t} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${isDark ? 'bg-orange-900/40 text-orange-200' : 'bg-orange-100 text-orange-700'}`}>{t}</span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className={`px-3 py-2 rounded-lg text-xs ${isDark ? 'bg-amber-900/20 border border-amber-700/40 text-amber-200' : 'bg-amber-50 border border-amber-200 text-amber-700'}`}>
                                                    <span className="font-bold">🆕 Cliente nuevo</span>
                                                    <span className="opacity-80"> — rellena los datos a mano</span>
                                                </div>
                                            )}

                                        </>
                                    )}

                                    {/* Nombre Cliente — debajo del indicador. Se autocompleta al
                                        encontrar cliente, pero el agente puede editarlo a mano. */}
                                    <div>
                                        <label className={`text-xs font-bold uppercase mb-1 block ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>Nombre Cliente</label>
                                        <input
                                            type="text"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            className={`w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none ${isDark ? 'bg-slate-800 border-purple-900 text-white' : 'border-purple-200'}`}
                                            placeholder="Ej: Juan Pérez"
                                            disabled={readOnly}
                                        />
                                    </div>

                                    {!readOnly && selectedAppt.status === 'Available' && editStatus === 'Booked' && editPhone.replace(/\D/g, '').length >= 9 && (
                                        <>
                                            {/* Selector de vehículo — solo si el cliente tiene >1 vehículo. Al cambiar
                                                se rellenan automáticamente los field1..5 con los datos del vehículo. */}
                                            {contactLookup?.found && vehicles.length > 1 && (
                                                <div>
                                                    <label className={`text-xs font-bold uppercase mb-1 block ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>Vehículo del cliente</label>
                                                    <select
                                                        value={selectedVehicleId}
                                                        onChange={(e) => {
                                                            const id = e.target.value;
                                                            setSelectedVehicleId(id);
                                                            const v = vehicles.find(x => x.id === id);
                                                            if (v) {
                                                                setEditMatricula(v.matricula || '');
                                                                setEditMarca(v.marca || '');
                                                                setEditModelo(v.modelo || '');
                                                                setEditExtra(v.extra || '');
                                                                setEditNotas(v.notas || '');
                                                            }
                                                        }}
                                                        className={`w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none ${isDark ? 'bg-slate-800 border-purple-900 text-white' : 'border-purple-200 bg-white'}`}
                                                    >
                                                        {vehicles.map(v => (
                                                            <option key={v.id} value={v.id}>
                                                                {v.matricula || '(sin matrícula)'} — {v.marca} {v.modelo}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* Selector de TIPO DE SERVICIO — visible al CREAR cita
                                        (Available→Booked) Y al EDITAR una cita ya Booked, si la
                                        agenda del slot tiene servicios configurados (Avería,
                                        Revisión...). Al elegir uno y guardar, el backend ajusta el
                                        bloque automáticamente: crear nuevo, ampliar (validando
                                        huecos consecutivos libres tras la cita actual), reducir
                                        (liberando los secundarios sobrantes) o solo re-etiquetar.
                                        Sin servicio = solo 1 hueco (comportamiento clásico). */}
                                    {!readOnly && editStatus === 'Booked' && (() => {
                                        // Fallback: si la cita no tiene agenda asignada o el nombre
                                        // no coincide con ninguna agenda configurada (típico en citas
                                        // viejas, anteriores a la introducción de multi-agenda),
                                        // caemos a la primera agenda con servicios para que el agente
                                        // pueda seguir editando el tipo de servicio. El backend
                                        // también aplica el mismo fallback al primer agenda al
                                        // ajustar el bloque.
                                        const apptAgendaName = (selectedAppt?.agenda || '').trim();
                                        const slotAgenda = (apptAgendaName && agendas.find(a => a.name === apptAgendaName))
                                            || agendas.find(a => (a.services || []).some(s => s.name && s.name.trim() && s.durationMin > 0))
                                            || agendas[0];
                                        const availableServices = (slotAgenda?.services || []).filter(s => s.name && s.name.trim() && s.durationMin > 0);
                                        if (availableServices.length === 0) return null;
                                        const granularity = slotAgenda?.duration || 60;
                                        const chosen = availableServices.find(s => s.name === editService);
                                        const slotsNeeded = chosen ? Math.max(1, Math.ceil(chosen.durationMin / granularity)) : 1;
                                        return (
                                            <div>
                                                <label className={`text-xs font-bold uppercase mb-1 block ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>Tipo de servicio (opcional)</label>
                                                <select
                                                    value={editService}
                                                    onChange={(e) => setEditService(e.target.value)}
                                                    className={`w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none ${isDark ? 'bg-slate-800 border-purple-900 text-white' : 'border-purple-200 bg-white'}`}
                                                >
                                                    <option value="">— Sin servicio (1 hueco) —</option>
                                                    {availableServices.map(s => (
                                                        <option key={s.name} value={s.name}>
                                                            {s.name} · {s.durationMin}min
                                                        </option>
                                                    ))}
                                                </select>
                                                {chosen && (
                                                    <p className={`text-[11px] mt-1 ${isDark ? 'text-purple-300' : 'text-purple-600'}`}>
                                                        {/* El backend bloquea slotsNeeded huecos enteros aunque el servicio
                                                            sea más corto. Mostramos la duración REAL bloqueada (slotsNeeded
                                                            × granularidad) para que el agente sepa exactamente cuánto se
                                                            reserva del calendario. */}
                                                        Esta cita ocupará <strong>{slotsNeeded * granularity} min</strong> ({slotsNeeded} {slotsNeeded === 1 ? 'hueco' : 'huecos consecutivos'}).
                                                        {chosen.durationMin !== slotsNeeded * granularity && (
                                                            <span className={`block opacity-80 ${isDark ? 'text-purple-300/80' : 'text-purple-600/80'}`}>
                                                                (Servicio dura {chosen.durationMin}min, redondeado a huecos de {granularity}min)
                                                            </span>
                                                        )}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {/* Estado del CLIENTE — permite marcar "Vehículo Entregado" y demás */}
                                    {selectedAppt.clientPhone && (
                                        <div>
                                            <label className={`text-xs font-bold uppercase mb-1 block ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>Estado del Cliente</label>
                                            <select
                                                value={editContactStatus}
                                                onChange={(e) => setEditContactStatus(e.target.value)}
                                                className={`w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none ${isDark ? 'bg-slate-800 border-purple-900 text-white' : 'border-purple-200 bg-white'}`}
                                                disabled={readOnly || loadingContactStatus}
                                            >
                                                {loadingContactStatus && <option value="">Cargando…</option>}
                                                {!loadingContactStatus && !editContactStatus && <option value="">— Sin estado —</option>}
                                                {[...new Set([...(config?.statuses || []), editContactStatus].filter(Boolean))].map(s => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                            {editContactStatus === 'Vehículo Entregado' && originalContactStatus !== 'Vehículo Entregado' && (
                                                <p className="text-[11px] text-emerald-500 mt-1 font-medium">
                                                    ✓ Al guardar se programarán los recordatorios de postventa desde hoy.
                                                </p>
                                            )}
                                        </div>
                                    )}
                                    {/* Campo 1 (full width) */}
                                    <div>
                                        <label className={`text-xs font-bold uppercase mb-1 block ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>{fieldLabels.field1.label}</label>
                                        <input
                                            type="text"
                                            value={editMatricula}
                                            onChange={(e) => setEditMatricula(e.target.value)}
                                            className={`w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none ${isDark ? 'bg-slate-800 border-purple-900 text-white' : 'border-purple-200'}`}
                                            placeholder={fieldLabels.field1.placeholder}
                                            disabled={readOnly}
                                        />
                                    </div>
                                    {/* Campos 2 y 3 (dos columnas) */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className={`text-xs font-bold uppercase mb-1 block ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>{fieldLabels.field2.label}</label>
                                            <input
                                                type="text"
                                                value={editMarca}
                                                onChange={(e) => setEditMarca(e.target.value)}
                                                className={`w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none ${isDark ? 'bg-slate-800 border-purple-900 text-white' : 'border-purple-200'}`}
                                                placeholder={fieldLabels.field2.placeholder}
                                                disabled={readOnly}
                                            />
                                        </div>
                                        <div>
                                            <label className={`text-xs font-bold uppercase mb-1 block ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>{fieldLabels.field3.label}</label>
                                            <input
                                                type="text"
                                                value={editModelo}
                                                onChange={(e) => setEditModelo(e.target.value)}
                                                className={`w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none ${isDark ? 'bg-slate-800 border-purple-900 text-white' : 'border-purple-200'}`}
                                                placeholder={fieldLabels.field3.placeholder}
                                                disabled={readOnly}
                                            />
                                        </div>
                                    </div>
                                    {/* Campo 4 (opcional, full width) */}
                                    <div>
                                        <label className={`text-xs font-bold uppercase mb-1 block ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>{fieldLabels.field4.label} <span className="text-slate-400 font-normal">(opcional)</span></label>
                                        <input
                                            type="text"
                                            value={editExtra}
                                            onChange={(e) => setEditExtra(e.target.value)}
                                            className={`w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none ${isDark ? 'bg-slate-800 border-purple-900 text-white' : 'border-purple-200'}`}
                                            placeholder={fieldLabels.field4.placeholder}
                                            disabled={readOnly}
                                        />
                                    </div>
                                    {/* Campo 5 (opcional, full width, textarea para notas largas) */}
                                    <div>
                                        <label className={`text-xs font-bold uppercase mb-1 block ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>{fieldLabels.field5.label} <span className="text-slate-400 font-normal">(opcional)</span></label>
                                        <textarea
                                            value={editNotas}
                                            onChange={(e) => setEditNotas(e.target.value)}
                                            rows={2}
                                            className={`w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none resize-none ${isDark ? 'bg-slate-800 border-purple-900 text-white' : 'border-purple-200'}`}
                                            placeholder={fieldLabels.field5.placeholder}
                                            disabled={readOnly}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Factura del cliente — se adjunta y envía por WhatsApp al
                                marcar "Vehículo Entregado". Solo para citas reservadas con cliente. */}
                            {selectedAppt.status === 'Booked' && selectedAppt.clientPhone && (
                                <div className={`pt-4 border-t mt-4 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                                    <label className="text-xs font-bold uppercase mb-1.5 flex items-center gap-1.5 text-slate-400">
                                        <FileText size={13} /> Factura del cliente
                                    </label>
                                    {invoiceUrl ? (
                                        <div className={`flex items-center gap-2 p-2.5 rounded-lg border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                                            <FileText size={16} className="text-emerald-500 shrink-0" />
                                            <a href={invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-sm flex-1 truncate text-blue-500 hover:underline">Ver factura adjunta</a>
                                            {!readOnly && (
                                                <button onClick={handleInvoiceRemove} disabled={uploadingInvoice} title="Quitar factura" className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition">
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    ) : (
                                        !readOnly && (
                                            <label className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border border-dashed cursor-pointer text-sm transition ${isDark ? 'border-slate-600 text-slate-400 hover:border-emerald-500 hover:text-emerald-400' : 'border-slate-300 text-slate-500 hover:border-emerald-400 hover:text-emerald-600'} ${uploadingInvoice ? 'opacity-60 pointer-events-none' : ''}`}>
                                                {uploadingInvoice ? <RotateCcw size={15} className="animate-spin" /> : <Upload size={15} />}
                                                {uploadingInvoice ? 'Subiendo…' : 'Adjuntar factura (PDF/imagen)'}
                                                <input type="file" accept="application/pdf,image/*" className="hidden" disabled={uploadingInvoice} onChange={e => { handleInvoiceUpload(e.target.files?.[0]); e.currentTarget.value = ''; }} />
                                            </label>
                                        )
                                    )}
                                    <p className="text-[11px] text-slate-400 mt-1">Se enviará al cliente por WhatsApp al marcar "Vehículo Entregado".</p>
                                </div>
                            )}

                            {/* Cancelar reserva — visible para TODOS los roles */}
                            {selectedAppt.status === 'Booked' && (
                                <div className={`pt-4 border-t mt-4 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
                                    <button
                                        onClick={handleCancelBooking}
                                        className={`w-full py-2.5 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2 border ${isDark ? 'bg-orange-900/20 border-orange-800 text-orange-400 hover:bg-orange-900/40' : 'bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100'}`}
                                    >
                                        <X size={16} /> Cancelar Reserva (liberar hueco)
                                    </button>
                                </div>
                            )}

                            {/* Borrar/Guardar — solo admins y managers */}
                            {!readOnly && (
                                <div className="flex gap-2">
                                    <button onClick={() => handleDelete(selectedAppt.id)} className={`p-3 rounded-xl transition border ${isDark ? 'bg-red-900/20 border-red-900 text-red-400 hover:bg-red-900/30' : 'text-red-500 bg-red-50 hover:bg-red-100 border-red-100'}`} title="Borrar hueco definitivamente"><Trash2 size={20} /></button>
                                    <button onClick={handleUpdateAppt} className="flex-1 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition flex items-center justify-center gap-2 shadow-lg active:scale-95">
                                        <Save size={18} /> Guardar Cambios
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CONFIGURAR AGENDAS */}
            {showAgendaModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                    <div className={`rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] ${isDark ? 'glass-panel border-white/5' : 'bg-white'}`}>
                        {/* Header */}
                        <div className={`p-4 border-b flex justify-between items-center flex-shrink-0 ${isDark ? 'border-white/5 bg-slate-900/30' : 'border-slate-100 bg-slate-50'}`}>
                            <h3 className={`font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                                <Layers size={18} className="text-purple-500" />
                                Agendas y horarios
                            </h3>
                            <button onClick={() => setShowAgendaModal(false)} className={`p-1 rounded-full transition ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}><X size={20} /></button>
                        </div>

                        {/* Body */}
                        <div className="p-5 space-y-4 overflow-y-auto flex-1">
                            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                Cada agenda es una línea de citas independiente con su propio horario (ej: <strong>Taller</strong>, <strong>Ventas</strong>).
                                El bot ofrecerá los huecos de cada agenda por separado. Si solo creas una, funciona como un horario único.
                            </p>

                            {draftAgendas.map((ag, i) => (
                                <div key={ag.id} className={`p-4 rounded-xl border ${isDark ? 'border-white/10 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                                    {/* Nombre + borrar */}
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: AGENDA_COLORS[i % AGENDA_COLORS.length] }} />
                                        <input
                                            value={ag.name}
                                            onChange={e => updateDraftAgenda(i, { name: e.target.value })}
                                            placeholder="Nombre de la agenda (ej: Taller)"
                                            className={`flex-1 p-2 border rounded-lg text-sm font-semibold focus:ring-2 focus:ring-purple-500 outline-none ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
                                        />
                                        <button onClick={() => removeDraftAgenda(i)} className={`p-2 rounded-lg transition ${isDark ? 'text-red-400 bg-red-900/20 hover:bg-red-900/40' : 'text-red-500 bg-red-50 hover:bg-red-100'}`} title="Eliminar agenda">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    {/* Descripción — ayuda al bot a deducir la agenda */}
                                    <label className="text-xs font-bold text-slate-400 block mb-1 uppercase">Servicios que cubre <span className="font-normal lowercase">(ayuda al bot a deducir)</span></label>
                                    <textarea
                                        value={ag.description}
                                        onChange={e => updateDraftAgenda(i, { description: e.target.value })}
                                        rows={2}
                                        placeholder="Ej: revisiones, ITV, cambios de aceite, reparaciones, neumáticos, averías..."
                                        className={`w-full p-2 border rounded-lg text-sm mb-3 outline-none focus:ring-2 focus:ring-purple-500 resize-none ${isDark ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-200 placeholder-slate-400'}`}
                                    />

                                    {/* Días */}
                                    <label className="text-xs font-bold text-slate-400 block mb-1 uppercase">Días</label>
                                    <div className="flex gap-1.5 mb-3">
                                        {WEEK_DAYS.map(d => (
                                            <button
                                                key={d.value}
                                                onClick={() => toggleDraftDay(i, d.value)}
                                                className={`w-9 h-9 rounded-lg text-sm font-bold transition ${ag.days.includes(d.value)
                                                    ? 'bg-purple-600 text-white'
                                                    : isDark ? 'bg-slate-700 text-slate-400 hover:bg-slate-600' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-100'}`}>
                                                {d.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Horas + duración */}
                                    <div className="grid grid-cols-3 gap-2 mb-3">
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 block mb-1 uppercase">Apertura</label>
                                            <input type="time" value={ag.startTime} onChange={e => updateDraftAgenda(i, { startTime: e.target.value })}
                                                className={`w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500 ${isDark ? 'bg-slate-700 border-slate-600 text-white scheme-dark' : 'bg-white border-slate-200'}`} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 block mb-1 uppercase">Cierre</label>
                                            <input type="time" value={ag.endTime} onChange={e => updateDraftAgenda(i, { endTime: e.target.value })}
                                                className={`w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500 ${isDark ? 'bg-slate-700 border-slate-600 text-white scheme-dark' : 'bg-white border-slate-200'}`} />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 block mb-1 uppercase">Grid slot (min)</label>
                                            <input type="number" min={5} step={5} value={ag.duration} onChange={e => updateDraftAgenda(i, { duration: parseInt(e.target.value) || 30 })}
                                                className={`w-full p-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-purple-500 ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-200'}`} />
                                        </div>
                                    </div>

                                    {/* Tipos de servicio — duración variable por servicio */}
                                    <div className={`rounded-xl border p-3 ${isDark ? 'border-white/10 bg-slate-800/40' : 'border-slate-200 bg-slate-50'}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-xs font-bold text-slate-400 uppercase">Tipos de servicio <span className="font-normal lowercase">(duración variable, opcional)</span></label>
                                            <button onClick={() => addService(i)} className={`text-xs px-2 py-1 rounded-lg flex items-center gap-1 font-semibold transition ${isDark ? 'bg-purple-900/40 text-purple-300 hover:bg-purple-900/60' : 'bg-purple-50 text-purple-700 hover:bg-purple-100'}`}>
                                                <Plus size={11} /> Añadir
                                            </button>
                                        </div>
                                        {(!ag.services || ag.services.length === 0) && (
                                            <p className="text-xs text-slate-400 italic">Sin tipos — todos los huecos duran {ag.duration} min.</p>
                                        )}
                                        {(ag.services || []).map((svc, si) => (
                                            <div key={svc.id} className="flex items-center gap-2 mb-2">
                                                <input
                                                    value={svc.name}
                                                    onChange={e => updateService(i, si, { name: e.target.value })}
                                                    placeholder="Ej: Avería, Revisión..."
                                                    className={`flex-1 p-1.5 border rounded-lg text-sm outline-none focus:ring-1 focus:ring-purple-500 ${isDark ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-500' : 'bg-white border-slate-200 placeholder-slate-400'}`}
                                                />
                                                <div className="flex items-center gap-1 flex-shrink-0">
                                                    <input
                                                        type="number" min={5} step={5}
                                                        value={svc.durationMin}
                                                        onChange={e => updateService(i, si, { durationMin: parseInt(e.target.value) || ag.duration })}
                                                        className={`w-20 p-1.5 border rounded-lg text-sm text-center outline-none focus:ring-1 focus:ring-purple-500 ${isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-200'}`}
                                                    />
                                                    <span className="text-xs text-slate-400">min</span>
                                                </div>
                                                <button onClick={() => removeService(i, si)} className={`p-1.5 rounded-lg transition ${isDark ? 'text-red-400 hover:bg-red-900/30' : 'text-red-500 hover:bg-red-50'}`}>
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            <button onClick={addDraftAgenda} className={`w-full py-2.5 rounded-xl border-2 border-dashed font-semibold text-sm transition flex items-center justify-center gap-2 ${isDark ? 'border-white/15 text-slate-400 hover:border-purple-500/50 hover:text-purple-300' : 'border-slate-300 text-slate-500 hover:border-purple-400 hover:text-purple-600'}`}>
                                <Plus size={16} /> Añadir agenda
                            </button>
                        </div>

                        {/* Footer */}
                        <div className={`p-4 border-t flex gap-2 flex-shrink-0 ${isDark ? 'border-white/5 bg-slate-900/30' : 'border-slate-100 bg-slate-50'}`}>
                            <button onClick={() => setShowAgendaModal(false)} className={`px-4 py-2.5 rounded-xl font-semibold text-sm ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}>
                                Cancelar
                            </button>
                            <button onClick={handleSaveAgendas} disabled={savingAgendas} className="flex-1 px-4 py-2.5 rounded-xl font-bold text-sm bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md disabled:opacity-50 flex items-center justify-center gap-2">
                                {savingAgendas ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                                {savingAgendas ? 'Guardando...' : 'Guardar agendas'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Panel de historial de citas — reservas y cancelaciones */}
            <AppointmentHistoryPanel
                isOpen={showHistoryPanel}
                onClose={() => setShowHistoryPanel(false)}
                isDark={isDark}
                socket={socket}
                onJumpToDay={(dateStr) => {
                    // Saltar al día y abrir vista día — comportamiento idéntico al toast de nueva cita
                    const [y, m, d] = dateStr.split('-').map(Number);
                    if (y && m && d) {
                        setCurrentDate(new Date(y, m - 1, d));
                        setViewMode('day');
                    }
                }}
            />

            {/* Panel "Averías": lista de citas pendientes para llamar al cliente.
                Filtra appointments cuyo serviceType contenga "aver" (tolerante a
                tildes y mayúsculas) y respeta el filtro de agenda y línea de
                WhatsApp activos. Al clicar "Ver" abre el modal estándar de cita. */}
            {showBreakdownsModal && (
                <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-2 md:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={() => setShowBreakdownsModal(false)}>
                    <div
                        onClick={e => e.stopPropagation()}
                        className={`w-full max-w-3xl rounded-2xl shadow-2xl my-4 ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-slate-200'}`}
                    >
                        {/* Cabecera */}
                        <div className={`flex items-center justify-between p-4 md:p-5 border-b ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                            <div className="flex items-center gap-3 min-w-0">
                                <div className={`p-2 rounded-xl flex-shrink-0 ${isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                                    <Wrench size={20} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className={`text-base md:text-lg font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Averías pendientes</h3>
                                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {breakdownAppointments.length === 0
                                            ? 'No hay citas de avería para llamar.'
                                            : `${breakdownAppointments.length} cita${breakdownAppointments.length === 1 ? '' : 's'} de avería · llama al cliente para confirmar duración`}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowBreakdownsModal(false)}
                                className={`p-2 rounded-lg transition flex-shrink-0 ${isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}
                                title="Cerrar"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Lista */}
                        <div className="p-3 md:p-5 max-h-[70vh] overflow-y-auto">
                            {breakdownAppointments.length === 0 ? (
                                <div className={`text-center py-12 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    <Wrench size={40} className="mx-auto mb-3 opacity-30" />
                                    <p className="text-sm">No hay averías pendientes ahora mismo.</p>
                                    <p className="text-xs mt-1 opacity-70">Aparecerán aquí las citas reservadas con tipo "Avería".</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {breakdownAppointments.map(b => {
                                        const dt = new Date(b.date);
                                        const dateStr = dt.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
                                        const timeStr = formatTimeRange(b.date, b.durationMin);
                                        const isPast = dt.getTime() < Date.now();
                                        return (
                                            <div
                                                key={b.id}
                                                className={`rounded-xl p-3 md:p-4 border transition ${isDark
                                                    ? 'bg-slate-800/60 border-slate-700 hover:border-amber-700'
                                                    : 'bg-amber-50/50 border-amber-100 hover:border-amber-300'
                                                    }`}
                                            >
                                                <div className="flex flex-col md:flex-row md:items-center gap-3">
                                                    {/* Fecha + hora */}
                                                    <div className="flex-shrink-0 md:w-32">
                                                        <div className={`text-xs uppercase font-semibold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
                                                            {dateStr}
                                                            {isPast && <span className={`ml-1.5 text-[10px] normal-case font-bold px-1.5 py-0.5 rounded ${isDark ? 'bg-red-900/40 text-red-300' : 'bg-red-100 text-red-700'}`}>Pasada</span>}
                                                        </div>
                                                        <div className={`text-sm font-mono font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                                                            {timeStr}
                                                        </div>
                                                        {b.agenda && (
                                                            <div className="flex items-center gap-1 mt-1">
                                                                <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: agendaColor(b.agenda) }} />
                                                                <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{b.agenda}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Datos del cliente y vehículo */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className={`font-semibold truncate ${isDark ? 'text-white' : 'text-slate-800'}`}>
                                                            <User size={14} className="inline mr-1 -mt-0.5 opacity-60" />
                                                            {b.clientName || 'Cliente sin nombre'}
                                                        </div>
                                                        {b.clientPhone && (
                                                            <a
                                                                href={`tel:${b.clientPhone}`}
                                                                className={`inline-flex items-center gap-1 text-sm mt-0.5 hover:underline ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}
                                                                title="Llamar al cliente"
                                                            >
                                                                <Phone size={13} />
                                                                {b.clientPhone}
                                                            </a>
                                                        )}
                                                        {/* Datos del vehículo si los hay (matricula/marca/modelo) */}
                                                        {(b.matricula || b.marca || b.modelo) && (
                                                            <div className={`text-xs mt-1 truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                {[b.matricula, b.marca, b.modelo].filter(Boolean).join(' · ')}
                                                            </div>
                                                        )}
                                                        {b.notas && (
                                                            <div className={`text-xs mt-1 italic truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`} title={b.notas}>
                                                                "{b.notas}"
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Acciones */}
                                                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                                                        <button
                                                            onClick={() => {
                                                                setShowBreakdownsModal(false);
                                                                // Saltar al día de la cita y abrirla en el modal de edición
                                                                setCurrentDate(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()));
                                                                setViewMode('day');
                                                                handleOpenEdit(b);
                                                            }}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${isDark ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'}`}
                                                            title="Abrir cita en el calendario"
                                                        >
                                                            <Eye size={13} />
                                                            Ver cita
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Panel "Pendientes de entrega": citas Booked en el pasado sin
                DeliveredAt. Buscador por teléfono/nombre/matrícula y botón
                "Marcar entregado" que llama POST /api/appointments/:id/deliver.
                Tras marcar, la fila desaparece (la cita ya tiene deliveredAt). */}
            {showPendingDeliveryModal && (() => {
                // DOS MODOS de uso del modal:
                //   1) SIN texto en el buscador → lista de PENDIENTES (citas
                //      Booked pasadas sin DeliveredAt). Es el "panel" que muestra
                //      el trabajo por hacer (caso del 90%).
                //   2) CON texto en el buscador → busca en TODAS las citas
                //      Booked líderes del histórico (entregadas o no, pasadas o
                //      futuras). Útil cuando el cliente viene y solo recuerdas
                //      el teléfono — encuentras su cita aunque ya esté entregada
                //      (lo verás como "✅ Entregado"), pendiente, o futura.
                const q = deliverySearchQuery.trim().toLowerCase();
                const searchMode = q.length > 0;
                const filtered = searchMode
                    ? appointments
                        .filter(a => {
                            // Líder Booked con datos del cliente
                            if (a.status !== 'Booked') return false;
                            if (!a.clientName || !a.clientName.trim()) return false;
                            if ((a.durationMin || 0) <= 0) return false;
                            // Aplicar filtros de agenda / cuenta como el resto
                            if (agendaFilter && (a.agenda || '') !== agendaFilter) return false;
                            if (selectedAccountId && a.originPhoneId && a.originPhoneId !== selectedAccountId) return false;
                            // Match texto: teléfono / nombre / matrícula
                            return (
                                (a.clientPhone || '').toLowerCase().includes(q) ||
                                (a.clientName || '').toLowerCase().includes(q) ||
                                (a.matricula || '').toLowerCase().includes(q)
                            );
                        })
                        // Ordenar: pendientes primero (sin deliveredAt), luego entregados por fecha desc
                        .sort((a, b) => {
                            const aPend = !a.deliveredAt ? 0 : 1;
                            const bPend = !b.deliveredAt ? 0 : 1;
                            if (aPend !== bPend) return aPend - bPend;
                            return new Date(b.date).getTime() - new Date(a.date).getTime();
                        })
                    : pendingDeliveryAppointments;

                const markDelivered = async (apptId: string, clientName: string) => {
                    if (!confirm(`¿Confirmas que has entregado el vehículo de ${clientName}?\n\nEsto disparará la secuencia postventa (encuesta + recordatorios).`)) return;
                    setDeliveringId(apptId);
                    try {
                        const r = await fetch(`${API_URL}/appointments/${apptId}/deliver`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ actorUsername: getCurrentUsername() })
                        });
                        const data = await r.json();
                        if (!r.ok) {
                            alert(`No se pudo marcar como entregada:\n${data.error || 'Error desconocido'}`);
                        } else {
                            await fetchData();
                        }
                    } catch (e: any) {
                        alert('Error de red marcando entrega: ' + (e?.message || e));
                    } finally {
                        setDeliveringId(null);
                    }
                };

                const undoDelivery = async (apptId: string, clientName: string) => {
                    if (!confirm(`¿Deshacer la entrega del vehículo de ${clientName}?\n\nSe cancelarán los recordatorios postventa pendientes.`)) return;
                    setUndeliveringId(apptId);
                    try {
                        const r = await fetch(`${API_URL}/appointments/${apptId}/undeliver`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ actorUsername: getCurrentUsername() })
                        });
                        const data = await r.json();
                        if (!r.ok) {
                            alert(`No se pudo deshacer:\n${data.error || 'Error desconocido'}`);
                        } else {
                            await fetchData();
                        }
                    } catch (e: any) {
                        alert('Error de red deshaciendo entrega: ' + (e?.message || e));
                    } finally {
                        setUndeliveringId(null);
                    }
                };

                return (
                    <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center p-2 md:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={() => { setShowPendingDeliveryModal(false); setDeliverySearchQuery(''); }}>
                        <div
                            onClick={e => e.stopPropagation()}
                            className={`w-full max-w-3xl rounded-2xl shadow-2xl my-4 ${isDark ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-slate-200'}`}
                        >
                            {/* Cabecera */}
                            <div className={`flex items-center justify-between p-4 md:p-5 border-b ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`p-2 rounded-xl flex-shrink-0 ${isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
                                        <PackageCheck size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className={`text-base md:text-lg font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                                            {searchMode ? 'Buscar cita por cliente' : 'Pendientes de entrega'}
                                        </h3>
                                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            {searchMode
                                                ? `Resultados en todo el histórico de citas reservadas`
                                                : pendingDeliveryAppointments.length === 0
                                                    ? 'Sin pendientes · usa el buscador para encontrar cualquier cita'
                                                    : `${pendingDeliveryAppointments.length} cita${pendingDeliveryAppointments.length === 1 ? '' : 's'} pendiente${pendingDeliveryAppointments.length === 1 ? '' : 's'} · marca como entregado al devolver el vehículo`}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setShowPendingDeliveryModal(false); setDeliverySearchQuery(''); }}
                                    className={`p-2 rounded-lg transition flex-shrink-0 ${isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}
                                    title="Cerrar"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Buscador — siempre visible (también si no hay pendientes,
                                para poder buscar en todo el histórico). */}
                            <div className={`px-4 md:px-5 pt-4 pb-2`}>
                                <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                                    <Search size={16} className={isDark ? 'text-slate-400' : 'text-slate-500'} />
                                    <input
                                        type="text"
                                        value={deliverySearchQuery}
                                        onChange={e => setDeliverySearchQuery(e.target.value)}
                                        placeholder="Buscar cualquier cita por teléfono, nombre o matrícula..."
                                        className={`flex-1 bg-transparent outline-none text-sm ${isDark ? 'text-white placeholder:text-slate-500' : 'text-slate-800 placeholder:text-slate-400'}`}
                                        autoFocus
                                    />
                                    {deliverySearchQuery && (
                                        <button
                                            onClick={() => setDeliverySearchQuery('')}
                                            className={`p-0.5 rounded ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                                            title="Limpiar"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                                {searchMode && (
                                    <p className={`text-[11px] mt-1.5 px-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                        🔎 Buscando en todo el histórico — pendientes primero, luego entregadas.
                                    </p>
                                )}
                            </div>

                            {/* Lista */}
                            <div className="p-3 md:p-5 max-h-[60vh] overflow-y-auto">
                                {!searchMode && pendingDeliveryAppointments.length === 0 ? (
                                    <div className={`text-center py-12 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        <PackageCheck size={40} className="mx-auto mb-3 opacity-30" />
                                        <p className="text-sm">Todos los vehículos están entregados.</p>
                                        <p className="text-xs mt-1 opacity-70">Usa el buscador de arriba para encontrar cualquier cita del histórico (entregada o no).</p>
                                    </div>
                                ) : filtered.length === 0 ? (
                                    <div className={`text-center py-12 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        <Search size={40} className="mx-auto mb-3 opacity-30" />
                                        <p className="text-sm">Ningún resultado para "{deliverySearchQuery}".</p>
                                        <p className="text-xs mt-1 opacity-70">Prueba con el teléfono completo o solo los últimos dígitos.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {filtered.map(b => {
                                            const dt = new Date(b.date);
                                            const dateStr = dt.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
                                            const timeStr = formatTimeRange(b.date, b.durationMin);
                                            const daysAgo = Math.floor((Date.now() - dt.getTime()) / (24 * 60 * 60 * 1000));
                                            const isFuture = daysAgo < 0;
                                            const isDelivered = !!b.deliveredAt;
                                            // Badge: si es futura, azul; si entregada, verde; si no, según antigüedad
                                            const ageClass = isFuture
                                                ? (isDark ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700')
                                                : isDelivered
                                                    ? (isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700')
                                                    : daysAgo > 15
                                                        ? (isDark ? 'bg-red-900/40 text-red-300' : 'bg-red-100 text-red-700')
                                                        : daysAgo > 7
                                                            ? (isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700')
                                                            : (isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600');
                                            const ageLabel = isFuture
                                                ? `En ${Math.abs(daysAgo)} día${Math.abs(daysAgo) === 1 ? '' : 's'}`
                                                : daysAgo === 0 ? 'Hoy' : daysAgo === 1 ? 'Ayer' : `Hace ${daysAgo} días`;
                                            const isAveria = isBreakdownService(b.serviceType);
                                            const deliveredDate = isDelivered ? new Date(b.deliveredAt!) : null;
                                            const deliveredAgo = deliveredDate ? Math.floor((Date.now() - deliveredDate.getTime()) / (24 * 60 * 60 * 1000)) : 0;
                                            return (
                                                <div
                                                    key={b.id}
                                                    className={`rounded-xl p-3 md:p-4 border transition ${isDelivered
                                                        ? (isDark ? 'bg-emerald-900/10 border-emerald-800/40' : 'bg-emerald-50/30 border-emerald-200')
                                                        : (isDark ? 'bg-slate-800/60 border-slate-700 hover:border-emerald-700' : 'bg-white border-slate-200 hover:border-emerald-300')
                                                        }`}
                                                >
                                                    <div className="flex flex-col md:flex-row md:items-center gap-3">
                                                        {/* Fecha + antigüedad */}
                                                        <div className="flex-shrink-0 md:w-32">
                                                            <div className={`text-xs uppercase font-semibold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                                                                {dateStr}
                                                            </div>
                                                            <div className={`text-sm font-mono font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                                                                {timeStr}
                                                            </div>
                                                            <span className={`inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${ageClass}`}>
                                                                {ageLabel}
                                                            </span>
                                                        </div>

                                                        {/* Datos del cliente y vehículo */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className={`font-semibold truncate flex items-center gap-1.5 flex-wrap ${isDark ? 'text-white' : 'text-slate-800'}`}>
                                                                <User size={14} className="inline opacity-60" />
                                                                {b.clientName || 'Cliente sin nombre'}
                                                                {isAveria && (
                                                                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${isDark ? 'bg-amber-900/40 text-amber-300' : 'bg-amber-100 text-amber-700'}`}>
                                                                        Avería
                                                                    </span>
                                                                )}
                                                                {isDelivered && (
                                                                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${isDark ? 'bg-emerald-900/40 text-emerald-300' : 'bg-emerald-100 text-emerald-700'}`}>
                                                                        <CheckCircle size={10} /> Entregado
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {b.clientPhone && (
                                                                <a
                                                                    href={`tel:${b.clientPhone}`}
                                                                    className={`inline-flex items-center gap-1 text-sm mt-0.5 hover:underline ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}
                                                                    title="Llamar al cliente"
                                                                >
                                                                    <Phone size={13} />
                                                                    {b.clientPhone}
                                                                </a>
                                                            )}
                                                            {(b.matricula || b.marca || b.modelo) && (
                                                                <div className={`text-xs mt-1 truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                                    {[b.matricula, b.marca, b.modelo].filter(Boolean).join(' · ')}
                                                                </div>
                                                            )}
                                                            {b.agenda && (
                                                                <div className="flex items-center gap-1 mt-1">
                                                                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: agendaColor(b.agenda) }} />
                                                                    <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{b.agenda}</span>
                                                                </div>
                                                            )}
                                                            {isDelivered && deliveredDate && (
                                                                <div className={`text-[11px] mt-1 italic ${isDark ? 'text-emerald-400/80' : 'text-emerald-700/80'}`}>
                                                                    Entregado {deliveredAgo === 0 ? 'hoy' : deliveredAgo === 1 ? 'ayer' : `hace ${deliveredAgo} días`}
                                                                    {b.deliveredBy ? ` por ${b.deliveredBy}` : ''}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Acciones — distintas según estado */}
                                                        <div className="flex flex-col gap-1.5 flex-shrink-0">
                                                            {isDelivered ? (
                                                                <button
                                                                    onClick={() => undoDelivery(b.id, b.clientName || 'este cliente')}
                                                                    disabled={undeliveringId === b.id}
                                                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'bg-amber-700 hover:bg-amber-600 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white'}`}
                                                                    title="Deshacer la marca de entrega (cancela los recordatorios postventa)"
                                                                >
                                                                    {undeliveringId === b.id
                                                                        ? (<><Loader2 size={13} className="animate-spin" />...</>)
                                                                        : (<><RotateCcw size={13} />Deshacer</>)}
                                                                </button>
                                                            ) : isFuture ? (
                                                                <span className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 ${isDark ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-50 text-blue-700'}`} title="La cita aún no ha pasado, no se puede entregar todavía">
                                                                    <Clock size={13} />
                                                                    Cita futura
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    onClick={() => markDelivered(b.id, b.clientName || 'este cliente')}
                                                                    disabled={deliveringId === b.id}
                                                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                                                                    title="Marcar vehículo como entregado al cliente"
                                                                >
                                                                    {deliveringId === b.id
                                                                        ? (<><Loader2 size={13} className="animate-spin" />Marcando...</>)
                                                                        : (<><CheckCircle size={13} />Marcar entregado</>)}
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => {
                                                                    setShowPendingDeliveryModal(false);
                                                                    setDeliverySearchQuery('');
                                                                    setCurrentDate(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()));
                                                                    setViewMode('day');
                                                                    handleOpenEdit(b);
                                                                }}
                                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}
                                                                title="Abrir cita en el calendario"
                                                            >
                                                                <Eye size={13} />
                                                                Ver cita
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Pie informativo */}
                            <div className={`px-4 md:px-5 py-3 border-t text-[11px] ${isDark ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-500'}`}>
                                💡 Al marcar como entregado se activan los recordatorios postventa automáticos (encuesta, próxima revisión...) según la configuración del bot.
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default CalendarDashboard;