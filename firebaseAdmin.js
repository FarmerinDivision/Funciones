const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: "farmerin-navarro", // Reemplaza con tu ID de proyecto si es diferente
  });
}

module.exports = admin;
