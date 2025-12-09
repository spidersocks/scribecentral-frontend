import React from 'react';

export const HighlightedText = React.memo(({ text, entities }) => {
  if (!text || !entities || entities.length === 0) return <>{text}</>;
  
  const nonDominated = entities.filter(
    (a) =>
      !entities.some(
        (b) =>
          a !== b &&
          a.BeginOffset >= b.BeginOffset &&
          a.EndOffset <= b.EndOffset &&
          (b.BeginOffset < a.BeginOffset || b.EndOffset > a.EndOffset)
      )
  );
  
  const uniq = new Map();
  nonDominated.forEach((e) => {
    const k = `${e.BeginOffset}-${e.EndOffset}`;
    if (!uniq.has(k)) uniq.set(k, e);
  });
  
  const sorted = Array.from(uniq.values()).sort((a, b) => a.BeginOffset - b.BeginOffset);
  let last = 0;
  const parts = [];
  
  sorted.forEach((e, i) => {
    if (e.BeginOffset > last) {
      parts.push(<span key={`t-${last}`}>{text.substring(last, e.BeginOffset)}</span>);
    }
    const tip = e.Category.replace(/_/g, " ");
    parts.push(
      <span key={`e-${i}`} className={`entity entity-${e.Category}`} data-tooltip={tip}>
        {text.substring(e.BeginOffset, e.EndOffset)}
      </span>
    );
    last = e.EndOffset;
  });
  
  if (last < text.length) parts.push(<span key={`t-${last}`}>{text.substring(last)}</span>);
  return <>{parts}</>;
});