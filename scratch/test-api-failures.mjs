// Real Next route handlers with offline provider doubles. No API keys or quota used.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const state = globalThis.__chalkieApiTest = {};
const code = `
const state=globalThis.__chalkieApiTest;
export class GroqFreeLimitError extends Error { code='FREE_LIMIT_REACHED'; constructor(quota){super('All configured provider keys are unavailable.');this.quota=quota;} }
export class GroqHttpError extends Error { constructor(status,body){super('raw body: '+body);this.status=status;this.body=body;} }
export async function resolveProviderCredentials(){return state.credentials;}
export async function researchQuestion(){return {sources:[],context:'evidence'};}
export async function retrieveSessionContext(){return {sources:[],context:'evidence',indexed:true};}
export async function createLessonWithGroq(...args){state.options=args[3];return state.generate(...args);}
export async function createFollowUpWithGroq(...args){state.options=args[4];return state.generate(...args);}
export async function groqFetch(...args){state.options=args[2];return state.fetch(...args);}
`;
const mockUrl='data:text/javascript,'+encodeURIComponent(code);
registerHooks({resolve(specifier,context,next){
  if (['@/lib/groq','@/lib/groq-pool','@/lib/provider-credentials','@/lib/research','./groq-pool'].includes(specifier)) return {url:mockUrl,shortCircuit:true};
  if(specifier.startsWith('@/')) return next(pathToFileURL(path.join(root,specifier.slice(2)+'.ts')).href,context);
  if(specifier.startsWith('.') && !path.extname(specifier) && context.parentURL?.startsWith('file:')) {
    const url=new URL(specifier+'.ts',context.parentURL);
    if(existsSync(url)) return next(url.href,context);
  }
  return next(specifier,context);
}});
const {GroqFreeLimitError,GroqHttpError}=await import(mockUrl);
const {providerEventStream}=await import('../lib/provider-response.ts');
const lesson=await import('../app/api/lesson/route.ts');
const followup=await import('../app/api/follow-up/route.ts');
const speech=await import('../app/api/speech/route.ts');
const transcribe=await import('../app/api/transcribe/route.ts');
const board=JSON.parse(readFileSync(new URL('./fixtures/spatial/cache-load-balancer.json',import.meta.url),'utf8'));
function reset(){state.credentials={groqKeys:[{id:'key-a'}],source:'byok'};state.generate=async()=>board;state.fetch=async()=>Response.json({text:'Question transcript'});state.options=undefined;}
const quota={source:'byok',allUnavailable:true,degradationReason:'all_keys_exhausted',nextRetryAt:Date.now()+120000,keys:[]};
function request(body,signal){return new Request('http://localhost/api/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal});}
const lessonInput={question:'Explain cache flow',sessionId:'session-one',preferredGroqKeyId:'key-a',useWeb:false};
async function events(response){return (await response.text()).trim().split('\n\n').filter(Boolean).map(chunk=>({type:chunk.match(/^event: (.+)$/m)[1],data:JSON.parse(chunk.match(/^data: (.+)$/m)[1])}));}
function assertFailure(events,code){assert.equal(events.some(e=>['lesson','followup'].includes(e.type)),false);assert.equal(events.find(e=>e.type==='error')?.data.code,code);assert.deepEqual(events.at(-1),{type:'done',data:{ok:false}});}

test('missing credentials ends lesson stream with no demo or successful plan',async()=>{reset();state.credentials={groqKeys:[],source:'none'};let called=false;state.generate=async()=>{called=true;return board;};const e=await events(await lesson.POST(request(lessonInput)));assertFailure(e,'FREE_LIMIT_REACHED');assert.equal(e.find(e=>e.type==='error').data.quota.degradationReason,'no_keys');assert.equal(called,false);});
test('exhaustion carries earliest known retry and quota in failed SSE',async()=>{reset();state.generate=async()=>{throw new GroqFreeLimitError(quota);};const e=await events(await lesson.POST(request(lessonInput)));assertFailure(e,'FREE_LIMIT_REACHED');assert.equal(e.find(e=>e.type==='error').data.nextRetryAt,quota.nextRetryAt);assert.equal(e.find(e=>e.type==='provider_status').data.allUnavailable,true);});
test('malformed provider JSON is a typed failure, never a fabricated lesson',async()=>{reset();state.generate=async()=>{throw new SyntaxError('bad JSON with private content');};const e=await events(await lesson.POST(request(lessonInput)));assertFailure(e,'INVALID_PROVIDER_RESPONSE');assert.equal(JSON.stringify(e).includes('private content'),false);});
test('provider HTTP errors do not disclose raw bodies',async()=>{reset();state.generate=async()=>{throw new GroqHttpError(503,'secret-sentinel');};const e=await events(await lesson.POST(request(lessonInput)));assertFailure(e,'PROVIDER_ERROR');assert.equal(JSON.stringify(e).includes('secret-sentinel'),false);});
test('successful lesson forwards session, preferred key and cancellation signal',async()=>{reset();const e=await events(await lesson.POST(request(lessonInput)));assert.equal(e.find(e=>e.type==='lesson').data.mode,'live');assert.deepEqual(e.at(-1),{type:'done',data:{ok:true}});assert.equal(state.options.sessionId,'session-one');assert.equal(state.options.preferredKeyId,'key-a');assert.ok(state.options.signal instanceof AbortSignal);});
test('follow-up exhaustion leaves the original lesson untouched and ends false',async()=>{reset();state.generate=async()=>{throw new GroqFreeLimitError(quota);};const before=structuredClone(board);const e=await events(await followup.POST(request({...lessonInput,currentLesson:board})));assertFailure(e,'FREE_LIMIT_REACHED');assert.deepEqual(board,before);});
test('request cancellation cannot publish a late lesson',async()=>{reset();const controller=new AbortController();let release;state.generate=()=>new Promise(resolve=>{release=resolve;});const response=await lesson.POST(request(lessonInput,controller.signal));await Promise.resolve();controller.abort();const e=await events(response);release?.(board);assertFailure(e,'REQUEST_CANCELLED');assert.equal(state.options.signal.aborted,true);});
test('consumer stream cancellation aborts provider work',async()=>{reset();let captured;const response=providerEventStream(new Request('http://localhost'),async(_send,signal)=>{captured=signal;await new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));});await response.body.cancel();assert.equal(captured.aborted,true);});
test('bounded SSE deadline emits typed timeout even if a provider ignores abort',async()=>{const response=providerEventStream(new Request('http://localhost'),async()=>new Promise(()=>{}),5);assertFailure(await events(response),'PROVIDER_TIMEOUT');});
test('speech quota failure returns structured JSON and Retry-After',async()=>{reset();state.fetch=async()=>{throw new GroqFreeLimitError(quota);};const response=await speech.POST(request({text:'Explain the node',...lessonInput}));assert.equal(response.status,429);assert.ok(Number(response.headers.get('retry-after'))>0);const data=await response.json();assert.equal(data.nextRetryAt,quota.nextRetryAt);assert.equal(data.providerStatus.allUnavailable,true);});
test('speech rejects a JSON error body presented as successful provider output',async()=>{reset();state.fetch=async()=>Response.json({error:'invalid audio'});const response=await speech.POST(request({text:'Explain the node'}));assert.equal(response.status,502);assert.equal((await response.json()).code,'INVALID_PROVIDER_RESPONSE');});
test('transcription forwards pool hints and validates provider text',async()=>{reset();const form=new FormData();form.set('audio',new File(['sample'],'question.webm'));form.set('sessionId','voice-session');form.set('preferredGroqKeyId','key-b');const response=await transcribe.POST(new Request('http://localhost',{method:'POST',body:form}));assert.equal((await response.json()).text,'Question transcript');assert.equal(state.options.sessionId,'voice-session');assert.equal(state.options.preferredKeyId,'key-b');assert.ok(state.options.signal instanceof AbortSignal);});
test('malformed transcription and multipart requests return errors',async()=>{reset();state.fetch=async()=>Response.json({wrong:'field'});const form=new FormData();form.set('audio',new File(['sample'],'question.webm'));const response=await transcribe.POST(new Request('http://localhost',{method:'POST',body:form}));assert.equal(response.status,502);assert.equal((await response.json()).code,'INVALID_PROVIDER_RESPONSE');const invalid=await transcribe.POST(request({}));assert.equal(invalid.status,400);});

test('the real model parser rejects two malformed generations instead of inventing a scene', async t => {
  reset();
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  const realGroq = await import('../lib/groq.ts');
  let attempts = 0;
  state.fetch = async () => { attempts++; return Response.json({ choices: [{ message: { content: 'not a scene' } }] }); };
  await assert.rejects(realGroq.createLessonWithGroq('Explain the cache', '', []), error => error.code === 'INVALID_PROVIDER_RESPONSE');
  assert.equal(attempts, 2);
});

test('the real model parser rejects malformed response envelopes with a typed error', async t => {
  reset();
  t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'error', () => {});
  const realGroq = await import('../lib/groq.ts');
  state.fetch = async () => Response.json({ unexpected: 'missing choices' });
  await assert.rejects(realGroq.createLessonWithGroq('Explain the cache', '', []), error => error.code === 'INVALID_PROVIDER_RESPONSE');
});
