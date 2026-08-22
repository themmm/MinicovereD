/**
 * The whole DOM layer. MinicovereD deliberately ships no UI framework, so this
 * is the one place that knows how an element is made.
 */

export type Child = Node | string | false | null | undefined;

export interface ElementSpec {
  readonly class?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string | number>>;
  readonly on?: Readonly<Record<string, (event: Event) => void>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  spec: ElementSpec = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (spec.class) node.className = spec.class;
  if (spec.text !== undefined) node.textContent = spec.text;

  for (const [name, value] of Object.entries(spec.attrs ?? {})) {
    node.setAttribute(name, String(value));
  }
  for (const [type, handler] of Object.entries(spec.on ?? {})) {
    node.addEventListener(type, handler);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
