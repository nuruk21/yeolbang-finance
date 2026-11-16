const STORAGE_KEY = "yolbangChurchFinance.v1";
const firebaseStorageConfig = (()=>{try{return JSON.parse(localStorage.getItem("yolbangFirebaseConfig.v1"))||window.YOLBANG_FIREBASE_CONFIG||null;}catch{return window.YOLBANG_FIREBASE_CONFIG||null;}})();
const DATA_STORE = location.protocol!=="file:"&&firebaseStorageConfig&&!firebaseStorageConfig.trustedDevice ? sessionStorage : localStorage;
const now = new Date();
const thisYear = now.getFullYear();
const funds = ["일반회계", "특별회계", "선교헌금", "헌신자헌금"];
const incomeCategories = ["십일조", "주일헌금", "감사헌금", "건축헌금", "선교헌금", "헌신자헌금", "언약헌금", "신년감사", "부활절감사", "추수감사", "성탄감사", "절기헌금", "교육헌금", "기타헌금", "이자", "이월금"];
const expenseCategories = ["선교 및 전도비", "교육비", "사무비", "관리비", "목회활동비", "목회자 생활비", "G12 사역", "예배비", "구제·친교비", "적립금", "상납금", "건축비", "대출금 상환", "기타"];
const bundledMembers = Array.isArray(window.YOLBANG_MEMBERS) ? window.YOLBANG_MEMBERS : [];
const INACTIVE_STATUSES = ["이명", "제적", "별세"];
const EXTRA_COLLECTIONS = ["transfers","recurring","cashCounts","withdrawals","special","pledges","inKind","receiptLog","attendance","headcounts","visits","prayers","education","service","ministryReports","groups","savedSearches","posts","events","memos"];
window.YOLBANG_COLLECTIONS = ["members","donations","expenses",...EXTRA_COLLECTIONS];
const CONFIG_LIST_KEYS = ["funds","incomeCategories","expenseCategories"];
const defaultConfig = () => ({ parts:["1부","2부","3부"], worships:["주일 1부","주일 2부","수요예배","금요예배","새벽예배"], positions:["목사","전도사","장로","권사","안수집사","집사","성도","청년","학생","어린이"], visitTypes:["대심방","일반심방","새가족심방","병원심방","전화심방","기타"], updatedAt:0 });

const initialState = () => ({
  church: { name:"열방교회", denomination:"대한예수교장로회 통합", address:"제주특별자치도 서귀포시 중산간동로 8091", phone:"064-767-9090", representative:"", taxId:"", donationType:"종교단체 기부금" },
  funds:[...funds], incomeCategories:[...incomeCategories], expenseCategories:[...expenseCategories], members:bundledMembers.map(member=>({...member})), donations:[], expenses:[],
  config:defaultConfig(), ...Object.fromEntries(EXTRA_COLLECTIONS.map(key=>[key,[]]))
});
let state = loadState();
let selectedYear = thisYear;

function mergeBundledMembers(savedMembers=[]){
  const merged=savedMembers.map(member=>({...member}));
  bundledMembers.forEach(source=>{
    const exact=merged.find(member=>member.id===source.id||(member.name===source.name&&member.group===source.group));
    if(exact){exact.affiliation=exact.affiliation||source.affiliation;exact.group=exact.group||source.group;exact.source=exact.source||source.source;return;}
    const unassigned=merged.filter(member=>member.name===source.name&&!member.group);
    if(unassigned.length===1){Object.assign(unassigned[0],{group:source.group,affiliation:source.affiliation,source:source.source});return;}
    merged.push({...source});
  });
  return merged;
}
function loadState(){ try { const saved = JSON.parse(DATA_STORE.getItem(STORAGE_KEY)); return saved ? {...initialState(), ...saved, config:{...defaultConfig(),...(saved.config||{})}, members:mergeBundledMembers(saved.members||[])} : initialState(); } catch { return initialState(); } }
const transferNet = (fund, year) => total(byYear((state.transfers||[]).filter(x=>x.toFund===fund),year)) - total(byYear((state.transfers||[]).filter(x=>x.fromFund===fund),year));
function saveState(message="저장했습니다"){ DATA_STORE.setItem(STORAGE_KEY, JSON.stringify(state)); renderAll(); window.dispatchEvent(new CustomEvent("yolbang-state-saved",{detail:{state}})); toast(message); }
const $ = (id) => document.getElementById(id);
const fmt = (n) => `${Number(n||0).toLocaleString("ko-KR")}원`;
const num = (n) => Number(n||0).toLocaleString("ko-KR");
const dateYear = (date) => Number(String(date).slice(0,4));
const uid = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
const escapeHtml = (s="") => String(s).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const memberName = (id) => state.members.find(m=>m.id===id)?.name || "무기명";
const byYear = (items, year) => items.filter(x=>dateYear(x.date)===Number(year));
const total = (items) => items.reduce((s,x)=>s+Number(x.amount||0),0);
function toast(message){ const el=$("toast"); el.textContent=message; el.classList.add("show"); clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>el.classList.remove("show"),2200); }
function todayISO(){ return new Date().toLocaleDateString("sv-SE"); }

function setupYears(){
  const years = new Set([thisYear,thisYear-1,2025,...state.donations.map(x=>dateYear(x.date)),...state.expenses.map(x=>dateYear(x.date))]);
  const options=[...years].sort((a,b)=>b-a).map(y=>`<option value="${y}">${y}년</option>`).join("");
  ["globalYear","receiptYear"].forEach(id=>{ const old=$(id).value; $(id).innerHTML=options; $(id).value = id==="globalYear" ? String(selectedYear) : (old||String(selectedYear)); });
}
function fillSelect(id, values, placeholder="선택") { const old=$(id).value; $(id).innerHTML=`<option value="">${placeholder}</option>`+values.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join(""); if(old)$(id).value=old; }
function donationMemberLabel(member){ const sameName=state.members.filter(m=>m.name===member.name).length>1; return sameName&&member.group?`${member.name} · ${member.group}`:member.name; }
function setupMemberAutocomplete(searchId,hiddenId,hintId,suggestionsId){
  const search=$(searchId),hidden=$(hiddenId),hint=$(hintId),suggestions=$(suggestionsId);
  const close=()=>suggestions.classList.add("hidden");
  const update=()=>{
    const value=search.value.trim(),normalized=value.toLocaleLowerCase("ko");
    const active=state.members.filter(member=>!INACTIVE_STATUSES.includes(member.status));
    const exactCandidates=active.filter(member=>donationMemberLabel(member)===value||member.name===value);
    const exact=exactCandidates.length===1?exactCandidates[0]:active.find(member=>donationMemberLabel(member)===value);
    hidden.value=exact?.id||"";
    if(exact){hint.textContent=`${exact.name}${exact.group?` · ${exact.group}`:""} 선택됨`;hint.className="field-hint matched";close();return;}
    if(!value){hint.textContent="이름 몇 글자를 입력하면 교인을 찾습니다.";hint.className="field-hint";close();return;}
    hint.textContent="아래 검색 결과에서 교인을 선택하세요.";hint.className="field-hint unmatched";
    const matches=active.filter(member=>`${member.name} ${member.group||""}`.toLocaleLowerCase("ko").includes(normalized)).slice(0,8);
    suggestions.innerHTML=matches.length?matches.map(member=>`<button type="button" class="autocomplete-option" data-member-id="${member.id}"><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.group||"소속 미등록")}</small></button>`).join(""):'<div class="autocomplete-empty">일치하는 교인이 없습니다.</div>';
    suggestions.classList.remove("hidden");
  };
  search.addEventListener("input",update);search.addEventListener("focus",()=>{if(search.value.trim())update();});
  suggestions.addEventListener("mousedown",event=>event.preventDefault());
  suggestions.addEventListener("click",event=>{const button=event.target.closest("[data-member-id]");if(!button)return;const member=state.members.find(item=>item.id===button.dataset.memberId);if(!member)return;search.value=donationMemberLabel(member);hidden.value=member.id;hint.textContent=`${member.name}${member.group?` · ${member.group}`:""} 선택됨`;hint.className="field-hint matched";close();});
  document.addEventListener("click",event=>{if(!event.target.closest(`#${searchId}`)&&!event.target.closest(`#${suggestionsId}`))close();});
}
function setupSelectors(){
  fillSelect("donationCategory",state.incomeCategories,"헌금 항목 선택"); fillSelect("expenseCategory",state.expenseCategories,"지출 항목 선택");
  fillSelect("donationFund",state.funds,"회계 선택"); fillSelect("expenseFund",state.funds,"회계 선택");
  fillSelect("donationPart",state.config.parts,"미지정"); fillSelect("memberPosition",state.config.positions,"직분 선택");
  const activeMembers=state.members.filter(m=>!INACTIVE_STATUSES.includes(m.status)).sort((a,b)=>a.name.localeCompare(b.name,"ko"));
  const memberOptions=activeMembers.map(m=>`<option value="${m.id}">${escapeHtml(m.name)}${m.group?` · ${escapeHtml(m.group)}`:""}</option>`).join("");
  const oldDonation=$("donationMember").value, oldReceipt=$("receiptMember").value;
  $("donationMember").innerHTML='<option value="">무기명 / 기타</option>'+memberOptions; $("receiptMember").innerHTML='<option value="">기부자 선택</option>'+memberOptions;
  $("donationMember").value=oldDonation; $("receiptMember").value=oldReceipt;
}
function go(view){
  const page=window.YB?.byId?.[view]; if(page&&!page.builtin)window.YB.mount(view); if(!$(`${view}View`))return;
  document.querySelectorAll(".view").forEach(x=>x.classList.remove("active")); document.querySelectorAll(".nav-item").forEach(x=>x.classList.toggle("active",x.dataset.view===view));
  $(`${view}View`).classList.add("active"); const titles={dashboard:"재정 대시보드",donations:"헌금 입력",expenses:"지출 입력",members:"교인 등록",reports:"회계 보고",receipts:"기부금영수증",settings:"설정 · 백업"}; $("pageTitle").textContent=titles[view]||page?.title||"";
  if(window.YB){window.YB.current=view;window.YB.afterGo?.(view);}
  window.scrollTo({top:0,behavior:"smooth"});
}
window.go=go;
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));
document.querySelectorAll(".nav-item").forEach(b=>b.addEventListener("click",()=>go(b.dataset.view)));

function renderDashboard(){
  const ds=byYear(state.donations,selectedYear), es=byYear(state.expenses,selectedYear), prevD=byYear(state.donations,selectedYear-1), prevE=byYear(state.expenses,selectedYear-1);
  const inc=total(ds), exp=total(es); $("welcomeYear").textContent=selectedYear; $("dashIncome").textContent=fmt(inc); $("dashExpense").textContent=fmt(exp); $("dashBalance").textContent=fmt(inc-exp);
  const compare=(cur,prev)=>prev?`전년 대비 ${cur-prev>=0?"+":""}${num(cur-prev)}원`:"전년 기록 없음"; $("dashIncomeCompare").textContent=compare(inc,total(prevD)); $("dashExpenseCompare").textContent=compare(exp,total(prevE));
  $("dashDonors").textContent=`${new Set(ds.filter(x=>x.memberId&&!x.anonymous).map(x=>x.memberId)).size}명`; $("dashCount").textContent=`헌금 ${ds.length}건`;
  const monthData=Array.from({length:12},(_,i)=>({income:total(ds.filter(x=>Number(x.date.slice(5,7))===i+1)),expense:total(es.filter(x=>Number(x.date.slice(5,7))===i+1))})); const max=Math.max(1,...monthData.flatMap(x=>[x.income,x.expense]));
  $("monthlyChart").innerHTML=monthData.map((x,i)=>`<div class="bar-month" title="${i+1}월 · 수입 ${fmt(x.income)} · 지출 ${fmt(x.expense)}"><i style="height:${Math.max(2,x.income/max*100)}%"></i><i class="exp" style="height:${Math.max(2,x.expense/max*100)}%"></i><span>${i+1}월</span></div>`).join("");
  const fundBalances=state.funds.map(f=>({name:f,income:total(ds.filter(x=>x.fund===f))+transferNet(f,selectedYear),expense:total(es.filter(x=>x.fund===f))})); const maxBalance=Math.max(1,...fundBalances.map(x=>Math.abs(x.income-x.expense)));
  $("fundSummary").innerHTML=fundBalances.map(f=>`<div class="fund-row"><div class="fund-title"><span>${f.name}</span><strong>${fmt(f.income-f.expense)}</strong></div><div class="progress"><span style="width:${Math.abs(f.income-f.expense)/maxBalance*100}%"></span></div></div>`).join("");
  const recent=[...state.donations.map(x=>({...x,type:"헌금",name:`${memberName(x.memberId)} · ${x.category}`})),...state.expenses.map(x=>({...x,type:"지출",name:x.detail||x.category}))].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,7);
  $("recentRows").innerHTML=recent.length?recent.map(x=>`<tr><td>${x.date}</td><td><span class="badge ${x.type==="지출"?"expense":""}">${x.type}</span></td><td>${escapeHtml(x.name)}</td><td>${escapeHtml(x.fund)}</td><td class="right ${x.type==="지출"?"amount-expense":"amount-income"}">${x.type==="지출"?"−":"+"}${fmt(x.amount)}</td></tr>`).join(""):'<tr><td colspan="5" class="empty-row">아직 기록이 없습니다. 첫 헌금을 입력해 보세요.</td></tr>';
}

function renderDonations(){
  const q=$("donationSearch")?.value?.trim().toLowerCase()||""; const rows=state.donations.filter(x=>dateYear(x.date)===selectedYear).filter(x=>`${memberName(x.memberId)} ${x.category} ${x.memo}`.toLowerCase().includes(q)).sort((a,b)=>b.date.localeCompare(a.date));
  $("donationRows").innerHTML=rows.length?rows.map(x=>`<tr><td>${x.date}</td><td>${x.anonymous?"무기명":escapeHtml(memberName(x.memberId))}</td><td>${escapeHtml(x.category)}</td><td>${escapeHtml(x.fund)}</td><td>${escapeHtml(x.method)}</td><td class="right amount-income">${fmt(x.amount)}</td><td class="row-actions"><button class="icon-button" onclick="editDonation('${x.id}')">수정</button><button class="icon-button" onclick="deleteDonation('${x.id}')">삭제</button></td></tr>`).join(""):'<tr><td colspan="7" class="empty-row">해당 연도의 헌금 기록이 없습니다.</td></tr>';
}
function resetDonation(){ $("donationForm").reset(); $("donationId").value=""; $("donationMember").value=""; $("donationMemberSearch").value=""; $("donationMemberHint").textContent=state.members.length?"이름 몇 글자를 입력하면 교인을 찾습니다.":"설정에서 출석부 명부를 먼저 가져오세요."; $("donationMemberHint").className="field-hint"; $("donationDate").value=todayISO(); $("donationFund").value="일반회계"; $("donationFormTitle").textContent="헌금 기록 입력"; }
window.editDonation=(id)=>{ const x=state.donations.find(d=>d.id===id); if(!x)return; Object.entries({donationId:x.id,donationDate:x.date,donationMember:x.memberId||"",donationCategory:x.category,donationFund:x.fund,donationAmount:x.amount,donationMethod:x.method,donationPart:x.part||"",donationMemo:x.memo||""}).forEach(([k,v])=>$(k).value=v); const member=state.members.find(m=>m.id===x.memberId); $("donationMemberSearch").value=member?donationMemberLabel(member):""; $("donationMemberHint").textContent=member?`${member.name}${member.group?` · ${member.group}`:""} 선택됨`:"무기명 헌금"; $("donationMemberHint").className=member?"field-hint matched":"field-hint"; $("donationAnonymous").checked=!!x.anonymous; $("donationFormTitle").textContent="헌금 기록 수정"; window.scrollTo({top:0,behavior:"smooth"}); };
window.deleteDonation=(id)=>{ if(confirm("이 헌금 기록을 삭제할까요?")){ window.YolbangSync?.queueDelete("donations",id);state.donations=state.donations.filter(x=>x.id!==id); saveState("헌금 기록을 삭제했습니다"); } };
$("donationForm").addEventListener("submit",e=>{ e.preventDefault(); if(!$("donationAnonymous").checked&&$("donationMemberSearch").value.trim()&&!$("donationMember").value){toast("자동완성 목록에서 교인을 선택해 주세요");$("donationMemberSearch").focus();return;} const record={id:$("donationId").value||uid("don"),date:$("donationDate").value,memberId:$("donationAnonymous").checked?"":$("donationMember").value,anonymous:$("donationAnonymous").checked,category:$("donationCategory").value,fund:$("donationFund").value,amount:Number($("donationAmount").value),method:$("donationMethod").value,part:$("donationPart").value,memo:$("donationMemo").value.trim(),updatedAt:Date.now()}; const i=state.donations.findIndex(x=>x.id===record.id); i>=0?state.donations[i]=record:state.donations.push(record); resetDonation(); saveState(i>=0?"헌금 기록을 수정했습니다":"헌금 기록을 저장했습니다"); });
$("donationCancel").addEventListener("click",resetDonation); $("donationSearch").addEventListener("input",renderDonations); $("donationAnonymous").addEventListener("change",e=>{$("donationMember").disabled=e.target.checked;$("donationMemberSearch").disabled=e.target.checked;if(e.target.checked){$("donationMember").value="";$("donationMemberSearch").value="";$("donationMemberHint").textContent="무기명 헌금으로 기록됩니다.";}else{$("donationMemberHint").textContent="이름 몇 글자를 입력하면 교인을 찾습니다.";}});

function renderExpenses(){ const q=$("expenseSearch")?.value?.trim().toLowerCase()||""; const rows=state.expenses.filter(x=>dateYear(x.date)===selectedYear).filter(x=>`${x.category} ${x.detail} ${x.payee} ${x.memo}`.toLowerCase().includes(q)).sort((a,b)=>b.date.localeCompare(a.date)); $("expenseRows").innerHTML=rows.length?rows.map(x=>`<tr><td>${x.date}</td><td>${escapeHtml(x.category)}</td><td>${escapeHtml(x.detail)}</td><td>${escapeHtml(x.fund)}</td><td>${escapeHtml(x.payee||"-")}</td><td class="right amount-expense">${fmt(x.amount)}</td><td class="row-actions"><button class="icon-button" onclick="editExpense('${x.id}')">수정</button><button class="icon-button" onclick="deleteExpense('${x.id}')">삭제</button></td></tr>`).join(""):'<tr><td colspan="7" class="empty-row">해당 연도의 지출 기록이 없습니다.</td></tr>'; }
function resetExpense(){ $("expenseForm").reset(); $("expenseId").value=""; $("expenseDate").value=todayISO(); $("expenseFund").value="일반회계"; $("expenseFormTitle").textContent="지출 기록 입력"; }
window.editExpense=(id)=>{ const x=state.expenses.find(d=>d.id===id); if(!x)return; Object.entries({expenseId:x.id,expenseDate:x.date,expenseCategory:x.category,expenseDetail:x.detail,expenseFund:x.fund,expensePayee:x.payee||"",expenseAmount:x.amount,expenseMethod:x.method,expenseMemo:x.memo||""}).forEach(([k,v])=>$(k).value=v); $("expenseFormTitle").textContent="지출 기록 수정"; window.scrollTo({top:0,behavior:"smooth"}); };
window.deleteExpense=(id)=>{ if(confirm("이 지출 기록을 삭제할까요?")){window.YolbangSync?.queueDelete("expenses",id);state.expenses=state.expenses.filter(x=>x.id!==id); saveState("지출 기록을 삭제했습니다"); } };
$("expenseForm").addEventListener("submit",e=>{ e.preventDefault(); const record={id:$("expenseId").value||uid("exp"),date:$("expenseDate").value,category:$("expenseCategory").value,detail:$("expenseDetail").value.trim(),fund:$("expenseFund").value,payee:$("expensePayee").value.trim(),amount:Number($("expenseAmount").value),method:$("expenseMethod").value,memo:$("expenseMemo").value.trim(),updatedAt:Date.now()}; const i=state.expenses.findIndex(x=>x.id===record.id); i>=0?state.expenses[i]=record:state.expenses.push(record); resetExpense(); saveState(i>=0?"지출 기록을 수정했습니다":"지출 기록을 저장했습니다"); });
$("expenseCancel").addEventListener("click",resetExpense); $("expenseSearch").addEventListener("input",renderExpenses);

function renderMembers(){ const q=$("memberSearch")?.value?.trim().toLowerCase()||""; const members=state.members.filter(m=>`${m.name} ${m.phone} ${m.group}`.toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name,"ko")); $("memberCards").innerHTML=members.length?members.map(m=>{ const yDon=byYear(state.donations.filter(x=>x.memberId===m.id&&!x.anonymous),selectedYear); return `<div class="member-card"><div class="member-card-head"><div><h4>${escapeHtml(m.name)} <span class="badge">${escapeHtml(m.status)}</span></h4><p>${escapeHtml(m.phone||"연락처 없음")}${m.group?` · ${escapeHtml(m.group)}`:""}</p></div><div><button class="icon-button" onclick="editMember('${m.id}')">수정</button><button class="icon-button" onclick="deleteMember('${m.id}')">삭제</button></div></div><p>${escapeHtml(m.address||"주소 미입력")}</p><div class="member-total"><span>${selectedYear}년 헌금 ${yDon.length}건</span><strong>${fmt(total(yDon))}</strong></div></div>`;}).join(""):'<div class="empty-state"><h3>등록된 교인이 없습니다</h3><p>왼쪽 양식에서 첫 교인을 등록해 주세요.</p></div>'; }
function resetMember(){ $("memberForm").reset(); $("memberId").value=""; $("memberFormTitle").textContent="교인 등록"; }
window.editMember=(id)=>{ const m=state.members.find(x=>x.id===id); if(!m)return; Object.entries({memberId:m.id,memberName:m.name,memberPhone:m.phone||"",memberAddress:m.address||"",memberTaxId:m.taxId||"",memberGroup:m.group||"",memberStatus:m.status||"재적",memberGender:m.gender||"",memberBirth:m.birth||"",memberPosition:m.position||"",memberFamily:m.family||"",memberRegistered:m.registeredAt||"",memberBaptism:m.baptism||"",memberAnniversary:m.anniversary||"",memberEmail:m.email||"",memberNo:m.memberNo||"",memberMemo:m.memo||""}).forEach(([k,v])=>$(k).value=v); $("memberLunar").checked=!!m.lunar; $("memberFormTitle").textContent="교인 정보 수정"; window.scrollTo({top:0,behavior:"smooth"}); };
window.deleteMember=(id)=>{ if(state.donations.some(x=>x.memberId===id)) return alert("헌금 기록이 연결된 교인은 삭제할 수 없습니다. 상태를 ‘이명’으로 변경해 주세요."); if(confirm("이 교인을 삭제할까요?")){window.YolbangSync?.queueDelete("members",id);state.members=state.members.filter(x=>x.id!==id);saveState("교인을 삭제했습니다");}};
$("memberForm").addEventListener("submit",e=>{e.preventDefault(); const previous=state.members.find(x=>x.id===$("memberId").value)||{}; const m={...previous,id:$("memberId").value||uid("mem"),name:$("memberName").value.trim(),phone:formatMobile($("memberPhone").value),address:$("memberAddress").value.trim(),taxId:formatResidentId($("memberTaxId").value),group:$("memberGroup").value.trim(),status:$("memberStatus").value,gender:$("memberGender").value,birth:$("memberBirth").value,lunar:$("memberLunar").checked,position:$("memberPosition").value,family:$("memberFamily").value.trim(),registeredAt:$("memberRegistered").value,baptism:$("memberBaptism").value,anniversary:$("memberAnniversary").value,email:$("memberEmail").value.trim(),memberNo:$("memberNo").value.trim(),memo:$("memberMemo").value.trim(),updatedAt:Date.now()}; const i=state.members.findIndex(x=>x.id===m.id);i>=0?state.members[i]=m:state.members.push(m);resetMember();saveState(i>=0?"교인 정보를 수정했습니다":"교인을 등록했습니다");}); $("memberCancel").addEventListener("click",resetMember); $("memberSearch").addEventListener("input",renderMembers);
function formatMobile(value){const digits=value.replace(/\D/g,"").slice(0,11);if(digits.length<=3)return digits;if(digits.length<=7)return `${digits.slice(0,3)}-${digits.slice(3)}`;return `${digits.slice(0,3)}-${digits.slice(3,-4)}-${digits.slice(-4)}`;}
function formatResidentId(value){const digits=value.replace(/\D/g,"").slice(0,13);return digits.length<=6?digits:`${digits.slice(0,6)}-${digits.slice(6)}`;}
$("memberPhone").addEventListener("input",e=>{e.target.value=formatMobile(e.target.value);});
$("memberTaxId").addEventListener("input",e=>{e.target.value=formatResidentId(e.target.value);});

function groupTotals(items,categories,year){ return categories.map(category=>({category,current:total(byYear(items.filter(x=>x.category===category),year)),previous:total(byYear(items.filter(x=>x.category===category),year-1))})).filter(x=>x.current||x.previous); }
function reportRows(groups){ return groups.length?groups.map(x=>`<tr><td>${escapeHtml(x.category)}</td><td class="right">${num(x.current)}</td><td class="right">${num(x.previous)}</td><td class="right ${x.current-x.previous>=0?"delta-up":"delta-down"}">${x.current-x.previous>=0?"+":""}${num(x.current-x.previous)}</td></tr>`).join(""):'<tr><td colspan="4" class="empty-row">기록이 없습니다.</td></tr>'; }
function renderReports(){ const ds=byYear(state.donations,selectedYear),es=byYear(state.expenses,selectedYear),pd=byYear(state.donations,selectedYear-1),pe=byYear(state.expenses,selectedYear-1); $("reportIncome").textContent=fmt(total(ds));$("reportExpense").textContent=fmt(total(es));$("reportBalance").textContent=fmt(total(ds)-total(es));$("reportIncomePrev").textContent=`전년도 ${fmt(total(pd))}`;$("reportExpensePrev").textContent=`전년도 ${fmt(total(pe))}`; document.querySelectorAll(".reportYearText").forEach(x=>x.textContent=selectedYear);document.querySelectorAll(".current-year-head").forEach(x=>x.textContent=`${selectedYear}년`);document.querySelectorAll(".previous-year-head").forEach(x=>x.textContent=`${selectedYear-1}년`);
  $("reportFundCards").innerHTML=state.funds.map(f=>{const i=total(ds.filter(x=>x.fund===f)),e=total(es.filter(x=>x.fund===f)),t=transferNet(f,selectedYear);return `<div class="report-fund-card"><span>${f}</span><strong>${fmt(i-e+t)}</strong><small>수입 ${num(i)} · 지출 ${num(e)}${t?` · 이체 ${t>0?"+":""}${num(t)}`:""}</small></div>`}).join(""); $("incomeReportRows").innerHTML=reportRows(groupTotals(state.donations,state.incomeCategories,selectedYear)); $("expenseReportRows").innerHTML=reportRows(groupTotals(state.expenses,state.expenseCategories,selectedYear)); }

function buildReceipt(){ const member=state.members.find(m=>m.id===$("receiptMember").value), year=Number($("receiptYear").value); if(!member)return toast("기부자를 선택해 주세요"); const donations=byYear(state.donations.filter(x=>x.memberId===member.id&&!x.anonymous),year).sort((a,b)=>a.date.localeCompare(b.date)); if(!donations.length)return toast(`${year}년 개인 헌금 기록이 없습니다`); $("receiptEmpty").classList.add("hidden");$("receiptArea").classList.remove("hidden");$("receiptNumber").textContent=`${year}-${String(state.members.indexOf(member)+1).padStart(4,"0")}`;$("receiptDonorName").textContent=member.name;$("receiptDonorTaxId").textContent=member.taxId||"미입력";$("receiptDonorAddress").textContent=member.address||"미입력";$("receiptDonationRows").innerHTML=donations.map(x=>`<tr><td>${x.date}</td><td>${escapeHtml(state.church.donationType)}</td><td>${escapeHtml(x.category)}</td><td class="right">${num(x.amount)}원</td></tr>`).join("");$("receiptTotal").textContent=fmt(total(donations));$("receiptIssueDate").textContent=`${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일`;$("receiptChurchName").textContent=state.church.name;$("receiptChurchTaxId").textContent=state.church.taxId||"미입력";$("receiptChurchAddress").textContent=state.church.address;$("receiptRepresentative").textContent=state.church.representative||"미입력"; window.lastReceipt={number:$("receiptNumber").textContent,memberId:member.id,year,amount:total(donations),kind:"헌금"}; const missing=[!member.taxId&&"기부자 식별번호",!member.address&&"기부자 주소",!state.church.taxId&&"교회 고유번호",!state.church.representative&&"대표자"].filter(Boolean);$("receiptWarning").textContent=missing.length?`인쇄 전 확인: ${missing.join(", ")} 미입력`:"발급 정보를 확인한 뒤 인쇄하세요."; }
$("buildReceipt").addEventListener("click",buildReceipt);$("printReceipt").addEventListener("click",()=>{window.YB?.logReceipt?.(window.lastReceipt);window.print();});$("printReport").addEventListener("click",()=>window.print());

function renderSettings(){ const c=state.church;$("settingName").value=c.name;$("settingDenomination").value=c.denomination;$("settingAddress").value=c.address;$("settingPhone").value=c.phone;$("settingRepresentative").value=c.representative;$("settingTaxId").value=c.taxId;$("settingDonationType").value=c.donationType;$("incomeCategoryChips").innerHTML=state.incomeCategories.map(x=>`<span class="chip">${x}</span>`).join("");$("expenseCategoryChips").innerHTML=state.expenseCategories.map(x=>`<span class="chip">${x}</span>`).join("");$("fundChips").innerHTML=state.funds.map(x=>`<span class="chip">${x}</span>`).join(""); }
$("settingsForm").addEventListener("submit",e=>{e.preventDefault();state.church={name:$("settingName").value.trim(),denomination:$("settingDenomination").value.trim(),address:$("settingAddress").value.trim(),phone:$("settingPhone").value.trim(),representative:$("settingRepresentative").value.trim(),taxId:$("settingTaxId").value.trim(),donationType:$("settingDonationType").value.trim(),updatedAt:Date.now()};saveState("교회 정보를 저장했습니다");});

function download(name,content,type="text/plain;charset=utf-8"){const blob=new Blob([content],{type});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function csv(rows){ return "\ufeff"+rows.map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n"); }
function exportDonations(){const rows=[["날짜","헌금자","헌금항목","회계구분","금액","납부방법","메모"],...state.donations.filter(x=>dateYear(x.date)===selectedYear).map(x=>[x.date,x.anonymous?"무기명":memberName(x.memberId),x.category,x.fund,x.amount,x.method,x.memo])];download(`열방교회_${selectedYear}년_헌금내역.csv`,csv(rows),"text/csv;charset=utf-8");}
function exportExpenses(){const rows=[["날짜","지출항목","세부내역","회계구분","지급처","금액","지급방법","메모"],...state.expenses.filter(x=>dateYear(x.date)===selectedYear).map(x=>[x.date,x.category,x.detail,x.fund,x.payee,x.amount,x.method,x.memo])];download(`열방교회_${selectedYear}년_지출내역.csv`,csv(rows),"text/csv;charset=utf-8");}
function exportAll(){const rows=[["날짜","수입/지출","대상/지급처","항목","세부내역","회계구분","금액","방법","메모"],...byYear(state.donations,selectedYear).map(x=>[x.date,"수입",x.anonymous?"무기명":memberName(x.memberId),x.category,"",x.fund,x.amount,x.method,x.memo]),...byYear(state.expenses,selectedYear).map(x=>[x.date,"지출",x.payee,x.category,x.detail,x.fund,x.amount,x.method,x.memo])].sort((a,b)=>String(a[0]).localeCompare(String(b[0])));download(`열방교회_${selectedYear}년_전체거래.csv`,csv(rows),"text/csv;charset=utf-8");}
function excelDateToIso(value){
  let year,month,day;
  if(value instanceof Date&&!Number.isNaN(value.getTime())){year=value.getFullYear();month=value.getMonth()+1;day=value.getDate();}
  else if(typeof value==="number"&&window.XLSX){const parsed=XLSX.SSF.parse_date_code(value);if(parsed){year=parsed.y;month=parsed.m;day=parsed.d;}}
  else {const match=String(value||"").trim().match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);if(match){year=Number(match[1]);month=Number(match[2]);day=Number(match[3]);}}
  if(!year||!month||!day)return "";const test=new Date(year,month-1,day);if(test.getFullYear()!==year||test.getMonth()!==month-1||test.getDate()!==day)return "";return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}
function resolveImportedMember(value){const label=String(value||"").trim();if(!label)return {member:null,error:"헌금자가 비어 있습니다"};const active=state.members.filter(member=>!INACTIVE_STATUSES.includes(member.status));const exactLabel=active.find(member=>donationMemberLabel(member)===label);if(exactLabel)return {member:exactLabel};const names=active.filter(member=>member.name===label);if(names.length===1)return {member:names[0]};if(names.length>1)return {member:null,error:`동명이인 '${label}'은 이름 뒤의 소속까지 선택해야 합니다`};return {member:null,error:`교인 명부에서 '${label}'을(를) 찾을 수 없습니다`};}
function donationSignature(record){return [record.date,record.memberId||"",record.anonymous?"1":"0",record.category,record.fund,Number(record.amount),record.method,record.memo||""].join("|");}
async function importDonationWorkbook(file){
  const status=$("donationImportStatus");status.className="import-status";status.textContent="엑셀 파일을 확인하고 있습니다…";
  if(!window.XLSX)throw new Error("엑셀 읽기 모듈을 불러오지 못했습니다");
  const bytes=await file.arrayBuffer();const workbook=XLSX.read(bytes,{type:"array",cellDates:true});const sheet=workbook.Sheets[workbook.SheetNames.includes("헌금입력")?"헌금입력":workbook.SheetNames[0]];if(!sheet)throw new Error("헌금입력 시트를 찾지 못했습니다");
  const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:"",raw:true});const required=["헌금일","헌금자","무기명여부","헌금항목","회계구분","금액","납부방법","메모"];
  const headerIndex=rows.findIndex((row,index)=>index<15&&required.every(header=>row.map(cell=>String(cell).trim()).includes(header)));if(headerIndex<0)throw new Error("양식의 제목 행을 찾지 못했습니다. 제공된 엑셀 양식을 사용해 주세요");
  const headers=rows[headerIndex].map(cell=>String(cell).trim());const column=Object.fromEntries(required.map(header=>[header,headers.indexOf(header)]));const errors=[];const records=[];const existing=new Set(state.donations.map(donationSignature));const incoming=new Set();let skipped=0;
  rows.slice(headerIndex+1).forEach((row,offset)=>{const excelRow=headerIndex+2+offset;const values=Object.fromEntries(required.map(header=>[header,row[column[header]]]));if(required.every(header=>String(values[header]??"").trim()===""))return;
    const anonymous=/^(예|y|yes|true|1|무기명)$/i.test(String(values["무기명여부"]||"").trim());const date=excelDateToIso(values["헌금일"]);const category=String(values["헌금항목"]||"").trim();const fund=String(values["회계구분"]||"").trim();const method=String(values["납부방법"]||"").trim();const memo=String(values["메모"]||"").trim();const amount=Number(String(values["금액"]??"").replace(/[,\s원]/g,""));let member=null;
    if(!anonymous){const resolved=resolveImportedMember(values["헌금자"]);member=resolved.member;if(resolved.error)errors.push(`${excelRow}행: ${resolved.error}`);}
    if(!date)errors.push(`${excelRow}행: 헌금일을 yyyy-mm-dd 형식으로 입력해 주세요`);if(!state.incomeCategories.includes(category))errors.push(`${excelRow}행: 올바른 헌금항목을 선택해 주세요`);if(!state.funds.includes(fund))errors.push(`${excelRow}행: 올바른 회계구분을 선택해 주세요`);if(!Number.isFinite(amount)||amount<=0)errors.push(`${excelRow}행: 금액은 1원 이상의 숫자여야 합니다`);if(!["현금","계좌이체","카드","기타"].includes(method))errors.push(`${excelRow}행: 올바른 납부방법을 선택해 주세요`);
    if(!date||!category||!fund||!method||!Number.isFinite(amount)||amount<=0||(!anonymous&&!member))return;const record={id:uid("don"),date,memberId:anonymous?"":member.id,anonymous,category,fund,amount,method,memo,updatedAt:Date.now()};const signature=donationSignature(record);if(existing.has(signature)||incoming.has(signature)){skipped++;return;}incoming.add(signature);records.push(record);
  });
  if(errors.length){status.className="import-status error";status.textContent=`등록하지 않았습니다. ${errors.length}개의 오류가 있습니다.\n${errors.slice(0,10).join("\n")}${errors.length>10?"\n…나머지 오류도 엑셀에서 확인해 주세요.":""}`;return;}
  if(!records.length){status.className="import-status error";status.textContent=skipped?`새로 등록할 기록이 없습니다. 기존과 같은 기록 ${skipped}건을 제외했습니다.`:"입력된 헌금 기록이 없습니다.";return;}
  const amountTotal=total(records);if(!confirm(`헌금 ${records.length}건, 합계 ${fmt(amountTotal)}을 등록할까요?${skipped?`\n중복 ${skipped}건은 제외됩니다.`:""}`)) {status.classList.add("hidden");return;}
  state.donations.push(...records);saveState(`헌금 ${records.length}건을 일괄 등록했습니다`);status.className="import-status";status.textContent=`등록 완료: ${records.length}건 · ${fmt(amountTotal)}${skipped?` · 중복 제외 ${skipped}건`:""}`;
}
$("exportDonationCsv").addEventListener("click",exportDonations);$("exportExpenseCsv").addEventListener("click",exportExpenses);$("exportReportCsv").addEventListener("click",exportAll);$("exportBackup").addEventListener("click",()=>download(`열방교회_재정백업_${todayISO()}.json`,JSON.stringify(state,null,2),"application/json"));
$("importDonationXlsx").addEventListener("change",async event=>{const file=event.target.files[0];if(!file)return;try{await importDonationWorkbook(file);}catch(error){const status=$("donationImportStatus");status.className="import-status error";status.textContent=`엑셀 파일을 읽지 못했습니다. ${error.message}`;}finally{event.target.value="";}});
function flattenAttendanceMembers(attendanceState){
  const people=[];
  const add=(members,path,affiliation)=>{(members||[]).forEach(person=>{if(!person?.name?.trim())return;people.push({name:person.name.trim(),group:path.filter(Boolean).join(" › "),affiliation:{...affiliation},absent:!!person.absent});});};
  Object.entries(attendanceState?.nets||{}).forEach(([net,netData])=>{
    add(netData?.members,[`${net}네트`],{net});
    Object.entries(netData?.g12||{}).forEach(([g12,g12Data])=>{
      add(g12Data?.members,[`${net}네트`,g12],{net,g12});
      Object.entries(g12Data?.c144||{}).forEach(([cell144,data144])=>{
        add(data144?.members,[`${net}네트`,g12,cell144],{net,g12,cell144});
        Object.entries(data144?.c1728||{}).forEach(([cell1728,data1728])=>add(data1728?.members,[`${net}네트`,g12,cell144,cell1728],{net,g12,cell144,cell1728}));
      });
    });
  });
  const unique=new Map(); people.forEach(p=>unique.set(`${p.name}|${p.group}`,p)); return [...unique.values()];
}
function importAttendanceData(data){
  let source=data?.state??data; if(typeof source==="string") source=JSON.parse(source); if(!source?.nets||typeof source.nets!=="object") throw new Error("출석부 명부 구조가 없습니다");
  const incoming=flattenAttendanceMembers(source); if(!incoming.length) throw new Error("등록할 교인을 찾지 못했습니다");
  let added=0,updated=0,skipped=0;
  incoming.forEach(person=>{
    const sameName=state.members.filter(m=>m.name.trim()===person.name);
    const exact=sameName.find(m=>m.group===person.group);
    if(exact){exact.affiliation=person.affiliation;exact.source="출석부";skipped++;return;}
    if(sameName.length===1&&!sameName[0].group){sameName[0].group=person.group;sameName[0].affiliation=person.affiliation;sameName[0].source="출석부";sameName[0].updatedAt=Date.now();updated++;return;}
    state.members.push({id:uid("mem"),name:person.name,phone:"",address:"",taxId:"",group:person.group,status:person.absent?"기타":"재적",affiliation:person.affiliation,source:"출석부",updatedAt:Date.now()});added++;
  });
  return {total:incoming.length,added,updated,skipped};
}
$("importAttendance").addEventListener("change",e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const result=importAttendanceData(JSON.parse(reader.result));saveState("출석부 교인 명부를 가져왔습니다");$("attendanceImportResult").textContent=`전체 ${result.total}명 확인 · 신규 ${result.added}명 · 소속 갱신 ${result.updated}명 · 기존 ${result.skipped}명`;}catch(error){alert(`출석부 JSON을 읽지 못했습니다. ${error.message}`);} };reader.readAsText(file);e.target.value="";});
$("importBackup").addEventListener("change",e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(!data.church||!Array.isArray(data.donations)||!Array.isArray(data.expenses))throw Error();if(confirm("현재 데이터를 백업 파일의 내용으로 바꿀까요?")){state={...initialState(),...data,config:{...defaultConfig(),...(data.config||{})}};saveState("백업을 불러왔습니다");}}catch{alert("올바른 열방교회 재정 백업 파일이 아닙니다.");}};reader.readAsText(file);e.target.value="";});
$("resetData").addEventListener("click",()=>{if(confirm("모든 교인·헌금·지출 기록을 삭제합니다. 이 작업은 되돌릴 수 없습니다.")){state=initialState();DATA_STORE.removeItem(STORAGE_KEY);saveState("모든 데이터를 초기화했습니다");resetDonation();resetExpense();resetMember();}});

$("globalYear").addEventListener("change",e=>{selectedYear=Number(e.target.value);renderAll();});
function renderAll(){setupYears();setupSelectors();renderDashboard();renderDonations();renderExpenses();renderMembers();renderReports();renderSettings();window.YB?.refresh?.();}
window.getYolbangState=()=>JSON.parse(JSON.stringify(state));
window.applyCloudSnapshot=(payload)=>{
  if(!payload||!payload.type)return;const type=payload.type;
  if(type==="config"&&payload.record){
    if(Number(payload.record.updatedAt||0)>=Number(state.config.updatedAt||0)){const {funds:f,incomeCategories:ic,expenseCategories:ec,...rest}=payload.record;if(Array.isArray(f)&&f.length)state.funds=f;if(Array.isArray(ic)&&ic.length)state.incomeCategories=ic;if(Array.isArray(ec)&&ec.length)state.expenseCategories=ec;state.config={...defaultConfig(),...state.config,...rest};}
  } else if(window.YOLBANG_COLLECTIONS.includes(type)){
    const map=new Map((state[type]||[]).map(record=>[record.id,record]));
    (payload.records||[]).forEach(record=>{const local=map.get(record.id);if(!local||Number(record.updatedAt||0)>=Number(local.updatedAt||0))map.set(record.id,record);});
    (payload.tombstones||[]).forEach(tombstone=>{const local=map.get(tombstone.id);if(!local||Number(tombstone.deletedAt||0)>=Number(local.updatedAt||0))map.delete(tombstone.id);});
    state[type]=[...map.values()];
  } else if(type==="church"&&payload.record){if(Number(payload.record.updatedAt||0)>=Number(state.church.updatedAt||0))state.church=payload.record;}
  DATA_STORE.setItem(STORAGE_KEY,JSON.stringify(state));renderAll();
};
window.clearYolbangSession=()=>{state=initialState();sessionStorage.removeItem(STORAGE_KEY);renderAll();};
if(location.protocol!=="file:"){$("donationTemplateLink").removeAttribute("href");$("donationTemplateLink").removeAttribute("download");$("donationTemplateLink").title="교인 명부 보호를 위해 온라인에는 양식을 게시하지 않습니다.";$("donationTemplateLink").addEventListener("click",event=>{event.preventDefault();toast("명부 포함 엑셀 양식은 교회 컴퓨터에 보관된 파일을 사용해 주세요");});}
if("serviceWorker" in navigator&&location.protocol.startsWith("http"))window.addEventListener("load",()=>navigator.serviceWorker.register("service-worker.js").catch(()=>{}));
$("todayText").textContent=new Intl.DateTimeFormat("ko-KR",{dateStyle:"full"}).format(now);setupMemberAutocomplete("donationMemberSearch","donationMember","donationMemberHint","donationMemberSuggestions");setupMemberAutocomplete("receiptMemberSearch","receiptMember","receiptMemberHint","receiptMemberSuggestions");resetDonation();resetExpense();renderAll();
