const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ESCAPES[character]);
}

function toHtml(value) {
  if (value === null || value === undefined || value === false || value === true) return '';
  if (Array.isArray(value)) return value.map(toHtml).join('');
  if (typeof value === 'object' && '__html' in value) return value.__html;
  return esc(value);
}

/** Tagged template that escapes every interpolation unless it is marked raw. */
export function html(strings, ...values) {
  let output = strings[0];
  for (let index = 0; index < values.length; index += 1) {
    output += toHtml(values[index]) + strings[index + 1];
  }
  return {
    __html: output,
    toString() {
      return output;
    },
  };
}

export function raw(value) {
  return {
    __html: String(value ?? ''),
    toString() {
      return this.__html;
    },
  };
}

export function render(value) {
  return toHtml(value);
}

export function setHtml(node, value) {
  node.innerHTML = toHtml(value);
  return node;
}

export function on(root, type, selector, handler) {
  root.addEventListener(type, (event) => {
    const target = event.target.closest(selector);
    if (target && root.contains(target)) handler(event, target);
  });
}

export function parseForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function busy(button, state = true) {
  if (!button) return;
  button.disabled = state;
  button.classList.toggle('is-loading', state);
  button.setAttribute('aria-busy', state ? 'true' : 'false');
}

export function vibrate(duration = 14) {
  try {
    navigator.vibrate?.(duration);
  } catch {
    // not supported
  }
}

export function debounce(callback, delay = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(...args), delay);
  };
}

export function todayInClient() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

export function shiftDate(date, amount) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate(),
  ).padStart(2, '0')}`;
}
