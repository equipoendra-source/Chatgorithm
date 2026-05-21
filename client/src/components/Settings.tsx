import { useState, useEffect, useRef } from 'react';
import {
    User, Plus, Briefcase, ArrowLeft, Trash2, ShieldAlert, CheckCircle,
    LayoutList, RefreshCw, Pencil, X, MessageSquare, Tag, Zap, BarChart3,
    Calendar, Bot, Save, Bell, UserPlus, Database, Upload, Clock, Palette, Sun, Moon, Lock,
    ChevronDown, ChevronUp, ChevronRight, Wrench, RotateCcw
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

// @ts-ignore
import WhatsAppTemplatesManager from './WhatsAppTemplatesManager';
import ContactImportWizard from './ContactImportWizard';
import BotConfigWizard from './BotConfigWizard';
import BotKnowledgeManager from './BotKnowledgeManager';
// @ts-ignore
import AnalyticsDashboard from './AnalyticsDashboard';
// @ts-ignore
import CalendarDashboard from './CalendarDashboard';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';
import { shouldShowTour, markTourAsComplete, startWorkerSettingsTour, startAdminSettingsTour } from './ProductTour';
import { NotificationDiagnostic } from './NotificationDiagnostic';

interface SettingsProps {
    onBack: () => void;
    socket: any;
    currentUserRole: string;
    quickReplies?: any[];
    currentUser?: any;
    updateMyPreferences?: (partial: any) => void;
}

interface Agent { id: string; name: string; role: string; preferences?: any; }
interface ConfigItem { id: string; name: string; type: string; }
interface QuickReply { id: string; title: string; content: string; shortcut: string; }

export function Settings({ onBack, socket, currentUserRole, quickReplies = [], currentUser, updateMyPreferences }: SettingsProps) {
    const { theme, setTheme } = useTheme();
    const isDark = theme === 'dark';
    const isAdmin = currentUserRole === 'Admin';

    // Non-admins default to notifications tab
    const [activeTab, setActiveTab] = useState<'team' | 'config' | 'whatsapp' | 'quick_replies' | 'analytics' | 'agenda' | 'bot_config' | 'notifications' | 'data' | 'appearance'>(isAdmin ? 'analytics' : 'notifications');

    // Estados de Datos
    const [agents, setAgents] = useState<Agent[]>([]);
    const [configList, setConfigList] = useState<ConfigItem[]>([]);
    const [phoneLines, setPhoneLines] = useState<{ id: string, name: string }[]>([]);
    const [localQuickReplies, setLocalQuickReplies] = useState<QuickReply[]>(quickReplies);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [showMobileMenu, setShowMobileMenu] = useState(true);

    // Estados modal
    const [modalType, setModalType] = useState<'none' | 'create_agent' | 'edit_agent' | 'delete_agent' | 'add_config' | 'edit_config' | 'delete_config' | 'add_quick_reply' | 'edit_quick_reply' | 'delete_quick_reply' | 'edit_notifications'>('none');
    const [selectedItem, setSelectedItem] = useState<any>(null);

    // Forms State
    const [formName, setFormName] = useState('');
    const [formRole, setFormRole] = useState('Ventas');
    const [formPass, setFormPass] = useState('');
    const [formType, setFormType] = useState('Department');

    // QR Forms
    const [qrTitle, setQrTitle] = useState('');
    const [qrContent, setQrContent] = useState('');
    const [qrShortcut, setQrShortcut] = useState('');

    // Notificaciones
    const [prefDepts, setPrefDepts] = useState<string[]>([]);
    const [prefLines, setPrefLines] = useState<string[]>([]);
    const [prefNewLeads, setPrefNewLeads] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Bot Config
    const [botPrompt, setBotPrompt] = useState('');
    // Estado global de Laura (ON/OFF). Cuando OFF, no responde automáticamente.
    const [botEnabled, setBotEnabled] = useState<boolean>(true);
    const [botEnabledLoading, setBotEnabledLoading] = useState<boolean>(false);
    const [botToggleSaving, setBotToggleSaving] = useState<boolean>(false);
    // Departamentos a los que Laura puede derivar (lista dinámica, N elementos)
    const [showDepartmentEditor, setShowDepartmentEditor] = useState<boolean>(false);
    const [botDepartments, setBotDepartments] = useState<{ name: string; description: string }[]>([]);
    const [deptLoading, setDeptLoading] = useState<boolean>(false);
    const [deptSaving, setDeptSaving] = useState<boolean>(false);
    const MAX_DEPARTMENTS = 15;
    const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);

    // Agenda Config
    const [scheduleDays, setScheduleDays] = useState<number[]>([1, 2, 3, 4, 5]);
    const [scheduleStart, setScheduleStart] = useState('09:00');
    const [scheduleEnd, setScheduleEnd] = useState('18:00');
    const [scheduleDuration, setScheduleDuration] = useState(60);
    const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);

    // Importación: ahora gestionada por <ContactImportWizard />

    // Diagnóstico avanzado de notificaciones (colapsable)
    const [showDiagnostic, setShowDiagnostic] = useState(false);

    // Wizard de configuración de Laura
    const [showBotWizard, setShowBotWizard] = useState(false);
    const [showAdvancedPrompt, setShowAdvancedPrompt] = useState(false);

    // --- EFECTOS DE CARGA ---
    useEffect(() => {
        if (socket) {
            socket.emit('request_agents');
            socket.emit('request_config');
            socket.emit('request_quick_replies'); // Pedir explícitamente
            fetch(`${API_URL}/accounts`).then(r => r.json()).then(setPhoneLines).catch(() => { });

            socket.on('agents_list', (list: Agent[]) => { setAgents(list); });
            socket.on('config_list', (list: ConfigItem[]) => setConfigList(list));
            socket.on('quick_replies_list', (list: QuickReply[]) => setLocalQuickReplies(list));

            socket.on('action_error', (msg: string) => { setError(msg); setIsSaving(false); });
            socket.on('action_success', (msg: string) => { setSuccess(msg); setIsSaving(false); closeModal(); });
        }
        return () => {
            socket?.off('agents_list');
            socket?.off('config_list');
            socket?.off('quick_replies_list');
            socket?.off('action_error');
            socket?.off('action_success');
        };
    }, [socket, currentUser]);

    useEffect(() => {
        if (activeTab === 'bot_config') {
            setIsLoadingPrompt(true);
            fetch(`${API_URL}/bot-config`).then(r => r.json()).then(d => { setBotPrompt(d.prompt); setIsLoadingPrompt(false); }).catch(() => setIsLoadingPrompt(false));
            // Cargar estado global de Laura (ON/OFF)
            setBotEnabledLoading(true);
            fetch(`${API_URL}/bot/status`)
                .then(r => r.json())
                .then(d => { if (typeof d.enabled === 'boolean') setBotEnabled(d.enabled); })
                .catch(() => { /* fallback: asumimos true */ })
                .finally(() => setBotEnabledLoading(false));
            // Cargar departamentos configurados (lista dinámica)
            setDeptLoading(true);
            fetch(`${API_URL}/bot/department-labels`)
                .then(r => r.json())
                .then(d => {
                    // Nuevo formato: { departments: [...] }
                    if (Array.isArray(d?.departments)) {
                        setBotDepartments(d.departments.map((dep: any) => ({
                            name: String(dep?.name || ''),
                            description: String(dep?.description || '')
                        })));
                        return;
                    }
                    // Backward compat: formato antiguo { dept1, dept2, dept3 }
                    if (d?.dept1?.name) {
                        const arr: { name: string; description: string }[] = [];
                        ['dept1', 'dept2', 'dept3'].forEach(k => {
                            if (d[k]?.name) arr.push({ name: d[k].name, description: d[k].description || '' });
                        });
                        setBotDepartments(arr);
                    }
                })
                .catch(() => { /* fallback: lista vacía, el usuario verá un mensaje */ })
                .finally(() => setDeptLoading(false));
        }
        if (activeTab === 'agenda') {
            fetch(`${API_URL}/schedule`).then(r => r.json()).then(d => {
                if (d) {
                    setScheduleDays(d.days || []);
                    setScheduleStart(d.startTime || '09:00');
                    setScheduleEnd(d.endTime || '18:00');
                    setScheduleDuration(d.duration || 60);
                }
            }).catch(() => { });
        }
    }, [activeTab]);

    // Escuchar cambios en tiempo real del estado del bot (si otro admin lo cambia desde otra pestaña)
    useEffect(() => {
        if (!socket) return;
        const handler = (data: { enabled: boolean }) => {
            if (typeof data?.enabled === 'boolean') setBotEnabled(data.enabled);
        };
        socket.on('bot_status_changed', handler);
        return () => { socket.off('bot_status_changed', handler); };
    }, [socket]);

    // Guardar departamentos editados (lista dinámica)
    const handleSaveDepartments = async () => {
        // Limpiar antes de validar
        const cleaned = botDepartments
            .map(d => ({ name: d.name.trim(), description: d.description.trim() }))
            .filter(d => d.name); // descartar entradas sin nombre
        if (cleaned.length === 0) {
            alert('Necesitas al menos 1 departamento con nombre.');
            return;
        }
        // Comprobar duplicados (case-insensitive)
        const lowered = cleaned.map(d => d.name.toLowerCase());
        const duplicates = lowered.filter((n, i) => lowered.indexOf(n) !== i);
        if (duplicates.length > 0) {
            alert(`Hay nombres duplicados: "${duplicates[0]}". Cada departamento debe tener un nombre único.`);
            return;
        }
        setDeptSaving(true);
        try {
            const r = await fetch(`${API_URL}/bot/department-labels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ departments: cleaned })
            });
            const data = await r.json();
            if (data.success) {
                setBotDepartments(cleaned); // refrescar UI con la versión saneada
                setSuccess(`✅ ${cleaned.length} departamento${cleaned.length === 1 ? '' : 's'} guardado${cleaned.length === 1 ? '' : 's'}. Laura los aplicará en la próxima conversación.`);
            } else {
                alert('Error: ' + (data.error || 'desconocido'));
            }
        } catch (e: any) {
            alert('Error de conexión: ' + e.message);
        } finally {
            setDeptSaving(false);
        }
    };

    // Helpers para editar la lista dinámica
    const addDepartment = () => {
        if (botDepartments.length >= MAX_DEPARTMENTS) {
            alert(`Máximo ${MAX_DEPARTMENTS} departamentos.`);
            return;
        }
        setBotDepartments([...botDepartments, { name: '', description: '' }]);
    };
    const removeDepartment = (index: number) => {
        if (botDepartments.length <= 1) {
            alert('Necesitas al menos 1 departamento.');
            return;
        }
        if (window.confirm(`¿Eliminar el departamento "${botDepartments[index].name || '(sin nombre)'}"?`)) {
            setBotDepartments(botDepartments.filter((_, i) => i !== index));
        }
    };
    const updateDepartment = (index: number, field: 'name' | 'description', value: string) => {
        setBotDepartments(botDepartments.map((d, i) => i === index ? { ...d, [field]: value } : d));
    };

    // Toggle del estado global de Laura
    const handleToggleBotEnabled = async () => {
        const newState = !botEnabled;
        // Confirmación si se va a DESACTIVAR
        if (!newState) {
            const ok = window.confirm(
                "¿Seguro que quieres DESACTIVAR a Laura?\n\n" +
                "Cuando esté desactivada:\n" +
                "• Los mensajes seguirán llegando al panel\n" +
                "• Laura NO responderá automáticamente\n" +
                "• Vuestro equipo tendrá que contestar manualmente\n\n" +
                "Puedes reactivarla en cualquier momento desde aquí."
            );
            if (!ok) return;
        }
        setBotToggleSaving(true);
        try {
            const r = await fetch(`${API_URL}/bot/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: newState })
            });
            const data = await r.json();
            if (data.success) {
                setBotEnabled(newState);
                setSuccess(newState ? '✅ Laura ACTIVADA — responderá automáticamente' : '🔇 Laura DESACTIVADA — solo respuestas manuales');
            } else {
                alert('Error: ' + (data.error || 'desconocido'));
            }
        } catch (e: any) {
            alert('Error de conexión: ' + e.message);
        } finally {
            setBotToggleSaving(false);
        }
    };

    // --- AUTO-LAUNCH SETTINGS TOUR ON FIRST VISIT ---
    useEffect(() => {
        const tourKey: 'settings_admin' | 'settings_worker' = isAdmin ? 'settings_admin' : 'settings_worker';
        // Comprueba contra las preferencias del usuario actual (servidor),
        // no contra localStorage. Cada usuario tiene su propio estado.
        if (shouldShowTour(tourKey, currentUser?.preferences)) {
            // Wait for DOM to render, then start tour
            const timer = setTimeout(() => {
                if (isAdmin) {
                    startAdminSettingsTour(() => markTourAsComplete(tourKey, updateMyPreferences));
                } else {
                    startWorkerSettingsTour(() => markTourAsComplete(tourKey, updateMyPreferences));
                }
            }, 800);
            return () => clearTimeout(timer);
        }
    }, []); // Run once on mount

    // Android back button handler for Settings
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        const backButtonListener = CapacitorApp.addListener('backButton', () => {
            // If we're in a submenu (menu is hidden), go back to menu
            if (!showMobileMenu) {
                setShowMobileMenu(true);
                return;
            }
            // If we're at main Settings menu, exit Settings
            onBack();
        });

        return () => {
            backButtonListener.then(l => l.remove());
        };
    }, [showMobileMenu, onBack]);

    // --- HANDLERS ---

    const handleSavePrompt = async () => {
        setIsLoadingPrompt(true);
        try { await fetch(`${API_URL}/bot-config`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: botPrompt }) }); setSuccess("Guardado"); }
        catch (e) { console.error("[Settings] Error guardando prompt:", e); setError("Error al guardar el prompt"); } finally { setIsLoadingPrompt(false); }
    };

    const handleSaveSchedule = async () => {
        if (scheduleDays.length === 0) return setError("Selecciona al menos un día");
        setIsUpdatingSchedule(true);
        try {
            await fetch(`${API_URL}/schedule`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    days: scheduleDays,
                    startTime: scheduleStart,
                    endTime: scheduleEnd,
                    duration: parseInt(String(scheduleDuration))
                })
            });
            setSuccess("Horario actualizado y huecos regenerados.");
        } catch (e) { setError("Error al actualizar horario"); }
        finally { setIsUpdatingSchedule(false); }
    };

    const toggleDay = (day: number) => {
        if (scheduleDays.includes(day)) setScheduleDays(scheduleDays.filter(d => d !== day));
        else setScheduleDays([...scheduleDays, day]);
    };

    const openEditNotifications = (agent: Agent) => {
        setSelectedItem(agent);
        const prefs = agent.preferences || {};
        setPrefDepts(prefs.departments || []);
        setPrefLines(prefs.phoneIds || []);
        setPrefNewLeads(prefs.notifyNewLeads !== undefined ? prefs.notifyNewLeads : true);
        setModalType('edit_notifications');
    };

    const handleSaveNotifications = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem) return;
        setIsSaving(true);
        const newPrefs = { departments: prefDepts, phoneIds: prefLines, notifyNewLeads: prefNewLeads };
        socket.emit('update_agent', { agentId: selectedItem.id, updates: { name: selectedItem.name, role: selectedItem.role, preferences: newPrefs } });
    };

    const toggleSelection = (list: string[], item: string, setList: any) => {
        if (list.includes(item)) setList(list.filter(i => i !== item));
        else setList([...list, item]);
    };

    // Modales Agentes / Config
    const closeModal = () => { setModalType('none'); setFormName(''); setFormPass(''); setError(''); setSelectedItem(null); setQrTitle(''); setQrContent(''); setQrShortcut(''); setIsSaving(false); };
    const openCreateAgent = () => { setModalType('create_agent'); setFormName(''); setFormRole('Ventas'); setFormPass(''); };
    const openEditAgent = (agent: Agent) => { setSelectedItem(agent); setFormName(agent.name); setFormRole(agent.role); setFormPass(''); setModalType('edit_agent'); };
    const openDeleteAgent = (agent: Agent) => { setSelectedItem(agent); setModalType('delete_agent'); };

    // Resetear tours del agente — borra toursSeen de sus preferencias.
    // En el próximo login del agente, los tutoriales vuelven a salir.
    // Útil cuando: el usuario perdió un tour por error, o se ha cambiado mucho la UI
    // y queremos que vuelva a ver la guía actualizada.
    const handleResetAgentTour = (agent: Agent) => {
        if (!socket) return;
        const confirmed = window.confirm(
            `¿Resetear los tutoriales de "${agent.name}"?\n\nVerá la guía de bienvenida y los tours de cada sección en su próximo inicio de sesión.`
        );
        if (!confirmed) return;
        const newPrefs = { ...(agent.preferences || {}), toursSeen: {} };
        socket.emit('update_agent', { agentId: agent.id, updates: { name: agent.name, role: agent.role, preferences: newPrefs } });
    };
    const openAddConfig = (type: string) => { setFormType(type); setFormName(''); setModalType('add_config'); };
    const openEditConfig = (item: ConfigItem) => { setSelectedItem(item); setFormName(item.name); setModalType('edit_config'); };
    const openDeleteConfig = (item: ConfigItem) => { setSelectedItem(item); setModalType('delete_config'); };

    // Modales Quick Replies
    const openAddQR = () => { setQrTitle(''); setQrContent(''); setQrShortcut(''); setModalType('add_quick_reply'); };
    const openEditQR = (qr: QuickReply) => { setSelectedItem(qr); setQrTitle(qr.title); setQrContent(qr.content); setQrShortcut(qr.shortcut || ''); setModalType('edit_quick_reply'); };
    const openDeleteQR = (qr: QuickReply) => { setSelectedItem(qr); setModalType('delete_quick_reply'); };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!socket) return;
        setIsSaving(true);
        switch (modalType) {
            case 'create_agent': socket.emit('create_agent', { newAgent: { name: formName, role: formRole, password: formPass } }); break;
            case 'edit_agent': const updates: any = { name: formName, role: formRole }; if (formPass) updates.password = formPass; socket.emit('update_agent', { agentId: selectedItem.id, updates }); break;
            case 'delete_agent': socket.emit('delete_agent', { agentId: selectedItem.id }); break;
            case 'add_config': socket.emit('add_config', { name: formName, type: formType }); break;
            case 'edit_config': socket.emit('update_config', { id: selectedItem.id, name: formName }); break;
            case 'delete_config': socket.emit('delete_config', selectedItem.id); break;
            case 'add_quick_reply': socket.emit('add_quick_reply', { title: qrTitle, content: qrContent, shortcut: qrShortcut }); break;
            case 'edit_quick_reply': socket.emit('update_quick_reply', { id: selectedItem.id, title: qrTitle, content: qrContent, shortcut: qrShortcut }); break;
            case 'delete_quick_reply': socket.emit('delete_quick_reply', selectedItem.id); break;
        }
    };

    const departments = configList.filter(c => c.type === 'Department');
    const statuses = configList.filter(c => c.type === 'Status');
    const tags = configList.filter(c => c.type === 'Tag');

    // @ts-ignore
    const handleTabClick = (tab: any) => { setActiveTab(tab); setShowMobileMenu(false); };

    // --- FIX NAVEGACIÓN INTELIGENTE ---
    const handleBack = () => {
        // Si estamos en móvil (pantalla pequeña)
        if (window.innerWidth < 768) {
            // Si estamos viendo una pestaña, volver al menú
            if (!showMobileMenu) {
                setShowMobileMenu(true);
                return;
            }
        }
        // Si estamos en el menú móvil O en escritorio, salir de configuración
        onBack();
    };

    // Tabs that all users can access
    const userAllowedTabs = ['notifications', 'appearance'];
    const isTabAllowed = (tab: string) => isAdmin || userAllowedTabs.includes(tab);

    const getTitle = () => {
        // En móvil, si estamos en el menú, mostramos "Configuración"
        if (showMobileMenu && window.innerWidth < 768) return 'Configuración';

        // En escritorio o dentro de una pestaña en móvil, mostramos el nombre de la sección
        switch (activeTab) {
            case 'team': return 'Gestión Equipo';
            case 'config': return 'Ajustes CRM';
            case 'whatsapp': return 'Plantillas WhatsApp';
            case 'quick_replies': return 'Respuestas Rápidas';
            case 'analytics': return 'Analíticas';
            case 'agenda': return 'Agenda';
            case 'bot_config': return 'Configuración IA';
            case 'notifications': return 'Notificaciones';
            case 'data': return 'Base de Datos';
            case 'appearance': return 'Apariencia';
            default: return 'Configuración';
        }
    };

    return (
        // FIX ESTILO MÓVIL: h-[100dvh] para evitar problemas con la barra del navegador
        <div className={`fixed inset-0 z-50 flex flex-col h-[100dvh] w-full font-sans ${isDark ? 'bg-transparent' : 'bg-slate-50'}`}>

            {/* HEADER */}
            <div className={`border-b px-4 pb-4 safe-pt-header flex items-center justify-between shadow-sm flex-shrink-0 z-20 ${isDark ? 'bg-slate-900/60 backdrop-blur-xl border-white/5' : 'bg-white border-gray-200'}`}>
                <div className="flex items-center gap-3">
                    <button onClick={handleBack} className={`p-2 rounded-full transition active:scale-95 ${isDark ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}>
                        <ArrowLeft className="w-6 h-6" />
                    </button>
                    <h1 className={`text-lg md:text-xl font-bold truncate ${isDark ? 'text-white' : 'text-slate-800'}`}>{getTitle()}</h1>
                </div>
                <div className="fixed safe-toast-top right-4 z-[70] flex flex-col gap-2 items-end pointer-events-none max-w-[calc(100vw-2rem)]">
                    {success && (
                        <div className="bg-green-100 text-green-700 px-4 py-2 rounded-lg text-xs md:text-sm font-bold animate-in slide-in-from-right shadow-md pointer-events-auto flex items-start gap-3 max-w-md">
                            <span className="flex-1 leading-snug">{success}</span>
                            <button onClick={() => setSuccess('')} className="p-1 -m-1 rounded-full hover:bg-green-200 text-green-700/70 hover:text-green-900 transition flex-shrink-0" title="Cerrar">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    {error && (
                        <div className="bg-red-100 text-red-700 px-4 py-2 rounded-lg text-xs md:text-sm font-bold animate-in slide-in-from-right shadow-md pointer-events-auto flex items-start gap-3 max-w-md">
                            <span className="flex-1 leading-snug">{error}</span>
                            <button onClick={() => setError('')} className="p-1 -m-1 rounded-full hover:bg-red-200 text-red-700/70 hover:text-red-900 transition flex-shrink-0" title="Cerrar">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden relative">
                {/* MENU LATERAL (SIDEBAR) */}
                <div className={`absolute inset-0 z-10 flex flex-col p-4 space-y-2 transition-transform duration-300 md:relative md:translate-x-0 md:w-64 md:border-r overflow-y-auto ${!showMobileMenu ? '-translate-x-full' : 'translate-x-0'} ${isDark ? 'bg-slate-900/40 backdrop-blur-md md:border-white/5' : 'bg-white md:border-gray-200'}`}>
                    {/* User-accessible tabs */}
                    <p className={`text-[10px] font-bold uppercase tracking-wider px-2 pt-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Mi Cuenta</p>
                    <button id="settings-notifications-tab" onClick={() => handleTabClick('notifications')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all active:scale-95 ${activeTab === 'notifications'
                        ? (isDark ? 'bg-orange-500/20 text-orange-400 shadow-sm' : 'bg-orange-50 text-orange-600 shadow-sm')
                        : (isDark ? 'text-slate-400 hover:bg-slate-700 border border-transparent' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100')
                        }`}><Bell className="w-5 h-5" /> Notificaciones</button>
                    <button id="settings-appearance-tab" onClick={() => handleTabClick('appearance')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all active:scale-95 ${activeTab === 'appearance' ? (isDark ? 'bg-pink-500/20 text-pink-400 shadow-sm' : 'bg-pink-50 text-pink-600 shadow-sm') : (isDark ? 'text-slate-400 hover:bg-slate-700 border border-transparent' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100')}`}><Palette className="w-5 h-5" /> Apariencia</button>

                    {/* Admin-only tabs */}
                    {isAdmin && (
                        <>
                            <div className="h-px bg-slate-100 my-2"></div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 pt-2">Administración</p>
                            <button id="settings-analytics-tab" onClick={() => handleTabClick('analytics')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all active:scale-95 ${activeTab === 'analytics' ? (isDark ? 'bg-indigo-500/20 text-indigo-400 shadow-sm' : 'bg-indigo-50 text-indigo-600 shadow-sm') : (isDark ? 'text-slate-400 hover:bg-slate-700 border border-transparent' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100')}`}><BarChart3 className="w-5 h-5" /> Analíticas</button>
                            <button id="settings-calendar-tab" onClick={() => handleTabClick('agenda')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all active:scale-95 ${activeTab === 'agenda' ? (isDark ? 'bg-purple-500/20 text-purple-400 shadow-sm' : 'bg-purple-50 text-purple-600 shadow-sm') : (isDark ? 'text-slate-400 hover:bg-slate-700 border border-transparent' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100')}`}><Calendar className="w-5 h-5" /> Agenda</button>
                            <button id="settings-import-tab" onClick={() => handleTabClick('data')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all active:scale-95 ${activeTab === 'data' ? (isDark ? 'bg-emerald-500/20 text-emerald-400 shadow-sm' : 'bg-emerald-50 text-emerald-600 shadow-sm') : (isDark ? 'text-slate-400 hover:bg-slate-700 border border-transparent' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100')}`}><Database className="w-5 h-5" /> Datos e Importación</button>
                            <div className="h-px bg-slate-100 my-2"></div>
                            <button id="settings-agents-tab" onClick={() => handleTabClick('team')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all active:scale-95 ${activeTab === 'team' ? (isDark ? 'bg-blue-500/20 text-blue-400 shadow-sm' : 'bg-blue-50 text-blue-600 shadow-sm') : (isDark ? 'text-slate-400 hover:bg-slate-700 border border-transparent' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100')}`}><User className="w-5 h-5" /> Gestión de Equipo</button>
                            <button id="settings-config-tab" onClick={() => handleTabClick('config')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all active:scale-95 ${activeTab === 'config' ? (isDark ? 'bg-purple-500/20 text-purple-400 shadow-sm' : 'bg-purple-50 text-purple-600 shadow-sm') : (isDark ? 'text-slate-400 hover:bg-slate-700 border border-transparent' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100')}`}><LayoutList className="w-5 h-5" /> Ajustes CRM</button>
                            <button id="settings-whatsapp-tab" onClick={() => handleTabClick('whatsapp')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all active:scale-95 ${activeTab === 'whatsapp' ? (isDark ? 'bg-green-500/20 text-green-400 shadow-sm' : 'bg-green-50 text-green-600 shadow-sm') : (isDark ? 'text-slate-400 hover:bg-slate-700 border border-transparent' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100')}`}><MessageSquare className="w-5 h-5" /> Plantillas WhatsApp</button>
                            <button id="settings-quick-replies-tab" onClick={() => handleTabClick('quick_replies')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all active:scale-95 ${activeTab === 'quick_replies' ? (isDark ? 'bg-yellow-500/20 text-yellow-400 shadow-sm' : 'bg-yellow-50 text-yellow-600 shadow-sm') : (isDark ? 'text-slate-400 hover:bg-slate-700 border border-transparent' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100')}`}><Zap className="w-5 h-5" /> Respuestas Rápidas</button>
                            <button id="settings-bot-config-tab" onClick={() => handleTabClick('bot_config')} className={`w-full flex items-center gap-3 p-4 rounded-xl text-sm font-bold transition-all active:scale-95 ${activeTab === 'bot_config' ? (isDark ? 'bg-teal-500/20 text-teal-400 shadow-sm' : 'bg-teal-50 text-teal-600 shadow-sm') : (isDark ? 'text-slate-400 hover:bg-slate-700 border border-transparent' : 'text-slate-500 hover:bg-slate-50 border border-transparent hover:border-slate-100')}`}><Bot className="w-5 h-5" /> Configuración de Laura (IA)</button>
                        </>
                    )}
                </div>

                {/* CONTENIDO PRINCIPAL */}
                <div className={`flex-1 p-4 md:p-8 overflow-y-auto w-full absolute inset-0 md:static transition-transform duration-300 ${isDark ? 'bg-transparent' : 'bg-slate-50'} ${showMobileMenu ? 'translate-x-full md:translate-x-0' : 'translate-x-0'}`}>

                    {/* TEAM */}
                    {activeTab === 'team' && (
                        <div className={`max-w-3xl mx-auto p-4 md:p-6 rounded-2xl border shadow-sm ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
                            <div className="flex justify-between items-center mb-6">
                                <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Agentes</h2>
                                <button onClick={openCreateAgent} className="bg-blue-600 text-white px-3 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 flex items-center gap-2 shadow-md active:scale-95 transition-transform">
                                    <Plus className="w-4 h-4" /> Nuevo
                                </button>
                            </div>
                            <div className="space-y-3">
                                {agents.map(agent => (
                                    <div key={agent.id} className={`flex items-center justify-between p-3 rounded-xl border group ${isDark ? 'bg-slate-800/50 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold ${agent.role === 'Admin' ? 'bg-purple-500' : 'bg-blue-500'}`}>
                                                {agent.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className={`font-bold text-sm truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{agent.name}</p>
                                                <p className="text-xs text-slate-400 truncate">{agent.role}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleResetAgentTour(agent)}
                                                title="Resetear tutoriales — el agente verá la guía de bienvenida en su próximo login"
                                                className={`p-2 rounded-lg border ${isDark ? 'bg-slate-700 text-slate-300 border-slate-600 hover:text-amber-400' : 'bg-white text-slate-400 border-slate-200 hover:text-amber-500'}`}
                                            >
                                                <RotateCcw className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => openEditAgent(agent)}
                                                title="Editar"
                                                className={`p-2 rounded-lg border ${isDark ? 'bg-slate-700 text-slate-300 border-slate-600 hover:text-blue-400' : 'bg-white text-slate-400 border-slate-200 hover:text-blue-500'}`}
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => openDeleteAgent(agent)}
                                                title="Eliminar"
                                                className={`p-2 rounded-lg border ${isDark ? 'bg-slate-700 text-slate-300 border-slate-600 hover:text-red-400' : 'bg-white text-slate-400 border-slate-200 hover:text-red-500'}`}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* QUICK REPLIES */}
                    {activeTab === 'quick_replies' && (
                        <div className={`max-w-3xl mx-auto p-4 md:p-6 rounded-2xl border shadow-sm ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className={`text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}><Zap className="w-5 h-5 text-yellow-500" /> Respuestas Rápidas</h2>
                                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Atajos para mensajes frecuentes (ej: /hola).</p>
                                </div>
                                <button onClick={openAddQR} className="bg-yellow-500 text-white px-3 py-2 rounded-lg font-bold text-sm hover:bg-yellow-600 flex items-center gap-2 shadow-md active:scale-95 transition-transform"><Plus className="w-4 h-4" /> Nueva</button>
                            </div>

                            <div className="grid gap-3">
                                {localQuickReplies.map((qr) => (
                                    <div key={qr.id} className={`p-4 rounded-xl border transition-colors group relative ${isDark ? 'bg-slate-800/40 border-white/5 hover:border-yellow-500/30' : 'bg-slate-50 border-slate-100 hover:border-yellow-200'}`}>
                                        <div className="flex justify-between items-start mb-1">
                                            <h3 className={`font-bold text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{qr.title}</h3>
                                            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-yellow-500/20 text-yellow-300' : 'bg-yellow-100 text-yellow-700'}`}>{qr.shortcut || 'Sin atajo'}</span>
                                        </div>
                                        <p className={`text-xs line-clamp-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{qr.content}</p>

                                        <div className="absolute top-2 right-2 flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openEditQR(qr)} className={`p-1.5 rounded-lg shadow-sm border ${isDark ? 'bg-slate-700 text-slate-300 border-slate-600 hover:text-blue-400' : 'bg-white text-slate-400 hover:text-blue-500 border-slate-200'}`}><Pencil size={14} /></button>
                                            <button onClick={() => openDeleteQR(qr)} className={`p-1.5 rounded-lg shadow-sm border ${isDark ? 'bg-slate-700 text-slate-300 border-slate-600 hover:text-red-400' : 'bg-white text-slate-400 hover:text-red-500 border-slate-200'}`}><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                                {localQuickReplies.length === 0 && <div className="text-center py-10 text-slate-400 italic">No hay respuestas configuradas.</div>}
                            </div>
                        </div>
                    )}

                    {/* CONFIG */}
                    {/* CONFIG */}
                    {activeTab === 'config' && (<div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 pb-20"><div className={`p-5 rounded-2xl border shadow-sm h-fit ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}><div className="flex justify-between items-center mb-4"><h2 className={`text-base md:text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}><Briefcase className="w-5 h-5 text-purple-500" /> Departamentos</h2><button onClick={() => openAddConfig('Department')} className={`p-2 rounded-lg transition ${isDark ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30' : 'bg-purple-100 text-purple-700 hover:bg-purple-200'}`}><Plus className="w-4 h-4" /></button></div><div className="space-y-2">{departments.map(d => (<div key={d.id} className={`flex justify-between items-center p-3 rounded-xl border text-sm font-medium group ${isDark ? 'bg-purple-500/10 border-purple-500/20 text-purple-300' : 'bg-purple-50 border-purple-100 text-purple-700'}`}><span className="truncate">{d.name}</span><div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0"><button onClick={() => openEditConfig(d)} className={`p-1.5 rounded-md shadow-sm ${isDark ? 'bg-slate-700 hover:text-purple-400' : 'bg-white hover:text-purple-900'}`}><Pencil className="w-3.5 h-3.5" /></button><button onClick={() => openDeleteConfig(d)} className={`p-1.5 rounded-md shadow-sm ${isDark ? 'bg-slate-700 hover:text-red-400' : 'bg-white hover:text-red-600'}`}><Trash2 className="w-3.5 h-3.5" /></button></div></div>))}</div></div><div className={`p-5 rounded-2xl border shadow-sm h-fit ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}><div className="flex justify-between items-center mb-4"><h2 className={`text-base md:text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}><CheckCircle className="w-5 h-5 text-green-500" /> Estados</h2><button onClick={() => openAddConfig('Status')} className={`p-2 rounded-lg transition ${isDark ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}><Plus className="w-4 h-4" /></button></div><div className="space-y-2">{statuses.map(s => (<div key={s.id} className={`flex justify-between items-center p-3 rounded-xl border text-sm font-medium group ${isDark ? 'bg-green-500/10 border-green-500/20 text-green-300' : 'bg-green-50 border-green-100 text-green-700'}`}><span className="truncate">{s.name}</span><div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0"><button onClick={() => openEditConfig(s)} className={`p-1.5 rounded-md shadow-sm ${isDark ? 'bg-slate-700 hover:text-green-400' : 'bg-white hover:text-green-900'}`}><Pencil className="w-3.5 h-3.5" /></button><button onClick={() => openDeleteConfig(s)} className={`p-1.5 rounded-md shadow-sm ${isDark ? 'bg-slate-700 hover:text-red-400' : 'bg-white hover:text-red-600'}`}><Trash2 className="w-3.5 h-3.5" /></button></div></div>))}</div></div><div className={`p-5 rounded-2xl border shadow-sm h-fit ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}><div className="flex justify-between items-center mb-4"><h2 className={`text-base md:text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}><Tag className="w-5 h-5 text-orange-500" /> Etiquetas</h2><button onClick={() => openAddConfig('Tag')} className={`p-2 rounded-lg transition ${isDark ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}><Plus className="w-4 h-4" /></button></div><div className="space-y-2">{tags.map(t => (<div key={t.id} className={`flex justify-between items-center p-3 rounded-xl border text-sm font-medium group ${isDark ? 'bg-orange-500/10 border-orange-500/20 text-orange-300' : 'bg-orange-50 border-orange-100 text-orange-700'}`}><span className="truncate">{t.name}</span><div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0"><button onClick={() => openEditConfig(t)} className={`p-1.5 rounded-md shadow-sm ${isDark ? 'bg-slate-700 hover:text-orange-400' : 'bg-white hover:text-orange-900'}`}><Pencil className="w-3.5 h-3.5" /></button><button onClick={() => openDeleteConfig(t)} className={`p-1.5 rounded-md shadow-sm ${isDark ? 'bg-slate-700 hover:text-red-400' : 'bg-white hover:text-red-600'}`}><Trash2 className="w-3.5 h-3.5" /></button></div></div>))}</div></div></div>)}

                    {/* OTROS COMPONENTES */}
                    {activeTab === 'whatsapp' && <WhatsAppTemplatesManager />}
                    {activeTab === 'analytics' && <AnalyticsDashboard />}
                    {activeTab === 'agenda' && <CalendarDashboard />}
                    {activeTab === 'bot_config' && (
                        <div className="max-w-4xl mx-auto space-y-6">
                            {/* ============================================================ */}
                            {/* TOGGLE GLOBAL DE LAURA — ACTIVAR/DESACTIVAR                  */}
                            {/* ============================================================ */}
                            <div className={`p-6 rounded-2xl border-2 shadow-sm ${botEnabled
                                ? (isDark ? 'bg-emerald-900/20 border-emerald-700/50' : 'bg-emerald-50 border-emerald-200')
                                : (isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-100 border-slate-300')
                                }`}>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <div className={`p-2.5 rounded-xl shadow-lg flex-shrink-0 ${botEnabled
                                            ? 'bg-gradient-to-br from-emerald-500 to-green-600'
                                            : 'bg-gradient-to-br from-slate-500 to-slate-600'
                                            }`}>
                                            <Bot className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                                                    Laura está {botEnabled ? '✅ ACTIVA' : '🔇 DESACTIVADA'}
                                                </h3>
                                                {botEnabledLoading && <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />}
                                            </div>
                                            <p className={`text-sm mt-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                                {botEnabled
                                                    ? 'Responde automáticamente a los mensajes entrantes de los clientes.'
                                                    : 'Los mensajes llegan al panel pero NO se responden solos. Atiéndelos manualmente.'}
                                            </p>
                                        </div>
                                    </div>
                                    {/* Toggle switch */}
                                    <button
                                        onClick={handleToggleBotEnabled}
                                        disabled={botToggleSaving || botEnabledLoading}
                                        className={`relative inline-flex h-8 w-14 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${botEnabled ? 'bg-emerald-500 focus:ring-emerald-500' : 'bg-slate-400 focus:ring-slate-400'} ${botToggleSaving ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                                        aria-label={botEnabled ? 'Desactivar Laura' : 'Activar Laura'}
                                    >
                                        <span className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform ${botEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            </div>

                            {/* Cabecera */}
                            <div className={`p-6 rounded-2xl border shadow-sm ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
                                <div className="flex items-start gap-3 mb-4">
                                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 shadow-lg">
                                        <Bot className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>Configuración de Laura (IA)</h2>
                                        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Personaliza el asistente virtual para tu negocio.</p>
                                    </div>
                                </div>

                                {/* Botón principal: wizard */}
                                <button
                                    onClick={() => setShowBotWizard(true)}
                                    className="w-full p-5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-600 text-white text-left hover:shadow-lg transition active:scale-[0.99]">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 rounded-lg bg-white/20">
                                            <Bot className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-bold">🪄 Iniciar wizard de configuración</div>
                                            <div className="text-xs opacity-90 mt-0.5">Configura Laura en 7 pasos según tu sector (taller, clínica, peluquería...)</div>
                                        </div>
                                        <ChevronRight className="w-5 h-5" />
                                    </div>
                                </button>
                            </div>

                            {/* ============================================================ */}
                            {/* EDITOR DE DEPARTAMENTOS — donde Laura deriva chats (N dinámico) */}
                            {/* ============================================================ */}
                            <div>
                                <button
                                    onClick={() => setShowDepartmentEditor(!showDepartmentEditor)}
                                    className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${isDark ? 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                                    <div className="flex items-center gap-2">
                                        <Briefcase size={16} className={isDark ? 'text-slate-500' : 'text-slate-400'} />
                                        <span>Departamentos a los que Laura puede derivar</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500'}`}>{botDepartments.length} dpto{botDepartments.length === 1 ? '' : 's'}</span>
                                    </div>
                                    {showDepartmentEditor ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                                {showDepartmentEditor && (
                                    <div className={`mt-3 p-6 rounded-2xl border shadow-sm ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
                                        <div className={`mb-4 px-3 py-2 rounded-lg text-xs ${isDark ? 'bg-blue-500/10 text-blue-300' : 'bg-blue-50 text-blue-800'}`}>
                                            💡 Cuando un cliente pide hablar con un humano, Laura deriva el chat a UNO de estos departamentos según el tema. Cuanto más clara sea la descripción, mejor decidirá Laura. Puedes añadir hasta {MAX_DEPARTMENTS}.
                                        </div>
                                        {deptLoading ? (
                                            <div className="p-6 text-center text-slate-400"><RefreshCw className="animate-spin inline mr-2" /> Cargando...</div>
                                        ) : (
                                            <div className="space-y-5">
                                                {botDepartments.length === 0 && (
                                                    <div className={`p-4 rounded-xl border-2 border-dashed text-center text-sm ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-300 text-slate-500'}`}>
                                                        No hay departamentos configurados. Añade el primero abajo.
                                                    </div>
                                                )}
                                                {botDepartments.map((dep, index) => {
                                                    const gradients = [
                                                        'from-emerald-500 to-teal-600',
                                                        'from-orange-500 to-amber-600',
                                                        'from-purple-500 to-pink-600',
                                                        'from-blue-500 to-cyan-600',
                                                        'from-rose-500 to-red-600',
                                                        'from-yellow-500 to-orange-600',
                                                    ];
                                                    const grad = gradients[index % gradients.length];
                                                    return (
                                                        <div key={index} className={`p-4 rounded-xl border ${isDark ? 'bg-slate-900/40 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                                                            <div className="flex items-start justify-between mb-2">
                                                                <div className={`text-xs font-bold uppercase bg-gradient-to-r ${grad} bg-clip-text text-transparent`}>
                                                                    Departamento {index + 1}
                                                                </div>
                                                                <button
                                                                    onClick={() => removeDepartment(index)}
                                                                    disabled={botDepartments.length <= 1}
                                                                    title={botDepartments.length <= 1 ? 'Necesitas al menos 1 departamento' : 'Eliminar este departamento'}
                                                                    className={`p-1.5 rounded-lg border transition ${botDepartments.length <= 1
                                                                        ? 'opacity-30 cursor-not-allowed border-slate-300'
                                                                        : (isDark ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-red-400 hover:border-red-500/40' : 'bg-white border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-300')}`}>
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                            <div className="space-y-3">
                                                                <div>
                                                                    <label className={`text-xs font-bold uppercase block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Nombre del departamento</label>
                                                                    <input
                                                                        type="text"
                                                                        value={dep.name}
                                                                        onChange={(e) => updateDepartment(index, 'name', e.target.value)}
                                                                        placeholder="Ej: Ventas, Recepción, Urgencias, Postventa..."
                                                                        maxLength={50}
                                                                        className={`w-full px-3 py-2 rounded-lg border text-sm focus:ring-2 focus:ring-teal-500 outline-none ${isDark ? 'bg-slate-900/50 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className={`text-xs font-bold uppercase block mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Cuándo derivar aquí (descripción para Laura)</label>
                                                                    <textarea
                                                                        value={dep.description}
                                                                        onChange={(e) => updateDepartment(index, 'description', e.target.value)}
                                                                        placeholder="Ej: para temas comerciales, presupuestos, compra de productos..."
                                                                        rows={2}
                                                                        maxLength={300}
                                                                        className={`w-full px-3 py-2 rounded-lg border text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none ${isDark ? 'bg-slate-900/50 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {/* Botón añadir departamento */}
                                                <button
                                                    onClick={addDepartment}
                                                    disabled={botDepartments.length >= MAX_DEPARTMENTS}
                                                    className={`w-full p-3 rounded-xl border-2 border-dashed font-semibold text-sm flex items-center justify-center gap-2 transition ${botDepartments.length >= MAX_DEPARTMENTS
                                                        ? 'opacity-40 cursor-not-allowed border-slate-300 text-slate-400'
                                                        : (isDark ? 'border-slate-600 text-slate-400 hover:border-teal-500 hover:text-teal-400 hover:bg-teal-500/5' : 'border-slate-300 text-slate-500 hover:border-teal-500 hover:text-teal-600 hover:bg-teal-50')}`}>
                                                    <Plus className="w-4 h-4" />
                                                    {botDepartments.length >= MAX_DEPARTMENTS
                                                        ? `Máximo ${MAX_DEPARTMENTS} departamentos alcanzado`
                                                        : 'Añadir departamento'}
                                                </button>
                                                <div className="flex justify-end pt-2">
                                                    <button
                                                        onClick={handleSaveDepartments}
                                                        disabled={deptSaving}
                                                        className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50">
                                                        <Save size={18} /> {deptSaving ? 'Guardando...' : 'Guardar departamentos'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Manager de documentos */}
                            <BotKnowledgeManager />

                            {/* Edición avanzada del prompt (colapsable) */}
                            <div>
                                <button
                                    onClick={() => setShowAdvancedPrompt(!showAdvancedPrompt)}
                                    className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${isDark ? 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                                    <div className="flex items-center gap-2">
                                        <Bot size={16} className={isDark ? 'text-slate-500' : 'text-slate-400'} />
                                        <span>Editar prompt avanzado</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500'}`}>AVANZADO</span>
                                    </div>
                                    {showAdvancedPrompt ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                                {showAdvancedPrompt && (
                                    <div className={`mt-3 p-6 rounded-2xl border shadow-sm ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
                                        <div className={`mb-4 px-3 py-2 rounded-lg text-xs ${isDark ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-800'}`}>
                                            ⚠️ Solo edita esto si sabes lo que haces. El wizard genera un prompt optimizado automáticamente.
                                        </div>
                                        {isLoadingPrompt ? (
                                            <div className="p-10 text-center text-slate-400"><RefreshCw className="animate-spin inline mr-2" /> Cargando prompt...</div>
                                        ) : (
                                            <div className="space-y-4">
                                                <label className={`text-xs font-bold uppercase block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Prompt del sistema (avanzado)</label>
                                                <textarea
                                                    value={botPrompt}
                                                    onChange={(e) => setBotPrompt(e.target.value)}
                                                    className={`w-full h-96 p-4 border rounded-xl font-mono text-sm focus:ring-2 focus:ring-teal-500 outline-none resize-none leading-relaxed ${isDark ? 'bg-slate-900/50 border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'}`}
                                                    placeholder="Escribe aquí las instrucciones para la IA..."
                                                />
                                                <div className="flex justify-end">
                                                    <button onClick={handleSavePrompt} className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-2">
                                                        <Save size={18} /> Guardar prompt manual
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Wizard modal */}
                            {showBotWizard && (
                                <BotConfigWizard
                                    onClose={() => setShowBotWizard(false)}
                                    onSaved={(newPrompt) => { setBotPrompt(newPrompt); setShowBotWizard(false); }}
                                />
                            )}
                        </div>
                    )}
                    {activeTab === 'notifications' && (
                        <div className={`max-w-2xl mx-auto p-6 rounded-2xl border shadow-sm ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className={`text-xl font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}><Bell className="w-6 h-6 text-orange-500" /> Configurar Alertas</h2>
                                    <p className="text-sm text-slate-500">Define qué mensajes deben sonar para cada agente.</p>
                                </div>
                            </div>
                            <div className="grid gap-4">
                                {agents
                                    .filter(agent => isAdmin || (currentUser && agent.name === currentUser.username))
                                    .map(agent => (
                                        <div key={agent.id} className={`flex items-center justify-between p-4 border rounded-xl transition-colors ${isDark ? 'bg-slate-800/40 border-purple-500/10 hover:border-purple-500/30' : 'bg-slate-50 border-slate-200'}`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-sm bg-gradient-to-br from-indigo-500 to-purple-600 text-white`}>
                                                    {agent.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{agent.name}</p>
                                                    <p className={`text-xs ${isDark ? 'text-purple-300/70' : 'text-slate-500'}`}>
                                                        {(agent.preferences?.departments?.length || 0) + (agent.preferences?.phoneIds?.length || 0) + (agent.preferences?.notifyNewLeads ? 1 : 0)} reglas activas
                                                    </p>
                                                </div>
                                            </div>
                                            <button onClick={() => openEditNotifications(agent)} className={`px-4 py-2 border rounded-lg text-sm font-bold transition ${isDark ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-purple-500/50 hover:text-white' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}>Configurar</button>
                                        </div>
                                    ))}
                            </div>

                            {/* Diagnóstico avanzado: oculto por defecto, útil para soporte técnico */}
                            <div className="mt-8">
                                <button
                                    onClick={() => setShowDiagnostic(!showDiagnostic)}
                                    className={`w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${isDark ? 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}`}
                                    title="Información técnica para soporte. Útil si las notificaciones no te llegan y el equipo te lo pide."
                                >
                                    <div className="flex items-center gap-2">
                                        <Wrench size={16} className={isDark ? 'text-slate-500' : 'text-slate-400'} />
                                        <span>Diagnóstico avanzado de notificaciones</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500'}`}>SOPORTE</span>
                                    </div>
                                    {showDiagnostic ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </button>
                                {showDiagnostic && (
                                    <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className={`px-4 py-2 mb-3 rounded-lg text-xs ${isDark ? 'bg-blue-900/20 text-blue-300 border border-blue-800/50' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                                            ℹ️ Esta sección es para uso técnico. Si las notificaciones no te llegan, haz una captura de este panel y envíasela al equipo de soporte.
                                        </div>
                                        <NotificationDiagnostic />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {activeTab === 'data' && <ContactImportWizard />}

                    {/* APPEARANCE TAB */}
                    {activeTab === 'appearance' && (
                        <div className={`max-w-2xl mx-auto p-6 rounded-2xl border shadow-sm ${isDark ? 'glass-panel border-white/5' : 'bg-white border-slate-200'}`}>
                            <div className="mb-8">
                                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                    <Palette className="w-6 h-6 text-pink-500" /> Apariencia
                                </h2>
                                <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Personaliza el estilo visual de la aplicación.</p>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <h3 className={`text-sm font-bold mb-4 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Tema de la Aplicación</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Light Theme Option */}
                                        <button
                                            onClick={() => setTheme('light')}
                                            className={`relative p-6 rounded-2xl border-2 transition-all ${theme === 'light'
                                                ? (isDark ? 'border-blue-500 bg-blue-500/10 shadow-lg' : 'border-blue-500 bg-blue-50 shadow-lg')
                                                : (isDark ? 'border-slate-700 bg-slate-800/50 hover:border-slate-600' : 'border-slate-200 bg-white hover:border-slate-300')
                                                }`}
                                        >
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 flex items-center justify-center shadow-inner">
                                                    <Sun className="w-8 h-8 text-amber-500" />
                                                </div>
                                                <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Claro</span>
                                                <p className="text-xs text-slate-500 text-center">Fondo blanco, ideal para uso diurno</p>
                                            </div>
                                            {theme === 'light' && (
                                                <div className="absolute top-3 right-3 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                                    <CheckCircle className="w-4 h-4 text-white" />
                                                </div>
                                            )}
                                        </button>

                                        {/* Dark Theme Option */}
                                        <button
                                            onClick={() => setTheme('dark')}
                                            className={`relative p-6 rounded-2xl border-2 transition-all ${theme === 'dark'
                                                ? (isDark ? 'border-purple-500 bg-purple-500/20 shadow-lg' : 'border-purple-500 bg-purple-50 shadow-lg')
                                                : (isDark ? 'border-slate-700 bg-slate-800/50 hover:border-slate-600' : 'border-slate-200 bg-white hover:border-slate-300')
                                                }`}
                                        >
                                            <div className="flex flex-col items-center gap-3">
                                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 flex items-center justify-center shadow-inner">
                                                    <Moon className="w-8 h-8 text-purple-400" />
                                                </div>
                                                <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>Oscuro</span>
                                                <p className="text-xs text-slate-500 text-center">Fondo oscuro, reduce fatiga visual</p>
                                            </div>
                                            {theme === 'dark' && (
                                                <div className="absolute top-3 right-3 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                                                    <CheckCircle className="w-4 h-4 text-white" />
                                                </div>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                <div className={`p-4 rounded-xl border ${isDark ? 'bg-blue-500/10 border-blue-500/20' : 'bg-slate-50 border-slate-200'}`}>
                                    <p className="text-xs text-slate-500 text-center">
                                        💡 El tema oscuro aplicará colores oscuros a la pantalla de selección de usuario.
                                        Próximamente estará disponible para toda la aplicación.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {modalType !== 'none' && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-end md:items-center justify-center p-0 md:p-4 animate-in fade-in backdrop-blur-sm">
                    <div className={`w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl p-6 animate-in slide-in-from-bottom-10 md:zoom-in-95 max-h-[90vh] overflow-y-auto ${isDark ? 'glass-panel border-white/5' : 'bg-white'}`}>
                        <div className={`flex justify-between items-center mb-6`}>
                            <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>
                                {modalType === 'edit_notifications' ? 'Preferencias' : (modalType.includes('create') || modalType.includes('add') ? 'Crear' : modalType.includes('edit') ? 'Editar' : 'Eliminar')}
                            </h3>
                            <button onClick={closeModal} className={`p-2 rounded-full ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {modalType === 'edit_notifications' ? (
                            <form onSubmit={handleSaveNotifications} className="space-y-6">
                                <div className={`flex items-center justify-between p-3 border rounded-lg ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}>
                                    <div className="flex items-center gap-2"><UserPlus className="text-green-500" size={18} /><span className={`text-sm font-bold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Contactos Nuevos (Leads)</span></div>
                                    <button type="button" onClick={() => setPrefNewLeads(!prefNewLeads)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${prefNewLeads ? 'bg-green-600 text-white border-green-600' : (isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-white text-slate-500 border-slate-200')}`}>{prefNewLeads ? 'Sí' : 'No'}</button>
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Departamentos</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {departments.map(d => (
                                            <button type="button" key={d.id} onClick={() => toggleSelection(prefDepts, d.name, setPrefDepts)} className={`p-2 rounded-lg text-xs font-bold border transition ${prefDepts.includes(d.name) ? 'bg-blue-500 text-white border-blue-500' : (isDark ? 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300')}`}>
                                                {d.name}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Líneas de Teléfono</h4>
                                    <div className="space-y-2">
                                        {phoneLines.map(line => (
                                            <button type="button" key={line.id} onClick={() => toggleSelection(prefLines, line.id, setPrefLines)} className={`w-full text-left p-3 rounded-lg text-xs font-bold border transition flex justify-between items-center ${prefLines.includes(line.id) ? 'bg-green-500 text-white border-green-500' : (isDark ? 'bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300')}`}>
                                                <span>{line.name}</span>
                                                {prefLines.includes(line.id) && <CheckCircle size={14} />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button type="submit" disabled={isSaving} className="w-full py-3 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 shadow-lg disabled:opacity-75">{isSaving ? 'Guardando...' : 'Guardar Preferencias'}</button>
                            </form>
                        ) : (
                            <form onSubmit={handleSubmit} className="space-y-5 pb-safe">
                                {(modalType.includes('agent') && !modalType.includes('delete')) && (
                                    <>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Nombre</label>
                                            <input value={formName} onChange={e => setFormName(e.target.value)} className={`w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50 ${isDark ? 'bg-slate-900/50 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} required />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Rol</label>
                                            <select value={formRole} onChange={e => setFormRole(e.target.value)} className={`w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50 ${isDark ? 'bg-slate-900/50 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}>
                                                <option value="Ventas">Ventas</option>
                                                <option value="Taller">Taller</option>
                                                <option value="Admin">Admin</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Contraseña</label>
                                            <input type="password" value={formPass} onChange={e => setFormPass(e.target.value)} placeholder={modalType === 'edit_agent' ? "Nueva contraseña (Opcional)" : "Contraseña (Opcional)"} className={`w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50 ${isDark ? 'bg-slate-900/50 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} />
                                        </div>
                                    </>
                                )}
                                {(modalType.includes('config') && !modalType.includes('delete')) && (
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Nombre {formType === 'Department' ? 'Departamento' : formType === 'Status' ? 'Estado' : 'Etiqueta'}</label>
                                        <input value={formName} onChange={e => setFormName(e.target.value)} placeholder={formType === 'Department' ? "Ej: Ventas" : formType === 'Status' ? "Ej: Abierto" : "Ej: VIP"} className={`w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50 ${isDark ? 'bg-slate-900/50 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} required />
                                    </div>
                                )}
                                {(modalType === 'add_quick_reply' || modalType === 'edit_quick_reply') && (
                                    <>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Título</label>
                                            <input value={qrTitle} onChange={e => setQrTitle(e.target.value)} className={`w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50 ${isDark ? 'bg-slate-900/50 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`} required />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Contenido</label>
                                            <textarea value={qrContent} onChange={e => setQrContent(e.target.value)} className={`w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50 resize-none ${isDark ? 'bg-slate-900/50 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} required />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-400 uppercase ml-1 mb-1 block">Atajo (Opcional)</label>
                                            <input value={qrShortcut} onChange={e => setQrShortcut(e.target.value)} className={`w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50 font-mono ${isDark ? 'bg-slate-900/50 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} />
                                        </div>
                                    </>
                                )}
                                {(modalType.includes('delete')) && <div className={`p-4 rounded-xl text-sm font-medium border ${isDark ? 'bg-red-900/20 text-red-400 border-red-900/30' : 'bg-red-50 text-red-600 border-red-100'}`}>¿Estás seguro? Esta acción es irreversible.</div>}
                                <button type="submit" className={`w-full py-4 rounded-xl font-bold text-white shadow-lg ${modalType.includes('delete') ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-900 hover:bg-slate-800'}`}>Confirmar</button>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}