const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const admin = require('firebase-admin');

// ---------- Firebase Admin ----------
const serviceAccount = require('./farmerin-navarro-firebase-adminsdk-qtwjy-e5fd3fa132.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

// ---------- Ruta que devuelve el HTML con el iframe embebido ----------
app.get('/verMonitor', async (req, res) => {
  try {
    const tamboId = req.query.tamboId;
    if (!tamboId) return res.status(400).send('Falta el parámetro tamboId');

    const docSnap = await db.collection('tambo').doc(tamboId).get();
    if (!docSnap.exists) return res.status(404).send('Tambo no encontrado');

    const monitorUrl = docSnap.data().monitor;
    if (!monitorUrl) return res.status(404).send('Este tambo no tiene monitor asignado');

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Monitor en vivo</title>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            background: #000;
          }
          iframe {
            border: none;
            width: 100%;
            height: 100%;
          }
        </style>
      </head>
      <body>
        <iframe src="${monitorUrl}" allowfullscreen></iframe>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('❌ Error en /verMonitor:', err);
    res.status(500).send('Error interno al generar el monitor');
  }
});

module.exports = app;
