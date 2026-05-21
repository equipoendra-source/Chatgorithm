import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info as InfoIcon } from 'lucide-react';
import { useTheme } from './ThemeContext';

// Tipos de toast soportados. Cada uno tiene un color e icono distintos.
type ToastKind = 'success' | 'error' | 'info';

interface ToastEntry {
    id: string;
    kind: ToastKind;
    message: string;
}

interface ToastContextValue {
    showToast: (kind: ToastKind, message: string) => void;
    clearToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Hook para que cualquier componente pueda emitir toasts globales que
// sobreviven al desmontar el componente emisor (típico al cambiar de vista).
export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        // Fallback no-op si alguien usa el hook fuera del Provider.
        // No queremos romper la app si el provider aún no envuelve algo.
        return {
            showToast: () => { /* no-op */ },
            clearToast: () => { /* no-op */ }
        };
    }
    return ctx;
}

// Provider global. Mantén UNA sola instancia en la raíz de la app (App.tsx).
// Los toasts se quedan visibles hasta que el usuario los descarte manualmente
// (no hay auto-dismiss). Máximo 5 toasts en pantalla.
export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastEntry[]>([]);

    const showToast = useCallback((kind: ToastKind, message: string) => {
        if (!message) return;
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setToasts(prev => [{ id, kind, message }, ...prev].slice(0, 5));
    }, []);

    const clearToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ showToast, clearToast }}>
            {children}
            <ToastStack toasts={toasts} clearToast={clearToast} />
        </ToastContext.Provider>
    );
}

function ToastStack({ toasts, clearToast }: { toasts: ToastEntry[]; clearToast: (id: string) => void }) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    if (toasts.length === 0) return null;

    return (
        <div className="fixed safe-toast-top right-4 z-[9990] flex flex-col gap-2 items-end pointer-events-none max-w-[calc(100vw-2rem)]">
            {toasts.map(t => {
                const styles =
                    t.kind === 'success'
                        ? (isDark ? 'bg-green-900/95 text-green-100 border border-green-700' : 'bg-green-100 text-green-800 border border-green-200')
                        : t.kind === 'error'
                            ? (isDark ? 'bg-red-900/95 text-red-100 border border-red-700' : 'bg-red-100 text-red-800 border border-red-200')
                            : (isDark ? 'bg-blue-900/95 text-blue-100 border border-blue-700' : 'bg-blue-100 text-blue-800 border border-blue-200');

                const Icon = t.kind === 'success' ? CheckCircle : t.kind === 'error' ? AlertCircle : InfoIcon;

                return (
                    <div
                        key={t.id}
                        className={`pointer-events-auto rounded-lg shadow-md px-4 py-2 text-xs md:text-sm font-bold flex items-start gap-3 max-w-md animate-in slide-in-from-right ${styles}`}
                        role="status"
                    >
                        <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span className="flex-1 leading-snug">{t.message}</span>
                        <button
                            onClick={() => clearToast(t.id)}
                            className="p-1 -m-1 rounded-full hover:bg-black/10 transition flex-shrink-0"
                            title="Cerrar"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
