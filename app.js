import {percentage,color,formatPercent,summary,validateRow,validateData,csv} from './core.js';
import {passwordClient} from './api.js';
const $ = id=>document.getElementById(id);
const node = (tag, cls, text) => {const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
const state={config:null,client:null,data:{version:1,updatedAt:null,rows:[]},baseline:null,sha:null,token:null,login:null,campus:'all',query:'',loaded:false,dirty:false,busy:false,apiFresh:false};
const clone = data=>structuredClone(data);
let confirmResolve=null;
function message(text,kind='info'){$('state-message').textContent=text;$('state-message').className='state-message '+kind;}
function badge(p){return node('span','badge '+color(p),formatPercent(p));}
function isEditor(){return !!state.token;}
function controls(){
 $('login-open').hidden=isEditor();$('logout').hidden=!isEditor();$('editor-panel').hidden=!isEditor();$('add-class').hidden=!isEditor();
 $('add-class').disabled=state.busy;$('logout').disabled=state.busy;$('refresh').disabled=!state.loaded||state.busy;$('export').disabled=!state.loaded;
 $('publish').disabled=!state.dirty||state.busy;$('undo').disabled=!state.dirty||state.busy;
 $('publish').textContent=state.busy?'Сохраняем…':'Сохранить для всех';
 $('draft-hint').textContent=state.dirty?'Есть неопубликованные изменения. Нажмите «Сохранить для всех».':'Все изменения сохранены. Редактор: '+(state.login||'');
 document.body.classList.toggle('editing',isEditor());
}
function render(){
 const all=summary(state.data.rows);
 $('school-percent').textContent=formatPercent(all.percent);$('school-progress').value=all.percent??0;
 $('school-registered').textContent=all.hasRegistered?all.registered.toLocaleString('ru-RU'):'—';
 $('school-total').textContent=all.hasTotal?all.total.toLocaleString('ru-RU'):'—';
 $('school-classes').textContent=state.data.rows.length?`Классов в таблице: ${state.data.rows.length} · 2 корпуса`:'Данные по классам ещё не заполнены';
 $('school-percent-hint').textContent=all.complete?'От общего числа учеников в таблице':state.data.rows.length?'Сводка неполная: заполните численность и регистрации всех классов':'Добавьте классы и исходные данные';
 if(state.data.updatedAt){$('freshness').textContent='Обновлено: '+new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short'}).format(new Date(state.data.updatedAt));}else $('freshness').textContent='Пока нет сохранённых результатов';
 const root=$('campuses');root.replaceChildren();
 for(const campus of ['1','2']){
  if(state.campus!=='all'&&state.campus!==campus)continue;
  const section=node('section','campus'),head=node('div','campus-head'),title=node('h3',null,'Корпус '+campus),group=state.data.rows.filter(r=>r.campus===campus),s=summary(group);
  title.append(node('span','count',String(group.length)+' кл.'));head.append(title);
  const subtotals=node('div','campus-summary',`${s.hasRegistered?s.registered:'—'} / ${s.hasTotal?s.total:'—'} учеников`);subtotals.append(badge(s.percent));head.append(subtotals);section.append(head);
  const wrap=node('div','table-wrap'),table=node('table'),caption=node('caption','sr','Результаты регистрации: корпус '+campus),thead=node('thead'),tr=node('tr');
  for(const text of ['Класс','Классный руководитель','Зарегистрировано','Всего учеников','Охват',...(isEditor()?['Правки']:[])]){const th=node('th',null,text);th.scope='col';tr.append(th);}
  thead.append(tr);table.append(caption,thead);const tbody=node('tbody');
  const visible=group.filter(r=>(r.name+' '+r.teacher).toLocaleLowerCase('ru').includes(state.query)).sort((a,b)=>a.name.localeCompare(b.name,'ru',{numeric:true}));
  for(const r of visible){const row=node('tr');row.append(node('td','class-name',r.name),node('td',r.teacher?'':'muted',r.teacher||'Не указан'),node('td','number',r.registered??'—'),node('td','number',r.total??'—'));const cell=node('td');cell.append(badge(percentage(r)));row.append(cell);
   if(isEditor()){const actions=node('td');const edit=node('button','edit-button','Изменить');edit.type='button';edit.setAttribute('aria-label','Изменить '+r.name);edit.disabled=state.busy;edit.onclick=()=>openRow(r);actions.append(edit);row.append(actions);}tbody.append(row);
  }
  table.append(tbody);wrap.append(table);
  if(!visible.length){const empty=node('div','empty');empty.append(node('span','empty-symbol','∧'),node('h4',null,state.query?'Классы не найдены':'Здесь появятся классы корпуса '+campus),node('p',null,state.query?'Попробуйте другой поисковый запрос.':'Численность, регистрации и процент участия — в одной таблице.'));
   if(isEditor()&&!state.query){const add=node('button','text-button','+ Добавить класс');add.onclick=()=>openRow(null,campus);empty.append(add);}wrap.append(empty);}
  section.append(wrap);root.append(section);
 }
 controls();
}
async function ask(title,text){$('confirm-title').textContent=title;$('confirm-text').textContent=text;$('confirm-dialog').showModal();return new Promise(resolve=>{confirmResolve=resolve;});}
function resolveConfirm(yes){$('confirm-dialog').close();if(confirmResolve){const resolve=confirmResolve;confirmResolve=null;resolve(yes);}}
function showError(id,error){const el=$(id);el.textContent=error instanceof Error?error.message:String(error);el.hidden=false;}
async function load(allowFallback=true){
 state.busy=true;controls();message('Загружаем актуальные результаты…');
 try {
  const snapshot=await state.client.read(state.token);state.data=snapshot.data;state.sha=snapshot.sha;state.apiFresh=true;state.baseline=clone(state.data);state.loaded=true;state.dirty=false;message(isEditor()?'Данные загружены. Вы можете редактировать таблицу.':'Просмотр открыт всем. Таблица обновлена с сервера.','success');
 }catch(error){
  if(allowFallback&&!isEditor()){
   try{const response=await fetch('./data.json',{cache:'no-store'});if(!response.ok)throw Error();state.data=validateData(await response.json());state.baseline=clone(state.data);state.loaded=true;state.apiFresh=false;state.sha=null;message('Показана опубликованная версия. Актуальные данные сервера сейчас недоступны — нажмите «Обновить» позже.','warning');}
   catch{message('Не удалось загрузить таблицу. Проверьте соединение и нажмите «Обновить».','error');$('refresh').disabled=false;}
  }else{message(error.message,'error');}
 }finally{state.busy=false;render();$('refresh').disabled=state.busy;}
}
function readForm(){return {id:$('row-id').value,campus:$('row-campus').value,name:$('row-name').value,teacher:$('row-teacher').value,total:$('row-total').value===''?null:Number($('row-total').value),registered:$('row-registered').value===''?null:Number($('row-registered').value)};}
function openRow(r=null,campus='1'){
 if(!isEditor()||state.busy)return;
 const row=r||{id:crypto.randomUUID(),campus,name:'',teacher:'',total:null,registered:null};
 $('row-id').value=row.id;$('row-campus').value=row.campus;$('row-name').value=row.name;$('row-teacher').value=row.teacher;$('row-total').value=row.total??'';$('row-registered').value=row.registered??'';
 $('row-title').textContent=r?'Редактировать класс':'Новый класс';$('delete-class').hidden=!r;$('row-error').hidden=true;rowPreview();$('row-dialog').showModal();
}
function rowPreview(){const r=readForm();const p=percentage(r);$('row-preview').textContent=formatPercent(p);$('row-preview').className='badge '+color(p);$('row-registered').max=r.total??1000;}
function setDirty(){state.dirty=true;render();}
function download(filename,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=node('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function logout(){state.token=null;state.login=null;state.sha=null;state.dirty=false;if(state.baseline)state.data=clone(state.baseline);$('access-token').value='';render();message('Вы вышли из режима редактора. Просмотр таблицы доступен всем.');}
$('row-form').onsubmit=e=>{e.preventDefault();if(!isEditor()||state.busy)return;try{const row=validateRow(readForm());const rows=state.data.rows.filter(r=>r.id!==row.id);rows.push(row);const clean=validateData({...state.data,rows});state.data=clean;setDirty();$('row-dialog').close();message('Правка применена к черновику. Сохраните изменения для всех.','warning');}catch(error){showError('row-error',error);}};
for(const id of ['row-total','row-registered'])$(id).oninput=rowPreview;
$('delete-class').onclick=async()=>{if(!isEditor())return;const row=readForm();$('row-dialog').close();if(await ask('Удалить класс '+row.name+'?', 'Класс будет удалён из черновика. До публикации это действие можно отменить.')){state.data.rows=state.data.rows.filter(r=>r.id!==row.id);setDirty();message('Класс удалён из черновика. Сохраните изменения для всех.','warning');}else openRow(row);};
$('add-class').onclick=()=>openRow(null,state.campus==='all'?'1':state.campus);
for(const tab of document.querySelectorAll('[data-campus]'))tab.onclick=()=>{state.campus=tab.dataset.campus;for(const btn of document.querySelectorAll('[data-campus]')){btn.classList.toggle('selected',btn===tab);btn.setAttribute('aria-pressed',String(btn===tab));}render();};
$('search').oninput=e=>{state.query=e.target.value.trim().toLocaleLowerCase('ru');render();};
$('export').onclick=()=>download('Vershina_registraciya.csv',csv(state.data.rows),'text/csv;charset=utf-8');
$('refresh').onclick=async()=>{if(state.busy)return;if(state.dirty&&!await ask('Обновить таблицу?', 'Неопубликованные правки будут потеряны. При необходимости сначала сохраните резервную копию.'))return;await load(!isEditor());};
$('login-open').onclick=()=>{$('login-error').hidden=true;$('login-dialog').showModal();};
$('login-dialog').addEventListener('close',()=>{$('access-token').value='';});
$('login-form').onsubmit=async e=>{
 e.preventDefault();$('login-error').hidden=true;const token=$('access-token').value.trim();$('login-submit').disabled=true;$('login-submit').textContent='Проверяем доступ…';
 try{const result=await state.client.login(token);state.token=result.token;state.login=result.login;state.sha=result.sha;state.data=result.data;state.baseline=clone(state.data);state.dirty=false;state.loaded=true;state.apiFresh=true;if(result.sha===0&&!result.data.rows.length){try{const prior=await fetch('./data.json',{cache:'no-store'});if(prior.ok){const restored=validateData(await prior.json());if(restored.rows.length){state.data=restored;state.dirty=true;}}}catch{}}$('access-token').value='';$('login-dialog').close();render();message(state.dirty?'Старые данные загружены в черновик. Нажмите «Сохранить для всех», чтобы перенести их на сервер.':'Вы вошли как редактор. Изменения публикуются кнопкой «Сохранить для всех».',state.dirty?'warning':'success');}
 catch(error){showError('login-error',error);$('access-token').value='';}
 finally{$('login-submit').disabled=false;$('login-submit').textContent='Войти';}
};
$('logout').onclick=async()=>{if(state.busy)return;if(state.dirty&&!await ask('Выйти без сохранения?', 'Неопубликованные изменения будут потеряны.'))return;logout();};
$('undo').onclick=async()=>{if(!state.dirty||state.busy)return;if(await ask('Отменить все правки?', 'Таблица вернётся к последнему сохранённому состоянию.')){state.data=clone(state.baseline);state.dirty=false;render();message('Черновые правки отменены.');}};
$('publish').onclick=async()=>{
 if(!isEditor()||!state.dirty||state.busy)return;state.busy=true;render();message('Сохраняем результаты…');
 try{const candidate=validateData({...state.data,updatedAt:new Date().toISOString()});const result=await state.client.save(state.token,state.sha,candidate);state.data=result.data;state.baseline=clone(result.data);state.sha=result.sha;state.dirty=false;message('Сохранено для всех. При следующем открытии посетители увидят актуальную таблицу.','success');}
 catch(error){message(error.message+' Ваши правки остаются в черновике.','error');}
 finally{state.busy=false;render();}
};
const backup=node('button','button white','Резервная копия JSON');backup.type='button';backup.onclick=()=>download('Vershina_backup.json',JSON.stringify(state.data,null,2)+'\n','application/json');document.querySelector('.editor-actions').prepend(backup);
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>{if(button.dataset.close==='confirm-dialog')resolveConfirm(false);else $(button.dataset.close).close();};
$('confirm-no').onclick=()=>resolveConfirm(false);$('confirm-yes').onclick=()=>resolveConfirm(true);$('confirm-dialog').addEventListener('cancel',e=>{e.preventDefault();resolveConfirm(false);});
window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
async function init(){try{const r=await fetch('./config.json',{cache:'no-store'});if(!r.ok)throw Error('Не удалось загрузить настройки проекта.');state.config=await r.json();state.client=passwordClient(state.config);$('school').textContent=state.config.school||'Лицей №3';await load();}catch(error){message(error.message,'error');$('login-open').disabled=true;}}
render();init();
