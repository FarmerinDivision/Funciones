const functions = require('firebase-functions');
const admin = require('./firebaseAdmin'); // ✅ Usamos el admin inicializado correctamente
const firestore = admin.firestore();

const runtimeOpts = {
  timeoutSeconds: 540,
  memory: '2GB'
};


/////////// MONITOR PROXY WEB EN IFRAME /////////
// const proxyApp = require("./server"); // app Express exportada
// exports.proxyMonitor = functions.https.onRequest(proxyApp);

/////////// MONITOR CAÍDO = ENVIAR WHATSAPP /////////
// const { verificarMonitor } = require("./NotificacionWpp");
// exports.verificarMonitor = verificarMonitor;

///////// EXPORTANDO FUNCION PARA ANIMALES AUSENTES ////////////
// const { revisarAusentes } = require('./revisarAusentes');

// exports.revisarAusentes = functions.pubsub
//   .schedule('30 3 * * *')
//   .timeZone('America/Argentina/Buenos_Aires')
//   .onRun(async () => {
//     console.log('Inicio de la función programada: revisarAusentes');
//     await revisarAusentes();
//     console.log('Fin de la función programada: revisarAusentes');
//   });

///////// EXPORTANDO FUNCION PARA ALTAS VAQUILLONAS ////////////
// const { revisarEstadoCria } = require("./revisarEstadoCrias");

// exports.revisarEstadoCria = functions
//   .runWith({ memory: "2GB", timeoutSeconds: 540 })
//   .pubsub.schedule("0 3 * * *")
//   .onRun(async () => {
//     await revisarEstadoCria();
//   });


///////// EXPORTANDO FUNCION PARA PARAMETROS ALIMENTACION SEGUN DIAS DE LACTANCIA O LITROS PRODUCIDOS Y RODEOS ////////////
// exports.controlRodeoTest = functions
//   .runWith(runtimeOpts)
//   .pubsub.schedule("30 2 * * *")
//   .timeZone('America/Argentina/Buenos_Aires')
//   .onRun(async (context) => {
//     try {
//       console.log("=== INICIO CONTROL RODEO TEST (todas las noches) ===");
//       const jobStart = Date.now();
//
//       const tambos = await getTambos();
//
//       await Promise.all(
//         tambos.map(async (t) => {
//           console.log("✅ Procesando tambo:", t.id, "-", t.nombre);
//           return controlarTambos(t);
//         })
//       );
//
//       const jobMs = Date.now() - jobStart;
//       console.log(`=== FIN CONTROL RODEO TEST (${jobMs} ms) ===`);
//     } catch (error) {
//       console.error("❌ Error al ejecutar controlRodeoTest:", error);
//     }
//   });

///////// ENDPOINT DE PRUEBA: EJECUTAR SOLO UN TAMBO POR ID ////////////
////// await controlRodeoTestOne.get() 

const FIXED_TAMBO_ID = "jGWqeJjPAW3yJtAZpKJr"; // opcional: setear un ID por defecto si se desea

exports.controlRodeoTestOne = functions
  .runWith(runtimeOpts)
  .https.onRequest(async (req, res) => {
    const idtambo = (req.method === 'POST' ? (req.body && (req.body.idtambo || req.body.tamboId)) : null)
      || req.query.idtambo
      || req.query.tamboId
      || FIXED_TAMBO_ID;

    if (!idtambo) {
      return res.status(400).json({
        status: "ERROR",
        message: "Falta parámetro idtambo"
      });
    }

    try {
      console.log('=== INICIO CONTROL RODEO TEST ONE ===');
      console.log('Tambo objetivo:', idtambo);
      
      // Validar que el tambo exista y tenga campos necesarios
      const tamboDoc = await firestore.collection("tambo").doc(idtambo).get();
      if (!tamboDoc.exists) {
        return res.status(404).json({
          status: "ERROR",
          message: `Tambo ${idtambo} no existe`
        });
      }
      
      const tamboData = tamboDoc.data();
      if (!tamboData || !tamboData.nombre) {
        return res.status(400).json({
          status: "ERROR",
          message: `Tambo ${idtambo} no tiene campos necesarios (nombre)`
        });
      }
      
      await controlarTambos({ id: idtambo, nombre: tamboData.nombre });
      console.log('=== FIN CONTROL RODEO TEST ONE ===');

      res.status(200).json({
        status: "OK",
        message: `Control ejecutado para tambo ${idtambo}`
      });
    } catch (error) {
      console.error('❌ Error en controlRodeoTestOne:', error);
      res.status(500).json({
        status: "ERROR",
        message: "Error interno al ejecutar el control",
        details: error.message
      });
    }
  });


// ========= NUEVO: Ejecutar control para TODOS los tambos ahora mismo =========
/* exports.controlRodeoTest = functions
.runWith({ memory: "2GB", timeoutSeconds: 540 })
.pubsub.schedule("30 2 * * *")
.timeZone("America/Argentina/Buenos_Aires")
.onRun(async () => {
  const jobStart = Date.now();
  try {
    console.log("=== INICIO controlRodeoTest (ejecución automática 2:30 am) ===");
    const tambos = await getTambos();

    console.log(`📦 Tambos a procesar: ${tambos.length}`);

    await Promise.all(
      tambos.map(async (t) => {
        try {
          console.log("➡️ Procesando tambo:", t.id, "-", t.nombre);
          await controlarTambos(t);
        } catch (e) {
          console.error(`❌ Error procesando tambo ${t.id}:`, e);
        }
      })
    );

    const jobMs = Date.now() - jobStart;
    console.log(`=== FIN controlRodeoTest (${jobMs} ms) ===`);
  } catch (error) {
    console.error("❌ Error en controlRodeoTest:", error);
  }
}); */

// ========= NUEVO: Endpoint HTTPS para ejecutar control en TODOS los tambos (on-demand) =========
/* exports.controlRodeoTest = functions
  .runWith(runtimeOpts)
  .https.onRequest(async (req, res) => {
    const jobStart = Date.now();
    try {
      console.log("=== INICIO controlRodeoTestNow (on-demand) ===");
      const tambos = await getTambos();
      console.log(`📦 Tambos a procesar: ${tambos.length}`);

      await Promise.all(
        tambos.map(async (t) => {
          try {
            console.log("➡️ Procesando tambo:", t.id, "-", t.nombre);
            await controlarTambos(t);
          } catch (e) {
            console.error(`❌ Error procesando tambo ${t.id}:`, e);
          }
        })
      );

      const jobMs = Date.now() - jobStart;
      console.log(`=== FIN controlRodeoTestNow (${jobMs} ms) ===`);

      return res.status(200).json({
        status: "OK",
        message: "Control ejecutado para todos los tambos",
        tambosProcesados: tambos.length,
        durationMs: jobMs,
      });
    } catch (error) {
      console.error("❌ Error en controlRodeoTestNow:", error);
      return res.status(500).json({
        status: "ERROR",
        message: "Error interno al ejecutar el control para todos los tambos",
        details: error.message,
      });
    }
  }); */

// ========= Programado diario 02:30 AM (AR) =========
// exports.controlRodeoTest = functions
//   .runWith(runtimeOpts)
//   .pubsub.schedule("30 2 * * *")
//   .timeZone("America/Argentina/Buenos_Aires")
//   .onRun(async () => {
//     const jobStart = Date.now();
//     try {
//      ...




// ==================================================
// === Funciones auxiliares =========================
// ==================================================

function parseFpartoToDate(raw) {
  if (!raw) return null;

  // Firestore Timestamp
  if (raw && typeof raw.toDate === 'function') {
    try { return raw.toDate(); } catch (_) { /* ignore */ }
  }

  // Date ya válido
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return raw;
  }

  // 🔹 Manejo de string ISO (ej: "2025-09-01T12:51:16-03:00")
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  // String genérico
  if (typeof raw === 'string') {
    let s = raw.trim();
    if (!s) return null;

    // Reemplazar separadores
    s = s.replace(/[.]/g, '/').replace(/-/g, '/');

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
      const fallback = new Date(s);
      return isNaN(fallback.getTime()) ? null : fallback;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    return isNaN(date.getTime()) ? null : date;
  }

  // Intento final
  try {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch (_) {
    return null;
  }
}


async function getTambos(tambos = []) {
  try {
    const t0 = Date.now();
    const snapshotTambos = await firestore.collection("tambo").get();
    console.log(`📥 Tambos cargados: ${snapshotTambos.size}`);
    snapshotTambos.forEach((doc) => {
      const data = doc.data();
      // Validar que el documento tenga campos necesarios
      if (!data || !data.nombre) {
        console.log(`⚠️ Tambo ${doc.id} no tiene campos necesarios (nombre) → se omite`);
        return;
      }
      tambos.push({ id: doc.id, nombre: data.nombre });
    });
    console.log(`⏱️ Tiempo getTambos: ${Date.now() - t0} ms`);
  } catch (error) {
    console.error("Error al obtener los tambos:", error);
  }
  return tambos;
}

async function getParametros(idtambo) {
  // Devuelve: { [grupo]: { [categoria]: Parametro[] } }
  // Parametro mantiene compatibilidad con controlarAnimal: {categoria, um, condicion, min, max, rodeo, racion}
  const parametrosPorGrupo = {};
  try {
    const t0 = Date.now();
    console.log("📌 Buscando parámetros (nueva estructura) para tambo:", idtambo);
    const snapshotParam = await firestore
      .collection("parametro")
      .where("idtambo", "==", idtambo)
      .get();

    console.log(`📊 Documentos de parámetros encontrados: ${snapshotParam.size}`);

    snapshotParam.forEach((doc) => {
      const data = doc.data() || {};
      const grupoKey = String(data.grupo ?? "0");
      if (!parametrosPorGrupo[grupoKey]) parametrosPorGrupo[grupoKey] = {};

      const bloques = Array.isArray(data.parametros) ? data.parametros : [];
      console.log(`   📦 Doc ${doc.id}: grupo=${grupoKey}, bloques(categorias)=${bloques.length}`);

      bloques.forEach((bloque) => {
        const categoria = bloque && bloque.categoria ? String(bloque.categoria) : "";
        if (!categoria) return;

        if (!parametrosPorGrupo[grupoKey][categoria]) parametrosPorGrupo[grupoKey][categoria] = [];

        const rodeos = Array.isArray(bloque.rodeos) ? bloque.rodeos : [];
        console.log(`      • Categoria=${categoria}, reglas=${rodeos.length}`);
        rodeos.forEach((r) => {
          parametrosPorGrupo[grupoKey][categoria].push({
            id: `${doc.id}-${categoria}-${r && (r.orden ?? "")}`,
            categoria,
            um: r && r.um,
            condicion: r && (r.cond ?? r.condicion),
            min: r && r.min,
            max: r && r.max,
            rodeo: r && r.orden,
            racion: r && r.racion,
          });
        });
      });
    });

    // Log de resumen
    Object.keys(parametrosPorGrupo).forEach((g) => {
      const cats = Object.keys(parametrosPorGrupo[g]);
      console.log(`📦 Grupo ${g}: ${cats.length} categorías`);
      cats.forEach((c) => {
        console.log(`   • ${c}: ${parametrosPorGrupo[g][c].length} reglas`);
      });
    });
    console.log(`⏱️ Tiempo getParametros(${idtambo}): ${Date.now() - t0} ms`);
  } catch (error) {
    console.error("Error al obtener los parámetros (nueva estructura):", error);
  }
  return parametrosPorGrupo;
}

async function getAnimal(idtambo, animales = []) {
  try {
    const t0 = Date.now();
    console.log("📌 Buscando animales activos en tambo:", idtambo);
    const snapshotAnimal = await firestore
      .collection("animal")
      .where("idtambo", "==", idtambo)
      .where("estpro", "==", "En Ordeñe")
      .orderBy("rp")
      .get();

    console.log(`📥 Animales leídos del snapshot: ${snapshotAnimal.size}`);
    snapshotAnimal.forEach((doc) => {
      const data = doc.data();
      if (!data.fbaja) {
        animales.push({ id: doc.id, ...data });
      }
    });
    console.log(`📊 Animales activos sin fbaja: ${animales.length}`);
    console.log(`⏱️ Tiempo getAnimal(${idtambo}): ${Date.now() - t0} ms`);
  } catch (error) {
    console.error("Error al obtener animales:", error);
  }
  return animales;
}

async function controlarTambos(t) {
  const start = Date.now();
  console.log(`🚩 Iniciando control para tambo ${t.id}`);

  // Validar que el tambo tenga campos necesarios
  if (!t || !t.id) {
    console.log(`⚠️ Tambo inválido (sin id) → se omite`);
    return;
  }

  const parametrosPorGrupo = await getParametros(t.id);
  const animales = await getAnimal(t.id);

  console.log(`🔎 Se controlarán ${animales.length} animales del tambo ${t.id}`);

  // Procesar grupo por grupo en serie
  const gruposUnicos = [...new Set(animales.map(a => String(a.grupo ?? "0")))];

  for (const grupoKey of gruposUnicos) {
    console.log(`\n=== 🐄 Procesando GRUPO ${grupoKey} ===`);

    const animalesGrupo = animales.filter(a => String(a.grupo ?? "0") === grupoKey);

    // Si no existen parámetros para este grupo → skip
    if (!parametrosPorGrupo[grupoKey]) {
      console.log(`⚠️ Grupo ${grupoKey} no tiene parámetros definidos → se omiten ${animalesGrupo.length} animales`);
      // 🧩 Nuevo log de advertencia detallado
      const rps = animalesGrupo.map(a => a.rp).join(", ");
      console.log(`🚨 Hay ${animalesGrupo.length} animales con valor grupo ${grupoKey} que no fueron actualizados por no existir grupo ${grupoKey}.`);
      console.log(`   🐮 RP afectados: ${rps || 'Ninguno listado'}`);
      continue;
    }

    for (const a of animalesGrupo) {
      const aStart = Date.now();
      const categoria = String(a.categoria || "");
      const parametrosCategoria = parametrosPorGrupo[grupoKey][categoria] || [];

      console.log(
        `➡️ Animal ${a.rp} (grupo=${a.grupo}, categoria=${categoria}) recibirá ${parametrosCategoria.length} parámetros`
      );

      await controlarAnimal(a, parametrosCategoria);
      console.log(`🟢 Fin análisis animal ${a.rp} en ${Date.now() - aStart} ms`);
    }
  }

  console.log(`✅ Finalizado control de ${animales.length} animales del tambo ${t.id} en ${Date.now() - start} ms`);
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
        
        // Verificar si tiene ración manual
        if (a.racionManual === true) {
          console.log(`⏭️ ${a.rp} tiene raciónManual=true → se saltea la actualización automática`);
          return true;
        }
        
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
          
          // Verificar si tiene ración manual
          if (a.racionManual === true) {
            console.log(`⏭️ ${a.rp} tiene racionManual=true → se saltea la actualización automática`);
            return true;
          }
          
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
  const myTimestamp = new Date(); // ✅ reemplazado
  let racion = a.racion;
  let fracion = a.fracion;
  let rodeo = a.rodeo;
  let sugerido = a.sugerido;
  let cambia = false;

  const paramRacion = parseInt(p.racion || "0", 10);
  const currentRacion = parseInt(a.racion || "0", 10);

  if (paramRacion > currentRacion) {
    racion = p.racion;
    fracion = myTimestamp;
    cambia = true;
  }

  if (paramRacion < currentRacion) {
    racion = p.racion;
    fracion = myTimestamp;
    cambia = true;
  }

  if (p.rodeo !== a.rodeo) {
    rodeo = p.rodeo;
    cambia = true;
  }

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
