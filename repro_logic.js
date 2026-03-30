const normalizeId = (id) => {
    if (!id) return "";
    return String(id).replace(/\D/g, "");
};

const isRelatedToChat = (msg, contact) => {
    if (!contact?.phone) return true;

    // Limpieza agresiva de IDs
    const cPhone = normalizeId(contact.phone);
    const sPhone = normalizeId(msg.sender);
    const rPhone = normalizeId(msg.recipient);

    console.log(`Debug: cPhone=${cPhone}, sPhone=${sPhone}, rPhone=${rPhone}, sender=${msg.sender}`);

    // 1. MATCH BÁSICO POR TÉLEFONO (SENDER O RECIPIENT)
    if (cPhone && sPhone && (sPhone.includes(cPhone) || cPhone.includes(sPhone))) return true;
    if (cPhone && rPhone && (rPhone.includes(cPhone) || cPhone.includes(rPhone))) return true;

    // 2. CASOS ESPECIALES (Bots)
    const senderStr = String(msg.sender || "").toLowerCase();

    // FIX: Lista explícita de nombres de Bot
    const isBot = senderStr.includes('bot') || senderStr.includes('agente') || senderStr.includes('laura') || !sPhone;

    if (isBot) {
        if (rPhone && cPhone && (rPhone.includes(cPhone) || cPhone.includes(rPhone))) return true;
        if (!msg.recipient || msg.recipient === "") return true;
    }

    return false;
};

// TEST CASES
const contact = { phone: "34666111222" };
const contactNoPrefix = { phone: "666111222" };

const msgBot = { sender: "Bot IA", recipient: "34666111222" };
const msgBotNoPrefix = { sender: "Bot IA", recipient: "666111222" };
const msgUser = { sender: "34666111222", recipient: "10034324" };
const msgAgent = { sender: "Agente", recipient: "34666111222" };

console.log("MsgBot (Contact Prefix):", isRelatedToChat(msgBot, contact));
console.log("MsgBot (Contact No Prefix):", isRelatedToChat(msgBot, contactNoPrefix));
console.log("MsgBotNoPrefix (Contact Prefix):", isRelatedToChat(msgBotNoPrefix, contact));
console.log("MsgUser:", isRelatedToChat(msgUser, contact));
console.log("MsgAgent:", isRelatedToChat(msgAgent, contact));
