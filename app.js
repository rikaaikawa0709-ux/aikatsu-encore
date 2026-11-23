import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCKGiHJhqD3LSrK3Mbv5yQ0qFLaU--QJSk",
  authDomain: "aikatsuencore-b9ab8.firebaseapp.com",
  projectId: "aikatsuencore-b9ab8",
  storageBucket: "aikatsuencore-b9ab8.firebasestorage.app",
  messagingSenderId: "1052854668966",
  appId: "1:1052854668966:web:682711e58dc0a25a5eee67",
  measurementId: "G-CXRLB5W9ZF"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
let currentUser = null;
let cards = [];

const $ = (id) => document.getElementById(id);
const loginPanel = $("loginPanel"), appPanel = $("appPanel");
const cardsRef = () => collection(db, "users", currentUser.uid, "cards");

$("loginBtn").addEventListener("click", async () => {
  $("authMessage").textContent = "Googleログイン画面に移動します…";
  try { await signInWithRedirect(auth, provider); }
  catch (e) { $("authMessage").textContent = "ログインできませんでした: " + e.message; }
});
$("logoutBtn").addEventListener("click", () => signOut(auth));
$("addBtn").addEventListener("click", () => openCard());
$("closeDialog").addEventListener("click", () => $("cardDialog").close());
$("searchInput").addEventListener("input", renderCards);
$("statusFilter").addEventListener("change", renderCards);
$("cardForm").addEventListener("submit", saveCard);
$("deleteBtn").addEventListener("click", removeCard);

getRedirectResult(auth).catch(e => $("authMessage").textContent = "ログイン結果を確認できませんでした: " + e.message);
onAuthStateChanged(auth, async user => {
  currentUser = user;
  loginPanel.hidden = !!user;
  appPanel.hidden = !user;
  if (!user) return;
  $("userLabel").textContent = user.displayName || user.email || "ログイン中";
  await loadCards();
});

async function loadCards() {
  try {
    const snap = await getDocs(cardsRef());
    cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCards();
  } catch (e) {
    $("cardList").innerHTML = `<p class="hint">カードを読み込めませんでした。Firestoreのルールを確認してね。(${escapeHtml(e.message)})</p>`;
  }
}
function renderCards() {
  if (!currentUser) return;
  const q = $("searchInput").value.trim().toLowerCase();
  const f = $("statusFilter").value;
  const shown = cards.filter(c => {
    const text = `${c.name||""} ${c.series||""} ${c.memo||""}`.toLowerCase();
    if (q && !text.includes(q)) return false;
    if (f === "owned" && !c.owned) return false;
    if (f === "notOwned" && c.owned) return false;
    if (f === "exchange" && !c.exchange) return false;
    if (f === "wanted" && !c.wanted) return false;
    return true;
  });
  $("totalCount").textContent = cards.length;
  $("ownedCount").textContent = cards.filter(c => c.owned).length;
  $("wantedCount").textContent = cards.filter(c => c.wanted).length;
  $("cardList").innerHTML = shown.length ? shown.map(c => `
    <article class="card">
      <h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.series || "シリーズ未設定")}</p>
      <div class="tags">${c.owned?'<span class="tag">所持</span>':'<span class="tag blue">未所持</span>'}${c.exchange?'<span class="tag lav">交換予定</span>':''}${c.wanted?'<span class="tag blue">欲しい</span>':''}</div>
      <p>所持枚数：${Number(c.quantity)||0}枚</p><button data-edit="${escapeHtml(c.id)}">編集</button>
    </article>`).join("") : '<div class="panel"><p class="hint">カードがまだ登録されていないよ。「カード追加」から登録してね。</p></div>';
  $("cardList").querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openCard(cards.find(c => c.id === b.dataset.edit))));
}
function openCard(c = null) {
  $("cardForm").reset();
  $("cardId").value = c?.id || "";
  $("dialogTitle").textContent = c ? "カードを編集" : "カードを追加";
  $("cardName").value = c?.name || "";
  $("cardSeries").value = c?.series || "";
  $("cardMemo").value = c?.memo || "";
  $("isOwned").checked = !!c?.owned;
  $("isExchange").checked = !!c?.exchange;
  $("isWanted").checked = !!c?.wanted;
  $("quantity").value = c?.quantity ?? 0;
  $("deleteBtn").hidden = !c;
  $("formMessage").textContent = "";
  $("cardDialog").showModal();
}
async function saveCard(e) {
  e.preventDefault();
  const id = $("cardId").value || crypto.randomUUID();
  const data = {
    name: $("cardName").value.trim(),
    series: $("cardSeries").value.trim(),
    memo: $("cardMemo").value.trim(),
    owned: $("isOwned").checked,
    exchange: $("isExchange").checked,
    wanted: $("isWanted").checked,
    quantity: Math.max(0, Math.min(999, Number($("quantity").value) || 0)),
    updatedAt: new Date().toISOString()
  };
  if (!data.name) { $("formMessage").textContent = "カード名を入力してね。"; return; }
  try {
    await setDoc(doc(db, "users", currentUser.uid, "cards", id), data);
    $("cardDialog").close();
    await loadCards();
  } catch (e) { $("formMessage").textContent = "保存できませんでした: " + e.message; }
}
async function removeCard() {
  const id = $("cardId").value;
  if (!id || !confirm("このカードを削除する？")) return;
  try {
    await deleteDoc(doc(db, "users", currentUser.uid, "cards", id));
    $("cardDialog").close();
    await loadCards();
  } catch (e) { $("formMessage").textContent = "削除できませんでした: " + e.message; }
}
function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}
