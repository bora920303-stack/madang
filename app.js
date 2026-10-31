const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const bookList = document.querySelector("#bookList");
const statusMessage = document.querySelector("#statusMessage");
const authForm = document.querySelector("#authForm");
const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const authButtons = document.querySelectorAll("#authButtons button");
const signOutButton = document.querySelector("#signOutButton");
const loginInfo = document.querySelector("#loginInfo");
const authMessage = document.querySelector("#authMessage");
const ordersSection = document.querySelector("#ordersSection");
const ordersList = document.querySelector("#ordersList");
const ordersMessage = document.querySelector("#ordersMessage");
const purchaseMessage = document.querySelector("#purchaseMessage");

let currentUserId = null;
let ordersRequestVersion = 0;
let isLoggedIn = false;

function setMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function setStatus(message, isError = false) { setMessage(statusMessage, message, isError); }
function setAuthMessage(message, isError = false) { setMessage(authMessage, message, isError); }
function setOrdersMessage(message, isError = false) { setMessage(ordersMessage, message, isError); }
function setPurchaseMessage(message, isError = false) { setMessage(purchaseMessage, message, isError); }
function formatPrice(price) { return `${Number(price).toLocaleString("ko-KR")}원`; }
function formatDate(value) { return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }

function setAuthButtonsDisabled(isDisabled) {
  authButtons.forEach((button) => { button.disabled = isDisabled; });
  signOutButton.disabled = isDisabled;
}

function updateAuthScreen(session) {
  isLoggedIn = Boolean(session);
  document.querySelectorAll(".cover-upload").forEach((element) => { element.hidden = !isLoggedIn; });
  authForm.hidden = isLoggedIn;
  signOutButton.hidden = !isLoggedIn;
  loginInfo.textContent = isLoggedIn ? `로그인됨: ${session.user.email}` : "로그인하면 회원 기능을 이용할 수 있습니다.";
}

function clearOrders() {
  ordersList.replaceChildren();
  ordersSection.hidden = true;
  setOrdersMessage("");
  setPurchaseMessage("");
}

function showOrders(orders) {
  ordersList.replaceChildren();
  orders.forEach((order) => {
    const card = document.createElement("article");
    const title = document.createElement("h3");
    const detail = document.createElement("p");
    const amount = document.createElement("p");
    card.className = "order-card";
    amount.className = "order-amount";
    title.textContent = order.book_title;
    detail.textContent = `수량 ${order.quantity}권 · ${formatDate(order.created_at)}`;
    amount.textContent = `결제 금액 ${formatPrice(order.unit_price * order.quantity)}`;
    card.append(title, detail, amount);
    ordersList.append(card);
  });
}

async function loadOrders(userId) {
  const requestVersion = ++ordersRequestVersion;
  ordersSection.hidden = false;
  ordersList.replaceChildren();
  setOrdersMessage("주문 내역을 불러오는 중입니다.");
  const { data: orders, error } = await sb.from("orders")
    .select("book_title, quantity, unit_price, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // 로그아웃 또는 회원 전환 뒤 늦게 도착한 응답은 화면에 표시하지 않습니다.
  if (requestVersion !== ordersRequestVersion || currentUserId !== userId) return;
  if (error) {
    setOrdersMessage(`주문 내역을 불러오지 못했습니다: ${error.message}`, true);
    return;
  }
  if (!orders || orders.length === 0) {
    setOrdersMessage("아직 주문 내역이 없습니다.");
    return;
  }
  setOrdersMessage(`총 ${orders.length}건의 주문입니다.`);
  showOrders(orders);
}

function syncOrdersForSession(session) {
  updateAuthScreen(session);
  currentUserId = session?.user?.id ?? null;
  ordersRequestVersion += 1;
  clearOrders();
  if (currentUserId) loadOrders(currentUserId);
}

async function restoreSession() {
  const { data, error } = await sb.auth.getSession();
  if (error) {
    setAuthMessage(`로그인 상태를 확인하지 못했습니다: ${error.message}`, true);
    return;
  }
  syncOrdersForSession(data.session);
}

function createPurchaseControls(book) {
  const controls = document.createElement("div");
  const label = document.createElement("label");
  const quantityInput = document.createElement("input");
  const button = document.createElement("button");
  const inputId = `quantity-${book.id}`;
  controls.className = "purchase-controls";
  label.htmlFor = inputId;
  label.textContent = "수량";
  quantityInput.className = "quantity-input";
  quantityInput.id = inputId;
  quantityInput.type = "number";
  quantityInput.min = "1";
  quantityInput.max = "10";
  quantityInput.step = "1";
  quantityInput.value = "1";
  button.className = "purchase-button";
  button.type = "button";
  button.textContent = "모의 구매";

  button.addEventListener("click", async () => {
    const quantity = Number(quantityInput.value);
    if (!currentUserId) {
      setAuthMessage("모의 구매는 로그인 후 이용할 수 있습니다.", true);
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      setPurchaseMessage("수량은 1부터 10 사이의 정수로 입력해 주세요.", true);
      return;
    }
    const expectedAmount = book.price * quantity;
    if (!window.confirm(`${book.title}\n수량: ${quantity}권\n예상 금액: ${formatPrice(expectedAmount)}\n\n구매하시겠습니까?`)) return;

    const purchasingUserId = currentUserId;
    button.disabled = true;
    setPurchaseMessage("모의 구매를 처리하는 중입니다.");
    const { error } = await sb.rpc("purchase_book", {
      p_book_id: book.id,
      p_quantity: quantity,
    });
    // 구매 처리 중 로그아웃하거나 회원이 바뀌면 이전 결과를 표시하지 않습니다.
    if (currentUserId !== purchasingUserId) {
      button.disabled = false;
      return;
    }
    if (error) {
      setPurchaseMessage(`모의 구매에 실패했습니다: ${error.message}`, true);
      button.disabled = false;
      return;
    }
    setPurchaseMessage("모의 구매가 완료되었습니다");
    button.disabled = false;
    if (currentUserId) loadOrders(currentUserId);
  });
  controls.append(label, quantityInput, button);
  return controls;
}

// 도서별 표지 이미지는 Supabase Storage의 covers/<도서ID> 경로에 저장합니다.
function addBookCover(card, book) {
  const wrapper = document.createElement("div");
  wrapper.className = "book-cover-wrapper";

  const img = document.createElement("img");
  img.className = "book-cover";
  img.alt = `${book.title} 표지`;
  img.loading = "lazy";
  img.hidden = true;

  const placeholder = document.createElement("p");
  placeholder.className = "book-cover-placeholder";
  placeholder.textContent = "등록된 도서 이미지가 없습니다.";

  const { data } = sb.storage.from(BOOK_IMAGE_BUCKET).getPublicUrl(`covers/${book.id}`);
  img.onload = () => { img.hidden = false; placeholder.hidden = true; };
  img.onerror = () => { img.hidden = true; placeholder.hidden = false; };
  // 같은 경로로 교체 업로드했을 때 캐시된 표지가 남지 않도록 합니다.
  img.src = data.publicUrl;
  wrapper.append(img, placeholder);
  card.append(wrapper);

  const upload = document.createElement("div");
  upload.className = "cover-upload";
  upload.hidden = !isLoggedIn;
  const label = document.createElement("label");
  label.textContent = "표지 이미지 (JPG, PNG, WebP · 최대 5MB)";
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/webp";
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "이미지 업로드";
  const message = document.createElement("p");
  message.className = "cover-upload-message";
  button.addEventListener("click", async () => {
    const file = input.files?.[0];
    if (!currentUserId) { message.textContent = "로그인 후 업로드할 수 있습니다."; return; }
    if (!file) { message.textContent = "이미지 파일을 선택해 주세요."; return; }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      message.textContent = "JPG, PNG, WebP 파일만 가능합니다."; return;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.textContent = "파일 크기는 5MB 이하로 선택해 주세요."; return;
    }
    button.disabled = true;
    message.textContent = "업로드 중입니다.";
    try {
      const { error } = await sb.storage.from(BOOK_IMAGE_BUCKET).upload(
        `covers/${book.id}`, file, { upsert: true, contentType: file.type, cacheControl: "60" }
      );
      if (error) throw error;
      img.src = `${data.publicUrl}?v=${Date.now()}`;
      message.textContent = "이미지가 등록되었습니다.";
      input.value = "";
    } catch (error) {
      message.textContent = `업로드 실패: ${error.message}`;
    } finally {
      button.disabled = false;
    }
  });
  upload.append(label, input, button, message);
  card.append(upload);
}

function showBooks(books) {
  bookList.replaceChildren();
  books.forEach((book) => {
    const card = document.createElement("article");
    const title = document.createElement("h2");
    const author = document.createElement("p");
    const price = document.createElement("p");
    card.className = "book-card";
    author.className = "book-author";
    price.className = "book-price";
    title.textContent = book.title;
    author.textContent = `저자: ${book.author}`;
    price.textContent = formatPrice(book.price);
    addBookCover(card, book);
    card.append(title, author, price, createPurchaseControls(book));
    bookList.append(card);
  });
}

async function loadBooks() {
  const keyword = searchInput.value.trim();
  let request = sb.from("books").select("id, title, author, price").order("id");
  if (keyword) request = request.ilike("title", `%${keyword}%`);
  bookList.replaceChildren();
  setStatus("도서 목록을 불러오는 중입니다.");
  const { data: books, error } = await request;
  if (error) {
    setStatus(`도서 목록을 불러오지 못했습니다: ${error.message}`, true);
    return;
  }
  if (!books || books.length === 0) {
    setStatus("검색 결과가 없습니다.");
    return;
  }
  setStatus(`총 ${books.length}권의 도서를 찾았습니다.`);
  showBooks(books);
}

searchForm.addEventListener("submit", (event) => { event.preventDefault(); loadBooks(); });
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const action = event.submitter?.value;
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  setAuthButtonsDisabled(true);
  setAuthMessage("");
  try {
    if (action === "signup") {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) setAuthMessage(`회원가입에 실패했습니다: ${error.message}`, true);
      else if (!data.session) setAuthMessage("회원가입되었습니다. 이메일 확인 후 로그인해 주세요.");
      else { setAuthMessage("회원가입과 로그인이 완료되었습니다."); passwordInput.value = ""; }
    }
    if (action === "signin") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setAuthMessage(`로그인에 실패했습니다: ${error.message}`, true);
      else { setAuthMessage("로그인되었습니다."); passwordInput.value = ""; }
    }
    if (action !== "signup" && action !== "signin") {
      setAuthMessage("회원가입 또는 로그인 버튼을 다시 눌러 주세요.", true);
    }
  } catch (error) {
    setAuthMessage(`인증 요청 중 오류가 발생했습니다: ${error.message}`, true);
  } finally {
    setAuthButtonsDisabled(false);
  }
});
signOutButton.addEventListener("click", async () => {
  setAuthButtonsDisabled(true);
  try {
    const { error } = await sb.auth.signOut();
    if (error) setAuthMessage(`로그아웃에 실패했습니다: ${error.message}`, true);
    else setAuthMessage("로그아웃되었습니다.");
  } catch (error) {
    setAuthMessage(`로그아웃 중 오류가 발생했습니다: ${error.message}`, true);
  } finally {
    setAuthButtonsDisabled(false);
  }
});

// 이 콜백에서는 화면만 즉시 바꾸고, 주문 조회는 다음 작업 순서로 미룹니다.
sb.auth.onAuthStateChange((_event, session) => {
  updateAuthScreen(session);
  window.setTimeout(() => syncOrdersForSession(session), 0);
});
restoreSession();
loadBooks();
