import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import { getFirestore, collection, doc, getDocs, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";
import { CARD_CATALOG } from "./card-catalog.js";

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
let currentUser = null, cards = [], currentImageData = "";
const $ = id => document.getElementById(id);
const cardsRef = () => collection(db, "users", currentUser.uid, "cards");

$("loginBtn").addEventListener("click", async () => {
  $("authMessage").textContent = "Googleログイン画面に移動します…";
  try { await signInWithPopup(auth, provider); }
  catch (e) { $("authMessage").textContent = "ログインできませんでした: " + e.message; }
});
$("logoutBtn").addEventListener("click", () => signOut(auth));
$("addBtn").addEventListener("click", () => openCard());
$("closeDialog").addEventListener("click", () => $("cardDialog").close());
$("searchInput").addEventListener("input", renderCards);
$("statusFilter").addEventListener("change", renderCards);
$("groupFilter").addEventListener("change", renderCards);
$("cardForm").addEventListener("submit", saveCard);
$("deleteBtn").addEventListener("click", removeCard);
$("cardImage").addEventListener("change", handleImageSelect);
$("removeImageBtn").addEventListener("click", () => { currentImageData = ""; $("cardImage").value = ""; updateImagePreview(); });
$("closeImageDialog").addEventListener("click", () => $("imageDialog").close());

onAuthStateChanged(auth, async user => {
  currentUser = user;
  $("loginPanel").hidden = !!user;
  $("appPanel").hidden = !user;
  if (!user) return;
  $("userLabel").textContent = user.displayName || user.email || "ログイン中";
  await loadCards();
});

async function loadCards() {
  try {
    // 初回のみ、図鑑マスターの不足分を追加。既存カード・画像・所持状況は上書きしない。
    const snap = await getDocs(cardsRef());
    const existingIds = new Set(snap.docs.map(d => d.id));
    const missing = CARD_CATALOG.filter(c => !existingIds.has("catalog_" + c.cardNumber));
    for (const c of missing) {
      const id = "catalog_" + c.cardNumber;
      await setDoc(doc(db, "users", currentUser.uid, "cards", id), {
        ...c, catalog: true, imageData: "", memo: "", owned: false,
        exchange: false, wanted: false, quantity: 0, updatedAt: new Date().toISOString()
      });
    }
    const latest = missing.length ? await getDocs(cardsRef()) : snap;
    cards = latest.docs.map(d => ({ id: d.id, ...d.data() }));
    cards.sort((a,b) => String(a.cardNumber||"").localeCompare(String(b.cardNumber||""), "ja", {numeric:true}));
    renderCards();
  } catch (e) {
    $("cardList").innerHTML = `<p class="hint">カードを読み込めませんでした。Firestoreのルールを確認してね。(${escapeHtml(e.message)})</p>`;
  }
}
function renderCards() {
  if (!currentUser) return;
  const q = $("searchInput").value.trim().toLowerCase(), f = $("statusFilter").value, group = $("groupFilter").value;
  const shown = cards.filter(c => {
    const text = `${c.cardNumber||""} ${c.name||""} ${c.series||""} ${c.rarity||""} ${c.catalogGroup||""} ${c.memo||""}`.toLowerCase();
    if (q && !text.includes(q)) return false;
    if (group !== "all" && (c.catalogGroup || "手動登録") !== group) return false;
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
    <article class="card"><button class="card-image-button" type="button" data-image="${escapeHtml(c.id)}" aria-label="画像を拡大">
      ${c.imageData ? `<img class="card-image" src="${c.imageData}" alt="${escapeHtml(c.name||"カード画像")}">` : `<span class="image-placeholder"><span>✧</span><small>画像未登録</small></span>`}
    </button><div class="card-info">${c.cardNumber ? `<p class="card-number">${escapeHtml(c.cardNumber)}</p>` : ""}<h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.series || "シリーズ未設定")}${c.rarity ? " · " + escapeHtml(c.rarity) : ""}</p><p class="catalog-group">${escapeHtml(c.catalogGroup || "手動登録")}</p>
    <div class="tags">${c.owned?'<span class="tag">所持</span>':'<span class="tag blue">未所持</span>'}${c.exchange?'<span class="tag lav">交換予定</span>':''}${c.wanted?'<span class="tag blue">欲しい</span>':''}</div><p>所持枚数：${Number(c.quantity)||0}枚</p><button class="edit-button" data-edit="${escapeHtml(c.id)}">編集</button></div></article>`).join("") : '<div class="panel empty-state"><p class="hint">カードがまだ登録されていないよ。「カード追加」から登録してね。</p></div>';
  $("cardList").querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openCard(cards.find(c => c.id === b.dataset.edit))));
  $("cardList").querySelectorAll("[data-image]").forEach(b => b.addEventListener("click", () => {
    const c = cards.find(x => x.id === b.dataset.image); if (!c?.imageData) return;
    $("largeCardImage").src = c.imageData; $("imageDialog").showModal();
  }));
}
function openCard(c = null) {
  $("cardForm").reset(); $("cardId").value = c?.id || "";
  $("dialogTitle").textContent = c ? "カードを編集" : "カードを追加";
  $("cardNumber").value = c?.cardNumber || ""; $("cardName").value = c?.name || "";
  $("cardSeries").value = c?.series || ""; $("cardRarity").value = c?.rarity || ""; $("cardMemo").value = c?.memo || "";
  $("isOwned").checked = !!c?.owned; $("isExchange").checked = !!c?.exchange; $("isWanted").checked = !!c?.wanted;
  $("quantity").value = c?.quantity ?? 0; currentImageData = c?.imageData || ""; $("cardImage").value = "";
  updateImagePreview(); $("deleteBtn").hidden = !c; $("formMessage").textContent = ""; $("cardDialog").showModal();
}
async function handleImageSelect(e) {
  const file = e.target.files?.[0]; if (!file) return;
  if (!file.type.startsWith("image/")) { $("formMessage").textContent = "画像ファイルを選んでね。"; return; }
  $("formMessage").textContent = "画像を小さく整えています…";
  try { currentImageData = await compressImage(file); updateImagePreview(); $("formMessage").textContent = "画像をセットしたよ。保存するとカード情報と一緒に保存されるよ。"; }
  catch (err) { $("formMessage").textContent = "画像を読み込めませんでした: " + err.message; }
}
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("ファイルを読み込めませんでした"));
    reader.onload = () => {
      const img = new Image(); img.onerror = () => reject(new Error("画像を開けませんでした"));
      img.onload = () => {
        const scale = Math.min(1, 520 / img.width, 760 / img.height);
        const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.76, data = canvas.toDataURL("image/jpeg", quality);
        while (data.length > 650000 && quality > 0.38) { quality -= 0.08; data = canvas.toDataURL("image/jpeg", quality); }
        if (data.length > 650000) { reject(new Error("画像サイズが大きすぎます。別の画像を選んでね。")); return; }
        resolve(data);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function updateImagePreview() {
  $("imagePreviewWrap").hidden = !currentImageData;
  if (currentImageData) $("imagePreview").src = currentImageData; else $("imagePreview").removeAttribute("src");
}
async function saveCard(e) {
  e.preventDefault();
  const id = $("cardId").value || crypto.randomUUID();
  const oldCard = cards.find(c => c.id === id);
  const data = { catalog: !!oldCard?.catalog, catalogGroup: oldCard?.catalogGroup || "手動登録", cardNumber: $("cardNumber").value.trim(), name: $("cardName").value.trim(), series: $("cardSeries").value.trim(), rarity: $("cardRarity").value.trim(), imageData: currentImageData, memo: $("cardMemo").value.trim(), owned: $("isOwned").checked, exchange: $("isExchange").checked, wanted: $("isWanted").checked, quantity: Math.max(0, Math.min(999, Number($("quantity").value) || 0)), updatedAt: new Date().toISOString() };
  if (!data.name) { $("formMessage").textContent = "カード名を入力してね。"; return; }
  if (new Blob([JSON.stringify(data)]).size > 850000) { $("formMessage").textContent = "画像が大きすぎます。小さめの画像を選んでね。"; return; }
  try { $("formMessage").textContent = "保存しています…"; await setDoc(doc(db, "users", currentUser.uid, "cards", id), data); $("cardDialog").close(); await loadCards(); }
  catch (e) { $("formMessage").textContent = "保存できませんでした: " + e.message; }
}
async function removeCard() {
  const id = $("cardId").value; if (!id || !confirm("このカードを削除する？")) return;
  try { await deleteDoc(doc(db, "users", currentUser.uid, "cards", id)); $("cardDialog").close(); await loadCards(); }
  catch (e) { $("formMessage").textContent = "削除できませんでした: " + e.message; }
}
function escapeHtml(v) { return String(v ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
