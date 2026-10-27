import { createHash, timingSafeEqual } from 'node:crypto';
import { TripError, performTripAction } from './tripService.js';

export function createTripHandler(services) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ code: 'method-not-allowed', message: 'POST 요청만 지원합니다.' }); }
    try {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw new TripError(403, 'forbidden-origin', '허용되지 않은 요청입니다.');
      const body = req.body;
      if (!body || Array.isArray(body) || typeof body !== 'object' || Buffer.byteLength(JSON.stringify(body)) > 65536) throw new TripError(400, 'invalid-input', '요청 내용을 확인해 주세요.');
      const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
      if (!token) throw new TripError(401, 'unauthenticated', '로그인이 필요합니다.');
      const context = await services();
      await context.rateLimit(req);
      let identity;
      try { identity = await context.verifyToken(token); } catch { throw new TripError(401, 'unauthenticated', '로그인이 만료되었습니다. 새로고침해 주세요.'); }
      if (!identity?.uid) throw new TripError(401, 'unauthenticated', '로그인을 확인해 주세요.');
      const code = typeof body.shareCode === 'string' ? body.shareCode.trim() : '';
      const received = createHash('sha256').update(code).digest();
      const expected = Buffer.from(context.codeHash, 'hex');
      if (!code || code.length > 200 || expected.length !== received.length || !timingSafeEqual(received, expected)) throw new TripError(403, 'wrong-code', '공유 코드를 확인해 주세요.');
      const result = await performTripAction(body, code, identity.uid, context.store);
      return res.status(200).json(result);
    } catch (error) {
      if (!(error instanceof TripError)) console.error('Trip API failed:', error.code || error.name);
      return res.status(error instanceof TripError ? error.status : 500).json({ code: error instanceof TripError ? error.code : 'server-error', message: error instanceof TripError ? error.message : '저장 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' });
    }
  };
}
