import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import GithubSlugger from 'github-slugger';
import { load } from 'cheerio/slim';
import { chromium } from 'playwright-core';
import { createHighlighter } from 'shiki';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const out = path.join(root, '_site');
const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(file => file && !file.startsWith('.') && path.basename(file) !== 'AGENTS.md');
const theme = 'github-dark';
const highlighter = await createHighlighter({
  themes: [theme],
  langs: ['bash', 'typescript', 'javascript', 'sql', 'json', 'prisma', 'ini', 'dotenv',
    'dockerfile', 'yaml', 'powershell', 'http', 'toml', 'ssh-config', 'nginx'],
});
const languages = new Set(highlighter.getLoadedLanguages());
const aliases = new Map([['psql', 'sql'], ['sshconfig', 'ssh-config'], ['conf', 'ini']]);
const md = new MarkdownIt({
  html: true,
  highlight(source, label) {
    const lang = aliases.get(label) ?? label;
    if (!languages.has(lang)) return '';
    return highlighter.codeToHtml(source, { lang, theme });
  },
});
const escape = md.utils.escapeHtml;
const pages = new Map();
const targets = new Set();
const links = [];
let diagrams = 0;

function htmlPath(file) {
  return file.replace(/(^|\/)README\.md$/, '$1index.md').replace(/\.md$/, '.html');
}

async function save(file, contents) {
  await mkdir(path.join(out, path.dirname(file)), { recursive: true });
  await writeFile(path.join(out, file), contents);
  targets.add(file);
}

await save('assets/book.css', await readFile(path.join(here, 'book.css')));
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const canvas = await browser.newPage();
  await canvas.addScriptTag({ path: path.join(here, 'node_modules/mermaid/dist/mermaid.min.js') });
  await canvas.evaluate(() => mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' }));

  for (const file of files) {
    if (/\.(?:png|jpe?g|webp|gif|svg)$/i.test(file)) {
      await mkdir(path.join(out, path.dirname(file)), { recursive: true });
      await copyFile(path.join(root, file), path.join(out, file));
      targets.add(file);
      continue;
    }
    if (!file.endsWith('.md')) continue;
    const dest = htmlPath(file);
    const $ = load(md.render(await readFile(path.join(root, file), 'utf8')), {}, false);
    const slugger = new GithubSlugger();
    $('h1,h2,h3,h4,h5,h6').each((_, el) => $(el).attr('id', slugger.slug($(el).text())));
    for (const code of $('pre > code.language-mermaid').toArray()) {
      const id = 'diagram-' + ++diagrams;
      const source = $(code).text();
      const svg = await canvas.evaluate(async ({ id, source }) => {
        const rendered = await mermaid.render(id, source);
        const template = document.createElement('template');
        template.innerHTML = rendered.svg;
        const xml = new XMLSerializer().serializeToString(template.content.querySelector('svg'));
        const image = new Image();
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
        await image.decode();
        return xml;
      }, { id, source }).catch(error => { throw new Error(file + ' / ' + id, { cause: error }); });
      const asset = 'assets/' + id + '.svg';
      await save(asset, svg);
      const src = path.relative(path.dirname(dest), asset);
      $(code).parent().replaceWith('<figure><a href="' + src + '"><img src="' + src + '" alt="本节机制图，打开查看原图"></a></figure>');
    }
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(href)) return;
      const [, pathname, suffix] = href.match(/^([^?#]*)(.*)$/s);
      if (pathname.endsWith('.md')) $(el).attr('href', htmlPath(pathname) + suffix);
      else if (pathname.endsWith('/')) $(el).attr('href', pathname + 'index.html' + suffix);
    });
    $('table').wrap('<div class="table-scroll"></div>');
    const title = $('h1').first().text();
    const base = path.relative(path.dirname(dest), '.') || '.';
    const nav = `<nav aria-label="阅读导航">
      <a class="brand" href="${base}/index.html">EPP 后端开发实践</a>
      <a href="${base}/index.html#上部-开发一个后端服务">全书目录</a>
      <a href="${base}/environment-setup.html">环境配置</a>
      <a href="https://github.com/SamChowRock/EPP-Book">GitHub 仓库</a>
    </nav>`;
    const body = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
      escape(title) + '</title><link rel="stylesheet" href="' + base + '/assets/book.css"></head><body>' +
      nav + '<main class="' + (dest === 'index.html' ? 'contents' : 'reader') + '">' + $.html() + '</main></body></html>';
    const page = load(body);
    pages.set(dest, new Set(page('[id]').map((_, el) => page(el).attr('id')).get()));
    page('[href],[src]').each((_, el) => links.push([dest, page(el).attr('href') ?? page(el).attr('src')]));
    await save(dest, body);
  }
} finally {
  await browser.close();
}

const errors = [];
for (const [from, link] of links) {
  const url = new URL(link, 'https://book.invalid/' + from);
  if (url.origin !== 'https://book.invalid') continue;
  const target = decodeURIComponent(url.pathname.slice(1));
  if (!targets.has(target) || (url.hash && !pages.get(target)?.has(decodeURIComponent(url.hash.slice(1))))) {
    errors.push(from + ' → ' + link);
  }
}
if (errors.length) throw new Error('无效站内链接\n' + errors.join('\n'));
console.log(pages.size + ' pages, ' + diagrams + ' diagrams, ' + links.length + ' references checked');
