const TOKEN_KEY = 'epbs_supabase_session';
const URL_KEY = 'epbs_supabase_url';
const ANON_KEY = 'epbs_supabase_anon_key';

let supabaseClient = null;
let currentUser = null;
let currentProfile = null;
let allMhs = [];
let allBimb = [];
let rekapMhs = [];
let rekapBimb = [];
let currentPrintHtml = '';

function G(id) { return document.getElementById(id); }

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fD(d) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' }); } catch { return d; }
}

function today() { return new Date().toISOString().slice(0, 10); }

function toast(msg, ok = true) {
  const t = document.createElement('div');
  t.className = 'toast-item ' + (ok ? 'toast-ok' : 'toast-err');
  t.textContent = msg;
  G('toast').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

function closeOv(id) { G(id).classList.remove('open'); }
function openOv(id)  { G(id).classList.add('open'); }

function setupSupabaseFields() {
  const row = document.querySelector('.api-row');
  if (!row) return;
  const cfg = window.EPBS_SUPABASE_CONFIG || {};
  row.innerHTML = `
    <label>Supabase URL:</label>
    <input type="text" id="supabaseUrl" placeholder="https://xxxx.supabase.co">
    <label style="margin-top:8px">Anon Key:</label>
    <input type="password" id="supabaseAnon" placeholder="paste anon public key">
  `;
  G('supabaseUrl').value = cfg.url || localStorage.getItem(URL_KEY) || '';
  G('supabaseAnon').value = cfg.anonKey || localStorage.getItem(ANON_KEY) || '';
}

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const cfg = window.EPBS_SUPABASE_CONFIG || {};
  const url = (G('supabaseUrl') && G('supabaseUrl').value.trim()) || cfg.url || localStorage.getItem(URL_KEY) || '';
  const anon = (G('supabaseAnon') && G('supabaseAnon').value.trim()) || cfg.anonKey || localStorage.getItem(ANON_KEY) || '';
  if (!url || !anon) throw new Error('Isi Supabase URL dan anon key terlebih dahulu.');
  localStorage.setItem(URL_KEY, url);
  localStorage.setItem(ANON_KEY, anon);
  supabaseClient = window.supabase.createClient(url, anon);
  return supabaseClient;
}

async function logAction(action, detail) {
  try {
    const sb = getSupabaseClient();
    await sb.from('activity_logs').insert({
      id: crypto.randomUUID(),
      user_id: currentUser && currentUser.id,
      action,
      detail: detail || ''
    });
  } catch {}
}

async function getProfile(userId) {
  const sb = getSupabaseClient();
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
  if (error) throw new Error('Profil user belum ada di tabel profiles. Buat profil admin/dosen dahulu di Supabase.');
  return data;
}

async function doLogin() {
  const email = G('loginEmail').value.trim();
  const password = G('loginPass').value;
  G('loginErr').style.display = 'none';
  try {
    if (!email || !password) throw new Error('Email dan password wajib diisi.');
    supabaseClient = null;
    const sb = getSupabaseClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    currentProfile = await getProfile(currentUser.id);
    showApp();
  } catch (e) { showErr(e.message); }
}

function showErr(msg) {
  const el = G('loginErr');
  el.textContent = msg;
  el.style.display = 'block';
}

async function checkAuth() {
  try {
    if (!localStorage.getItem(URL_KEY) || !localStorage.getItem(ANON_KEY)) return false;
    const sb = getSupabaseClient();
    const { data } = await sb.auth.getSession();
    if (!data.session || !data.session.user) return false;
    currentUser = data.session.user;
    currentProfile = await getProfile(currentUser.id);
    return true;
  } catch { return false; }
}

async function doLogout() {
  try { await getSupabaseClient().auth.signOut(); } catch {}
  currentUser = null;
  currentProfile = null;
  G('appShell').style.display = 'none';
  G('loginPage').style.display = 'flex';
}

function showApp() {
  G('loginPage').style.display = 'none';
  G('appShell').style.display = 'flex';
  const name = currentProfile.name || currentUser.email || 'Dosen';
  G('sbNm').textContent = name;
  G('sbRole').textContent = currentProfile.role === 'admin' ? 'Administrator' : 'Dosen Pembimbing';
  G('sbAv').textContent = name.charAt(0).toUpperCase();
  gp('dashboard');
}

const PAGE_META = {
  dashboard: { title: 'Dashboard', sub: 'Ringkasan bimbingan' },
  mahasiswa: { title: 'Mahasiswa', sub: 'Data mahasiswa bimbingan' },
  bimbingan: { title: 'Bimbingan', sub: 'Catatan sesi bimbingan' },
  rekap: { title: 'Rekap & Cetak', sub: 'Kartu bimbingan dan rekap mahasiswa' },
  log: { title: 'Log Aktivitas', sub: 'Riwayat aktivitas sistem' },
  pengaturan: { title: 'Pengaturan', sub: 'Profil dosen, export, dan import data' }
};

function gp(name, navEl) {
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('on'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  const ni = navEl || document.querySelector(`.ni[data-p="${name}"]`);
  if (ni) ni.classList.add('on');
  const pg = G('p-' + name);
  if (pg) pg.classList.add('on');
  const meta = PAGE_META[name] || {};
  G('tbTitle').textContent = meta.title || name;
  G('tbSub').textContent = meta.sub || '';
  if (name === 'dashboard') loadDash();
  if (name === 'mahasiswa') loadMhs();
  if (name === 'bimbingan') loadBimbPage();
  if (name === 'rekap') loadRekapPage();
  if (name === 'log') loadLog();
  if (name === 'pengaturan') loadSettings();
}

function statusBadge(s) {
  const map = {
    'Aktif Bimbingan': 'bdg-gr',
    'Selesai': 'bdg-tl',
    'Revisi Diperlukan': 'bdg-am',
    'Revisi': 'bdg-am',
    'Cuti': 'bdg-ink',
    'Drop Out': 'bdg-rd',
    'Menunggu Sidang': 'bdg-pu'
  };
  return `<span class="bdg ${map[s] || 'bdg-ink'}">${esc(s || '-')}</span>`;
}

function statusBadge2(s) {
  const map = { 'Selesai':'bdg-gr', 'Dijadwalkan':'bdg-am', 'Dibatalkan':'bdg-rd', 'Revisi Diperlukan':'bdg-am', 'Perlu Tindak Lanjut':'bdg-rd', 'Ditunda':'bdg-ink' };
  return `<span class="bdg ${map[s] || 'bdg-ink'}">${esc(s || '-')}</span>`;
}

function progBar(p) {
  const pct = Math.max(0, Math.min(100, Number(p) || 0));
  const c = pct >= 75 ? '#0e7c55' : pct >= 40 ? '#1a56e8' : '#8a5a00';
  return `<div class="prog-wrap"><div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:${c}"></div></div><div class="prog-num">${pct}%</div></div>`;
}

async function fetchStudentsAndGuidance() {
  const sb = getSupabaseClient();
  const [studentsRes, guidanceRes] = await Promise.all([
    sb.from('students').select('*').order('name'),
    sb.from('guidance_sessions').select('*, students(name,nim), documents(id,original_name,mime_type,file_size,storage_path,created_at)').order('session_date', { ascending: false })
  ]);
  if (studentsRes.error) throw studentsRes.error;
  if (guidanceRes.error) throw guidanceRes.error;
  allMhs = studentsRes.data || [];
  allBimb = (guidanceRes.data || []).map(row => ({
    ...row,
    student_name: row.students && row.students.name,
    nim: row.students && row.students.nim,
    documents: row.documents || []
  }));
  return { students: allMhs, guidance: allBimb };
}

function enrichStudents(students, guidance) {
  return students.map(m => {
    const list = guidance.filter(g => g.student_id === m.id);
    const latest = list.slice().sort((a, b) => String(b.session_date).localeCompare(String(a.session_date)))[0];
    return {
      ...m,
      latest_progress: latest ? latest.progress : 0,
      latest_guidance_date: latest ? latest.session_date : null,
      guidance_count: list.length
    };
  });
}

async function loadDash() {
  try {
    const { students, guidance } = await fetchStudentsAndGuidance();
    const active = students.filter(m => m.status === 'Aktif Bimbingan').length;
    const month = new Date().toISOString().slice(0, 7);
    const thisMonth = guidance.filter(g => String(g.session_date || '').slice(0, 7) === month).length;
    G('dashStats').innerHTML = `
      <div class="sc"><div class="sc-v" style="color:var(--ac)">${students.length}</div><div class="sc-l">Total Mahasiswa</div></div>
      <div class="sc"><div class="sc-v" style="color:var(--gr)">${active}</div><div class="sc-l">Aktif Bimbingan</div></div>
      <div class="sc"><div class="sc-v" style="color:var(--pu)">${guidance.length}</div><div class="sc-l">Total Bimbingan</div></div>
      <div class="sc"><div class="sc-v" style="color:var(--am)">${thisMonth}</div><div class="sc-l">Bimbingan Bulan Ini</div></div>`;

    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const enriched = enrichStudents(students, guidance);
    const attention = enriched.filter(m => !['Selesai', 'Cuti'].includes(m.status) && (!m.latest_guidance_date || m.latest_guidance_date < cutoff));
    G('attBadge').textContent = attention.length ? `(${attention.length})` : '';
    G('dashAtt').innerHTML = attention.length
      ? attention.map(m => `<div class="att-item"><div class="att-dot ${m.latest_guidance_date ? '' : 'red'}"></div><div class="att-nm">${esc(m.name)} <span style="font-size:10px;color:var(--ink3)">${esc(m.nim)}</span></div><div class="att-info">${m.latest_guidance_date ? 'Terakhir: ' + fD(m.latest_guidance_date) : 'Belum ada bimbingan'}</div></div>`).join('')
      : '<div class="empty">Semua mahasiswa terjadwal</div>';

    const rec = guidance.slice(0, 10);
    G('dashRecent').innerHTML = rec.length
      ? `<table style="width:100%"><thead><tr><th>Tgl</th><th>Mahasiswa</th><th>Topik</th><th>%</th></tr></thead><tbody>${
          rec.map(g => `<tr><td>${fD(g.session_date)}</td><td style="font-size:12px">${esc(g.student_name || '-')}</td><td style="font-size:12px;color:var(--ink2)">${esc(g.topic)}</td><td>${progBar(g.progress)}</td></tr>`).join('')
        }</tbody></table>`
      : '<div class="empty">Belum ada bimbingan</div>';
  } catch (e) { toast(e.message, false); }
}

async function loadMhs() {
  G('mhsTbody').innerHTML = '<tr><td colspan="8" class="empty">Memuat...</td></tr>';
  try {
    const { students, guidance } = await fetchStudentsAndGuidance();
    renderMhsTable(enrichStudents(students, guidance));
    populateMhsDropdown(students);
  } catch (e) {
    toast(e.message, false);
    G('mhsTbody').innerHTML = `<tr><td colspan="8" class="empty">${esc(e.message)}</td></tr>`;
  }
}

function renderMhsTable(list) {
  if (!list.length) { G('mhsTbody').innerHTML = '<tr><td colspan="8" class="empty">Tidak ada data</td></tr>'; return; }
  G('mhsTbody').innerHTML = list.map(m => `
    <tr>
      <td><b>${esc(m.nim)}</b></td>
      <td>${esc(m.name)}</td>
      <td style="font-size:12px;color:var(--ink3)">${esc(m.study_program || '-')}</td>
      <td style="font-size:12px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.thesis_title || '-')}</td>
      <td>${statusBadge(m.status)}</td>
      <td>${progBar(m.latest_progress)}</td>
      <td style="font-size:12px;color:var(--ink3)">${m.guidance_count || 0}x</td>
      <td><div style="display:flex;gap:4px"><button class="btn btn-s btn-xs" onclick="openMhsModal('${esc(m.id)}')">Edit</button><button class="btn btn-d btn-xs" onclick="delMhs('${esc(m.id)}','${esc(m.name)}')">Hapus</button></div></td>
    </tr>`).join('');
}

function filterMhs() {
  const q = G('mhsQ').value.toLowerCase();
  const st = G('mhsStatus').value;
  const enriched = enrichStudents(allMhs, allBimb);
  renderMhsTable(enriched.filter(m =>
    (!q || String(m.name).toLowerCase().includes(q) || String(m.nim).toLowerCase().includes(q)) &&
    (!st || m.status === st)
  ));
}

function populateMhsDropdown(list) {
  const options = list.map(m => `<option value="${esc(m.id)}">${esc(m.name)} (${esc(m.nim)})</option>`).join('');
  G('bimbMhsFilter').innerHTML = '<option value="">Semua Mahasiswa</option>' + options;
  G('fBimbMhs').innerHTML = '<option value="">-- Pilih Mahasiswa --</option>' + options;
}

async function openMhsModal(id) {
  G('mhsModalT').textContent = id ? 'Edit Mahasiswa' : 'Tambah Mahasiswa';
  G('mhsId').value = '';
  ['fNim','fAngkatan','fNama','fEmail','fHp','fJudul','fProdi','fCatatan'].forEach(f => { if (G(f)) G(f).value = ''; });
  G('fStatus').value = 'Aktif Bimbingan';
  G('fMulai').value = '';
  G('fTarget').value = '';
  if (id) {
    const m = allMhs.find(x => x.id === id) || (await getSupabaseClient().from('students').select('*').eq('id', id).single()).data;
    if (!m) { toast('Mahasiswa tidak ditemukan', false); return; }
    G('mhsId').value = m.id;
    G('fNim').value = m.nim || '';
    G('fAngkatan').value = m.cohort || '';
    G('fNama').value = m.name || '';
    G('fEmail').value = m.email || '';
    G('fHp').value = m.phone || '';
    G('fJudul').value = m.thesis_title || '';
    G('fProdi').value = m.study_program || '';
    G('fStatus').value = m.status || 'Aktif Bimbingan';
    G('fMulai').value = m.start_date ? String(m.start_date).slice(0, 10) : '';
    G('fTarget').value = m.target_date ? String(m.target_date).slice(0, 10) : '';
    G('fCatatan').value = m.initial_note || '';
  }
  openOv('ovMhs');
}

async function saveMhs() {
  const id = G('mhsId').value || crypto.randomUUID();
  const body = {
    id,
    nim: G('fNim').value.trim(),
    name: G('fNama').value.trim(),
    cohort: G('fAngkatan').value.trim() || null,
    email: G('fEmail').value.trim() || null,
    phone: G('fHp').value.trim() || null,
    thesis_title: G('fJudul').value.trim() || null,
    study_program: G('fProdi').value.trim() || null,
    status: G('fStatus').value,
    start_date: G('fMulai').value || null,
    target_date: G('fTarget').value || null,
    initial_note: G('fCatatan').value.trim() || null,
    lecturer_id: currentUser.id
  };
  try {
    if (!body.nim || !body.name) throw new Error('NIM dan Nama wajib diisi');
    const { error } = await getSupabaseClient().from('students').upsert(body);
    if (error) throw error;
    await logAction(G('mhsId').value ? 'Edit Mahasiswa' : 'Tambah Mahasiswa', `${body.name} (${body.nim})`);
    toast(G('mhsId').value ? 'Mahasiswa diperbarui' : 'Mahasiswa ditambahkan');
    closeOv('ovMhs');
    loadMhs();
  } catch (e) { toast(e.message, false); }
}

async function delMhs(id, name) {
  if (!confirm(`Hapus mahasiswa "${name}"?\nSemua catatan bimbingan akan ikut terhapus.`)) return;
  try {
    const { error } = await getSupabaseClient().from('students').delete().eq('id', id);
    if (error) throw error;
    await logAction('Hapus Mahasiswa', name);
    toast('Mahasiswa dihapus');
    loadMhs();
  } catch (e) { toast(e.message, false); }
}

async function loadBimbPage() {
  if (!allMhs.length) await fetchStudentsAndGuidance();
  populateMhsDropdown(allMhs);
  loadBimb();
}

async function loadBimb() {
  G('bimbTbody').innerHTML = '<tr><td colspan="8" class="empty">Memuat...</td></tr>';
  try {
    await fetchStudentsAndGuidance();
    const mhsId = G('bimbMhsFilter').value;
    const month = G('bimbMonth').value;
    let list = allBimb.slice();
    if (mhsId) list = list.filter(g => g.student_id === mhsId);
    if (month) list = list.filter(g => String(g.session_date).slice(0, 7) === month);
    if (!list.length) { G('bimbTbody').innerHTML = '<tr><td colspan="8" class="empty">Tidak ada catatan bimbingan</td></tr>'; return; }
    G('bimbTbody').innerHTML = list.map(g => `
      <tr>
        <td style="white-space:nowrap">${fD(g.session_date)}</td>
        <td style="font-size:12px"><b>${esc(g.student_name || '-')}</b><br><span style="color:var(--ink3)">${esc(g.nim || '')}</span></td>
        <td style="text-align:center"><span class="bdg bdg-ink">ke-${esc(g.meeting_number)}</span></td>
        <td style="font-size:12px;max-width:180px">${esc(g.topic)}</td>
        <td>${progBar(g.progress)}</td>
        <td>${statusBadge2(g.status)}</td>
        <td style="font-size:12px">${renderDocBadges(g.documents || [])}</td>
        <td><div style="display:flex;gap:4px"><button class="btn btn-s btn-xs" onclick="openBimbModal('${esc(g.id)}')">Edit</button><button class="btn btn-d btn-xs" onclick="delBimb('${esc(g.id)}','${esc(g.topic)}')">Hapus</button></div></td>
      </tr>`).join('');
  } catch (e) { toast(e.message, false); }
}

function renderDocBadges(docs) {
  if (!docs || !docs.length) return '<span style="color:var(--ink4)">-</span>';
  return docs.map(d => `<button class="btn btn-s btn-xs" style="margin:2px" onclick="downloadDoc('${esc(d.storage_path)}','${esc(d.original_name)}')">📎 ${esc(d.original_name)}</button>`).join('');
}

async function downloadDoc(storagePath, name) {
  try {
    const { data, error } = await getSupabaseClient().storage.from('epbs-documents').createSignedUrl(storagePath, 60);
    if (error) throw error;
    const a = document.createElement('a');
    a.href = data.signedUrl;
    a.download = name || 'dokumen';
    a.target = '_blank';
    a.click();
  } catch (e) { toast(e.message, false); }
}

async function openBimbModal(id) {
  G('bimbModalT').textContent = id ? 'Edit Catatan Bimbingan' : 'Tambah Catatan Bimbingan';
  G('bimbId').value = '';
  G('fBimbTgl').value = today();
  G('fBimbStatus').value = 'Selesai';
  G('fBimbJam1').value = '';
  G('fBimbJam2').value = '';
  G('fBimbTopik').value = '';
  G('fBimbDiskusi').value = '';
  G('fBimbHasil').value = '';
  G('fBimbTugas').value = '';
  G('fBimbProg').value = '0';
  G('fBimbNo').value = '';
  G('fBimbDocs').value = '';
  G('fBimbMhs').value = G('bimbMhsFilter').value || '';
  if (id) {
    const g = allBimb.find(x => x.id === id);
    if (!g) { toast('Data tidak ditemukan', false); return; }
    G('bimbId').value = g.id;
    G('fBimbMhs').value = g.student_id;
    G('fBimbTgl').value = g.session_date ? String(g.session_date).slice(0, 10) : '';
    G('fBimbJam1').value = g.start_time || '';
    G('fBimbJam2').value = g.end_time || '';
    G('fBimbStatus').value = g.status || 'Selesai';
    G('fBimbTopik').value = g.topic || '';
    G('fBimbDiskusi').value = g.discussion || '';
    G('fBimbHasil').value = g.result || '';
    G('fBimbTugas').value = g.assignment || '';
    G('fBimbProg').value = g.progress || 0;
    G('fBimbNo').value = g.meeting_number || '';
  }
  openOv('ovBimb');
}

async function saveBimb() {
  const id = G('bimbId').value || crypto.randomUUID();
  const body = {
    id,
    student_id: G('fBimbMhs').value,
    session_date: G('fBimbTgl').value,
    start_time: G('fBimbJam1').value || null,
    end_time: G('fBimbJam2').value || null,
    topic: G('fBimbTopik').value.trim(),
    discussion: G('fBimbDiskusi').value.trim() || null,
    result: G('fBimbHasil').value.trim() || null,
    assignment: G('fBimbTugas').value.trim() || null,
    progress: Number(G('fBimbProg').value) || 0,
    status: G('fBimbStatus').value,
    meeting_number: G('fBimbNo').value ? Number(G('fBimbNo').value) : undefined
  };
  try {
    if (!body.student_id || !body.session_date || !body.topic) throw new Error('Mahasiswa, tanggal, dan topik wajib diisi');
    if (!body.meeting_number) {
      const list = allBimb.filter(g => g.student_id === body.student_id);
      body.meeting_number = G('bimbId').value ? 1 : (Math.max(0, ...list.map(g => Number(g.meeting_number) || 0)) + 1);
    }
    const { error } = await getSupabaseClient().from('guidance_sessions').upsert(body);
    if (error) throw error;
    const files = G('fBimbDocs').files;
    if (files && files.length) await uploadDocs(id, files);
    await logAction(G('bimbId').value ? 'Edit Bimbingan' : 'Tambah Bimbingan', body.topic);
    toast(G('bimbId').value ? 'Bimbingan diperbarui' : 'Bimbingan ditambahkan');
    closeOv('ovBimb');
    loadBimb();
    if (G('p-dashboard').classList.contains('on')) loadDash();
  } catch (e) { toast(e.message, false); }
}

async function uploadDocs(sessionId, files) {
  const sb = getSupabaseClient();
  for (const file of Array.from(files)) {
    const clean = file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${currentUser.id}/${sessionId}/${crypto.randomUUID()}-${clean}`;
    const up = await sb.storage.from('epbs-documents').upload(path, file, { upsert: false });
    if (up.error) throw up.error;
    const ins = await sb.from('documents').insert({
      session_id: sessionId,
      original_name: file.name,
      stored_name: clean,
      mime_type: file.type || null,
      file_size: file.size,
      storage_path: path,
      uploaded_by: currentUser.id
    });
    if (ins.error) throw ins.error;
  }
}

async function delBimb(id, topic) {
  if (!confirm(`Hapus catatan bimbingan:\n"${topic}"?`)) return;
  try {
    const { error } = await getSupabaseClient().from('guidance_sessions').delete().eq('id', id);
    if (error) throw error;
    await logAction('Hapus Bimbingan', topic);
    toast('Bimbingan dihapus');
    loadBimb();
  } catch (e) { toast(e.message, false); }
}

async function loadRekapPage() {
  try {
    await fetchStudentsAndGuidance();
    rekapMhs = allMhs;
    rekapBimb = allBimb;
    const opts = '<option value="">-- Pilih Mahasiswa --</option>' + rekapMhs.map(m => `<option value="${esc(m.id)}">${esc(m.name)} (${esc(m.nim)})</option>`).join('');
    G('rkMhsK').innerHTML = opts;
    G('rkMhsR').innerHTML = opts;
    updateRekapSessions();
  } catch (e) { toast(e.message, false); }
}

function updateRekapSessions() {
  const mhsId = G('rkMhsK').value;
  const list = rekapBimb.filter(b => b.student_id === mhsId).sort((a, b) => String(a.session_date).localeCompare(String(b.session_date)));
  G('rkBimbK').innerHTML = list.length
    ? list.map(b => `<option value="${esc(b.id)}">Pertemuan ${esc(b.meeting_number)} - ${fD(b.session_date)} - ${esc(b.topic)}</option>`).join('')
    : '<option value="">Tidak ada sesi bimbingan</option>';
}

function printHeader(title) {
  return `<h2>${esc(title)}</h2><div class="muted">EPBS UIR - Elektronik Pemantauan Bimbingan Skripsi</div>`;
}

function studentInfoTable(m) {
  return `<table><tbody>
    <tr><th style="width:160px">Nama</th><td>${esc(m.name)}</td></tr>
    <tr><th>NIM</th><td>${esc(m.nim)}</td></tr>
    <tr><th>Program Studi</th><td>${esc(m.study_program || '-')}</td></tr>
    <tr><th>Judul TA</th><td>${esc(m.thesis_title || '-')}</td></tr>
    <tr><th>Status</th><td>${esc(m.status || '-')}</td></tr>
  </tbody></table>`;
}

function previewKartu() {
  const m = rekapMhs.find(x => x.id === G('rkMhsK').value);
  const b = rekapBimb.find(x => x.id === G('rkBimbK').value);
  if (!m || !b) { toast('Pilih mahasiswa dan sesi bimbingan', false); return; }
  currentPrintHtml = `${printHeader('KARTU BIMBINGAN TUGAS AKHIR')}${studentInfoTable(m)}<br>
    <table><tbody>
      <tr><th style="width:160px">Pertemuan</th><td>${esc(b.meeting_number)}</td></tr>
      <tr><th>Tanggal</th><td>${fD(b.session_date)}</td></tr>
      <tr><th>Waktu</th><td>${esc((b.start_time || '-') + (b.end_time ? ' - ' + b.end_time : ''))}</td></tr>
      <tr><th>Topik / Agenda</th><td>${esc(b.topic || '-')}</td></tr>
      <tr><th>Uraian Pembahasan</th><td>${esc(b.discussion || '-')}</td></tr>
      <tr><th>Hasil / Keputusan</th><td>${esc(b.result || '-')}</td></tr>
      <tr><th>Tugas Berikutnya</th><td>${esc(b.assignment || '-')}</td></tr>
      <tr><th>Progress</th><td>${esc(b.progress || 0)}%</td></tr>
      <tr><th>Status</th><td>${esc(b.status || '-')}</td></tr>
    </tbody></table>${signatureBlock()}`;
  showPrintPreview(currentPrintHtml);
}

function previewRekap() {
  const m = rekapMhs.find(x => x.id === G('rkMhsR').value);
  if (!m) { toast('Pilih mahasiswa', false); return; }
  const dari = G('rkDari').value;
  const sampai = G('rkSmp').value;
  const list = rekapBimb
    .filter(b => b.student_id === m.id)
    .filter(b => !dari || String(b.session_date).slice(0, 10) >= dari)
    .filter(b => !sampai || String(b.session_date).slice(0, 10) <= sampai)
    .sort((a, b) => String(a.session_date).localeCompare(String(b.session_date)));
  const rows = list.length ? list.map((b, i) => `<tr><td>${i + 1}</td><td>${fD(b.session_date)}</td><td>${esc(b.topic || '-')}</td><td>${esc(b.result || '-')}</td><td>${esc(b.assignment || '-')}</td><td>${esc(b.progress || 0)}%</td><td>${esc(b.status || '-')}</td></tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:#7a7e8e">Tidak ada data bimbingan</td></tr>';
  currentPrintHtml = `${printHeader('REKAP BIMBINGAN TUGAS AKHIR')}${studentInfoTable(m)}<p style="margin:14px 0;color:#3a3d4a">Rentang: ${esc(dari || 'awal')} s/d ${esc(sampai || 'akhir')}</p><table><thead><tr><th>No</th><th>Tanggal</th><th>Topik</th><th>Hasil</th><th>Tugas</th><th>Progress</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>${signatureBlock()}`;
  showPrintPreview(currentPrintHtml);
}

function signatureBlock() {
  const name = currentProfile && currentProfile.name ? currentProfile.name : 'Dosen Pembimbing';
  const jabatan = currentProfile && currentProfile.jabatan ? currentProfile.jabatan : 'Dosen Pembimbing';
  const nidn = currentProfile && currentProfile.nidn ? currentProfile.nidn : '';
  return `<div style="display:flex;justify-content:flex-end;margin-top:36px"><div style="width:240px;text-align:center"><div>Pekanbaru, ${fD(new Date().toISOString())}</div><div>${esc(jabatan)},</div><div style="height:64px"></div><div style="font-weight:700;text-decoration:underline">${esc(name)}</div>${nidn ? `<div>NIDN/NIP. ${esc(nidn)}</div>` : ''}</div></div>`;
}

function showPrintPreview(html) {
  G('printBody').innerHTML = html;
  openOv('ovPrint');
}

function printCurrentPreview() {
  const w = window.open('', '_blank', 'width=900,height=1000');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>EPBS Print</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111;font-size:13px;line-height:1.6}h2{text-align:center;margin:0 0 4px;font-size:18px}.muted{text-align:center;color:#555;font-size:12px;margin-bottom:16px}table{width:100%;border-collapse:collapse;margin-bottom:12px}th,td{border:1px solid #999;padding:7px 9px;text-align:left;vertical-align:top}th{background:#f1f1f1}@page{size:A4;margin:12mm}@media print{body{margin:0}}</style></head><body>${currentPrintHtml}<script>window.onload=function(){window.print()};<\/script></body></html>`);
  w.document.close();
}

async function loadSettings() {
  try {
    currentProfile = await getProfile(currentUser.id);
    G('setNama').value = currentProfile.name || '';
    G('setNidn').value = currentProfile.nidn || '';
    G('setJabatan').value = currentProfile.jabatan || '';
    G('setProdi').value = currentProfile.prodi || '';
    G('setFakultas').value = currentProfile.fakultas || '';
    G('setInstitusi').value = currentProfile.institusi || '';
  } catch (e) { toast(e.message, false); }
}

async function saveProfile() {
  const body = {
    id: currentUser.id,
    name: G('setNama').value.trim(),
    email: currentUser.email,
    role: currentProfile.role || 'dosen',
    nidn: G('setNidn').value.trim() || null,
    jabatan: G('setJabatan').value.trim() || null,
    prodi: G('setProdi').value.trim() || null,
    fakultas: G('setFakultas').value.trim() || null,
    institusi: G('setInstitusi').value.trim() || null
  };
  try {
    const { data, error } = await getSupabaseClient().from('profiles').update(body).eq('id', currentUser.id).select().single();
    if (error) throw error;
    currentProfile = data;
    G('sbNm').textContent = data.name;
    G('sbAv').textContent = data.name.charAt(0).toUpperCase();
    await logAction('Pengaturan', 'Profil dosen diperbarui');
    toast('Profil dosen disimpan');
  } catch (e) { toast(e.message, false); }
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportData() {
  try {
    await fetchStudentsAndGuidance();
    const sb = getSupabaseClient();
    const logs = await sb.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(3000);
    const settings = await sb.from('app_settings').select('*');
    downloadJson({
      exported_at: new Date().toISOString(),
      exported_by: currentUser.email,
      profile: currentProfile,
      students: allMhs,
      guidance_sessions: allBimb,
      activity_logs: logs.data || [],
      app_settings: settings.data || []
    }, `epbs-online-backup-${today()}.json`);
    await logAction('Export', 'Export data online ke JSON');
    toast('Export diunduh ke komputer ini');
  } catch (e) { toast(e.message, false); }
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    if (!confirm(`Import data dari ${file.name} ke Supabase?`)) return;
    const students = payload.students || payload.mahasiswa || [];
    const guidance = payload.guidance_sessions || payload.bimbingan || [];
    for (const m of students) {
      await getSupabaseClient().from('students').upsert({
        id: m.id || crypto.randomUUID(),
        nim: m.nim,
        name: m.name || m.nama,
        cohort: m.cohort || m.angkatan || null,
        email: m.email || null,
        phone: m.phone || m.hp || null,
        thesis_title: m.thesis_title || m.judul || null,
        study_program: m.study_program || m.prodi || null,
        status: m.status || 'Aktif Bimbingan',
        start_date: m.start_date || m.mulai || null,
        target_date: m.target_date || m.target || null,
        initial_note: m.initial_note || m.catatan || null,
        lecturer_id: currentUser.id
      });
    }
    for (const b of guidance) {
      await getSupabaseClient().from('guidance_sessions').upsert({
        id: b.id || crypto.randomUUID(),
        student_id: b.student_id || b.mhsId,
        session_date: b.session_date || b.tanggal,
        start_time: b.start_time || b.jamMulai || null,
        end_time: b.end_time || b.jamSelesai || null,
        topic: b.topic || b.topik || '(Tanpa topik)',
        discussion: b.discussion || b.uraian || null,
        result: b.result || b.hasil || null,
        assignment: b.assignment || b.tugas || null,
        progress: Number(b.progress) || 0,
        status: b.status || 'Selesai',
        meeting_number: Number(b.meeting_number || b.pertemuan || 1)
      });
    }
    await logAction('Import', `${students.length} mahasiswa, ${guidance.length} bimbingan`);
    toast(`Import selesai: ${students.length} mahasiswa, ${guidance.length} bimbingan`);
    loadDash();
  } catch (e) { toast('Import gagal: ' + e.message, false); }
  finally { event.target.value = ''; }
}

async function loadLog() {
  G('logTbody').innerHTML = '<tr><td colspan="4" class="empty">Memuat...</td></tr>';
  try {
    let query = getSupabaseClient().from('activity_logs').select('*').order('created_at', { ascending: false }).limit(1000);
    if (G('logFrom').value) query = query.gte('created_at', G('logFrom').value);
    if (G('logTo').value) query = query.lt('created_at', new Date(new Date(G('logTo').value).getTime() + 86400000).toISOString());
    const { data, error } = await query;
    if (error) throw error;
    if (!data.length) { G('logTbody').innerHTML = '<tr><td colspan="4" class="empty">Tidak ada log</td></tr>'; return; }
    G('logTbody').innerHTML = data.map(l => `<tr><td style="white-space:nowrap;font-size:12px">${fD(l.created_at)}<br><span style="color:var(--ink3)">${new Date(l.created_at).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</span></td><td style="font-size:12px">${esc(l.user_id || '-')}</td><td><span class="bdg bdg-ink">${esc(l.action)}</span></td><td style="font-size:12px;color:var(--ink2)">${esc(l.detail || '-')}</td></tr>`).join('');
  } catch (e) { toast(e.message, false); }
}

function clearLog() {
  G('logFrom').value = '';
  G('logTo').value = '';
  loadLog();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && G('loginPage').style.display !== 'none') doLogin();
  if (e.key === 'Escape') document.querySelectorAll('.ov.open').forEach(o => o.classList.remove('open'));
});

(async () => {
  setupSupabaseFields();
  const ok = await checkAuth();
  if (ok) showApp();
  else G('loginPage').style.display = 'flex';
})();
