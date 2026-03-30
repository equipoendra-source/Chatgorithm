const twilio = require('twilio');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, 'server', '.env') });

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const apiKey = process.env.TWILIO_API_KEY;
const apiSecret = process.env.TWILIO_API_SECRET;

console.log("--- FINAL DEBUG ---");
console.log("SID:", accountSid);
console.log("KEY:", apiKey);
console.log("SECRET:", apiSecret ? (apiSecret.substring(0, 5) + "...") : "MISSING");
console.log("KEY LENGTH:", apiKey ? apiKey.length : 0);

if (!apiKey || !apiSecret) {
    console.log("❌ CRITICAL: VARS MISSING");
    process.exit(1);
}

const client = twilio(apiKey, apiSecret, { accountSid: accountSid });
client.api.accounts(accountSid).fetch()
    .then(a => console.log("✅ AUTH SUCCESS:", a.friendlyName))
    .catch(e => console.log("❌ AUTH FAILED:", e.message));
