// Projectile Editor — the popup of the rpg_battler Projectiles tab: a def's fields grouped by what
// they drive, beside a to-scale battle that plays the def the way the battler does. The layout and
// the flight maths come from rpg-vfx-geometry.mjs (the module the battle itself imports) and the
// sprites wear rpg-vfx.css's classes, so what plays here is what plays in a fight: the party along
// the bottom, seen from behind, the enemies above.
// @ts-ignore — editor globals are not typed
const { ref, reactive, computed, watch, onMounted, onBeforeUnmount, defineComponent } = window.__editorVue;
// @ts-ignore
const { editor, FormFieldRenderer, EditorCharacterPreview, importPluginModule, readJson } = window.__editorUtils;

const GROUPS = [
  { id: 'def', title: 'Definition', keys: ['id', 'name', 'caster_animation'] },
  {
    id: 'travel', title: 'Travel',
    hint: 'The sprite that flies from the caster to each target. Without one the effect appears on the target.',
    keys: ['travel_image', 'travel_type', 'travel_frames', 'travel_fps', 'travel_cols', 'travel_size', 'speed', 'arc', 'starting_rotation'],
  },
  {
    id: 'hit', title: 'Impact',
    hint: 'What plays on the target: where the sprite lands, where a melee lunge connects, or at once for an impact-only effect.',
    keys: ['hit_image', 'hit_type', 'hit_frames', 'hit_fps', 'hit_cols', 'hit_frame', 'hit_size', 'hit_anchor'],
  },
  {
    id: 'look', title: 'Look',
    hint: 'filter tints both sprites (a CSS filter); css_class adds classes, such as the battler presets below.',
    keys: ['css_class', 'filter'],
  },
  {
    id: 'juice', title: 'Hit feel',
    hint: 'On a damaging hit the body flashes and holds still for the hit-stop, a burst and sparks go off in the effect\'s colour, and the screen jolts. The Config tab sets the base amounts; a killing blow holds twice as long.',
    keys: ['impact_strength', 'impact_color'],
  },
  { id: 'sound', title: 'Sound', keys: ['sound', 'hit_sound'] },
];
// rpg-vfx.css
const PRESETS = [
  { id: 'vfx-add', tip: 'Additive blending, for glowing effects drawn on black' },
  { id: 'vfx-screen', tip: 'Screen blending, a softer glow' },
  { id: 'vfx-glow', tip: 'A soft white halo, after the filter' },
  { id: 'vfx-spin', tip: 'Spins a single-image sprite (a thrown rock)' },
  { id: 'vfx-wobble', tip: 'Rocks it back and forth (a vine, a blade)' },
  { id: 'vfx-squash', tip: 'Squashes and stretches it (a slime blob)' },
];
const ROTATIONS = [
  { value: 0, label: '↑ up', tip: 'The art points up: starting_rotation 0' },
  { value: 90, label: '← left', tip: 'The art points left: starting_rotation 90' },
  { value: -90, label: '→ right', tip: 'The art points right: starting_rotation -90' },
  { value: 180, label: '↓ down', tip: 'The art points down: starting_rotation 180' },
];
const SPEEDS = [{ value: 1, label: '1×' }, { value: 0.5, label: '½×' }, { value: 0.25, label: '¼×' }];
const AREA_TARGETS = ['all_enemies', 'all_allies'];
const ALLY_TARGETS = ['ally', 'all_allies', 'self', 'self_and_ally'];
const PAUSE_AFTER = 0.8;                     // seconds between two casts
const STORE_KEY = 'rpgProjectileEditor';

// GSAP's power2 eases, which the battler's lunge uses
const power2Out = (p) => 1 - Math.pow(1 - p, 3);
const power2InOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch { return {}; }
}
function saveStore(value) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export default defineComponent({
  components: { FormFieldRenderer, EditorCharacterPreview },
  props: ['item', 'coreItem', 'schema', 'subtabId'],
  emits: ['update:item', 'request-save-jump'],
  setup(props, { emit }) {
    // ── the stage's options, remembered between openings ──
    const stored = loadStore();
    const view = reactive({
      caster: stored.caster === 'enemy' ? 'enemy' : 'party',
      area: !!stored.area,
      speed: SPEEDS.some((s) => s.value === stored.speed) ? stored.speed : 1,
      sound: !!stored.sound,
      party: typeof stored.party === 'string' ? stored.party : '',
      enemy: typeof stored.enemy === 'string' ? stored.enemy : '',
    });
    watch(view, () => saveStore({ ...view }), { deep: true });
    const playing = ref(true);

    const geom = ref(null);                  // rpg-vfx-geometry.mjs
    const juice = ref(null);                 // rpg-vfx-juice.mjs
    const loadError = ref('');
    const cfg = ref({});                     // battle_config: the default sizes and the hit juice
    const abilities = ref([]);
    const characters = ref([]);

    // The def as the game merges it: a mod's entry over the core one.
    const def = computed(() => ({ ...(props.coreItem || {}), ...(props.item || {}) }));
    const schema = computed(() => props.schema || {});

    // ── fields ──
    function setField(key, value) {
      props.item[key] = value;               // the wrapper's working copy (v-model:item)
      emit('update:item', props.item);
    }
    const groups = computed(() => {
      const known = new Set(['uid']);
      const out = GROUPS.map((g) => {
        g.keys.forEach((k) => known.add(k));
        return { ...g, keys: g.keys.filter((k) => schema.value[k]) };
      });
      const other = Object.keys(schema.value).filter((k) => !known.has(k));
      if (other.length) out.push({ id: 'other', title: 'Other', keys: other });
      return out;
    });
    const classes = computed(() => String(def.value.css_class || '').split(/\s+/).filter(Boolean));
    function togglePreset(name) {
      const list = classes.value.includes(name) ? classes.value.filter((c) => c !== name) : [...classes.value, name];
      setField('css_class', list.join(' '));
    }
    const rotation = computed(() => Number(def.value.starting_rotation) || 0);

    // ── images: their natural size, so a frame keeps its shape (frameBox) ──
    const dims = reactive({});               // url → {w, h}; null = failed; undefined = loading
    function loadDims(url) {
      if (!url || url in dims) return;
      dims[url] = undefined;
      const img = new Image();
      img.onload = () => { dims[url] = { w: img.naturalWidth, h: img.naturalHeight }; };
      img.onerror = () => { dims[url] = null; };
      img.src = url;
    }
    watch(() => [def.value.travel_image, def.value.hit_image], ([a, b]) => { loadDims(a); loadDims(b); }, { immediate: true });

    // The sheet read as the battler reads it (readSheet): the hit sprite's (else the travel sprite's)
    // colour for the juice, and the hit sheet's fullest frame, where an impact lands.
    const sheetRead = ref({ kind: '', color: '#ffffff', peak: null });
    watch(() => [geom.value, juice.value, JSON.stringify(def.value)], () => {
      const g = geom.value, j = juice.value, d = def.value;
      if (!g || !j) return;
      const kind = d.hit_image ? 'hit' : 'travel';
      const want = JSON.stringify(def.value);
      j.readSheet(d[`${kind}_image`], g.sheetOf(d, kind)).then((r) => {
        if (JSON.stringify(def.value) === want) sheetRead.value = { kind, ...r };
      });
    }, { immediate: true });
    const juiceColor = computed(() => def.value.impact_color || sheetRead.value.color);
    // The frame an impact lands on (hitLandFrame): hit_frame, else the fullest frame, else a third in.
    const landFrame = computed(() => (geom.value
      ? geom.value.hitLandFrame(def.value, sheetRead.value.kind === 'hit' ? sheetRead.value.peak : null) : 0));
    const landSec = computed(() => landFrame.value / (Number(def.value.hit_fps) || 12));
    const strength = computed(() => (juice.value ? juice.value.strengthOf(def.value.impact_strength) : 1));
    const stopMs = computed(() => (juice.value && cfg.value.hit_juice !== false && hostile.value && strength.value > 0
      ? (cfg.value.hit_stop_ms ?? juice.value.JUICE_DEFAULTS.stopMs) * strength.value : null));

    // Frame counts as the battler reads them (spawnSprite): frames default to 1, a sheet steps them
    // `cols` to a row. Each strip is checked against its image.
    const sheets = computed(() => ['travel', 'hit'].map((kind) => {
      const d = def.value;
      const image = d[`${kind}_image`];
      if (!image) return null;
      const dm = dims[image];
      const frames = Number(d[`${kind}_frames`]) || 1;
      const sheet = d[`${kind}_type`] === 'sheet' && frames > 1;
      const cols = sheet ? Number(d[`${kind}_cols`]) || frames : 1;
      const rows = sheet ? Math.ceil(frames / cols) : 1;
      const warn = [];
      let guess = 0;
      if (dm === null) warn.push('The image does not load.');
      if (dm) {
        if (d[`${kind}_type`] === 'sheet' && frames < 2) warn.push('A sheet needs its frame count.');
        if (sheet && dm.w % cols) warn.push(`${dm.w} px across does not split evenly into ${cols} columns.`);
        if (sheet && dm.h % rows) warn.push(`${dm.h} px down does not split evenly into ${rows} rows.`);
        if (d[`${kind}_type`] !== 'sheet' && dm.w >= dm.h * 2.5) warn.push('This looks like a strip of frames: set the type to sheet.');
        const n = Math.round(dm.w / dm.h);
        if (d[`${kind}_type`] === 'sheet' && !d[`${kind}_cols`] && n >= 2 && Math.abs(dm.w / dm.h - n) < 0.02 && n !== frames) guess = n;
      }
      // the landing frame, outlined on the impact strip
      let land = null;
      if (kind === 'hit' && sheet) {
        const f = landFrame.value;
        land = {
          n: f + 1, set: Number(d.hit_frame) > 0,
          style: { left: `${((f % cols) / cols) * 100}%`, top: `${(Math.floor(f / cols) / rows) * 100}%`, width: `${100 / cols}%`, height: `${100 / rows}%` },
        };
      }
      const name = String(image).split('/').pop();
      const shape = dm ? `${Math.round(dm.w / cols)}×${Math.round(dm.h / rows)} px a frame · ${dm.w}×${dm.h} px` : dm === null ? 'not found' : 'loading…';
      return {
        kind, label: kind === 'travel' ? 'Travel' : 'Impact', image, name, sheet, frames, cols, rows, warn, guess, land,
        line: `${sheet ? `${frames} frames${rows > 1 ? `, ${cols} a row` : ''} at ${Number(d[`${kind}_fps`]) || 12} fps` : 'one image'} · ${shape}`
          + (land ? ` · lands on frame ${land.n} (${land.set ? 'hit_frame' : 'the fullest'})` : ''),
      };
    }).filter(Boolean));
    function applyGuess(s) { setField(`${s.kind}_frames`, s.guess); }
    function ticks(s) {
      const out = [];
      for (let i = 1; i < s.cols; i++) out.push({ key: `c${i}`, style: { left: `${(i / s.cols) * 100}%` } });
      for (let j = 1; j < s.rows; j++) out.push({ key: `r${j}`, row: true, style: { top: `${(j / s.rows) * 100}%` } });
      return out;
    }

    // ── who uses it ──
    const users = computed(() => {
      const id = def.value.id;
      if (!id) return [];
      return abilities.value
        .filter((a) => a?.meta?.projectile === id)
        .map((a) => ({ id: a.id, name: a.meta?.name || a.id, area: AREA_TARGETS.includes(a.meta?.target), target: a.meta?.target }));
    });
    // The battle juices damage only, so a def that only allies receive (a buff ring) plays without it.
    const hostile = computed(() => !users.value.length || users.value.some((u) => !ALLY_TARGETS.includes(u.target)));
    // The caster's motion as the battle's casterMotion derives it; a def only allies receive stands
    // for a self or ally ability.
    const motion = computed(() => {
      const d = def.value;
      if (d.caster_animation === 'melee' || d.caster_animation === 'cast') return d.caster_animation;
      if (!hostile.value) return 'cast';
      return d.travel_image || d.hit_image ? 'cast' : 'melee';
    });
    function openAbility(id) {
      emit('request-save-jump', { mainTab: 'characters', subTab: 'ability_templates', entityId: id });
    }

    // ── the stage ──
    const charOptions = computed(() => characters.value.map((c) => {
      const name = typeof c.name === 'string' && c.name && c.name !== c.id ? c.name : '';
      return { id: c.id, label: name ? `${name} (${c.id})` : c.id };
    }));
    const partyChar = computed(() => characters.value.find((c) => c.id === view.party) || null);
    const enemyChar = computed(() => characters.value.find((c) => c.id === view.enemy) || null);
    // Real art for the enemy row and the lead party member; the rest of the party stay silhouettes.
    function charOf(f) { return f.side === 'enemy' ? enemyChar.value : f.index === 0 ? partyChar.value : null; }

    const stageEl = ref(null);
    const layerEl = ref(null);
    const size = reactive({ w: 0, h: 0 });
    const figEls = {};
    // The shot the battle shows: while the player's party member acts the camera is zoomed in (that
    // member at the front, the rest of the party hidden, the enemies scaled about its point); on an
    // enemy's turn it is zoomed out, the party row along the bottom.
    const zoomedIn = computed(() => view.caster === 'party');
    const figures = computed(() => {
      const g = geom.value;
      if (!g) return [];
      const list = [];
      for (let i = 0; i < 3; i++) {
        const slot = g.enemySlot(i);
        list.push({ key: `e${i}`, side: 'enemy', index: i, ...(zoomedIn.value ? g.zoomedSlot(slot) : slot) });
      }
      if (zoomedIn.value) list.push({ key: 'p0', side: 'party', index: 0, ...g.activeSlot() });
      else for (let i = 0; i < 3; i++) list.push({ key: `p${i}`, side: 'party', index: i, ...g.partySlot(i) });
      return list;
    });
    // The lead party member casts at the middle of the front enemy row, and back.
    const casterKey = computed(() => (view.caster === 'party' ? 'p0' : 'e1'));
    const targetKeys = computed(() => {
      const side = view.caster === 'party' ? 'e' : 'p';
      return view.area ? [0, 1, 2].map((i) => side + i) : [side === 'e' ? 'e1' : 'p0'];
    });
    // the front enemy row's feet, where the floor starts (it is part of the zoomed world)
    const floorTop = computed(() => {
      const g = geom.value;
      if (!g) return '70%';
      const L = g.LAYOUT, feet = L.floorY + L.baseScale * 50;
      const o = g.cameraOrigin();
      return `${50 + (zoomedIn.value ? o.y + (feet - o.y) * L.WORLD_ZOOM_IN : feet)}%`;
    });
    function figStyle(f) {
      return { left: `${50 + f.x}%`, top: `${50 + f.y}%`, height: `${f.scale * 100}%`, zIndex: f.side === 'party' ? 3 : 2 - f.row };
    }
    // A slot's box in stage px: the body is centred on the slot and `scale` of the viewport tall.
    function figRect(f) {
      const cx = size.w * (50 + f.x) / 100, cy = size.h * (50 + f.y) / 100, h = f.scale * size.h;
      return { left: cx - h * 0.21, width: h * 0.42, top: cy - h / 2, height: h, bottom: cy + h / 2, cx, cy };
    }
    function sizeFor(kind) {
      const g = geom.value, d = def.value;
      const fallback = (kind === 'travel' ? cfg.value.projectile_travel_size : cfg.value.projectile_hit_size)
        || (kind === 'travel' ? g.DEFAULT_TRAVEL_SIZE : g.DEFAULT_HIT_SIZE);
      return g.sizePx(d[`${kind}_size`], fallback, size.h);
    }
    // One sprite, built as the battler's spawnSprite builds it.
    function makeSprite(kind) {
      const g = geom.value, d = def.value;
      const image = d[`${kind}_image`];
      const frames = Number(d[`${kind}_frames`]) || 1;
      const sheet = d[`${kind}_type`] === 'sheet' && frames > 1;
      const c = Number(d[`${kind}_cols`]) || frames, r = Math.ceil(frames / c);
      const el = document.createElement(sheet ? 'div' : 'img');
      el.className = 'rpg-projectile' + (sheet ? ' rpg-projectile-sheet' : '')
        + (kind === 'hit' && d.hit_anchor === 'feet' ? ' rpg-projectile-bottom' : '') + (d.css_class ? ` ${d.css_class}` : '');
      if (d.filter) el.style.setProperty('--vfx-filter', d.filter);
      const box = g.frameBox(dims[image] || null, frames, d[`${kind}_cols`], sizeFor(kind));
      el.style.width = `${box.w}px`;
      el.style.height = `${box.h}px`;
      if (sheet) {
        el.style.backgroundImage = `url('${image}')`;
        el.style.backgroundSize = `${c * 100}% ${r * 100}%`;
      } else {
        el.src = image;
      }
      el.style.display = 'none';
      layerEl.value.appendChild(el);
      return { el, sheet, frames, c, r, fps: Number(d[`${kind}_fps`]) || 12 };
    }
    function setFrame(s, i) {
      if (!s.sheet) return;
      const col = i % s.c, row = Math.floor(i / s.c);
      s.el.style.backgroundPosition = `${s.c > 1 ? (col / (s.c - 1)) * 100 : 0}% ${s.r > 1 ? (row / (s.r - 1)) * 100 : 0}%`;
    }
    function playFile(file) {
      try {
        const a = new Audio(file);
        a.volume = 0.8;
        a.play().catch(() => { /* blocked or missing: the field shows the file */ });
      } catch { /* no audio */ }
    }

    // A cast as animateCast plays it: the caster's lunge (or its cast, which stays in place), then
    // one sprite per target started AREA_STAGGER_MS apart, impacts only, or nothing more. Distances are converted to a 1080p
    // battle's px, so flight times and lob heights are the game's at any preview size.
    let plan = null;
    let clock = 0;
    const flight = ref(0);
    function buildPlan() {
      const g = geom.value, d = def.value;
      if (layerEl.value) layerEl.value.innerHTML = '';
      Object.values(figEls).forEach((el) => { if (el) el.style.translate = ''; });
      plan = null;
      clock = 0;
      flight.value = 0;
      if (!g || !size.h || !layerEl.value) return;
      const figs = Object.fromEntries(figures.value.map((f) => [f.key, f]));
      const caster = figs[casterKey.value];
      const targets = targetKeys.value.map((k) => figs[k]).filter(Boolean);
      if (!caster || !targets.length) return;
      const cr = figRect(caster);
      const from = { x: cr.cx, y: cr.cy };
      const k = 1080 / size.h;
      const stagger = g.AREA_STAGGER_MS / 1000;
      const hasTravel = !!d.travel_image, hasHit = !!d.hit_image;
      const hitDur = hasHit ? g.hitSeconds(d) : 0;
      const p = { caster: caster.key, lunge: null, travels: [], hits: [], sounds: [], juice: null, end: 0 };
      const addHit = (f, at) => {
        if (hasHit) p.hits.push({ at, dur: hitDur, pos: g.hitAnchor(d.hit_anchor, figRect(f)).pos, s: makeSprite('hit') });
        p.sounds.push({ at, file: d.hit_sound });
      };
      const t0 = figRect(targets[0]);
      if (motion.value === 'melee') p.lunge = { dx: (t0.cx - cr.cx) * g.LUNGE.reach, dy: (t0.cy - cr.cy) * g.LUNGE.reach };
      if (!hasTravel && !hasHit) {
        // no images: the caster's animation alone, with the def's sounds at its start and its contact
        p.sounds.push({ at: 0, file: d.sound }, { at: g.LUNGE.out, file: d.hit_sound });
      } else if (p.lunge && !hasTravel) {
        p.sounds.push({ at: 0, file: d.sound });
        targets.forEach((f, i) => addHit(f, g.LUNGE.out + i * stagger));
      } else if (hasTravel) {
        // a lunging caster throws: the sprites launch at the lunge's peak
        const start = p.lunge ? g.LUNGE.out : 0;
        targets.forEach((f, i) => {
          const r = figRect(f), to = { x: r.cx, y: r.cy }, at = start + i * stagger;
          const dist = Math.hypot(to.x - from.x, to.y - from.y);
          const fly = g.flightSeconds(dist * k, d.speed);
          p.travels.push({ at, dur: fly, from, to, hgt: d.arc ? g.lobHeight(dist * k) / k : 0, s: makeSprite('travel') });
          p.sounds.push({ at, file: d.sound });
          addHit(f, at + fly);
          if (i === 0) flight.value = fly;
        });
      } else {
        p.sounds.push({ at: 0, file: d.sound });
        targets.forEach((f, i) => addHit(f, i * stagger));
      }
      // The damage reaction plays when animateCast resolves: at the lunge's contact; when every
      // travel sprite has landed; on the last impact-only sprite's landing frame.
      if (stopMs.value !== null) {
        const at = hasTravel ? Math.max(...p.travels.map((e) => e.at + e.dur))
          : p.lunge ? g.LUNGE.out
          : p.hits.length ? Math.max(...p.hits.map((e) => e.at + landSec.value)) : 0;
        p.juice = { at, targets };
      }
      if (p.lunge) p.end = g.LUNGE.out + g.LUNGE.hold + g.LUNGE.back;
      for (const e of [...p.travels, ...p.hits]) p.end = Math.max(p.end, e.at + e.dur);
      if (p.juice) p.end = Math.max(p.end, p.juice.at + (stopMs.value + 400) / 1000);
      p.end += PAUSE_AFTER;
      plan = p;
    }
    function replay() {
      playing.value = true;
      buildPlan();
    }

    let raf = 0;
    let last = 0;
    function tick(now) {
      raf = requestAnimationFrame(tick);
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (!plan || !playing.value) return;
      clock += dt * view.speed;
      const g = geom.value, d = def.value, t = clock;
      if (plan.lunge) {
        const L = g.LUNGE;
        const k = t < L.out ? power2Out(t / L.out)
          : t < L.out + L.hold ? 1
          : t < L.out + L.hold + L.back ? 1 - power2InOut((t - L.out - L.hold) / L.back) : 0;
        const el = figEls[plan.caster];
        // on top of .pje-fig's centring translate
        if (el) el.style.translate = `calc(-50% + ${plan.lunge.dx * k}px) calc(-50% + ${plan.lunge.dy * k}px)`;
      }
      for (const e of plan.travels) {
        const u = (t - e.at) / e.dur;
        if (u < 0 || u >= 1) { e.s.el.style.display = 'none'; continue; }
        const at = g.flightAt(e.from, e.to, u, e.hgt);
        e.s.el.style.display = '';
        e.s.el.style.left = `${at.x}px`;
        e.s.el.style.top = `${at.y}px`;
        e.s.el.style.transform = `rotate(${g.facing(d.starting_rotation, at.vx, at.vy)}rad)`;
        setFrame(e.s, Math.floor((t - e.at) * e.s.fps) % e.s.frames);
      }
      for (const e of plan.hits) {
        const u = t - e.at;
        if (u < 0 || u >= e.dur) { e.s.el.style.display = 'none'; continue; }
        e.s.el.style.display = '';
        e.s.el.style.left = `${e.pos.x}px`;
        e.s.el.style.top = `${e.pos.y}px`;
        setFrame(e.s, Math.min(e.s.frames - 1, Math.floor(u * e.s.fps)));
      }
      if (plan.juice && !plan.juice.done && t >= plan.juice.at) {
        plan.juice.done = true;
        playJuice(plan.juice.targets);
      }
      for (const s of plan.sounds) {
        if (!s.done && t >= s.at) {
          s.done = true;
          if (view.sound && s.file) playFile(s.file);
        }
      }
      if (t >= plan.end) buildPlan();
    }

    // A damaging hit's juice on every target at once, as animateEffects plays it (rpg-vfx-juice.mjs),
    // then the recoil shake once the hit-stop is over. Its durations follow the playback speed.
    function playJuice(targets) {
      const j = juice.value, g = geom.value, d = def.value;
      if (!j || !g || !layerEl.value) return;
      const m = 1 / view.speed, k = strength.value, hold = stopMs.value, sz = sizeFor('hit');
      for (const f of targets) {
        const el = figEls[f.key];
        const r = figRect(f);
        const pos = d.hit_image && d.hit_anchor !== 'feet' ? g.hitAnchor(d.hit_anchor, r).pos : { x: r.cx, y: r.cy };
        // the body only, not the figure's target ring
        j.flash(el?.querySelector('.editor-char-preview, .pje-doll') || el, juiceColor.value, hold, sz * 0.06, m);
        const hit = { container: layerEl.value, pos, size: sz, color: juiceColor.value, k, m };
        j.burst(hit);
        j.sparks({ ...hit, sparks: cfg.value.hit_sparks ?? j.JUICE_DEFAULTS.sparks });
        const amp = 4 * Math.max(1, k) * size.h / 1080;
        el?.animate([{ translate: '0 0' }, { translate: `${-amp}px 0` }, { translate: '0 0' }],
          { duration: 100 * m, delay: hold * m, iterations: 3, easing: 'ease-in-out', composite: 'add' });
      }
      j.shake(stageEl.value.children, (cfg.value.hit_shake ?? j.JUICE_DEFAULTS.shake) * k * size.h / 1080, m);
    }

    // any change to the def, the stage or the cast starts the cast over
    watch([geom, juice, stopMs, landSec, cfg, figures, () => JSON.stringify(def.value), () => view.caster, () => view.area,
      () => size.w, () => size.h, () => JSON.stringify(dims)], () => buildPlan());

    const info = computed(() => {
      const g = geom.value, d = def.value;
      if (!g) return '';
      const parts = [];
      if (d.travel_image) parts.push(`travel sprite ${Math.round(g.sizePx(d.travel_size, cfg.value.projectile_travel_size || g.DEFAULT_TRAVEL_SIZE, 1080))} px`);
      if (d.hit_image) parts.push(`impact ${Math.round(g.sizePx(d.hit_size, cfg.value.projectile_hit_size || g.DEFAULT_HIT_SIZE, 1080))} px for ${g.hitSeconds(d).toFixed(2)} s`);
      if (flight.value) parts.push(`flight ${flight.value.toFixed(2)} s`);
      if (motion.value === 'melee' && d.travel_image) parts.push('the caster lunges, the sprite launches at the peak');
      else if (motion.value === 'melee' && d.hit_image) parts.push('the caster lunges, the impact plays at contact');
      else if (d.hit_image && !d.travel_image) parts.push(`the damage lands ${landSec.value.toFixed(2)} s in, on frame ${landFrame.value + 1}`);
      if (stopMs.value !== null) parts.push(`hit-stop ${Math.round(stopMs.value)} ms`);
      else if (!hostile.value) parts.push('no hit juice (only allies receive it)');
      const shot = zoomedIn.value ? ' The camera is zoomed in on the caster, as on the player\'s turn.' : '';
      const bare = motion.value === 'melee' ? 'No images: the caster lunges at the target.' : 'No images: the caster casts in place.';
      return (parts.length ? `On a 1080p screen: ${parts.join(' · ')}.` : bare) + shot;
    });

    let ro = null;
    onMounted(async () => {
      ro = new ResizeObserver(([entry]) => {
        size.w = entry.contentRect.width;
        size.h = entry.contentRect.height;
      });
      if (stageEl.value) ro.observe(stageEl.value);
      raf = requestAnimationFrame(tick);
      try {
        geom.value = await importPluginModule('rpg_battler', 'scripts/rpg-vfx-geometry.mjs');
        juice.value = await importPluginModule('rpg_battler', 'scripts/rpg-vfx-juice.mjs');
      } catch (e) {
        loadError.value = `The preview needs rpg-vfx-geometry.mjs and rpg-vfx-juice.mjs: ${e?.message || e}`;
      }
      const base = `games_files/${editor.selectedGame}`;
      for (const mod of [...new Set([editor.selectedMod, '_core'])]) {
        try {
          const c = await readJson(`${base}/${mod}/plugins_data/rpg_battler/battle_config.json`);
          if (c && typeof c === 'object') { cfg.value = c; break; }
        } catch { /* not in this mod */ }
      }
      try { abilities.value = (await editor.loadFullData('ability_templates')) || []; } catch { /* none */ }
      try { characters.value = (await editor.loadFullData('character_templates')) || []; } catch { /* none */ }
    });
    onBeforeUnmount(() => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    });

    return {
      GROUPS, PRESETS, ROTATIONS, SPEEDS,
      view, playing, loadError, def, schema, groups, classes, rotation, sheets, users, charOptions, figures,
      casterKey, targetKeys, floorTop, info, stageEl, layerEl, figEls,
      setField, togglePreset, applyGuess, ticks, openAbility, charOf, figStyle, replay, playFile,
    };
  },
  template: /*html*/ `
    <div class="pje">
      <div class="pje-main">
        <div class="pje-bar">
          <div class="pje-seg" title="Who casts">
            <button :class="{ on: view.caster === 'party' }" @click="view.caster = 'party'">Party casts</button>
            <button :class="{ on: view.caster === 'enemy' }" @click="view.caster = 'enemy'">Enemy casts</button>
          </div>
          <div class="pje-seg" title="One target, or every one on the other side (an area ability)">
            <button :class="{ on: !view.area }" @click="view.area = false">One target</button>
            <button :class="{ on: view.area }" @click="view.area = true">Whole side</button>
          </div>
          <div class="pje-seg" title="Playback speed">
            <button v-for="s in SPEEDS" :key="s.value" :class="{ on: view.speed === s.value }" @click="view.speed = s.value">{{ s.label }}</button>
          </div>
          <button class="pje-btn" @click="playing = !playing">{{ playing ? 'Pause' : 'Play' }}</button>
          <button class="pje-btn" @click="replay">Replay</button>
          <button class="pje-btn" :class="{ on: view.sound }" title="Play the def's sounds with the preview" @click="view.sound = !view.sound">Sound {{ view.sound ? 'on' : 'off' }}</button>
        </div>

        <div class="pje-stage" ref="stageEl">
          <div class="pje-floor" :style="{ top: floorTop }"></div>
          <div v-for="f in figures" :key="f.key" class="pje-fig"
            :class="[f.side, { caster: f.key === casterKey, target: targetKeys.includes(f.key) }]"
            :style="figStyle(f)" :ref="(el) => { figEls[f.key] = el; }">
            <EditorCharacterPreview v-if="charOf(f)" :character="charOf(f)" :view="f.side === 'party' ? 'back' : undefined" />
            <div v-else class="pje-doll"></div>
          </div>
          <div class="pje-sprites" ref="layerEl"></div>
          <div v-if="loadError" class="pje-stage-msg">{{ loadError }}</div>
        </div>
        <div class="pje-info">{{ info }}</div>

        <div class="pje-cast">
          <label>Party
            <select v-model="view.party">
              <option value="">silhouette</option>
              <option v-for="c in charOptions" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
          </label>
          <label>Enemies
            <select v-model="view.enemy">
              <option value="">silhouette</option>
              <option v-for="c in charOptions" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
          </label>
        </div>

        <div class="pje-sheets">
          <div v-for="s in sheets" :key="s.kind" class="pje-sheet">
            <div class="pje-sheet-head">
              <b>{{ s.label }}</b><code>{{ s.name }}</code><span>{{ s.line }}</span>
              <button v-if="s.guess" class="pje-btn small" @click="applyGuess(s)">Set frames to {{ s.guess }} (square cells)</button>
            </div>
            <div class="pje-strip-wrap">
              <div class="pje-strip">
                <img :src="s.image" alt="">
                <i v-for="t in ticks(s)" :key="t.key" :class="{ row: t.row }" :style="t.style"></i>
                <b v-if="s.land" class="pje-land" :style="s.land.style" :title="'The impact lands on frame ' + s.land.n + (s.land.set ? ' (hit_frame)' : ', the fullest — set hit_frame to choose another')"></b>
              </div>
            </div>
            <div v-for="w in s.warn" :key="w" class="pje-warn">{{ w }}</div>
          </div>
          <div v-if="!sheets.length" class="pje-muted">No images yet: without a travel or an impact image the caster only lunges.</div>
        </div>

        <div class="pje-users">
          <b>Used by {{ users.length }} {{ users.length === 1 ? 'ability' : 'abilities' }}</b>
          <button v-for="u in users" :key="u.id" class="pje-chip" :class="{ area: u.area }"
            :title="'Save, then open ' + u.id + (u.area ? ' (area)' : '')" @click="openAbility(u.id)">{{ u.name }}</button>
          <span v-if="!users.length" class="pje-muted">No ability names it in meta.projectile yet.</span>
        </div>
      </div>

      <div class="pje-fields">
        <section v-for="g in groups" :key="g.id" class="pje-group">
          <h4>{{ g.title }}</h4>
          <p v-if="g.hint" class="pje-hint">{{ g.hint }}</p>
          <div v-if="g.id === 'travel'" class="pje-quick">
            <span>Art points</span>
            <button v-for="r in ROTATIONS" :key="r.value" class="pje-btn small" :class="{ on: rotation === r.value }"
              :title="r.tip" @click="setField('starting_rotation', r.value)">{{ r.label }}</button>
          </div>
          <FormFieldRenderer v-for="key in g.keys" :key="key" :base-field-schema="schema[key]" :field-key="key"
            :item-data="item" :root-schema="schema" :field-id="'pje-' + key" :modelValue="item[key]"
            @update:modelValue="(v) => setField(key, v)" :is-array-item-id="key === 'id'"
            :parent-core-data-item="coreItem || null" :form-data="item" :force-active="true" />
          <div v-if="g.id === 'sound' && (def.sound || def.hit_sound)" class="pje-quick">
            <span>Listen</span>
            <button v-if="def.sound" class="pje-btn small" @click="playFile(def.sound)">▶ sound</button>
            <button v-if="def.hit_sound" class="pje-btn small" @click="playFile(def.hit_sound)">▶ hit_sound</button>
          </div>
          <div v-if="g.id === 'look'" class="pje-quick">
            <span>Presets</span>
            <button v-for="p in PRESETS" :key="p.id" class="pje-btn small" :class="{ on: classes.includes(p.id) }"
              :title="p.tip" @click="togglePreset(p.id)">{{ p.id }}</button>
          </div>
        </section>
      </div>
    </div>
  `,
});
