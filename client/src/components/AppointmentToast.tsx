import { Calendar, X, CalendarX2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export interface AppointmentNotification {
    id: string;                  // único para evitar duplicados (usamos appointmentId + timestamp)
    appointmentId: string;
    dateISO: string;             // ISO de la cita
    clientName: string;
    clientPhone: string;
    agenda?: string;
    humanDate: string;
    source: 'bot' | 'manual' | 'client_whatsapp';
    // 'booked' (por defecto) → toast morado "Nueva cita".
    // 'cancelled' → toast rojo "Cita cancelada".
    kind?: 'booked' | 'cancelled';
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
                // Etiqueta del origen — "Laura" para el bot, "Cliente" para WhatsApp del propio cliente.
                // Sin etiqueta cuando lo hace un trabajador (source='manual').
                const sourceTag = n.source === 'bot' ? 'Laura' : n.source === 'client_whatsapp' ? 'Cliente' : '';

                // Paleta: morado para reservas, rojo/rosa para cancelaciones.
                const cardClasses = isCancelled
                    ? (isDark
                        ? 'bg-slate-900/95 border-rose-500/40 shadow-rose-500/20'
                        : 'bg-white border-rose-200 shadow-rose-200/40')
                    : (isDark
                        ? 'bg-slate-900/95 border-purple-500/40 shadow-purple-500/20'
                        : 'bg-white border-purple-200 shadow-purple-200/40');
                const iconWrapClasses = isCancelled
                    ? (isDark ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-100 text-rose-700')
                    : (isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700');
                const titleClasses = isCancelled
                    ? (isDark ? 'text-rose-200' : 'text-rose-900')
                    : (isDark ? 'text-purple-200' : 'text-purple-900');
                const tagClasses = isCancelled
                    ? (isDark ? 'bg-rose-500/20 text-rose-300' : 'bg-rose-100 text-rose-700')
                    : (isDark ? 'bg-indigo-500/20 text-indigo-300' : 'bg-indigo-100 text-indigo-700');

                return (
                    <div
                        key={n.id}
                        onClick={() => onOpen(n)}
                        className={`pointer-events-auto cursor-pointer rounded-2xl shadow-2xl border backdrop-blur-md p-4 flex items-start gap-3 animate-slide-in-right transition-all hover:scale-[1.02] active:scale-[0.98] ${cardClasses}`}
                        title="Pinchar para ver el día en el calendario"
                    >
                        <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${iconWrapClasses}`}>
                            {isCancelled ? <CalendarX2 className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className={`text-sm font-bold flex items-center gap-2 ${titleClasses}`}>
                                {isCancelled ? 'Cita cancelada' : 'Nueva cita'}
                                {sourceTag && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${tagClasses}`}>
                                        {sourceTag}
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
