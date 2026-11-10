// Huddle home page: the motion (Issue #61).
//
// This script only adds motion. Every word on the page is already in the HTML, so with no JavaScript, with a
// script that fails, or with prefers-reduced-motion: reduce, the page is a normal readable document: nothing is
// pinned, nothing moves, nothing is typed. It writes no copy; it moves, fades and reveals what is already there.
//
// Needs the globals gsap, ScrollTrigger and Lenis from site/vendor/ (loaded with defer before this module).
// Only transform and opacity are animated (the typing is a transform too: a mask that slides off the text).

const REDUCE = '(prefers-reduced-motion: reduce)';
const root = document.documentElement;
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

// ---------- Copy button: works for everyone, with or without motion ----------

function legacyCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '-9999px';
  document.body.append(area);
  area.select();
  let done = false;
  try { done = document.execCommand('copy'); } catch { done = false; }
  area.remove();
  return done;
}

function setupCopy() {
  const button = $('[data-copy]');
  const status = $('[data-status]');
  if (!button || !status) return;
  // The real text of the two commands, without the decorative "$ " prompt.
  const text = $$('.tl')
    .map((line) => Array.from(line.childNodes).filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(''))
    .join('\n');
  button.hidden = false;
  let timer;
  button.addEventListener('click', async () => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = legacyCopy(text);
    }
    status.textContent = '';
    // Set the live region on the next frame so a second click is announced again.
    requestAnimationFrame(() => {
      if (ok) {
        button.textContent = 'Copied';
        status.textContent = 'Copied';
      } else {
        button.textContent = 'Could not copy';
        status.textContent = 'Could not copy';
      }
    });
    clearTimeout(timer);
    timer = setTimeout(() => { button.textContent = 'Copy'; }, 2200);
  });
}

// ---------- Motion ----------

function setupMotion() {
  const { gsap, ScrollTrigger, Lenis } = window;
  if (!gsap || !ScrollTrigger) return; // vendor files missing: the page stays static, and complete
  gsap.registerPlugin(ScrollTrigger);

  const mm = gsap.matchMedia();
  mm.add(
    {
      desktop: '(min-width: 48em) and (prefers-reduced-motion: no-preference)',
      phone: '(max-width: 47.99em) and (prefers-reduced-motion: no-preference)',
      fine: '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    },
    (context) => {
      const { desktop, phone, fine } = context.conditions;
      if (!desktop && !phone) return undefined;
      const undo = [];
      const addClass = (name) => { root.classList.add(name); undo.push(() => root.classList.remove(name)); };

      // One quiet rule for will-change: only the scene on screen has it (CSS: .is-active ...).
      $$('[data-scene]').forEach((scene) => {
        ScrollTrigger.create({ trigger: scene, start: 'top bottom', end: 'bottom top', toggleClass: { targets: scene, className: 'is-active' } });
      });

      if (desktop && typeof Lenis === 'function') {
        const lenis = new Lenis({ lerp: 0.1, anchors: true });
        lenis.on('scroll', ScrollTrigger.update);
        const tick = (time) => lenis.raf(time * 1000);
        gsap.ticker.add(tick);
        gsap.ticker.lagSmoothing(0);
        undo.push(() => { gsap.ticker.remove(tick); lenis.destroy(); });
      }

      heroScene(gsap, { desktop, fine });
      problemScene(gsap, { phone });
      flowScene(gsap, { phone, addClass });
      stepsScene(gsap, { desktop, phone, addClass });
      rolesScene(gsap, { desktop, phone });
      platformsScene(gsap, { phone });
      installScene(gsap);
      faqScene(gsap, ScrollTrigger);

      return () => undo.forEach((fn) => fn());
    },
  );

  // Fonts change the height of the text; measure again once they are in.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
}

// 1. Hero: the layers sit at different depths; the further back, the slower they leave. On desktop with a mouse,
// the same layers also lean a little toward the pointer. (The words and the buttons come in by CSS alone.)
function heroScene(gsap, { desktop, fine }) {
  const hero = $('.hero');
  if (!hero) return;
  const layers = $$('.layer', hero);
  layers.forEach((layer) => {
    const lag = Number(layer.dataset.depth) || 0.2;
    gsap.to(layer, {
      y: () => hero.offsetHeight * lag,
      ease: 'none',
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
    });
  });
  gsap.to($('.hero-copy', hero), {
    y: () => -hero.offsetHeight * 0.08,
    ease: 'none',
    scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
  });

  if (!desktop) return;
  // The cards float on their own while the hero is on screen.
  const floaters = $$('.float-card, .hero-orb', hero).map((el, i) =>
    gsap.to(el, { y: i % 2 ? 9 : -9, duration: 2.6 + i * 0.35, ease: 'sine.inOut', yoyo: true, repeat: -1, paused: true }),
  );
  window.ScrollTrigger.create({
    trigger: hero,
    start: 'top bottom',
    end: 'bottom top',
    onToggle: (self) => floaters.forEach((tween) => tween.paused(!self.isActive)),
  });

  if (!fine) return;
  const movers = layers.map((layer) => ({
    to: gsap.quickTo(layer, 'x', { duration: 0.9, ease: 'power3.out' }),
    reach: (0.7 - (Number(layer.dataset.depth) || 0.2)) * 46,
  }));
  const onMove = (event) => {
    const side = event.clientX / window.innerWidth - 0.5;
    movers.forEach((m) => m.to(-side * m.reach));
  };
  hero.addEventListener('pointermove', onMove);
}

// 2. The problem: five sessions drift apart and collide, then snap into one Issue and one branch each.
function problemScene(gsap, { phone }) {
  const area = $('.orbs');
  if (!area) return;
  const orbs = $$('.orb', area);
  const clashes = $$('.clash', area);
  const step = (orbs[1].offsetLeft - orbs[0].offsetLeft) || 120;
  const k = phone ? 0.5 : 1;
  const dx = [0.95, -0.85, 0.35, 0.85, -0.95];
  const dy = [-62, 54, -84, 58, -48];
  const spin = [-14, 12, -9, 16, -11];
  const tl = gsap.timeline({
    defaults: { ease: 'power2.out' },
    scrollTrigger: { trigger: area, start: 'top 92%', end: 'top 28%', scrub: 0.6 },
  });
  orbs.forEach((orb, i) => tl.to(orb, { x: dx[i] * step * k, y: dy[i] * k, rotation: spin[i], duration: 1 }, 0));
  tl.to(clashes, { autoAlpha: 1, scale: 1, duration: 0.25, stagger: 0.12 }, 0.8);
  tl.to(orbs, { x: 0, y: 0, rotation: 0, duration: 1, ease: 'back.out(1.6)', stagger: 0.05 }, 1.5);
  tl.to(clashes, { autoAlpha: 0, duration: 0.2 }, 1.45);
}

// 3. The label flow, pinned: one Issue card travels the road, the labels light up as it passes, and it takes both
// side roads. On a phone only the diagram is pinned, and for a shorter stretch.
function flowScene(gsap, { phone, addClass }) {
  const board = $('#flow');
  if (!board) return;
  const svg = $(phone ? '.flow .tall' : '.flow .wide', board);
  if (!svg) return;

  const P = phone
    ? { ready: [30, 36], assigned: [30, 112], progress: [30, 188], review: [30, 392], merged: [30, 538], decision: [292, 244], changes: [318, 448] }
    : { ready: [100, 120], assigned: [320, 120], progress: [540, 120], review: [760, 120], merged: [940, 120], decision: [430, 196], changes: [775, 196] };
  const card = $('.f-card', svg);
  const stops = $$('.f-stop', svg);
  const rings = $$('.f-ring', svg);
  const sideA = $('.f-side-a', svg);
  const sideB = $('.f-side-b', svg);
  const lit = $('.f-line-lit', svg);
  const bubbleQ = $('.f-q', svg);
  const bubbleA = $('.f-a', svg);
  const bubbleC = $('.f-c', svg);
  if (!card || stops.length !== 5) return;

  addClass(phone ? 'fx-flow-phone' : 'fx-flow');

  // Start of the story: the card is at "ready", every other stop and both side roads are dim, no bubble is shown.
  const at = ([x, y]) => ({ x, y });
  gsap.set(card, at(P.ready));
  gsap.set(stops, { opacity: 0.3 });
  gsap.set([sideA, sideB], { opacity: 0.25 });
  gsap.set([bubbleQ, bubbleA, bubbleC], { opacity: 0 });
  if (rings.length) gsap.set(rings, { opacity: 0, scale: 0.6, transformOrigin: '50% 50%' });
  if (lit) gsap.set(lit, { scaleX: 0 });

  const tl = gsap.timeline({ defaults: { ease: 'power2.inOut' } });
  const light = (index, time) => {
    tl.to(stops[index], { opacity: 1, duration: 0.4 }, time);
    if (rings[index]) tl.to(rings[index], { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(2)' }, time);
  };
  const dim = (index, time) => { if (rings[index]) tl.to(rings[index], { opacity: 0, duration: 0.3 }, time); };
  const travel = (to, duration, time) => tl.to(card, { ...at(to), duration }, time);
  const progressTo = (index, time, duration) => {
    if (!lit) return;
    const [x0] = P.ready;
    const [x1] = P.merged;
    tl.to(lit, { scaleX: (P[['ready', 'assigned', 'progress', 'review', 'merged'][index]][0] - x0) / (x1 - x0), duration, ease: 'power2.inOut' }, time);
  };

  light(0, 0);
  tl.addLabel('toAssigned', 0.6);
  travel(P.assigned, 1, 'toAssigned'); progressTo(1, 'toAssigned', 1); light(1, 'toAssigned+=0.8'); dim(0, 'toAssigned+=0.8');
  tl.addLabel('toProgress', 2);
  travel(P.progress, 1, 'toProgress'); progressTo(2, 'toProgress', 1); light(2, 'toProgress+=0.8'); dim(1, 'toProgress+=0.8');

  // Side road 1: needs decision. The card stops, a question appears, the AI Manager answers, it goes on.
  tl.addLabel('ask', 3.4);
  tl.to(sideA, { opacity: 1, duration: 0.3 }, 'ask');
  travel(P.decision, 0.9, 'ask');
  tl.to(bubbleQ, { opacity: 1, duration: 0.4 }, 'ask+=1');
  tl.to(bubbleA, { opacity: 1, duration: 0.4 }, 'ask+=2');
  travel(P.progress, 0.9, 'ask+=3.1');
  tl.to([bubbleQ, bubbleA], { opacity: 0, duration: 0.3 }, 'ask+=3.3');
  tl.to(sideA, { opacity: 0.25, duration: 0.3 }, 'ask+=3.6');

  tl.addLabel('toReview', 7.2);
  travel(P.review, 1, 'toReview'); progressTo(3, 'toReview', 1); light(3, 'toReview+=0.8'); dim(2, 'toReview+=0.8');

  // Side road 2: changes requested. Back to in progress, then to in review again.
  tl.addLabel('changes', 8.6);
  tl.to(sideB, { opacity: 1, duration: 0.3 }, 'changes');
  travel(P.changes, 0.9, 'changes');
  tl.to(bubbleC, { opacity: 1, duration: 0.4 }, 'changes+=1');
  travel(P.progress, 1.3, 'changes+=2');
  if (rings[2]) tl.to(rings[2], { opacity: 1, duration: 0.3 }, 'changes+=3.1');
  tl.to(bubbleC, { opacity: 0, duration: 0.3 }, 'changes+=2.2');
  tl.to(sideB, { opacity: 0.25, duration: 0.3 }, 'changes+=2.6');
  tl.addLabel('again', 12);
  travel(P.review, 1, 'again');
  dim(2, 'again+=0.8');

  tl.addLabel('toMerged', 13.4);
  travel(P.merged, 1, 'toMerged'); progressTo(4, 'toMerged', 1); light(4, 'toMerged+=0.8'); dim(3, 'toMerged+=0.8');
  tl.to({}, { duration: 1 }); // a short hold on the last stop

  const length = () => window.innerHeight * (phone ? 2.2 : 3.6);
  window.ScrollTrigger.create({
    trigger: phone ? $('.flow', board) : board,
    start: phone ? 'center center' : 'top top',
    end: () => `+=${length()}`,
    pin: true,
    scrub: 0.5,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    animation: tl,
  });
}

// 4. Four steps: sideways inside a pinned scene on wide screens; a vertical list with reveals on a phone.
function stepsScene(gsap, { desktop, phone, addClass }) {
  const section = $('#steps');
  const track = $('.steps', section);
  const pin = $('.hpin', section);
  if (!section || !track || !pin) return;

  if (phone) {
    gsap.from($$('li', track), {
      opacity: 0,
      y: 28,
      duration: 0.6,
      ease: 'power2.out',
      stagger: 0.12,
      scrollTrigger: { trigger: track, start: 'top 82%', once: true },
    });
    return;
  }
  if (!desktop) return;

  addClass('fx-h');
  const bar = $('.progress i', section);
  const distance = () => Math.max(0, track.scrollWidth - document.documentElement.clientWidth);
  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: { trigger: pin, start: 'top top', end: () => `+=${distance()}`, pin: true, scrub: 0.5, anticipatePin: 1, invalidateOnRefresh: true },
  });
  tl.to(track, { x: () => -distance(), duration: 1 }, 0);
  if (bar) tl.to(bar, { scaleX: 1, duration: 1 }, 0);
}

// 5. Two roles: the two sides slide in from opposite sides and then pass each other, one up and one down.
function rolesScene(gsap, { desktop, phone }) {
  const split = $('#roles .split');
  if (!split) return;
  const manager = $('.role-manager', split);
  const dev = $('.role-dev', split);
  if (phone) {
    gsap.from([manager, dev], {
      opacity: 0,
      y: 26,
      duration: 0.6,
      ease: 'power2.out',
      stagger: 0.15,
      scrollTrigger: { trigger: split, start: 'top 82%', once: true },
    });
    return;
  }
  if (!desktop) return;
  const scrollTrigger = { trigger: split, start: 'top bottom', end: 'bottom top', scrub: true };
  gsap.fromTo(manager, { x: -60, y: 80 }, { x: 0, y: -70, ease: 'none', scrollTrigger });
  gsap.fromTo(dev, { x: 60, y: -50 }, { x: 0, y: 70, ease: 'none', scrollTrigger });
}

// 6. GitHub and GitLab slide together and meet in the line "the same commands everywhere".
function platformsScene(gsap, { phone }) {
  const area = $('.merge');
  if (!area) return;
  const [github, gitlab] = $$('.mark', area);
  const same = $('.same', area);
  const scrollTrigger = { trigger: area, start: 'top 90%', end: 'top 45%', scrub: 0.6 };
  if (phone) {
    gsap.from([github, same, gitlab], { opacity: 0, y: 20, duration: 0.5, stagger: 0.12, scrollTrigger: { trigger: area, start: 'top 85%', once: true } });
    return;
  }
  const tl = gsap.timeline({ defaults: { ease: 'power2.out' }, scrollTrigger });
  tl.from(github, { x: -140, opacity: 0.2, duration: 1 }, 0);
  tl.from(gitlab, { x: 140, opacity: 0.2, duration: 1 }, 0);
  tl.from(same, { scale: 0.7, opacity: 0, duration: 0.6 }, 0.5);
}

// 7. Install: the terminal types its two commands when it comes into view. The text is already in the HTML; a mask
// that sits on each line slides away from left to right, one character at a time.
function installScene(gsap) {
  const terminal = $('.terminal');
  if (!terminal) return;
  const lines = $$('.tl', terminal);
  const masks = lines.map((line) => $('.tl-mask', line));
  gsap.set(masks, { scaleX: 1 });
  const tl = gsap.timeline({ paused: true });
  lines.forEach((line, i) => {
    const chars = Array.from(line.childNodes).filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').length;
    tl.to(masks[i], { scaleX: 0, duration: chars * 0.032, ease: `steps(${chars})` }, i === 0 ? 0 : '>+=0.35');
  });
  window.ScrollTrigger.create({ trigger: terminal, start: 'top 80%', once: true, onEnter: () => tl.play() });
}

// 8. FAQ and the final call: simple reveals.
function faqScene(gsap, ScrollTrigger) {
  const items = $$('#faq details');
  const final = $('#faq .final');
  if (items.length) {
    gsap.from(items, { opacity: 0, y: 22, duration: 0.5, ease: 'power2.out', stagger: 0.07, scrollTrigger: { trigger: items[0], start: 'top 88%', once: true } });
  }
  if (final) {
    gsap.from(Array.from(final.children), { opacity: 0, y: 30, duration: 0.7, ease: 'power3.out', stagger: 0.12, scrollTrigger: { trigger: final, start: 'top 80%', once: true } });
  }
  ScrollTrigger.refresh();
}

setupCopy();
if (window.matchMedia(REDUCE).matches) {
  root.classList.add('is-static'); // nothing moves: the page is the plain document
} else {
  setupMotion();
}
