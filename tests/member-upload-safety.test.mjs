import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { checkImageUpload, decodeImageDataUrl, sniffImageType, UploadRefused } from '../app/image-signature.ts';

/* ---- Files, built byte by byte so each property is tested against a real one. ---- */
const png = (width, height, trailing = 64) => {
  const bytes = new Uint8Array(33 + trailing);
  bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a], 0);
  bytes.set([0,0,0,13,0x49,0x48,0x44,0x52], 8);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
};
const jpeg = (width, height) => {
  const bytes = new Uint8Array(48);
  bytes.set([0xff,0xd8,0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0], 0);
  bytes.set([0xff,0xc0,0,17,8], 20);
  new DataView(bytes.buffer).setUint16(25, height);
  new DataView(bytes.buffer).setUint16(27, width);
  return bytes;
};
const bytesOf = text => new TextEncoder().encode(text);
const svg = bytesOf('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>x()</script></svg>');
const html = bytesOf('<!doctype html><html><body><script>alert(document.cookie)</script></body></html>');
const gif = (() => { const b = new Uint8Array(16); b.set([0x47,0x49,0x46,0x38,0x39,0x61,10,0,10,0],0); return b; })();

/* ---- The properties, on the shared decision the handlers call. ---- */

test('a file is judged by its bytes, not by the type the sender declared', () => {
  // Every one of these would arrive as multipart with Content-Type: image/png.
  for (const [name, bytes] of [['an SVG', svg], ['an HTML page', html], ['a GIF', gif]])
    assert.throws(() => checkImageUpload(bytes), UploadRefused, `${name} declared as PNG was accepted`);
  assert.equal(checkImageUpload(png(800, 600)).type, 'image/png');
});

test('SVG is refused by name, so the refusal is deliberate rather than incidental', () => {
  assert.equal(sniffImageType(svg), 'image/svg+xml');
  assert.throws(() => checkImageUpload(svg), /SVG files are not accepted/);
  // XML-declared SVG takes the same path.
  assert.throws(() => checkImageUpload(bytesOf('<?xml version="1.0"?><svg/>')), /SVG/);
});

test('permitted formats are the three the product can actually process', () => {
  assert.equal(checkImageUpload(png(10, 10)).type, 'image/png');
  assert.equal(checkImageUpload(jpeg(10, 10)).type, 'image/jpeg');
  assert.throws(() => checkImageUpload(gif), /Choose PNG, JPG or WEBP/);
  // A route may narrow further; the mask route takes PNG only.
  assert.throws(() => checkImageUpload(jpeg(10, 10), { allow: ['image/png'] }), /JPEG file/);
});

test('empty and near-empty files are refused before anything tries to read them', () => {
  assert.throws(() => checkImageUpload(new Uint8Array(0)), /empty/);
  assert.throws(() => checkImageUpload(new Uint8Array(4)), /not an image we recognise/);
  assert.throws(() => checkImageUpload(new Uint8Array(11)), /not an image we recognise/);
});

test('a truncated file is refused rather than stored as a broken image', () => {
  const short = png(800, 600).slice(0, 18);   // signature present, dimensions cut off
  assert.throws(() => checkImageUpload(short), UploadRefused);
  // Long enough to be recognised as a JPEG, cut off before the frame header.
  const headerless = jpeg(100, 100).slice(0, 20);
  assert.equal(sniffImageType(headerless), 'image/jpeg', 'fixture must still sniff as JPEG');
  assert.throws(() => checkImageUpload(headerless), /damaged or incomplete/);
  // And a file too short to identify at all is refused on its own terms.
  assert.throws(() => checkImageUpload(jpeg(100, 100).slice(0, 10)), /not an image we recognise/);
});

test('a decompression bomb is refused on pixel count, which the byte cap cannot see', () => {
  const bomb = png(50_000, 50_000);
  assert.ok(bomb.length < 1000, 'the bomb must be small, or the size cap would catch it anyway');
  assert.throws(() => checkImageUpload(bomb), /Each side must be under/);
  // Under the edge cap but over the total-pixel budget.
  const wide = png(19_000, 19_000);
  assert.throws(() => checkImageUpload(wide), /too many pixels/);
  // A zero dimension is not a valid image either.
  assert.throws(() => checkImageUpload(png(0, 600)), /damaged or incomplete/);
});

test('raw byte ceilings hold and are stated in the refusal', () => {
  const big = new Uint8Array(9_000_000); big.set(png(10, 10), 0);
  assert.throws(() => checkImageUpload(big, { maxBytes: 8_000_000 }), /larger than 8 MB/);
  assert.doesNotThrow(() => checkImageUpload(big, { maxBytes: 20 * 1024 * 1024 }));
});

/* ---- The real handlers. ---- */

// Compile the route itself and replace only its infrastructure, so the logic
// under test is the deployed logic rather than a restatement of it.
async function loadRoute(path, preamble) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const stripped = source.replace(/^import .*;\n/gm, '');
  const compiled = ts.transpileModule(stripped, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  const shared = `
    const NextResponse={json:(body,init)=>Response.json(body,init)};
    const withErrorLog=(area,handler)=>handler;
    const { checkImageUpload, UploadRefused } = await import(${JSON.stringify(new URL('../app/image-signature.ts', import.meta.url).href)});
  `;
  return import('data:text/javascript;base64,'
    + Buffer.from(shared + preamble + compiled).toString('base64'));
}

const upload = (bytes, { name = 'art.png', type = 'image/png' } = {}) =>
  new File([bytes], name, { type });

test('the Etsy image route stores nothing when a file fails the check', async () => {
  const puts = [];
  const route = await loadRoute('app/api/etsy/images/route.ts', `
    const env={ARTWORK:{put:async(key,body,options)=>{globalThis.__puts.push({key,options});},get:async()=>null,delete:async()=>{},list:async()=>({objects:[]})},
      DB:{prepare:sql=>({bind:(...values)=>{globalThis.__bound.push(values);return{first:async()=>({1:1})}}})}};
    const getChatGPTUser=async()=>({userId:'member-1',email:'m@example.com'});
    const customerLaunchBlock=async()=>null;
    const requireEntitlement=async()=>null;
    const crossSiteWrite=()=>false;
  `);
  globalThis.__puts = puts; globalThis.__bound = [];

  const send = async files => {
    const form = new FormData();
    form.set('productId', 'p1');
    for (const file of files) form.append('file', file);
    return route.POST(new Request('https://example.com/api/etsy/images', { method: 'POST', body: form }));
  };

  // A disguised SVG is refused, and nothing reaches storage.
  const refused = await send([upload(svg)]);
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).error, /SVG/);
  assert.equal(puts.length, 0, 'a refused upload reached R2');

  // A bad file alongside a good one refuses the whole batch, leaving no partial write.
  puts.length = 0;
  const mixed = await send([upload(png(100, 100)), upload(html, { name: 'x.png' })]);
  assert.equal(mixed.status, 400);
  assert.equal(puts.length, 0, 'the valid file in a refused batch was stored anyway');

  // A real PNG is stored, under the member's own prefix, with its verified type.
  puts.length = 0;
  const accepted = await send([upload(png(1200, 1200))]);
  assert.equal(accepted.status, 200);
  assert.equal(puts.length, 1);
  assert.ok(puts[0].key.includes('member-1'), `key is not member-scoped: ${puts[0].key}`);
  assert.equal(puts[0].options.httpMetadata.contentType, 'image/png');
  // The draft-ownership lookup is bound to the signed-in member, not to input.
  assert.ok(globalThis.__bound.every(values => values[0] === 'member-1'),
    'a draft ownership check was not scoped to the caller');
});

test('the Etsy image route neutralises hostile filenames', async () => {
  const puts = [];
  const route = await loadRoute('app/api/etsy/images/route.ts', `
    const env={ARTWORK:{put:async(key,body,options)=>{globalThis.__puts.push({key,options});},get:async()=>null,delete:async()=>{},list:async()=>({objects:[]})},
      DB:{prepare:sql=>({bind:(...values)=>{globalThis.__bound.push(values);return{first:async()=>({1:1})}}})}};
    const getChatGPTUser=async()=>({userId:'member-1',email:'m@example.com'});
    const customerLaunchBlock=async()=>null;
    const requireEntitlement=async()=>null;
    const crossSiteWrite=()=>false;
  `);
  globalThis.__puts = puts; globalThis.__bound = [];
  const form = new FormData();
  form.set('productId', 'p1');
  form.append('file', upload(png(50, 50), { name: '../../../etsy/order.json"; rm -rf /\n.png' }));
  const response = await route.POST(new Request('https://example.com/', { method: 'POST', body: form }));
  assert.equal(response.status, 200);

  const { key, options } = puts[0];
  // Traversal needs a separator; the two dots alone are inert in an R2 key.
  assert.equal(key.slice(key.indexOf('mockup/') + 7).includes('/'), false,
    `a path separator survived into the stored name: ${key}`);
  assert.ok(!key.includes('"') && !/[\r\n]/.test(key), `key carries quote or newline: ${key}`);
  assert.ok(!key.endsWith('order.json'), 'a filename could impersonate the ordering manifest');
  // Named exactly, it must still not land on the reserved suffix.
  puts.length = 0;
  const reserved = new FormData();
  reserved.set('productId', 'p1');
  reserved.append('file', upload(png(50, 50), { name: 'order.json' }));
  await route.POST(new Request('https://example.com/', { method: 'POST', body: reserved }));
  assert.equal(puts.length, 1);
  assert.ok(!puts[0].key.endsWith('order.json'),
    `an uploaded file became unreachable through GET and DELETE: ${puts[0].key}`);
  // The stored name is what a Content-Disposition would later carry.
  assert.doesNotMatch(options.customMetadata.name, /[\r\n";\\/]/);
});

test('the mask route refuses a non-PNG instead of labelling it image/png', async () => {
  const puts = [];
  globalThis.__puts = puts;
  const route = await loadRoute('app/api/mockups/library/[id]/occlusion/route.ts', `
    const env={ARTWORK:{put:async(key,body,options)=>{globalThis.__puts.push({key,options});}}};
    const getChatGPTUser=async()=>({userId:'member-1',email:'m@example.com'});
    const ensureMockupStorage=async()=>{};
    const and=(...parts)=>parts; const eq=(a,b)=>[a,b];
    const mockupTemplates={id:'id',userId:'userId'};
    const getDb=()=>({update:()=>({set:()=>({where:async()=>{}})}),
      select:()=>({from:()=>({where:()=>({limit:async()=>[{id:'m1',userId:'member-1',occlusionKey:null,preparationJson:null}],
        get:async()=>({id:'m1',userId:'member-1'})})})})});
  `);

  const send = async file => {
    const form = new FormData();
    form.append('mask', file);
    return route.PUT(new Request('https://example.com/', { method: 'PUT', body: form }),
      { params: Promise.resolve({ id: 'm1' }) });
  };

  // A JPEG renamed .png was previously stored and labelled image/png.
  const refused = await send(upload(jpeg(100, 100), { name: 'mask.png' }));
  assert.equal(refused.status, 400, 'a JPEG was accepted as a PNG mask');
  assert.equal(puts.length, 0, 'a refused mask reached R2');

  // So was anything else, including markup.
  assert.equal((await send(upload(svg, { name: 'mask.png' }))).status, 400);
  assert.equal(puts.length, 0);

  // A real PNG mask is stored, member-scoped, with its verified type.
  const accepted = await send(upload(png(512, 512), { name: 'mask.png' }));
  assert.equal(accepted.status, 200);
  assert.equal(puts.length, 1);
  assert.ok(puts[0].key.includes('member-1'), `key is not member-scoped: ${puts[0].key}`);
  assert.equal(puts[0].options.httpMetadata.contentType, 'image/png');
});

const dataUrl = (bytes, type = 'image/png') =>
  `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;

test('an inline image must be an image, not some other address to fetch', () => {
  // The value is forwarded to the vision provider as an image URL, so a
  // non-data URL would have the provider fetch an address the member chose.
  for (const hostile of [
    'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
    'http://localhost:8080/admin',
    'https://attacker.example/collect?q=1',
    'file:///etc/passwd',
    'data:text/html;base64,' + Buffer.from('<script>x</script>').toString('base64'),
  ]) assert.throws(() => decodeImageDataUrl(hostile), UploadRefused, `forwarded: ${hostile}`);

  const real = decodeImageDataUrl(dataUrl(png(900, 900)));
  assert.equal(real.type, 'image/png');
  assert.equal(real.width, 900);
});

test('an inline image is held to the same standard as an uploaded file', () => {
  // Declared image/png, actually markup.
  assert.throws(() => decodeImageDataUrl(dataUrl(svg)), /SVG/);
  assert.throws(() => decodeImageDataUrl(dataUrl(html)), UploadRefused);
  // A bomb sent inline is refused on pixels, like one sent as a file.
  assert.throws(() => decodeImageDataUrl(dataUrl(png(50_000, 50_000))), /Each side must be under/);
  // Malformed base64 is an answer, not a crash.
  assert.throws(() => decodeImageDataUrl('data:image/png;base64,!!!!not base64!!!!'), UploadRefused);
  assert.throws(() => decodeImageDataUrl('data:image/png;base64,'), UploadRefused);
});

test('the support screenshot is verified before it leaves for the provider', async () => {
  const sent = [];
  globalThis.__sent = sent;
  const route = await loadRoute('app/api/support/route.ts', `
    const getChatGPTUser=async()=>({userId:'member-1',email:'m@example.com'});
    const crossSiteWrite=()=>false;
    const customerLaunchBlock=async()=>null;
    const runtime=()=>({});
    process.env.WEB3FORMS_ACCESS_KEY='test-key';
    const originalFetch=globalThis.fetch;
    globalThis.fetch=async(url,init)=>{globalThis.__sent.push({url:String(url)});return Response.json({success:true},{status:200})};
  `).catch(error => ({ error }));
  assert.ok(!route.error, `the support route did not load, so nothing was proven: ${route.error}`);

  const send = async file => {
    const form = new FormData();
    form.set('message', 'Something is wrong with my listing.');
    form.set('email', 'm@example.com');
    if (file) form.append('attachment', file);
    try { return await route.POST(new Request('https://example.com/', { method: 'POST', body: form })); }
    catch (error) { globalThis.__why = error; return null; }
  };

  const refused = await send(upload(html, { name: 'shot.png' }));
  assert.ok(refused, `the support route threw rather than answering: ${globalThis.__why && globalThis.__why.message}`);
  assert.equal(refused.status, 400, 'an HTML file declared image/png was accepted as a screenshot');
  assert.equal(sent.length, 0, 'a refused screenshot was forwarded to the support provider');

  // A real screenshot still goes through.
  const accepted = await send(upload(png(1440, 900), { name: 'shot.png' }));
  assert.ok(accepted && accepted.status < 400, `a valid screenshot was refused: ${accepted && accepted.status}`);
});
