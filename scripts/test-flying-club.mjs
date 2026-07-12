/**
 * Flying Club end-to-end API test
 * Run: node scripts/test-flying-club.mjs
 */

const BASE = 'http://localhost:3456';

// Minimal cookie jar
const cookieJar = new Map();

function setCookies(headers) {
  const setCookie = headers.getSetCookie ? headers.getSetCookie() : [];
  for (const raw of setCookie) {
    const [pair] = raw.split(';');
    const [name, ...rest] = pair.split('=');
    cookieJar.set(name.trim(), rest.join('=').trim());
  }
}

function getCookieHeader() {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Cookie: getCookieHeader() },
    redirect: 'manual',
  });
  setCookies(res.headers);
  return res;
}

async function post(path, body, isForm = false) {
  const headers = { Cookie: getCookieHeader() };
  let bodyStr;
  if (isForm) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    bodyStr = new URLSearchParams(body).toString();
  } else {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: bodyStr,
    redirect: 'manual',
  });
  setCookies(res.headers);
  return res;
}

async function postForm(path, formData) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Cookie: getCookieHeader() },
    body: formData,
    redirect: 'manual',
  });
  setCookies(res.headers);
  return res;
}

async function del(path) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { Cookie: getCookieHeader() },
    redirect: 'manual',
  });
  setCookies(res.headers);
  return res;
}

function pass(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.error(`  ❌ ${msg}`); process.exitCode = 1; }
function section(msg) { console.log(`\n── ${msg} ──`); }

// ── 1. Sign in via dev-only endpoint ─────────────────────────────────────────
async function signIn(username, password) {
  const res = await post('/api/dev/login', { username, password });
  const body = await res.json();
  if (res.ok && body.ok) {
    pass(`Signed in as ${username} (userId=${body.userId})`);
    return true;
  }
  fail(`Sign-in failed: ${JSON.stringify(body)}`);
  return false;
}

// ── 3. Create org ─────────────────────────────────────────────────────────────
async function createOrg(name) {
  const res = await post('/api/groups', { name });
  const body = await res.json();
  if (res.ok && body.id) {
    pass(`Created org "${name}" (id=${body.id})`);
    return body.id;
  }
  fail(`Create org failed: ${JSON.stringify(body)}`);
  return null;
}

// ── 4. Create invite ──────────────────────────────────────────────────────────
async function createInvite(groupId, email) {
  const res = await post(`/api/groups/${groupId}/invites`, { email });
  const body = await res.json();
  if (res.ok && body.type === 'invite' && body.token) {
    pass(`Invite created for ${email} → ${body.inviteLink}`);
    return body.token;
  }
  fail(`Create invite failed: ${JSON.stringify(body)}`);
  return null;
}

// ── 5. Look up invite (public) ────────────────────────────────────────────────
async function lookupInvite(token) {
  const res = await get(`/api/invite/${token}`);
  const body = await res.json();
  if (res.ok && body.valid) {
    pass(`Invite lookup ok — group: "${body.group.name}", members: ${body.group.memberCount}`);
    return body;
  }
  fail(`Invite lookup failed: ${JSON.stringify(body)}`);
  return null;
}

// ── 6. Join via invite (as different user) ────────────────────────────────────
async function joinGroup(groupId, token) {
  const res = await post(`/api/groups/${groupId}/join`, { token });
  const body = await res.json();
  if (res.ok && body.success) {
    pass(`Joined group as ${body.role}`);
    return true;
  }
  fail(`Join failed: ${JSON.stringify(body)}`);
  return false;
}

// ── 7. Create post ────────────────────────────────────────────────────────────
async function createPost(groupId) {
  const res = await post(`/api/groups/${groupId}/posts`, {
    title: 'Welcome to the Club!',
    content: '## Hello Members\n\nThis is a **test post** with *markdown*.\n\n- Item 1\n- Item 2\n\nSee you at the airport!',
    pinned: true,
  });
  const body = await res.json();
  if (res.ok && body.id) {
    pass(`Post created (id=${body.id}, pinned=${body.pinned})`);
    return body.id;
  }
  fail(`Create post failed: ${JSON.stringify(body)}`);
  return null;
}

// ── 8. List posts (public — no auth) ──────────────────────────────────────────
async function listPosts(groupId) {
  // Temporarily clear session to test public access
  const savedSession = cookieJar.get('next-auth.session-token');
  cookieJar.delete('next-auth.session-token');
  const res = await get(`/api/groups/${groupId}/posts`);
  cookieJar.set('next-auth.session-token', savedSession);

  const body = await res.json();
  if (res.ok && Array.isArray(body)) {
    pass(`Listed ${body.length} post(s) (public, no auth)`);
    return body;
  }
  fail(`List posts failed: ${JSON.stringify(body)}`);
  return [];
}

// ── 9. Upload document ────────────────────────────────────────────────────────
async function uploadDocument(groupId) {
  const formData = new FormData();
  const content = 'This is a test PDF content for the flying club.';
  const blob = new Blob([content], { type: 'text/plain' });
  formData.append('file', blob, 'test-document.txt');
  formData.append('name', 'Test Bylaws');
  formData.append('description', 'A test document for the club');
  formData.append('category', 'bylaws');

  const res = await postForm(`/api/groups/${groupId}/documents`, formData);
  const body = await res.json();
  if (res.ok && body.id) {
    pass(`Document uploaded (id=${body.id}, size=${body.fileSize} bytes, category=${body.category})`);
    return body.id;
  }
  fail(`Upload document failed: ${JSON.stringify(body)}`);
  return null;
}

// ── 10. Download document ─────────────────────────────────────────────────────
async function downloadDocument(groupId, docId) {
  const res = await get(`/api/groups/${groupId}/documents/${docId}`);
  if (res.ok) {
    const text = await res.text();
    const contentType = res.headers.get('content-type');
    pass(`Downloaded document (${text.length} bytes, type=${contentType})`);
    return true;
  }
  fail(`Download failed (status=${res.status})`);
  return false;
}

// ── 11. Direct-add (invite existing user) ─────────────────────────────────────
async function testDirectAdd(groupId, existingEmail) {
  const res = await post(`/api/groups/${groupId}/invites`, { email: existingEmail });
  const body = await res.json();
  if (res.ok && body.type === 'direct_add' && body.member) {
    pass(`Direct-add worked — "${body.member.user?.name || existingEmail}" added as ${body.member.role}`);
    return true;
  }
  fail(`Direct-add failed: ${JSON.stringify(body)}`);
  return false;
}

// ── 12. Public group info ──────────────────────────────────────────────────────
async function checkPublicRoute(groupId) {
  const savedSession = cookieJar.get('next-auth.session-token');
  cookieJar.delete('next-auth.session-token');
  const res = await get(`/api/groups/${groupId}/public`);
  cookieJar.set('next-auth.session-token', savedSession);

  const body = await res.json();
  if (res.ok && body.id) {
    pass(`Public route works (memberCount=${body.memberCount}, aircraft=${body.aircraft.length})`);
    return true;
  }
  fail(`Public route failed: ${JSON.stringify(body)}`);
  return false;
}

// ── 13. Cleanup ────────────────────────────────────────────────────────────────
async function deleteOrg(groupId) {
  const res = await del(`/api/groups/${groupId}`);
  if (res.ok || res.status === 200) {
    pass(`Cleaned up org ${groupId}`);
    return true;
  }
  const body = await res.text();
  fail(`Delete org failed (status=${res.status}): ${body}`);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🧪 Flying Club API Test Suite');
  console.log(`   Base URL: ${BASE}\n`);

  // Sign in as our test admin user
  section('Auth');
  const ok = await signIn('testpilot99', 'testpassword123');
  if (!ok) {
    console.error('\nCannot proceed without auth. Exiting.');
    process.exit(1);
  }

  // Create a fresh test org
  section('Organization');
  const orgId = await createOrg('Test Flying Club ' + Date.now());
  if (!orgId) process.exit(1);

  // Invite flow (non-existing email → generates link)
  section('Invite (new user)');
  const token = await createInvite(orgId, 'newpilot_invite_test@example.com');
  if (token) {
    await lookupInvite(token);
  }

  // Direct-add (existing user — use test@email.commm which exists in DB)
  section('Direct-add (existing user)');
  await testDirectAdd(orgId, 'test@email.commm');

  // Posts
  section('Posts');
  const postId = await createPost(orgId);
  if (postId) {
    await listPosts(orgId);
  }

  // Documents
  section('Documents');
  const docId = await uploadDocument(orgId);
  if (docId) {
    await downloadDocument(orgId, docId);
  }

  // Public route
  section('Public Route');
  await checkPublicRoute(orgId);

  // Cleanup
  section('Cleanup');
  await deleteOrg(orgId);

  console.log('\n─────────────────────────────────────');
  if (process.exitCode === 1) {
    console.log('❌ Some tests failed — see above.');
  } else {
    console.log('✅ All tests passed!');
  }
}

main().catch(err => {
  console.error('Uncaught error:', err);
  process.exit(1);
});
