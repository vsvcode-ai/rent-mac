/* 南洋桌面 NanyangDesk — 原型共享逻辑（数据存 localStorage，前台/用户后台/管理后台共用） */
const NYD = (() => {
  const PLANS = [
    { id: 'm1',  name: '月付',   months: 1,  monthly: 799, support: false },
    { id: 'm3',  name: '季付',   months: 3,  monthly: 699, support: false },
    { id: 'm6',  name: '半年付', months: 6,  monthly: 599, support: true },
    { id: 'm12', name: '年付',   months: 12, monthly: 499, support: true, best: true },
  ];
  const STATUS = {
    pending:   { t: '待付款',   c: 'warn' },
    verifying: { t: '待核对',   c: 'info' },
    queued:    { t: '待开通',   c: 'brand' },
    active:    { t: '使用中',   c: 'ok' },
    failed:    { t: '核对失败', c: 'danger' },
    cancelled: { t: '已取消',   c: 'mute' },
    refund:    { t: '已退款',   c: 'mute' },
    done:      { t: '已完成',   c: 'mute' },
  };
  const KEY = 'nyd_state_v1';
  const DAY = 86400000, HOUR = 3600000;
  const TOTAL = 200, BASE_IDLE = 121;

  const plan = id => PLANS.find(p => p.id === id);
  const money = n => '¥' + Number(n).toLocaleString('zh-CN');
  const pad = n => String(n).padStart(2, '0');
  const fmtDate = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fmtTime = t => { const d = new Date(t); return `${fmtDate(t)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const ago = t => { const m = Math.max(1, Math.round((Date.now() - t) / 60000)); return m < 60 ? m + ' 分钟前' : m < 1440 ? Math.round(m / 60) + ' 小时前' : Math.round(m / 1440) + ' 天前'; };
  const addMonths = (t, m) => { const d = new Date(t); d.setMonth(d.getMonth() + m); return d.getTime(); };
  const rnd = (n, s = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join('');
  const price = (id, qty) => { const p = plan(id); const total = p.monthly * p.months * qty; return { unit: p.monthly, months: p.months, total, save: (799 - p.monthly) * p.months * qty }; };
  const devInfo = (i) => ({ code: 'NYD-MY-' + String(i).padStart(4, '0'), ip: `103.${[17, 52, 118][i % 3]}.${(i * 7) % 250 + 2}.${(i * 13) % 250 + 3}`, rack: `R${pad(Math.floor((i - 1) / 20) + 1)}-${pad(((i - 1) % 20) + 1)}` });

  /* ---------- 种子数据 ---------- */
  function seed() {
    const now = Date.now();
    const mk = (o) => Object.assign({ kind: 'new', qty: 1, devices: [], xyNo: '', xyNick: '', contact: {} }, o);
    const dev = (i, uu) => Object.assign(devInfo(i), { uuCode: uu || String(Math.floor(100000000 + Math.random() * 899999999)), uuPwd: rnd(8), macUser: 'nydesk', macPwd: rnd(12) });
    const s = {
      user: null, sel: { plan: 'm12', qty: 1 }, seq: 12, ticketSeq: 3,
      orders: [
        mk({ no: 'NY2611090003', email: 'wang@example.com', plan: 'm3', qty: 2, status: 'queued', createdAt: now - 3 * DAY - 2 * HOUR, paidAt: now - 3 * DAY, xyNo: '4103928811027', xyNick: '阿旺同学', contact: { wechat: 'wang_dev' } }),
        mk({ no: 'NY2611100001', email: 'li@startup.io', plan: 'm12', qty: 3, status: 'verifying', createdAt: now - 20 * HOUR, paidAt: now - 18 * HOUR, xyNo: '4104557093120', xyNick: '李小河', contact: { telegram: '@lihe' } }),
        mk({ no: 'NY2611110002', email: 'chen@studio.cn', plan: 'm1', qty: 1, status: 'verifying', createdAt: now - 3 * HOUR, paidAt: now - 2 * HOUR, xyNo: '4105100229873', xyNick: 'chen_ios', contact: { wechat: 'chenios2026' } }),
        mk({ no: 'NY2611110004', email: 'zhao@qq.com', plan: 'm6', qty: 1, status: 'verifying', createdAt: now - 9 * HOUR, paidAt: now - 8 * HOUR, xyNo: '4105099100001', xyNick: '赵四', contact: { wechat: 'zhao4' } }),
        mk({ no: 'NY2611110006', email: 'sun@mail.com', plan: 'm3', qty: 1, status: 'pending', createdAt: now - 5 * HOUR, contact: { wechat: 'sunsun' } }),
        mk({ no: 'NY2611080005', email: 'zhou@dev.cn', plan: 'm12', qty: 1, status: 'queued', createdAt: now - 5 * DAY, paidAt: now - 4.7 * DAY, xyNo: '4102773300192', xyNick: '周周', contact: { wechat: 'zhouzhou' } }),
        mk({ no: 'NY2610200007', email: 'xu@corp.com', plan: 'm6', qty: 2, status: 'active', createdAt: now - 22 * DAY, paidAt: now - 21 * DAY, activatedAt: now - 20 * DAY, endAt: addMonths(now - 20 * DAY, 6), xyNo: '4091002233445', xyNick: '徐工', contact: { telegram: '@xu' }, devices: [dev(11), dev(12)] }),
        mk({ no: 'NY2610050008', email: 'ma@cross.cn', plan: 'm1', qty: 1, status: 'active', createdAt: now - 38 * DAY, paidAt: now - 37 * DAY, activatedAt: now - 35 * DAY, endAt: now + 1.5 * DAY, xyNo: '4088300199123', xyNick: '马可', contact: { wechat: 'make88' }, devices: [dev(21)] }),
        mk({ no: 'NY2609300009', email: 'he@old.cn', plan: 'm3', qty: 1, status: 'done', createdAt: now - 60 * DAY, paidAt: now - 59 * DAY, activatedAt: now - 57 * DAY, endAt: now - 2 * DAY, xyNo: '4080112233009', xyNick: '何', contact: { wechat: 'he' }, devices: [dev(31)] }),
      ],
      tickets: [
        { id: 'T2611100001', email: 'xu@corp.com', cat: '无法连接', content: 'UU 远程连接提示设备离线，已重启过一次。', status: '处理中', createdAt: now - 6 * HOUR, assignee: '运维 Lin' },
        { id: 'T2611090002', email: 'ma@cross.cn', cat: '重置密码', content: '需要重置 macOS 登录密码。', status: '已解决', createdAt: now - 2 * DAY, assignee: '运维 Lin' },
      ],
    };
    return s;
  }
  let S;
  function load() { try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; } if (!S) { S = seed(); save(); } return S; }
  function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
  function reset() { localStorage.removeItem(KEY); sessionStorage.clear(); S = seed(); save(); }
  load();

  /* ---------- 业务操作 ---------- */
  function login(email, extra) {
    S.user = Object.assign({ email, wechat: '', telegram: '' }, extra);
    const mine = S.orders.some(o => o.email === email);
    if (!mine) { // 新用户：灌入示范订单，方便走完流程
      const now = Date.now();
      const d = Object.assign(devInfo(42), { uuCode: '583920174', uuPwd: 'k7Rt9xQm', macUser: 'nydesk', macPwd: 'Hq4-vN8zXe2P' });
      S.orders.push({ no: 'NY2610010010', email, kind: 'new', plan: 'm12', qty: 1, status: 'active', createdAt: now - 40 * DAY, paidAt: now - 39 * DAY, activatedAt: now - 38 * DAY, endAt: addMonths(now - 38 * DAY, 12), xyNo: '4085588120044', xyNick: 'demo', contact: {}, devices: [d] });
      S.orders.push({ no: 'NY2611110011', email, kind: 'new', plan: 'm3', qty: 2, status: 'pending', createdAt: now - 3 * HOUR, xyNo: '', xyNick: '', contact: {}, devices: [] });
    }
    save();
  }
  function logout() { S.user = null; save(); }
  function myOrders() { return S.user ? S.orders.filter(o => o.email === S.user.email).sort((a, b) => b.createdAt - a.createdAt) : []; }
  function getOrder(no) { return S.orders.find(o => o.no === no); }
  function createOrder({ plan: pid, qty, contact, kind = 'new', renewOf }) {
    const d = new Date(); S.seq++;
    const no = `NY${d.getFullYear() % 100}${pad(d.getMonth() + 1)}${pad(d.getDate())}${String(S.seq).padStart(4, '0')}`;
    const o = { no, email: S.user.email, kind, renewOf, plan: pid, qty, status: 'pending', createdAt: Date.now(), contact, xyNo: '', xyNick: '', devices: [] };
    S.orders.push(o); save(); return o;
  }
  // 剩余可租台数 = 台账空闲基数 − 本次原型里新开通的台数（管理后台开通时标记 fresh）
  function idleCount() {
    const used = S.orders.reduce((a, o) => a + (o.fresh ? o.devices.length : 0), 0);
    return Math.max(0, BASE_IDLE - used);
  }
  function setStatus(no, st, patch) { const o = getOrder(no); Object.assign(o, { status: st }, patch || {}); save(); return o; }
  function deadline(o) { return (o.paidAt || o.createdAt) + 7 * DAY; }

  /* ---------- UI 组件 ---------- */
  const MARK = `<svg viewBox="0 0 24 24" fill="none"><rect x="1.5" y="1.5" width="21" height="21" rx="6" stroke="#f2f1ec" stroke-width="1.5"/><rect x="6" y="9.5" width="12" height="5" rx="1.6" fill="#f2f1ec"/><circle cx="15.6" cy="12" r="1" fill="#0b0b0a"/></svg>`;
  const brandHTML = (href = 'index.html') => `<a class="brand" href="${href}">${MARK}<span>南洋桌面</span><small>NANYANGDESK</small></a>`;

  function mountHeader(active) {
    const el = document.getElementById('site-header'); if (!el) return;
    const u = S.user;
    el.className = 'site-header';
    el.innerHTML = `<div class="wrap nav">${brandHTML()}
      <nav class="nav-links" id="navlinks">
        <a href="index.html#why" class="${active === 'why' ? 'on' : ''}">产品</a>
        <a href="index.html#scenes">使用场景</a>
        <a href="index.html#pricing">价格</a>
        <a href="help.html" class="${active === 'help' ? 'on' : ''}">帮助中心</a>
      </nav>
      <div class="nav-right">
        ${u ? `<a class="btn btn-ghost btn-sm" href="account.html">我的账户</a>` : `<a class="btn btn-ghost btn-sm" href="auth.html">登录</a><a class="btn btn-primary btn-sm" href="index.html#pricing">立即租用 <span class="arr">→</span></a>`}
        <button class="menu-btn" aria-label="菜单" aria-expanded="false" onclick="const o=document.getElementById('navlinks').classList.toggle('open');this.classList.toggle('x',o);this.setAttribute('aria-expanded',o)"><span></span></button>
      </div></div>`;
    addEventListener('scroll', () => el.classList.toggle('scrolled', scrollY > 8), { passive: true });
  }
  function mountFooter() {
    const el = document.getElementById('site-footer'); if (!el) return;
    el.className = 'site-footer';
    el.innerHTML = `<div class="wrap"><div class="foot-grid">
      <div>${brandHTML()}<p>马来西亚机房自营的 Mac mini 租赁。独享实体机，独立固定 IP，用 UU 远程随时连接。</p><span class="status">所有机器运行正常 · ${idleCount()} 台可租</span></div>
      <div><h4>产品</h4><a href="index.html#pricing">套餐价格</a><a href="index.html#why">专属设备</a><a href="index.html#scenes">使用场景</a></div>
      <div><h4>帮助</h4><a href="help.html">连接教程</a><a href="help.html#faq">常见问题</a><a href="account.html#tickets">提交工单</a></div>
      <div><h4>政策</h4><a href="refund.html">退款政策</a><a href="#" onclick="return NYD.toast('原型：服务条款页')">服务条款</a><a href="#" onclick="return NYD.toast('原型：隐私政策页')">隐私政策</a><a href="#" onclick="return NYD.toast('原型：可接受使用政策页')">可接受使用政策</a></div>
    </div><div class="legal"><span>© 2026 南洋桌面 NanyangDesk · 机房：马来西亚 · UTC+8</span><span>南洋桌面为独立服务，与 Apple Inc. 无关联，也未获其认可。Mac、Mac mini、macOS 是 Apple Inc. 的商标。</span></div><div class="wordmark" aria-hidden="true">NANYANGDESK</div></div>`;
  }
  function qrSvg(seed = 'x', label) {
    let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const r = () => (h = (h * 1664525 + 1013904223) >>> 0) / 4294967296;
    const N = 25, cells = [];
    const finder = (x, y) => (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!finder(x, y) && r() > .52) cells.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02"/>`);
    const fd = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" rx="1"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#f2f1ec"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
    return `<svg viewBox="0 0 25 25" fill="#0b0b0a" shape-rendering="crispEdges">${cells.join('')}${fd(0, 0)}${fd(N - 7, 0)}${fd(0, N - 7)}<rect x="9.5" y="9.5" width="6" height="6" rx="1.4" fill="#f2f1ec"/><rect x="10.6" y="10.6" width="3.8" height="3.8" rx=".9" fill="#0b0b0a"/></svg>`;
  }
  function mountSupport() {
    const fab = document.createElement('button'); fab.className = 'fab';
    fab.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>联系客服`;
    fab.onclick = () => modal('support');
    document.body.appendChild(fab);
    const m = document.createElement('div'); m.className = 'modal-bg'; m.id = 'modal-support';
    m.innerHTML = `<div class="modal" style="text-align:center"><button class="x" onclick="NYD.closeModal('support')">✕</button>
      <h3>联系客服</h3><p class="muted" style="font-size:14.5px">扫码添加微信，请备注「<b style="color:var(--ink)">南洋桌面</b>」</p>
      <div class="qr">${qrSvg('wechat-support')}</div>
      <p class="muted" style="font-size:13px">微信：<b class="mono" style="color:var(--ink)">nanyangdesk01</b>（原型占位）</p>
      <div style="margin-top:18px;padding-top:18px;border-top:1px solid var(--line);font-size:14px" class="muted">备用：Telegram <b style="color:var(--ink)">@nanyangdesk</b> · 邮箱 <b style="color:var(--ink)">hi@nanyangdesk.com</b></div>
      <p class="muted" style="font-size:12.5px;margin-top:12px">服务时间：每天 10:00–23:00（UTC+8）</p></div>`;
    m.addEventListener('click', e => { if (e.target === m) closeModal('support'); });
    document.body.appendChild(m);
  }
  function mountDock(page) {
    const d = document.createElement('div'); d.className = 'demo-dock';
    d.innerHTML = `<em>原型演示</em><a href="index.html">前台</a><a href="${S.user ? 'account.html' : 'auth.html'}">用户后台</a><a href="admin.html">管理后台</a><button id="dock-reset">重置数据</button>`;
    document.body.appendChild(d);
    d.querySelector('#dock-reset').onclick = () => { reset(); toast('演示数据已重置'); setTimeout(() => location.href = 'index.html', 600); };
  }
  function modal(id) { document.getElementById('modal-' + id).classList.add('on'); }
  function closeModal(id) { document.getElementById('modal-' + id).classList.remove('on'); }
  let tt;
  function toast(msg) { let t = document.querySelector('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = msg; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2200); return false; }
  function copy(text, msg = '已复制') { (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).catch(() => { const a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) {} a.remove(); }); toast(msg); }
  // 数字递增：从当前显示值过渡到目标值；同一元素的新动画会取消旧动画；进度限制在 [0,1]
  function animateNumber(el, to, dur = 500) {
    if (el._raf) cancelAnimationFrame(el._raf);
    const from = Number(String(el.textContent).replace(/[^\d.-]/g, '')) || 0;
    el.dataset.v = to;
    if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to.toLocaleString('zh-CN'); return; }
    const t0 = performance.now();
    const step = () => {
      const k = Math.min(1, Math.max(0, (performance.now() - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e).toLocaleString('zh-CN');
      el._raf = k < 1 ? requestAnimationFrame(step) : null;
    };
    el._raf = requestAnimationFrame(step);
  }
  function requireLogin() { if (!S.user) { location.href = 'auth.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search + location.hash); return false; } return true; }
  const pill = st => `<span class="pill ${STATUS[st].c}">${STATUS[st].t}</span>`;
  /* 滚动入场：.rv 元素进入视口加 .in；[data-count] 数字递增；.dotgrid.anim 逐点出现 */
  function observe() {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const els = document.querySelectorAll('.rv,[data-count],.dotgrid.anim');
    if (!('IntersectionObserver' in window) || reduce) { els.forEach(e => { e.classList.add('in'); if (e.dataset.count) e.textContent = Number(e.dataset.count).toLocaleString('zh-CN'); }); return; }
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const t = e.target; t.classList.add('in'); io.unobserve(t);
      if (t.dataset.count) { t.dataset.v = 0; animateNumber(t, Number(t.dataset.count), 1400); }
    }), { threshold: .14, rootMargin: '0px 0px -6% 0px' });
    els.forEach(e => io.observe(e));
  }
  function init(active, opts = {}) {
    mountHeader(active); mountFooter(); if (!opts.noSupport) mountSupport(); mountDock();
    requestAnimationFrame(observe);
  }

  return { PLANS, STATUS, TOTAL, BASE_IDLE, get S() { return S; }, plan, money, pad, fmtDate, fmtTime, ago, addMonths, rnd, price, devInfo, save, reset, login, logout, myOrders, getOrder, createOrder, idleCount, setStatus, deadline, qrSvg, brandHTML, MARK, modal, closeModal, toast, copy, animateNumber, requireLogin, pill, init, DAY, HOUR };
})();
