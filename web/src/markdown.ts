import { h } from "./util";

// small safe markdown renderer: no raw HTML is ever passed through
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface LinkRule { (href: string): string | null }

function inline(text: string, link: LinkRule): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt) => `<span class="img-alt">[image: ${alt}]</span>`);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, href) => {
    const target = link(href.replace(/&amp;/g, "&"));
    return target ? `<a href="${escapeHtml(target)}" rel="noopener noreferrer">${label}</a>` : label;
  });
  return out;
}

export function renderMarkdown(source: string, link: LinkRule): HTMLElement {
  const root = h("div", { class: "md" });
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  const push = (html: string) => root.insertAdjacentHTML("beforeend", html);
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      const label = lang === "mermaid" ? '<p class="source">Mermaid diagram source</p>' : "";
      push(`${label}<pre><code>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) { const n = heading[1].length; push(`<h${n}>${inline(heading[2], link)}</h${n}>`); i++; continue; }
    if (/^---+\s*$/.test(line)) { push("<hr>"); i++; continue; }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      push(`<div class="table-wrap" tabindex="0" role="region" aria-label="Table"><table class="tbl"><thead><tr>${head.map((c) => `<th scope="col">${inline(c, link)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c, link)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        let text = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, "");
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) text += " " + lines[i++].trim();
        items.push(`<li>${inline(text, link)}</li>`);
      }
      push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
      push(`<blockquote>${inline(quote.join(" "), link)}</blockquote>`);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>\s?|\s*([-*]|\d+\.)\s+|\s*\|)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) { para.push(lines[i++]); }
    push(`<p>${inline(para.join(" "), link)}</p>`);
  }
  return root;
}
