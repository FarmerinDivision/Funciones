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
      tambos.push({
        id: doc.id,
        nombre: doc.data().nombre,
        raciones: doc.data().raciones // Campo 'raciones'
      });
      console.log('Tambo encontrado:', doc.data().nombre);
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
        if (DiasAusente > 30) {
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
    const erpSinCaracter = erp.replace('⛔', '').trim();

    console.log(`🔍 Buscando animal con ERP: ${erpSinCaracter}, RP: ${rp}, DiasAusentes: ${diasAusentes} en Tambo ID: ${idTambo}`);

    const snapshot = await admin.firestore().collection('animal')
      .where('erp', '==', erpSinCaracter)
      .where('rp', '==', rp)
      .where('idtambo', '==', idTambo)
      .get();

    if (snapshot.empty) {
      console.log(`⚠ No se encontró el animal con ERP: ${erpSinCaracter}, RP: ${rp} en Tambo ID: ${idTambo}`);
      return;
    }

    snapshot.forEach(async doc => {
      console.log(`✅ Animal encontrado: ERP: ${erpSinCaracter}, RP: ${rp}, DiasAusentes: ${diasAusentes}, Tambo ID: ${idTambo}`);

      if (diasAusentes > 30) {
        console.log(`🔄 Actualizando estado del animal con ID: ${doc.id} a "seca"...`);
        await doc.ref.update({ estpro: 'seca' });
        console.log(`✅ ¡Estado actualizado a "seca" para el animal con ERP: ${erpSinCaracter}, RP: ${rp}!`);

        // Crear evento en la subcolección 'eventos'
        console.log(`📝 Agregando evento de secado para el animal con ERP: ${erpSinCaracter}, RP: ${rp}...`);
        await doc.ref.collection('eventos').add({
          fecha: admin.firestore.Timestamp.now(), // Fecha actual
          tipo: 'Secado',
          detalle: 'Secado por motivo de ausencia',
          usuario: 'FARMERIN',
        });

        console.log(`🎉 Evento de secado registrado para el animal con ERP: ${erpSinCaracter}, RP: ${rp}.`);
      } else {
        console.log(`ℹ El animal con ERP: ${erpSinCaracter}, RP: ${rp} no requiere actualización (DiasAusentes: ${diasAusentes}).`);
      }
    });
  } catch (error) {
    console.error('❌ Error al actualizar el estado del animal:', error);
  }
}

// Función principal
async function revisarAusentes() {
  try {
    let tambos = [];
    tambos = await getTambos(tambos);

    // Utilizamos Promise.all para manejar las promesas en paralelo
    const promises = tambos.map(async (tambo) => {
      if (tambo.raciones) {
        console.log(`Procesando el enlace de raciones para el tambo: ${tambo.nombre}`);
        try {
          const datos = await procesarEnlace(tambo.raciones); // Ahora esta función filtra los datos
          
          // Usamos un bucle for...of para manejar las promesas de forma secuencial
          const animalPromises = datos.map(async (registro) => {
            const { RFID, RP, DiasAusente } = registro;
            console.log(`Datos del registro - RFID: ${RFID}, RP: ${RP}, DiasAusente: ${DiasAusente}`);
            // Ahora pasamos también el idTambo para actualizar el estado del animal
            await actualizarEstadoAnimal(RFID, RP, DiasAusente, tambo.id);
          });

          // Esperamos que todas las promesas se resuelvan
          await Promise.all(animalPromises);

        } catch (error) {
          console.log(`🚨 El enlace de raciones del tambo ${tambo.nombre} no tiene información o está caído.`);
        }
      } else {
        console.log(`⚠ El campo de raciones del tambo ${tambo.nombre} está vacío, no se procesará.`);
      }
    });

    // Esperamos que todas las promesas de los tambos se resuelvan
    await Promise.all(promises);

    console.log('Procesamiento completo.');
  } catch (error) {
    console.error('Error al procesar raciones:', error);
  }
}

// Ejecutamos la función principal
revisarAusentes();
