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
let adminProfiles = [];
let adminStudents = [];

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

function primeSupabaseConfig() {
  const cfg = window.EPBS_SUPABASE_CONFIG || {};
  if (cfg.url) localStorage.setItem(URL_KEY, cfg.url);
  if (cfg.anonKey) localStorage.setItem(ANON_KEY, cfg.anonKey);
}

function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const cfg = window.EPBS_SUPABASE_CONFIG || {};
  const url = cfg.url || localStorage.getItem(URL_KEY) || '';
  const anon = cfg.anonKey || localStorage.getItem(ANON_KEY) || '';
  if (!url || !anon) throw new Error('Konfigurasi Supabase belum tersedia pada deploy frontend.');
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
    primeSupabaseConfig();
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
  G('adminNav').style.display = isAdmin() ? 'flex' : 'none';
  gp('dashboard');
}

function isAdmin() {
  return currentProfile && currentProfile.role === 'admin';
}

const PAGE_META = {
  dashboard: { title: 'Dashboard', sub: 'Ringkasan bimbingan' },
  mahasiswa: { title: 'Mahasiswa', sub: 'Data mahasiswa bimbingan' },
  bimbingan: { title: 'Bimbingan', sub: 'Catatan sesi bimbingan' },
  rekap: { title: 'Rekap & Cetak', sub: 'Kartu bimbingan dan rekap mahasiswa' },
  log: { title: 'Log Aktivitas', sub: 'Riwayat aktivitas sistem' },
  admin: { title: 'Admin', sub: 'Profile dosen dan penugasan mahasiswa' },
  pengaturan: { title: 'Pengaturan', sub: 'Profil dosen, export, dan import data' }
};

function gp(name, navEl) {
  if (name === 'admin' && !isAdmin()) {
    toast('Halaman admin hanya untuk administrator.', false);
    return;
  }
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
  if (name === 'admin') loadAdmin();
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

function reviewBadge(s) {
  const map = {
    'Draft Masuk': 'bdg-ink',
    'Ditinjau': 'bdg-pu',
    'Revisi Diperlukan': 'bdg-am',
    'Disetujui': 'bdg-gr',
    'Catatan Selesai': 'bdg-tl'
  };
  return `<span class="bdg ${map[s] || 'bdg-ink'}">${esc(s || 'Catatan Selesai')}</span>`;
}

function followUpBadge(dateValue, status) {
  if (!dateValue) return '<span style="color:var(--ink4)">-</span>';
  const due = String(dateValue).slice(0, 10);
  const overdue = due < today() && !['Disetujui', 'Catatan Selesai'].includes(status);
  return `<span class="bdg ${overdue ? 'bdg-rd' : 'bdg-am'}">${overdue ? 'Lewat ' : ''}${fD(due)}</span>`;
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
    sb.from('guidance_sessions').select('*, students(name,nim), documents(id,original_name,mime_type,file_size,category,storage_path,created_at)').order('session_date', { ascending: false })
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
    const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const targetSoon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const enriched = enrichStudents(students, guidance);
    const attention = enriched.filter(m => !['Selesai', 'Cuti'].includes(m.status) && (!m.latest_guidance_date || m.latest_guidance_date < cutoff));
    const dueSoon = enriched.filter(m => !['Selesai', 'Cuti'].includes(m.status) && m.target_date && String(m.target_date).slice(0, 10) <= targetSoon);
    const unassigned = students.filter(m => !m.lecturer_id);
    const overdueFollowUp = guidance.filter(g => g.follow_up_due_date && String(g.follow_up_due_date).slice(0, 10) < today() && !['Disetujui', 'Catatan Selesai'].includes(g.review_status));
    G('dashStats').innerHTML = `
      <div class="sc"><div class="sc-v" style="color:var(--ac)">${students.length}</div><div class="sc-l">Total Mahasiswa</div></div>
      <div class="sc"><div class="sc-v" style="color:var(--gr)">${active}</div><div class="sc-l">Aktif Bimbingan</div></div>
      <div class="sc"><div class="sc-v" style="color:var(--am)">${attention.length}</div><div class="sc-l">Tidak Aktif > 30 Hari</div></div>
      <div class="sc"><div class="sc-v" style="color:var(--pu)">${thisMonth}</div><div class="sc-l">Bimbingan Bulan Ini</div></div>`;
    G('dashWarnings').innerHTML = [
      isAdmin() && unassigned.length
        ? `<div class="notice notice-warn"><div><strong>${unassigned.length} mahasiswa belum ditugaskan</strong><span>Data ini belum terlihat pada akun dosen.</span></div><button class="btn btn-s btn-sm" onclick="gp('admin')">Atur Dosen</button></div>`
        : '',
      dueSoon.length
        ? `<div class="notice"><div><strong>${dueSoon.length} target selesai dekat</strong><span>Periksa mahasiswa dengan target dalam 30 hari.</span></div><button class="btn btn-s btn-sm" onclick="gp('mahasiswa')">Lihat Data</button></div>`
        : '',
      overdueFollowUp.length
        ? `<div class="notice notice-warn"><div><strong>${overdueFollowUp.length} tindak lanjut melewati batas</strong><span>Periksa sesi bimbingan dengan review yang belum selesai.</span></div><button class="btn btn-s btn-sm" onclick="gp('bimbingan')">Lihat Bimbingan</button></div>`
        : ''
    ].join('');
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

function lecturerOptions(selectedId, allowEmpty = true) {
  const options = adminProfiles
    .map(p => `<option value="${esc(p.id)}" ${p.id === selectedId ? 'selected' : ''}>${esc(p.name)} (${esc(p.email || '-')})</option>`)
    .join('');
  return `${allowEmpty ? `<option value="" ${selectedId ? '' : 'selected'}>-- Belum ditugaskan --</option>` : ''}${options}`;
}

async function loadAdmin() {
  if (!isAdmin()) return;
  G('adminProfilesTbody').innerHTML = '<tr><td colspan="6" class="empty">Memuat...</td></tr>';
  G('adminAssignTbody').innerHTML = '<tr><td colspan="5" class="empty">Memuat...</td></tr>';
  try {
    const sb = getSupabaseClient();
    const [profilesRes, studentsRes] = await Promise.all([
      sb.from('profiles').select('*').order('name'),
      sb.from('students').select('*').order('name')
    ]);
    if (profilesRes.error) throw profilesRes.error;
    if (studentsRes.error) throw studentsRes.error;
    adminProfiles = profilesRes.data || [];
    adminStudents = studentsRes.data || [];
    renderAdminProfiles();
    renderAdminAssignments();
    if (G('p-mahasiswa').classList.contains('on')) populateLecturerSelect();
  } catch (e) { toast(e.message, false); }
}

function renderAdminProfiles() {
  if (!adminProfiles.length) {
    G('adminProfilesTbody').innerHTML = '<tr><td colspan="6" class="empty">Tidak ada profile</td></tr>';
    return;
  }
  G('adminProfilesTbody').innerHTML = adminProfiles.map(p => {
    const studentCount = adminStudents.filter(s => s.lecturer_id === p.id).length;
    const isSelf = currentUser && p.id === currentUser.id;
    const roleControl = isSelf
      ? statusBadge(p.role === 'admin' ? 'Administrator' : 'Dosen')
      : `<select class="table-select" id="role-${esc(p.id)}"><option value="dosen" ${p.role === 'dosen' ? 'selected' : ''}>Dosen</option><option value="admin" ${p.role === 'admin' ? 'selected' : ''}>Admin</option></select>`;
    const filled = [p.nidn, p.jabatan, p.prodi, p.fakultas, p.institusi].filter(Boolean).length;
    return `<tr>
      <td><b>${esc(p.name)}</b></td>
      <td style="font-size:12px;color:var(--ink2)">${esc(p.email || '-')}</td>
      <td>${roleControl}</td>
      <td>${studentCount}</td>
      <td>${filled >= 3 ? '<span class="bdg bdg-gr">Lengkap</span>' : '<span class="bdg bdg-am">Perlu dilengkapi</span>'}</td>
      <td>${isSelf ? '' : `<button class="btn btn-s btn-xs" onclick="saveProfileRole('${esc(p.id)}')">Simpan Role</button>`}</td>
    </tr>`;
  }).join('');
}

async function saveProfileRole(id) {
  const profile = adminProfiles.find(p => p.id === id);
  const role = G(`role-${id}`).value;
  if (!profile || !['admin', 'dosen'].includes(role)) return;
  try {
    const { data, error } = await getSupabaseClient().from('profiles').update({ role }).eq('id', id).select().single();
    if (error) throw error;
    adminProfiles = adminProfiles.map(p => p.id === id ? data : p);
    await logAction('Ubah Role', `${profile.email || profile.name}: ${role}`);
    toast('Role profile diperbarui');
    renderAdminProfiles();
    renderAdminAssignments();
  } catch (e) { toast(e.message, false); }
}

function renderAdminAssignments() {
  if (!isAdmin()) return;
  const q = (G('adminAssignQ').value || '').toLowerCase();
  const state = G('adminAssignState').value;
  const list = adminStudents.filter(m =>
    (!q || String(m.name || '').toLowerCase().includes(q) || String(m.nim || '').toLowerCase().includes(q)) &&
    (!state || (state === 'unassigned' && !m.lecturer_id))
  );
  if (!list.length) {
    G('adminAssignTbody').innerHTML = '<tr><td colspan="5" class="empty">Tidak ada mahasiswa</td></tr>';
    return;
  }
  G('adminAssignTbody').innerHTML = list.map(m => `<tr>
    <td><b>${esc(m.nim)}</b></td>
    <td>${esc(m.name)}</td>
    <td>${statusBadge(m.status)}</td>
    <td><select class="table-select" id="assign-${esc(m.id)}">${lecturerOptions(m.lecturer_id)}</select></td>
    <td><button class="btn btn-p btn-xs" onclick="assignStudent('${esc(m.id)}')">Simpan</button></td>
  </tr>`).join('');
}

async function assignStudent(studentId) {
  const student = adminStudents.find(m => m.id === studentId);
  const lecturerId = G(`assign-${studentId}`).value || null;
  if (!student) return;
  try {
    const { data, error } = await getSupabaseClient().from('students').update({ lecturer_id: lecturerId }).eq('id', studentId).select().single();
    if (error) throw error;
    adminStudents = adminStudents.map(m => m.id === studentId ? data : m);
    const lecturer = adminProfiles.find(p => p.id === lecturerId);
    await logAction('Tugaskan Mahasiswa', `${student.name}: ${lecturer ? lecturer.name : 'belum ditugaskan'}`);
    toast('Penugasan mahasiswa disimpan');
    renderAdminProfiles();
    renderAdminAssignments();
    if (G('p-dashboard').classList.contains('on')) loadDash();
  } catch (e) { toast(e.message, false); }
}

function populateLecturerSelect(selectedId) {
  if (!isAdmin()) return;
  G('fDosen').innerHTML = lecturerOptions(selectedId, false);
}

async function openMhsModal(id) {
  G('mhsModalT').textContent = id ? 'Edit Mahasiswa' : 'Tambah Mahasiswa';
  G('mhsId').value = '';
  ['fNim','fAngkatan','fNama','fEmail','fHp','fJudul','fProdi','fCatatan'].forEach(f => { if (G(f)) G(f).value = ''; });
  G('fStatus').value = 'Aktif Bimbingan';
  G('fMulai').value = '';
  G('fTarget').value = '';
  G('mhsLecturerGroup').style.display = isAdmin() ? 'block' : 'none';
  if (isAdmin() && !adminProfiles.length) await loadAdmin();
  if (isAdmin()) populateLecturerSelect();
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
    if (isAdmin()) populateLecturerSelect(m.lecturer_id);
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
    lecturer_id: isAdmin() ? (G('fDosen').value || null) : currentUser.id
  };
  try {
    if (!body.nim || !body.name) throw new Error('NIM dan Nama wajib diisi');
    if (isAdmin() && !body.lecturer_id) throw new Error('Pilih dosen pembimbing untuk mahasiswa.');
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
  G('bimbTbody').innerHTML = '<tr><td colspan="9" class="empty">Memuat...</td></tr>';
  try {
    await fetchStudentsAndGuidance();
    const mhsId = G('bimbMhsFilter').value;
    const month = G('bimbMonth').value;
    const review = G('bimbReviewFilter').value;
    let list = allBimb.slice();
    if (mhsId) list = list.filter(g => g.student_id === mhsId);
    if (month) list = list.filter(g => String(g.session_date).slice(0, 7) === month);
    if (review) list = list.filter(g => (g.review_status || 'Catatan Selesai') === review);
    if (!list.length) { G('bimbTbody').innerHTML = '<tr><td colspan="9" class="empty">Tidak ada catatan bimbingan</td></tr>'; return; }
    G('bimbTbody').innerHTML = list.map(g => `
      <tr>
        <td style="white-space:nowrap">${fD(g.session_date)}</td>
        <td style="font-size:12px"><b>${esc(g.student_name || '-')}</b><br><span style="color:var(--ink3)">${esc(g.nim || '')}</span></td>
        <td style="text-align:center"><span class="bdg bdg-ink">ke-${esc(g.meeting_number)}</span></td>
        <td style="font-size:12px;max-width:180px">${esc(g.topic)}</td>
        <td>${progBar(g.progress)}</td>
        <td>${reviewBadge(g.review_status)}</td>
        <td>${followUpBadge(g.follow_up_due_date, g.review_status)}</td>
        <td style="font-size:12px">${renderDocBadges(g.documents || [])}</td>
        <td><div style="display:flex;gap:4px"><button class="btn btn-s btn-xs" onclick="openBimbModal('${esc(g.id)}')">Edit</button><button class="btn btn-d btn-xs" onclick="delBimb('${esc(g.id)}','${esc(g.topic)}')">Hapus</button></div></td>
      </tr>`).join('');
  } catch (e) { toast(e.message, false); }
}

function renderDocBadges(docs) {
  if (!docs || !docs.length) return '<span style="color:var(--ink4)">-</span>';
  return docs.map(d => `<button class="btn btn-s btn-xs" style="margin:2px" onclick="downloadDoc('${esc(d.storage_path)}','${esc(d.original_name)}')">${esc(d.category || 'Dokumen')}: ${esc(d.original_name)}</button>`).join('');
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
  G('fBimbReview').value = 'Catatan Selesai';
  G('fBimbDue').value = '';
  G('fBimbJam1').value = '';
  G('fBimbJam2').value = '';
  G('fBimbTopik').value = '';
  G('fBimbDiskusi').value = '';
  G('fBimbHasil').value = '';
  G('fBimbTugas').value = '';
  G('fBimbProg').value = '0';
  G('fBimbNo').value = '';
  G('fBimbDocCategory').value = 'Pendukung';
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
    G('fBimbReview').value = g.review_status || 'Catatan Selesai';
    G('fBimbDue').value = g.follow_up_due_date ? String(g.follow_up_due_date).slice(0, 10) : '';
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
    review_status: G('fBimbReview').value,
    follow_up_due_date: G('fBimbDue').value || null,
    meeting_number: G('fBimbNo').value ? Number(G('fBimbNo').value) : undefined
  };
  try {
    if (!body.student_id || !body.session_date || !body.topic) throw new Error('Mahasiswa, tanggal, dan topik wajib diisi');
    if (body.progress < 0 || body.progress > 100) throw new Error('Progress harus berada di antara 0 dan 100.');
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
  validateUploadFiles(files);
  const category = G('fBimbDocCategory').value || 'Pendukung';
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
      category,
      storage_path: path,
      uploaded_by: currentUser.id
    });
    if (ins.error) throw ins.error;
  }
}

function validateUploadFiles(files) {
  const allowedExt = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'];
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    ''
  ];
  const maxBytes = 10 * 1024 * 1024;
  for (const file of Array.from(files || [])) {
    const ext = String(file.name || '').split('.').pop().toLowerCase();
    if (!allowedExt.includes(ext)) throw new Error(`Format dokumen tidak didukung: ${file.name}`);
    if (!allowedTypes.includes(file.type || '')) throw new Error(`Tipe dokumen tidak didukung: ${file.name}`);
    if (file.size > maxBytes) throw new Error(`Dokumen melebihi 10 MB: ${file.name}`);
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
  const institution = currentProfile && currentProfile.institusi ? currentProfile.institusi : 'Universitas Islam Riau';
  const unit = [currentProfile && currentProfile.fakultas, currentProfile && currentProfile.prodi].filter(Boolean).join(' - ');
  return `<h2>${esc(title)}</h2><div class="muted">${esc(institution)}${unit ? ` - ${esc(unit)}` : ''}<br>EPBS - Elektronik Pemantauan Bimbingan Skripsi</div>`;
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
      <tr><th>Status Sesi</th><td>${esc(b.status || '-')}</td></tr>
      <tr><th>Status Review</th><td>${esc(b.review_status || 'Catatan Selesai')}</td></tr>
      <tr><th>Batas Tindak Lanjut</th><td>${b.follow_up_due_date ? fD(b.follow_up_due_date) : '-'}</td></tr>
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
  const rows = list.length ? list.map((b, i) => `<tr><td>${i + 1}</td><td>${fD(b.session_date)}</td><td>${esc(b.topic || '-')}</td><td>${esc(b.result || '-')}</td><td>${esc(b.assignment || '-')}</td><td>${esc(b.progress || 0)}%</td><td>${esc(b.review_status || 'Catatan Selesai')}</td><td>${b.follow_up_due_date ? fD(b.follow_up_due_date) : '-'}</td></tr>`).join('') : '<tr><td colspan="8" style="text-align:center;color:#7a7e8e">Tidak ada data bimbingan</td></tr>';
  currentPrintHtml = `${printHeader('REKAP BIMBINGAN TUGAS AKHIR')}${studentInfoTable(m)}<p style="margin:14px 0;color:#3a3d4a">Rentang: ${esc(dari || 'awal')} s/d ${esc(sampai || 'akhir')}</p><table><thead><tr><th>No</th><th>Tanggal</th><th>Topik</th><th>Hasil</th><th>Tugas</th><th>Progress</th><th>Review</th><th>Tindak Lanjut</th></tr></thead><tbody>${rows}</tbody></table>${signatureBlock()}`;
  showPrintPreview(currentPrintHtml);
}

function previewPeriodReport() {
  const dari = G('rkPeriodFrom').value;
  const sampai = G('rkPeriodTo').value;
  const status = G('rkPeriodStatus').value;
  const students = rekapMhs.filter(m => !status || m.status === status);
  const sessions = rekapBimb
    .filter(b => !dari || String(b.session_date).slice(0, 10) >= dari)
    .filter(b => !sampai || String(b.session_date).slice(0, 10) <= sampai);
  const rows = students.length ? students.map((m, index) => {
    const list = sessions.filter(b => b.student_id === m.id);
    const latest = list.slice().sort((a, b) => String(b.session_date).localeCompare(String(a.session_date)))[0];
    return `<tr><td>${index + 1}</td><td>${esc(m.nim)}</td><td>${esc(m.name)}</td><td>${esc(m.status || '-')}</td><td>${list.length}</td><td>${latest ? fD(latest.session_date) : '-'}</td><td>${latest ? esc(latest.review_status || 'Catatan Selesai') : '-'}</td><td>${latest && latest.follow_up_due_date ? fD(latest.follow_up_due_date) : '-'}</td></tr>`;
  }).join('') : '<tr><td colspan="8" style="text-align:center;color:#7a7e8e">Tidak ada mahasiswa pada filter ini</td></tr>';
  currentPrintHtml = `${printHeader('RINGKASAN PERIODE BIMBINGAN')}<p style="margin:14px 0;color:#3a3d4a">Periode: ${esc(dari || 'awal')} s/d ${esc(sampai || 'akhir')} | Status: ${esc(status || 'semua')}</p><table><thead><tr><th>No</th><th>NIM</th><th>Mahasiswa</th><th>Status</th><th>Sesi</th><th>Bimbingan Terakhir</th><th>Review Terakhir</th><th>Tindak Lanjut</th></tr></thead><tbody>${rows}</tbody></table>${signatureBlock()}`;
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
    if (!Array.isArray(students) || !Array.isArray(guidance)) throw new Error('Format JSON import tidak sesuai.');
    if (isAdmin() && !adminProfiles.length) await loadAdmin();
    const seenNim = new Set();
    const knownStudentIds = new Set(allMhs.map(m => m.id));
    for (const m of students) {
      const nim = String(m.nim || '').trim();
      const name = String(m.name || m.nama || '').trim();
      if (!nim || !name) throw new Error('Setiap mahasiswa import wajib memiliki NIM dan nama.');
      if (seenNim.has(nim.toLowerCase())) throw new Error(`NIM duplikat pada file import: ${nim}`);
      seenNim.add(nim.toLowerCase());
      if (m.id) knownStudentIds.add(m.id);
    }
    for (const b of guidance) {
      const studentId = b.student_id || b.mhsId;
      if (!studentId || !knownStudentIds.has(studentId)) throw new Error('Ada bimbingan import tanpa mahasiswa yang cocok.');
      if (!(b.session_date || b.tanggal) || !(b.topic || b.topik)) throw new Error('Setiap bimbingan import wajib memiliki tanggal dan topik.');
    }
    let unassignedImported = 0;
    for (const m of students) {
      const importedLecturerId = m.lecturer_id || null;
      const validAdminLecturer = isAdmin() && adminProfiles.some(p => p.id === importedLecturerId);
      const lecturerId = isAdmin() ? (validAdminLecturer ? importedLecturerId : null) : currentUser.id;
      if (isAdmin() && !lecturerId) unassignedImported += 1;
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
        lecturer_id: lecturerId
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
        review_status: b.review_status || 'Catatan Selesai',
        follow_up_due_date: b.follow_up_due_date || b.tindak_lanjut_batas || null,
        meeting_number: Number(b.meeting_number || b.pertemuan || 1)
      });
    }
    await logAction('Import', `${students.length} mahasiswa, ${guidance.length} bimbingan`);
    toast(`Import selesai: ${students.length} mahasiswa, ${guidance.length} bimbingan${unassignedImported ? `, ${unassignedImported} perlu ditugaskan` : ''}`);
    loadDash();
    if (isAdmin()) loadAdmin();
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
  primeSupabaseConfig();
  const ok = await checkAuth();
  if (ok) showApp();
  else G('loginPage').style.display = 'flex';
})();
