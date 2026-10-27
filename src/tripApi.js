export async function requestTripAction(user, shareCode, data) {
  if (!user) throw new Error('로그인이 필요합니다. 새로고침해 주세요.');
  const token = await user.getIdToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch('/api/trips', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...data, shareCode }), signal: controller.signal,
    });
    let result;
    try { result = await response.json(); } catch { throw new Error('서버 응답을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.'); }
    if (!response.ok) { const error = new Error(`${result.code || response.status}: ${result.message || '저장하지 못했습니다.'}`); error.code = result.code; throw error; }
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('서버 응답 시간이 초과되었습니다. 새로고침해 저장 결과를 확인한 뒤 다시 시도해 주세요.');
    throw error;
  } finally { clearTimeout(timeout); }
}
