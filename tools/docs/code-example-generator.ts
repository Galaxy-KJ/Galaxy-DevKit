import * as fs from 'fs';
import * as path from 'path';

// Simple script to scaffold code-examples folder with a couple of examples
const examplesDir = path.resolve(__dirname, '..', '..', 'docs', 'interactive', 'code-examples');
function ensureDir(d:string){ if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

ensureDir(examplesDir);

const files: { name: string, content: string }[] = [
  {
    name: 'js-example.html',
    content: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JS Example</title></head><body><pre>See docs/interactive/code-examples/js-example.html in repo (generated)</pre></body></html>`
  },
  {
    name: 'ts-example.html',
    content: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TS Example</title></head><body><pre>See docs/interactive/code-examples/ts-example.html in repo (generated)</pre></body></html>`
  }
];

for (const f of files){
  const p = path.join(examplesDir, f.name);
  if (!fs.existsSync(p)) fs.writeFileSync(p, f.content, 'utf8');
  console.log('Ensured', p);
}

// Usage: npx ts-node tools/docs/code-example-generator.ts
