import { useState, useEffect } from 'react';
import {
    Bot, ChevronLeft, ChevronRight, Loader2, CheckCircle2, X,
    Sparkles, GripVertical
} from 'lucide-react';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';

interface Props {
    onClose: () => void;
    onSaved: (newPrompt: string) => void;
}

interface FieldConfig {
    label: string;
    required: boolean;
}

// Sectores predefinidos — solo para el ícono/nombre y sugerencias de campos
const SECTORS = [
    { id: 'taller',        icon: '🚗', label: 'Taller / Concesionario' },
    { id: 'clinica_dental',icon: '🦷', label: 'Clínica dental' },
    { id: 'peluqueria',    icon: '💅', label: 'Peluquería / Estética' },
    { id: 'clinica_medica',icon: '🩺', label: 'Clínica médica / Fisioterapia' },
    { id: 'gestoria',      icon: '⚖️', label: 'Gestoría / Asesoría' },
    { id: 'inmobiliaria',  icon: '🏠', label: 'Inmobiliaria' },
    { id: 'academia',      icon: '🎓', label: 'Academia / Formación' },
    { id: 'veterinario',   icon: '🐶', label: 'Veterinario' },
    { id: 'otro',          icon: '✏️', label: 'Otro / Personalizado' },
];

// Sugerencias de campos por sector (pre-rellenan el paso 6, el usuario puede editarlos)
const SECTOR_FIELD_DEFAULTS: Record<string, FieldConfig[]> = {
    taller:         [{ label: 'Matrícula', required: true }, { label: 'Marca del vehículo', required: true }, { label: 'Modelo del vehículo', required: true }, { label: 'Kilómetros', required: true }, { label: 'Notas', required: false }],
    clinica_dental: [{ label: 'Nombre del paciente', required: true }, { label: 'Tratamiento', required: true }, { label: 'Mutua / Seguro', required: false }, { label: 'Doctor preferido', required: false }, { label: 'Notas', required: false }],
    peluqueria:     [{ label: 'Nombre del cliente', required: true }, { label: 'Servicio deseado', required: true }, { label: 'Estilista preferido', required: false }, { label: 'Producto / Color', required: false }, { label: 'Notas', required: false }],
    clinica_medica: [{ label: 'Nombre del paciente', required: true }, { label: 'Especialidad', required: true }, { label: 'Mutua / Seguro', required: false }, { label: 'Doctor preferido', required: false }, { label: 'Notas', required: false }],
    gestoria:       [{ label: 'Nombre completo', required: true }, { label: 'Tipo de gestión', required: true }, { label: 'NIF / CIF', required: true }, { label: 'Email', required: false }, { label: 'Notas', required: false }],
    inmobiliaria:   [{ label: 'Nombre del cliente', required: true }, { label: 'Tipo de propiedad', required: true }, { label: 'Zona de interés', required: true }, { label: 'Presupuesto', required: true }, { label: 'Notas', required: false }],
    academia:       [{ label: 'Nombre del alumno', required: true }, { label: 'Curso de interés', required: true }, { label: 'Nivel / Edad', required: true }, { label: 'Email de contacto', required: false }, { label: 'Notas', required: false }],
    veterinario:    [{ label: 'Nombre de la mascota', required: true }, { label: 'Especie / Raza', required: true }, { label: 'Motivo de la visita', required: true }, { label: 'Edad de la mascota', required: true }, { label: 'Notas', required: false }],
    otro:           [{ label: '', required: true }, { label: '', required: true }, { label: '', required: false }, { label: '', required: false }, { label: '', required: false }],
};

const EMPTY_FIELDS: FieldConfig[] = [
    { label: '', required: true },
    { label: '', required: true },
    { label: '', required: false },
    { label: '', required: false },
    { label: '', required: false },
];

const SECTOR_SERVICES: Record<string, string> = {
    taller:         'Cambio de aceite, ITV, mecánica general, electricidad, neumáticos, revisión preventiva.',
    clinica_dental: 'Limpieza dental, ortodoncia, implantes, blanqueamiento, endodoncia, urgencias.',
    peluqueria:     'Corte, color, mechas, tratamientos capilares, peinados de evento, manicura, pedicura.',
    clinica_medica: 'Fisioterapia, traumatología, medicina general, rehabilitación, masajes terapéuticos.',
    gestoria:       'Declaración de la renta, alta de autónomos, contabilidad, asesoría laboral, fiscal.',
    inmobiliaria:   'Venta de pisos, alquileres, tasaciones, gestión integral de la propiedad.',
    academia:       'Clases de inglés, refuerzo escolar, oposiciones, cursos online, formación a empresas.',
    veterinario:    'Vacunación, revisiones, cirugía, peluquería canina, hospitalización, urgencias 24h.',
    otro:           '',
};

export default function BotConfigWizard({ onClose, onSaved }: Props) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const [loadingState, setLoadingState] = useState(true);
    const [hasPreviousConfig, setHasPreviousConfig] = useState(false);

    // Estado del formulario
    const [sector, setSector] = useState<string>('');
    const [businessName, setBusinessName] = useState('');
    const [services, setServices] = useState('');
    const [hours, setHours] = useState('Lunes a viernes 09:00-14:00 y 16:00-20:00. Sábados 09:00-13:00. Domingos cerrado.');
    const [booksAppointments, setBooksAppointments] = useState(true);
    const [customFields, setCustomFields] = useState<FieldConfig[]>(EMPTY_FIELDS);
    const [tone, setTone] = useState<'formal' | 'cercano' | 'divertido'>('formal');
    const [extraInfo, setExtraInfo] = useState('');

    // Cargar el estado guardado del wizard para que el usuario edite en lugar de empezar de cero
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const r = await fetch(`${API_URL}/bot/wizard-state`);
                if (!r.ok) { setLoadingState(false); return; }
                const data = await r.json();
                if (cancelled) return;
                if (data && data.sector) {
                    setSector(data.sector);
                    setBusinessName(data.businessName || '');
                    setServices(data.services || '');
                    if (data.hours) setHours(data.hours);
                    if (typeof data.booksAppointments === 'boolean') setBooksAppointments(data.booksAppointments);
                    if (data.tone) setTone(data.tone);
                    if (data.extraInfo) setExtraInfo(data.extraInfo);
                    // Cargar campos personalizados (nuevo formato) o hacer fallback al sector
                    if (Array.isArray(data.customFields) && data.customFields.length > 0) {
                        setCustomFields(data.customFields);
                    } else if (data.sector && SECTOR_FIELD_DEFAULTS[data.sector]) {
                        setCustomFields(SECTOR_FIELD_DEFAULTS[data.sector]);
                    }
                    setHasPreviousConfig(true);
                }
            } catch { /* fallback: empezar de cero */ }
            finally { if (!cancelled) setLoadingState(false); }
        })();
        return () => { cancelled = true; };
    }, []);

    // Al elegir sector: pre-rellenar campos y servicios como sugerencia (solo si están vacíos)
    const handleSelectSector = (id: string) => {
        setSector(id);
        if (!customFields.some(f => f.label.trim())) {
            setCustomFields(SECTOR_FIELD_DEFAULTS[id] ?? EMPTY_FIELDS);
        }
        if (!services && SECTOR_SERVICES[id]) setServices(SECTOR_SERVICES[id]);
    };

    const updateField = (i: number, patch: Partial<FieldConfig>) => {
        setCustomFields(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f));
    };

    const canNext = (): boolean => {
        if (step === 1) return !!sector;
        if (step === 2) return businessName.trim().length > 1;
        if (step === 3) return services.trim().length > 5;
        if (step === 4) return hours.trim().length > 1;
        if (step === 5) return true;
        if (step === 6) return customFields.some(f => f.label.trim().length > 0);
        if (step === 7) return true;
        return false;
    };

    const handleSubmit = async () => {
        setSaving(true);
        try {
            const r = await fetch(`${API_URL}/bot/setup-wizard`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sector,
                    businessName: businessName.trim(),
                    services: services.trim(),
                    hours: hours.trim(),
                    booksAppointments,
                    customFields,
                    tone,
                    extraInfo: extraInfo.trim()
                })
            });
            const data = await r.json();
            if (!r.ok || !data.success) {
                alert('❌ Error: ' + (data.error || 'desconocido'));
                setSaving(false);
                return;
            }
            alert('✅ Laura ha sido configurada para tu negocio. Ya puede empezar a responder a tus clientes.');
            onSaved(data.prompt);
        } catch (e: any) {
            alert('Error de conexión: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className={`w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden ${isDark ? 'bg-slate-900 border border-white/10' : 'bg-white'}`}>
                {/* Header */}
                <div className={`px-6 py-4 border-b flex items-center justify-between ${isDark ? 'border-white/10 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 shadow-lg">
                            <Bot className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Configurar a Laura</h2>
                            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Asistente IA personalizada para tu negocio · Paso {step} de 7</p>
                        </div>
                    </div>
                    <button onClick={onClose} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/5 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Barra de progreso */}
                <div className={`h-1.5 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                    <div className="h-full bg-gradient-to-r from-purple-500 to-pink-600 transition-all" style={{ width: `${(step / 7) * 100}%` }} />
                </div>

                {/* Contenido */}
                <div className="flex-1 overflow-y-auto p-6">
                    {loadingState ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                            <Loader2 className="w-8 h-8 animate-spin" />
                            <p className="text-sm">Cargando configuración...</p>
                        </div>
                    ) : (
                    <>
                    {/* Aviso si hay configuración previa */}
                    {hasPreviousConfig && step === 1 && (
                        <div className={`mb-4 p-3 rounded-xl border-l-4 border-blue-500 text-sm ${isDark ? 'bg-blue-500/10 text-blue-200' : 'bg-blue-50 text-blue-800'}`}>
                            ℹ️ <strong>Editando configuración anterior.</strong> Tus respuestas previas están precargadas. Cambia solo lo que quieras y guarda al final.
                        </div>
                    )}

                    {/* PASO 1: Sector */}
                    {step === 1 && (
                        <div className="space-y-4">
                            <div>
                                <h3 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>¿Qué tipo de negocio es?</h3>
                                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Esto ayuda a Laura a entender cómo atender a tus clientes y pre-rellena los campos sugeridos.</p>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {SECTORS.map(s => (
                                    <button key={s.id}
                                        onClick={() => handleSelectSector(s.id)}
                                        className={`p-4 rounded-xl border-2 text-left transition ${sector === s.id
                                            ? 'border-purple-500 bg-purple-500/10'
                                            : isDark ? 'border-white/10 bg-slate-800/30 hover:border-white/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                        <div className="text-3xl mb-2">{s.icon}</div>
                                        <div className={`text-sm font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{s.label}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* PASO 2: Nombre del negocio */}
                    {step === 2 && (
                        <div className="space-y-4">
                            <div>
                                <h3 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>¿Cómo se llama tu negocio?</h3>
                                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Laura usará este nombre cuando hable con tus clientes.</p>
                            </div>
                            <input
                                type="text"
                                value={businessName}
                                onChange={(e) => setBusinessName(e.target.value)}
                                placeholder="Ej: Taller Pérez, Clínica Dental Smile, Peluquería Marina..."
                                autoFocus
                                className={`w-full px-4 py-3 rounded-lg text-base border-2 focus:outline-none focus:ring-2 ${isDark ? 'bg-slate-800/50 border-white/10 text-white focus:ring-purple-500/40' : 'bg-white border-slate-200 text-slate-900 focus:ring-purple-500/40'}`}
                            />
                            <div className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                Aparecerá en mensajes como: <strong>"Bienvenido a {businessName || '[tu negocio]'}, ¿en qué puedo ayudarle?"</strong>
                            </div>
                        </div>
                    )}

                    {/* PASO 3: Servicios */}
                    {step === 3 && (
                        <div className="space-y-4">
                            <div>
                                <h3 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>¿Qué servicios ofreces?</h3>
                                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Lista los principales servicios. Laura los usará para orientar a los clientes.</p>
                            </div>
                            <textarea
                                value={services}
                                onChange={(e) => setServices(e.target.value)}
                                rows={5}
                                placeholder={SECTOR_SERVICES[sector] || 'Ej: Revisiones, reparaciones, diagnóstico...'}
                                className={`w-full px-4 py-3 rounded-lg text-sm border-2 focus:outline-none focus:ring-2 resize-none ${isDark ? 'bg-slate-800/50 border-white/10 text-white focus:ring-purple-500/40' : 'bg-white border-slate-200 text-slate-900 focus:ring-purple-500/40'}`}
                            />
                            {SECTOR_SERVICES[sector] && services !== SECTOR_SERVICES[sector] && (
                                <button onClick={() => setServices(SECTOR_SERVICES[sector])}
                                    className={`text-xs underline ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                                    Usar plantilla típica del sector
                                </button>
                            )}
                        </div>
                    )}

                    {/* PASO 4: Horario */}
                    {step === 4 && (
                        <div className="space-y-4">
                            <div>
                                <h3 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>¿Cuál es tu horario de atención?</h3>
                                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Si un cliente pregunta cuándo abrís, Laura lo sabrá.</p>
                            </div>
                            <textarea
                                value={hours}
                                onChange={(e) => setHours(e.target.value)}
                                rows={4}
                                placeholder="Ej: Lunes a viernes 09:00-14:00 y 16:00-20:00. Sábados 09:00-13:00."
                                className={`w-full px-4 py-3 rounded-lg text-sm border-2 focus:outline-none focus:ring-2 resize-none ${isDark ? 'bg-slate-800/50 border-white/10 text-white focus:ring-purple-500/40' : 'bg-white border-slate-200 text-slate-900 focus:ring-purple-500/40'}`}
                            />
                        </div>
                    )}

                    {/* PASO 5: Citas */}
                    {step === 5 && (
                        <div className="space-y-4">
                            <div>
                                <h3 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>¿Quieres que Laura reserve citas automáticamente?</h3>
                                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Si activas esta opción, Laura usará tu agenda configurada para reservar huecos.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <button onClick={() => setBooksAppointments(true)}
                                    className={`p-5 rounded-xl border-2 text-left transition ${booksAppointments
                                        ? 'border-green-500 bg-green-500/10'
                                        : isDark ? 'border-white/10 bg-slate-800/30 hover:border-white/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                    <div className="text-2xl mb-2">📅</div>
                                    <div className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Sí, reserva citas</div>
                                    <div className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Laura propondrá huecos disponibles y reservará por el cliente.</div>
                                </button>
                                <button onClick={() => setBooksAppointments(false)}
                                    className={`p-5 rounded-xl border-2 text-left transition ${!booksAppointments
                                        ? 'border-orange-500 bg-orange-500/10'
                                        : isDark ? 'border-white/10 bg-slate-800/30 hover:border-white/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                    <div className="text-2xl mb-2">💬</div>
                                    <div className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>No, solo informa</div>
                                    <div className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Laura responde dudas pero deriva al humano para gestionar citas.</div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* PASO 6: Campos personalizados */}
                    {step === 6 && (
                        <div className="space-y-4">
                            <div>
                                <h3 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>¿Qué datos pedirá Laura antes de reservar?</h3>
                                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Configura hasta 5 campos. Puedes dejar en blanco los que no necesites.
                                    Márcalos como <strong>Obligatorio</strong> si el bot no debe reservar sin ese dato.
                                </p>
                            </div>

                            {/* Botón para restaurar sugerencias del sector */}
                            {sector && SECTOR_FIELD_DEFAULTS[sector] && (
                                <button
                                    onClick={() => setCustomFields(SECTOR_FIELD_DEFAULTS[sector])}
                                    className={`text-xs px-3 py-1.5 rounded-lg border transition ${isDark ? 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}>
                                    ↩ Restaurar sugerencias para {SECTORS.find(s => s.id === sector)?.label}
                                </button>
                            )}

                            {/* Filas de campos */}
                            <div className="space-y-2">
                                {customFields.map((field, i) => (
                                    <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border transition ${isDark ? 'border-white/10 bg-slate-800/30' : 'border-slate-200 bg-slate-50'}`}>
                                        {/* Número */}
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${field.label.trim() ? (isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700') : (isDark ? 'bg-slate-700 text-slate-500' : 'bg-slate-200 text-slate-400')}`}>
                                            {i + 1}
                                        </div>
                                        {/* Input nombre del campo */}
                                        <input
                                            type="text"
                                            value={field.label}
                                            onChange={(e) => updateField(i, { label: e.target.value })}
                                            placeholder={`Campo ${i + 1} (ej: ${['Matrícula', 'Nombre del cliente', 'Motivo', 'Teléfono', 'Notas'][i]})`}
                                            className={`flex-1 px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-2 ${isDark ? 'bg-slate-800 border-white/10 text-white placeholder-slate-500 focus:ring-purple-500/30' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-purple-500/30'}`}
                                        />
                                        {/* Toggle Obligatorio / Opcional */}
                                        <button
                                            onClick={() => updateField(i, { required: !field.required })}
                                            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${field.required
                                                ? 'bg-green-500/15 border-green-500/40 text-green-600 dark:text-green-400'
                                                : isDark ? 'bg-slate-700/50 border-white/10 text-slate-400' : 'bg-white border-slate-200 text-slate-400'}`}>
                                            {field.required ? '✓ Obligatorio' : 'Opcional'}
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Resumen */}
                            {customFields.some(f => f.label.trim()) && (
                                <div className={`p-3 rounded-xl text-xs space-y-1 ${isDark ? 'bg-slate-800/50 text-slate-400' : 'bg-slate-100 text-slate-600'}`}>
                                    <div><strong className={isDark ? 'text-green-400' : 'text-green-700'}>Obligatorios:</strong> {customFields.filter(f => f.label.trim() && f.required).map(f => f.label).join(', ') || '—'}</div>
                                    <div><strong className={isDark ? 'text-slate-300' : 'text-slate-600'}>Opcionales:</strong> {customFields.filter(f => f.label.trim() && !f.required).map(f => f.label).join(', ') || '—'}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* PASO 7: Tono + extra */}
                    {step === 7 && (
                        <div className="space-y-5">
                            <div>
                                <h3 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Últimos detalles</h3>
                                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Tono de Laura e información extra del negocio.</p>
                            </div>
                            <div>
                                <label className={`block text-xs font-bold uppercase mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Tono de Laura</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { v: 'formal',   label: 'Formal',    desc: 'Trato de usted, profesional' },
                                        { v: 'cercano',  label: 'Cercano',   desc: 'Tutea, amigable' },
                                        { v: 'divertido',label: 'Divertido', desc: 'Emojis, desenfadado' }
                                    ].map(t => (
                                        <button key={t.v} onClick={() => setTone(t.v as any)}
                                            className={`p-3 rounded-lg border-2 text-center transition ${tone === t.v
                                                ? 'border-purple-500 bg-purple-500/10'
                                                : isDark ? 'border-white/10 bg-slate-800/30 hover:border-white/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                            <div className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{t.label}</div>
                                            <div className={`text-[10px] mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t.desc}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className={`block text-xs font-bold uppercase mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Información extra (opcional)</label>
                                <textarea
                                    value={extraInfo}
                                    onChange={(e) => setExtraInfo(e.target.value)}
                                    rows={5}
                                    placeholder="Cualquier dato útil: dirección, parking, formas de pago, idiomas, datos importantes..."
                                    className={`w-full px-4 py-3 rounded-lg text-sm border-2 focus:outline-none focus:ring-2 resize-none ${isDark ? 'bg-slate-800/50 border-white/10 text-white focus:ring-purple-500/40' : 'bg-white border-slate-200 text-slate-900 focus:ring-purple-500/40'}`}
                                />
                                <p className={`mt-2 text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                    💡 También puedes subir documentos (PDF, Word, TXT) en la sección "Documentos de Laura" después de guardar.
                                </p>
                            </div>
                            <div className={`p-4 rounded-xl border-l-4 border-green-500 ${isDark ? 'bg-green-500/10 text-green-200' : 'bg-green-50 text-green-800'}`}>
                                <div className="flex items-center gap-2 font-bold text-sm mb-1">
                                    <Sparkles className="w-4 h-4" /> Laura está casi lista
                                </div>
                                <p className="text-xs">Pulsa "Guardar configuración" y empezará a responder a tus clientes adaptada a tu negocio.</p>
                            </div>
                        </div>
                    )}
                    </>
                    )}
                </div>

                {/* Footer */}
                <div className={`px-6 py-4 border-t flex items-center justify-between ${isDark ? 'border-white/10 bg-slate-900/50' : 'border-slate-200 bg-slate-50'}`}>
                    <button
                        onClick={() => step > 1 ? setStep(step - 1) : onClose()}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm ${isDark ? 'bg-white/5 hover:bg-white/10 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}>
                        {step === 1 ? 'Cancelar' : <><ChevronLeft className="w-4 h-4 inline" /> Atrás</>}
                    </button>
                    {step < 7 ? (
                        <button
                            onClick={() => setStep(step + 1)}
                            disabled={!canNext()}
                            className="px-6 py-2 rounded-lg font-semibold text-sm bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-md disabled:opacity-40 disabled:cursor-not-allowed">
                            Siguiente <ChevronRight className="w-4 h-4 inline" />
                        </button>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={saving}
                            className="px-6 py-2 rounded-lg font-semibold text-sm bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-md disabled:opacity-40 flex items-center gap-2">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            {saving ? 'Guardando...' : 'Guardar configuración'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
