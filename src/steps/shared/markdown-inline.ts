export function stripMarkdownInline(s: string): string {
  return s
    .replace(/\*\*/g, '')
    .replace(/\[(.+?)\]\([^\)]*\)/g, '$1')
    .replace(/\{[^}]+\}/g, '')
    .replace(/\^+/g, '')
    .trim();
}
