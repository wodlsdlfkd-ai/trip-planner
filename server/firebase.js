import { createHash } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { TripError } from './tripService.js';

export async function getServerServices() {
  const credentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const codeHash = process.env.TRIP_SHARE_CODE_SHA256;
  if (!credentials || !/^[a-f0-9]{64}$/.test(codeHash || '')) throw new TripError(503, 'editing-unavailable', '저장 기능을 준비 중입니다. 자료 조회와 엑셀 다운로드는 이용할 수 있습니다.');
  let config;
  try { config = JSON.parse(credentials); } catch { throw new TripError(503, 'editing-unavailable', '서버 인증 설정을 확인해야 합니다.'); }
  if (config.project_id !== 'my-travel-planner-82ad9') throw new TripError(503, 'editing-unavailable', '서버 프로젝트 설정을 확인해야 합니다.');
  const app = getApps().find(app => app.name === 'trip-api') || initializeApp({ credential: cert(config) }, 'trip-api');
  const db = getFirestore(app);
  return {
    codeHash,
    verifyToken: token => getAuth(app).verifyIdToken(token),
    rateLimit: async req => {
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
      const hash = createHash('sha256').update(`${config.private_key}:${ip}`).digest('hex');
      const reference = db.collection('_tripApiRateLimits').doc(hash);
      const window = Math.floor(Date.now() / 60000);
      await db.runTransaction(async transaction => {
        const snap = await transaction.get(reference);
        const previous = snap.data();
        const count = previous?.window === window ? previous.count + 1 : 1;
        if (count > 30) throw new TripError(429, 'rate-limited', '요청이 너무 많습니다. 1분 후 다시 시도해 주세요.');
        transaction.set(reference, { window, count });
      });
    },
    store: {
      transaction: (id, operation) => db.runTransaction(async transaction => {
        const reference = db.collection('artifacts/my-travel-planner/public/data/trips').doc(id);
        const snap = await transaction.get(reference);
        const { next, result } = operation(snap.exists ? snap.data() : null);
        if (next) transaction.set(reference, next);
        return result;
      }),
    },
  };
}
