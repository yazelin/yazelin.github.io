(() => {
  'use strict';

  const regions = [
    { id: 'keelung-city', name: '基隆市', display: '基隆人代表', poster: 'keelung', kicker: '雨港與海風', motto: '雨港、海風與港都韌性', accent: '#7ca7bd', rgb: '124, 167, 189' },
    { id: 'taipei-city', name: '台北市', display: '台北人代表', poster: 'taipei', kicker: '首都日常', motto: '多元、創新、包容、智慧', accent: '#83c6e6', rgb: '131, 198, 230' },
    { id: 'new-taipei-city', name: '新北市', display: '新北人代表', poster: 'new-taipei', kicker: '山海共城', motto: '山海交織、多元共榮', accent: '#71d0ce', rgb: '113, 208, 206' },
    { id: 'taoyuan-city', name: '桃園市', display: '桃園人代表', poster: 'taoyuan', kicker: '國際門戶', motto: '國際門戶、開放進取', accent: '#e6a4bc', rgb: '230, 164, 188' },
    { id: 'hsinchu-county', name: '新竹縣', display: '新竹人代表', poster: 'hsinchu', kicker: '科技與山城', motto: '科技與山城共生', accent: '#80bd91', rgb: '128, 189, 145' },
    { id: 'hsinchu-city', name: '新竹市', display: '新竹人代表', poster: 'hsinchu', kicker: '風城創新', motto: '科技風城、創新實幹', accent: '#5eb28a', rgb: '94, 178, 138' },
    { id: 'miaoli-county', name: '苗栗縣', display: '苗栗人代表', poster: 'miaoli', kicker: '客庄山城', motto: '客庄底蘊、山城慢活', accent: '#8f9dc6', rgb: '143, 157, 198' },
    { id: 'taichung-city', name: '台中市', display: '台中人代表', poster: 'taichung', kicker: '生活之都', motto: '生活美學、創意宜居', accent: '#efc36f', rgb: '239, 195, 111' },
    { id: 'changhua-county', name: '彰化縣', display: '彰化人代表', poster: 'changhua', kicker: '務實傳承', motto: '務實傳承、勤奮創新', accent: '#c4a7d8', rgb: '196, 167, 216' },
    { id: 'nantou-county', name: '南投縣', display: '南投人代表', poster: 'nantou', kicker: '山水茶鄉', motto: '好山好水、茶香人情', accent: '#8abb89', rgb: '138, 187, 137' },
    { id: 'yunlin-county', name: '雲林縣', display: '雲林人代表', poster: 'yunlin', kicker: '農業風土', motto: '農業大縣、樸實堅韌', accent: '#d5ad61', rgb: '213, 173, 97' },
    { id: 'chiayi-county', name: '嘉義縣', display: '嘉義人代表', poster: 'chiayi', kicker: '山海風土', motto: '山海風土、溫暖好客', accent: '#c09670', rgb: '192, 150, 112' },
    { id: 'chiayi-city', name: '嘉義市', display: '嘉義人代表', poster: 'chiayi', kicker: '木都日常', motto: '木都人情、慢活美食', accent: '#c98268', rgb: '201, 130, 104' },
    { id: 'tainan-city', name: '台南市', display: '台南人代表', poster: 'tainan', kicker: '府城古都', motto: '古都日常、人情與美食', accent: '#df8d7c', rgb: '223, 141, 124' },
    { id: 'kaohsiung-city', name: '高雄市', display: '高雄人代表', poster: 'kaohsiung', kicker: '海洋港都', motto: '海洋港都、熱情豪爽', accent: '#56a8d5', rgb: '86, 168, 213' },
    { id: 'pingtung-county', name: '屏東縣', display: '屏東人代表', poster: 'pingtung', kicker: '國境之南', motto: '國境之南、陽光慢活', accent: '#ed9a7f', rgb: '237, 154, 127' },
    { id: 'yilan-county', name: '宜蘭縣', display: '宜蘭人代表', poster: 'yilan', kicker: '蘭陽山海', motto: '純淨山海、自在生活', accent: '#9ccf9d', rgb: '156, 207, 157' },
    { id: 'hualien-county', name: '花蓮縣', display: '花蓮人代表', poster: 'hualien', kicker: '山海共生', motto: '山海共生、純粹溫暖', accent: '#78b9be', rgb: '120, 185, 190' },
    { id: 'taitung-county', name: '台東縣', display: '台東人代表', poster: 'taitung', kicker: '南島慢活', motto: '南島慢活、自由樂天', accent: '#72c6c2', rgb: '114, 198, 194' },
    { id: 'penghu-county', name: '澎湖縣', display: '澎湖人代表', poster: 'penghu', kicker: '海島日光', motto: '海島陽光、團結勇敢', accent: '#8fc7ed', rgb: '143, 199, 237' },
    { id: 'kinmen-county', name: '金門縣', display: '金門人代表', poster: 'kinmen', kicker: '閩南島嶼', motto: '閩南聚落、守護家園', accent: '#d3ae6d', rgb: '211, 174, 109' },
    { id: 'lienchiang-county', name: '連江縣', display: '連江人代表', poster: 'lienchiang', kicker: '馬祖列島', motto: '山海相依、堅毅守望', accent: '#6f9cb8', rgb: '111, 156, 184' }
  ];

  const byId = new Map(regions.map(region => [region.id, region]));
  const posterImage = document.getElementById('poster-image');
  const posterName = document.getElementById('poster-name');
  const posterKicker = document.getElementById('poster-kicker');
  const posterMotto = document.getElementById('poster-motto');
  const posterNumber = document.getElementById('poster-number');
  const mapCaptionName = document.getElementById('map-caption-name');
  const tooltip = document.getElementById('map-tooltip');
  const mapRegions = [...document.querySelectorAll('.map-region')];
  const posterFrame = document.querySelector('.poster-frame');
  const pageScroll = document.getElementById('page-scroll');
  const header = document.getElementById('site-header');
  const loadingScreen = document.getElementById('loading-screen');
  const motionToggle = document.getElementById('motion-toggle');
  const root = document.documentElement;
  let activeId = 'kaohsiung-city';
  let lockedId = activeId;
  let changeToken = 0;

  const posterCache = new Map();

  function loadPoster(name) {
    if (posterCache.has(name)) return posterCache.get(name);
    const request = fetch(`assets/posters/${name}.b64`, { cache: 'force-cache' })
      .then(response => {
        if (!response.ok) throw new Error(`Poster not found: ${name}`);
        return response.text();
      })
      .then(content => `data:image/webp;base64,${content.trim()}`);
    posterCache.set(name, request);
    return request;
  }

  function selectRegion(id, options = {}) {
    const region = byId.get(id);
    if (!region || id === activeId && !options.force) return;
    const token = ++changeToken;
    activeId = id;
    if (options.lock) lockedId = id;

    root.style.setProperty('--accent', region.accent);
    root.style.setProperty('--accent-rgb', region.rgb);
    mapRegions.forEach(el => el.classList.toggle('is-active', el.dataset.region === id));
    mapCaptionName.textContent = region.name;
    posterName.textContent = region.display;
    posterKicker.textContent = region.kicker;
    posterMotto.textContent = region.motto;
    posterNumber.textContent = String(regions.findIndex(item => item.id === id) + 1).padStart(2, '0');

    posterImage.classList.add('is-changing');
    loadPoster(region.poster)
      .then(source => {
        if (token !== changeToken) return;
        window.setTimeout(() => {
          posterImage.src = source;
          posterImage.alt = `${region.display}海報`;
          posterImage.classList.remove('is-changing');
        }, 110);
      })
      .catch(() => {
        if (token === changeToken) posterImage.classList.remove('is-changing');
      });

    if (options.updateHash) {
      const nextHash = `#explore?region=${encodeURIComponent(id)}`;
      history.replaceState(null, '', nextHash);
    }
  }

  function navigate(delta) {
    const index = regions.findIndex(region => region.id === activeId);
    const next = regions[(index + delta + regions.length) % regions.length];
    selectRegion(next.id, { lock: true, updateHash: true });
  }

  mapRegions.forEach(el => {
    const region = byId.get(el.dataset.region);
    if (!region) return;

    el.addEventListener('pointerenter', event => {
      selectRegion(region.id);
      tooltip.textContent = region.name;
      tooltip.classList.add('is-visible');
      tooltip.style.left = `${event.clientX}px`;
      tooltip.style.top = `${event.clientY}px`;
    });
    el.addEventListener('pointermove', event => {
      tooltip.style.left = `${event.clientX}px`;
      tooltip.style.top = `${event.clientY}px`;
    });
    el.addEventListener('pointerleave', () => {
      tooltip.classList.remove('is-visible');
      if (activeId !== lockedId) selectRegion(lockedId);
    });
    el.addEventListener('click', () => selectRegion(region.id, { lock: true, updateHash: true, force: true }));
    el.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectRegion(region.id, { lock: true, updateHash: true, force: true });
      }
    });
  });

  document.getElementById('previous-region').addEventListener('click', () => navigate(-1));
  document.getElementById('next-region').addEventListener('click', () => navigate(1));

  document.getElementById('random-region').addEventListener('click', () => {
    let next;
    do next = regions[Math.floor(Math.random() * regions.length)]; while (next.id === activeId);
    lockedId = next.id;
    selectRegion(next.id, { lock: true, force: true });
    document.getElementById('explore').scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth' });
  });

  function parseRegionFromHash() {
    const match = location.hash.match(/region=([^&]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  const initialRegion = parseRegionFromHash();
  if (initialRegion && byId.has(initialRegion)) {
    activeId = '';
    lockedId = initialRegion;
    selectRegion(initialRegion, { lock: true, force: true });
    requestAnimationFrame(() => document.getElementById('explore').scrollIntoView());
  } else {
    const initial = byId.get(activeId);
    root.style.setProperty('--accent', initial.accent);
    root.style.setProperty('--accent-rgb', initial.rgb);
    mapRegions.forEach(el => el.classList.toggle('is-active', el.dataset.region === activeId));
  }

  window.addEventListener('hashchange', () => {
    const id = parseRegionFromHash();
    if (id && byId.has(id)) selectRegion(id, { lock: true, force: true });
  });

  const hero = document.getElementById('home');
  hero.addEventListener('pointermove', event => {
    if (document.body.classList.contains('reduce-motion')) return;
    const x = (event.clientX / window.innerWidth - .5) * 2;
    const y = (event.clientY / window.innerHeight - .5) * 2;
    hero.style.setProperty('--pointer-x', x.toFixed(3));
    hero.style.setProperty('--pointer-y', y.toFixed(3));
  });

  posterFrame.addEventListener('pointermove', event => {
    if (document.body.classList.contains('reduce-motion')) return;
    const rect = posterFrame.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    posterFrame.style.setProperty('--poster-tilt-x', `${(x * 2.6).toFixed(2)}deg`);
    posterFrame.style.setProperty('--poster-tilt-y', `${(-y * 2.2).toFixed(2)}deg`);
  });
  posterFrame.addEventListener('pointerleave', () => {
    posterFrame.style.setProperty('--poster-tilt-x', '0deg');
    posterFrame.style.setProperty('--poster-tilt-y', '0deg');
  });

  const pages = [...document.querySelectorAll('[data-page]')];
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || entry.intersectionRatio < .55) return;
      const id = entry.target.dataset.page;
      document.querySelectorAll('[data-dot]').forEach(dot => dot.classList.toggle('is-active', dot.dataset.dot === id));
      document.querySelectorAll('[data-nav]').forEach(link => link.classList.toggle('is-active', link.dataset.nav === id));
      header.classList.toggle('is-solid', id !== 'home');
    });
  }, { root: window.innerWidth > 820 ? pageScroll : null, threshold: [.55] });
  pages.forEach(page => observer.observe(page));

  motionToggle.addEventListener('click', () => {
    const next = !document.body.classList.contains('reduce-motion');
    document.body.classList.toggle('reduce-motion', next);
    motionToggle.setAttribute('aria-pressed', String(next));
    motionToggle.querySelector('span:last-child').textContent = next ? '恢復動態' : '減少動態';
  });

  document.addEventListener('keydown', event => {
    if (!document.getElementById('explore').matches(':hover') && document.activeElement?.closest('#taiwan-map') == null) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') navigate(1);
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') navigate(-1);
  });

  const heroImage = document.getElementById('hero-image');
  const closingImage = document.getElementById('closing-image');
  const activePoster = byId.get(activeId);
  const firstPaint = [
    loadPoster('taiwan').then(source => {
      heroImage.src = source;
      closingImage.src = source;
    }),
    loadPoster(activePoster.poster).then(source => {
      if (activePoster.id === activeId) posterImage.src = source;
    })
  ];

  Promise.allSettled(firstPaint).then(() => {
    window.setTimeout(() => loadingScreen.classList.add('is-hidden'), 260);
  });

  const preloadOrder = ['taipei', 'new-taipei', 'taoyuan', 'taichung', 'tainan', 'pingtung'];
  window.setTimeout(() => preloadOrder.forEach(name => loadPoster(name).catch(() => {})), 1400);
})();
