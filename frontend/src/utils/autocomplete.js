export function highlightParts(text, query) {
  if (!query) return [{ text, match: false }];
  const parts = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let start = 0;
  let index = lowerText.indexOf(lowerQuery);
  while (index !== -1) {
    if (index > start) parts.push({ text: text.slice(start, index), match: false });
    parts.push({ text: text.slice(index, index + query.length), match: true });
    start = index + query.length;
    index = lowerText.indexOf(lowerQuery, start);
  }
  if (start < text.length) parts.push({ text: text.slice(start), match: false });
  return parts;
}
