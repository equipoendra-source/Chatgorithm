import { useState } from 'react';
import {
    Bot, ChevronLeft, ChevronRight, Loader2, CheckCircle2, X,
    Wrench, Sparkles
} from 'lucide-react';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';

interface Props {
    onClose: () => void;
    onSaved: (newPrompt: string) => void;
}

// Sectores predefinidos con datos típicos por defecto para acelerar al cliente
const SECTORS = [
    {
        id: 'taller',
        icon: '🚗',
        label: 'Taller / Concesionario',
        defaultData: ['Nombre del cliente', 'Matrícula', 'Marca del vehículo', 'Modelo del vehículo'],
        defaultServices: 'Cambio de aceite, ITV, mecánica general, electricidad, neumáticos, revisión preventiva.'
    },
    {
        id: 'clinica_dental',
        icon: '🦷',
        label: 'Clínica dental',
        defaultData: ['Nombre del paciente', 'Teléfono de contacto', 'Motivo de la visita'],
        defaultServices: 'Limpieza dental, ortodoncia, implantes, blanqueamiento, endodoncia, urgencias.'
    },
    {
        id: 'peluqueria',
        icon: '💅',
        label: 'Peluquería / Estética',
        defaultData: ['Nombre del cliente', 'Servicio deseado'],
        defaultServices: 'Corte, color, mechas, tratamientos capilares, peinados de evento, manicura, pedicura.'
    },
    {
        id: 'clinica_medica',
        icon: '🩺',
        label: 'Clínica médica / Fisioterapia',
        defaultData: ['Nombre del paciente', 'Especialidad o motivo', 'Mutua/seguro (si aplica)'],
        defaultServices: 'Fisioterapia, traumatología, medicina general, rehabilitación, masajes terapéuticos.'
    },
    {
        id: 'gestoria',
        icon: '⚖️',
        label: 'Gestoría / Asesoría',
        defaultData: ['Nombre completo', 'Tipo de gestión (autónomo, sociedad, particular)', 'NIF/CIF'],
        defaultServices: 'Declaración de la renta, alta de autónomos, contabilidad, asesoría laboral, fiscal.'
    },
    {
        id: 'inmobiliaria',
        icon: '🏠',
        label: 'Inmobiliaria',
        defaultData: ['Nombre del cliente', 'Tipo de propiedad', 'Zona de interés', 'Presupuesto orientativo'],
        defaultServices: 'Venta de pisos, alquileres, tasaciones, gestión integral de la propiedad.'
    },
    {
        id: 'academia',
        icon: '🎓',
        label: 'Academia / Formación',
        defaultData: ['Nombre del alumno', 'Curso de interés', 'Edad o nivel'],
        defaultServices: 'Clases de inglés, refuerzo escolar, oposiciones, cursos online, formación a empresas.'
    },
    {
        id: 'veterinario',
        icon: '🐶',
        label: 'Veterinario',
        defaultData: ['Nombre del propietario', 'Nombre de la mascota', 'Especie/raza', 'Motivo de la visita'],
        defaultServices: 'Vacunación, revisiones, cirugía, peluquería canina, hospitalización, urgencias 24h.'
    },
    {
        id: 'otro',
        icon: '✏️',
        label: 'Otro / Personalizado',
        defaultData: ['Nombre del cliente', 'Motivo de contacto'],
        defaultServices: ''
    }
];

const COMMON_DATA_OPTIONS = [
    'Nombre del cliente',
    'Teléfono de contacto',
    'Email',
    'DNI/NIF',
    'Dirección',
    'Matrícula',
    'Marca del vehículo',
    'Modelo del vehículo',
    'Nombre del paciente',
    'Nombre de la mascota',
    'Especie/raza',
    'Motivo de la visita',
    'Tipo de servicio',
    'Mutua/seguro',
    'Fecha de nacimiento',
    'Presupuesto orientativo',
    'Zona de interés',
];

export default function BotConfigWizard({ onClose, onSaved }: Props) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);

    // Estado del formulario
    const [sector, setSector] = useState<string>('');
    const [businessName, setBusinessName] = useState('');
    const [services, setServices] = useState('');
    const [hours, setHours] = useState('Lunes a viernes 09:00-14:00 y 16:00-20:00. Sábados 09:00-13:00. Domingos cerrado.');
    const [booksAppointments, setBooksAppointments] = useState(true);
    const [dataToCollect, setDataToCollect] = useState<string[]>([]);
    const [tone, setTone] = useState<'formal' | 'cercano' | 'divertido'>('formal');
    const [extraInfo, setExtraInfo] = useState('');

    const selectedSector = SECTORS.find(s => s.id === sector);

    // Auto-rellenar datos típicos al elegir sector
    const handleSelectSector = (s: typeof SECTORS[number]) => {
        setSector(s.id);
        if (dataToCollect.length === 0) setDataToCollect(s.defaultData);
        if (!services && s.defaultServices) setServices(s.defaultServices);
    };

    const toggleDataItem = (item: string) => {
        if (dataToCollect.includes(item)) setDataToCollect(dataToCollect.filter(d => d !== item));
        else setDataToCollect([...dataToCollect, item]);
    };

    const canNext = (): boolean => {
        if (step === 1) return !!sector;
        if (step === 2) return businessName.trim().length > 1;
        if (step === 3) return services.trim().length > 5;
        if (step === 4) return hours.trim().length > 1;
        if (step === 5) return true;
        if (step === 6) return true;
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
                    sector, businessName: businessName.trim(), services: services.trim(),
                    hours: hours.trim(), booksAppointments, dataToCollect, tone, extraInfo: extraInfo.trim()
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
                    {/* PASO 1: Sector */}
                    {step === 1 && (
                        <div className="space-y-4">
                            <div>
                                <h3 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>¿Qué tipo de negocio es?</h3>
                                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Esto ayuda a Laura a entender cómo atender a tus clientes.</p>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {SECTORS.map(s => (
                                    <button key={s.id}
                                        onClick={() => handleSelectSector(s)}
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
                                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Lista los principales servicios que vendes. Laura los usará para orientar a los clientes.</p>
                            </div>
                            <textarea
                                value={services}
                                onChange={(e) => setServices(e.target.value)}
                                rows={5}
                                placeholder={selectedSector?.defaultServices || 'Ej: Limpieza dental, ortodoncia, implantes...'}
                                className={`w-full px-4 py-3 rounded-lg text-sm border-2 focus:outline-none focus:ring-2 resize-none ${isDark ? 'bg-slate-800/50 border-white/10 text-white focus:ring-purple-500/40' : 'bg-white border-slate-200 text-slate-900 focus:ring-purple-500/40'}`}
                            />
                            {selectedSector?.defaultServices && services !== selectedSector.defaultServices && (
                                <button onClick={() => setServices(selectedSector.defaultServices)}
                                    className={`text-xs underline ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                                    Usar plantilla típica para {selectedSector.label}
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

                    {/* PASO 6: Datos a recopilar */}
                    {step === 6 && (
                        <div className="space-y-4">
                            <div>
                                <h3 className={`text-xl font-bold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>¿Qué datos pides al cliente?</h3>
                                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Selecciona los datos que Laura debe pedir antes de cerrar una conversación.</p>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {COMMON_DATA_OPTIONS.map(opt => {
                                    const sel = dataToCollect.includes(opt);
                                    return (
                                        <button key={opt} onClick={() => toggleDataItem(opt)}
                                            className={`p-2.5 rounded-lg text-xs text-left transition border ${sel
                                                ? 'bg-purple-500 text-white border-purple-500'
                                                : isDark ? 'bg-slate-800/30 border-white/10 text-slate-300 hover:border-white/20' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'}`}>
                                            {sel && '✓ '}{opt}
                                        </button>
                                    );
                                })}
                            </div>
                            {dataToCollect.length > 0 && (
                                <div className={`p-3 rounded-lg text-xs ${isDark ? 'bg-purple-500/10 text-purple-300' : 'bg-purple-50 text-purple-800'}`}>
                                    Laura pedirá: <strong>{dataToCollect.join(', ')}</strong>
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
                                        { v: 'formal', label: 'Formal', desc: 'Trato de usted, profesional' },
                                        { v: 'cercano', label: 'Cercano', desc: 'Tutea, amigable' },
                                        { v: 'divertido', label: 'Divertido', desc: 'Emojis, desenfadado' }
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
