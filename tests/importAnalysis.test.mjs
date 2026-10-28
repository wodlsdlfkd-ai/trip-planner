import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { createImportHandler, normalizeAnalysis, validateImportSource } from '../server/importAnalysis.js';

test('rejects malformed, overlong, and oversized PDF input', async () => {
  await assert.rejects(() => validateImportSource({kind:'text',text:'a'.repeat(10001)}));
  await assert.rejects(() => validateImportSource({kind:'file',mimeType:'image/png',data:Buffer.from('not png').toString('base64')}));
  const pdf = await PDFDocument.create(); for(let i=0;i<11;i++) pdf.addPage();
  const data = Buffer.from(await pdf.save()).toString('base64');
  await assert.rejects(() => validateImportSource({kind:'file',mimeType:'application/pdf',data}));
});

test('untrusted analysis output normalizes uncertainty instead of guessing', () => {
  const result=normalizeAnalysis({items:[{title:'카페',date:'2026-02-30',time:'25:99',type:'bad',cost:-3,currency:'bad',paymentMethod:'bad'}]});
  assert.deepEqual(result[0],{title:'카페',date:'',paymentDate:'',time:'',type:'etc',cost:null,currency:'',paymentMethod:'',memo:''});
});

test('only authenticated, code-checked and confirmed input reaches the AI service', async () => {
  let count=0;
  const services=async()=>({codeHash:createHash('sha256').update('family').digest('hex'),rateLimit:async()=>{},verifyToken:async()=>({uid:'test'})});
  const handler=createImportHandler(services,async()=>{count++;return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"items":[]}'}]}}]})};});
  const run=async(body)=>{let status, data; const res={setHeader(){},status(s){status=s;return this;},json(v){data=v;}}; await handler({method:'POST',headers:{authorization:'Bearer test',host:'test'},body},res); return {status,data};};
  const prior=process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY='test-only';
  try {
    const payload={shareCode:'family',redacted:true,source:{kind:'text',text:'가상 식당'}};
    assert.equal((await run({...payload,shareCode:'wrong'})).status,403);
    assert.equal((await run({...payload,redacted:false})).status,400);
    assert.equal(count,0);
    assert.equal((await run(payload)).status,200);
    assert.equal(count,1);
  } finally { if(prior===undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY=prior; }
});
