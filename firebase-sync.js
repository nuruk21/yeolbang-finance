const FIREBASE_VERSION = "12.13.0";
const CONFIG_KEY = "yolbangFirebaseConfig.v1";
const HASH_KEY = "yolbangFirebaseSyncHashes.v1";
const DELETE_KEY = "yolbangFirebasePendingDeletes.v1";

let firebase = null;
let authApi = null;
let firestoreApi = null;
let auth = null;
let db = null;
let currentUser = null;
let config = null;
let syncing = false;
let initialSnapshotsReady = false;
let unsubscribers = [];

const $sync = (id) => document.getElementById(id);
const clone = (value) => JSON.parse(JSON.stringify(value));
const cleanId = (value) => String(value || "yeolbang").trim().replace(/[^a-zA-Z0-9_-]/g, "-") || "yeolbang";
const hash = (value) => {
  const text = JSON.stringify(value);
  let result = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
};

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function readConfig() {
  const local = readJson(CONFIG_KEY, null);
  return local || window.YOLBANG_FIREBASE_CONFIG || null;
}
function setStatus(message, type = "") {
  const label = $sync("cloudStatusLabel");
  const badge = $sync("firebaseStatus");
  const dot = $sync("cloudStatusDot");
  if (label) label.textContent = message;
  if (badge) badge.textContent = message;
  if (dot) dot.className = `cloud-dot ${type}`.trim();
}
function setUserInfo(user) {
  const info = $sync("firebaseUserInfo");
  if (info) info.textContent = user ? `${user.displayName || "사용자"}\n${user.email || ""}` : "Google 로그인이 필요합니다.";
  if ($sync("firebaseLogin")) $sync("firebaseLogin").disabled = !!user;
  if ($sync("firebaseLogout")) $sync("firebaseLogout").disabled = !user;
  if ($sync("firebaseSyncNow")) $sync("firebaseSyncNow").disabled = !user;
}
function fillConfigForm() {
  const saved = readConfig() || {};
  const fields = {
    firebaseProjectId: saved.projectId || "",
    firebaseAppId: saved.appId || "",
    firebaseApiKey: saved.apiKey || "",
    firebaseAuthDomain: saved.authDomain || (saved.projectId ? `${saved.projectId}.firebaseapp.com` : ""),
    firebaseChurchId: saved.churchId || "yeolbang",
  };
  Object.entries(fields).forEach(([id, value]) => { if ($sync(id)) $sync(id).value = value; });
  if ($sync("firebaseTrustedDevice")) $sync("firebaseTrustedDevice").checked = !!saved.trustedDevice;
}
function saveConfigFromForm(event) {
  event.preventDefault();
  const next = {
    projectId: $sync("firebaseProjectId").value.trim(),
    appId: $sync("firebaseAppId").value.trim(),
    apiKey: $sync("firebaseApiKey").value.trim(),
    authDomain: $sync("firebaseAuthDomain").value.trim(),
    churchId: cleanId($sync("firebaseChurchId").value),
    trustedDevice: $sync("firebaseTrustedDevice").checked,
  };
  if (!next.projectId || !next.appId || !next.apiKey || !next.authDomain) {
    alert("Firebase의 Project ID, App ID, API Key, Auth Domain을 모두 입력해 주세요.");
    return;
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  alert("Firebase 설정을 저장했습니다. 연결을 위해 페이지를 새로 엽니다.");
  location.reload();
}

function stripCloudFields(record) {
  const clean = clone(record);
  delete clean._updatedBy;
  delete clean._syncedAt;
  return clean;
}
function collectionRef(type) {
  return firestoreApi.collection(db, "churches", cleanId(config.churchId), type);
}
function documentRef(type, id) {
  return firestoreApi.doc(db, "churches", cleanId(config.churchId), type, String(id));
}

function startListeners() {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
  initialSnapshotsReady = false;
  const waitingFor = new Set(["members", "donations", "expenses", "church"]);
  let resolveInitial;
  const initialPromise = new Promise((resolve) => { resolveInitial = resolve; });
  const markReady = (key) => { waitingFor.delete(key); if (!waitingFor.size) { initialSnapshotsReady = true; resolveInitial(); } };
  ["members", "donations", "expenses"].forEach((type) => {
    const unsubscribe = firestoreApi.onSnapshot(
      collectionRef(type),
      { includeMetadataChanges: true },
      (snapshot) => {
        const records = [];
        const tombstones = [];
        const hashes = readJson(HASH_KEY, {});
        snapshot.forEach((item) => {
          const record = stripCloudFields(item.data());
          if (record.deletedAt) tombstones.push(record);
          else records.push(record);
          hashes[`${type}/${item.id}`] = hash(record);
        });
        localStorage.setItem(HASH_KEY, JSON.stringify(hashes));
        window.applyCloudSnapshot?.({ type, records, tombstones });
        if (!snapshot.metadata.fromCache || !navigator.onLine) markReady(type);
        if (!syncing) setStatus(snapshot.metadata.fromCache ? "오프라인 자료 사용 중" : "온라인 동기화됨", snapshot.metadata.fromCache ? "" : "online");
      },
      (error) => setStatus(error.code === "permission-denied" ? "접근 권한 확인 필요" : "동기화 오류", "error"),
    );
    unsubscribers.push(unsubscribe);
  });
  const profileUnsubscribe = firestoreApi.onSnapshot(
    firestoreApi.doc(db, "churches", cleanId(config.churchId), "settings", "profile"),
    (snapshot) => {
      if (snapshot.exists()) {
        const record = stripCloudFields(snapshot.data());
        const hashes = readJson(HASH_KEY, {});
        hashes["church/profile"] = hash(record);
        localStorage.setItem(HASH_KEY, JSON.stringify(hashes));
        window.applyCloudSnapshot?.({ type: "church", record });
      }
      if (!snapshot.metadata.fromCache || !navigator.onLine) markReady("church");
    },
    () => setStatus("교회 설정 동기화 오류", "error"),
  );
  unsubscribers.push(profileUnsubscribe);
  return initialPromise;
}

async function commitOperations(operations) {
  const promises = [];
  for (let start = 0; start < operations.length; start += 400) {
    const batch = firestoreApi.writeBatch(db);
    operations.slice(start, start + 400).forEach((operation) => {
      if (operation.kind === "set") batch.set(operation.ref, operation.data);
    });
    promises.push(batch.commit());
  }
  if (navigator.onLine) await Promise.all(promises);
  else Promise.all(promises).then(() => syncAll()).catch(() => setStatus("재연결 후 동기화 필요", "error"));
}

async function syncAll() {
  if (!db || !currentUser || syncing || !initialSnapshotsReady) return;
  const localState = window.getYolbangState?.();
  if (!localState) return;
  syncing = true;
  setStatus(navigator.onLine ? "동기화 중…" : "오프라인 변경 저장 중", "syncing");
  const hashes = readJson(HASH_KEY, {});
  const nextHashes = { ...hashes };
  const pendingDeletes = readJson(DELETE_KEY, []);
  const operations = [];
  try {
    ["members", "donations", "expenses"].forEach((type) => {
      (localState[type] || []).forEach((source) => {
        const record = clone({ ...source, updatedAt: Number(source.updatedAt || 0) });
        const recordHash = hash(record);
        const key = `${type}/${record.id}`;
        if (hashes[key] === recordHash) return;
        operations.push({ kind: "set", ref: documentRef(type, record.id), data: { ...record, _updatedBy: currentUser.uid } });
        nextHashes[key] = recordHash;
      });
    });
    pendingDeletes.forEach((deletion) => {
      const tombstone = { id: deletion.id, deletedAt: deletion.deletedAt, updatedAt: deletion.deletedAt, _updatedBy: currentUser.uid };
      operations.push({ kind: "set", ref: documentRef(deletion.type, deletion.id), data: tombstone });
      nextHashes[`${deletion.type}/${deletion.id}`] = hash(stripCloudFields(tombstone));
    });
    const church = clone({ ...localState.church, updatedAt: Number(localState.church?.updatedAt || 0) });
    const churchHash = hash(church);
    if (hashes["church/profile"] !== churchHash) {
      operations.push({ kind: "set", ref: firestoreApi.doc(db, "churches", cleanId(config.churchId), "settings", "profile"), data: { ...church, _updatedBy: currentUser.uid } });
      nextHashes["church/profile"] = churchHash;
    }
    if (!operations.length) { setStatus(navigator.onLine ? "온라인 동기화됨" : "오프라인 자료 사용 중", navigator.onLine ? "online" : ""); return; }
    await commitOperations(operations);
    if (navigator.onLine) {
      localStorage.setItem(HASH_KEY, JSON.stringify(nextHashes));
      localStorage.setItem(DELETE_KEY, "[]");
      setStatus("온라인 동기화됨", "online");
    } else setStatus("오프라인 변경 보관됨", "");
  } catch (error) {
    console.error("Firebase sync failed", error);
    setStatus(error.code === "permission-denied" ? "접근 권한이 없습니다" : "동기화 재시도 필요", "error");
  } finally {
    syncing = false;
  }
}

function queueDelete(type, id) {
  const pending = readJson(DELETE_KEY, []);
  const filtered = pending.filter((item) => !(item.type === type && item.id === id));
  filtered.push({ type, id, deletedAt: Date.now() });
  localStorage.setItem(DELETE_KEY, JSON.stringify(filtered));
}

async function login() {
  if (!auth) return alert("먼저 Firebase 설정을 저장해 주세요.");
  if (location.protocol === "file:") return alert("Google 로그인은 GitHub Pages 또는 localhost 주소에서 사용해 주세요. 로컬 파일에서는 오프라인 입력만 가능합니다.");
  try { await authApi.signInWithPopup(auth, new authApi.GoogleAuthProvider()); }
  catch (error) { if (error.code !== "auth/popup-closed-by-user") alert(`로그인하지 못했습니다. ${error.message}`); }
}
async function logout() { if (auth) await authApi.signOut(auth); if (!config?.trustedDevice) window.clearYolbangSession?.(); }

async function initFirebaseSync() {
  fillConfigForm();
  $sync("firebaseSettingsForm")?.addEventListener("submit", saveConfigFromForm);
  $sync("firebaseLogin")?.addEventListener("click", login);
  $sync("firebaseLogout")?.addEventListener("click", logout);
  $sync("firebaseSyncNow")?.addEventListener("click", syncAll);
  config = readConfig();
  if (!config) { setStatus("Firebase 설정 필요", ""); setUserInfo(null); return; }
  setStatus("Firebase 연결 중…", "syncing");
  try {
    [firebase, authApi, firestoreApi] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`),
    ]);
    const app = firebase.initializeApp(config);
    auth = authApi.getAuth(app);
    await authApi.setPersistence(auth, authApi.browserLocalPersistence);
    try {
      db = firestoreApi.initializeFirestore(app, {
        localCache: config.trustedDevice
          ? firestoreApi.persistentLocalCache({ tabManager: firestoreApi.persistentMultipleTabManager() })
          : firestoreApi.memoryLocalCache(),
      });
    } catch { db = firestoreApi.getFirestore(app); }
    authApi.onAuthStateChanged(auth, (user) => {
      currentUser = user;
      setUserInfo(user);
      if (!user) { unsubscribers.forEach((unsubscribe) => unsubscribe()); unsubscribers = []; initialSnapshotsReady = false; if (!config?.trustedDevice) window.clearYolbangSession?.(); setStatus("Google 로그인 필요", ""); return; }
      setStatus("자료 확인 중…", "syncing");
      startListeners().then(() => syncAll());
    });
  } catch (error) {
    console.error("Firebase initialization failed", error);
    setStatus(navigator.onLine ? "Firebase 연결 실패" : "오프라인 모드", navigator.onLine ? "error" : "");
  }
}

window.YolbangSync = { syncNow: syncAll, queueDelete, login, logout };
window.addEventListener("yolbang-state-saved", () => syncAll());
window.addEventListener("online", () => { setStatus("재연결 중…", "syncing"); syncAll(); });
window.addEventListener("offline", () => setStatus("오프라인 자료 사용 중", ""));
initFirebaseSync();
