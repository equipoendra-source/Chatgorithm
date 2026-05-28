import { Calendar, X, CalendarX2, Smartphone, PackageCheck } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { colorForAccount } from '../utils/accountColors';

export interface AppointmentNotification {
    id: string;                  // único para evitar duplicados (usamos appointmentId + timestamp)
    appointmentId: string;
    dateISO: string;             // ISO de la cita
    clientName: string;
    clientPhone: string;
    agenda?: string;
    humanDate: string;
    // Origen de la acción:
    //  - 'bot'             → la hizo Laura
    //  - 'manual'          → la hizo un trabajador desde el panel
    //  - 'client_whatsapp' → la realizó el propio cliente por WhatsApp
    source: 'bot' | 'manual' | 'client_whatsapp';
    // 'booked' (por defecto) → toast morado "Nueva cita".
    // 'cancelled'           → toast rojo "Cita cancelada".
    // 'delivered'           → toast azul cian "Vehículo entregado" (un compañero
    //                         marcó el estado del cliente desde el calendario).
    kind?: 'booked' | 'cancelled' | 'delivered';
    // Línea de WhatsApp por la que entró/se hizo la reserva. Si hay >1 cuenta
    // activa, el toast lleva el chip con el nombre y un border lateral del
    // color asignado por accountColors. Si solo hay 1 cuenta, no se muestra.
    accountId?: string;
    accountName?: string;
}

interface Props {
    notifications: AppointmentNotification[];
    onOpen: (n: AppointmentNotification) => void;
    onDismiss: (id: string) => void;
}

// Las notificaciones permanecen visibles hasta que el trabajador las descarte
// (X) o pinche para abrir la cita. NO hay auto-dismiss para que nadie se las
// pierda aunque tarde en ver la pantalla.
export function AppointmentToast({ notifications, onOpen, onDismiss }: Props) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    if (notifications.length === 0) return null;

    return (
        <div className="fixed safe-toast-top right-4 z-[9999] flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] sm:w-96 pointer-events-none">
            {notifications.map(n => {
                const isCancelled = n.kind === 'cancelled';
                const isDelivered = n.kind === 'delivered';
                // Etiqueta del origen — "Laura" para el bot, "Cliente" para WhatsApp del propio cliente.
                // Sin etiqueta cuando lo hace un trabajador (source='manual').
                const sourceTag = n.source === 'bot' ? 'Laura' : n.source === 'client_whatsapp' ? 'Cliente' : '';

                // Paleta por tipo: ámbar (booked) · rojo (cancelled) · verde esmeralda (delivered).
                // Coherente con el Historial de citas: nueva cita = amarillo (llama
                // la atención por ser la acción más frecuente), entregado = verde
                // (cerrado positivo), cancelada = rojo (cerrado negativo).
                const cardClasses = isCancelled
                    ? (isDark
                        ? 'bg-slate-900/95 border-rose-500/40 shadow-rose-500/20'
                        : 'bg-white border-rose-200 shadow-rose-200/40')
                    : isDelivered
                        ? (isDark
                            ? 'bg-slate-900/95 border-emerald-500/40 shadow-emerald-500/20'
                            : 'bg-white border-emerald-200 shadow-emerald-200/40')
                        : (isDark
                            ? 'bg-slate-900/95 border-amber-500/40 shadow-amber-500/20'
                            : 'bg-white border-amber-200 shadow-amber-200/40');
                const iconWrapClasses = isCancelled
                    ? (isDark ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-100 text-rose-700')
                    : isDelivered
                        ? (isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700')
                        : (isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700');
                const titleClasses = isCancelled
                    ? (isDark ? 'text-rose-200' : 'text-rose-900')
                    : isDelivered
                        ? (isDark ? 'text-emerald-200' : 'text-emerald-900')
                        : (isDark ? 'text-amber-200' : 'text-amber-900');
                const tagClasses = isCancelled
                    ? (isDark ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-100 text-rose-700')
                    : isDelivered
                        ? (isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-700')
                        : (isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-100 text-amber-700');

                // Color de la cuenta (línea de WhatsApp) si se conoce.
                const acc = n.accountId ? colorForAccount(n.accountId) : null;

                return (
                    <div
                        key={n.id}
                        onClick={() => onOpen(n)}
                        // Border-left con el color de la línea cuando viene
                        // identificada. Se ve bien al lado del border morado/rosado
                        // del toast sin parecer doble.
                        style={acc ? { borderLeftColor: acc.hex, borderLeftWidth: '5px', borderLeftStyle: 'solid' } : undefined}
                        className={`pointer-events-auto cursor-pointer rounded-2xl shadow-2xl border backdrop-blur-md p-4 flex items-start gap-3 animate-slide-in-right transition-all hover:scale-[1.02] active:scale-[0.98] ${cardClasses}`}
                        title={isCancelled || isDelivered ? 'Pinchar para ver el día en el calendario' : 'Pinchar para ver la cita en el calendario'}
                    >
                        <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${iconWrapClasses}`}>
                            {isCancelled ? <CalendarX2 className="w-5 h-5" /> : isDelivered ? <PackageCheck className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className={`text-sm font-bold flex items-center gap-2 flex-wrap ${titleClasses}`}>
                                {isCancelled ? 'Cita cancelada' : isDelivered ? 'Vehículo entregado' : 'Nueva cita'}
                                {sourceTag && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tagClasses}`}>
                                        {sourceTag}
                                    </span>
                                )}
                                {n.accountName && acc && (
                                    <span
                                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 border ${isDark ? `${acc.bgDark} ${acc.textDark} ${acc.borderDark}` : `${acc.bg} ${acc.text} ${acc.border}`}`}
                                        title={`Línea: ${n.accountName}`}
                                    >
                                        <Smartphone size={9} /> {n.accountName}
                                    </span>
                                )}
                            </div>
                            <div className={`text-sm font-medium mt-0.5 truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                                {n.clientName}
                            </div>
                            <div className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                {n.humanDate}{n.agenda ? ` · ${n.agenda}` : ''}
                            </div>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
                            className={`flex-shrink-0 p-1 rounded-lg transition-colors ${
                                isDark ? 'text-slate-500 hover:text-slate-300 hover:bg-white/5' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                            }`}
                            title="Descartar"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
