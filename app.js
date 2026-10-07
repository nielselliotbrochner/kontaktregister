
(function () {
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function uniq(arr) { return arr.filter(function (x, i) { return arr.indexOf(x) === i; }); }

  var TODAY = window.__TODAY || (function () { var d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); })();
  var PH = {
    rygte: { n: 'Rygte', c: '--ph-rygte', p: 10 }, kval: { n: 'Kvalificeret', c: '--ph-kval', p: 25 }, pq: { n: 'PQ', c: '--ph-pq', p: 40 },
    tilbud: { n: 'Tilbud', c: '--ph-tilbud', p: 55 }, vundet: { n: 'Vundet', c: '--ph-vundet', p: 100 }, tabt: { n: 'Tabt', c: '--ph-tabt', p: 0 },
    fravalgt: { n: 'Fravalgt', c: '--ph-fra', p: 0 }
  };
  var KAT = { bygherre: 'Bygherre', arkitekt: 'Arkitekt', entreprenoer: 'Entreprenør', raadgiver: 'Rådgiver', andet: 'Andet', egen: 'Egen virksomhed' };
  var TYPER = ['Kaffemøde', 'Frokostmøde', 'Kundemøde', 'Reception', 'Konference', 'Netværksarrangement', 'Telefonsamtale', 'Andet'];
  var VARSEL = [[0, 'På dagen kl. 08:00'], [1, '1 dag før'], [7, '1 uge før']];
  var MND = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];

  var TYPO = ['Renovering', 'Skoler og uddannelse', 'Idræt', 'Kultur', 'Boliger (private)', 'Boliger (almene)', 'Kontor', 'Laboratorier', 'Fredede bygninger', 'Hospitaler og sundhed', 'Industri og farma', 'Butikker', 'Hoteller'];
  var TYPO_KAT = ['arkitekt', 'entreprenoer'];
  var firms = [], persons = [], projects = [], acts = [], followups = [];

  // Datohjælp
  function fmtDate(iso) { return new Date(iso + 'T12:00:00').toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function fmtMonth(ym) { return new Date(ym + '-15T12:00:00').toLocaleDateString('da-DK', { month: 'short', year: 'numeric' }); }
  function addDays(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function diffDays(a, b) { return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000); }
  function monthsSince(ym) { var a = ym.split('-'), t = TODAY.split('-'); return (+t[0] - +a[0]) * 12 + (+t[1] - +a[1]); }
  function slug(s) { return s.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa').replace(/[^a-z ]/g, '').trim().split(/\s+/).join('.'); }

  // Ansættelser
  function cur(p) { for (var i = 0; i < p.emp.length; i++) if (p.emp[i].til == null) return p.emp[i]; return null; }
  function firmOf(p) { var c = cur(p); return c ? byId(firms, c.firm) : null; }
  function titelOf(p) { var c = cur(p); return c ? c.titel : ''; }
  function firmAt(p, dato) {
    var m = dato.slice(0, 7);
    for (var i = 0; i < p.emp.length; i++) { var e = p.emp[i]; if (e.fra <= m && (e.til == null || m < e.til)) return byId(firms, e.firm); }
    return firmOf(p);
  }
  function isColleague(p) { var f = firmOf(p); return !!f && f.kat === 'egen'; }
  function stale(p) { return !!cur(p) && monthsSince(p.bek) >= 18; }
  function firmPeople(fid) { return persons.filter(function (p) { var c = cur(p); return c && c.firm === fid; }); }
  function formerPeople(fid) { return persons.filter(function (p) { var c = cur(p); return (!c || c.firm !== fid) && p.emp.some(function (e) { return e.firm === fid; }); }); }
  function email(p) { return p.email || ''; }
  function tel(p) { return p.tel || ''; }

  function sortActs(list) { return list.slice().sort(function (a, b) { return a.dato < b.dato ? 1 : a.dato > b.dato ? -1 : b.id - a.id; }); }
  function personActs(pid) { return sortActs(acts.filter(function (a) { return a.people.indexOf(pid) >= 0; })); }
  function lastMet(pid) { var l = personActs(pid); return l.length ? l[0].dato : null; }
  function firmActs(fid) {
    return sortActs(acts.filter(function (a) { return a.people.some(function (id) { var p = byId(persons, id), f = p && firmAt(p, a.dato); return f && f.id === fid; }); }));
  }
  function colleagues() { return persons.filter(isColleague); }

  // Opfølgning
  function alarmOn(f) { return !f.done && TODAY >= addDays(f.forfald, -f.varsel); }
  function bucket(f) { if (f.done) return 'done'; var d = diffDays(f.forfald, TODAY); return d < 0 ? 'over' : d === 0 ? 'today' : d <= 7 ? 'week' : 'later'; }
  function relDays(iso) { var d = diffDays(iso, TODAY); return d < 0 ? (-d) + (d === -1 ? ' dag' : ' dage') + ' forsinket' : d === 0 ? 'i dag' : d === 1 ? 'i morgen' : 'om ' + d + ' dage'; }
  function varselText(v) { for (var i = 0; i < VARSEL.length; i++) if (VARSEL[i][0] === v) return VARSEL[i][1]; return ''; }
  function openFuFor(pid) { return followups.some(function (f) { return !f.done && f.person === pid; }); }

  function projChip(pr) {
    return '<span class="chip"><span class="dot' + (pr.fase === 'fravalgt' ? ' fra' : '') + '" style="--c:var(' + PH[pr.fase].c + ');margin-top:0"></span>' + esc(pr.navn) + '<span class="muted">' + PH[pr.fase].n + '</span></span>';
  }
  function projRow(pr, meta) {
    var fra = pr.fase === 'fravalgt', b = byId(firms, pr.bygherre), m = [];
    if (b) m.push(esc(b.navn)); else if (pr.bygherreNavn) m.push(esc(pr.bygherreNavn));
    if (pr.honorar != null) m.push(String(pr.honorar).replace('.', ',') + ' mio. kr. i honorar');
    if (meta) m.push(meta);
    if (pr.loc) m.push('<button type="button" class="link" data-mapproj="' + pr.id + '">Vis på kort</button>');
    return '<li><span class="dot' + (fra ? ' fra' : '') + '" style="--c:var(' + PH[pr.fase].c + ')"></span><span class="nm"><button type="button" class="link" data-pj="' + pr.id + '">' + esc(pr.navn) + '</button></span><span class="ph">' + PH[pr.fase].n + '</span>' +
      '<span class="meta">' + m.join(' · ') + (fra && pr.begr ? '<br>Begrundelse: ' + esc(pr.begr) : '') + '</span></li>';
  }
  function go(kind, id) { return '<button type="button" class="link" data-go="' + kind + ':' + id + '">'; }
  function pname(id) { var p = byId(persons, id); return p ? go('p', p.id) + esc(p.navn) + '</button>' : ''; }

  // Tilstand
  var tab = 'p';
  var sel = { p: null, f: null, a: null, l: null, k: null, kp: null };
  var open = { p: false, f: false, a: false, l: false, j: false };
  var formPeople = [], formProjs = [], formKol = [], formFu = [];

  function pickInitial() {
    var withActs = persons.filter(function (p) { return !isColleague(p) && lastMet(p.id); });
    withActs.sort(function (a, b) { return lastMet(a.id) < lastMet(b.id) ? 1 : -1; });
    sel.p = withActs.length ? withActs[0].id : (persons.length ? persons[0].id : null);
    sel.a = acts.length ? sortActs(acts)[0].id : null;
    sel.f = firms.length ? firms[0].id : null;
    if (selJ == null && projects.length) selJ = projects[0].id;
  }

  // Kalender: Outlook-link og .ics
  function calCtx(f) {
    var parts = [];
    if (f.person) { var pp = byId(persons, f.person); if (pp) parts.push('Person: ' + pp.navn); }
    if (f.act) { var aa = byId(acts, f.act); if (aa) parts.push('Aktivitet: ' + aa.titel); }
    if (f.proj) { var pj = byId(projects, f.proj); if (pj) parts.push('Projekt: ' + pj.navn); }
    return parts.join(' / ');
  }
  function outlookUrl(f) {
    return 'https://outlook.office.com/calendar/0/deeplink/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent&allday=true' +
      '&subject=' + encodeURIComponent('Opfølgning: ' + f.tekst) + '&body=' + encodeURIComponent(calCtx(f)) +
      '&startdt=' + f.forfald + '&enddt=' + addDays(f.forfald, 1);
  }
  function fuItem(f, ctx) {
    var links = [];
    if (f.person) links.push(pname(f.person));
    if (f.act) { var a = byId(acts, f.act); if (a) links.push(go('a', a.id) + esc(a.titel) + '</button>'); }
    if (f.proj) { var pr = byId(projects, f.proj); if (pr) links.push(esc(pr.navn)); }
    var late = !f.done && diffDays(f.forfald, TODAY) < 0;
    return '<li class="fu' + (f.done ? ' done' : '') + (late ? ' late' : '') + '">' +
      '<input type="checkbox" id="fu-' + ctx + '-' + f.id + '" data-fudone="' + f.id + '"' + (f.done ? ' checked' : '') + ' aria-label="Markér som udført">' +
      '<div><label for="fu-' + ctx + '-' + f.id + '" class="tx">' + esc(f.tekst) + '</label>' +
      '<div class="mt"><span class="due">Forfald ' + fmtDate(f.forfald) + (f.done ? '' : ' · ' + relDays(f.forfald)) + '</span> · Alarm ' + esc(varselText(f.varsel).toLowerCase()) + (alarmOn(f) ? ' · <span class="alr">alarm udløst</span>' : '') + (links.length ? '<br>' + links.join(' · ') : '') + '</div></div>' +
      (f.done ? '<span></span>' : '<span class="fuact"><button type="button" class="btn small" data-snooze="' + f.id + '">Udsæt 1 uge</button><a class="btn small" target="_blank" rel="noopener" title="Opret aftale i Outlook" href="' + esc(outlookUrl(f)) + '">Outlook</a></span>') + '</li>';
  }
  function varselOptions() { return VARSEL.map(function (v) { return '<option value="' + v[0] + '">' + v[1] + '</option>'; }).join(''); }
  function fuAddForm(key) {
    var id = key.replace(':', '-');
    return '<details class="inl"><summary>Tilføj opfølgning</summary><form class="mini" data-fu="' + key + '">' +
      '<label for="fu-' + id + '-t">Hvad skal ske?<input type="text" id="fu-' + id + '-t" name="t" placeholder="fx Send pris"></label>' +
      '<label for="fu-' + id + '-d">Forfald<input type="date" id="fu-' + id + '-d" name="d" value="' + addDays(TODAY, 7) + '"></label>' +
      '<label for="fu-' + id + '-v">Alarm<select id="fu-' + id + '-v" name="v">' + varselOptions() + '</select></label>' +
      '<div class="rowf"><button type="button" class="btn small" data-q="7" data-target="fu-' + id + '-d">+1 uge</button><button type="button" class="btn small" data-q="14" data-target="fu-' + id + '-d">+2 uger</button><button type="button" class="btn small" data-q="30" data-target="fu-' + id + '-d">+1 måned</button></div>' +
      '<div class="actions"><button type="submit" class="btn primary small">Gem opfølgning</button></div></form></details>';
  }
  function fuSection(kind, id) {
    var list = followups.filter(function (f) { return kind === 'p' ? f.person === id : f.act === id; }).sort(function (a, b) { return a.done - b.done || (a.forfald < b.forfald ? -1 : 1); });
    return '<section><h3>Opfølgning</h3>' + (list.length ? '<ul class="fulist">' + list.map(function (f) { return fuItem(f, kind); }).join('') + '</ul>' : '<p class="muted">Ingen opfølgning registreret.</p>') + fuAddForm(kind + ':' + id) + '</section>';
  }

  // Personer
  // Kort: opfundne adresser og koordinater (virksomhedens adresse = kontaktpersonens arbejdssted)
  var KCOL = { bygherre: '#BA1223', arkitekt: '#1F6E8C', entreprenoer: '#9A6200', raadgiver: '#5B5F97', andet: '#8A7B75', egen: '#3A3A3A' };
  // Grov skitse af Danmark, vises som baggrund hvis kortfliserne ikke kan hentes
  var DK = [
    [[54.90, 8.67], [55.47, 8.40], [55.62, 8.13], [56.00, 8.12], [56.70, 8.21], [57.12, 8.60], [57.45, 9.00], [57.60, 9.95], [57.73, 10.60], [57.44, 10.54], [56.99, 10.31], [56.65, 10.50], [56.40, 10.92], [56.15, 10.22], [55.86, 9.85], [55.70, 9.54], [55.50, 9.48], [55.25, 9.52], [54.80, 9.45]],
    [[55.50, 9.73], [55.57, 10.09], [55.45, 10.66], [55.31, 10.79], [55.06, 10.61], [55.09, 10.24], [55.27, 9.90]],
    [[55.33, 11.14], [55.68, 11.09], [55.97, 11.35], [55.97, 11.85], [56.12, 12.30], [56.04, 12.62], [55.68, 12.60], [55.46, 12.18], [55.28, 12.45], [55.12, 12.05], [55.00, 11.90], [55.25, 11.28]],
    [[54.57, 11.93], [54.66, 11.72], [54.65, 11.35], [54.83, 11.00], [54.97, 11.40], [54.88, 12.05]],
    [[55.00, 14.80], [55.12, 14.70], [55.28, 14.80], [55.30, 14.99], [55.18, 15.14], [55.05, 15.10]]
  ];
  var HASL = typeof L !== 'undefined';
  var map = null, mapLayer = null;
  function km(a, b) {
    var R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
    var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function mapMatch(p) {
    var kat = $('#k-k').value, lid = $('#l-k').value, q = $('#q-k').value.trim().toLowerCase(), f = firmOf(p);
    if (!f || !f.adr) return false;
    if (kat && f.kat !== kat) return false;
    if (lid && !lists.some(function (l) { return l.id === +lid && l.members.indexOf(p.id) >= 0; })) return false;
    return !q || (p.navn + ' ' + f.navn + ' ' + titelOf(p)).toLowerCase().indexOf(q) >= 0;
  }
  function mapGroups() {
    var g = {};
    persons.forEach(function (p) { if (mapMatch(p)) { var f = firmOf(p); (g[f.id] = g[f.id] || []).push(p); } });
    return g;
  }
  // Projekter på kort: opfundne lokationer
  var kph = { rygte: true, kval: true, pq: true, tilbud: true, vundet: true, tabt: false, fravalgt: false };
  function pval(pr) { return (pr.honorar || 0) * ($('#mt-k').value === 'anlaeg' ? 10 : 1); }
  function projMatch(pr) {
    if (!pr.loc || !kph[pr.fase]) return false;
    if (pval(pr) < +$('#ms-k').value) return false;
    var q = $('#q-k').value.trim().toLowerCase(), b = byId(firms, pr.bygherre);
    return !q || (pr.navn + ' ' + (b ? b.navn : '')).toLowerCase().indexOf(q) >= 0;
  }
  function fmtMio(v) { return v.toLocaleString('da-DK', { maximumFractionDigits: 1 }) + ' mio.'; }
  function renderPhaseChips() {
    $('#kph').innerHTML = Object.keys(PH).map(function (k) {
      return '<button type="button" class="phchip" data-kphase="' + k + '" aria-pressed="' + !!kph[k] + '" style="--c:var(' + PH[k].c + ')"><i></i>' + esc(PH[k].n) + '</button>';
    }).join('');
  }
  function renderProjMap(fit) {
    var m = $('#mt-k').value, sumLbl = m === 'anlaeg' ? 'Anlægssum' : 'Honorar';
    var list = projects.filter(projMatch), maxV = list.reduce(function (x, pr) { return Math.max(x, pval(pr)); }, 1);
    $('#c-k').textContent = list.length + ' projekter · ' + fmtMio(list.reduce(function (n, pr) { return n + pval(pr); }, 0)) + ' ' + sumLbl.toLowerCase();
    $('#maplegend').innerHTML = Object.keys(PH).map(function (k) { return '<span><i style="background:var(' + PH[k].c + ')"></i>' + esc(PH[k].n) + '</span>'; }).join('') + '<span>Størrelse = ' + sumLbl.toLowerCase() + '. Stiplet = tabt eller fravalgt</span>';
    if (map) {
      map.invalidateSize(); mapLayer.clearLayers();
      list.forEach(function (pr) {
        var size = Math.round(22 + 26 * Math.sqrt(pval(pr) / maxV)), hollow = pr.fase === 'fravalgt' || pr.fase === 'tabt', col = css(PH[pr.fase].c);
        var icon = L.divIcon({ className: '', html: '<div class="pin pp' + (hollow ? ' hollow' : '') + (sel.kp === pr.id ? ' sel' : '') + '" style="width:' + size + 'px;height:' + size + 'px;background:' + col + ';--pc:' + col + '">' + Math.round(pval(pr)) + '</div>', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
        var mk = L.marker([pr.loc.lat, pr.loc.lng], { icon: icon, title: pr.navn + ', ' + PH[pr.fase].n + ', ' + fmtMio(pval(pr)), keyboard: true, riseOnHover: true });
        mk.on('click', function () { sel.kp = pr.id; renderMap(false); });
        mk.addTo(mapLayer);
      });
      if (fit) {
        var pts = list.map(function (pr) { return [pr.loc.lat, pr.loc.lng]; });
        if (!pts.length) map.setView([56.0, 10.6], 7); else if (pts.length === 1) map.setView(pts[0], 11); else map.fitBounds(pts, { padding: [40, 40], maxZoom: 12 });
      }
    }
    $('#detail-k').innerHTML = projDetailK(list, sumLbl);
  }
  function projDetailK(list, sumLbl) {
    var tot = list.reduce(function (n, pr) { return n + (pr.honorar || 0); }, 0), w = 0;
    var h = '<section><h3>I udvalget</h3><div class="sumgrid"><span><span class="k">Projekter</span><span class="v">' + list.length + '</span></span><span><span class="k">Honorar</span><span class="v">' + fmtMio(tot) + '</span></span><span><span class="k">Anlægssum</span><span class="v">' + fmtMio(tot * 10) + '</span></span></div>' +
      '<ul class="blist">' + Object.keys(PH).filter(function (k) { return list.some(function (pr) { return pr.fase === k; }); }).map(function (k) {
        var l = list.filter(function (pr) { return pr.fase === k; }); return '<li><span><span class="dot" style="--c:var(' + PH[k].c + ');display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--c);margin-right:6px"></span>' + esc(PH[k].n) + '</span><span class="muted">' + l.length + ' · ' + fmtMio(l.reduce(function (n, pr) { return n + pval(pr); }, 0)) + '</span></li>';
      }).join('') + '</ul></section>';
    var pr = byId(projects, sel.kp);
    if (!pr || !pr.loc) return h + '<p class="muted">Tryk på et projekt på kortet for at se detaljer.</p>';
    var b = byId(firms, pr.bygherre), r = +$('#r-k').value;
    var men = []; acts.forEach(function (a) { if (a.proj.indexOf(pr.id) >= 0) a.people.forEach(function (id) { var x = byId(persons, id); if (x && !isColleague(x) && men.indexOf(id) < 0) men.push(id); }); });
    var near = projects.filter(function (o) { return o.id !== pr.id && o.loc && km(pr.loc, o.loc) <= r; }).sort(function (a, c) { return km(pr.loc, a.loc) - km(pr.loc, c.loc); });
    h += '<section><h3>' + esc(pr.navn) + '</h3><p class="muted">' + esc(pr.loc.vej) + ', ' + esc(pr.loc.post) + ' ' + esc(pr.loc.by) + '</p>' +
      '<div class="grid3"><span><span class="k">Fase</span>' + esc(PH[pr.fase].n) + '</span><span><span class="k">Honorar</span>' + fmtMio(pr.honorar || 0) + '</span><span><span class="k">Anlægssum</span>' + fmtMio((pr.honorar || 0) * 10) + '</span></div>' +
      (b ? '<p><span class="k" style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Bygherre</span><br>' + go('f', b.id) + esc(b.navn) + '</button></p>' : '') +
      (pr.fase === 'fravalgt' && pr.begr ? '<p>Begrundelse: ' + esc(pr.begr) + '</p>' : '') + '</section>';
    h += '<section><h3>Nævnt af</h3>' + (men.length ? '<ul class="blist">' + men.map(function (id) { var x = byId(persons, id), f = firmOf(x); return '<li>' + go('p', id) + esc(x.navn) + '</button><span class="muted">' + (f ? esc(f.navn) : '') + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">Ingen kontakter har nævnt projektet.</p>') + '</section>';
    h += '<section><h3>Andre projekter inden for ' + r + ' km (' + near.length + ')</h3>' + (near.length ? '<ul class="blist">' + near.map(function (o) {
      return '<li><button type="button" class="link" data-kproj="' + o.id + '">' + esc(o.navn) + '</button><span class="muted">' + esc(PH[o.fase].n) + ' · ' + Math.round(km(pr.loc, o.loc)) + ' km</span></li>';
    }).join('') + '</ul>' : '<p class="muted">Ingen andre projekter i nærheden.</p>') + '</section>';
    return h;
  }
  function mapMode() { return $('#v-k').value; }
  function applyMapMode() {
    var pm = mapMode() === 'p';
    [].forEach.call(document.querySelectorAll('#panel-k .m-k'), function (el) { el.hidden = pm; });
    [].forEach.call(document.querySelectorAll('#panel-k .m-p'), function (el) { el.hidden = !pm; });
  }

  function initMap() {
    if (map) return;
    if (!HASL) { $('#mapmsg').hidden = false; $('#mapmsg').textContent = 'Kortbiblioteket kunne ikke hentes. Opdater siden.'; return; }
    map = L.map('map', { zoomControl: false, attributionControl: false, minZoom: 5, maxZoom: 17 });
    DK.forEach(function (poly) { L.polygon(poly, { stroke: true, weight: 1, color: '#9aa0a6', fillColor: '#d7dbdf', fillOpacity: 0.6, interactive: false }).addTo(map); });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    mapLayer = L.layerGroup().addTo(map);
    map.setView([56.0, 10.6], 7);
    $('#z-in').addEventListener('click', function () { map.zoomIn(); });
    $('#z-out').addEventListener('click', function () { map.zoomOut(); });
    $('#z-all').addEventListener('click', function () { fitMap(); });
  }
  function fitMap() {
    if (!map) return;
    if (mapMode() === 'p') { var pp = projects.filter(projMatch).map(function (pr) { return [pr.loc.lat, pr.loc.lng]; }); if (pp.length > 1) map.fitBounds(pp, { padding: [40, 40], maxZoom: 12 }); else if (pp.length === 1) map.setView(pp[0], 11); else map.setView([56.0, 10.6], 7); return; }
    var g = mapGroups(), pts = Object.keys(g).map(function (id) { var a = byId(firms, +id).adr; return [a.lat, a.lng]; });
    if (!pts.length) { map.setView([56.0, 10.6], 7); return; }
    if (pts.length === 1) { map.setView(pts[0], 11); return; }
    map.fitBounds(pts, { padding: [40, 40], maxZoom: 12 });
  }
  function renderMap(fit) {
    applyMapMode();
    if (mapMode() === 'p') { renderPhaseChips(); return renderProjMap(fit); }
    $('#maplegend').innerHTML = Object.keys(KAT).map(function (k) { return '<span><i style="background:' + KCOL[k] + '"></i>' + esc(KAT[k]) + '</span>'; }).join('');
    var g = mapGroups(), ids = Object.keys(g);
    var total = ids.reduce(function (n, id) { return n + g[id].length; }, 0);
    $('#c-k').textContent = total + ' personer på ' + ids.length + ' adresser';
    if (map) {
      map.invalidateSize();
      mapLayer.clearLayers();
      ids.forEach(function (id) {
        var f = byId(firms, +id), n = g[id].length, size = 26 + Math.min(n, 9) * 2.5;
        var icon = L.divIcon({ className: '', html: '<div class="pin k-' + f.kat + (sel.k === f.id ? ' sel' : '') + '" style="width:' + size + 'px;height:' + size + 'px">' + n + '</div>', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
        var m = L.marker([f.adr.lat, f.adr.lng], { icon: icon, title: f.navn + ', ' + n + (n === 1 ? ' person' : ' personer'), keyboard: true, riseOnHover: true });
        m.on('click', function () { sel.k = f.id; renderMap(false); });
        m.addTo(mapLayer);
      });
      if (fit) fitMap();
    }
    $('#detail-k').innerHTML = mapDetail(g);
  }
  function mapDetail(g) {
    var f = byId(firms, sel.k);
    if (!f || !f.adr) return '<p class="empty">Tryk på en markering på kortet for at se, hvem der arbejder dér, og hvem der er i nærheden.</p>';
    var here = (g[f.id] || []), r = +$('#r-k').value;
    var near = Object.keys(g).map(function (id) { var o = byId(firms, +id); return { f: o, d: km(f.adr, o.adr), n: g[id].length }; })
      .filter(function (x) { return x.f.id !== f.id && x.d <= r; }).sort(function (a, b) { return a.d - b.d; });
    var h = '<div><h2>' + esc(f.navn) + '</h2><p class="muted">' + esc(f.adr.vej) + ', ' + esc(f.adr.post) + ' ' + esc(f.adr.by) + '</p></div>';
    h += '<section><h3>Kontakter her (' + here.length + ')</h3>' + (here.length ? '<ul class="blist">' + here.map(function (p) {
      var lm = lastMet(p.id); return '<li>' + go('p', p.id) + esc(p.navn) + '</button><span class="muted">' + esc(titelOf(p)) + ' · ' + (lm ? 'sidst mødt ' + fmtDate(lm) : 'ikke mødt endnu') + '</span></li>';
    }).join('') + '</ul>' : '<p class="muted">Ingen matcher filteret her.</p>') + '<div class="actions"><button type="button" class="btn small" data-go="f:' + f.id + '">Åbn virksomhed</button></div></section>';
    h += '<section><h3>Inden for ' + r + ' km (' + near.reduce(function (n, x) { return n + x.n; }, 0) + ' personer)</h3>' + (near.length ? '<ul class="blist">' + near.map(function (x) {
      return '<li><button type="button" class="link" data-kpick="' + x.f.id + '">' + esc(x.f.navn) + '</button><span class="muted">' + x.n + (x.n === 1 ? ' person' : ' personer') + ' · ' + Math.round(x.d) + ' km · ' + esc(x.f.adr.by) + '</span></li>';
    }).join('') + '</ul>' : '<p class="muted">Ingen andre kontakter i nærheden. Prøv en større radius.</p>') + '</section>';
    return h;
  }

  // ===== Projekter og pipeline =====
  var PHL = ['rygte', 'kval', 'pq', 'tilbud', 'vundet'], OPENPH = ['rygte', 'kval', 'pq', 'tilbud'];
  var KILDE = { aktivitet: 'Aktivitet', byggefakta: 'Byggefakta', hubexo: 'HUBEXO', andet: 'Andet' };
  var QS = [];
  (function () { var t = TODAY.split('-'), y = +t[0], q = Math.floor((+t[1] - 1) / 3) + 1; for (var i = 0; i < 12; i++) { QS.push(y + ' K' + q); q++; if (q > 4) { q = 1; y++; } } })();
  var pl = { metric: 'honorar', weighted: 1, fmode: 'cum', board: 'fase', dead: false }, plCharts = {};
  function curQ() { var t = TODAY.split('-'); return t[0] + ' K' + (Math.floor((+t[1] - 1) / 3) + 1); }
  function overhalet(pr) { return !!pr.start && pr.start < curQ() && OPENPH.indexOf(pr.fase) >= 0; }
  function qopts(cur) { var l = QS.map(function (q) { return [q, q]; }); if (cur && QS.indexOf(cur) < 0) l.unshift([cur, cur + ' (overhalet)']); return optList(l, cur); }
  function hon(pr) { return pr.honorar || 0; }
  function anl(pr) { return pr.anlaeg != null ? pr.anlaeg : Math.round(hon(pr) * 100) / 10; }
  function pbase(pr) { return pl.metric === 'honorar' ? hon(pr) : anl(pr); }
  function pprob(pr) { return PH[pr.fase].p / 100; }
  function pvalue(pr) { return pl.weighted ? pbase(pr) * pprob(pr) : pbase(pr); }
  function plsum(list, fn) { return list.reduce(function (a, pr) { return a + fn(pr); }, 0); }
  function plfmt(n, d) { return n.toLocaleString('da-DK', { minimumFractionDigits: d == null ? 0 : d, maximumFractionDigits: d == null ? 1 : d }); }
  function bnavn(pr) { var b = byId(firms, pr.bygherre); return b ? b.navn : (pr.bygherreNavn || 'Bygherre ikke registreret'); }
  function projActs(id) { return sortActs(acts.filter(function (a) { return a.proj.indexOf(id) >= 0; })); }
  function missing(pr) { return !pr.start || !pr.honorar; }
  function plFilter(pr) {
    var src = $('#src-g').value, kt = $('#kt-g').value, n = projActs(pr.id).length;
    if (src && pr.kilde !== src) return false;
    if (kt === 'med' && !n) return false;
    if (kt === 'uden' && n) return false;
    return true;
  }
  function plList() { return projects.filter(plFilter); }

  function setProj(pr, k, raw) {
    var old = pr[k], val = raw, label = { fase: 'Fase', start: 'Start', honorar: 'Honorar', anlaeg: 'Anlægssum', rm: 'RSM-nummer', bygherre: 'Bygherre', kilde: 'Kilde', begr: 'Begrundelse' }[k];
    if (k === 'honorar' || k === 'anlaeg') { var t = String(raw).replace(',', '.').trim(); val = t === '' ? null : parseFloat(t); if (val != null && (isNaN(val) || val < 0)) { toast('Skriv et tal'); return false; } }
    if (k === 'rm') {
      val = String(raw).trim().toUpperCase();
      if (val && projects.some(function (o) { return o.id !== pr.id && o.rm === val; })) { toast('RSM-nummeret findes allerede på et andet projekt'); return false; }
    }
    if (k === 'bygherre') val = +raw || 0;
    if (old === val || (old == null && val === '')) return true;
    pr[k] = val;
    var show = function (v) {
      if (v == null || v === '') return 'ikke sat';
      if (k === 'fase') return PH[v].n;
      if (k === 'kilde') return KILDE[v];
      if (k === 'bygherre') { var f = byId(firms, v); return f ? f.navn : 'ikke registreret'; }
      return String(v);
    };
    if (k !== 'begr') pr.log.unshift({ dato: TODAY, tekst: label + ': ' + show(old) + ' til ' + show(val) });
    return true;
  }
  function fillProjFilters() {
    var f1 = $('#f-j'), c1 = f1.value; f1.innerHTML = '<option value="">Alle faser</option>' + Object.keys(PH).map(function (k) { return '<option value="' + k + '">' + esc(PH[k].n) + '</option>'; }).join(''); f1.value = c1;
    [$('#s-j'), $('#src-g')].forEach(function (el) { var c = el.value; el.innerHTML = '<option value="">Alle kilder</option>' + Object.keys(KILDE).map(function (k) { return '<option value="' + k + '">Kilde: ' + esc(KILDE[k]) + '</option>'; }).join(''); el.value = c; });
    if (!$('#np-kilde').options.length) {
      $('#np-kilde').innerHTML = Object.keys(KILDE).map(function (k) { return '<option value="' + k + '">' + esc(KILDE[k]) + '</option>'; }).join('');
      $('#np-fase').innerHTML = Object.keys(PH).map(function (k) { return '<option value="' + k + '">' + esc(PH[k].n) + '</option>'; }).join('');
      $('#np-start').innerHTML = '<option value="">Ikke sat</option>' + QS.map(function (q) { return '<option>' + q + '</option>'; }).join('');
      $('#np-by').innerHTML = '<option value="0">Ikke registreret</option>' + firms.filter(function (f) { return f.kat === 'bygherre'; }).map(function (f) { return '<option value="' + f.id + '">' + esc(f.navn) + '</option>'; }).join('');
    }
  }

  // Projektliste og detalje
  var selJ = null;
  function renderProjects() {
    $('#n-j').textContent = projects.length;
    var q = $('#q-j').value.trim().toLowerCase(), fs = $('#f-j').value, ks = $('#s-j').value, kt = $('#k-j').value, o = $('#o-j').value;
    var list = projects.filter(function (pr) {
      if (fs && pr.fase !== fs) return false;
      if (ks && pr.kilde !== ks) return false;
      var n = projActs(pr.id).length;
      if (kt === 'uden' && n) return false;
      if (kt === 'med' && !n) return false;
      if (kt === 'norm' && pr.rm) return false;
      if (kt === 'mangler' && !missing(pr)) return false;
      return !q || (pr.navn + ' ' + pr.rm + ' ' + bnavn(pr)).toLowerCase().indexOf(q) >= 0;
    });
    list.sort(function (a, b) {
      if (o === 'navn') return a.navn.localeCompare(b.navn, 'da');
      if (o === 'start') return (a.start || '9999') < (b.start || '9999') ? -1 : (a.start || '9999') > (b.start || '9999') ? 1 : 0;
      return hon(b) - hon(a);
    });
    $('#c-j').textContent = list.length + ' af ' + projects.length;
    $('#list-j').innerHTML = list.length ? list.map(function (pr) {
      var n = projActs(pr.id).length;
      return '<li><button type="button" class="item" data-pj="' + pr.id + '" aria-current="' + (selJ === pr.id) + '"><span class="t">' + esc(pr.navn) + (!n ? '<span class="badge new">Ingen aktivitet</span>' : '') + '</span><span class="d">' + (pr.honorar ? plfmt(pr.honorar) + ' mio.' : 'Honorar mangler') + '</span>' +
        '<span class="s">' + esc(bnavn(pr)) + ' · ' + PH[pr.fase].n + (pr.start ? ' · ' + pr.start : '') + (pr.rm ? ' · ' + esc(pr.rm) : '') + '</span></button></li>';
    }).join('') : '<li class="empty">Ingen projekter matcher.</li>';
    $('#detail-j').innerHTML = projDetail(byId(projects, selJ));
    $('#split-j').classList.toggle('open', open.j);
  }
  function optList(items, cur) { return items.map(function (i) { return '<option value="' + esc(i[0]) + '"' + (String(i[0]) === String(cur) ? ' selected' : '') + '>' + esc(i[1]) + '</option>'; }).join(''); }
  function projDetail0(pr) {
    if (!pr) return '<p class="empty">Vælg et projekt.</p>';
    var as = projActs(pr.id), ppl = [];
    as.forEach(function (a) { a.people.forEach(function (id) { var x = byId(persons, id); if (x && !isColleague(x) && ppl.indexOf(id) < 0) ppl.push(id); }); });
    var h = '<button type="button" class="btn back" data-back="j">‹ Tilbage til listen</button>';
    h += '<div><h2>' + esc(pr.navn) + (pr.rm ? ' <span class="rm">' + esc(pr.rm) + '</span>' : '') + '</h2><p class="muted">' + esc(bnavn(pr)) + ' · ' + PH[pr.fase].n + (pr.start ? ' · start ' + pr.start : '') + '</p></div>';
    h += '<section><h3>Stamdata</h3><div class="fgrid">' +
      '<label for="pj-rm">RSM-nummer<input type="text" id="pj-rm" data-pf="rm" value="' + esc(pr.rm) + '" placeholder="Ikke tildelt"></label>' +
      '<label for="pj-kilde">Kilde<select id="pj-kilde" data-pf="kilde">' + optList(Object.keys(KILDE).map(function (k) { return [k, KILDE[k]]; }), pr.kilde) + '</select></label>' +
      '<label for="pj-by">Bygherre<select id="pj-by" data-pf="bygherre"><option value="0">' + esc(pr.bygherreNavn || 'Ikke registreret') + '</option>' + optList(firms.filter(function (f) { return f.kat === 'bygherre' || f.id === pr.bygherre; }).map(function (f) { return [f.id, f.navn]; }), pr.bygherre) + '</select></label>' +
      '<label for="pj-fase">Fase<select id="pj-fase" data-pf="fase">' + optList(Object.keys(PH).map(function (k) { return [k, PH[k].n]; }), pr.fase) + '</select></label>' +
      '<label for="pj-start">Forventet start<select id="pj-start" data-pf="start"><option value="">Ikke sat</option>' + qopts(pr.start) + '</select></label>' +
      '<label for="pj-hon">Honorar, mio. kr.<input type="text" inputmode="decimal" id="pj-hon" data-pf="honorar" value="' + (pr.honorar != null ? String(pr.honorar).replace('.', ',') : '') + '"></label>' +
      '<label for="pj-anl">Anlægssum, mio. kr.<input type="text" inputmode="decimal" id="pj-anl" data-pf="anlaeg" value="' + (pr.anlaeg != null ? String(pr.anlaeg).replace('.', ',') : '') + '" placeholder="' + plfmt(anl(pr)) + ' (10 gange honorar)"></label>' +
      '</div>' + ((pr.fase === 'fravalgt' || pr.fase === 'tabt') ? '<label class="fgrid" for="pj-begr" style="display:flex;flex-direction:column;gap:3px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">Begrundelse<textarea id="pj-begr" data-pf="begr" rows="2" style="text-transform:none;letter-spacing:0;font-size:14px">' + esc(pr.begr) + '</textarea></label>' : '') +
      (pr.loc ? '<div class="actions"><button type="button" class="btn small" data-mapproj="' + pr.id + '">Vis på kort</button></div>' : '') + '</section>';
    h += '<section><h3>Aktiviteter og kontakter</h3>';
    if (as.length) {
      h += '<ul class="alist">' + as.map(function (a) { return actItem(a, null); }).join('') + '</ul>';
      h += '<p class="muted">Første omtale ' + fmtDate(as[as.length - 1].dato) + '. Kontakter der har nævnt projektet:</p><div class="chips">' + ppl.map(function (id) { var x = byId(persons, id), f = firmOf(x); return '<span class="chip">' + go('p', id) + esc(x.navn) + '</button>' + (f ? '<span class="muted">' + esc(f.navn) + '</span>' : '') + '</span>'; }).join('') + '</div>';
    } else {
      h += '<div class="callout"><p>Ingen aktivitet endnu. Projektet kom ind via ' + esc(KILDE[pr.kilde]) + (pr.rm ? ' med ' + esc(pr.rm) : '') + '. Næste skridt er at finde en kontakt hos ' + esc(bnavn(pr)) + ' og registrere en aktivitet, hvor projektet nævnes.</p></div>';
    }
    h += '<div class="actions"><button type="button" class="btn small" data-newactproj="' + pr.id + '">Ny aktivitet med dette projekt</button></div></section>';
    h += '<section><h3>Ændringer</h3>' + (pr.log.length ? '<ul class="logl">' + pr.log.map(function (l) { return '<li><span class="muted">' + fmtDate(l.dato) + '</span> ' + esc(l.tekst) + '</li>'; }).join('') + '</ul>' : '<p class="muted">Ingen ændringer registreret efter oprettelsen.</p>') + '</section>';
    return h;
  }

  // Pipeline
  function renderPipeStats() {
    var list = plList(), open = list.filter(function (pr) { return OPENPH.indexOf(pr.fase) >= 0; }), won = list.filter(function (pr) { return pr.fase === 'vundet'; });
    var items = [
      ['Åben pipeline, honorar', plfmt(plsum(open, hon)), 'mio. kr.', open.length + ' åbne projekter'],
      ['Vægtet honorar', plfmt(plsum(open, function (pr) { return hon(pr) * pprob(pr); })), 'mio. kr.', 'efter fasens sandsynlighed'],
      ['Åben anlægssum', plfmt(plsum(open, anl), 0), 'mio. kr.', 'samlet byggesum, uvægtet'],
      ['Vundet', plfmt(plsum(won, hon)), 'mio. kr.', won.length + ' projekter'],
      ['Uden aktivitet', String(open.filter(function (pr) { return !projActs(pr.id).length; }).length), 'projekter', 'åbne, endnu uden kontakt']
    ];
    $('#pl-stats').innerHTML = items.map(function (i) { return '<div class="pl-stat"><span class="k">' + i[0] + '</span><span class="v">' + i[1] + '<small>' + i[2] + '</small></span><span class="n">' + i[3] + '</span></div>'; }).join('');
    var mis = list.filter(function (pr) { return missing(pr) && PHL.indexOf(pr.fase) >= 0; }).length;
    $('#miss-g').textContent = mis ? mis + ' projekter mangler start eller honorar og er ikke med i kvartalsdiagrammerne.' : '';
  }
  function themeBits() { return { fg: css('--fg'), muted: css('--muted'), line: css('--line'), surface: css('--surface'), font: css('--font-body') }; }
  function plUnit() { return pl.metric === 'honorar' ? 'honorar' : 'anlægssum'; }
  function ensureCharts() {
    if (!HAS || plCharts.funnel) return;
    plCharts.funnel = echarts.init($('#c-funnel')); plCharts.quarter = echarts.init($('#c-quarter')); plCharts.bubble = echarts.init($('#c-bubble'));
  }
  function renderFunnel() {
    if (!HAS) return;
    var t = themeBits(), list = plList();
    var data = PHL.map(function (id, i) {
      var l = list.filter(function (pr) { return pl.fmode === 'cum' ? PHL.indexOf(pr.fase) >= i : pr.fase === id; }), v = plsum(l, pvalue);
      return { name: PH[id].n, value: v, itemStyle: { color: css(PH[id].c), borderColor: t.surface, borderWidth: 1 }, lbl: PH[id].n + '\n' + l.length + ' stk. · ' + plfmt(v) + ' mio.' };
    });
    var max = Math.max.apply(null, data.map(function (d) { return d.value; })) || 1;
    plCharts.funnel.setOption({
      aria: { enabled: true }, textStyle: { fontFamily: t.font },
      tooltip: { trigger: 'item', formatter: function (p) { return p.data.lbl.replace('\n', '<br>'); } },
      series: [{ type: 'funnel', sort: 'none', min: 0, max: max, minSize: '6%', maxSize: '100%', left: '2%', top: 8, bottom: 8, width: '52%', gap: 3,
        label: { position: 'right', color: t.fg, fontSize: 12, lineHeight: 17, formatter: function (p) { return p.data.lbl; } }, labelLine: { length: 14, lineStyle: { color: t.line } }, data: data }]
    }, true);
    $('#cap-funnel').textContent = (pl.fmode === 'cum' ? 'Hvert trin viser projekter, der har nået fasen eller er videre. ' : 'Hvert trin viser projekter, der står i fasen nu. ') + 'Mål: ' + plUnit() + (pl.weighted ? ', vægtet med fasens sandsynlighed' : ', uvægtet') + '. Vundet er med, tabte og fravalgte er udeladt.';
  }
  function renderQuarter() {
    if (!HAS) return;
    var t = themeBits(), list = plList();
    plCharts.quarter.setOption({
      aria: { enabled: true }, textStyle: { fontFamily: t.font },
      legend: { top: 0, textStyle: { color: t.fg }, itemWidth: 12, itemHeight: 12 },
      grid: { left: 8, right: 8, top: 40, bottom: 4, containLabel: true },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: function (v) { return plfmt(v) + ' mio. kr.'; } },
      xAxis: { type: 'category', data: QS, axisLabel: { color: t.muted, fontSize: 10, interval: 0, formatter: function (v) { return v.replace(' ', '\n'); } }, axisLine: { lineStyle: { color: t.line } }, axisTick: { show: false } },
      yAxis: { type: 'value', name: 'mio. kr.', nameTextStyle: { color: t.muted, align: 'left' }, axisLabel: { color: t.muted }, splitLine: { lineStyle: { color: t.line } } },
      series: PHL.map(function (id) { return { name: PH[id].n, type: 'bar', stack: 'q', barMaxWidth: 38, itemStyle: { color: css(PH[id].c), borderColor: t.surface, borderWidth: 1 },
        data: QS.map(function (q) { return Math.round(plsum(list.filter(function (pr) { return pr.fase === id && pr.start === q; }), pvalue) * 10) / 10; }) }; })
    }, true);
  }
  function renderBubble() {
    if (!HAS) return;
    var t = themeBits(), list = plList().filter(function (pr) { return pr.start && QS.indexOf(pr.start) >= 0 && hon(pr) > 0; }), offs = {};
    QS.forEach(function (q) {
      var inQ = list.filter(function (pr) { return PHL.indexOf(pr.fase) >= 0 && pr.start === q; }).sort(function (a, b) { return hon(a) - hon(b); });
      inQ.forEach(function (pr, i) { offs[pr.id] = inQ.length > 1 ? -0.3 + 0.6 * i / (inQ.length - 1) : 0; });
    });
    plCharts.bubble.setOption({
      aria: { enabled: true }, textStyle: { fontFamily: t.font },
      legend: { top: 0, textStyle: { color: t.fg }, itemWidth: 12, itemHeight: 12 },
      grid: { left: 8, right: 20, top: 40, bottom: 4, containLabel: true },
      tooltip: { trigger: 'item', formatter: function (p) { var d = p.data.p; return '<b>' + esc(d.navn) + '</b><br>' + esc(bnavn(d)) + (d.rm ? '<br>' + esc(d.rm) : '') + '<br>Fase: ' + PH[d.fase].n + ' (' + PH[d.fase].p + ' %)<br>Honorar: ' + plfmt(hon(d)) + ' mio. kr.<br>Anlægssum: ' + plfmt(anl(d), 0) + ' mio. kr.<br>Start: ' + d.start + '<br>Aktiviteter: ' + projActs(d.id).length; } },
      xAxis: { type: 'value', min: -0.5, max: QS.length - 0.5, interval: 1, axisLabel: { color: t.muted, fontSize: 10, interval: 0, formatter: function (v) { var q = QS[Math.round(v)]; return q ? q.replace(' ', '\n') : ''; } }, axisLine: { lineStyle: { color: t.line } }, splitLine: { show: true, lineStyle: { color: t.line } } },
      yAxis: { type: 'value', min: 0, max: 24, name: 'honorar, mio. kr.', nameTextStyle: { color: t.muted, align: 'left' }, axisLabel: { color: t.muted }, splitLine: { lineStyle: { color: t.line } } },
      series: PHL.map(function (id) { return { name: PH[id].n, type: 'scatter', itemStyle: { color: css(PH[id].c), opacity: 0.88, borderColor: t.fg, borderWidth: 0.6 }, symbolSize: function (d) { return Math.sqrt(d[2]) * 2.4; },
        data: list.filter(function (pr) { return pr.fase === id; }).map(function (pr) { return { value: [QS.indexOf(pr.start) + (offs[pr.id] || 0), hon(pr), anl(pr)], p: pr }; }) }; })
    }, true);
  }
  function boardCard(pr, showPhase) {
    var n = projActs(pr.id).length, dead = pr.fase === 'tabt' || pr.fase === 'fravalgt';
    return '<div class="pl-card" style="' + (showPhase ? 'border-left:4px solid var(' + PH[pr.fase].c + ');' : '') + (dead ? 'opacity:.75;' : '') + '"><div class="nm">' + esc(pr.navn) + '</div><div class="by">' + esc(bnavn(pr)) + (pr.rm ? ' · ' + esc(pr.rm) : '') + '</div>' +
      (showPhase ? '<div class="by"><span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(' + PH[pr.fase].c + ');margin-right:5px' + (dead ? ';background:none;border:1px dashed var(' + PH[pr.fase].c + ')' : '') + '"></span>' + esc(PH[pr.fase].n) + ' · ' + PH[pr.fase].p + ' %</div>' : '') +
      '<div class="vals"><span>' + plfmt(hon(pr)) + ' mio.</span><span>anlæg ' + plfmt(anl(pr), 0) + ' mio.</span></div>' +
      '<div class="by">' + (n ? n + (n === 1 ? ' aktivitet' : ' aktiviteter') : 'Ingen aktivitet') + ' · <button type="button" class="link" data-pj="' + pr.id + '">Åbn</button></div>' +
      '<div class="foot"><label for="pl-st-' + pr.id + '">Start<select id="pl-st-' + pr.id + '" data-pb="' + pr.id + ':start"><option value="">Ikke sat</option>' + qopts(pr.start) + '</select></label>' +
      '<label for="pl-ph-' + pr.id + '">Fase<select id="pl-ph-' + pr.id + '" data-pb="' + pr.id + ':fase">' + optList(Object.keys(PH).map(function (k) { return [k, PH[k].n]; }), pr.fase) + '</select></label></div></div>';
  }
  function renderBoard() {
    var list = plList(), el = $('#board'), keep = el.scrollLeft, byq = pl.board === 'kvartal';
    $('#cap-board').textContent = byq
      ? 'Samme kort fordelt på forventet startkvartal. Skift kvartal eller fase på et kort, og alle visninger opdateres. Ændringer gemmes i projektets historik.'
      : 'Skift fase eller startkvartal på et kort, og alle visninger opdateres. Ændringer gemmes i projektets historik.';
    if (!byq) {
      el.innerHTML = Object.keys(PH).filter(function (id) { return pl.dead || (id !== 'tabt' && id !== 'fravalgt'); }).map(function (id) {
        var l = list.filter(function (pr) { return pr.fase === id; }).sort(function (a, b) { return hon(b) - hon(a); });
        return '<div class="pl-col" style="--c:var(' + PH[id].c + ')"><div class="pl-colhead"><div class="t"><span>' + esc(PH[id].n) + '</span><span>' + l.length + '</span></div><div class="m">' + plfmt(plsum(l, hon)) + ' mio. · ' + PH[id].p + ' %</div></div>' + l.map(function (pr) { return boardCard(pr, false); }).join('') + '</div>';
      }).join('');
    } else {
      var order = Object.keys(PH);
      var vis = list.filter(function (pr) { return pl.dead || (pr.fase !== 'tabt' && pr.fase !== 'fravalgt'); });
      var past = []; vis.forEach(function (pr) { if (pr.start && QS.indexOf(pr.start) < 0 && !overhalet(pr) && past.indexOf(pr.start) < 0) past.push(pr.start); }); past.sort();
      var cols = ['over'].concat(past, QS, ['']);
      el.innerHTML = cols.map(function (q) {
        var l = vis.filter(function (pr) { return q === 'over' ? overhalet(pr) : !overhalet(pr) && (pr.start || '') === q; }).sort(function (a, b) { return order.indexOf(a.fase) - order.indexOf(b.fase) || hon(b) - hon(a); });
        var live = l.filter(function (pr) { return pr.fase !== 'tabt' && pr.fase !== 'fravalgt'; });
        return '<div class="pl-col" style="--c:' + (q === 'over' ? 'var(--ph-tilbud)' : q ? 'var(--accent)' : 'var(--ph-tabt)') + '"><div class="pl-colhead"><div class="t"><span>' + (q === 'over' ? 'Overhalet' : q ? esc(q.replace(' ', ' ')) : 'Start ikke sat') + '</span><span>' + l.length + '</span></div><div class="m">' + plfmt(plsum(live, hon)) + ' mio. · vægtet ' + plfmt(plsum(live, function (pr) { return hon(pr) * pprob(pr); })) + ' mio.</div></div>' +
          (q === 'over' ? '<p class="muted" style="font-size:12px">Startkvartal er passeret. Opdater start eller fase.</p>' : '') + (l.length ? l.map(function (pr) { return boardCard(pr, true); }).join('') : '<p class="muted" style="font-size:12px">Ingen projekter</p>') + '</div>';
      }).join('');
    }
    el.scrollLeft = keep;
  }
  function renderPipeline() {
    renderPipeStats(); renderBoard();
    if (HAS) { ensureCharts(); renderFunnel(); renderQuarter(); renderBubble(); Object.keys(plCharts).forEach(function (k) { plCharts[k].resize(); }); }
    else ['c-funnel', 'c-quarter', 'c-bubble'].forEach(function (id) { $('#' + id).innerHTML = '<p class="hint">Diagrambiblioteket kunne ikke hentes. Opdater siden. Tal og tavle virker stadig.</p>'; });
  }

  // Ny person
  function fillPersonForm() {
    var sel0 = $('#pn-firm'), cur0 = sel0.value;
    sel0.innerHTML = '<option value="0">Ikke tilknyttet endnu</option>' + firms.slice().sort(function (a, b) { return a.navn.localeCompare(b.navn, 'da'); }).map(function (f) { return '<option value="' + f.id + '">' + esc(f.navn) + '</option>'; }).join('') + '<option value="new">Ny virksomhed…</option>';
    sel0.value = cur0 || '0';
    if (!$('#pn-fm').options.length) {
      $('#pn-fm').innerHTML = MND.map(function (m, i) { return '<option value="' + ('0' + (i + 1)).slice(-2) + '"' + (i + 1 === +TODAY.slice(5, 7) ? ' selected' : '') + '>' + m + '</option>'; }).join('');
      var ys = ''; for (var y = 2029; y >= 1990; y--) ys += '<option value="' + y + '"' + (y === +TODAY.slice(0, 4) ? ' selected' : '') + '>' + y + '</option>';
      $('#pn-fy').innerHTML = ys;
      $('#pn-nk').innerHTML = Object.keys(KAT).filter(function (k) { return k !== 'egen'; }).map(function (k) { return '<option value="' + k + '">' + KAT[k] + '</option>'; }).join('');
    }
  }
  function openPersonForm(firmId) {
    fillPersonForm();
    var f = $('#form-p'); f.hidden = false;
    if (firmId) { $('#pn-firm').value = String(firmId); $('#pn-newbox').hidden = true; }
    $('#pn-err').textContent = '';
    $('#pn-name').focus();
  }
  function savePerson() {
    var err = $('#pn-err'), name = $('#pn-name').value.trim().replace(/\s+/g, ' '), fv = $('#pn-firm').value, firmId = 0;
    err.textContent = '';
    if (!name) { err.textContent = 'Skriv personens navn.'; $('#pn-name').focus(); return; }
    if (fv === 'new') {
      if (!$('#pn-nn').value.trim()) { err.textContent = 'Skriv navnet på den nye virksomhed.'; return; }
    } else firmId = +fv;
    var dup = persons.filter(function (x) { var c = cur(x); return x.navn.toLowerCase() === name.toLowerCase() && (firmId ? (c && c.firm === firmId) : true); })[0];
    if (dup) { err.textContent = name + ' findes allerede' + (firmOf(dup) ? ' hos ' + firmOf(dup).navn : '') + '. Søg efter personen i listen i stedet.'; return; }
    var em = $('#pn-email').value.trim();
    if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { err.textContent = 'E-mailadressen ser ikke rigtig ud.'; return; }
    if (fv === 'new') {
      var nn = $('#pn-nn').value.trim(), nk = $('#pn-nk').value;
      var nf = { id: nextId(firms), navn: nn, kat: nk, sub: KAT[nk], by: '', cvr: '', medarb: null, web: '', note: '', typ: {}, adr: null };
      firms.push(nf); firmId = nf.id;
    }
    var fra = $('#pn-fy').value + '-' + $('#pn-fm').value;
    var np = { id: nextId(persons), navn: name, tags: $('#pn-tags').value.split(',').map(function (t) { return t.trim(); }).filter(Boolean), bek: TODAY.slice(0, 7), emp: [], nej: false };
    if (firmId) np.emp.push({ firm: firmId, titel: $('#pn-titel').value.trim(), fra: fra, til: null });
    if (em) np.email = em;
    if ($('#pn-tel').value.trim()) np.tel = $('#pn-tel').value.trim();
    persons.push(np);
    sel.p = np.id; open.p = true;
    ['pn-name', 'pn-titel', 'pn-email', 'pn-tel', 'pn-tags', 'pn-nn'].forEach(function (id) { $('#' + id).value = ''; });
    $('#pn-firm').value = '0'; $('#pn-newbox').hidden = true; $('#form-p').hidden = true;
    ['q-p'].forEach(function (id) { $('#' + id).value = ''; }); $('#k-p').value = ''; $('#t-p').value = ''; $('#l-p').value = '';
    fillFuPersonSelects(); renderAll(); showTab('p');
    toast(name + ' er tilføjet');
  }

  // Invitationslister: navngivne lister med faste medlemmer. nej = ønsker ikke invitationer.
  var lists = [];
  function listsOf(pid) { return lists.filter(function (l) { return l.members.indexOf(pid) >= 0; }); }
  function listMembers(l) { return l.members.map(function (id) { return byId(persons, id); }).filter(Boolean).sort(function (a, b) { return a.navn.localeCompare(b.navn, 'da'); }); }
  function listStats(l) {
    var ms = listMembers(l);
    var ok = ms.filter(function (p) { return !p.nej && email(p); });
    return { all: ms, ok: ok, nej: ms.filter(function (p) { return p.nej; }), noMail: ms.filter(function (p) { return !p.nej && !email(p); }) };
  }
  function fillListSelects() {
    var el = $('#l-p'), cur = el.value;
    el.innerHTML = '<option value="">Alle lister</option>' + lists.map(function (l) { return '<option value="' + l.id + '">Liste: ' + esc(l.navn) + '</option>'; }).join('');
    el.value = cur;
    var el2 = $('#l-k'), cur2 = el2.value; el2.innerHTML = el.innerHTML; el2.value = cur2;
  }
  function renderLists() {
    $('#n-l').textContent = lists.length;
    $('#c-l').textContent = lists.length + (lists.length === 1 ? ' liste' : ' lister');
    $('#list-l').innerHTML = lists.length ? lists.map(function (l) {
      var st = listStats(l);
      return '<li><button type="button" class="item" data-go="l:' + l.id + '" aria-current="' + (sel.l === l.id) + '"><span class="t">' + esc(l.navn) + '</span><span class="d">' + st.ok.length + ' kan inviteres</span><span class="s">' + st.all.length + ' på listen' + (st.nej.length ? ' · ' + st.nej.length + ' har frabedt sig' : '') + '</span></button></li>';
    }).join('') : '<li class="empty">Ingen lister endnu.</li>';
    $('#detail-l').innerHTML = listDetail(byId(lists, sel.l));
    $('#split-l').classList.toggle('open', open.l);
  }
  function listDetail(l) {
    if (!l) return '<p class="empty">Opret eller vælg en liste.</p>';
    var st = listStats(l), mails = st.ok.map(function (p) { return p.navn + ' <' + email(p) + '>'; }).join('; ');
    var h = '<button type="button" class="btn back" data-back="l">‹ Tilbage til listerne</button>';
    h += '<div><h2>' + esc(l.navn) + '</h2><p class="muted">' + esc(l.beskr || '') + '</p></div>';
    h += '<section><h3>Send invitation</h3><p>' + st.ok.length + ' modtagere. Kopiér adresserne og indsæt dem i feltet Bcc i Outlook, så modtagerne ikke ser hinandens adresser.</p>' +
      '<div class="actions"><button type="button" class="btn primary" data-copylist="' + l.id + '"' + (st.ok.length ? '' : ' disabled') + '>Kopiér e-mails (' + st.ok.length + ')</button>' +
      '<a class="btn" href="mailto:?bcc=' + encodeURIComponent(st.ok.map(email).join(',')) + '&subject=' + encodeURIComponent(l.navn) + '">Åbn i mailprogram</a></div>' +
      '<details class="inl"><summary>Vis adresser</summary><textarea readonly rows="4" id="l-mails" aria-label="E-mailadresser" style="width:100%">' + esc(mails) + '</textarea></details>' +
      (st.nej.length || st.noMail.length ? '<p class="muted">' + (st.nej.length ? st.nej.length + ' er sat til "ønsker ikke invitationer" og er ikke med i kopien. ' : '') + (st.noMail.length ? st.noMail.length + ' mangler e-mail.' : '') + '</p>' : '') + '</section>';
    h += '<section><h3>Medlemmer (' + st.all.length + ')</h3>' + (st.all.length ? '<ul class="blist">' + st.all.map(function (p) {
      var f = firmOf(p);
      return '<li>' + go('p', p.id) + esc(p.navn) + '</button><span class="muted">' + esc(titelOf(p)) + (f ? ' · ' + esc(f.navn) : '') + (p.nej ? ' · ønsker ikke invitationer' : '') + '</span>' +
        '<button type="button" class="btn small" data-lrm="' + l.id + ':' + p.id + '" aria-label="Fjern ' + esc(p.navn) + ' fra listen">Fjern</button></li>';
    }).join('') + '</ul>' : '<p class="muted">Ingen på listen endnu.</p>') + '</section>';
    h += '<section><h3>Tilføj personer</h3><label for="l-pq" class="k">Søg på navn eller virksomhed</label><input type="search" id="l-pq" data-lid="' + l.id + '" placeholder="Skriv for at søge" autocomplete="off"><ul class="blist" id="l-picks"></ul></section>';
    return h;
  }
  function renderListPicks() {
    var inp = $('#l-pq'); if (!inp) return;
    var l = byId(lists, +inp.getAttribute('data-lid')), q = inp.value.trim().toLowerCase();
    $('#l-picks').innerHTML = !q ? '' : persons.filter(function (p) {
      if (l.members.indexOf(p.id) >= 0) return false;
      var f = firmOf(p); return (p.navn + ' ' + (f ? f.navn : '')).toLowerCase().indexOf(q) >= 0;
    }).slice(0, 6).map(function (p) {
      var f = firmOf(p);
      return '<li><span>' + esc(p.navn) + '</span><span class="muted">' + (f ? esc(f.navn) : '') + '</span><button type="button" class="btn small" data-ladd="' + l.id + ':' + p.id + '">Tilføj</button></li>';
    }).join('') || '<li class="muted">Ingen match.</li>';
  }
  function listChips(p) {
    return '<section><h3>Invitationslister</h3><div class="chips">' + lists.map(function (l) {
      var on = l.members.indexOf(p.id) >= 0;
      return '<button type="button" class="chip" data-ltoggle="' + l.id + ':' + p.id + '" aria-pressed="' + on + '" style="' + (on ? 'background:var(--accent);border-color:var(--accent);color:#fff;' : '') + 'cursor:pointer">' + (on ? '✓ ' : '+ ') + esc(l.navn) + '</button>';
    }).join('') + '</div>' +
      '<label class="check" for="nej-' + p.id + '" style="margin-top:8px"><input type="checkbox" id="nej-' + p.id + '" data-nej="' + p.id + '"' + (p.nej ? ' checked' : '') + '> Ønsker ikke invitationer</label></section>';
  }

  function renderPersons() {
    var q = $('#q-p').value.trim().toLowerCase(), kat = $('#k-p').value, st = $('#t-p').value, sort = $('#s-p').value;
    var list = persons.filter(function (p) {
      var f = firmOf(p);
      if (kat && (!f || f.kat !== kat)) return false;
      if (st === 'bekraeft' && !stale(p)) return false;
      if (st === 'fu' && !openFuFor(p.id)) return false;
      if ($('#l-p').value && !lists.some(function (l) { return l.id === +$('#l-p').value && l.members.indexOf(p.id) >= 0; })) return false;
      if (!q) return true;
      var hay = (p.navn + ' ' + titelOf(p) + ' ' + (f ? f.navn : '') + ' ' + p.tags.join(' ') + ' ' + p.emp.map(function (e) { var x = byId(firms, e.firm); return (x ? x.navn : '') + ' ' + e.titel; }).join(' ') + ' ' + personActs(p.id).map(function (a) { return a.note + ' ' + a.titel; }).join(' ')).toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    list.sort(function (a, b) {
      if (sort === 'navn') return a.navn.localeCompare(b.navn, 'da');
      var la = lastMet(a.id) || '', lb = lastMet(b.id) || '';
      return la < lb ? 1 : la > lb ? -1 : a.navn.localeCompare(b.navn, 'da');
    });
    $('#c-p').textContent = list.length + ' af ' + persons.length;
    $('#list-p').innerHTML = list.length ? list.map(function (p) {
      var f = firmOf(p), lm = lastMet(p.id);
      return '<li><button type="button" class="item" data-go="p:' + p.id + '" aria-current="' + (sel.p === p.id) + '">' +
        '<span class="t">' + esc(p.navn) + (isColleague(p) ? '<span class="badge">Kollega</span>' : '') + (stale(p) ? '<span class="badge warn">Bekræft job</span>' : '') + '</span><span class="d">' + (lm ? fmtDate(lm) : 'Ikke mødt') + '</span>' +
        '<span class="s">' + esc(titelOf(p)) + (f ? ' · ' + esc(f.navn) : '') + '</span></button></li>';
    }).join('') : '<li class="empty">Ingen personer matcher.</li>';
    $('#detail-p').innerHTML = personDetail(byId(persons, sel.p));
    $('#split-p').classList.toggle('open', open.p);
  }
  function empList(p) {
    if (!p.emp.length) return '<p class="muted">Ingen virksomhed registreret endnu.</p>';
    return '<ul class="elist">' + p.emp.slice().sort(function (a, b) { return a.fra < b.fra ? 1 : -1; }).map(function (e) {
      var f = byId(firms, e.firm);
      return '<li><span>' + (f ? go('f', f.id) + esc(f.navn) + '</button>' : 'Ukendt virksomhed') + (e.titel ? ' · ' + esc(e.titel) : '') + (e.til == null ? '<span class="badge">Nuværende</span>' : '') + '</span>' +
        '<span class="per">' + fmtMonth(e.fra) + ' til ' + (e.til ? fmtMonth(e.til) : 'nu') + '</span></li>';
    }).join('') + '</ul>';
  }
  function jobForm(p) {
    var id = 'job-' + p.id, c = cur(p);
    var firmOpts = firms.slice().sort(function (a, b) { return a.navn.localeCompare(b.navn, 'da'); }).map(function (f) { return '<option value="' + f.id + '">' + esc(f.navn) + '</option>'; }).join('');
    var months = MND.map(function (m, i) { return '<option value="' + ('0' + (i + 1)).slice(-2) + '"' + (i + 1 === +TODAY.slice(5, 7) ? ' selected' : '') + '>' + m + '</option>'; }).join('');
    var years = ''; for (var y = 2029; y >= 2010; y--) years += '<option value="' + y + '"' + (y === +TODAY.slice(0, 4) ? ' selected' : '') + '>' + y + '</option>';
    return '<details class="inl"><summary>' + (c ? 'Skifter job' : 'Tilføj virksomhed') + '</summary><form class="mini" data-job="' + p.id + '">' +
      '<label for="' + id + '-firm">Ny virksomhed<select id="' + id + '-firm" name="firm" data-jobfirm="' + p.id + '">' + firmOpts + '<option value="new">Ny virksomhed…</option></select></label>' +
      '<div class="grid2" id="' + id + '-new" hidden><label for="' + id + '-nn">Navn<input type="text" id="' + id + '-nn" name="nn"></label>' +
      '<label for="' + id + '-nk">Type<select id="' + id + '-nk" name="nk">' + Object.keys(KAT).map(function (k) { return '<option value="' + k + '">' + KAT[k] + '</option>'; }).join('') + '</select></label></div>' +
      '<label for="' + id + '-t">Titel<input type="text" id="' + id + '-t" name="t"></label>' +
      '<div class="grid2"><label for="' + id + '-fm">Startmåned<select id="' + id + '-fm" name="fm">' + months + '</select></label><label for="' + id + '-fy">Startår<select id="' + id + '-fy" name="fy">' + years + '</select></label></div>' +
      '<p class="muted">' + (c ? 'Det nuværende job afsluttes i startmåneden og ligger fortsat i historikken.' : 'Personen får sin første registrerede ansættelse.') + '</p>' +
      '<div class="actions"><button type="submit" class="btn primary small">Gem jobskifte</button></div></form></details>';
  }
  function personDetail0(p) {
    if (!p) return '<p class="empty">Vælg en person.</p>';
    var f = firmOf(p), as = personActs(p.id);
    var projIds = uniq([].concat.apply([], as.map(function (a) { return a.proj; })));
    var cols = isColleague(p) ? [] : uniq([].concat.apply([], as.map(function (a) { return a.people; }))).filter(function (x) { var q = byId(persons, x); return q && isColleague(q); });
    var h = '<button type="button" class="btn back" data-back="p">‹ Tilbage til listen</button>';
    h += '<div><h2>' + esc(p.navn) + (isColleague(p) ? '<span class="badge">Kollega</span>' : '') + '</h2><p class="muted">' + esc(titelOf(p)) + (f ? (titelOf(p) ? ' · ' : '') + go('f', f.id) + esc(f.navn) + '</button>' : 'Virksomhed ikke angivet') + '</p>' +
      (p.tags.length ? '<div class="chips" style="margin-top:8px">' + p.tags.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('') + '</div>' : '') + '</div>';
    h += '<section><h3>Kontakt</h3><div class="kv">' +
      (f && f.adr ? '<span class="k">Arbejdssted</span><span class="v">' + esc(f.adr.vej) + ', ' + esc(f.adr.post) + ' ' + esc(f.adr.by) + '</span><button type="button" class="btn" data-map="' + f.id + '">Vis på kort</button>' : '') +
      (email(p) ? '<span class="k">E-mail</span><span class="v">' + esc(email(p)) + '</span><button type="button" class="btn" data-copy="' + esc(email(p)) + '">Kopiér</button>' : '') +
      '<span class="k">Telefon</span><span class="v">' + esc(tel(p)) + '</span><button type="button" class="btn" data-copy="' + esc(tel(p)) + '">Kopiér</button>' +
      '<span class="k">Job bekræftet</span><span class="v">' + fmtMonth(p.bek) + (stale(p) ? '<span class="badge warn">Over 18 mdr.</span>' : '') + '</span><button type="button" class="btn" data-confirm="' + p.id + '">Bekræft nu</button>' +
      '<span class="k">Sidst mødt</span><span class="v">' + (as.length ? fmtDate(as[0].dato) : 'Ikke mødt endnu') + '</span><span></span>' +
      '<span class="k">Aktiviteter</span><span class="v">' + as.length + '</span><span></span></div></section>';
    h += '<section><h3>Karriere</h3>' + empList(p) + jobForm(p) + '</section>';
    h += listChips(p);
    h += fuSection('p', p.id);
    h += '<section><h3>Nævnte projekter</h3>' + (projIds.length ? '<ul class="plist">' + projIds.map(function (id) { return projRow(byId(projects, id), ''); }).join('') + '</ul>' : '<p class="muted">Ingen projekter knyttet endnu.</p>') + '</section>';
    if (!isColleague(p)) {
      h += '<section><h3>Kendes af kolleger</h3>' + (cols.length ? '<div class="chips">' + cols.map(function (c) { var q = byId(persons, c); return '<span class="chip">' + go('p', q.id) + esc(q.navn) + '</button></span>'; }).join('') + '</div>' : '<p class="muted">Ingen kolleger har været med på en aktivitet.</p>') + '</section>';
    }
    h += '<section><h3>Aktiviteter</h3>' + (as.length ? '<ul class="alist">' + as.map(function (a) { return actItem(a, p); }).join('') + '</ul>' : '<p class="muted">Ingen aktiviteter registreret.</p>') + '</section>';
    return h;
  }
  function actItem(a, p) {
    var others = a.people.filter(function (x) { return !p || x !== p.id; }).map(pname);
    var then = '';
    if (p) { var f1 = firmAt(p, a.dato), f2 = firmOf(p); if (f1 && f2 && f1.id !== f2.id) then = '<span class="who">Dengang hos ' + esc(f1.navn) + '</span>'; }
    var via = !a.me ? '<span class="badge">Via kollega</span>' : '';
    return '<li><div class="hd"><span class="ty">' + esc(a.type) + '</span><span class="dt">' + fmtDate(a.dato) + '</span>' + go('a', a.id) + esc(a.titel) + '</button>' + via + '</div>' +
      '<span class="note">' + esc(a.note) + '</span>' + then + (others.length ? '<span class="who">Sammen med: ' + others.join(', ') + '</span>' : '') + '</li>';
  }

  // Kerneområder: score 1-5 pr. typologi (0 = ikke vurderet)
    function hasTypo(f) { return TYPO_KAT.indexOf(f.kat) >= 0; }
  function lvl(f, i) { return (f.typ && f.typ[i]) || 0; }
  function setScore(f, i, v) { if (v && lvl(f, i) !== v) f.typ[i] = v; else delete f.typ[i]; }
  function shade(v) { return 'color-mix(in srgb, var(--accent) ' + (10 + (v - 1) * 20) + '%, var(--surface))'; }
  function strongText(f) {
    return TYPO.map(function (t, i) { return [t, lvl(f, i)]; }).filter(function (x) { return x[1] >= 4; })
      .sort(function (a, b) { return b[1] - a[1]; }).map(function (x) { return x[0] + ' (' + x[1] + ')'; });
  }
  function avgScore(f) {
    var v = TYPO.map(function (t, i) { return lvl(f, i); }).filter(function (x) { return x > 0; });
    return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : 0;
  }
  function typoGrid(f) {
    return '<div class="typ">' + TYPO.map(function (t, i) {
      var l = lvl(f, i);
      return '<div class="row"><span>' + esc(t) + '</span><span class="sc" role="group" aria-label="Score for ' + esc(t) + '">' +
        [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-typo="' + f.id + ':' + i + ':' + n + '" aria-pressed="' + (l === n) + '" aria-label="' + esc(t) + ' score ' + n + '">' + n + '</button>'; }).join('') + '</span></div>';
    }).join('') + '</div>';
  }
  function fillTypoSelect() {
    var el = $('#y-f'), cur = el.value;
    el.innerHTML = '<option value="">Alle kerneområder</option>' + TYPO.map(function (t, i) { return '<option value="' + i + '">Score 4+ i: ' + esc(t) + '</option>'; }).join('');
    el.value = cur;
  }
  function heatTable(kat) {
    var rows = firms.filter(function (f) { return f.kat === kat; }).sort(function (a, b) { return avgScore(b) - avgScore(a) || a.navn.localeCompare(b.navn, 'da'); });
    var h = '<h3>' + (kat === 'arkitekt' ? 'Arkitekter' : 'Entreprenører') + '</h3><div class="mx-wrap"><table class="mx"><thead><tr><th class="rl">Virksomhed</th>' +
      TYPO.map(function (t) { return '<th><span>' + esc(t) + '</span></th>'; }).join('') + '<th><span>Gennemsnit</span></th></tr></thead><tbody>';
    rows.forEach(function (f) {
      h += '<tr><td class="rl"><button type="button" class="link" data-go="f:' + f.id + '">' + esc(f.navn) + '</button></td>' + TYPO.map(function (t, i) {
        var l = lvl(f, i);
        return '<td class="c s' + (l ? 'x' : '0') + (l >= 4 ? ' hi' : '') + '"' + (l ? ' style="background:' + shade(l) + '"' : '') + ' title="' + esc(f.navn + ', ' + t + ': ' + (l ? l + ' af 5' : 'ikke vurderet')) + '">' + (l || '') + '</td>';
      }).join('').replace(/class="c sx/g, 'class="c') + '<td class="c' + (avgScore(f) >= 4 ? ' hi' : '') + '"' + (avgScore(f) ? ' style="background:' + shade(Math.round(avgScore(f))) + '"' : '') + '>' + (avgScore(f) ? avgScore(f).toFixed(1).replace('.', ',') : '') + '</td></tr>';
    });
    var best = TYPO.map(function (t, i) {
      var m = 0, who = []; rows.forEach(function (f) { var l = lvl(f, i); if (l > m) { m = l; who = [f.navn]; } else if (l === m && l) who.push(f.navn); });
      return m ? who.length + '×' + m : '';
    });
    h += '</tbody><tfoot><tr><td class="rl">Højeste score (antal × score)</td>' + best.map(function (x) { return '<td>' + x + '</td>'; }).join('') + '<td></td></tr></tfoot></table></div>';
    return h;
  }
  function renderMatrix() {
    var box = $('#matrix-f');
    var leg = '<div class="mx-leg">Score:' + [1, 2, 3, 4, 5].map(function (n) { return '<i style="background:' + shade(n) + '"></i>' + n; }).join(' ') + ' · tom = ikke vurderet. Rækker sorteres efter gennemsnit.</div>';
    box.innerHTML = leg + TYPO_KAT.map(heatTable).join('');
  }

  // Virksomheder
  function renderFirms() {
    var q = $('#q-f').value.trim().toLowerCase(), kat = $('#k-f').value, ty = $('#y-f').value;
    var list = firms.filter(function (f) {
      if (kat && f.kat !== kat) return false;
      if (ty !== '' && lvl(f, +ty) < 4) return false;
      return !q || (f.navn + ' ' + f.by + ' ' + f.sub + ' ' + f.note).toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return a.navn.localeCompare(b.navn, 'da'); });
    $('#c-f').textContent = list.length + ' af ' + firms.length;
    $('#list-f').innerHTML = list.length ? list.map(function (f) {
      return '<li><button type="button" class="item" data-go="f:' + f.id + '" aria-current="' + (sel.f === f.id) + '"><span class="t">' + esc(f.navn) + '</span><span class="d">' + firmPeople(f.id).length + ' personer</span><span class="s">' + esc(f.sub) + (f.by ? ' · ' + esc(f.by) : '') + '</span>' + (hasTypo(f) && strongText(f).length ? '<span class="s">Stærk: ' + esc(strongText(f).join(', ')) + '</span>' : '') + '</button></li>';
    }).join('') : '<li class="empty">Ingen virksomheder matcher.</li>';
    $('#detail-f').innerHTML = firmDetail(byId(firms, sel.f));
    $('#split-f').classList.toggle('open', open.f);
  }
  function firmDetail0(f) {
    if (!f) return '<p class="empty">Vælg en virksomhed.</p>';
    var ps = firmPeople(f.id), fo = formerPeople(f.id), as = firmActs(f.id);
    var own = projects.filter(function (p) { return p.bygherre === f.id; });
    var mentioned = [];
    as.forEach(function (a) { a.proj.forEach(function (id) { if (mentioned.indexOf(id) < 0) mentioned.push(id); }); });
    var other = mentioned.filter(function (id) { return !own.some(function (p) { return p.id === id; }); });
    var h = '<button type="button" class="btn back" data-back="f">‹ Tilbage til listen</button>';
    h += '<div><h2>' + esc(f.navn) + '</h2><p class="muted">' + esc(f.sub) + '</p></div>';
    h += '<section><h3>Stamdata</h3><div class="grid3">' +
      '<span><span class="k">Type</span>' + esc(KAT[f.kat]) + '</span><span><span class="k">By</span>' + (f.by ? esc(f.by) : 'Ikke angivet') + '</span><span><span class="k">CVR</span>' + (f.cvr ? esc(f.cvr) : 'Ikke angivet') + '</span>' +
      '<span><span class="k">Adresse</span>' + (f.adr ? esc(f.adr.vej) + ', ' + esc(f.adr.post) + ' ' + esc(f.adr.by) + ' <button type="button" class="link" data-map="' + f.id + '">Vis på kort</button>' : 'Ikke angivet') + '</span>' +
      '<span><span class="k">Medarbejdere</span>' + (f.medarb ? f.medarb.toLocaleString('da-DK') : 'Ikke angivet') + '</span><span><span class="k">Hjemmeside</span>' + (f.web ? esc(f.web) : 'Ikke angivet') + '</span></div>' +
      (f.note ? '<p>' + esc(f.note) + '</p>' : '') + '</section>';
    if (hasTypo(f)) {
      var st = strongText(f);
      h += '<section><h3>Kerneområder</h3><p class="muted">Score 1 til 5 pr. typologi. Tryk på det valgte tal igen for at fjerne vurderingen.</p>' + typoGrid(f) +
        '<p>' + (st.length ? '<strong>Stærk (4-5):</strong> ' + esc(st.join(', ')) : 'Ingen områder med score 4 eller derover endnu.') + '</p></section>';
    }
    h += '<section><h3>Personer nu</h3><div class="actions"><button type="button" class="btn small" data-newperson="' + f.id + '">Tilføj person hos ' + esc(f.navn) + '</button></div>' + (ps.length ? '<ul class="blist">' + ps.map(function (p) { var lm = lastMet(p.id); return '<li>' + go('p', p.id) + esc(p.navn) + '</button><span class="muted">' + esc(titelOf(p)) + ' · ' + (lm ? 'sidst mødt ' + fmtDate(lm) : 'ikke mødt endnu') + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">Ingen personer registreret.</p>') + '</section>';
    if (fo.length) {
      h += '<section><h3>Tidligere ansatte</h3><ul class="blist">' + fo.map(function (p) {
        var e = p.emp.filter(function (x) { return x.firm === f.id; })[0], now = firmOf(p);
        return '<li>' + go('p', p.id) + esc(p.navn) + '</button><span class="muted">' + esc(e.titel) + ' · ' + fmtMonth(e.fra) + ' til ' + (e.til ? fmtMonth(e.til) : 'nu') + (now ? ' · nu hos ' + esc(now.navn) : '') + '</span></li>';
      }).join('') + '</ul></section>';
    }
    h += '<section><h3>Projekter</h3>' + ((own.length || other.length) ? '<ul class="plist">' +
      own.map(function (p) { return projRow(p, 'Bygherre'); }).join('') +
      other.map(function (id) { return projRow(byId(projects, id), 'Nævnt af kontakter her'); }).join('') + '</ul>' : '<p class="muted">Ingen projekter knyttet endnu.</p>') + '</section>';
    h += '<section><h3>Aktiviteter</h3>' + (as.length ? '<ul class="alist">' + as.map(function (a) { return actItem(a, null); }).join('') + '</ul>' : '<p class="muted">Ingen aktiviteter registreret.</p>') + '</section>';
    return h;
  }

  // Aktiviteter
  function renderActs() {
    var q = $('#q-a').value.trim().toLowerCase(), t = $('#k-a').value, pr = $('#p-a').value, g = $('#g-a').value;
    var list = sortActs(acts).filter(function (a) {
      if (t && a.type !== t) return false;
      if (pr === 'me' && !a.me) return false;
      if (pr === 'kol' && a.me) return false;
      return !q || (a.titel + ' ' + a.sted + ' ' + a.note).toLowerCase().indexOf(q) >= 0;
    });
    if (g === 'type') list.sort(function (a, b) { var d = TYPER.indexOf(a.type) - TYPER.indexOf(b.type); return d || (a.dato < b.dato ? 1 : a.dato > b.dato ? -1 : 0); });
    $('#c-a').textContent = list.length + ' af ' + acts.length;
    var html = '', lastKey = null;
    list.forEach(function (a) {
      var key = g === 'type' ? a.type : g === 'maaned' ? a.dato.slice(0, 7) : null;
      if (g && key !== lastKey) {
        var n = list.filter(function (x) { return (g === 'type' ? x.type : x.dato.slice(0, 7)) === key; }).length;
        html += '<li class="grp"><span>' + esc(g === 'type' ? key : MND[+key.slice(5, 7) - 1] + ' ' + key.slice(0, 4)) + '</span><span>' + n + '</span></li>';
        lastKey = key;
      }
      var via = !a.me ? ' · via ' + a.via.map(function (id) { return esc(byId(persons, id).navn); }).join(', ') : '';
      html += '<li><button type="button" class="item" data-go="a:' + a.id + '" aria-current="' + (sel.a === a.id) + '"><span class="t">' + esc(a.titel) + (!a.me ? '<span class="badge">Via kollega</span>' : '') + '</span><span class="d">' + fmtDate(a.dato) + '</span>' +
        '<span class="s">' + (g === 'type' ? '' : esc(a.type) + ' · ') + a.people.length + ' deltagere · ' + a.proj.length + ' projekter' + via + '</span></button></li>';
    });
    $('#list-a').innerHTML = html || '<li class="empty">Ingen aktiviteter matcher.</li>';
    $('#detail-a').innerHTML = actDetail(byId(acts, sel.a));
    $('#split-a').classList.toggle('open', open.a);
  }
  function actDetail0(a) {
    if (!a) return '<p class="empty">Vælg en aktivitet.</p>';
    var groups = {}, order = [];
    a.people.forEach(function (id) {
      var p = byId(persons, id); if (!p) return;
      var f = firmAt(p, a.dato), k = f ? f.id : 0;
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(p);
    });
    var h = '<button type="button" class="btn back" data-back="a">‹ Tilbage til listen</button>';
    h += '<div><h2>' + esc(a.titel) + '</h2><p class="muted">' + esc(a.type) + ' · ' + fmtDate(a.dato) + (a.sted ? ' · ' + esc(a.sted) : '') + '</p>' +
      '<p style="margin-top:6px">' + (a.me ? 'Jeg var selv til stede.' : 'Jeg var ikke til stede. Registreret via kollega: ' + a.via.map(pname).join(', ') + '.') + '</p></div>';
    h += '<section><h3>Noter og intel</h3><p>' + (a.note ? esc(a.note) : '<span class="muted">Ingen noter.</span>') + '</p></section>';
    h += '<section><h3>Deltagere</h3><ul class="blist">' + order.map(function (k) {
      var f = k ? byId(firms, k) : null;
      return '<li><strong>' + (f ? go('f', f.id) + esc(f.navn) + '</button>' : 'Virksomhed ikke angivet') + '</strong><span>' +
        groups[k].map(function (p) { return go('p', p.id) + esc(p.navn) + '</button>' + (isColleague(p) ? ' <span class="badge">Kollega</span>' : ''); }).join(', ') + '</span></li>';
    }).join('') + '</ul></section>';
    h += '<section><h3>Nævnte projekter</h3>' + (a.proj.length ? '<ul class="plist">' + a.proj.map(function (id) { return projRow(byId(projects, id), ''); }).join('') + '</ul>' : '<p class="muted">Ingen projekter nævnt.</p>') + '</section>';
    h += fuSection('a', a.id);
    return h;
  }

  // Opfølgningsfanen
  function renderFu() {
    var v = $('#v-o').value;
    var list = followups.filter(function (f) { return v === 'all' || (v === 'done' ? f.done : !f.done); });
    var groups = [['over', 'Forfaldne'], ['today', 'I dag'], ['week', 'Næste 7 dage'], ['later', 'Senere'], ['done', 'Udført']];
    $('#c-o').textContent = list.length + ' opfølgninger';
    var html = groups.map(function (g) {
      var items = list.filter(function (f) { return bucket(f) === g[0]; }).sort(function (a, b) { return a.forfald < b.forfald ? -1 : 1; });
      if (!items.length) return '';
      return '<div class="fugroup"><h3 class="' + (g[0] === 'over' ? 'over' : '') + '"><span>' + g[1] + '</span><span>' + items.length + '</span></h3><ul class="fulist">' + items.map(function (f) { return fuItem(f, 'o'); }).join('') + '</ul></div>';
    }).join('');
    $('#fu-all').innerHTML = html || '<p class="empty">Ingen opfølgninger her.</p>';
  }
  function renderAlarm() {
    var open2 = followups.filter(function (f) { return !f.done; });
    var over = open2.filter(function (f) { return diffDays(f.forfald, TODAY) < 0; }).length;
    var today = open2.filter(function (f) { return diffDays(f.forfald, TODAY) === 0; }).length;
    var warned = open2.filter(function (f) { return alarmOn(f) && diffDays(f.forfald, TODAY) > 0; }).length;
    var total = open2.filter(alarmOn).length;
    var el = $('#alarm'), n = $('#n-o');
    n.textContent = total ? total : ''; n.classList.toggle('hot', total > 0);
    if (!total) { el.hidden = true; return; }
    var parts = [];
    if (over) parts.push(over + ' forfaldne');
    if (today) parts.push(today + ' i dag');
    if (warned) parts.push(warned + ' varslet i forvejen');
    el.hidden = false;
    el.innerHTML = '<span><strong>Alarm:</strong> ' + parts.join(', ') + '</span><button type="button" class="btn small" data-tab="o">Se opfølgning</button>';
  }

  // Netværk
  var chart = null;
  var HAS = typeof echarts !== 'undefined';
  function renderNet() {
    if (!HAS) { $('#c-net').innerHTML = '<p class="hint">Diagrambiblioteket kunne ikke hentes. Opdater siden.</p>'; return; }
    if (!chart) chart = echarts.init($('#c-net'));
    var showP = $('#n-persons').checked;
    var nodes = [], links = [], seen = {};
    function link(s, t, dashed) { var k = s + '>' + t; if (seen[k]) return; seen[k] = 1; links.push({ source: s, target: t, lineStyle: { type: dashed ? 'dashed' : 'solid', opacity: 0.55 } }); }
    firms.forEach(function (f) {
      nodes.push({ id: 'f' + f.id, name: f.navn, category: f.kat === 'egen' ? 1 : 0, symbol: 'roundRect', symbolSize: 26, itemStyle: { color: f.kat === 'egen' ? css('--accent') : css('--head-fg') }, label: { show: true } });
    });
    projects.forEach(function (p) {
      nodes.push({ id: 'j' + p.id, name: p.navn, category: 3, symbol: 'diamond', symbolSize: 18, itemStyle: { color: css(PH[p.fase].c), borderColor: css('--fg'), borderWidth: p.fase === 'fravalgt' ? 1.2 : 0.4, borderType: p.fase === 'fravalgt' ? 'dashed' : 'solid' }, label: { show: true } });
      if (p.bygherre) link('f' + p.bygherre, 'j' + p.id, false);
    });
    if (showP) {
      persons.forEach(function (p) {
        nodes.push({ id: 'p' + p.id, name: p.navn, category: isColleague(p) ? 4 : 2, symbolSize: isColleague(p) ? 14 : 10, itemStyle: { color: isColleague(p) ? css('--accent') : css('--muted') }, label: { show: false } });
        p.emp.forEach(function (e) { link('p' + p.id, 'f' + e.firm, e.til != null); });
      });
      acts.forEach(function (a) { a.people.forEach(function (pid) { a.proj.forEach(function (jid) { link('p' + pid, 'j' + jid, true); }); }); });
    }
    chart.setOption({
      aria: { enabled: true },
      textStyle: { fontFamily: css('--font-body') },
      tooltip: { formatter: function (p) { return p.dataType === 'node' ? esc(p.data.name) : ''; } },
      series: [{
        type: 'graph', layout: 'force', roam: true, draggable: true,
        categories: [{ name: 'Virksomhed' }, { name: 'Egen virksomhed' }, { name: 'Person' }, { name: 'Projekt' }, { name: 'Kollega' }],
        data: nodes, links: links,
        force: { repulsion: showP ? 120 : 260, gravity: 0.08, edgeLength: showP ? [30, 90] : [60, 140] },
        label: { color: css('--fg'), fontSize: 10, position: 'right' },
        lineStyle: { color: css('--muted'), width: 1, curveness: 0.08 },
        emphasis: { focus: 'adjacency', label: { show: true } }
      }]
    }, true);
    chart.resize();
  }
  function legend() {
    $('#n-legend').innerHTML = [['Virksomhed', '--head-fg'], ['NIRAS og kolleger', '--accent'], ['Person', '--muted']].map(function (x) {
      return '<span><span class="dot" style="--c:var(' + x[1] + ')"></span> ' + x[0] + '</span>';
    }).join('') + Object.keys(PH).map(function (k) {
      return '<span><span class="dot' + (k === 'fravalgt' ? ' fra' : '') + '" style="--c:var(' + PH[k].c + ')"></span> ' + PH[k].n + '</span>';
    }).join('');
  }

  // Aktivitetsformular
  function fillSelect(el, items, ph) { el.innerHTML = (ph ? '<option value="">' + ph + '</option>' : '') + items.map(function (i) { return '<option value="' + esc(i[0]) + '">' + esc(i[1]) + '</option>'; }).join(''); }
  function fillProjSelect() {
    var items = projects.slice().sort(function (a, b) { return a.navn.localeCompare(b.navn, 'da'); }).map(function (p) { return [p.id, p.navn + ' (' + PH[p.fase].n + ')']; });
    items.push(['new', 'Nyt projekt…']);
    fillSelect($('#f-proj'), items, 'Vælg projekt…');
  }
  function fillColSelect() { fillSelect($('#f-kol'), colleagues().map(function (p) { return [p.id, p.navn]; }), 'Vælg kollega…'); }
  function fillFuPersonSelects() {
    var all = persons.slice().sort(function (a, b) { return a.navn.localeCompare(b.navn, 'da'); }).map(function (p) { return [p.id, p.navn]; });
    fillSelect($('#o-p'), all, 'Ingen person');
  }
  function setupForm() {
    fillSelect($('#f-type'), TYPER.map(function (t) { return [t, t]; }));
    fillSelect($('#k-a'), TYPER.map(function (t) { return [t, t]; }), 'Alle typer');
    fillProjSelect(); fillColSelect(); fillFuPersonSelects();
    fillSelect($('#f-np-firm'), firms.filter(function (f) { return f.kat !== 'egen'; }).map(function (f) { return [f.id, f.navn]; }), 'Ukendt bygherre');
    fillSelect($('#f-np-fase'), Object.keys(PH).map(function (k) { return [k, PH[k].n]; }));
    $('#f-np-fase').value = 'rygte';
    $('#f-fu-v').innerHTML = varselOptions(); $('#o-v').innerHTML = varselOptions();
  }
  function resetForm() {
    formPeople = []; formProjs = []; formKol = []; formFu = [];
    $('#f-date').value = TODAY; $('#f-title').value = ''; $('#f-place').value = ''; $('#f-note').value = ''; $('#f-pq').value = '';
    $('#f-me').checked = true; $('#f-kolbox').hidden = true; $('#f-kol').value = '';
    $('#f-np-name').value = ''; $('#f-np-why').value = ''; $('#f-proj').value = ''; $('#f-newproj').hidden = true;
    $('#f-fu-t').value = ''; $('#f-fu-d').value = addDays(TODAY, 14); $('#f-fu-v').value = '0'; $('#f-err').textContent = '';
    renderFormChips(); renderPicks();
  }
  function renderFormChips() {
    $('#f-pchips').innerHTML = formPeople.map(function (id) { var p = byId(persons, id), f = firmOf(p); return '<span class="chip">' + esc(p.navn) + (f ? '<span class="muted">' + esc(f.navn) + '</span>' : '') + '<button type="button" data-rmp="' + id + '" aria-label="Fjern ' + esc(p.navn) + '">×</button></span>'; }).join('');
    $('#f-jchips').innerHTML = formProjs.map(function (id) { var p = byId(projects, id); return '<span class="chip">' + esc(p.navn) + '<span class="muted">' + PH[p.fase].n + '</span><button type="button" data-rmj="' + id + '" aria-label="Fjern ' + esc(p.navn) + '">×</button></span>'; }).join('');
    $('#f-kchips').innerHTML = formKol.map(function (id) { var p = byId(persons, id); return '<span class="chip">' + esc(p.navn) + '<button type="button" data-rmk="' + id + '" aria-label="Fjern ' + esc(p.navn) + '">×</button></span>'; }).join('');
    $('#f-fchips').innerHTML = formFu.map(function (f, i) { return '<span class="chip">' + esc(f.tekst) + '<span class="muted">' + fmtDate(f.forfald) + '</span><button type="button" data-rmf="' + i + '" aria-label="Fjern opfølgning">×</button></span>'; }).join('');
    var sel2 = $('#f-fu-p'), keep = sel2.value;
    fillSelect(sel2, formPeople.map(function (id) { return [id, byId(persons, id).navn]; }), 'Hele aktiviteten');
    if (keep && formPeople.indexOf(+keep) >= 0) sel2.value = keep;
  }
  function renderPicks() {
    var q = $('#f-pq').value.trim().toLowerCase();
    if (!q) { $('#f-picks').innerHTML = ''; return; }
    var m = persons.filter(function (p) { var f = firmOf(p); return formPeople.indexOf(p.id) < 0 && (p.navn + ' ' + (f ? f.navn : '')).toLowerCase().indexOf(q) >= 0; }).slice(0, 5);
    var h = m.map(function (p) { var f = firmOf(p); return '<button type="button" data-addp="' + p.id + '">' + esc(p.navn) + (f ? ' · ' + esc(f.navn) : '') + '</button>'; }).join('');
    var exact = persons.some(function (p) { return p.navn.toLowerCase() === q; });
    if (!exact) h += '<button type="button" data-newp="' + esc($('#f-pq').value.trim()) + '">Opret «' + esc($('#f-pq').value.trim()) + '» som ny person</button>';
    $('#f-picks').innerHTML = h;
  }
  function addPerson(id) { if (formPeople.indexOf(id) < 0) formPeople.push(id); $('#f-pq').value = ''; renderFormChips(); renderPicks(); }
  function nextId(arr) { return arr.reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1; }
  function addProject() {
    var v = $('#f-proj').value, err = $('#f-err');
    err.textContent = '';
    if (!v) { err.textContent = 'Vælg et projekt, eller vælg Nyt projekt.'; return; }
    if (v === 'new') {
      var name = $('#f-np-name').value.trim();
      if (!name) { err.textContent = 'Skriv navnet på det nye projekt.'; return; }
      var pr = { id: nextId(projects), navn: name, bygherre: +$('#f-np-firm').value || 0, fase: $('#f-np-fase').value, honorar: null, begr: $('#f-np-why').value.trim(), rm: '', kilde: 'aktivitet', start: '', anlaeg: null, bygherreNavn: '', log: [{ dato: TODAY, tekst: 'Oprettet fra aktivitet' }] };
      projects.push(pr); fillProjSelect();
      if (formProjs.indexOf(pr.id) < 0) formProjs.push(pr.id);
      $('#f-np-name').value = ''; $('#f-np-why').value = '';
    } else if (formProjs.indexOf(+v) < 0) formProjs.push(+v);
    $('#f-proj').value = ''; $('#f-newproj').hidden = true;
    renderFormChips();
  }
  function addFormFu() {
    var t = $('#f-fu-t').value.trim(), err = $('#f-err');
    err.textContent = '';
    if (!t) { err.textContent = 'Skriv, hvad der skal følges op på.'; return; }
    formFu.push({ tekst: t, forfald: $('#f-fu-d').value || addDays(TODAY, 14), varsel: +$('#f-fu-v').value, person: +$('#f-fu-p').value || 0 });
    $('#f-fu-t').value = '';
    renderFormChips();
  }
  function saveForm(e) {
    e.preventDefault();
    var err = $('#f-err'), me = $('#f-me').checked;
    if (!me && !formKol.length) { err.textContent = 'Vælg den kollega, der var til stede.'; return; }
    var people = formPeople.slice();
    if (!me) formKol.forEach(function (id) { if (people.indexOf(id) < 0) people.push(id); });
    if (!people.length) { err.textContent = 'Tilføj mindst én deltager.'; return; }
    var type = $('#f-type').value, first = byId(persons, people[0]);
    var titel = $('#f-title').value.trim() || (type + ' med ' + first.navn);
    var a = { id: nextId(acts), type: type, dato: $('#f-date').value || TODAY, titel: titel, sted: $('#f-place').value.trim(), people: people, note: $('#f-note').value.trim(), proj: formProjs.slice(), me: me, via: me ? [] : formKol.slice() };
    acts.push(a);
    formFu.forEach(function (f) { followups.push({ id: nextId(followups), tekst: f.tekst, forfald: f.forfald, person: f.person, act: a.id, proj: 0, done: false, varsel: f.varsel }); });
    $('#form-a').hidden = true;
    resetForm();
    sel.a = a.id; open.a = true;
    renderAll();
    toast('Aktiviteten er tilføjet');
  }

  // Jobskifte og opfølgning fra detaljer
  function saveJob(form) {
    var p = byId(persons, +form.getAttribute('data-job')), v = form.elements.firm.value, firmId;
    if (v === 'new') {
      var nn = form.elements.nn.value.trim();
      if (!nn) { toast('Skriv navnet på den nye virksomhed'); return; }
      var nf = { id: nextId(firms), navn: nn, kat: form.elements.nk.value, sub: KAT[form.elements.nk.value], by: '', cvr: '', medarb: null, web: '', note: '', typ: {} };
      firms.push(nf); firmId = nf.id;
    } else firmId = +v;
    var fra = form.elements.fy.value + '-' + form.elements.fm.value;
    var c = cur(p);
    if (c) c.til = fra < c.fra ? c.fra : fra;
    p.emp.push({ firm: firmId, titel: form.elements.t.value.trim(), fra: fra, til: null });
    p.bek = TODAY.slice(0, 7);
    renderAll();
    toast('Jobskifte registreret. Historikken er bevaret.');
  }
  function saveFu(form) {
    var key = form.getAttribute('data-fu').split(':'), kind = key[0], id = +key[1];
    var t = form.elements.t.value.trim();
    if (!t) { toast('Skriv, hvad der skal ske'); return; }
    followups.push({ id: nextId(followups), tekst: t, forfald: form.elements.d.value || addDays(TODAY, 7), person: kind === 'p' ? id : 0, act: kind === 'a' ? id : 0, proj: 0, done: false, varsel: +form.elements.v.value });
    renderAll();
    toast('Opfølgning tilføjet');
  }
  function saveFuTab(e) {
    e.preventDefault();
    var t = $('#o-t').value.trim();
    if (!t) { $('#o-err').textContent = 'Skriv, hvad der skal ske.'; return; }
    followups.push({ id: nextId(followups), tekst: t, forfald: $('#o-d').value || addDays(TODAY, 7), person: +$('#o-p').value || 0, act: 0, proj: 0, done: false, varsel: +$('#o-v').value });
    $('#o-t').value = ''; $('#o-err').textContent = ''; $('#form-o').hidden = true;
    renderAll();
    toast('Opfølgning tilføjet');
  }

  // Fælles
  var toastTimer = null;
  function toast(t) { var el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, 2200); }
  function renderAll() {
    $('#n-p').textContent = persons.length; $('#n-f').textContent = firms.length; $('#n-a').textContent = acts.length;
    fillTypoSelect(); fillListSelects(); fillProjFilters(); fillPersonForm(); renderProjects(); renderPersons(); renderFirms(); renderActs(); renderLists(); renderFu(); renderAlarm();
    if (tab === 'h') renderMatrix();
    if (tab === 'g') renderPipeline();
    if (tab === 'k') renderMap(false);
    if (tab === 'n') renderNet();
  }
  function showTab(t) {
    tab = t;
    ['p', 'f', 'a', 'j', 'g', 'o', 'k', 'l', 'h', 'n'].forEach(function (k) {
      $('#panel-' + k).hidden = k !== t;
      $('#tab-' + k).setAttribute('aria-selected', k === t ? 'true' : 'false');
    });
    if (t === 'h') renderMatrix();
    if (t === 'g') renderPipeline();
    if (t === 'k') { initMap(); renderMap(true); }
    if (t === 'n') renderNet();
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t.closest) return;
    var b = t.closest('[data-tab]');
    if (b) { showTab(b.getAttribute('data-tab')); return; }
    if (t.closest('#np-p')) { var fp = $('#form-p'); if (fp.hidden) openPersonForm(0); else fp.hidden = true; return; }
    if (t.closest('#pn-cancel')) { $('#form-p').hidden = true; return; }
    b = t.closest('[data-newperson]');
    if (b) { showTab('p'); openPersonForm(+b.getAttribute('data-newperson')); return; }
    b = t.closest('[data-pj]');
    if (b) { selJ = +b.getAttribute('data-pj'); open.j = true; showTab('j'); renderProjects(); var dj = $('#detail-j'); if (window.matchMedia && window.matchMedia('(max-width: 899px)').matches) dj.scrollIntoView({ block: 'start' }); return; }
    b = t.closest('[data-newactproj]');
    if (b) { var npid = +b.getAttribute('data-newactproj'); showTab('a'); var fa = $('#form-a'); fa.hidden = false; if (formProjs.indexOf(npid) < 0) formProjs.push(npid); renderFormChips(); $('#f-title').focus(); return; }
    if (t.closest('#np-j')) { var fj = $('#form-j'); fj.hidden = !fj.hidden; if (!fj.hidden) $('#np-name').focus(); return; }
    if (t.closest('#np-cancel')) { $('#form-j').hidden = true; return; }
    b = t.closest('#seg-board button');
    if (b) { [].forEach.call(b.parentNode.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); pl.board = b.getAttribute('data-v'); renderBoard(); return; }
    b = t.closest('#seg-metric button, #seg-weight button, #seg-fmode button');
    if (b) {
      var segEl = b.parentNode; [].forEach.call(segEl.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      if (segEl.id === 'seg-metric') pl.metric = b.getAttribute('data-v'); else if (segEl.id === 'seg-weight') pl.weighted = +b.getAttribute('data-v'); else pl.fmode = b.getAttribute('data-v');
      renderPipeline(); return;
    }
    b = t.closest('[data-kphase]');
    if (b) { var ph = b.getAttribute('data-kphase'); kph[ph] = !kph[ph]; renderMap(true); return; }
    b = t.closest('[data-kproj]');
    if (b) { sel.kp = +b.getAttribute('data-kproj'); renderMap(false); var kq = byId(projects, sel.kp); if (map && kq.loc) map.setView([kq.loc.lat, kq.loc.lng], Math.max(map.getZoom(), 10)); return; }
    b = t.closest('[data-mapproj]');
    if (b) { sel.kp = +b.getAttribute('data-mapproj'); $('#v-k').value = 'p'; $('#q-k').value = ''; $('#ms-k').value = '0'; var pj = byId(projects, sel.kp); kph[pj.fase] = true; showTab('k'); renderMap(false); if (map && pj.loc) map.setView([pj.loc.lat, pj.loc.lng], 12); return; }
    b = t.closest('[data-kpick]');
    if (b) { sel.k = +b.getAttribute('data-kpick'); renderMap(false); var kf = byId(firms, sel.k); if (map && kf.adr) map.setView([kf.adr.lat, kf.adr.lng], Math.max(map.getZoom(), 10)); return; }
    b = t.closest('[data-map]');
    if (b) { sel.k = +b.getAttribute('data-map'); $('#v-k').value = 'k'; $('#q-k').value = ''; $('#k-k').value = ''; $('#l-k').value = ''; showTab('k'); renderMap(false); var mf = byId(firms, sel.k); if (map && mf && mf.adr) map.setView([mf.adr.lat, mf.adr.lng], 12); return; }
    b = t.closest('[data-copylist]');
    if (b) {
      var cl = byId(lists, +b.getAttribute('data-copylist')), ctext = listStats(cl).ok.map(function (p) { return email(p); }).join('; ');
      var showTa = function () { var d2 = document.querySelector('#detail-l details'); if (d2) d2.open = true; var ta = $('#l-mails'); if (ta) { ta.focus(); ta.select(); } toast('Markeret. Tryk Ctrl+C eller Cmd+C'); };
      try { navigator.clipboard.writeText(ctext).then(function () { toast('Kopieret ' + listStats(cl).ok.length + ' adresser'); }, showTa); } catch (x) { showTa(); }
      return;
    }
    b = t.closest('[data-lrm]');
    if (b) { var rp = b.getAttribute('data-lrm').split(':'), rl = byId(lists, +rp[0]); rl.members = rl.members.filter(function (x) { return x !== +rp[1]; }); renderAll(); return; }
    b = t.closest('[data-ladd]');
    if (b) { var ap = b.getAttribute('data-ladd').split(':'), al = byId(lists, +ap[0]); if (al.members.indexOf(+ap[1]) < 0) al.members.push(+ap[1]); renderAll(); var q2 = $('#l-pq'); if (q2) q2.focus(); return; }
    b = t.closest('[data-ltoggle]');
    if (b) { var tp2 = b.getAttribute('data-ltoggle').split(':'), tl = byId(lists, +tp2[0]), pid = +tp2[1], ix = tl.members.indexOf(pid); if (ix >= 0) tl.members.splice(ix, 1); else tl.members.push(pid); renderAll(); return; }
    b = t.closest('[data-typo]');
    if (b) { var tp = b.getAttribute('data-typo').split(':'); setScore(byId(firms, +tp[0]), +tp[1], +tp[2]); renderFirms(); return; }
    b = t.closest('[data-go]');
    if (b) {
      var parts = b.getAttribute('data-go').split(':'), kind = parts[0], id = +parts[1];
      sel[kind] = id; open[kind] = true;
      showTab(kind); renderAll();
      var d = $('#detail-' + kind); if (d && window.matchMedia && window.matchMedia('(max-width: 899px)').matches) d.scrollIntoView({ block: 'start' });
      return;
    }
    b = t.closest('[data-back]');
    if (b) { open[b.getAttribute('data-back')] = false; renderAll(); return; }
    b = t.closest('[data-copy]');
    if (b) {
      var txt = b.getAttribute('data-copy');
      var done = function () { toast('Kopieret'); };
      var fail = function () { var s = b.previousElementSibling; if (s && window.getSelection) { var r = document.createRange(); r.selectNodeContents(s); var g = window.getSelection(); g.removeAllRanges(); g.addRange(r); } toast('Markeret, tryk kopiér på enheden'); };
      try { navigator.clipboard.writeText(txt).then(done, fail); } catch (x) { fail(); }
      return;
    }
    b = t.closest('[data-confirm]');
    if (b) { var cp = byId(persons, +b.getAttribute('data-confirm')); cp.bek = TODAY.slice(0, 7); renderAll(); toast('Job bekræftet'); return; }
    b = t.closest('[data-snooze]');
    if (b) { var sf = byId(followups, +b.getAttribute('data-snooze')); sf.forfald = addDays(sf.forfald < TODAY ? TODAY : sf.forfald, 7); renderAll(); toast('Udsat en uge'); return; }
    b = t.closest('[data-q]');
    if (b) { var inp = document.getElementById(b.getAttribute('data-target')); if (inp) inp.value = addDays(TODAY, +b.getAttribute('data-q')); return; }
    b = t.closest('[data-addp]'); if (b) { addPerson(+b.getAttribute('data-addp')); return; }
    b = t.closest('[data-newp]');
    if (b) { var np = { id: nextId(persons), navn: b.getAttribute('data-newp'), tags: [], bek: TODAY.slice(0, 7), emp: [] }; persons.push(np); fillFuPersonSelects(); addPerson(np.id); return; }
    b = t.closest('[data-rmp]'); if (b) { formPeople = formPeople.filter(function (x) { return x !== +b.getAttribute('data-rmp'); }); renderFormChips(); return; }
    b = t.closest('[data-rmj]'); if (b) { formProjs = formProjs.filter(function (x) { return x !== +b.getAttribute('data-rmj'); }); renderFormChips(); return; }
    b = t.closest('[data-rmk]'); if (b) { formKol = formKol.filter(function (x) { return x !== +b.getAttribute('data-rmk'); }); renderFormChips(); return; }
    b = t.closest('[data-rmf]'); if (b) { formFu.splice(+b.getAttribute('data-rmf'), 1); renderFormChips(); return; }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches && t.matches('[data-pf]')) {
      var pr0 = byId(projects, selJ), id0 = t.id;
      if (!setProj(pr0, t.getAttribute('data-pf'), t.value)) { renderProjects(); return; }
      fillProjSelect(); renderAll(); var again = document.getElementById(id0); if (again && again.focus) again.focus({ preventScroll: true }); return;
    }
    if (t.matches && t.matches('[data-pb]')) {
      var pbp = t.getAttribute('data-pb').split(':'), pr1 = byId(projects, +pbp[0]), id1 = t.id;
      setProj(pr1, pbp[1], t.value); fillProjSelect(); renderAll(); var ag = document.getElementById(id1); if (ag) ag.focus({ preventScroll: true }); return;
    }
    if (t.matches && t.matches('[data-nej]')) { byId(persons, +t.getAttribute('data-nej')).nej = t.checked; renderAll(); toast(t.checked ? 'Fjernet fra alle invitationer' : 'Kan inviteres igen'); return; }
    if (t.matches && t.matches('[data-fudone]')) {
      var f = byId(followups, +t.getAttribute('data-fudone')); f.done = t.checked; renderAll(); toast(f.done ? 'Markeret som udført' : 'Genåbnet'); return;
    }
    if (t.matches && t.matches('[data-jobfirm]')) {
      var box = document.getElementById('job-' + t.getAttribute('data-jobfirm') + '-new'); if (box) box.hidden = t.value !== 'new';
    }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!f.hasAttribute) return;
    if (f.hasAttribute('data-job')) { e.preventDefault(); saveJob(f); }
    else if (f.hasAttribute('data-fu')) { e.preventDefault(); saveFu(f); }
  });

  ['v-k', 'q-k', 'k-k', 'l-k', 'r-k', 'mt-k', 'ms-k'].forEach(function (id) { $('#' + id).addEventListener('input', function () { renderMap(id !== 'r-k'); }); });
  ['q-p', 'k-p', 't-p', 'l-p', 's-p'].forEach(function (id) { $('#' + id).addEventListener('input', renderPersons); });
  ['q-f', 'k-f', 'y-f'].forEach(function (id) { $('#' + id).addEventListener('input', renderFirms); });
  ['q-a', 'k-a', 'p-a', 'g-a'].forEach(function (id) { $('#' + id).addEventListener('input', renderActs); });
  $('#v-o').addEventListener('input', renderFu);
  $('#new-a').addEventListener('click', function () { var f = $('#form-a'); f.hidden = !f.hidden; if (!f.hidden) $('#f-title').focus(); });
  $('#f-cancel').addEventListener('click', function () { $('#form-a').hidden = true; resetForm(); });
  $('#form-a').addEventListener('submit', saveForm);
  $('#f-me').addEventListener('change', function () { $('#f-kolbox').hidden = $('#f-me').checked; });
  $('#f-kadd').addEventListener('click', function () { var v = +$('#f-kol').value; if (v && formKol.indexOf(v) < 0) { formKol.push(v); renderFormChips(); } $('#f-kol').value = ''; });
  $('#f-pq').addEventListener('input', renderPicks);
  $('#f-pq').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var b = $('#f-picks button'); if (b) b.click(); } });
  $('#f-proj').addEventListener('change', function () { $('#f-newproj').hidden = $('#f-proj').value !== 'new'; });
  $('#f-padd').addEventListener('click', addProject);
  $('#f-fu-add').addEventListener('click', addFormFu);
  $('#new-o').addEventListener('click', function () { var f = $('#form-o'); f.hidden = !f.hidden; if (!f.hidden) { $('#o-d').value = $('#o-d').value || addDays(TODAY, 7); $('#o-t').focus(); } });
  $('#o-cancel').addEventListener('click', function () { $('#form-o').hidden = true; });
  $('#form-o').addEventListener('submit', saveFuTab);
  $('#n-persons').addEventListener('change', renderNet);
  ['q-j', 'f-j', 's-j', 'k-j', 'o-j'].forEach(function (id) { $('#' + id).addEventListener('input', renderProjects); });
  ['src-g', 'kt-g'].forEach(function (id) { $('#' + id).addEventListener('input', renderPipeline); });
  $('#dead-g').addEventListener('change', function () { pl.dead = $('#dead-g').checked; renderBoard(); });
  $('#form-p').addEventListener('submit', function (e) { e.preventDefault(); savePerson(); });
  $('#pn-firm').addEventListener('change', function () { $('#pn-newbox').hidden = $('#pn-firm').value !== 'new'; });
  $('#form-j').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('#np-err'), name = $('#np-name').value.trim(), rm = $('#np-rm').value.trim().toUpperCase(), kilde = $('#np-kilde').value, hv = $('#np-hon').value.replace(',', '.').trim(), h = hv === '' ? null : parseFloat(hv);
    err.textContent = '';
    if (!name) { err.textContent = 'Skriv projektets navn.'; return; }
    if ((kilde === 'byggefakta' || kilde === 'hubexo') && !rm) { err.textContent = 'Markedsdata skal have et RSM-nummer.'; return; }
    if (rm && projects.some(function (x) { return x.rm === rm; })) { err.textContent = 'RSM-nummeret findes allerede. Åbn det eksisterende projekt i stedet.'; return; }
    if (h != null && (isNaN(h) || h < 0)) { err.textContent = 'Honorar skal være et tal.'; return; }
    var pr = { id: nextId(projects), navn: name, bygherre: +$('#np-by').value || 0, fase: $('#np-fase').value, honorar: h, begr: '', rm: rm, kilde: kilde, start: $('#np-start').value, anlaeg: null, bygherreNavn: '', log: [{ dato: TODAY, tekst: 'Oprettet fra ' + KILDE[kilde] }] };
    projects.push(pr); selJ = pr.id; open.j = true; $('#form-j').hidden = true; $('#np-name').value = ''; $('#np-rm').value = ''; $('#np-hon').value = '';
    fillProjSelect(); renderAll(); toast('Projekt oprettet');
  });
  $('#form-l').addEventListener('submit', function (e) {
    e.preventDefault();
    var inp = $('#nl-name'), nm = inp.value.trim(); if (!nm) { inp.focus(); return; }
    var nl = { id: nextId(lists), navn: nm, beskr: '', members: [] }; lists.push(nl); sel.l = nl.id; open.l = true; inp.value = ''; renderAll(); toast('Liste oprettet');
  });
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'l-pq') renderListPicks(); });
  window.addEventListener('resize', function () { if (chart) chart.resize(); });
  var rerenderNet = function () { if (tab === 'n') renderNet(); if (tab === 'g') renderPipeline(); if (tab === 'k') renderMap(false); };
  if (window.matchMedia) { var mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', rerenderNet); }
  new MutationObserver(rerenderNet).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ===================== Datalag: Supabase ===================== */
  var CFG = window.KR_CONFIG || {};
  var SB = null, ME = null, lastRows = null, loadedAt = 0, syncBusy = false, syncTimer = null, syncFail = 0, pending = false, booted = false;
  var UU = { f: {}, p: {}, j: {}, a: {}, o: {}, l: {} }, NN = { f: {}, p: {}, j: {}, a: {}, o: {}, l: {} }, CNT = { f: 0, p: 0, j: 0, a: 0, o: 0, l: 0 };
  var TAGU = {};
  var TYPE_DB = { 'Kaffemøde': 'kaffemoede', 'Frokostmøde': 'frokostmoede', 'Kundemøde': 'kundemoede', 'Reception': 'reception', 'Konference': 'konference', 'Netværksarrangement': 'netvaerksarrangement', 'Telefonsamtale': 'telefonsamtale', 'Andet': 'andet' };
  var TYPE_UI = {}; Object.keys(TYPE_DB).forEach(function (k) { TYPE_UI[TYPE_DB[k]] = k; });

  function newUuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function uidOf(k, n) {
    if (!n) return null;
    if (!UU[k][n]) { var u = newUuid(); UU[k][n] = u; NN[k][u] = n; if (n > CNT[k]) CNT[k] = n; }
    return UU[k][n];
  }
  function numOf(k, u) {
    if (!u) return 0;
    if (!NN[k][u]) { var n = ++CNT[k]; NN[k][u] = n; UU[k][n] = u; }
    return NN[k][u];
  }
  function qd(v) { return v == null || v === '' ? null : v; }
  function dm(ym) { return ym ? (String(ym).length === 7 ? ym + '-01' : String(ym).slice(0, 10)) : null; }
  function splitName(n) { n = String(n || '').trim(); var i = n.indexOf(' '); return i < 0 ? [n, null] : [n.slice(0, i), n.slice(i + 1)]; }
  function localISO(d) { var z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); }

  /* ---------- Status ---------- */
  function setStatus(kind, text) {
    var el = $('#sync'); if (!el) return;
    el.setAttribute('data-s', kind); el.textContent = text;
  }

  /* ---------- Indlæsning ---------- */
  function fetchAll(table, order) {
    var out = [], from = 0, size = 1000;
    function next() {
      var q = SB.from(table).select('*');
      order.forEach(function (o) { q = q.order(o); });
      return q.range(from, from + size - 1).then(function (r) {
        if (r.error) throw r.error;
        out = out.concat(r.data || []);
        if ((r.data || []).length < size) return out;
        from += size; return next();
      });
    }
    return next();
  }

  var LOGLBL = { fase: 'Fase', start_kvartal: 'Start', honorar: 'Honorar', anlaegssum: 'Anlægssum', rsm_nummer: 'RSM-nummer', bygherre_id: 'Bygherre', kilde: 'Kilde' };

  function loadAll() {
    setStatus('busy', 'Henter data…');
    var T = [['virksomhed', ['oprettet_at', 'id']], ['person', ['oprettet_at', 'id']], ['ansaettelse', ['id']], ['projekt', ['oprettet_at', 'id']], ['projekt_log', ['tidspunkt', 'id']],
      ['aktivitet', ['oprettet_at', 'id']], ['aktivitet_deltager', ['aktivitet_id', 'person_id']], ['aktivitet_projekt', ['aktivitet_id', 'projekt_id']],
      ['opfoelgning', ['forfald', 'id']], ['virksomhed_typologi', ['virksomhed_id', 'typologi_id']], ['label', ['navn', 'id']], ['label_kobling', ['id']]];
    return Promise.all(T.map(function (t) { return fetchAll(t[0], t[1]); })).then(function (r) {
      var D = {}; T.forEach(function (t, i) { D[t[0]] = r[i]; });
      applyData(D);
      loadedAt = Date.now();
    });
  }

  function applyData(D) {
    [firms, persons, projects, acts, followups, lists].forEach(function (a) { a.length = 0; });
    ['f', 'p', 'j', 'a', 'o', 'l'].forEach(function (k) { UU[k] = {}; NN[k] = {}; CNT[k] = 0; });
    TAGU = {};
    D.virksomhed.forEach(function (v) {
      var f = { id: numOf('f', v.id), navn: v.navn, kat: v.type, sub: v.underkategori || KAT[v.type] || '', by: v.by || '', cvr: v.cvr || '', medarb: v.antal_medarbejdere, web: v.web || '', note: v.noter || '', typ: {} };
      if (v.lat != null && v.lng != null) f.adr = { vej: v.adresse || '', post: v.postnr || '', by: v.by || '', lat: v.lat, lng: v.lng };
      else if (v.adresse || v.postnr) f.adrx = { vej: v.adresse || '', post: v.postnr || '', by: v.by || '' };
      firms.push(f);
    });
    D.virksomhed_typologi.forEach(function (t) { var f = byId(firms, numOf('f', t.virksomhed_id)); if (f) f.typ[t.typologi_id - 1] = t.score; });
    var emps = {};
    D.ansaettelse.forEach(function (e) { (emps[e.person_id] = emps[e.person_id] || []).push(e); });
    var tagOf = {}, listOf = {};
    D.label.forEach(function (l) {
      if (l.er_invitationsliste) { var li = { id: numOf('l', l.id), navn: l.navn, beskr: l.beskrivelse || '', members: [] }; lists.push(li); listOf[l.id] = li; }
      else { TAGU[l.navn] = l.id; tagOf[l.id] = l.navn; }
    });
    D.person.forEach(function (v) {
      var p = { id: numOf('p', v.id), navn: (v.fornavn + (v.efternavn ? ' ' + v.efternavn : '')).trim(), tags: [], bek: (v.bekendt_siden || v.oprettet_at || '').slice(0, 7) || TODAY.slice(0, 7), emp: [], nej: !!v.ikke_invitation };
      if (v.email) p.email = v.email; if (v.telefon) p.tel = v.telefon; if (v.linkedin) p.li = v.linkedin; if (v.noter) p.note = v.noter;
      var es = (emps[v.id] || []).slice().sort(function (a, b) { return (a.fra_dato || '') < (b.fra_dato || '') ? -1 : 1; });
      es.forEach(function (e) { p.emp.push({ firm: numOf('f', e.virksomhed_id), titel: e.titel || '', fra: e.fra_dato ? e.fra_dato.slice(0, 7) : '', til: e.til_dato ? e.til_dato.slice(0, 7) : null, _id: e.id }); });
      if (!p.emp.length && v.virksomhed_id) p.emp.push({ firm: numOf('f', v.virksomhed_id), titel: v.titel || '', fra: p.bek, til: null, _id: newUuid() });
      persons.push(p);
    });
    D.label_kobling.forEach(function (k) {
      if (!k.person_id) return;
      var p = byId(persons, numOf('p', k.person_id)); if (!p) return;
      if (listOf[k.label_id]) listOf[k.label_id].members.push(p.id);
      else if (tagOf[k.label_id]) p.tags.push(tagOf[k.label_id]);
    });
    var logs = {};
    D.projekt_log.forEach(function (g) { (logs[g.projekt_id] = logs[g.projekt_id] || []).push(g); });
    D.projekt.forEach(function (v) {
      var pr = { id: numOf('j', v.id), navn: v.navn, bygherre: numOf('f', v.bygherre_id), fase: v.fase, honorar: v.honorar == null ? null : +v.honorar, begr: v.begrundelse || '', rm: v.rsm_nummer || '', kilde: v.kilde, start: v.start_kvartal || '', anlaeg: v.anlaegssum == null ? null : +v.anlaegssum, bygherreNavn: v.bygherre_navn || '', log: [] };
      if (v.lat != null && v.lng != null) pr.loc = { vej: v.adresse || '', post: v.postnr || '', by: v.by || '', lat: v.lat, lng: v.lng };
      else if (v.adresse || v.postnr) pr.locx = { vej: v.adresse || '', post: v.postnr || '', by: v.by || '' };
      (logs[v.id] || []).slice().reverse().forEach(function (g) {
        var dato = localISO(new Date(g.tidspunkt)), tekst;
        if (g.felt === 'oprettet') tekst = 'Oprettet fra ' + (KILDE[g.ny_vaerdi] || g.ny_vaerdi);
        else if (g.felt === 'begrundelse') return;
        else {
          var sh = function (x) {
            if (x == null || x === '') return 'ikke sat';
            if (g.felt === 'fase') return PH[x] ? PH[x].n : x;
            if (g.felt === 'kilde') return KILDE[x] || x;
            if (g.felt === 'bygherre_id') { var f = byId(firms, numOf('f', x)); return f ? f.navn : 'ikke registreret'; }
            if (g.felt === 'honorar' || g.felt === 'anlaegssum') return String(parseFloat(x)).replace('.', ',');
            return String(x);
          };
          tekst = (LOGLBL[g.felt] || g.felt) + ': ' + sh(g.gammel_vaerdi) + ' til ' + sh(g.ny_vaerdi);
        }
        pr.log.push({ dato: dato, tekst: tekst });
      });
      projects.push(pr);
    });
    var dl = {}, ap = {};
    D.aktivitet_deltager.forEach(function (d) { (dl[d.aktivitet_id] = dl[d.aktivitet_id] || []).push(d); });
    D.aktivitet_projekt.forEach(function (d) { (ap[d.aktivitet_id] = ap[d.aktivitet_id] || []).push(d); });
    D.aktivitet.forEach(function (v) {
      acts.push({ id: numOf('a', v.id), type: TYPE_UI[v.type] || 'Andet', dato: v.dato, titel: v.titel, sted: v.sted || '', note: v.noter || '', me: v.jeg_deltog !== false,
        via: v.via_kollega_id ? [numOf('p', v.via_kollega_id)] : [],
        people: (dl[v.id] || []).map(function (d) { return numOf('p', d.person_id); }),
        proj: (ap[v.id] || []).map(function (d) { return numOf('j', d.projekt_id); }) });
    });
    D.opfoelgning.forEach(function (v) {
      followups.push({ id: numOf('o', v.id), tekst: v.tekst, forfald: v.forfald, person: numOf('p', v.person_id), act: numOf('a', v.aktivitet_id), proj: numOf('j', v.projekt_id), done: !!v.udfoert_at, doneAt: v.udfoert_at || null, varsel: v.varsel_dage || 0 });
    });
    lastRows = toRows();
  }

  /* ---------- Model til rækker ---------- */
  function toRows() {
    var R = { virksomhed: {}, person: {}, ansaettelse: {}, projekt: {}, aktivitet: {}, label: {}, aktivitet_deltager: {}, aktivitet_projekt: {}, opfoelgning: {}, virksomhed_typologi: {}, label_kobling: {} };
    firms.forEach(function (f) {
      var a = f.adr || f.adrx || null, id = uidOf('f', f.id);
      R.virksomhed[id] = { id: id, navn: f.navn, type: f.kat, cvr: qd(f.cvr), underkategori: qd(f.sub), antal_medarbejdere: f.medarb == null || f.medarb === '' || isNaN(+f.medarb) ? null : Math.round(+f.medarb), web: qd(f.web),
        adresse: a ? qd(a.vej) : null, postnr: a ? qd(a.post) : null, by: a ? qd(a.by) : qd(f.by), lat: f.adr ? f.adr.lat : null, lng: f.adr ? f.adr.lng : null, noter: qd(f.note) };
      Object.keys(f.typ || {}).forEach(function (k) {
        var s = f.typ[k];
        if (s >= 1 && s <= 5) R.virksomhed_typologi[id + '|' + (+k + 1)] = { virksomhed_id: id, typologi_id: +k + 1, score: s };
      });
    });
    var tagIds = {};
    persons.forEach(function (p) {
      var id = uidOf('p', p.id), c = cur(p), nm = splitName(p.navn);
      R.person[id] = { id: id, virksomhed_id: c ? uidOf('f', c.firm) : null, fornavn: nm[0], efternavn: nm[1], titel: c ? qd(c.titel) : null, email: qd(p.email), telefon: qd(p.tel), linkedin: qd(p.li),
        er_kollega: isColleague(p), noter: qd(p.note), bekendt_siden: dm(p.bek), ikke_invitation: !!p.nej };
      p.emp.forEach(function (e) {
        if (!e.firm) return;
        if (!e._id) e._id = newUuid();
        R.ansaettelse[e._id] = { id: e._id, person_id: id, virksomhed_id: uidOf('f', e.firm), titel: qd(e.titel), fra_dato: dm(e.fra), til_dato: dm(e.til) };
      });
      (p.tags || []).forEach(function (t) {
        t = String(t).trim(); if (!t) return;
        if (!TAGU[t]) TAGU[t] = newUuid();
        tagIds[t] = TAGU[t];
        R.label_kobling[TAGU[t] + '|' + id] = { label_id: TAGU[t], person_id: id };
      });
    });
    Object.keys(tagIds).forEach(function (t) { R.label[tagIds[t]] = { id: tagIds[t], navn: t, er_invitationsliste: false, beskrivelse: null }; });
    lists.forEach(function (l) {
      var id = uidOf('l', l.id);
      R.label[id] = { id: id, navn: l.navn, er_invitationsliste: true, beskrivelse: qd(l.beskr) };
      l.members.forEach(function (m) { var pu = uidOf('p', m); if (pu && R.person[pu]) R.label_kobling[id + '|' + pu] = { label_id: id, person_id: pu }; });
    });
    projects.forEach(function (pr) {
      var id = uidOf('j', pr.id), a = pr.loc || pr.locx || null;
      R.projekt[id] = { id: id, rsm_nummer: qd(pr.rm), navn: pr.navn, bygherre_id: pr.bygherre ? uidOf('f', pr.bygherre) : null, bygherre_navn: qd(pr.bygherreNavn), fase: pr.fase,
        honorar: pr.honorar == null ? null : pr.honorar, anlaegssum: pr.anlaeg == null ? null : pr.anlaeg, start_kvartal: qd(pr.start), kilde: pr.kilde, begrundelse: qd(pr.begr),
        adresse: a ? qd(a.vej) : null, postnr: a ? qd(a.post) : null, by: a ? qd(a.by) : null, lat: pr.loc ? pr.loc.lat : null, lng: pr.loc ? pr.loc.lng : null };
    });
    acts.forEach(function (a) {
      var id = uidOf('a', a.id), via = a.via && a.via.length ? uidOf('p', a.via[0]) : null;
      R.aktivitet[id] = { id: id, dato: a.dato, type: TYPE_DB[a.type] || 'andet', titel: a.titel, noter: qd(a.note), sted: qd(a.sted), jeg_deltog: !!a.me, via_kollega_id: via && R.person[via] ? via : null };
      a.people.forEach(function (pid) { var pu = uidOf('p', pid); if (pu && R.person[pu]) R.aktivitet_deltager[id + '|' + pu] = { aktivitet_id: id, person_id: pu }; });
      a.proj.forEach(function (jid) { var ju = uidOf('j', jid); if (ju && R.projekt[ju]) R.aktivitet_projekt[id + '|' + ju] = { aktivitet_id: id, projekt_id: ju }; });
    });
    followups.forEach(function (f) {
      var id = uidOf('o', f.id);
      if (f.done && !f.doneAt) f.doneAt = new Date().toISOString();
      if (!f.done) f.doneAt = null;
      R.opfoelgning[id] = { id: id, person_id: f.person ? uidOf('p', f.person) : null, aktivitet_id: f.act ? uidOf('a', f.act) : null, projekt_id: f.proj ? uidOf('j', f.proj) : null,
        forfald: f.forfald, varsel_dage: f.varsel || 0, tekst: f.tekst, udfoert_at: f.done ? f.doneAt : null };
    });
    return R;
  }

  /* ---------- Diff og skrivning ---------- */
  var ORDER = ['virksomhed', 'person', 'ansaettelse', 'projekt', 'aktivitet', 'label', 'aktivitet_deltager', 'aktivitet_projekt', 'opfoelgning', 'virksomhed_typologi', 'label_kobling'];
  var PKS = { aktivitet_deltager: ['aktivitet_id', 'person_id'], aktivitet_projekt: ['aktivitet_id', 'projekt_id'], virksomhed_typologi: ['virksomhed_id', 'typologi_id'], label_kobling: ['label_id', 'person_id'] };

  function diff(oldR, newR) {
    var ins = [], upd = [], del = [];
    ORDER.forEach(function (t) {
      var o = oldR[t] || {}, n = newR[t] || {};
      Object.keys(n).forEach(function (k) {
        if (!o[k]) { ins.push({ t: t, k: k, row: n[k] }); return; }
        var cols = {}, any = false;
        Object.keys(n[k]).forEach(function (c) { if (JSON.stringify(n[k][c]) !== JSON.stringify(o[k][c])) { cols[c] = n[k][c]; any = true; } });
        if (any) upd.push({ t: t, k: k, row: n[k], cols: cols });
      });
      Object.keys(o).forEach(function (k) { if (!n[k]) del.push({ t: t, k: k, row: o[k] }); });
    });
    del.reverse();
    return { ins: ins, upd: upd, del: del, n: ins.length + upd.length + del.length };
  }

  function chk(r) { if (r.error) throw r.error; return r; }

  function applyDiff(d) {
    var seq = Promise.resolve();
    function chain(fn) { seq = seq.then(fn); }
    // indsæt i FK-rækkefølge, i bidder
    ORDER.forEach(function (t) {
      var rows = d.ins.filter(function (x) { return x.t === t; });
      for (var i = 0; i < rows.length; i += 200) (function (part) {
        chain(function () {
          return SB.from(t).insert(part.map(function (x) { return x.row; })).then(chk).then(function () { part.forEach(function (x) { lastRows[t][x.k] = x.row; }); });
        });
      })(rows.slice(i, i + 200));
      d.upd.filter(function (x) { return x.t === t; }).forEach(function (x) {
        chain(function () {
          var q = SB.from(t).update(x.cols);
          if (PKS[t]) PKS[t].forEach(function (c) { q = q.eq(c, x.row[c]); }); else q = q.eq('id', x.row.id);
          return q.then(chk).then(function () { lastRows[t][x.k] = x.row; });
        });
      });
    });
    // slet i omvendt rækkefølge
    d.del.forEach(function (x) {
      chain(function () {
        var q = SB.from(x.t).delete();
        if (PKS[x.t]) PKS[x.t].forEach(function (c) { q = q.eq(c, x.row[c]); }); else q = q.eq('id', x.row.id);
        return q.then(chk).then(function () { delete lastRows[x.t][x.k]; });
      });
    });
    return seq;
  }

  function schedule(ms) {
    if (!booted) return;
    pending = true;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(runSync, ms == null ? 700 : ms);
  }
  function runSync() {
    syncTimer = null;
    if (syncBusy || !lastRows) return;
    var d = diff(lastRows, toRows());
    if (!d.n) { pending = false; syncFail = 0; setStatus('ok', 'Gemt'); return; }
    syncBusy = true; setStatus('busy', 'Gemmer…');
    applyDiff(d).then(function () {
      syncBusy = false; syncFail = 0;
      var more = diff(lastRows, toRows()).n;
      if (more) schedule(300); else { pending = false; setStatus('ok', 'Gemt'); }
    }).catch(function (err) {
      syncBusy = false; syncFail++;
      var msg = (err && err.message) || String(err);
      if (err && (err.status === 401 || /JWT|token/i.test(msg))) { setStatus('err', 'Log ind igen for at gemme'); showLogin('Din session er udløbet. Log ind igen. Dine ændringer ligger stadig i vinduet og gemmes bagefter.'); return; }
      setStatus('err', 'Kunne ikke gemme: ' + msg.slice(0, 80));
      if (window.console) console.error('Gem fejlede', err);
      syncTimer = setTimeout(runSync, Math.min(60000, 3000 * Math.pow(2, Math.min(syncFail, 4))));
    });
  }
  window.addEventListener('online', function () { if (pending) schedule(200); });
  window.addEventListener('beforeunload', function (e) { if (pending || syncBusy) { e.preventDefault(); e.returnValue = ''; return ''; } });
  ['click', 'change', 'submit'].forEach(function (ev) { document.addEventListener(ev, function () { if (booted) setTimeout(function () { schedule(); }, 0); }, true); });

  /* ---------- Login ---------- */
  function showLogin(msg) {
    var l = $('#login'); l.hidden = false;
    $('#lg-err').textContent = msg || '';
    $('#lg-form').hidden = false; $('#lg-new').hidden = true;
    setTimeout(function () { var e = $('#lg-email'); if (e) e.focus(); }, 30);
  }
  function hideLogin() { $('#login').hidden = true; }
  function ensureBruger(user) {
    return SB.from('bruger').select('id').eq('id', user.id).then(function (r) {
      if (r.error) throw r.error;
      if (r.data && r.data.length) return;
      return SB.from('bruger').insert({ id: user.id, navn: (user.email || 'Bruger').split('@')[0], email: user.email }).then(chk);
    });
  }
  function startSession(user) {
    ME = user;
    $('#me').textContent = user.email || '';
    var keep = booted && pending;
    return ensureBruger(user).then(function () { return keep ? null : loadAll(); }).then(function () {
      hideLogin();
      if (!booted) { pickInitial(); setupForm(); resetForm(); legend(); booted = true; }
      else if (!keep) { fixSel(); setupForm(); }
      if (!keep) { renderAll(); setStatus('ok', 'Gemt'); } else schedule(200);
    }).catch(function (err) {
      var msg = (err && err.message) || String(err);
      setStatus('err', 'Fejl: ' + msg.slice(0, 80));
      showLogin('Kunne ikke hente data: ' + msg);
    });
  }
  function boot() {
    if (!CFG.url || !CFG.key || !window.supabase) { showLogin('Appen mangler Supabase-indstillinger (config.js) eller kunne ikke hente biblioteket. Tjek forbindelsen.'); $('#lg-form').hidden = true; return; }
    SB = window.supabase.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    SB.auth.onAuthStateChange(function (ev) {
      if (ev === 'PASSWORD_RECOVERY') { $('#login').hidden = false; $('#lg-form').hidden = true; $('#lg-new').hidden = false; $('#lg-err').textContent = ''; }
      if (ev === 'SIGNED_OUT') { booted && (pending = false); showLogin(''); }
    });
    $('#lg-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var em = $('#lg-email').value.trim(), pw = $('#lg-pw').value;
      $('#lg-err').textContent = ''; $('#lg-go').disabled = true;
      SB.auth.signInWithPassword({ email: em, password: pw }).then(function (r) {
        $('#lg-go').disabled = false;
        if (r.error) { $('#lg-err').textContent = /Invalid login/i.test(r.error.message) ? 'Forkert e-mail eller adgangskode.' : r.error.message; return; }
        $('#lg-pw').value = '';
        startSession(r.data.user);
      });
    });
    $('#lg-forgot').addEventListener('click', function () {
      var em = $('#lg-email').value.trim(); if (!em) { $('#lg-err').textContent = 'Skriv din e-mail først.'; return; }
      SB.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname }).then(function (r) { $('#lg-err').textContent = r.error ? r.error.message : 'Hvis adressen findes, er der sendt et link til at vælge ny adgangskode.'; });
    });
    $('#lg-new').addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = $('#lg-pw2').value; if (pw.length < 8) { $('#lg-err').textContent = 'Mindst 8 tegn.'; return; }
      SB.auth.updateUser({ password: pw }).then(function (r) {
        if (r.error) { $('#lg-err').textContent = r.error.message; return; }
        $('#lg-pw2').value = ''; $('#lg-new').hidden = true; SB.auth.getSession().then(function (s) { if (s.data.session) startSession(s.data.session.user); });
      });
    });
    $('#btn-logout').addEventListener('click', function () {
      if (pending || syncBusy) { if (!confirm('Der er ændringer, der ikke er gemt endnu. Log ud alligevel?')) return; }
      SB.auth.signOut();
    });
    $('#btn-reload').addEventListener('click', function () {
      if (pending || syncBusy) { toast('Vent til ændringerne er gemt'); return; }
      loadAll().then(function () { fixSel(); setupForm(); renderAll(); toast('Data hentet'); setStatus('ok', 'Gemt'); }).catch(function (e) { toast('Kunne ikke hente: ' + e.message); });
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && booted && !pending && !syncBusy && Date.now() - loadedAt > 10 * 60 * 1000) {
        loadAll().then(function () { fixSel(); setupForm(); renderAll(); }).catch(function () {});
      }
    });
    SB.auth.getSession().then(function (s) {
      if (s.data && s.data.session) startSession(s.data.session.user); else showLogin('');
    });
  }
  function fixSel() {
    if (sel.p != null && !byId(persons, sel.p)) sel.p = null;
    if (sel.f != null && !byId(firms, sel.f)) sel.f = null;
    if (sel.a != null && !byId(acts, sel.a)) sel.a = null;
    if (sel.l != null && !byId(lists, sel.l)) sel.l = lists.length ? lists[0].id : null;
    if (typeof selJ !== 'undefined' && selJ != null && !byId(projects, selJ)) selJ = null;
    if (sel.p == null || sel.a == null) pickInitial();
  }

  /* ===================== CSV-import ===================== */
  function normH(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9æøå]/g, ''); }
  function normN(s) { return String(s == null ? '' : s).toLowerCase().replace(/(^|\s)(a\/s|aps|k\/s|i\/s|p\/s|ivs|fmba|a\.m\.b\.a\.?)(?=\s|$)/g, ' ').replace(/[^a-z0-9æøå]/g, ''); }

  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var first = text.split(/\r?\n/, 1)[0], best = ';', bc = -1;
    [';', ',', '\t'].forEach(function (c) { var n = first.split(c).length; if (n > bc) { bc = n; best = c; } });
    var rows = [], row = [], f = '', q = false, any = function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); };
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
      else if (ch === '"' && f === '') q = true;
      else if (ch === best) { row.push(f); f = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (any(row)) rows.push(row); row = []; }
      else f += ch;
    }
    row.push(f); if (any(row)) rows.push(row);
    return rows;
  }
  function decodeBuf(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }
  function parseNum(s) {
    s = String(s == null ? '' : s).trim().replace(/\s/g, '').replace(/[^\d,.\-]/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
    var v = parseFloat(s); return isNaN(v) ? null : v;
  }
  function toQuarter(s) {
    s = String(s == null ? '' : s).trim(); if (!s) return '';
    var m;
    if ((m = s.match(/(\d{4})\s*[-\/ ]?\s*[KkQq]\s*([1-4])/))) return m[1] + ' K' + m[2];
    if ((m = s.match(/[KkQq]\s*([1-4])\s*[-\/ ]?\s*(\d{4})/))) return m[2] + ' K' + m[1];
    if ((m = s.match(/([1-4])\.?\s*kvartal\s*(\d{4})/i))) return m[2] + ' K' + m[1];
    if ((m = s.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?/))) return m[1] + ' K' + (Math.floor((+m[2] - 1) / 3) + 1);
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/))) return m[3] + ' K' + (Math.floor((+m[2] - 1) / 3) + 1);
    if ((m = s.match(/^(\d{1,2})[-\/.](\d{4})$/))) return m[2] + ' K' + (Math.floor((+m[1] - 1) / 3) + 1);
    return '';
  }
  function typeFromText(s) {
    var t = String(s || '').toLowerCase();
    if (!t) return '';
    if (/bygherre/.test(t)) return 'bygherre';
    if (/arkitekt|tegnestue|landskab/.test(t)) return 'arkitekt';
    if (/entrepren|bygge/.test(t)) return 'entreprenoer';
    if (/rådgiv|raadgiv|ingeniør|ingenioer|konsulent/.test(t)) return 'raadgiver';
    if (/^egen|niras/.test(t)) return 'egen';
    return '';
  }

  var CF = [
    { k: 'fornavn', n: 'Fornavn', al: ['fornavn', 'firstname', 'givenname', 'first name'] },
    { k: 'efternavn', n: 'Efternavn', al: ['efternavn', 'lastname', 'surname', 'familyname'] },
    { k: 'navn', n: 'Fulde navn', al: ['navn', 'name', 'fuldenavn', 'fullname', 'kontaktperson', 'person'] },
    { k: 'titel', n: 'Titel', al: ['titel', 'title', 'stilling', 'jobtitle', 'jobtitel', 'position'] },
    { k: 'email', n: 'E-mail', al: ['email', 'mail', 'emailadresse', 'emailaddress', 'e-mail'] },
    { k: 'tel', n: 'Telefon', al: ['telefon', 'tlf', 'mobil', 'phone', 'mobile', 'telefonnummer', 'mobiltelefon', 'direkte'] },
    { k: 'firma', n: 'Virksomhed', al: ['virksomhed', 'firma', 'organisation', 'company', 'organization', 'arbejdsplads', 'firmanavn', 'virksomhedsnavn'] },
    { k: 'cvr', n: 'CVR', al: ['cvr', 'cvrnummer', 'cvrnr', 'vat'] },
    { k: 'vej', n: 'Adresse', al: ['adresse', 'vej', 'gade', 'address', 'street', 'vejnavn'] },
    { k: 'post', n: 'Postnr.', al: ['postnr', 'postnummer', 'zip', 'postalcode', 'postcode'] },
    { k: 'by', n: 'By', al: ['by', 'city', 'postby', 'bynavn'] },
    { k: 'web', n: 'Hjemmeside', al: ['web', 'hjemmeside', 'website', 'url', 'domæne', 'domain'] },
    { k: 'type', n: 'Virksomhedstype', al: ['type', 'virksomhedstype', 'kategori', 'segment', 'branche'] },
    { k: 'maerker', n: 'Mærker', al: ['mærker', 'maerker', 'tags', 'labels', 'roller', 'rolle'] },
    { k: 'noter', n: 'Noter', al: ['noter', 'note', 'notes', 'kommentar', 'bemærkning'] }
  ];
  var MF = [
    { k: 'rm', n: 'RSM-nummer', al: ['rsm', 'rsmnummer', 'rsmnr', 'projektnummer', 'projektid', 'sagsnummer', 'id'] },
    { k: 'navn', n: 'Projektnavn', al: ['projekt', 'projektnavn', 'navn', 'sagsnavn', 'titel', 'name'] },
    { k: 'bygherre', n: 'Bygherre', al: ['bygherre', 'bygherrenavn', 'ordregiver', 'client', 'owner'] },
    { k: 'honorar', n: 'Honorar', al: ['honorar', 'rådgiverhonorar', 'raadgiverhonorar', 'honorarmio', 'fee', 'rådgivningshonorar'] },
    { k: 'anlaeg', n: 'Anlægssum', al: ['anlægssum', 'anlaegssum', 'byggesum', 'budget', 'byggeomkostninger', 'værdi', 'sum', 'totaløkonomi'] },
    { k: 'start', n: 'Forventet start', al: ['start', 'byggestart', 'forventetstart', 'startkvartal', 'opstart', 'igangsætning', 'igangsaetning'] },
    { k: 'vej', n: 'Adresse', al: ['adresse', 'vej', 'gade', 'address', 'street', 'projektadresse'] },
    { k: 'post', n: 'Postnr.', al: ['postnr', 'postnummer', 'zip', 'postcode'] },
    { k: 'by', n: 'By', al: ['by', 'city', 'postby', 'kommune'] }
  ];

  var imp = null;
  function autoMap(header, defs) {
    var map = {}, used = {}, nh = header.map(normH);
    defs.forEach(function (d) {
      map[d.k] = -1;
      for (var a = 0; a < d.al.length; a++) {
        var i = nh.indexOf(normH(d.al[a]));
        if (i >= 0 && !used[i]) { map[d.k] = i; used[i] = 1; break; }
      }
    });
    return map;
  }
  function impPick(kind) { imp = { kind: kind }; var f = $('#imp-file'); f.value = ''; f.click(); }
  function impLoadText(text, kind, fname) {
    var rows = parseCSV(text);
    if (rows.length < 2) { toast('Filen ser tom ud. Første række skal være kolonneoverskrifter.'); return; }
    var defs = kind === 'p' ? CF : MF;
    imp = { kind: kind, fname: fname || '', header: rows[0].map(function (h) { return String(h).trim(); }), rows: rows.slice(1), defs: defs, map: autoMap(rows[0], defs), opt: { type: 'andet', enhed: 'mio', kilde: 'byggefakta' } };
    if (kind === 'j') {
      var mx = 0; [imp.map.honorar, imp.map.anlaeg].forEach(function (ci) { if (ci >= 0) imp.rows.forEach(function (r) { var v = parseNum(r[ci]); if (v != null && ci === imp.map.honorar && v > mx) mx = v; }); });
      imp.opt.enhed = mx > 100000 ? 'kr' : mx > 500 ? 'tusind' : 'mio';
    }
    impRender();
  }
  function impRead(file) {
    var fr = new FileReader();
    fr.onload = function () { impLoadText(decodeBuf(fr.result), imp.kind, file.name); };
    fr.onerror = function () { toast('Kunne ikke læse filen'); };
    fr.readAsArrayBuffer(file);
  }
  function impGet(r, k) { var i = imp.map[k]; return i >= 0 && i != null && r[i] != null ? String(r[i]).trim() : ''; }

  function impRender() {
    var kp = imp.kind === 'p';
    $('#imp-h').textContent = kp ? 'Importér kontakter' : 'Importér markedsdata';
    var h = '<p class="muted">' + esc(imp.fname) + ': ' + imp.rows.length + ' rækker. Vælg, hvilken kolonne der svarer til hvert felt. Kolonner, du ikke vælger, ignoreres.</p><div class="fgrid">';
    imp.defs.forEach(function (d) {
      h += '<label>' + esc(d.n) + '<select data-impmap="' + d.k + '"><option value="-1">(ingen)</option>' +
        imp.header.map(function (c, i) { return '<option value="' + i + '"' + (imp.map[d.k] === i ? ' selected' : '') + '>' + esc(c || 'Kolonne ' + (i + 1)) + '</option>'; }).join('') + '</select></label>';
    });
    h += '</div><div class="fgrid">';
    if (kp) {
      h += '<label>Type for nye virksomheder<select data-impopt="type">' + [['bygherre', 'Bygherre'], ['arkitekt', 'Arkitekt'], ['entreprenoer', 'Entreprenør'], ['raadgiver', 'Rådgiver'], ['andet', 'Andet']].map(function (o) { return '<option value="' + o[0] + '"' + (imp.opt.type === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
    } else {
      h += '<label>Beløb i filen er i<select data-impopt="enhed"><option value="mio"' + (imp.opt.enhed === 'mio' ? ' selected' : '') + '>mio. kr.</option><option value="tusind"' + (imp.opt.enhed === 'tusind' ? ' selected' : '') + '>tusind kr.</option><option value="kr"' + (imp.opt.enhed === 'kr' ? ' selected' : '') + '>kr.</option></select></label>';
      h += '<label>Kilde<select data-impopt="kilde">' + Object.keys(KILDE).map(function (k) { return '<option value="' + k + '"' + (imp.opt.kilde === k ? ' selected' : '') + '>' + KILDE[k] + '</option>'; }).join('') + '</select></label>';
    }
    h += '</div><div id="imp-sum" class="impsum" aria-live="polite"></div>';
    $('#imp-body').innerHTML = h;
    $('#imp').hidden = false;
    impSummary();
  }
  function impSummary() {
    var pl = imp.kind === 'p' ? contactsPlan() : marketPlan(), el = $('#imp-sum');
    imp.plan = pl;
    var h = '<h3>Resultat, hvis du importerer nu</h3><ul class="impl">' + pl.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>';
    if (pl.sample.length) h += '<p class="muted">Eksempler: ' + pl.sample.map(esc).join(' · ') + '</p>';
    if (pl.warn) h += '<p class="err" role="alert">' + esc(pl.warn) + '</p>';
    el.innerHTML = h;
    $('#imp-go').disabled = !pl.ok;
  }

  function contactsPlan() {
    var rows = imp.rows, map = imp.map, opt = imp.opt, fg = function (r, k) { return impGet(r, k); };
    var res = { ok: false, lines: [], sample: [], warn: '', newFirms: [], newPersons: [], fills: [] };
    if (map.navn < 0 && map.fornavn < 0) { res.warn = 'Vælg mindst en kolonne til navn (Fulde navn eller Fornavn).'; res.lines = ['Ingen navnekolonne valgt.']; return res; }
    var byCvr = {}, byNm = {}, tmp = 0;
    firms.forEach(function (f) { if (f.cvr) byCvr[String(f.cvr).replace(/\D/g, '')] = f; byNm[normN(f.navn)] = f; });
    var pEmail = {}, pKey = {};
    var fk = function (f) { return f ? (f.id || f._tmp) : 0; };
    persons.forEach(function (p) { if (p.email) pEmail[p.email.toLowerCase()] = p; var c = cur(p); pKey[normH(p.navn) + '|' + (c ? c.firm : 0)] = p; });
    var skipped = 0, existing = 0, filled = 0;
    rows.forEach(function (r) {
      var name = (map.fornavn >= 0 ? (fg(r, 'fornavn') + ' ' + fg(r, 'efternavn')) : fg(r, 'navn')).replace(/\s+/g, ' ').trim();
      if (!name) { skipped++; return; }
      var fn = fg(r, 'firma'), cvr = fg(r, 'cvr').replace(/\D/g, ''), f = null, isNew = false;
      if (cvr && byCvr[cvr]) f = byCvr[cvr]; else if (fn && byNm[normN(fn)]) f = byNm[normN(fn)];
      var adr = { vej: fg(r, 'vej'), post: fg(r, 'post'), by: fg(r, 'by') }, hasAdr = !!(adr.vej || adr.post || adr.by);
      if (!f && fn) {
        var kat = typeFromText(fg(r, 'type')) || opt.type, web = fg(r, 'web').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '');
        f = { id: 0, _tmp: 't' + (++tmp), navn: fn, kat: kat, sub: KAT[kat] || '', by: adr.by, cvr: cvr, medarb: null, web: web, note: '', typ: {} };
        if (hasAdr) f.adrx = adr;
        res.newFirms.push(f); byNm[normN(fn)] = f; if (cvr) byCvr[cvr] = f; isNew = true;
      } else if (f && !f._tmp) {
        (function (f, cvr, adr, hasAdr, web) {
          if ((cvr && !f.cvr) || (hasAdr && !f.adr && !f.adrx) || (web && !f.web)) {
            filled++;
            res.fills.push(function () {
              if (cvr && !f.cvr) f.cvr = cvr;
              if (web && !f.web) f.web = web;
              if (hasAdr && !f.adr && !f.adrx) { f.adrx = adr; if (!f.by) f.by = adr.by; }
            });
          }
        })(f, cvr, adr, hasAdr, fg(r, 'web').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, ''));
      }
      var em = fg(r, 'email').toLowerCase(), tel = fg(r, 'tel'), ti = fg(r, 'titel'), nt = fg(r, 'noter');
      var tags = fg(r, 'maerker').split(/[,;|]/).map(function (t) { return t.trim(); }).filter(Boolean);
      var ex = (em && pEmail[em]) || pKey[normH(name) + '|' + fk(f)];
      if (ex) {
        existing++;
        if (!ex._tmpP) {
          res.fills.push(function () {
            if (em && !ex.email) ex.email = em;
            if (tel && !ex.tel) ex.tel = tel;
            tags.forEach(function (t) { if (ex.tags.indexOf(t) < 0) ex.tags.push(t); });
            var c = cur(ex); if (c && ti && !c.titel) c.titel = ti;
          });
        }
        return;
      }
      var np = { _tmpP: true, navn: name, firm: f, titel: ti, email: em ? fg(r, 'email') : '', tel: tel, tags: tags, note: nt };
      res.newPersons.push(np);
      if (em) pEmail[em] = np;
      pKey[normH(name) + '|' + fk(f)] = np;
    });
    res.ok = res.newPersons.length + res.newFirms.length + res.fills.length > 0;
    res.lines.push(res.newPersons.length + ' nye personer');
    res.lines.push(res.newFirms.length + ' nye virksomheder');
    if (existing) res.lines.push(existing + ' rækker findes allerede og springes over (manglende felter udfyldes)');
    if (filled) res.lines.push(filled + ' eksisterende virksomheder får udfyldt CVR, web eller adresse');
    if (skipped) res.lines.push(skipped + ' rækker uden navn springes over');
    var noMail = res.newPersons.filter(function (p) { return !p.email; }).length;
    if (res.newPersons.length && noMail) res.lines.push(noMail + ' nye personer har ingen e-mail');
    res.sample = res.newPersons.slice(0, 4).map(function (p) { return p.navn + (p.firm ? ' (' + p.firm.navn + ')' : ''); });
    return res;
  }
  function contactsCommit(pl) {
    pl.newFirms.forEach(function (f) { f.id = nextId(firms); delete f._tmp; firms.push(f); });
    var month = TODAY.slice(0, 7);
    pl.newPersons.forEach(function (x) {
      var p = { id: nextId(persons), navn: x.navn, tags: x.tags, bek: month, emp: [], nej: false };
      if (x.firm) p.emp.push({ firm: x.firm.id, titel: x.titel, fra: month, til: null });
      if (x.email) p.email = x.email; if (x.tel) p.tel = x.tel; if (x.note) p.note = x.note;
      persons.push(p);
    });
    pl.fills.forEach(function (fn) { fn(); });
    return pl.newPersons.length + ' personer og ' + pl.newFirms.length + ' virksomheder importeret';
  }

  function marketPlan() {
    var rows = imp.rows, map = imp.map, opt = imp.opt, fg = function (r, k) { return impGet(r, k); };
    var res = { ok: false, lines: [], sample: [], warn: '', nye: [], opd: [] };
    if (map.navn < 0 && map.rm < 0) { res.warn = 'Vælg mindst en kolonne til RSM-nummer eller projektnavn.'; res.lines = ['Ingen projektkolonne valgt.']; return res; }
    var div = opt.enhed === 'mio' ? 1 : opt.enhed === 'tusind' ? 1000 : 1000000;
    var money = function (s) { var v = parseNum(s); return v == null ? null : Math.round(v / div * 10) / 10; };
    var byRm = {}, byNm = {}, fb = {}, seen = {}, skipped = 0, dupes = 0, noStart = 0;
    projects.forEach(function (pr) { if (pr.rm) byRm[pr.rm.toUpperCase()] = pr; byNm[normN(pr.navn)] = pr; });
    firms.filter(function (f) { return f.kat !== 'egen'; }).forEach(function (f) { fb[normN(f.navn)] = f; });
    rows.forEach(function (r) {
      var rm = fg(r, 'rm').toUpperCase(), navn = fg(r, 'navn');
      if (!rm && !navn) { skipped++; return; }
      var key = rm || normN(navn); if (seen[key]) { dupes++; return; } seen[key] = 1;
      var hon = map.honorar >= 0 ? money(fg(r, 'honorar')) : null, anl = map.anlaeg >= 0 ? money(fg(r, 'anlaeg')) : null, st = map.start >= 0 ? toQuarter(fg(r, 'start')) : '';
      var bn = fg(r, 'bygherre'), bf = bn ? fb[normN(bn)] : null;
      var ex = (rm && byRm[rm]) || (!rm && byNm[normN(navn)]) || null;
      if (ex) {
        var ch = {};
        if (hon != null && hon !== ex.honorar) ch.honorar = hon;
        if (st && st !== ex.start) ch.start = st;
        if (anl != null && anl !== ex.anlaeg) ch.anlaeg = anl;
        if (Object.keys(ch).length) res.opd.push({ pr: ex, ch: ch });
      } else {
        if (!st) noStart++;
        res.nye.push({ rm: rm, navn: navn || rm, bygherre: bf ? bf.id : 0, bygherreNavn: bf ? '' : bn, honorar: hon, anlaeg: anl, start: st, loc: { vej: fg(r, 'vej'), post: fg(r, 'post'), by: fg(r, 'by') } });
      }
    });
    res.ok = res.nye.length + res.opd.length > 0;
    res.lines.push(res.nye.length + ' nye projekter (fase Rygte)');
    res.lines.push(res.opd.length + ' eksisterende projekter får nyt honorar, start eller anlægssum');
    if (dupes) res.lines.push(dupes + ' dublet-rækker i filen springes over');
    if (skipped) res.lines.push(skipped + ' rækker uden projekt springes over');
    if (noStart) res.lines.push(noStart + ' nye projekter har ingen forventet start og står i listen over manglende data');
    res.sample = res.nye.slice(0, 3).map(function (x) { return x.navn + (x.honorar != null ? ' (honorar ' + plfmt(x.honorar, 1) + ' mio. kr.' : ' (intet honorar') + (x.start ? ', start ' + x.start : '') + ')'; });
    return res;
  }
  function marketCommit(pl) {
    var k = imp.opt.kilde;
    pl.opd.forEach(function (o) {
      var ex = o.pr;
      if (o.ch.honorar !== undefined) { ex.log.unshift({ dato: TODAY, tekst: 'Honorar: ' + (ex.honorar != null ? plfmt(ex.honorar) : 'ikke sat') + ' til ' + plfmt(o.ch.honorar) + ' (markedsdata, ' + KILDE[k] + ')' }); ex.honorar = o.ch.honorar; }
      if (o.ch.start !== undefined) { ex.log.unshift({ dato: TODAY, tekst: 'Start: ' + (ex.start || 'ikke sat') + ' til ' + o.ch.start + ' (markedsdata)' }); ex.start = o.ch.start; }
      if (o.ch.anlaeg !== undefined) { ex.log.unshift({ dato: TODAY, tekst: 'Anlægssum: ' + (ex.anlaeg != null ? plfmt(ex.anlaeg) : 'ikke sat') + ' til ' + plfmt(o.ch.anlaeg) + ' (markedsdata)' }); ex.anlaeg = o.ch.anlaeg; }
    });
    pl.nye.forEach(function (x) {
      var pr = { id: nextId(projects), navn: x.navn, bygherre: x.bygherre, fase: 'rygte', honorar: x.honorar, begr: '', rm: x.rm, kilde: k, start: x.start, anlaeg: x.anlaeg, bygherreNavn: x.bygherreNavn, log: [{ dato: TODAY, tekst: 'Oprettet fra ' + KILDE[k] }] };
      if (x.loc.vej || x.loc.post || x.loc.by) pr.locx = x.loc;
      projects.push(pr);
    });
    fillProjSelect();
    return pl.nye.length + ' nye og ' + pl.opd.length + ' opdaterede projekter';
  }

  document.addEventListener('change', function (e) {
    var t = e.target; if (!t || !imp || !imp.rows) { if (t && t.id === 'imp-file' && t.files && t.files[0] && imp) impRead(t.files[0]); return; }
    if (t.hasAttribute && t.hasAttribute('data-impmap')) { imp.map[t.getAttribute('data-impmap')] = +t.value; impSummary(); }
    if (t.hasAttribute && t.hasAttribute('data-impopt')) { imp.opt[t.getAttribute('data-impopt')] = t.value; impSummary(); }
  });
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    if (t.closest('#im-p')) { impPick('p'); return; }
    if (t.closest('#im-j')) { impPick('j'); return; }
    if (t.closest('#imp-x')) { $('#imp').hidden = true; imp = null; return; }
    if (t.closest('#imp-go')) {
      if (!imp || !imp.plan || !imp.plan.ok) return;
      var msg = imp.kind === 'p' ? contactsCommit(imp.plan) : marketCommit(imp.plan);
      $('#imp').hidden = true; imp = null;
      renderAll(); setupForm(); toast(msg + '. Gemmer…'); schedule(100);
      return;
    }
    if (t.closest('#btn-geo')) { geocodeMissing(); return; }
  });

  /* ---------- Koordinater til importerede adresser (OpenStreetMap Nominatim, max 1 opslag pr. sekund) ---------- */
  function geocodeOne(a) {
    var q = [a.vej, [a.post, a.by].filter(Boolean).join(' '), 'Danmark'].filter(Boolean).join(', ');
    return fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=dk&accept-language=da&q=' + encodeURIComponent(q)).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) {
      var x = j && j[0]; return x && x.lat != null && x.lon != null ? { lat: +x.lat, lng: +x.lon } : null;
    });
  }
  var geoBusy = false;
  function geocodeMissing() {
    if (geoBusy) return;
    var todo = [];
    firms.forEach(function (f) { if (!f.adr && f.adrx && (f.adrx.vej || f.adrx.post)) todo.push({ o: f, a: f.adrx, f: true }); });
    projects.forEach(function (p) { if (!p.loc && p.locx && (p.locx.vej || p.locx.post)) todo.push({ o: p, a: p.locx, f: false }); });
    if (!todo.length) { toast('Ingen adresser mangler koordinater'); return; }
    geoBusy = true; var i = 0, ok = 0;
    (function next() {
      if (i >= todo.length) { geoBusy = false; renderAll(); schedule(100); toast(ok + ' af ' + todo.length + ' adresser fik koordinater'); return; }
      var t = todo[i++]; toast('Finder koordinater ' + i + ' af ' + todo.length + '…');
      geocodeOne(t.a).then(function (g) {
        if (g) { var a = { vej: t.a.vej, post: t.a.post, by: t.a.by, lat: g.lat, lng: g.lng }; if (t.f) { t.o.adr = a; delete t.o.adrx; } else { t.o.loc = a; delete t.o.locx; } ok++; }
      }).catch(function () {}).then(function () { setTimeout(next, 1100); });
    })();
  }

  /* ===================== Redigér og slet ===================== */
  var ed = null;
  function edField(label, id, val, type) { return '<label for="' + id + '">' + esc(label) + '<input type="' + (type || 'text') + '" id="' + id + '" value="' + esc(val == null ? '' : val) + '"></label>'; }
  function edArea(label, id, val) { return '<label for="' + id + '" class="wide">' + esc(label) + '<textarea id="' + id + '" rows="4">' + esc(val == null ? '' : val) + '</textarea></label>'; }
  function edSel(label, id, opts, val) { return '<label for="' + id + '">' + esc(label) + '<select id="' + id + '">' + optList(opts, val) + '</select></label>'; }
  function edAdr(o) { var a = (o && (o.adr || o.loc || o.adrx || o.locx)) || {}; return edField('Adresse', 'ed-vej', a.vej) + edField('Postnr.', 'ed-post', a.post) + edField('By', 'ed-by', a.by); }
  function withEdit(html, kind, id) {
    return html.replace('</button>', '</button><div class="actions edbar"><button type="button" class="btn small" data-edit="' + kind + ':' + id + '">Rediger</button></div>');
  }
  function personDetail(p) { var h = personDetail0(p); return p ? withEdit(h, 'p', p.id) : h; }
  function firmDetail(f) { var h = firmDetail0(f); return f ? withEdit(h, 'f', f.id) : h; }
  function actDetail(a) { var h = actDetail0(a); return a ? withEdit(h, 'a', a.id) : h; }
  function projDetail(pr) { var h = projDetail0(pr); return pr ? withEdit(h, 'j', pr.id) : h; }

  function openEdit(kind, id) {
    var h = '', title = '', o;
    if (kind === 'p') {
      o = byId(persons, id); var c = cur(o); title = 'Rediger ' + o.navn;
      h = '<div class="fgrid">' + edField('Navn', 'ed-navn', o.navn) + (c ? edField('Titel', 'ed-titel', c.titel) : '') + edField('E-mail', 'ed-email', o.email, 'email') + edField('Telefon', 'ed-tel', o.tel, 'tel') +
        edField('LinkedIn', 'ed-li', o.li) + edField('Mærker, adskilt med komma', 'ed-tags', (o.tags || []).join(', ')) + '</div>' + edArea('Noter', 'ed-note', o.note);
    } else if (kind === 'f') {
      o = byId(firms, id); title = 'Rediger ' + o.navn;
      h = '<div class="fgrid">' + edField('Navn', 'ed-navn', o.navn) + edSel('Type', 'ed-kat', Object.keys(KAT).map(function (k) { return [k, KAT[k]]; }), o.kat) + edField('CVR', 'ed-cvr', o.cvr) + edField('Hjemmeside', 'ed-web', o.web) +
        edField('Antal medarbejdere', 'ed-medarb', o.medarb) + edAdr(o) + '</div>' + edArea('Noter', 'ed-note', o.note);
    } else if (kind === 'a') {
      o = byId(acts, id); title = 'Rediger aktivitet';
      h = '<div class="fgrid">' + edField('Titel', 'ed-titel', o.titel) + edField('Dato', 'ed-dato', o.dato, 'date') + edSel('Type', 'ed-type', TYPER.map(function (t) { return [t, t]; }), o.type) + edField('Sted', 'ed-sted', o.sted) + '</div>' + edArea('Noter og intel', 'ed-note', o.note);
    } else if (kind === 'j') {
      o = byId(projects, id); title = 'Rediger ' + o.navn;
      h = '<div class="fgrid">' + edField('Projektnavn', 'ed-navn', o.navn) + edAdr(o) + '</div><p class="muted">Fase, start, honorar og bygherre ændres direkte i projektets stamdata.</p>';
    }
    ed = { kind: kind, id: id };
    $('#ed-h').textContent = title; $('#ed-body').innerHTML = h + '<div class="err" id="ed-err" role="alert"></div>'; $('#ed').hidden = false;
    setTimeout(function () { var e = $('#ed-body input'); if (e) e.focus(); }, 20);
  }
  function edAddr(o, locKey) {
    var vej = $('#ed-vej').value.trim(), post = $('#ed-post').value.trim(), by = $('#ed-by').value.trim();
    var a = o[locKey] || o[locKey + 'x'] || {};
    if (vej === (a.vej || '') && post === (a.post || '') && by === (a.by || '')) return;
    delete o[locKey]; delete o[locKey + 'x'];
    if (vej || post || by) o[locKey + 'x'] = { vej: vej, post: post, by: by };
  }
  function saveEdit() {
    var err = $('#ed-err'), o, v = function (id) { return $('#' + id).value.trim(); };
    err.textContent = '';
    if (ed.kind === 'p') {
      o = byId(persons, ed.id); var nm = v('ed-navn').replace(/\s+/g, ' '), em = v('ed-email');
      if (!nm) { err.textContent = 'Skriv et navn.'; return; }
      if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { err.textContent = 'E-mailadressen ser ikke rigtig ud.'; return; }
      o.navn = nm; var c = cur(o); if (c && $('#ed-titel')) c.titel = v('ed-titel');
      if (em) o.email = em; else delete o.email;
      if (v('ed-tel')) o.tel = v('ed-tel'); else delete o.tel;
      if (v('ed-li')) o.li = v('ed-li'); else delete o.li;
      if (v('ed-note')) o.note = v('ed-note'); else delete o.note;
      o.tags = v('ed-tags').split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    } else if (ed.kind === 'f') {
      o = byId(firms, ed.id); var fn = v('ed-navn'); if (!fn) { err.textContent = 'Skriv et navn.'; return; }
      var med = v('ed-medarb'); if (med && isNaN(parseInt(med.replace(/\./g, ''), 10))) { err.textContent = 'Antal medarbejdere skal være et tal.'; return; }
      var nk = $('#ed-kat').value; if (nk !== o.kat) { if (o.sub === KAT[o.kat]) o.sub = KAT[nk]; o.kat = nk; }
      o.navn = fn; o.cvr = v('ed-cvr'); o.web = v('ed-web').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, ''); o.note = v('ed-note');
      o.medarb = med ? parseInt(med.replace(/\./g, ''), 10) : null;
      edAddr(o, 'adr'); if (v('ed-by')) o.by = v('ed-by');
    } else if (ed.kind === 'a') {
      o = byId(acts, ed.id); if (!v('ed-titel')) { err.textContent = 'Skriv en titel.'; return; } if (!v('ed-dato')) { err.textContent = 'Vælg en dato.'; return; }
      o.titel = v('ed-titel'); o.dato = v('ed-dato'); o.type = $('#ed-type').value; o.sted = v('ed-sted'); o.note = v('ed-note');
    } else if (ed.kind === 'j') {
      o = byId(projects, ed.id); if (!v('ed-navn')) { err.textContent = 'Skriv et projektnavn.'; return; }
      o.navn = v('ed-navn'); edAddr(o, 'loc');
    }
    closeEdit(); fillProjSelect(); renderAll(); toast('Rettelsen er gemt lokalt. Gemmer…'); schedule(100);
  }
  function closeEdit() { $('#ed').hidden = true; ed = null; }
  function deleteRec() {
    var kind = ed.kind, id = ed.id, name;
    if (kind === 'p') name = byId(persons, id).navn; else if (kind === 'f') name = byId(firms, id).navn; else if (kind === 'a') name = byId(acts, id).titel; else name = byId(projects, id).navn;
    if (!confirm('Slet "' + name + '"? Det kan ikke fortrydes.')) return;
    function without(arr, fn) { for (var i = arr.length - 1; i >= 0; i--) if (fn(arr[i])) arr.splice(i, 1); }
    if (kind === 'p') {
      without(persons, function (x) { return x.id === id; }); without(followups, function (x) { return x.person === id; });
      acts.forEach(function (a) { a.people = a.people.filter(function (x) { return x !== id; }); a.via = a.via.filter(function (x) { return x !== id; }); });
      lists.forEach(function (l) { l.members = l.members.filter(function (x) { return x !== id; }); });
    } else if (kind === 'f') {
      var fo = byId(firms, id);
      persons.forEach(function (p) { p.emp = p.emp.filter(function (e) { return e.firm !== id; }); });
      projects.forEach(function (pr) { if (pr.bygherre === id) { pr.bygherre = 0; pr.bygherreNavn = pr.bygherreNavn || fo.navn; } });
      without(firms, function (x) { return x.id === id; });
    } else if (kind === 'a') {
      without(acts, function (x) { return x.id === id; }); followups.forEach(function (f) { if (f.act === id) f.act = 0; });
    } else {
      without(projects, function (x) { return x.id === id; }); acts.forEach(function (a) { a.proj = a.proj.filter(function (x) { return x !== id; }); }); followups.forEach(function (f) { if (f.proj === id) f.proj = 0; });
    }
    closeEdit(); fixSel(); fillProjSelect(); setupForm(); renderAll(); toast('"' + name + '" er slettet. Gemmer…'); schedule(100);
  }
  document.addEventListener('click', function (e) {
    var t = e.target; if (!t || !t.closest) return;
    var b = t.closest('[data-edit]'); if (b) { var p = b.getAttribute('data-edit').split(':'); openEdit(p[0], +p[1]); return; }
    if (t.closest('#ed-go')) { if (ed) saveEdit(); return; }
    if (t.closest('#ed-x')) { closeEdit(); return; }
    if (t.closest('#ed-del')) { if (ed) deleteRec(); return; }
  });

  if (window.__KR_NOBOOT !== true) boot();
  window.__KR = { toRows: toRows, diff: diff, applyData: applyData, get lastRows() { return lastRows; }, set lastRows(v) { lastRows = v; }, parseCSV: parseCSV, impLoadText: impLoadText, schedule: schedule, runSync: runSync, setSB: function (s) { SB = s; }, startSession: startSession, firms: firms, persons: persons, projects: projects, acts: acts, followups: followups, lists: lists, renderAll: renderAll, toQuarter: toQuarter, parseNum: parseNum, getImp: function () { return imp; }, geocodeMissing: geocodeMissing };
})();
