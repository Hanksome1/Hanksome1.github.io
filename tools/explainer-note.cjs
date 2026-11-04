var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// packages/core/src/note.ts
var note_exports = {};
__export(note_exports, {
  evaluateScript: () => evaluateScript,
  parseNote: () => parseNote
});
module.exports = __toCommonJS(note_exports);
var KEYS = ["script", "style", "beats", "hold", "shots", "narrowZoom", "autoplayMs"];
var BLOCK_ID = /^[A-Za-z0-9-]+$/;
function scan(lines) {
  const headings = [], blocks = [];
  let i = 0;
  if (lines[0] === "---") {
    const close = lines.indexOf("---", 1);
    if (close > 0) i = close + 1;
  }
  for (; i < lines.length; i++) {
    const line = lines[i];
    const open = /^ {0,3}(`{3,}|~{3,})\s*(\S*)/.exec(line);
    if (open) {
      const mark = open[1], closing = new RegExp(`^ {0,3}${mark[0]}{${mark.length},}\\s*$`);
      let end = i + 1;
      while (end < lines.length && !closing.test(lines[end])) end++;
      if (open[2] === "explainer") blocks.push({ start: i, end, source: lines.slice(i + 1, end).join("\n") });
      i = end;
      continue;
    }
    const h = /^ {0,3}(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (h) {
      const id = /\s*\^([A-Za-z0-9-]+)$/.exec(h[2]);
      headings.push({
        line: i,
        level: h[1].length,
        title: id ? h[2].slice(0, id.index) : h[2],
        id: id ? id[1] : null
      });
    }
  }
  return { headings, blocks };
}
var isPositive = (x) => typeof x === "number" && x > 0;
var isNumber = (x) => typeof x === "number" && Number.isFinite(x);
function readConfig(source, parseYaml, problems) {
  let raw;
  try {
    raw = parseYaml(source);
  } catch (e) {
    problems.push(`YAML \u5BEB\u932F\uFF1A${e.message}`);
    return null;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    problems.push("explainer \u5340\u584A\u8981\u662F YAML \u7269\u4EF6");
    return null;
  }
  const data = raw;
  const before = problems.length;
  for (const k of Object.keys(data)) if (!KEYS.includes(k)) problems.push(`\u4E0D\u8A8D\u5F97\u7684\u6B04\u4F4D\uFF1A${k}`);
  if (typeof data.script !== "string" || !data.script.trim()) problems.push("\u7F3A script");
  const beats = data.beats, names = [];
  if (!Array.isArray(beats) || !beats.length) problems.push("\u7F3A beats");
  else for (const b of beats) {
    if (!Array.isArray(b) || typeof b[0] !== "string") {
      problems.push(`beat \u8981\u5BEB\u6210 [\u540D\u7A31, \u6B0A\u91CD, \u6A19\u7C64?]\uFF1A${JSON.stringify(b)}`);
      continue;
    }
    const name = b[0];
    if (!BLOCK_ID.test(name)) problems.push(`beat \u540D\u7A31\u8981\u80FD\u7576\u5340\u584A ID\uFF08\u82F1\u6578\u5B57\u548C\u9023\u5B57\u865F\uFF09\uFF1A${name}`);
    if (!isPositive(b[1])) problems.push(`beat\u300C${name}\u300D\u7684\u6B0A\u91CD\u8981\u662F\u6B63\u6578`);
    if (names.includes(name)) problems.push(`beat \u91CD\u8907\uFF1A${name}`);
    names.push(name);
  }
  const shots = data.shots;
  if (!Array.isArray(shots) || !shots.length) problems.push("\u7F3A shots");
  else {
    let last = -1;
    for (const s of shots) {
      if (!Array.isArray(s) || s.length !== 5 || !s.slice(1, 4).every(isNumber) || !isPositive(s[4])) {
        problems.push(`shot \u8981\u5BEB\u6210 [beat, t, x, y, \u5BEC]\uFF0C\u5BEC\u662F\u6B63\u6578\uFF1A${JSON.stringify(s)}`);
        continue;
      }
      const at = names.indexOf(s[0]);
      if (at < 0) {
        problems.push(`shot \u6307\u5411\u4E0D\u5B58\u5728\u7684 beat\uFF1A${s[0]}`);
        continue;
      }
      const order = at + s[1];
      if (order < last) problems.push(`shots \u7684\u9806\u5E8F\u8981\u8DDF\u6642\u9593\u4E00\u6A23\uFF1A${JSON.stringify(s)}`);
      last = order;
    }
  }
  for (const k of ["hold", "narrowZoom", "autoplayMs"]) {
    if (data[k] != null && !isNumber(data[k])) problems.push(`${k} \u8981\u662F\u6578\u5B57`);
  }
  if (data.style != null && typeof data.style !== "string") problems.push("style \u8981\u662F\u8DEF\u5F91");
  if (problems.length > before) return null;
  const script = data.script;
  const { script: _s, ...rest } = data;
  return {
    ...rest,
    ...script.includes("\n") ? { inlineScript: script } : { script: script.trim() }
  };
}
function parseNote(markdown, parseYaml) {
  const lines = markdown.split(/\r?\n/);
  const { headings, blocks } = scan(lines);
  return blocks.map((block, i) => {
    const problems = [];
    const config = readConfig(block.source, parseYaml, problems);
    const limit = blocks[i + 1]?.start ?? lines.length;
    const own = headings.filter((h) => h.line > block.end && h.line < limit);
    const cards = [];
    if (config) for (const [id, , label] of config.beats) {
      const matches = own.filter((h2) => h2.id === id);
      if (matches.length > 1) problems.push(`^${id} \u51FA\u73FE\u5169\u6B21`);
      const h = matches[0];
      if (!h) {
        problems.push(`beat\u300C${id}\u300D\u627E\u4E0D\u5230\u6A19\u984C\uFF0C\u8981\u5BEB\u6210 ### \u6A19\u984C ^${id}`);
        continue;
      }
      const next = own.find((o) => o.line > h.line && o.level <= h.level);
      const end = next?.line ?? limit;
      cards.push({
        id,
        label: label ?? id,
        title: h.title,
        markdown: lines.slice(h.line + 1, end).join("\n").trim(),
        line: h.line,
        end
      });
    }
    return { line: block.start, end: block.end, source: block.source, config, cards, problems };
  });
}
function evaluateScript(source) {
  let build;
  new Function("explainer", source)((fn) => {
    build = fn;
  });
  if (!build) throw new Error("\u8173\u672C\u6C92\u6709\u547C\u53EB explainer(function (api) { \u2026 })");
  return build;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  evaluateScript,
  parseNote
});
