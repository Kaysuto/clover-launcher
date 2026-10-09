/**
 * Filtre le HTML d'une note de version avant de l'afficher. Le site l'a déjà réduit, mais
 * l'interface du launcher peut appeler le cœur Rust : seconde barrière, par liste blanche. Seules
 * restent les balises de texte, les liens et images en https, sans aucun attribut d'évènement ni
 * de style.
 */

const TAGS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "CODE", "PRE", "A", "IMG", "BR", "HR", "BLOCKQUOTE", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD"]);
const ATTRIBUTES: Record<string, string[]> = { A: ["href"], IMG: ["src", "alt"] };

function https(value: string | null): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function clean(node: Node, into: Node, document: Document) {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      into.appendChild(document.createTextNode(child.textContent ?? ""));
      continue;
    }
    if (!(child instanceof Element)) continue;
    // SVG et MathML gardent leurs noms en minuscules.
    const tag = child.tagName.toUpperCase();
    // Balise inconnue : son texte est gardé, pas elle (sauf contenu exécutable ou de mise en page).
    if (!TAGS.has(tag)) {
      if (!["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "SVG", "MATH", "NOSCRIPT"].includes(tag)) clean(child, into, document);
      continue;
    }
    const copy = document.createElement(tag.toLowerCase());
    for (const name of ATTRIBUTES[tag] ?? []) {
      const value = child.getAttribute(name);
      if (value === null) continue;
      if ((name === "href" || name === "src") && !https(value)) continue;
      copy.setAttribute(name, value);
    }
    if (tag === "IMG" && !copy.hasAttribute("src")) continue;
    clean(child, copy, document);
    into.appendChild(copy);
  }
}

export function safeHtml(html: string): string {
  const source = new DOMParser().parseFromString(html, "text/html");
  const output = document.implementation.createHTMLDocument("");
  const root = output.createElement("div");
  clean(source.body, root, output);
  return root.innerHTML;
}
