// Loopback-only QA adapter for the BUILT Worker. Never deployed.
// Production identity is supplied and verified by Sites, not by this script.
import http from 'node:http';
const target = 'http://127.0.0.1:8787';
http.createServer(async (req, res) => {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) if (value && !['host', 'connection', 'content-length', 'transfer-encoding', 'accept-encoding'].includes(name)) headers.set(name, String(value));
    headers.set('oai-authenticated-user-id', 'local-shongjog-preview');
    headers.set('oai-authenticated-user-email', 'preview@sites.test');
    if (headers.get('origin') === 'http://127.0.0.1:4173') headers.set('origin', target);
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const upstream = await fetch(target + req.url, { method: req.method, headers, redirect: 'manual', ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
    res.writeHead(upstream.status, Object.fromEntries([...upstream.headers].filter(([name]) => !['content-encoding', 'transfer-encoding', 'content-length'].includes(name))));
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (e) { res.writeHead(502, { 'Content-Type': 'text/plain' }); res.end('Local Worker is not ready. ' + e.message); }
}).listen(4173, '127.0.0.1', () => console.log('Shongjog local QA preview: http://127.0.0.1:4173 (local simulated identity; never deployed)'));
