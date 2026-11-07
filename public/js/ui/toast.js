import { html, render } from '../core/dom.js';
import { icon } from './icons.js';

let region = null;

export function toast(message, type = 'success', duration = 3800) {
  if (!region) region = document.getElementById('toast-region');
  if (!region) return;

  const node = document.createElement('div');
  node.className = `toast toast--${type}`;
  node.setAttribute('role', type === 'error' ? 'alert' : 'status');

  const iconName = type === 'error' ? 'alert' : type === 'info' ? 'info' : 'checkCircle';
  node.innerHTML = render(html`${icon(iconName, 20)}<span class="toast__text"></span>`);
  node.querySelector('.toast__text').textContent = message;
  region.append(node);

  window.setTimeout(() => {
    node.classList.add('is-out');
    window.setTimeout(() => node.remove(), 220);
  }, duration);
}
