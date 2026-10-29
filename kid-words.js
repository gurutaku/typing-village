(async () => {
  'use strict';
  let wordData = null;
  try {
    const response = await fetch('./kid-words.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Vocabulary JSON request failed');
    wordData = await response.json();
  } catch (_) {
    // file:// pages cannot fetch JSON in many browsers; use the synchronized JS fallback.
    wordData = window.VILLAGE_WORD_DATA || null;
  }
  const $ = (id) => document.getElementById(id);
  const views = { home: $('homeView'), game: $('gameView'), results: $('resultsView') };
  const playfield = $('playfield');
  const typingInput = $('typingInput');
  const overlay = $('overlay');
  const appRoot = $('appRoot');
  const touchKeyboard = $('touchKeyboard');
  const deviceKeyboardBtn = $('deviceKeyboardBtn');
  const touchCapable = (navigator.maxTouchPoints || 0) > 0 || ('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  let useDeviceKeyboard = true;
  let typingAdjustFrame = 0;

  function keepTypingAreaVisible() {
    if (!typingInput || document.activeElement !== typingInput) return;
    if (typingAdjustFrame) cancelAnimationFrame(typingAdjustFrame);

    typingAdjustFrame = requestAnimationFrame(() => {
      typingAdjustFrame = 0;

      const viewport = window.visualViewport;
      const rect = typingInput.getBoundingClientRect();
      const visibleBottom = viewport
        ? viewport.offsetTop + viewport.height
        : window.innerHeight;

      // Only scroll if the textbox is clearly covered.
      const overflow = rect.bottom - (visibleBottom - 12);

      if (overflow > 24) {
        window.scrollBy({
          top: overflow,
          behavior: 'auto'
        });
      }
    });
  }

  // Adjust when the keyboard opens or the textbox receives focus.
  // Do not listen to visualViewport's scroll event.
  if (window.visualViewport) {
    window.visualViewport.addEventListener(
      'resize',
      keepTypingAreaVisible
    );
  }

  typingInput.addEventListener('focus', keepTypingAreaVisible);
  function updateInputMode() {
    const useTouchKeys = touchCapable && !useDeviceKeyboard;
    typingInput.readOnly = useTouchKeys;
    touchKeyboard.classList.toggle('active', useTouchKeys);
    deviceKeyboardBtn.hidden = !touchCapable;
    deviceKeyboardBtn.textContent = useTouchKeys ? 'Use device keyboard' : 'Use touch keys';
    const spaceKey = touchKeyboard.querySelector('[data-vkey="space"]');
    if (spaceKey) spaceKey.disabled = state.mode !== 'phrase';
    const mobileFullscreen = useTouchKeys && views.game.classList.contains('active');
    appRoot.classList.toggle('mobile-game-active', mobileFullscreen);
    document.body.classList.toggle('mobile-game-active', mobileFullscreen);
  }
  const modeConfig = {
    letter: { name:'Snowballville', icon:'❄️', subtitle:'Type the letter to pop the snowball.', kind:'letter', baseSpeed:21, spawnMs:1600, points:10, maxThreats:7,
      words: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('') },
    word: { name:'War Zone', icon:'🚀', subtitle:'Type a short word to reroute the rocket.', kind:'word', baseSpeed:19, spawnMs:2050, points:25, maxThreats:5 },
    phrase: { name:'Planet Crisis', icon:'🛸', subtitle:'Type one of 100 silly phrases from the kid word bank.', kind:'phrase', baseSpeed:17, spawnMs:2550, points:50, maxThreats:4 },
  };
  const state = {
    mode:null, running:false, paused:false, ended:false, threats:[], nextId:1,
    score:0, saved:0, misses:0, lives:3, streak:0, bestStreak:0, stars:0,
    typed:'', lockedId:null, elapsed:0, spawnElapsed:0, lastTime:0, raf:0,
    sound:true, audio:null, toastTimer:0, lastLane:null, modeStartTime:0, phraseDeck:[], lastPhrase:''
  };
  const bestKey = (mode) => `villageTypingBest_${mode}`;
  function getBest(mode) { try { return Number(localStorage.getItem(bestKey(mode)) || 0); } catch (_) { return 0; } }
  function setBest(mode, score) { try { localStorage.setItem(bestKey(mode), String(Math.max(getBest(mode), score))); } catch (_) {} }
  function renderBests() { for (const m of Object.keys(modeConfig)) { const el = $(`best-${m}`); if (el) el.textContent = `Best: ${getBest(m)}`; } }
  renderBests();

  function showView(which) {
    Object.entries(views).forEach(([k, el]) => el.classList.toggle('active', k === which));
    $('homeBtn').hidden = which === 'home';
    updateInputMode();
    if (!appRoot.classList.contains('mobile-game-active')) window.scrollTo({top:0,behavior:'auto'});
  }
  function initAudio() {
    if (!state.audio) {
      try { state.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { state.audio = null; }
    }
    if (state.audio && state.audio.state === 'suspended') state.audio.resume().catch(()=>{});
  }
  function tone(freq, at, duration, type, volume, endFreq) {
    if (!state.sound || !state.audio) return;
    const ctx = state.audio; const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = type || 'sine'; osc.frequency.setValueAtTime(freq, at);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(25,endFreq), at + duration);
    gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(volume || 0.08, at + Math.min(.018,duration*.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(at); osc.stop(at + duration + .03);
  }
  function successSound() {
    initAudio(); if (!state.audio || !state.sound) return; const t=state.audio.currentTime;
    tone(520,t,.12,'sine',.08); tone(780,t+.07,.14,'triangle',.075); tone(1040,t+.14,.21,'sine',.07);
  }
  function missSound() {
    initAudio(); if (!state.audio || !state.sound) return; const t=state.audio.currentTime;
    tone(260,t,.18,'triangle',.095,115); tone(105,t+.06,.16,'sine',.05,65);
  }
  function errorSound() { initAudio(); if (!state.audio || !state.sound) return; tone(180,state.audio.currentTime,.07,'square',.025,135); }
  function setSound(on) {
    state.sound = on;
    const label = on ? '🔊 Sound on' : '🔇 Sound off';
    $('homeSoundBtn').textContent = label; $('homeSoundBtn').setAttribute('aria-pressed',String(on));
    $('soundBtn').textContent = on ? '🔊 Sound' : '🔇 Sound';
  }
  function setOverlay(title, text, emoji, buttonText, callback) {
    $('overlayTitle').textContent=title; $('overlayText').textContent=text; $('overlayEmoji').textContent=emoji; $('overlayBtn').textContent=buttonText;
    $('overlayBtn').onclick=callback; overlay.classList.remove('hidden'); appRoot.classList.add('overlay-open');
  }
  function hideOverlay() { overlay.classList.add('hidden'); appRoot.classList.remove('overlay-open'); }
  function clearThreatElements() { state.threats.forEach(t=>t.el.remove()); state.threats=[]; }
  function startMode(mode) {
    if (mode!=='letter' && (!wordData || !Array.isArray(wordData.words) || wordData.words.length!==2000 || !wordData.parts || (mode==='phrase' && (!Array.isArray(wordData.phrases) || wordData.phrases.length!==100)))) {
      alert('The external kid-words.json data file is missing or incomplete. Keep kid-words.json next to index.html and try again.'); return;
    }
    initAudio();
    state.mode = mode; state.running=false; state.paused=false; state.ended=false;
    state.score=0; state.saved=0; state.misses=0; state.lives=3; state.streak=0; state.bestStreak=0; state.stars=0;
    state.typed=''; state.lockedId=null; state.elapsed=0; state.spawnElapsed=0; state.lastTime=0; state.lastLane=null; state.phraseDeck=[]; state.lastPhrase=''; state.modeStartTime=performance.now();
    clearThreatElements(); typingInput.value='';
    const cfg=modeConfig[mode];
    $('missionIcon').textContent=cfg.icon; $('missionTitle').textContent=cfg.name; $('missionSubtitle').textContent=cfg.subtitle; $('pauseBtn').textContent='Ⅱ Pause';
    $('typeHelp').textContent = mode==='letter' ? 'Type any letter on a snowball. One key = one save.' : mode==='word' ? 'Type the whole word shown on a rocket. If you mistype, only the wrong key is ignored—your correct letters stay.' : 'Type the whole silly phrase, including spaces. If you mistype, only the wrong key is ignored—your correct letters stay.';
    $('paceText').textContent='Chill'; $('paceFill').style.width='0%'; $('nextReward').textContent='Next star: save 5 threats ⭐';
    updateHud(); showView('game');
    setOverlay('Ready, defender?', 'Type the characters on the falling targets. Keep them away from the village floor — each miss costs one shield.', cfg.icon, 'Start mission', beginRun);
  }
  function beginRun() {
    initAudio(); hideOverlay(); state.running=true; state.paused=false; state.lastTime=performance.now(); state.spawnElapsed=0;
    typingInput.value=''; state.typed=''; typingInput.placeholder=state.mode==='letter'?'Type a letter…':state.mode==='word'?'Type a rocket word…':'Type the UFO phrase…';
    typingInput.readOnly = false;typingInput.focus({ preventScroll: true });keepTypingAreaVisible(); state.raf=requestAnimationFrame(tick);
    spawnThreat();
  }
  function pauseGame() {
    if (!state.mode || state.ended) return;
    if (!state.paused) {
      state.paused=true; state.running=false; cancelAnimationFrame(state.raf);
      setOverlay('Mission paused', 'Take a breath. Your village and your progress are safe. Ready when you are!', '⏸️', 'Resume mission', () => {
        hideOverlay(); state.paused=false; state.running=true; state.lastTime=performance.now(); state.raf=requestAnimationFrame(tick); if (!typingInput.readOnly) typingInput.focus({preventScroll:true}); $('pauseBtn').textContent='Ⅱ Pause';
      });
      $('pauseBtn').textContent='▶ Resume';
    } else {
      state.paused=false; state.running=true; hideOverlay(); state.lastTime=performance.now(); state.raf=requestAnimationFrame(tick); if (!typingInput.readOnly) typingInput.focus({preventScroll:true}); $('pauseBtn').textContent='Ⅱ Pause';
    }
  }
  function quitToHome() {
    state.running=false;state.paused=false;state.ended=true;cancelAnimationFrame(state.raf);clearThreatElements();hideOverlay();
    state.mode=null;typingInput.value='';showView('home');renderBests();
  }
  const stopTargetWords = new Set(('the and for that with from this your our his her its was were are is be can will may did has had have you they she he we it one two all any not but who what when then now out off over into onto such than more less us me him').split(' '));
  const targetWordPool = wordData && Array.isArray(wordData.words) ? wordData.words
    .map(x=>typeof x==='string'?{word:x,freq:1}:x)
    .filter(x=>x && /^[a-z]{2,4}$/.test(x.word) && !stopTargetWords.has(x.word)) : [];
  function pickMissileWord() {
    if (!targetWordPool.length) return choose(['cat','dog','hop','star','tree','book','frog','play']);
    // Favor familiar words, while still sampling from the full external 2,000-word bank.
    let total=0; const weights=targetWordPool.map(x=>{const w=1+Math.pow(Math.max(1,Number(x.freq)||1),.45);total+=w;return w;});
    let r=Math.random()*total;
    for(let i=0;i<targetWordPool.length;i++){r-=weights[i];if(r<=0)return targetWordPool[i].word;}
    return targetWordPool[targetWordPool.length-1].word;
  }
  function pickPhrase() {
    const phrases = wordData && Array.isArray(wordData.phrases) ? wordData.phrases : [];
    if (!phrases.length) return 'the cat ate my hat';
    if (!state.phraseDeck.length) {
      state.phraseDeck = phrases.slice();
      for (let i = state.phraseDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.phraseDeck[i], state.phraseDeck[j]] = [state.phraseDeck[j], state.phraseDeck[i]];
      }
      // Avoid repeating the last phrase when a fresh shuffled deck begins.
      if (state.phraseDeck.length > 1 && state.phraseDeck[state.phraseDeck.length - 1] === state.lastPhrase) {
        [state.phraseDeck[0], state.phraseDeck[state.phraseDeck.length - 1]] = [state.phraseDeck[state.phraseDeck.length - 1], state.phraseDeck[0]];
      }
    }
    const phrase = state.phraseDeck.pop();
    state.lastPhrase = phrase;
    return phrase;
  }
  function getThreatLabel() {
    const cfg=modeConfig[state.mode];
    if (cfg.kind==='letter') return cfg.words[Math.floor(Math.random()*cfg.words.length)];
    if (cfg.kind==='word') return pickMissileWord();
    return pickPhrase();
  }
  function threatWidth(kind) {
    if (kind==='letter') return 66;
    if (kind==='word') return 154;
    const fieldWidth=playfield.clientWidth;
    // Narrow screens use noticeably smaller UFOs; tablets get a moderate size,
    // while desktop keeps the original larger targets.
    if (fieldWidth <= 420) return Math.min(168, Math.max(132, fieldWidth*.43));
    if (fieldWidth <= 520) return Math.min(182, Math.max(154, fieldWidth*.36));
    if (appRoot.classList.contains('mobile-game-active')) return Math.min(196, Math.max(170, fieldWidth*.26));
    return Math.min(242, Math.max(190, fieldWidth*.29));
  }
  function spawnThreat() {
    if (!state.running || !state.mode) return;
    const cfg=modeConfig[state.mode];
    if (state.threats.filter(t=>!t.dead).length >= cfg.maxThreats) return;
    const label=getThreatLabel(); const kind=cfg.kind; const w=threatWidth(kind);
    const margin=8, spawnY=-80;
    const spawnH=kind==='letter'?66:kind==='word'?51:(playfield.clientWidth<=520?60:68);
    const maxX=Math.max(margin,playfield.clientWidth-w-margin);
    // Search the full usable width and only spawn where the whole target has
    // clearance from existing threats. If no safe slot is available, skip this
    // spawn tick rather than drawing an overlapping UFO on small screens.
    const candidates=[];
    for (let i=0;i<70;i++) candidates.push(margin+Math.random()*Math.max(0,maxX-margin));
    for (let x=margin;x<=maxX;x+=6) candidates.push(x);
    candidates.push(maxX);
    let x=null;
    for (const candidate of candidates) {
      const overlaps=state.threats.some(t=>{
        if (t.dead) return false;
        const horizontalOverlap = candidate < t.x+t.w+12 && candidate+w+12 > t.x;
        const verticalOverlap = spawnY < t.y+t.h+10 && spawnY+spawnH+10 > t.y;
        return horizontalOverlap && verticalOverlap;
      });
      if (!overlaps) { x=candidate; break; }
    }
    if (x===null) return;
    x=Math.max(margin,Math.min(x,maxX));
    const el=document.createElement('div'); el.className=`threat ${kind}`; if (kind==='word' || kind==='phrase') el.style.width=`${w}px`; el.style.left=`${x}px`; el.style.top=`${spawnY}px`;
    const labelEl=document.createElement('span'); labelEl.className='label'; labelEl.textContent=label; el.appendChild(labelEl);
    el.setAttribute('aria-label', `${kind==='letter'?'Letter':kind==='word'?'Word':'Phrase'} target: ${label}`);
    playfield.appendChild(el);
    const threat={id:state.nextId++,label,kind,x:parseFloat(el.style.left),y:spawnY,w,h:kind==='letter'?66:kind==='word'?51:68,el,labelEl,dead:false};
    // Measure the wrapped phrase height so later spawn checks use its real bounds.
    threat.h=el.offsetHeight || threat.h;
    state.threats.push(threat);
    if (state.typed) refreshTargetHighlight();
  }
  function findTargetForPrefix(prefix) {
    if (!prefix) return null;
    const lower=prefix.toLowerCase();
    const candidates=state.threats.filter(t=>!t.dead && t.label.toLowerCase().startsWith(lower));
    if (!candidates.length) return null;
    candidates.sort((a,b)=>b.y-a.y); // prioritize the target closest to the floor
    return candidates[0];
  }
  function refreshTargetHighlight() {
    state.threats.forEach(t=>{
      t.el.classList.remove('targeted');
      if (t.dead) return;
      if (state.mode==='letter') return;
      if (t.id===state.lockedId && state.typed) {
        t.el.classList.add('targeted');
        const n=state.typed.length; const l=t.label;
        t.labelEl.innerHTML=`<span class="typed-prefix">${escapeHtml(l.slice(0,n))}</span>${escapeHtml(l.slice(n))}`;
      } else { t.labelEl.textContent=t.label; }
    });
  }
  function escapeHtml(s) { return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function burstAt(t, message) {
    const b=document.createElement('div');b.className='burst';b.textContent=message;
    b.style.left=`${t.x+t.w/2}px`;b.style.top=`${Math.max(20,t.y)}px`;playfield.appendChild(b);setTimeout(()=>b.remove(),900);
  }
  function showToast(text) {
    const toast=$('toast'); toast.textContent=text; toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show');
  }
  function neutralize(t) {
    if (!t || t.dead) return;
    const cfg=modeConfig[state.mode]; t.dead=true; t.el.classList.add('pop');
    const oldStreak=state.streak; state.saved++; state.streak++; state.bestStreak=Math.max(state.bestStreak,state.streak);
    let award=cfg.points; let message=`+${cfg.points} pts!`;
    if (state.saved%5===0) { state.stars++; award+=25; message=`⭐ Star earned! +${award} pts`; }
    if (state.streak%5===0) { award+=25; message=`🔥 ${state.streak}-hit streak! +${award} pts`; }
    state.score+=award; successSound(); burstAt(t,`+${award}`);
    if (state.saved%5===0 || state.streak%5===0) showToast(message); else showToast(`✨ Nice typing! +${award} points`);
    if (state.saved%5===0) showToast(`⭐ Star earned! ${state.stars} total`);
    state.typed='';state.lockedId=null;typingInput.value='';refreshTargetHighlight();updateHud();
    setTimeout(()=>{ if(t.el && t.el.isConnected) t.el.remove(); },260);
  }
  function handleTyping(raw) {
    if (!state.running || state.paused || state.ended || !state.mode) return;
    const cfg=modeConfig[state.mode];
    if (cfg.kind==='letter') {
      const letters=raw.toUpperCase().match(/[A-Z]/g); const letter=letters ? letters[letters.length-1] : '';
      typingInput.value='';state.typed='';state.lockedId=null;
      if (!letter) return;
      const candidates=state.threats.filter(t=>!t.dead && t.label.toUpperCase()===letter).sort((a,b)=>b.y-a.y);
      if (candidates.length) neutralize(candidates[0]); else errorSound();
      return;
    }
    const proposed=raw.slice(0,60);
    if (!proposed) { state.typed='';state.lockedId=null;typingInput.value='';refreshTargetHighlight();return; }
    let target=state.lockedId ? state.threats.find(t=>t.id===state.lockedId && !t.dead) : null;
    const proposedLower=proposed.toLowerCase();
    const previousTyped=state.typed;

    if (target) {
      const targetLower=target.label.toLowerCase();
      if (targetLower.startsWith(proposedLower)) {
        // Correct typing or Backspace: keep the valid prefix as the player's progress.
        state.typed=proposed;
      } else if (proposedLower.startsWith(previousTyped.toLowerCase()) && proposed.length>previousTyped.length) {
        // A typo was appended. Reject only the new incorrect input, not the correct prefix.
        // The player can immediately type the right next character without starting over.
        typingInput.value=state.typed;
        errorSound();
        return;
      } else {
        // If the player edited/replaced the existing text, allow a new target match.
        target=findTargetForPrefix(proposed);
        if (!target) {
          typingInput.value=state.typed;
          errorSound();
          return;
        }
        state.typed=proposed;
        state.lockedId=target.id;
      }
    } else {
      target=findTargetForPrefix(proposed);
      if (!target) {
        // There is no valid target for this first character; ignore it and stay ready.
        typingInput.value='';state.typed='';state.lockedId=null;
        errorSound();refreshTargetHighlight();return;
      }
      state.typed=proposed;state.lockedId=target.id;
    }
    if (target) state.lockedId=target.id;
    refreshTargetHighlight();
    if (target && proposedLower===target.label.toLowerCase()) neutralize(target);
  }
  function updateHud() {
    $('scoreVal').textContent=state.score.toLocaleString(); $('savedVal').textContent=state.saved;
    $('streakVal').textContent=`${state.streak} 🔥`; $('starsVal').textContent=`${state.stars} ⭐`;
    $('livesVal').textContent='🛡️'.repeat(state.lives)+'♡'.repeat(3-state.lives);
    const speed=state.mode ? modeConfig[state.mode].baseSpeed+Math.min(state.saved*1.35,42) : 0;
    const pct=Math.min(100,Math.round((speed-15)/55*100));$('paceFill').style.width=`${pct}%`;
    $('paceText').textContent= speed<30?'Chill':speed<42?'Warming up':speed<56?'Zooming!':'Lightning!';
    const toStar=5-(state.saved%5);$('nextReward').textContent=state.saved>0 && state.saved%5===0 ? `Star earned! ${state.stars} total ⭐` : `Next star: save ${toStar} more ⭐`;
  }
  function missThreat(t) {
    if (t.dead) return;
    // Only clear typing progress if the threat the player is working on is the one
    // that reached the floor. Another missed threat must not erase their current word/phrase.
    const wasActiveTypingTarget = state.lockedId === t.id;
    t.dead=true; t.el.remove(); state.misses++;state.lives=Math.max(0,state.lives-1);state.streak=0;
    if (wasActiveTypingTarget) {
      state.typed='';
      state.lockedId=null;
      typingInput.value='';
    }
    missSound();showToast('💨 Missed! One village shield lost');updateHud();refreshTargetHighlight();
    if (state.lives<=0) endGame(false);
  }
  function tick(now) {
    if (!state.running || state.paused || state.ended) return;
    const dt=Math.min(.05,Math.max(0,(now-state.lastTime)/1000)); state.lastTime=now;state.elapsed+=dt;state.spawnElapsed+=dt*1000;
    const cfg=modeConfig[state.mode]; const speed=cfg.baseSpeed+Math.min(state.saved*1.35,42);
    for (const t of [...state.threats]) {
      if (t.dead) continue;
      t.y += speed*dt; t.el.style.top=`${t.y}px`;
      const floorLine=playfield.clientHeight-68-t.h*.35;
      if (t.y>=floorLine) missThreat(t);
      if (state.ended) break;
    }
    const spawnInterval=Math.max(cfg.spawnMs*.52,cfg.spawnMs-state.saved*22);
    if (state.spawnElapsed>=spawnInterval) { state.spawnElapsed=0;spawnThreat(); }
    if (state.running) state.raf=requestAnimationFrame(tick);
  }
  function endGame(won) {
    state.running=false;state.paused=false;state.ended=true;cancelAnimationFrame(state.raf);clearThreatElements();
    if (state.mode) setBest(state.mode,state.score);renderBests();
    const total=state.saved+state.misses;const rate=total?Math.round(state.saved/total*100):100;
    $('resultScore').textContent=state.score.toLocaleString();$('resultSaved').textContent=state.saved;$('resultAccuracy').textContent=`${rate}%`;$('resultStars').textContent=`${state.stars} ⭐`;
    const rank=state.saved>=25?'Cosmic Defender':state.saved>=15?'Phrase Guardian':state.saved>=10?'Word Wizard':state.saved>=5?'Village Hero':'Village Helper';
    $('resultsTitle').textContent=state.lives===0?'The village needs a recharge!':'Mission complete!';
    $('resultMedal').textContent=state.saved>=20?'🏆':state.saved>=10?'🥇':state.saved>=5?'🥈':'🌟';
    $('resultsCopy').textContent=`You neutralized ${state.saved} ${state.saved===1?'threat':'threats'} and earned ${state.score.toLocaleString()} points in ${modeConfig[state.mode].name}. ${rank} rank achieved!`;
    const cheer=state.saved>=15?'Incredible typing! Your focus and rhythm are getting strong.':state.saved>=8?'Great work! Notice how much faster you got as you saved more targets.':state.saved>=3?'Nice effort! Try again and see whether you can beat your best score.':'Every round is practice. Aim for a steady rhythm, and you will improve!';
    $('encouragement').textContent=cheer;
    $('againBtn').textContent='Play this mission again';
    showView('results');
  }

  $('typingInput').addEventListener('input',()=>{handleTyping(typingInput.value);});
  function pressVirtualKey(key) {
    if (!state.running || state.paused || state.ended || !state.mode) return;
    if (key === 'space') {
      if (state.mode !== 'phrase') return;
      typingInput.value = state.typed + ' ';
      handleTyping(typingInput.value);
      return;
    }
    if (key === 'backspace') {
      if (state.mode === 'letter') return;
      typingInput.value = state.typed.slice(0, -1);
      handleTyping(typingInput.value);
      return;
    }
    if (key === 'clear') {
      typingInput.value = ''; state.typed = ''; state.lockedId = null; refreshTargetHighlight();
      return;
    }
    if (/^[a-z]$/.test(key)) {
      typingInput.value = state.mode === 'letter' ? key : state.typed + key;
      handleTyping(typingInput.value);
    }
  }
  // Guard against browser text selection, long-press menus, and drag selection on mobile key labels.
  ['selectstart', 'contextmenu', 'dragstart'].forEach(type => {
    touchKeyboard.addEventListener(type, event => event.preventDefault());
  });
  touchKeyboard.querySelectorAll('[data-vkey]').forEach(btn => {
    btn.addEventListener('click', () => pressVirtualKey(btn.dataset.vkey));
  });
  deviceKeyboardBtn.addEventListener('click', () => {
    useDeviceKeyboard = !useDeviceKeyboard;
    updateInputMode();
    if (useDeviceKeyboard) {
      typingInput.focus({preventScroll:true});
    } else {
      typingInput.blur();
    }
  });
  updateInputMode();
  // Reset on explicit backspace/escape even if some device keyboards do not emit an input event for a clearing action.
  typingInput.addEventListener('keydown',(e)=>{
    if (e.key==='Escape') { e.preventDefault();typingInput.value='';state.typed='';state.lockedId=null;refreshTargetHighlight(); }
  });
  playfield.addEventListener('pointerdown',(e)=>{ if (state.running && !e.target.closest('button')) typingInput.focus({preventScroll:true}); });
  $('homeSoundBtn').addEventListener('click',()=>{setSound(!state.sound);if(state.sound)initAudio();});
  $('soundBtn').addEventListener('click',()=>{setSound(!state.sound);if(state.sound)initAudio();});
  $('homeBtn').addEventListener('click',quitToHome);
  $('pauseBtn').addEventListener('click',pauseGame);
  $('quitBtn').addEventListener('click',quitToHome);
  $('resultHomeBtn').addEventListener('click',quitToHome);
  $('againBtn').addEventListener('click',()=>startMode(state.mode));
  document.querySelectorAll('[data-mode]').forEach(btn=>btn.addEventListener('click',()=>startMode(btn.dataset.mode)));
  document.addEventListener('visibilitychange',()=>{ if(document.hidden && state.running) pauseGame(); });
  window.addEventListener('resize', () => {
    if (!playfield.clientWidth) return;
    state.threats.forEach(t => {
      if (t.dead) return;
      t.x = Math.max(5, Math.min(t.x, playfield.clientWidth - t.w - 5));
      t.el.style.left = `${t.x}px`;
    });
  }, {passive:true});
  setSound(true);
})();
