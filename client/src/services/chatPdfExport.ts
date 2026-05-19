import jsPDF from 'jspdf';
import { API_URL } from '../config/api';

interface ExportMessage {
    text: string;
    sender: string;
    timestamp: string;
    type?: string;
    mediaId?: string;
}

interface ExportArgs {
    messages: ExportMessage[];
    contact: { name?: string; phone: string };
    companyName?: string;
}

interface LoadedImage {
    dataUrl: string;
    width: number;
    height: number;
    format: 'JPEG' | 'PNG';
}

async function fetchImageAsDataUrl(url: string): Promise<LoadedImage | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve({ width: 0, height: 0 });
            img.src = dataUrl;
        });
        const format: 'JPEG' | 'PNG' = blob.type.includes('png') ? 'PNG' : 'JPEG';
        return { dataUrl, ...dimensions, format };
    } catch {
        return null;
    }
}

function senderLabel(sender: string, clientPhone: string, clientName?: string): string {
    if (sender === clientPhone) return clientName || 'Cliente';
    if (sender === 'Bot IA') return 'Laura (Bot)';
    if (sender === 'Agente') return 'Agente';
    return sender;
}

function formatDateTime(ts: string): { date: string; time: string } {
    try {
        const d = new Date(ts);
        if (isNaN(d.getTime())) return { date: '', time: '' };
        return {
            date: d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }),
            time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        };
    } catch {
        return { date: '', time: '' };
    }
}

export async function exportChatToPdf({ messages, contact, companyName }: ExportArgs): Promise<void> {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const marginX = 15;
    const marginY = 15;
    const contentWidth = pageWidth - 2 * marginX;
    let cursorY = marginY;

    const ensureSpace = (needed: number) => {
        if (cursorY + needed > pageHeight - marginY) {
            pdf.addPage();
            cursorY = marginY;
        }
    };

    // Cabecera
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.setTextColor(30);
    pdf.text('Conversación', marginX, cursorY);
    cursorY += 7;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(60);
    if (contact.name) {
        pdf.text(`Cliente: ${contact.name}`, marginX, cursorY);
        cursorY += 5;
    }
    pdf.text(`Teléfono: ${contact.phone}`, marginX, cursorY);
    cursorY += 5;
    if (companyName) {
        pdf.text(`Empresa: ${companyName}`, marginX, cursorY);
        cursorY += 5;
    }
    pdf.text(`Exportado: ${new Date().toLocaleString('es-ES')}`, marginX, cursorY);
    cursorY += 5;
    pdf.text(`Total mensajes: ${messages.length}`, marginX, cursorY);
    cursorY += 6;

    pdf.setDrawColor(210);
    pdf.line(marginX, cursorY, pageWidth - marginX, cursorY);
    cursorY += 5;

    let lastDate = '';
    for (const m of messages) {
        const { date, time } = formatDateTime(m.timestamp);

        if (date && date !== lastDate) {
            ensureSpace(10);
            cursorY += 2;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(9);
            pdf.setTextColor(120);
            const label = `— ${date} —`;
            const w = pdf.getTextWidth(label);
            pdf.text(label, (pageWidth - w) / 2, cursorY);
            cursorY += 5;
            lastDate = date;
        }

        const sender = senderLabel(m.sender, contact.phone, contact.name);
        const isFromClient = m.sender === contact.phone;
        const isNote = m.type === 'note';
        const isTemplate = m.type === 'template';
        const isBot = m.sender === 'Bot IA';

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        if (isNote) pdf.setTextColor(180, 130, 0);
        else if (isBot) pdf.setTextColor(140, 70, 180);
        else if (isFromClient) pdf.setTextColor(60, 60, 60);
        else pdf.setTextColor(60, 90, 200);

        const tags: string[] = [];
        if (isNote) tags.push('NOTA INTERNA');
        if (isTemplate) tags.push('PLANTILLA');
        const tagSuffix = tags.length ? ` · ${tags.join(' · ')}` : '';
        const header = `${sender}${time ? ` · ${time}` : ''}${tagSuffix}`;

        ensureSpace(6);
        pdf.text(header, marginX, cursorY);
        cursorY += 4;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(25);

        if (m.type === 'image' && m.mediaId) {
            const url = `${API_URL}/api/media/${m.mediaId}`;
            const img = await fetchImageAsDataUrl(url);
            if (img && img.width > 0) {
                const maxW = Math.min(80, contentWidth);
                const ratio = img.height / img.width;
                const imgW = maxW;
                const imgH = imgW * ratio;
                ensureSpace(imgH + 2);
                try {
                    pdf.addImage(img.dataUrl, img.format, marginX, cursorY, imgW, imgH);
                    cursorY += imgH + 2;
                } catch {
                    const fallback = `[Imagen] ${url}`;
                    const lines = pdf.splitTextToSize(fallback, contentWidth);
                    ensureSpace(lines.length * 5);
                    pdf.text(lines, marginX, cursorY);
                    cursorY += lines.length * 5;
                }
                if (m.text && String(m.text).trim()) {
                    const lines = pdf.splitTextToSize(String(m.text), contentWidth);
                    ensureSpace(lines.length * 5);
                    pdf.text(lines, marginX, cursorY);
                    cursorY += lines.length * 5;
                }
            } else {
                const text = `[Imagen no disponible] ${url}`;
                const lines = pdf.splitTextToSize(text, contentWidth);
                ensureSpace(lines.length * 5);
                pdf.text(lines, marginX, cursorY);
                cursorY += lines.length * 5;
            }
        } else if ((m.type === 'audio' || m.type === 'video' || m.type === 'document') && m.mediaId) {
            const labelMap: Record<string, string> = {
                audio: '[AUDIO]',
                video: '[VÍDEO]',
                document: '[DOCUMENTO]'
            };
            const url = `${API_URL}/api/media/${m.mediaId}`;
            const label = labelMap[m.type];
            const caption = m.type === 'document' && m.text ? ` ${m.text}` : '';
            const text = `${label}${caption}\n${url}`;
            const lines = pdf.splitTextToSize(text, contentWidth);
            ensureSpace(lines.length * 5);
            pdf.text(lines, marginX, cursorY);
            cursorY += lines.length * 5;
        } else {
            const text = String(m.text || '').trim();
            if (text) {
                const lines = pdf.splitTextToSize(text, contentWidth);
                ensureSpace(lines.length * 5);
                pdf.text(lines, marginX, cursorY);
                cursorY += lines.length * 5;
            }
        }

        cursorY += 3;
    }

    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.text(`${i} / ${totalPages}`, pageWidth - marginX, pageHeight - 8, { align: 'right' });
    }

    const safeName = (contact.name || contact.phone || 'cliente').replace(/[^\w\d-]+/g, '_').slice(0, 40);
    const dateStr = new Date().toISOString().slice(0, 10);
    pdf.save(`conversacion_${safeName}_${dateStr}.pdf`);
}
