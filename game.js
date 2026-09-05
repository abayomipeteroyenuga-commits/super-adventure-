
const c=document.getElementById('game');
if(!c) throw new Error('Game canvas element could not be initialized.');
const ctx=c.getContext('2d',{alpha:false,desynchronized:true}) || c.getContext('2d');
if(!ctx) throw new Error('Game canvas context could not be initialized.');
// Compatibility: older mobile browsers may not support CanvasRenderingContext2D.roundRect.
if(typeof ctx.roundRect!=='function'){
  ctx.roundRect=function(x,y,w,h,r=0){
    const rr=Array.isArray(r)?(r[0]||0):r; const rad=Math.max(0,Math.min(Math.abs(w)/2,Math.abs(h)/2,Number(rr)||0));
    this.moveTo(x+rad,y); this.lineTo(x+w-rad,y); this.quadraticCurveTo(x+w,y,x+w,y+rad);
    this.lineTo(x+w,y+h-rad); this.quadraticCurveTo(x+w,y+h,x+w-rad,y+h);
    this.lineTo(x+rad,y+h); this.quadraticCurveTo(x,y+h,x,y+h-rad);
    this.lineTo(x,y+rad); this.quadraticCurveTo(x,y,x+rad,y); return this;
  };
}
function roundRectSafe(g,x,y,w,h,r=0){
  g.beginPath();
  g.roundRect(x,y,w,h,r);
  return g;
}
let viewW=1100,viewH=innerHeight;
let running=false,last=0,cam=0,score=0,coins=0,stars=0,lives=3,world=0,level=1,timeLeft=180;
let finishCelebration=0, finishNextWorld=false, finishEmote='🥳', gameState='menu', transitionLocked=false, pauseBeforeHide=false;
let rescueSequence=0, rescueDone=false;
let player,platforms=[],enemies=[],items=[],projectiles=[],bossShots=[],particles=[],goal,boss,shopOpen=false,paused=false,checkpointX=70,checkpointY=350,rafId=0,camY=0;
const keys={}, WORLD_COUNT=20;
let audioCtx=null, musicGain=null, sfxGain=null, musicTimer=null, victoryTimer=null, musicOn=true, victoryActive=false, activeVoices=0;
let sfxTimers=new Set(), worldTransitionId=0;
let lastDrawNow=0, lowDetail=false, slowFrames=0, frameNow=0;
let skyGradientCache={key:'',gradient:null};
const musicTracks=[
 {mel:[262,330,392,523,659,523,392,330],bass:[131,165,196,165],beat:190},
 {mel:[220,247,294,330,440,392,330,294],bass:[110,123,147,165],beat:175},
 {mel:[294,349,440,523,587,523,440,349],bass:[147,175,220,196],beat:165},
 {mel:[196,247,294,370,494,370,294,247],bass:[98,123,147,185],beat:155},
 {mel:[330,392,494,659,784,659,494,392],bass:[165,196,247,330],beat:145},
 {mel:[392,494,587,698,784,698,587,494],bass:[196,247,294,349],beat:135},
 {mel:[175,220,262,330,392,330,262,220],bass:[87,110,131,165],beat:125},
 {mel:[247,311,370,494,622,740,622,494],bass:[123,155,185,247],beat:120}
];
function initAudio(){
 if(!audioCtx){
   const AC=window.AudioContext||window.webkitAudioContext;
   if(!AC){musicOn=false;return false;}
   try{audioCtx=new AC();musicGain=audioCtx.createGain();sfxGain=audioCtx.createGain();musicGain.gain.value=.045;sfxGain.gain.value=.12;musicGain.connect(audioCtx.destination);sfxGain.connect(audioCtx.destination);}catch(_){audioCtx=null;musicOn=false;return false;}
 }
 if(audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
 return true;
}
function tone(freq,dur=.1,type='square',gain=.08,bus='sfx'){
 if(!audioCtx||!musicOn||activeVoices>=36||!Number.isFinite(freq)||freq<=0)return;
 try{const o=audioCtx.createOscillator(),g=audioCtx.createGain();activeVoices++;o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(Math.max(.0001,gain),audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+Math.max(.02,dur));o.connect(g);g.connect(bus==='music'?musicGain:sfxGain);o.onended=()=>{activeVoices=Math.max(0,activeVoices-1);try{o.disconnect();g.disconnect()}catch(_){}};o.start();o.stop(audioCtx.currentTime+Math.max(.02,dur)+.02)}catch(_){activeVoices=Math.max(0,activeVoices-1)}
}
function clearAudioTimers(){for(const id of sfxTimers)clearTimeout(id);sfxTimers.clear()}
function stopVictoryMusic(){if(victoryTimer){clearTimeout(victoryTimer);victoryTimer=null}victoryActive=false}
function stopAllMusic(){
 if(musicTimer){clearTimeout(musicTimer);musicTimer=null}
 if(victoryTimer){clearTimeout(victoryTimer);victoryTimer=null}
 victoryActive=false;
 clearAudioTimers();
}
function playMusic(){
 if(!audioCtx||!musicOn)return;
 if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
 stopVictoryMusic(); if(musicTimer){clearTimeout(musicTimer);musicTimer=null}
 let i=0; const tr=musicTracks[world%musicTracks.length];
 const tick=()=>{musicTimer=null;if(!musicOn||!audioCtx||!running)return;if(!paused&&!shopOpen&&!victoryActive){const n=tr.mel[i%tr.mel.length],b=tr.bass[Math.floor(i/2)%tr.bass.length];tone(n,.18,'triangle',.62,'music');if(i%2===0)tone(b,.28,'sine',.26,'music');if(i%4===3)tone(n*2,.07,'square',.12,'music');i++;}musicTimer=setTimeout(tick,Math.max(120,tr.beat));};
 musicTimer=setTimeout(tick,40);
}
function victoryToneAt(freq,start,dur,type='triangle',gain=.42){if(!audioCtx||!musicOn||!musicGain)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,start);g.gain.setValueAtTime(Math.max(.0001,gain),start);g.gain.exponentialRampToValueAtTime(.001,start+dur);o.connect(g);g.connect(musicGain);o.start(start);o.stop(start+dur+.03)}
function playVictoryMusic(){
 if(!audioCtx||!musicOn)return;if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});stopAllMusic();victoryActive=true;
 const melody=[523,659,784,1047,784,1047,1319,1047,784,1047,1319,1568],bass=[131,131,165,196,131,165,196,262];
 const cycleMs=melody.length*.24*1000+220;
 const play=()=>{victoryTimer=null;if(!running||!victoryActive||!musicOn)return;if(!paused&&!shopOpen){const t=audioCtx.currentTime+.03;melody.forEach((n,i)=>{const at=t+i*.24;victoryToneAt(n,at,.20,'triangle',.62);if(i%2===0)victoryToneAt(n*2,at+.08,.10,'sine',.14)});bass.forEach((n,i)=>victoryToneAt(n,t+i*.48,.42,'sine',.24));}victoryTimer=setTimeout(play,cycleMs);};
 play();
}
function laterSfx(fn,ms){const id=setTimeout(()=>{sfxTimers.delete(id);fn()},ms);sfxTimers.add(id)}
function sfx(name){
 if(name==='jump')tone(520,.09,'square',.8);
 else if(name==='coin'){tone(880,.07,'triangle',.7);laterSfx(()=>{if(audioCtx&&musicOn)tone(1320,.09,'triangle',.55)},45);}
 else if(name==='fire'){tone(150,.10,'sawtooth',.72);laterSfx(()=>{if(audioCtx&&musicOn)tone(300,.07,'square',.42)},35);}
 else if(name==='stomp')tone(110,.12,'square',.7);
 else if(name==='hit')tone(80,.15,'sawtooth',.7);
 else if(name==='star'){tone(660,.10,'triangle',.65);laterSfx(()=>{if(audioCtx&&musicOn)tone(990,.10,'triangle',.6)},55);laterSfx(()=>{if(audioCtx&&musicOn)tone(1320,.14,'sine',.55)},110);}
 else if(name==='goal'){tone(660,.12,'triangle',.75);laterSfx(()=>{if(audioCtx&&musicOn)tone(880,.14,'triangle',.7)},100);laterSfx(()=>{if(audioCtx&&musicOn)tone(1320,.22,'sine',.65)},220);}
}

const themes=[
 {name:'Meadow Kingdom',sky1:'#65c9ff',sky2:'#e8fbff',ground:'#55a43e',soil:'#87532f',accent:'#ffcf33'},
 {name:'Sunset Desert',sky1:'#ffad63',sky2:'#ffe7a8',ground:'#c59a42',soil:'#8b5d32',accent:'#fff06a'},
 {name:'Mystic Forest',sky1:'#65d7bb',sky2:'#d8ffe8',ground:'#367d4a',soil:'#5a4030',accent:'#d7ff7d'},
 {name:'Crystal Caverns',sky1:'#514e9e',sky2:'#b6b8ff',ground:'#5b6cb3',soil:'#3c3c63',accent:'#7ef7ff'},
 {name:'Frozen Peaks',sky1:'#8bdfff',sky2:'#f2fbff',ground:'#b9e8f7',soil:'#6689a2',accent:'#ffffff'},
 {name:'Sky Islands',sky1:'#8caeff',sky2:'#f5eaff',ground:'#6bb67a',soil:'#7b583c',accent:'#ffe56b'},
 {name:'Volcano Valley',sky1:'#4d1d2c',sky2:'#ff8758',ground:'#8c4937',soil:'#40252a',accent:'#ffdf57'},
 {name:'Royal Citadel',sky1:'#303b70',sky2:'#9a8fd4',ground:'#7e7d9b',soil:'#484862',accent:'#ffd86b'},
 {name:'Ancient Ruins',sky1:'#d8b47a',sky2:'#f4e6bd',ground:'#8d9b58',soil:'#66513a',accent:'#f5d36a'},
 {name:'Dark Swamp',sky1:'#31463d',sky2:'#89a57a',ground:'#466b45',soil:'#3d4533',accent:'#b8ef72'},
 {name:'Dragon Valley',sky1:'#7b4b43',sky2:'#e3a16c',ground:'#75483a',soil:'#402b2b',accent:'#ffb347'},
 {name:'Pirate Kingdom',sky1:'#4d9fc4',sky2:'#d6f0ed',ground:'#4c7f59',soil:'#6c4932',accent:'#ffd45e'},
 {name:'Thunder Mountains',sky1:'#30384f',sky2:'#7d8fa8',ground:'#5f6671',soil:'#383d47',accent:'#f7ef75'},
 {name:'Lost City',sky1:'#5c9c75',sky2:'#cde3a5',ground:'#5d8254',soil:'#65523b',accent:'#e7cf72'},
 {name:'Shadow Forest',sky1:'#292747',sky2:'#6d578e',ground:'#3f4a55',soil:'#2d2b38',accent:'#d19cff'},
 {name:'Golden Kingdom',sky1:'#6fc4e8',sky2:'#fff1b8',ground:'#b9a04c',soil:'#765d2c',accent:'#ffe36a'},
 {name:'Monster Fortress',sky1:'#292531',sky2:'#8b3f45',ground:'#5b4648',soil:'#302b32',accent:'#ff6d5f'},
 {name:'Magic Castle',sky1:'#62529d',sky2:'#e1b5ed',ground:'#6c5d9b',soil:'#493c67',accent:'#ffb5ff'},
 {name:'The Dark Kingdom',sky1:'#181b2b',sky2:'#552d46',ground:'#41333f',soil:'#24222b',accent:'#e15b65'},
 {name:'The Ultimate Kingdom',sky1:'#9edfff',sky2:'#fff6cf',ground:'#78a45b',soil:'#6d5538',accent:'#ffd84d'}
];
const ethanOutfits=[
 {name:'MEADOW EXPLORER',shirt:'#2f8f4e',pants:'#6b4b2a',shoe:'#f5f0d0',sole:'#2c7a4b',accent:'#ffe36a'},
 {name:'DESERT RUNNER',shirt:'#d58a3f',pants:'#8b5a32',shoe:'#f0d3a1',sole:'#9b642d',accent:'#fff0a6'},
 {name:'FOREST RANGER',shirt:'#356b45',pants:'#293b2d',shoe:'#8f6b3e',sole:'#e1c27b',accent:'#a9e56f'},
 {name:'CRYSTAL ARMOR',shirt:'#4f6fd6',pants:'#343a76',shoe:'#b9f7ff',sole:'#4d66c9',accent:'#7ef7ff'},
 {name:'FROZEN WARRIOR',shirt:'#bfe9f7',pants:'#4e7595',shoe:'#f8ffff',sole:'#79b8d2',accent:'#ffffff'},
 {name:'SKY GUARDIAN',shirt:'#638fe8',pants:'#e5e8f5',shoe:'#ffffff',sole:'#6f8dd8',accent:'#ffe56b'},
 {name:'VOLCANO ARMOR',shirt:'#9b3e32',pants:'#34252b',shoe:'#f08a42',sole:'#6b2521',accent:'#ffdf57'},
 {name:'ROYAL KNIGHT',shirt:'#704fba',pants:'#303b61',shoe:'#d9b66a',sole:'#5c421f',accent:'#ffd86b'},
 {name:'RUINS EXPLORER',shirt:'#9a7a45',pants:'#55442f',shoe:'#b88955',sole:'#49321f',accent:'#f5d36a'},
 {name:'SWAMP SURVIVOR',shirt:'#4f7549',pants:'#283d2d',shoe:'#5f7042',sole:'#29352a',accent:'#b8ef72'},
 {name:'DRAGON WARRIOR',shirt:'#a64636',pants:'#4b2927',shoe:'#d36b3e',sole:'#57201d',accent:'#ffb347'},
 {name:'PIRATE CAPTAIN',shirt:'#344f7d',pants:'#5d4434',shoe:'#8e6038',sole:'#4a3022',accent:'#ffd45e'},
 {name:'THUNDER ARMOR',shirt:'#4f5875',pants:'#252c3b',shoe:'#aeb9d2',sole:'#39435c',accent:'#f7ef75'},
 {name:'LOST CITY HUNTER',shirt:'#557b54',pants:'#574936',shoe:'#b08a58',sole:'#503b28',accent:'#e7cf72'},
 {name:'SHADOW WARRIOR',shirt:'#40365f',pants:'#242636',shoe:'#6d5b91',sole:'#211d2d',accent:'#d19cff'},
 {name:'GOLDEN CHAMPION',shirt:'#b08b27',pants:'#6d5226',shoe:'#ffe88a',sole:'#8d6a1e',accent:'#fff3a1'},
 {name:'MONSTER HUNTER',shirt:'#68444b',pants:'#302b32',shoe:'#9d5351',sole:'#352027',accent:'#ff6d5f'},
 {name:'MAGIC GUARDIAN',shirt:'#7656aa',pants:'#3e3562',shoe:'#e7c5ff',sole:'#66509b',accent:'#ffb5ff'},
 {name:'DARK WARRIOR',shirt:'#3d3548',pants:'#171923',shoe:'#5e4250',sole:'#17151d',accent:'#e15b65'},
 {name:'ULTIMATE KINGDOM CHAMPION',shirt:'#d2a72e',pants:'#634b25',shoe:'#fff2a1',sole:'#9c741c',accent:'#ffffff'}
];
const shop={fire:60,sprint:90,heart:120,star:180,shield:220};
const worldMissions=[
 'The adventure begins! Cross the peaceful meadow, gather what you can, and defeat the guardian blocking the road ahead.',
 'The desert sun is fierce. Keep moving, use the platforms wisely, and defeat the serpent ruler before the sands swallow the trail.',
 'The forest is enchanted. Follow the hidden path, avoid the creatures, and defeat the giant guardian protecting the next gate.',
 'The crystals are lighting the way. Explore the caverns carefully, collect power-ups, and defeat the beast waiting in the deep.',
 'The frozen peaks are slippery and dangerous. Keep your footing, reach the summit, and defeat the icy guardian.',
 'The road now rises into the clouds. Leap across the sky paths, stay alert, and defeat the guardian of the floating kingdom.',
 'The valley burns with fire. Move quickly through the dangerous ground and defeat the powerful ruler of Volcano Valley.',
 'The Royal Citadel is heavily guarded. Break through its defenses and defeat the royal beast guarding the kingdom gate.',
 'Ancient secrets are buried in these ruins. Search the old paths, survive the traps, and defeat the guardian awakened from the past.',
 'The swamp hides danger everywhere. Stay on safe ground, keep moving, and defeat the monster ruling the dark marsh.',
 'Dragon Valley is ahead! Brave the fiery land, collect every advantage you can, and defeat the valley champion.',
 'Pirates control this kingdom. Cross their territory, avoid their traps, and defeat the captain’s mighty guardian.',
 'Thunder shakes the mountains. Climb through the storm, stay strong, and defeat the beast guarding the lightning pass.',
 'A forgotten city has appeared. Explore its broken streets, uncover the route forward, and defeat the ancient city guardian.',
 'The shadows are growing stronger. Push through the dark forest and defeat the warrior beast hiding beyond the trees.',
 'The Golden Kingdom may look beautiful, but danger waits inside. Gather strength and defeat its powerful champion.',
 'The Monster Fortress blocks the way to Fedora. Break through the fortress path and defeat the monster commander.',
 'Magic fills the castle halls. Use your powers wisely and defeat the enchanted guardian standing between you and the Dark Kingdom.',
 'Fedora is very close now. Survive the Dark Kingdom, defeat its ruler, and open the road to the final fortress.',
 'This is it! Fedora is inside the Ultimate Kingdom. Defeat the final boss, break the prison, and bring Fedora home!'
];
let missionBubbleTimer=0;
function hideWorldMissionBubble(){
 const el=document.getElementById('missionBubble'); if(el)el.classList.remove('show');
 if(missionBubbleTimer){clearTimeout(missionBubbleTimer);missionBubbleTimer=0}
}
function positionMissionBubble(){
 const el=document.getElementById('missionBubble'), hud=document.getElementById('hud');
 if(!el||!hud)return;
 const hudBottom=hud.getBoundingClientRect().bottom;
 const safeTop=Math.max(58,Math.ceil(hudBottom+6));
 el.style.setProperty('--mission-top',safeTop+'px');
}
function showWorldMissionBubble(){
 const el=document.getElementById('missionBubble');
 const title=document.getElementById('missionBubbleTitle');
 const text=document.getElementById('missionBubbleText');
 if(!el||!title||!text)return;
 hideWorldMissionBubble();
 title.textContent='LEVEL '+(world+1)+' — '+themes[world].name.toUpperCase();
 text.textContent=worldMissions[world]||'Keep moving forward and complete the kingdom mission!';
 positionMissionBubble();
 el.classList.add('show');
 missionBubbleTimer=setTimeout(hideWorldMissionBubble,6500);
}

let resizeRaf=0,lastCanvasW=0,lastCanvasH=0,lastDpr=0;
function resize(){
 const d=Math.min(devicePixelRatio||1,(innerWidth<700?1.15:1.3));
 const nw=Math.min(document.documentElement.clientWidth||innerWidth,1100), nh=Math.max(320,document.documentElement.clientHeight||innerHeight);
 viewW=nw;viewH=nh;const bw=Math.floor(nw*d),bh=Math.floor(nh*d);
 if(bw!==lastCanvasW||bh!==lastCanvasH||d!==lastDpr){c.width=bw;c.height=bh;c.style.width=nw+'px';c.style.height=nh+'px';ctx.setTransform(d,0,0,d,0,0);lastCanvasW=bw;lastCanvasH=bh;lastDpr=d;skyGradientCache.key='';skyGradientCache.gradient=null;}
 positionMissionBubble();
}
addEventListener('resize',()=>{if(resizeRaf)cancelAnimationFrame(resizeRaf);resizeRaf=requestAnimationFrame(()=>{resizeRaf=0;resize()})},{passive:true});resize();
function resetWorld(){
 world=Math.max(0,Math.min(WORLD_COUNT-1,Number.isFinite(world)?Math.floor(world):0));
 platforms=[];enemies=[];items=[];projectiles=[];bossShots=[];particles=[];cam=0;checkpointX=70;checkpointY=350;timeLeft=180;
 const base=610, span=8500;
 for(let i=0;i<Math.ceil(span/260);i++) platforms.push({x:i*260,y:base,w:260,h:110});
 const elevated=[[420,500,150],[720,430,170],[1080,500,170],[1420,410,160],[1760,480,190],[2160,420,180],[2530,500,160],[2910,390,180],[3280,470,190],[3660,410,170],[4040,500,180],[4440,430,190],[4860,360,170],[5280,470,180],[5690,410,170],[6100,500,190],[6520,390,180],[6940,450,170],[7360,360,190],[7780,470,190]];
 elevated.forEach(a=>platforms.push({x:a[0],y:a[1],w:a[2],h:26}));
 const enemyKinds=[
 ['fox','runner','deer'],['camel','runner','snake'],['monkey','hopper','frog'],['bat','flyer','cave-spider'],
 ['goat','walker','arctic-fox'],['hawk','flyer','mountain-goat'],['hyena','runner','vulture'],['leopard','walker','boar'],
 ['deer','runner','fox'],['snake','hopper','frog'],['vulture','flyer','bat'],['boar','walker','hyena'],
 ['mountain-goat','runner','goat'],['monkey','hopper','leopard'],['arctic-fox','walker','wolf'],['hawk','flyer','fox'],
 ['cave-spider','walker','bat'],['frog','hopper','monkey'],['boar','runner','leopard'],['deer','walker','fox']
]; const kinds=enemyKinds[world%enemyKinds.length]; for(let i=0;i<34;i++){let x=520+i*245+(i%3)*35;enemies.push({x,y:558,w:38,h:44,vx:i%2?-.8:.8,vy:0,alive:true,type:kinds[i%kinds.length]})}
 for(let i=0;i<70;i++){let x=140+i*118;items.push({x,y:530-(i%6)*34,type:i%12===0?'star':i%9===0?'fire':i%7===0?'heart':'coin',got:false,bob:Math.random()*6})}
 const bossKinds=['bear','cobra','gorilla','crocodile','rhino','wolf','boar','tiger','bear','cobra','gorilla','crocodile','rhino','wolf','boar','tiger','bear','cobra','gorilla','tiger'];
 const bossNames=['MEADOW SENTINEL','DUNE WARDEN','FOREST COLOSSUS','CRYSTAL GUARDIAN','FROST COMMANDER','SKY SENTINEL','MAGMA WARLORD','ROYAL WARDEN','RUIN KNIGHT','MARSH GUARDIAN','DRAGON COMMANDER','TIDAL CAPTAIN','THUNDER WARDEN','LOST SENTINEL','SHADOW KNIGHT','GOLDEN CHAMPION','FORTRESS WARLORD','ARCANE GUARDIAN','DARK COMMANDER','ULTIMATE KING'];
 const bossEmotes=['😡','🐍','💪','😤','💥','🐺','🔥','👑','🐻','🐍','🦍','🐊','🦏','🐺','🐗','🐯','👹','⚡','💪','👑']; boss={x:7900,y:500,w:110,h:100,vx:0,vy:0,alive:true,hp:6,maxHp:6,type:bossKinds[world],name:bossNames[world],emote:bossEmotes[world],hitFlash:0,hitCooldown:0,attackCooldown:1.15,attackFlash:0,defeated:false,face:-1}; goal={x:8080,y:465};
 player={x:70,y:500,w:40,h:58,vx:0,vy:0,on:false,face:1,power:'small',fire:0,sprint:0,shield:0,inv:0,crouch:false};
}
function rect(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}
function jump(){if(!running||paused)return;if(player.on){player.vy=-13;player.on=false;burst(player.x+20,player.y+58,6);sfx('jump')}}
function fire(){if(!running||paused||player.fire<=0)return;if(projectiles.length<12){projectiles.push({x:player.x+player.face*25,y:player.y+27,vx:player.face*10,vy:-1.5,t:2});player.fire--;burst(player.x+player.face*24,player.y+27,4);sfx('fire')}}
function burst(px,py,n){const cap=lowDetail?120:220;const count=Math.min(n,lowDetail?Math.ceil(n*.35):n);for(let i=0;i<count;i++)particles.push({x:px,y:py,vx:(Math.random()-.5)*5,vy:-Math.random()*5,t:.55});if(particles.length>cap)particles.splice(0,particles.length-cap)}
function buy(type){const cost=shop[type];if(coins<cost)return msg('Need '+cost+' coins');coins-=cost;if(type==='fire')player.power='fire',player.fire=Math.max(player.fire,12);if(type==='sprint')player.sprint=Math.max(player.sprint,18);if(type==='heart')lives=Math.min(9,lives+1);if(type==='star'){stars++;score+=250;player.shield=Math.max(player.shield,8);player.inv=Math.max(player.inv,8);burst(player.x+20,player.y+25,22);sfx('star');}if(type==='shield')player.shield=12;shopOpen=false;msg(type.toUpperCase()+' purchased!');resumeLoop()}
function openShop(){if(!player||!running)return;shopOpen=!shopOpen;if(shopOpen&&rafId){cancelAnimationFrame(rafId);rafId=0;draw()}else if(!shopOpen)resumeLoop();}
function showStart(title,text,button){
 document.querySelector('#start h1').textContent=title;
 document.querySelector('#start p').textContent=text;
 document.getElementById('play').textContent=button;
 document.getElementById('start').style.display='grid';
}
function damage(){
 if(player.inv>0||player.shield>0)return;
 if(player.power!=='small'){
  player.power='small';player.fire=0;player.inv=1.2;msg('Power lost!');return;
 }
 lives--;player.inv=1.4;player.x=checkpointX;player.y=checkpointY;player.vy=0;player.vx=0;bossShots=[];
 if(lives<=0){
  lives=0;running=false;gameState='gameover';
  if(rafId){cancelAnimationFrame(rafId);rafId=0}
  stopAllMusic();hideWorldMissionBubble();
  showStart('GAME OVER','Ethan ran out of lives. Start a new adventure and try again!','PLAY AGAIN');
 }
}
function update(dt){
 if(shopOpen||paused)return;
 validateProgress();
 const frameScale=Math.min(2,Math.max(.25,dt*60));
 if(finishCelebration>0||transitionLocked){
   particles.forEach(p=>{p.x+=p.vx*frameScale;p.y+=p.vy*frameScale;p.vy+=.15*frameScale;p.t-=dt});
   particles=particles.filter(p=>p.t>0).slice(-(lowDetail?120:220));
   finishCelebration=Math.max(0,finishCelebration-dt);
   if(finishCelebration<=0&&finishNextWorld){
     const transitionId=++worldTransitionId;
     finishNextWorld=false;
     if(world<WORLD_COUNT-1){
       transitionLocked=true;
       world=Math.min(WORLD_COUNT-1,world+1); level=1; resetWorld(); transitionLocked=false;
       if(transitionId===worldTransitionId){playMusic();showWorldMissionBubble()}
     }else{
       running=false;gameState='complete';stopAllMusic();hideWorldMissionBubble();
       msg('🏆 KINGDOM COMPLETE! '+finishEmote+' Score '+score);showStart('MISSION COMPLETE!','Ethan rescued Fedora and conquered all 20 kingdoms! Final score: '+score,'PLAY AGAIN');
     }
   }
   return;
 }
 let left=keys.ArrowLeft||keys.a||keys.A,right=keys.ArrowRight||keys.d||keys.D; const crouching=keys.ArrowDown||keys.c||keys.C||keys.z||keys.Z; player.crouch=!!crouching;
 const sprinting=keys.shift||keys.x||keys.X;
 const max=crouching?2.5:(sprinting?9:(player.sprint>0?8:6));
 if(left)player.vx-=1.15*frameScale;if(right)player.vx+=1.15*frameScale;if(!left&&!right){player.vx*=Math.pow(.62,frameScale);if(Math.abs(player.vx)<.08)player.vx=0;}
 if(left&&right)player.vx*=Math.pow(.55,frameScale);
 player.vx=Math.max(-max,Math.min(max,player.vx));if(Math.abs(player.vx)>.2)player.face=Math.sign(player.vx);
 if(crouching&&player.on) player.vx*=Math.pow(.82,frameScale);
 const prevY=player.y; player.vy+=.65*frameScale;player.x+=player.vx*frameScale;player.y+=player.vy*frameScale;player.on=false; player.x=Math.max(0,Math.min(8380,player.x));
 for(const p of platforms)if(player.x+player.w>p.x&&player.x<p.x+p.w&&player.y+player.h>=p.y&&prevY+player.h<=p.y&&player.vy>=0){player.y=p.y-player.h;player.vy=0;player.on=true}
 for(const e of enemies)if(e.alive){
  // Do not simulate enemies far outside the active camera area.
  if(e.x < cam-900 || e.x > cam+viewW+900) continue;
  e.x+=e.vx*frameScale;if(e.x<30||e.x>8350){e.x=Math.max(30,Math.min(8350,e.x));e.vx*=-1}if(e.type==='hopper'&&Math.random()<(1-Math.pow(1-.008,frameScale)))e.vy=-7;if(e.vy){e.y+=e.vy*frameScale;e.vy+=.3*frameScale;if(e.y>558){e.y=558;e.vy=0}}if(rect(player,e)){if(player.shield>0||player.inv>0){e.alive=false;score+=200;player.vy=player.vy>0?-6:player.vy;burst(e.x,e.y,16);sfx('stomp')}else if(player.vy>2&&player.y+player.h-e.y<22){e.alive=false;score+=150;player.vy=-8;burst(e.x,e.y,10);sfx('stomp')}else damage()}}
 for(const it of items)if(!it.got&&rect(player,{x:it.x-12,y:it.y-12,w:24,h:24})){it.got=true;if(it.type==='coin'){coins++;score+=10;sfx('coin')}else if(it.type==='star'){stars++;score+=250;player.shield=8;player.inv=8;burst(it.x,it.y,22);sfx('star');msg('⭐ STAR SHIELD! 8 SECONDS OF PROTECTION!')}else if(it.type==='fire'){player.power='fire';player.fire=16;burst(it.x,it.y,14);sfx('fire');msg('🔥 FIRE POWER!')}else{lives=Math.min(9,lives+1);msg('EXTRA LIFE!')} }
 for(const p of projectiles){p.x+=p.vx*frameScale;p.y+=p.vy*frameScale;p.vy+=.15*frameScale;p.t-=dt;for(const e of enemies)if(e.alive&&p.t>0&&Math.abs(p.x-e.x)<28&&Math.abs(p.y-e.y)<42){e.alive=false;score+=200;p.t=0;burst(e.x,e.y,14);sfx('fire');break}}projectiles=projectiles.filter(p=>p.t>0&&p.x>cam-100&&p.x<cam+1500);
 if(boss.alive){
  const bossDx=player.x-(boss.x+boss.w/2), bossDy=(player.y+player.h/2)-(boss.y+boss.h/2);
  const bossSpotted=Math.abs(bossDx)<720 && Math.abs(bossDy)<190;
  // Always face ETHAN, not the camera/user. The body art is drawn as a side profile.
  boss.face = bossDx < 0 ? -1 : 1;
  boss.hitFlash=Math.max(0,boss.hitFlash-dt);
  boss.hitCooldown=Math.max(0,boss.hitCooldown-dt);
  boss.attackCooldown=Math.max(0,boss.attackCooldown-dt);
  boss.attackFlash=Math.max(0,boss.attackFlash-dt);
  boss.y=500;
  // Boss stays alert and stationary until Ethan enters its detection range.
  // Once spotted, it walks directly toward Ethan, then stops at attack range.
  if(bossSpotted && Math.abs(bossDx)>145){
    boss.vx=Math.sign(bossDx)*2.15;
    boss.x+=boss.vx*frameScale;
    boss.x=Math.max(7200,Math.min(8200,boss.x));
  }else{
    boss.vx=0;
  }
  // Guardian ranged attack: a bright energy orb fired from the staff.
  if(bossSpotted && Math.abs(bossDx)<590 && Math.abs(bossDy)<220 && boss.attackCooldown<=0 && bossShots.length<5){
    const sx=boss.x+boss.w/2+boss.face*48, sy=boss.y+18;
    const tx=player.x+player.w/2, ty=player.y+player.h/2;
    const dx=tx-sx, dy=ty-sy, len=Math.max(1,Math.hypot(dx,dy));
    const speed=4.4+Math.min(1.8,world*.08);
    bossShots.push({x:sx,y:sy,vx:dx/len*speed,vy:dy/len*speed,t:3.1,r:11,world});
    boss.face=Math.sign(dx)||boss.face;
    boss.attackFlash=.28;
    boss.attackCooldown=Math.max(1.25,2.25-world*.035);
    burst(sx,sy,8); sfx('fire');
  }
if(rect(player,{x:boss.x,y:boss.y,w:boss.w,h:boss.h})&&boss.hitCooldown<=0){if(player.shield>0||player.inv>0){boss.hp=Math.max(0,boss.hp-.5);boss.hitCooldown=.45;boss.hitFlash=.25;player.vy=-10;burst(boss.x+55,boss.y+40,24);sfx('hit');msg(boss.emote+' BOSS HIT! '+Math.max(0,boss.hp).toFixed(1)+' HP LEFT');}else if(player.vy>2&&player.y+player.h-boss.y<30){boss.hp=Math.max(0,boss.hp-.5);boss.hitCooldown=.55;boss.hitFlash=.25;player.vy=-11;score+=300;burst(boss.x+55,boss.y,22);sfx('stomp');msg('💥 '+boss.name+' HIT! '+Math.max(0,boss.hp).toFixed(1)+' HP LEFT');}else{damage();boss.hitCooldown=.55;}}for(const p of projectiles){if(p.t>0&&boss.hitCooldown<=0&&Math.abs(p.x-(boss.x+55))<65&&Math.abs(p.y-(boss.y+45))<65){boss.hp=Math.max(0,boss.hp-.5);boss.hitCooldown=.18;boss.hitFlash=.25;p.t=0;score+=250;burst(boss.x+55,boss.y+45,20);sfx('fire');msg('🔥 BOSS HIT! '+Math.max(0,boss.hp).toFixed(1)+' HP LEFT');}}if(boss.hp<=0){
  boss.alive=false;boss.defeated=true;
  const bossCoins=50;
  coins+=bossCoins;score+=1500+bossCoins*10;
  for(let i=0;i<10;i++)laterSfx(()=>sfx('coin'),i*35);
  burst(boss.x+55,boss.y+45,70);sfx('goal');playVictoryMusic();
  if(world===WORLD_COUNT-1){
    rescueSequence=4.8;
    rescueDone=false;
    player.x=7980; player.y=500; player.vx=0; player.vy=0;
    msg('🏆 FINAL BOSS DEFEATED! FEDORA IS FREE!');
  }else{
    msg('🏆 '+boss.name+' DEFEATED! +'+bossCoins+' COINS! GO HOME!');
  }
}}
 // Boss energy shots: Ethan can dodge them or block them with a star/shield.
 let bossShotHit=false;
 for(const shot of bossShots){
   shot.x+=shot.vx*frameScale; shot.y+=shot.vy*frameScale; shot.t-=dt;
   if(!bossShotHit&&shot.t>0 && rect(player,{x:shot.x-shot.r,y:shot.y-shot.r,w:shot.r*2,h:shot.r*2})){
     shot.t=0;bossShotHit=true;burst(shot.x,shot.y,10);
     if(player.shield>0||player.inv>0)sfx('hit'); else damage();
   }
 }
 bossShots=bossShots.filter(shot=>shot.t>0&&shot.x>cam-180&&shot.x<cam+viewW+180&&shot.y>-120&&shot.y<850);
 if(!boss.alive)bossShots=[];

 if(rescueSequence>0){
  rescueSequence=Math.max(0,rescueSequence-dt);
  player.vx=0; player.vy=0;
  if(rescueSequence<=2.4 && !rescueDone){
    rescueDone=true;
    msg('❤️ FEDORA IS FREE! ETHAN RESCUED FEDORA!');
    burst(player.x+25,player.y+25,90);
  }
  if(rescueSequence<=0){
    transitionLocked=true;
    finishCelebration=4.2;
    finishNextWorld=true;
    finishEmote='❤️';
    msg('🤗 ETHAN AND FEDORA ARE REUNITED!');
  }
  return;
 }
 timeLeft-=dt; if(timeLeft<=0){timeLeft=0;if(player.inv<=0&&player.shield<=0){damage();if(running){timeLeft=180;msg('TIME UP! TRY AGAIN!')}}} if(player.y>800){damage();if(running){player.x=checkpointX;player.y=checkpointY;player.vy=0;player.vx=0;timeLeft=180}}
 if(player.x>checkpointX+1100){checkpointX=Math.min(6900,Math.floor(player.x/1200)*1200+70);checkpointY=350;msg('CHECKPOINT!')}
 if(!finishCelebration&&!boss.alive&&rect(player,{x:goal.x,y:goal.y,w:180,h:170})){
   transitionLocked=true; finishCelebration=2.8; finishNextWorld=true; player.vx=0; player.vy=0;
   const emotes=['😄','🥳','🤩','😎','💪','😁','🔥','👑']; finishEmote=emotes[world%emotes.length];
   sfx('goal'); msg(finishEmote+' LEVEL COMPLETE! GREAT JOB!');
 }
 player.inv=Math.max(0,player.inv-dt);player.sprint=Math.max(0,player.sprint-dt);player.shield=Math.max(0,player.shield-dt);
 particles.forEach(p=>{p.x+=p.vx*frameScale;p.y+=p.vy*frameScale;p.vy+=.15*frameScale;p.t-=dt});particles=particles.filter(p=>p.t>0).slice(-(lowDetail?120:220));
 cam=Math.max(0,Math.min(8350-viewW,player.x-viewW*.38));
 const worldH=720; camY=Math.max(0,Math.min(Math.max(0,worldH-viewH),player.y-viewH*.42));
}
function drawWorldDecor(t){
 // Lightweight scenery: keep visual detail without thousands of per-frame draw calls.
 const seed=world*97;
 ctx.save();
 for(let i=0;i<18;i++){
   const x=90+i*470+((seed+i*31)%120), y=95+((i*47+seed)%280);
   if(x<cam-180||x>cam+viewW+180) continue;
   const size=8+((i+world)%3)*5;
   ctx.globalAlpha=.18;
   ctx.fillStyle=i%3===0?t.accent:'#ffffff';
   ctx.fillRect(x,y,size,size);
   if(i%4===0)ctx.fillRect(x+size,y+size,size,size);
 }
 ctx.globalAlpha=1;
 for(const p of platforms){
   if(p.x+p.w<cam-120||p.x>cam+viewW+120) continue;
   ctx.globalAlpha=.28;ctx.fillStyle=t.accent;
   for(let x=p.x+12;x<p.x+p.w-8;x+=64)ctx.fillRect(x,p.y+6,10,4);
   ctx.globalAlpha=.14;ctx.fillStyle=t.soil;
   ctx.fillRect(p.x,p.y+24,p.w,2);
   ctx.fillRect(p.x,p.y+58,p.w,2);
   ctx.globalAlpha=1;
 }
 if(!lowDetail) for(let i=0;i<14;i++){
   const x=300+i*590+((world*23)%70);
   if(x<cam-180||x>cam+viewW+180) continue;
   const ground=610,kind=(i+world)%5;
   ctx.save();ctx.translate(x,ground);
   if(kind===0){ctx.fillStyle=t.soil;ctx.fillRect(-30,-18,60,18);ctx.fillRect(-18,-40,36,22);ctx.fillStyle=t.accent;ctx.fillRect(-10,-48,20,7)}
   else if(kind===1){ctx.fillStyle='#397a3b';ctx.fillRect(-2,-38,5,38);ctx.fillStyle=t.accent;ctx.fillRect(-13,-47,11,11);ctx.fillRect(4,-47,11,11);ctx.fillRect(-4,-57,11,11)}
   else if(kind===2){ctx.fillStyle='#69472f';ctx.fillRect(-4,-64,8,64);ctx.fillStyle=t.accent;ctx.fillRect(-31,-70,62,24)}
   else if(kind===3){ctx.fillStyle=t.accent;ctx.beginPath();ctx.moveTo(0,-62);ctx.lineTo(16,-36);ctx.lineTo(0,-12);ctx.lineTo(-16,-36);ctx.closePath();ctx.fill()}
   else{ctx.fillStyle=t.ground;ctx.fillRect(-30,-30,60,30);ctx.fillRect(-18,-46,36,16);ctx.fillStyle=t.accent;ctx.fillRect(-8,-40,9,9)}
   ctx.restore();
 }
 // Kingdom architecture: lightweight bricks, tubes/pipes and landmark towers.
 if(!lowDetail) for(let i=0;i<16;i++){
   const x=170+i*520+((world*41)%160);
   if(x<cam-140||x>cam+viewW+140) continue;
   const style=(i+world)%4;
   if(style===0){ // brick wall segment
     ctx.fillStyle=t.soil;
     for(let r=0;r<3;r++) for(let c=0;c<4;c++){
       const bx=x+c*22+(r%2?11:0), by=578-r*16;
       ctx.fillRect(bx,by,20,14);
       ctx.fillStyle='#ffffff22';ctx.fillRect(bx+2,by+2,16,2);ctx.fillStyle=t.soil;
     }
   } else if(style===1){ // rounded adventure tube
     ctx.fillStyle=t.accent;ctx.fillRect(x,548,46,62);
     ctx.fillStyle='#ffffff33';ctx.fillRect(x+7,550,8,58);
     ctx.fillStyle=t.ground;ctx.fillRect(x-5,542,56,12);
     ctx.fillStyle='#0002';ctx.fillRect(x-5,552,56,4);
   } else if(style===2){ // stone pillar/ruin
     ctx.fillStyle=t.soil;ctx.fillRect(x+10,540,34,70);
     ctx.fillStyle=t.ground;ctx.fillRect(x+3,534,48,10);ctx.fillRect(x+3,606,48,7);
     ctx.fillStyle='#ffffff22';ctx.fillRect(x+15,545,6,55);
   } else { // signpost landmark
     ctx.fillStyle='#5d3a22';ctx.fillRect(x+24,555,8,55);
     ctx.fillStyle=t.accent;ctx.fillRect(x,540,56,24);
     ctx.fillStyle='#fff';ctx.globalAlpha=.75;ctx.fillRect(x+10,548,36,3);ctx.globalAlpha=1;
   }
 }
 ctx.restore();
}

const hudCache={};let lastHudUpdate=0;
function setHud(id,value){const v=String(value);if(hudCache[id]===v)return;hudCache[id]=v;const el=document.getElementById(id);if(el)el.textContent=v;}
function updateHud(force=false){
 const now=performance.now();if(!force&&now-lastHudUpdate<90)return;lastHudUpdate=now;
 const secs=Math.max(0,Math.ceil(timeLeft));setHud('timer',Math.floor(secs/60)+':'+String(secs%60).padStart(2,'0'));setHud('coins',coins);setHud('stars',stars);setHud('lives',lives);setHud('score',score);setHud('world',(world+1)+'/'+WORLD_COUNT);setHud('power',player?.power==='fire'?'FIRE':'SMALL');setHud('shield',player?Math.ceil(player.shield):0);
}
function draw(){
 frameNow=performance.now();
 const t=themes[world];ctx.clearRect(0,0,viewW,viewH);const skyKey=world+'|'+viewH;if(skyGradientCache.key!==skyKey||!skyGradientCache.gradient){const g=ctx.createLinearGradient(0,0,0,viewH);g.addColorStop(0,t.sky1);g.addColorStop(1,t.sky2);skyGradientCache={key:skyKey,gradient:g}}ctx.fillStyle=skyGradientCache.gradient;ctx.fillRect(0,0,viewW,viewH);
 ctx.save();ctx.translate(-cam*.12,0);
 // Parallax background adapts automatically on slower devices.
 const layers=lowDetail?1:3, hillCount=lowDetail?5:8;
 for(let layer=0;layer<layers;layer++){ctx.fillStyle=layer===0?'#78bb73':layer===1?'#63ad70':'#4f965e';for(let i=-2;i<hillCount;i++){const x=i*520+layer*170;ctx.beginPath();ctx.arc(x,620-layer*35,185-layer*22,Math.PI,0);ctx.fill();}}
 if(!lowDetail){ctx.fillStyle='#ffffff55';for(let i=0;i<7;i++){const x=i*260+80;const y=85+(i%4)*48;ctx.beginPath();ctx.arc(x,y,28,0,7);ctx.arc(x+30,y-10,36,0,7);ctx.arc(x+66,y,25,0,7);ctx.fill();}}
 ctx.restore();
 ctx.save();ctx.translate(-cam,-camY);
 for(const p of platforms){
   if(p.x+p.w<cam-80||p.x>cam+viewW+80) continue;
   ctx.fillStyle=t.soil;ctx.fillRect(p.x,p.y,p.w,p.h);
   ctx.fillStyle=t.ground;ctx.fillRect(p.x,p.y,p.w,Math.min(22,p.h));
   ctx.fillStyle=t.accent;ctx.globalAlpha=.22;ctx.fillRect(p.x,p.y,p.w,5);ctx.globalAlpha=1;
   ctx.fillStyle='#0002';ctx.fillRect(p.x,p.y+p.h-4,p.w,4);
 }
 drawWorldDecor(t);
 // stylized vegetation/landmarks
 if(!lowDetail) for(let i=0;i<platforms.length;i+=7){const p=platforms[i];if(p.x+p.w<cam-90||p.x>cam+viewW+90)continue;const x=p.x+35;ctx.fillStyle='#315f35';ctx.fillRect(x,p.y-48,8,48);ctx.beginPath();ctx.arc(x+4,p.y-55,25,0,7);ctx.fill();ctx.fillStyle='#ffffff18';ctx.beginPath();ctx.arc(x-5,p.y-60,8,0,7);ctx.fill();}
 for(const it of items)if(!it.got&&it.x>cam-80&&it.x<cam+viewW+80){const yy=it.y+Math.sin((frameNow/250)+it.bob)*4;ctx.save();ctx.translate(it.x,yy);if(it.type==='coin'){ctx.shadowColor='#ffd43b';ctx.shadowBlur=14;ctx.fillStyle='#ffd43b';ctx.beginPath();ctx.ellipse(0,0,9,12,0,0,7);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#9a6500';ctx.font='bold 12px Arial';ctx.fillText('C',-4,4)}else if(it.type==='fire'){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(0,0,13,0,7);ctx.fill();ctx.fillStyle='#f04a32';ctx.beginPath();ctx.arc(-4,-1,7,0,7);ctx.fill();ctx.fillStyle='#ffb52e';ctx.beginPath();ctx.arc(4,2,6,0,7);ctx.fill()}else if(it.type==='heart'){ctx.fillStyle='#ff4c66';ctx.font='26px Arial';ctx.fillText('♥',-12,9)}else{star(0,0,15)}ctx.restore()}
 for(const e of enemies)if(e.alive&&e.x+e.w>cam-100&&e.x<cam+viewW+100)drawMascot(e);
 if(boss.alive&&boss.x+boss.w>cam-180&&boss.x<cam+viewW+180)drawBoss(boss);
 for(const p of projectiles){ctx.fillStyle='#ff8c27';ctx.beginPath();ctx.arc(p.x,p.y,9,0,7);ctx.fill();ctx.fillStyle='#fff4a0';ctx.beginPath();ctx.arc(p.x-3,p.y-3,4,0,7);ctx.fill()}
 for(const shot of bossShots){
   const glow=['#7cf4ff','#ffd66b','#ff78e8','#9cff7a'][shot.world%4];
   ctx.save();ctx.globalAlpha=.28;ctx.fillStyle=glow;ctx.beginPath();ctx.arc(shot.x-shot.vx*2.1,shot.y-shot.vy*2.1,shot.r+8,0,7);ctx.fill();
   ctx.globalAlpha=1;ctx.shadowColor=glow;ctx.shadowBlur=lowDetail?5:13;ctx.fillStyle=glow;ctx.beginPath();ctx.arc(shot.x,shot.y,shot.r,0,7);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(shot.x-3,shot.y-3,4,0,7);ctx.fill();ctx.restore();
 }
 // Final-world prison and Fedora rescue scene
 if(world===WORLD_COUNT-1){
   drawFedoraPrison(boss.alive || rescueSequence>0);
 }
 // Finish destination: no flag — a large, near-real animated home landmark
 const homeX=goal.x-40, homeY=505, hx=220, hy=105, doorX=homeX+92;
 if(homeX+300>cam-150&&homeX<cam+viewW+150){
 ctx.fillStyle='#0003';ctx.beginPath();ctx.ellipse(homeX+110,homeY+112,132,14,0,0,7);ctx.fill();
 // yard and path
 ctx.fillStyle='#6b9b4b';ctx.fillRect(homeX-35,homeY+96,290,28);
 ctx.fillStyle='#c7a77a';ctx.beginPath();ctx.moveTo(doorX+8,homeY+96);ctx.lineTo(doorX+45,homeY+96);ctx.lineTo(doorX+70,homeY+124);ctx.lineTo(doorX-20,homeY+124);ctx.closePath();ctx.fill();
 // walls with depth
 const wall=ctx.createLinearGradient(homeX,homeY,homeX+hx,homeY+hy);wall.addColorStop(0,'#f3e6cf');wall.addColorStop(.55,'#d8c09d');wall.addColorStop(1,'#b38f6d');ctx.fillStyle=wall;ctx.fillRect(homeX,homeY,hx,hy);
 // roof with layered tiles
 ctx.fillStyle='#6b4030';ctx.beginPath();ctx.moveTo(homeX-18,homeY+10);ctx.lineTo(homeX+108,homeY-62);ctx.lineTo(homeX+238,homeY+10);ctx.closePath();ctx.fill();
 ctx.strokeStyle='#9b6650';ctx.lineWidth=6;for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(homeX+10+i*32,homeY+1);ctx.lineTo(homeX+108,homeY-52);ctx.stroke();}
 // chimney and smoke
 ctx.fillStyle='#9c6954';ctx.fillRect(homeX+169,homeY-50,25,48);ctx.fillStyle='#7779';for(let i=0;i<4;i++){let sy=homeY-65-i*17+Math.sin(frameNow/500+i)*4;ctx.beginPath();ctx.arc(homeX+181-i*4,sy,8+i*2,0,7);ctx.fill();}
 // windows with frames and warm glow
 for(const wx of [homeX+24,homeX+150]){ctx.fillStyle='#182b36';ctx.fillRect(wx,homeY+30,43,34);ctx.fillStyle='#f5d778';ctx.fillRect(wx+5,homeY+5,33,24);ctx.strokeStyle='#fff8';ctx.lineWidth=3;ctx.strokeRect(wx+5,homeY+5,33,24);ctx.fillStyle='#ffffff88';ctx.fillRect(wx+21,homeY+5,3,24);ctx.fillRect(wx+5,homeY+16,33,3);}
 // front door and porch
 ctx.fillStyle='#65412f';ctx.fillRect(doorX,homeY+43,47,62);ctx.fillStyle='#a8784f';ctx.fillRect(doorX+5,homeY+48,37,57);ctx.fillStyle='#e7c06a';ctx.beginPath();ctx.arc(doorX+35,homeY+78,3,0,7);ctx.fill();ctx.fillStyle='#8b684f';ctx.fillRect(doorX-10,homeY+103,67,8);
 // porch posts
 ctx.fillStyle='#f0dfc2';ctx.fillRect(doorX-10,homeY+70,7,35);ctx.fillRect(doorX+50,homeY+70,7,35);
 // flower beds
 for(let i=0;i<8;i++){ctx.fillStyle=i%2?'#e56b75':'#f3c84b';ctx.beginPath();ctx.arc(homeX+12+i*25,homeY+99,4,0,7);ctx.fill();ctx.fillStyle='#397a3b';ctx.fillRect(homeX+10+i*25,homeY+99,3,9);}
 ctx.fillStyle='#fff';ctx.font='900 20px Arial';ctx.fillText('HOME',homeX+82,homeY-72);
 if(!boss.alive){ctx.fillStyle='#ffe66d';ctx.font='900 22px Arial';ctx.fillText('🏆 BOSS DEFEATED — HOME AWAITS!',goal.x-170,goal.y-55);}
 }
 drawHero(player.x,player.y);
 if(world===WORLD_COUNT-1 && (rescueSequence>0 || rescueDone)){drawRescueHug();}
 if(finishCelebration>0||transitionLocked){
   ctx.save(); const pulse=1+Math.sin(frameNow/90)*.06;
   ctx.textAlign='center';ctx.font='900 58px Arial';ctx.translate(player.x+20,player.y-48);ctx.scale(pulse,pulse);ctx.fillText(finishEmote,0,0);
   ctx.font='900 22px Arial';ctx.lineWidth=5;ctx.strokeStyle='#111';ctx.strokeText('LEVEL COMPLETE!',0,36);ctx.fillStyle='#ffe66d';ctx.fillText('LEVEL COMPLETE!',0,36);
   ctx.restore();
 }
 const particleStep=lowDetail?2:1; for(let i=0;i<particles.length;i+=particleStep){const p=particles[i];ctx.globalAlpha=Math.max(0,p.t*2);ctx.fillStyle='#fff';ctx.fillRect(p.x,p.y,5,5)}ctx.globalAlpha=1;ctx.restore();
 if(shopOpen)drawShop();
 updateHud();
}
function drawRescueHug(){
 const hx=player.x+70, hy=player.y+4;
 ctx.save();ctx.translate(hx,hy);
 // Fedora standing beside Ethan with arms around him
 ctx.fillStyle='#5a3425';ctx.beginPath();ctx.arc(0,-28,24,0,7);ctx.fill();
 ctx.fillStyle='#d79a72';ctx.beginPath();ctx.arc(0,-25,17,0,7);ctx.fill();
 ctx.fillStyle='#5a3425';ctx.beginPath();ctx.arc(-8,-36,10,0,7);ctx.arc(8,-36,10,0,7);ctx.fill();
 ctx.fillStyle='#241b19';ctx.beginPath();ctx.arc(-6,-26,2.5,0,7);ctx.arc(6,-26,2.5,0,7);ctx.fill();
 ctx.fillStyle='#a75ac7';ctx.beginPath();ctx.moveTo(-19,-7);ctx.lineTo(19,-7);ctx.lineTo(27,45);ctx.lineTo(-27,45);ctx.closePath();ctx.fill();
 ctx.strokeStyle='#d79a72';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(-17,2);ctx.quadraticCurveTo(-34,10,-47,7);ctx.moveTo(17,2);ctx.quadraticCurveTo(34,10,47,7);ctx.stroke();
 ctx.strokeStyle='#3d3155';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(-9,45);ctx.lineTo(-12,69);ctx.moveTo(9,45);ctx.lineTo(12,69);ctx.stroke();
 ctx.fillStyle='#ffe66d';ctx.font='900 22px Arial';ctx.textAlign='center';ctx.fillText('❤️ THEY ARE TOGETHER!',0,-78);
 ctx.restore();
}
function drawHero(px,py){
 ctx.save();
 const crouch=player.crouch&&player.on;
 const h=crouch?43:58;
 const cy=py+(58-h);
 const facing=player.face<0?-1:1;
 ctx.translate(px+20,cy+29);
 ctx.scale(facing,1);
 const moving=Math.abs(player.vx)>.18;
 const airborne=!player.on;
 const speed=Math.min(1.9,Math.max(.8,Math.abs(player.vx)/3));
 const phase=frameNow/92*speed;
 const run=Math.sin(phase);
 const stride=moving&&!crouch&&!airborne?run:0;
 const bob=moving&&!airborne?Math.abs(run)*1.35:Math.sin(frameNow/350)*.45;
 const bodyLean=airborne?Math.max(-.10,Math.min(.10,player.vx*.018)):(moving&&!crouch?.045:0);
 ctx.translate(0,-bob);

 const outfit=ethanOutfits[world%ethanOutfits.length];

 // Soft grounding shadow gives Ethan a 2.5D presence without expensive effects.
 ctx.save();
 ctx.globalAlpha=.22;
 ctx.fillStyle='#111';
 ctx.beginPath();ctx.ellipse(0,39,22-moving*2,4.5,0,0,Math.PI*2);ctx.fill();
 ctx.restore();

 // Articulated legs: hips, lower legs and shoes now swing as a real run cycle.
 function heroLeg(hipX, swing, front){
   ctx.save();ctx.translate(hipX,12);
   const jumpSwing=airborne?(front?-.42:.40):0;
   ctx.rotate((crouch?0.16:swing*.44)+jumpSwing);
   ctx.fillStyle=front?outfit.pants:'rgba(34,45,70,.96)';
   roundRectSafe(ctx,-5,0,10,17,4);ctx.fill();
   ctx.fillStyle=front?'rgba(255,255,255,.12)':'rgba(0,0,0,.17)';
   roundRectSafe(ctx,front?-2:-5,2,3,13,2);ctx.fill();
   // knee joint
   ctx.translate(0,15);
   ctx.rotate((airborne?(front?.56:-.46):-swing*.30));
   ctx.fillStyle=outfit.pants;roundRectSafe(ctx,-4,0,9,14,4);ctx.fill();
   // dimensional shoe follows the leg angle instead of sliding sideways
   ctx.translate(front?2:0,11);
   ctx.fillStyle=outfit.shoe;roundRectSafe(ctx,-7,0,20,9,4);ctx.fill();
   ctx.fillStyle='rgba(255,255,255,.20)';roundRectSafe(ctx,-4,1,11,2.4,2);ctx.fill();
   ctx.fillStyle=outfit.sole;roundRectSafe(ctx,-8,7,22,3.5,2);ctx.fill();
   ctx.fillStyle=outfit.accent;roundRectSafe(ctx,1,4,8,2,1);ctx.fill();
   ctx.restore();
 }
 // Draw rear limb first, then the front limb for proper depth.
 heroLeg(-7,-stride,false);
 heroLeg(7,stride,true);

 // Slight whole-body lean gives weight to acceleration and jumping.
 ctx.rotate(bodyLean);

 // Torso: rounded fantasy jacket with shadow and chest highlight.
 ctx.fillStyle='rgba(0,0,0,.18)';
 roundRectSafe(ctx,-15,-5,31,crouch?24:31,8);ctx.fill();
 ctx.fillStyle=outfit.shirt;
 roundRectSafe(ctx,-14,-7,29,crouch?24:31,8);ctx.fill();
 ctx.fillStyle='rgba(255,255,255,.16)';
 roundRectSafe(ctx,-9,-5,6,crouch?19:25,4);ctx.fill();
 ctx.fillStyle='rgba(0,0,0,.16)';
 roundRectSafe(ctx,9,-4,5,crouch?18:25,3);ctx.fill();

 // Belt + glowing kingdom clasp.
 ctx.fillStyle=outfit.pants;roundRectSafe(ctx,-15,9,30,5,2);ctx.fill();
 ctx.fillStyle=outfit.accent;roundRectSafe(ctx,6,8,7,7,2);ctx.fill();
 ctx.fillStyle='rgba(255,255,255,.5)';roundRectSafe(ctx,8,9,2,3,1);ctx.fill();
 // Chest trim / emblem.
 ctx.fillStyle=outfit.accent;roundRectSafe(ctx,-8,-1,17,3,2);ctx.fill();
 ctx.beginPath();ctx.arc(3,5,4,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='rgba(255,255,255,.52)';ctx.beginPath();ctx.arc(2,4,1.4,0,Math.PI*2);ctx.fill();

 // Articulated arms and hands: shoulders and elbows counter-swing with the legs.
 function heroArm(x,y,swing,front){
   ctx.save();ctx.translate(x,y);
   let upper=0, elbow=.10;
   if(crouch){ upper=front?-.35:.32; elbow=.48; }
   else if(airborne){ upper=front?-.72:.55; elbow=front?.62:-.34; }
   else if(moving){ upper=swing*.62; elbow=-swing*.24; }
   else { upper=front?.12:-.16; elbow=.08; }
   ctx.rotate(upper);
   ctx.fillStyle=front?'#d99b68':'#bd7b51';
   roundRectSafe(ctx,-4,-2,9,13,5);ctx.fill();
   ctx.fillStyle=front?'rgba(255,255,255,.18)':'rgba(0,0,0,.12)';
   roundRectSafe(ctx,-2,0,2.5,9,2);ctx.fill();
   // elbow + forearm
   ctx.translate(.5,10);ctx.rotate(elbow);
   ctx.fillStyle=front?'#dfa173':'#c4865c';
   roundRectSafe(ctx,-3.8,0,8,10,4);ctx.fill();
   // hand visibly swings with the forearm
   ctx.fillStyle=front?'#e5aa7a':'#ca8c63';ctx.beginPath();ctx.arc(.4,10,4.8,0,Math.PI*2);ctx.fill();
   ctx.fillStyle='rgba(255,255,255,.18)';ctx.beginPath();ctx.arc(1.7,8.6,1.4,0,Math.PI*2);ctx.fill();
   ctx.restore();
 }
 const armRun=moving&&!crouch&&!airborne?run:0;
 heroArm(-13,1,armRun,false);
 heroArm(14,0,-armRun,true);

 // Neck and head follow the body's movement with a tiny counter-motion.
 const headTilt=airborne?Math.max(-.08,Math.min(.08,-player.vy*.008)):(moving?run*.018:0);
 ctx.save();ctx.rotate(headTilt);
 ctx.fillStyle='#c9895b';roundRectSafe(ctx,5,-18,9,10,4);ctx.fill();
 ctx.fillStyle='rgba(255,255,255,.15)';roundRectSafe(ctx,8,-17,2.5,7,2);ctx.fill();

 // 3D-styled head: shadow circle + face circle + cheek highlight.
 ctx.fillStyle='rgba(70,35,20,.25)';ctx.beginPath();ctx.arc(5.5,-26.5,18.5,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#d99b68';ctx.beginPath();ctx.arc(5,-28,17.5,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#efb487';ctx.beginPath();ctx.ellipse(10,-31,7.5,8.5,-.2,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='rgba(164,86,52,.28)';ctx.beginPath();ctx.ellipse(-1,-23,8,6,.25,0,Math.PI*2);ctx.fill();

 // Ear with inner shading.
 ctx.fillStyle='#c37e4c';ctx.beginPath();ctx.arc(-8,-27,4.7,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#a76543';ctx.beginPath();ctx.arc(-8,-27,2.2,0,Math.PI*2);ctx.fill();

 // Sculpted hair mass with separate highlight lock.
 ctx.fillStyle='#2f1c16';ctx.beginPath();ctx.arc(1,-36,17,Math.PI,Math.PI*2);ctx.fill();
 ctx.fillRect(-13,-36,18,8);
 ctx.fillStyle='#493029';ctx.beginPath();ctx.arc(7,-40,8,Math.PI,Math.PI*2);ctx.fill();

 // Dimensional red cap with brim and subtle shine.
 ctx.fillStyle='#b8272b';ctx.beginPath();ctx.arc(2,-42,15.5,Math.PI,Math.PI*2);ctx.fill();
 ctx.fillStyle='#e33e38';ctx.beginPath();ctx.arc(3,-43,14,Math.PI,Math.PI*2);ctx.fill();
 ctx.fillStyle='#f45a52';roundRectSafe(ctx,-10,-45,18,3,2);ctx.fill();
 ctx.fillStyle='#b8272b';roundRectSafe(ctx,-12,-42,32,6,3);ctx.fill();
 ctx.fillStyle='#fff';ctx.font='900 10px Arial';ctx.textAlign='center';ctx.fillText('E',3,-37.2);

 // Expressive side-facing face.
 ctx.fillStyle='#3b2118';roundRectSafe(ctx,9,-34,8,2.3,1);ctx.fill(); // eyebrow
 ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(14,-29,3.6,3.1,0,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#302019';ctx.beginPath();ctx.arc(15,-29,1.8,0,Math.PI*2);ctx.fill();
 ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(15.6,-29.6,.55,0,Math.PI*2);ctx.fill();
 // Nose points toward movement direction after canvas mirroring.
 ctx.fillStyle='#d99b68';ctx.beginPath();ctx.moveTo(19,-28);ctx.quadraticCurveTo(27,-25,22,-21);ctx.lineTo(18,-22);ctx.closePath();ctx.fill();
 ctx.fillStyle='#a85242';ctx.beginPath();ctx.moveTo(15,-18);ctx.quadraticCurveTo(19,-16.5,23,-18);ctx.quadraticCurveTo(19,-14.5,15,-18);ctx.fill();
 ctx.fillStyle='rgba(255,190,160,.36)';ctx.beginPath();ctx.arc(11,-22,3,0,Math.PI*2);ctx.fill();

 ctx.restore();

 // Tiny shoulder light adds a polished game-character material read.
 ctx.fillStyle='rgba(255,255,255,.26)';ctx.beginPath();ctx.ellipse(-7,-4,4,2,-.3,0,Math.PI*2);ctx.fill();

 // Star shield: full-body 2.5D energy bubble with sparkles.
 if(player.shield>0){
   const now=frameNow/1000;
   const pulse=Math.sin(now*6)*2.5;
   const rx=40+pulse, ry=58+pulse;
   ctx.save();
   ctx.globalAlpha=.16;ctx.fillStyle='#7ef7ff';ctx.beginPath();ctx.ellipse(2,-3,rx,ry,0,0,Math.PI*2);ctx.fill();
   ctx.globalAlpha=.12;ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(-9,-15,rx*.35,ry*.58,-.28,0,Math.PI*2);ctx.fill();
   ctx.globalAlpha=1;ctx.shadowColor='#7ef7ff';ctx.shadowBlur=18;ctx.strokeStyle='#7ef7ff';ctx.lineWidth=4;
   ctx.beginPath();ctx.ellipse(2,-3,rx,ry,0,0,Math.PI*2);ctx.stroke();
   ctx.shadowColor='#fff';ctx.shadowBlur=10;
   for(let i=0;i<7;i++){
     const a=now*2.6+i*Math.PI*2/7;
     const sx=2+Math.cos(a)*rx*.88, sy=-3+Math.sin(a)*ry*.88;
     const r=2+(i%3);
     ctx.fillStyle=i%2?'#ffffff':'#bfffff';ctx.beginPath();ctx.arc(sx,sy,r,0,Math.PI*2);ctx.fill();
     if(i%2===0){ctx.beginPath();ctx.moveTo(sx-r*3,sy);ctx.lineTo(sx,sy-r*3);ctx.lineTo(sx+r*3,sy);ctx.lineTo(sx,sy+r*3);ctx.closePath();ctx.fill();}
   }
   ctx.shadowBlur=0;ctx.restore();
 }
 ctx.restore();
}
function star(px,py,r){ctx.fillStyle='#fff';ctx.beginPath();for(let i=0;i<10;i++){let a=-Math.PI/2+i*Math.PI/5,rr=i%2?r:r*.45;ctx.lineTo(px+Math.cos(a)*rr,py+Math.sin(a)*rr)}ctx.fill()}
function animalGradient(y1,y2,c1,c2){const g=ctx.createLinearGradient(0,y1,0,y2);g.addColorStop(0,c1);g.addColorStop(1,c2);return g}
function eye(x,y,r=4){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,r,0,7);ctx.fill();ctx.fillStyle='#111';ctx.beginPath();ctx.arc(x+1,y,r*.45,0,7);ctx.fill()}
function drawMascot(e){
 ctx.save();
 const t=frameNow/180;
 const bob=Math.sin(t+e.x*.018)*1.8;
 const walk=Math.sin(t*1.35+e.x*.025);
 const dir=e.vx<0?-1:1;
 ctx.translate(e.x+e.w/2,e.y+e.h/2+bob);ctx.scale(dir,1);
 ctx.lineJoin='round';ctx.lineCap='round';
 let body='#8b5a36',light='#e9c39a',dark='#3d271b',accent='#f7d35b';
 const type=e.type;
 const pal={
 fox:['#d97835','#ffd4a2','#6a321b','#fff'],camel:['#c89a5c','#f1d3a1','#72502f','#e7c06a'],snake:['#4d9655','#d4eb93','#244e2e','#e9d76a'],
 monkey:['#795239','#d9a47a','#38251c','#e7b25f'],frog:['#59a747','#d9f29b','#28552b','#e8df65'],bat:['#424b63','#aab5cb','#252b3a','#b58cff'],
 'cave-spider':['#413535','#a98d8d','#1e1717','#d56b7d'],goat:['#ded7ca','#fffaf0','#6d665d','#d7b85c'],'arctic-fox':['#dce6ef','#fff','#687786','#9edcff'],
 hawk:['#705039','#d9b48c','#302118','#e8b85d'],'mountain-goat':['#c9c3b7','#f7f2e8','#5f5952','#d8bd68'],hyena:['#a88a5d','#dbc89d','#51422e','#d8b15c'],
 vulture:['#66564b','#bba493','#302823','#c6a46c'],leopard:['#d59a3f','#f2cf7b','#51331a','#e6b74d'],boar:['#7d4c35','#cb916c','#3a2118','#e3c05f']};
 [body,light,dark,accent]=pal[type]||[body,light,dark,accent];
 // Cute mascot shadow
 ctx.fillStyle='#0004';ctx.beginPath();ctx.ellipse(0,23,23,5,0,0,Math.PI*2);ctx.fill();
 // Flying mascot animals
 if(['bat','hawk','vulture'].includes(type)){
   const flap=Math.sin(t*2.2+e.x*.01)*6;
   ctx.fillStyle=body;ctx.beginPath();ctx.moveTo(-7,0);ctx.quadraticCurveTo(-27,-15-flap,-39,-5);ctx.quadraticCurveTo(-29,8,-10,10);ctx.lineTo(0,5);ctx.lineTo(10,10);ctx.quadraticCurveTo(29,8,39,-5);ctx.quadraticCurveTo(27,-15-flap,7,0);ctx.closePath();ctx.fill();
   ctx.fillStyle=light;ctx.beginPath();ctx.ellipse(0,4,14,16,0,0,7);ctx.fill();
   eye(-5,-1,3.5);eye(5,-1,3.5);ctx.fillStyle=dark;ctx.beginPath();ctx.arc(0,8,3,0,7);ctx.fill();
   ctx.restore();return;
 }
 // Snake mascot: chunky smiling head with a wavy body
 if(type==='snake'){
   ctx.strokeStyle=body;ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(-25,15);ctx.quadraticCurveTo(-10,3,2,15);ctx.quadraticCurveTo(16,27,28,9);ctx.stroke();
   ctx.fillStyle=light;ctx.beginPath();ctx.ellipse(25,-2,16,12,0,0,7);ctx.fill();eye(29,-5,3);ctx.fillStyle=dark;ctx.fillRect(36,1,7,2);ctx.fillStyle='#e85b61';ctx.fillRect(42,2,6,2);
   ctx.restore();return;
 }
 // Main mascot body
 ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(0,4,22,16,0,0,7);ctx.fill();
 // Belly patch
 ctx.fillStyle=light;ctx.beginPath();ctx.ellipse(7,7,12,11,0,0,7);ctx.fill();
 // Animated legs
 const leg=walk*3;
 ctx.fillStyle=dark;ctx.fillRect(-15,13,7,13+leg);ctx.fillRect(8,13,7,13-leg);
 ctx.fillStyle=body;ctx.fillRect(-20,13,6,12-leg);ctx.fillRect(14,13,6,12+leg);
 // Species tails
 if(['fox','arctic-fox','leopard','boar'].includes(type)){
   ctx.strokeStyle=body;ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(-17,1);ctx.quadraticCurveTo(-36,-10,-32,9);ctx.stroke();
   ctx.strokeStyle=light;ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-29,3);ctx.quadraticCurveTo(-36,-2,-32,-8);ctx.stroke();
 }
 if(type==='camel'){ctx.fillStyle=body;ctx.beginPath();ctx.arc(-6,-9,9,0,7);ctx.arc(7,-10,9,0,7);ctx.fill();}
 // Head
 ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(20,-8,16,14,0,0,7);ctx.fill();
 // Ears / horns
 if(['fox','arctic-fox','leopard'].includes(type)){ctx.fillStyle=body;ctx.beginPath();ctx.moveTo(10,-16);ctx.lineTo(13,-33);ctx.lineTo(21,-18);ctx.moveTo(24,-18);ctx.lineTo(31,-33);ctx.lineTo(34,-15);ctx.fill();}
 if(['goat','mountain-goat'].includes(type)){ctx.fillStyle=dark;ctx.lineWidth=3;ctx.strokeStyle=dark;ctx.beginPath();ctx.moveTo(13,-17);ctx.quadraticCurveTo(5,-32,12,-34);ctx.moveTo(29,-17);ctx.quadraticCurveTo(37,-32,31,-34);ctx.stroke();}
 if(type==='frog'){ctx.fillStyle=body;ctx.beginPath();ctx.arc(13,-19,8,0,7);ctx.arc(28,-19,8,0,7);ctx.fill();eye(13,-19,3);eye(28,-19,3);}
 if(type==='monkey'){ctx.fillStyle=light;ctx.beginPath();ctx.arc(7,-8,8,0,7);ctx.arc(33,-8,8,0,7);ctx.fill();}
 // Face / mascot expression
 ctx.fillStyle=light;ctx.beginPath();ctx.ellipse(28,-3,9,6,0,0,7);ctx.fill();
 ctx.fillStyle=dark;ctx.beginPath();ctx.arc(32,-5,2.8,0,7);ctx.fill();
 eye(22,-11,4);
 // Friendly smile
 ctx.strokeStyle=dark;ctx.lineWidth=2;ctx.beginPath();ctx.arc(24,-4,5,.1,1.2);ctx.stroke();
 if(type==='leopard'){ctx.fillStyle=dark;for(let i=0;i<7;i++){ctx.beginPath();ctx.arc(8+(i%3)*8,-1+Math.floor(i/3)*7,1.7,0,7);ctx.fill();}}
 if(type==='hyena'){ctx.fillStyle=dark;ctx.beginPath();ctx.arc(-2,-11,3,0,7);ctx.arc(6,-14,3,0,7);ctx.arc(14,-11,3,0,7);ctx.fill();}
 if(type==='boar'){ctx.fillStyle='#fff5df';ctx.beginPath();ctx.moveTo(31,-1);ctx.quadraticCurveTo(39,4,31,7);ctx.moveTo(28,-1);ctx.quadraticCurveTo(35,4,29,6);ctx.fill();}
 // Small mascot badge/accent
 ctx.fillStyle=accent;ctx.beginPath();ctx.arc(-7,-12,3,0,7);ctx.fill();
 ctx.restore();
}
function drawFedoraPrison(prisonActive){
 const px=7480, py=390;if(px+300<cam-120||px>cam+viewW+120)return;
 ctx.save();
 // dark stone prison tower
 ctx.fillStyle='#252334';ctx.fillRect(px,py,260,220);
 ctx.fillStyle='#3d3a50';for(let i=0;i<7;i++)ctx.fillRect(px+i*38,py-18,24,18);
 ctx.fillStyle='#171621';ctx.fillRect(px+55,py+65,150,145);
 // iron bars
 ctx.strokeStyle='#9aa0ad';ctx.lineWidth=7;for(let i=0;i<8;i++){ctx.beginPath();ctx.moveTo(px+66+i*18,py+72);ctx.lineTo(px+66+i*18,py+205);ctx.stroke()}
 ctx.fillStyle='#e15b65';ctx.font='900 18px Arial';ctx.textAlign='center';ctx.fillText('FEDORA',px+130,py+40);
 // Fedora: cute girl character, always visible in the final prison until rescue
 const fx=px+130, fy=py+154;
 ctx.save();ctx.translate(fx,fy);
 const released=!prisonActive;
 if(released){ctx.translate(165,-35);ctx.rotate(Math.sin(frameNow/120)*.04)}
 // hair
 ctx.fillStyle='#5a3425';ctx.beginPath();ctx.arc(0,-28,25,0,7);ctx.fill();ctx.fillRect(-23,-28,46,48);
 // face
 ctx.fillStyle='#d79a72';ctx.beginPath();ctx.arc(0,-25,17,0,7);ctx.fill();
 // hair fringe
 ctx.fillStyle='#5a3425';ctx.beginPath();ctx.arc(-9,-37,11,0,7);ctx.arc(8,-37,11,0,7);ctx.fill();
 // eyes + smile
 ctx.fillStyle='#241b19';ctx.beginPath();ctx.arc(-6,-26,2.5,0,7);ctx.arc(6,-26,2.5,0,7);ctx.fill();ctx.strokeStyle='#7b352f';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,-21,7,.1,1.1);ctx.stroke();
 // pink/purple dress
 ctx.fillStyle='#a75ac7';ctx.beginPath();ctx.moveTo(-19,-7);ctx.lineTo(19,-7);ctx.lineTo(30,48);ctx.lineTo(-30,48);ctx.closePath();ctx.fill();
 // arms
 ctx.strokeStyle='#d79a72';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(-17,3);ctx.lineTo(-30,25);ctx.moveTo(17,3);ctx.lineTo(30,25);ctx.stroke();
 // legs
 ctx.strokeStyle='#3d3155';ctx.lineWidth=9;ctx.beginPath();ctx.moveTo(-10,47);ctx.lineTo(-13,70);ctx.moveTo(10,47);ctx.lineTo(13,70);ctx.stroke();
 ctx.fillStyle='#f0c4d9';ctx.beginPath();ctx.ellipse(-15,73,12,6,0,0,7);ctx.ellipse(15,73,12,6,0,0,7);ctx.fill();
 ctx.restore();
 if(prisonActive){ctx.fillStyle='#ffe66d';ctx.font='900 20px Arial';ctx.textAlign='center';ctx.fillText('RESCUE FEDORA!',px+130,py+245)}else{
   ctx.fillStyle='#ffdf6e';ctx.font='900 22px Arial';ctx.textAlign='center';ctx.fillText('❤️ FEDORA IS FREE!',px+130,py+245);
   ctx.fillStyle='#fff';ctx.font='700 15px Arial';ctx.fillText('ETHAN + FEDORA',px+130,py+267);
 }
 ctx.restore();
}
function drawBoss(b){
 const now=frameNow, t=now/240, moving=Math.abs(b.vx)>.05, walk=moving?Math.sin(now/105):0, pulse=1+Math.sin(t+b.x*.001)*.018, dir=b.face||1;
 const palettes=[['#425f77','#182331','#e75b45'],['#735a2c','#2d2317','#f2c94c'],['#315f46','#14281e','#74d99f'],['#514b88','#201d3e','#9d8cff'],['#55758c','#1d303e','#b9ecff'],['#41639a','#18294c','#70c7ff'],['#7e352d','#2d1514','#ff704d'],['#66518c','#251d3b','#e0b0ff'],['#766342','#2d281d','#d6bd73'],['#3c6653','#162c25','#82d0a8'],['#763c34','#2b1717','#ff8a5b'],['#315d78','#142b3a','#72d3e8'],['#4d556d','#1e2330','#f4e86c'],['#46654f','#1c2b22','#b6d47a'],['#3c345b','#181528','#c58bff'],['#8a6c24','#34270d','#ffe071'],['#65373e','#27171c','#ff675f'],['#654c83','#251b36','#f0a8ff'],['#322d43','#12101a','#df5362'],['#80611d','#281d08','#fff08a']];
 const pal=palettes[world%palettes.length], armor=b.hitFlash>0?'#fff':pal[0], dark=pal[1], glow=pal[2];
 const cx=b.x+55, cy=b.y+60+(moving?Math.abs(walk)*1.8:0);
 ctx.save();
 ctx.translate(cx,cy);ctx.scale(dir*1.18,1.18*pulse);
 // aura + grounded shadow
 if(!lowDetail){ctx.globalAlpha=.16+.07*Math.sin(t*2);ctx.fillStyle=glow;ctx.beginPath();ctx.ellipse(2,-15,67,55,0,0,7);ctx.fill();ctx.globalAlpha=1}
 ctx.fillStyle='#0006';ctx.beginPath();ctx.ellipse(0,43,45,9,0,0,7);ctx.fill();
 // SIDE-PROFILE armored legs: front leg leads toward Ethan.
 const frontStep=moving?walk*5:0, backStep=-frontStep;
 ctx.fillStyle=dark;ctx.fillRect(-18+backStep,8,14,35);ctx.fillRect(7+frontStep,8,15,35);
 ctx.fillStyle=armor;ctx.beginPath();ctx.roundRect(-21+backStep,10,20,20,4);ctx.roundRect(5+frontStep,10,21,20,4);ctx.fill();
 ctx.fillStyle='#111820';ctx.beginPath();ctx.roundRect(-24+backStep,36,25,10,4);ctx.roundRect(5+frontStep,36,28,10,4);ctx.fill();
 // Side-profile torso: chest projects toward Ethan (+X before mirroring).
 ctx.fillStyle=dark;ctx.beginPath();ctx.moveTo(-26,-38);ctx.lineTo(25,-38);ctx.lineTo(35,-18);ctx.lineTo(24,13);ctx.lineTo(-22,13);ctx.lineTo(-30,-18);ctx.closePath();ctx.fill();
 ctx.fillStyle=armor;ctx.beginPath();ctx.moveTo(-20,-34);ctx.lineTo(18,-39);ctx.lineTo(30,-18);ctx.lineTo(19,5);ctx.lineTo(-18,8);ctx.lineTo(-24,-17);ctx.closePath();ctx.fill();
 ctx.strokeStyle=glow;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-12,-24);ctx.lineTo(22,-24);ctx.moveTo(18,-34);ctx.lineTo(18,2);ctx.stroke();
 // rear shoulder and front shoulder give a clear sideways silhouette
 ctx.fillStyle=armor;ctx.beginPath();ctx.roundRect(-39,-34,22,17,7);ctx.roundRect(20,-34,28,18,8);ctx.fill();
 // Back arm
 ctx.strokeStyle=dark;ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(-27,-24);ctx.lineTo(-34,6);ctx.stroke();ctx.fillStyle=armor;ctx.beginPath();ctx.roundRect(-41,-2,15,22,5);ctx.fill();
 // Front arm reaches toward Ethan / weapon
 const jab=b.attackFlash>0?8:0;
 ctx.strokeStyle=dark;ctx.lineWidth=14;ctx.beginPath();ctx.moveTo(32,-23);ctx.lineTo(43+jab,2);ctx.stroke();ctx.fillStyle=armor;ctx.beginPath();ctx.roundRect(37+jab,-3,18,23,5);ctx.fill();
 // SIDE-PROFILE helmet/head. Nose/visor projects toward Ethan (+X before mirroring).
 ctx.fillStyle=dark;ctx.beginPath();ctx.ellipse(3,-57,28,30,0,0,7);ctx.fill();
 ctx.fillStyle=armor;ctx.beginPath();ctx.ellipse(5,-58,24,26,0,0,7);ctx.fill();
 // face guard / snout on the Ethan-facing side
 ctx.fillStyle='#080d13';ctx.beginPath();ctx.moveTo(4,-67);ctx.lineTo(31,-63);ctx.lineTo(36,-52);ctx.lineTo(27,-43);ctx.lineTo(7,-46);ctx.closePath();ctx.fill();
 // single glowing side visor aimed toward Ethan
 ctx.shadowColor=glow;ctx.shadowBlur=13;ctx.fillStyle=glow;ctx.beginPath();ctx.roundRect(14,-59,17,5,2);ctx.fill();ctx.shadowBlur=0;
 // back helmet plate
 ctx.fillStyle=dark;ctx.beginPath();ctx.moveTo(-18,-72);ctx.lineTo(-30,-62);ctx.lineTo(-26,-45);ctx.lineTo(-16,-38);ctx.closePath();ctx.fill();
 // world-specific crest, kept asymmetric enough to reinforce facing
 const variant=world%5;ctx.fillStyle=glow;
 if(variant===0){ctx.beginPath();ctx.moveTo(-8,-79);ctx.lineTo(2,-99);ctx.lineTo(9,-78);ctx.lineTo(18,-91);ctx.lineTo(20,-75);ctx.closePath();ctx.fill()}
 else if(variant===1){ctx.beginPath();ctx.moveTo(-8,-78);ctx.quadraticCurveTo(-27,-96,-18,-106);ctx.quadraticCurveTo(-4,-91,4,-77);ctx.fill()}
 else if(variant===2){ctx.beginPath();ctx.moveTo(2,-80);ctx.lineTo(12,-107);ctx.lineTo(19,-78);ctx.closePath();ctx.fill()}
 else if(variant===3){for(let x=-5;x<=20;x+=12){ctx.beginPath();ctx.arc(x,-80,5,0,7);ctx.fill()}}
 else {ctx.beginPath();ctx.moveTo(-9,-79);ctx.lineTo(0,-96);ctx.lineTo(11,-80);ctx.lineTo(23,-91);ctx.lineTo(22,-75);ctx.closePath();ctx.fill()}
 // Staff is held on the Ethan-facing side (+X). This makes the direction unmistakable.
 const staffX=52+jab;
 ctx.strokeStyle='#111820';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(staffX,9);ctx.lineTo(staffX+4,-76);ctx.stroke();
 ctx.strokeStyle=glow;ctx.lineWidth=b.attackFlash>0?6:3;ctx.shadowColor=glow;ctx.shadowBlur=b.attackFlash>0?18:0;ctx.beginPath();ctx.moveTo(staffX+4,-76);ctx.lineTo(staffX+4,-106);ctx.stroke();ctx.shadowBlur=0;
 ctx.fillStyle=glow;ctx.beginPath();ctx.moveTo(staffX+4,-112);ctx.lineTo(staffX-4,-96);ctx.lineTo(staffX+12,-96);ctx.closePath();ctx.fill();
 ctx.restore();
 // Boss HP stays above the guardian. Boss names are intentionally not drawn near the feet.
 ctx.save();ctx.fillStyle='#111b';ctx.fillRect(cx-65,cy-149,130,14);ctx.fillStyle='#fff';ctx.fillRect(cx-61,cy-145,122,7);ctx.fillStyle=glow;ctx.fillRect(cx-61,cy-145,122*Math.max(0,b.hp/b.maxHp),7);ctx.strokeStyle='#05080d';ctx.lineWidth=2;ctx.strokeRect(cx-65,cy-149,130,14);ctx.restore();
}
function drawShop(){ctx.fillStyle='#0009';ctx.fillRect(0,0,viewW,viewH);const w=Math.min(620,viewW-40),h=430,l=(viewW-w)/2,t=(viewH-h)/2;ctx.fillStyle='#fff';ctx.fillRect(l,t,w,h);ctx.fillStyle='#17202a';ctx.font='900 32px Arial';ctx.fillText('KINGDOM SHOP',l+28,t+48);ctx.font='700 17px Arial';ctx.fillText('Coins: '+coins,l+28,t+76);const arr=[['fire','🔥 Fire Power','Throw fireballs',60],['sprint','⚡ Sprint Boost','Run faster',90],['heart','❤️ Extra Life','Gain a life',120],['star','⭐ Star Token','Instant star',180],['shield','🛡 Shield','Temporary protection',220]];arr.forEach((a,i)=>{const yy=t+105+i*58;ctx.fillStyle='#f3f5f7';ctx.fillRect(l+20,yy,w-40,48);ctx.fillStyle='#222';ctx.font='700 17px Arial';ctx.fillText(a[1],l+35,yy+21);ctx.font='14px Arial';ctx.fillText(a[2]+' — '+a[3]+' coins',l+35,yy+40);ctx.fillStyle='#ffd43b';ctx.fillRect(l+w-120,yy+9,82,30);ctx.fillStyle='#222';ctx.font='bold 13px Arial';ctx.fillText('BUY',l+w-94,yy+29)});ctx.fillStyle='#555';ctx.font='14px Arial';ctx.fillText('Press S or SHOP button to close',l+28,t+h-18)}
function msg(text){const el=document.getElementById('message');el.textContent=text;clearTimeout(msg.timer);msg.timer=setTimeout(()=>el.textContent='',2200)}
function loop(t){
 if(!running||paused||shopOpen){rafId=0;return}
 try{
   const rawDt=(t-last)/1000||.016;
   const dt=Math.min(.05,Math.max(.008,rawDt));
   last=t;
   if(rawDt>.034) slowFrames=Math.min(120,slowFrames+2); else slowFrames=Math.max(0,slowFrames-1);
   if(!lowDetail&&slowFrames>14)lowDetail=true;else if(lowDetail&&slowFrames<5)lowDetail=false;
   update(dt);draw();rafId=requestAnimationFrame(loop)
 }
 catch(err){running=false;rafId=0;console.error(err);const el=document.getElementById('message');el.textContent='Game error: '+err.message;showStart('GAME NEEDS RESTART','A rendering error was detected and safely stopped. Please restart the mission.','RESTART GAME');}
}
function resumeLoop(){if(running&&!paused&&!shopOpen&&!rafId){last=performance.now();rafId=requestAnimationFrame(loop)}}
function validateProgress(){world=Math.max(0,Math.min(WORLD_COUNT-1,Math.floor(Number(world)||0)));if(!Number.isFinite(score))score=0;if(!Number.isFinite(coins)||coins<0)coins=0;if(!Number.isFinite(stars)||stars<0)stars=0;if(!Number.isFinite(lives)||lives<0)lives=0;}
function start(){
 hideWorldMissionBubble();
 if(rafId){cancelAnimationFrame(rafId);rafId=0}
 stopAllMusic();
 for(const k in keys)keys[k]=false;
 lives=3;coins=0;stars=0;score=0;world=0;level=1;timeLeft=180;
 finishCelebration=0;finishNextWorld=false;finishEmote='🥳';transitionLocked=false;
 rescueSequence=0;rescueDone=false;shopOpen=false;paused=false;gameState='playing';
 try{
   resetWorld();
   validateProgress();
   running=true;
   last=performance.now();
   updateHud(true);
   draw(); // fail fast: verify the first game frame before removing the mission screen
   document.getElementById('start').style.display='none';
   showWorldMissionBubble();
   playMusic();
   if(!rafId)rafId=requestAnimationFrame(loop);
 }catch(err){
   running=false;rafId=0;stopAllMusic();
   console.error('Mission start failed:',err);
   const el=document.getElementById('message');if(el)el.textContent='Unable to start mission: '+err.message;
   showStart('MISSION START ERROR','The game safely stopped before play began. Reload and try again.','RETRY MISSION');
 }
}
document.getElementById('closeMissionBubble').onclick=hideWorldMissionBubble;
document.getElementById('play').onclick=()=>{try{initAudio()}catch(err){console.warn('Audio unavailable:',err)}start()}; document.getElementById('audioBtn').onclick=()=>{initAudio();musicOn=!musicOn;document.getElementById('audioBtn').textContent=musicOn?'🔊':'🔇';if(musicOn)playMusic();else {stopAllMusic()}};document.getElementById('pauseBtn').onclick=()=>{if(!running)return;paused=!paused;msg(paused?'PAUSED':'RESUMED');if(paused){if(rafId){cancelAnimationFrame(rafId);rafId=0}draw();}else resumeLoop();};
addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp',' ','Shift','w','W','a','A','d','D','f','F','t','T','g','G','s','S','x','X','c','C','z','Z','ArrowDown','p','P','Escape'].includes(e.key))e.preventDefault();const wasDown=!!keys[e.key];keys[e.key]=true;if(e.repeat||wasDown)return;if(['ArrowUp','w','W',' '].includes(e.key))jump();if(['f','F','t','T','g','G'].includes(e.key))fire();if(['s','S'].includes(e.key))openShop();if(e.key==='Escape'){shopOpen=false;if(paused){paused=false;msg('RESUMED')}resumeLoop()}if(['p','P'].includes(e.key)&&running&&!shopOpen){paused=!paused;msg(paused?'PAUSED':'RESUMED');if(paused){if(rafId){cancelAnimationFrame(rafId);rafId=0}draw()}else resumeLoop()}if(!running&&e.key==='Enter')start()});
addEventListener('keyup',e=>keys[e.key]=false);
addEventListener('visibilitychange',()=>{if(document.hidden&&running){pauseBeforeHide=paused;paused=true;for(const k in keys)keys[k]=false;if(rafId){cancelAnimationFrame(rafId);rafId=0}if(audioCtx&&audioCtx.state==='running')audioCtx.suspend().catch(()=>{});}else if(running){paused=pauseBeforeHide;if(audioCtx&&musicOn&&audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});if(!paused)resumeLoop()}});
addEventListener('pointerdown',e=>{if(!shopOpen)return;const w=Math.min(620,viewW-40),h=430,l=(viewW-w)/2,t=(viewH-h)/2;const cr=c.getBoundingClientRect(),mx=(e.clientX-cr.left)*(viewW/cr.width),my=(e.clientY-cr.top)*(viewH/cr.height);if(mx<l||mx>l+w||my<t||my>t+h){shopOpen=false;resumeLoop();return}for(let i=0;i<5;i++){const yy=t+105+i*58;if(mx>l+w-120&&mx<l+w-38&&my>yy&&my<yy+48){buy(['fire','sprint','heart','star','shield'][i]);return}}});
document.querySelectorAll('.btn').forEach(b=>{let k=b.dataset.k;const on=e=>{e.preventDefault();try{b.setPointerCapture(e.pointerId)}catch(_){}if(k==='left')keys.ArrowLeft=true;if(k==='right')keys.ArrowRight=true;if(k==='crouch')keys.ArrowDown=true;if(k==='jump')jump();if(k==='dash')keys.shift=true;if(k==='fire')fire();if(k==='shop')openShop()};const off=e=>{e.preventDefault();if(k==='left')keys.ArrowLeft=false;if(k==='right')keys.ArrowRight=false;if(k==='crouch')keys.ArrowDown=false;if(k==='dash')keys.shift=false};['pointerup','pointercancel','pointerleave','lostpointercapture'].forEach(ev=>b.addEventListener(ev,off));b.addEventListener('pointerdown',on)});
addEventListener('blur',()=>{for(const k in keys)keys[k]=false});

window.addEventListener('error',e=>{console.error('Super Kingdom Adventure error:',e.error||e.message)});
window.addEventListener('unhandledrejection',e=>console.error('Unhandled game promise:',e.reason));
