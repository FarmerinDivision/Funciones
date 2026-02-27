/**
 * convertirFracionTimestamp.js
 * Convierte el campo fracion (string) a Firestore Timestamp en animales "En Ordeñe".
 * Función idempotente: no reprocesa animales que ya tengan fracion como Timestamp.
 */



function esTimestamp(val) {
  return val && typeof val.toDate === 'function';
}

/**
 * Opciones opcionales para filtrar tambos en modo prueba.
 * @param {string[]} [tamboIds] - IDs de tambos a procesar (solo estos). Si no se pasa, se procesan todos.
 * @param {number} [limiteTambos] - Cantidad máxima de tambos a procesar (ej: 3 para pruebas).
 */
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

    const dmY = new RegExp('^(\\d{1,2})[./-](\\d{1,2})[./-](\\d{4})$');
    const yMd = new RegExp('^(\\d{4})[./-](\\d{1,2})[./-](\\d{1,2})$');

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
      if (isNaN(fallback.getTime())) return null;
      // Reconstruir con 12:00 UTC para evitar problemas de timezone
      day = fallback.getDate();
      month = fallback.getMonth() + 1; // getMonth es 0-indexed
      year = fallback.getFullYear();
    }

    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
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

/**
 * Opciones opcionales para filtrar tambos en modo prueba.
 * @param {string[]} [tamboIds] - IDs de tambos a procesar (solo estos). Si no se pasa, se procesan todos.
 * @param {number} [limiteTambos] - Cantidad máxima de tambos a procesar (ej: 3 para pruebas).
 */
async function ejecutarConvertirFracionTimestamp(getTambos, getAnimal, firestore, opciones = {}) {
  const jobStart = Date.now();
  const { tamboIds, limiteTambos } = opciones;

  let totalTambos = 0;
  let tambosProcesados = 0;
  let tambosOmitidos = 0;
  let totalAnimalesLeidos = 0;
  let animalesConvertidos = 0;
  let animalesOmitidos = 0;

  console.log('=== INICIO convertirFracionTimestamp ===');

  let tambos = await getTambos();

  if (tamboIds && Array.isArray(tamboIds) && tamboIds.length > 0) {
    tambos = tambos.filter((t) => tamboIds.includes(t.id));
    console.log(`🔧 Modo prueba: filtrados ${tambos.length} tambos por IDs: ${tamboIds.join(', ')}`);
  } else if (typeof limiteTambos === 'number' && limiteTambos > 0) {
    tambos = tambos.slice(0, limiteTambos);
    console.log(`🔧 Modo prueba: limitado a los primeros ${tambos.length} tambos`);
  }

  totalTambos = tambos.length;
  console.log(`📦 Tambos encontrados: ${totalTambos}`);

  await Promise.all(
    tambos.map(async (t) => {
      try {
        console.log(`➡️ Iniciando tambo: ${t.id} - ${t.nombre}`);

        const animales = await getAnimal(t.id);
        totalAnimalesLeidos += animales.length;
        console.log(`📥 Animales leídos para tambo ${t.id}: ${animales.length}`);

        if (animales.length === 0) {
          console.log(`⚠️ Tambo ${t.id} no tiene animales → se omite`);
          tambosOmitidos++;
          return { id: t.id, nombre: t.nombre, status: 'OMITIDO', reason: 'Sin animales', convertidos: 0, omitidos: 0 };
        }

        const conFracionString = animales.filter((a) => {
          const frac = a.fracion;
          if (frac === undefined || frac === null) return false;
          if (esTimestamp(frac)) return false;
          return typeof frac === 'string';
        });

        if (conFracionString.length === 0) {
          console.log(`⚠️ Tambo ${t.id}: ningún animal con fracion string → se omite`);
          tambosOmitidos++;
          return { id: t.id, nombre: t.nombre, status: 'OMITIDO', reason: 'Sin animales con fracion string', convertidos: 0, omitidos: animales.length };
        }

        let convertidosTambo = 0;
        let omitidosTambo = 0;

        for (const a of conFracionString) {
          try {
            const frac = a.fracion;
            if (esTimestamp(frac)) {
              console.log(`⏭️ Animal ${a.rp} (${a.id}): fracion ya es Timestamp → se saltea`);
              omitidosTambo++;
              animalesOmitidos++;
              continue;
            }
            if (typeof frac !== 'string') {
              console.log(`⏭️ Animal ${a.rp} (${a.id}): fracion no es string (tipo: ${typeof frac}) → se saltea`);
              omitidosTambo++;
              animalesOmitidos++;
              continue;
            }

            const fecha = parseFpartoToDate(frac);
            if (!fecha || isNaN(fecha.getTime())) {
              console.log(`❌ Animal ${a.rp} (${a.id}): no se pudo parsear fracion "${frac}" → se saltea`);
              omitidosTambo++;
              animalesOmitidos++;
              continue;
            }

            // Al guardar un Date, Firestore lo convierte automáticamente a Timestamp
            const timestamp = fecha;
            await firestore.collection('animal').doc(a.id).update({ fracion: timestamp });
            console.log(`✅ Animal ${a.rp} (${a.id}): fracion convertida "${frac}" → ${timestamp.toISOString()}`);
            convertidosTambo++;
            animalesConvertidos++;
          } catch (err) {
            console.error(`❌ Error procesando animal ${a.rp} (${a.id}):`, err.message);
            omitidosTambo++;
            animalesOmitidos++;
          }
        }

        omitidosTambo += animales.length - conFracionString.length;
        animalesOmitidos += animales.length - conFracionString.length;
        tambosProcesados++;

        console.log(`✅ Tambo ${t.id} finalizado: ${convertidosTambo} convertidos, ${omitidosTambo} omitidos`);

        return {
          id: t.id,
          nombre: t.nombre,
          status: 'PROCESADO',
          convertidos: convertidosTambo,
          omitidos: omitidosTambo,
          totalAnimales: animales.length
        };
      } catch (e) {
        console.error(`❌ Error procesando tambo ${t.id}:`, e);
        tambosOmitidos++;
        return { id: t.id, nombre: t.nombre, status: 'ERROR', reason: e.message, convertidos: 0, omitidos: 0 };
      }
    })
  );

  const jobMs = Date.now() - jobStart;

  console.log('\n========================================');
  console.log('       RESUMEN convertirFracionTimestamp');
  console.log('========================================');
  console.log(`Total tambos: ${totalTambos}`);
  console.log(`Tambos procesados: ${tambosProcesados}`);
  console.log(`Tambos omitidos: ${tambosOmitidos}`);
  console.log(`Total animales leídos: ${totalAnimalesLeidos}`);
  console.log(`Animales convertidos: ${animalesConvertidos}`);
  console.log(`Animales omitidos: ${animalesOmitidos}`);
  console.log(`Tiempo total: ${jobMs} ms`);
  if (animalesConvertidos === 0) {
    console.log('✅ Proceso exitoso: no había animales con fracion string pendientes de convertir.');
  }
  console.log('========================================\n');

  console.log(`=== FIN convertirFracionTimestamp (${jobMs} ms) ===`);
}

module.exports = {
  ejecutarConvertirFracionTimestamp
};
