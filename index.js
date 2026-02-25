require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");
const qrcode = require("qrcode-terminal");
const pino = require('pino');

const app = express();

// --- KONFIGURASI WHATSAPP (BAILEYS) ---
let sock;
let latestQR = null;
let waStatus = "disconnected"; // connected | disconnected | connecting

async function connectWA() {
    waStatus = "connecting";
    const { state, saveCreds } = await useMultiFileAuthState("session");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false, // Kita handle manual di bawah
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        logger: pino({ level: 'silent' }), // Mengurangi spam log di console
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            latestQR = qr;
            console.log('📱 QR Updated. Scan the following QR:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === "open") {
            waStatus = "connected";
            latestQR = null;
            console.log("✅ WhatsApp Connected");
        }

        if (connection === "close") {
            waStatus = "disconnected";
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("❌ Connection closed. Reconnecting:", shouldReconnect);
            if (shouldReconnect) connectWA();
        }
    });

    sock.ev.on("messages.upsert", async (m) => {
        const msg = m.messages[0];
        if (!msg.key.fromMe && m.type === "notify") {
            const jid = msg.key.remoteJid;
            const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
            if (jid.endsWith("@g.us")) {
                console.log(`[GROUP MSG] ID: ${jid} | Pesan: ${text}`);
            }
        }
    });
}

// --- MIDDLEWARE API ---
app.use(cors());
app.use(express.json());

// 🔐 API KEY Check
app.use((req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// 🚦 RATE LIMIT
const limitValue = Number(process.env.API_LIMIT) || 3;
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 jam
    max: limitValue,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again one hour later.' }
});
app.use(limiter);

// --- ROUTES ---

// 1. Send Direct Message
app.post('/wa/send-message', async (req, res) => {
    const { number, message } = req.body;
    if (!number || !message) {
        return res.status(400).json({ error: 'Number and message are required' });
    }

    try {
        if (waStatus !== "connected") {
            return res.status(500).json({ error: 'WhatsApp connection not established' });
        }
        const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: message });
        res.status(200).json({ status: 'Message sent' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// 2. Send Group Message
app.post('/wa/send-message-group', async (req, res) => {
    const { groupId, message } = req.body;
    if (!groupId || !message) {
        return res.status(400).json({ error: 'groupId and message are required' });
    }

    try {
        if (waStatus !== "connected") throw new Error("WhatsApp not connected");
        await sock.sendMessage(groupId, { text: message });
        res.status(200).json({ status: 'Group message sent' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Get Connection Status
app.get('/wa/status', (req, res) => {
    res.json({ status: waStatus });
});

// 4. Get QR Code
app.get('/wa/qr', (req, res) => {
    if (waStatus === 'connected') {
        return res.json({ status: 'connected', message: 'WhatsApp already connected' });
    }
    if (!latestQR) {
        return res.status(404).json({ error: 'QR not available yet' });
    }
    res.json({ status: 'disconnected', qr: latestQR });
});

// --- START SERVER ---
const PORT = process.env.API_PORT || 4001;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    connectWA(); // Jalankan koneksi WA setelah server up
});