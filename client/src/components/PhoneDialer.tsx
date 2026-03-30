import React, { useState, useEffect } from 'react';
import { Device } from '@twilio/voice-sdk';
import { Phone, X, Delete, Mic, MicOff, PhoneOff, AlertTriangle } from 'lucide-react';
import { API_URL } from '../config/api';
import { useTheme } from '../context/ThemeContext';

interface PhoneDialerProps {
    isOpen: boolean;
    onClose: () => void;
    initialNumber?: string;
}

export function PhoneDialer({ isOpen, onClose, initialNumber = '' }: PhoneDialerProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [number, setNumber] = useState(initialNumber);
    const [status, setStatus] = useState('Inactivo'); // Inactivo, Listo, Llamando, En llamada, Error
    const [device, setDevice] = useState<Device | null>(null);
    const [activeConnection, setActiveConnection] = useState<any>(null);
    const [isMuted, setIsMuted] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');

    // --- EFECTOS ---

    // Inicializar Twilio al abrir
    useEffect(() => {
        if (isOpen && !device) {
            setupDevice();
        }
        return () => {
            if (device) {
                device.destroy();
                setDevice(null);
            }
        };
    }, [isOpen]);

    // Timer de duración
    useEffect(() => {
        let interval: any;
        if (status === 'En llamada') {
            interval = setInterval(() => setCallDuration(p => p + 1), 1000);
        } else {
            setCallDuration(0);
        }
        return () => clearInterval(interval);
    }, [status]);

    // --- LÓGICA TWILIO ---

    const setupDevice = async () => {
        setStatus('Conectando...');
        setErrorMsg('');

        try {
            // Pedir token al backend
            const response = await fetch(`${API_URL}/voice/token`);
            if (!response.ok) throw new Error("Error obteniendo token");

            const data = await response.json();

            // Crear dispositivo Twilio
            // FIX: Casting 'as any' para evitar error de tipos con 'opus' y 'pcmu'
            const newDevice = new Device(data.token, {
                codecPreferences: ['opus', 'pcmu'] as any,
                logLevel: 'error'
            });

            // Listeners de eventos (SDK 2.x usa 'registered' en lugar de 'ready')
            newDevice.on('registered', () => {
                console.log("✅ [Twilio] Device registrado correctamente");
                setStatus('Listo');
            });

            newDevice.on('unregistered', () => {
                console.log("⚠️ [Twilio] Device desregistrado");
                setStatus('Desconectado');
            });

            newDevice.on('error', (error: any) => {
                console.error("❌ [Twilio] Error:", error);
                setStatus('Error');
                setErrorMsg(error.message || "Fallo de conexión");
            });

            // En SDK 2.x, las llamadas entrantes usan 'incoming'
            newDevice.on('incoming', (call: any) => {
                console.log("📞 [Twilio] Llamada entrante de:", call.parameters.From);
                call.accept();
                setActiveConnection(call);
                setStatus('En llamada');
            });

            // Token próximo a expirar
            newDevice.on('tokenWillExpire', async () => {
                console.log("🔄 [Twilio] Token expirando, renovando...");
                try {
                    const response = await fetch(`${API_URL}/voice/token`);
                    const data = await response.json();
                    newDevice.updateToken(data.token);
                } catch (e) {
                    console.error("Error renovando token:", e);
                }
            });

            // Registrar dispositivo
            await newDevice.register();
            console.log("📱 [Twilio] Registro iniciado...");
            setDevice(newDevice);

        } catch (e: any) {
            console.error(e);
            setStatus('Error Token');
            setErrorMsg("No se pudo iniciar el teléfono. Verifica credenciales.");
        }
    };

    const handleCall = async () => {
        if (!device || !number) return;
        setStatus('Llamando...');
        try {
            // Solicitar permiso de micrófono antes de llamar (necesario en móvil)
            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (permError: any) {
                console.error("❌ [Twilio] Permiso de micrófono denegado:", permError);
                setStatus('Error');
                setErrorMsg('Permiso de micrófono denegado. Actívalo en ajustes.');
                return;
            }

            // Twilio espera E.164 (+34...)
            // Si no empieza por +, asumimos España (+34)
            const formattedNumber = number.startsWith('+') ? number : `+34${number}`;
            console.log("📞 [Twilio] Llamando a:", formattedNumber);
            const params = { To: formattedNumber };
            const call = await device.connect({ params });

            // Event listeners del objeto Call (SDK 2.x)
            // NOTA: Para llamadas salientes, el orden es:
            // 1. connect() inicia la llamada
            // 2. 'accept' se dispara cuando WebRTC conecta con Twilio
            // 3. 'ringing' se dispara cuando el teléfono remoto empieza a sonar
            // No hay evento explícito de "answered" - detectamos por cambio en audio

            let hasStartedRinging = false;

            call.on('accept', () => {
                console.log("✅ [Twilio] Conexión WebRTC establecida");
                // Esperamos a 'ringing' antes de considerar conectada
            });

            call.on('ringing', (hasEarlyMedia: boolean) => {
                console.log("🔔 [Twilio] Llamada sonando... hasEarlyMedia:", hasEarlyMedia);
                hasStartedRinging = true;
                setStatus('Sonando...');

                // Cuando hay early media (tono de llamada), podemos detectar
                // cuando el tono cambia (el otro contesta) monitoreando el volumen
                // Por ahora, usamos un enfoque simple: después de empezar a sonar,
                // asumimos que si sigue conectado después de unos segundos, contestaron
                if (hasEarlyMedia) {
                    let callAnswered = false;
                    // El SDK tiene eventos de volumen que podemos usar
                    call.on('volume', (inputVolume: number, outputVolume: number) => {
                        // Cuando outputVolume sube significativamente (voz en lugar de tono)
                        // significa que contestaron. El tono de ringback suele ser bajo y constante,
                        // mientras que la voz varía más.
                        if (!callAnswered && hasStartedRinging && outputVolume > 0.1) {
                            console.log("📞 [Twilio] Audio detectado, llamada contestada");
                            setStatus('En llamada');
                            callAnswered = true; // Evitar múltiples actualizaciones
                        }
                    });
                }
            });

            call.on('disconnect', () => {
                console.log("📴 [Twilio] Llamada finalizada");
                setActiveConnection(null);
                setStatus('Listo');
            });

            call.on('cancel', () => {
                console.log("❌ [Twilio] Llamada cancelada");
                setActiveConnection(null);
                setStatus('Listo');
            });

            call.on('error', (error: any) => {
                console.error("❌ [Twilio] Error en llamada:", error);
                setActiveConnection(null);
                setStatus('Error');
                setErrorMsg(error.message || "Error en la llamada");
            });

            setActiveConnection(call);
        } catch (e: any) {
            console.error("Error iniciando llamada:", e);
            setStatus('Error');
            setErrorMsg(e.message || "No se pudo realizar la llamada");
        }
    };

    const handleHangup = () => {
        if (activeConnection) {
            activeConnection.disconnect();
        } else if (device) {
            device.disconnectAll();
        }
        setStatus('Listo');
    };

    const handleDigit = (digit: string) => {
        setNumber(prev => prev + digit);
        // Si estamos en llamada, enviar DTMF
        if (activeConnection && status === 'En llamada') {
            activeConnection.sendDigits(digit);
        }
    };

    const toggleMute = () => {
        if (activeConnection) {
            const newState = !isMuted;
            activeConnection.mute(newState);
            setIsMuted(newState);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
            <div className={`rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col relative ${isDark ? 'bg-slate-800' : 'bg-white'}`}>

                {/* Header / Pantalla */}
                <div className={`p-6 text-white text-center relative transition-colors duration-500 ${status === 'En llamada' ? 'bg-green-600' : status.includes('Error') ? 'bg-red-600' : 'bg-slate-900'}`}>
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20 transition"><X size={18} /></button>

                    <div className="text-xs font-bold uppercase tracking-widest opacity-80 mb-2">{status}</div>

                    {errorMsg ? (
                        <div className="flex flex-col items-center gap-2 text-red-100">
                            <AlertTriangle />
                            <p className="text-xs">{errorMsg}</p>
                        </div>
                    ) : (
                        <>
                            <div className="text-3xl font-mono tracking-wider mb-2 truncate px-4">{number || "Marca..."}</div>
                            {status === 'En llamada' && <div className="text-xl font-bold animate-pulse">{formatTime(callDuration)}</div>}
                        </>
                    )}
                </div>

                {/* Keypad */}
                <div className={`p-6 flex-1 ${isDark ? 'bg-slate-900 border-t border-slate-700' : 'bg-slate-50'}`}>
                    <div className="grid grid-cols-3 gap-4 mb-8">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                            <button
                                key={digit}
                                onClick={() => handleDigit(digit)}
                                className={`h-16 w-16 mx-auto rounded-full shadow-sm text-2xl font-bold flex items-center justify-center transition-all outline-none focus:ring-2 focus:ring-blue-200 active:scale-95 ${isDark
                                        ? 'bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 active:bg-slate-600'
                                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 active:bg-slate-200'
                                    }`}
                            >
                                {digit}
                            </button>
                        ))}
                    </div>

                    <div className="flex justify-center items-center gap-6">
                        {status === 'En llamada' || status === 'Llamando...' ? (
                            <>
                                <button onClick={toggleMute} className={`p-4 rounded-full transition ${isMuted ? 'bg-yellow-100 text-yellow-600' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                                    {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                                </button>
                                <button onClick={handleHangup} className="p-5 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 active:scale-95 transition-transform">
                                    <PhoneOff size={32} fill="currentColor" />
                                </button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => setNumber(prev => prev.slice(0, -1))} className={`p-4 rounded-full transition ${isDark ? 'text-slate-500 hover:text-slate-300 hover:bg-slate-800' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200'}`}>
                                    <Delete size={24} />
                                </button>
                                <button onClick={handleCall} disabled={!number} className="p-5 rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed">
                                    <Phone size={32} fill="currentColor" />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}