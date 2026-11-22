// Ứng dụng từ vựng chạy trên trình duyệt Android, không cần thư viện ngoài.
const STORAGE_KEY = "english-vocabulary-pocket-v1";
const DEFAULT_REVIEW_COUNT = 5;
const appRoot = document.getElementById("app");
const importInput = document.getElementById("import-file");

// Chuẩn hóa chữ để so sánh từ không phân biệt hoa/thường.
function wordKey(value) {
  return String(value ?? "").trim().normalize("NFC").toLocaleLowerCase();
}

// Chuyển giá trị thành số nguyên dương an toàn.
function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Chuyển JSON từ cả bản desktop và bản Android thành cùng một cấu trúc dữ liệu.
function normalizeData(raw) {
  const legacyDeleteAfter = positiveInteger(raw?.settings?.delete_after, 3);
  const words = Array.isArray(raw?.words)
    ? raw.words.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const word = String(item.word ?? "").trim();
        const definition = String(item.definition ?? "").trim();
        if (!word || !definition) return [];
        const countValue = Number.parseInt(item.correct_count, 10);
        return [{
          word,
          definition,
          correct_count: Number.isFinite(countValue) ? Math.max(0, countValue) : 0,
          delete_after: positiveInteger(item.delete_after, legacyDeleteAfter),
        }];
      })
    : [];
  return {
    words,
    settings: {
      review_count: positiveInteger(raw?.settings?.review_count, DEFAULT_REVIEW_COUNT),
    },
  };
}

// Nạp dữ liệu đã có trên điện thoại; lần đầu sẽ bắt đầu bằng kho trống.
function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeData(JSON.parse(saved)) : normalizeData({});
  } catch (error) {
    console.warn("Không thể đọc dữ liệu từ bộ nhớ trình duyệt:", error);
    return normalizeData({});
  }
}

const state = {
  data: loadData(),
  screen: "home",
  notice: "",
  noticeType: "",
  review: null,
};

// Lưu ngay sau mỗi lần thêm từ, nhập file hoặc trả lời đúng.
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    return true;
  } catch (error) {
    console.error("Không thể lưu dữ liệu:", error);
    window.alert("Không lưu được dữ liệu trên thiết bị. Hãy kiểm tra dung lượng trình duyệt.");
    return false;
  }
}

// Mã hóa nội dung từ người dùng trước khi đưa vào HTML.
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

// Chọn ngẫu nhiên không lặp lại phần tử trong một lần lấy mẫu.
function randomSample(items, requestedCount) {
  const copy = [...items];
  const count = Math.min(requestedCount, copy.length);
  for (let index = 0; index < count; index += 1) {
    const swapIndex = index + Math.floor(Math.random() * (copy.length - index));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy.slice(0, count);
}

// Tạo một danh sách đầu từ duy nhất và giữ cách viết đầu tiên làm nhãn.
function getUniqueHeadwords() {
  const headwords = new Map();
  for (const item of state.data.words) {
    const key = wordKey(item.word);
    if (!headwords.has(key)) headwords.set(key, item.word);
  }
  return headwords;
}

function noticeHtml() {
  if (!state.notice) return "";
  return `<div class="notice ${escapeHtml(state.noticeType)}" role="status">${escapeHtml(state.notice)}</div>`;
}

function pageHeading(eyebrow, title, subtitle) {
  return `<div class="page-heading">
    <div class="eyebrow">${escapeHtml(eyebrow)}</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">${escapeHtml(subtitle)}</p>
  </div>`;
}

// Vẽ màn hình chính và bật/tắt nút ôn theo số mục đang có.
function renderHome() {
  const uniqueCount = getUniqueHeadwords().size;
  const definitionCount = state.data.words.length;
  const reviewDisabled = definitionCount < 2 ? "disabled" : "";
  appRoot.innerHTML = `
    ${pageHeading("SỔ TAY CÁ NHÂN", "Từ mới, nhớ lâu hơn.", "Thêm nghĩa của từ rồi ôn ngay trên điện thoại, kể cả khi ngoại tuyến.")}
    <section class="card stats-card" aria-label="Số từ trong kho">
      <div><div class="stats-number">${uniqueCount}</div><div class="stats-caption">từ khác nhau · ${definitionCount} định nghĩa</div></div>
      <div class="stats-pill">Lưu trên điện thoại</div>
    </section>
    ${noticeHtml()}
    <div class="button-stack">
      <button class="button button-primary" data-action="add-screen" type="button">＋ Thêm từ hoặc nghĩa mới</button>
      <button class="button button-soft" data-action="review-setup" type="button" ${reviewDisabled}>Bắt đầu ôn</button>
    </div>
    ${definitionCount < 2 ? '<p class="hint">Cần ít nhất 2 mục từ vựng đã lưu để mở phần ôn.</p>' : ''}
    <section class="card" style="margin-top:16px">
      <strong>Thiết lập hiện tại</strong>
      <p class="subtitle" style="margin-top:7px">${state.data.settings.review_count} mục/câu hỏi mỗi lượt. Mỗi định nghĩa có bộ đếm đúng và ngưỡng xóa riêng.</p>
      <div class="divider"></div>
      <div class="button-row">
        <button class="button button-quiet" data-action="export" type="button">Xuất kho từ</button>
        <button class="button button-quiet" data-action="import" type="button">Nhập kho từ</button>
      </div>
    </section>`;
}

// Màn hình nhập từ và định nghĩa; từ trùng được lưu thành một mục nghĩa riêng.
function renderAddScreen() {
  appRoot.innerHTML = `
    ${pageHeading("THÊM VÀO KHO", "Ghi một nghĩa mới", "Bạn có thể nhập lại cùng một từ; mỗi định nghĩa giữ tiến độ riêng.")}
    ${noticeHtml()}
    <form class="card" id="add-form" autocomplete="off">
      <div class="field">
        <label for="new-word">Từ tiếng Anh</label>
        <input class="text-input" id="new-word" name="word" type="text" required maxlength="100" autocapitalize="none" spellcheck="false" placeholder="Ví dụ: run">
        <small id="duplicate-hint">Bộ đếm và ngưỡng này chỉ áp dụng cho định nghĩa vừa lưu.</small>
      </div>
      <div class="field">
        <label for="new-definition">Định nghĩa</label>
        <textarea class="text-area" id="new-definition" name="definition" required maxlength="1500" placeholder="Ghi nghĩa tiếng Việt hoặc tiếng Anh..."></textarea>
      </div>
      <div class="field">
        <label for="new-target">Số lần đúng để tự xóa định nghĩa này</label>
        <input class="number-input" id="new-target" name="delete_after" type="number" min="1" max="10000" step="1" value="3" required inputmode="numeric">
        <small>Định nghĩa cùng cách viết từ vẫn có bộ đếm và ngưỡng riêng.</small>
      </div>
      <div class="button-row">
        <button class="button button-quiet" data-action="home" type="button">Quay lại</button>
        <button class="button button-primary" type="submit">Lưu định nghĩa</button>
      </div>
    </form>`;
}

// Màn hình chọn số mục và cách ôn; trắc nghiệm cần bốn đầu từ riêng biệt.
function renderReviewSetup() {
  const uniqueCount = getUniqueHeadwords().size;
  const definitionCount = state.data.words.length;
  const choiceDisabled = uniqueCount < 4 ? "disabled" : "";
  appRoot.innerHTML = `
    ${pageHeading("CHỌN CÁCH ÔN", "Bắt đầu một lượt ngắn", "Từ hoặc định nghĩa được lấy ngẫu nhiên từ kho đã lưu.")}
    ${noticeHtml()}
    <section class="card">
      <div class="field" style="margin-top:0">
        <label for="review-count">Số mục hoặc câu hỏi muốn ôn</label>
        <input class="number-input" id="review-count" type="number" min="1" max="1000" step="1" inputmode="numeric" value="${state.data.settings.review_count}">
        <small>Kho hiện có ${definitionCount} định nghĩa của ${uniqueCount} từ khác nhau. Nếu nhập nhiều hơn số mục hiện có, ứng dụng sẽ lấy toàn bộ mục.</small>
      </div>
      <div class="button-stack">
        <button class="button button-primary" data-action="start-review" data-mode="match" type="button">Nối từ với định nghĩa</button>
        <button class="button button-primary" data-action="start-review" data-mode="type" type="button">Xem định nghĩa, nhập từ</button>
        <button class="button button-primary" data-action="start-review" data-mode="choice" type="button" ${choiceDisabled}>Trắc nghiệm 4 lựa chọn</button>
      </div>
      ${uniqueCount < 4 ? '<p class="hint">Trắc nghiệm sẽ mở khi kho có ít nhất 4 từ khác nhau.</p>' : ''}
      <button class="button button-quiet" data-action="home" type="button">Quay lại trang chính</button>
    </section>`;
}

// Tạo thẻ tiến độ để người học biết còn bao nhiêu câu trong lượt.
function progressHtml(review, remaining) {
  const completed = review.total - remaining;
  const percent = review.total ? Math.round((completed / review.total) * 100) : 0;
  return `<div class="progress-line"><span>${completed}/${review.total}</span><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div><span>${remaining} còn lại</span></div>`;
}

// Vẽ cặp từ/định nghĩa, dùng ID của từng thẻ để phân biệt các mục trùng hệt nhau.
function renderMatchQuestion() {
  const review = state.review;
  const left = [...review.leftItems].sort(() => Math.random() - 0.5);
  const right = [...review.rightItems].sort(() => Math.random() - 0.5);
  const leftHtml = left.map((row) => `
    <button class="button match-option ${review.selectedLeftId === row.id ? "selected" : ""}"
      data-action="select-left" data-id="${row.id}" type="button">${escapeHtml(row.entry.word)}</button>`).join("");
  const rightHtml = right.map((row) => `
    <button class="button match-option ${review.selectedRightId === row.id ? "selected" : ""}"
      data-action="select-right" data-id="${row.id}" type="button">${escapeHtml(row.entry.definition)}</button>`).join("");
  return `
    ${pageHeading("ÔN NỐI CẶP", "Nối từ với định nghĩa", "Từ trùng chính tả có thể nối với bất kỳ định nghĩa nào của từ đó.")}
    ${progressHtml(review, review.leftItems.length)}
    ${review.note ? `<div class="notice">${escapeHtml(review.note)}</div>` : ""}
    <div class="match-grid">
      <section class="match-column"><div class="column-title">TỪ TIẾNG ANH</div>${leftHtml}</section>
      <section class="match-column"><div class="column-title">ĐỊNH NGHĨA</div>${rightHtml}</section>
    </div>
    <button class="button button-quiet" data-action="home" type="button" style="margin-top:14px">Kết thúc lượt ôn</button>`;
}

// Dùng một trang định nghĩa chung cho kiểu nhập từ và kiểu trắc nghiệm.
function definitionCard(definition) {
  return `<section class="card review-card"><div class="definition-label">ĐỊNH NGHĨA</div><p class="definition-text">${escapeHtml(definition)}</p></section>`;
}

function renderTypeQuestion() {
  const review = state.review;
  const question = review.questions[0];
  return `
    ${pageHeading("ÔN NHẬP TỪ", "Từ nào có nghĩa này?", "Nhập từ tiếng Anh rồi kiểm tra câu trả lời.")}
    ${progressHtml(review, review.questions.length)}
    ${review.note ? `<div class="notice">${escapeHtml(review.note)}</div>` : ""}
    ${definitionCard(question.entry.definition)}
    <form class="card" id="answer-form" autocomplete="off" style="margin-top:14px">
      <div class="field" style="margin-top:0">
        <label for="typed-answer">Từ tiếng Anh</label>
        <input class="text-input" id="typed-answer" name="answer" type="text" required autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="Nhập đáp án">
      </div>
      <button class="button button-primary" type="submit">Kiểm tra đáp án</button>
    </form>
    <button class="button button-quiet" data-action="home" type="button" style="margin-top:12px">Kết thúc lượt ôn</button>`;
}

function renderChoiceQuestion() {
  const review = state.review;
  const question = review.questions[0];
  const choices = question.options.map((option, index) => `
    <button class="button choice-option" data-action="choose-option" data-option="${escapeHtml(option)}" type="button">
      <span class="stats-pill">${String.fromCharCode(65 + index)}</span>${escapeHtml(option)}
    </button>`).join("");
  return `
    ${pageHeading("TRẮC NGHIỆM", "Chọn từ đúng", "Bốn lựa chọn trong câu này đều là những từ khác nhau.")}
    ${progressHtml(review, review.questions.length)}
    ${review.note ? `<div class="notice">${escapeHtml(review.note)}</div>` : ""}
    ${definitionCard(question.entry.definition)}
    <div class="choice-grid">${choices}</div>
    <button class="button button-quiet" data-action="home" type="button" style="margin-top:12px">Kết thúc lượt ôn</button>`;
}

function renderResult() {
  const review = state.review;
  const uniqueRemaining = getUniqueHeadwords().size;
  appRoot.innerHTML = `
    <div class="card">
      <div class="result-mark" aria-hidden="true">✓</div>
      <div class="eyebrow">ĐÃ XONG LƯỢT ÔN</div>
      <h1>Tiến bộ từng ngày.</h1>
      <div class="result-number">${review.correct} / ${review.total} câu đúng</div>
      <div class="result-details">
        <div>Số câu sai hoặc bỏ qua: <strong>${review.wrong}</strong></div>
        <div>Số từ khác nhau còn trong kho: <strong>${uniqueRemaining}</strong></div>
        <div>Số định nghĩa còn trong kho: <strong>${state.data.words.length}</strong></div>
      </div>
      <div class="button-stack" style="margin-top:22px">
        <button class="button button-primary" data-action="review-setup" type="button" ${state.data.words.length < 2 ? "disabled" : ""}>Ôn lượt mới</button>
        <button class="button" data-action="home" type="button">Trang chính</button>
      </div>
    </div>`;
}

// Chọn màn hình hiện tại để dựng lại giao diện sau mỗi câu.
function render() {
  if (state.screen === "add") renderAddScreen();
  else if (state.screen === "setup") renderReviewSetup();
  else if (state.screen === "review") {
    const review = state.review;
    const remaining = review.mode === "match" ? review.leftItems.length : review.questions.length;
    if (!remaining) renderResult();
    else if (review.mode === "match") appRoot.innerHTML = renderMatchQuestion();
    else if (review.mode === "type") appRoot.innerHTML = renderTypeQuestion();
    else appRoot.innerHTML = renderChoiceQuestion();
  } else renderHome();
}

// Mỗi lần đúng tăng bộ đếm của đúng định nghĩa đang được hỏi.
function recordCorrect(entry) {
  entry.correct_count = Math.max(0, Number.parseInt(entry.correct_count, 10) || 0) + 1;
  const target = positiveInteger(entry.delete_after, 3);
  entry.delete_after = target;
  const deleted = entry.correct_count >= target;
  if (deleted) {
    const index = state.data.words.indexOf(entry);
    if (index >= 0) state.data.words.splice(index, 1);
  }
  return { count: entry.correct_count, target, deleted };
}

// Xóa đúng thẻ theo ID trong một hàng đợi ôn.
function removeById(items, id) {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) items.splice(index, 1);
}

// Bắt đầu một trong ba kiểu; mỗi thẻ nghĩa chỉ xuất hiện một lần trong lượt.
function beginReview(mode, requestedAmount) {
  const unique = getUniqueHeadwords();
  if (state.data.words.length < 2) {
    window.alert("Cần ít nhất 2 mục từ vựng đã lưu để bắt đầu ôn.");
    state.screen = "home";
    render();
    return;
  }
  if (mode === "choice" && unique.size < 4) {
    window.alert("Trắc nghiệm cần ít nhất 4 từ khác nhau trong kho.");
    state.screen = "setup";
    render();
    return;
  }

  const amount = Math.min(requestedAmount, state.data.words.length);
  const rows = randomSample(state.data.words, amount).map((entry, index) => ({
    id: `review-${Date.now()}-${index}`,
    entry,
  }));
  state.data.settings.review_count = requestedAmount;
  saveData();
  state.review = {
    mode,
    leftItems: mode === "match" ? [...rows] : [],
    rightItems: mode === "match" ? [...rows] : [],
    questions: [],
    selectedLeftId: null,
    selectedRightId: null,
    total: rows.length,
    correct: 0,
    wrong: 0,
    note: "",
  };

  if (mode === "type") {
    state.review.questions = rows;
  } else if (mode === "choice") {
    const headwords = getUniqueHeadwords();
    const availableKeys = [...headwords.keys()];
    state.review.questions = rows.map((row) => {
      const correctKey = wordKey(row.entry.word);
      const distractors = randomSample(
        availableKeys.filter((key) => key !== correctKey),
        3,
      );
      const optionKeys = randomSample([correctKey, ...distractors], 4);
      return {
        id: row.id,
        entry: row.entry,
        options: optionKeys.map((key) => headwords.get(key)),
      };
    });
  }
  state.screen = "review";
  render();
  appRoot.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Hoàn tất một câu rồi đưa người học tới câu kế tiếp.
function finishQuestion() {
  state.review.questions.shift();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Xử lý chọn một cặp ở màn nối từ.
function checkMatchingPair() {
  const review = state.review;
  const left = review.leftItems.find((row) => row.id === review.selectedLeftId);
  const right = review.rightItems.find((row) => row.id === review.selectedRightId);
  if (!left || !right) return;

  if (wordKey(left.entry.word) === wordKey(right.entry.word)) {
    const progress = recordCorrect(right.entry);
    review.correct += 1;
    review.note = `Đúng: ${left.entry.word} — ${right.entry.definition} (${progress.count}/${progress.target}).`;
    removeById(review.leftItems, left.id);
    removeById(review.rightItems, right.id);
    review.selectedLeftId = null;
    review.selectedRightId = null;
    saveData();
  } else {
    // Khi sai, hiện một đáp án cùng từ, bỏ qua từ bên trái và không cộng tiến độ.
    review.wrong += 1;
    const solution = review.rightItems.find(
      (row) => wordKey(row.entry.word) === wordKey(left.entry.word),
    );
    if (solution) {
      window.alert(`Cặp nối đúng:\n${left.entry.word} — ${solution.entry.definition}\n\nCâu này được bỏ qua, không cộng lần đúng.`);
      removeById(review.leftItems, left.id);
      removeById(review.rightItems, solution.id);
    } else {
      // Nhánh dự phòng để không khóa lượt ôn nếu dữ liệu thay đổi ngoài ứng dụng.
      window.alert("Không tìm thấy định nghĩa tương ứng trong lượt này. Câu được bỏ qua.");
      removeById(review.leftItems, left.id);
      removeById(review.rightItems, right.id);
    }
    review.note = "Câu đã được bỏ qua; bộ đếm đúng không thay đổi.";
    review.selectedLeftId = null;
    review.selectedRightId = null;
  }
  render();
}

// Chấm câu nhập từ; sai thì hiện đáp án và chuyển tiếp nhưng không tăng bộ đếm.
function submitTypedAnswer(form) {
  const question = state.review.questions[0];
  const guess = String(new FormData(form).get("answer") ?? "").trim();
  if (!guess) return;
  if (wordKey(guess) === wordKey(question.entry.word)) {
    const progress = recordCorrect(question.entry);
    state.review.correct += 1;
    state.review.note = `Đúng: ${question.entry.word} (${progress.count}/${progress.target}).`;
    saveData();
  } else {
    state.review.wrong += 1;
    window.alert(`Từ đúng là: ${question.entry.word}\n\nCâu này được bỏ qua, không cộng lần đúng.`);
    state.review.note = "Câu sai đã được bỏ qua; bộ đếm đúng không thay đổi.";
  }
  finishQuestion();
}

// Chấm câu trắc nghiệm; mỗi đáp án đúng chỉ tính cho định nghĩa của câu đó.
function submitChoiceAnswer(answer) {
  const question = state.review.questions[0];
  if (wordKey(answer) === wordKey(question.entry.word)) {
    const progress = recordCorrect(question.entry);
    state.review.correct += 1;
    state.review.note = `Đúng: ${question.entry.word} (${progress.count}/${progress.target}).`;
    saveData();
  } else {
    state.review.wrong += 1;
    window.alert(`Từ đúng là: ${question.entry.word}\n\nCâu này được bỏ qua, không cộng lần đúng.`);
    state.review.note = "Câu sai đã được bỏ qua; bộ đếm đúng không thay đổi.";
  }
  finishQuestion();
}

// Xuất đúng cấu trúc JSON để file dùng được với bản Python trên máy tính.
function exportData() {
  const json = JSON.stringify(state.data, null, 2);
  const file = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "vocabulary.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Chờ trình duyệt bắt đầu tải file rồi mới thu hồi URL tạm.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  state.notice = "Đã xuất file vocabulary.json để sao lưu hoặc chuyển sang bản máy tính.";
  state.noticeType = "success";
  renderHome();
}

// Sự kiện nút được xử lý tập trung để các màn hình gọn và dễ chỉnh sửa.
appRoot.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;

  if (action === "home") {
    state.screen = "home";
    state.review = null;
    render();
  } else if (action === "add-screen") {
    state.screen = "add";
    state.notice = "";
    render();
  } else if (action === "review-setup") {
    if (state.data.words.length < 2) {
      window.alert("Cần ít nhất 2 mục từ vựng đã lưu để bắt đầu ôn.");
      return;
    }
    state.screen = "setup";
    state.notice = "";
    render();
  } else if (action === "start-review") {
    const requested = positiveInteger(document.getElementById("review-count").value, 0);
    if (!requested || requested > 1000) {
      window.alert("Số mục phải là số nguyên từ 1 đến 1000.");
      return;
    }
    beginReview(button.dataset.mode, requested);
  } else if (action === "select-left") {
    state.review.selectedLeftId = state.review.selectedLeftId === button.dataset.id ? null : button.dataset.id;
    if (state.review.selectedLeftId && state.review.selectedRightId) checkMatchingPair();
    else render();
  } else if (action === "select-right") {
    state.review.selectedRightId = state.review.selectedRightId === button.dataset.id ? null : button.dataset.id;
    if (state.review.selectedLeftId && state.review.selectedRightId) checkMatchingPair();
    else render();
  } else if (action === "choose-option") {
    submitChoiceAnswer(button.dataset.option);
  } else if (action === "export") {
    exportData();
  } else if (action === "import") {
    importInput.click();
  }
});

// Lưu một định nghĩa mới cùng bộ đếm riêng ban đầu.
appRoot.addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.target.id === "add-form") {
    const formData = new FormData(event.target);
    const word = String(formData.get("word") ?? "").trim();
    const definition = String(formData.get("definition") ?? "").trim();
    const target = positiveInteger(formData.get("delete_after"), 0);
    if (!word || !definition || !target || target > 10000) {
      window.alert("Nhập từ, định nghĩa và số lần đúng hợp lệ từ 1 đến 10000.");
      return;
    }
    state.data.words.push({ word, definition, correct_count: 0, delete_after: target });
    if (!saveData()) return;
    state.notice = `Đã lưu định nghĩa cho “${word}”.`;
    state.noticeType = "success";
    state.screen = "home";
    render();
  } else if (event.target.id === "answer-form") {
    submitTypedAnswer(event.target);
  }
});

// Gợi ý khi người dùng thêm nghĩa cho một từ đã xuất hiện trong kho.
appRoot.addEventListener("input", (event) => {
  if (event.target.id !== "new-word") return;
  const key = wordKey(event.target.value);
  const count = state.data.words.filter((item) => wordKey(item.word) === key).length;
  const hint = document.getElementById("duplicate-hint");
  if (hint) {
    hint.textContent = count
      ? `Kho đã có ${count} định nghĩa của từ này. Mục mới sẽ có bộ đếm độc lập.`
      : "Bộ đếm và ngưỡng này chỉ áp dụng cho định nghĩa vừa lưu.";
  }
});

// Nhập JSON từ bản desktop hoặc từ một thiết bị Android khác.
importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    if (!raw || !Array.isArray(raw.words)) {
      throw new Error("File cần có danh sách words.");
    }
    const imported = normalizeData(raw);
    if (!window.confirm(`Thay kho hiện tại bằng ${imported.words.length} định nghĩa từ file ${file.name}?`)) {
      importInput.value = "";
      return;
    }
    state.data = imported;
    if (!saveData()) return;
    state.screen = "home";
    state.notice = `Đã nhập ${imported.words.length} định nghĩa.`;
    state.noticeType = "success";
    render();
  } catch (error) {
    window.alert(`Không đọc được file JSON: ${error.message}`);
  } finally {
    importInput.value = "";
  }
});

// Nút nhà luôn đưa người dùng về màn hình chính.
document.getElementById("home-button").addEventListener("click", () => {
  state.screen = "home";
  state.review = null;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Đăng ký Service Worker để lưu các tài nguyên giao diện dùng ngoại tuyến.
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Không đăng ký được chế độ ngoại tuyến:", error);
    });
  });
}

render();
