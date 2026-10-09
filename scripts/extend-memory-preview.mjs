import { readFile, writeFile } from 'node:fs/promises';
const path = 'docs/previews/show-me-settings.html';
let html = await readFile(path, 'utf8');
const js = await readFile('docs/previews/memory-preview.js', 'utf8');
const css = await readFile('docs/previews/memory-preview.css', 'utf8');
// Replace the generated region when refining the demo; the deliverable stays standalone.
html = html.replace(/<style id="memory-demo-style">[\s\S]*?<\/style>/, '').replace(/<script id="memory-demo-script">[\s\S]*?<\/script>/, '');
html = html.replace('</head>', '<style id="memory-demo-style">' + css + '</style></head>');
html = html.replace('</body>', '<script id="memory-demo-script">' + js + '</script></body>');
await writeFile(path, html);
