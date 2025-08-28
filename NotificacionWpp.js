const functions = require('firebase-functions');
const fetch = require('node-fetch');
const twilio = require('twilio');

// 🔐 Variables de entorno seguras configuradas con `firebase functions:config:set`
const accountSid = functions.config().twilio.sid;
const authToken = functions.config().twilio.token;
const fromNumber = functions.config().twilio.from;
const toNumbers = functions.config().twilio.to.split(','); // Puede ser un solo número o varios separados por coma

const client = new twilio(accountSid, authToken);

// 🌐 Dirección del servidor a verificar
const MONITOR_URL = 'https://us-central1-farmerin-navarro.cloudfunctions.net/proxyMonitor/verMonitor?tamboId=XXX';

async function chequearMonitor(timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(MONITOR_URL, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Respuesta inválida: ${res.status}`);
    return true;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

async function enviarAlertaWhatsapp(mensaje) {
  for (const to of toNumbers) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await client.messages.create({
        body: mensaje,
        from: fromNumber,
        to: to.trim()
      });

      console.log(`[${new Date().toLocaleString()}] 📲 WhatsApp enviado a ${to}: ${result.sid}`);
    } catch (err) {
      console.error(`[${new Date().toLocaleString()}] ❌ Error enviando a ${to}: ${err.message}`);
    }
  }
}

exports.verificarMonitor = functions.pubsub
  .schedule('every 2 minutes')
  .timeZone('America/Argentina/Buenos_Aires')
  .onRun(async (context) => {
    try {
      await chequearMonitor();
      console.log(`[${new Date().toLocaleString()}] ✅ Monitor funcionando correctamente`);
    } catch (err) {
      console.error(`[${new Date().toLocaleString()}] ❌ ERROR en el monitor: ${err.message}`);

      const mensaje = '🚨 *Alerta Monitor*\nEl servidor del monitor no responde. Verificá Render.';
      await enviarAlertaWhatsapp(mensaje);
    }
  });