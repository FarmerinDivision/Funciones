const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const firestore = admin.firestore();
//const PromisePool = require('es6-promise-pool');
//const differenceInDays = require('date-fns/differenceInDays');


const runtimeOpts = {
  timeoutSeconds: 1200,
  memory: '1GB'
}

exports.controlRodeoTest = functions.pubsub.schedule('30 02 * * *').onRun(async (context) => {
  try {
    const tambos = await getTambos();
    const promesas = tambos.map(async t => {
      
      console.log('inicia', t.id);
      const control = await controlarTambos(t);
      return control;

    });
    await Promise.all(promesas)
    console.log('Proceso FInalizado con éxito');
  } catch (error) {
    console.error('Error al ejecutar el proceso');
    console.error(error);
  }

});

async function controlarTambos(t) {

  const parametros = await getParametros(t.id);
  const animales = await getAnimal(t.id);

  const promesas = animales.map(async a => {

    const control = await controlarAnimal(a, parametros);
    return control;

  });
  await Promise.all(promesas)

  return promesas;

}

async function controlarAnimal(a, parametros) {

  //Calcula los kgs de ración de acuerdo a la condición del animal
  let diasPre;
  let diasLact;
  let elapsedTime;
  let sugerido = 0;
  

  const nowDate = new Date();
  const partoDate = new Date(a.fparto);

  //Calcula los dias de preñez
  if (a.estrep === "vacia") {
    diasPre = 0;
  } else {
    const servicioDate = new Date(a.fservicio);
    elapsedTime = (nowDate.getTime() - servicioDate.getTime());
    diasPre = Math.floor(elapsedTime / 1000 / 60 / 60 / 24);
  }

  elapsedTime = (nowDate.getTime() - partoDate.getTime());
  //calcula los dias de lactancia
  diasLact = Math.floor(elapsedTime / 1000 / 60 / 60 / 24);

  //return console.log(a.id,a.fparto,diasLact,a.fservicio,diasPre);

  async function cambioAlimentacion(p) {
    let racion;
    let fracion;
    let rodeo;
    let cambia;
    let sugerido;
    const myTimestamp = admin.firestore.Timestamp.fromDate(new Date());
    //si la ración es mayor la cambio, sino mantengo 
    if (parseInt(p.racion) > parseInt(a.racion)) {
      racion = p.racion;
      fracion = myTimestamp;
      cambia = true;
    } else {
      //mantengo la misma racion
      racion = a.racion;
      fracion = a.fracion;
      //si la ración es menor a la del animal, alerto
      if (parseInt(p.racion) < parseInt(a.racion)) {
        const mensaje = `RP: ${a.rp} - La ración sugerida (${p.racion}) por ${p.um}  es menor a la actual (${a.racion})`;
        try {
          const alerta = {
            idtambo: a.idtambo,
            mensaje: mensaje,
            visto: false,
            fecha: nowDate.getTime()
          }
          await firestore.collection('alerta').add(alerta);
        } catch (error) {
          console.error('Error al escribir alerta de:', a.rp,a.idtambo, error);
        }

      }
    }

    //si el rodeo es distinto, lo cambia
    if (p.rodeo !== a.rodeo) {
      cambia = true;
      rodeo = p.rodeo;
    } else {
      rodeo = a.rodeo;
    }

    //si los kg sugeridos son distintos a los actuales, los cambio
    if (parseInt(p.racion) !== parseInt(a.sugerido)) {
      cambia = true;
      sugerido = p.racion;
    } else {
      sugerido = a.sugerido;
    }

    //si hay cambios, hago update del animal
    if (cambia === true) {
      const animal = {
        racion: racion,
        fracion: fracion,
        rodeo: rodeo,
        sugerido: sugerido
      }
      console.log('cambio en alimentacion ',p.um, a.id);
      try {
        await firestore.collection('animal').doc(a.id).update(animal);
      } catch (error) {
        console.error('Error al actualizar la alimentación de:', a.rp,p.um, error);
      }

    }

    return null;
  }

  //Calcula la racion sugerida
  parametros.every(p => {

    let encuentra = false;
    //Chequea la categoria
    if (p.categoria === a.categoria) {

      //si es por lactancia controla los dias
      if (p.um === "Dias Lactancia") {

        //controla condicion

        if (p.condicion === "entre") {

          if (diasLact >= parseInt(p.min) && diasLact <= parseInt(p.max)) {
            //llamo a la funcion que cambia por días de lactancia
            cambioAlimentacion(p);
            //cambio este flag para terminar el loop
            encuentra = true;
          }
        } else if (p.condicion === "menor") {


          if (diasLact <= parseInt( p.min)) {
            //llamo a la funcion que cambia por días de lactancia
            cambioAlimentacion(p);
            //cambio este flag para terminar el loop
            encuentra = true;
          }

        }
      } else {
        //Si es por litros producidos 
        //controla condicion
        if (p.condicion === "entre") {

          if (parseInt(a.uc) >= parseInt(p.min) && parseInt(a.uc) <= parseInt(p.max)) {
            if (a.fracion < a.fuc) {
              cambioAlimentacion(p);
            }
            encuentra = true;
          }

        } else if (p.condicion === "menor") {

          if (parseInt(a.uc) <= parseInt(p.min)) {
            if (a.fracion < a.fuc) {
              cambioAlimentacion(p);
            }
            encuentra = true;
          }

        } else {

          if (parseInt(a.uc) >= parseInt(p.max)) {
            if (a.fracion < a.fuc) {
              cambioAlimentacion(p);
            }
            encuentra = true;
          }

        }

      }
    }
    //si encuentra condicion dejo de recorrer el array
    if (encuentra === true) {
      return false;
    } else {
      return true;
    }


  });

  return console.log(sugerido);


}




async function getTambos(tambos = []) {
  try {
    const snapshotTambos = await firestore.collection('tambo').get();
    snapshotTambos.forEach(doc => {
      tambos.push({
        id: doc.id,
        nombre: doc.data().nombre

      }
      );
    });
  } catch (error) {
    console.error('Error al obtener los tambos');
    console.error(error);
  }
  return tambos;

}

async function getParametros(idtambo, parametros = []) {
  try {
    console.log('Busca parametros', idtambo);
    const snapshotParam = await firestore.collection('parametro').where('idtambo', '==', idtambo).orderBy('orden').get();
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

      }
      );
    });
  } catch (error) {
    console.error('Error al obtener los parametros');
    console.error(error);
  }
  return parametros;

}

async function getAnimal(idtambo, animales = []) {
  try {
    console.log('Busca animales', idtambo);
    const snapshotAnimal = await firestore.collection('animal').where('idtambo', '==', idtambo).where('estpro', '==', 'En Ordeñe').where('fbaja', '==', '').orderBy('rp').get();
    snapshotAnimal.forEach(doc => {
      animales.push({
        id: doc.id,
        idtambo:doc.data().idtambo,
        rp: doc.data().rp,
        racion: doc.data().racion,
        fracion: doc.data().fracion,
        fservicio: doc.data().fservicio,
        fparto: doc.data().fparto,
        estrep: doc.data().estrep,
        categoria: doc.data().categoria,
        uc: doc.data().uc,
        fuc: doc.data().fuc,
        rodeo: doc.data().rodeo
      }
      );

    });
  } catch (error) {
    console.error('Error al obtener los parametros');
    console.error(error);
  }
  return animales;

}


