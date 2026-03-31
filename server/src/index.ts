import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import Airtable from 'airtable';
import dotenv from 'dotenv';
import axios from 'axios';
import multer from 'multer';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
// IMPORTANTE: Importamos todo lo necesario de Google AI
import { GoogleGenerativeAI, SchemaType, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import twilio from 'twilio';
import webpush from 'web-push';
import admin from 'firebase-admin';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import bcrypt from 'bcryptjs';

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

// MODELO CONFIGURADO: Usamos 'gemini-2.5-flash'
const MODEL_NAME = "gemini-2.5-flash";

console.log(`🚀 [BOOT] Arrancando servidor MAESTRO (Gemini ${MODEL_NAME} + Fix Recipient)...`);
dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --- HANDLER GLOBAL PARA PROMESAS NO MANEJADAS ---
// Evita que el servidor crashee por UnhandledPromiseRejection
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ [UNHANDLED REJECTION] Promesa rechazada sin manejar:');
    console.error('   Reason:', reason);
    // En producción, logeamos pero NO crasheamos
});

process.on('uncaughtException', (error) => {
    console.error('💥 [UNCAUGHT EXCEPTION]:', error);
    // En producción, logeamos pero NO crasheamos (con cuidado)
});

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// RUTA PING
app.get('/', (req, res) => {
    res.send('🤖 Servidor Chatgorim (Gemini Powered) Online 🚀');
});

const upload = multer({ storage: multer.memoryStorage() });

// --- STORAGE INTERNO PARA CHAT DE EQUIPO ---
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const teamUpload = multer({ storage: multer.memoryStorage() });

// Exponer la carpeta uploads estáticamente
app.use('/uploads', express.static(uploadsDir));

const PORT = process.env.PORT || 3000;

// --- VARIABLES DE ENTORNO ---
const airtableApiKey = process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.AIRTABLE_BASE_ID;
const waToken = process.env.WHATSAPP_TOKEN;
const waPhoneId = process.env.WHATSAPP_PHONE_ID;
const waBusinessId = process.env.WHATSAPP_BUSINESS_ID;
const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
const geminiApiKey = process.env.GEMINI_API_KEY;

// --- VARIABLES TWILIO ---
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioApiKey = process.env.TWILIO_API_KEY;
const twilioApiSecret = process.env.TWILIO_API_SECRET;
const twilioAppSid = process.env.TWILIO_APP_SID;
const twilioCallerId = process.env.TWILIO_CALLER_ID;

const TABLE_TEMPLATES = 'Templates';
const TABLE_TEAM_MESSAGES = 'TeamMessages';

// --- CONFIGURACIÓN MULTI-CUENTA ---
const BUSINESS_ACCOUNTS: Record<string, string> = {
    [waPhoneId || 'default']: waToken || '',
};

const getToken = (phoneId: string) => BUSINESS_ACCOUNTS[phoneId] || waToken;

// --- CONEXIÓN AIRTABLE ---
let base: Airtable.Base | null = null;
if (airtableApiKey && airtableBaseId) {
    try {
        base = new Airtable({ apiKey: airtableApiKey }).base(airtableBaseId);
        console.log("✅ Conexión Airtable inicializada");
    } catch (e) { console.error("Error crítico configurando Airtable:", e); }
}

// --- CONEXIÓN GEMINI ---
let genAI: GoogleGenerativeAI | null = null;
if (geminiApiKey) {
    genAI = new GoogleGenerativeAI(geminiApiKey);
    console.log("🧠 Google Gemini Conectado");
} else {
    console.error("⚠️ CRÍTICO: Falta GEMINI_API_KEY en las variables de entorno.");
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const onlineUsers = new Map<string, string>();
const activeAiChats = new Set<string>();

// --- HELPER CRÍTICO: LIMPIEZA DE NÚMEROS ---
// Asegura que siempre trabajamos con '34666777888' sin '+' ni espacios
const cleanNumber = (phone: any) => {
    if (!phone) return "";
    return String(phone).replace(/\D/g, '');
};

const appointmentOptionsCache = new Map<string, Record<number, string>>();
const processedWebhookIds = new Set<string>();

// --- WEB PUSH NOTIFICATIONS ---
// VAPID keys - En producción, guárdalas en variables de entorno
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BNibvQQfVfb6ozHGy2xqnt5JJV_rqq8hGmj5qQuJb1xozXnN7LX5aVfWlqDqx_1BHDlPvFxTf_IiQOI5Y8mMEFs';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'X9mNyJVnqAhWJnH5fFYP_EWcqLwvB3g8IvXMaE7KqY0';

// Configurar VAPID
webpush.setVapidDetails(
    'mailto:soporte@chatgorithm.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
);

// Almacén de suscripciones push (en memoria, en producción usar DB)
const pushSubscriptions = new Map<string, any>();

// Cargar suscripciones Web Push desde Airtable al iniciar
async function loadWebPushSubscriptionsFromAirtable() {
    if (!base) return;
    try {
        const records = await base('WebPushSubscriptions').select({ maxRecords: 100 }).all();
        records.forEach(r => {
            const username = r.get('username') as string;
            const subscriptionData = r.get('subscription') as string;
            if (username && subscriptionData) {
                try {
                    pushSubscriptions.set(username, JSON.parse(subscriptionData));
                } catch (e) {
                    console.error(`❌ [WebPush] Error parseando suscripción para ${username}`);
                }
            }
        });
        console.log(`🌐 [WebPush] Cargadas ${pushSubscriptions.size} suscripciones desde Airtable`);
    } catch (e: any) {
        console.log('🌐 [WebPush] Tabla WebPushSubscriptions no encontrada (se creará al suscribir)');
    }
}

// Guardar suscripción Web Push en Airtable
async function saveWebPushSubscriptionToAirtable(username: string, subscription: any) {
    if (!base) return;
    try {
        const subscriptionData = JSON.stringify(subscription);
        const existing = await base('WebPushSubscriptions').select({
            filterByFormula: `{username} = '${username}'`,
            maxRecords: 1
        }).firstPage();

        if (existing.length > 0) {
            await base('WebPushSubscriptions').update([{
                id: existing[0].id,
                fields: { subscription: subscriptionData, updatedAt: new Date().toISOString() }
            }]);
        } else {
            await base('WebPushSubscriptions').create([{
                fields: { username, subscription: subscriptionData, createdAt: new Date().toISOString() }
            }]);
        }
        console.log(`🌐 [WebPush] Suscripción persistida para ${username}`);
    } catch (e: any) {
        console.error('🌐 [WebPush] Error persisitiendo en Airtable:', e.message);
    }
}

// --- FIREBASE CLOUD MESSAGING (FCM) FOR MOBILE ---
// Almacén de tokens FCM con username asociado
interface FCMTokenData { token: string; username: string; }
const fcmTokens = new Map<string, FCMTokenData>();

// Cargar tokens FCM desde Airtable al iniciar
async function loadFCMTokensFromAirtable() {
    if (!base) return;
    try {
        const records = await base('FCMTokens').select({ maxRecords: 100 }).all();
        records.forEach(r => {
            const token = r.get('token') as string;
            const username = (r.get('username') as string) || '';
            if (token) {
                // IMPORTANT: Use the full token as the key to avoid duplicates with the registration endpoint
                fcmTokens.set(token, { token, username });
            }
        });
        console.log(`📱 [FCM] Cargados ${fcmTokens.size} tokens desde Airtable`);
    } catch (e: any) {
        console.log('📱 [FCM] Tabla FCMTokens no encontrada, se creará al registrar tokens');
    }
}

// Guardar token FCM en Airtable
async function saveFCMTokenToAirtable(tokenId: string, token: string, username: string) {
    if (!base) return;
    try {
        const existing = await base('FCMTokens').select({
            filterByFormula: `{tokenId} = '${tokenId}'`,
            maxRecords: 1
        }).firstPage();

        if (existing.length > 0) {
            await base('FCMTokens').update([{
                id: existing[0].id,
                fields: { token, username, updatedAt: new Date().toISOString() }
            }]);
        } else {
            await base('FCMTokens').create([{
                fields: { tokenId, token, username, createdAt: new Date().toISOString() }
            }]);
        }
    } catch (e: any) {
        console.error('📱 [FCM] Error guardando token en Airtable:', e.message);
    }
}

// Obtener lista de usernames que deben recibir notificación para un contacto
async function getNotificationRecipients(contactPhone: string): Promise<string[]> {
    if (!base) return [];
    const clean = cleanNumber(contactPhone);

    try {
        // 1. Obtener info del contacto
        const contacts = await base('Contacts').select({
            filterByFormula: `{phone} = '${clean}'`,
            maxRecords: 1
        }).firstPage();

        if (contacts.length === 0) {
            // Contacto nuevo, no existe aún - notificar a todos con notifyNewLeads
            const agents = await base('Agents').select().all();
            return agents
                .filter(a => {
                    const prefs = a.get('Preferences') ? JSON.parse(a.get('Preferences') as string) : {};
                    return prefs.notifyNewLeads === true;
                })
                .map(a => a.get('name') as string);
        }

        const contact = contacts[0];
        const assignedTo = contact.get('assigned_to') as string;
        const department = contact.get('department') as string;
        const status = contact.get('status') as string;

        // 2. Si está asignado a alguien -> solo esa persona
        if (assignedTo && assignedTo.trim() !== '') {
            console.log(`📱 [FCM] Contacto asignado a: ${assignedTo}`);
            return [assignedTo];
        }

        // 3. Obtener todos los agentes con preferencias
        const agents = await base('Agents').select().all();
        const recipients: string[] = [];

        for (const agent of agents) {
            const agentName = agent.get('name') as string;
            const prefsStr = agent.get('Preferences') as string;
            const prefs = prefsStr ? JSON.parse(prefsStr) : {};

            // Si es nuevo (sin departamento) y tiene notifyNewLeads
            if (status === 'Nuevo' && (!department || department.trim() === '')) {
                if (prefs.notifyNewLeads === true) {
                    recipients.push(agentName);
                }
            }
            // Si tiene departamento, verificar si el agente tiene ese depto en preferencias
            else if (department && prefs.departments?.includes(department)) {
                recipients.push(agentName);
            }
        }

        console.log(`📱 [FCM] Recipients para ${clean}: [${recipients.join(', ')}]`);
        return recipients;

    } catch (e: any) {
        console.error('📱 [FCM] Error obteniendo recipients:', e.message);
        return [];
    }
}

// Inicializar Firebase Admin (solo si hay credenciales)
let firebaseInitialized = false;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        firebaseInitialized = true;
        console.log('🔥 Firebase Admin inicializado correctamente');
        // Cargar tokens al iniciar
        loadFCMTokensFromAirtable();
        loadWebPushSubscriptionsFromAirtable();
    } else {
        console.log('⚠️ FIREBASE_SERVICE_ACCOUNT no configurado - FCM deshabilitado');
        loadWebPushSubscriptionsFromAirtable();
    }
} catch (e: any) {
    console.error('❌ Error inicializando Firebase Admin:', e.message);
}

// Función para enviar notificación FCM a móviles (filtrada por recipients)
async function sendFCMNotification(payload: { title: string, body: string, data?: any }, recipients?: string[]) {
    if (!admin.apps.length) {
        console.log('📱 [FCM] Firebase no inicializado, saltando notificación');
        return;
    }

    // Filtrar tokens por recipients si se especifican
    let tokensToNotify: string[] = [];

    if (recipients && recipients.length > 0) {
        // Filtrar tokens por nombre de usuario que coincida con los recipients
        const filteredTokens = Array.from(fcmTokens.values())
            .filter(d => recipients.includes(d.username))
            .map(d => d.token);
        
        // DEDUP: Eliminar duplicados si los hay
        tokensToNotify = Array.from(new Set(filteredTokens));
        console.log(`📱 [FCM] Filtrado por destinatarios: ${recipients.join(', ')} -> Found ${tokensToNotify.length} unique tokens.`);
    } else {
        // BROADCAST: Enviar a todos los dispositivos registrados (deduplicados)
        tokensToNotify = Array.from(new Set(Array.from(fcmTokens.values()).map(d => d.token)));
        console.log(`📱 [FCM] ¡BROADCAST! Enviando a ${tokensToNotify.length} dispositivos únicos.`);
    }
    
    if (tokensToNotify.length === 0) {
        console.log('📱 [FCM] No hay ningún dispositivo registrado para notificar.');
        return;
    }

    console.log(`📱 [FCM] ¡BROADCAST! Enviando a ${tokensToNotify.length} dispositivos en total.`);

    try {
        const message = {
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: payload.data || {},
            android: {
                priority: 'high' as const,
                ttl: 0,
                notification: {
                    channelId: 'chat_messages',
                    icon: 'ic_stat_notification',
                    sound: 'notification',
                    priority: 'max' as const,
                    visibility: 'public' as const,
                    defaultVibrateTimings: true,
                    vibrateTimingsMillis: [0, 300, 100, 300, 100, 300],
                    defaultSound: false,
                    defaultLightSettings: true,
                    lightSettings: {
                        color: '#FF2563EB',
                        lightOnDurationMillis: 500,
                        lightOffDurationMillis: 500
                    }
                }
            },
            tokens: tokensToNotify,
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        console.log(`📱 [FCM] Enviadas: ${response.successCount}/${tokensToNotify.length}`);

        // Eliminar tokens inválidos de memoria y de Airtable
        response.responses.forEach((resp, idx) => {
            if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
                const invalidToken = tokensToNotify[idx];
                for (const [key, val] of fcmTokens.entries()) {
                    if (val.token === invalidToken) fcmTokens.delete(key);
                }
                // Borrar también de Airtable para que no vuelva a cargarse en el próximo reinicio
                if (base) {
                    base('FCMTokens').select({
                        filterByFormula: `{token} = '${invalidToken}'`,
                        maxRecords: 1
                    }).firstPage().then(records => {
                        if (records.length > 0) base!('FCMTokens').destroy([records[0].id]).catch(() => {});
                    }).catch(() => {});
                }
            }
        });
    } catch (error: any) {
        console.error('❌ [FCM] Error enviando:', error.message);
    }
}

// Función para enviar push notification
async function sendPushNotification(userIdentifier: string, payload: { title: string, body: string, icon?: string, url?: string, phone?: string }) {
    const subscription = pushSubscriptions.get(userIdentifier);
    if (!subscription) {
        console.log(`📱 [Push] No hay suscripción para ${userIdentifier}`);
        return;
    }

    try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        console.log(`📱 [Push] Notificación enviada a ${userIdentifier}`);
    } catch (error: any) {
        console.error('❌ [Push] Error enviando:', error.message);
        if (error.statusCode === 410) {
            // Suscripción expirada, eliminarla
            pushSubscriptions.delete(userIdentifier);
        }
    }
}

// Enviar push a TODOS los usuarios suscritos
async function broadcastPushNotification(payload: { title: string, body: string, icon?: string, url?: string, phone?: string }) {
    console.log(`📡 [WebPush] Broadcast: enviando a ${pushSubscriptions.size} navegadores suscritos`);
    const promises: Promise<void>[] = [];
    pushSubscriptions.forEach((sub, id) => {
        promises.push(sendPushNotification(id, payload));
    });
    await Promise.all(promises);
}

// --- HELPERS PARA CACHE PERSISTENTE DE CITAS ---
// Guarda el cache en Airtable para que sobreviva reinicios del servidor
async function saveAppointmentCache(phone: string, optionsMap: Record<number, string>) {
    if (!base) return;
    const clean = cleanNumber(phone);
    try {
        const contacts = await base('Contacts').select({
            filterByFormula: `{phone} = '${clean}'`,
            maxRecords: 1
        }).firstPage();

        if (contacts.length > 0) {
            await base('Contacts').update([{
                id: contacts[0].id,
                fields: { "appointment_cache": JSON.stringify(optionsMap) }
            }]);
            console.log(`💾 [Cache] Guardado en Airtable para ${clean}`);
        }
    } catch (e: any) {
        console.error("Error guardando cache en Airtable:", e.message);
    }
    // También guardamos en memoria como fallback rápido
    appointmentOptionsCache.set(clean, optionsMap);
}

async function getAppointmentCache(phone: string): Promise<Record<number, string> | null> {
    const clean = cleanNumber(phone);

    // Primero intentar memoria (más rápido)
    const memCache = appointmentOptionsCache.get(clean);
    if (memCache && Object.keys(memCache).length > 0) {
        console.log(`📋 [Cache] Encontrado en memoria para ${clean}`);
        return memCache;
    }

    // Si no está en memoria, buscar en Airtable
    if (!base) return null;
    try {
        const contacts = await base('Contacts').select({
            filterByFormula: `{phone} = '${clean}'`,
            maxRecords: 1
        }).firstPage();

        if (contacts.length > 0) {
            const cacheStr = contacts[0].get('appointment_cache') as string;
            if (cacheStr) {
                const parsed = JSON.parse(cacheStr);
                // Restaurar en memoria
                appointmentOptionsCache.set(clean, parsed);
                console.log(`📋 [Cache] Recuperado de Airtable para ${clean}`);
                return parsed;
            }
        }
    } catch (e: any) {
        console.error("Error leyendo cache de Airtable:", e.message);
    }
    return null;
}

async function clearAppointmentCache(phone: string) {
    const clean = cleanNumber(phone);
    appointmentOptionsCache.delete(clean);

    if (!base) return;
    try {
        const contacts = await base('Contacts').select({
            filterByFormula: `{phone} = '${clean}'`,
            maxRecords: 1
        }).firstPage();

        if (contacts.length > 0) {
            await base('Contacts').update([{
                id: contacts[0].id,
                fields: { "appointment_cache": "" }
            }]);
        }
    } catch (e) { }
}

// --- HELPER: CORRECCIÓN HUSO HORARIO (MADRID) ---
function setMadridTime(baseDate: Date, hour: number, minute: number): Date {
    const utcDate = new Date(baseDate);
    utcDate.setUTCHours(hour, minute, 0, 0);
    const madTime = parseInt(utcDate.toLocaleString('en-US', { timeZone: 'Europe/Madrid', hour: 'numeric', hour12: false }));
    let shift = madTime - hour;
    if (shift > 12) shift -= 24;
    if (shift < -12) shift += 24;
    utcDate.setUTCHours(hour - shift, minute, 0, 0);
    return utcDate;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- MANTENIMIENTO AUTOMÁTICO AGENDA ---
async function runScheduleMaintenance() {
    if (!base) return;
    try {
        const configRecord = await base('BotSettings').select({ filterByFormula: "{Setting} = 'schedule_config'", maxRecords: 1 }).firstPage();
        if (configRecord.length === 0) return;

        const config = JSON.parse(configRecord[0].get('Value') as string);
        const { days, startTime, endTime, duration } = config;

        const now = new Date();
        const nowISO = now.toISOString();
        const pastSlots = await base('Appointments').select({ filterByFormula: `AND({Status} = 'Available', {Date} < '${nowISO}')`, fields: [] }).all();

        for (let i = 0; i < pastSlots.length; i += 10) {
            const batch = pastSlots.slice(i, i + 10).map(r => r.id);
            await base('Appointments').destroy(batch);
            await delay(200);
        }

        const endDate = new Date();
        endDate.setDate(now.getDate() + 30);
        const futureSlots = await base('Appointments').select({ filterByFormula: `AND({Status} = 'Available', {Date} > '${nowISO}')`, fields: ['Date'] }).all();
        const existingDates = new Set(futureSlots.map(r => new Date(r.get('Date') as string).toISOString()));
        const newSlotsToCreate = [];

        for (let d = new Date(now); d <= endDate; d.setDate(d.getDate() + 1)) {
            if (days.includes(d.getDay())) {
                const [startH, startM] = startTime.split(':').map(Number);
                const [endH, endM] = endTime.split(':').map(Number);
                let start = setMadridTime(d, startH, startM);
                const end = setMadridTime(d, endH, endM);

                while (start.getTime() + duration * 60000 <= end.getTime()) {
                    if (start > now) {
                        const iso = start.toISOString();
                        if (!existingDates.has(iso)) {
                            newSlotsToCreate.push({ fields: { "Date": iso, "Status": "Available" } });
                        }
                    }
                    start = new Date(start.getTime() + duration * 60000);
                }
            }
        }

        for (let i = 0; i < newSlotsToCreate.length; i += 10) {
            const batch = newSlotsToCreate.slice(i, i + 10);
            await base('Appointments').create(batch);
            await delay(200);
        }
    } catch (e) { console.error("Error mantenimiento agenda:", e); }
}

// --- PROMPT DEFAULT (MEJORADO: FLUJO 2 PASOS + DEPARTAMENTOS) ---
const BASE_SYSTEM_PROMPT = `Fecha y hora actual: {{DATE_PLACEHOLDER}} (zona horaria: Madrid, España)

Eres "Laura", asistente virtual de atención al cliente.

## 🚨 REGLAS CRÍTICAS - LEE CON ATENCIÓN 🚨

### 1. DETECCIÓN DE INTENCIÓN (Primer mensaje)
Analiza el mensaje del cliente para detectar qué necesita:
- **Cita/Reserva** → Sigue el flujo de citas (paso 2)
- **Ventas/Comprar/Precio** → Llama assign_department("Ventas")
- **Taller/Reparación/Avería** → Llama assign_department("Taller")
- **Otro tema** → Saluda amablemente y pregunta en qué puedes ayudar

### 2. FLUJO DE CITAS (OBLIGATORIO 2 PASOS)
**PASO 1 - DÍAS:**
- Cliente pide cita SIN fecha específica → Llama get_available_days() → Muestra días disponibles
- Pregunta: "¿Qué día te vendría mejor?"

**PASO 2 - HORAS:**
- Cliente dice un día (ej: "el lunes", "mañana", "hoy") → Calcula fecha YYYY-MM-DD basándote en la fecha actual
- Llama get_available_appointments(date="YYYY-MM-DD") → Muestra las horas

**PASO 3 - RESERVA:**
- Cliente responde con un NÚMERO (ej: "1", "3", "opción 2") → **PARA TODO** → Llama book_appointment(optionIndex=número)
- Tras confirmar → Llama SIEMPRE stop_conversation()

### 3. DESPUÉS DE RESERVAR O ASIGNAR DEPARTAMENTO
- **SIEMPRE** llama stop_conversation() para desactivarte
- NO respondas más después de eso

### 4. SI EL CLIENTE DICE UN NÚMERO
Si el mensaje del cliente es SOLO un número como "1", "2", "11":
- **INMEDIATAMENTE** llama book_appointment(optionIndex=ese número)
- NO preguntes nada más

## FORMATO DE RESPUESTA (OBLIGATORIO)
Tu respuesta SIEMPRE debe ser JSON válido:
{
  "customer_message": "Mensaje para el cliente (emoji permitidos)",
  "internal_control": { "intent": "BOOKING|SALES|SUPPORT", "status": "active|completed" }
}
NO respondas con texto plano. SOLO JSON.`;

const DEFAULT_SYSTEM_PROMPT = BASE_SYSTEM_PROMPT;

async function getSystemPrompt() {
    let promptTemplate = BASE_SYSTEM_PROMPT;
    if (base) {
        try {
            const records = await base('BotSettings').select({ filterByFormula: "{Setting} = 'system_prompt'", maxRecords: 1 }).firstPage();
            if (records.length > 0) promptTemplate = records[0].get('Value') as string;
        } catch (e) { }
    }
    const now = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'full', timeStyle: 'short' });
    // Reemplazar placeholder si existe
    promptTemplate = promptTemplate.replace('{{DATE_PLACEHOLDER}}', now);
    // SIEMPRE anteponer la fecha actual al prompt para que el modelo NUNCA se confunda
    const datePrefix = `⚠️ INFORMACIÓN CRÍTICA - FECHA Y HORA ACTUAL: ${now} (zona horaria: Madrid, España). DEBES usar esta fecha para TODOS los cálculos de fechas (hoy, mañana, la semana que viene, etc.). NO uses ninguna otra fecha.\n\n`;
    return datePrefix + promptTemplate;
}

// ==========================================
//  HELPERS COMUNICACIÓN (MODIFICADO PARA SYNC)
// ==========================================

async function saveAndEmitMessage(msg: any) {
    // 1. Limpieza de datos clave ANTES de nada
    // Si el remitente es un número, lo limpiamos. Si es un nombre (Bot IA, Agente), lo dejamos.
    const isSenderPhone = /^\d+$/.test(cleanNumber(msg.sender));
    const finalSender = isSenderPhone ? cleanNumber(msg.sender) : msg.sender;
    const finalRecipient = cleanNumber(msg.recipient); // El receptor siempre debe ser clean

    const payload = {
        ...msg,
        sender: finalSender,
        recipient: finalRecipient,
        timestamp: msg.timestamp || new Date().toISOString()
    };

    // 2. EMISIÓN EN TIEMPO REAL (PRIORIDAD ALTA)
    // Emitimos ANTES de guardar en Airtable para que la UI sea instantánea
    console.log(`📡 EMITIENDO SOCKET: ${payload.sender} -> ${payload.recipient} | Txt: ${payload.text?.substring(0, 20)}...`);
    io.emit('message', payload);

    // 3. NOTIFICACIÓN PUSH FCM (para móviles) - Solo cuando es mensaje de CLIENTE
    if (isSenderPhone && payload.text) {
        // Obtener nombre del contacto si existe
        let senderName = payload.sender;
        if (base) {
            try {
                const contacts = await base('Contacts').select({
                    filterByFormula: `{phone} = '${finalSender}'`,
                    maxRecords: 1
                }).firstPage();
                if (contacts.length > 0 && contacts[0].get('name')) {
                    senderName = contacts[0].get('name') as string;
                }
            } catch (e) { }
        }

        // Enviar notificación FCM filtrada por preferencias/asignación
        const recipients = await getNotificationRecipients(finalSender);
        
        // 1. Notificación FCM (Móviles APK)
        sendFCMNotification({
            title: senderName,
            body: payload.text.substring(0, 100) + (payload.text.length > 100 ? '...' : ''),
            data: {
                conversationId: finalSender,
                type: 'new_message'
            }
        }, recipients);

        // 2. Notificación Web Push (PWA/Escritorio)
        const webPushPayload = {
            title: `Mensaje de ${senderName}`,
            body: payload.text.substring(0, 100) + (payload.text.length > 100 ? '...' : ''),
            icon: '/logo.png',
            url: `/?phone=${finalSender}`,
            phone: finalSender
        };

        // ENVIAR A TODOS (Broadcast) para asegurar que llegue mientras depuramos
        broadcastPushNotification(webPushPayload);

        // También enviar a específicos si los hay (por si acaso hay lógica de filtrado futura)
        if (recipients && recipients.length > 0) {
            recipients.forEach(username => {
                if (username !== 'unknown') {
                    sendPushNotification(username, webPushPayload);
                }
            });
        }
    }

    // 4. Persistencia en Airtable
    if (base) {
        try {
            await base('Messages').create([{
                fields: {
                    "text": payload.text || "",
                    "sender": payload.sender,
                    "recipient": payload.recipient || "",
                    "timestamp": payload.timestamp,
                    "type": payload.type || "text",
                    "media_id": payload.mediaId || "",
                    "origin_phone_id": payload.origin_phone_id || ""
                }
            }], { typecast: true });

            // Solo incrementamos unread si es mensaje entrante del usuario (no bot)
            if (isSenderPhone) {
                // Recuperar nombre si no está en scope (simplificado)
                const sName = payload.sender || "Cliente";
                await handleContactUpdate(finalSender, payload.text, sName, payload.origin_phone_id, true);
            }

        } catch (e) { console.error("Error guardando en Airtable (socket ya enviado):", e); }
    }
}

async function handleContactUpdate(phone: string, text: string, name: string = "Cliente", originId: string = "unknown", incrementUnread: boolean = false) {
    if (!base) return null;
    const clean = cleanNumber(phone);
    try {
        let r = await base('Contacts').select({ filterByFormula: `AND({phone}='${clean}', {origin_phone_id}='${originId}')`, maxRecords: 1 }).firstPage();
        if (r.length === 0) {
            const orphan = await base('Contacts').select({ filterByFormula: `AND({phone}='${clean}', {origin_phone_id}='')`, maxRecords: 1 }).firstPage();
            if (orphan.length > 0) {
                await base('Contacts').update([{ id: orphan[0].id, fields: { "origin_phone_id": originId } }]);
                r = [orphan[0]];
            }
        }
        if (r.length > 0) {
            const fieldsToUpdate: any = { "last_message": text, "last_message_time": new Date().toISOString() };
            if (incrementUnread) {
                const currentUnread = (r[0].get('unread_count') as number) || 0;
                fieldsToUpdate["unread_count"] = currentUnread + 1;
            }
            await base('Contacts').update([{ id: r[0].id, fields: fieldsToUpdate }]);
            return r[0];
        } else {
            const fieldsToCreate: any = { "phone": clean, "name": name, "status": "Nuevo", "last_message": text, "last_message_time": new Date().toISOString(), "origin_phone_id": originId };
            if (incrementUnread) fieldsToCreate["unread_count"] = 1;

            const n = await base('Contacts').create([{ fields: fieldsToCreate }]);
            io.emit('contact_updated_notification');
            return n[0];
        }
    } catch (e) { console.error("Error Contactos:", e); return null; }
}

async function sendWhatsAppText(to: string, body: string, originPhoneId: string) {
    const token = getToken(originPhoneId);
    if (!token) return console.error("❌ Error: Token no encontrado para", originPhoneId);

    // Limpieza aquí también
    const cleanTo = cleanNumber(to);

    try {
        await axios.post(
            `https://graph.facebook.com/v21.0/${originPhoneId}/messages`,
            { messaging_product: "whatsapp", to: cleanTo, type: "text", text: { body } },
            { headers: { Authorization: `Bearer ${token}` } }
        );

        // Usamos saveAndEmitMessage para consistencia
        await saveAndEmitMessage({
            text: body,
            sender: "Bot IA",
            recipient: cleanTo,
            timestamp: new Date().toISOString(),
            type: "text",
            origin_phone_id: originPhoneId
        });

        await handleContactUpdate(cleanTo, `🤖 Laura: ${body}`, undefined, originPhoneId);
    } catch (e: any) {
        console.error("Error enviando WA:", e.response?.data || e.message);
    }
}

// ==========================================
//  HELPERS IA
// ==========================================
async function getAvailableAppointments(userPhone: string, originPhoneId: string, dateFilter?: string) {
    if (!base) return "Error DB";

    // CRÍTICO: Usar siempre el número limpio para el cache
    const cleanPhone = cleanNumber(userPhone);

    try {
        if (cleanPhone) appointmentOptionsCache.delete(cleanPhone);

        const todayStr = new Date().toISOString().split('T')[0];
        // Fetch all available future slots
        const records = await base('Appointments').select({
            filterByFormula: `AND({Status} = 'Available', {Date} >= '${todayStr}')`,
            sort: [{ field: "Date", direction: "asc" }],
            maxRecords: 100
        }).all();

        const now = new Date();
        const validRecords = records.filter(r => {
            const d = new Date(r.get('Date') as string);
            if (d <= now) return false;

            if (dateFilter) {
                const slotDateStr = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });
                return slotDateStr === dateFilter;
            }
            return true;
        }).slice(0, 10);

        if (validRecords.length === 0) return `No hay citas disponibles para esa fecha (${dateFilter || 'próximamente'}).`;

        const optionsMap: Record<number, string> = {};
        const rows: any[] = [];
        let responseText = "Huecos disponibles:\n";

        validRecords.forEach((r, index) => {
            const optionNum = index + 1;
            const dateObj = new Date(r.get('Date') as string);
            optionsMap[optionNum] = r.id;

            const dateStr = dateObj.toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid', weekday: 'short', day: 'numeric', month: 'short' });
            const timeStr = dateObj.toLocaleTimeString('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });

            if (index < 10) rows.push({ id: String(optionNum), title: timeStr, description: dateStr });
            responseText += `OPCIÓN ${optionNum}: ${dateStr} a las ${timeStr}\n`;
        });

        // Guardar cache con número limpio - PERSISTENTE en Airtable
        if (cleanPhone) {
            await saveAppointmentCache(cleanPhone, optionsMap);
        }

        console.log(`📋 [Cache] Guardado para ${cleanPhone}: ${Object.keys(optionsMap).length} opciones`);

        if (rows.length > 0 && originPhoneId && originPhoneId !== 'default') {
            const token = getToken(originPhoneId);
            if (token) {
                try {
                    await axios.post(
                        `https://graph.facebook.com/v21.0/${originPhoneId}/messages`,
                        {
                            messaging_product: "whatsapp",
                            to: cleanNumber(userPhone || ""),
                            type: "interactive",
                            interactive: {
                                type: "list",
                                header: { type: "text", text: "📅 Citas Disponibles" },
                                body: { text: `Horarios para ${dateFilter || 'próximamente'}:` },
                                footer: { text: "Reserva inmediata" },
                                action: { button: "Ver Horarios", sections: [{ title: "Huecos", rows }] }
                            }
                        },
                        { headers: { Authorization: `Bearer ${token}` } }
                    );
                    return JSON.stringify({ status: "success", info: "List sent via WhatsApp." });
                } catch (e: any) { console.warn("⚠️ Error lista interactiva:", e.message); }
            }
        }
        return responseText;
    } catch (error: any) { return "Error técnico al leer la agenda."; }
}

// Obtener días con citas disponibles (para flujo de 2 pasos)
async function getAvailableDays() {
    if (!base) return "Error DB";
    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const records = await base('Appointments').select({
            filterByFormula: `AND({Status} = 'Available', {Date} >= '${todayStr}')`,
            sort: [{ field: "Date", direction: "asc" }],
            maxRecords: 100
        }).all();

        const now = new Date();
        const uniqueDays = new Map<string, { dateStr: string, dayName: string }>();

        records.forEach(r => {
            const d = new Date(r.get('Date') as string);
            if (d <= now) return; // Ignorar citas pasadas

            // Formato YYYY-MM-DD para identificar días únicos
            const dateKey = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' });

            if (!uniqueDays.has(dateKey)) {
                const dayName = d.toLocaleDateString('es-ES', {
                    timeZone: 'Europe/Madrid',
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long'
                });
                uniqueDays.set(dateKey, { dateStr: dateKey, dayName });
            }
        });

        if (uniqueDays.size === 0) {
            return "No hay días con citas disponibles en este momento.";
        }

        // Limitar a los próximos 7 días con disponibilidad
        const days = Array.from(uniqueDays.values()).slice(0, 7);
        let response = "📅 Días con disponibilidad:\\n";
        days.forEach((day, i) => {
            response += `• ${day.dayName}\\n`;
        });
        response += "\\n¿Qué día prefieres?";

        return response;
    } catch (error: any) {
        console.error("Error obteniendo días:", error);
        return "Error técnico al consultar la agenda.";
    }
}

async function bookAppointment(optionIndex: number, clientPhone: string, clientName: string) {
    if (!base) return "Error BD";

    console.log(`📅 [Book] Intentando reservar opción ${optionIndex} para ${clientPhone}`);

    // Intentar obtener cache (primero memoria, luego Airtable)
    const userMap = await getAppointmentCache(clientPhone);

    if (!userMap) {
        console.error(`❌ [Book] No hay cache para ${clientPhone} (ni en memoria ni en Airtable)`);
        return "❌ Error: La sesión ha expirado. Pide ver los huecos de nuevo.";
    }

    console.log(`📅 [Book] Opciones disponibles: ${JSON.stringify(userMap)}`);

    const realId = userMap[optionIndex];
    if (!realId) return `❌ Error: La opción ${optionIndex} no es válida.`;
    try {
        console.log(`📅 [Book] Buscando registro ${realId}...`);
        const record = await base('Appointments').find(realId);

        if (!record) {
            console.error(`❌ [Book] Registro ${realId} no encontrado`);
            return "❌ Vaya, esa hora ya no existe.";
        }

        const currentStatus = record.get('Status');
        console.log(`📅 [Book] Status actual: ${currentStatus}`);

        if (currentStatus !== 'Available') {
            return "❌ Vaya, esa hora acaba de ocuparse.";
        }

        const dateVal = new Date(record.get('Date') as string);
        const humanDate = dateVal.toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'full', timeStyle: 'short' });

        console.log(`📅 [Book] Actualizando cita a Booked...`);
        await base('Appointments').update([{ id: realId, fields: { "Status": "Booked", "ClientPhone": clientPhone, "ClientName": clientName } }]);
        console.log(`✅ [Book] Cita actualizada correctamente`);

        // CRÍTICO: Cambiar status del contacto para que la IA NO se reactive
        const clean = cleanNumber(clientPhone);
        const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'`, maxRecords: 1 }).firstPage();
        if (contacts.length > 0) {
            console.log(`📅 [Book] Actualizando contacto a 'Cerrado'...`);
            // Usamos 'Cerrado' porque ya existe en el single-select de Airtable
            await base('Contacts').update([{ id: contacts[0].id, fields: { "status": "Cerrado" } }]);
            io.emit('contact_updated_notification');
        }

        // Limpiar cache (memoria y Airtable)
        await clearAppointmentCache(clientPhone);
        activeAiChats.delete(clean);
        io.emit('ai_active_change', { phone: clean, active: false });
        console.log(`✅ [Book] Reserva completada para ${humanDate}`);
        return `✅ RESERVA CONFIRMADA para el ${humanDate}.`;
    } catch (e: any) {
        console.error(`❌ [Book] ERROR AIRTABLE:`, e.message || e);
        console.error(`❌ [Book] Stack:`, e.stack);
        return "❌ Error técnico al guardar.";
    }
}

async function assignDepartment(clientPhone: string, department: string) {
    if (!base) return "Error BD";
    try {
        const clean = cleanNumber(clientPhone);
        const contacts = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'` }).firstPage();
        if (contacts.length > 0) {
            await base('Contacts').update([{ id: contacts[0].id, fields: { "department": department, "status": "Abierto" } }]);
            io.emit('contact_updated_notification');
            activeAiChats.delete(clean);
            io.emit('ai_active_change', { phone: clean, active: false });
            return `Asignado a ${department}.`;
        }
        return "Contacto no encontrado.";
    } catch (e) { return "Error asignando."; }
}

async function stopConversation(phone: string) {
    const clean = cleanNumber(phone);
    activeAiChats.delete(clean);
    io.emit('ai_active_change', { phone: clean, active: false });
    return "Fin conversación.";
}

async function getChatHistory(phone: string, currentText?: string, limit = 10) {
    if (!base) return [];
    try {
        const clean = cleanNumber(phone);
        const records = await base('Messages').select({
            filterByFormula: `OR({sender} = '${clean}', {recipient} = '${clean}')`,
            sort: [{ field: "timestamp", direction: "desc" }],
            maxRecords: limit
        }).all();
        const history = [...records].reverse().map((r: any) => {
            const sender = r.get('sender') as string;
            // Remitentes de clientes son siempre dígitos puros (número de teléfono limpio)
            // Cualquier otro valor (Bot IA, Agente, nombre de agente...) es el lado "model"
            const isBot = !/^\d+$/.test(sender);
            return { role: isBot ? "model" : "user", parts: [{ text: r.get('text') as string || "" }], _ts: r.get('timestamp') as string };
        });

        // FIX CRÍTICO GEMINI: Asegurar que el primer mensaje es 'user'
        while (history.length > 0 && history[0].role === 'model') {
            history.shift();
        }

        // FIX DUPLICIDAD: Eliminar el mensaje actual si ya fue guardado en Airtable
        // Solo si tiene menos de 15 segundos (artefacto de concurrencia, no un mensaje repetido a propósito)
        if (currentText && history.length > 0) {
            const lastMsg = history[history.length - 1];
            const isRecent = lastMsg._ts && (Date.now() - new Date(lastMsg._ts).getTime()) < 15000;
            if (lastMsg.role === 'user' && lastMsg.parts[0].text === currentText && isRecent) {
                console.log("✂️ Eliminando mensaje actual del historial para evitar duplicidad.");
                history.pop();
            }
        }

        // NORMALIZACIÓN GEMINI: Garantizar roles estrictamente alternos (user/model/user...)
        // Gemini lanza error si recibe dos mensajes seguidos del mismo rol
        const validHistory: { role: string, parts: { text: string }[] }[] = [];
        for (const { _ts, ...msg } of history) {
            if (validHistory.length === 0 || validHistory[validHistory.length - 1].role !== msg.role) {
                validHistory.push(msg);
            }
        }

        return validHistory;

    } catch (e) { return []; }
}

async function processJsonResponse(jsonText: string, phone: string, originId: string) {
    try {
        // Intentar extraer JSON si está envuelto en texto
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        const textToParse = jsonMatch ? jsonMatch[0] : jsonText;

        const cleanJson = textToParse.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanJson);

        if (data.customer_message) {
            await sendWhatsAppText(phone, data.customer_message, originId);
        }
    } catch (e) {
        // Fallback: Si no es JSON, enviamos el texto tal cual (limpiando markdown)
        const cleanText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
        await sendWhatsAppText(phone, cleanText, originId);
    }
}

async function processAI(text: string, contactPhone: string, contactName: string, originPhoneId: string) {
    if (!genAI) { console.error("❌ No API Key"); return; }

    const clean = cleanNumber(contactPhone);
    console.log(`🧠 [IA] Start: ${clean}: "${text}"`);
    activeAiChats.add(clean);
    io.emit('ai_status', { phone: clean, status: 'thinking' });
    io.emit('ai_active_change', { phone: clean, active: true });

    const MAX_RETRIES = 3;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const history = await getChatHistory(clean, text);

            const systemPrompt = await getSystemPrompt();

            const model = genAI.getGenerativeModel({
                model: MODEL_NAME,
                systemInstruction: systemPrompt,
                safetySettings: [
                    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
                    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
                ],
                tools: [{
                    functionDeclarations: [
                        { name: "get_available_days", description: "Get the days of the week that have available appointment slots. Call this first when user asks for an appointment without specifying a date.", parameters: { type: SchemaType.OBJECT, properties: {}, required: [] } },
                        { name: "get_available_appointments", description: "Search for available appointment slots for a specific date. Call this AFTER user selects a day.", parameters: { type: SchemaType.OBJECT, properties: { date: { type: SchemaType.STRING, description: "Date in YYYY-MM-DD format (e.g. 2026-01-15)." } }, required: ["date"] } },
                        { name: "book_appointment", description: "Book an appointment using the slot index number. Call this when user says a number like '1' or '2' or '11'. After booking, ALWAYS call stop_conversation.", parameters: { type: SchemaType.OBJECT, properties: { optionIndex: { type: SchemaType.NUMBER, description: "Index number from the list (e.g., 1)" } }, required: ["optionIndex"] } },
                        { name: "assign_department", description: "Assign chat to a human department and stop AI. Use when user needs sales, workshop, or admin help.", parameters: { type: SchemaType.OBJECT, properties: { department: { type: SchemaType.STRING, enum: ["Ventas", "Taller", "Admin"], format: "enum" } }, required: ["department"] } },
                        { name: "stop_conversation", description: "Stop the AI from replying. ALWAYS call this after booking an appointment or assigning a department.", parameters: { type: SchemaType.OBJECT, properties: {}, required: [] } }
                    ]
                }]
            });

            const chat = model.startChat({ history });
            const result = await chat.sendMessage(text);
            const response = result.response;
            const calls = response.functionCalls();

            if (calls && calls.length > 0) {
                for (const call of calls) {
                    console.log("🤖 Tool:", call.name);
                    let toolResult = "";
                    const args = call.args as any;

                    if (call.name === "get_available_days") toolResult = await getAvailableDays();
                    else if (call.name === "get_available_appointments") toolResult = await getAvailableAppointments(clean, originPhoneId, args.date);
                    else if (call.name === "book_appointment") toolResult = await bookAppointment(Number(args.optionIndex), clean, contactName);
                    else if (call.name === "assign_department") toolResult = await assignDepartment(clean, String(args.department));
                    else if (call.name === "stop_conversation") toolResult = await stopConversation(clean);

                    const result2 = await chat.sendMessage([{
                        functionResponse: { name: call.name, response: { result: toolResult } }
                    }]);

                    const finalTxt = result2.response.text();
                    await processJsonResponse(finalTxt, clean, originPhoneId);
                }
            } else {
                const txt = response.text();
                await processJsonResponse(txt, clean, originPhoneId);
            }

            // Éxito - salir del loop
            break;

        } catch (error: any) {
            console.error(`❌ Error Gemini (intento ${attempt}/${MAX_RETRIES}):`, error.message || error);

            // Retry solo para 503 (sobrecarga)
            if (error.status === 503 && attempt < MAX_RETRIES) {
                const waitTime = 1000 * Math.pow(2, attempt); // 2s, 4s, 8s
                console.log(`⏳ Reintentando en ${waitTime / 1000}s...`);
                await delay(waitTime);
                continue;
            }

            if (error.status === 404) console.error("👉 PISTA: Modelo no encontrado. Verifica MODEL_NAME.");
            if (error.status === 503) console.error("👉 Modelo sobrecargado. Intentos agotados.");
            break;
        }
    }

    io.emit('ai_status', { phone: clean, status: 'idle' });
}

// ==========================================
//  RUTAS API
// ==========================================
// ==========================================
//  AUTENTICACIÓN MULTI-EMPRESA
// ==========================================
app.post('/api/company-auth', async (req, res) => {
    const { companyId, password } = req.body;

    console.log(`🔐 [Company Auth] Intento de login: ${companyId}`);

    if (!companyId || !password) {
        return res.status(400).json({ success: false, error: 'Faltan credenciales' });
    }

    if (!base) {
        return res.status(500).json({ success: false, error: 'Base de datos no disponible' });
    }

    try {
        const records = await base('Companies').select({
            filterByFormula: `{CompanyId} = '${companyId}'`,
            maxRecords: 1
        }).firstPage();

        if (records.length === 0) {
            console.log(`❌ [Company Auth] Empresa no encontrada: ${companyId}`);
            return res.status(401).json({ success: false, error: 'Empresa no encontrada' });
        }

        const company = records[0];
        const storedPassword = company.get('Password') as string;
        const backendUrl = company.get('BackendUrl') as string;
        const companyName = company.get('CompanyName') as string;

        let passwordMatch = false;
        if (storedPassword) {
            if (storedPassword.startsWith('$2b$')) {
                passwordMatch = await bcrypt.compare(password, storedPassword);
            } else {
                passwordMatch = storedPassword === password;
                if (passwordMatch) {
                    try {
                        const hashed = await bcrypt.hash(storedPassword, 10);
                        await base('Companies').update([{ id: company.id, fields: { "Password": hashed } }]);
                    } catch (_) {}
                }
            }
        }

        if (!passwordMatch) {
            console.log(`❌ [Company Auth] Contraseña incorrecta para: ${companyId}`);
            return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
        }

        console.log(`✅ [Company Auth] Login exitoso: ${companyId} -> ${backendUrl}`);
        res.json({
            success: true,
            companyId,
            companyName: companyName || companyId,
            backendUrl: backendUrl || 'https://chatgorithm.onrender.com'
        });

    } catch (error: any) {
        console.error('❌ [Company Auth] Error:', error.message);
        res.status(500).json({ success: false, error: 'Error interno del servidor' });
    }
});

// ==========================================
//  RUTAS VOICE (TWILIO)
// ==========================================

// Middleware de debug para ver si llegan peticiones de Twilio
app.use('/api/voice', (req, res, next) => {
    console.log(`📡 [Twilio Incoming] ${req.method} ${req.url}`);
    console.log("   Headers:", JSON.stringify(req.headers));
    next();
});

app.get('/api/voice/token', (req, res) => {
    try {
        console.log("🔍 [Twilio] Generando token...");
        console.log("   - AccountSID:", twilioAccountSid ? "Set" : "Missing");
        console.log("   - API Key:", twilioApiKey ? "Set" : "Missing");
        console.log("   - API Secret:", twilioApiSecret ? "Set" : "Missing");
        console.log("   - App SID:", twilioAppSid ? "Set" : "Missing");

        if (!twilioAccountSid || !twilioApiKey || !twilioApiSecret || !twilioAppSid) {
            console.error("❌ Credenciales faltantes");
            return res.status(500).json({ error: "Faltan credenciales Twilio en .env" });
        }

        // Identidad fija para poder recibir llamadas entrantes
        const identity = 'user_web_agent';
        // Para claves de Irlanda, a veces es necesario especificar la region en las opciones del AccessToken si se soporta,
        // pero principalmente es validar que las credenciales sean correctas.
        const accessToken = new AccessToken(
            twilioAccountSid.trim(),
            twilioApiKey.trim(),
            twilioApiSecret.trim(),
            { identity: identity }
        );

        const grant = new VoiceGrant({
            outgoingApplicationSid: twilioAppSid.trim(),
            incomingAllow: true,
        });

        console.log("ℹ️ [Twilio] Usando App SID:", twilioAppSid.trim().substring(0, 6) + "...");


        accessToken.addGrant(grant);

        const jwt = accessToken.toJwt();
        console.log("✅ Token generado correctamente para:", identity);
        res.json({ token: jwt, identity: identity });
    } catch (e: any) {
        console.error("❌ Error CRÍTICO generando token Twilio:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/voice/xml', (req, res) => {
    try {
        console.log("📞 [Twilio] TwiML Request Body:", JSON.stringify(req.body, null, 2));
        const { To } = req.body;
        const response = new twilio.twiml.VoiceResponse();

        if (To) {
            console.log(`📞 [Twilio] Dialing to: ${To} from ${twilioCallerId}`);
            // Llamada saliente
            // FIX: Usar callerId configurado o fallback
            // AÑADIDO: StatusCallback para depurar por qué falla
            const dialAttributes: any = {
                callerId: twilioCallerId,
                timeout: 20,
                statusCallback: 'https://chatgorithm.onrender.com/api/voice/status',
                statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
            };
            const dial = response.dial(dialAttributes);
            // Verificar si es número completo o cliente, aquí asumimos que el cliente envía E.164
            dial.number(To);
        } else {
            console.log("📞 [Twilio] No 'To' parameter found. Playing welcome message.");
            response.say({ language: 'es-ES' }, "Gracias por llamar a Chatgorim.");
        }

        res.type('text/xml');
        res.send(response.toString());
    } catch (e: any) {
        console.error("Error generando TwiML:", e);
        res.status(500).send("Error TwiML");
    }
});

// Endpoint para recibir estados de llamada (Debug)
app.post('/api/voice/status', (req, res) => {
    const { CallSid, CallStatus, ErrorCode, ErrorMessage } = req.body;
    console.log(`📡 [Twilio Status] SID: ${CallSid} | Status: ${CallStatus}`);
    if (ErrorCode) {
        console.error(`❌ [Twilio Error] Code: ${ErrorCode} | Msg: ${ErrorMessage}`);
    }
    res.sendStatus(200);
});

// =============================================
// ENDPOINT LLAMADAS ENTRANTES
// =============================================
// Cuando alguien llama al número de Twilio, Twilio hace POST aquí
// y nosotros le decimos que conecte con el cliente web
app.post('/api/voice/incoming', (req, res) => {
    console.log("📲 [Twilio] Llamada ENTRANTE recibida:", JSON.stringify(req.body, null, 2));

    const { From, CallSid } = req.body;
    const response = new twilio.twiml.VoiceResponse();

    // Primero un mensaje de bienvenida breve
    response.say({ language: 'es-ES' }, 'Un momento, conectando con un agente.');

    // Conectar la llamada al cliente web con identidad fija
    const dial = response.dial({
        callerId: From, // Mostrar el número de quien llama
        timeout: 30,
        action: '/api/voice/dial-status', // Callback cuando termina el dial
    });

    // Conectar a TODOS los clientes web registrados con esa identidad
    dial.client('user_web_agent');

    console.log("📞 TwiML generado para llamada entrante:", response.toString());

    res.type('text/xml');
    res.send(response.toString());
});

// Callback cuando el dial termina (nadie contestó, ocupado, etc.)
app.post('/api/voice/dial-status', (req, res) => {
    const { DialCallStatus, CallSid } = req.body;
    console.log(`📡 [Twilio Dial Status] SID: ${CallSid} | Status: ${DialCallStatus}`);

    const response = new twilio.twiml.VoiceResponse();

    if (DialCallStatus !== 'completed' && DialCallStatus !== 'answered') {
        // Nadie contestó o rechazaron
        response.say({ language: 'es-ES' }, 'Lo sentimos, no hay agentes disponibles. Inténtelo más tarde.');
    }

    res.type('text/xml');
    res.send(response.toString());
});

// Handler GET para pruebas en navegador (evita "Cannot GET")
app.get('/api/voice/xml', (req, res) => {
    res.type('text/xml');
    const response = new twilio.twiml.VoiceResponse();
    response.say({ language: 'es-ES' }, "Conexión correcta. Configura POST en Twilio.");
    res.send(response.toString());
});

// Endpoint de diagnóstico de credenciales
app.get('/api/voice/test-credentials', async (req, res) => {
    try {
        if (!twilioAccountSid || !twilioApiKey || !twilioApiSecret) {
            return res.status(400).json({ error: "Faltan variables de entorno." });
        }

        // Cliente estándar (Global / US1)
        const client = twilio(twilioApiKey.trim(), twilioApiSecret.trim(), {
            accountSid: twilioAccountSid.trim(),
        });

        // Intentamos obtener los detalles de la cuenta para verificar que la Key/Secret funcionan para este AccountSID
        const account = await client.api.accounts(twilioAccountSid.trim()).fetch();

        res.json({
            status: "success",
            message: "✅ Credenciales válidas. La API Key tiene acceso a la cuenta.",
            accountName: account.friendlyName,
            type: account.type,
            statusAccount: account.status
        });
    } catch (e: any) {
        console.error("❌ Error TEST credenciales:", e);
        res.status(500).json({
            status: "error",
            message: "❌ Credenciales INVÁLIDAS. Revisar:",
            details: e.message,
            code: e.code,
            moreInfo: e.moreInfo
        });
    }
});

app.get('/api/accounts', (req, res) => res.json(Object.keys(BUSINESS_ACCOUNTS).map(id => ({ id, name: `Línea ${id.slice(-4)}` }))));

// Agenda
app.get('/api/appointments', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try {
        const records = await base('Appointments').select({ sort: [{ field: "Date", direction: "asc" }] }).all();
        res.json(records.map(r => ({ id: r.id, date: r.get('Date'), status: r.get('Status'), clientPhone: r.get('ClientPhone'), clientName: r.get('ClientName') })));
    } catch (e) { res.status(500).json({ error: "Error fetching appointments" }); }
});

app.post('/api/appointments', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try {
        await base('Appointments').create([{ fields: { "Date": req.body.date, "Status": "Available" } }]);
        res.json({ success: true });
    } catch (e) { res.status(400).json({ error: "Error creating" }); }
});

app.put('/api/appointments/:id', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try {
        const f: any = {};
        if (req.body.status) f["Status"] = req.body.status;
        if (req.body.clientPhone !== undefined) f["ClientPhone"] = req.body.clientPhone;
        if (req.body.clientName !== undefined) f["ClientName"] = req.body.clientName;
        await base('Appointments').update([{ id: req.params.id, fields: f }]);
        res.json({ success: true });
    } catch (e) { res.status(400).json({ error: "Error updating" }); }
});

app.delete('/api/appointments/:id', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try { await base('Appointments').destroy([req.params.id]); res.json({ success: true }); } catch (e) { res.status(400).json({ error: "Error deleting" }); }
});

// SCHEDULE CONFIG API
app.get('/api/schedule', async (req, res) => {
    if (!base) return res.status(500).json({});
    try {
        const r = await base('BotSettings').select({ filterByFormula: "{Setting} = 'schedule_config'", maxRecords: 1 }).firstPage();
        if (r.length > 0) res.json(JSON.parse(r[0].get('Value') as string)); else res.json(null);
    } catch (e) { res.status(500).json({ error: "Error fetching schedule" }); }
});

app.post('/api/schedule', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    const { days, startTime, endTime, duration } = req.body;
    try {
        const configStr = JSON.stringify({ days, startTime, endTime, duration });
        const configRecords = await base('BotSettings').select({ filterByFormula: "{Setting} = 'schedule_config'", maxRecords: 1 }).firstPage();
        if (configRecords.length > 0) {
            await base('BotSettings').update([{ id: configRecords[0].id, fields: { "Value": configStr } }]);
        } else {
            await base('BotSettings').create([{ fields: { "Setting": "schedule_config", "Value": configStr } }]);
        }
        runScheduleMaintenance().catch(e => console.error('Error en mantenimiento de agenda:', e));
        res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: "Error updating schedule", details: e.message }); }
});

// Templates
app.get('/api/templates', async (req, res) => {
    if (!base) return res.status(500).json({});
    try {
        const r = await base(TABLE_TEMPLATES).select().all();
        res.json(r.map(x => ({ id: x.id, name: x.get('Name'), status: x.get('Status'), body: x.get('Body'), variableMapping: x.get('VariableMapping') ? JSON.parse(x.get('VariableMapping') as string) : {} })));
    } catch (e: any) {
        console.error('Error fetching templates:', e.message);
        res.status(500).json({ error: 'Error fetching templates' });
    }
});
app.post('/api/create-template', async (req, res) => {
    if (!base) return res.status(500).json({});
    try {
        const { name, category, body, language, footer, variableExamples } = req.body;
        const formattedName = name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        let metaId = "meta_" + Date.now();
        let status = "PENDING";

        // Validar que las variables son secuenciales empezando por {{1}}
        const varMatches = body.match(/{{\d+}}/g);
        if (varMatches) {
            const varNumbers = [...new Set(varMatches.map((m: string) => parseInt(m.replace(/[^\d]/g, ''))))].sort((a: number, b: number) => a - b) as number[];
            const isSequential = varNumbers.every((num: number, i: number) => num === i + 1);
            if (!isSequential) {
                return res.status(400).json({
                    success: false,
                    error: `Las variables deben ser secuenciales empezando por {{1}}. Variables encontradas: ${varNumbers.map((n: number) => `{{${n}}}`).join(', ')}`
                });
            }
        }

        if (waToken && waBusinessId) {
            try {
                const metaPayload: any = {
                    name: formattedName,
                    category,
                    allow_category_change: true,
                    language,
                    components: [{ type: "BODY", text: body }]
                };
                if (footer) metaPayload.components.push({ type: "FOOTER", text: footer });

                const varMatches = body.match(/{{\d+}}/g);
                if (varMatches && variableExamples && Object.keys(variableExamples).length > 0) {
                    const examples = [];
                    const maxVar = Math.max(...varMatches.map((m: string) => parseInt(m.replace(/[^\d]/g, ''))));
                    for (let i = 1; i <= maxVar; i++) { examples.push(variableExamples[String(i)] || "Ejemplo"); }
                    metaPayload.components[0].example = { body_text: [examples] };
                }

                console.log("📤 PAYLOAD A META:", JSON.stringify(metaPayload, null, 2));

                const metaRes = await axios.post(`https://graph.facebook.com/v18.0/${waBusinessId}/message_templates`, metaPayload, { headers: { 'Authorization': `Bearer ${waToken}`, 'Content-Type': 'application/json' } });
                metaId = metaRes.data.id;
                status = metaRes.data.status || "PENDING";
            } catch (metaError: any) {
                console.error("❌ ERROR META DETALLADO:", JSON.stringify(metaError.response?.data, null, 2));
                const userMsg = metaError.response?.data?.error?.error_user_msg || metaError.response?.data?.error?.message || "Error desconocido de Meta";
                return res.status(400).json({ success: false, error: `Meta rechazó la plantilla: ${userMsg}` });
            }
        }

        const createdRecords = await base(TABLE_TEMPLATES).create([{ fields: { "Name": formattedName, "Category": category, "Language": language, "Body": body, "Footer": footer, "Status": status, "MetaId": metaId, "VariableMapping": JSON.stringify(variableExamples || {}) } }]);
        res.json({ success: true, template: { id: createdRecords[0].id, name: formattedName, status } });
    } catch (error: any) { res.status(400).json({ success: false, error: error.message }); }
});

app.delete('/api/delete-template/:id', async (req, res) => { if (!base) return res.status(500).json({ error: "DB" }); try { await base(TABLE_TEMPLATES).destroy([req.params.id]); res.json({ success: true }); } catch (error: any) { res.status(500).json({ error: "Error" }); } });

app.post('/api/send-template', async (req, res) => {
    const { templateName, language, phone, variables, senderName, originPhoneId } = req.body;
    const token = getToken(originPhoneId);
    if (!token) return res.status(500).json({ error: "Credenciales" });
    const cleanTo = cleanNumber(phone);
    try {
        const parameters = variables.map((val: string) => ({ type: "text", text: val }));
        await axios.post(`https://graph.facebook.com/v21.0/${originPhoneId || waPhoneId}/messages`, { messaging_product: "whatsapp", to: cleanTo, type: "template", template: { name: templateName, language: { code: language }, components: [{ type: "body", parameters }] } }, { headers: { Authorization: `Bearer ${token}` } });
        await saveAndEmitMessage({ text: `📝 [Plantilla] ${templateName}`, sender: senderName || "Agente", recipient: cleanTo, timestamp: new Date().toISOString(), type: "template", origin_phone_id: originPhoneId });
        res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: "Error envío" }); }
});

// Analytics
app.get('/api/analytics', async (req, res) => {
    if (!base) return res.status(500).json({ error: "DB" });
    try {
        const contacts = await base('Contacts').select().all();
        const messages = await base('Messages').select().all();
        const totalContacts = contacts.length;
        const totalMessages = messages.length;
        const newLeads = contacts.filter(c => c.get('status') === 'Nuevo').length;
        const last7Days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - i); return d.toISOString().split('T')[0]; }).reverse();
        const activityData = last7Days.map(date => { const count = messages.filter(m => { const mDate = (m.get('timestamp') as string || "").split('T')[0]; return mDate === date; }).length; return { date, label: new Date(date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }), count }; });
        const agentStats: Record<string, any> = {};
        messages.forEach(m => { const s = (m.get('sender') as string) || ""; const r = (m.get('recipient') as string) || ""; const isPhone = /^\d+$/.test(s.replace(/\D/g, '')); if (!isPhone && s.toLowerCase() !== 'sistema' && s.trim() !== '') { if (!agentStats[s]) agentStats[s] = { msgs: 0, uniqueChats: new Set() }; agentStats[s].msgs += 1; if (r) agentStats[s].uniqueChats.add(r); } });
        const agentPerformance = Object.entries(agentStats).map(([name, data]) => ({ name, msgCount: data.msgs, chatCount: data.uniqueChats.size })).sort((a, b) => b.msgCount - a.msgCount).slice(0, 5);
        const statusMap: Record<string, number> = {}; contacts.forEach(c => { const s = (c.get('status') as string) || 'Otros'; statusMap[s] = (statusMap[s] || 0) + 1; });
        const statusDistribution = Object.entries(statusMap).map(([name, count]) => ({ name, count }));
        res.json({ kpis: { totalContacts, totalMessages, newLeads }, activity: activityData, agents: agentPerformance, statuses: statusDistribution });
    } catch (e) { res.status(500).json({ error: "Error" }); }
});

app.get('/api/media/:id', async (req, res) => { if (!waToken) return res.sendStatus(500); try { const urlRes = await axios.get(`https://graph.facebook.com/v21.0/${req.params.id}`, { headers: { 'Authorization': `Bearer ${waToken}` } }); const mediaRes = await axios.get(urlRes.data.url, { headers: { 'Authorization': `Bearer ${waToken}` }, responseType: 'stream' }); res.setHeader('Content-Type', mediaRes.headers['content-type']); mediaRes.data.pipe(res); } catch (e) { res.sendStatus(404); } });
// Función para convertir audio WebM a OGG Opus usando FFmpeg
async function convertAudioToOggOpus(inputBuffer: Buffer, originalMimeType: string): Promise<{ buffer: Buffer, mimeType: string, filename: string }> {
    // Si ya es OGG real (no webm disfrazado), retornamos tal cual
    // Pero verificamos por el magic number del archivo
    const isRealOgg = inputBuffer[0] === 0x4F && inputBuffer[1] === 0x67 && inputBuffer[2] === 0x67 && inputBuffer[3] === 0x53; // "OggS"
    const isWebm = inputBuffer[0] === 0x1A && inputBuffer[1] === 0x45 && inputBuffer[2] === 0xDF && inputBuffer[3] === 0xA3; // WebM/MKV

    console.log(`🎵 [Audio Conv] Magic bytes: ${inputBuffer.slice(0, 4).toString('hex')} | isOgg: ${isRealOgg} | isWebm: ${isWebm}`);

    // Si es OGG real, no convertimos
    if (isRealOgg) {
        console.log(`✅ [Audio Conv] Ya es OGG real, no se requiere conversión`);
        return {
            buffer: inputBuffer,
            mimeType: 'audio/ogg',
            filename: 'voice.ogg'
        };
    }

    // Si es WebM o cualquier otro formato, convertimos a OGG Opus
    console.log(`🔄 [Audio Conv] Convirtiendo ${originalMimeType} a OGG Opus...`);

    return new Promise((resolve, reject) => {
        const tempDir = os.tmpdir();
        const inputPath = path.join(tempDir, `input_${Date.now()}.webm`);
        const outputPath = path.join(tempDir, `output_${Date.now()}.ogg`);

        // Escribir buffer a archivo temporal
        fs.writeFileSync(inputPath, inputBuffer);

        ffmpeg(inputPath)
            .audioCodec('libopus')
            .audioBitrate('32k')
            .audioChannels(1)
            .audioFrequency(48000)
            .format('ogg')
            .on('start', (cmd) => {
                console.log(`🎬 [FFmpeg] Comando: ${cmd}`);
            })
            .on('error', (err) => {
                console.error(`❌ [FFmpeg] Error:`, err.message);
                // Limpiar archivos temporales
                try { fs.unlinkSync(inputPath); } catch (e) { }
                try { fs.unlinkSync(outputPath); } catch (e) { }
                reject(err);
            })
            .on('end', () => {
                console.log(`✅ [FFmpeg] Conversión completada`);
                try {
                    const outputBuffer = fs.readFileSync(outputPath);
                    // Limpiar archivos temporales
                    fs.unlinkSync(inputPath);
                    fs.unlinkSync(outputPath);

                    console.log(`✅ [Audio Conv] Tamaño salida: ${outputBuffer.length} bytes`);
                    resolve({
                        buffer: outputBuffer,
                        mimeType: 'audio/ogg',
                        filename: 'voice.ogg'
                    });
                } catch (readErr) {
                    reject(readErr);
                }
            })
            .save(outputPath);
    });
}

app.post('/api/upload', upload.single('file'), async (req: any, res: any) => {
    try {
        let file = req.file;
        const { targetPhone, senderName, originPhoneId } = req.body;
        const token = getToken(originPhoneId);
        const cleanTo = cleanNumber(targetPhone);

        console.log(`📤 [Upload] Archivo: ${file?.originalname} | MimeType: ${file?.mimetype} | Size: ${file?.size} bytes`);

        if (!file || !targetPhone || !token) {
            console.error("❌ [Upload] Faltan datos:", { file: !!file, targetPhone, token: !!token });
            return res.status(400).json({ error: "Faltan datos" });
        }

        // Variables para el archivo procesado
        let fileBuffer = file.buffer;
        let fileMimeType = file.mimetype;
        let fileName = file.originalname;

        // Si es audio, intentamos convertir a OGG Opus para que WhatsApp lo muestre como nota de voz
        const isAudio = file.mimetype.startsWith('audio');
        if (isAudio) {
            try {
                console.log(`🎵 [Upload] Detectado audio, intentando conversión a OGG Opus...`);
                const converted = await convertAudioToOggOpus(file.buffer, file.mimetype);
                fileBuffer = converted.buffer;
                fileMimeType = converted.mimeType;
                fileName = converted.filename;
                console.log(`✅ [Upload] Audio convertido: ${fileMimeType}, ${fileBuffer.length} bytes`);
            } catch (convErr: any) {
                console.error(`⚠️ [Upload] Conversión falló, usando archivo original:`, convErr.message);
                // Si falla la conversión, usamos el archivo original
            }
        }

        // Si es imagen, auto-rotar según metadatos EXIF para que no salga de lado
        const isImage = file.mimetype.startsWith('image');
        if (isImage) {
            try {
                console.log(`🖼️ [Upload] Detectada imagen, aplicando corrección EXIF...`);
                fileBuffer = await sharp(file.buffer).rotate().toBuffer();
                console.log(`✅ [Upload] Imagen corregida (orientación EXIF aplicada)`);
            } catch (sharpErr: any) {
                console.error(`⚠️ [Upload] Corrección EXIF falló, usando imagen original:`, sharpErr.message);
            }
        }

        const formData = new FormData();
        formData.append('file', fileBuffer, { filename: fileName, contentType: fileMimeType });
        formData.append('messaging_product', 'whatsapp');

        console.log(`📤 [Upload] Subiendo a WhatsApp Media API... (${fileMimeType})`);
        const uploadRes = await axios.post(`https://graph.facebook.com/v21.0/${originPhoneId || waPhoneId}/media`, formData, { headers: { 'Authorization': `Bearer ${token}`, ...formData.getHeaders() } });
        const mediaId = uploadRes.data.id;
        console.log(`✅ [Upload] Media subida, ID: ${mediaId}`);

        let msgType = 'document';
        if (file.mimetype.startsWith('image')) msgType = 'image';
        else if (isAudio) msgType = 'audio';

        console.log(`📤 [Upload] Enviando mensaje tipo: ${msgType} a ${cleanTo}`);

        const payload: any = { messaging_product: "whatsapp", to: cleanTo, type: msgType };
        payload[msgType] = { id: mediaId, ...(msgType === 'document' && { filename: fileName }) };

        const msgRes = await axios.post(`https://graph.facebook.com/v21.0/${originPhoneId || waPhoneId}/messages`, payload, { headers: { Authorization: `Bearer ${token}` } });
        console.log(`✅ [Upload] Mensaje enviado a WhatsApp:`, msgRes.data);

        let textLog = file.originalname; let saveType = 'document';
        if (msgType === 'image') { textLog = "📷 [Imagen]"; saveType = 'image'; }
        else if (msgType === 'audio') { textLog = "🎤 [Audio]"; saveType = 'audio'; }

        await saveAndEmitMessage({ text: textLog, sender: senderName, recipient: cleanTo, timestamp: new Date().toISOString(), type: saveType, mediaId: mediaId, origin_phone_id: originPhoneId });
        await handleContactUpdate(cleanTo, `Tú (${senderName}): 📎 Archivo`, undefined, originPhoneId);
        res.json({ success: true });
    } catch (e: any) {
        console.error("❌ [Upload] Error:", e.response?.data || e.message || e);
        res.status(500).json({ error: "Error subiendo archivo", details: e.response?.data || e.message });
    }
});

// ==========================================
//  ENDPOINT SUBIDA ARCHIVOS CHAT DE EQUIPO
// ==========================================
app.post('/api/team/upload', teamUpload.single('file'), async (req: any, res: any) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const resourceType = req.file.mimetype.startsWith('audio/') || req.file.mimetype.startsWith('video/')
            ? 'video' : req.file.mimetype.startsWith('image/') ? 'image' : 'raw';

        const fileUrl = await new Promise<string>((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { resource_type: resourceType as any, folder: 'team_uploads' },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result!.secure_url);
                }
            );
            stream.end(req.file!.buffer);
        });

        console.log(`📎 [Team Upload] Subido a Cloudinary: ${fileUrl} (${req.file.mimetype})`);

        res.json({
            success: true,
            url: fileUrl,
            mimetype: req.file.mimetype,
            filename: req.file.originalname
        });
    } catch (e: any) {
        console.error("❌ [Team Upload] Error:", e);
        res.status(500).json({ error: "Error subiendo archivo de equipo" });
    }
});

app.get('/api/bot-config', async (req, res) => { if (!base) return res.sendStatus(500); try { const r = await base('BotSettings').select({ filterByFormula: "{Setting} = 'system_prompt'", maxRecords: 1 }).firstPage(); res.json({ prompt: r.length > 0 ? r[0].get('Value') : DEFAULT_SYSTEM_PROMPT }); } catch (e) { res.status(500).json({ error: "Error" }); } });
app.post('/api/bot-config', async (req, res) => { if (!base) return res.sendStatus(500); try { const { prompt } = req.body; const r = await base('BotSettings').select({ filterByFormula: "{Setting} = 'system_prompt'", maxRecords: 1 }).firstPage(); if (r.length > 0) await base('BotSettings').update([{ id: r[0].id, fields: { "Value": prompt } }]); else await base('BotSettings').create([{ fields: { "Setting": "system_prompt", "Value": prompt } }]); res.json({ success: true }); } catch (e) { res.status(500).json({ error: "Error" }); } });

// ==========================================
//  WEBHOOKS (CORREGIDO: RECIPIENT EXPLÍCITO)
// ==========================================
app.get('/webhook', (req, res) => { if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) res.status(200).send(req.query['hub.challenge']); else res.sendStatus(403); });
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        console.log(`📨 [WEBHOOK] POST recibido. object=${body.object}, entries=${body.entry?.length || 0}`);

        if (body.object && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            const change = body.entry[0].changes[0].value;
            const msg = change.messages[0];

            // FIX: Safely access metadata and log if missing
            const originPhoneId = change.metadata?.phone_number_id || waPhoneId || "unknown_phone_id";
            if (!change.metadata) {
                console.warn("⚠️ [WEBHOOK] 'metadata' faltante en change object:", JSON.stringify(change).substring(0, 500));
            }

            // Limpieza de datos entrantes
            const from = cleanNumber(msg.from);

            let text = "(Media)";
            let inboundMediaId: string | undefined = undefined;
            let inboundType = 'text';

            if (msg.type === 'text') {
                text = msg.text.body;
                inboundType = 'text';
            } else if (msg.type === 'interactive') {
                if (msg.interactive.type === 'list_reply') {
                    text = msg.interactive.list_reply.id;
                } else if (msg.interactive.type === 'button_reply') {
                    text = msg.interactive.button_reply.id;
                }
                inboundType = 'text';
            } else if (msg.type === 'image') {
                text = msg.image?.caption || '📷 (Imagen)';
                inboundMediaId = msg.image?.id;
                inboundType = 'image';
            } else if (msg.type === 'audio') {
                text = '🎤 (Audio)';
                inboundMediaId = msg.audio?.id;
                inboundType = 'audio';
            } else if (msg.type === 'video') {
                text = msg.video?.caption || '🎥 (Video)';
                inboundMediaId = msg.video?.id;
                inboundType = 'video';
            } else if (msg.type === 'document') {
                text = msg.document?.filename || '📎 (Documento)';
                inboundMediaId = msg.document?.id;
                inboundType = 'document';
            } else if (msg.type === 'sticker') {
                text = '🖼️ (Sticker)';
                inboundMediaId = msg.sticker?.id;
                inboundType = 'image';
            }

            if (processedWebhookIds.has(msg.id)) {
                console.log(`🔂 Webhook duplicado ignorado: ${msg.id}`);
                return res.sendStatus(200);
            }
            processedWebhookIds.add(msg.id);
            setTimeout(() => processedWebhookIds.delete(msg.id), 300000); // 5 mins

            console.log(`📩 [WEBHOOK] Mensaje de ${from}: "${text}" (tipo: ${msg.type}, mediaId: ${inboundMediaId || 'ninguno'}, phoneId: ${originPhoneId})`);

            const contactRecord = await handleContactUpdate(from, text, change.contacts?.[0]?.profile?.name, originPhoneId);

            // CORRECCIÓN CRÍTICA: Añadir recipient como originPhoneId y pasar el tipo y mediaId correcto
            await saveAndEmitMessage({
                text,
                sender: from,
                timestamp: new Date().toISOString(),
                type: inboundType,
                mediaId: inboundMediaId,
                origin_phone_id: originPhoneId,
                recipient: originPhoneId
            });
            console.log(`✅ [WEBHOOK] Mensaje emitido al socket y guardado en Airtable`);

            if (activeAiChats.has(from)) {
                console.log(`🤖 IA activada por sesión activa para ${from}`);
                processAI(text, from, contactRecord?.get('name') as string || "Cliente", originPhoneId);
            } else if (contactRecord && contactRecord.get('status') === 'Nuevo' && !contactRecord.get('assigned_to')) {
                console.log(`🤖 IA activada por nuevo lead para ${from}`);
                processAI(text, from, contactRecord.get('name') as string || "Cliente", originPhoneId);
            } else {
                console.log(`🔕 IA ignorada. Status=${contactRecord?.get('status')}, Assigned=${contactRecord?.get('assigned_to')}`);
            }
        } else if (body.object && body.entry?.[0]?.changes?.[0]?.value?.statuses) {
            // Status updates (delivered, read, etc.) - ignorar silenciosamente
            console.log(`📊 [WEBHOOK] Status update recibido (no es mensaje)`);
        } else if (body.object && body.entry?.[0]?.changes?.[0]?.field === 'message_template_status_update') {
            const metaId = body.entry[0].changes[0].value.message_template_id;
            const newStatus = body.entry[0].changes[0].value.event;
            console.log(`📋 [WEBHOOK] Template status update: ${metaId} -> ${newStatus}`);
            if (base) {
                try {
                    const records = await base(TABLE_TEMPLATES).select({ filterByFormula: `{MetaId} = '${metaId}'` }).firstPage();
                    if (records.length > 0) await base(TABLE_TEMPLATES).update([{ id: records[0].id, fields: { "Status": newStatus } }]);
                } catch (e) { console.error("Error status plantilla:", e); }
            }
        } else {
            console.log(`⚠️ [WEBHOOK] Body no reconocido:`, JSON.stringify(body).substring(0, 500));
        }
        res.sendStatus(200);
    } catch (e: any) {
        console.error("💥 [WEBHOOK] Error procesando webhook:", e.message, e.stack);
        res.sendStatus(200); // Siempre responder 200 para que Meta no reintente indefinidamente
    }
});

// ==========================================
//  SOCKETS
// ==========================================
io.on('connection', (socket) => {
    socket.on('request_config', async () => { if (base) { const r = await base('Config').select().all(); socket.emit('config_list', r.map(x => ({ id: x.id, name: x.get('name'), type: x.get('type') }))); } });
    socket.on('add_config', async (data) => { if (base) { await base('Config').create([{ fields: { "name": data.name, "type": data.type } }]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); } });
    socket.on('delete_config', async (id) => { if (base) { const realId = (typeof id === 'object' && id.id) ? id.id : id; await base('Config').destroy([realId]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); } });
    socket.on('update_config', async (d) => { if (base) { await base('Config').update([{ id: d.id, fields: { "name": d.name } }]); io.emit('config_list', (await base('Config').select().all()).map(r => ({ id: r.id, name: r.get('name'), type: r.get('type') }))); } });
    socket.on('request_quick_replies', async () => { if (base) { const r = await base('QuickReplies').select().all(); socket.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });
    socket.on('add_quick_reply', async (d) => { if (base) { await base('QuickReplies').create([{ fields: { "Title": d.title, "Content": d.content, "Shortcut": d.shortcut } }]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });
    socket.on('delete_quick_reply', async (id) => { if (base) { await base('QuickReplies').destroy([id]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });
    socket.on('update_quick_reply', async (d) => { if (base) { await base('QuickReplies').update([{ id: d.id, fields: { "Title": d.title, "Content": d.content, "Shortcut": d.shortcut } }]); const r = await base('QuickReplies').select().all(); io.emit('quick_replies_list', r.map(x => ({ id: x.id, title: x.get('Title'), content: x.get('Content'), shortcut: x.get('Shortcut') }))); } });
    socket.on('request_agents', async () => { if (base) { const r = await base('Agents').select().all(); socket.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password'), preferences: x.get('Preferences') ? JSON.parse(x.get('Preferences') as string) : {} }))); } });
    socket.on('login_attempt', async (data) => { if (!base) return; const r = await base('Agents').select({ filterByFormula: `{name} = '${data.name}'`, maxRecords: 1 }).firstPage(); if (r.length > 0) { const pwd = r[0].get('password'); const prefs = r[0].get('Preferences') ? JSON.parse(r[0].get('Preferences') as string) : {}; let agentPasswordOk = false; if (!pwd || String(pwd).trim() === "") { agentPasswordOk = true; } else if (String(pwd).startsWith('$2b$')) { agentPasswordOk = await bcrypt.compare(String(data.password), String(pwd)); } else { agentPasswordOk = String(pwd) === String(data.password); if (agentPasswordOk) { try { const hashed = await bcrypt.hash(String(pwd), 10); await base('Agents').update([{ id: r[0].id, fields: { "password": hashed } }]); } catch (_) {} } } if (agentPasswordOk) socket.emit('login_success', { username: r[0].get('name'), role: r[0].get('role'), preferences: prefs }); else socket.emit('login_error', 'Contraseña incorrecta'); } else socket.emit('login_error', 'Usuario no encontrado'); });
    socket.on('create_agent', async (d) => { if (!base) return; await base('Agents').create([{ fields: { "name": d.newAgent.name, "role": d.newAgent.role, "password": d.newAgent.password ? await bcrypt.hash(d.newAgent.password, 10) : "" } }]); const r = await base('Agents').select().all(); io.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password'), preferences: x.get('Preferences') ? JSON.parse(x.get('Preferences') as string) : {} }))); socket.emit('action_success', 'Creado'); });
    socket.on('delete_agent', async (d) => { if (!base) return; await base('Agents').destroy([d.agentId]); const r = await base('Agents').select().all(); io.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password'), preferences: x.get('Preferences') ? JSON.parse(x.get('Preferences') as string) : {} }))); socket.emit('action_success', 'Eliminado'); });
    socket.on('update_agent', async (d) => { if (!base) return; try { const f: any = { "name": d.updates.name, "role": d.updates.role }; if (d.updates.password !== undefined) f["password"] = d.updates.password ? await bcrypt.hash(d.updates.password, 10) : ""; if (d.updates.preferences !== undefined) f["Preferences"] = JSON.stringify(d.updates.preferences); await base('Agents').update([{ id: d.agentId, fields: f }]); const r = await base('Agents').select().all(); io.emit('agents_list', r.map(x => ({ id: x.id, name: x.get('name'), role: x.get('role'), hasPassword: !!x.get('password'), preferences: x.get('Preferences') ? JSON.parse(x.get('Preferences') as string) : {} }))); socket.emit('action_success', 'Actualizado'); } catch (e) { socket.emit('action_error', 'Error guardando'); } });

    // REQUEST CONTACTS
    socket.on('request_contacts', async () => {
        if (base) {
            const r = await base('Contacts').select({ sort: [{ field: "last_message_time", direction: "desc" }] }).all();
            socket.emit('contacts_update', r.map(x => ({
                id: x.id,
                phone: cleanNumber(x.get('phone')),
                name: x.get('name'),
                status: x.get('status'),
                department: x.get('department'),
                assigned_to: x.get('assigned_to'),
                last_message: x.get('last_message'),
                last_message_time: x.get('last_message_time'),
                avatar: (x.get('avatar') as any[])?.[0]?.url,
                tags: x.get('tags') || [],
                origin_phone_id: x.get('origin_phone_id'),
                unread_count: x.get('unread_count') || 0 // Return unread_count
            })));
        }
    });

    // MARK READ (Nuevo)
    socket.on('mark_read', async (data) => {
        if (base && data.phone) {
            const clean = cleanNumber(data.phone);
            try {
                const r = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'`, maxRecords: 1 }).firstPage();
                if (r.length > 0) {
                    await base('Contacts').update([{ id: r[0].id, fields: { "unread_count": 0 } }]);
                }
            } catch (e) { console.error("Error marking read:", e); }
        }
    });

    // REQUEST CONVERSATION (CORREGIDO PARA SYNC)
    socket.on('request_conversation', async (p) => {
        if (base) {
            const c = cleanNumber(p);
            // Buscamos solo por el número limpio, asumiendo que el guardado también es limpio
            const r = await base('Messages').select({
                filterByFormula: `OR({sender}='${c}',{recipient}='${c}')`,
                sort: [{ field: "timestamp", direction: "asc" }]
            }).all();
            socket.emit('conversation_history', r.map(x => ({ text: x.get('text'), sender: x.get('sender'), timestamp: x.get('timestamp'), type: x.get('type'), mediaId: x.get('media_id') })));
        }
    });

    socket.on('update_contact_info', async (data) => { if (base) { const clean = cleanNumber(data.phone); const r = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'` }).firstPage(); if (r.length > 0) { await base('Contacts').update([{ id: r[0].id, fields: data.updates }], { typecast: true }); io.emit('contact_updated_notification'); } } });

    // CHAT MESSAGE (CORREGIDO PARA SYNC)
    socket.on('chatMessage', async (msg) => {
        // FIX: Validar que el originPhoneId existe en BUSINESS_ACCOUNTS, si no, usar waPhoneId
        const rawOriginId = msg.originPhoneId || waPhoneId || "default";
        const originId = BUSINESS_ACCOUNTS[rawOriginId] ? rawOriginId : (waPhoneId || "default");
        if (rawOriginId !== originId) {
            console.log(`⚠️ [chatMessage] originPhoneId '${rawOriginId}' no válido, usando fallback: '${originId}'`);
        }
        const token = getToken(originId);
        const cleanTo = cleanNumber(msg.targetPhone); // LIMPIEZA

        // --- LOGICA HANDOVER ---
        // Si un humano responde manualmente, sacamos al usuario de la lista de chats activos de IA.
        // Y ADEMÁS marcamos el contacto como "En Curso" para que el webhook no vuelva a activar la IA.
        if (activeAiChats.has(cleanTo)) {
            console.log(`🛑 Handover: Agente humano intervino con ${cleanTo}. Deteniendo IA.`);
            activeAiChats.delete(cleanTo);
            io.emit('ai_active_change', { phone: cleanTo, active: false });
        }

        // FIX: Forzar estado "En Curso" para evitar reactivación por "Nuevo"
        // FIX: Forzar estado "En Curso" (Con AWAIT real) para evitar conflictos con webhook
        if (base) {
            try {
                // Buscamos el contacto primero
                const records = await base('Contacts').select({ filterByFormula: `{phone} = '${cleanTo}'`, maxRecords: 1 }).firstPage();

                if (records.length > 0) {
                    const currentStatus = records[0].get('status');
                    // Solo actualizamos si es "Nuevo" (o está asignado a IA implícitamente) para evitar pisar otros estados
                    if (currentStatus === 'Nuevo') {
                        console.log(`📝 [SYNC] Cambio forzado: ${cleanTo} -> Status 'Abierto' (Stop IA)`);
                        await base('Contacts').update([{ id: records[0].id, fields: { "status": "Abierto" } }]);
                    }
                }
            } catch (err) {
                console.error("❌ Error actualizando status (Handover):", err);
            }
        }

        if (token) {
            // 1. SIEMPRE guardar y emitir el mensaje al UI (prioridad alta)
            try {
                await saveAndEmitMessage({
                    text: msg.text,
                    sender: msg.sender,
                    recipient: cleanTo,
                    type: msg.type || 'text',
                    origin_phone_id: originId,
                    timestamp: new Date().toISOString()
                });

                const prev = msg.type === 'note' ? `📝 Nota: ${msg.text}` : `Tú: ${msg.text}`;
                await handleContactUpdate(cleanTo, prev, undefined, originId);
            } catch (e: any) {
                console.error("❌ Error guardando mensaje:", e.message);
            }

            // 2. Intentar enviar por WhatsApp (puede fallar sin afectar al UI)
            if (msg.type !== 'note') {
                try {
                    await axios.post(`https://graph.facebook.com/v21.0/${originId}/messages`, { messaging_product: "whatsapp", to: cleanTo, type: "text", text: { body: msg.text } }, { headers: { Authorization: `Bearer ${token}` } });
                    console.log(`✅ [WA] Mensaje enviado a ${cleanTo}`);
                } catch (e: any) {
                    console.error("⚠️ [WA] Error enviando por WhatsApp (mensaje guardado en UI):", e.response?.data || e.message);
                }
            }
        }
    });

    socket.on('trigger_ai_manual', async (data) => { const { phone } = data; const originId = waPhoneId || "default"; if (base) { const clean = cleanNumber(phone); activeAiChats.add(clean); io.emit('ai_active_change', { phone: clean, active: true }); const records = await base('Contacts').select({ filterByFormula: `{phone} = '${clean}'` }).firstPage(); const name = (records.length > 0) ? (records[0].get('name') as string) : "Cliente"; const msgs = await base('Messages').select({ filterByFormula: `OR({sender}='${clean}',{recipient}='${clean}')`, sort: [{ field: "timestamp", direction: "desc" }], maxRecords: 1 }).firstPage(); const text = msgs.length > 0 ? (msgs[0].get('text') as string) : "Hola"; processAI(text, clean, name, originId); } });
    socket.on('stop_ai_manual', (d) => { const clean = cleanNumber(d.phone); activeAiChats.delete(clean); io.emit('ai_active_change', { phone: clean, active: false }); });
    socket.on('register_presence', (u: string) => { if (u) { onlineUsers.set(socket.id, u); io.emit('online_users_update', Array.from(new Set(onlineUsers.values()))); } });
    socket.on('disconnect', () => { if (onlineUsers.has(socket.id)) { onlineUsers.delete(socket.id); io.emit('online_users_update', Array.from(new Set(onlineUsers.values()))); } });
    socket.on('typing', (d) => { socket.broadcast.emit('remote_typing', d); });

    // --- SOCKETS TEAM CHAT ---
    socket.on('request_team_history', async (channelName) => {
        if (!base) return;
        try {
            let filter = `{channel} = '${channelName}'`;
            if (channelName.includes('_')) {
                const [u1, u2] = channelName.split('_');
                filter = `OR({channel} = '${u1}_${u2}', {channel} = '${u2}_${u1}')`;
            }
            const records = await base(TABLE_TEAM_MESSAGES).select({
                filterByFormula: filter,
                sort: [{ field: "timestamp", direction: "asc" }],
                maxRecords: 50
            }).all();

            const history = records.map(r => ({
                id: r.id,
                content: r.get('content'),
                sender: r.get('sender'),
                timestamp: r.get('timestamp'),
                channel: r.get('channel')
            }));

            socket.emit('team_history', { channel: channelName, history });
        } catch (e) { console.error("Error team history:", e); }
    });

    socket.on('send_team_message', async (msg) => {
        if (!base) return;
        const timestamp = new Date().toISOString();
        // Emitir a todos
        io.emit('team_message', { ...msg, timestamp });

        try {
            console.log("📝 Guardando mensaje interno:", msg);
            await base(TABLE_TEAM_MESSAGES).create([{
                fields: {
                    "content": msg.content,
                    "sender": msg.sender,
                    "channel": msg.channel,
                    "timestamp": timestamp
                }
            }]);

            // === Notificaciones Push para Equipo ===
            const isPrivate = msg.channel.includes('_');
            const [u1, u2] = isPrivate ? msg.channel.split('_') : ['', ''];

            const pushTitle = isPrivate ? `Mensaje de ${msg.sender}` : `Equipo (${msg.channel}): ${msg.sender}`;
            const pushData = { type: 'team_chat', channel: msg.channel };

            // 1. Android (FCM)
            let fcmRecipients: string[] = [];
            if (isPrivate) {
                fcmRecipients = [u1, u2].filter(u => u && u !== msg.sender);
            } else {
                // Para chat general, enviamos a todos los agentes que tienen token, excepto al remitente
                fcmRecipients = Array.from(new Set(Array.from(fcmTokens.values()).map(d => d.username)))
                                     .filter(u => u && u !== msg.sender);
            }

            let pushBody = msg.content;
            if (pushBody.startsWith('FILE_UPLOAD:::')) {
                const parts = pushBody.split(':::');
                const mime = parts[1] || '';
                const textComment = parts.slice(4).join(':::') || '';
                let typeIcon = '📎 (Archivo)';
                if (mime.startsWith('image/')) typeIcon = '📷 (Imagen)';
                else if (mime.startsWith('video/')) typeIcon = '🎥 (Video)';
                else if (mime.startsWith('audio/')) typeIcon = '🎤 (Audio)';
                pushBody = textComment ? `${typeIcon} ${textComment}` : typeIcon;
            }

            if (fcmRecipients.length > 0) {
                sendFCMNotification({
                    title: pushTitle,
                    body: pushBody,
                    data: pushData
                }, fcmRecipients);
            }

            // 2. Web (WebPush)
            Array.from(pushSubscriptions.entries()).forEach(([username, sub]) => {
                if (username === msg.sender) return; // No notificar al remitente
                if (isPrivate && username !== u1 && username !== u2) return; // Filtro chat privado
                
                try {
                    const payload = JSON.stringify({ title: pushTitle, body: msg.content, url: '/team' });
                    webpush.sendNotification(sub, payload).catch(e => {
                        console.error('❌ [WebPush] Error enviando team chat:', e.statusCode || e.message);
                    });
                } catch (e) {
                    console.error('Error procesando WebPush de equipo:', e);
                }
            });

        } catch (e: any) {
            console.error("❌ Error saving team msg:", e);
        }
    });
});

setInterval(runScheduleMaintenance, 3600000);

// --- FCM TOKEN REGISTRATION ENDPOINT ---
// El móvil llama a este endpoint para registrar su token FCM
app.post('/api/push-notifications/register', async (req, res) => {
    const { token, username } = req.body;

    if (!token) {
        console.error('❌ [FCM] Registro fallido: No se recibió token');
        return res.status(400).json({ error: 'Token required' });
    }

    const user = username || 'unknown';
    const tokenId = token.substring(0, 20);
    fcmTokens.set(token, { token, username: user }); // Usar el token completo como key para evitar colisiones de substring

    // Persistir en Airtable para que sobreviva reinicios
    await saveFCMTokenToAirtable(tokenId, token, user);

    console.log(`📱 [FCM] ¡TOKEN REGISTRADO! Usuario: ${user} | ID: ${tokenId}... (Total tokens: ${fcmTokens.size})`);
    res.json({ success: true, message: 'Token registered successfully' });
});

// Endpoint para desregistrar token (cuando el usuario cierra sesión)
app.delete('/api/push-notifications/unregister', (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Token required' });
    }

    fcmTokens.delete(token);

    console.log(`📱 [FCM] Token eliminado de memoria: ${token.substring(0, 10)}...`);
    res.json({ success: true });
});

// --- WEB PUSH SUBSCRIPTION ENDPOINT ---
app.post('/api/webpush/subscribe', (req, res) => {
    const { subscription, username } = req.body;

    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ error: 'Subscription required' });
    }

    const user = username || 'unknown';
    pushSubscriptions.set(user, subscription);

    // Persistir en Airtable
    saveWebPushSubscriptionToAirtable(user, subscription);

    console.log(`🌐 [WebPush] Suscripción registrada para: ${user}`);
    res.status(201).json({ success: true });
});

httpServer.listen(PORT, () => { console.log(`🚀 Servidor Listo ${PORT}`); });