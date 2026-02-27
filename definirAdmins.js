/**
 * Firebase Function:
 * definirAdmins
 *
 * Esta función se encarga de asignar el rol de ADMIN
 * a un grupo reducido y crítico de usuarios de la empresa.
 *
 * 🔐 Seguridad:
 * - Solo puede ejecutarse desde backend (Firebase Functions)
 * - Requiere usuario autenticado
 * - Requiere claim superAdmin === true
 *
 * ❗ Esta función NO se ejecuta en cada login.
 * Se usa solo para inicializar o sincronizar los admins.
 */

const functions = require("firebase-functions");

// Admin SDK inicializado en un archivo centralizado
// para evitar múltiples inicializaciones
const admin = require("./firebaseAdmin");

/**
 * 📌 Lista fija de usuarios administradores
 * Son pocos (6), definidos por la empresa y de alta importancia.
 * Se identifican por email para mayor legibilidad.
 */
const ADMIN_EMAILS = [
  "caprilesulises@gmail.com",
  "cmmassone@gmail.com",
  "farmerinfacundo@gmail.com",
  "farmerin.navarro@gmail.com",
  "infofarmerin@gmail.com",
  "farmerindivision@gmail.com",
];

/**
 * 🔐 Function callable protegida
 * Puede ser llamada desde la app usando httpsCallable
 */
exports.definirAdmins = functions.https.onCall(async (data, context) => {

  /**
   * 1️⃣ Verificación de autenticación
   * context.auth existe solo si el usuario está logueado
   */
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "El usuario no está autenticado"
    );
  }

  /**
   * 2️⃣ Verificación de permisos
   * Solo un usuario con rol superAdmin puede
   * asignar administradores
   */
  if (!context.auth.token.superAdmin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "No tenés permisos para definir administradores"
    );
  }

  try {
    /**
     * Array auxiliar para devolver info de los usuarios
     * a los que se les asignó el rol admin
     */
    const asignados = [];

    /**
     * 3️⃣ Recorremos la lista de emails definidos
     */
    for (const email of ADMIN_EMAILS) {

      /**
       * Buscamos el usuario en Firebase Authentication
       * a partir del email
       */
      const user = await admin.auth().getUserByEmail(email);

      /**
       * 4️⃣ Asignamos el claim admin:true
       * Esto queda guardado en Firebase Auth
       * y se propaga en el token del usuario
       */
      await admin.auth().setCustomUserClaims(user.uid, {
        admin: true,
      });

      /**
       * Guardamos info para el response
       */
      asignados.push({
        email,
        uid: user.uid,
        admin: true,
      });
    }

    /**
     * 5️⃣ Respuesta exitosa
     */
    return {
      ok: true,
      message: "Usuarios administradores definidos correctamente",
      asignados,
    };

  } catch (error) {
    /**
     * 6️⃣ Manejo de errores
     * Cualquier error se loguea y se devuelve
     * como error interno
     */
    console.error("❌ Error en definirAdmins:", error);

    throw new functions.https.HttpsError(
      "internal",
      error.message
    );
  }
});
