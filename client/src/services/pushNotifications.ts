import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

// CRITICAL FIX: On Android, hostname is 'localhost' but we MUST use the production server
// because 'localhost' refers to the phone itself, not the PC/Server.
const isNative = Capacitor.isNativePlatform();
const isLocal = !isNative && typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

let API_URL = 'https://chatgorithm-vubn.onrender.com/api';

export const setPushApiUrl = (url: string) => {
    // Asegurarse de que el backendUrl incluya el sufijo /api necesario para las rutas del servidor
    API_URL = url.endsWith('/api') ? url : `${url}/api`;
    console.log('🚀 [Push] API URL updated to:', API_URL);
};

console.log('🚀 [Push] API URL Initial:', API_URL);

class PushNotificationService {
    private token: string | null = null;
    private notificationId = 0;

    async initialize(backendUrl?: string): Promise<void> {
        if (backendUrl) setPushApiUrl(backendUrl);
        
        console.log('🚀 [Push] Iniciando servicio de notificaciones...');
        console.log('🚀 [Push] Platform:', Capacitor.getPlatform());

        // Si es web (PWA), intentamos Web Push estándar
        if (!Capacitor.isNativePlatform()) {
            console.log('🌐 [Push] Detectado entorno Web/PWA, iniciando Web Push...');
            await this.subscribeWebPush();
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
        } catch (e) {
            console.error('❌ [Push] Error en initialize nativo:', e);
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

            const publicVapidKey = 'BNibvQQfVfb6ozHGy2xqnt5JJV_rqq8hGmj5qQuJb1xozXnN7LX5aVfWlqDqx_1BHDlPvFxTf_IiQOI5Y8mMEFs';
            
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(publicVapidKey)
            });

            console.log('✅ [WebPush] Suscripción lista');
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
