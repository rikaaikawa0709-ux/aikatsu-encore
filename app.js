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
let currentUser = null, cards = [], currentImageData = "", detectedCandidates = [];
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
$("brandFilter").addEventListener("change", renderCards);
$("sortFilter").addEventListener("change", renderCards);
$("exchangeQuickBtn").addEventListener("click", () => { $("statusFilter").value = "exchange"; renderCards(); });
$("wantedQuickBtn").addEventListener("click", () => { $("statusFilter").value = "wanted"; renderCards(); });
$("clearFiltersBtn").addEventListener("click", () => { $("searchInput").value = ""; $("groupFilter").value = "all"; $("statusFilter").value = "all"; $("brandFilter").value = "all"; $("sortFilter").value = "numberAsc"; renderCards(); });
$("cardForm").addEventListener("submit", saveCard);
$("deleteBtn").addEventListener("click", removeCard);
$("cardImage").addEventListener("change", handleImageSelect);
$("removeImageBtn").addEventListener("click", () => { currentImageData = ""; $("cardImage").value = ""; updateImagePreview(); });
$("closeImageDialog").addEventListener("click", () => $("imageDialog").close());
$("importNewCardsBtn").addEventListener("click", importSelectedCandidates);

onAuthStateChanged(auth, async user => {
  currentUser = user;
  $("loginPanel").hidden = !!user;
  $("appPanel").hidden = !user;
  if (!user) return;
  $("userLabel").textContent = user.displayName || user.email || "ログイン中";
  await loadCards();
  await loadNewCardCandidates();
});

async function loadCards() {
  try {
    // 図鑑マスターの不足分を追加し、既存図鑑カードには未設定のブランドだけ補完する。
    // 既存の画像・所持状況・メモ・数量・ユーザー設定済みブランドは上書きしない。
    const snap = await getDocs(cardsRef());
    const existingDocs = new Map(snap.docs.map(d => [d.id, d]));
    const existingIds = new Set(existingDocs.keys());
    const missing = CARD_CATALOG.filter(c => !existingIds.has("catalog_" + c.cardNumber));
    let brandUpdated = false;

    for (const c of CARD_CATALOG) {
      const id = "catalog_" + c.cardNumber;
      const existing = existingDocs.get(id);
      if (existing && c.brand && !String(existing.data().brand || "").trim()) {
        await setDoc(doc(db, "users", currentUser.uid, "cards", id), { brand: c.brand }, { merge: true });
        brandUpdated = true;
      }
    }

    for (const c of missing) {
      const id = "catalog_" + c.cardNumber;
      await setDoc(doc(db, "users", currentUser.uid, "cards", id), {
        ...c, catalog: true, imageData: "", memo: "", owned: false,
        exchange: false, wanted: false, quantity: 0, updatedAt: new Date().toISOString()
      });
    }
    const latest = (missing.length || brandUpdated) ? await getDocs(cardsRef()) : snap;
    cards = latest.docs.map(d => ({ id: d.id, ...d.data() }));
    cards.sort((a,b) => String(a.cardNumber||"").localeCompare(String(b.cardNumber||""), "ja", {numeric:true}));
    renderCards();
  } catch (e) {
    $("cardList").innerHTML = `<p class="hint">カードを読み込めませんでした。Firestoreのルールを確認してね。(${escapeHtml(e.message)})</p>`;
  }
}
function renderCards() {
  if (!currentUser) return;
  const q = $("searchInput").value.trim().toLowerCase();
  const f = $("statusFilter").value;
  const group = $("groupFilter").value;
  const brand = $("brandFilter").value;
  const sort = $("sortFilter").value;

  // ブランドの選択肢は、カードに登録されたブランド名から自動作成する。
  const selectedBrand = brand;
  const brands = [...new Set(cards.map(c => String(c.brand || "").trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b, "ja"));
  $("brandFilter").innerHTML = '<option value="all">すべてのブランド</option>' + brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("");
  if (brands.includes(selectedBrand)) $("brandFilter").value = selectedBrand;

  const shown = cards.filter(c => {
    const text = `${c.cardNumber||""} ${c.name||""} ${c.series||""} ${c.rarity||""} ${c.catalogGroup||""} ${c.brand||""} ${c.memo||""}`.toLowerCase();
    if (q && !text.includes(q)) return false;
    if (group !== "all" && (c.catalogGroup || "手動登録") !== group) return false;
    if (brand !== "all" && (c.brand || "") !== brand) return false;
    if (f === "owned" && !c.owned) return false;
    if (f === "notOwned" && c.owned) return false;
    if (f === "exchange" && !c.exchange) return false;
    if (f === "wanted" && !c.wanted) return false;
    if (f === "noImage" && c.imageData) return false;
    return true;
  });
  shown.sort((a,b) => {
    if (sort === "numberDesc") return String(b.cardNumber||"").localeCompare(String(a.cardNumber||""), "ja", {numeric:true});
    if (sort === "nameAsc") return String(a.name||"").localeCompare(String(b.name||""), "ja");
    return String(a.cardNumber||"").localeCompare(String(b.cardNumber||""), "ja", {numeric:true});
  });

  const catalogCards = cards.filter(c => c.catalog);
  const collectionBase = catalogCards.length ? catalogCards : cards;
  const ownedBase = collectionBase.filter(c => c.owned).length;
  const rate = collectionBase.length ? Math.round(ownedBase / collectionBase.length * 100) : 0;
  $("totalCount").textContent = collectionBase.length;
  $("ownedCount").textContent = ownedBase;
  $("collectionRate").textContent = `${rate}%`;
  $("collectionProgress").style.width = `${rate}%`;
  $("collectionProgressText").textContent = `${ownedBase} / ${collectionBase.length} 枚を所持`;
  $("wantedCount").textContent = cards.filter(c => c.wanted).length;
  $("exchangeQuickBtn").textContent = `♡ 交換リスト（${cards.filter(c => c.exchange).length}）`;
  $("wantedQuickBtn").textContent = `☆ 欲しいカード（${cards.filter(c => c.wanted).length}）`;

  $("cardList").innerHTML = shown.length ? shown.map(c => `
    <article class="card"><button class="card-image-button" type="button" data-image="${escapeHtml(c.id)}" aria-label="画像を拡大">
      ${c.imageData ? `<img class="card-image" src="${c.imageData}" alt="${escapeHtml(c.name||"カード画像")}">` : `<span class="image-placeholder"><span>✧</span><small>画像未登録</small></span>`}
    </button><div class="card-info">${c.cardNumber ? `<p class="card-number">${escapeHtml(c.cardNumber)}</p>` : ""}<h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.series || "シリーズ未設定")}${c.rarity ? " · " + escapeHtml(c.rarity) : ""}</p>${c.brand ? `<p class="brand-name">♡ ${escapeHtml(c.brand)}</p>` : ""}<p class="catalog-group">${escapeHtml(c.catalogGroup || "手動登録")}</p>
    <div class="tags">${c.owned?'<span class="tag">所持</span>':'<span class="tag blue">未所持</span>'}${c.exchange?'<span class="tag lav">交換予定</span>':''}${c.wanted?'<span class="tag blue">欲しい</span>':''}${!c.imageData?'<span class="tag image-missing">画像未登録</span>':''}</div><div class="quantity-control"><span>所持数</span><button type="button" class="quantity-button" data-quantity="-1" data-id="${escapeHtml(c.id)}" aria-label="1枚減らす">−</button><strong>${Number(c.quantity)||0}</strong><button type="button" class="quantity-button" data-quantity="1" data-id="${escapeHtml(c.id)}" aria-label="1枚増やす">＋</button></div><button class="edit-button" data-edit="${escapeHtml(c.id)}">編集</button></div></article>`).join("") : '<div class="panel empty-state"><p class="hint">条件に合うカードがないよ。絞り込みを変えてみてね。</p></div>';
  $("cardList").querySelectorAll("[data-quantity]").forEach(b => b.addEventListener("click", () => changeQuantity(b.dataset.id, Number(b.dataset.quantity))));
  $("cardList").querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", () => openCard(cards.find(c => c.id === b.dataset.edit))));
  $("cardList").querySelectorAll("[data-image]").forEach(b => b.addEventListener("click", () => {
    const c = cards.find(x => x.id === b.dataset.image); if (!c?.imageData) return;
    $("largeCardImage").src = c.imageData; $("imageDialog").showModal();
  }));
}
async function changeQuantity(id, delta) {
  const card = cards.find(c => c.id === id);
  if (!card) return;
  const quantity = Math.max(0, Math.min(999, (Number(card.quantity) || 0) + delta));
  try {
    await setDoc(doc(db, "users", currentUser.uid, "cards", id), { quantity, owned: quantity > 0, updatedAt: new Date().toISOString() }, { merge: true });
    card.quantity = quantity; card.owned = quantity > 0;
    renderCards();
  } catch (e) {
    alert("所持数を保存できませんでした: " + e.message);
  }
}

async function loadNewCardCandidates() {
  try {
    const response = await fetch(`./new-card-candidates.json?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error("候補ファイルがまだありません");
    const data = await response.json();
    const existingNumbers = new Set(cards.map(c => String(c.cardNumber || "").trim()).filter(Boolean));
    detectedCandidates = (data.candidates || []).filter(c => c.cardNumber && !existingNumbers.has(c.cardNumber));
    renderNewCardCandidates(data.checkedAt || "");
  } catch (e) {
    $("newCardsPanel").hidden = true;
  }
}
function renderNewCardCandidates(checkedAt) {
  const panel = $("newCardsPanel");
  panel.hidden = detectedCandidates.length === 0;
  $("newCardsCount").textContent = `${detectedCandidates.length}件`;
  if (!detectedCandidates.length) return;
  $("newCardsList").innerHTML = detectedCandidates.map((c, i) => `
    <label class="new-card-row"><input type="checkbox" class="new-card-check" value="${i}" checked>
      <span><strong>${escapeHtml(c.cardNumber)}</strong><small>${escapeHtml(c.rarity || "レアリティ未確認")} ・ ${escapeHtml(c.source || "公式カードリスト")}</small></span>
    </label>`).join("");
  $("importNewCardsBtn").disabled = false;
  $("newCardsMessage").textContent = checkedAt ? `最終チェック：${checkedAt}（日本時間）` : "新カード候補が見つかったよ。";
  $("newCardsList").querySelectorAll("input").forEach(input => input.addEventListener("change", updateImportButton));
}
function updateImportButton() {
  $("importNewCardsBtn").disabled = !$("newCardsList").querySelector("input:checked");
}
async function importSelectedCandidates() {
  const selected = [...$("newCardsList").querySelectorAll("input:checked")].map(x => detectedCandidates[Number(x.value)]).filter(Boolean);
  if (!selected.length) return;
  if (!confirm(`${selected.length}枚を確認待ちカードとして追加する？\nカード名・ブランドなどは、公式ページで確認できない場合は後から編集してね。`)) return;
  const existingNumbers = new Set(cards.map(c => String(c.cardNumber || "").trim()));
  let added = 0;
  try {
    for (const c of selected) {
      if (existingNumbers.has(c.cardNumber)) continue;
      const id = "detected_" + c.cardNumber.replace(/[^A-Za-z0-9_-]/g, "_");
      await setDoc(doc(db, "users", currentUser.uid, "cards", id), {
        cardNumber: c.cardNumber, name: "名称未確認", brand: "", series: "", rarity: c.rarity || "",
        catalog: false, catalogGroup: "新カード（情報確認待ち）", imageData: "", memo: "公式カードリストから自動検出。カード情報を確認して編集してね。",
        owned: false, exchange: false, wanted: false, quantity: 0, updatedAt: new Date().toISOString()
      }, { merge: false });
      existingNumbers.add(c.cardNumber); added++;
    }
    $("newCardsMessage").textContent = `${added}枚を追加したよ。カード名などを編集してね。`;
    await loadCards();
    await loadNewCardCandidates();
  } catch (e) {
    $("newCardsMessage").textContent = "追加できませんでした: " + e.message;
  }
}

function openCard(c = null) {
  $("cardForm").reset(); $("cardId").value = c?.id || "";
  $("dialogTitle").textContent = c ? "カードを編集" : "カードを追加";
  $("cardNumber").value = c?.cardNumber || ""; $("cardName").value = c?.name || "";
  $("cardSeries").value = c?.series || ""; $("cardRarity").value = c?.rarity || ""; $("cardBrand").value = c?.brand || ""; $("cardMemo").value = c?.memo || "";
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
  const data = { catalog: !!oldCard?.catalog, catalogGroup: oldCard?.catalogGroup || "手動登録", cardNumber: $("cardNumber").value.trim(), name: $("cardName").value.trim(), brand: $("cardBrand").value.trim(), series: $("cardSeries").value.trim(), rarity: $("cardRarity").value.trim(), imageData: currentImageData, memo: $("cardMemo").value.trim(), owned: $("isOwned").checked, exchange: $("isExchange").checked, wanted: $("isWanted").checked, quantity: Math.max(0, Math.min(999, Number($("quantity").value) || 0)), updatedAt: new Date().toISOString() };
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
