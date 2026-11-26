import { memo } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/core';
import java from 'highlight.js/lib/languages/java';
import kotlin from 'highlight.js/lib/languages/kotlin';
import python from 'highlight.js/lib/languages/python';
import javascript from 'highlight.js/lib/languages/javascript';
import xml from 'highlight.js/lib/languages/xml';
import cpp from 'highlight.js/lib/languages/cpp';
import c from 'highlight.js/lib/languages/c';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import CitationSticker from './CitationSticker.jsx';

// Renders an answer / lesson written in Markdown: headings, lists, tables (GFM) and highlighted code blocks.
// Raw HTML in the model's output is NOT rendered (react-markdown's default), so it can't inject markup.
// "[p. 12]" citations become little page stickers: they are rewritten to links with a "cite:" URL first,
// then the link renderer swaps those links for <CitationSticker>.

// Only the languages these subjects use (Android: Java/Kotlin/XML, AI/ML: Python, ...). highlight.js core +
// 10 languages instead of the 37-language "common" bundle (which tripled the app's JS).
for (const [name, lang] of Object.entries({ java, kotlin, python, javascript, xml, cpp, c, sql, bash, json })) {
  hljs.registerLanguage(name, lang);
}
hljs.registerAliases(['js', 'jsx'], { languageName: 'javascript' });
hljs.registerAliases(['py'], { languageName: 'python' });
hljs.registerAliases(['kt'], { languageName: 'kotlin' });
hljs.registerAliases(['html', 'android'], { languageName: 'xml' });
hljs.registerAliases(['sh', 'shell'], { languageName: 'bash' });

const CITE = /\[p\.\s*(\d+(?:\s*,\s*(?:p\.\s*)?\d+)*)\]/g;

// Code spans and fenced blocks are left alone, so "[p. 1]" inside code stays literal.
function linkCitations(text) {
  return text
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) => (i % 2 ? part : part.replace(CITE, (_, pages) => pages.match(/\d+/g).map((n) => `[p. ${n}](cite:${n})`).join(''))))
    .join('');
}

const urlTransform = (url) => (url.startsWith('cite:') ? url : defaultUrlTransform(url));

function CodeBlock({ className, children }) {
  const lang = /language-([\w+-]+)/.exec(className ?? '')?.[1]?.toLowerCase();
  const code = String(children ?? '').replace(/\n$/, '');
  if (lang && hljs.getLanguage(lang)) {
    // highlight.js escapes the code itself; the returned HTML only adds <span class="hljs-…"> around it.
    const html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
    return <code className={`hljs language-${lang}`} dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return <code className={className}>{children}</code>;
}

function Markdown({ text, citations = [] }) {
  const components = {
    a({ href, children }) {
      if (href?.startsWith('cite:')) {
        const page = Number(href.slice(5));
        return <CitationSticker page={page} sources={citations.filter((c) => c.page === page)} />;
      }
      return (
        <a href={href} target="_blank" rel="noreferrer noopener" className="underline decoration-pen underline-offset-2">
          {children}
        </a>
      );
    },
    code: CodeBlock,
    // "**Diagram to draw:** ..." gets a dashed sketch box, like a space left in the answer sheet for a figure.
    p({ node, children }) {
      const first = node?.children?.[0];
      const label = first?.tagName === 'strong' ? first.children?.[0]?.value ?? '' : '';
      if (/^diagram to draw/i.test(label)) return <p className="md-diagram">{children}</p>;
      return <p>{children}</p>;
    },
    // Tables scroll sideways on a phone instead of breaking the layout.
    table: ({ children }) => (
      <div className="my-3 overflow-x-auto">
        <table>{children}</table>
      </div>
    ),
  };

  return (
    <div className="md-answer">
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform} components={components}>
        {linkCitations(text)}
      </ReactMarkdown>
    </div>
  );
}

// Streaming re-renders on every token; memo keeps finished answers in the list from re-parsing.
export default memo(Markdown);
