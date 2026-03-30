import { driver } from "driver.js";
import "driver.js/dist/driver.css";

// Tour configuration
const tourConfig = {
    showProgress: true,
    animate: true,
    allowClose: false,
    disableActiveInteraction: true,
    stagePadding: 0,
    doneBtnText: '¡Entendido!',
    nextBtnText: 'Siguiente',
    prevBtnText: 'Atrás',
    progressText: '{{current}} de {{total}}',
    popoverClass: 'driverjs-theme',
};

// ============================================
// MAIN SIDEBAR TOUR (First time experience)
// ============================================
export const startProductTour = (onComplete?: () => void) => {
    const driverObj = driver({
        ...tourConfig,
        doneBtnText: '¡Comenzar!',
        onDestroyed: () => {
            if (onComplete) onComplete();
        },
        steps: [
            {
                element: '#tour-company-info',
                popover: {
                    title: 'Tu Espacio de Trabajo',
                    description: 'Aquí ves la empresa en la que estás conectado actualmente. Todas tus comunicaciones se centralizan aquí.'
                }
            },
            {
                element: '#tour-line-selector',
                popover: {
                    title: 'Cambia de Canal',
                    description: 'Usa este menú para cambiar entre diferentes líneas de WhatsApp o entrar al Chat de Equipo interno.'
                }
            },
            {
                element: '#tour-filters',
                popover: {
                    title: 'Filtros Potentes',
                    description: 'Encuentra rápidamente chats por departamento, estado o etiquetas. ¡Organiza tu bandeja de entrada!'
                }
            },
            {
                element: '#tour-chat-list',
                popover: {
                    title: 'Bandeja de Entrada',
                    description: 'Tus chats activos aparecen aquí. Los nuevos leads y mensajes urgentes se resaltarán automáticamente.'
                }
            },
            {
                element: '#tour-user-profile',
                popover: {
                    title: 'Tu Perfil',
                    description: 'Gestiona tu estado de disponibilidad y ve tu usuario actual.'
                }
            },
            {
                element: '#tour-settings-btn',
                popover: {
                    title: 'Ajustes',
                    description: 'Configura tus notificaciones, atajos rápidos y preferencias personales aquí.'
                }
            },
            {
                element: '#tour-calendar-btn',
                popover: {
                    title: 'Agenda Integrada',
                    description: 'Accede al calendario para gestionar citas y recordatorios sin salir de la app.'
                }
            }
        ]
    });

    driverObj.drive();
};

// ============================================
// CHAT WINDOW TOUR (When entering a chat)
// ============================================
export const startChatTour = (onComplete?: () => void) => {
    const driverObj = driver({
        ...tourConfig,
        onDestroyed: () => {
            if (onComplete) onComplete();
        },
        steps: [
            {
                element: '#chat-header-name',
                popover: {
                    title: 'Información del Contacto',
                    description: 'Haz clic aquí para editar el nombre del cliente. Los cambios se guardan automáticamente.'
                }
            },
            ...(document.querySelector('#chat-assign-btn') ? [{
                element: '#chat-assign-btn',
                popover: {
                    title: 'Asignar Chat',
                    description: 'Asigna este chat a ti mismo o a otro agente. Puedes también derivarlo a un departamento específico.'
                }
            }] : []),
            {
                element: '#chat-status-select',
                popover: {
                    title: 'Estado del Chat',
                    description: 'Cambia el estado: Nuevo, Abierto, Cerrado... Esto ayuda a organizar tus conversaciones.'
                }
            },
            {
                element: '#chat-tags-btn',
                popover: {
                    title: 'Etiquetas',
                    description: 'Añade etiquetas para categorizar y filtrar tus chats más fácilmente.'
                }
            },
            {
                element: '#chat-search-btn',
                popover: {
                    title: 'Buscar en Chat',
                    description: 'Busca mensajes específicos dentro de esta conversación.'
                }
            },
            {
                element: '#chat-info-btn',
                popover: {
                    title: 'Panel de Detalles',
                    description: 'Accede a información adicional del cliente: email, dirección, notas privadas...'
                }
            },
            {
                element: '#chat-messages-area',
                popover: {
                    title: 'Área de Mensajes',
                    description: 'Aquí aparecen todos los mensajes. Puedes arrastrar archivos directamente para enviarlos.'
                }
            },
            {
                element: '#chat-attach-btn',
                popover: {
                    title: 'Adjuntar Archivos',
                    description: 'Envía imágenes, documentos o cualquier archivo (máx. 25MB).'
                }
            },
            {
                element: '#chat-templates-btn',
                popover: {
                    title: 'Plantillas WhatsApp',
                    description: 'Usa plantillas pre-aprobadas para iniciar conversaciones o enviar mensajes formales.'
                }
            },
            {
                element: '#chat-quick-replies-btn',
                popover: {
                    title: 'Respuestas Rápidas',
                    description: 'Accede a tus atajos de texto guardados. También puedes escribir el atajo directamente.'
                }
            },
            {
                element: '#chat-ai-btn',
                popover: {
                    title: 'Asistente IA',
                    description: 'Activa el modo automático para que la IA responda por ti. Útil cuando estás ocupado.'
                }
            },
            {
                element: '#chat-note-btn',
                popover: {
                    title: 'Notas Internas',
                    description: 'Escribe notas que solo verán los agentes. El cliente no recibe estos mensajes.'
                }
            },
            {
                element: '#chat-input',
                popover: {
                    title: 'Escribe tu Mensaje',
                    description: 'Escribe aquí y pulsa Enter o el botón de enviar. Sin texto, el botón graba audio.'
                }
            }
        ]
    });

    driverObj.drive();
};

// ============================================
// WORKER SETTINGS TOUR
// ============================================
export const startWorkerSettingsTour = (onComplete?: () => void) => {
    const driverObj = driver({
        ...tourConfig,
        onDestroyed: () => {
            if (onComplete) onComplete();
        },
        steps: [
            {
                element: '#settings-notifications-tab',
                popover: {
                    title: 'Notificaciones',
                    description: 'Configura qué notificaciones quieres recibir. Puedes filtrar por departamentos y tipo de mensajes.'
                }
            },
            {
                element: '#settings-appearance-tab',
                popover: {
                    title: 'Apariencia',
                    description: 'Cambia entre modo claro y oscuro según tu preferencia. ¡Elige el que más te guste!'
                }
            }
        ]
    });

    driverObj.drive();
};

// ============================================
// ADMIN SETTINGS TOUR (Full settings)
// ============================================
export const startAdminSettingsTour = (onComplete?: () => void) => {
    const driverObj = driver({
        ...tourConfig,
        onDestroyed: () => {
            if (onComplete) onComplete();
        },
        steps: [
            {
                element: '#settings-agents-tab',
                popover: {
                    title: 'Gestión de Agentes',
                    description: 'Como administrador, puedes crear, editar y eliminar usuarios del sistema.'
                }
            },
            ...(document.querySelector('#settings-agents-list') ? [{
                element: '#settings-agents-list',
                popover: {
                    title: 'Lista de Agentes',
                    description: 'Todos los agentes de tu empresa aparecen aquí. Haz clic para editar sus permisos.'
                }
            }] : []),
            ...(document.querySelector('#settings-add-agent-btn') ? [{
                element: '#settings-add-agent-btn',
                popover: {
                    title: 'Añadir Agente',
                    description: 'Crea nuevos usuarios con nombre, contraseña y rol (Agente o Admin).'
                }
            }] : []),
            {
                element: '#settings-config-tab',
                popover: {
                    title: 'Configuración General',
                    description: 'Gestiona departamentos, estados y etiquetas personalizadas para tu empresa.'
                }
            },
            ...(document.querySelector('#settings-departments-list') ? [{
                element: '#settings-departments-list',
                popover: {
                    title: 'Departamentos',
                    description: 'Define los departamentos de tu empresa. Los chats se pueden asignar a departamentos.'
                }
            }] : []),
            ...(document.querySelector('#settings-statuses-list') ? [{
                element: '#settings-statuses-list',
                popover: {
                    title: 'Estados',
                    description: 'Personaliza los estados de los chats: Nuevo, Abierto, Cerrado, o los que necesites.'
                }
            }] : []),
            ...(document.querySelector('#settings-tags-list') ? [{
                element: '#settings-tags-list',
                popover: {
                    title: 'Etiquetas',
                    description: 'Crea etiquetas para clasificar chats: VIP, Urgente, Seguimiento...'
                }
            }] : []),
            {
                element: '#settings-whatsapp-tab',
                popover: {
                    title: 'Cuentas WhatsApp',
                    description: 'Conecta y gestiona múltiples líneas de WhatsApp Business.'
                }
            },
            {
                element: '#settings-chatbot-tab',
                popover: {
                    title: 'Configuración IA',
                    description: 'Configura el prompt del chatbot, horarios de respuesta automática y comportamiento.'
                }
            },
            ...(document.querySelector('#settings-chatbot-prompt') ? [{
                element: '#settings-chatbot-prompt',
                popover: {
                    title: 'Prompt del Chatbot',
                    description: 'Define la personalidad y conocimientos de tu asistente IA. Sé específico sobre tu negocio.'
                }
            }] : []),
            ...(document.querySelector('#settings-chatbot-schedule') ? [{
                element: '#settings-chatbot-schedule',
                popover: {
                    title: 'Horario Automático',
                    description: 'Configura cuándo el chatbot responde automáticamente (fuera de horario laboral, etc.).'
                }
            }] : []),
            {
                element: '#settings-analytics-tab',
                popover: {
                    title: 'Analíticas',
                    description: 'Visualiza estadísticas de uso, rendimiento de agentes y métricas importantes.'
                }
            },
            {
                element: '#settings-calendar-tab',
                popover: {
                    title: 'Calendario',
                    description: 'Gestiona citas y eventos de tu equipo. Integrado con el chatbot para reservas.'
                }
            },
            {
                element: '#settings-import-tab',
                popover: {
                    title: 'Importar Contactos',
                    description: 'Importa contactos masivamente desde archivos CSV.'
                }
            },
            // Worker settings (Admin also has access)
            {
                element: '#settings-quick-replies-tab',
                popover: {
                    title: 'Respuestas Rápidas',
                    description: 'Crea atajos de texto compartidos para todo el equipo.'
                }
            },
            {
                element: '#settings-appearance-tab',
                popover: {
                    title: 'Apariencia',
                    description: 'Personaliza el tema visual de la aplicación.'
                }
            }
        ]
    });

    driverObj.drive();
};

// ============================================
// HELPER: Check if tour should be shown
// ============================================
export const shouldShowTour = (tourKey: string): boolean => {
    return localStorage.getItem(`chatgorithm_tour_${tourKey}`) !== 'true';
};

export const markTourAsComplete = (tourKey: string): void => {
    localStorage.setItem(`chatgorithm_tour_${tourKey}`, 'true');
};

export const resetAllTours = (): void => {
    const tourKeys = ['main', 'chat', 'settings_worker', 'settings_admin'];
    tourKeys.forEach(key => {
        localStorage.removeItem(`chatgorithm_tour_${key}`);
    });
    localStorage.removeItem('chatgorithm_tour_seen');
};

