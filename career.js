(function(){
'use strict';

const CAREER_KEY='ethan.superkingdom.career.v1';
const RUN_KEY='ethan.superkingdom.save.v1';
const WORLD_COUNT=40;
const DAILY_POOL=[
  {id:'coin',title:'COIN COLLECTOR',text:'Collect 25 coins today',target:25,reward:35},
  {id:'chest',title:'TREASURE SEEKER',text:'Open a hidden kingdom chest today',target:1,reward:60},
  {id:'guardian',title:'GUARDIAN HUNTER',text:'Defeat a guardian today',target:1,reward:75},
  {id:'world',title:'KINGDOM EXPLORER',text:'Complete a kingdom today',target:1,reward:90}
];
const WEEKLY_POOL=[
  {id:'coin',title:'ROYAL TREASURY',text:'Collect 150 coins this week',target:150,reward:180},
  {id:'chest',title:'MASTER TREASURE HUNTER',text:'Open 6 hidden chests this week',target:6,reward:220},
  {id:'guardian',title:'GUARDIAN CHAMPION',text:'Defeat 4 guardians this week',target:4,reward:250},
  {id:'world',title:'KINGDOM CONQUEROR',text:'Complete 5 kingdoms this week',target:5,reward:300}
];
const ACHIEVEMENTS=[
 {id:'first_kingdom',name:'FIRST STEPS',desc:'Complete your first kingdom.'},
 {id:'guardian_hunter',name:'GUARDIAN HUNTER',desc:'Defeat 5 guardians.'},
 {id:'treasure_hunter',name:'TREASURE HUNTER',desc:'Open 10 hidden chests.'},
 {id:'wonder_seeker',name:'WONDER SEEKER',desc:'Collect 10 Wonder Seeds.'},
 {id:'coin_collector',name:'ROYAL COLLECTOR',desc:'Collect 500 coins.'},
 {id:'explorer',name:'WORLD EXPLORER',desc:'Complete 20 different kingdoms.'},
 {id:'kingdom_master',name:'KINGDOM MASTER',desc:'Complete all 40 kingdoms.'},
 {id:'resilient',name:'NEVER GIVE UP',desc:'Survive 10 defeats and keep going.'},
 {id:'daily_streak',name:'DAILY DEVOTION',desc:'Complete daily challenges 7 days in a row.'},
 {id:'weekly_streak',name:'ROYAL ROUTINE',desc:'Complete weekly challenges 4 weeks in a row.'}
];

function utcDay(date=new Date()){return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())).toISOString().slice(0,10)}
function weekKey(date=new Date()){
 const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
 const day=d.getUTCDay();d.setUTCDate(d.getUTCDate()-(day===0?6:day-1));return d.toISOString().slice(0,10);
}
function hash(value){let n=0;for(let i=0;i<value.length;i++)n=(n*31+value.charCodeAt(i))>>>0;return n}
function clone(value){return JSON.parse(JSON.stringify(value))}
function blank(){
 return {
  version:1,createdAt:Date.now(),updatedAt:Date.now(),
  stats:{coins:0,stars:0,chests:0,wonderSeeds:0,guardians:0,defeats:0,worldCompletions:0},
  completedWorlds:[],worldRecords:{},achievements:{},
  daily:{date:'',challengeId:'',progress:0,completed:false,streak:0,lastCompletedDate:''},
  weekly:{date:'',challengeId:'',progress:0,completed:false,streak:0,lastCompletedDate:'',seenWorlds:[]}
 };
}
function normalise(raw){
 const d=blank();if(!raw||typeof raw!=='object')return d;
 const number=(v,max=1e9)=>Math.max(0,Math.min(max,Math.floor(Number(v)||0)));
 const stats=raw.stats&&typeof raw.stats==='object'?raw.stats:{};
 Object.keys(d.stats).forEach(k=>d.stats[k]=number(stats[k]));
 d.completedWorlds=Array.isArray(raw.completedWorlds)?[...new Set(raw.completedWorlds.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=WORLD_COUNT))].sort((a,b)=>a-b):[];
 d.worldRecords={};
 if(raw.worldRecords&&typeof raw.worldRecords==='object'){
  for(const [key,value] of Object.entries(raw.worldRecords)){
   const world=Number(key);
   if(Number.isInteger(world)&&world>=1&&world<=WORLD_COUNT&&value&&typeof value==='object'){
    d.worldRecords[world]={bestScore:number(value.bestScore),timesCompleted:number(value.timesCompleted),bestTime:number(value.bestTime,86400),lastCompletedAt:number(value.lastCompletedAt)};
   }
  }
 }
 d.achievements=raw.achievements&&typeof raw.achievements==='object'?raw.achievements:{};
 for(const a of ACHIEVEMENTS)if(typeof d.achievements[a.id]!=='number')delete d.achievements[a.id];
 const daily=raw.daily&&typeof raw.daily==='object'?raw.daily:{};
 d.daily={...d.daily,...daily,progress:number(daily.progress),streak:number(daily.streak),completed:!!daily.completed};
 const weekly=raw.weekly&&typeof raw.weekly==='object'?raw.weekly:{};
 d.weekly={...d.weekly,...weekly,progress:number(weekly.progress),streak:number(weekly.streak),completed:!!weekly.completed,seenWorlds:Array.isArray(weekly.seenWorlds)?weekly.seenWorlds.map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=WORLD_COUNT):[]};
 d.createdAt=number(raw.createdAt,Number.MAX_SAFE_INTEGER)||Date.now();d.updatedAt=number(raw.updatedAt,Number.MAX_SAFE_INTEGER)||Date.now();
 return d;
}
function load(){
 try{return normalise(JSON.parse(localStorage.getItem(CAREER_KEY)||'null'))}catch(_){return blank()}
}
let state=load(),saveTimer=0;
function persistNow(){state.updatedAt=Date.now();try{localStorage.setItem(CAREER_KEY,JSON.stringify(state));return true}catch(_){return false}}
function persist(){if(saveTimer)clearTimeout(saveTimer);saveTimer=setTimeout(()=>{saveTimer=0;persistNow()},220)}
function challengeFor(pool,key){return pool[hash(key)%pool.length]}
function ensureChallenges(){
 const today=utcDay(),thisWeek=weekKey();
 if(state.daily.date!==today){
  const previous=new Date();previous.setUTCDate(previous.getUTCDate()-1);
  const keep=state.daily.lastCompletedDate===utcDay(previous);
  const c=challengeFor(DAILY_POOL,today);
  state.daily={date:today,challengeId:c.id,progress:0,completed:false,streak:keep?state.daily.streak:0,lastCompletedDate:state.daily.lastCompletedDate||''};
 }
 if(state.weekly.date!==thisWeek){
  const previous=new Date();previous.setUTCDate(previous.getUTCDate()-7);
  const keep=state.weekly.lastCompletedDate===weekKey(previous);
  const c=challengeFor(WEEKLY_POOL,thisWeek);
  state.weekly={date:thisWeek,challengeId:c.id,progress:0,completed:false,streak:keep?state.weekly.streak:0,lastCompletedDate:state.weekly.lastCompletedDate||'',seenWorlds:[]};
 }
}
function reward(label,coins){
 window.dispatchEvent(new CustomEvent('superkingdom:career-reward',{detail:{label,coins,score:coins*25}}));
}
function awardAchievements(){
 const s=state.stats,worlds=state.completedWorlds.length;
 const checks={
  first_kingdom:worlds>=1,guardian_hunter:s.guardians>=5,treasure_hunter:s.chests>=10,
  wonder_seeker:s.wonderSeeds>=10,coin_collector:s.coins>=500,explorer:worlds>=20,
  kingdom_master:worlds>=40,resilient:s.defeats>=10,daily_streak:state.daily.streak>=7,
  weekly_streak:state.weekly.streak>=4
 };
 let changed=false;
 for(const [id,yes] of Object.entries(checks)){
  if(yes&&!state.achievements[id]){state.achievements[id]=Date.now();changed=true;
   const a=ACHIEVEMENTS.find(x=>x.id===id);if(a)window.dispatchEvent(new CustomEvent('superkingdom:achievement',{detail:{name:a.name}}));
  }
 }
 return changed;
}
function maybeCompleteChallenges(){
 const d=state.daily,w=state.weekly;
 const daily=challengeFor(DAILY_POOL,d.date),weekly=challengeFor(WEEKLY_POOL,w.date);
 if(!d.completed&&d.progress>=daily.target){
  d.completed=true;d.streak+=1;d.lastCompletedDate=d.date;
  reward('DAILY: '+daily.title,daily.reward);
  window.dispatchEvent(new CustomEvent('superkingdom:achievement',{detail:{name:'Daily challenge complete'}}));
 }
 if(!w.completed&&w.progress>=weekly.target){
  w.completed=true;w.streak+=1;w.lastCompletedDate=w.date;
  reward('WEEKLY: '+weekly.title,weekly.reward);
  window.dispatchEvent(new CustomEvent('superkingdom:achievement',{detail:{name:'Weekly challenge complete'}}));
 }
}
function recordEvent(type,data={}){
 ensureChallenges();
 const amount=Math.max(0,Math.floor(Number(data.amount)||1));
 let dailyAdd=0,weeklyAdd=0;
 if(type==='coin'){
  state.stats.coins+=amount;dailyAdd=amount;weeklyAdd=amount;
 }else if(type==='star'){state.stats.stars+=amount}
 else if(type==='chest'){
  state.stats.chests+=amount;dailyAdd=amount;weeklyAdd=amount;
 }else if(type==='wonder'){state.stats.wonderSeeds+=amount}
 else if(type==='guardian'){
  state.stats.guardians+=amount;dailyAdd=amount;weeklyAdd=amount;
 }else if(type==='death'){state.stats.defeats+=amount}
 else if(type==='worldComplete'){
  const world=Math.floor(Number(data.world)||0);
  if(world>=1&&world<=WORLD_COUNT){
   const first=!state.completedWorlds.includes(world);
   if(first){state.completedWorlds.push(world);state.completedWorlds.sort((a,b)=>a-b);state.stats.worldCompletions+=1}
   const old=state.worldRecords[world]||{bestScore:0,timesCompleted:0,bestTime:0,lastCompletedAt:0};
   const elapsed=Math.max(0,Number(data.seconds)||0),score=Math.max(0,Math.floor(Number(data.score)||0));
   state.worldRecords[world]={bestScore:Math.max(old.bestScore,score),timesCompleted:old.timesCompleted+1,bestTime:old.bestTime?Math.min(old.bestTime,elapsed):elapsed,lastCompletedAt:Date.now()};
   if(!state.daily.completed)dailyAdd=1;
   if(!state.weekly.completed&&!state.weekly.seenWorlds.includes(world)){state.weekly.seenWorlds.push(world);weeklyAdd=1}
  }
 }
 if(!state.daily.completed&&dailyAdd&&challengeFor(DAILY_POOL,state.daily.date).id===type)state.daily.progress+=dailyAdd;
 if(!state.weekly.completed&&weeklyAdd&&challengeFor(WEEKLY_POOL,state.weekly.date).id===type)state.weekly.progress+=weeklyAdd;
 maybeCompleteChallenges();
 awardAchievements();
 persist();
}
function status(){
 ensureChallenges();
 const d=state.daily,w=state.weekly;
 return {
  ...clone(state),
  daily:{...clone(d),challenge:clone(challengeFor(DAILY_POOL,d.date))},
  weekly:{...clone(w),challenge:clone(challengeFor(WEEKLY_POOL,w.date))},
  achievementDefinitions:clone(ACHIEVEMENTS)
 };
}
function safeRunSave(){
 try{
  const raw=localStorage.getItem(RUN_KEY);if(!raw)return null;
  const parsed=JSON.parse(raw);
  if(!parsed||![1,2].includes(parsed.version)||!Number.isInteger(parsed.world)||parsed.world<0||parsed.world>=WORLD_COUNT)return null;
  return parsed;
 }catch(_){return null}
}
function exportBackup(){
 const payload={format:'ethan-super-kingdom-backup',version:1,exportedAt:new Date().toISOString(),career:clone(state),run:safeRunSave()};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='super-kingdom-adventure-backup-'+utcDay()+'.json';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function importBackup(file){
 if(!file||file.size>2*1024*1024)throw new Error('Backup file must be smaller than 2 MB.');
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onerror=()=>reject(new Error('Could not read the backup file.'));
  reader.onload=()=>{
   try{
    const parsed=JSON.parse(String(reader.result||''));
    if(parsed?.format!=='ethan-super-kingdom-backup'||parsed.version!==1)throw new Error('This is not a supported Super Kingdom Adventure backup.');
    const next=normalise(parsed.career);
    if(parsed.run!==null&&parsed.run!==undefined&&(![1,2].includes(parsed.run.version)||!Number.isInteger(parsed.run.world)||parsed.run.world<0||parsed.run.world>=WORLD_COUNT))throw new Error('The saved adventure data is invalid.');
    state=next;persistNow();
    if(parsed.run)localStorage.setItem(RUN_KEY,JSON.stringify(parsed.run));else localStorage.removeItem(RUN_KEY);
    window.dispatchEvent(new CustomEvent('superkingdom:save-imported'));
    resolve(true);
   }catch(err){reject(err)}
  };
  reader.readAsText(file);
 });
}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function formatTime(seconds){const n=Math.max(0,Math.floor(Number(seconds)||0));return Math.floor(n/60)+'m '+String(n%60)+'s'}
function render(){
 const s=status(),done=s.completedWorlds.length;
 const d=s.daily,w=s.weekly;
 const dPct=Math.min(100,Math.round(d.progress/Math.max(1,d.challenge.target)*100));
 const wPct=Math.min(100,Math.round(w.progress/Math.max(1,w.challenge.target)*100));
 const worldRows=Array.from({length:WORLD_COUNT},(_,i)=>{
  const n=i+1,r=s.worldRecords[n],complete=s.completedWorlds.includes(n);
  return '<div class="sk-world-row '+(complete?'complete':'')+'"><b>'+String(n).padStart(2,'0')+'</b><span>'+esc(complete?'COMPLETED':'NOT YET CLEARED')+'</span><small>'+(r?'BEST '+r.bestScore.toLocaleString()+' · '+formatTime(r.bestTime):'—')+'</small></div>';
 }).join('');
 const ach=s.achievementDefinitions.map(a=>{
  const unlocked=!!s.achievements[a.id];
  return '<div class="sk-achievement '+(unlocked?'unlocked':'')+'"><b>'+(unlocked?'🏆':'🔒')+' '+esc(a.name)+'</b><span>'+esc(a.desc)+'</span></div>';
 }).join('');
 return '<div class="sk-journal-shell"><header><div><small>ETHAN • SUPER KINGDOM ADVENTURE</small><h2>👑 KINGDOM JOURNAL</h2><p>Track your journey across all 40 kingdoms.</p></div><button type="button" id="sk-journal-close" aria-label="Close journal">×</button></header>'+
 '<section class="sk-stat-grid"><div><b>'+done+'/40</b><span>Kingdoms cleared</span></div><div><b>'+s.stats.guardians+'</b><span>Guardians defeated</span></div><div><b>'+s.stats.chests+'</b><span>Hidden chests</span></div><div><b>'+s.stats.coins.toLocaleString()+'</b><span>Coins collected</span></div><div><b>'+s.stats.wonderSeeds+'</b><span>Wonder Seeds</span></div><div><b>'+s.stats.defeats+'</b><span>Defeats survived</span></div></section>'+
 '<section class="sk-challenge-grid"><article class="sk-challenge"><small>DAILY KINGDOM TRIAL</small><h3>'+esc(d.challenge.title)+'</h3><p>'+esc(d.challenge.text)+'</p><div class="sk-progress"><i style="width:'+dPct+'%"></i></div><b>'+Math.min(d.progress,d.challenge.target)+' / '+d.challenge.target+(d.completed?' · COMPLETE':'')+'</b><small>Reward: '+d.challenge.reward+' coins · Streak: '+d.streak+' days</small></article>'+
 '<article class="sk-challenge weekly"><small>WEEKLY KINGDOM TRIAL</small><h3>'+esc(w.challenge.title)+'</h3><p>'+esc(w.challenge.text)+'</p><div class="sk-progress"><i style="width:'+wPct+'%"></i></div><b>'+Math.min(w.progress,w.challenge.target)+' / '+w.challenge.target+(w.completed?' · COMPLETE':'')+'</b><small>Reward: '+w.challenge.reward+' coins · Streak: '+w.streak+' weeks</small></article></section>'+
 '<section><h3>🏅 ACHIEVEMENTS · '+Object.keys(s.achievements).length+'/'+s.achievementDefinitions.length+'</h3><div class="sk-achievements">'+ach+'</div></section>'+
 '<section><h3>🌍 KINGDOM COMPLETION MAP</h3><div class="sk-world-grid">'+worldRows+'</div></section>'+
 '<footer><span>Progress is stored on this device. Use backup to move it to another device.</span><div><button type="button" id="sk-export">EXPORT BACKUP</button><button type="button" id="sk-import">RESTORE BACKUP</button><input id="sk-import-file" type="file" accept="application/json,.json" hidden></div></footer></div>';
}
function open(){
 if(document.getElementById('sk-career-overlay'))return;
 window.dispatchEvent(new CustomEvent('superkingdom:career-open'));
 const root=document.createElement('div');root.id='sk-career-overlay';root.innerHTML=render();document.body.appendChild(root);
 root.querySelector('#sk-journal-close').onclick=()=>close();
 root.querySelector('#sk-export').onclick=()=>exportBackup();
 const picker=root.querySelector('#sk-import-file');
 root.querySelector('#sk-import').onclick=()=>picker.click();
 picker.onchange=async()=>{
  const file=picker.files?.[0];if(!file)return;
  if(!confirm('Restore this backup? It replaces the career journal and saved adventure on this device.')){picker.value='';return}
  try{await importBackup(file);root.querySelector('.sk-journal-shell').innerHTML=render().replace('<div class="sk-journal-shell">','').replace(/<\/div>$/,'');alert('Backup restored successfully.');}
  catch(err){alert(err.message||'Backup restore failed.')}
  picker.value='';
 };
}
function close(){
 const root=document.getElementById('sk-career-overlay');if(root)root.remove();
 window.dispatchEvent(new CustomEvent('superkingdom:career-close'));
}
window.SuperKingdomCareer={open,close,recordEvent,status,exportBackup};
})();
