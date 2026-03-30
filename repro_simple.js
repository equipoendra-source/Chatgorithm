
const normalizeId = (id) => {
    if (!id) return "";
    return String(id).replace(/\D/g, "");
};

const isRelatedToChat = (msg, contactPhone) => {
    if (!contactPhone) return true;

    const cPhone = normalizeId(contactPhone);
    const sPhone = normalizeId(msg.sender);
    const rPhone = normalizeId(msg.recipient);

    // 1. Mensaje ENTRANTE (El remitente es el cliente)
    if (sPhone && cPhone && (sPhone.endsWith(cPhone) || cPhone.endsWith(sPhone))) {
        return true;
    }

    // 2. Mensaje SALIENTE (El receptor es el cliente)
    if (rPhone && cPhone && (rPhone.endsWith(cPhone) || cPhone.endsWith(rPhone))) {
        return true;
    }

    // 3. Casos especiales
    const senderStr = String(msg.sender || "").toLowerCase();

    if (senderStr.includes('bot') || senderStr.includes('agente') || !sPhone) {
        if (!msg.recipient) {
            return true;
        }
    }

    return false;
};

const contactPhone = "34666777888";

const cases = [
    { name: "Incoming WhatsApp", msg: { sender: "34666777888", recipient: "123456789" }, phone: "34666777888" },
    { name: "Bot Reply", msg: { sender: "Bot IA", recipient: "34666777888" }, phone: "34666777888" },
    { name: "Incoming (+ contact)", msg: { sender: "34666777888", recipient: "123456789" }, phone: "+34 666 777 888" },
    { name: "No Country Code Incoming", msg: { sender: "666777888", recipient: "123456789" }, phone: "34666777888" },
    { name: "Bot Reply to +", msg: { sender: "Bot IA", recipient: "+34 666 777 888" }, phone: "34666777888" },
];

cases.forEach((c, i) => {
    const result = isRelatedToChat(c.msg, c.phone);
    console.log(`Case ${i + 1} (${c.name}): ${result ? "PASS" : "FAIL"}`);
});
