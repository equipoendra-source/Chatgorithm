import { useState } from 'react';
import {
    HelpCircle, X, MessageCircle, Phone, Mail, ExternalLink,
    ChevronRight, Headphones, Copy, Check
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

// Configuración de contacto de soporte - Adgorithm
const SUPPORT_CONFIG = {
    whatsapp: {
        enabled: true,
        number: '34711246279', // Número de WhatsApp de soporte (sin + ni espacios)
        message: 'Hola, necesito ayuda con la aplicación Chatgorithm'
    },
    phone: {
        enabled: true,
        number: '+34 711 246 279', // Número formateado para mostrar
        callNumber: 'tel:+34711246279' // Número para marcar
    },
    email: {
        enabled: true,
        address: 'info@adgorithm.es',
        subject: 'Solicitud de Soporte - Chatgorithm'
    },
    docs: {
        enabled: false, // Deshabilitado hasta tener URL definida
        url: '' // URL de documentación (pendiente)
    },
    schedule: 'Lunes a Viernes, 9:00 - 18:00'
};

export function SupportWidget() {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [isOpen, setIsOpen] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);

    // Detectar si es móvil
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

    const handleWhatsApp = () => {
        const url = `https://wa.me/${SUPPORT_CONFIG.whatsapp.number}?text=${encodeURIComponent(SUPPORT_CONFIG.whatsapp.message)}`;
        window.open(url, '_blank');
    };

    const handlePhone = () => {
        if (isMobile) {
            // En móvil, usar tel: directamente
            window.location.href = SUPPORT_CONFIG.phone.callNumber;
        } else {
            // En escritorio, copiar al portapapeles
            navigator.clipboard.writeText('+34711246279');
            setCopied('phone');
            setTimeout(() => setCopied(null), 2000);
        }
    };

    const handleEmail = () => {
        if (isMobile) {
            // En móvil, abrir cliente de correo
            const subject = encodeURIComponent(SUPPORT_CONFIG.email.subject);
            window.location.href = `mailto:${SUPPORT_CONFIG.email.address}?subject=${subject}`;
        } else {
            // En escritorio, copiar al portapapeles
            navigator.clipboard.writeText(SUPPORT_CONFIG.email.address);
            setCopied('email');
            setTimeout(() => setCopied(null), 2000);
        }
    };

    const handleDocs = () => {
        window.open(SUPPORT_CONFIG.docs.url, '_blank');
    };

    return (
        <>
            {/* Botón flotante - posición ajustada para no tapar botones */}
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-16 right-4 z-40 bg-gradient-to-br from-blue-600 to-indigo-600 text-white p-3 rounded-full shadow-lg shadow-blue-200 hover:shadow-xl hover:scale-110 transition-all duration-300 group md:bottom-6 md:right-6 md:p-4"
                title="¿Necesitas ayuda?"
            >
                <Headphones className="w-5 h-5 md:w-6 md:h-6 group-hover:animate-pulse" />

                {/* Indicador de ayuda */}
                <span className="absolute -top-1 -right-1 flex h-3 w-3 md:h-4 md:w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 md:h-4 md:w-4 bg-green-500 border-2 border-white"></span>
                </span>
            </button>

            {/* Modal de soporte */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
                    <div className={`w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>

                        {/* Header */}
                        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
                            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2"></div>

                            <button
                                onClick={() => setIsOpen(false)}
                                className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-full transition"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="relative z-10">
                                <div className="bg-white/20 p-3 rounded-2xl w-fit mb-4">
                                    <Headphones className="w-8 h-8" />
                                </div>
                                <h2 className="text-2xl font-bold mb-1">¿Necesitas ayuda?</h2>
                                <p className="text-blue-100 text-sm">Estamos aquí para ayudarte</p>
                            </div>
                        </div>

                        {/* Opciones de contacto */}
                        <div className="p-6 space-y-3">

                            {/* WhatsApp */}
                            {SUPPORT_CONFIG.whatsapp.enabled && (
                                <button
                                    onClick={handleWhatsApp}
                                    className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all group active:scale-[0.98] ${isDark
                                            ? 'bg-green-900/20 border border-green-800 hover:bg-green-900/30'
                                            : 'bg-green-50 hover:bg-green-100 border border-green-200'
                                        }`}
                                >
                                    <div className="bg-green-500 p-3 rounded-xl text-white shadow-lg shadow-green-200">
                                        <MessageCircle className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className={`font-bold ${isDark ? 'text-green-400' : 'text-green-800'}`}>WhatsApp</p>
                                        <p className={`text-xs ${isDark ? 'text-green-300/70' : 'text-green-600'}`}>Respuesta rápida por chat</p>
                                    </div>
                                    <ChevronRight className={`w-5 h-5 group-hover:translate-x-1 transition-transform ${isDark ? 'text-green-700' : 'text-green-400'}`} />
                                </button>
                            )}

                            {/* Teléfono */}
                            {SUPPORT_CONFIG.phone.enabled && (
                                <button
                                    onClick={handlePhone}
                                    className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all group active:scale-[0.98] ${isDark
                                            ? 'bg-purple-900/20 border border-purple-800 hover:bg-purple-900/30'
                                            : 'bg-purple-50 hover:bg-purple-100 border border-purple-200'
                                        }`}
                                >
                                    <div className="bg-purple-500 p-3 rounded-xl text-white shadow-lg shadow-purple-200">
                                        <Phone className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className={`font-bold ${isDark ? 'text-purple-400' : 'text-purple-800'}`}>{copied === 'phone' ? '¡Copiado!' : (isMobile ? 'Llamar' : 'Copiar teléfono')}</p>
                                        <p className={`text-xs ${isDark ? 'text-purple-300/70' : 'text-purple-600'}`}>{SUPPORT_CONFIG.phone.number}</p>
                                    </div>
                                    {copied === 'phone' ? <Check className="w-5 h-5 text-green-500" /> : (isMobile ? <ChevronRight className={`w-5 h-5 group-hover:translate-x-1 transition-transform ${isDark ? 'text-purple-700' : 'text-purple-400'}`} /> : <Copy className={`w-5 h-5 ${isDark ? 'text-purple-700' : 'text-purple-400'}`} />)}
                                </button>
                            )}

                            {/* Email */}
                            {SUPPORT_CONFIG.email.enabled && (
                                <button
                                    onClick={handleEmail}
                                    className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all group active:scale-[0.98] ${isDark
                                            ? 'bg-orange-900/20 border border-orange-800 hover:bg-orange-900/30'
                                            : 'bg-orange-50 hover:bg-orange-100 border border-orange-200'
                                        }`}
                                >
                                    <div className="bg-orange-500 p-3 rounded-xl text-white shadow-lg shadow-orange-200">
                                        <Mail className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className={`font-bold ${isDark ? 'text-orange-400' : 'text-orange-800'}`}>{copied === 'email' ? '¡Copiado!' : (isMobile ? 'Email' : 'Copiar email')}</p>
                                        <p className={`text-xs ${isDark ? 'text-orange-300/70' : 'text-orange-600'}`}>{SUPPORT_CONFIG.email.address}</p>
                                    </div>
                                    {copied === 'email' ? <Check className="w-5 h-5 text-green-500" /> : (isMobile ? <ChevronRight className={`w-5 h-5 group-hover:translate-x-1 transition-transform ${isDark ? 'text-orange-700' : 'text-orange-400'}`} /> : <Copy className={`w-5 h-5 ${isDark ? 'text-orange-700' : 'text-orange-400'}`} />)}
                                </button>
                            )}

                            {/* Documentación */}
                            {SUPPORT_CONFIG.docs.enabled && (
                                <button
                                    onClick={handleDocs}
                                    className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all group active:scale-[0.98] ${isDark
                                            ? 'bg-slate-700 border border-slate-600 hover:bg-slate-600'
                                            : 'bg-slate-50 hover:bg-slate-100 border border-slate-200'
                                        }`}
                                >
                                    <div className="bg-slate-600 p-3 rounded-xl text-white shadow-lg shadow-slate-200">
                                        <ExternalLink className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Documentación</p>
                                        <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Guías y tutoriales</p>
                                    </div>
                                    <ChevronRight className={`w-5 h-5 group-hover:translate-x-1 transition-transform ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                                </button>
                            )}
                        </div>

                        {/* Footer con horario */}
                        <div className="px-6 pb-6">
                            <div className={`rounded-xl p-4 border ${isDark ? 'bg-blue-900/20 border-blue-800' : 'bg-blue-50 border-blue-100'}`}>
                                <p className={`text-xs font-medium text-center ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                                    🕐 Horario de atención: {SUPPORT_CONFIG.schedule}
                                </p>
                            </div>
                        </div>

                        {/* Safe area para móviles */}
                        <div className="h-safe sm:hidden"></div>
                    </div>
                </div>
            )}
        </>
    );
}
