// GitHub REST API (CORS) direkt aus dem Browser. Der Token steht nur im Authorization-Header.
const OWNER = 'andyholiday';
const REPO = 'youtube';
const BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
const TIMEOUT_MS = 60000;

/** kind: auth | perm | conflict | offline | rate | other */
export class GhError extends Error {
  constructor(kind, status = 0) {
    super(kind);
    this.kind = kind;
    this.status = status;
  }
}

async function toError(res, method, path) {
  let message = '';
  try { message = String((await res.json()).message || ''); } catch { /* kein JSON */ }
  const s = res.status;
  if (s === 401) return new GhError('auth', s);
  if (s === 429 || (s === 403 && (res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(message)))) return new GhError('rate', s);
  if (s === 403 || s === 404) return new GhError('perm', s);
  if (s === 409 || (s === 422 && method === 'PATCH' && path.includes('/git/refs/'))) return new GhError('conflict', s);
  return new GhError('other', s);
}

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const encRef = (branch) => branch.split('/').map(encodeURIComponent).join('/');

function makeRequest(token) {
  return async (method, path, body) => {
    let res;
    try {
      res = await fetch(BASE + path, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
      });
    } catch { throw new GhError('offline'); }
    if (!res.ok) throw await toError(res, method, path);
    return res.status === 204 ? null : res.json();
  };
}

/** Prüft Token + Rechte, gibt den Standard-Branch zurück. */
async function check(request) {
  const repo = await request('GET', '');
  if (!repo.permissions || !repo.permissions.push) throw new GhError('perm', 200);
  return repo.default_branch || 'main';
}

/** Stand des Branches: Kopf-Commit, Wurzel-Tree und alle Dateien unter erinnerungen/ (Pfad -> sha). */
async function snapshot(request, branch) {
  const ref = await request('GET', `/git/ref/heads/${encRef(branch)}`);
  const head = ref.object.sha;
  const commit = await request('GET', `/git/commits/${head}`);
  const tree = await request('GET', `/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated) throw new GhError('other', 200);
  const files = new Map();
  for (const e of tree.tree) if (e.type === 'blob' && e.path.startsWith('erinnerungen/')) files.set(e.path, e.sha);
  return { branch, head, tree: commit.tree.sha, files };
}

async function readText(request, sha) {
  const blob = await request('GET', `/git/blobs/${sha}`);
  const raw = atob(String(blob.content).replace(/\s/g, ''));
  return new TextDecoder('utf-8').decode(Uint8Array.from(raw, (c) => c.charCodeAt(0))).replace(/^\uFEFF/, '');
}

/** Genau ein Commit: Blobs, Tree (base_tree), Commit, Ref. changes: {path, bytes} | {path, remove: true}. Gibt die Commit-SHA zurück. */
async function commit(request, snap, changes, message) {
  const tree = await Promise.all(changes.map(async (c) => {
    if (c.remove) return { path: c.path, mode: '100644', type: 'blob', sha: null };
    const blob = await request('POST', '/git/blobs', { content: toBase64(c.bytes), encoding: 'base64' });
    return { path: c.path, mode: '100644', type: 'blob', sha: blob.sha };
  }));
  const newTree = await request('POST', '/git/trees', { base_tree: snap.tree, tree });
  const made = await request('POST', '/git/commits', { message, tree: newTree.sha, parents: [snap.head] });
  await request('PATCH', `/git/refs/heads/${encRef(snap.branch)}`, { sha: made.sha, force: false });
  return made.sha;
}

/** Actions-Lauf zu einem Commit: { status, conclusion, url } oder null. */
async function findRun(request, sha) {
  const data = await request('GET', `/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=10`);
  const run = (data.workflow_runs || []).find((r) => r.head_sha === sha);
  return run ? { status: run.status, conclusion: run.conclusion, url: run.html_url } : null;
}

/** Client für ein Token. Alle Methoden werfen GhError; check() muss zuerst laufen (setzt branch). */
export function createGithub(token) {
  const request = makeRequest(token);
  const gh = { branch: null };
  gh.check = async () => { gh.branch = await check(request); return gh.branch; };
  gh.snapshot = () => snapshot(request, gh.branch);
  gh.readText = (sha) => readText(request, sha);
  gh.commit = (snap, changes, message) => commit(request, snap, changes, message);
  gh.findRun = (sha) => findRun(request, sha);
  return gh;
}

const MELDUNGEN = {
  auth: 'Der Token ist ungültig oder abgelaufen. Bitte unter „Token entfernen“ einen neuen anlegen.',
  perm: 'Dafür fehlen die Rechte. Der Token braucht für dieses Repository „Contents: Read and write“.',
  conflict: 'Es gibt inzwischen einen neueren Stand. Bitte die Seite neu laden und noch einmal versuchen.',
  offline: 'Keine Verbindung zu GitHub. Bitte das Internet prüfen und noch einmal versuchen.',
  rate: 'GitHub bremst gerade (zu viele Anfragen). Bitte in ein paar Minuten noch einmal versuchen.',
};

/** Verständliche deutsche Meldung für beliebige Fehler. */
export function errorText(err) {
  if (err && err.kind === 'bild') return 'Dieses Foto kann der Browser nicht lesen. Bitte ein anderes Foto (JPG, PNG oder HEIC vom iPhone) wählen.';
  if (err && err.kind === 'eingabe') return err.message;
  if (err && err.kind === 'perm' && err.status === 200) return 'Dieser Token darf nichts ändern. Bei „Contents“ muss „Read and write“ stehen.';
  if (err && MELDUNGEN[err.kind]) return MELDUNGEN[err.kind];
  return `Das hat nicht geklappt${err && err.status ? ` (Fehler ${err.status})` : ''}. Bitte später noch einmal versuchen.`;
}
