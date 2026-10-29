// Cobro de suscripciones Chatgorim / Pulso desde la web pública (chatgorim.com) con Stripe.
// Flujo: /setup (cliente + SetupIntent) → el navegador confirma la tarjeta con Stripe Elements
//        → /start (programa 30 días de prueba gratis y, después, cuota + alta).
// Los importes viven SOLO aquí: el navegador nunca manda precios, solo las claves de plan.
// Variables de entorno (Render): STRIPE_SECRET_KEY, STRIPE_PUBLISHABLE_KEY, STRIPE_WEBHOOK_SECRET.
// Rutas fuera de /api a propósito: son públicas y no deben pasar por ENFORCE_API_AUTH.
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';

const TRIAL_DAYS = 30;
const IVA_PERCENT = 21;

type Plan = { product: 'chatgorim' | 'pulso'; name: string; monthly: number; setup: number };
// Céntimos de euro, sin IVA. Fuente: "Plan de acción 30 días – Prueba gratuita Chatgorim", secciones 2 y 3.
const PLANS: Record<string, Plan> = {
    chatgorim_basico:     { product: 'chatgorim', name: 'Chatgorim Básico',     monthly: 8900,  setup: 41000 },
    chatgorim_pro:        { product: 'chatgorim', name: 'Chatgorim Pro',        monthly: 16900, setup: 99000 },
    chatgorim_enterprise: { product: 'chatgorim', name: 'Chatgorim Enterprise', monthly: 27900, setup: 145000 },
    pulso_6:              { product: 'pulso',     name: 'Pulso hasta 6 trabajadores',  monthly: 5900,  setup: 0 },
    pulso_15:             { product: 'pulso',     name: 'Pulso de 7 a 15 trabajadores', monthly: 9900,  setup: 0 },
    pulso_30:             { product: 'pulso',     name: 'Pulso de 16 a 30 trabajadores', monthly: 14900, setup: 0 },
};

const WEB_ORIGINS = (process.env.BILLING_ORIGINS || 'https://www.chatgorim.com,https://chatgorim.com')
    .split(',').map(s => s.trim()).filter(Boolean);

let stripeClient: Stripe | null = null;
function stripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY no configurada');
    if (!stripeClient) stripeClient = new Stripe(key);
    return stripeClient;
}

// Límite sencillo por IP (en memoria): evita que alguien llene Stripe de clientes falsos.
const hits = new Map<string, number[]>();
function rateLimited(ip: string, max = 12, windowMs = 3600_000): boolean {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter(t => now - t < windowMs);
    list.push(now);
    hits.set(ip, list);
    return list.length > max;
}

/** Valida las claves de plan: 1 o 2, existentes y como mucho una por producto. */
function parsePlans(raw: unknown): string[] | null {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > 2) return null;
    const keys = raw.map(String);
    if (keys.some(k => !PLANS[k])) return null;
    if (new Set(keys.map(k => PLANS[k].product)).size !== keys.length) return null;
    return keys;
}

function summary(keys: string[]) {
    return {
        trialDays: TRIAL_DAYS,
        ivaPercent: IVA_PERCENT,
        items: keys.map(k => ({ key: k, name: PLANS[k].name, monthly: PLANS[k].monthly, setup: PLANS[k].setup })),
        monthlyTotal: keys.reduce((s, k) => s + PLANS[k].monthly, 0),
        setupTotal: keys.reduce((s, k) => s + PLANS[k].setup, 0),
    };
}

const productCache = new Map<string, string>();
async function productIdFor(key: string): Promise<string> {
    const hit = productCache.get(key);
    if (hit) return hit;
    const s = stripe();
    for await (const p of s.products.list({ active: true, limit: 100 })) {
        if (p.metadata?.cg_plan === key) { productCache.set(key, p.id); return p.id; }
    }
    const created = await s.products.create({ name: PLANS[key].name, metadata: { cg_plan: key } }, { idempotencyKey: `cg_product_${key}` });
    productCache.set(key, created.id);
    return created.id;
}

let taxRateId: string | null = null;
async function ivaRateId(): Promise<string> {
    if (taxRateId) return taxRateId;
    const s = stripe();
    for await (const t of s.taxRates.list({ active: true, limit: 100 })) {
        if (t.metadata?.cg_iva === String(IVA_PERCENT) && !t.inclusive) { taxRateId = t.id; return t.id; }
    }
    const created = await s.taxRates.create({
        display_name: 'IVA', percentage: IVA_PERCENT, inclusive: false, country: 'ES', metadata: { cg_iva: String(IVA_PERCENT) },
    }, { idempotencyKey: `cg_iva_${IVA_PERCENT}` });
    taxRateId = created.id;
    return created.id;
}

export const billingRouter = express.Router();

billingRouter.use(cors({
    origin: (origin, cb) => cb(null, !origin || WEB_ORIGINS.includes(origin) || /^http:\/\/localhost(:\d+)?$/.test(origin)),
}));

// Webhook: cuerpo crudo para verificar la firma. Hoy solo deja constancia en logs de lo que pasa con los cobros.
billingRouter.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return res.status(503).send('webhook no configurado');
    let event: Stripe.Event;
    try {
        event = stripe().webhooks.constructEvent(req.body, String(req.headers['stripe-signature'] || ''), secret);
    } catch (err: any) {
        console.warn('[billing] firma de webhook inválida:', err?.message);
        return res.status(400).send('firma inválida');
    }
    if (['invoice.paid', 'invoice.payment_failed', 'customer.subscription.deleted', 'customer.subscription.trial_will_end'].includes(event.type)) {
        const obj: any = event.data.object;
        console.log(`[billing] ${event.type} · cliente ${obj.customer || obj.id} · ${obj.amount_paid ?? ''}`);
    }
    res.json({ received: true });
});

billingRouter.use(express.json({ limit: '10kb' }));

billingRouter.get('/config', (_req, res) => {
    const pk = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!pk) return res.status(503).json({ error: 'Pagos no disponibles' });
    res.json({ publishableKey: pk, trialDays: TRIAL_DAYS, ivaPercent: IVA_PERCENT });
});

billingRouter.post('/setup', async (req, res) => {
    try {
        if (rateLimited(String(req.ip))) return res.status(429).json({ error: 'Demasiados intentos. Inténtalo más tarde.' });
        const plans = parsePlans(req.body?.plans);
        const email = String(req.body?.email || '').trim();
        const name = String(req.body?.name || '').trim().slice(0, 120);
        const company = String(req.body?.company || '').trim().slice(0, 160);
        const taxId = String(req.body?.taxId || '').trim().slice(0, 40);
        if (!plans) return res.status(400).json({ error: 'Plan no válido' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || !company) return res.status(400).json({ error: 'Faltan datos' });
        if (req.body?.accepted !== true) return res.status(400).json({ error: 'Debes aceptar las condiciones' });

        const s = stripe();
        const customer = await s.customers.create({
            email, name: company, description: `Contacto: ${name}`,
            metadata: { contact: name, nif: taxId, plans: plans.join(',') },
            // Solo para pruebas: STRIPE_TEST_CLOCK_ID mete al cliente en una simulación de Stripe para adelantar el reloj.
            ...(process.env.STRIPE_TEST_CLOCK_ID ? { test_clock: process.env.STRIPE_TEST_CLOCK_ID } : {}),
        });
        const si = await s.setupIntents.create({
            customer: customer.id,
            usage: 'off_session',
            allowed_payment_method_types: ['card'],
            metadata: { plans: plans.join(',') },
        });
        res.json({ clientSecret: si.client_secret, setupIntentId: si.id, summary: summary(plans) });
    } catch (err: any) {
        console.error('[billing] /setup', err?.message);
        res.status(500).json({ error: 'No hemos podido iniciar el pago' });
    }
});

billingRouter.post('/start', async (req, res) => {
    try {
        if (rateLimited(String(req.ip), 30)) return res.status(429).json({ error: 'Demasiados intentos. Inténtalo más tarde.' });
        const siId = String(req.body?.setupIntentId || '');
        if (!siId.startsWith('seti_')) return res.status(400).json({ error: 'Solicitud no válida' });
        const s = stripe();
        const si = await s.setupIntents.retrieve(siId);
        if (si.status !== 'succeeded' || !si.customer || !si.payment_method) return res.status(400).json({ error: 'La tarjeta no está confirmada' });
        // Los planes salen de la metadata del SetupIntent (puesta por /setup), nunca del cuerpo de esta petición.
        const plans = parsePlans(String(si.metadata?.plans || '').split(','));
        if (!plans) return res.status(400).json({ error: 'Plan no válido' });
        const customerId = typeof si.customer === 'string' ? si.customer : si.customer.id;
        const pmId = typeof si.payment_method === 'string' ? si.payment_method : si.payment_method.id;

        await s.customers.update(customerId, { invoice_settings: { default_payment_method: pmId } });
        const iva = await ivaRateId();
        const trialEnd = Math.floor(Date.now() / 1000) + TRIAL_DAYS * 86400;

        const items = [];
        const setupItems = [];
        for (const k of plans) {
            const product = await productIdFor(k);
            items.push({ price_data: { currency: 'eur', product, recurring: { interval: 'month' as const }, unit_amount: PLANS[k].monthly }, quantity: 1 });
            if (PLANS[k].setup > 0) {
                setupItems.push({ price_data: { currency: 'eur', product, unit_amount: PLANS[k].setup }, quantity: 1 });
            }
        }
        // Fase 1: 30 días gratis. Fase 2: primera cuota + alta (si la hay); después la suscripción sigue sola cada mes.
        const schedule = await s.subscriptionSchedules.create({
            customer: customerId,
            start_date: 'now',
            end_behavior: 'release',
            default_settings: { default_payment_method: pmId, collection_method: 'charge_automatically' },
            phases: [
                { items, trial: true, end_date: trialEnd, default_tax_rates: [iva] },
                { items, duration: { interval: 'month' as const, interval_count: 1 }, default_tax_rates: [iva], ...(setupItems.length ? { add_invoice_items: setupItems } : {}) },
            ],
            metadata: { plans: plans.join(',') },
        }, { idempotencyKey: `cg_start_${siId}` });

        res.json({ ok: true, scheduleId: schedule.id, firstChargeAt: trialEnd, summary: summary(plans) });
    } catch (err: any) {
        console.error('[billing] /start', err?.message);
        res.status(500).json({ error: 'No hemos podido activar la suscripción' });
    }
});
