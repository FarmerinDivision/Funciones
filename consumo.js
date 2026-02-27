const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());

const db = admin.firestore();

/**
 * 🔐 Proxy Consumo
 * - Lee el campo 'consumo' del tambo
 * - Devuelve un HTML mínimo con iframe
 * - No modifica la URL (importante por #!/ hash routing)
 */
app.get('/', async (req, res) => {
  console.log(`[${new Date().toISOString()}] 🟢 proxyConsumo request`);

  try {
    const { tamboId } = req.query;

    if (!tamboId) {
      console.warn("⚠️ Falta tamboId");
      return res.status(400).json({
        error: true,
        message: "Falta el parámetro tamboId"
      });
    }

    const docSnap = await db.collection('tambo').doc(tamboId).get();

    if (!docSnap.exists) {
      console.warn(`⚠️ Tambo no encontrado: ${tamboId}`);
      return res.status(404).json({
        error: true,
        message: "Tambo no encontrado"
      });
    }

    const url = docSnap.data().consumo;

    if (!url) {
      console.warn(`⚠️ El tambo ${tamboId} no tiene consumo configurado`);
      return res.status(404).json({
        error: true,
        message: "Este tambo no tiene consumo asignado"
      });
    }

    console.log(`✅ Renderizando iframe → ${url}`);

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Consumo</title>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            background: #ffffff;
          }
          iframe {
            width: 100%;
            height: 100vh;
            border: none;
          }
        </style>
      </head>
      <body>
        <iframe 
          src="${url}"
          allowfullscreen
          sandbox="allow-scripts allow-same-origin allow-forms"
        ></iframe>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);

  } catch (error) {
    console.error("❌ Error en proxyConsumo:", error);
    res.status(500).json({
      error: true,
      message: "Error interno del servidor"
    });
  }
});

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "proxyConsumo"
  });
});

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: true,
    message: "Recurso no encontrado",
    path: req.path
  });
});

module.exports = app;
