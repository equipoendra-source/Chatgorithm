// ==========================================================================
//  PEDIDOS DE PIEZAS DESDE PDF — piezas puras (sin Airtable, Express ni Meta)
// ==========================================================================
// El trabajador de Recambios pide varias piezas a la vez mandando al proveedor,
// por el chat, el PDF que genera su catálogo (Microcat EPC u otro): una tabla
// Vehículo / Descripción / Ctd. / Número. Gemini lee ese PDF y devuelve las
// líneas; index.ts las guarda en PartOrders como un "pedido" agrupado.
//
// Aquí vive todo lo que no depende del servidor (instrucciones a la IA, forma
// de la respuesta, validación contra el texto real del PDF, textos de la nota)
// para poder probarlo aislado con el PDF de ejemplo.

import crypto from 'crypto';
import { SchemaType, type ObjectSchema } from '@google/generative-ai';

export interface PdfOrderLine {
    pieza: string;
    cantidad: number | null;
    referencia: string;
    matricula: string;
}

export interface PdfOrderRejected {
    pieza: string;
    referencia: string;
    motivo: string;
}

export interface PdfOrderValidation {
    lines: PdfOrderLine[];          // líneas válidas, en el orden del PDF
    rejected: PdfOrderRejected[];   // descartadas (la nota las enseña para meterlas a mano)
    // false = el PDF no tiene capa de texto (escaneado / foto): no se pudo
    // comprobar nada contra el texto y la nota pide revisar las referencias.
    textChecked: boolean;
    truncated: boolean;             // había más de MAX_PDF_ORDER_LINES líneas
}

// Tope de líneas por PDF. Un multipedido real ronda la decena; cientos solo
// saldrían de un documento que no es un pedido (un catálogo, una tarifa…).
export const MAX_PDF_ORDER_LINES = 60;

export const PDF_ORDER_PROMPT = `Eres un extractor de datos para un taller mecánico. El PDF adjunto lo ha enviado un trabajador de Recambios a un PROVEEDOR por WhatsApp.

1. Decide si el documento es un PEDIDO DE PIEZAS a proveedor: una lista de recambios que se piden (por ejemplo "Lista de pedidos", "Pedido", "Lista de preparación del pedido", o el multipedido de un catálogo como Microcat EPC). NO es un pedido: una factura, un albarán, un presupuesto para un cliente, una orden de reparación, un manual o cualquier otro documento.
2. Si es un pedido, extrae CADA línea de la tabla de piezas, en el mismo orden que en el PDF:
   - descripcion: el texto de la columna Descripción / Denominación / Pieza, copiado tal cual.
   - cantidad: la columna Ctd. / Cant. / Uds. / Cantidad, como número ("1,0" es 1). Si la línea no la trae, null.
   - referencia: la columna Número / Referencia / Ref. / Nº de pieza / Código, copiada EXACTAMENTE, carácter a carácter. Si la línea no la trae, "".
   - matricula: si la línea o su columna Vehículo incluye la matrícula del coche (por ejemplo "Matrícula 1369KTB"), la matrícula sin espacios ni guiones. Si no, "".
3. Ignora cabeceras (datos del concesionario, del cliente y del pedido), precios, importes, IVA, totales, VIN y fechas.
4. No inventes nada: si un dato no está en el documento, déjalo vacío. Si no es un pedido, devuelve esPedido=false y lineas vacío.`;

// Respuesta JSON obligatoria (responseSchema): Gemini no puede contestar en
// prosa ni cambiar el nombre de los campos.
export const PDF_ORDER_SCHEMA: ObjectSchema = {
    type: SchemaType.OBJECT,
    properties: {
        esPedido: { type: SchemaType.BOOLEAN, description: 'true solo si el documento es una lista de piezas pedidas a un proveedor.' },
        lineas: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    descripcion: { type: SchemaType.STRING },
                    cantidad: { type: SchemaType.NUMBER, nullable: true },
                    referencia: { type: SchemaType.STRING },
                    matricula: { type: SchemaType.STRING }
                },
                required: ['descripcion', 'cantidad', 'referencia', 'matricula']
            }
        }
    },
    required: ['esPedido', 'lineas']
};

// Solo letras y dígitos, en mayúsculas. Sirve para comparar referencias y
// matrículas con el texto del PDF sin que molesten espacios, guiones, puntos
// o saltos de línea ("1K0 615\n301 AA" y "1K0615301AA" son lo mismo).
const compact = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Cantidad pedida → número > 0 con 2 decimales como mucho, o null.
//   "1,0" → 1 · "0,5" → 0.5 · 4 → 4 · "4 uds" → 4 · "" / 0 / "abc" → null
// Acepta texto porque la plantilla pedido_proveedor también puede traerla.
export function normalizeCantidad(raw: unknown): number | null {
    if (raw === undefined || raw === null) return null;
    let n: number;
    if (typeof raw === 'number') {
        n = raw;
    } else {
        const text = String(raw).trim();
        // "-2" no es "2": un signo menos invalida la cantidad entera.
        if (text.includes('-')) return null;
        if (/^\d*[.,]?\d+$/.test(text)) {
            // Número "limpio" ("2", "2,5", ".5", "1.5"): se lee tal cual.
            n = Number(text.replace(',', '.'));
        } else {
            // Texto con más cosas ("4 uds", "x4", "1.234,5"): el primer número.
            const m = text.match(/\d+(?:[.,]\d+)*/);
            if (!m) return null;
            let s = m[0];
            // Coma decimal española: "1.234,5" → 1234.5. Sin coma, varios
            // puntos son de miles ("1.234.567"); uno solo es decimal ("1.5").
            if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
            else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
            n = Number(s);
        }
    }
    if (!Number.isFinite(n) || n <= 0 || n > 9999) return null;
    // Algo que al redondear a 2 decimales se queda en 0 ("0,004") no es una cantidad.
    const rounded = Math.round(n * 100) / 100;
    return rounded > 0 ? rounded : null;
}

// "1369 KTB" / "1369-ktb" → "1369KTB" (mismo formato que ya tiene el panel).
export function normalizeMatricula(raw: unknown): string {
    return compact(String(raw ?? '')).slice(0, 12);
}

// Valida lo que devolvió Gemini contra el texto real del PDF (pdf-parse).
// La referencia es lo que identifica la pieza: si la IA devolviera una que no
// está en el documento, se pediría la pieza equivocada. Por eso una línea cuya
// referencia no aparece en el texto se DESCARTA (y la nota lo dice). La
// matrícula que no aparece solo se vacía: la línea sigue valiendo.
export function validatePdfOrderLines(raw: unknown, pdfText: string): PdfOrderValidation {
    const rows: any[] = Array.isArray((raw as any)?.lineas) ? (raw as any).lineas : [];
    const textoCompacto = compact(pdfText);
    // Un PDF escaneado no tiene capa de texto (pdf-parse devuelve casi nada):
    // entonces no hay contra qué comprobar y se acepta lo que lea la IA.
    const textChecked = textoCompacto.length >= 20;
    const lines: PdfOrderLine[] = [];
    const rejected: PdfOrderRejected[] = [];

    for (const r of rows.slice(0, MAX_PDF_ORDER_LINES)) {
        const pieza = String(r?.descripcion ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
        const referencia = String(r?.referencia ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (!pieza && !referencia) continue;   // fila vacía (separadores, totales…)

        if (referencia && textChecked) {
            const refC = compact(referencia);
            if (refC.length < 3) {
                rejected.push({ pieza, referencia, motivo: 'referencia demasiado corta' });
                continue;
            }
            if (!textoCompacto.includes(refC)) {
                rejected.push({ pieza, referencia, motivo: 'la referencia no aparece en el PDF' });
                continue;
            }
        }

        let matricula = normalizeMatricula(r?.matricula);
        if (matricula && textChecked && !textoCompacto.includes(matricula)) matricula = '';

        lines.push({ pieza, cantidad: normalizeCantidad(r?.cantidad), referencia, matricula });
    }

    return { lines, rejected, textChecked, truncated: rows.length > MAX_PDF_ORDER_LINES };
}

// Identificador común de las piezas de un mismo PDF. Legible a propósito (sale
// en el Excel): fecha y hora de Madrid + sufijo aleatorio. PDF-260928-0934-A1B2
export function newPedidoGrupoId(now: Date = new Date()): string {
    // 'sv-SE' formatea como "2026-09-28 09:34:36" → nos quedamos con los dígitos.
    const d = now.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).replace(/\D/g, '');
    return `PDF-${d.slice(2, 8)}-${d.slice(8, 12)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

export function fmtCantidad(n: number | null): string {
    return n === null ? '' : n.toLocaleString('es-ES', { maximumFractionDigits: 2 });
}

// Nota interna que se deja en el chat del proveedor tras registrar el pedido.
// Lista lo que se ha apuntado para poder compararlo de un vistazo con el PDF.
export function buildPdfOrderNote(opts: {
    fileName: string;
    validation: PdfOrderValidation;
    viaTemplate: boolean;
}): string {
    const { lines, rejected, textChecked, truncated } = opts.validation;
    const out: string[] = [];
    out.push(`📦 Registrado en Pedidos de Piezas: ${lines.length} ${lines.length === 1 ? 'pieza' : 'piezas'} del PDF «${opts.fileName}»`);
    for (const l of lines) {
        const qty = l.cantidad !== null ? `${fmtCantidad(l.cantidad)} × ` : '';
        const ref = l.referencia ? ` · Ref. ${l.referencia}` : '';
        const mat = l.matricula ? ` · ${l.matricula}` : '';
        out.push(`• ${qty}${l.pieza || '(sin descripción)'}${ref}${mat}`);
    }
    if (opts.viaTemplate) {
        out.push('', 'La ventana de 24 h con este proveedor estaba cerrada: el PDF ha salido dentro de la plantilla pedido_proveedor_pdf.');
    }
    if (rejected.length > 0) {
        out.push('', `⚠️ ${rejected.length === 1 ? 'Esta línea no se ha registrado' : 'Estas líneas no se han registrado'} (añádelas a mano si hacen falta):`);
        for (const r of rejected) out.push(`• ${r.pieza || '(sin descripción)'}${r.referencia ? ` · Ref. ${r.referencia}` : ''} — ${r.motivo}`);
    }
    if (truncated) out.push('', `⚠️ El PDF tiene más de ${MAX_PDF_ORDER_LINES} líneas: solo se han registrado las primeras ${MAX_PDF_ORDER_LINES}.`);
    if (!textChecked) out.push('', 'ℹ️ El PDF no tiene texto (¿escaneado?): revisa que las referencias estén bien.');
    return out.join('\n');
}
