import type { Ctx } from "../main";
import { renderMarkdown } from "../markdown";
import type { DocItem, ModuleView } from "../types";
import { h, panel } from "../util";

const REPO = "https://github.com/robotjaol/open-datacenter/blob/main/";

// resolve a relative path against a doc path
export function resolvePath(from: string, target: string): string {
  const parts = from.split("/").slice(0, -1);
  for (const seg of target.split("#")[0].split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

export function linkRule(current: string, docs: DocItem[], open: (path: string) => void) {
  return (href: string): string | null => {
    if (/^https?:\/\//.test(href)) return href;
    if (href.startsWith("#") || /^[a-z]+:/i.test(href)) return null;
    const path = resolvePath(current, href);
    if (docs.some((d) => d.path === path)) return `#/docs/${path}`;
    void open;
    return `${REPO}${path}`;
  };
}

export function docsModule(ctx: Ctx): ModuleView {
  const docs = ctx.store.docs;
  const hash = decodeURIComponent(location.hash.replace(/^#\/docs\/?/, ""));
  let current = docs.find((d) => d.path === hash) ?? docs.find((d) => d.path === "docs/GETTING-STARTED.md") ?? docs[0];
  const reader = h("article", { class: "panel md-panel" });
  const tree = h("div", { class: "panel doc-tree" });
  const folders = [...new Set(docs.map((d) => d.folder))];

  function open(path: string) {
    const doc = docs.find((d) => d.path === path);
    if (!doc) return;
    current = doc;
    history.replaceState(null, "", `#/docs/${doc.path}`);
    drawReader(); drawTree();
    window.scrollTo(0, 0);
  }
  function drawReader() {
    reader.replaceChildren(h("div", { class: "panel-head" }, h("h2", {}, current.title), h("a", { class: "btn", href: `${REPO}${current.path}`, rel: "noopener noreferrer" }, "View on GitHub")),
      renderMarkdown(current.text, linkRule(current.path, docs, open)), h("p", { class: "source" }, `Source: ${current.path}`));
    reader.querySelectorAll("a[href^='#/docs/']").forEach((a) => a.addEventListener("click", (e) => {
      e.preventDefault(); open(decodeURIComponent((a as HTMLAnchorElement).getAttribute("href")!.replace("#/docs/", "")));
    }));
  }
  function drawTree() {
    tree.replaceChildren(...folders.map((f) => h("details", { open: f === current.folder ? "" : undefined },
      h("summary", {}, f), ...docs.filter((d) => d.folder === f).map((d) => h("button", { class: "list-btn", type: "button", "aria-pressed": String(d.path === current.path), onClick: () => open(d.path) },
        d.title, h("small", {}, d.path))))));
  }
  const el = h("div", { class: "stack" },
    h("div", { class: "page-head" }, h("p", { class: "pattern" }, "Split pane"), h("h1", {}, "Engineering Documentation"),
      h("p", {}, `${docs.length} documents organised by engineering discipline. Mermaid diagrams are shown as source. Files that are not Markdown open on GitHub.`)),
    h("div", { class: "docs-layout" }, tree, reader));
  void panel;
  drawReader(); drawTree();
  return { el };
}
