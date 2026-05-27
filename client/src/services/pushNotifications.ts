import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

// CRITICAL FIX: On Android, hostname is 'localhost' but we MUST use the production server
// because 'localhost' refers to the phone itself, not the PC/Server.
const isNative = Capacitor.isNativePlatform();
const isLocal = !isNative && typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

import { API_URL as SHARED_API_URL } from '../config/api';
let API_URL = SHARED_API_URL;

export const setPushApiUrl = (url: string) => {
    // Asegurarse de que el backendUrl incluya el sufijo /api necesario para las rutas del servidor
    API_URL = url.endsWith('/api') ? url : `${url}/api`;
    console.log('🚀 [Push] API URL updated to:', API_URL);
};

console.log('🚀 [Push] API URL Initial:', API_URL);

class PushNotificationService {
    private token: string | null = null;
    private notificationId = 0;
    // Flag para evitar registrar listeners Capacitor dos veces (un mismo
    // listener registrado N veces dispara la callback N veces). El re-envío
    // del token al servidor (con el username actual) sigue ocurriendo en cada
    // llamada — la idempotencia la garantiza el helper addPushSubscription
    // del backend.
    private initialized = false;
    private lastUsername: string | null = null;

    async initialize(backendUrl?: string): Promise<void> {
        if (backendUrl) setPushApiUrl(backendUrl);

        // Detectar el username actual del localStorage (puede haber cambiado)
        let currentUsername: string | null = null;
        try {
            const userStr = localStorage.getItem('chatgorithm_user');
            if (userStr) currentUsername = JSON.parse(userStr)?.username || null;
        } catch { /* ignore */ }

        console.log(`🚀 [Push] initialize() · user=${currentUsername || 'none'} · platform=${Capacitor.getPlatform()}`);

        // Si ya estábamos inicializados Y el usuario es el mismo → no hacemos
        // nada (evitar listeners duplicados). Si el usuario cambió, re-enviamos
        // las credenciales al servidor con el username nuevo.
        if (this.initialized && this.lastUsername === currentUsername) {
            console.log('🚀 [Push] Ya inicializado para este usuario, skip.');
            return;
        }
        if (this.initialized && this.lastUsername !== currentUsername) {
            console.log(`🚀 [Push] Cambio de usuario detectado (${this.lastUsername} → ${currentUsername}). Re-registrando credenciales.`);
            this.lastUsername = currentUsername;
            // Re-enviar token/sub existente al servidor con el username nuevo
            if (Capacitor.isNativePlatform() && this.token) {
                await this.sendTokenToServer(this.token);
            } else if (!Capacitor.isNativePlatform()) {
                // En Web Push, volvemos a recuperar la suscripción actual y la enviamos
                await this.subscribeWebPush();
            }
            return;
        }

        this.lastUsername = currentUsername;

        // Si es web (PWA), intentamos Web Push estándar
        if (!Capacitor.isNativePlatform()) {
            console.log('🌐 [Push] Detectado entorno Web/PWA, iniciando Web Push...');
            await this.subscribeWebPush();
            this.initialized = true;
            return;
        }

        try {
            // ... (resto del código Capacitor nativo se mantiene igual)
            console.log('📱 [Push] Registrando listeners...');
            PushNotifications.addListener('registration', async (token: Token) => {
                console.log('✅ [Push] Token recibido:', token.value?.substring(0, 30) + '...');
                this.token = token.value;
                await this.sendTokenToServer(token.value);
            });

            PushNotifications.addListener('registrationError', (error: any) => {
                console.error('❌ [Push] Error de registro:', JSON.stringify(error));
            });

            console.log('📱 [Push] Solicitando permisos...');
            const pushPermStatus = await PushNotifications.requestPermissions();
            if (pushPermStatus.receive !== 'granted') return;

            await LocalNotifications.requestPermissions();
            
            if (Capacitor.getPlatform() === 'android') {
                await LocalNotifications.createChannel({
                    id: 'chat_messages',
                    name: 'Mensajes de Chat',
                    importance: 5,
                    visibility: 1,
                    vibration: true,
                    sound: 'notification'
                });
            }

            await PushNotifications.register();
            
            PushNotifications.addListener('pushNotificationReceived', async (notification: PushNotificationSchema) => {
                await this.showLocalNotification(
                    notification.title || 'Nuevo mensaje',
                    notification.body || '',
                    notification.data
                );
            });

            // Listen for notification tap/action
            PushNotifications.addListener('pushNotificationActionPerformed', (action: ActionPerformed) => {
                console.log('Push notification action performed:', action);
                this.handleNotificationTap(action.notification.data);
            });

            // Also listen for local notification actions
            LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
                console.log('Local notification action performed:', action);
                this.handleNotificationTap(action.notification.extra);
            });
            this.initialized = true;
        } catch (e) {
            console.error('❌ [Push] Error en initialize nativo:', e);
        }
    }

    // Cierra sesión del servicio push: avisa al servidor para que borre las
    // suscripciones asociadas a este usuario en este dispositivo, limpia el
    // estado en memoria y resetea las banderas. Sin esto, tras un logout el
    // endpoint del navegador seguía mapeado al usuario anterior y este recibía
    // las notificaciones de otro user.
    async unregister(username?: string): Promise<void> {
        const target = username || this.lastUsername;
        const tokenAtUnregister = this.token; // capturar antes de limpiar
        if (!target) {
            // Sin username conocido, solo limpiamos el estado local
            this.initialized = false;
            this.lastUsername = null;
            this.token = null;
            return;
        }
        try {
            // === WEB ===
            // Obtener el endpoint actual con TIMEOUT para evitar cuelgue
            // indefinido en browsers viejos sin ServiceWorker activo (en ese
            // caso `navigator.serviceWorker.ready` no se resuelve nunca).
            // Sin timeout, el fetch posterior nunca llegaba y el push del
            // usuario anterior seguía activo.
            let endpoint: string | undefined;
            if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
                try {
                    const swPromise = navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription());
                    const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 1500));
                    const sub = await Promise.race([swPromise, timeout]);
                    if (sub && (sub as any).endpoint) endpoint = (sub as any).endpoint;
                } catch { /* opcional */ }
            }

            // Disparar las dos llamadas en paralelo (no bloqueamos el logout):
            //  - /webpush/unsubscribe siempre (aunque endpoint sea undefined →
            //    el server borra todas las del usuario).
            //  - /push-notifications/unregister SOLO si hay token FCM nativo.
            //    Esto cubre el bug detectado por QA: en APK Android el token
            //    FCM seguía mapeado al usuario anterior tras logout, así que
            //    el siguiente que entrase recibía las notifs del anterior.
            const calls: Promise<any>[] = [];
            calls.push(
                fetch(`${API_URL}/webpush/unsubscribe`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: target, endpoint, token: tokenAtUnregister || undefined })
                }).catch(e => console.warn('[Push] webpush unsubscribe falló:', e?.message))
            );
            if (Capacitor.isNativePlatform() && tokenAtUnregister) {
                calls.push(
                    fetch(`${API_URL}/push-notifications/unregister`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: tokenAtUnregister })
                    }).catch(e => console.warn('[Push] FCM unregister falló:', e?.message))
                );
            }
            await Promise.allSettled(calls);

            console.log(`🚪 [Push] Sesión del servicio push cerrada para ${target}`);
        } finally {
            this.initialized = false;
            this.lastUsername = null;
            this.token = null;
        }
    }

    // Show a native local notification with proper channel
    async showLocalNotification(title: string, body: string, data?: any): Promise<void> {
        try {
            this.notificationId++;

            await LocalNotifications.schedule({
                notifications: [{
                    id: this.notificationId,
                    title: title,
                    body: body,
                    channelId: 'chat_messages',
                    extra: data,
                    smallIcon: 'ic_stat_notification', // Generated white silhouette icon
                    largeIcon: 'ic_launcher',
                    sound: 'notification',
                    ongoing: false,
                    autoCancel: true,
                    schedule: { at: new Date(Date.now() + 100) }
                }]
            });

            console.log('✅ Local notification scheduled');

            if ('vibrate' in navigator) {
                navigator.vibrate([300, 100, 300, 100, 300]);
            }
        } catch (error) {
            console.error('Error showing local notification:', error);
        }
    }

    private handleNotificationTap(data?: any): void {
        const conversationId = data?.conversationId;
        if (conversationId) {
            window.dispatchEvent(new CustomEvent('openConversation', {
                detail: { conversationId }
            }));
        }
    }

    private async subscribeWebPush(): Promise<void> {
        if (!('serviceWorker' in navigator)) {
            console.warn('❌ [WebPush] Service Worker no soportado');
            return;
        }

        try {
            // Asegurarnos de que el SW está registrado y actualizarlo
            let registration = await navigator.serviceWorker.getRegistration('/');
            if (!registration) {
                registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            }
            
            // Forzar actualización del SW
            await registration.update();
            await navigator.serviceWorker.ready;
            
            registration = await navigator.serviceWorker.getRegistration();
            if (!registration) throw new Error('No se pudo obtener el registro del Service Worker');
            
            if (!registration.pushManager) {
                console.warn('❌ [WebPush] PushManager no disponible en este navegador');
                return;
            }

            // Solicitar permiso
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                console.warn('❌ [WebPush] Permiso denegado por el usuario');
                return;
            }

            // Leer la clave VAPID pública del servidor para garantizar que
            // cliente y servidor siempre estén sincronizados. Antes estaba
            // hardcodeada aquí, lo que causaba 401 si el servidor usaba
            // una clave distinta (ej. tras regenerar las claves en Render).
            const vapidResp = await fetch(`${API_URL}/webpush/vapid-key`);
            if (!vapidResp.ok) {
                console.error('❌ [WebPush] No se pudo obtener la clave VAPID del servidor');
                return;
            }
            const { publicKey: publicVapidKey } = await vapidResp.json();
            if (!publicVapidKey) {
                console.error('❌ [WebPush] Servidor no devolvió clave VAPID pública');
                return;
            }
            console.log('🔑 [WebPush] Clave VAPID obtenida del servidor');

            // Si ya hay una suscripción activa, la borramos primero para
            // forzar una nueva con la clave correcta del servidor.
            const existingSub = await registration.pushManager.getSubscription();
            if (existingSub) await existingSub.unsubscribe();

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(publicVapidKey)
            });

            console.log('✅ [WebPush] Suscripción lista con clave del servidor');
            await this.sendWebPushSubscriptionToServer(subscription);
        } catch (error) {
            console.error('❌ [WebPush] Error crítico en suscripción:', error);
        }
    }

    private urlBase64ToUint8Array(base64String: string) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    private async sendWebPushSubscriptionToServer(subscription: PushSubscription): Promise<void> {
        try {
            let username = 'unknown';
            const userStr = localStorage.getItem('chatgorithm_user');
            if (userStr) {
                try {
                    const userObj = JSON.parse(userStr);
                    username = userObj.username || 'unknown';
                } catch (e) { }
            }

            await fetch(`${API_URL}/webpush/subscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription, username }),
            });
            console.log(`✅ [WebPush] Suscripción enviada al servidor para: ${username}`);
        } catch (error) {
            console.error('❌ [WebPush] Error enviando suscripción al servidor:', error);
        }
    }

    private async sendTokenToServer(token: string): Promise<void> {
        try {
            // Obtener username del localStorage (guardado como JSON en login)
            let username = 'unknown';
            const userStr = localStorage.getItem('chatgorithm_user');
            if (userStr) {
                try {
                    const userObj = JSON.parse(userStr);
                    username = userObj.username || 'unknown';
                } catch (e) { }
            }

            const response = await fetch(`${API_URL}/push-notifications/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ token, username }),
            });

            if (!response.ok) {
                throw new Error('Failed to register token with server');
            }

            console.log(`Token registered for user: ${username}`);
        } catch (error) {
            console.error('Error sending token to server:', error);
        }
    }

    private handleForegroundNotification(notification: PushNotificationSchema): void {
        window.dispatchEvent(new CustomEvent('pushNotification', {
            detail: {
                title: notification.title,
                body: notification.body,
                data: notification.data,
            }
        }));
    }

    getToken(): string | null {
        return this.token;
    }
}

export const pushNotificationService = new PushNotificationService();
