// Run after pnpm build. Measures client-reference entry dependencies, not browser transfer/LCP.
import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';

for (const route of ['trips', 'trips/[id]', 'trips/[id]/album', 'trips/[id]/expenses']) {
  const path = `.next/server/app/(app)/${route}/page_client-reference-manifest.js`;
  if (!existsSync(path)) throw new Error(`Build first: missing ${path}`);
  const context = {};
  runInNewContext(readFileSync(path, 'utf8'), context);
  const manifest = Object.values(context.__RSC_MANIFEST)[0];
  for (const suffix of ['components/layout/AppShell.tsx', `app/(app)/${route}/page.tsx`]) {
    const entry = Object.entries(manifest.clientModules).find(([key]) => key.endsWith(suffix));
    if (!entry) throw new Error(`Missing client entry: ${suffix}`);
    const files = [...new Set(entry[1].chunks.filter((file) => file.endsWith('.js')))];
    const sizes = files.map((file) => readFileSync(`.next/${decodeURIComponent(file)}`));
    console.log(JSON.stringify({ route, entry: suffix, chunks: files.length,
      bytes: sizes.reduce((sum, buffer) => sum + buffer.length, 0),
      gzipBytes: sizes.reduce((sum, buffer) => sum + gzipSync(buffer).length, 0) }));
  }
}
