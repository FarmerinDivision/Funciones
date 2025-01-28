const admin = require("firebase-admin"); // Importa firebaseAdmin para evitar inicializaciones múltiples
const firestore = admin.firestore();

// Función principal exportada
async function revisarEstadoCria() {
  try {
    const animales = await getAnimales();

    const promesas = animales.map(async (animal) => {
      await procesarAnimal(animal);
    });

    await Promise.all(promesas);
    console.log("Revisión de animales completada.");
  } catch (error) {
    console.error("Error al revisar animales:", error);
  }
}

// Obtiene los animales filtrados por estado y tambo
async function getAnimales() {
  const query = firestore
    .collection("animal")
    .where("estpro", "==", "cria");

  try {
    const snapshot = await query.get();

    if (snapshot.empty) {
      console.log("No se encontraron animales para revisar.");
      return [];
    }

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error al obtener los animales:", error);
    throw error;
  }
}

// Procesa un animal individualmente
async function procesarAnimal(animal) {
  const { id, ingreso, rp, erp, estpro } = animal;
  const ingresoDate = ingreso ? new Date(ingreso) : null;

  console.log(`Procesando animal: ${id} - rp: ${rp}, erp: ${erp}, estado: ${estpro}`);

  if (estpro === "seca") {
    console.log(`El animal ${id} ya está en estado 'seca', se ignora.`);
    return;
  }

  if (ingresoDate) {
    const monthsDifference = calcularMesesDiferencia(ingresoDate, new Date());
    console.log(`Diferencia en meses para el animal ${id}: ${monthsDifference}`);

    if (rp || erp) {
      if (monthsDifference >= 12) {
        console.log(`El animal ${id} será actualizado a 'seca'.`);
        await actualizarEstadoAnimal(id, "seca");
        await registrarEvento(id, rp);
      } else {
        console.log(`El animal ${id} debe esperar más tiempo para cambiar de estado.`);
      }
    } else {
      if (monthsDifference >= 2) {
        console.log(`El animal ${id} será eliminado.`);
        await eliminarAnimal(id);
      } else {
        console.log(`El animal ${id} debe esperar más tiempo para ser eliminado.`);
      }
    }
  } else {
    console.log(`La fecha de ingreso del animal ${id} no es válida.`);
  }
}

// Calcula la diferencia en meses entre dos fechas
function calcularMesesDiferencia(fechaInicial, fechaFinal) {
  const diferenciaEnMilisegundos = fechaFinal - fechaInicial;
  return Math.floor(diferenciaEnMilisegundos / (1000 * 3600 * 24 * 30));
}

// Actualiza el estado de un animal
async function actualizarEstadoAnimal(id, nuevoEstado) {
  try {
    await firestore.collection("animal").doc(id).update({ estpro: nuevoEstado });
    console.log(`Estado del animal ${id} actualizado a ${nuevoEstado}.`);
  } catch (error) {
    console.error(`Error al actualizar el estado del animal ${id}:`, error);
  }
}

// Registra un evento en Firestore
async function registrarEvento(id, rp) {
  const eventosRef = firestore.collection("animal").doc(id).collection("eventos");
  const hoy = admin.firestore.Timestamp.now();

  try {
    await eventosRef.add({
      fecha: hoy,
      tipo: "Alta Vaquillona",
      detalle: "Cambio de estado a seca tras completar periodo de crecimiento",
    });
    console.log(`Evento registrado para el animal ${id} - ${rp}.`);
  } catch (error) {
    console.error(`Error al registrar el evento para el animal ${id} - ${rp}:`, error);
  }
}

// Elimina un animal de la base de datos
async function eliminarAnimal(id) {
  try {
    await firestore.collection("animal").doc(id).delete();
    console.log(`Cría eliminada: ${id}`);
  } catch (error) {
    console.error(`Error al eliminar el animal ${id}:`, error);
  }
}

// Exportar la función principal
module.exports = {
  revisarEstadoCria,
};
