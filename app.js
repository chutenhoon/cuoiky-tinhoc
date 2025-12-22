const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function setNavActive(){
  // noop - keep minimal
}

function wireMobileMenu(){
  const btn = $("#mobileMenuBtn");
  const menu = $("#mobileMenu");
  if(!btn || !menu) return;
  btn.addEventListener("click", () => {
    menu.classList.toggle("hidden");
  });
}

function smoothScrollTo(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.scrollIntoView({behavior:"smooth", block:"start"});
}

function saveState(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}
function loadState(key, fallback=null){
  try{
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  }catch{ return fallback; }
}

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

async function loadQuestionBank(){
  const res = await fetch("./questions.json", {cache:"no-store"});
  if(!res.ok) throw new Error("Không load được questions.json");
  const data = await res.json();
  return data;
}

// Pages
window.App = { $, $$, wireMobileMenu, smoothScrollTo, saveState, loadState, shuffle, loadQuestionBank };
const LONG_PASSAGE_LIMIT = 300;
function isLong(text){ return text && text.length > LONG_PASSAGE_LIMIT; }

// ===== CLEAN_RULES =====
const INSTRUCTION_REGEX = /(read the following|mark the letter|answer sheet|\(\d+\) ___)/i;
function isLongOrInstruction(text){
  if(!text) return false;
  return text.length > 280 || INSTRUCTION_REGEX.test(text);
}
function cleanOption(opt){
  return opt
    .replace(INSTRUCTION_REGEX,'')
    .replace(/read the following[\s\S]*/i,'')
    .trim();
}

// ==== REORDER_RULE ====
function isReorderQuestion(q){
  if(!q.text) return false;
  const lines = q.text.split(/\n/).filter(l=>/^[a-d]\.\s+/i.test(l.trim()));
  const hasOrderOpt = q.options && q.options.some(o=>/^[a-d](\s*-\s*[a-d])+$/i.test(o.trim()));
  return lines.length>=2 && hasOrderOpt;
}
function extractReorderLines(text){
  return text.split(/\n/).filter(l=>/^[a-d]\.\s+/i.test(l.trim()));
}
function cleanOptionStrict(opt){
  return opt
    .replace(/read the following[\s\S]*/i,'')
    .replace(/mark the letter[\s\S]*/i,'')
    .replace(/answer sheet[\s\S]*/i,'')
    .trim();
}

function renderQuestionPatched(question){
  const isReorder = isReorderQuestion(question);
  const qText = isReorder ? "" : question.text;
  if(qText) renderQuestionText(qText);
  if(isReorder){
    const lines = extractReorderLines(question.text);
    lines.forEach(l=>renderReorderLine(l));
  }
  question.options = question.options.map(cleanOptionStrict);
  renderOptions(question.options);
}
