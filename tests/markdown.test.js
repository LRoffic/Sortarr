import { describe, it, expect } from 'vitest';
import { markdownToHtml } from '../src/lib/markdown.js';

describe('markdownToHtml', () => {
  it('handles empty or non-string input safely', () => {
    expect(markdownToHtml('')).toBe('');
    expect(markdownToHtml(null)).toBe('');
    expect(markdownToHtml(undefined)).toBe('');
    expect(markdownToHtml(123)).toBe('');
  });

  it('escapes raw HTML tags to prevent XSS injection', () => {
    const res = markdownToHtml('<script>alert("xss")</script>');
    expect(res).not.toContain('<script>');
    expect(res).toContain('&lt;script&gt;');
  });

  it('renders headers correctly (h1 to h4)', () => {
    const md = '# Titre 1\n## Titre 2\n### Titre 3\n#### Titre 4';
    const html = markdownToHtml(md);
    expect(html).toContain('<h1');
    expect(html).toContain('Titre 1');
    expect(html).toContain('<h2');
    expect(html).toContain('Titre 2');
    expect(html).toContain('<h3');
    expect(html).toContain('Titre 3');
    expect(html).toContain('<h4');
    expect(html).toContain('Titre 4');
  });

  it('formats bold, italic, bold+italic and strikethrough', () => {
    const md = 'Texte **gras** et *italique* ainsi que ***gras-italique*** et ~~barré~~.';
    const html = markdownToHtml(md);
    expect(html).toContain('<strong class="font-bold" style="color: #f1f5f9;">gras</strong>');
    expect(html).toContain('<em class="italic opacity-90">italique</em>');
    expect(html).toContain('<strong class="font-bold"><em>gras-italique</em></strong>');
    expect(html).toContain('<del class="line-through opacity-70">barré</del>');
  });

  it('formats inline code', () => {
    const md = 'Utiliser `npm run test` pour tester.';
    const html = markdownToHtml(md);
    expect(html).toContain('<code class="px-1.5 py-0.5 rounded text-[11px] font-mono"');
    expect(html).toContain('npm run test');
  });

  it('formats fenced code blocks', () => {
    const md = '```javascript\nconst a = 1;\nconsole.log(a);\n```';
    const html = markdownToHtml(md);
    expect(html).toContain('<pre class="p-3 my-2 rounded-lg font-mono text-[11px] overflow-x-auto"');
    expect(html).toContain('const a = 1;');
    expect(html).toContain('console.log(a);');
  });

  it('formats external links with target="_blank" and rel="noopener noreferrer"', () => {
    const md = 'Voir sur [GitHub](https://github.com/LRoffic/Sortarr)';
    const html = markdownToHtml(md);
    expect(html).toContain('href="https://github.com/LRoffic/Sortarr"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('GitHub ↗');
  });

  it('formats bullet lists (ul)', () => {
    const md = '- Premier élément\n- Deuxième élément\n* Troisième élément';
    const html = markdownToHtml(md);
    expect(html).toContain('class="list-disc');
    expect(html).toContain('Premier élément</li>');
    expect(html).toContain('Deuxième élément</li>');
    expect(html).toContain('Troisième élément</li>');
    expect(html).toContain('</ul>');
  });

  it('formats ordered lists (ol)', () => {
    const md = '1. Étape 1\n2. Étape 2';
    const html = markdownToHtml(md);
    expect(html).toContain('class="list-decimal');
    expect(html).toContain('<li>Étape 1</li>');
    expect(html).toContain('<li>Étape 2</li>');
    expect(html).toContain('</ol>');
  });

  it('renders horizontal rules', () => {
    const md = 'Paragraphe 1\n\n---\n\nParagraphe 2';
    const html = markdownToHtml(md);
    expect(html).toContain('<hr class="my-3"');
  });

  it('renders blockquotes', () => {
    const md = '> Ceci est une citation importante.';
    const html = markdownToHtml(md);
    expect(html).toContain('<blockquote class="pl-3 py-1 my-1.5 border-l-2');
    expect(html).toContain('Ceci est une citation importante.');
  });
});
