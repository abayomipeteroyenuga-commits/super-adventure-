(function(){
'use strict';

const CAREER_KEY='ethan.superkingdom.career.v1';
const RUN_KEY='ethan.superkingdom.save.v1';
const WORLD_COUNT=40;
const DAILY_POOL=[
  {id:'coin',title:'COIN COLLECTOR',text:'Collect 25 coins today',target:25,reward:35},
  {id:'chest',title:'TREASURE SEEKER',text:'Open a hidden kingdom chest today',target:1,reward:60},
  {id:'guardian',title:'GUARDIAN HUNTER',text:'Defeat a guardian today',target:1,reward:75},
  {id:'world',title:'KINGDOM EXPLORER',text:'Complete a kingdom today',target:1,reward:90},
  {id:'trial',title:'SPEED RUNNER',text:'Clear a kingdom in Time Attack today',target:1,reward:110},
  {id:'extreme',title:'EXTREME CHAMPION',text:'Clear an Extreme Trial today',target:1,reward:140}
];
const WEEKLY_POOL=[
  {id:'coin',title:'ROYAL TREASURY',text:'Collect 150 coins this week',target:150,reward:180},
  {id:'chest',title:'MASTER TREASURE HUNTER',text:'Open 6 hidden chests this week',target:6,reward:220},
  {id:'guardian',title:'GUARDIAN CHAMPION',text:'Defeat 4 guardians this week',target:4,reward:250},
  {id:'world',title:'KINGDOM CONQUEROR',text:'Complete 5 kingdoms this week',target:5,reward:300},
  {id:'trial',title:'TIMEKEEPER',text:'Clear 3 kingdoms in Time Attack',target:3,reward:400},
  {id:'extreme',title:'EXTREME ROYALTY',text:'Clear 2 Extreme Trials',target:2,reward:500}
];
const BADGE_GUIDE=[
 {name:'FEATHER GLIDE',desc:'Hold jump while falling to slow your descent.'},
 {name:'COIN MAGNET',desc:'Attract nearby coins automatically.'},
 {name:'POWER STOMP',desc:'Bounce harder on enemies and earn extra score.'},
 {name:'ROYAL DOUBLE JUMP',desc:'Jump once more while already in the air.'},
 {name:'TREASURE RADAR',desc:'Reveal hidden chests from farther away.'},
 {name:'SWIFT STRIDE',desc:'Move faster through the kingdom.'}
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
 {id:'weekly_streak',name:'ROYAL ROUTINE',desc:'Complete weekly challenges 4 weeks in a row.'},
 {id:'time_trialist',name:'TIME TRIALIST',desc:'Clear 3 kingdoms in Time Attack.'},
 {id:'extreme_champion',name:'EXTREME CHAMPION',desc:'Clear 3 Extreme Trials.'},
 {id:'medal_collector',name:'MEDAL COLLECTOR',desc:'Earn 10 gold or platinum kingdom medals.'},
 {id:'platinum_royalty',name:'PLATINUM ROYALTY',desc:'Earn 5 platinum kingdom medals.'}
];

function utcDay(date=new Date()){return new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())).toISOString().slice(0,10)}
function weekKey(date=new Date()){
 const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
 const day=d.getUTCDay();d.setUTCDate(d.getUTCDate()-(day===0?6:day-1));return d.toISOString().slice(0,10);
}
function hash(value){let n=0;for(let i=0;i<value.length;i++)n=(n*31+value.charCodeAt(i))>>>0;return n}
function clone(value){return JSON.parse(JSON.stringify(value))}
const MODES=['story','replay','assist','time-attack','extreme'];
const MEDAL_RANK={none:0,bronze:1,silver:2,gold:3,platinum:4};
function medalFor(seconds,score){
 const t=Math.max(0,Number(seconds)||0),p=Math.max(0,Number(score)||0);
 if(t>0&&t<=75&&p>=3500)return 'platinum';
 if(t>0&&t<=110&&p>=2400)return 'gold';
 if((t>0&&t<=155)||p>=1500)return 'silver';
 return 'bronze';
}
function betterMedal(a,b){return (MEDAL_RANK[b]||0)>(MEDAL_RANK[a]||0)?b:(a||b||'none')}
function medalTotals(records=state.worldRecords){
 const total={bronze:0,silver:0,gold:0,platinum:0};
 for(const r of Object.values(records||{})){if(r&&Object.prototype.hasOwnProperty.call(total,r.bestMedal))total[r.bestMedal]++;}
 return total;
}
function blank(){
 return {
  version:1,createdAt:Date.now(),updatedAt:Date.now(),
  stats:{coins:0,stars:0,chests:0,wonderSeeds:0,guardians:0,defeats:0,worldCompletions:0,timeTrials:0,extremeClears:0,assistClears:0},
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
    const bestScore=number(value.bestScore),timesCompleted=number(value.timesCompleted),bestTime=number(value.bestTime,86400);
    const legacyMedal=timesCompleted&&bestTime?medalFor(bestTime,bestScore):'none';
    const modes={};
    const sourceModes=value.modes&&typeof value.modes==='object'?value.modes:{};
    for(const mode of MODES){
     const source=sourceModes[mode]&&typeof sourceModes[mode]==='object'?sourceModes[mode]:null;
     if(source){const clears=number(source.clears);modes[mode]={bestScore:number(source.bestScore),bestTime:number(source.bestTime,86400),clears,bestMedal:mode==='assist'?'none':(MEDAL_RANK[source.bestMedal]!==undefined?source.bestMedal:(clears&&number(source.bestTime,86400)?medalFor(source.bestTime,source.bestScore):'none'))};}
    }
    if(timesCompleted&&!modes.story)modes.story={bestScore,bestTime,clears:timesCompleted,bestMedal:legacyMedal};
    const bestMedal=MEDAL_RANK[value.bestMedal]!==undefined?value.bestMedal:betterMedal('none',legacyMedal);
    d.worldRecords[world]={bestScore,timesCompleted,bestTime,lastCompletedAt:number(value.lastCompletedAt),bestMedal,modes};
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
 const s=state.stats,worlds=state.completedWorlds.length,medals=medalTotals();
 const checks={
  first_kingdom:worlds>=1,guardian_hunter:s.guardians>=5,treasure_hunter:s.chests>=10,
  wonder_seeker:s.wonderSeeds>=10,coin_collector:s.coins>=500,explorer:worlds>=20,
  kingdom_master:worlds>=40,resilient:s.defeats>=10,daily_streak:state.daily.streak>=7,
  weekly_streak:state.weekly.streak>=4,time_trialist:s.timeTrials>=3,extreme_champion:s.extremeClears>=3,
  medal_collector:medals.gold+medals.platinum>=10,platinum_royalty:medals.platinum>=5
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
   const mode=MODES.includes(data.mode)?data.mode:'story';
   const first=!state.completedWorlds.includes(world);
   if(first){state.completedWorlds.push(world);state.completedWorlds.sort((a,b)=>a-b);state.stats.worldCompletions+=1}
   const old=state.worldRecords[world]||{bestScore:0,timesCompleted:0,bestTime:0,lastCompletedAt:0,bestMedal:'none',modes:{}};
   const elapsed=Math.max(0,Number(data.seconds)||0),score=Math.max(0,Math.floor(Number(data.score)||0));
   const current=old.modes?.[mode]||{bestScore:0,bestTime:0,clears:0,bestMedal:'none'};
   const medal=mode==='assist'?'none':medalFor(elapsed,score);
   const nextMode={bestScore:Math.max(current.bestScore,score),bestTime:current.bestTime?Math.min(current.bestTime,elapsed):elapsed,clears:current.clears+1,bestMedal:betterMedal(current.bestMedal,medal)};
   state.worldRecords[world]={bestScore:Math.max(old.bestScore,score),timesCompleted:old.timesCompleted+1,bestTime:old.bestTime?Math.min(old.bestTime,elapsed):elapsed,lastCompletedAt:Date.now(),bestMedal:betterMedal(old.bestMedal,medal),modes:{...(old.modes||{}),[mode]:nextMode}};
   if(mode==='time-attack')state.stats.timeTrials+=1;
   if(mode==='extreme')state.stats.extremeClears+=1;
   if(mode==='assist')state.stats.assistClears+=1;
   if(!state.daily.completed)dailyAdd=1;
   if(mode==='time-attack'||mode==='extreme'){
    if(!state.weekly.completed)weeklyAdd=1;
   }else if(!state.weekly.completed&&!state.weekly.seenWorlds.includes(world)){
    state.weekly.seenWorlds.push(world);weeklyAdd=1;
   }
  }
 }
 const completedMode=type==='worldComplete'&&MODES.includes(data.mode)?data.mode:'story';
 const challengeType=type==='worldComplete'?(completedMode==='time-attack'?'trial':completedMode==='extreme'?'extreme':'world'):type;
 if(!state.daily.completed&&dailyAdd&&challengeFor(DAILY_POOL,state.daily.date).id===challengeType)state.daily.progress+=dailyAdd;
 if(!state.weekly.completed&&weeklyAdd&&challengeFor(WEEKLY_POOL,state.weekly.date).id===challengeType)state.weekly.progress+=weeklyAdd;
 maybeCompleteChallenges();
 awardAchievements();
 if(type==='worldComplete')persistNow();else persist();
}
function status(){
 ensureChallenges();
 const d=state.daily,w=state.weekly;
 return {
  ...clone(state),
  medalTotals:clone(medalTotals()),
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
  if(!complete)return '<div class="sk-world-row locked"><div class="sk-world-info"><b>WORLD '+String(n).padStart(2,'0')+'</b><span>🔒 NOT CLEARED</span><small>Complete in Story Mode to unlock trials</small></div></div>';
  const best=(r?.bestMedal||'bronze').toUpperCase(),timeMode=r?.modes?.['time-attack'],extremeMode=r?.modes?.extreme;
  return '<div class="sk-world-row complete"><div class="sk-world-info"><b>🌍 WORLD '+String(n).padStart(2,'0')+'</b><span class="sk-medal-'+best.toLowerCase()+'">'+best+' MEDAL</span><small>BEST '+Number(r.bestScore||0).toLocaleString()+' · '+formatTime(r.bestTime)+'</small><small>TIME ATTACK: '+(timeMode?.clears?formatTime(timeMode.bestTime):'—')+' · EXTREME: '+(extremeMode?.clears?formatTime(extremeMode.bestTime):'—')+'</small></div><div class="sk-world-actions"><select data-mode-for="'+n+'" aria-label="Choose trial for world '+n+'"><option value="replay">REPLAY</option><option value="time-attack">TIME ATTACK</option><option value="extreme">EXTREME</option><option value="assist">ASSIST PLAY</option></select><button type="button" data-launch-world="'+n+'">PLAY</button></div></div>';
 }).join('');
 const ach=s.achievementDefinitions.map(a=>{
  const unlocked=!!s.achievements[a.id];
  return '<div class="sk-achievement '+(unlocked?'unlocked':'')+'"><b>'+(unlocked?'🏆':'🔒')+' '+esc(a.name)+'</b><span>'+esc(a.desc)+'</span></div>';
 }).join('');
 const badgeCards=BADGE_GUIDE.map(a=>'<div class="sk-achievement unlocked"><b>🧩 '+esc(a.name)+'</b><span>'+esc(a.desc)+'</span></div>').join('');
 return '<div class="sk-journal-shell"><header><div><small>ETHAN • SUPER KINGDOM ADVENTURE</small><h2>👑 ROYAL CHALLENGE HALL</h2><p>Replay cleared kingdoms, chase medals or enter a tougher trial.</p></div><button type="button" id="sk-journal-close" aria-label="Close journal">×</button></header>'+
 '<section class="sk-stat-grid"><div><b>'+done+'/40</b><span>Kingdoms cleared</span></div><div><b>'+s.stats.guardians+'</b><span>Guardians defeated</span></div><div><b>'+s.stats.chests+'</b><span>Hidden chests</span></div><div><b>'+s.stats.coins.toLocaleString()+'</b><span>Coins collected</span></div><div><b>'+s.stats.wonderSeeds+'</b><span>Wonder Seeds</span></div><div><b>'+s.stats.defeats+'</b><span>Defeats survived</span></div><div><b>'+s.stats.timeTrials+'</b><span>Time Attack clears</span></div><div><b>'+s.stats.extremeClears+'</b><span>Extreme clears</span></div><div><b>'+Object.values(s.medalTotals).reduce((a,b)=>a+b,0)+'</b><span>Kingdom medals</span></div></section>'+
 '<section class="sk-medal-cabinet"><h3>🏆 MEDAL CABINET</h3><div><span>🥉 '+s.medalTotals.bronze+' Bronze</span><span>🥈 '+s.medalTotals.silver+' Silver</span><span>🥇 '+s.medalTotals.gold+' Gold</span><span>💎 '+s.medalTotals.platinum+' Platinum</span></div></section>'+
 '<section class="sk-challenge-grid"><article class="sk-challenge"><small>DAILY KINGDOM TRIAL</small><h3>'+esc(d.challenge.title)+'</h3><p>'+esc(d.challenge.text)+'</p><div class="sk-progress"><i style="width:'+dPct+'%"></i></div><b>'+Math.min(d.progress,d.challenge.target)+' / '+d.challenge.target+(d.completed?' · COMPLETE':'')+'</b><small>Reward: '+d.challenge.reward+' coins · Streak: '+d.streak+' days</small></article>'+
 '<article class="sk-challenge weekly"><small>WEEKLY KINGDOM TRIAL</small><h3>'+esc(w.challenge.title)+'</h3><p>'+esc(w.challenge.text)+'</p><div class="sk-progress"><i style="width:'+wPct+'%"></i></div><b>'+Math.min(w.progress,w.challenge.target)+' / '+w.challenge.target+(w.completed?' · COMPLETE':'')+'</b><small>Reward: '+w.challenge.reward+' coins · Streak: '+w.streak+' weeks</small></article></section>'+
 '<section><h3>🧩 SIX ABILITY BADGES</h3><div class="sk-achievements">'+badgeCards+'</div></section>'+
 '<section><h3>🏅 ACHIEVEMENTS · '+Object.keys(s.achievements).length+'/'+s.achievementDefinitions.length+'</h3><div class="sk-achievements">'+ach+'</div></section>'+
 '<section><h3>🌍 KINGDOM REPLAY & TRIAL SELECT</h3><p class="sk-section-note">Clear a kingdom in Story Mode once to unlock replay, Time Attack, Extreme and Assist modes. Records and medals are saved on this device.</p><div class="sk-world-grid">'+worldRows+'</div></section>'+
 '<footer><span>Personal bests are local to this device. Online rankings and cross-device sync are not connected yet. Backup moves your progress between devices.</span><div><button type="button" id="sk-export">EXPORT BACKUP</button><button type="button" id="sk-import">RESTORE BACKUP</button><input id="sk-import-file" type="file" accept="application/json,.json" hidden></div></footer></div>';
}
function bindJournal(root){
 root.querySelector('#sk-journal-close').onclick=()=>close();
 root.querySelectorAll('[data-launch-world]').forEach(button=>{
  button.onclick=()=>{
   const world=Number(button.getAttribute('data-launch-world'));
   const select=root.querySelector('[data-mode-for="'+world+'"]');
   const mode=select?.value||'replay';
   close();
   window.SuperKingdomGame?.startKingdom(world,mode);
  };
 });
 root.querySelector('#sk-export').onclick=()=>exportBackup();
 const picker=root.querySelector('#sk-import-file');
 root.querySelector('#sk-import').onclick=()=>picker.click();
 picker.onchange=async()=>{
  const file=picker.files?.[0];if(!file)return;
  if(!confirm('Restore this backup? It replaces the career journal and saved adventure on this device.')){picker.value='';return}
  try{await importBackup(file);root.innerHTML=render();bindJournal(root);alert('Backup restored successfully.');}
  catch(err){alert(err.message||'Backup restore failed.')}
  picker.value='';
 };
}
function ensureJournalStyles(){
 if(document.getElementById('sk-trials-style'))return;
 const style=document.createElement('style');style.id='sk-trials-style';
 style.textContent=`
 .sk-medal-cabinet{margin:4px 0 16px;padding:13px 15px;border:1px solid #f4d46d55;border-radius:13px;background:#f4d46d0c}
 .sk-medal-cabinet h3{margin:0 0 10px;color:#f7d36d;font-size:14px}
 .sk-medal-cabinet>div{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;font-weight:800;color:#e8f0fb}
 .sk-section-note{margin:-2px 0 10px;color:#a9bfd8;font-size:12px;line-height:1.45}
 .sk-world-grid{grid-template-columns:repeat(2,minmax(0,1fr));max-height:420px}
 .sk-world-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;padding:10px}
 .sk-world-info{display:grid;gap:4px;min-width:0}
 .sk-world-info>b{font-size:12px;color:#f4d46d}
 .sk-world-info>span{font-size:10px;font-weight:1000;color:#cbd9ea}
 .sk-world-info>small{font-size:9px;color:#92abc6;line-height:1.35}
 .sk-medal-platinum{color:#7de8ff!important}.sk-medal-gold{color:#ffdf77!important}.sk-medal-silver{color:#dce6f4!important}.sk-medal-bronze{color:#e8ad79!important}
 .sk-world-actions{display:flex;align-items:center;gap:5px;flex:0 0 auto}
 .sk-world-actions select{max-width:112px;min-width:92px;padding:8px 5px;border:1px solid #f5d36a66;border-radius:8px;background:#10233b;color:#fff;font-size:9px;font-weight:900}
 .sk-world-actions button{padding:8px 10px!important;font-size:10px!important;background:#996d22!important}
 .sk-world-row.locked{opacity:.6}
 @media(max-width:680px){.sk-world-grid{grid-template-columns:1fr}.sk-world-row{align-items:flex-start;flex-direction:column}.sk-world-actions{width:100%}.sk-world-actions select{flex:1;max-width:none}}
 `;
 document.head.appendChild(style);
}
function open(){
 if(document.getElementById('sk-career-overlay'))return;
 ensureJournalStyles();
 window.dispatchEvent(new CustomEvent('superkingdom:career-open'));
 const root=document.createElement('div');root.id='sk-career-overlay';root.innerHTML=render();document.body.appendChild(root);
 bindJournal(root);
}
function close(){
 const root=document.getElementById('sk-career-overlay');if(root)root.remove();
 window.dispatchEvent(new CustomEvent('superkingdom:career-close'));
}
window.SuperKingdomCareer={open,close,recordEvent,status,exportBackup,medalFor};
})();
