/*	
const functions = require("firebase-functions");
const admin = require("./firebaseAdmin");
const firestore = admin.firestore();


const runtimeOpts = {
  timeoutSeconds: 540,
  memory: "2GB",
};

// 🔹 Función programada (respaldo global)
controlRodeoPrueba = functions
  .runWith(runtimeOpts)
  .pubsub.schedule('* * * * *')
  .onRun(async (context) => {
    try {
      const idTamboPrueba = "IClfjUvXc7SIoATvABjR"; // 👈 poné acá tu tambo de prueba
      console.log("=== INICIO CONTROL RODEO PRUEBA ===");

      const tambos = await getTambos();
      const tamboPrueba = tambos.filter((t) => t.id === idTamboPrueba);

      if (tamboPrueba.length === 0) {
        console.log(`❌ No se encontró el tambo con id ${idTamboPrueba}`);
        return null;
      }

      for (const t of tamboPrueba) {
        console.log("✅ Procesando tambo:", t.id, "-", t.nombre);
        await controlarTambos(t);
      }

      console.log("=== FIN CONTROL RODEO PRUEBA ===");
    } catch (error) {
      console.error("❌ Error al ejecutar controlRodeoPrueba:", error);
    }
  });

// 🔹 Trigger: cambios en parámetros
onParametroChange = functions.firestore
  .document("parametro/{parametroId}")
  .onWrite(async (change, context) => {
    const nuevoParametro = change.after.exists ? change.after.data() : null;
    const idParametro = context.params.parametroId;

    if (!nuevoParametro) {
      console.log("❌ Parámetro eliminado:", idParametro);
      return null;
    }

    console.log("📌 Parámetro actualizado:", idParametro, nuevoParametro);

    // Buscar animales del tambo afectado
    const animalesSnap = await firestore
      .collection("animal")
      .where("idtambo", "==", nuevoParametro.idtambo)
      .where("estpro", "==", "En Ordeñe")
      .get();

    for (const doc of animalesSnap.docs) {
      const data = doc.data();
      if (!data.fbaja) {
        await controlarAnimal({ id: doc.id, ...data }, [nuevoParametro]);
      }
    }

    return null;
  });

// 🔹 Trigger: cambios en animales
.onAnimalChange = functions.firestore
  .document("animal/{animalId}")
  .onWrite(async (change, context) => {
    const nuevoAnimal = change.after.exists ? change.after.data() : null;
    const idAnimal = context.params.animalId;

    if (!nuevoAnimal) {
      console.log("❌ Animal eliminado:", idAnimal);
      return null;
    }

    console.log("🐄 Animal actualizado:", idAnimal, nuevoAnimal.rp);

    // Buscar parámetros del tambo
    const parametrosSnap = await firestore
      .collection("parametro")
      .where("idtambo", "==", nuevoAnimal.idtambo)
      .orderBy("orden")
      .get();

    const parametros = parametrosSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    await controlarAnimal({ id: idAnimal, ...nuevoAnimal }, parametros);

    return null;
  });


// ==================================================
// === Funciones auxiliares =========================
// ==================================================

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

    snapshotParam.forEach((doc) => {
      console.log("   → Parametro:", doc.id, doc.data());
      parametros.push({
        id: doc.id,
        rodeo: doc.data().orden,
        condicion: doc.data().condicion,
        max: doc.data().max,
        min: doc.data().min,
        racion: doc.data().racion,
        um: doc.data().um,
        categoria: doc.data().categoria,
      });
    });
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
      // Aceptamos fbaja null, undefined o string vacío
      if (!data.fbaja) {
        console.log("   → Animal:", doc.id, data.rp);
        animales.push({
          id: doc.id,
          ...data,
        });
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

  for (const a of animales) {
    await controlarAnimal(a, parametros);
  }
}

async function controlarAnimal(a, parametros) {
  const nowDate = new Date();
  const partoDate = a.fparto?.toDate ? a.fparto.toDate() : new Date(a.fparto);
  const diasLact = isNaN(partoDate) ? null : Math.floor((nowDate - partoDate) / (1000 * 60 * 60 * 24));

  // 1️⃣ Primero evaluamos Dias Lactancia
  for (const p of parametros) {
    if (p.categoria === a.categoria && p.um === "Dias Lactancia" && diasLact !== null) {
      let cumple = false;
      if (p.condicion === "entre") {
        cumple = diasLact >= parseInt(p.min) && diasLact <= parseInt(p.max);
      } else if (p.condicion === "mayor") {
        cumple = diasLact > parseInt(p.min);
      } else if (p.condicion === "menor") {
        cumple = diasLact < parseInt(p.max);
      }

      if (cumple) {
        await cambioAlimentacion(p, a);
        return; // 👈 prioridad a Dias Lactancia, cortamos acá
      }
    }
  }

  // 2️⃣ Si no cumplió ninguno de Dias Lactancia, evaluamos Litros producidos
  for (const p of parametros) {
    if (p.categoria === a.categoria && p.um === "Litros producidos") {
      const litros = parseFloat(a.uc || 0);
      console.log(`🐄 Animal ${a.rp} - Litros producidos detectados (uc):`, litros);

      if (!isNaN(litros)) {
        let cumple = false;
        if (p.condicion === "entre") {
          cumple = litros >= parseFloat(p.min) && litros <= parseFloat(p.max);
        } else if (p.condicion === "mayor") {
          cumple = litros > parseFloat(p.min);
        } else if (p.condicion === "menor") {
          cumple = litros < parseFloat(p.max);
        }

        if (cumple) {
          await cambioAlimentacion(p, a);
          return; // 👈 aplicamos el primero de litros que cumpla
        }
      }
    }
  }
}


async function cambioAlimentacion(p, a) {
  const myTimestamp = admin.firestore.Timestamp.now();
  let racion = a.racion;
  let fracion = a.fracion;
  let rodeo = a.rodeo;
  let sugerido = a.sugerido;
  let cambia = false;

  if (parseInt(p.racion) > parseInt(a.racion)) {
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
      console.log(`⚡ Actualizando animal ${a.rp} (${a.id}) con:`, { racion, fracion, rodeo, sugerido });
      await firestore.collection("animal").doc(a.id).update({ racion, fracion, rodeo, sugerido });
      console.log("🐄 Alimentación actualizada:", a.rp, p.um, p.condicion);
    } catch (error) {
      console.error("❌ Error al actualizar alimentación:", error);
    }
  }
}

*/