import CitationSticker from './CitationSticker.jsx';

// Renders the model's answer: paragraphs, "- " / "1. " lists, **bold**, and [p. N] as citation stickers.
// Builds React elements (no innerHTML), so nothing in the answer can inject markup.

const INLINE = /(\*\*[^*]+\*\*|\[p\.\s*\d+(?:\s*,\s*p\.\s*\d+)*\])/g;

function Inline({ text, citations }) {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('[p.')) {
      // "[p. 3, p. 4]" → two stickers
      return [...part.matchAll(/\d+/g)].map(([n]) => (
        <CitationSticker key={`${i}-${n}`} page={Number(n)} sources={citations.filter((c) => c.page === Number(n))} />
      ));
    }
    return part;
  });
}

export default function AnswerText({ text, citations = [] }) {
  const blocks = [];
  for (const line of text.split('\n')) {
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    const last = blocks[blocks.length - 1];
    if (bullet) {
      if (last?.type === 'list') last.items.push(bullet[1]);
      else blocks.push({ type: 'list', ordered: /^\s*\d/.test(line), items: [bullet[1]] });
    } else if (line.trim()) {
      const heading = line.match(/^\s*#{1,4}\s+(.*)$/);
      blocks.push({ type: heading ? 'heading' : 'p', text: heading ? heading[1] : line });
    }
  }

  return (
    <div className="space-y-3 leading-relaxed">
      {blocks.map((b, i) => {
        if (b.type === 'list') {
          const List = b.ordered ? 'ol' : 'ul';
          return (
            <List key={i} className={`space-y-1.5 pl-5 ${b.ordered ? 'list-decimal' : 'list-disc marker:text-pen'}`}>
              {b.items.map((item, j) => (
                <li key={j}><Inline text={item} citations={citations} /></li>
              ))}
            </List>
          );
        }
        if (b.type === 'heading') {
          return <p key={i} className="font-serif text-lg font-semibold"><Inline text={b.text} citations={citations} /></p>;
        }
        return <p key={i}><Inline text={b.text} citations={citations} /></p>;
      })}
    </div>
  );
}
