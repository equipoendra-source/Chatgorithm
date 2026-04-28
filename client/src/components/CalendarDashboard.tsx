import React, { useState, useEffect } from 'react';
import {
    Calendar as CalendarIcon, Clock, Plus, Trash2, User, CheckCircle,
    RefreshCw, Phone, ChevronLeft, ChevronRight, Zap, X, Save, Eye, Loader2
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { API_URL as API_URL_BASE } from '../config/api';

interface Appointment {
    id: string;
    date: string;
    status: 'Available' | 'Booked';
    clientPhone?: string;
    clientName?: string;
    matricula?: string;
    marca?: string;
    modelo?: string;
    extra?: string;
    field1?: string;
    field2?: string;
    field3?: string;
    field4?: string;
}

interface FieldLabelEntry { label: string; placeholder: string; key: string; description: string; }
interface FieldLabels {
    field1: FieldLabelEntry;
    field2: FieldLabelEntry;
    field3: FieldLabelEntry;
    field4: FieldLabelEntry;
}

const DEFAULT_FIELD_LABELS: FieldLabels = {
    field1: { label: 'Matrícula', placeholder: 'Ej: 1234ABC', key: 'licensePlate', description: '' },
    field2: { label: 'Marca', placeholder: 'Ej: Ford', key: 'carBrand', description: '' },
    field3: { label: 'Modelo', placeholder: 'Ej: Focus', key: 'carModel', description: '' },
    field4: { label: 'Extra', placeholder: 'Información adicional', key: 'extra', description: '' }
};

interface CalendarDashboardProps {
    readOnly?: boolean;
}

const CalendarDashboard: React.FC<CalendarDashboardProps> = ({ readOnly = false }) => {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const API_URL = API_URL_BASE;

    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [slotDuration, setSlotDuration] = useState(60);

    // Modal Edición
    const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
    const [editStatus, setEditStatus] = useState('');
    const [editName, setEditName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editMatricula, setEditMatricula] = useState('');
    const [editMarca, setEditMarca] = useState('');
    const [editModelo, setEditModelo] = useState('');
    const [editExtra, setEditExtra] = useState('');

    // Etiquetas dinámicas según sector configurado en el wizard de Laura
    const [fieldLabels, setFieldLabels] = useState<FieldLabels>(DEFAULT_FIELD_LABELS);

    // Crear Manual
    const [newDate, setNewDate] = useState('');
    const [newTime, setNewTime] = useState('');
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
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const handleOpenEdit = (appt: Appointment) => {
        setSelectedAppt(appt);
        setEditStatus(appt.status);
        setEditName(appt.clientName || '');
        setEditPhone(appt.clientPhone || '');
        setEditMatricula(appt.matricula || appt.field1 || '');
        setEditMarca(appt.marca || appt.field2 || '');
        setEditModelo(appt.modelo || appt.field3 || '');
        setEditExtra(appt.extra || appt.field4 || '');
    };

    const handleUpdateAppt = async () => {
        if (!selectedAppt) return;
        try {
            const res = await fetch(`${API_URL}/appointments/${selectedAppt.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: editStatus,
                    clientName: editName,
                    clientPhone: editPhone,
                    matricula: editMatricula,
                    marca: editMarca,
                    modelo: editModelo,
                    extra: editExtra
                })
            });
            if (res.ok) {
                await fetchData();
                setSelectedAppt(null);
            } else alert("Error guardando");
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
                    modelo: ''
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
            await fetch(`${API_URL}/appointments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: isoDate, status: 'Available' })
            });
            await fetchData();
            setNewDate('');
            setNewTime('');
        } catch (e) { alert("Error creando hueco"); }
        finally { setIsCreating(false); }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Seguro que quieres borrar este hueco?")) return;
        await fetch(`${API_URL}/appointments/${id}`, { method: 'DELETE' });
        setAppointments(prev => prev.filter(a => a.id !== id));
        if (selectedAppt?.id === id) setSelectedAppt(null);
    };

    const formatTimeRange = (isoString: string) => {
        try {
            const start = new Date(isoString);
            const end = new Date(start.getTime() + slotDuration * 60000);
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
            return d.getDate() === day && d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear();
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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

    return (
        <div className={`p-4 md:p-8 h-full overflow-y-auto relative pb-20 md:pb-8 ${isDark ? 'bg-transparent' : 'bg-slate-50'}`}>
            <div className="max-w-6xl mx-auto space-y-6">

                {/* HEADER RESPONSIVE */}
                <div className={`flex flex-col md:flex-row justify-between items-center p-4 rounded-2xl shadow-sm border gap-4 ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
                        <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className={`p-2 rounded-full transition ${isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}><ChevronLeft /></button>
                        <h2 className={`text-lg md:text-xl font-bold text-center capitalize ${isDark ? 'text-white' : 'text-slate-800'}`}>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
                        <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className={`p-2 rounded-full transition ${isDark ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-100 text-slate-600'}`}><ChevronRight /></button>
                    </div>

                    <div className="flex gap-2 w-full md:w-auto justify-end">
                        <button onClick={fetchData} className={`p-2 rounded-xl transition ${isDark ? 'text-slate-400 hover:text-blue-400 bg-slate-700 hover:bg-slate-600' : 'text-slate-400 hover:text-blue-600 bg-slate-100 hover:bg-blue-50'}`} title="Refrescar">
                            <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>

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
                        <button onClick={handleCreateSlot} disabled={isCreating} className="w-full md:w-auto bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg shadow-md active:scale-95 transition flex items-center justify-center gap-2">
                            {isCreating ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />}
                            Crear
                        </button>
                    </div>
                )}

                {/* CALENDARIO ADAPTATIVO */}
                {/* En móvil: Lista vertical (flex-col). En Desktop: Grid (grid-cols-7) */}
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

                            return (
                                <div key={day} className={`rounded-2xl md:rounded-none shadow-sm md:shadow-none border md:border-0 md:border-b md:border-r p-4 md:p-2 min-h-auto md:min-h-[140px] transition-colors group relative ${isDark
                                    ? 'bg-slate-800 md:bg-transparent border-slate-700 md:border-slate-700 hover:bg-slate-700/50'
                                    : 'bg-white md:bg-transparent border-slate-200 md:border-slate-100 hover:bg-slate-50'
                                    }`}>

                                    {/* Cabecera del Día */}
                                    <div className="flex justify-between items-center md:items-start mb-3 md:mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-sm font-bold w-8 h-8 md:w-6 md:h-6 flex items-center justify-center rounded-full ${slots.length > 0 ? (isDark ? 'bg-purple-600 text-white' : 'bg-slate-800 text-white') : (isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-400')}`}>
                                                {day}
                                            </span>
                                            {/* Nombre del día (Solo visible en Móvil) */}
                                            <span className={`md:hidden text-sm font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{dayName}</span>
                                        </div>

                                        {total > 0 && (
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${booked === total
                                                ? (isDark ? 'bg-red-900/30 text-red-400 border border-red-800/50' : 'bg-red-100 text-red-600')
                                                : (isDark ? 'bg-green-900/30 text-green-400 border border-green-800/50' : 'bg-green-100 text-green-600')
                                                }`}>
                                                {booked}/{total} <span className="hidden md:inline">Ocupados</span>
                                            </span>
                                        )}
                                    </div>

                                    {/* Lista de Citas */}
                                    <div className="space-y-2 md:space-y-1 max-h-none md:max-h-[100px] overflow-y-visible md:overflow-y-auto pr-1 custom-scrollbar">
                                        {slots.length === 0 && <p className={`md:hidden text-xs italic ml-2 ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>Sin citas programadas</p>}

                                        {slots.map(s => (
                                            <div
                                                key={s.id}
                                                onClick={() => handleOpenEdit(s)}
                                                className={`text-xs md:text-[10px] px-3 py-2 md:px-2 md:py-1.5 rounded-lg md:rounded cursor-pointer transition flex justify-between items-center border ${s.status === 'Booked'
                                                    ? (isDark
                                                        ? 'bg-purple-900/40 border-purple-800 text-purple-300 hover:bg-purple-900/60'
                                                        : 'bg-purple-50 border-purple-100 text-purple-700 hover:bg-purple-100')
                                                    : (isDark
                                                        ? 'bg-green-900/40 border-green-800 text-green-300 hover:bg-green-900/60'
                                                        : 'bg-green-50 border-green-100 text-green-700 hover:bg-green-100')
                                                    }`}
                                            >
                                                <div className="flex flex-col md:flex-row md:items-center gap-1">
                                                    <span className="font-bold font-mono">{formatTimeRange(s.date)}</span>
                                                    {/* En móvil mostramos el nombre del cliente si está reservado */}
                                                    {s.status === 'Booked' && (
                                                        <span className={`md:hidden text-[10px] font-medium truncate max-w-[120px] ${isDark ? 'text-purple-400' : 'text-purple-500'}`}>
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
                            <button onClick={() => setSelectedAppt(null)} className={`p-1 rounded-full transition ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-400 hover:text-slate-600'}`}><X size={20} /></button>
                        </div>

                        <div className="p-6 space-y-4 overflow-y-auto flex-1">
                            <div className={`text-center mb-6 p-4 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                                <div className={`text-2xl font-bold font-mono ${isDark ? 'text-white' : 'text-slate-800'}`}>
                                    {formatTimeRange(selectedAppt.date)}
                                </div>
                                <div className="text-sm text-slate-500 font-medium uppercase tracking-wide mt-1">
                                    {new Date(selectedAppt.date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                                </div>
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

                            {(editStatus === 'Booked' || readOnly) && (
                                <div className={`p-4 rounded-xl border space-y-3 animate-in slide-in-from-top-2 ${isDark ? 'bg-purple-900/20 border-purple-800' : 'bg-purple-50 border-purple-100'}`}>
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
                                    <div>
                                        <label className={`text-xs font-bold uppercase mb-1 block ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>Teléfono</label>
                                        <input
                                            type="text"
                                            value={editPhone}
                                            onChange={(e) => setEditPhone(e.target.value)}
                                            className={`w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500 outline-none ${isDark ? 'bg-slate-800 border-purple-900 text-white' : 'border-purple-200'}`}
                                            placeholder="Ej: 34600..."
                                            disabled={readOnly}
                                        />
                                    </div>
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
        </div>
    );
};

export default CalendarDashboard;