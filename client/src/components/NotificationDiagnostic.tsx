import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle, XCircle, AlertTriangle, Send } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications, Token } from '@capacitor/push-notifications';
import { pushNotificationService } from '../services/pushNotifications';

export const NotificationDiagnostic: React.FC = () => {
    const platform = Capacitor.getPlatform();
    const isNative = platform !== 'web';

    const [status, setStatus] = useState<any>({
        permission: 'loading',
        fcmToken: '',
        swRegistered: 'loading',
        webSubscription: 'loading',
        browserSupport: 'Notification' in window && 'serviceWorker' in navigator
    });

    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => {
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)]);
    };

    const checkStatus = async () => {
        addLog(`Plataforma detectada: ${platform.toUpperCase()}`);

        if (isNative) {
            try {
                const permStatus = await PushNotifications.checkPermissions();
                setStatus((prev: any) => ({
                    ...prev,
                    permission: permStatus.receive
                }));
                addLog(`Permiso Nativo: ${permStatus.receive}`);

                if (permStatus.receive === 'granted') {
                    addLog('Buscando persistencia del token FCM...');
                    // Intentamos registrar de nuevo para asegurar que el token salta si no ha saltado
                    // En FCM, register() devolverá un evento si hay token
                }
            } catch (error: any) {
                addLog(`❌ Error Capacitator: ${error.message || JSON.stringify(error)}`);
            }
        } else {
            if (!status.browserSupport) {
                addLog('❌ Navegador no soporta notificaciones Web');
                return;
            }

            const permission = Notification.permission;
            const registration = await navigator.serviceWorker.getRegistration();
            const subscription = await registration?.pushManager.getSubscription();

            setStatus((prev: any) => ({
                ...prev,
                swRegistered: !!registration,
                permission: permission,
                webSubscription: !!subscription
            }));

            addLog(`Estado Web: SW=${!!registration}, Permiso=${permission}, Sub=${!!subscription}`);
        }
    };

    useEffect(() => {
        checkStatus();

        if (isNative) {
            // Escuchar el evento del token manualmente para depuración en pantalla
            const tokenListener = PushNotifications.addListener('registration', (token: Token) => {
                const cleanToken = token.value;
                setStatus((prev: any) => ({ ...prev, fcmToken: cleanToken }));
                addLog(`✅ FCM Capturado: ${cleanToken.substring(0, 20)}...`);
            });
            const errorListener = PushNotifications.addListener('registrationError', (error: any) => {
                addLog(`❌ FCM Error Registro: ${JSON.stringify(error)}`);
            });

            return () => {
                tokenListener.then(l => l.remove());
                errorListener.then(l => l.remove());
            };
        }
    }, [isNative]);

    const requestPermission = async () => {
        addLog('Solicitando permiso...');
        if (isNative) {
            try {
                const permStatus = await PushNotifications.requestPermissions();
                addLog(`Resultado Permiso Nativo: ${permStatus.receive}`);
                if (permStatus.receive === 'granted') {
                    addLog('Permiso concedido. Pidiendo Token a FCM...');
                    await PushNotifications.register();
                } else {
                    addLog('❌ Permiso de notificaciones denegado en Android');
                }
            } catch (e: any) {
                addLog(`❌ Error pidiendo permiso: ${e.message}`);
            }
        } else {
            const result = await Notification.requestPermission();
            addLog(`Resultado Permiso Web: ${result}`);
        }
        checkStatus();
    };

    const triggerRegistration = async () => {
        if (isNative) {
            addLog('Forzando registro manual FCM...');
            try {
                await pushNotificationService.initialize();
                await PushNotifications.register();
            } catch (e: any) {
                addLog(`❌ Error forzando registro: ${e.message}`);
            }
        } else {
            addLog('Limpiando suscripción antigua Web...');
            try {
                const registration = await navigator.serviceWorker.getRegistration();
                const existingSub = await registration?.pushManager.getSubscription();
                if (existingSub) {
                    await existingSub.unsubscribe();
                    addLog('✅ Suscripción Web eliminada');
                }
                addLog('Registrando nueva conexión Web...');
                await pushNotificationService.initialize();
                addLog('✅ Nueva suscripción lista');
            } catch (e: any) {
                addLog(`❌ Error Web: ${e.message}`);
            }
        }
        checkStatus();
    };

    const testLocal = async () => {
        addLog('Probando notificación local / backend trigger...');
        if (isNative) {
            addLog('Para probar avisos nativos debes mandarte un mensaje desde la web a ti mismo.');
        } else {
            if (Notification.permission === 'granted') {
                const reg = await navigator.serviceWorker.getRegistration();
                if (reg) {
                    reg.showNotification('Prueba Web Chatgorithm', { body: 'Aviso Local Web', icon: '/logo.png' });
                    addLog('✅ Notificación enviada al sistema web');
                }
            } else {
                addLog('❌ Sin permiso web');
            }
        }
    };

    return (
        <div className="bg-slate-800/50 rounded-2xl p-6 border border-white/10 space-y-4">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <Bell className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-bold text-lg">Diagnóstico de Push</h3>
                </div>
                <span className="text-xs font-mono bg-indigo-500/20 text-indigo-300 px-2 py-1 rounded">
                    ENV: {platform.toUpperCase()}
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <StatusItem 
                    label="Permiso Sistema" 
                    success={status.permission === 'granted'} 
                    warning={status.permission === 'prompt'}
                    info={status.permission}
                />
                
                {isNative ? (
                    <StatusItem 
                        label="Token FCM" 
                        success={!!status.fcmToken} 
                        warning={!status.fcmToken}
                        info={status.fcmToken ? 'Generado' : 'Falta Token'}
                    />
                ) : (
                    <>
                        <StatusItem label="Soporte Web" success={status.browserSupport} />
                        <StatusItem label="Suscripción PWA" success={status.webSubscription === true} />
                    </>
                )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
                <button 
                    onClick={requestPermission}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                >
                    Pedir Permiso
                </button>
                <button 
                    onClick={triggerRegistration}
                    className="px-4 py-2 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/30 rounded-xl text-sm font-medium transition-colors"
                >
                    Forzar Registro Push
                </button>
                <button 
                    onClick={checkStatus}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-sm font-medium transition-colors"
                >
                    Refrescar API
                </button>
            </div>

            {status.fcmToken && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3 mt-2 break-words">
                    <p className="text-[10px] text-green-400 font-bold mb-1">YOUR FCM TOKEN:</p>
                    <p className="text-xs text-slate-300 font-mono select-all overflow-hidden text-ellipsis whitespace-nowrap">{status.fcmToken}</p>
                </div>
            )}

            <div className="mt-4 bg-black/30 rounded-xl p-3 font-mono text-[10px] leading-relaxed text-emerald-400 h-40 overflow-y-auto">
                {logs.length === 0 ? '> Initializing diagnostic core...' : logs.map((log, i) => (
                    <div key={i}>{log}</div>
                ))}
            </div>
        </div>
    );
};

const StatusItem: React.FC<{ label: string; success: boolean; warning?: boolean; info?: string }> = ({ label, success, warning, info }) => (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
        <span className="text-sm text-slate-300">{label}</span>
        <div className="flex items-center gap-2">
            {info && <span className="text-[10px] uppercase font-bold text-slate-500">{info}</span>}
            {success ? (
                <CheckCircle className="w-4 h-4 text-green-500" />
            ) : warning ? (
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
            ) : (
                <XCircle className="w-4 h-4 text-red-500" />
            )}
        </div>
    </div>
);
