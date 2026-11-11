'use client';
import { useCallback, useEffect, useState } from 'react';
import { Player } from '../components/player';
type Camera = {
  id: string;
  name: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  enabled: boolean;
  public_approved: boolean;
  health: string;
  health_checked_at: string | null;
  stream_path?: string;
};
type User = { id: string; email: string; role: 'admin' | 'user'; enabled?: boolean };
type Grant = { camera_id: string; user_id: string };
type Audit = { id: string; action: string; target: string; email: string; created_at: string };
const empty = {
  name: '',
  location: '',
  latitude: '',
  longitude: '',
  streamPath: '',
  enabled: true,
  publicApproved: false,
};
async function request(path: string, method = 'GET', body?: unknown, csrf?: string | null) {
  const r = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || 'Permintaan gagal');
  return data;
}
export default function Home() {
  const [user, setUser] = useState<User | null>(null),
    [csrf, setCsrf] = useState<string | null>(null),
    [cameras, setCameras] = useState<Camera[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('monitor'),
    [login, setLogin] = useState(false),
    [busy, setBusy] = useState(false),
    [theme, setTheme] = useState('dark'),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('all'),
    [columns, setColumns] = useState(3),
    [playing, setPlaying] = useState<Set<string>>(new Set());
  const [credentials, setCredentials] = useState({ email: '', password: '', otp: '' });
  const [adminCameras, setAdminCameras] = useState<Camera[]>([]),
    [users, setUsers] = useState<User[]>([]),
    [grants, setGrants] = useState<Grant[]>([]),
    [logs, setLogs] = useState<Audit[]>([]);
  const [form, setForm] = useState(empty),
    [edit, setEdit] = useState<string | null>(null),
    [newUser, setNewUser] = useState({ email: '', password: '' }),
    [grantForm, setGrantForm] = useState({ cameraId: '', userId: '' });
  const refresh = useCallback(async () => {
    const [m, c] = await Promise.all([request('/auth/me'), request('/cameras')]);
    setUser(m.user);
    setCsrf(m.csrf);
    setCameras(c.cameras);
    setError('');
    setPlaying(
      (prev) => new Set([...prev].filter((id) => c.cameras.some((x: Camera) => x.id === id))),
    );
  }, []);
  useEffect(() => {
    void refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    const t = setInterval(() => void refresh().catch((e) => setError(e.message)), 15000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    const saved = localStorage.getItem('cctv-theme');
    if (saved === 'light') setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('cctv-theme', theme);
  }, [theme]);
  const refreshAdmin = useCallback(async () => {
    const [c, u, g, a] = await Promise.all([
      request('/admin/cameras'),
      request('/admin/users'),
      request('/admin/grants'),
      request('/admin/audit'),
    ]);
    setAdminCameras(c.cameras);
    setUsers(u.users);
    setGrants(g.grants);
    setLogs(a.logs);
  }, []);
  useEffect(() => {
    if (tab === 'admin' && user?.role === 'admin')
      void refreshAdmin().catch((e) => setError(e.message));
  }, [tab, user?.role, refreshAdmin]);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal');
    } finally {
      setBusy(false);
    }
  }
  function editCamera(c: Camera) {
    setEdit(c.id);
    setForm({
      name: c.name,
      location: c.location,
      latitude: c.latitude?.toString() ?? '',
      longitude: c.longitude?.toString() ?? '',
      streamPath: c.stream_path ?? '',
      enabled: c.enabled,
      publicApproved: c.public_approved,
    });
  }
  const visible = cameras.filter(
    (c) =>
      `${c.name} ${c.location}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'all' || (filter === 'public' ? c.public_approved : !c.public_approved)),
  );
  const online = cameras.filter((c) => c.health === 'online').length;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-icon">◉</span>
          <span>
            CCTV<span className="brand-sub">KOTA / MONITORING</span>
          </span>
        </a>
        <p className="nav-caption">WORKSPACE</p>
        <button
          className={`nav-item ${tab === 'monitor' ? 'selected' : ''}`}
          onClick={() => setTab('monitor')}
        >
          <span>▦</span> Pemantauan <span className="badge">{cameras.length}</span>
        </button>
        {user?.role === 'admin' && (
          <button
            className={`nav-item ${tab === 'admin' ? 'selected' : ''}`}
            onClick={() => setTab('admin')}
          >
            <span>⚙</span> Administrasi
          </button>
        )}
        <div className="sidebar-bottom">
          <div className="security-mark">◇ &nbsp; Akses terkontrol</div>
          <p>Kamera publik dipilih dan disetujui oleh administrator.</p>
          <span className="version">MONITORING PORTAL / v0.1</span>
        </div>
      </aside>
      <div className="main">
        <header>
          <div className="breadcrumb">
            Workspace <span>/</span>{' '}
            <strong>{tab === 'monitor' ? 'Pemantauan' : 'Administrasi'}</strong>
          </div>
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="Ganti tema"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            {user ? (
              <>
                <span className="account">
                  {user.email}
                  <small>{user.role === 'admin' ? 'Administrator · MFA' : 'Pengguna'}</small>
                </span>
                <button
                  className="button subtle"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await request('/auth/logout', 'POST', {}, csrf);
                      setPlaying(new Set());
                      setTab('monitor');
                      await refresh();
                    })
                  }
                >
                  Keluar
                </button>
              </>
            ) : (
              <button className="button" onClick={() => setLogin(true)}>
                Masuk akun <span>↗</span>
              </button>
            )}
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="dot" /> CCTV MONITORING PORTAL
              </div>
              <h1>{tab === 'monitor' ? 'Pantau kota, dalam satu layar.' : 'Pusat administrasi'}</h1>
              <p>
                {tab === 'monitor'
                  ? 'Akses kamera yang tersedia dan pantau kondisi terkini secara langsung.'
                  : 'Kelola kamera, akses pengguna, dan jejak aktivitas dengan aman.'}
              </p>
            </div>
            <div className="live-label">
              ● &nbsp; {loading ? 'Menghubungkan' : 'Pembaruan tiap 15 detik'}
            </div>
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
              <button onClick={() => void action(refresh)}>Coba lagi</button>
            </div>
          )}
          {tab === 'monitor' ? (
            <>
              <section className="stats" aria-label="Ringkasan kamera">
                <div>
                  <span>Kamera tersedia</span>
                  <strong>
                    {String(cameras.length).padStart(2, '0')}
                    <i>▦</i>
                  </strong>
                  <small>Sesuai hak akses Anda</small>
                </div>
                <div>
                  <span>Stream online</span>
                  <strong>
                    {String(online).padStart(2, '0')}
                    <i className="green">↗</i>
                  </strong>
                  <small>
                    <b className="dot" /> Sumber stream terdeteksi
                  </small>
                </div>
                <div>
                  <span>Kamera publik</span>
                  <strong>
                    {String(cameras.filter((c) => c.public_approved).length).padStart(2, '0')}
                    <i>◎</i>
                  </strong>
                  <small>Disetujui untuk akses umum</small>
                </div>
                <div>
                  <span>Sedang diputar</span>
                  <strong>
                    {String(playing.size).padStart(2, '0')}
                    <i>▷</i>
                  </strong>
                  <small>HLS · klik kamera untuk memulai</small>
                </div>
              </section>
              <section className="camera-section">
                <div className="section-top">
                  <div>
                    <h2>
                      Jaringan kamera <span>{visible.length}</span>
                    </h2>
                    <p>Pilih kamera untuk membuka siaran langsung.</p>
                  </div>
                  <button
                    className="button subtle"
                    onClick={() =>
                      setPlaying(
                        playing.size ? new Set() : new Set(visible.slice(0, 16).map((c) => c.id)),
                      )
                    }
                  >
                    {playing.size ? 'Hentikan semua' : 'Putar semua · maks. 16'}
                  </button>
                </div>
                <div className="toolbar">
                  <div className="filters">
                    {[
                      ['all', 'Semua kamera'],
                      ['public', 'Publik'],
                      ['private', 'Privat'],
                    ].map(([v, l]) => (
                      <button
                        className={filter === v ? 'active' : ''}
                        key={v}
                        onClick={() => setFilter(v)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                  <div className="toolbar-right">
                    <input
                      aria-label="Cari kamera atau lokasi"
                      placeholder="⌕  Cari kamera atau lokasi…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <div className="grid-switch">
                      {[3, 4].map((n) => (
                        <button
                          key={n}
                          aria-label={`${n} kolom`}
                          className={columns === n ? 'active' : ''}
                          onClick={() => setColumns(n)}
                        >
                          {n === 3 ? '▦' : '▥'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {loading ? (
                  <div className="empty">Mengambil daftar kamera…</div>
                ) : !visible.length ? (
                  <div className="empty">
                    <span>◎</span>
                    <h3>Belum ada kamera tersedia</h3>
                    <p>
                      {search
                        ? 'Coba kata pencarian lain.'
                        : user
                          ? 'Administrator dapat menambahkan kamera dan memberikan izin akses.'
                          : 'Kamera yang disetujui untuk publik akan ditampilkan di sini.'}
                    </p>
                  </div>
                ) : (
                  <div className={`camera-grid cols-${columns}`}>
                    {visible.map((c, i) => (
                      <article key={c.id} className="camera-card">
                        <div className="camera-preview">
                          {playing.has(c.id) ? (
                            <Player id={c.id} name={c.name} />
                          ) : (
                            <button
                              className="start-camera"
                              onClick={() => setPlaying(new Set([...playing, c.id]))}
                              aria-label={`Putar ${c.name}`}
                            >
                              <span className="crosshair" />
                              <span className="play-circle">▷</span>
                              <span>Buka siaran langsung</span>
                              <small>HLS STREAM</small>
                            </button>
                          )}
                          <span className={`status ${c.health}`}>
                            <b />
                            {c.health === 'online'
                              ? 'ONLINE'
                              : c.health === 'offline'
                                ? 'OFFLINE'
                                : 'BELUM DIKETAHUI'}
                          </span>
                          <span className="camera-no">CAM {String(i + 1).padStart(2, '0')}</span>
                          {playing.has(c.id) && (
                            <button
                              className="stop-camera"
                              aria-label={`Hentikan ${c.name}`}
                              onClick={() =>
                                setPlaying(new Set([...playing].filter((id) => id !== c.id)))
                              }
                            >
                              ×
                            </button>
                          )}
                        </div>
                        <div className="camera-meta">
                          <div>
                            <h3>{c.name}</h3>
                            <p>⌖ &nbsp;{c.location}</p>
                          </div>
                          <span className={`privacy ${c.public_approved ? 'public' : ''}`}>
                            {c.public_approved ? '◎ Publik' : '◇ Privat'}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <footer>
                <span>
                  <b className="dot" /> Status berdasarkan sumber MediaMTX; pemutaran memerlukan
                  stream aktif.
                </span>
                <span>HLS / AKSES TERVERIFIKASI</span>
              </footer>
            </>
          ) : user?.role === 'admin' ? (
            <div className="admin-layout">
              <section className="panel">
                <h2>{edit ? 'Ubah kamera' : 'Tambah kamera'}</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      await request(
                        edit ? `/admin/cameras/${edit}` : '/admin/cameras',
                        edit ? 'PUT' : 'POST',
                        {
                          ...form,
                          latitude: form.latitude === '' ? null : Number(form.latitude),
                          longitude: form.longitude === '' ? null : Number(form.longitude),
                        },
                        csrf,
                      );
                      setForm(empty);
                      setEdit(null);
                      await refreshAdmin();
                      await refresh();
                    });
                  }}
                >
                  <label>
                    Nama kamera
                    <input
                      required
                      maxLength={100}
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </label>
                  <label>
                    Lokasi
                    <input
                      required
                      maxLength={200}
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                    />
                  </label>
                  <label>
                    Path stream MediaMTX
                    <input
                      required
                      pattern="[a-zA-Z0-9_-]{1,80}"
                      placeholder="contoh: demo (bukan URL RTSP)"
                      value={form.streamPath}
                      onChange={(e) => setForm({ ...form, streamPath: e.target.value })}
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Latitude
                      <input
                        type="number"
                        min="-90"
                        max="90"
                        step="any"
                        value={form.latitude}
                        onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                      />
                    </label>
                    <label>
                      Longitude
                      <input
                        type="number"
                        min="-180"
                        max="180"
                        step="any"
                        value={form.longitude}
                        onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                    />{' '}
                    Kamera aktif
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={form.publicApproved}
                      onChange={(e) => setForm({ ...form, publicApproved: e.target.checked })}
                    />{' '}
                    Saya menyetujui kamera ini dapat ditonton publik
                  </label>
                  <button className="button" disabled={busy}>
                    Simpan kamera
                  </button>
                  {edit && (
                    <button
                      type="button"
                      className="button subtle"
                      onClick={() => {
                        setEdit(null);
                        setForm(empty);
                      }}
                    >
                      Batal
                    </button>
                  )}
                </form>
              </section>
              <section className="panel">
                <h2>Daftar kamera</h2>
                {!adminCameras.length && <p>Belum ada kamera.</p>}
                {adminCameras.map((c) => (
                  <div className="admin-row" key={c.id}>
                    <div>
                      <strong>{c.name}</strong>
                      <small>
                        {c.location} · {c.enabled ? 'Aktif' : 'Nonaktif'} ·{' '}
                        {c.public_approved ? 'Publik' : 'Privat'}
                      </small>
                    </div>
                    <button className="button subtle" onClick={() => editCamera(c)}>
                      Ubah
                    </button>
                    <button
                      className="button danger"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm(`Hapus kamera ${c.name}?`))
                          void action(async () => {
                            await request(`/admin/cameras/${c.id}`, 'DELETE', {}, csrf);
                            await refreshAdmin();
                            await refresh();
                          });
                      }}
                    >
                      Hapus
                    </button>
                  </div>
                ))}
              </section>
              <section className="panel">
                <h2>Pengguna</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      await request('/admin/users', 'POST', newUser, csrf);
                      setNewUser({ email: '', password: '' });
                      await refreshAdmin();
                    });
                  }}
                >
                  <label>
                    Email
                    <input
                      type="email"
                      required
                      autoComplete="off"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    />
                  </label>
                  <label>
                    Kata sandi awal
                    <input
                      type="password"
                      required
                      minLength={14}
                      maxLength={128}
                      autoComplete="new-password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    />
                  </label>
                  <button className="button" disabled={busy}>
                    Buat pengguna
                  </button>
                </form>
                <p className="hint">
                  Administrator tambahan dibuat melalui CLI agar MFA wajib terpasang.
                </p>
                {users.map((u) => (
                  <div key={u.id} className="admin-row">
                    <div>
                      <strong>{u.email}</strong>
                      <small>
                        {u.role} · {u.enabled ? 'Aktif' : 'Nonaktif'}
                      </small>
                    </div>
                    {u.role === 'user' && (
                      <button
                        className="button subtle"
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            await request(
                              `/admin/users/${u.id}`,
                              'PUT',
                              { enabled: !u.enabled },
                              csrf,
                            );
                            await refreshAdmin();
                          })
                        }
                      >
                        {u.enabled ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    )}
                  </div>
                ))}
              </section>
              <section className="panel">
                <h2>Hak akses kamera privat</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      await request('/admin/grants', 'PUT', { ...grantForm, allowed: true }, csrf);
                      await refreshAdmin();
                    });
                  }}
                >
                  <label>
                    Kamera
                    <select
                      required
                      value={grantForm.cameraId}
                      onChange={(e) => setGrantForm({ ...grantForm, cameraId: e.target.value })}
                    >
                      <option value="">Pilih kamera</option>
                      {adminCameras.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Pengguna
                    <select
                      required
                      value={grantForm.userId}
                      onChange={(e) => setGrantForm({ ...grantForm, userId: e.target.value })}
                    >
                      <option value="">Pilih pengguna</option>
                      {users
                        .filter((u) => u.role === 'user')
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.email}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button className="button" disabled={busy}>
                    Berikan akses
                  </button>
                </form>
                {grants.map((g) => (
                  <div className="admin-row" key={`${g.camera_id}${g.user_id}`}>
                    <div>
                      <strong>{adminCameras.find((c) => c.id === g.camera_id)?.name}</strong>
                      <small>{users.find((u) => u.id === g.user_id)?.email}</small>
                    </div>
                    <button
                      className="button danger"
                      disabled={busy}
                      onClick={() =>
                        void action(async () => {
                          await request(
                            '/admin/grants',
                            'PUT',
                            { cameraId: g.camera_id, userId: g.user_id, allowed: false },
                            csrf,
                          );
                          await refreshAdmin();
                        })
                      }
                    >
                      Cabut
                    </button>
                  </div>
                ))}
              </section>
              <section className="panel audit">
                <h2>
                  Audit aktivitas <span>200 terbaru</span>
                </h2>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Waktu</th>
                        <th>Aktor</th>
                        <th>Aksi</th>
                        <th>Target</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((a) => (
                        <tr key={a.id}>
                          <td>{new Date(a.created_at).toLocaleString('id-ID')}</td>
                          <td>{a.email || 'Anonim / sistem'}</td>
                          <td>{a.action}</td>
                          <td>{a.target || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          ) : (
            <div className="empty">Akses administrator diperlukan.</div>
          )}
        </main>
      </div>
      {login && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
            <button
              className="close"
              aria-label="Tutup"
              onClick={() => {
                setLogin(false);
                setCredentials({ email: '', password: '', otp: '' });
              }}
            >
              ×
            </button>
            <span className="brand-icon">◉</span>
            <h2 id="login-title">Selamat datang kembali.</h2>
            <p>Masuk untuk mengakses kamera yang diberikan kepada Anda.</p>
            {error && (
              <div role="alert" className="alert">
                {error}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  const r = await request('/auth/login', 'POST', {
                    email: credentials.email,
                    password: credentials.password,
                    ...(credentials.otp ? { otp: credentials.otp } : {}),
                  });
                  setUser(r.user);
                  setCsrf(r.csrf);
                  setCredentials({ email: '', password: '', otp: '' });
                  setLogin(false);
                  await refresh();
                });
              }}
            >
              <label>
                Email
                <input
                  autoFocus
                  type="email"
                  required
                  autoComplete="username"
                  value={credentials.email}
                  onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                />
              </label>
              <label>
                Kata sandi
                <input
                  type="password"
                  required
                  maxLength={128}
                  autoComplete="current-password"
                  value={credentials.password}
                  onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                />
              </label>
              <label>
                Kode MFA <small>Wajib untuk administrator</small>
                <input
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={credentials.otp}
                  onChange={(e) => setCredentials({ ...credentials, otp: e.target.value })}
                  placeholder="000000"
                />
              </label>
              <button className="button" disabled={busy}>
                {busy ? 'Memverifikasi…' : 'Masuk dengan aman →'}
              </button>
            </form>
            <p className="hint">Sesi terlindungi · Akses berdasarkan izin</p>
          </section>
        </div>
      )}
    </div>
  );
}
