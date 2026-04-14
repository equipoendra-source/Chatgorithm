import React, { useState, useEffect, useRef } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { Phone, PhoneOff, PhoneIncoming, User } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { API_URL as SHARED_API_URL } from '../config/api';

/**
 * Componente global que siempre escucha llamadas entrantes de Twilio.
 * Se monta una vez en App.tsx y permanece activo.
 */
export function IncomingCallHandler() {
    const { theme } = useTheme();
    const isDark = theme === 'dark';

    const [device, setDevice] = useState<Device | null>(null);
    const [incomingCall, setIncomingCall] = useState<Call | null>(null);
    const [callStatus, setCallStatus] = useState<'idle' | 'ringing' | 'connected'>('idle');
    const [callerNumber, setCallerNumber] = useState('');
    const [callDuration, setCallDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isRegistered, setIsRegistered] = useState(false);

    const ringtoneRef = useRef<HTMLAudioElement | null>(null);

    // Inicializar dispositivo Twilio al montar
    useEffect(() => {
        initDevice();
        return () => {
            if (device) {
                device.destroy();
            }
        };
    }, []);

    // Timer de duración
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (callStatus === 'connected') {
            interval = setInterval(() => setCallDuration(p => p + 1), 1000);
        } else {
            setCallDuration(0);
        }
        return () => clearInterval(interval);
    }, [callStatus]);

    // Ringtone
    useEffect(() => {
        if (callStatus === 'ringing' && ringtoneRef.current) {
            ringtoneRef.current.play().catch(() => { });
        } else if (ringtoneRef.current) {
            ringtoneRef.current.pause();
            ringtoneRef.current.currentTime = 0;
        }
    }, [callStatus]);

    const initDevice = async () => {
        try {
            // URL de producción o local
            const API_URL = SHARED_API_URL;

            console.log('📞 [IncomingCallHandler] Obteniendo token Twilio...');
            const response = await fetch(`${API_URL}/voice/token`);
            if (!response.ok) {
                console.error('❌ Error obteniendo token');
                return;
            }

            const data = await response.json();
            console.log('✅ Token obtenido para:', data.identity);

            // Crear dispositivo
            const newDevice = new Device(data.token, {
                codecPreferences: ['opus', 'pcmu'] as any,
                logLevel: 'error'
            });

            // Eventos del dispositivo
            newDevice.on('registered', () => {
                console.log('✅ [IncomingCallHandler] Device registrado - Listo para recibir llamadas');
                setIsRegistered(true);
            });

            newDevice.on('unregistered', () => {
                console.log('⚠️ [IncomingCallHandler] Device desregistrado');
                setIsRegistered(false);
            });

            newDevice.on('error', (error: any) => {
                console.error('❌ [IncomingCallHandler] Error:', error);
            });

            // LLAMADAS ENTRANTES
            newDevice.on('incoming', (call: Call) => {
                console.log('📲 [IncomingCallHandler] LLAMADA ENTRANTE!', call.parameters);

                const from = call.parameters?.From || 'Número desconocido';
                setCallerNumber(from);
                setIncomingCall(call);
                setCallStatus('ringing');

                // Eventos del call
                call.on('disconnect', () => {
                    console.log('📴 Llamada desconectada');
                    resetCall();
                });

                call.on('cancel', () => {
                    console.log('❌ Llamada cancelada por el remitente');
                    resetCall();
                });
            });

            // Token expirando
            newDevice.on('tokenWillExpire', async () => {
                console.log('🔄 Renovando token...');
                try {
                    const res = await fetch(`${API_URL}/voice/token`);
                    const newData = await res.json();
                    newDevice.updateToken(newData.token);
                } catch (e) {
                    console.error('Error renovando token:', e);
                }
            });

            // Registrar
            await newDevice.register();
            setDevice(newDevice);

        } catch (error) {
            console.error('❌ Error inicializando Twilio:', error);
        }
    };

    const resetCall = () => {
        setIncomingCall(null);
        setCallStatus('idle');
        setCallerNumber('');
        setCallDuration(0);
        setIsMuted(false);
    };

    const acceptCall = () => {
        if (incomingCall) {
            console.log('✅ Aceptando llamada...');
            incomingCall.accept();
            setCallStatus('connected');
        }
    };

    const rejectCall = () => {
        if (incomingCall) {
            console.log('❌ Rechazando llamada...');
            incomingCall.reject();
            resetCall();
        }
    };

    const hangupCall = () => {
        if (incomingCall) {
            incomingCall.disconnect();
            resetCall();
        }
    };

    const toggleMute = () => {
        if (incomingCall) {
            const newState = !isMuted;
            incomingCall.mute(newState);
            setIsMuted(newState);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    // No renderizar nada si no hay llamada
    if (callStatus === 'idle') {
        return (
            <>
                {/* Audio element para el ringtone */}
                <audio ref={ringtoneRef} loop>
                    <source src="https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3" type="audio/mpeg" />
                </audio>
                {/* Indicador silencioso de estado (opcional, debugging) */}
                {/* {isRegistered && <div className="fixed bottom-2 left-2 text-xs text-green-500">📞 Listo</div>} */}
            </>
        );
    }

    return (
        <>
            {/* Audio del ringtone */}
            <audio ref={ringtoneRef} loop>
                <source src="https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3" type="audio/mpeg" />
            </audio>

            {/* Modal de llamada entrante */}
            <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
                <div className={`rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-white'}`}>

                    {/* Header */}
                    <div className={`p-8 text-white text-center ${callStatus === 'connected' ? 'bg-green-600' : 'bg-gradient-to-br from-blue-600 to-indigo-700'}`}>

                        {/* Icono animado */}
                        <div className={`w-20 h-20 mx-auto mb-4 rounded-full bg-white/20 flex items-center justify-center ${callStatus === 'ringing' ? 'animate-pulse' : ''}`}>
                            {callStatus === 'ringing' ? (
                                <PhoneIncoming size={40} className="animate-bounce" />
                            ) : (
                                <User size={40} />
                            )}
                        </div>

                        <div className="text-sm font-medium uppercase tracking-wider opacity-80 mb-2">
                            {callStatus === 'ringing' ? 'Llamada entrante' : 'En llamada'}
                        </div>

                        <div className="text-2xl font-bold mb-1">{callerNumber}</div>

                        {callStatus === 'connected' && (
                            <div className="text-xl font-mono animate-pulse">{formatTime(callDuration)}</div>
                        )}
                    </div>

                    {/* Botones */}
                    <div className={`p-8 flex justify-center gap-6 ${isDark ? 'bg-slate-900 border-t border-slate-700' : 'bg-slate-50'}`}>
                        {callStatus === 'ringing' ? (
                            <>
                                {/* Rechazar */}
                                <button
                                    onClick={rejectCall}
                                    className="w-16 h-16 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center"
                                >
                                    <PhoneOff size={28} />
                                </button>

                                {/* Aceptar */}
                                <button
                                    onClick={acceptCall}
                                    className="w-16 h-16 rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 active:scale-95 transition-all flex items-center justify-center animate-pulse"
                                >
                                    <Phone size={28} />
                                </button>
                            </>
                        ) : (
                            <>
                                {/* Mute */}
                                <button
                                    onClick={toggleMute}
                                    className={`w-14 h-14 rounded-full transition-all flex items-center justify-center ${isMuted
                                        ? 'bg-yellow-100 text-yellow-600'
                                        : (isDark ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' : 'bg-slate-200 text-slate-600 hover:bg-slate-300')
                                        }`}
                                >
                                    {isMuted ? '🔇' : '🎤'}
                                </button>

                                {/* Colgar */}
                                <button
                                    onClick={hangupCall}
                                    className="w-16 h-16 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center"
                                >
                                    <PhoneOff size={28} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
