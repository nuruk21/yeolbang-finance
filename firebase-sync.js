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

// 기본 자료(교인·헌금·지출)와 확장 자료(출결·심방 등)를 구분합니다.
// 확장 자료는 Firestore 규칙이 아직 허용하지 않아도 기본 동기화가 멈추지 않도록 따로 처리합니다.
const CORE_TYPES = ["members", "donations", "expenses"];
const allTypes = () => (Array.isArray(window.YOLBANG_COLLECTIONS) ? window.YOLBANG_COLLECTIONS : CORE_TYPES);
const blocked = new Set();
const configRef = () => firestoreApi.doc(db, "churches", cleanId(config.churchId), "settings", "config");
function setSyncedStatus() {
  if (blocked.size) setStatus("동기화됨 · 새 메뉴는 규칙 추가 필요", "online");
  else setStatus(navigator.onLine ? "온라인 동기화됨" : "오프라인 자료 사용 중", navigator.onLine ? "online" : "");
}

function startListeners() {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
  initialSnapshotsReady = false;
  blocked.clear();
  const waitingFor = new Set([...allTypes(), "church", "config"]);
  let resolveInitial;
  const initialPromise = new Promise((resolve) => { resolveInitial = resolve; });
  const markReady = (key) => { waitingFor.delete(key); if (!waitingFor.size) { initialSnapshotsReady = true; resolveInitial(); } };
  const configUnsubscribe = firestoreApi.onSnapshot(
    configRef(),
    (snapshot) => {
      if (snapshot.exists()) {
        const record = stripCloudFields(snapshot.data());
        const hashes = readJson(HASH_KEY, {});
        hashes["config/main"] = hash(record);
        localStorage.setItem(HASH_KEY, JSON.stringify(hashes));
        window.applyCloudSnapshot?.({ type: "config", record });
      }
      if (!snapshot.metadata.fromCache || !navigator.onLine) markReady("config");
    },
    () => { blocked.add("config"); markReady("config"); },
  );
  unsubscribers.push(configUnsubscribe);
  allTypes().forEach((type) => {
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
        if (!syncing) { if (snapshot.metadata.fromCache) setStatus("오프라인 자료 사용 중", ""); else setSyncedStatus(); }
      },
      (error) => {
        if (CORE_TYPES.includes(type)) { setStatus(error.code === "permission-denied" ? "접근 권한 확인 필요" : "동기화 오류", "error"); return; }
        console.warn(`'${type}' 자료를 동기화할 수 없습니다. Firestore 규칙을 확인해 주세요.`, error.code);
        blocked.add(type); markReady(type);
      },
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
  // 기본 자료는 한 묶음("core")으로, 확장 자료는 종류별 묶음으로 나눠 올립니다.
  const buckets = new Map();
  const bucketFor = (type) => {
    const name = CORE_TYPES.includes(type) || type === "church" ? "core" : type;
    if (!buckets.has(name)) buckets.set(name, { operations: [], hashes: {}, deletes: new Set() });
    return buckets.get(name);
  };
  try {
    allTypes().forEach((type) => {
      if (blocked.has(type)) return;
      (localState[type] || []).forEach((source) => {
        const record = clone({ ...source, updatedAt: Number(source.updatedAt || 0) });
        const recordHash = hash(record);
        const key = `${type}/${record.id}`;
        if (hashes[key] === recordHash) return;
        const bucket = bucketFor(type);
        bucket.operations.push({ kind: "set", ref: documentRef(type, record.id), data: { ...record, _updatedBy: currentUser.uid } });
        bucket.hashes[key] = recordHash;
      });
    });
    pendingDeletes.forEach((deletion) => {
      if (blocked.has(deletion.type)) return;
      const tombstone = { id: deletion.id, deletedAt: deletion.deletedAt, updatedAt: deletion.deletedAt, _updatedBy: currentUser.uid };
      const bucket = bucketFor(deletion.type);
      bucket.operations.push({ kind: "set", ref: documentRef(deletion.type, deletion.id), data: tombstone });
      bucket.hashes[`${deletion.type}/${deletion.id}`] = hash(stripCloudFields(tombstone));
      bucket.deletes.add(`${deletion.type}/${deletion.id}`);
    });
    const church = clone({ ...localState.church, updatedAt: Number(localState.church?.updatedAt || 0) });
    const churchHash = hash(church);
    if (hashes["church/profile"] !== churchHash) {
      const bucket = bucketFor("church");
      bucket.operations.push({ kind: "set", ref: firestoreApi.doc(db, "churches", cleanId(config.churchId), "settings", "profile"), data: { ...church, _updatedBy: currentUser.uid } });
      bucket.hashes["church/profile"] = churchHash;
    }
    if (!blocked.has("config") && localState.config) {
      const settings = clone({ funds: localState.funds, incomeCategories: localState.incomeCategories, expenseCategories: localState.expenseCategories, ...localState.config, updatedAt: Number(localState.config.updatedAt || 0) });
      const settingsHash = hash(settings);
      if (hashes["config/main"] !== settingsHash) {
        const bucket = bucketFor("config");
        bucket.operations.push({ kind: "set", ref: configRef(), data: { ...settings, _updatedBy: currentUser.uid } });
        bucket.hashes["config/main"] = settingsHash;
      }
    }
    if (!buckets.size) { setSyncedStatus(); return; }
    const finishedDeletes = new Set();
    for (const [name, bucket] of buckets) {
      try {
        await commitOperations(bucket.operations);
        if (navigator.onLine) { Object.assign(nextHashes, bucket.hashes); bucket.deletes.forEach((key) => finishedDeletes.add(key)); }
      } catch (error) {
        if (name === "core") throw error;
        console.warn(`'${name}' 자료를 올리지 못했습니다.`, error.code || error);
        if (error.code === "permission-denied") blocked.add(name);
      }
    }
    if (navigator.onLine) {
      localStorage.setItem(HASH_KEY, JSON.stringify(nextHashes));
      // 그 사이 새로 예약된 삭제는 남겨 두고, 이번에 올린 삭제만 지웁니다.
      localStorage.setItem(DELETE_KEY, JSON.stringify(readJson(DELETE_KEY, []).filter((item) => !finishedDeletes.has(`${item.type}/${item.id}`))));
      setSyncedStatus();
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
