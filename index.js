const functions = require('firebase-functions');
const admin = require('./firebaseAdmin'); // ✅ Usamos el admin inicializado correctamente
const firestore = admin.firestore;

const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB'
};

/////////// MONITOR PROXY WEB EN IFRAME /////////
const proxyApp = require("./server"); // app Express exportada

exports.proxyMonitor = functions.https.onRequest(proxyApp);

/////////// MONITOR CAÍDO = ENVIAR WHATSAPP /////////
const { verificarMonitor } = require("./NotificacionWpp");
exports.verificarMonitor = verificarMonitor;


///////// EXPORTANDO FUNCION PARA ANIMALES AUSENTES ////////////
const { revisarAusentes } = require('./revisarAusentes');

exports.revisarAusentes = functions.pubsub
  .schedule('30 3 * * *')
  .timeZone('America/Argentina/Buenos_Aires')
  .onRun(async () => {
    console.log('Inicio de la función programada: revisarAusentes');
    await revisarAusentes();
    console.log('Fin de la función programada: revisarAusentes');
  });

///////// EXPORTANDO FUNCION PARA ALTAS VAQUILLONAS ////////////
const { revisarEstadoCria } = require("./revisarEstadoCrias");

exports.revisarEstadoCria = functions
  .runWith({ memory: "2GB", timeoutSeconds: 540 })
  .pubsub.schedule("0 3 * * *")
  .onRun(async () => {
    await revisarEstadoCria();
  });

///////// EXPORTANDO FUNCION PARA PARAMETROS ALIMENTACION SEGUN DIAS DE LACTANCIA O LITROS PRODUCIDOS Y RODEOS ////////////
exports.controlRodeoTest = functions.runWith(runtimeOpts).pubsub.schedule('30 02 * * *').onRun(async (context) => {
  try {
    const tambos = await getTambos();
    const promesas = tambos.map(async t => {
      const control = await controlarTambos(t);
      return control;
    });
    await Promise.all(promesas);
    console.log('Proceso Finalizado con éxito');
  } catch (error) {
    console.error('Error al ejecutar el proceso');
    console.error(error);
  }
});

async function getTambos(tambos = []) {
  try {
    const snapshotTambos = await firestore.collection('tambo').get();
    snapshotTambos.forEach(doc => {
      if (!doc.data().test) {
        tambos.push({
          id: doc.id,
          nombre: doc.data().nombre
        });
        console.log('Tambo aceptado:' + doc.data().nombre);
      }
    });
  } catch (error) {
    console.error('Error al obtener los tambos');
    console.error(error);
  }
  return tambos;
}

async function controlarTambos(t) {
  const parametros = await getParametros(t.id);
  const snapshotAnimal = await firestore.collection('animal')
    .where('idtambo', '==', t.id)
    .where('estpro', '==', 'En Ordeñe')
    .where('fbaja', '==', '')
    .get();

  snapshotAnimal.forEach(doc => {
    const a = {
      id: doc.id,
      idtambo: doc.data().idtambo,
      rp: doc.data().rp,
      racion: doc.data().racion,
      fracion: doc.data().fracion,
      fservicio: doc.data().fservicio,
      fparto: doc.data().fparto,
      estrep: doc.data().estrep,
      categoria: doc.data().categoria,
      uc: doc.data().uc,
      fuc: doc.data().fuc,
      rodeo: doc.data().rodeo,
      sugerido: doc.data().sugerido
    };
    controlarAnimal(a, parametros);
  });

  return null;
}

async function getParametros(idtambo, parametros = []) {
  try {
    const snapshotParam = await firestore.collection('parametro')
      .where('idtambo', '==', idtambo)
      .orderBy('orden')
      .get();

    snapshotParam.forEach(doc => {
      parametros.push({
        id: doc.id,
        rodeo: doc.data().orden,
        condicion: doc.data().condicion,
        max: doc.data().max,
        min: doc.data().min,
        racion: doc.data().racion,
        um: doc.data().um,
        categoria: doc.data().categoria
      });
    });
  } catch (error) {
    console.error('Error al obtener los parámetros', error);
  }
  return parametros;
}

function controlarAnimal(a, parametros) {
  let diasPre;
  let diasLact;
  let litrosUC;

  const nowDate = new Date();
  const partoDate = new Date(a.fparto);

  if (a.estrep === "vacia") {
    diasPre = 0;
  } else {
    const servicioDate = new Date(a.fservicio);
    diasPre = Math.floor((nowDate - servicioDate) / (1000 * 60 * 60 * 24));
  }

  diasLact = Math.floor((nowDate - partoDate) / (1000 * 60 * 60 * 24));
  litrosUC = Math.round(parseFloat(a.uc)) || 5;

  parametros.every(p => {
    let encuentra = false;

    if (p.categoria === a.categoria) {
      if (p.um === "Dias Lactancia" && p.condicion === "entre" &&
        diasLact >= parseInt(p.min) && diasLact <= parseInt(p.max)) {
        cambioAlimentacion(p, 'lactancia', a);
        encuentra = true;
      }
    }

    return !encuentra;
  });
}

async function cambioAlimentacion(p, tipo, a) {
  const myTimestamp = admin.firestore.Timestamp.now();
  let racion = a.racion;
  let fracion = a.fracion;
  let rodeo = a.rodeo;
  let sugerido = a.sugerido;
  let cambia = false;

  if (parseInt(p.racion) > parseInt(a.racion) || tipo === 'lactancia') {
    racion = p.racion;
    fracion = myTimestamp;
    cambia = true;
  }

  if (p.rodeo !== a.rodeo) {
    rodeo = p.rodeo;
    cambia = true;
  }

  if (parseInt(p.racion) !== parseInt(a.sugerido)) {
    sugerido = p.racion;
    cambia = true;
  }

  if (cambia) {
    try {
      await firestore.collection('animal').doc(a.id).update({ racion, fracion, rodeo, sugerido });
      console.log('Alimentación actualizada:', a.rp, p.um);
    } catch (error) {
      console.error('Error al actualizar alimentación:', error);
    }
  }
}
