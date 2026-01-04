require('dotenv').config()
const express = require('express');
const rateLimit = require('express-rate-limit')
const { connectWA, getSock, getStatus, getQR} = require('./whatsapp');

const app = express();
const cors = require('cors');
app.use(cors());
app.use(express.json());
// app.use(require('cors')());


// 🔐 API KEY
app.use((req, res, next) => {
    const apiKey = req.headers['x-api-key']

    if (!apiKey || apiKey !== process.env.API_KEY) {
        return res.status(401).json({
            error: 'Unauthorized'
        })
    }

    next()
})

// 🚦 RATE LIMIT
const limmit = Number(process.env.API_LIMIT) || 3;
const limiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 jam
    max: limmit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many requests, please try again one hour later. '
    }
})
app.use(limiter);


app.post('/wa/send-message', async (req, res) => {
    const { number, message } = req.body;
    console.log('Received request to send message:', number, message);

    if (!number || !message) {
        return res.status(400).json({ error: 'Number and message are required' });
    }

    try {
        const sock = getSock();
        if (!sock) {
            return res.status(500).json({ error: 'WhatsApp connection not established' });
        }

        const jid = number + '@s.whatsapp.net'
        await sock.sendMessage(jid, { text: message });
        res.status(200).json({ status: 'Message sent' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send message' });
    }
});

app.get('/wa/status', (req, res) => {
    res.json({
        status: getStatus()
    })
})


app.get('/wa/qr', (req, res) => {
    const status = getStatus()

    if (status === 'connected') {
        return res.json({
            status: 'connected',
            message: 'WhatsApp already connected'
        })
    }

    const qr = getQR()

    if (!qr) {
        return res.status(404).json({
            error: 'QR not available yet'
        })
    }

    res.json({
        status: 'disconnected',
        qr
    })
})


connectWA();

const PORT = process.env.API_PORT || 4001;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});