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

const githubMark = (await readFile(path.join(here, 'github-mark.svg'), 'utf8')).trim();
const iconPaths = {
  contents: '<path d="M8 5h12M8 12h12M8 19h12"/><circle cx="4" cy="5" r=".7"/><circle cx="4" cy="12" r=".7"/><circle cx="4" cy="19" r=".7"/>',
  settings: '<path d="M3 7h3m6 0h9M3 17h9m6 0h3"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  theme: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none"/>',
};

function icon(name) {
  return `<svg class="nav-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${iconPaths[name]}</svg>`;
}

function htmlPath(file) {
  return file.replace(/(^|\/)README\.md$/, '$1index.md').replace(/\.md$/, '.html');
}

async function save(file, contents) {
  await mkdir(path.join(out, path.dirname(file)), { recursive: true });
  await writeFile(path.join(out, file), contents);
  targets.add(file);
}

function homeContent($) {
  const title = $('h1').first();
  const firstParagraph = title.next('p');
  const firstChapter = $('h4 a').first().attr('href');
  const intro = title.nextUntil('h2').filter('p').slice(1);
  const hero = $('<header class="overview"><div class="overview-copy"></div></header>');
  title.before(hero);
  hero.find('.overview-copy').append(title, firstParagraph).append(
    `<a class="start" href="${escape(firstChapter)}">从第一章开始 <span aria-hidden="true">→</span></a>`
  );
  const quickLinks = $('h2').toArray().map(el =>
    `<a href="#${escape(encodeURIComponent($(el).attr('id')))}">${escape($(el).text())}<span aria-hidden="true">↘</span></a>`
  ).join('');
  hero.append(`<div class="overview-index"><strong>本页索引</strong>${quickLinks}</div>`);
  const guide = $('<details class="intro"><summary>第一次跟做？查看阅读说明</summary></details>');
  hero.after(guide);
  guide.append(intro);
  for (const el of $('h3').toArray()) {
    const heading = $(el);
    const chapters = heading.nextUntil('h2,h3').filter('h4');
    if (!chapters.length) continue;
    const section = $('<section class="part"></section>');
    heading.before(section);
    section.append(heading);
    const list = $('<div class="chapter-list"></div>').appendTo(section);
    for (const chapter of chapters.toArray()) {
      const row = $(chapter);
      const label = row.find('a').length ? row.find('a').first() : row;
      const match = label.text().match(/^第\s*(\d+)\s*章\s*(.+)$/);
      if (match) label.html(`<span class="chapter-num">第 ${match[1]} 章</span><span>${escape(match[2])}</span>`);
      list.append(row);
    }
  }
  return `<main class="contents">${$.html()}</main>`;
}

function readerContent($) {
  const sections = $('h2').toArray().map(el =>
    `<a href="#${escape(encodeURIComponent($(el).attr('id')))}">${escape($(el).text())}</a>`
  ).join('');
  const rail = sections ? `<aside><details class="mobile-index"><summary>本页目录</summary>${sections}</details>
    <div class="desktop-index"><strong>本页目录</strong>${sections}</div></aside>` : '';
  return `<main class="reader">${rail}<article>${$.html()}</article></main>`;
}

await save('assets/book.css', await readFile(path.join(here, 'book.css')));
await save('assets/theme.js', await readFile(path.join(here, 'theme.js')));
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
    const nav = `<nav aria-label="阅读导航"><div class="bar">
      <a class="brand" href="${base}/index.html">后端开发实践</a>
      <a href="${base}/index.html#上部-开发一个后端服务">${icon('contents')}全书目录</a>
      <a href="${base}/environment-setup.html">${icon('settings')}环境配置</a>
      <a href="https://github.com/SamChowRock/EPP-Book">${githubMark}GitHub 仓库</a>
      <label class="theme-control" hidden>${icon('theme')}
        <select class="theme-select" aria-label="页面主题" title="页面主题">
        <option value="system">跟随系统</option><option value="light">浅色模式</option><option value="dark">深色模式</option>
        </select>
      </label>
    </div></nav>`;
    const body = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
      escape(title) + '</title><script src="' + base + '/assets/theme.js"></script><link rel="stylesheet" href="' + base + '/assets/book.css"></head><body>' +
      nav + (dest === 'index.html' ? homeContent($) : readerContent($)) + '</body></html>';
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
