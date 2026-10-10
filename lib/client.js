window.__ModuleLoader__.load({id:"dsh-md-memory",factory:(require)=>{var module={exports:{}};var exports=module.exports;
"use strict";
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

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/client/MemoryPage.tsx
var import_react3 = require("react");

// src/client/api.ts
var ApiError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
  code;
};
async function request(path, data, signal) {
  const response = await fetch(`/api/md-memory/${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
    ...data === void 0 ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) }
  });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  if (!response.ok && !isJson) {
    const detail = (await response.text()).trim().slice(0, 200);
    throw new ApiError(`HTTP_${response.status}`, `\u8BB0\u5FC6\u63A5\u53E3 ${path.split("?")[0]} \u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09${detail ? `\uFF1A${detail}` : "\u3002"}`);
  }
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.code ?? `HTTP_${response.status}`, result.message ?? "\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002");
  return result;
}
var api = {
  groups: (signal) => request("groups", void 0, signal),
  read: (target, name, signal) => request(`read?${new URLSearchParams({ ...target, name })}`, void 0, signal),
  write: (data) => request("write", data),
  forget: (target, memory) => request("forget", { ...target, name: memory.name, revision: memory.revision, hash: memory.hash }),
  move: (from, to, memory) => request(
    "move",
    { scope: from.scope, projectId: from.projectId, toScope: to.scope, toProjectId: to.projectId, name: memory.name, revision: memory.revision, hash: memory.hash }
  ),
  reset: (target) => request("reset", { ...target, confirm: true }),
  settings: (signal) => request("settings", void 0, signal),
  saveSettings: (values, hash) => request("settings", { values, hash })
};

// src/client/Icon.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var paths = {
  memory: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3h-2" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 3v6l4-2 4 2V3M7 14h10M7 17h6" })
  ] }),
  user: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "8", r: "4" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 21v-2a8 8 0 0 1 16 0v2" })
  ] }),
  folder: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3 7V5a2 2 0 0 1 2-2h4l3 4h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" }),
  search: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "10.5", cy: "10.5", r: "6.5" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m16 16 5 5" })
  ] }),
  plus: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 5v14M5 12h14" }),
  refresh: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M20 7v5h-5M4 17v-5h5" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5.5 7a7 7 0 0 1 12-2L20 8M4 16l2.5 3a7 7 0 0 0 12-2" })
  ] }),
  settings: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M4 7h16M4 17h16" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "9", cy: "7", r: "3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "15", cy: "17", r: "3" })
  ] }),
  arrow: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m9 5 7 7-7 7" }),
  down: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m6 9 6 6 6-6" }),
  right: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m9 6 6 6-6 6" }),
  trash: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" }) }),
  move: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M3 12h11" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m10.5 8.5 3.5 3.5-3.5 3.5" })
  ] }),
  check: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m5 12 4 4L19 6" })
};
function Icon({ name = "memory", size = 18 }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.65", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: paths[name] });
}

// src/client/Settings.tsx
var import_react = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var COLLAPSE_THRESHOLD = 12;
var USER_LABEL = "\u7528\u6237\u8BB0\u5FC6\uFF08\u8DE8\u9879\u76EE\u5171\u4EAB\uFF09";
function Settings({ view, values, setValues, save, reset, busy, dirty, projects, grantsSupported: grantsSupported2 }) {
  const [category, setCategory] = (0, import_react.useState)("recall");
  const [filter, setFilter] = (0, import_react.useState)("");
  const [expanded, setExpanded] = (0, import_react.useState)([]);
  const matrix = values.crossProject ?? {};
  const locked = busy || !grantsSupported2;
  const sourcesOf = (id) => matrix[id] ?? ["user"];
  const query = filter.trim().toLowerCase();
  const visibleProjects = query === "" ? projects : projects.filter((project) => `${project.label} ${project.project?.cwd ?? ""} ${project.id}`.toLowerCase().includes(query));
  const open = (id) => projects.length <= COLLAPSE_THRESHOLD || expanded.includes(id) || query !== "";
  const setSources = (id, sources) => setValues({ ...values, crossProject: { ...matrix, [id]: sources } });
  const toggleSource = (id, source, on) => {
    const current = sourcesOf(id);
    setSources(id, on ? [...current.filter((item) => item !== source), source] : current.filter((item) => item !== source));
  };
  const toggle = (key, label, help) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "mm-setting-row", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: label }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: help })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { className: "mm-toggle", type: "checkbox", checked: Boolean(values[key]), onChange: (event) => setValues({ ...values, [key]: event.target.checked }) })
  ] }, key);
  const number = (key, label, help, min, max, unit, scale = 1) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "mm-number-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
      label,
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: help })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "mm-number-control", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "number", min: min / scale, max: max / scale, step: 1 / scale, required: true, value: typeof values[key] === "number" ? String(Number(values[key]) / scale) : "", onChange: (event) => setValues({ ...values, [key]: event.target.value === "" ? "" : Math.round(Number(event.target.value) * scale) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: unit })
    ] })
  ] }, key);
  const accessCard = (project) => {
    const sources = sourcesOf(project.id);
    const others = projects.filter((other) => other.id !== project.id);
    const option = (source, label, help) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "mm-access-option", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { type: "checkbox", checked: sources.includes(source), disabled: locked, "aria-label": `\u5728 ${project.label} \u4F1A\u8BDD\u4E2D\u8BFB\u53D6 ${label}`, onChange: (event) => toggleSource(project.id, source, event.target.checked) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: label }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: help })
      ] })
    ] }, source);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("li", { className: "mm-access-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mm-access-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: "mm-access-name", "aria-expanded": open(project.id), disabled: busy, onClick: () => setExpanded((current) => current.includes(project.id) ? current.filter((id) => id !== project.id) : [...current, project.id]), children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { name: open(project.id) ? "down" : "right" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: project.label }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("small", { children: project.project?.cwd ?? project.id })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "mm-access-count", children: [
          "\u5DF2\u5F00\u653E ",
          sources.length,
          "/",
          projects.length
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "mm-button", disabled: locked || sources.length === 0, onClick: () => setSources(project.id, []), children: "\u5168\u90E8\u5173\u95ED" })
      ] }),
      open(project.id) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mm-access-options", children: [
        option("user", USER_LABEL, "\u4F60\u7684\u504F\u597D\u4E0E\u957F\u671F\u7EA6\u5B9A"),
        others.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "mm-note", children: "\u6682\u65E0\u53EF\u6388\u6743\u7684\u5176\u4ED6\u9879\u76EE\u3002" }),
        others.map((other) => option(other.id, other.label, other.project?.cwd ?? other.id))
      ] })
    ] }, project.id);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("form", { className: "mm-settings", onSubmit: (event) => {
    event.preventDefault();
    save();
  }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("fieldset", { disabled: busy, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mm-config-layout", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("nav", { className: "mm-config-nav", "aria-label": "\u914D\u7F6E\u5206\u7C7B", children: [
        [["recall", "\u53EC\u56DE", "search"], ["write", "\u8BB0\u5FC6\u5199\u5165", "plus"], ["maintenance", "\u7EF4\u62A4", "settings"]].map(([key, label, icon]) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { type: "button", className: category === key ? "is-active" : "", "aria-pressed": category === key, onClick: () => setCategory(key), children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { name: icon }),
          label
        ] }, key)),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "\u8BBE\u7F6E\u5C5E\u4E8E\u63D2\u4EF6\u5168\u5C40\u3002\u9879\u76EE\u8BB0\u5FC6\u6309\u4F1A\u8BDD\u5DE5\u4F5C\u533A\u81EA\u52A8\u5339\u914D\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mm-config-main", children: [
        category === "recall" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "mm-config-section", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: "\u53EC\u56DE\u4E0E\u4E0A\u4E0B\u6587" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "\u77ED\u7D22\u5F15\u63D0\u4F9B\u7EBF\u7D22\uFF0C\u6B63\u6587\u968F\u5F53\u524D\u95EE\u9898\u6309\u9700\u51FA\u73B0\u3002" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            toggle("indexEnabled", "\u6CE8\u5165\u77ED\u7D22\u5F15", "\u653E\u5F97\u4E0B\u65F6\u5B8C\u6574\u6CE8\u5165\uFF1B\u8D85\u51FA\u9884\u7B97\u65F6\u6309\u76F8\u5173\u6027\u6392\u5E8F\u5E76\u6301\u7EED\u586B\u5145\u3002"),
            toggle("autoRecall", "\u81EA\u52A8\u53EC\u56DE\u76F8\u5173\u6B63\u6587", "\u6839\u636E\u5F53\u524D\u95EE\u9898\u3001\u6700\u8FD1\u4E24\u8F6E\u8F93\u5165\u548C\u89E6\u53CA\u7684\u6587\u4EF6\u5339\u914D\u3002\u5173\u95ED\u540E\u4ECD\u53EF\u7531 Agent \u4E3B\u52A8\u68C0\u7D22\u3002"),
            toggle("recallProject", "\u5305\u542B\u5F53\u524D\u9879\u76EE\u8BB0\u5FC6", "\u63A7\u5236\u5F53\u524D\u4F1A\u8BDD\u5DE5\u4F5C\u533A\u81EA\u5DF1\u7684\u8BB0\u5FC6\uFF1B\u5176\u4ED6\u9879\u76EE\u7531\u4E0B\u65B9\u300C\u8DE8\u9879\u76EE\u8BBF\u95EE\u300D\u5355\u72EC\u6388\u6743\u3002"),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mm-numbers", children: [
              number("indexBytes", "\u81EA\u52A8\u6CE8\u5165\u7684\u77ED\u7D22\u5F15\u9884\u7B97", "UTF-8 \u5BB9\u91CF\uFF0C1 KiB = 1024 \u5B57\u8282", 512, 65536, "KiB", 1024),
              number("bodyBytes", "\u81EA\u52A8\u6CE8\u5165\u7684\u6B63\u6587\u9884\u7B97", "\u6BCF\u6B21\u8BF7\u6C42\u7684\u6B63\u6587\u603B\u5BB9\u91CF", 256, 65536, "KiB", 1024),
              number("bodyLimit", "\u81EA\u52A8\u6CE8\u5165\u7684\u6B63\u6587\u6761\u76EE\u4E0A\u9650", "\u6BCF\u6B21\u81EA\u52A8\u53EC\u56DE\u7684\u6700\u591A\u6761\u76EE\u6570", 1, 20, "\u6761")
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "mm-note", children: [
              "\u8FD9\u4E09\u9879\u53EA\u9650\u5236\u6BCF\u8F6E\u81EA\u52A8\u6CE8\u5165\u7684\u4E0A\u4E0B\u6587\u3002Agent \u4E3B\u52A8\u8BFB\u53D6\u65F6\u4E0D\u53D7\u9650\u5236\uFF1A",
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: "md_memory_read" }),
              " \u8FD4\u56DE\u5B8C\u6574\u6B63\u6587\uFF0C",
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("code", { children: "md_memory_search" }),
              " \u7684\u8FD4\u56DE\u6761\u6570\u7531\u5B83\u81EA\u5DF1\u7684 limit \u53C2\u6570\u51B3\u5B9A\uFF08\u9ED8\u8BA4 10\uFF0C\u6700\u5927 100\uFF09\u3002"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mm-access", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mm-access-heading", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h3", { children: "\u8DE8\u9879\u76EE\u8BBF\u95EE" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "\u8FD9\u91CC\u914D\u7F6E\u7684\u662F\u300C\u5728\u67D0\u4E2A\u9879\u76EE\u7684\u4F1A\u8BDD\u91CC\uFF0C\u9664\u4E86\u5B83\u81EA\u5DF1\uFF0C\u8FD8\u80FD\u8BFB\u5230\u54EA\u4E9B\u8BB0\u5FC6\u300D\u3002\u6388\u6743\u662F\u5355\u5411\u7684\uFF0C\u4E14\u53EA\u6388\u4E88\u8BFB\u53D6\uFF1B\u88AB\u6388\u6743\u9879\u76EE\u7684\u8BB0\u5FC6\u6700\u591A\u5360\u7528\u4E0A\u4E0B\u6587\u9884\u7B97\u7684\u4E00\u534A\u3002" }),
                  !grantsSupported2 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "mm-access-locked", role: "status", children: "\u5F53\u524D\u8FD0\u884C\u7684\u5BBF\u4E3B\u4ECD\u662F\u65E7\u7248\u672C\uFF0C\u52FE\u9009\u6682\u65F6\u4E0D\u53EF\u4FDD\u5B58\uFF1A\u91CD\u542F DSH \u540E\u5373\u53EF\u914D\u7F6E\u3002" })
                ] }),
                projects.length > 6 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "mm-search mm-access-filter", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { name: "search" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { "aria-label": "\u8FC7\u6EE4\u9879\u76EE", value: filter, placeholder: "\u8FC7\u6EE4\u9879\u76EE\u2026", disabled: busy, onChange: (event) => setFilter(event.target.value) })
                ] })
              ] }),
              projects.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "mm-note", children: "\u8FD8\u6CA1\u6709\u5176\u4ED6\u9879\u76EE\u3002\u9879\u76EE\u6765\u81EA\u4F1A\u8BDD\u5DE5\u4F5C\u533A\uFF0C\u51FA\u73B0\u8FC7\u4E00\u6B21\u540E\u624D\u4F1A\u5728\u8FD9\u91CC\u5217\u51FA\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("ul", { className: "mm-access-list", children: [
                visibleProjects.map(accessCard),
                visibleProjects.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "mm-note", children: "\u6CA1\u6709\u5339\u914D\u7684\u9879\u76EE\u3002" })
              ] })
            ] })
          ] })
        ] }),
        category === "write" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "mm-config-section", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: "\u8BB0\u5FC6\u5199\u5165" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "\u4E3B\u52A8\u4FDD\u5B58\u4E0E\u6210\u529F\u8F6E\u540E\u7684\u540E\u53F0\u63D0\u70BC\u3002" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            toggle("autoExtract", "\u540E\u53F0\u81EA\u52A8\u63D0\u70BC", "\u6839\u4F1A\u8BDD\u6210\u529F\u5B8C\u6210\u4E00\u8F6E\u540E\u63D0\u53D6\u6301\u4E45\u4FE1\u606F\u3002\u5173\u95ED\u540E\u4E0D\u518D\u8C03\u5EA6\u65B0\u4EFB\u52A1\uFF1B\u5DF2\u5F00\u59CB\u7684\u4EFB\u52A1\u4F1A\u5B8C\u6210\u3002"),
            toggle("enableInHeadless", "\u5141\u8BB8 Headless \u81EA\u52A8\u63D0\u70BC", "\u7528\u4E8E\u547D\u4EE4\u884C\u90E8\u7F72\uFF1B\u684C\u9762\u7248\u901A\u5E38\u65E0\u9700\u5F00\u542F\u3002"),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mm-numbers", children: [
              number("extractionMaxTokens", "\u6A21\u578B\u8F93\u51FA\u4E0A\u9650", "\u9650\u5236\u4E00\u6B21\u63D0\u70BC\u7684\u8F93\u51FA", 256, 16384, "tokens"),
              number("extractionMaxOperations", "\u6BCF\u6B21\u5199\u5165\u4E0A\u9650", "\u4E00\u8F6E\u63D0\u70BC\u6700\u591A\u63D0\u4EA4\u7684\u8BB0\u5FC6\u6761\u76EE", 1, 20, "\u6761"),
              number("extractionTimeoutMs", "\u8BF7\u6C42\u8D85\u65F6", "\u540E\u53F0\u6A21\u578B\u8C03\u7528\u7684\u6700\u957F\u7B49\u5F85\u65F6\u95F4", 1e3, 12e4, "\u79D2", 1e3),
              number("extractionAttempts", "\u5C1D\u8BD5\u6B21\u6570", "\u5931\u8D25\u65F6\u6700\u591A\u5C1D\u8BD5\u6B21\u6570", 1, 3, "\u6B21")
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mm-model-fields", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
                "\u63D0\u70BC Provider",
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { value: values.extractionProvider, placeholder: "\u8DDF\u968F\u5F53\u524D\u4F1A\u8BDD", onChange: (event) => setValues({ ...values, extractionProvider: event.target.value }) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { children: [
                "\u63D0\u70BC\u6A21\u578B",
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("input", { value: values.extractionModel, placeholder: "\u8DDF\u968F\u5F53\u524D\u4F1A\u8BDD", onChange: (event) => setValues({ ...values, extractionModel: event.target.value }) })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "mm-note", children: "\u7559\u7A7A\u65F6\u6CBF\u7528\u4F1A\u8BDD\u6A21\u578B\u3002\u6307\u5B9A\u6A21\u578B\u65F6\u586B\u5199 DSH \u4E2D\u7684\u51C6\u786E Provider \u4E0E\u6A21\u578B ID\u3002" })
          ] })
        ] }),
        category === "maintenance" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("section", { className: "mm-config-section", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { children: "\u7EF4\u62A4\u4E0E\u5B58\u50A8" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "\u6587\u4EF6\u900F\u660E\u53EF\u67E5\uFF0C\u9519\u8BEF\u660E\u786E\u53EF\u89C1\u3002" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            toggle("debug", "\u8BE6\u7EC6\u65E5\u5FD7", "\u8BB0\u5F55\u53EC\u56DE\u8BC4\u5206\u3001\u9009\u62E9\u7ED3\u679C\u4E0E\u63D0\u70BC\u8C03\u5EA6\uFF0C\u4E0D\u8BB0\u5F55\u539F\u59CB\u5BF9\u8BDD\u6216\u8BB0\u5FC6\u6B63\u6587\u3002"),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("dl", { className: "mm-storage", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: "\u8BB0\u5FC6\u76EE\u5F55" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dd", { children: view.root }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: "\u9875\u9762\u914D\u7F6E" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("dd", { children: [
                view.root,
                "/SETTINGS.md"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("dt", { children: "\u8FD0\u884C\u65E5\u5FD7" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("dd", { children: [
                view.root,
                "/logs"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "mm-note", children: "\u76EE\u5F55\u7531 DSH \u63D2\u4EF6\u914D\u7F6E\u51B3\u5B9A\u3002\u4FDD\u5B58\u540E\u7ACB\u5373\u751F\u6548\uFF0C\u73B0\u6709\u4F1A\u8BDD\u5728\u4E0B\u4E00\u6B21\u6A21\u578B\u8BF7\u6C42\u65F6\u4F7F\u7528\u66F4\u65B0\u540E\u7684\u4E0A\u4E0B\u6587\u3002" })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("footer", { className: "mm-settings-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: dirty ? "\u6709\u672A\u4FDD\u5B58\u7684\u914D\u7F6E" : "\u914D\u7F6E\u5DF2\u540C\u6B65" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: "mm-button", disabled: busy || !dirty, onClick: reset, children: "\u64A4\u9500\u66F4\u6539" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("button", { className: "mm-button mm-primary", disabled: busy || !dirty, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Icon, { name: "check" }),
        busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u914D\u7F6E"
      ] })
    ] })
  ] }) });
}

// src/client/matrix.ts
function matrixPayload(values, projects) {
  const current = values.crossProject ?? {};
  if (projects.length === 0) return current;
  return Object.fromEntries([...Object.entries(current), ...projects.map((project) => [project.id, current[project.id] ?? ["user"]])].map(([id, sources]) => [id, [...sources]]));
}
function grantsSupported(values) {
  return Object.hasOwn(values, "crossProject");
}
function settingsPayload(values, projects) {
  return grantsSupported(values) ? { ...values, crossProject: matrixPayload(values, projects) } : values;
}

// src/client/PaneLayout.tsx
var import_react2 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var DEFAULT = { project: 200, memory: 300 };
var LIMITS = { project: [160, 320], memory: [240, 480] };
var clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function fitPaneWidths(width, requested, editor) {
  const project = clamp(requested.project, 160, Math.min(320, width - (editor ? 580 : 250)));
  const memory = clamp(requested.memory, 240, Math.min(480, width - project - 340));
  return { project, memory };
}
function PaneLayout({ navigation, library, editor }) {
  const root = (0, import_react2.useRef)(null);
  const [width, setWidth] = (0, import_react2.useState)(0);
  const [requested, setRequested] = (0, import_react2.useState)(DEFAULT);
  const [dragging, setDragging] = (0, import_react2.useState)(null);
  (0, import_react2.useEffect)(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  const sizes = fitPaneWidths(width, requested, !!editor);
  const separator = (key, label) => {
    const [min, limit] = LIMITS[key];
    const max = width <= 850 ? limit : Math.min(limit, key === "project" ? width - (editor ? sizes.memory + 340 : 250) : width - sizes.project - 340);
    const update = (value) => setRequested((current) => ({ ...current, [key]: clamp(value, min, max) }));
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "div",
      {
        className: `mm-divider${dragging === key ? " is-dragging" : ""}`,
        role: "separator",
        tabIndex: 0,
        "aria-label": label,
        "aria-orientation": "vertical",
        "aria-valuemin": min,
        "aria-valuemax": max,
        "aria-valuenow": sizes[key],
        title: `${label}\uFF1A${min}\u2013${max}px\uFF1B\u62D6\u52A8\u8C03\u6574\uFF0C\u65B9\u5411\u952E\u5FAE\u8C03\uFF0C\u53CC\u51FB\u6062\u590D\u9ED8\u8BA4`,
        onDoubleClick: () => update(DEFAULT[key]),
        onKeyDown: (event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          update(event.key === "Home" ? min : event.key === "End" ? max : sizes[key] + (event.key === "ArrowLeft" ? -10 : 10));
        },
        onPointerDown: (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          const handle = event.currentTarget;
          const start = event.clientX, size = sizes[key];
          handle.setPointerCapture(event.pointerId);
          setDragging(key);
          handle.onpointermove = (move) => update(size + move.clientX - start);
        },
        onLostPointerCapture: (event) => {
          event.currentTarget.onpointermove = null;
          setDragging(null);
        },
        onPointerUp: (event) => {
          event.currentTarget.releasePointerCapture(event.pointerId);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", {})
      }
    );
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { ref: root, className: `mm-workspace${editor ? " has-editor" : ""}${dragging ? " is-resizing" : ""}`, style: { "--mm-project-width": `${sizes.project}px`, "--mm-memory-width": `${sizes.memory}px` }, children: [
    navigation,
    separator("project", "\u9879\u76EE\u4E0E\u8BB0\u5FC6\u5206\u754C"),
    library,
    editor && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      separator("memory", "\u8BB0\u5FC6\u4E0E\u7F16\u8F91\u5206\u754C"),
      editor
    ] })
  ] });
}

// src/client/style.css
var style_default = ".mm-page{--mm-bg:var(--dsw-alias-bg-base,#fbfcfc);--mm-panel:var(--dsw-alias-bg-layer-1,#f2f5f4);--mm-fg:var(--dsw-alias-label-primary,#182d2b);--mm-muted:var(--dsw-alias-label-secondary,#53635f);--mm-border:var(--dsw-alias-border-l3,#d9e1de);--mm-accent:var(--dsw-alias-brand-primary,#0f766e);--mm-hover:var(--dsw-alias-interactive-bg-hover,#e8eeeb);--mm-error:var(--dsw-alias-state-error-primary,#b42318);font-family:inherit;font-size:14px;line-height:1.55;color:var(--mm-fg);background:var(--mm-bg);height:100%;min-height:0;overflow:auto;container-type:inline-size;text-align:left}\r\n.mm-page *{box-sizing:border-box}.mm-page fieldset{border:0;padding:0;margin:0;min-width:0}.mm-page button,.mm-page input,.mm-page textarea,.mm-page select{font:inherit;color:inherit}.mm-page button{cursor:pointer}.mm-page button:disabled{cursor:default;opacity:.5}.mm-page button,.mm-page input,.mm-page select,.mm-page textarea{transition:background-color .16s,border-color .16s}.mm-page :focus-visible{outline:2px solid var(--mm-accent);outline-offset:3px}.mm-page input,.mm-page textarea,.mm-page select{caret-color:var(--mm-accent)}.mm-page ::selection{background:var(--mm-accent);color:#fff}.mm-page h1,.mm-page h2,.mm-page h3,.mm-page p{margin:0}.mm-page small,.mm-muted{color:var(--mm-muted)}\r\n.mm-header{padding:30px 32px 24px;display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid var(--mm-border)}.mm-heading{display:flex;align-items:center;gap:15px}.mm-mark{height:48px;width:48px;display:grid;place-items:center;color:var(--mm-accent);border:1px solid var(--mm-border);border-radius:13px;background:var(--mm-panel)}.mm-heading h1{font-size:26px;font-weight:650;letter-spacing:-.025em}.mm-heading p{font-size:13px;color:var(--mm-muted);margin-top:2px}.mm-top-actions{display:flex;align-items:center;gap:15px}.mm-tabs{display:flex;padding:4px;background:var(--mm-panel);border:1px solid var(--mm-border);border-radius:10px;gap:3px}.mm-tabs button{display:flex;align-items:center;gap:7px;background:transparent;border:0;border-radius:6px;padding:7px 14px;color:var(--mm-muted)}.mm-tabs button:hover{background:var(--mm-hover)}.mm-tabs button.is-active{background:var(--mm-bg);color:var(--mm-fg);box-shadow:0 1px 3px #00000012}.mm-dot{height:6px;width:6px;border-radius:50%;background:var(--mm-accent)}\r\n.mm-button{border:1px solid var(--mm-border);border-radius:7px;display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:7px 12px;min-height:35px;background:var(--mm-bg);white-space:nowrap;font-weight:550}.mm-button:hover:enabled{background:var(--mm-hover)}.mm-primary{color:#fff!important;background:var(--mm-accent);border-color:var(--mm-accent)}.mm-primary:hover:enabled{background:var(--mm-accent);filter:brightness(.92)}.mm-danger{color:var(--mm-error)!important}.mm-icon-button{width:36px;padding:7px}\r\n.mm-workspace{display:grid}.mm-library-nav{background:var(--mm-panel);padding:25px 15px;border-right:1px solid var(--mm-border);min-width:0}.mm-library-nav h2{font-size:12px;font-weight:600;color:var(--mm-muted);margin:0 10px 14px}.mm-group-list{display:flex;flex-direction:column;gap:5px}.mm-group{background:transparent;border:1px solid transparent;border-radius:8px;padding:10px;display:flex;align-items:center;gap:10px;text-align:left;width:100%;min-width:0}.mm-group:hover{background:var(--mm-hover)}.mm-group.is-active{background:var(--mm-bg);border-color:var(--mm-border)}.mm-group.is-active>svg{color:var(--mm-accent)}.mm-group>span:nth-child(2){min-width:0;flex:1}.mm-group strong{font-size:13px;font-weight:600;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mm-group small{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}.mm-count{color:var(--mm-muted);font-size:12px;font-variant-numeric:tabular-nums}.mm-nav-note{padding:23px 10px;font-size:11px;color:var(--mm-muted);line-height:1.8}\r\n.mm-library{padding:26px 28px;min-width:0}.mm-library-heading{display:flex;gap:15px;align-items:flex-start;justify-content:space-between;margin-bottom:25px}.mm-library-heading>div{min-width:0}.mm-library-heading h2{font-size:19px;font-weight:650}.mm-library-heading p{font-size:12px;color:var(--mm-muted);margin-top:5px;overflow-wrap:anywhere}.mm-list-tools{display:flex;align-items:center;gap:10px;margin-bottom:17px}.mm-search{display:flex;align-items:center;gap:8px;flex:1;border:1px solid var(--mm-border);border-radius:7px;padding:7px 10px;min-width:0;color:var(--mm-muted)}.mm-search input{border:0;background:transparent;padding:0;min-width:0;width:100%;outline:0}.mm-search:focus-within{outline:2px solid var(--mm-accent);outline-offset:2px}.mm-page input::placeholder,.mm-page textarea::placeholder{color:var(--mm-muted);opacity:1}.mm-page select{border:1px solid var(--mm-border);border-radius:7px;padding:7px;background:var(--mm-bg);max-width:100%}.mm-entry-list{display:flex;flex-direction:column}.mm-entry{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--mm-border);background:transparent;padding:18px 12px;border-radius:4px}.mm-entry:hover{background:var(--mm-panel)}.mm-entry.is-active{background:var(--mm-panel);box-shadow:inset 0 0 0 1px var(--mm-border)}.mm-entry-top{display:flex;align-items:center;gap:8px;font-size:11px}.mm-type{font-size:11px;color:var(--mm-accent);border:1px solid var(--mm-border);border-radius:4px;padding:0 5px}.mm-date{margin-left:auto;color:var(--mm-muted);font-variant-numeric:tabular-nums}.mm-entry h3{font-size:15px;font-weight:600;margin:9px 0 6px;overflow-wrap:anywhere}.mm-entry p{font-size:13px;color:var(--mm-muted);line-height:1.7;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere}.mm-entry-bottom{display:flex;justify-content:space-between;align-items:center;color:var(--mm-muted);font-size:11px;margin-top:12px;gap:8px}.mm-entry-bottom span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mm-empty{padding:65px 15px;text-align:center;color:var(--mm-muted)}.mm-empty>svg{color:var(--mm-accent);opacity:.7}.mm-empty h3{font-size:16px;font-weight:550;color:var(--mm-fg);margin:15px 0 8px}.mm-empty p{font-size:13px;max-width:35ch;margin:auto;line-height:1.8}\r\n.mm-message{margin:14px 28px;padding:11px 15px;border:1px solid var(--mm-border);border-radius:7px;display:flex;gap:10px;align-items:center;font-size:12px;overflow-wrap:anywhere;background:var(--mm-panel)}.mm-message span{min-width:0;flex:1}.mm-message strong{white-space:nowrap}.mm-error{color:var(--mm-error);align-items:flex-start}.mm-library .mm-message{margin:12px 0}.mm-loading{padding:35px;display:grid;gap:16px}.mm-loading>div{height:45px;background:var(--mm-panel);border:1px solid var(--mm-border);border-radius:7px}.mm-loading>div:nth-child(2){width:80%}\r\n.mm-editor{padding:25px 26px;border-left:1px solid var(--mm-border);background:var(--mm-bg);min-width:0}.mm-editor-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:24px}.mm-editor-heading h2{font-size:18px;font-weight:600}.mm-editor-heading p{font-size:12px;color:var(--mm-muted);margin-top:5px}.mm-editor label,.mm-model-fields label{display:flex;flex-direction:column;gap:7px;font-size:12px;font-weight:550;margin-bottom:17px;min-width:0}.mm-editor input:not([type=checkbox]),.mm-editor textarea,.mm-model-fields input{width:100%;border:1px solid var(--mm-border);border-radius:6px;padding:9px 10px;background:var(--mm-bg);font-weight:400}.mm-editor input:read-only{background:var(--mm-panel);color:var(--mm-muted)}.mm-editor textarea{resize:vertical;line-height:1.75;font-size:13px}.mm-editor-row{display:grid;grid-template-columns:minmax(0,1fr) 85px;gap:12px}.mm-body-label>span{display:flex;align-items:center;justify-content:space-between}.mm-body-label small{font-weight:400}.mm-body{min-height:200px;font-family:ui-monospace,'Cascadia Code',Consolas,monospace!important}.mm-metadata{margin-bottom:15px}.mm-metadata summary{font-size:12px;color:var(--mm-muted);cursor:pointer;margin-bottom:14px}.mm-editor .mm-checkbox{display:flex;flex-direction:row;align-items:center;gap:8px}.mm-checkbox input{accent-color:var(--mm-accent)}.mm-editor-footer{display:flex;align-items:center;justify-content:flex-end;gap:8px;border-top:1px solid var(--mm-border);padding-top:15px}.mm-editor-footer>span{font-size:11px;color:var(--mm-muted);margin-right:auto}.mm-delete-confirm{margin-top:15px;padding:16px;border:1px solid var(--mm-error);border-radius:7px;font-size:12px}.mm-delete-confirm strong{color:var(--mm-error)}.mm-delete-confirm p{margin:7px 0 12px;color:var(--mm-muted)}.mm-delete-confirm>div{display:flex;justify-content:flex-end;gap:8px}\r\n.mm-settings{padding:0 34px 25px;max-width:1060px;margin:0 auto}.mm-config-section{display:grid;grid-template-columns:220px minmax(0,1fr);gap:30px;padding:30px 0;border-bottom:1px solid var(--mm-border)}.mm-config-section h2{font-size:18px;font-weight:600;margin-bottom:7px}.mm-config-section>div>p{color:var(--mm-muted);font-size:12px;line-height:1.8}.mm-setting-row{display:flex;justify-content:space-between;gap:25px;align-items:center;padding:0 0 19px;cursor:pointer}.mm-setting-row strong{display:block;font-size:13px;font-weight:550}.mm-setting-row small{display:block;margin-top:4px;font-size:12px;line-height:1.7;max-width:59ch}.mm-toggle{appearance:none;flex-shrink:0;width:34px;height:20px;border-radius:12px;border:1px solid var(--mm-border);background:var(--mm-hover);position:relative;cursor:pointer;transition:background .16s}.mm-toggle:before{content:'';position:absolute;width:14px;height:14px;border-radius:50%;background:var(--mm-muted);top:2px;left:2px;transition:transform .16s}.mm-toggle:checked{background:var(--mm-accent);border-color:var(--mm-accent)}.mm-toggle:checked:before{background:#fff;transform:translateX(14px)}.mm-numbers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:17px 22px;margin:8px 0 22px}.mm-number-field{display:flex;flex-direction:column;gap:8px;font-size:12px;font-weight:550}.mm-number-field small{display:block;font-size:11px;font-weight:400;margin-top:3px}.mm-number-control{display:flex;align-items:center;gap:8px;min-width:0}.mm-number-control input{min-width:0;width:100%;border:1px solid var(--mm-border);border-radius:6px;padding:7px 9px;background:var(--mm-bg);font-variant-numeric:tabular-nums}.mm-number-control>span{color:var(--mm-muted);font-size:11px;white-space:nowrap}.mm-model-fields{display:grid;grid-template-columns:1fr 1fr;gap:20px}.mm-note{font-size:11px!important;color:var(--mm-muted);line-height:1.8}.mm-storage{display:grid;grid-template-columns:90px minmax(0,1fr);gap:9px;font-size:12px;line-height:1.7;margin:0 0 18px}.mm-storage dt{color:var(--mm-muted)}.mm-storage dd{margin:0;overflow-wrap:anywhere}.mm-settings-footer{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:22px 0;position:sticky;bottom:0;background:var(--mm-bg)}.mm-settings-footer>span{margin-right:auto;color:var(--mm-muted);font-size:12px}\r\n@media(prefers-reduced-motion:reduce){.mm-page *{transition:none!important}}\r\n.mm-page{display:flex;flex-direction:column;overflow:hidden;--mm-panel:var(--dsw-alias-bg-layer-1,#f1f3f7);--mm-fg:var(--dsw-alias-label-primary,#20252e);--mm-muted:var(--dsw-alias-label-secondary,#606975);--mm-border:var(--dsw-alias-border-l3,#e2e5eb);--mm-accent:var(--dsw-alias-brand-primary,#4268dc)}.mm-header,.mm-page>.mm-message{flex-shrink:0}.mm-header{padding:22px 28px}.mm-heading h1{font-size:23px}.mm-mark{width:40px;height:40px;border-radius:10px}.mm-workspace,.mm-workspace.has-editor{flex:1;min-height:0;grid-template-rows:minmax(0,1fr);grid-template-columns:var(--mm-project-width,200px) 10px var(--mm-memory-width,300px) 10px minmax(320px,1fr);overflow:hidden}.mm-workspace.is-resizing{user-select:none}.mm-library-nav{padding:22px 12px;min-height:0;border-right:0;display:flex;flex-direction:column}.mm-group-list{flex:1;min-height:0;overflow-y:auto}.mm-nav-note{padding:18px 10px 0;flex-shrink:0}.mm-library{padding:23px 18px;display:flex;flex-direction:column;min-height:0}.mm-library-heading{flex-shrink:0;flex-direction:column;gap:12px;margin-bottom:16px}.mm-library-heading h2{font-size:18px}.mm-list-tools{flex-shrink:0;margin-bottom:12px}.mm-entry-list{flex:1;min-height:0;overflow-y:auto;max-height:none}.mm-entry{padding:10px 10px;min-height:78px;flex-shrink:0}.mm-entry-title{display:flex;gap:8px;align-items:center;justify-content:space-between;min-width:0}.mm-entry-title>span{font-size:10px;white-space:nowrap}.mm-entry h3{font-size:13px;margin:0;line-height:1.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mm-entry p{font-size:11px;line-height:1.5;margin-top:3px;-webkit-line-clamp:1}.mm-entry-bottom{font-size:10px;margin-top:5px}.mm-entry-bottom .mm-date{flex-shrink:0}.mm-editor{border-left:0;padding:23px 25px;overflow-y:auto;min-height:0}.mm-editor-row{display:block}.mm-editor-footer{position:sticky;bottom:-23px;padding:15px 0;background:var(--mm-bg)}.mm-group-list,.mm-entry-list,.mm-editor{overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:var(--mm-muted) var(--mm-panel);scrollbar-gutter:stable}.mm-page ::-webkit-scrollbar{width:9px;height:9px}.mm-page ::-webkit-scrollbar-thumb{background:var(--mm-muted);border:3px solid var(--mm-bg);border-radius:9px}.mm-divider{position:relative;width:10px;cursor:col-resize;touch-action:none;background:var(--mm-bg);display:flex;align-items:center;justify-content:center}.mm-divider:before{content:'';position:absolute;top:0;bottom:0;width:1px;background:var(--mm-border)}.mm-divider>span{position:relative;width:3px;height:28px;border-radius:3px;background:var(--mm-muted);opacity:.45}.mm-divider:hover>span,.mm-divider.is-dragging>span,.mm-divider:focus-visible>span{background:var(--mm-accent);opacity:1}.mm-divider:focus-visible{outline:none}.mm-divider:focus-visible>span{outline:2px solid var(--mm-accent);outline-offset:3px}.mm-editor-empty{display:grid;align-content:center}.mm-settings{overflow:auto;width:100%;flex:1;min-height:0;max-width:none;padding:0 30px 20px}.mm-config-layout{display:grid;grid-template-columns:180px minmax(0,740px);gap:40px;max-width:1020px;margin:auto;padding-top:28px}.mm-config-nav{display:flex;flex-direction:column;gap:7px;align-self:start}.mm-config-nav button{display:flex;align-items:center;gap:9px;border:0;background:transparent;color:var(--mm-muted);padding:12px 14px;text-align:left;border-radius:8px}.mm-config-nav button.is-active{background:var(--mm-panel);color:var(--mm-accent);font-weight:600}.mm-config-nav p{font-size:11px;color:var(--mm-muted);padding:16px 14px}.mm-config-main{min-width:0}.mm-config-section{display:block;padding:0 0 20px;border-bottom:0}.mm-config-section>div:first-child{margin-bottom:25px}.mm-config-section h2{font-size:23px;font-weight:650}.mm-config-section>div>p{font-size:13px}.mm-setting-row{padding:16px 0;border-bottom:1px solid var(--mm-border)}.mm-setting-row small{font-size:12px;line-height:1.65}.mm-toggle{width:38px;height:22px}.mm-toggle:before{width:16px;height:16px}.mm-toggle:checked:before{transform:translateX(16px)}.mm-numbers{margin:24px 0}.mm-settings-footer{max-width:1020px;margin:auto;bottom:-20px;border-top:1px solid var(--mm-border)}\r\n@container(max-width:850px){.mm-workspace,.mm-workspace.has-editor{grid-template-columns:160px minmax(0,1fr);grid-template-rows:minmax(220px,.85fr) minmax(280px,1.15fr)}.mm-divider{display:none}.mm-workspace .mm-library-nav{grid-column:1;grid-row:1/3}.mm-workspace .mm-library{grid-column:2;grid-row:1;padding:20px 18px}.mm-workspace .mm-entry-list{max-height:none}.mm-workspace .mm-editor{grid-column:2;grid-row:2;border-top:1px solid var(--mm-border)}.mm-config-layout{grid-template-columns:140px minmax(0,1fr);gap:25px}.mm-config-nav button{padding:10px}.mm-config-nav p{padding:14px 10px}}\r\n@container(max-width:600px){.mm-page{overflow:auto}.mm-workspace,.mm-workspace.has-editor{display:flex;flex-direction:column;overflow:visible;flex:none}.mm-library-nav{max-height:200px;border-bottom:1px solid var(--mm-border);padding:15px}.mm-group-list{flex-direction:column;overflow-y:auto}.mm-group{width:100%;max-width:none;min-width:0;flex-shrink:0}.mm-workspace .mm-library{height:350px;flex:none}.mm-workspace .mm-editor{max-height:620px;flex:none}.mm-workspace .mm-entry-list{overflow-y:auto}.mm-config-layout{display:block;padding-top:20px}.mm-config-nav{flex-direction:row;overflow-x:auto;margin-bottom:25px}.mm-config-nav button{white-space:nowrap;flex-shrink:0}.mm-config-nav svg,.mm-config-nav p{display:none}.mm-settings{overflow:visible;flex:none;padding:0 18px 20px}.mm-settings-footer{bottom:0}.mm-editor-footer{bottom:-23px}.mm-header{padding:20px 18px}.mm-config-section h2{font-size:22px}}\r\n\r\n\r\n/* Cross-project access matrix (settings \u2192 recall). */\r\n.mm-access{margin-top:26px;padding-top:22px;border-top:1px solid var(--mm-border)}\r\n.mm-access-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:22px;margin-bottom:16px}\r\n.mm-access-heading h3{font-size:14px;font-weight:600;margin-bottom:6px}\r\n.mm-access-heading p{color:var(--mm-muted);font-size:12px;line-height:1.8;max-width:62ch}\r\n.mm-access-filter{flex-shrink:0;min-width:170px}\r\n.mm-access-list{list-style:none;display:flex;flex-direction:column;gap:10px;margin:0;padding:0}\r\n.mm-access-card{border:1px solid var(--mm-border);border-radius:8px;background:var(--mm-bg)}\r\n.mm-access-head{display:flex;align-items:center;gap:12px;padding:9px 11px}\r\n.mm-access-name{display:flex;align-items:center;gap:9px;flex:1;min-width:0;background:transparent;border:0;padding:0;text-align:left;cursor:pointer;color:inherit}\r\n.mm-access-name svg{flex-shrink:0;color:var(--mm-muted)}\r\n.mm-access-name strong{display:block;font-size:13px;font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\r\n.mm-access-name small{display:block;font-size:11px;color:var(--mm-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}\r\n.mm-access-count{flex-shrink:0;font-size:11px;color:var(--mm-muted);font-variant-numeric:tabular-nums}\r\n.mm-access-options{border-top:1px solid var(--mm-border);padding:6px 11px 10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:2px 22px}\r\n.mm-access-option{display:flex;align-items:flex-start;gap:9px;padding:7px 0;cursor:pointer;min-width:0}\r\n.mm-access-option input{flex-shrink:0;margin-top:2px;accent-color:var(--mm-accent)}\r\n.mm-access-option strong{display:block;font-size:12px;font-weight:550}\r\n.mm-access-option small{display:block;font-size:11px;color:var(--mm-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px}\r\n@container(max-width:600px){.mm-access-heading{flex-direction:column;gap:12px}.mm-access-options{grid-template-columns:1fr}.mm-access-filter{min-width:0;width:100%}}\r\n.mm-access-locked{margin-top:9px;font-size:12px;line-height:1.7;color:var(--mm-fg);background:var(--mm-hover);border:1px solid var(--mm-border);border-radius:6px;padding:7px 10px}\r\n.mm-move-confirm{margin-top:15px;padding:16px;border:1px solid var(--mm-border);border-radius:7px;font-size:12px}.mm-move-confirm strong{display:block}.mm-move-confirm select{width:100%;margin:11px 0}.mm-move-confirm p{margin:0 0 12px;color:var(--mm-muted);line-height:1.7}.mm-move-confirm>div{display:flex;justify-content:flex-end;gap:8px}\r\n\r\n/* Clearing a whole project scope: destructive, so it is confirmed like a delete. */\r\n.mm-library-actions{display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end}\r\n.mm-reset-confirm{margin:0 0 18px;padding:16px;border:1px solid var(--mm-error);border-radius:7px;font-size:12px;background:var(--mm-bg);flex-shrink:0}\r\n.mm-reset-confirm strong{display:block;color:var(--mm-error)}\r\n.mm-reset-confirm p{margin:8px 0 0;color:var(--mm-muted);line-height:1.7;overflow-wrap:anywhere}\r\n.mm-reset-confirm .mm-reset-warning{color:var(--mm-fg)}\r\n.mm-reset-confirm>div{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}";

// src/client/MemoryPage.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var targetOf = (group) => ({ scope: group.scope, ...group.scope === "project" ? { projectId: group.id } : {} });
var emptyMemory = (group) => ({ id: "", name: "", title: "", description: "", type: group.scope === "user" ? "user" : "project", scope: group.scope, body: "", tags: [], aliases: [], paths: [], created: "", modified: "", revision: 0, pinned: false, status: "active", source: { kind: "explicit-user", session: "memory-page", turn: 0 }, filePath: "", hash: "", sourceKey: group.scope === "user" ? "user" : group.id });
var errorText = (error) => error instanceof Error ? error.message : String(error);
var modifiedLabel = (value) => new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "short", day: "numeric" });
function MatchFields({ memory, update }) {
  const [lines, setLines] = (0, import_react3.useState)({ tags: memory.tags.join(", "), aliases: memory.aliases.join(", "), paths: memory.paths.join(", ") });
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("details", { className: "mm-metadata", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("summary", { children: "\u6807\u7B7E\u4E0E\u5339\u914D\u7EBF\u7D22" }),
    ["tags", "aliases", "paths"].map((key) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
      key === "tags" ? "\u6807\u7B7E\uFF08\u9017\u53F7\u5206\u9694\uFF09" : key === "aliases" ? "\u522B\u540D\uFF08\u9017\u53F7\u5206\u9694\uFF09" : "\u5173\u8054\u6587\u4EF6\u8DEF\u5F84\uFF08\u9017\u53F7\u5206\u9694\uFF09",
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { value: lines[key], onChange: (event) => {
        const value = event.target.value;
        setLines((current) => ({ ...current, [key]: value }));
        update(key, value.split(/[,，]/).map((value2) => value2.trim()).filter(Boolean));
      } })
    ] }, key))
  ] });
}
function MemoryPage({ api: api2 = api }) {
  const [groups, setGroups] = (0, import_react3.useState)([]);
  const [selected, setSelected] = (0, import_react3.useState)("user");
  const [tab, setTab] = (0, import_react3.useState)("memories");
  const [search, setSearch] = (0, import_react3.useState)("");
  const [editor, setEditor] = (0, import_react3.useState)(null);
  const [original, setOriginal] = (0, import_react3.useState)(null);
  const [view, setView] = (0, import_react3.useState)(null);
  const [settings, setSettings] = (0, import_react3.useState)(null);
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [loading, setLoading] = (0, import_react3.useState)(true);
  const [reading, setReading] = (0, import_react3.useState)(false);
  const [error, setError] = (0, import_react3.useState)("");
  const [notice, setNotice] = (0, import_react3.useState)("");
  const [deleteConfirm, setDeleteConfirm] = (0, import_react3.useState)(false);
  const [resetConfirm, setResetConfirm] = (0, import_react3.useState)(false);
  const [moveTo, setMoveTo] = (0, import_react3.useState)(null);
  const readController = (0, import_react3.useRef)(null);
  const movePanel = (0, import_react3.useRef)(null);
  const resetPanel = (0, import_react3.useRef)(null);
  const group = groups.find((g) => g.id === selected) ?? groups[0];
  const dirty = editor !== null && JSON.stringify(editor) !== JSON.stringify(original);
  const settingsDirty = settings !== null && JSON.stringify(settings) !== JSON.stringify(view?.values);
  async function load(signal) {
    const [rows, config] = await Promise.all([api2.groups(signal), api2.settings(signal)]);
    setGroups(rows);
    setView(config);
    setSettings(config.values);
    setLoading(false);
  }
  (0, import_react3.useEffect)(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((error2) => {
      if (!controller.signal.aborted) {
        setError(errorText(error2));
        setLoading(false);
      }
    });
    return () => {
      controller.abort();
      readController.current?.abort();
    };
  }, [api2]);
  (0, import_react3.useEffect)(() => {
    const warn = (event) => {
      if (dirty || settingsDirty) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, settingsDirty]);
  (0, import_react3.useEffect)(() => {
    if (moveTo !== null) movePanel.current?.scrollIntoView({ block: "nearest" });
  }, [moveTo]);
  (0, import_react3.useEffect)(() => {
    if (resetConfirm) resetPanel.current?.scrollIntoView({ block: "nearest" });
  }, [resetConfirm]);
  const leaveEditor = () => !dirty || window.confirm("\u8FD9\u6761\u8BB0\u5FC6\u6709\u672A\u4FDD\u5B58\u7684\u66F4\u6539\u3002\u653E\u5F03\u66F4\u6539\uFF1F");
  const chooseGroup = (id) => {
    if (!leaveEditor()) return;
    readController.current?.abort();
    setReading(false);
    setSelected(id);
    setEditor(null);
    setOriginal(null);
    setDeleteConfirm(false);
    setResetConfirm(false);
    setMoveTo(null);
    setError("");
    setSearch("");
  };
  const changeTab = (next) => {
    if (busy) return;
    if (next === tab) return;
    if (tab === "memories" && !leaveEditor()) return;
    readController.current?.abort();
    setReading(false);
    setEditor(null);
    setOriginal(null);
    setDeleteConfirm(false);
    setResetConfirm(false);
    setMoveTo(null);
    setTab(next);
    setError("");
  };
  async function open(name) {
    if (!group || !leaveEditor()) return;
    readController.current?.abort();
    const controller = new AbortController();
    readController.current = controller;
    setReading(true);
    setEditor(null);
    setOriginal(null);
    setError("");
    setNotice("");
    setDeleteConfirm(false);
    setResetConfirm(false);
    setMoveTo(null);
    try {
      const memory = await api2.read(targetOf(group), name, controller.signal);
      if (!controller.signal.aborted) {
        setEditor(memory);
        setOriginal(memory);
      }
    } catch (error2) {
      if (!controller.signal.aborted) setError(errorText(error2));
    } finally {
      if (!controller.signal.aborted) setReading(false);
    }
  }
  async function perform(action) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (error2) {
      setError(errorText(error2));
    } finally {
      setBusy(false);
    }
  }
  async function saveMemory() {
    if (!editor || !group) return;
    const data = {
      name: editor.name,
      title: editor.title,
      description: editor.description,
      type: editor.type,
      body: editor.body,
      tags: editor.tags,
      aliases: editor.aliases,
      paths: editor.paths,
      pinned: editor.pinned,
      status: editor.status,
      source: editor.source,
      ...targetOf(group),
      expectedRevision: original?.revision ?? 0,
      expectedHash: original?.hash ?? ""
    };
    await perform(async () => {
      const result = await api2.write(data);
      setEditor(result.memory);
      setOriginal(result.memory);
      setGroups(await api2.groups());
      setNotice(result.warnings.length ? `\u5DF2\u4FDD\u5B58\uFF1B\u4E0A\u4E0B\u6587\u5237\u65B0\u5F02\u5E38\uFF1A${result.warnings.join("\uFF1B")}` : "\u8BB0\u5FC6\u5DF2\u4FDD\u5B58\uFF0C\u4E0B\u4E00\u6B21\u8BF7\u6C42\u5373\u53EF\u4F7F\u7528\u3002");
    });
  }
  async function removeMemory() {
    if (!editor || !group) return;
    await perform(async () => {
      const result = await api2.forget(targetOf(group), editor);
      setEditor(null);
      setOriginal(null);
      setDeleteConfirm(false);
      setGroups(await api2.groups());
      setNotice(result.warnings.length ? `\u5DF2\u5220\u9664\uFF1B\u4E0A\u4E0B\u6587\u5237\u65B0\u5F02\u5E38\uFF1A${result.warnings.join("\uFF1B")}` : "\u8BB0\u5FC6\u5DF2\u5220\u9664\uFF0C\u540E\u53F0\u63D0\u70BC\u4E0D\u4F1A\u81EA\u52A8\u6062\u590D\u5B83\u3002");
    });
  }
  async function moveMemory() {
    if (!editor || !group || moveTo === null) return;
    const destination = groups.find((item) => item.id === moveTo);
    if (!destination) return;
    await perform(async () => {
      const result = await api2.move(targetOf(group), targetOf(destination), editor);
      const rows = await api2.groups();
      setGroups(rows);
      const landed = rows.find((item) => item.id === destination.id);
      readController.current?.abort();
      setReading(false);
      setMoveTo(null);
      setDeleteConfirm(false);
      setResetConfirm(false);
      setSearch("");
      setSelected(landed?.id ?? destination.id);
      if (landed) {
        try {
          const memory = await api2.read(targetOf(landed), result.memory.name);
          setEditor(memory);
          setOriginal(memory);
        } catch {
          setEditor(null);
          setOriginal(null);
        }
      } else {
        setEditor(null);
        setOriginal(null);
      }
      setNotice(result.warnings.length ? `\u5DF2\u79FB\u52A8\u5230\u300C${destination.label}\u300D\uFF1B\u4E0A\u4E0B\u6587\u5237\u65B0\u5F02\u5E38\uFF1A${result.warnings.join("\uFF1B")}` : `\u5DF2\u79FB\u52A8\u5230\u300C${destination.label}\u300D\uFF0C\u4E0B\u4E00\u6B21\u8BF7\u6C42\u5373\u53EF\u4F7F\u7528\u3002`);
    });
  }
  async function resetProject() {
    if (!group || group.scope !== "project" || !group.project) return;
    const scope = group;
    await perform(async () => {
      const result = await api2.reset(targetOf(scope));
      const rows = await api2.groups();
      setGroups(rows);
      readController.current?.abort();
      setReading(false);
      setEditor(null);
      setOriginal(null);
      setDeleteConfirm(false);
      setResetConfirm(false);
      setMoveTo(null);
      setSearch("");
      const cancelled = result.cancelledExtractions ? `\u3001\u5DF2\u53D6\u6D88\u6392\u961F\u4E2D\u7684 ${result.cancelledExtractions} \u4E2A\u63D0\u70BC\u4EFB\u52A1` : "";
      setNotice(result.warnings.length ? `\u5DF2\u6E05\u7A7A\u300C${scope.label}\u300D\u7684\u9879\u76EE\u8BB0\u5FC6\uFF1A\u5220\u9664 ${result.removed} \u6761${cancelled}\uFF1B\u4E0A\u4E0B\u6587\u5237\u65B0\u5F02\u5E38\uFF1A${result.warnings.join("\uFF1B")}` : `\u5DF2\u6E05\u7A7A\u300C${scope.label}\u300D\u7684\u9879\u76EE\u8BB0\u5FC6\uFF1A\u5220\u9664 ${result.removed} \u6761${cancelled}\u3002\u63D0\u70BC\u68C0\u67E5\u70B9\u5DF2\u4E00\u5E76\u5220\u9664\uFF0C\u540E\u53F0\u63D0\u70BC\u4ECD\u53EF\u80FD\u6839\u636E\u4F1A\u8BDD\u5386\u53F2\u91CD\u65B0\u751F\u6210\u8BB0\u5FC6\u3002`);
    });
  }
  const entries = group?.entries.filter((memory) => `${memory.title} ${memory.description} ${memory.name} ${memory.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const projects = groups.filter((item) => item.scope === "project" && item.project);
  const destinations = groups.filter((item) => item.id !== group?.id && (item.scope === "user" || item.project));
  const grants = view ? grantsSupported(view.values) : false;
  const update = (key, value) => setEditor((current) => current && { ...current, [key]: value });
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { className: "mm-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("style", { children: style_default }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("header", { className: "mm-header", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-heading", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "mm-mark", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Icon, { size: 25 }) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h1", { children: "\u8BB0\u5FC6" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: "\u8BA9\u6709\u7528\u7684\u4FE1\u606F\uFF0C\u7559\u5230\u4E0B\u4E00\u6B21\u3002" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-top-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "mm-button mm-icon-button", title: "\u5237\u65B0", "aria-label": "\u5237\u65B0\u8BB0\u5FC6", disabled: busy || loading, onClick: () => {
          if (!leaveEditor() || settingsDirty && !window.confirm("\u5237\u65B0\u4F1A\u653E\u5F03\u672A\u4FDD\u5B58\u7684\u914D\u7F6E\u3002\u7EE7\u7EED\uFF1F")) return;
          setEditor(null);
          setOriginal(null);
          void perform(async () => {
            await load();
            setNotice("\u5DF2\u5237\u65B0\u3002");
          });
        }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Icon, { name: "refresh" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("nav", { className: "mm-tabs", "aria-label": "\u8BB0\u5FC6\u9875\u9762", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: tab === "memories" ? "is-active" : "", onClick: () => changeTab("memories"), children: "\u8BB0\u5FC6\u5E93" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("button", { className: tab === "settings" ? "is-active" : "", onClick: () => changeTab("settings"), children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Icon, { name: "settings" }),
            "\u914D\u7F6E",
            settingsDirty && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "mm-dot" })
          ] })
        ] })
      ] })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-message mm-error", role: "alert", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: "\u64CD\u4F5C\u672A\u5B8C\u6210" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: error }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "mm-button", disabled: busy, onClick: () => void perform(async () => {
        await load();
        setNotice("\u5DF2\u91CD\u65B0\u52A0\u8F7D\u5217\u8868\u4E0E\u914D\u7F6E\u3002\u7F16\u8F91\u8349\u7A3F\u4FDD\u7559\uFF1B\u8BF7\u91CD\u65B0\u6253\u5F00\u8BB0\u5FC6\u83B7\u53D6\u6700\u65B0\u7248\u672C\u3002");
      }), children: "\u91CD\u65B0\u52A0\u8F7D" })
    ] }),
    notice && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-message", role: "status", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Icon, { name: "check" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: notice })
    ] }),
    loading ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-loading", "aria-label": "\u6B63\u5728\u52A0\u8F7D\u8BB0\u5FC6", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", {}),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", {}),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", {})
    ] }) : tab === "settings" && view && settings ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Settings, { view, values: settings, setValues: setSettings, busy, dirty: settingsDirty, projects, grantsSupported: grants, reset: () => setSettings(view.values), save: () => void perform(async () => {
      const result = await api2.saveSettings(settingsPayload(settings, projects), view.hash);
      setView(result);
      setSettings(result.values);
      const stale = result.stale?.length ? `\u5DF2\u5FFD\u7565\u4E0D\u5B58\u5728\u7684\u9879\u76EE\uFF1A${result.stale.join("\u3001")}\u3002` : "";
      setNotice(result.warnings?.length ? `\u914D\u7F6E\u5DF2\u4FDD\u5B58\uFF1B${result.warnings.join("\uFF1B")}` : `\u914D\u7F6E\u5DF2\u4FDD\u5B58\u5E76\u751F\u6548\u3002${stale}`);
    }) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(PaneLayout, { navigation: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("aside", { className: "mm-library-nav", "aria-label": "\u8BB0\u5FC6\u8303\u56F4", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h2", { children: "\u4E2A\u4EBA\u4E0E\u9879\u76EE" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "mm-group-list", children: groups.map((item) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("button", { className: `mm-group ${selected === item.id ? "is-active" : ""}`, "aria-pressed": selected === item.id, disabled: busy, onClick: () => chooseGroup(item.id), children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Icon, { name: item.scope === "user" ? "user" : "folder" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("strong", { children: item.label }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("small", { children: item.scope === "user" ? "\u8DE8\u9879\u76EE\u5171\u4EAB" : item.project?.cwd ?? "\u5143\u6570\u636E\u5F02\u5E38" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "mm-count", children: item.entries.length })
      ] }, item.id)) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "mm-nav-note", children: "\u9879\u76EE\u6765\u81EA\u4F1A\u8BDD\u5DE5\u4F5C\u533A\u3002\u72EC\u7ACB\u4ED3\u5E93\u5404\u81EA\u4FDD\u5B58\uFF0C\u540C\u4E00\u4ED3\u5E93\u7684 worktree \u5171\u7528\u8BB0\u5FC6\u3002" })
    ] }), library: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("main", { className: "mm-library", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-library-heading", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h2", { children: group?.label ?? "\u8BB0\u5FC6\u5E93" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: group?.scope === "user" ? "\u4F60\u7684\u504F\u597D\u4E0E\u957F\u671F\u7EA6\u5B9A\uFF0C\u9002\u7528\u4E8E\u4E0D\u540C\u9879\u76EE\u3002" : group?.project?.cwd ?? "\u9009\u62E9\u4E00\u4E2A\u8303\u56F4\u67E5\u770B\u8BB0\u5FC6\u3002" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-library-actions", children: [
          group?.scope === "project" && group.project && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("button", { className: "mm-button mm-danger", disabled: busy, title: "\u5220\u9664\u8FD9\u4E2A\u9879\u76EE\u7684\u5168\u90E8\u8BB0\u5FC6\uFF0C\u5305\u62EC\u4FEE\u8BA2\u5386\u53F2\u3001\u9057\u5FD8\u6807\u8BB0\u4E0E\u63D0\u70BC\u68C0\u67E5\u70B9", onClick: () => {
            if (!leaveEditor()) return;
            setMoveTo(null);
            setError("");
            setResetConfirm(true);
          }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Icon, { name: "trash" }),
            "\u6E05\u7A7A\u9879\u76EE\u8BB0\u5FC6"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("button", { className: "mm-button mm-primary", disabled: busy || !group || !!group.diagnostics.length && !group.project && group.scope === "project", onClick: () => {
            if (!group || !leaveEditor()) return;
            readController.current?.abort();
            setReading(false);
            const fresh = emptyMemory(group);
            setEditor(fresh);
            setOriginal(fresh);
            setDeleteConfirm(false);
            setResetConfirm(false);
            setError("");
          }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Icon, { name: "plus" }),
            "\u65B0\u5EFA\u8BB0\u5FC6"
          ] })
        ] })
      ] }),
      resetConfirm && group?.scope === "project" && group.project && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-reset-confirm", role: "alertdialog", "aria-label": "\u6E05\u7A7A\u9879\u76EE\u8BB0\u5FC6", ref: resetPanel, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("strong", { children: [
          "\u6E05\u7A7A\u300C",
          group.label,
          "\u300D\u7684\u5168\u90E8\u8BB0\u5FC6\uFF1F"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { children: [
          "\u5C06\u5220\u9664 ",
          group.entries.length,
          " \u6761\u8BB0\u5FC6\uFF0C\u4EE5\u53CA\u5B83\u4EEC\u7684\u4FEE\u8BA2\u5386\u53F2\u3001\u9057\u5FD8\u6807\u8BB0\u4E0E\u63D0\u70BC\u68C0\u67E5\u70B9\uFF08",
          group.project.cwd,
          "\uFF09\u3002\u6B64\u64CD\u4F5C\u4E0D\u53EF\u64A4\u9500\u3002"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "mm-reset-warning", children: "\u5220\u9664\u540E\uFF0C\u540E\u53F0\u63D0\u70BC\u4ECD\u53EF\u80FD\u6839\u636E\u4F1A\u8BDD\u5386\u53F2\u91CD\u65B0\u751F\u6210\u8BB0\u5FC6\uFF1B\u5982\u9700\u5F7B\u5E95\u505C\u7528\uFF0C\u8BF7\u5728\u914D\u7F6E\u91CC\u5173\u95ED\u81EA\u52A8\u63D0\u70BC\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "mm-button", type: "button", disabled: busy, onClick: () => setResetConfirm(false), children: "\u53D6\u6D88" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "mm-button mm-danger", type: "button", disabled: busy, onClick: () => void resetProject(), children: "\u786E\u8BA4\u5220\u9664" })
        ] })
      ] }),
      group?.diagnostics.map((diagnostic, i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "mm-message mm-error", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
        diagnostic.code,
        "\uFF1A",
        diagnostic.message
      ] }) }, i)),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "mm-list-tools", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "mm-search", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Icon, { name: "search" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { "aria-label": "\u641C\u7D22\u8BB0\u5FC6", value: search, onChange: (event) => setSearch(event.target.value), placeholder: "\u641C\u7D22\u6807\u9898\u3001\u6458\u8981\u6216\u6807\u7B7E" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "mm-entry-list", children: entries.length ? entries.map((memory) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("button", { className: `mm-entry ${editor?.name === memory.name ? "is-active" : ""}`, disabled: busy, onClick: () => void open(memory.name), children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-entry-title", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: memory.title }),
          memory.status === "disabled" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "mm-muted", children: "\u5DF2\u505C\u7528" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: memory.description }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-entry-bottom", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
            memory.name,
            ".md"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "mm-date", children: new Date(memory.modified).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }) })
        ] })
      ] }, memory.id)) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-empty", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Icon, { size: 35 }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: search ? "\u6CA1\u6709\u5339\u914D\u7684\u8BB0\u5FC6" : "\u8FD9\u91CC\u8FD8\u6CA1\u6709\u8BB0\u5FC6" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: search ? "\u6362\u4E00\u4E2A\u5173\u952E\u8BCD\u518D\u8BD5\u8BD5\u3002" : "\u4ECE\u4E00\u6761\u503C\u5F97\u4FDD\u7559\u7684\u7EA6\u5B9A\u5F00\u59CB\u3002\u4F60\u4E5F\u53EF\u4EE5\u5728\u5BF9\u8BDD\u4E2D\u8BA9 Agent \u8BB0\u4F4F\u5B83\u3002" })
      ] }) })
    ] }), editor: editor || reading ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("aside", { className: "mm-editor", "aria-label": "\u8BB0\u5FC6\u7F16\u8F91\u5668", children: reading ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-loading", "aria-label": "\u6B63\u5728\u8BFB\u53D6\u8BB0\u5FC6", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", {}),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", {})
    ] }) : editor && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("form", { onSubmit: (event) => {
      event.preventDefault();
      void saveMemory();
    }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("fieldset", { disabled: busy, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-editor-heading", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h2", { children: original?.revision ? "\u7F16\u8F91\u8BB0\u5FC6" : "\u65B0\u5EFA\u8BB0\u5FC6" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: original?.revision ? `\u4E0A\u6B21\u4FEE\u6539 ${modifiedLabel(original.modified)} \xB7 ${group?.label}` : group?.label })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "mm-button", disabled: busy, onClick: () => {
          if (leaveEditor()) {
            setEditor(null);
            setOriginal(null);
          }
        }, children: "\u5173\u95ED" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
        "\u6807\u9898",
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { required: true, maxLength: 160, value: editor.title, onChange: (event) => update("title", event.target.value), placeholder: "\u4E00\u53E5\u8BDD\u63CF\u8FF0\u8FD9\u6761\u8BB0\u5FC6" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "mm-editor-row", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
        "\u6587\u4EF6\u540D",
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { required: true, pattern: "[a-z0-9]+(-[a-z0-9]+)*", value: editor.name, readOnly: !!original?.revision, onChange: (event) => update("name", event.target.value), placeholder: "memory-name" })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { children: [
        "\u77ED\u6458\u8981",
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("textarea", { required: true, maxLength: 500, rows: 2, value: editor.description, onChange: (event) => update("description", event.target.value), placeholder: "\u7528\u6765\u5224\u65AD\u4F55\u65F6\u53EC\u56DE\uFF0C\u4E0D\u653E\u6574\u6BB5\u6B63\u6587" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "mm-body-label", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
          "\u6B63\u6587 ",
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("small", { children: "Markdown" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("textarea", { className: "mm-body", required: true, maxLength: 32e3, rows: 10, value: editor.body, onChange: (event) => update("body", event.target.value), placeholder: "## \u7ED3\u8BBA\n\u5199\u4E0B\u9700\u8981\u957F\u671F\u4FDD\u7559\u7684\u4FE1\u606F\u3002" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(MatchFields, { memory: editor, update }, `${editor.name}:${editor.revision}`),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "mm-checkbox", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { type: "checkbox", checked: editor.status === "active", onChange: (event) => update("status", event.target.checked ? "active" : "disabled") }),
        "\u53C2\u4E0E\u53EC\u56DE"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("footer", { className: "mm-editor-footer", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: dirty ? "\u6709\u672A\u4FDD\u5B58\u7684\u66F4\u6539" : "\u5DF2\u4FDD\u5B58" }),
        !!original?.revision && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("button", { type: "button", className: "mm-button", disabled: busy || dirty || !destinations.length, title: dirty ? "\u5148\u4FDD\u5B58\u6216\u653E\u5F03\u672A\u4FDD\u5B58\u7684\u66F4\u6539\uFF0C\u518D\u79FB\u52A8\u8FD9\u6761\u8BB0\u5FC6" : destinations.length ? "\u79FB\u52A8\u5230\u5176\u4ED6\u9879\u76EE\u6216\u7528\u6237\u8BB0\u5FC6" : "\u8FD8\u6CA1\u6709\u5176\u4ED6\u53EF\u79FB\u52A8\u5230\u7684\u8303\u56F4", onClick: () => {
          setMoveTo((current) => current ?? destinations[0]?.id ?? null);
          setDeleteConfirm(false);
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Icon, { name: "move" }),
          "\u79FB\u52A8"
        ] }),
        !!original?.revision && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("button", { type: "button", className: "mm-button mm-danger", disabled: busy, onClick: () => {
          setMoveTo(null);
          setDeleteConfirm(true);
        }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Icon, { name: "trash" }),
          "\u5220\u9664"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "mm-button mm-primary", disabled: busy || !dirty, children: busy ? "\u4FDD\u5B58\u4E2D\u2026" : "\u4FDD\u5B58\u8BB0\u5FC6" })
      ] }),
      moveTo !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-move-confirm", role: "dialog", "aria-label": "\u79FB\u52A8\u8BB0\u5FC6", ref: movePanel, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("strong", { children: [
          "\u628A\u201C",
          editor.title,
          "\u201D\u79FB\u52A8\u5230\u54EA\u91CC\uFF1F"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("select", { "aria-label": "\u79FB\u52A8\u76EE\u6807\u8303\u56F4", value: moveTo, onChange: (event) => setMoveTo(event.target.value), children: destinations.map((item) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: item.id, children: item.scope === "user" ? "\u7528\u6237\u8BB0\u5FC6\uFF08\u8DE8\u9879\u76EE\u5171\u4EAB\uFF09" : `${item.label} \xB7 ${item.project?.cwd ?? item.id}` }, item.id)) }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: "\u8BB0\u5FC6\u7684\u6B63\u6587\u3001\u6807\u7B7E\u4E0E\u521B\u5EFA\u65F6\u95F4\u4E00\u8D77\u79FB\u52A8\u5230\u6B64\u8303\u56F4\u3002\u539F\u8303\u56F4\u4F1A\u5220\u9664\u6B63\u6587\u4E0E\u4FEE\u8BA2\uFF0C\u5E76\u7559\u4E0B\u9057\u5FD8\u6807\u8BB0\uFF0C\u540E\u53F0\u63D0\u70BC\u4E0D\u4F1A\u628A\u5B83\u5199\u56DE\u539F\u8303\u56F4\u3002" }),
        dirty && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: "\u8BF7\u5148\u4FDD\u5B58\u6216\u653E\u5F03\u672A\u4FDD\u5B58\u7684\u66F4\u6539\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "mm-button", disabled: busy, onClick: () => setMoveTo(null), children: "\u53D6\u6D88" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", className: "mm-button mm-primary", disabled: busy || dirty, onClick: () => void moveMemory(), children: "\u786E\u8BA4\u79FB\u52A8" })
        ] })
      ] }),
      deleteConfirm && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-delete-confirm", role: "alert", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("strong", { children: [
          "\u5220\u9664\u201C",
          editor.title,
          "\u201D\uFF1F"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: "\u6B63\u6587\u4E0E\u4FEE\u8BA2\u5386\u53F2\u5C06\u5220\u9664\uFF0C\u5E76\u6807\u8BB0\u4E3A\u5DF2\u9057\u5FD8\u3002" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "mm-button", type: "button", disabled: busy, onClick: () => setDeleteConfirm(false), children: "\u53D6\u6D88" }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { className: "mm-button mm-danger", type: "button", disabled: busy, onClick: () => void removeMemory(), children: "\u786E\u8BA4\u5220\u9664" })
        ] })
      ] })
    ] }) }) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("aside", { className: "mm-editor mm-editor-empty", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "mm-empty", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Icon, { size: 32 }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: "\u9009\u62E9\u4E00\u6761\u8BB0\u5FC6" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: "\u5728\u5217\u8868\u4E2D\u6253\u5F00\u8BB0\u5FC6\uFF0C\u6216\u65B0\u5EFA\u4E00\u6761\u503C\u5F97\u4FDD\u7559\u7684\u7EA6\u5B9A\u3002" })
    ] }) }) })
  ] });
}

// src/client/index.tsx
var inject = ["slots", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register("mdMemory", { zh: { panel: "\u8BB0\u5FC6" }, en: { panel: "Memory" } }), "md-memory: locale");
  const t = ctx.locale.bind("mdMemory");
  ctx.slots.inject("main", () => ctx.slots.register({ name: "main", key: "md-memory", inject: () => ({ api }) }, MemoryPage));
  ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({ name: "sidebar.panellist", id: "md-memory", order: 50, label: () => t("panel"), locale: "mdMemory" }, Icon));
}

return module.exports;}});
