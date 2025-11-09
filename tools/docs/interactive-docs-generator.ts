import * as fs from 'fs';
import * as path from 'path';

// Small generator script to ensure docs/interactive index exists and lists pages
const root = path.resolve(__dirname, '..', '..', 'docs', 'interactive');
const indexPath = path.join(root, 'index.html');

const pages = [
  { path: 'swagger-ui.html', title: 'Swagger UI' },
  { path: 'graphql-playground.html', title: 'GraphQL Playground' },
  { path: 'api-tester.html', title: 'API Tester' },
  { path: 'contract-explorer.html', title: 'Contract Explorer' },
  { path: 'code-examples/index.html', title: 'Code Examples' },
];

function ensureDir(d: string){ if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); }

function generateIndex(){
  ensureDir(root);
  const links = pages.map(p => `      <li><a href="${p.path}">${p.title}</a></li>`).join('\n');
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Interactive Docs — Galaxy DevKit</title>
<style>body{font-family:system-ui,Segoe UI,Roboto,Arial;margin:0}header{background:#0f172a;color:#fff;padding:12px}main{padding:12px}</style>
</head>
<body>
  <header><strong>Galaxy DevKit — Interactive Documentation</strong></header>
  <main>
    <p>Open any of the interactive tools below to explore the APIs and examples.</p>
    <ul>
${links}
    </ul>
  </main>
</body>
</html>`;
  fs.writeFileSync(indexPath, html, 'utf8');
  console.log('Generated', indexPath);
}

generateIndex();

// Usage: npx ts-node tools/docs/interactive-docs-generator.ts
