/**
 * The whole DOM layer. mdcovergen deliberately ships no UI framework, so this
 * is the one place that knows how an element is made.
 */

export type Child = Node | string | number | null | undefined | false;

export interface ElementSpec {
  readonly class?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string | number | boolean | undefined>>;
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
    if (value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [type, handler] of Object.entries(spec.on ?? {})) {
    node.addEventListener(type, handler);
  }

  append(node, children);
  return node;
}

export function append(parent: Node, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
