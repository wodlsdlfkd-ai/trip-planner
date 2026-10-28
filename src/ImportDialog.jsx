import React, { useRef, useState } from 'react';
import { requestTripAction } from './tripApi.js';

const categories = [['meal','식사'],['coffee','카페'],['activity','관광'],['transport','이동'],['shopping','쇼핑'],['hotel','숙소'],['flight','항공'],['money','비용'],['etc','기타']];
const dateForDay = (start, index) => { const date = new Date(`${start}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + index); return date.toISOString().slice(0,10); };
const dataUrl = file => new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.')); reader.readAsDataURL(file); });

export default function ImportDialog({ trip, tripId, user, shareCode, onClose, onSaved }) {
  const [mode,setMode] = useState('file');
  const [file,setFile] = useState(null);
  const [sourceText,setSourceText] = useState('');
  const [redacted,setRedacted] = useState(false);
  const [items,setItems] = useState(null);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const request = useRef(null);
  const edit = (index, field, value) => { request.current = null; setItems(previous => previous.map((item,i) => i === index ? {...item,[field]:value,...(['dayId','cost'].includes(field) ? {currencyConfirmed:false} : {})} : item)); };
  const analyse = async () => {
    setError('');
    if (!redacted) return setError('이름, 예약번호, 카드번호 등 개인정보를 가렸는지 확인해 주세요.');
    if (mode === 'file' && (!file || file.size > 2 * 1024 * 1024)) return setError('2MB 이하의 사진 또는 PDF를 선택해 주세요.');
    if (mode === 'text' && (!sourceText.trim() || sourceText.length > 10000)) return setError('텍스트를 1~10,000자로 입력해 주세요.');
    setBusy(true);
    try {
      const source = mode === 'text' ? {kind:'text',text:sourceText} : {kind:'file',mimeType:file.type,data:String(await dataUrl(file)).split(',')[1]};
      const token = await user.getIdToken();
      const response = await fetch('/api/import', {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({shareCode,redacted:true,source}),signal:AbortSignal.timeout(55000)});
      const result = await response.json();
      if (!response.ok) throw new Error(`${result.code || response.status}: ${result.message || '분석에 실패했습니다.'}`);
      setItems(result.items.map(item => ({...item,selected:true,dayId:trip.days.find((day,index) => dateForDay(trip.config.startDate,index) === item.date)?.id ?? '',cost:item.cost ?? '',currencyConfirmed:false,paymentMethod:item.paymentMethod || ''})));
      request.current = null;
    } catch (e) { setError(e.name === 'TimeoutError' ? '분석 시간이 초과되었습니다. 다시 시도해 주세요.' : e.message); }
    finally { setBusy(false); }
  };
  const save = async () => {
    const chosen = items.filter(item => item.selected);
    if (!chosen.length) return setError('저장할 항목을 선택해 주세요.');
    if (chosen.some(item => !item.title.trim() || item.dayId === '' || item.cost === '' || !Number.isFinite(Number(item.cost)) || Number(item.cost) < 0 || !item.currencyConfirmed || !item.paymentMethod)) return setError('선택한 항목의 이름, 날짜, 비용, 통화 확인과 결제 수단을 입력해 주세요.');
    if (!request.current) request.current = {id:crypto.randomUUID(),version:trip.updatedAt || trip.createdAt || null};
    setError(''); setBusy(true);
    try {
      const result = await requestTripAction(user,shareCode,{action:'importItems',tripId,expectedVersion:request.current.version,requestId:request.current.id,items:chosen.map(item => ({dayId:item.dayId,item:{title:item.title,time:item.time,type:item.type,cost:Number(item.cost),paymentMethod:item.paymentMethod,paymentDetail:'',memo:item.memo}}))});
      onSaved(result.imported); onClose();
    } catch (e) { if (e.code === 'conflict' || e.code === 'invalid-input' || e.code === 'forbidden') request.current = null; setError(`${e.message}${request.current ? ' 저장 여부가 불확실합니다. 내용을 바꾸지 말고 다시 저장을 눌러 확인해 주세요.' : ''}`); }
    finally { setBusy(false); }
  };
  const duplicate = item => { const day = item.dayId === 'preparation' ? trip.preparation : trip.days.find(day => day.id === item.dayId); return (day?.schedule || []).some(existing => existing.title?.trim() === item.title.trim() && Number(existing.cost) === Number(item.cost)); };
  return <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto p-4" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="mx-auto my-4 max-w-2xl rounded-xl bg-white p-5 shadow-xl space-y-4">
    <h2 id="import-title" className="text-lg font-bold">자료로 일정 추가</h2>
    <p className="text-sm text-gray-700">Google 무료 AI로 자료를 전송해 분석합니다. 입력 내용은 Google 서비스 개선에 사용될 수 있습니다. 이름, 예약번호, 카드번호 등 개인정보를 반드시 가려 주세요.</p>
    {!items ? <><div className="flex gap-3"><button type="button" aria-pressed={mode==='file'} className={`rounded-lg px-3 py-2 ${mode==='file'?'bg-blue-600 text-white':'bg-gray-100'}`} onClick={()=>setMode('file')}>사진·PDF</button><button type="button" aria-pressed={mode==='text'} className={`rounded-lg px-3 py-2 ${mode==='text'?'bg-blue-600 text-white':'bg-gray-100'}`} onClick={()=>setMode('text')}>문자·텍스트</button></div>
      {mode === 'file' ? <label className="block text-sm">사진 또는 PDF 선택 (2MB 이하, PDF 10쪽 이하)<input className="mt-2 block w-full" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setFile(e.target.files?.[0] || null)}/></label> : <label className="block text-sm">가린 문자 또는 텍스트<textarea className="mt-2 w-full rounded-lg border p-3" rows="6" maxLength={10000} value={sourceText} onChange={e=>setSourceText(e.target.value)}/></label>}
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={redacted} onChange={e=>setRedacted(e.target.checked)}/>개인정보를 가렸고 Google에 전송되는 것을 확인했습니다.</label>
      <button disabled={busy} onClick={analyse} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">{busy?'분석 중...':'자료 분석'}</button></> : <><p className="text-sm text-gray-700">인식 내용과 날짜를 확인하고 수정해 주세요. 금액이 없으면 직접 0을 입력하세요.</p>{items.length === 0 && <p>읽을 수 있는 일정이 없습니다. 다른 자료로 다시 시도해 주세요.</p>}
      <fieldset disabled={busy || Boolean(request.current)}>{items.map((item,index)=><section key={index} className="space-y-2 rounded-lg border p-3"><label className="flex gap-2 font-bold"><input type="checkbox" checked={item.selected} onChange={e=>edit(index,'selected',e.target.checked)}/>항목 {index+1} 저장</label>
        <label className="block text-sm">이름<input className="mt-1 w-full rounded border p-2" value={item.title} onChange={e=>edit(index,'title',e.target.value)}/></label>
        <div className="grid grid-cols-2 gap-2"><label className="text-sm">이용 날짜<input type="date" className="mt-1 w-full rounded border p-2" value={item.date} onChange={e=>{ const date=e.target.value; request.current=null; setItems(previous=>previous.map((row,i)=>i===index?{...row,date,dayId:trip.days.find((day,n)=>dateForDay(trip.config.startDate,n)===date)?.id ?? '',currencyConfirmed:false}:row)); }}/></label><label className="text-sm">시간<input type="time" className="mt-1 w-full rounded border p-2" value={item.time} onChange={e=>edit(index,'time',e.target.value)}/></label></div>
        {item.paymentDate && <p className="text-xs text-gray-600">자료에서 읽은 결제일: {item.paymentDate} · 이용일과 다를 수 있습니다.</p>}
        <label className="block text-sm">저장할 날짜<select className="mt-1 w-full rounded border p-2" value={String(item.dayId)} onChange={e=>{const found=trip.days.find(day=>String(day.id)===e.target.value);edit(index,'dayId',e.target.value==='preparation'?'preparation':found?.id ?? '');}}><option value="">날짜 선택</option><option value="preparation">준비 (원화)</option>{trip.days.map((day,n)=><option key={day.id} value={String(day.id)}>Day {day.dayNum} · {dateForDay(trip.config.startDate,n)}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2"><label className="text-sm">금액<input type="number" min="0" className="mt-1 w-full rounded border p-2" value={item.cost} onChange={e=>edit(index,'cost',e.target.value)}/></label><label className="text-sm">자료의 통화<input className="mt-1 w-full rounded border p-2" value={item.currency} placeholder="미확인" onChange={e=>{request.current=null;setItems(previous=>previous.map((row,i)=>i===index?{...row,currency:e.target.value.toUpperCase(),currencyConfirmed:false}:row));}}/></label></div>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={item.currencyConfirmed} onChange={e=>edit(index,'currencyConfirmed',e.target.checked)}/>금액이 선택한 위치의 단위({item.dayId==='preparation'?'원화':'여행 현지화'})와 맞는지 확인했습니다.</label>
        <div className="grid grid-cols-2 gap-2"><label className="text-sm">분류<select className="mt-1 w-full rounded border p-2" value={item.type} onChange={e=>edit(index,'type',e.target.value)}>{categories.map(([id,name])=><option value={id} key={id}>{name}</option>)}</select></label><label className="text-sm">결제 수단<select className="mt-1 w-full rounded border p-2" value={item.paymentMethod} onChange={e=>edit(index,'paymentMethod',e.target.value)}><option value="">선택</option><option value="card">카드</option><option value="cash">현금</option><option value="other">기타</option></select></label></div>
        <label className="block text-sm">메모<textarea className="mt-1 w-full rounded border p-2" rows="2" value={item.memo} onChange={e=>edit(index,'memo',e.target.value)}/></label>
        {duplicate(item) && <p className="text-sm text-amber-700">같은 이름과 금액의 항목이 있습니다. 중복인지 확인해 주세요.</p>}
      </section>)}</fieldset><button disabled={busy || !items.length} onClick={save} className="rounded-lg bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">{busy?'저장 중...':'선택 항목 저장'}</button><button disabled={busy || Boolean(request.current)} onClick={()=>{setItems(null);setError('');}} className="ml-2 rounded-lg bg-gray-100 px-4 py-2">다시 분석</button></>}
    {error && <p role="alert" className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>}<div className="flex justify-end"><button disabled={busy} onClick={onClose} className="rounded-lg bg-gray-100 px-4 py-2">닫기</button></div>
  </div></div>;
}
