(async function () {
  const input = document.getElementById('blog-search');
  const list = document.getElementById('post-list');
  const out = document.getElementById('search-results');
  const pagination = document.querySelector('.pagination');
  let idx = null;
  input.addEventListener('input', async function () {
    const q = input.value.trim().toLowerCase();
    if (!q) { out.hidden = true; list.hidden = false; pagination.hidden = false; return; }
    if (!idx) idx = await (await fetch('/search.json')).json();
    const hits = idx.filter(p => (p.title + ' ' + p.tags).toLowerCase().includes(q)).slice(0, 30);
    out.innerHTML = hits.map(p =>
      `<li><time>${p.date}</time><h2><a href="${p.url}">${p.title}</a></h2></li>`
    ).join('') || '<li><p class="meta">沒有符合的文章。</p></li>';
    out.hidden = false; list.hidden = true; pagination.hidden = true;
  });
})();
