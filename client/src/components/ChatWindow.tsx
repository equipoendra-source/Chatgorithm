import { useState, useEffect, useRef } from 'react';
import {
    Send, Smile, Paperclip, MessageSquare, User, Briefcase, CheckCircle,
    Image as ImageIcon, X, Mic, Square, FileText, Download, Play, Pause,
    Volume2, VolumeX, ArrowLeft, UserPlus, ChevronDown, ChevronUp, UserCheck, Users,
    Info, Lock, StickyNote, Mail, Phone, MapPin, Calendar, Save, Search,
    LayoutTemplate, Tag, Zap, Bot, UploadCloud, Camera, Megaphone, Loader2, Car, Trash2, FileDown,
    MoreVertical
} from 'lucide-react';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { Contact } from './Sidebar';
import { API_BASE_URL, API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';
import { shouldShowTour, markTourAsComplete, startChatTour } from './ProductTour';
import { exportChatToPdf } from '../services/chatPdfExport';

// Definimos la interfaz aquí para evitar dependencias circulares
interface QuickReply {
    id: string;
    title: string;
    content: string;
    shortcut: string;
}

interface ChatWindowProps {
    socket: any;
    user: { username: string, preferences?: any };
    contact: Contact;
    config?: { departments: string[]; statuses: string[]; tags: string[] };
    onBack: () => void;
    onlineUsers: string[];
    typingInfo: { [chatId: string]: string };
    onOpenTemplates: () => void;
    quickReplies?: QuickReply[];
    currentAccountId?: string; // Recibimos el ID de origen (Multi-cuenta)
    updateMyPreferences?: (partial: any) => void;
}

interface Message {
    text: string;
    sender: string;
    timestamp: string;
    type?: string;
    mediaId?: string;
}

interface Agent {
    id: string;
    name: string;
    role: string;
}

interface SearchMatch {
    msgIndex: number;
    matchIndex: number;
}

const CustomAudioPlayer = ({ src, isMe }: { src: string, isMe: boolean }) => {
    const [isPlaying, setIsPlaying] = useState(false); const [progress, setProgress] = useState(0); const [duration, setDuration] = useState(0); const [currentTime, setCurrentTime] = useState(0); const [playbackRate, setPlaybackRate] = useState(1); const [volume, setVolume] = useState(1); const [isMuted, setIsMuted] = useState(false); const [showVolumeSlider, setShowVolumeSlider] = useState(false); const [audioUrl, setAudioUrl] = useState<string | null>(null); const [isReady, setIsReady] = useState(false); const audioRef = useRef<HTMLAudioElement>(null);
    useEffect(() => { fetch(src).then(r => r.blob()).then(blob => { setAudioUrl(URL.createObjectURL(blob)); setIsReady(true); }).catch(e => console.error(e)); }, [src]);
    useEffect(() => { if (audioRef.current) { audioRef.current.playbackRate = playbackRate; audioRef.current.volume = isMuted ? 0 : volume; } }, [playbackRate, volume, isMuted]);
    const togglePlay = () => { const audio = audioRef.current; if (!audio) return; if (isPlaying) audio.pause(); else audio.play(); setIsPlaying(!isPlaying); };
    const toggleSpeed = () => { const speeds = [1, 1.25, 1.5, 2]; setPlaybackRate(speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length]); };
    const toggleMute = () => setIsMuted(!isMuted);
    const onTimeUpdate = () => { const audio = audioRef.current; if (!audio) return; setCurrentTime(audio.currentTime); setProgress((audio.currentTime / (audio.duration || 1)) * 100); };
    const onLoadedMetadata = (e: any) => setDuration(e.currentTarget.duration);
    const onEnded = () => { setIsPlaying(false); setProgress(0); setCurrentTime(0); };
    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => { const audio = audioRef.current; if (!audio) return; const newTime = (Number(e.target.value) / 100) * duration; audio.currentTime = newTime; setProgress(Number(e.target.value)); };
    const formatTime = (time: number) => { if (isNaN(time)) return "0:00"; const min = Math.floor(time / 60); const sec = Math.floor(time % 60); return `${min}:${sec < 10 ? '0' : ''}${sec}`; };
    if (!isReady) return <div className="text-xs text-slate-400 p-2 italic">Cargando...</div>;
    return (<div className={`flex items-start gap-2 p-2 rounded-xl w-full max-w-[320px] select-none transition-colors ${isMe ? 'bg-white/10 backdrop-blur-sm border border-white/10 text-white' : 'bg-white border border-slate-100'}`}> <audio ref={audioRef} src={audioUrl!} onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata} onEnded={onEnded} className="hidden" /> <button onClick={togglePlay} className={`w-10 h-10 flex items-center justify-center rounded-full transition shadow-sm flex-shrink-0 mt-0.5 ${isMe ? 'bg-white/20 hover:bg-white/30 text-white border border-white/10' : 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'}`}> {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />} </button> <div className="flex-1 flex flex-col gap-1 w-full min-w-0"> <div className="h-5 flex items-center"><input type="range" min="0" max="100" value={progress} onChange={handleSeek} className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer ${isMe ? 'accent-white bg-white/20' : 'accent-indigo-500 bg-indigo-100'}`} /></div> <div className={`flex justify-between items-center text-[10px] font-medium h-5 w-full ${isMe ? 'text-white/80' : 'text-slate-500'}`}> <span className="font-mono tabular-nums min-w-[35px]">{currentTime === 0 && !isPlaying ? formatTime(duration) : formatTime(currentTime)}</span> <div className="flex items-center gap-2"> <button onClick={toggleSpeed} className={`px-1.5 py-0.5 rounded text-[9px] font-bold min-w-[22px] text-center ${isMe ? 'bg-black/20 text-white/90' : 'bg-slate-100 text-slate-600'}`}>{playbackRate}x</button> <div className="relative flex items-center group hidden sm:flex" onMouseEnter={() => setShowVolumeSlider(true)} onMouseLeave={() => setShowVolumeSlider(false)}> <button onClick={toggleMute} className={`p-1 ${isMe ? 'hover:bg-white/10' : 'hover:text-slate-800'}`}><Volume2 className="w-3.5 h-3.5" /></button> {showVolumeSlider && <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-white shadow-xl rounded-lg p-2 z-20"><div className="h-16 w-4 flex items-center justify-center"><input type="range" min="0" max="1" step="0.1" value={isMuted ? 0 : volume} onChange={(e) => { setVolume(parseFloat(e.target.value)); setIsMuted(parseFloat(e.target.value) === 0); }} className="-rotate-90 w-14 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" /></div></div>} </div> <a href={src} download="audio.webm" target="_blank" rel="noreferrer" className={`p-1 rounded-full ${isMe ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}><Download className="w-3.5 h-3.5" /></a> </div> </div> </div> </div>);
};

export function ChatWindow({ socket, user, contact, config, onBack, onlineUsers, typingInfo, onOpenTemplates, quickReplies = [], currentAccountId, updateMyPreferences }: ChatWindowProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);

    // Datos CRM Locales
    const [name, setName] = useState(contact.name || '');
    const [department, setDepartment] = useState(contact.department || '');
    const [status, setStatus] = useState(contact.status || '');
    const [assignedTo, setAssignedTo] = useState(contact.assigned_to || '');
    const [crmEmail, setCrmEmail] = useState('');
    const [crmAddress, setCrmAddress] = useState('');
    const [crmNotes, setCrmNotes] = useState('');
    const [crmSignupDate, setCrmSignupDate] = useState('');
    const [optInMarketing, setOptInMarketing] = useState<boolean>(!!(contact as any).optInMarketing);
    const [savingOptIn, setSavingOptIn] = useState(false);
    // Vehículos registrados del cliente (un cliente puede tener varios)
    const [vehicles, setVehicles] = useState<{ id: string; matricula: string; marca: string; modelo: string; extra: string; notas: string }[]>([]);
    const [vehiclesLoading, setVehiclesLoading] = useState(false);

    const [contactTags, setContactTags] = useState<string[]>(contact.tags || []);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [agents, setAgents] = useState<Agent[]>([]);

    const [showAssignMenu, setShowAssignMenu] = useState(false);
    const [showTagMenu, setShowTagMenu] = useState(false);
    const [showDetailsPanel, setShowDetailsPanel] = useState(false);
    const [isInternalMode, setIsInternalMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showMobileActionsMenu, setShowMobileActionsMenu] = useState(false);

    // Panel "Actividad por trabajador": quién ha hablado con el cliente
    const [showWorkerActivity, setShowWorkerActivity] = useState(false);
    const [workerFilter, setWorkerFilter] = useState<string | null>(null);
    const [cardsCollapsed, setCardsCollapsed] = useState(false);

    const [showQuickRepliesList, setShowQuickRepliesList] = useState(false);

    // Menú móvil que reúne los controles CRM del header (asignación, dpto, status,
    // etiquetas, buscar, exportar). En escritorio estos controles van inline en el
    // header. En móvil se ocultan y se exponen mediante este sheet para que el
    // header quede en una sola fila compacta.
    const [showMobileCrmMenu, setShowMobileCrmMenu] = useState(false);

    const [showSearch, setShowSearch] = useState(false);
    const [chatSearchQuery, setChatSearchQuery] = useState('');
    const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
    const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

    const [isExportingPdf, setIsExportingPdf] = useState(false);

    const handleExportPdf = async () => {
        if (isExportingPdf) return;
        if (messages.length === 0) { alert('No hay mensajes para exportar.'); return; }
        setIsExportingPdf(true);
        try {
            let companyName: string | undefined;
            try {
                const raw = localStorage.getItem('company_config');
                if (raw) companyName = JSON.parse(raw).companyName;
            } catch { /* ignore */ }
            await exportChatToPdf({
                messages,
                contact: { name: name || contact.name, phone: contact.phone },
                companyName
            });
        } catch (e) {
            console.error('[ExportPDF] Error:', e);
            alert('No se pudo generar el PDF.');
        } finally {
            setIsExportingPdf(false);
        }
    };

    // ESTADOS IA
    const [aiThinking, setAiThinking] = useState(false);
    const [isAiActive, setIsAiActive] = useState(false);

    // ESTADOS DRAG & DROP Y ARCHIVOS PENDIENTES
    const [isDragging, setIsDragging] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);

    const matchingQR = quickReplies.find(qr => qr.shortcut && qr.shortcut === input.trim());

    const typingUser = typingInfo[contact.phone] || null;
    const isOnline = onlineUsers.some(u => {
        if (!u) return false;
        const userLower = u.toLowerCase().trim();
        const contactName = (contact.name || '').toLowerCase().trim();
        const contactPhone = (contact.phone || '').replace(/\D/g, '');
        if (contactName && userLower === contactName) return true;
        if (contactPhone && userLower === contactPhone) return true;
        return false;
    });

    const lastTypingTimeRef = useRef<number>(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);

    const API_URL = API_BASE_URL;

    const scrollToBottom = () => {
        if (!chatSearchQuery) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    };
    useEffect(() => scrollToBottom(), [messages]);

    // Timer para duración de grabación
    useEffect(() => {
        let interval: any;
        if (isRecording) {
            interval = setInterval(() => setRecordingDuration(d => d + 1), 1000);
        } else {
            setRecordingDuration(0);
        }
        return () => clearInterval(interval);
    }, [isRecording]);

    const formatRecordingTime = (secs: number) => {
        const m = Math.floor(secs / 60), s = secs % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // --- USE EFFECTS ---
    useEffect(() => {
        setName(contact.name || '');
        setDepartment(contact.department || '');
        setStatus(contact.status || '');
        setAssignedTo(contact.assigned_to || '');
        setCrmEmail(contact.email || '');
        setCrmAddress(contact.address || '');
        setCrmNotes(contact.notes || '');
        setCrmSignupDate(contact.signup_date || '');
        setContactTags(contact.tags || []);
        setOptInMarketing(!!(contact as any).optInMarketing);

        setMessages([]);
        setShowEmojiPicker(false);
        setIsRecording(false);
        setShowAssignMenu(false);
        setShowTagMenu(false);
        setShowDetailsPanel(false);
        setIsInternalMode(false);
        setShowQuickRepliesList(false);

        // Reset estados
        setAiThinking(false);
        setIsAiActive(false);
        setIsDragging(false);
        setPendingFile(null); // Limpiar archivo pendiente al cambiar de chat

        setShowSearch(false);
        setChatSearchQuery('');
        setSearchMatches([]);
        setCurrentMatchIdx(0);

        if (socket && contact.phone) socket.emit('request_conversation', contact.phone);
    }, [contact.id, socket]);

    // --- AUTO-LAUNCH CHAT TOUR ON FIRST CHAT OPENED ---
    useEffect(() => {
        if (shouldShowTour('chat', user?.preferences) && contact.id) {
            // Wait for DOM to render, then start tour
            const timer = setTimeout(() => {
                startChatTour(() => markTourAsComplete('chat', updateMyPreferences));
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [contact.id]); // Trigger when first chat is opened

    // --- LISTENERS DE IA ---
    useEffect(() => {
        if (!socket) return;

        const handleAiStatus = (data: { phone: string, status: string }) => {
            if (data.phone === contact.phone) {
                setAiThinking(data.status === 'thinking');
                if (data.status === 'thinking') scrollToBottom();
            }
        };

        const handleAiActive = (data: { phone: string, active: boolean }) => {
            if (data.phone === contact.phone) {
                setIsAiActive(data.active);
            }
        };

        socket.on('ai_status', handleAiStatus);
        socket.on('ai_active_change', handleAiActive);

        // Al abrir este chat, preguntar al servidor el estado real de Laura
        // para que el botón de IA arranque sincronizado (no por defecto en apagado).
        socket.emit('request_ai_status', { phone: contact.phone });

        return () => {
            socket.off('ai_status', handleAiStatus);
            socket.off('ai_active_change', handleAiActive);
        };
    }, [socket, contact.phone]);

    useEffect(() => {
        if (!chatSearchQuery.trim()) { setSearchMatches([]); setCurrentMatchIdx(0); return; }
        const matches: SearchMatch[] = []; const regex = new RegExp(chatSearchQuery, 'gi');
        messages.forEach((msg, mIndex) => { if (!msg.text) return; const parts = msg.text.match(regex); if (parts) { parts.forEach((_, matchIdx) => { matches.push({ msgIndex: mIndex, matchIndex: matchIdx }); }); } });
        setSearchMatches(matches); setCurrentMatchIdx(Math.max(0, matches.length - 1));
    }, [chatSearchQuery, messages]);

    useEffect(() => { if (searchMatches.length > 0 && searchMatches[currentMatchIdx]) { const { msgIndex, matchIndex } = searchMatches[currentMatchIdx]; const elementId = `match-${msgIndex}-${matchIndex}`; const el = document.getElementById(elementId); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } } }, [currentMatchIdx, searchMatches]);
    const handleNextMatch = () => { if (searchMatches.length === 0) return; setCurrentMatchIdx((prev) => (prev + 1) % searchMatches.length); };
    const handlePrevMatch = () => { if (searchMatches.length === 0) return; setCurrentMatchIdx((prev) => (prev - 1 + searchMatches.length) % searchMatches.length); };

    // [ELIMINADO] useEffect que re-sincronizaba name/tags/status/department/etc.
    // con dependencia [contact] — se disparaba en CADA re-render del contacto y
    // revertía los cambios que el usuario acababa de hacer (bug de los tags: al
    // seleccionar uno, el contacto se recargaba sin él todavía y este efecto lo
    // pisaba). El useEffect de arriba (dep [contact.id]) ya sincroniza todos
    // estos campos al abrir cada chat, que es lo correcto.
    useEffect(() => { if (socket) { socket.emit('request_agents'); const handleAgentsList = (list: Agent[]) => setAgents(list); socket.on('agents_list', handleAgentsList); return () => { socket.off('agents_list', handleAgentsList); }; } }, [socket]);

    // Cargar los vehículos del cliente cuando se abre el panel de detalles
    useEffect(() => {
        if (!showDetailsPanel || !contact.phone) return;
        setVehiclesLoading(true);
        fetch(`${API_URL}/api/contacts/${contact.phone}/vehicles`)
            .then(r => r.json())
            .then(d => setVehicles(Array.isArray(d?.vehicles) ? d.vehicles : []))
            .catch(() => setVehicles([]))
            .finally(() => setVehiclesLoading(false));
    }, [showDetailsPanel, contact.phone]);

    const deleteVehicle = async (vehicleId: string) => {
        try {
            await fetch(`${API_URL}/api/contacts/${contact.phone}/vehicles/${vehicleId}`, { method: 'DELETE' });
            setVehicles(prev => prev.filter(v => v.id !== vehicleId));
        } catch {
            // fallo silencioso — el vehículo sigue visible
        }
    };

    useEffect(() => { const handleHistory = (history: Message[]) => setMessages(history); const handleNewMessage = (msg: any) => { if (msg.sender === contact.phone || msg.sender === 'Agente' || msg.sender === 'Bot IA' || msg.recipient === contact.phone) { setMessages((prev) => [...prev, msg]); } }; if (socket) { socket.on('conversation_history', handleHistory); socket.on('message', handleNewMessage); return () => { socket.off('conversation_history', handleHistory); socket.off('message', handleNewMessage); }; } }, [socket, contact.phone]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { setInput(e.target.value); const now = Date.now(); if (socket && (now - lastTypingTimeRef.current > 2000)) { socket.emit('typing', { user: user.username, phone: contact.phone }); lastTypingTimeRef.current = now; } };

    // --- FUNCIÓN DE ENVÍO UNIFICADA (ARCHIVO Y TEXTO) ---
    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();

        // 1. Si hay archivo pendiente, lo subimos
        if (pendingFile) {
            await uploadFile(pendingFile);
            setPendingFile(null); // Limpiar después de enviar
        }

        // 2. Si hay texto, lo enviamos
        const finalInput = matchingQR ? matchingQR.content : input;
        if (finalInput.trim()) {
            const msg = {
                text: finalInput,
                sender: user.username,
                targetPhone: contact.phone,
                timestamp: new Date().toISOString(),
                type: isInternalMode ? 'note' : 'text',
                originPhoneId: currentAccountId // <--- ENVÍO DEL ID DE ORIGEN
            };
            socket.emit('chatMessage', msg);
            setInput(''); setShowEmojiPicker(false); setIsInternalMode(false);
            // El servidor ya aborta a Laura cuando un agente envía mensaje
            // (aiAbortControllers en chatMessage handler). No hace falta el
            // emit manual antiguo de stop_ai_manual.
        }
    };

    const updateCRM = (field: string, value: any) => { if (socket) { const updates: any = {}; updates[field] = value; if (field === 'assigned_to' && value && status === 'Nuevo') { updates.status = 'Abierto'; setStatus('Abierto'); } socket.emit('update_contact_info', { phone: contact.phone, updates: updates }); } };
    const toggleTag = (tag: string) => { let newTags = [...contactTags]; if (newTags.includes(tag)) { newTags = newTags.filter(t => t !== tag); } else { newTags.push(tag); } setContactTags(newTags); updateCRM('tags', newTags); };
    const saveNotes = () => { updateCRM('notes', crmNotes); setIsSaving(true); setTimeout(() => setIsSaving(false), 2000); };
    const handleToggleOptIn = async () => {
        const newValue = !optInMarketing;
        setOptInMarketing(newValue);
        setSavingOptIn(true);
        try {
            const r = await fetch(`${API_URL}/api/contacts/${contact.phone}/marketing-opt-in`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ optedIn: newValue, source: 'manual_dashboard' })
            });
            if (!r.ok) {
                const err = await r.json().catch(() => ({}));
                alert('No se pudo actualizar opt-in: ' + (err.error || r.statusText));
                setOptInMarketing(!newValue); // revertir
            }
        } catch (e: any) {
            alert('Error de red: ' + e.message);
            setOptInMarketing(!newValue);
        } finally {
            setSavingOptIn(false);
        }
    };
    const handleAssign = (target: 'me' | string) => { if (!socket) return; const updates: any = { status: 'Abierto' }; if (target === 'me') { updates.assigned_to = user.username; setAssignedTo(user.username); } else { updates.department = target; updates.assigned_to = null; setAssignedTo(''); setDepartment(target); } socket.emit('update_contact_info', { phone: contact.phone, updates }); setStatus('Abierto'); setShowAssignMenu(false); };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files && e.target.files[0]) setPendingFile(e.target.files[0]); };

    // Acepta File o Blob. El parámetro filename es necesario al pasar un Blob
    // (ej. audio grabado): `new File()` rompe en builds minificadas de Vite
    // (TypeError: Uf is not a constructor), así que pasamos el Blob directo
    // con el nombre como 3er argumento de FormData.append.
    const uploadFile = async (file: File | Blob, filename?: string) => {
        setIsUploading(true);
        const formData = new FormData();
        if (filename) {
            formData.append('file', file, filename);
        } else {
            formData.append('file', file);
        }
        formData.append('targetPhone', contact.phone);
        formData.append('senderName', user.username);
        formData.append('originPhoneId', currentAccountId || ''); // ENVÍO DE ORIGEN EN ARCHIVOS
        try {
            const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData });
            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Status ${res.status}: ${errText}`);
            }
        } catch (e: any) {
            alert(`Error envio detallado: ${e.message}`);
            console.error("Upload Error:", e);
        }
        finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (cameraInputRef.current) cameraInputRef.current.value = ''; // Clear camera input too
            // El servidor aborta a Laura solo cuando el agente sube archivo
            // (vía el handler de upload que también dispara stop_ai_manual
            // implícito). Ya no hay control manual desde aquí.
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // IMPORTANTE: WhatsApp muestra como NOTA DE VOZ solo si es OGG con Opus
            // Otros formatos (MP4, AAC) se muestran como archivo descargable
            let mimeType = 'audio/webm'; // fallback
            let ext = 'webm';

            // Lista de formatos - OGG Opus PRIMERO para notas de voz de WhatsApp
            const formats = [
                // OGG con Opus - REQUERIDO para notas de voz en WhatsApp
                { mime: 'audio/ogg; codecs=opus', ext: 'ogg' },
                { mime: 'audio/ogg;codecs=opus', ext: 'ogg' },
                { mime: 'audio/ogg', ext: 'ogg' },
                // Webm con opus como segunda opción (puede funcionar)
                { mime: 'audio/webm; codecs=opus', ext: 'webm' },
                { mime: 'audio/webm;codecs=opus', ext: 'webm' },
                // Fallbacks (no se muestran como nota de voz)
                { mime: 'audio/mp4', ext: 'm4a' },
                { mime: 'audio/webm', ext: 'webm' },
            ];

            // Log de formatos soportados para debugging
            console.log('🎤 [Audio] Formatos soportados:');
            formats.forEach(f => {
                const supported = MediaRecorder.isTypeSupported(f.mime);
                console.log(`   ${supported ? '✅' : '❌'} ${f.mime}`);
            });

            // Seleccionar el primer formato soportado
            for (const format of formats) {
                if (MediaRecorder.isTypeSupported(format.mime)) {
                    mimeType = format.mime;
                    ext = format.ext;
                    break;
                }
            }

            console.log(`🎤 [Audio] Formato seleccionado: ${mimeType} (.${ext})`);

            // Configurar MediaRecorder con opciones para WhatsApp
            const mediaRecorder = new MediaRecorder(stream, {
                mimeType,
                audioBitsPerSecond: 32000 // 32kbps recomendado para WhatsApp
            });
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                // WhatsApp acepta: audio/aac, audio/mp4, audio/mpeg, audio/amr, audio/ogg, audio/opus
                // Chrome graba webm pero WhatsApp lo rechaza
                // Si es webm con opus, forzamos a audio/ogg ya que ambos usan codec Opus
                let finalMimeType = mimeType.split(';')[0].trim();
                let finalExt = ext;

                if (finalMimeType === 'audio/webm') {
                    // Forzar a audio/ogg - WhatsApp lo acepta y ambos usan Opus
                    finalMimeType = 'audio/ogg';
                    finalExt = 'ogg';
                    console.log('🎤 [Audio] Convirtiendo WebM -> OGG para WhatsApp');
                }

                const audioBlob = new Blob(audioChunksRef.current, { type: finalMimeType });
                // Pasamos el Blob directo (NO new File) — new File rompe en build minificada de Vite
                console.log(`🎤 [Audio] Blob creado: voice.${finalExt}, tipo: ${finalMimeType}, tamaño: ${audioBlob.size} bytes`);
                await uploadFile(audioBlob, `voice.${finalExt}`);
                stream.getTracks().forEach(t => t.stop());
            };

            mediaRecorder.start();
            setIsRecording(true);
        } catch (e: any) {
            alert(`Error micro: ${e.message}`);
        }
    };
    const stopRecording = () => { if (mediaRecorderRef.current && isRecording) { mediaRecorderRef.current.stop(); setIsRecording(false); } };
    const onEmojiClick = (emojiData: EmojiClickData) => setInput((prev) => prev + emojiData.emoji);
    const safeTime = (time: string) => { try { return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
    const getDateLabel = (dateString: string) => { const date = new Date(dateString); if (isNaN(date.getTime())) return ""; const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1); if (date.toDateString() === today.toDateString()) return "Hoy"; if (date.toDateString() === yesterday.toDateString()) return "Ayer"; return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); };

    const insertQuickReply = (content: string) => { setInput(prev => prev + (prev ? ' ' : '') + content); setShowQuickRepliesList(false); };

    // --- LOGICA DRAG & DROP ---
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget === e.target) {
            setIsDragging(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.size > 25 * 1024 * 1024) { alert("Archivo demasiado grande (Max 25MB)"); return; }
            setPendingFile(file); // SOLO GUARDAMOS, NO ENVIAMOS
        }
    };

    const renderedItems: JSX.Element[] = [];
    let lastDateLabel = "";

    for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        const dateLabel = getDateLabel(m.timestamp);

        if (dateLabel && dateLabel !== lastDateLabel) {
            renderedItems.push(<div key={`date-${dateLabel}-${i}`} className="flex justify-center my-6"><span className="bg-slate-200/80 backdrop-blur-sm text-slate-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide shadow-sm border border-slate-300/50">{dateLabel}</span></div>);
            lastDateLabel = dateLabel;
        }

        const isMe = m.sender !== contact.phone;
        const isNote = m.type === 'note';
        const isTemplate = m.type === 'template';
        const isBot = m.sender === 'Bot IA';

        let messageContent: React.ReactNode = String(m.text || "");

        if (chatSearchQuery && m.text && typeof m.text === 'string') {
            let localMatchCounter = 0;
            const regex = new RegExp(`(${chatSearchQuery})`, 'gi');
            const parts = m.text.split(regex);
            messageContent = (<>{parts.map((part, idx) => { if (part.toLowerCase() === chatSearchQuery.toLowerCase()) { const isCurrentMatch = searchMatches[currentMatchIdx]?.msgIndex === i && searchMatches[currentMatchIdx]?.matchIndex === localMatchCounter; const elementId = `match-${i}-${localMatchCounter}`; localMatchCounter++; return (<span key={idx} id={elementId} className={`font-bold rounded px-0.5 transition-colors duration-300 ${isCurrentMatch ? 'bg-orange-400 text-white ring-2 ring-orange-400' : 'bg-yellow-300 text-slate-900'}`}>{part}</span>); } return <span key={idx}>{part}</span>; })}</>);
        }

        renderedItems.push(
            <div key={i} className={`flex ${isMe || isBot ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <div className={`flex flex-col max-w-[90%] md:max-w-[75%]`}>
                    {isMe && <span className="text-[10px] text-slate-400 font-bold mb-1 block text-right mr-1 uppercase tracking-wide opacity-70">{m.sender === 'Agente' ? 'Yo' : m.sender}</span>}

                    <div className={`p-3.5 rounded-2xl shadow-sm text-sm relative transition-all hover:shadow-md 
                        ${isNote
                            ? (isDark ? 'bg-yellow-900/30 backdrop-blur-md border border-yellow-700/30 text-yellow-200' : 'bg-yellow-50 border border-yellow-200 text-yellow-800')
                            : (isMe || isBot)
                                ? (isDark
                                    ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white rounded-tr-sm border border-white/10 shadow-lg'
                                    : 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white rounded-tr-none shadow-sm')
                                : (isDark
                                    ? 'bg-slate-800/60 backdrop-blur-md border border-white/10 text-slate-200 rounded-tl-sm shadow-lg'
                                    : 'bg-white rounded-tl-none border border-slate-100 shadow-sm')
                        } 
                        ${isTemplate ? (isDark ? 'border-l-4 border-l-emerald-500/80 bg-emerald-900/20' : 'border-l-4 border-l-green-500 bg-green-50') : ''} 
                        ${isBot ? (isDark ? 'border border-purple-500/30 bg-purple-900/20' : 'border-2 border-purple-200 bg-purple-50') : ''}`}>

                        {isNote && <div className={`flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}><Lock className="w-3 h-3" /> Nota Interna</div>}
                        {isTemplate && <div className={`flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-green-400' : 'text-green-700'}`}><LayoutTemplate className="w-3 h-3" /> Plantilla WhatsApp</div>}
                        {isBot && <div className={`flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-purple-400' : 'text-purple-600'}`}><Bot className="w-3 h-3" /> Respuesta Automática</div>}

                        {m.type === 'image' && m.mediaId ? <div className="mb-1 group relative overflow-hidden rounded-lg"><img src={`${API_URL}/api/media/${m.mediaId}`} alt="Imagen" className="max-w-full md:max-w-[280px] h-auto object-contain cursor-pointer transition-transform hover:scale-105" onClick={(e) => { e.stopPropagation(); setSelectedImage(`${API_URL}/api/media/${m.mediaId}`); }} /></div>
                            : m.type === 'video' && m.mediaId ? <div className="mb-1 group relative overflow-hidden rounded-lg"><video src={`${API_URL}/api/media/${m.mediaId}`} controls className="max-w-full md:max-w-[280px] h-auto rounded-lg" /></div>
                            : m.type === 'audio' && m.mediaId ? <CustomAudioPlayer src={`${API_URL}/api/media/${m.mediaId}`} isMe={isMe} />
                                : m.type === 'document' && m.mediaId ? <div className={`flex items-center gap-3 p-3 rounded-xl border min-w-[200px] transition-colors ${isDark ? 'bg-slate-900/50 border-white/10 hover:bg-slate-800/50' : 'bg-slate-50 border-slate-200'}`}><div className={`p-2.5 rounded-full ${isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-500'}`}><FileText className="w-5 h-5" /></div><div className="flex-1 min-w-0"><p className={`font-semibold truncate text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{m.text}</p><p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Documento</p></div><a href={`${API_URL}/api/media/${m.mediaId}`} target="_blank" rel="noopener noreferrer" className={`p-2 rounded-full transition ${isDark ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-400 hover:text-blue-500 hover:bg-slate-100'}`}><Download className="w-4 h-4" /></a></div>
                                    : <p className="whitespace-pre-wrap break-words leading-relaxed">{messageContent}</p>}

                        <span className={`text-[10px] block text-right mt-1.5 opacity-70 ${isNote ? (isDark ? 'text-yellow-500' : 'text-yellow-600') : (isDark ? 'text-slate-400' : 'text-slate-400')}`}>{safeTime(m.timestamp)}</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full bg-transparent relative" onClick={() => { setShowEmojiPicker(false); setShowAssignMenu(false); setShowTagMenu(false); setShowSearch(false); setShowQuickRepliesList(false); }}>
            {selectedImage && <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm" onClick={(e) => { e.stopPropagation(); setSelectedImage(null); }}><button className="absolute top-4 right-4 text-white/70 hover:text-white p-2" onClick={() => setSelectedImage(null)}><X className="w-6 h-6" /></button><img src={selectedImage} alt="Grande" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} /></div>}

            {/* PANEL: Actividad por trabajador — quién ha hablado con el cliente */}
            {showWorkerActivity && (() => {
                const classify = (s: string) => s === contact.phone ? 'client' : (s === 'Bot IA' ? 'bot' : 'worker');
                const PALETTE = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#0ea5e9', '#ef4444', '#14b8a6'];
                const colorFor = (n: string) => n === 'Bot IA' ? '#a855f7' : PALETTE[Math.abs([...(n || '?')].reduce((a, c) => a + c.charCodeAt(0), 0)) % PALETTE.length];
                const initialsOf = (n: string) => (n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
                const fmtShort = (ts: string) => { const d = new Date(ts); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); };
                const previewOf = (m: Message) => m.type === 'image' ? '📷 Imagen' : m.type === 'video' ? '🎬 Vídeo' : m.type === 'audio' ? '🎤 Audio' : m.type === 'document' ? '📄 Documento' : m.type === 'note' ? `📝 ${m.text || ''}` : m.type === 'template' ? `📋 ${m.text || ''}` : (m.text || '');

                // Solo trabajadores ACTIVOS: los borrados/renombrados y "Sistema" se ocultan.
                // Si la lista de agentes aún no ha cargado, no filtramos (fallback seguro).
                const activeNames = new Set(agents.map(a => a.name));
                const hasAgentList = agents.length > 0;
                const isVisibleSender = (s: string) => s === 'Bot IA' || !hasAgentList || activeNames.has(s);

                const stats = new Map<string, { count: number; first: string; last: string }>();
                messages.forEach(m => {
                    if (classify(m.sender) === 'client') return;
                    if (!isVisibleSender(m.sender)) return;
                    const k = m.sender || 'Agente';
                    const ex = stats.get(k) || { count: 0, first: m.timestamp, last: m.timestamp };
                    ex.count++;
                    if (new Date(m.timestamp) < new Date(ex.first)) ex.first = m.timestamp;
                    if (new Date(m.timestamp) > new Date(ex.last)) ex.last = m.timestamp;
                    stats.set(k, ex);
                });
                const workers = Array.from(stats.entries()).sort((a, b) => b[1].count - a[1].count);
                const totalOut = workers.reduce((a, [, s]) => a + s.count, 0);
                const allTs = messages.map(m => new Date(m.timestamp).getTime()).filter(t => !isNaN(t));
                const firstConv = allTs.length ? new Date(Math.min(...allTs)) : null;

                const timeline = messages.filter(m => {
                    if (classify(m.sender) === 'client') return true;
                    if (!isVisibleSender(m.sender)) return false;
                    if (!workerFilter) return true;
                    return (m.sender || 'Agente') === workerFilter;
                });

                const closePanel = () => { setShowWorkerActivity(false); setWorkerFilter(null); setCardsCollapsed(false); };
                const pickWorker = (wname: string) => {
                    const turningOff = workerFilter === wname;
                    setWorkerFilter(turningOff ? null : wname);
                    setCardsCollapsed(!turningOff);
                };

                return (
                    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-0 md:p-4" onClick={closePanel}>
                        <div className={`w-full md:max-w-2xl h-full md:h-[90vh] flex flex-col md:rounded-2xl shadow-2xl overflow-hidden ${isDark ? 'bg-slate-900 border border-white/10' : 'bg-white'}`} onClick={(e) => e.stopPropagation()}>
                            <div className={`p-4 flex items-center justify-between border-b shrink-0 ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
                                <div className="min-w-0">
                                    <h3 className={`font-bold text-base flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-800'}`}><Users className="w-5 h-5 text-indigo-500" /> Actividad con {name || 'el cliente'}</h3>
                                    <p className="text-[11px] text-slate-400 mt-0.5">{workers.length} interlocutor(es) · {totalOut} mensajes enviados{firstConv ? ` · desde el ${firstConv.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : ''}</p>
                                </div>
                                <button onClick={closePanel} className={`p-2 rounded-full flex-shrink-0 ${isDark ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-slate-100 text-slate-400'}`}><X className="w-5 h-5" /></button>
                            </div>

                            {/* Cabecera plegable de la sección de trabajadores */}
                            <button onClick={() => setCardsCollapsed(c => !c)} className={`px-4 py-2.5 flex items-center justify-between border-b shrink-0 transition ${isDark ? 'border-white/10 hover:bg-white/5 text-slate-300' : 'border-slate-100 hover:bg-slate-50 text-slate-600'}`}>
                                <span className="text-xs font-bold uppercase tracking-wide flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Trabajadores ({workers.length})</span>
                                {cardsCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                            </button>

                            {!cardsCollapsed && (
                                <div className={`p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 border-b shrink-0 max-h-[42vh] overflow-y-auto ${isDark ? 'border-white/10' : 'border-slate-100'}`}>
                                    {workers.length === 0 && <p className="col-span-full text-sm text-slate-400 text-center py-4">Ningún trabajador activo ha hablado con este cliente.</p>}
                                    {workers.map(([wname, s]) => {
                                        const col = colorFor(wname);
                                        const active = workerFilter === wname;
                                        return (
                                            <button key={wname} onClick={() => pickWorker(wname)}
                                                className={`text-left p-3 rounded-xl border transition-all ${active ? 'shadow-md' : 'hover:shadow-sm'} ${isDark ? 'bg-slate-800/60 border-white/10' : 'bg-slate-50 border-slate-200'}`}
                                                style={active ? { boxShadow: `0 0 0 2px ${col}` } : {}}>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: col }}>
                                                        {wname === 'Bot IA' ? <Bot className="w-4 h-4" /> : initialsOf(wname)}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className={`text-xs font-bold truncate ${isDark ? 'text-white' : 'text-slate-700'}`}>{wname}</p>
                                                        <p className="text-[10px] text-slate-400">{wname === 'Bot IA' ? 'Asistente IA' : 'Trabajador'}</p>
                                                    </div>
                                                </div>
                                                <p className="text-lg font-bold" style={{ color: col }}>{s.count} <span className="text-[10px] font-medium text-slate-400">msgs</span></p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">{fmtShort(s.first)} – {fmtShort(s.last)}</p>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {workerFilter && <div className="px-4 pt-3 shrink-0"><button onClick={() => { setWorkerFilter(null); setCardsCollapsed(false); }} className="text-xs font-bold text-indigo-500 flex items-center gap-1"><X className="w-3.5 h-3.5" /> Quitar filtro · viendo solo {workerFilter}</button></div>}

                            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                                {timeline.map((m, idx) => {
                                    const isClient = classify(m.sender) === 'client';
                                    const author = isClient ? (name || 'Cliente') : (m.sender || 'Agente');
                                    const col = isClient ? '#94a3b8' : colorFor(m.sender);
                                    return (
                                        <div key={idx} className={`flex ${isClient ? 'justify-start' : 'justify-end'}`}>
                                            <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 border-l-4 ${isDark ? 'bg-slate-800/60' : 'bg-slate-50'}`} style={{ borderLeftColor: col }}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[11px] font-bold" style={{ color: col }}>{author}</span>
                                                    <span className="text-[10px] text-slate-400">{safeTime(m.timestamp)}</span>
                                                </div>
                                                <p className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{previewOf(m)}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                                {timeline.length === 0 && <p className="text-sm text-slate-400 text-center py-8">Sin mensajes para mostrar.</p>}
                            </div>
                        </div>
                    </div>
                );
            })()}

            <div className={`flex flex-col flex-1 min-w-0 h-full border-r ${isDark ? 'border-white/5' : 'border-gray-200'}`}>
                <div className={`border-b p-3 flex gap-2 md:flex-wrap md:gap-3 items-center shadow-sm z-10 shrink-0 ${isDark ? 'bg-slate-900/40 backdrop-blur-md border-white/5' : 'bg-white border-gray-200'}`} onClick={(e) => e.stopPropagation()}>
                    {onBack && <button onClick={onBack} className="md:hidden p-2 rounded-full text-slate-500 hover:bg-slate-100 flex-shrink-0"><ArrowLeft className="w-5 h-5" /></button>}
                    <div className="flex flex-col flex-1 min-w-0 md:flex-initial md:w-auto md:min-w-[200px] md:max-w-[300px]">
                        <div className={`flex items-center gap-2 px-2 rounded-md border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                            <User className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                            <input id="chat-header-name" className={`text-sm font-semibold border-none focus:ring-0 w-full bg-transparent py-1.5 min-w-0 ${isDark ? 'text-white placeholder:text-slate-500' : 'text-slate-700'}`} placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => updateCRM('name', name)} />
                            <button onClick={(e) => { e.stopPropagation(); setWorkerFilter(null); setShowWorkerActivity(true); }} title="Ver quién ha hablado con el cliente" className={`p-1 rounded-md flex-shrink-0 transition ${isDark ? 'text-indigo-400 hover:bg-white/10' : 'text-indigo-500 hover:bg-indigo-50'}`}><Users className="w-4 h-4" /></button>
                        </div>
                        <div className={`overflow-hidden transition-all duration-300 ${(typingUser || isOnline) ? 'max-h-6 opacity-100 mt-1' : 'max-h-0 opacity-0'}`}>
                            {typingUser ? <span className="text-[11px] text-green-600 font-bold flex items-center gap-1.5 bg-green-50 px-2 py-0.5 rounded-full w-fit"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>{typingUser} está escribiendo...</span> : isOnline ? <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 px-1 w-fit"><span className="relative flex h-2 w-2"><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>En línea</span> : null}
                        </div>
                    </div>
                    {/* Header Controls — ESCRITORIO. En móvil están en showMobileCrmMenu. */}
                    {status === 'Nuevo' ? (
                        <div className="hidden md:block relative">
                            <button id="chat-assign-btn" onClick={(e) => { e.stopPropagation(); setShowAssignMenu(!showAssignMenu); }} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-blue-700 transition shadow-sm animate-pulse"><UserPlus className="w-3.5 h-3.5" /> Asignar</button>
                            {showAssignMenu && <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}><div className="p-1"><button onClick={() => handleAssign('me')} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-blue-50 rounded-lg flex items-center gap-2 font-medium transition-colors"><User className="w-4 h-4 text-blue-500" /> A mí ({user.username})</button><div className="h-px bg-slate-100 my-1"></div><p className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Departamentos</p>{config?.departments?.map(dept => (<button key={dept} onClick={() => handleAssign(dept)} className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-purple-50 rounded-lg hover:text-purple-700 flex items-center gap-2 transition-colors"><Briefcase className="w-3.5 h-3.5 opacity-50" /> {dept}</button>))}</div></div>}
                        </div>
                    ) : (
                        <div className="hidden md:flex md:flex-wrap md:gap-3 md:items-center">
                            <div className="flex items-center gap-2 bg-blue-50 px-2 rounded-md border border-blue-200"><UserCheck className="w-4 h-4 text-blue-600" /><select className="text-xs bg-transparent border-none rounded-md py-1.5 pr-6 text-blue-700 focus:ring-0 cursor-pointer font-bold tracking-wide min-w-[120px]" value={assignedTo} onChange={(e) => { setAssignedTo(e.target.value); updateCRM('assigned_to', e.target.value); }}><option value="">Sin Asignar</option>{agents.map(a => (<option key={a.id} value={a.name}>{a.name}</option>))}</select></div>
                            {!assignedTo && <button onClick={() => handleAssign('me')} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-green-700 transition shadow-sm"><UserPlus className="w-3.5 h-3.5" /> Asignarme</button>}
                            <div className="flex items-center gap-2 bg-purple-50 px-2 rounded-md border border-purple-200"><Briefcase className="w-4 h-4 text-purple-600" /><select className="text-xs bg-transparent border-none rounded-md py-1.5 pr-6 text-purple-700 focus:ring-0 cursor-pointer font-bold uppercase tracking-wide" value={department} onChange={(e) => { setDepartment(e.target.value); updateCRM('department', e.target.value); }}><option value="">Sin Dpto</option>{config?.departments?.map(d => <option key={d} value={d}>{d}</option>) || <option value="Ventas">Ventas</option>}</select></div>
                            <div id="chat-status-select" className="flex items-center gap-2 bg-slate-50 px-2 rounded-md border border-slate-200"><CheckCircle className="w-4 h-4 text-slate-400" /><select className="text-xs bg-transparent border-none rounded-md py-1.5 pr-6 text-slate-600 focus:ring-0 cursor-pointer font-medium" value={status} onChange={(e) => { setStatus(e.target.value); updateCRM('status', e.target.value); }}>{config?.statuses?.map(s => <option key={s} value={s}>{s}</option>) || <option value="Nuevo">Nuevo</option>}</select></div>
                            <div className="relative">
                                <button id="chat-tags-btn" onClick={(e) => { e.stopPropagation(); setShowTagMenu(!showTagMenu); }} className="flex items-center gap-2 bg-orange-50 px-2 py-1.5 rounded-md border border-orange-200 text-xs font-bold text-orange-700 hover:bg-orange-100 transition-colors" title="Gestionar Etiquetas"><Tag className="w-3.5 h-3.5" /> {contactTags.length > 0 ? `${contactTags.length} Tags` : 'Tags'}</button>
                                {showTagMenu && (<div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 p-2 animate-in fade-in zoom-in-95" onClick={(e) => e.stopPropagation()}><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 px-2">Seleccionar Etiquetas</p>{config?.tags?.map(tag => { const isActive = contactTags.includes(tag); return (<button key={tag} onClick={() => toggleTag(tag)} className={`w-full text-left px-2 py-1.5 text-xs rounded-lg mb-1 flex items-center justify-between transition-colors ${isActive ? 'bg-orange-50 text-orange-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}>{tag} {isActive && <CheckCircle className="w-3 h-3" />}</button>) })}{(!config?.tags || config.tags.length === 0) && <p className="text-xs text-slate-400 italic px-2">No hay etiquetas.</p>}</div>)}
                            </div>
                        </div>
                    )}
                    <div className="hidden md:block flex-1"></div>

                    {/* Botón móvil "más" — abre el sheet con los controles CRM y acciones */}
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowMobileCrmMenu(true); }}
                        className={`md:hidden p-2 rounded-lg flex-shrink-0 transition relative ${
                            status === 'Nuevo'
                                ? 'bg-blue-600 text-white animate-pulse shadow-sm hover:bg-blue-700'
                                : 'text-slate-400 hover:bg-slate-100'
                        }`}
                        title="Más opciones"
                    >
                        <MoreVertical className="w-5 h-5" />
                        {status === 'Nuevo' && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>}
                    </button>

                    {/* Búsqueda — visible siempre, en móvil se expande a fullwidth */}
                    <div className="relative flex-shrink-0">
                        {showSearch ? (
                            <div className="flex items-center bg-slate-100 rounded-lg px-2 py-1 animate-in fade-in slide-in-from-right-5 absolute right-0 top-0 md:static z-20 shadow-md md:shadow-none w-[calc(100vw-2rem)] sm:w-[280px] max-w-[320px]">
                                <Search className="w-4 h-4 text-slate-400 mr-2 flex-shrink-0" />
                                <input autoFocus className="bg-transparent border-none outline-none text-xs w-full text-slate-700 min-w-0" placeholder="Buscar..." value={chatSearchQuery} onChange={(e) => setChatSearchQuery(e.target.value)} onClick={(e) => e.stopPropagation()} />
                                <div className="flex items-center border-l border-slate-300 pl-2 ml-2 gap-1 flex-shrink-0"><span className="text-[10px] text-slate-400 mr-1">{searchMatches.length > 0 ? `${currentMatchIdx + 1}/${searchMatches.length}` : '0/0'}</span><button onClick={(e) => { e.stopPropagation(); handlePrevMatch(); }} className="p-1 hover:bg-slate-200 rounded text-slate-500" disabled={searchMatches.length === 0}><ChevronUp className="w-3 h-3" /></button><button onClick={(e) => { e.stopPropagation(); handleNextMatch(); }} className="p-1 hover:bg-slate-200 rounded text-slate-500" disabled={searchMatches.length === 0}><ChevronDown className="w-3 h-3" /></button></div><button onClick={(e) => { e.stopPropagation(); setShowSearch(false); setChatSearchQuery(''); }} className="ml-2 p-1 hover:bg-slate-200 rounded-full flex-shrink-0"><X className="w-3 h-3 text-slate-500" /></button>
                            </div>
                        ) : (<button id="chat-search-btn" onClick={(e) => { e.stopPropagation(); setShowSearch(true); }} className="hidden md:flex p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-blue-500 transition" title="Buscar en conversación"><Search className="w-5 h-5" /></button>)}
                    </div>
                    <button
                        id="chat-export-btn"
                        onClick={handleExportPdf}
                        disabled={isExportingPdf}
                        className={`hidden md:flex p-2 rounded-lg transition flex-shrink-0 ${isExportingPdf ? 'text-slate-300 cursor-wait' : 'text-slate-400 hover:bg-slate-100 hover:text-blue-500'}`}
                        title="Exportar conversación a PDF"
                    >
                        {isExportingPdf ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileDown className="w-5 h-5" />}
                    </button>
                    <button id="chat-info-btn" onClick={() => setShowDetailsPanel(!showDetailsPanel)} className={`p-2 rounded-lg transition flex-shrink-0 ${showDetailsPanel ? 'bg-slate-200 text-slate-800' : 'text-slate-400 hover:bg-slate-100'}`} title="Info Cliente"><Info className="w-5 h-5" /></button>
                </div>

                <div
                    className={`flex-1 p-6 overflow-y-auto space-y-4 relative ${isDark ? 'bg-transparent' : 'bg-[#f2f6fc]'}`}
                    id="chat-messages-area"
                    onClick={() => { setShowEmojiPicker(false); setShowAssignMenu(false); setShowTagMenu(false); setShowSearch(false); setShowQuickRepliesList(false); }}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {/* OVERLAY DE DRAG & DROP */}
                    {isDragging && (
                        <div className="absolute inset-0 bg-blue-50/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-4 border-blue-400 border-dashed m-4 rounded-3xl animate-in zoom-in-95 pointer-events-none">
                            <UploadCloud size={64} className="text-blue-500 mb-4 animate-bounce" />
                            <h3 className="text-2xl font-bold text-slate-700">Suelta para subir archivo</h3>
                            <p className="text-slate-500">Imágenes, Documentos, Audio...</p>
                        </div>
                    )}

                    {messages.length === 0 && <div className="flex flex-col items-center justify-center h-full text-slate-400 opacity-60"><MessageSquare className="w-12 h-12 mb-2" /><p className="text-sm">Historial cargado.</p></div>}
                    {renderedItems}
                    {aiThinking && (
                        <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2">
                            <div className="bg-purple-50 text-purple-700 p-3 rounded-xl rounded-tl-none border border-purple-100 shadow-sm flex items-center gap-2">
                                <Bot className="w-4 h-4 animate-bounce" />
                                <span className="text-xs font-bold">IA Escribiendo...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* ... (Resto del Footer con Inputs) ... */}
                {showEmojiPicker && <div className="absolute bottom-20 left-4 z-50 shadow-2xl rounded-xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}><EmojiPicker onEmojiClick={onEmojiClick} width={300} height={400} previewConfig={{ showPreview: false }} /></div>}

                <div className={`safe-bottom-2 border-t relative z-20 transition-colors duration-300 ${isInternalMode ? 'bg-yellow-900/20 border-yellow-500/30 backdrop-blur-sm' : (isDark ? 'bg-slate-900/40 backdrop-blur-md border-white/5' : 'bg-white border-slate-200')} ${isAiActive ? 'border-t-4 border-purple-500 bg-purple-900/10' : ''}`}>

                    {/* BANNERS — ahora hijos normales (no absolute) para que su altura empuje
                        el último mensaje del chat hacia arriba en lugar de taparlo. */}

                    {/* PANEL DE PREVISUALIZACIÓN DE ATAJO */}
                    {matchingQR && (
                        <div className="bg-yellow-50 border-b border-yellow-200 p-2 text-xs text-yellow-800 flex items-center gap-2 animate-in slide-in-from-bottom-2">
                            <Zap className="w-4 h-4 fill-current flex-shrink-0" />
                            <span className="font-bold flex-shrink-0">Atajo detectado:</span>
                            <span className="truncate flex-1 italic font-medium min-w-0">{matchingQR.content}</span>
                            <span className="text-[10px] opacity-70 whitespace-nowrap hidden sm:inline">(Se enviará este texto)</span>
                        </div>
                    )}

                    {/* PANEL DE PREVISUALIZACIÓN DE ARCHIVO */}
                    {pendingFile && (
                        <div className="bg-slate-100 border-b border-slate-200 p-3 flex items-center justify-between animate-in slide-in-from-bottom-2 shadow-sm">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className="bg-white p-2 rounded-lg border border-slate-200 text-blue-500 flex-shrink-0">
                                    {pendingFile.type.startsWith('image') ? <ImageIcon size={20} /> : <FileText size={20} />}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-700 truncate">{pendingFile.name}</p>
                                    <p className="text-[10px] text-slate-400">{(pendingFile.size / 1024 / 1024).toFixed(2)} MB • Listo para enviar</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setPendingFile(null);
                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                    if (cameraInputRef.current) cameraInputRef.current.value = '';
                                }}
                                className="p-1.5 hover:bg-slate-200 rounded-full text-slate-500 transition flex-shrink-0"
                                title="Cancelar subida"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}

                    {/* Banner antiguo "MODALIDAD AUTOMÁTICA ACTIVA" + botón DETENER IA
                        eliminado: ya no encaja con el toggle global único de Laura.
                        El indicador visual de IA pensando queda en el borde morado
                        superior del contenedor del input (border-t-4 border-purple-500). */}

                    {/* INDICADOR DE GRABACIÓN DE AUDIO */}
                    {isRecording && (
                        <div className="bg-red-500 text-white p-3 text-sm font-bold flex items-center justify-center gap-3 animate-in slide-in-from-bottom-2 shadow-lg">
                            <span className="relative flex h-3 w-3 flex-shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                            </span>
                            <Mic className="w-5 h-5 animate-pulse flex-shrink-0" />
                            <span className="text-lg font-mono tracking-wider">{formatRecordingTime(recordingDuration)}</span>
                            <span className="text-xs opacity-80 hidden sm:inline">Grabando audio...</span>
                            <button onClick={stopRecording} className="ml-auto bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition flex-shrink-0">
                                <Square className="w-3 h-3 fill-current" /> Parar
                            </button>
                        </div>
                    )}

                    <form onSubmit={sendMessage} className="flex gap-1 md:gap-2 items-center max-w-5xl mx-auto px-3 pt-3" onClick={(e) => e.stopPropagation()}>
                        <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                        <input
                            type="file"
                            ref={cameraInputRef}
                            className="hidden"
                            accept="image/*"
                            capture="environment"
                            onChange={handleFileSelect}
                        />

                        {/* MENÚ MÓVIL EXPANDIBLE */}
                        <div className="relative md:hidden">
                            <button
                                type="button"
                                onClick={() => setShowMobileActionsMenu(!showMobileActionsMenu)}
                                className={`p-2 rounded-full transition flex-shrink-0 ${showMobileActionsMenu ? 'bg-blue-100 text-blue-600 rotate-45' : 'text-slate-500 hover:bg-slate-200'}`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            </button>
                            {showMobileActionsMenu && (
                                <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-xl border border-slate-100 z-50 p-2 animate-in slide-in-from-bottom-2 fade-in min-w-[180px]">
                                    <button type="button" onClick={() => { cameraInputRef.current?.click(); setShowMobileActionsMenu(false); }} className="w-full text-left px-3 py-2.5 text-sm rounded-lg hover:bg-blue-50 flex items-center gap-3 text-slate-700"><Camera className="w-4 h-4 text-blue-500" /> Cámara</button>
                                    <button type="button" onClick={() => { fileInputRef.current?.click(); setShowMobileActionsMenu(false); }} className="w-full text-left px-3 py-2.5 text-sm rounded-lg hover:bg-slate-50 flex items-center gap-3 text-slate-700"><Paperclip className="w-4 h-4 text-slate-400" /> Adjuntar archivo</button>
                                    <button type="button" onClick={() => { onOpenTemplates(); setShowMobileActionsMenu(false); }} className="w-full text-left px-3 py-2.5 text-sm rounded-lg hover:bg-green-50 flex items-center gap-3 text-slate-700"><LayoutTemplate className="w-4 h-4 text-green-500" /> Plantillas</button>
                                    <button type="button" onClick={() => { setShowQuickRepliesList(true); setShowMobileActionsMenu(false); }} className="w-full text-left px-3 py-2.5 text-sm rounded-lg hover:bg-yellow-50 flex items-center gap-3 text-slate-700"><Zap className="w-4 h-4 text-yellow-500" /> Resp. rápidas</button>
                                    <div className="h-px bg-slate-100 my-1" />
                                    <button type="button" onClick={() => { setIsInternalMode(!isInternalMode); setShowMobileActionsMenu(false); }} className={`w-full text-left px-3 py-2.5 text-sm rounded-lg flex items-center gap-3 ${isInternalMode ? 'bg-yellow-50 text-yellow-700' : 'hover:bg-slate-50 text-slate-700'}`}><StickyNote className="w-4 h-4 text-yellow-500" /> {isInternalMode ? 'Modo normal' : 'Nota interna'}</button>
                                    <button type="button" onClick={() => { setShowEmojiPicker(true); setShowMobileActionsMenu(false); }} className="w-full text-left px-3 py-2.5 text-sm rounded-lg hover:bg-slate-50 flex items-center gap-3 text-slate-700"><Smile className="w-4 h-4 text-slate-400" /> Emojis</button>
                                </div>
                            )}
                        </div>

                        {/* BOTONES ESCRITORIO */}
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className={`p-2 rounded-full transition flex-shrink-0 hidden md:flex ${pendingFile ? 'text-blue-600 bg-blue-100' : 'text-slate-500 hover:bg-slate-200'}`}
                            title="Adjuntar"
                            id="chat-attach-btn"
                        >
                            <Paperclip className="w-5 h-5" />
                        </button>

                        <button id="chat-templates-btn" type="button" onClick={onOpenTemplates} className="p-2 rounded-full text-slate-500 hover:text-green-600 hover:bg-green-50 transition hidden md:flex flex-shrink-0" title="Usar Plantilla"><LayoutTemplate className="w-5 h-5" /></button>

                        <div className="relative hidden md:block">
                            <button id="chat-quick-replies-btn" type="button" onClick={() => setShowQuickRepliesList(!showQuickRepliesList)} className="p-2 rounded-full text-slate-500 hover:text-yellow-600 hover:bg-yellow-50 transition" title="Respuestas Rápidas"><Zap className="w-5 h-5" /></button>
                            {showQuickRepliesList && (
                                <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-xl shadow-xl border border-slate-100 z-50 p-2 animate-in slide-in-from-bottom-2 fade-in">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2 px-2">Respuestas Rápidas</p>
                                    <div className="max-h-60 overflow-y-auto space-y-1">
                                        {quickReplies && quickReplies.length > 0 ? quickReplies.map(qr => (
                                            <button key={qr.id} onClick={() => insertQuickReply(qr.content)} className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-slate-50 transition-colors group">
                                                <div className="font-bold text-slate-700">{qr.title}</div>
                                                <div className="text-[10px] text-slate-500 truncate group-hover:text-slate-600">{qr.content}</div>
                                                {qr.shortcut && <div className="text-[9px] text-yellow-600 font-mono mt-0.5">{qr.shortcut}</div>}
                                            </button>
                                        )) : <div className="text-xs text-slate-400 italic px-2">No hay respuestas configuradas.</div>}
                                    </div>
                                </div>
                            )}
                        </div>

                        <button id="chat-note-btn" type="button" onClick={() => setIsInternalMode(!isInternalMode)} className={`p-2 rounded-full transition-all hidden md:flex flex-shrink-0 ${isInternalMode ? 'text-yellow-600 bg-yellow-200' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'}`} title={isInternalMode ? "Modo Nota Interna (Privado)" : "Cambiar a Nota Interna"}>{isInternalMode ? <Lock className="w-5 h-5" /> : <StickyNote className="w-5 h-5" />}</button>

                        {/* LISTA RESPUESTAS RÁPIDAS MÓVIL */}
                        {showQuickRepliesList && (
                            <div className="md:hidden fixed inset-x-0 bottom-16 mx-2 bg-white rounded-xl shadow-xl border border-slate-100 z-50 p-3 animate-in slide-in-from-bottom-2">
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-xs font-bold text-slate-600">Respuestas Rápidas</p>
                                    <button onClick={() => setShowQuickRepliesList(false)} className="p-1 text-slate-400"><X className="w-4 h-4" /></button>
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                    {quickReplies && quickReplies.length > 0 ? quickReplies.map(qr => (
                                        <button key={qr.id} onClick={() => { insertQuickReply(qr.content); setShowQuickRepliesList(false); }} className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-slate-50 border border-slate-100">
                                            <div className="font-bold text-slate-700">{qr.title}</div>
                                            <div className="text-[10px] text-slate-500 truncate">{qr.content}</div>
                                        </button>
                                    )) : <div className="text-xs text-slate-400 italic">No hay respuestas.</div>}
                                </div>
                            </div>
                        )}

                        <input
                            id="chat-input"
                            type="text"
                            value={input}
                            onChange={handleInputChange}
                            placeholder={isUploading ? "Enviando..." : isRecording ? "Grabando..." : (isInternalMode ? "Nota interna..." : (pendingFile ? "Comentario..." : "Mensaje"))}
                            disabled={isUploading || isRecording}
                            className={`flex-1 min-w-0 py-2.5 md:py-3 px-3 md:px-4 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm transition-all ${isInternalMode
                                ? 'bg-yellow-100 border-yellow-300 placeholder-yellow-600/50 text-yellow-900'
                                : (isDark
                                    ? 'glass-input'
                                    : 'bg-slate-50 border-slate-200'
                                )
                                }`}
                        />

                        <button type="button" className={`p-2 rounded-full transition hidden md:flex flex-shrink-0 ${showEmojiPicker ? 'text-blue-500 bg-blue-50' : 'text-slate-500 hover:bg-slate-200'}`} onClick={() => setShowEmojiPicker(!showEmojiPicker)}><Smile className="w-5 h-5" /></button>

                        {/* BOTÓN ENVIAR INTELIGENTE */}
                        {(input.trim() || pendingFile) ? (
                            <button id="chat-send-btn" type="submit" disabled={isUploading} className={`p-2.5 md:p-3 text-white rounded-full hover:shadow-md transition shadow-sm flex-shrink-0 ${isInternalMode ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-blue-600 hover:bg-blue-700'}`}><Send className="w-5 h-5" /></button>
                        ) : (
                            <button type="button" onClick={isRecording ? stopRecording : startRecording} className={`p-2.5 md:p-3 rounded-full text-white transition shadow-sm flex-shrink-0 ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`} title="Grabar"><Mic className="w-5 h-5" /></button>
                        )}
                    </form>
                </div>
            </div>

            {showDetailsPanel && (
                <div className={`fixed inset-0 md:relative md:inset-auto w-full md:w-80 md:border-l shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300 z-30 ${isDark ? 'glass-panel border-l border-white/5 m-0 rounded-none' : 'bg-white border-gray-200'}`}>
                    <div className={`px-4 pb-4 safe-pt-header border-b flex justify-between items-center ${isDark ? 'border-white/5 bg-transparent' : 'border-gray-100 bg-slate-50/50'}`}><h3 className={`font-bold ${isDark ? 'text-white' : 'text-slate-700'}`}>Detalles del Cliente</h3><button onClick={() => setShowDetailsPanel(false)} className={`p-1 rounded-full transition ${isDark ? 'hover:bg-white/10 text-slate-300' : 'hover:bg-slate-200 text-slate-400'}`}><X className="w-5 h-5" /></button></div>
                    <div className="flex-1 overflow-y-auto p-5 safe-pb-8 space-y-6">
                        <div className="flex flex-col items-center">
                            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-3 border-4 shadow-sm ${isDark ? 'bg-slate-700 text-slate-500 border-slate-600' : 'bg-slate-100 text-slate-300 border-white'}`}>{contact.avatar ? <img src={contact.avatar} className="w-full h-full rounded-full object-cover" /> : <User className="w-10 h-10" />}</div>
                            <h2 className={`text-lg font-bold text-center ${isDark ? 'text-white' : 'text-slate-800'}`}>{name || "Sin nombre"}</h2>
                            <p className="text-sm text-slate-500 flex items-center gap-1 mt-1"><Phone className="w-3 h-3" /> {contact.phone}</p>
                        </div>
                        <div className="space-y-4">
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Email</label><div className={`flex items-center gap-2 p-2 rounded-lg border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}><Mail className="w-4 h-4 text-slate-400" /><input className={`bg-transparent w-full text-sm outline-none ${isDark ? 'text-white placeholder-slate-500' : 'text-slate-700 placeholder-slate-400'}`} placeholder="cliente@email.com" value={crmEmail} onChange={(e) => setCrmEmail(e.target.value)} onBlur={() => updateCRM('email', crmEmail)} /></div></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Dirección</label><div className={`flex items-center gap-2 p-2 rounded-lg border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}><MapPin className="w-4 h-4 text-slate-400" /><input className={`bg-transparent w-full text-sm outline-none ${isDark ? 'text-white placeholder-slate-500' : 'text-slate-700 placeholder-slate-400'}`} placeholder="Calle Ejemplo 123" value={crmAddress} onChange={(e) => setCrmAddress(e.target.value)} onBlur={() => updateCRM('address', crmAddress)} /></div></div>
                            <div><label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Fecha Alta</label><div className={`flex items-center gap-2 p-2 rounded-lg border ${isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'}`}><Calendar className="w-4 h-4 text-slate-400" /><input type="date" className={`bg-transparent w-full text-sm outline-none cursor-pointer ${isDark ? 'text-white scheme-dark' : 'text-slate-700'}`} value={crmSignupDate} onChange={(e) => setCrmSignupDate(e.target.value)} onBlur={() => updateCRM('signup_date', crmSignupDate)} /></div></div>

                            {/* Vehículos del cliente (puede tener varios) */}
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1.5">
                                    <Car className="w-3.5 h-3.5" /> Vehículos {vehicles.length > 0 && `(${vehicles.length})`}
                                </label>
                                {vehiclesLoading ? (
                                    <div className={`text-xs italic p-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Cargando vehículos...</div>
                                ) : vehicles.length === 0 ? (
                                    <div className={`text-xs italic p-2 rounded-lg border ${isDark ? 'bg-slate-700/40 border-slate-600 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                                        Sin vehículos registrados. Se registran solos al reservar una cita.
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {vehicles.map(v => (
                                            <div key={v.id} className={`p-2.5 rounded-lg border ${isDark ? 'bg-slate-700/50 border-slate-600' : 'bg-slate-50 border-slate-200'}`}>
                                                <div className="flex items-center gap-2">
                                                    <Car className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-indigo-400' : 'text-indigo-500'}`} />
                                                    <span className={`text-sm font-bold flex-1 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                                                        {[v.marca, v.modelo].filter(Boolean).join(' ') || 'Vehículo'}
                                                    </span>
                                                    <button
                                                        onClick={() => deleteVehicle(v.id)}
                                                        title="Eliminar vehículo"
                                                        className={`p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors`}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                {v.matricula && (
                                                    <p className={`text-xs mt-0.5 font-mono ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{v.matricula}</p>
                                                )}
                                                {(v.extra || v.notas) && (
                                                    <p className={`text-[11px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                        {[v.extra, v.notas].filter(Boolean).join(' · ')}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Opt-in marketing (RGPD) */}
                            <div className={`rounded-xl p-3 border-2 ${optInMarketing ? (isDark ? 'bg-orange-900/10 border-orange-800/40' : 'bg-orange-50 border-orange-200') : (isDark ? 'bg-slate-800/40 border-slate-700' : 'bg-slate-50 border-slate-200')}`}>
                                <div className="flex items-start gap-3">
                                    <button
                                        type="button"
                                        onClick={handleToggleOptIn}
                                        disabled={savingOptIn}
                                        className={`relative inline-flex h-6 w-11 flex-shrink-0 mt-0.5 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${optInMarketing ? 'bg-gradient-to-r from-orange-500 to-pink-600' : isDark ? 'bg-slate-600' : 'bg-slate-300'}`}>
                                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${optInMarketing ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </button>
                                    <div className="flex-1 min-w-0">
                                        <div className={`flex items-center gap-1.5 font-bold text-xs uppercase ${optInMarketing ? (isDark ? 'text-orange-400' : 'text-orange-700') : (isDark ? 'text-slate-400' : 'text-slate-500')}`}>
                                            <Megaphone className="w-3.5 h-3.5" />
                                            Acepta promociones
                                            {savingOptIn && <Loader2 className="w-3 h-3 animate-spin" />}
                                        </div>
                                        <p className={`mt-0.5 text-[11px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                            {optInMarketing
                                                ? 'Este cliente recibirá tus campañas de marketing por WhatsApp.'
                                                : 'Sin opt-in: NO se le enviarán campañas. Actívalo solo si tienes consentimiento explícito (RGPD).'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className={`rounded-xl p-4 border ${isDark ? 'bg-yellow-900/10 border-yellow-800' : 'bg-yellow-50 border-yellow-100'}`}><div className="flex items-center justify-between mb-2"><div className={`flex items-center gap-2 font-bold text-xs uppercase ${isDark ? 'text-yellow-500' : 'text-yellow-700'}`}><StickyNote className="w-4 h-4" /> Notas Privadas</div>{isSaving && <span className="text-[10px] text-green-600 font-bold animate-pulse">Guardado</span>}</div><textarea className={`w-full border rounded-lg p-2 text-sm outline-none transition-colors resize-none h-32 ${isDark ? 'bg-slate-800/50 border-yellow-900 text-slate-200 focus:bg-slate-800' : 'bg-white/50 border-yellow-200 text-slate-700 focus:bg-white'}`} placeholder="Escribe notas sobre el cliente..." value={crmNotes} onChange={(e) => setCrmNotes(e.target.value)} /><button onClick={saveNotes} className={`mt-2 w-full text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-1 transition-colors ${isDark ? 'bg-yellow-800 hover:bg-yellow-700 text-yellow-100' : 'bg-yellow-200 hover:bg-yellow-300 text-yellow-800'}`}><Save className="w-3 h-3" /> Guardar Notas</button></div>
                    </div>
                </div>
            )}

            {/* SHEET MÓVIL — Controles CRM (asignación / dpto / status / etiquetas / buscar / exportar)
                Solo visible en pantallas <md. En escritorio estos controles están inline en el header. */}
            {showMobileCrmMenu && (
                <div className="md:hidden fixed inset-0 z-[60]" onClick={() => setShowMobileCrmMenu(false)}>
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" />
                    {/* Bottom Sheet */}
                    <div
                        className={`absolute inset-x-0 bottom-0 rounded-t-3xl shadow-2xl border-t animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto safe-pb-8 ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'}`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Handle visual */}
                        <div className="flex justify-center pt-3 pb-1">
                            <div className={`w-12 h-1.5 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`}></div>
                        </div>

                        {/* Header del sheet */}
                        <div className={`flex items-center justify-between px-5 pb-3 border-b ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                            <h3 className={`font-bold text-base ${isDark ? 'text-white' : 'text-slate-800'}`}>Gestionar chat</h3>
                            <button onClick={() => setShowMobileCrmMenu(false)} className={`p-1.5 rounded-full transition ${isDark ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 space-y-5">
                            {/* CASO A: Status === 'Nuevo' → mostrar "Asignar a" como lista */}
                            {status === 'Nuevo' ? (
                                <div>
                                    <label className={`text-xs font-bold uppercase tracking-wide mb-2 flex items-center gap-1.5 ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                                        <UserPlus className="w-3.5 h-3.5" /> Asignar este chat
                                    </label>
                                    <div className="space-y-1.5">
                                        <button
                                            onClick={() => { handleAssign('me'); setShowMobileCrmMenu(false); }}
                                            className={`w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 font-semibold transition ${isDark ? 'bg-blue-900/30 hover:bg-blue-900/50 text-blue-200 border border-blue-800' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'}`}
                                        >
                                            <User className="w-4 h-4" /> A mí ({user.username})
                                        </button>
                                        <p className={`text-[10px] font-bold uppercase tracking-wide px-1 pt-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Departamentos</p>
                                        {config?.departments?.map(dept => (
                                            <button
                                                key={dept}
                                                onClick={() => { handleAssign(dept); setShowMobileCrmMenu(false); }}
                                                className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 text-sm transition ${isDark ? 'hover:bg-slate-800 text-slate-300 border border-slate-700' : 'hover:bg-purple-50 text-slate-600 hover:text-purple-700 border border-slate-200'}`}
                                            >
                                                <Briefcase className="w-4 h-4 opacity-60" /> {dept}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Asignado a */}
                                    <div>
                                        <label className={`text-xs font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1.5 ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                                            <UserCheck className="w-3.5 h-3.5" /> Asignado a
                                        </label>
                                        <div className="flex items-center gap-2">
                                            <select
                                                className={`flex-1 text-sm rounded-xl py-2.5 px-3 border focus:ring-2 outline-none transition ${isDark ? 'bg-slate-800 border-slate-700 text-white focus:ring-blue-500/40' : 'bg-blue-50 border-blue-200 text-blue-700 focus:ring-blue-400'}`}
                                                value={assignedTo}
                                                onChange={(e) => { setAssignedTo(e.target.value); updateCRM('assigned_to', e.target.value); }}
                                            >
                                                <option value="">Sin asignar</option>
                                                {agents.map(a => (<option key={a.id} value={a.name}>{a.name}</option>))}
                                            </select>
                                            {!assignedTo && (
                                                <button
                                                    onClick={() => { handleAssign('me'); setShowMobileCrmMenu(false); }}
                                                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1 flex-shrink-0 transition shadow-sm whitespace-nowrap"
                                                >
                                                    <UserPlus className="w-3.5 h-3.5" /> A mí
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Departamento */}
                                    <div>
                                        <label className={`text-xs font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1.5 ${isDark ? 'text-purple-400' : 'text-purple-700'}`}>
                                            <Briefcase className="w-3.5 h-3.5" /> Departamento
                                        </label>
                                        <select
                                            className={`w-full text-sm rounded-xl py-2.5 px-3 border focus:ring-2 outline-none transition ${isDark ? 'bg-slate-800 border-slate-700 text-white focus:ring-purple-500/40' : 'bg-purple-50 border-purple-200 text-purple-700 focus:ring-purple-400'}`}
                                            value={department}
                                            onChange={(e) => { setDepartment(e.target.value); updateCRM('department', e.target.value); }}
                                        >
                                            <option value="">Sin departamento</option>
                                            {config?.departments?.map(d => <option key={d} value={d}>{d}</option>) || <option value="Ventas">Ventas</option>}
                                        </select>
                                    </div>

                                    {/* Estado */}
                                    <div>
                                        <label className={`text-xs font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                            <CheckCircle className="w-3.5 h-3.5" /> Estado del chat
                                        </label>
                                        <select
                                            className={`w-full text-sm rounded-xl py-2.5 px-3 border focus:ring-2 outline-none transition ${isDark ? 'bg-slate-800 border-slate-700 text-white focus:ring-slate-500/40' : 'bg-slate-50 border-slate-200 text-slate-700 focus:ring-slate-400'}`}
                                            value={status}
                                            onChange={(e) => { setStatus(e.target.value); updateCRM('status', e.target.value); }}
                                        >
                                            {config?.statuses?.map(s => <option key={s} value={s}>{s}</option>) || <option value="Nuevo">Nuevo</option>}
                                        </select>
                                    </div>

                                    {/* Etiquetas */}
                                    <div>
                                        <label className={`text-xs font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1.5 ${isDark ? 'text-orange-400' : 'text-orange-700'}`}>
                                            <Tag className="w-3.5 h-3.5" /> Etiquetas {contactTags.length > 0 && <span className="text-[10px] opacity-75">({contactTags.length})</span>}
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {config?.tags?.map(tag => {
                                                const isActive = contactTags.includes(tag);
                                                return (
                                                    <button
                                                        key={tag}
                                                        onClick={() => toggleTag(tag)}
                                                        className={`text-xs font-semibold px-3 py-2 rounded-full border flex items-center gap-1.5 transition ${isActive ? 'bg-orange-500 text-white border-orange-600 shadow-sm' : (isDark ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700' : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100')}`}
                                                    >
                                                        {tag}
                                                        {isActive && <CheckCircle className="w-3 h-3" />}
                                                    </button>
                                                );
                                            })}
                                            {(!config?.tags || config.tags.length === 0) && <p className={`text-xs italic ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>No hay etiquetas configuradas.</p>}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Acciones — buscar, exportar */}
                            <div className={`pt-3 mt-1 border-t space-y-1.5 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                                <button
                                    onClick={() => { setShowMobileCrmMenu(false); setShowSearch(true); }}
                                    className={`w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition ${isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-slate-50 text-slate-700'}`}
                                >
                                    <Search className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} /> Buscar en la conversación
                                </button>
                                <button
                                    onClick={() => { setShowMobileCrmMenu(false); handleExportPdf(); }}
                                    disabled={isExportingPdf}
                                    className={`w-full text-left px-3 py-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition disabled:opacity-50 ${isDark ? 'hover:bg-slate-800 text-slate-200' : 'hover:bg-slate-50 text-slate-700'}`}
                                >
                                    {isExportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />}
                                    {isExportingPdf ? 'Exportando…' : 'Exportar conversación a PDF'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}