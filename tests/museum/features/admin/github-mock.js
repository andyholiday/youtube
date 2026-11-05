// Gefälschte GitHub-API (nur api.github.com/repos/andyholiday/youtube/…), per page.route. Kein echter Aufruf.
const crypto = require('crypto');

const sha = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const PREFIX = '/repos/andyholiday/youtube';

class FakeRepo {
  /** files: { pfad: Buffer|string }. tokens: Token -> 'rw' | 'ro'. */
  constructor({ files = {}, branch = 'main', tokens = { good: 'rw', ro: 'ro' } } = {}) {
    this.branch = branch;
    this.tokens = tokens;
    this.blobs = new Map();
    this.trees = new Map();
    this.commits = new Map();
    this.log = []; // { method, path, query, auth, body, time }
    this.unhandled = [];
    this.fail = {}; // 'METHOD /teilpfad' -> { status, message }
    this.offline = false;
    this.runs = () => ({ workflow_runs: [] }); // (sha, n) => Antwort für /actions/runs
    this.runCalls = [];
    const tree = new Map();
    for (const [p, c] of Object.entries(files)) tree.set(p, this.putBlob(Buffer.from(c)));
    this.head = this.makeCommit(tree, null);
  }

  putBlob(buf) { const s = sha(Buffer.concat([Buffer.from('blob '), buf])); this.blobs.set(s, buf); return s; }

  makeCommit(tree, parent) {
    const treeSha = sha(JSON.stringify([...tree]));
    this.trees.set(treeSha, tree);
    const commitSha = sha(`${treeSha}${parent}${this.commits.size}`);
    this.commits.set(commitSha, { tree: treeSha, parent });
    return commitSha;
  }

  /** Aktueller Dateistand im Kopf-Commit: Pfad -> Buffer. */
  get files() {
    const tree = this.trees.get(this.commits.get(this.head).tree);
    return new Map([...tree].map(([p, s]) => [p, this.blobs.get(s)]));
  }

  text(path) { const b = this.files.get(path); return b ? b.toString('utf8') : undefined; }

  get writes() { return this.log.filter((r) => r.method !== 'GET'); }

  async attach(context) {
    await context.route(/^https:\/\/api\.github\.com\//, (route) => this.handle(route));
  }

  respond(route, status, body) {
    return route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  }

  async handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (this.offline) return route.abort('connectionfailed');
    const auth = req.headers().authorization || '';
    const token = auth.replace(/^Bearer /, '');
    let body = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    const path = url.pathname.startsWith(PREFIX) ? url.pathname.slice(PREFIX.length) : null;
    this.log.push({ method: req.method(), url: req.url(), path, query: url.search, auth, body });
    if (path === null) { this.unhandled.push(req.url()); return this.respond(route, 404, { message: 'Not Found' }); }
    if (!this.tokens[token]) return this.respond(route, 401, { message: 'Bad credentials' });
    const forced = Object.entries(this.fail).find(([k]) => `${req.method()} ${path}`.startsWith(k));
    if (forced) return this.respond(route, forced[1].status, { message: forced[1].message || 'Fehler' });
    return this.route(route, req.method(), path, url, body, this.tokens[token]);
  }

  async route(route, method, path, url, body, mode) {
    const r = (status, data) => this.respond(route, status, data);
    let m;
    if (method === 'GET' && path === '') return r(200, { default_branch: this.branch, permissions: { push: mode === 'rw' } });
    if (mode !== 'rw' && method !== 'GET') return r(403, { message: 'Resource not accessible by personal access token' });
    if (method === 'GET' && path === `/git/ref/heads/${this.branch}`) return r(200, { object: { sha: this.head } });
    if (method === 'GET' && (m = /^\/git\/commits\/(\w+)$/.exec(path))) return r(200, { tree: { sha: this.commits.get(m[1]).tree } });
    if (method === 'GET' && (m = /^\/git\/trees\/(\w+)$/.exec(path))) {
      const tree = [...this.trees.get(m[1])].map(([p, s]) => ({ path: p, type: 'blob', mode: '100644', sha: s }));
      return r(200, { sha: m[1], tree, truncated: false });
    }
    if (method === 'GET' && (m = /^\/git\/blobs\/(\w+)$/.exec(path))) {
      return r(200, { encoding: 'base64', content: this.blobs.get(m[1]).toString('base64').replace(/(.{60})/g, '$1\n') });
    }
    if (method === 'POST' && path === '/git/blobs') return r(201, { sha: this.putBlob(Buffer.from(body.content, 'base64')) });
    if (method === 'POST' && path === '/git/trees') {
      const tree = new Map(this.trees.get(body.base_tree));
      for (const e of body.tree) { if (e.sha === null) tree.delete(e.path); else tree.set(e.path, e.sha); }
      const s = sha(JSON.stringify([...tree]));
      this.trees.set(s, tree);
      return r(201, { sha: s });
    }
    if (method === 'POST' && path === '/git/commits') {
      const c = this.makeCommit(this.trees.get(body.tree), body.parents[0]);
      this.pending = c;
      return r(201, { sha: c });
    }
    if (method === 'PATCH' && path === `/git/refs/heads/${this.branch}`) {
      if (this.commits.get(body.sha).parent !== this.head) return r(422, { message: 'Update is not a fast forward' });
      this.head = body.sha;
      return r(200, { object: { sha: this.head } });
    }
    if (method === 'GET' && path === '/actions/runs') {
      const time = this.page ? await this.page.evaluate(() => Date.now()) : null;
      const n = this.runCalls.push({ sha: url.searchParams.get('head_sha'), time });
      return r(200, this.runs(url.searchParams.get('head_sha'), n));
    }
    this.unhandled.push(`${method} ${path}`);
    return r(404, { message: 'Not Found' });
  }
}

module.exports = { FakeRepo };
