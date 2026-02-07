import { PushNotifications, Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

// CRITICAL FIX: On Android, hostname is 'localhost' but we MUST use the production server
// because 'localhost' refers to the phone itself, not the PC/Server.
const isNative = Capacitor.isNativePlatform();
const isLocal = !isNative && typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const API_URL = isLocal
    ? 'http://localhost:3001'
    : 'https://chatgorithm-vubn.onrender.com';

console.log('🚀 [Push] API URL Config:', { isNative, isLocal, API_URL });

class PushNotificationService {
    private token: string | null = null;
    private notificationId = 0;

    async initialize(): Promise<void> {
        console.log('🚀 [Push] Iniciando servicio de notificaciones...');
        console.log('🚀 [Push] Platform:', Capacitor.getPlatform());
        console.log('🚀 [Push] Is native:', Capacitor.isNativePlatform());

        if (!Capacitor.isNativePlatform()) {
            console.log('Push notifications only available on native platform');
            return;
        }

        try {
            // ⚠️ IMPORTANTE: Registrar listeners ANTES de llamar a register()
            // Si no, el token puede perderse
            console.log('📱 [Push] Registrando listeners...');

            // Listen for registration success - ESTO DEBE IR PRIMERO
            PushNotifications.addListener('registration', async (token: Token) => {
                console.log('✅ [Push] Token recibido:', token.value?.substring(0, 30) + '...');
                this.token = token.value;
                await this.sendTokenToServer(token.value);
            });

            // Listen for registration errors
            PushNotifications.addListener('registrationError', (error: any) => {
                console.error('❌ [Push] Error de registro:', JSON.stringify(error));
            });

            // Request permissions
            console.log('📱 [Push] Solicitando permisos...');
            const pushPermStatus = await PushNotifications.requestPermissions();
            console.log('📱 [Push] Permiso push:', JSON.stringify(pushPermStatus));

            if (pushPermStatus.receive !== 'granted') {
                console.warn('❌ [Push] Permiso denegado');
                return;
            }

            // Request local notification permissions
            const localPermStatus = await LocalNotifications.requestPermissions();
            console.log('📱 [Push] Permiso local:', JSON.stringify(localPermStatus));

            // Create notification channel for Android
            if (Capacitor.getPlatform() === 'android') {
                try {
                    await LocalNotifications.createChannel({
                        id: 'chat_messages',
                        name: 'Mensajes de Chat',
                        description: 'Notificaciones de nuevos mensajes',
                        importance: 5,
                        visibility: 1,
                        vibration: true,
                        sound: 'notification',
                        lights: true,
                        lightColor: '#2563EB'
                    });
                    console.log('✅ [Push] Canal creado');
                } catch (e) {
                    console.error('❌ [Push] Error creando canal:', e);
                }
            }

            // AHORA registrar para push notifications
            console.log('📱 [Push] Llamando a register()...');
            await PushNotifications.register();
            console.log('📱 [Push] register() completado');
            // Show a LOCAL notification so it appears in the notification tray
            PushNotifications.addListener('pushNotificationReceived', async (notification: PushNotificationSchema) => {
                console.log('🔔 Push notification received (foreground):', notification);

                // Show a LOCAL notification - this will use the correct notification channel
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
            console.error('❌ [Push] Error en initialize:', e);
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
