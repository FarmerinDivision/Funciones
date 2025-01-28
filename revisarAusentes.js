const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios'); // Importamos axios
const cheerio = require('cheerio');  // Importamos Cheerio

// Inicializar Firebase solo si no está inicializado
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require("./farmerin-navarro-firebase-adminsdk-qtwjy-866732594b.json")),
    projectId: 'farmerin-navarro',
  });
}

const runtimeOpts = {
  timeoutSeconds: 1200,
  memory: '1GB',
};

// Configuración para el emulador (si estás usando uno)
if (process.env.FUNCTIONS_EMULATOR) {
  admin.firestore().settings({
    host: "localhost:8080", // Puerto configurado para Firestore
    ssl: false,
  });
}

// Función auxiliar para obtener los tambos
async function getTambos(tambos = []) {
  try {
    const snapshotTambos = await admin.firestore()
      .collection('tambo')
      .get();

    snapshotTambos.forEach(doc => {
      if (!doc.data().test) {
        tambos.push({
          id: doc.id,
          nombre: doc.data().nombre,
          raciones: doc.data().raciones // Campo 'raciones'
        });
        console.log('Tambo aceptado:' + doc.data().nombre);
      }
    });
  } catch (error) {
    console.error('Error al obtener los tambos:', error);
  }
  return tambos;
}

// Función para procesar el enlace
async function procesarEnlace(racionesLink) {
  try {
    const response = await axios.get(racionesLink);
  
    // Cargamos el HTML con Cheerio
    const $ = cheerio.load(response.data);

    // Array para almacenar los datos extraídos
    const datosFiltrados = [];

    // Iteramos sobre las filas de la tabla
    $('tr').each((index, element) => {
      const celdas = $(element).find('td');

      // Extraemos las celdas que necesitamos (RFID, RP, DiasAusente)
      if (celdas.length >= 5) {
        const RFID = $(celdas[0]).text().trim();
        const RP = $(celdas[1]).text().trim();
        const DiasAusente = parseInt($(celdas[4]).text().trim(), 10);

        // Filtramos solo los registros donde DiasAusente sea mayor a 10
        if (DiasAusente > 10) {
          datosFiltrados.push({
            RFID,
            RP,
            DiasAusente
          });
        }
      }
    });

    console.log('Datos filtrados:', datosFiltrados);
    return datosFiltrados;

  } catch (error) {
    console.error('Error al procesar el enlace:', error);
    throw error;
  }
}

// Función para actualizar el estado del animal
async function actualizarEstadoAnimal(erp, rp, diasAusentes, idTambo) {
  try {
    // Eliminar el caracter especial ⛔ del ERP
    const erpSinCaracter = erp.replace('⛔', '').trim(); // Eliminamos ⛔

    console.log(`Verificando animal con ERP: ${erpSinCaracter}, RP: ${rp}, DiasAusentes: ${diasAusentes} en Tambo ID: ${idTambo}`);

    // Buscamos el animal en la colección 'animal' usando ERP, RP y idTambo
    const snapshot = await admin.firestore().collection('animal')
      .where('erp', '==', erpSinCaracter)  // Usamos el ERP sin el carácter especial
      .where('rp', '==', rp)
      .where('idtambo', '==', idTambo)  // Agregamos la condición por idTambo
      .get();

    // Verificamos si encontramos documentos
    if (snapshot.empty) {
      console.log(`No se encontró el animal con ERP: ${erpSinCaracter}, RP: ${rp} en Tambo ID: ${idTambo}`);
      return;
    }

    snapshot.forEach(doc => {
      console.log(`Encontrado el animal con ERP: ${erpSinCaracter}, RP: ${rp}. Actualizando estado...`);
      
      // Actualizamos el campo 'estpro' solo si DiasAusentes > 10
      if (diasAusentes > 10) {
        doc.ref.update({ estpro: 'seca' })
          .then(() => {
            console.log(`¡Animal con ERP: ${erpSinCaracter}, RP: ${rp} actualizado a "seca"!`);
          })
          .catch((error) => {
            console.error('Error al actualizar el estado:', error);
          });
      } else {
        console.log(`Animal con ERP: ${erpSinCaracter}, RP: ${rp} no requiere actualización (DiasAusentes: ${diasAusentes})`);
      }
    });
  } catch (error) {
    console.error('Error al actualizar el estado del animal:', error);
  }
}

// Función principal
async function procesarRaciones() {
  try {
    let tambos = [];
    tambos = await getTambos(tambos);

    for (let tambo of tambos) {
      if (tambo.raciones) {
        console.log(`Procesando el enlace de raciones para el tambo: ${tambo.nombre}`);
        const datos = await procesarEnlace(tambo.raciones); // Ahora esta función filtra los datos

        // Procesamos los datos filtrados
        datos.forEach(async (registro) => {
          const { RFID, RP, DiasAusente } = registro;
          console.log(`Datos del registro - RFID: ${RFID}, RP: ${RP}, DiasAusente: ${DiasAusente}`);
          // Ahora pasamos también el idTambo para actualizar el estado del animal
          await actualizarEstadoAnimal(RFID, RP, DiasAusente, tambo.id);
        });
      }
    }

    console.log('Procesamiento completo.');
  } catch (error) {
    console.error('Error al procesar raciones:', error);
  }
}

// Exportar la función principal
module.exports = {
  procesarRaciones,
};

