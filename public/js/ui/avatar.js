import { html } from '../core/dom.js';
import { icon } from './icons.js';

export function avatar(person = {}, size = 48, { admin = false } = {}) {
  const dimension = Math.max(24, Number(size) || 48);
  const style = `--size:${dimension}px`;

  if (admin) {
    return html`<span class="avatar avatar--admin" style="${style}">${icon(
      'shield',
      Math.round(dimension * 0.5),
    )}</span>`;
  }

  if (person.avatar) {
    return html`<img class="avatar" style="${style}" src="${person.avatar}" alt="${person.name || ''}">`;
  }

  const name = String(person.name || '؟').trim() || '؟';
  const initial = [...name][0];
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + (character.codePointAt(0) || 0)) % 360;
  }

  return html`<span class="avatar" style="${style};background:linear-gradient(135deg,hsl(${hash} 55% 40%),hsl(${(hash + 28) % 360} 65% 52%))">${initial}</span>`;
}
