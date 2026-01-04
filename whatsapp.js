const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys')
const qrcode = require('qrcode-terminal')

let sock
let latestQR = null
let waStatus = 'disconnected' // connected | disconnected | connecting


async function connectWA() {
    waStatus = 'connecting'
    
    const { state, saveCreds } = await useMultiFileAuthState('session')

    sock = makeWASocket({
        auth: state
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update

        if (qr) {
            latestQR = qr
            console.log('📱 QR updated')
            // console.log('📱 Scan the following QR:')
            // qrcode.generate(qr, { small: true })
        }

        if (connection === 'open') {
            waStatus = 'connected'
            latestQR = null
            console.log('✅ WhatsApp Connected')
        }

        if (connection === 'close') {
            waStatus = 'disconnected'
            const reason = lastDisconnect?.error?.output?.statusCode
            const shouldReconnect = reason !== DisconnectReason.loggedOut

            console.log('❌ Connection closed. Reconnect:', shouldReconnect)

            if (shouldReconnect) {
                connectWA()
            }
        }
    })
}

function getSock() {
    return sock
}

function getStatus() {
    return waStatus
}

function getQR() {
    return latestQR
}


module.exports = { connectWA, getSock, getStatus, getQR }
