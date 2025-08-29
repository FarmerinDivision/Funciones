const functions = require('firebase-functions');
const admin = require('./firebaseAdmin'); // ✅ Usamos el admin inicializado correctamente
const firestore = admin.firestore();

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
exports.controlRodeoTest = functions
  .runWith(runtimeOpts)
  .pubsub.schedule("30 2 * * *")
  .timeZone('America/Argentina/Buenos_Aires')
  .onRun(async (context) => {
    try {
      console.log("=== INICIO CONTROL RODEO TEST (todas las noches) ===");

      const tambos = await getTambos();

      await Promise.all(
        tambos.map(async (t) => {
          console.log("✅ Procesando tambo:", t.id, "-", t.nombre);
          return controlarTambos(t);
        })
      );

      console.log("=== FIN CONTROL RODEO TEST ===");
    } catch (error) {
      console.error("❌ Error al ejecutar controlRodeoTest:", error);
    }
  });

///////// ENDPOINT DE PRUEBA: EJECUTAR SOLO UN TAMBO POR ID ////////////
// const FIXED_TAMBO_ID = 'jGWqeJjPAW3yJtAZpKJr';

// exports.controlRodeoTestOne = functions
//   .runWith(runtimeOpts)
//   .https.onRequest(async (req, res) => {
//     // Admite idtambo por query (?idtambo=XXX) o body JSON { idtambo: "XXX" }
//     const idtambo = (req.method === 'POST' ? (req.body && (req.body.idtambo || req.body.tamboId)) : null)
//       || req.query.idtambo
//       || req.query.tamboId
//       || FIXED_TAMBO_ID; // 👈 por defecto usa el tambo fijo

//     // Siempre habrá un idtambo porque tenemos un valor por defecto

//     try {
//       console.log('=== INICIO CONTROL RODEO TEST ONE ===');
//       console.log('Tambo objetivo:', idtambo);
//       await controlarTambos({ id: idtambo });
//       console.log('=== FIN CONTROL RODEO TEST ONE ===');
//       res.status(200).send(`OK - control ejecutado para tambo ${idtambo}`);
//     } catch (error) {
//       console.error('❌ Error en controlRodeoTestOne:', error);
//       res.status(500).send('Error interno al ejecutar el control');
//     }
//   });


// ==================================================
// === Funciones auxiliares =========================
// ==================================================

function parseFpartoToDate(raw) {
  if (!raw) return null;

  // Timestamp Firestore
  if (raw && typeof raw.toDate === 'function') {
    try { return raw.toDate(); } catch (_) { /* ignore */ }
  }

  if (typeof raw !== 'string') {
    try {
      const d = new Date(raw);
      return isNaN(d.getTime()) ? null : d;
    } catch (_) { return null; }
  }

  let s = raw.trim();
  if (!s) return null;

  // Reemplazar separadores comunes
  s = s.replace(/[.]/g, '/').replace(/-/g, '/');

  // D/M/YYYY o DD/MM/YYYY
  const dmY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const yMd = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;

  let year, month, day;
  if (dmY.test(s)) {
    const [, d, m, y] = s.match(dmY);
    day = parseInt(d, 10);
    month = parseInt(m, 10);
    year = parseInt(y, 10);
  } else if (yMd.test(s)) {
    const [, y, m, d] = s.match(yMd);
    day = parseInt(d, 10);
    month = parseInt(m, 10);
    year = parseInt(y, 10);
  } else {
    // Intento final con Date.parse directo
    const fallback = new Date(s);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  if (!year || !month || !day) return null;
  // Mes 1-12 → Date usa 0-11
  const date = new Date(Date.UTC(year, month - 1, day));
  return isNaN(date.getTime()) ? null : date;
}

async function getTambos(tambos = []) {
  try {
    const snapshotTambos = await firestore.collection("tambo").get();
    snapshotTambos.forEach((doc) => {
      tambos.push({ id: doc.id, nombre: doc.data().nombre });
    });
  } catch (error) {
    console.error("Error al obtener los tambos:", error);
  }
  return tambos;
}

async function getParametros(idtambo, parametros = []) {
  try {
    console.log("📌 Buscando parámetros para tambo:", idtambo);
    const snapshotParam = await firestore
      .collection("parametro")
      .where("idtambo", "==", idtambo)
      .orderBy("orden")
      .get();

    console.log(`📊 Total de parámetros encontrados: ${snapshotParam.size}`);

    snapshotParam.forEach((doc) => {
      const data = doc.data();
      console.log(`   📋 Parámetro: id=${doc.id}, um=${data.um}, categoria=${data.categoria}, condicion=${data.condicion} ${data.min}-${data.max}, rodeo=${data.orden}`);

      parametros.push({
        id: doc.id,
        rodeo: data.orden,
        condicion: data.condicion,
        max: data.max,
        min: data.min,
        racion: data.racion,
        um: data.um,
        categoria: data.categoria,
      });
    });

    // Mostrar resumen por tipo de unidad de medida
    const porUM = parametros.reduce((acc, p) => {
      acc[p.um] = (acc[p.um] || 0) + 1;
      return acc;
    }, {});

    console.log(`📈 Resumen por UM:`, porUM);

  } catch (error) {
    console.error("Error al obtener los parámetros:", error);
  }
  return parametros;
}

async function getAnimal(idtambo, animales = []) {
  try {
    console.log("📌 Buscando animales activos en tambo:", idtambo);
    const snapshotAnimal = await firestore
      .collection("animal")
      .where("idtambo", "==", idtambo)
      .where("estpro", "==", "En Ordeñe")
      .orderBy("rp")
      .get();

    snapshotAnimal.forEach((doc) => {
      const data = doc.data();
      if (!data.fbaja) {
        animales.push({ id: doc.id, ...data });
      }
    });
  } catch (error) {
    console.error("Error al obtener animales:", error);
  }
  return animales;
}

async function controlarTambos(t) {
  const parametros = await getParametros(t.id);
  const animales = await getAnimal(t.id);

  console.log(`🔎 Se controlarán ${animales.length} animales del tambo ${t.id}`);

  await Promise.all(animales.map(a => controlarAnimal(a, parametros)));

  console.log(`✅ Finalizado control de ${animales.length} animales del tambo ${t.id}`);
}

async function controlarAnimal(a, parametros) {
  const nowDate = new Date();

  console.log(`\n🔍 === ANÁLISIS DEL ANIMAL ${a.rp} (${a.id}) ===`);
  console.log(`📊 Datos del animal:`);
  console.log(`   • RP: ${a.rp}`);
  console.log(`   • Categoría: ${a.categoria}`);
  console.log(`   • Ración actual: ${a.racion}`);
  console.log(`   • Rodeo actual: ${a.rodeo}`);
  console.log(`   • Sugerido actual: ${a.sugerido}`);
  console.log(`   • Último control (uc): ${a.uc}`);
  console.log(`   • Fecha de parto: ${a.fparto}`);

  // 🔹 Parseo robusto de fecha de parto
  const partoDate = parseFpartoToDate(a.fparto);

  const diasLact = partoDate
    ? Math.floor((nowDate - partoDate) / (1000 * 60 * 60 * 24))
    : null;

  console.log(`📅 Días de lactancia calculados: ${diasLact} días`);

  // 1️⃣ Evaluar por días de lactancia
  console.log(`\n🔹 EVALUANDO POR DÍAS DE LACTANCIA...`);
  const lactanciaPromises = parametros.map(async (p) => {
    if (p.categoria === a.categoria && p.um === "Dias Lactancia" && diasLact !== null) {
      console.log(`   📋 Analizando parámetro: rodeo ${p.rodeo}, condición ${p.condicion} ${p.min}-${p.max}`);

      let cumple = false;
      const min = parseInt(p.min || "0", 10);
      const max = parseInt(p.max || "0", 10);

      if (p.condicion === "entre") {
        cumple = diasLact >= min && diasLact <= max;
        console.log(`      🔍 Comparando: ${diasLact} >= ${min} && ${diasLact} <= ${max} → ${cumple}`);
      } else if (p.condicion === "mayor") {
        cumple = diasLact > max; // para 'mayor', se compara con max
        console.log(`      🔍 Comparando: ${diasLact} > ${max} → ${cumple}`);
      } else if (p.condicion === "menor") {
        cumple = diasLact < min; // para 'menor', se compara con min
        console.log(`      🔍 Comparando: ${diasLact} < ${min} → ${cumple}`);
      }

      if (cumple) {
        const rangoTexto = p.condicion === 'entre' ? `${min} y ${max}` : (p.condicion === 'menor' ? `${min}` : `${max}`);
        console.log(`✅ Condición cumplida por días: ${diasLact} (${p.condicion} ${rangoTexto})`);
        console.log(`🏁 ${a.rp} ingresó por Días de Lactancia → rodeo ${p.rodeo}, ración ${p.racion}`);
        await cambioAlimentacion(p, a);
        return true;
      }
      const rangoTextoNo = p.condicion === 'entre' ? `${min} y ${max}` : (p.condicion === 'menor' ? `${min}` : `${max}`);
      console.log(`ℹ️ Sin condición por días: ${diasLact} no cumple (${p.condicion} ${rangoTextoNo})`);
    } else {
      console.log(`   ⏭️ Parámetro no aplica: categoria=${p.categoria} vs ${a.categoria}, um=${p.um}, diasLact=${diasLact}`);
    }
    return false;
  });

  const lactanciaResults = await Promise.all(lactanciaPromises);
  if (lactanciaResults.includes(true)) {
    console.log(`✅ ${a.rp} ingresó por Días de Lactancia - NO se evalúa por litros`);
    return;
  }

  // 2️⃣ Evaluar por litros producidos
  console.log(`\n🔹 EVALUANDO POR LITROS PRODUCIDOS...`);
  console.log(`   🔍 Animal ${a.rp} tiene uc=${a.uc} (tipo: ${typeof a.uc})`);

  // Mostrar todos los parámetros disponibles para litros
  const parametrosLitros = parametros.filter(p => p.um === "Lts. Producidos");
  console.log(`   📊 Parámetros de litros disponibles: ${parametrosLitros.length}`);
  parametrosLitros.forEach((p, idx) => {
    console.log(`      ${idx + 1}. Categoría: ${p.categoria}, Condición: ${p.condicion} ${p.min}-${p.max}, Rodeo: ${p.rodeo}`);
  });

  const litrosPromises = parametros.map(async (p) => {
    if (p.categoria === a.categoria && p.um === "Lts. Producidos") {
      console.log(`   📋 Analizando parámetro: rodeo ${p.rodeo}, condición ${p.condicion} ${p.min}-${p.max}`);

      const toNumber = (val) => {
        if (typeof val === 'number') return val;
        if (val === null || val === undefined) return NaN;
        return parseFloat(String(val).replace(',', '.'));
      };

      const litros = toNumber(a.uc);
      const min = toNumber(p.min);
      const max = toNumber(p.max);

      console.log(`      🔢 Valores convertidos: uc=${a.uc} → ${litros}, min=${p.min} → ${min}, max=${p.max} → ${max}`);

      if (!isNaN(litros)) {
        let cumple = false;

        if (p.condicion === "entre") {
          const lo = isNaN(min) ? -Infinity : min;
          const hi = isNaN(max) ? Infinity : max;
          cumple = litros >= lo && litros <= hi;
          console.log(`      🔍 Comparando: ${litros} >= ${lo} && ${litros} <= ${hi} → ${cumple}`);
        } else if (p.condicion === "mayor") {
          // Usa el umbral definido: prioriza max si existe, si no min
          const threshold = !isNaN(max) ? max : (!isNaN(min) ? min : NaN);
          cumple = !isNaN(threshold) && litros > threshold;
          console.log(`      🔍 Comparando: ${litros} > ${threshold} → ${cumple}`);
        } else if (p.condicion === "menor") {
          // Usa el umbral definido: prioriza min si existe, si no max
          const threshold = !isNaN(min) ? min : (!isNaN(max) ? max : NaN);
          cumple = !isNaN(threshold) && litros < threshold;
          console.log(`      🔍 Comparando: ${litros} < ${threshold} → ${cumple}`);
        }

        if (cumple) {
          const rangoTexto = p.condicion === 'entre'
            ? `${isNaN(min) ? '-∞' : min} : ${isNaN(max) ? '∞' : max}`
            : (p.condicion === 'menor' ? `${!isNaN(min) ? min : max}` : `${!isNaN(max) ? max : min}`);
          console.log(`✅ Condición cumplida por litros: ${litros} (${p.condicion} ${rangoTexto})`);
          console.log(`🏁 ${a.rp} ingresó por Litros Producidos (uc=${litros}) → rodeo ${p.rodeo}, ración ${p.racion}`);
          await cambioAlimentacion(p, a);
          return true;
        }
        const rangoTextoNo = p.condicion === 'entre'
          ? `${isNaN(min) ? '-∞' : min} : ${isNaN(max) ? '∞' : max}`
          : (p.condicion === 'menor' ? `${!isNaN(min) ? min : max}` : `${!isNaN(max) ? max : min}`);
        console.log(`ℹ️ Sin condición por litros: ${litros} no cumple (${p.condicion} ${rangoTextoNo})`);
      } else {
        console.log(`⚠️ uc inválido para ${a.rp}:`, a.uc);
      }
    } else {
      if (p.um === "Lts. Producidos") {
        console.log(`   ⏭️ Parámetro no aplica: categoria=${p.categoria} vs ${a.categoria}, um=${p.um}`);
      }
    }
    return false;
  });

  const litrosResults = await Promise.all(litrosPromises);
  if (litrosResults.includes(true)) {
    console.log(`✅ ${a.rp} ingresó por Litros Producidos`);
  } else {
    console.log(`❌ ${a.rp} NO ingresó en ningún rodeo (ni por días ni por litros)`);
  }

  console.log(`🔚 === FIN ANÁLISIS DEL ANIMAL ${a.rp} ===\n`);
}

async function cambioAlimentacion(p, a) {
  const myTimestamp = admin.firestore.Timestamp.now();
  let racion = a.racion;
  let fracion = a.fracion;
  let rodeo = a.rodeo;
  let sugerido = a.sugerido;
  let cambia = false;

  const paramRacion = parseInt(p.racion || "0", 10);
  const currentRacion = parseInt(a.racion || "0", 10);

  // Lógica de ración: si param > actual, actualizar ración; siempre actualizar sugerido si difiere
  if (paramRacion > currentRacion) {
    racion = p.racion;
    fracion = myTimestamp;
    cambia = true;
  }

  if (p.rodeo !== a.rodeo) {
    rodeo = p.rodeo;
    cambia = true;
  }

  // Siempre actualizar sugerido si es diferente
  if (paramRacion !== parseInt(a.sugerido || "0", 10)) {
    sugerido = p.racion;
    cambia = true;
  }

  if (cambia) {
    try {
      console.log(`⚡ Actualizando animal ${a.rp} (${a.id}) con:`, { racion, fracion, rodeo, sugerido, fparto: a.fparto });
      await firestore.collection("animal").doc(a.id).update({ racion, fracion, rodeo, sugerido });
      console.log("🐄 Alimentación actualizada:", a.rp, p.um, p.condicion);
    } catch (error) {
      console.error("❌ Error al actualizar alimentación:", error);
    }
  } else {
    console.log(`⏭️ Sin cambios aplicados para ${a.rp} (${a.id}): racion=${a.racion}, sugerido=${a.sugerido}, rodeo=${a.rodeo}, fparto=${a.fparto}`);
  }
}
