import type { FastifyInstance } from 'fastify';
import { Readable } from 'node:stream';
import { z } from 'zod';
import type { config } from './config.js';
import { permitted } from './server.js';
const resourcePattern = /^[a-zA-Z0-9_-]+\.(m3u8|mp4|m4s|ts)$/;
export function safePlaylist(text: string) {
  if (!text.startsWith('#EXTM3U')) return false;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith('#') && !resourcePattern.test(trimmed)) return false;
    for (const uri of trimmed.matchAll(/URI="([^"]*)"/g))
      if (!resourcePattern.test(uri[1])) return false;
    // Reject unexpected URI syntax rather than forwarding a direct or absolute URL.
    if (trimmed.includes('URI=') && !/URI="[a-zA-Z0-9_-]+\.(m3u8|mp4|m4s|ts)"/.test(trimmed))
      return false;
  }
  return true;
}
export async function registerStreams(app: FastifyInstance, cfg: ReturnType<typeof config>) {
  let active = 0;
  app.route({
    method: ['GET', 'HEAD'],
    url: '/api/streams/:id/:file',
    config: { rateLimit: { max: 20000, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const parsed = z
        .object({ id: z.uuid(), file: z.string().regex(resourcePattern) })
        .safeParse(req.params);
      if (!parsed.success) return reply.code(404).send({ error: 'Stream tidak ditemukan' });
      const path = await permitted(parsed.data.id, req.identity);
      // Same status for unknown and forbidden resources; never leak internal stream path.
      if (!path) return reply.code(404).send({ error: 'Stream tidak ditemukan' });
      if (active >= 256)
        return reply.code(503).header('Retry-After', '2').send({ error: 'Kapasitas stream penuh' });
      const range = req.headers.range;
      if (range && !/^bytes=\d+-\d*$/.test(range))
        return reply.code(416).send({ error: 'Range tidak valid' });
      const query = z
        .object({
          _HLS_msn: z
            .string()
            .regex(/^\d{1,12}$/)
            .optional(),
          _HLS_part: z
            .string()
            .regex(/^\d{1,8}$/)
            .optional(),
          _HLS_skip: z.enum(['YES', 'v2']).optional(),
        })
        .strict()
        .safeParse(req.query);
      if (!query.success) return reply.code(400).send({ error: 'Parameter stream tidak valid' });
      const url = new URL(
        `${cfg.MEDIAMTX_HLS_URL}/${encodeURIComponent(path)}/${parsed.data.file}`,
      );
      for (const [key, value] of Object.entries(query.data))
        if (value) url.searchParams.set(key, value);
      const controller = new AbortController();
      const aborted = () => controller.abort();
      reply.raw.on('close', aborted);
      const timeout = setTimeout(aborted, 12000);
      active++;
      // Keep concurrency accounting until the downstream response actually finishes.
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        active--;
        clearTimeout(timeout);
        reply.raw.off('close', aborted);
      };
      reply.raw.once('close', finish);
      reply.raw.once('finish', finish);
      try {
        const upstream = await fetch(url, {
          method: req.method,
          redirect: 'error',
          signal: controller.signal,
          headers: range ? { Range: range } : {},
        });
        if (![200, 206].includes(upstream.status)) {
          await upstream.body?.cancel();
          return reply
            .code(upstream.status === 404 ? 404 : 502)
            .send({ error: 'Stream belum tersedia' });
        }
        reply
          .header('Cache-Control', 'private, no-store, max-age=0')
          .header('CDN-Cache-Control', 'no-store')
          .header('Surrogate-Control', 'no-store')
          .header('X-Accel-Buffering', 'no');
        reply.header('Cross-Origin-Resource-Policy', 'same-origin');
        if (parsed.data.file.endsWith('.m3u8')) {
          if (req.method === 'HEAD') {
            await upstream.body?.cancel();
            return reply.type('application/vnd.apple.mpegurl').send();
          }
          // Bound untrusted playlist data; all URIs must remain relative to authorized route.
          const chunks: Uint8Array[] = [];
          let size = 0;
          if (upstream.body)
            for await (const chunk of upstream.body) {
              size += chunk.length;
              if (size > 262144) {
                controller.abort();
                throw new Error('Playlist too large');
              }
              chunks.push(chunk);
            }
          const body = Buffer.concat(chunks).toString('utf8');
          if (!safePlaylist(body)) throw new Error('Unsafe playlist');
          return reply.type('application/vnd.apple.mpegurl').send(body);
        }
        reply.code(upstream.status);
        const type = parsed.data.file.endsWith('.ts') ? 'video/mp2t' : 'video/mp4';
        reply.type(type);
        for (const h of ['content-length', 'content-range', 'accept-ranges']) {
          const value = upstream.headers.get(h);
          if (value) reply.header(h, value);
        }
        if (req.method === 'HEAD') {
          await upstream.body?.cancel();
          return reply.send();
        }
        if (!upstream.body) throw new Error('Empty stream');
        return reply.send(
          Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream),
        );
      } catch {
        if (!reply.sent) return reply.code(502).send({ error: 'Sumber stream tidak tersedia' });
      }
    },
  });
}
