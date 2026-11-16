/* 열방교회 확장 모듈 1/3 — 공통 도구 · 메뉴 · 사이트맵
   app.js 뒤에 불러옵니다. app.js의 state, saveState, $, fmt, num, uid, escapeHtml 등을 그대로 사용합니다. */
(function () {
  "use strict";
  const h = escapeHtml;
  const YB = (window.YB = { pages: [], byId: {}, current: "dashboard", h });

  /* ---------- 날짜 · 교인 도구 ---------- */
  YB.iso = (d) => d.toLocaleDateString("sv-SE");
  YB.parse = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  YB.addDays = (s, n) => { const d = YB.parse(s); d.setDate(d.getDate() + n); return YB.iso(d); };
  YB.sundayOf = (s) => { const d = YB.parse(s); d.setDate(d.getDate() - d.getDay()); return YB.iso(d); };
  YB.lastSunday = () => YB.sundayOf(todayISO());
  YB.thisMonth = () => todayISO().slice(0, 7);
  YB.inRange = (date, from, to) => !!date && (!from || date >= from) && (!to || date <= to);
  YB.monthDays = (month) => { const [y, m] = month.split("-").map(Number); const n = new Date(y, m, 0).getDate(); return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`); };
  YB.isActive = (m) => !INACTIVE_STATUSES.includes(m.status);
  YB.active = () => state.members.filter(YB.isActive).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  YB.member = (id) => state.members.find((m) => m.id === id);
  YB.name = (id) => YB.member(id)?.name || "";
  YB.label = (m) => donationMemberLabel(m);
  YB.findMember = (text) => {
    const v = String(text || "").trim(); if (!v) return null;
    const byLabel = state.members.find((m) => YB.label(m) === v); if (byLabel) return byLabel;
    const same = state.members.filter((m) => m.name === v); return same.length === 1 ? same[0] : null;
  };
  YB.netOf = (m) => (m.affiliation?.net ? `${m.affiliation.net}네트` : String(m.group || "").split(" › ")[0]) || "미지정";
  YB.nets = () => [...new Set(YB.active().map(YB.netOf))].sort((a, b) => a.localeCompare(b, "ko"));
  YB.netOptions = () => [["", "전체 소속"], ...YB.nets().map((n) => [n, n])];
  YB.age = (birth, at = todayISO()) => { if (!birth) return null; let a = Number(at.slice(0, 4)) - Number(birth.slice(0, 4)); if (at.slice(5) < birth.slice(5)) a -= 1; return a; };
  YB.preset = (p) => {
    const t = new Date(), y = t.getFullYear(), m = t.getMonth(), iso = YB.iso;
    switch (p) {
      case "week": { const s = YB.lastSunday(); return [s, YB.addDays(s, 6)]; }
      case "4weeks": return [YB.addDays(YB.lastSunday(), -21), todayISO()];
      case "month": return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
      case "lastMonth": return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
      case "lastYear": return [`${selectedYear - 1}-01-01`, `${selectedYear - 1}-12-31`];
      case "all": return ["", ""];
      default: return [`${selectedYear}-01-01`, `${selectedYear}-12-31`];
    }
  };
  YB.saveConfig = (message) => { state.config.updatedAt = Date.now(); saveState(message); };
  YB.sum = (items, key = "amount") => items.reduce((s, x) => s + Number(x[key] || 0), 0);

  /* ---------- 표 · 내보내기 · 인쇄 ---------- */
  const cellHtml = (c) => (c == null ? "" : typeof c === "number" ? num(c) : typeof c === "object" ? c.html : h(c));
  const cellText = (c) => (c == null ? "" : typeof c === "object" ? (c.text ?? "") : c);
  YB.tableHtml = (headers, rows, foot, empty = "자료가 없습니다.") => {
    const hs = headers.map((x) => (typeof x === "string" ? { label: x } : x));
    const right = hs.map((x, i) => x.right ?? rows.some((r) => typeof r[i] === "number"));
    const tr = (row, tag, cls = "") => `<tr class="${cls}">${row.map((c, i) => `<${tag} class="${right[i] ? "right" : ""}">${cellHtml(c)}</${tag}>`).join("")}</tr>`;
    return `<div class="table-wrap"><table class="yb-table"><thead><tr>${hs.map((x, i) => `<th class="${right[i] ? "right" : ""}">${h(x.label)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((r) => tr(r, "td", r.cls || "")).join("") : `<tr><td colspan="${hs.length}" class="empty-row">${h(empty)}</td></tr>`}</tbody>${foot && rows.length ? `<tfoot>${tr(foot, "th")}</tfoot>` : ""}</table></div>`;
  };
  YB.exportTable = (name, headers, rows, foot) => {
    const aoa = [headers.map((x) => (typeof x === "string" ? x : x.label)), ...rows.map((r) => r.map(cellText)), ...(foot ? [foot.map(cellText)] : [])];
    if (window.XLSX) { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "자료"); XLSX.writeFile(wb, `${name}_${todayISO()}.xlsx`); }
    else download(`${name}_${todayISO()}.csv`, csv(aoa), "text/csv;charset=utf-8");
  };
  YB.printHtml = (html) => { $("ybPrintArea").innerHTML = html; document.body.classList.add("yb-printing"); window.print(); };
  window.addEventListener("afterprint", () => document.body.classList.remove("yb-printing"));
  YB.bars = (items) => { const max = Math.max(1, ...items.map((x) => x.value)); return `<div class="yb-bars">${items.map((x) => `<div class="yb-bar-row"><span>${h(x.label)}</span><div class="progress"><span style="width:${(x.value / max) * 100}%"></span></div><b>${num(x.value)}${x.unit || ""}</b></div>`).join("")}</div>`; };
  YB.cards = (items) => `<div class="yb-cards">${items.map((x) => `<div class="yb-card"><span>${h(x.label)}</span><strong>${h(x.value)}</strong>${x.sub ? `<small>${h(x.sub)}</small>` : ""}</div>`).join("")}</div>`;
  YB.calendarHtml = (month, itemsByDate) => {
    const days = YB.monthDays(month), first = YB.parse(days[0]).getDay(), cells = [...Array(first).fill(null), ...days];
    while (cells.length % 7) cells.push(null);
    const rows = []; for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return `<table class="yb-calendar"><thead><tr>${["일", "월", "화", "수", "목", "금", "토"].map((d) => `<th>${d}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((d) => (d ? `<td class="${d === todayISO() ? "today" : ""}"><b>${Number(d.slice(8))}</b>${(itemsByDate[d] || []).map((t) => `<span class="${t.cls || ""}">${h(t.text || t)}</span>`).join("")}</td>` : "<td class='off'></td>")).join("")}</tr>`).join("")}</tbody></table>`;
  };

  /* ---------- 페이지 등록 ---------- */
  YB.page = (def) => { YB.pages.push(def); YB.byId[def.id] = def; return def; };
  YB.mount = (id) => {
    const page = YB.byId[id]; let el = $(`${id}View`);
    if (!el) { el = document.createElement("section"); el.className = "view"; el.id = `${id}View`; document.querySelector("main").appendChild(el); }
    else { const fresh = el.cloneNode(false); el.replaceWith(fresh); el = fresh; } // 이전 방문 때 붙인 이벤트를 정리
    page.render(el); page.refresh?.();
  };
  YB.refresh = () => { updateDatalist(); const page = YB.byId[YB.current]; if (page && !page.builtin && $(`${page.id}View`)) page.refresh?.(); };
  function updateDatalist() { const list = $("ybMembers"); if (list) list.innerHTML = YB.active().map((m) => `<option value="${h(YB.label(m))}"></option>`).join(""); }

  /* ---------- 조회(보고서)형 페이지 ---------- */
  const PRESETS = [["year", "선택 연도"], ["month", "이번 달"], ["lastMonth", "지난 달"], ["week", "이번 주"], ["4weeks", "최근 4주"], ["lastYear", "전년도"], ["all", "전체 기간"], ["custom", "직접 지정"]];
  function controlHtml(c, vals) {
    if (c.type === "range") return `<label>기간<select data-preset>${PRESETS.map(([v, l]) => `<option value="${v}" ${vals._preset === v ? "selected" : ""}>${l}</option>`).join("")}</select></label><label>시작일<input type="date" data-key="from" value="${h(vals.from)}"></label><label>종료일<input type="date" data-key="to" value="${h(vals.to)}"></label>`;
    const v = vals[c.key];
    if (c.type === "select") { const opts = (typeof c.options === "function" ? c.options() : c.options).map((o) => (Array.isArray(o) ? o : [o, o])); return `<label>${h(c.label)}<select data-key="${c.key}">${opts.map(([val, lab]) => `<option value="${h(val)}" ${String(val) === String(v) ? "selected" : ""}>${h(lab)}</option>`).join("")}</select></label>`; }
    if (c.type === "member") return `<label>${h(c.label)}<input list="ybMembers" data-key="${c.key}" value="${h(v)}" placeholder="이름 입력"></label>`;
    return `<label>${h(c.label)}<input type="${c.type || "text"}" data-key="${c.key}" value="${h(v)}" placeholder="${h(c.placeholder || "")}" ${c.min != null ? `min="${c.min}"` : ""}></label>`;
  }
  YB.report = (def) => {
    const init = () => { const v = {}; (def.controls || []).forEach((c) => { if (c.type === "range") { v._preset = c.default || "year"; [v.from, v.to] = YB.preset(v._preset); } else v[c.key] = typeof c.default === "function" ? c.default() : c.default ?? ""; }); return v; };
    return YB.page({
      ...def,
      render(el) {
        const vals = def._vals || (def._vals = init());
        el.innerHTML = `<div class="yb-toolbar no-print">${(def.controls || []).map((c) => controlHtml(c, vals)).join("")}<span class="yb-spacer"></span>${def.noExport ? "" : '<button class="ghost small" data-act="xlsx">엑셀 저장</button>'}<button class="ghost small" data-act="print">인쇄</button></div><article class="panel"><div class="panel-head"><div><p class="eyebrow">${h(def.group)}</p><h3>${h(def.title)}</h3></div><div class="yb-summary"></div></div>${def.note ? `<p class="muted yb-note no-print">${h(def.note)}</p>` : ""}<div class="yb-result"></div></article>`;
        el.querySelectorAll("[data-key]").forEach((inp) => inp.addEventListener("input", () => { vals[inp.dataset.key] = inp.value; if (["from", "to"].includes(inp.dataset.key)) { vals._preset = "custom"; const p = el.querySelector("[data-preset]"); if (p) p.value = "custom"; } this.refresh(); }));
        el.querySelector("[data-preset]")?.addEventListener("change", (e) => { vals._preset = e.target.value; if (vals._preset !== "custom") { [vals.from, vals.to] = YB.preset(vals._preset); el.querySelector('[data-key="from"]').value = vals.from; el.querySelector('[data-key="to"]').value = vals.to; } this.refresh(); });
        el.querySelector('[data-act="print"]').addEventListener("click", () => window.print());
        el.querySelector('[data-act="xlsx"]')?.addEventListener("click", () => { const o = def._last; if (!o?.headers) return toast("내보낼 표가 없습니다"); YB.exportTable(def.title, o.headers, o.rows, o.foot); });
        el.querySelector(".yb-result").addEventListener("click", (e) => { const b = e.target.closest("[data-action]"); if (b) def.onAction?.(b.dataset.action, b.dataset.id, vals, b); });
      },
      refresh() {
        const el = $(`${def.id}View`); if (!el || !def._vals) return;
        const out = def.compute(def._vals) || {}; def._last = out;
        el.querySelector(".yb-summary").innerHTML = out.summary || "";
        el.querySelector(".yb-result").innerHTML = (out.html || "") + (out.headers ? YB.tableHtml(out.headers, out.rows, out.foot, out.empty) : "");
      },
    });
  };

  /* ---------- 등록 + 목록(CRUD)형 페이지 ---------- */
  YB.crud = (def) => {
    const fields = def.fields;
    const coll = () => state[def.collection] || (state[def.collection] = []);
    const mine = () => coll().filter((r) => !def.kind || r.kind === def.kind);
    const optionsOf = (f) => (typeof f.options === "function" ? f.options() : f.options).map((o) => (Array.isArray(o) ? o : [o, o]));
    const fieldHtml = (f) => {
      const cls = f.full || f.type === "textarea" ? ' class="full"' : "", req = f.required ? "required" : "";
      if (f.type === "select") return `<label${cls}>${h(f.label)}<select data-f="${f.key}" ${req}>${f.noBlank ? "" : '<option value="">선택</option>'}${optionsOf(f).map(([v, l]) => `<option value="${h(v)}">${h(l)}</option>`).join("")}</select></label>`;
      if (f.type === "member") return `<label${cls}>${h(f.label)}<input list="ybMembers" data-f="${f.key}" placeholder="이름 입력 후 목록에서 선택" autocomplete="off" ${req}></label>`;
      if (f.type === "textarea") return `<label${cls}>${h(f.label)}<textarea data-f="${f.key}" rows="${f.rows || 3}" placeholder="${h(f.placeholder || "")}" ${req}></textarea></label>`;
      if (f.type === "checkbox") return `<label class="check-row"><input type="checkbox" data-f="${f.key}"> ${h(f.label)}</label>`;
      return `<label${cls}>${h(f.label)}<input type="${f.type || "text"}" data-f="${f.key}" placeholder="${h(f.placeholder || "")}" ${f.type === "number" ? `min="${f.min ?? 0}" step="1"` : ""} ${req}></label>`;
    };
    const show = (f, r) => { const v = r[f.key]; if (f.type === "member") return YB.name(v); if (f.type === "checkbox") return v ? "✓" : ""; if (f.type === "number") return v === "" || v == null ? "" : Number(v); if (f.type === "textarea") return String(v || "").length > 42 ? `${String(v).slice(0, 42)}…` : v || ""; return v ?? ""; };
    const columns = def.columns || fields.filter((f) => (f.type === "textarea" ? f.list === true : f.list !== false)).map((f) => ({ label: f.label, get: (r) => show(f, r) }));
    const dateOf = (r) => r.date || r.start || r.from || "";
    let editing = "";
    const page = YB.page({
      ...def,
      render(el) {
        editing = "";
        el.innerHTML = `<div class="section-grid form-layout"><article class="panel sticky-card no-print"><div class="panel-head"><div><p class="eyebrow">${h(def.group)}</p><h3 class="yb-form-title">${h(def.title)} 등록</h3></div></div><form class="form-grid yb-form">${fields.map(fieldHtml).join("")}<div class="yb-form-note full"></div><div class="form-actions full"><button type="button" class="ghost" data-act="reset">초기화</button><button class="primary" type="submit">저장하기</button></div></form></article><article class="panel"><div class="panel-head"><div><p class="eyebrow">LIST</p><h3>${h(def.listTitle || `${def.title} 목록`)}</h3></div><div class="filter-row no-print"><input class="yb-search" placeholder="검색"><button class="ghost small" data-act="xlsx">엑셀 저장</button><button class="ghost small" data-act="print">인쇄</button></div></div>${def.note ? `<p class="muted yb-note no-print">${h(def.note)}</p>` : ""}<div class="yb-extra"></div><div class="yb-summary yb-crud-summary"></div><div class="yb-list"></div></article></div>`;
        const form = el.querySelector(".yb-form"), input = (key) => form.querySelector(`[data-f="${key}"]`);
        const setForm = (r) => {
          fields.forEach((f) => { const inp = input(f.key), v = r ? r[f.key] : typeof f.default === "function" ? f.default() : f.default; if (f.type === "checkbox") inp.checked = !!v; else if (f.type === "member") inp.value = v && YB.member(v) ? YB.label(YB.member(v)) : ""; else inp.value = v ?? ""; });
          editing = r?.id || ""; el.querySelector(".yb-form-title").textContent = `${def.title} ${r ? "수정" : "등록"}`; note();
        };
        const raw = () => Object.fromEntries(fields.map((f) => { const inp = input(f.key); return [f.key, f.type === "checkbox" ? inp.checked : f.type === "number" ? (inp.value === "" ? "" : Number(inp.value)) : inp.value.trim()]; }));
        const note = () => { el.querySelector(".yb-form-note").innerHTML = def.formNote ? def.formNote(raw()) : ""; };
        form.addEventListener("input", note);
        form.addEventListener("submit", (e) => {
          e.preventDefault(); const values = raw();
          for (const f of fields.filter((x) => x.type === "member")) { if (!values[f.key]) continue; const m = YB.findMember(values[f.key]); if (!m) { toast(`'${values[f.key]}' 교인을 찾을 수 없습니다. 목록에서 선택해 주세요`); input(f.key).focus(); return; } values[f.key] = m.id; }
          const previous = coll().find((r) => r.id === editing) || {};
          const record = { ...previous, ...values, id: editing || uid(def.prefix || "rec"), updatedAt: Date.now() }; if (def.kind) record.kind = def.kind;
          const error = def.validate?.(record); if (error) return toast(error);
          const i = coll().findIndex((r) => r.id === record.id); i >= 0 ? (coll()[i] = record) : coll().push(record);
          setForm(null); saveState(i >= 0 ? "수정했습니다" : "저장했습니다");
        });
        form.querySelector('[data-act="reset"]').addEventListener("click", () => setForm(null));
        el.querySelector(".yb-search").addEventListener("input", () => this.refresh());
        el.querySelector('[data-act="print"]').addEventListener("click", () => window.print());
        el.querySelector('[data-act="xlsx"]').addEventListener("click", () => YB.exportTable(def.title, columns.map((c) => c.label), page._rows.map((r) => columns.map((c) => c.get(r)))));
        el.querySelector(".yb-list").addEventListener("click", (e) => {
          const b = e.target.closest("[data-row]"); if (!b) return; const r = coll().find((x) => x.id === b.dataset.id); if (!r) return;
          if (b.dataset.row === "edit") { setForm(r); window.scrollTo({ top: 0, behavior: "smooth" }); }
          else if (b.dataset.row === "delete") { if (confirm("이 기록을 삭제할까요?")) { window.YolbangSync?.queueDelete(def.collection, r.id); state[def.collection] = coll().filter((x) => x.id !== r.id); saveState("삭제했습니다"); } }
          else def.actions?.find((a) => a.key === b.dataset.row)?.run(r);
        });
        def.onMount?.(el, this);
        setForm(null);
      },
      refresh() {
        const el = $(`${def.id}View`); if (!el?.querySelector(".yb-list")) return;
        const q = el.querySelector(".yb-search").value.trim().toLowerCase();
        const all = mine().sort(def.sort || ((a, b) => dateOf(b).localeCompare(dateOf(a)) || Number(b.updatedAt || 0) - Number(a.updatedAt || 0)));
        const rows = all.filter((r) => !q || [...columns.map((c) => cellText(c.get(r))), ...fields.filter((f) => f.type === "textarea").map((f) => r[f.key] || "")].join(" ").toLowerCase().includes(q));
        page._rows = rows;
        el.querySelector(".yb-summary").innerHTML = def.summary ? def.summary(rows) : `<span class="chip">${rows.length}건</span>`;
        def.renderExtra?.(el.querySelector(".yb-extra"), all);
        el.querySelector(".yb-list").innerHTML = YB.tableHtml([...columns.map((c) => c.label), { label: "", right: true }], rows.map((r) => [...columns.map((c) => c.get(r)), { html: `<span class="row-actions no-print">${(def.actions || []).map((a) => `<button class="icon-button" data-row="${a.key}" data-id="${r.id}">${h(a.label)}</button>`).join("")}<button class="icon-button" data-row="edit" data-id="${r.id}">수정</button><button class="icon-button" data-row="delete" data-id="${r.id}">삭제</button></span>`, text: "" }]), null, "등록된 기록이 없습니다.");
      },
    });
    return page;
  };

  /* ---------- 기본(기존) 화면 등록 ---------- */
  YB.groups = ["재정 기록", "재정 검색", "재정 집계", "영수증", "교인", "출결", "보고서", "심방·돌봄", "교육·봉사", "교적 통계", "게시판·일정", "관리"];
  [
    ["dashboard", "처음 화면", "", "⌂", "재정 현황과 최근 거래를 한눈에 보는 첫 화면입니다."],
    ["donations", "헌금 기록", "재정 기록", "＋", "헌금 내용을 검색하고 기록하는 페이지입니다."],
    ["expenses", "지출 기록", "재정 기록", "−", "지출 내용을 검색하고 기록하는 페이지입니다."],
    ["reports", "회계 보고", "재정 집계", "▥", "연도별 수입·지출 항목 현황과 전년 대비 보고서입니다."],
    ["receipts", "기부금영수증 발급", "영수증", "▤", "교인의 헌금 내역을 조회한 뒤 기부금영수증을 출력합니다."],
    ["members", "교인 등록", "교인", "♙", "교인을 등록하고 정보를 수정하는 페이지입니다."],
    ["settings", "설정 · 백업", "관리", "⚙", "교회 정보, 온라인 동기화, 백업을 관리합니다."],
  ].forEach(([id, title, group, icon, desc]) => YB.page({ id, title, group, icon, desc, builtin: true }));

  /* ---------- 사이트맵 · 업데이트 내역 ---------- */
  YB.page({
    id: "sitemap", title: "사이트맵", group: "", icon: "▦", desc: "전체 메뉴를 한눈에 보고 키워드로 찾을 수 있습니다.",
    render(el) {
      el.innerHTML = `<div class="yb-toolbar"><label>키워드<input class="yb-sitemap-q" placeholder="메뉴 이름·설명 검색" autofocus></label><span class="yb-spacer"></span><span class="muted">전체 ${YB.pages.length - 1}개 메뉴</span></div><div class="yb-sitemap"></div>`;
      el.querySelector(".yb-sitemap-q").addEventListener("input", () => this.refresh());
      el.querySelector(".yb-sitemap").addEventListener("click", (e) => { const b = e.target.closest("[data-view]"); if (b) go(b.dataset.view); });
    },
    refresh() {
      const el = $("sitemapView"), q = el.querySelector(".yb-sitemap-q").value.trim().toLowerCase();
      const match = YB.pages.filter((p) => p.id !== "sitemap" && (!q || `${p.title} ${p.desc} ${p.group}`.toLowerCase().includes(q)));
      const sections = ["", ...YB.groups].map((g) => ({ g, items: match.filter((p) => (p.group || "") === g) })).filter((s) => s.items.length);
      el.querySelector(".yb-sitemap").innerHTML = sections.length ? sections.map((s) => `<h4 class="yb-sitemap-head">${h(s.g || "기본")}</h4><div class="yb-sitemap-grid">${s.items.map((p) => `<button class="yb-sitemap-card" data-view="${p.id}"><i>${h(p.icon || "•")}</i><strong>${h(p.title)}</strong><small>${h(p.desc || "")}</small></button>`).join("")}</div>`).join("") : '<div class="empty-state"><h3>일치하는 메뉴가 없습니다</h3></div>';
    },
  });
  YB.page({
    id: "updates", title: "업데이트 내역", group: "관리", icon: "📢", desc: "프로그램의 최근 업데이트 내역을 볼 수 있습니다.",
    render(el) {
      const log = [
        ["2026-11-16", "재정·교적 통합 확장", ["사이트맵과 그룹형 메뉴 추가", "재정: 반복지출, 권종구분, 회계 간 이체, 출금의뢰서, 특별재정, 헌물, 작정헌금, 기간·과목·출납 검색, 주일/월간/연간 집계표, 헌금자 명단·순위, 발급대장, 관리자 통계", "교적: 교인 상세 정보, 교인 검색·목록, 그룹, 제적 목록, 기념일, 출결(일별·주간·바코드·헌금), 결석자, 사역·셀·교회학교 보고서, 심방, 기도제목, 교육, 봉사, 각종 통계", "게시판(공지·자유), 경조/행사·교회일정 달력, 메모", "엑셀 데이터 입력(지출·교인), 일괄 데이터 처리, 항목 관리"]],
        ["이전", "재정관리 기본 기능", ["헌금·지출 입력, 교인 관리, 회계 보고, 기부금영수증, Firebase 온라인·오프라인 동기화"]],
      ];
      el.innerHTML = log.map(([date, title, items]) => `<article class="panel" style="margin-bottom:18px"><div class="panel-head"><div><p class="eyebrow">${h(date)}</p><h3>${h(title)}</h3></div></div><ul class="yb-ul">${items.map((x) => `<li>${h(x)}</li>`).join("")}</ul></article>`).join("");
    },
  });

  /* ---------- 사이드 메뉴 ---------- */
  YB.buildNav = () => {
    const nav = $("mainNav"), btn = (p) => `<button class="nav-item" data-view="${p.id}"><span>${h(p.icon || "•")}</span> ${h(p.title)}</button>`;
    nav.innerHTML = btn(YB.byId.dashboard) + btn(YB.byId.sitemap) + YB.groups.map((g) => { const items = YB.pages.filter((p) => p.group === g); return items.length ? `<details class="nav-group" data-group="${h(g)}"><summary>${h(g)}<em>${items.length}</em></summary>${items.map(btn).join("")}</details>` : ""; }).join("");
    nav.addEventListener("click", (e) => { const b = e.target.closest(".nav-item"); if (b) go(b.dataset.view); });
    YB.afterGo(YB.current);
  };
  YB.afterGo = (view) => {
    document.querySelectorAll("#mainNav .nav-item").forEach((x) => x.classList.toggle("active", x.dataset.view === view));
    const group = YB.byId[view]?.group; if (group) { const d = document.querySelector(`#mainNav details[data-group="${CSS.escape(group)}"]`); if (d) d.open = true; }
  };
  YB.logReceipt = (r) => {
    if (!r) return; const today = todayISO();
    if (state.receiptLog.some((x) => x.number === r.number && x.date === today && x.kind === r.kind && x.memberId === r.memberId)) return;
    state.receiptLog.push({ id: uid("rcp"), date: today, ...r, updatedAt: Date.now() }); saveState("발급대장에 기록했습니다");
  };
  YB.init = () => { YB.buildNav(); updateDatalist(); };
})();
