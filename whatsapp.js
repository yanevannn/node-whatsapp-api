const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')

let sock

async function connectWA() {
    const { state, saveCreds } = await useMultiFileAuthState('session')

    sock = makeWASocket({
        auth: state
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            console.log('📱 Scan the following QR:')
            qrcode.generate(qr, { small: true })
        }

        if (connection === 'open') {
            console.log('✅ WhatsApp Connected')
        }

        if (connection === 'close') {
            const reason = lastDisconnect?.error?.output?.statusCode
            const shouldReconnect = reason !== DisconnectReason.loggedOut

            console.log('❌ Connection closed. Reconnect:', shouldReconnect)

            if (shouldReconnect) {
                connectWA()
            } else {
                console.log('⚠️ Logout. Delete session & scan again')
            }
        }
    })
}

function getSock() {
    return sock
}

module.exports = { connectWA, getSock }
