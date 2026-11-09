(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width, H = canvas.height, ZONE_W = 760, WORLD_W = ZONE_W * 4;
  const zones = [
    {name:'THE BRAMBLEFEN', sky:'#273b3a', far:'#30443c', ground:'#344236', accent:'#b9a260', label:'Bramblefen'},
    {name:'THE EMBERWORKS', sky:'#422d2c', far:'#613b32', ground:'#48332d', accent:'#eb995d', label:'Emberworks'},
    {name:'THE GLASS CATHEDRAL', sky:'#26363e', far:'#354a58', ground:'#364249', accent:'#8bc6c0', label:'Glass Cathedral'},
    {name:'THE WHITE ROOKERY', sky:'#43494a', far:'#636664', ground:'#4a4b46', accent:'#e9e2d0', label:'White Rookery'}
  ];
  const platformData = [
    [ [160,190,84],[310,157,92],[485,192,80],[590,148,74] ],
    [ [100,185,90],[245,145,78],[390,184,96],[555,150,90] ],
    [ [120,175,95],[280,138,88],[455,181,90],[590,140,75] ],
    [ [110,183,88],[260,145,90],[430,177,100],[570,135,90] ]
  ];
  const $ = id => document.getElementById(id);
  const state = {started:false,paused:false,map:false,upgrade:false,won:false,dead:false,toastTimer:0,frame:0,keys:{},pressed:{},camera:0,zone:0,visited:new Set([0]),kills:0,scrap:0,meat:0,upgrades:{claw:0,scythe:0,heart:0,dash:0},sigils:0,gateOpen:[false,false,false],superUnlocked:false};
  const player = {x:46,y:188,vx:0,vy:0,w:14,h:24,face:1,health:6,maxHealth:6,energy:0,onGround:false,attack:0,attackType:'',charge:0,dashing:0,invuln:0,anim:0,meat:0,hitIds:new Set(),superFlash:0};
  const enemies = [];
  const bosses = [];
  const drops = [];
  const particles = [];
  const shrines = [350,1120,1880,2640];
  function makeEnemy(x, type='crawler', zone=Math.floor(x/ZONE_W)) {
    const cfg = type==='brute'?{hp:5,w:20,h:23,speed:.42,damage:1}:{hp:3,w:17,h:17,speed:.65,damage:1};
    enemies.push({x,y:218-cfg.h,vx:0,w:cfg.w,h:cfg.h,hp:cfg.hp,maxHp:cfg.hp,type,zone,dir:Math.random()<.5?-1:1,hit:0,attack:0,stun:0,dead:false,anim:Math.random()*10});
  }
  [120,270,430,590,850,1020,1240,1390,1640,1800,2020,2160,2410,2580,2780].forEach((x,i)=>makeEnemy(x,i%4===2?'brute':'crawler'));
  [ {x:682,zone:0,name:'MIREKEEPER',kind:'bog',hp:18},{x:1440,zone:1,name:'THE FURNACE WARDEN',kind:'forge',hp:22},{x:2200,zone:2,name:'THE GLASS MATRIARCH',kind:'glass',hp:24},{x:2960,zone:3,name:'THE WHITE ROOK',kind:'final',hp:34} ].forEach(b=>bosses.push({...b,y:180,w:b.kind==='final'?24:28,h:38,maxHp:b.hp,dir:-1,attack:0,hit:0,stun:0,phase:0,dead:false,warning:0}));
  function notify(text){const el=$('toast');el.textContent=text;el.classList.add('show');state.toastTimer=120}
  function setObjective(text){$('objective-text').textContent=text}
  function updateHud(){
    $('health-fill').style.width=`${100*player.health/player.maxHealth}%`;$('health-text').textContent=`${player.health} / ${player.maxHealth}`;
    $('energy-fill').style.width=`${player.energy}%`;$('energy-text').textContent=`${Math.floor(player.energy)} / 100`;
    $('scrap-count').textContent=state.scrap;$('meat-count').textContent=player.meat;
    $('zone-label').textContent=zones[state.zone].name;
    $('relic-icons').textContent='◆'.repeat(state.sigils)+'◇'.repeat(3-state.sigils);
    $('charge-indicator').style.background=player.charge>.05?'#e7c779':'transparent';$('charge-indicator').style.width=`${Math.min(18,player.charge*18)}px`;$('charge-indicator').style.height='4px';
  }
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const rect=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))};
  function start(){if(state.started)return;state.started=true;$('modal').classList.add('hidden');notify('THE ROOKERY REMEMBERS YOUR NAME');setObjective('Reach the end of the Bramblefen');requestAnimationFrame(loop)}
  $('start-button').addEventListener('click',start);
  $('pause-button').addEventListener('click',togglePause);$('resume-button').addEventListener('click',togglePause);
  $('map-button').addEventListener('click',toggleMap);$('close-map').addEventListener('click',toggleMap);
  function togglePause(){if(!state.started)return;state.paused=!state.paused;$('pause-cover').classList.toggle('hidden',!state.paused)}
  function toggleMap(){if(!state.started)return;state.map=!state.map;$('map-panel').classList.toggle('hidden',!state.map);if(state.map)drawMap()}
  function drawMap(){const box=$('map-content');box.innerHTML='';const grid=document.createElement('div');grid.className='map-grid';zones.forEach((z,i)=>{const room=document.createElement('div');room.className='map-room'+(state.visited.has(i)?' seen':'')+(state.zone===i?' current':'')+((i>0&&!state.gateOpen[i-1])?' locked':'');room.innerHTML=`${z.label.toUpperCase()}<br>${i>0&&!state.gateOpen[i-1]?'⛨':'◆'}`;grid.appendChild(room)});box.appendChild(grid)}
  function openUpgrades(){state.upgrade=true;const panel=$('upgrade-panel');panel.classList.remove('hidden');panel.innerHTML=`<div class="upgrade-heading">ROOKERY SHRINE · ${state.scrap} SCRAP</div><p class="upgrade-desc">Offer scrap to mend your body and temper your weapons.</p><div class="upgrade-list">
    <button class="upgrade-card" data-up="heart"><span>VITALITY · +1 MAX HEALTH</span><em>${3+state.upgrades.heart*2} ◈</em></button>
    <button class="upgrade-card" data-up="claw"><span>RAZOR TALONS · +CLAW DAMAGE</span><em>${4+state.upgrades.claw*3} ◈</em></button>
    <button class="upgrade-card" data-up="scythe"><span>REAPER'S EDGE · +SCYTHE DAMAGE</span><em>${5+state.upgrades.scythe*3} ◈</em></button>
    <button class="upgrade-card" data-up="dash"><span>WINDSTEP · FASTER DASH</span><em>${4+state.upgrades.dash*3} ◈</em></button>
    ${!state.superUnlocked?'<button class="upgrade-card" data-up="super"><span>STARFALL · UNLOCK SUPER ATTACK</span><em>8 ◈</em></button>':''}
    </div><div class="upgrade-foot">Press U or Esc to close · Defeated foes drop scrap</div>`;
    panel.querySelectorAll('[data-up]').forEach(btn=>btn.addEventListener('click',()=>buyUpgrade(btn.dataset.up)));
  }
  function closeUpgrades(){state.upgrade=false;$('upgrade-panel').classList.add('hidden')}
  function buyUpgrade(type){let cost=type==='heart'?3+state.upgrades.heart*2:type==='claw'?4+state.upgrades.claw*3:type==='scythe'?5+state.upgrades.scythe*3:type==='dash'?4+state.upgrades.dash*3:8;if(state.scrap<cost){notify('NOT ENOUGH SCRAP');return}if(type==='super'&&state.superUnlocked)return;state.scrap-=cost;if(type==='heart'){state.upgrades.heart++;player.maxHealth++;player.health++}else if(type==='claw')state.upgrades.claw++;else if(type==='scythe')state.upgrades.scythe++;else if(type==='dash')state.upgrades.dash++;else state.superUnlocked=true;notify('THE SHRINE ANSWERS YOUR OFFER');openUpgrades();updateHud()}
  function handleKey(e,down){const k=e.key.toLowerCase();if([' ','arrowleft','arrowright','arrowup','arrowdown'].includes(k))e.preventDefault();if(down&&!state.keys[k])state.pressed[k]=true;state.keys[k]=down;if(k==='escape'&&down){if(state.upgrade)closeUpgrades();else if(state.map)toggleMap();else togglePause()}if(k==='m'&&down)toggleMap();if(k==='u'&&down&&state.upgrade)closeUpgrades()}
  window.addEventListener('keydown',e=>handleKey(e,true));window.addEventListener('keyup',e=>handleKey(e,false));
  document.querySelectorAll('.touch-controls button').forEach(btn=>{const key=btn.dataset.key;btn.addEventListener('pointerdown',e=>{e.preventDefault();handleKey({key},true)});['pointerup','pointercancel','pointerleave'].forEach(ev=>btn.addEventListener(ev,e=>{e.preventDefault();handleKey({key},false)}))});
  function pressed(...keys){return keys.some(k=>state.pressed[k])}function held(...keys){return keys.some(k=>state.keys[k])}
  function tryAttack(type){if(player.attack>0||player.dashing>0)return;player.attack=type==='claw'?13:19;player.attackType=type;player.hitIds.clear();if(type==='heavy'){player.charge=0;player.energy=Math.min(100,player.energy+4)}}
  function hitTarget(target,damage,type){if(target.dead||player.hitIds.has(target))return;player.hitIds.add(target);target.hp-=damage;target.hit=8;target.stun=12;target.dir=(target.x+target.w/2<player.x+player.w/2)?-1:1;target.x+=player.face*3;for(let i=0;i<5;i++)particles.push({x:target.x+target.w/2,y:target.y+target.h/2,vx:(Math.random()-.5)*2,vy:(Math.random()-.8)*2,life:18,color:type==='heavy'?'#f0ca6c':'#d78369'});if(type==='heavy'){player.health=Math.min(player.maxHealth,player.health+1);player.energy=Math.min(100,player.energy+16);notify('+1 LIFE · SCYTHE DRAIN')}else player.energy=Math.min(100,player.energy+5);if(target.hp<=0){target.dead=true;state.kills++;state.scrap+=target===undefined?0:1;drops.push({x:target.x+target.w/2,y:target.y+target.h-3,type:'meat',life:999});drops.push({x:target.x+target.w/2+7,y:target.y+target.h-8,type:'scrap',life:999});notify('FOE FELLED · MEAT + SCRAP')}}
  function combat(){const claw=player.attackType==='claw',heavy=player.attackType==='heavy';if(player.attack<=0)return;const range=heavy?46:27,vert=heavy?34:27;for(const e of enemies){if(!e.dead&&e.zone===state.zone&&Math.abs((e.x+e.w/2)-(player.x+player.w/2+player.face*range*.55))<range*.65&&Math.abs((e.y+e.h/2)-(player.y+player.h/2))<vert){hitTarget(e,heavy?4+state.upgrades.scythe*2:1+state.upgrades.claw,e===null?'claw':heavy?'heavy':'claw')}}for(const b of bosses){if(!b.dead&&b.zone===state.zone&&Math.abs((b.x+b.w/2)-(player.x+player.w/2+player.face*range*.55))<range*.65&&Math.abs((b.y+b.h/2)-(player.y+player.h/2))<48){hitTarget(b,heavy?3+state.upgrades.scythe*2:1+state.upgrades.claw,heavy?'heavy':'claw')}}}
  function superAttack(){if(!state.superUnlocked){notify('A SHRINE CAN TEACH YOU STARFALL');return}if(player.energy<100){notify('STARFALL NEEDS FULL ENERGY');return}player.energy=0;player.superFlash=26;for(const e of enemies){if(!e.dead&&e.zone===state.zone&&Math.abs(e.x-player.x)<125)hitTarget(e,6+state.upgrades.scythe*2,'heavy')}for(const b of bosses){if(!b.dead&&b.zone===state.zone&&Math.abs(b.x-player.x)<140)hitTarget(b,8+state.upgrades.scythe*2,'heavy')}for(let i=0;i<30;i++)particles.push({x:player.x+player.w/2,y:player.y+12,vx:(Math.random()-.5)*4,vy:(Math.random()-.5)*4,life:25,color:'#ffe7a0'});notify('STARFALL!')}
  function eatMeat(){const item=drops.find(d=>d.type==='meat'&&Math.abs(d.x-(player.x+7))<42&&Math.abs(d.y-player.y)<45);if(player.meat>0&&player.health<player.maxHealth){player.meat--;player.health=Math.min(player.maxHealth,player.health+2);notify('YOU FEAST · +2 LIFE')}else if(item){item.type='gone';player.health=Math.min(player.maxHealth,player.health+2);notify('FRESH MEAT · +2 LIFE')}else if(player.meat>0)notify('YOU ARE ALREADY AT FULL HEALTH');else notify('NO MEAT NEARBY')}
  function update(){state.frame++;if(state.toastTimer>0&&!--state.toastTimer)$('toast').classList.remove('show');if(state.paused||state.map||state.upgrade||state.won||state.dead){state.pressed={};return}
    let move=(held('a','arrowleft')?-1:0)+(held('d','arrowright')?1:0);if(move){player.vx=move*1.65;player.face=move}else player.vx*=.78;
    if(pressed('w',' ','arrowup')&&player.onGround){player.vy=-5.15;player.onGround=false;for(let i=0;i<4;i++)particles.push({x:player.x+7,y:player.y+23,vx:(Math.random()-.5),vy:-Math.random(),life:10,color:'#c8c0a3'})}
    if(pressed('shift','x')&&player.dashing<=0){player.dashing=13;player.invuln=Math.max(player.invuln,17);player.vx=player.face*(4.4+state.upgrades.dash*.7);player.vy=0;for(let i=0;i<6;i++)particles.push({x:player.x,y:player.y+12,vx:-player.face*Math.random()*2,vy:(Math.random()-.5),life:13,color:'#83c7bd'})}
    if(pressed('j'))tryAttack('claw');
    if(held('k')){player.charge=Math.min(1,player.charge+.025);if(player.charge>.13&&state.frame%7===0)particles.push({x:player.x+player.w/2+player.face*9,y:player.y+8,vx:player.face*.5,vy:-.3,life:10,color:'#ecd18a'})}
    if(!held('k')&&player.charge>.03&&player.attack<=0){player.attack=17+Math.floor(player.charge*8);player.attackType='heavy';player.hitIds.clear();if(player.charge>.7)player.energy=Math.min(100,player.energy+5);player.charge=0}
    if(pressed('l'))superAttack();if(pressed('q','e'))eatMeat();
    for(const x of shrines)if(Math.abs(player.x-x)<25&&pressed('u'))openUpgrades();
    if(player.dashing>0)player.dashing--;else{player.vy=Math.min(6,player.vy+.24);player.x+=player.vx;player.y+=player.vy}
    player.x=clamp(player.x,0,WORLD_W-player.w);player.onGround=false;
    const floor=218-player.h;if(player.y>=floor){player.y=floor;player.vy=0;player.onGround=true}
    const z=Math.floor(player.x/ZONE_W);state.zone=clamp(z,0,3);state.visited.add(state.zone);
    for(let i=0;i<4;i++){const roomStart=i*ZONE_W,roomEnd=roomStart+ZONE_W;if(player.x>roomEnd-15&&i<3&&!state.gateOpen[i]){player.x=roomEnd-15;player.vx=0;if(!bosses[i].dead)notify('DEFEAT THE ZONE GUARDIAN TO OPEN THE WAY');else {state.gateOpen[i]=true;player.x=roomEnd+2}}}
    // Landing on floating platforms.
    for(let i=state.zone*ZONE_W;i<(state.zone+1)*ZONE_W;i+=ZONE_W){for(const [px,py,pw] of platformData[i/ZONE_W]){const x=i+px;if(player.vy>=0&&player.x+player.w>x&&player.x<x+pw&&player.y+player.h>=py&&player.y+player.h-player.vy<=py+2){player.y=py-player.h;player.vy=0;player.onGround=true}}}
    if(player.y>H+20)hurtPlayer(1);
    if(player.attack>0){player.attack--;combat()};if(player.invuln>0)player.invuln--;if(player.superFlash>0)player.superFlash--;player.anim+=Math.abs(player.vx)*.1+.04;
    for(const e of enemies){if(e.dead||e.zone!==state.zone)continue;e.anim+=.08;if(e.hit>0)e.hit--;if(e.attack>0)e.attack--;if(e.stun>0){e.stun--;continue}const dx=(player.x-e.x);if(Math.abs(dx)<135){e.dir=dx>0?1:-1;e.x+=e.dir*e.speed;if(Math.abs(dx)<24&&e.attack<=0){e.attack=58;hurtIfTouch(e)}}else e.x+=Math.sin(state.frame*.018+e.x)*.18;e.x=clamp(e.x,e.zone*ZONE_W+10,(e.zone+1)*ZONE_W-30);}
    for(const b of bosses){if(b.dead||b.zone!==state.zone)continue;if(b.hit>0)b.hit--;if(b.stun>0)b.stun--;b.phase++;const dx=player.x-b.x;b.dir=dx>0?1:-1;if(b.attack>0)b.attack--;if(b.warning>0)b.warning--;
      if(Math.abs(dx)<250){if(b.kind==='final'&&b.warning===0&&b.attack===0&&Math.abs(dx)<130){b.warning=28;notify('THE WHITE ROOK RAISES ITS BLADE')}if(b.warning===0&&b.attack===0){b.attack=b.kind==='final'?70:90;b.vx=b.dir*(b.kind==='final'?2.4:1.55)}if(b.attack>25){b.x+=b.vx||b.dir*1.2}else{b.vx=0;if(Math.abs(dx)<48&&b.attack===18)hurtPlayer(b.kind==='final'?2:1)}}else b.x+=Math.sin(state.frame*.03)*.25;
      b.x=clamp(b.x,b.zone*ZONE_W+30,(b.zone+1)*ZONE_W-38);
    }
    for(const d of drops){if(d.type==='gone')continue;d.y+=Math.sin((state.frame+d.x)*.08)*.12;if(d.type==='scrap'&&Math.abs(d.x-player.x-7)<12&&Math.abs(d.y-player.y-10)<25){d.type='gone';state.scrap++;notify('+1 SCRAP')}else if(d.type==='meat'&&Math.abs(d.x-player.x-7)<11&&Math.abs(d.y-player.y-10)<20){d.type='gone';player.meat++;notify('MEAT COLLECTED · PRESS Q TO EAT')}}
    for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.vy+=.03;p.life--}for(let i=particles.length-1;i>=0;i--)if(particles[i].life<=0)particles.splice(i,1);
    const target=clamp(player.x-W*.43,0,WORLD_W-W);state.camera+=(target-state.camera)*.12;
    if(bosses[state.zone]&&bosses[state.zone].x-player.x<300&&bosses[state.zone].x>player.x-120&&!bosses[state.zone].dead){$('boss-hud').classList.remove('hidden');$('boss-name').textContent=bosses[state.zone].name;$('boss-fill').style.width=`${100*bosses[state.zone].hp/bosses[state.zone].maxHp}%`}else $('boss-hud').classList.add('hidden');
    if(state.zone===0)setObjective('Find the Mirekeeper · ' + state.sigils + ' / 3 sigils');else if(state.zone===1)setObjective('Cross the Emberworks · Claim the furnace sigil');else if(state.zone===2)setObjective('Break the glass guardian · ' + state.sigils + ' / 3 sigils');else setObjective('The White Rook awaits · ' + state.sigils + ' / 3 sigils');
    updateHud();state.pressed={};
  }
  function hurtIfTouch(e){if(Math.abs((player.x+7)-(e.x+e.w/2))<20&&Math.abs(player.y-e.y)<24)hurtPlayer(1)}
  function hurtPlayer(amount){if(player.invuln>0||state.dead)return;player.health-=amount;player.invuln=54;player.vx=-player.face*2;player.vy=-2;for(let i=0;i<8;i++)particles.push({x:player.x+7,y:player.y+12,vx:(Math.random()-.5)*2,vy:(Math.random()-.5)*2,life:18,color:'#e27369'});if(player.health<=0){player.health=0;state.dead=true;showEnd('YOUR FLIGHT ENDS HERE','The rookery keeps what it takes. Try again.')}updateHud()}
  function drawBackground(){const z=zones[state.zone];ctx.fillStyle=z.sky;ctx.fillRect(0,0,W,H);const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,z.sky);g.addColorStop(1,'#141b1d');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    // distant layered silhouettes
    for(let layer=0;layer<3;layer++){const parallax=.12+layer*.13;ctx.fillStyle=layer===0?'#182526':layer===1?z.far:'#283331';for(let i=-1;i<9;i++){let x=i*100-(state.camera*parallax%100);let height=45+((i*37+layer*11)%41);rect(x,160-height,3,height,ctx.fillStyle);rect(x-9,160-height+12,21,4,ctx.fillStyle);rect(x-5,160-height+21,13,3,ctx.fillStyle);if(layer===2&&i%2===0)rect(x+3,148-height,3,10,z.accent+'44')}}
    // distant moon / furnace glow
    if(state.zone===1){ctx.fillStyle='#d8754e22';ctx.beginPath();ctx.arc(362,75,46,0,Math.PI*2);ctx.fill()}else if(state.zone===3){ctx.fillStyle='#f0ead51a';ctx.beginPath();ctx.arc(348,67,33,0,Math.PI*2);ctx.fill()}
    // ground
    rect(0,218,W,52,z.ground);rect(0,218,W,3,z.accent+'aa');for(let i=-1;i<50;i++){const x=(i*17-(state.camera%17));rect(x,226+(i%3)*7,9,2,'#141d1b');if(i%3===0)rect(x+4,216,2,6,'#a8a06a66')}
    // floating platforms
    const base=state.zone*ZONE_W;for(const [px,py,pw] of platformData[state.zone]){let x=base+px-state.camera;if(x>-100&&x<W+20){rect(x,py,pw,5,'#786d4c');rect(x+2,py+5,pw-4,4,'#252e2b');rect(x+5,py-2,pw-10,2,z.accent+'88')}}
    // zone markers
    for(let i=0;i<4;i++){let x=i*ZONE_W+ZONE_W/2-state.camera;if(x>-100&&x<W+100){ctx.fillStyle='#d9c67b77';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText(zones[i].label.toUpperCase(),x,203)}}
  }
  function drawPlayer(){let x=Math.round(player.x-state.camera),y=Math.round(player.y);if(player.invuln>0&&Math.floor(state.frame/4)%2===0)return;const face=player.face;ctx.save();ctx.translate(x+7,y);ctx.scale(face,1);
    // ordinary crow's body, wings and beak
    rect(-5,8,11,13,'#232a29');rect(-4,7,9,10,'#303a37');rect(-2,1,7,8,'#202625');rect(-3,0,8,3,'#353e3a');rect(3,3,7,3,'#d7ad54');rect(8,3,3,2,'#8e653a');rect(1,1,2,2,'#f1e7bf');rect(2,1,1,1,'#181d1c');
    // cloak and legs
    rect(-6,13,12,5,'#6a453b');rect(-6,18,4,4,'#4e3932');rect(1,18,4,4,'#4e3932');rect(-6,22,6,2,'#b98b48');rect(1,22,6,2,'#b98b48');rect(-6,9,3,7,'#171e1d');
    // scythe carried at the back, blade rests over beak on heavy charge
    if(player.attackType==='heavy'||player.charge>.12){rect(4,-5,2,18,'#b6ad93');rect(2,-7,7,2,'#ddd6bd');rect(8,-7,3,2,'#ddd6bd');rect(3,-9,4,2,'#ddd6bd');if(player.charge>.2){ctx.strokeStyle='#e6ca77';ctx.globalAlpha=.35+player.charge*.45;ctx.beginPath();ctx.arc(5,1,10+player.charge*8,-2,1.3);ctx.stroke()}}else{rect(-7,12,2,14,'#968f7b');rect(-10,11,7,2,'#d7cfb6');rect(-11,9,3,2,'#d7cfb6');rect(-6,9,3,2,'#d7cfb6')}
    // claw swipe visual
    if(player.attack>0&&player.attackType==='claw'){rect(8,10,9,2,'#eee2bf');rect(13,8,7,1,'#eee2bf');rect(15,11,6,1,'#eee2bf')}
    if(player.attack>0&&player.attackType==='heavy'){rect(9,1,19,3,'#d8d2ba');rect(24,-2,7,3,'#d8d2ba');rect(30,-3,3,3,'#d8d2ba')}
    if(player.dashing>0){ctx.globalAlpha=.4;rect(-17,5,14,17,'#88c9bb')}
    ctx.restore();if(player.superFlash>0){ctx.globalAlpha=player.superFlash/26*.55;ctx.fillStyle='#fff0bb';ctx.fillRect(0,0,W,H);ctx.globalAlpha=1}}
  function drawEnemy(e){const x=Math.round(e.x-state.camera),y=Math.round(e.y);ctx.save();if(e.hit>0)ctx.globalAlpha=.55;let c=e.type==='brute'?'#765046':'#5f6a4c';rect(x,y+5,e.w,e.h-5,c);rect(x+2,y,e.w-4,9,e.type==='brute'?'#98704f':'#748256');rect(x+3,y+3,3,3,'#edc77a');rect(x+e.w-6,y+3,3,3,'#edc77a');if(e.type==='brute'){rect(x-3,y+10,5,7,'#a37b58');rect(x+e.w-2,y+10,5,7,'#a37b58')}else{rect(x+2,y+e.h-3,3,5,'#302d27');rect(x+e.w-5,y+e.h-3,3,5,'#302d27')}ctx.restore()}
  function drawBoss(b){let x=Math.round(b.x-state.camera),y=Math.round(b.y);ctx.save();if(b.hit>0)ctx.globalAlpha=.5;if(b.kind==='final'){
      // A mirror of the hero: pale feathers, white mantle, and a long sword
      rect(x+4,y+9,17,26,'#e6e1d3');rect(x+1,y+4,21,15,'#f5f0e2');rect(x+5,y,13,9,'#fff9e9');rect(x+14,y+3,10,3,'#d9bd79');rect(x+8,y+2,3,2,'#312c29');rect(x+7,y+16,13,8,'#c7c1b5');rect(x+3,y+23,7,10,'#f5f0e2');rect(x+15,y+24,7,9,'#f5f0e2');rect(x+20,y+14,3,14,'#5b4641');rect(x+23,y+11,3,22,'#d8d8d0');rect(x+24,y+8,2,5,'#f5f5ee');rect(x+21,y+30,9,2,'#b79d66');
    }else{const body=b.kind==='bog'?'#555d43':b.kind==='forge'?'#994b36':'#6d9091';rect(x+3,y+10,22,28,body);rect(x+1,y+3,26,14,b.kind==='glass'?'#9ccfc8':'#7e7259');rect(x+7,y-2,14,10,'#303837');rect(x+7,y+4,4,3,'#edc66d');rect(x+18,y+4,4,3,'#edc66d');rect(x-3,y+18,7,12,body);rect(x+25,y+18,7,12,body);if(b.kind==='forge')rect(x+10,y+13,11,7,'#f18a4d');else if(b.kind==='glass'){rect(x+12,y-8,4,8,'#8fc9c3');rect(x+4,y+23,20,2,'#b7e5df')}}
    if(b.warning>0){ctx.fillStyle='#f3dfaa';ctx.font='8px monospace';ctx.textAlign='center';ctx.fillText('!',x+b.w/2,y-13);ctx.strokeStyle='#f4dd9d';ctx.globalAlpha=.25;ctx.beginPath();ctx.arc(x+b.w/2,y+b.h/2,36+(28-b.warning)*2,0,Math.PI*2);ctx.stroke()}ctx.restore()}
  function draw(){drawBackground();ctx.save();for(const x of shrines){let sx=x-state.camera;if(sx>-20&&sx<W+20){rect(sx-8,201,16,17,'#544937');rect(sx-5,194,10,8,'#aa8d4e');rect(sx-2,186,4,8,'#ead27d');if(Math.abs(player.x-x)<26){ctx.fillStyle='#e5cc83';ctx.font='7px monospace';ctx.fillText('U · SHRINE',sx-22,180)}}}
    for(const d of drops){if(d.type==='gone')continue;let x=d.x-state.camera;rect(x-3,d.y-3,6,6,d.type==='meat'?'#b76648':'#e0be68');if(d.type==='meat')rect(x-1,d.y-4,3,2,'#e2a07b')}
    enemies.forEach(e=>{if(!e.dead&&e.zone===state.zone)drawEnemy(e)});bosses.forEach(b=>{if(!b.dead&&b.zone===state.zone)drawBoss(b)});for(const p of particles){ctx.globalAlpha=clamp(p.life/18,0,1);rect(p.x-state.camera,p.y,2,2,p.color)}ctx.globalAlpha=1;drawPlayer();
    // soft foreground blades
    for(let i=-1;i<20;i++){let x=i*31-(state.camera*.9%31);rect(x,214,2,8,'#566149');rect(x-2,214,2,5,'#65734e')};ctx.restore();
    if(state.dead||state.won){ctx.fillStyle='#071011aa';ctx.fillRect(0,0,W,H)}
  }
  function showEnd(title,sub){const panel=$('modal');panel.classList.remove('hidden');panel.innerHTML=`<div class="modal-card"><div class="eyebrow">${state.won?'THE ROOKERY IS QUIET':'A ROOKERY TALE'}</div><h1 style="font-size:30px">${title}</h1><p class="intro">${sub}</p><p class="small-note">Scrap gathered · ${state.scrap} &nbsp; Foes felled · ${state.kills}</p><button id="restart-button" class="primary-button">FLY AGAIN ↗</button></div>`;document.getElementById('restart-button').onclick=()=>location.reload()}
  function checkBossDeaths(){for(const b of bosses){if(b.hp<=0&&!b.rewarded){b.dead=true;b.rewarded=true;state.scrap+=5;state.sigils=Math.min(3,state.sigils+1);if(b.zone<3){state.gateOpen[b.zone]=true;notify('GUARDIAN FALLEN · SIGIL CLAIMED');if(b.zone===0)state.superUnlocked=true;setObjective('The gate is open. Press on.')}else{state.won=true;showEnd('THE ROOKERY IS YOURS','The white blade falls. The rookery sings again.')}}}}
  const oldUpdate=update;
  function loop(){if(!state.started)return;oldUpdate();checkBossDeaths();draw();requestAnimationFrame(loop)}
  // Boss damage is routed through the same melee resolver; award sigils immediately after each defeat.
  const originalHitTarget=hitTarget;
  // Keep the first view alive behind the title screen.
  draw();updateHud();
})();
