// functions/index.js
// Firebase Cloud Function — envía push a todos los tokens suscritos

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp }      = require('firebase-admin/app');
const { getMessaging }       = require('firebase-admin/messaging');
const { getFirestore }       = require('firebase-admin/firestore');

initializeApp();

exports.sendPushNotification = onCall(
  { region: 'europe-west1' },
  async (request) => {

    const { title, body } = request.data;

    if (!title || !body) {
      throw new HttpsError('invalid-argument', 'title y body son obligatorios');
    }

    // Leer todos los tokens guardados en Firestore
    const db     = getFirestore();
    const snap   = await db.collection('fcm_tokens').get();

    if (snap.empty) {
      return { successCount: 0, failureCount: 0 };
    }

    const tokens = snap.docs.map(d => d.data().token).filter(Boolean);

    if (tokens.length === 0) {
      return { successCount: 0, failureCount: 0 };
    }

    // Enviar en lotes de 500 (límite FCM)
    const BATCH = 500;
    let successCount = 0;
    let failureCount = 0;
    const tokensToDelete = [];

    for (let i = 0; i < tokens.length; i += BATCH) {
      const batch = tokens.slice(i, i + BATCH);

      const response = await getMessaging().sendEachForMulticast({
        tokens: batch,
        notification: { title, body },
        webpush: {
          notification: {
            title,
            body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            vibrate: [200, 100, 200]
          },
          fcmOptions: { link: '/' }
        }
      });

      successCount += response.successCount;
      failureCount += response.failureCount;

      // Marcar tokens inválidos para borrar
      response.responses.forEach((r, idx) => {
        if (!r.success) {
          const code = r.error?.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            tokensToDelete.push(batch[idx]);
          }
        }
      });
    }

    // Limpiar tokens inválidos
    if (tokensToDelete.length > 0) {
      const deleteSnap = await db.collection('fcm_tokens')
        .where('token', 'in', tokensToDelete.slice(0, 30)) // Firestore límite 'in'
        .get();
      const writer = db.batch();
      deleteSnap.docs.forEach(d => writer.delete(d.ref));
      await writer.commit();
    }

    console.log(`Push enviado: ${successCount} ok, ${failureCount} fallidos`);
    return { successCount, failureCount };
  }
);
