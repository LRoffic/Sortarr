/**
 * Convertisseur Markdown vers HTML sécurisé et stylisé pour Sortarr.
 * Gère les titres, listes, code blocks, citations, badges, liens et formatage de texte.
 */

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function markdownToHtml(md) {
  if (!md || typeof md !== 'string') return '';

  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inCodeBlock = false;
  let codeBlockLang = '';
  let codeBlockLines = [];
  let inUl = false;
  let inOl = false;

  function closeLists() {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  }

  function formatInline(text) {
    let t = escapeHtml(text);

    // Code inline `code`
    t = t.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded text-[11px] font-mono" style="background: #1e293b; color: #a78bfa; border: 1px solid #334155;">$1</code>');

    // Bold + Italic ***text***
    t = t.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong class="font-bold"><em>$1</em></strong>');

    // Bold **text** ou __text__
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold" style="color: #f1f5f9;">$1</strong>');
    t = t.replace(/__([^_]+)__/g, '<strong class="font-bold" style="color: #f1f5f9;">$1</strong>');

    // Italic *text* ou _text_
    t = t.replace(/\*([^*]+)\*/g, '<em class="italic opacity-90">$1</em>');
    t = t.replace(/_([^_]+)_/g, '<em class="italic opacity-90">$1</em>');

    // Strikethrough ~~text~~
    t = t.replace(/~~([^~]+)~~/g, '<del class="line-through opacity-70">$1</del>');

    // Liens [texte](url)
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="underline hover:opacity-80" style="color: #a78bfa;">$1 ↗</a>');

    return t;
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    // Fenced Code block
    const codeMatch = rawLine.match(/^```(\w+)?/);
    if (codeMatch) {
      if (inCodeBlock) {
        // Fin de code block
        const codeContent = escapeHtml(codeBlockLines.join('\n'));
        out.push(`<pre class="p-3 my-2 rounded-lg font-mono text-[11px] overflow-x-auto" style="background: #090d16; color: #cbd5e1; border: 1px solid #1e293b;"><code>${codeContent}</code></pre>`);
        inCodeBlock = false;
        codeBlockLines = [];
        codeBlockLang = '';
      } else {
        closeLists();
        inCodeBlock = true;
        codeBlockLang = codeMatch[1] || '';
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    const trimmed = rawLine.trim();

    // Ligne vide
    if (!trimmed) {
      closeLists();
      continue;
    }

    // Séparateur horizontal
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      closeLists();
      out.push('<hr class="my-3" style="border: 0; border-top: 1px solid var(--border);" />');
      continue;
    }

    // Titres #, ##, ###, ####
    const headerMatch = rawLine.match(/^(#{1,6})\s+(.*)$/);
    if (headerMatch) {
      closeLists();
      const level = headerMatch[1].length;
      const title = formatInline(headerMatch[2]);
      if (level === 1) {
        out.push(`<h1 class="text-base font-bold my-2 pb-1 border-b" style="color: #f8fafc; border-color: var(--border);">${title}</h1>`);
      } else if (level === 2) {
        out.push(`<h2 class="text-sm font-bold my-2" style="color: #f1f5f9;">${title}</h2>`);
      } else if (level === 3) {
        out.push(`<h3 class="text-xs font-semibold my-1.5" style="color: #cbd5e1;">${title}</h3>`);
      } else {
        out.push(`<h4 class="text-xs font-semibold my-1" style="color: #94a3b8;">${title}</h4>`);
      }
      continue;
    }

    // Citations / Alertes blockquote >
    const quoteMatch = rawLine.match(/^>\s*(.*)$/);
    if (quoteMatch) {
      closeLists();
      const qContent = formatInline(quoteMatch[1]);
      out.push(`<blockquote class="pl-3 py-1 my-1.5 border-l-2 text-xs italic" style="border-color: #a78bfa; color: #cbd5e1; background: #7c3aed11;">${qContent}</blockquote>`);
      continue;
    }

    // Liste non ordonnée (* ou -)
    const ulMatch = rawLine.match(/^(\s*)([-*+])\s+(.*)$/);
    if (ulMatch) {
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul class="list-disc pl-5 my-1.5 space-y-1 text-xs" style="color: #cbd5e1;">');
        inUl = true;
      }
      const indent = ulMatch[1].length;
      const content = formatInline(ulMatch[3]);
      out.push(`<li style="${indent >= 2 ? 'margin-left: 1rem;' : ''}">${content}</li>`);
      continue;
    }

    // Liste ordonnée (1.)
    const olMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol class="list-decimal pl-5 my-1.5 space-y-1 text-xs" style="color: #cbd5e1;">');
        inOl = true;
      }
      const content = formatInline(olMatch[3]);
      out.push(`<li>${content}</li>`);
      continue;
    }

    // Paragraphe classique
    closeLists();
    out.push(`<p class="my-1.5 leading-relaxed text-xs" style="color: #cbd5e1;">${formatInline(trimmed)}</p>`);
  }

  closeLists();
  if (inCodeBlock && codeBlockLines.length > 0) {
    const codeContent = escapeHtml(codeBlockLines.join('\n'));
    out.push(`<pre class="p-3 my-2 rounded-lg font-mono text-[11px] overflow-x-auto" style="background: #090d16; color: #cbd5e1; border: 1px solid #1e293b;"><code>${codeContent}</code></pre>`);
  }

  return out.join('\n');
}
