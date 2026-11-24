// Ứng dụng từ vựng và phrasal verbs chạy trong trình duyệt Android, không cần thư viện ngoài.
const STORAGE_KEY = "english-vocabulary-pocket-v1";
const DEFAULT_REVIEW_COUNT = 5;
const appRoot = document.getElementById("app");
const importInput = document.getElementById("import-file");
let deferredInstallPrompt = null;

// Chuẩn hóa chữ để so sánh câu trả lời không phân biệt hoa/thường.
function wordKey(value) {
  return String(value ?? "").trim().normalize("NFC").toLocaleLowerCase();
}

// Chuyển giá trị thành số nguyên dương an toàn.
function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Đọc danh sách từ nối từ cả mảng JSON lẫn chuỗi ngăn cách bằng dấu phẩy.
function normalizeConnectors(value) {
  const candidates = Array.isArray(value) ? value : String(value ?? "").split(/[;,]/);
  const found = new Set();
  return candidates.flatMap((candidate) => {
    const connector = String(candidate ?? "").trim();
    const key = wordKey(connector);
    if (!connector || found.has(key)) return [];
    found.add(key);
    return [connector];
  });
}

// Che connector trên cụm hiển thị nhưng không sửa từ/cụm gốc được lưu trong kho.
function maskConnectors(phrase, connectors) {
  let maskedPhrase = String(phrase ?? "").trim();
  let replacementCount = 0;
  const connectorKeys = new Set(connectors.map(wordKey));
  // Các connector tiếng Anh được nhập riêng nên thay từng từ hoàn chỉnh, không đụng "inside" khi tìm "in".
  maskedPhrase = maskedPhrase.replace(/[A-Za-z]+/g, (word) => {
    if (!connectorKeys.has(wordKey(word))) return word;
    replacementCount += 1;
    return "____";
  });
  // Nếu cụm chỉ lưu phần động từ, vẫn đặt chỗ trống để người học nhập connector.
  if (!replacementCount) maskedPhrase = (maskedPhrase + " ____").trim();
  return maskedPhrase.replace(/\s+/g, " ").trim();
}

// Chuyển JSON từ cả bản desktop cũ/mới và Android thành cùng cấu trúc dữ liệu.
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
  const phrasal_verbs = Array.isArray(raw?.phrasal_verbs)
    ? raw.phrasal_verbs.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const phrasal_verb = String(item.phrasal_verb ?? item.phrasalVerb ?? "").trim();
        const definition = String(item.definition ?? "").trim();
        const connectors = normalizeConnectors(item.connectors ?? item.connector);
        if (!phrasal_verb || !definition || !connectors.length) return [];
        const countValue = Number.parseInt(item.correct_count, 10);
        return [{
          phrasal_verb,
          definition,
          connectors,
          correct_count: Number.isFinite(countValue) ? Math.max(0, countValue) : 0,
          delete_after: positiveInteger(item.delete_after, legacyDeleteAfter),
        }];
      })
    : [];
  return {
    words,
    phrasal_verbs,
    settings: {
      review_count: positiveInteger(raw?.settings?.review_count, DEFAULT_REVIEW_COUNT),
      review_scope: ["words", "phrasals", "both"].includes(raw?.settings?.review_scope)
        ? raw.settings.review_scope : "words",
      review_focus: raw?.settings?.review_focus === "connector" ? "connector" : "definition",
    },
  };
}

// Nạp dữ liệu đã lưu trên điện thoại; lần đầu sẽ bắt đầu bằng hai kho trống.
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
  setupScope: null,
  setupFocus: null,
};

// Lưu ngay sau mỗi lần thêm mục, nhập file hoặc trả lời đúng.
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

// Mã hóa nội dung người dùng trước khi đưa vào HTML.
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

// Tạo các đầu từ duy nhất để làm lựa chọn trắc nghiệm định nghĩa.
function getUniqueHeadwords() {
  const headwords = new Map();
  for (const item of state.data.words) {
    const key = wordKey(item.word);
    if (!headwords.has(key)) headwords.set(key, item.word);
  }
  return headwords;
}

// Chuẩn hóa một bản ghi của kho đã chọn, vẫn giữ tham chiếu gốc để cộng đúng bộ đếm.
function makeReviewPool(scope, focus) {
  let sources;
  if (focus === "connector") {
    sources = scope === "words" ? [] : [["phrasal", state.data.phrasal_verbs]];
  } else if (scope === "words") {
    sources = [["word", state.data.words]];
  } else if (scope === "phrasals") {
    sources = [["phrasal", state.data.phrasal_verbs]];
  } else {
    sources = [["word", state.data.words], ["phrasal", state.data.phrasal_verbs]];
  }
  return sources.flatMap(([kind, records]) => records.map((record) => {
    const answer = kind === "word" ? record.word : record.phrasal_verb;
    const connectors = kind === "phrasal" ? record.connectors : [];
    return {
      kind,
      record,
      answer,
      // Câu ôn connector dùng prompt đã che; đáp án đầy đủ chỉ dùng khi chấm/giải đáp.
      prompt: focus === "connector" && kind === "phrasal" ? maskConnectors(answer, connectors) : answer,
      definition: record.definition,
      connectors,
    };
  }));
}

// Mỗi định nghĩa chuẩn hóa chỉ giữ một bản ghi đại diện trong một lượt ôn.
function uniqueDefinitionPool(pool) {
  const grouped = new Map();
  for (const item of pool) {
    const key = item.definition.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  // Nếu nhiều mục có cùng định nghĩa, chọn ngẫu nhiên một mục để giữ bộ đếm riêng.
  return [...grouped.values()].map((items) => randomSample(items, 1)[0]);
}

// Đếm số định nghĩa khác nhau để giao diện báo đúng số câu có thể lấy.
function countUniqueDefinitions(pool) {
  return new Set(pool.map((item) =>
    item.definition.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase()
  )).size;
}

// Tạo đúng một thẻ connector cho mỗi phrasal verb; giá trị trùng vẫn là các thẻ riêng.
function makeConnectorItems(phrasalItems) {
  return phrasalItems.map((item, index) => ({
    id: `connector-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    connector: randomSample(item.connectors, 1)[0],
  }));
}

// Hiện nút cài nhanh nếu Chrome cung cấp lời nhắc; nếu chưa, giải thích cách cài thủ công.
function installHelpHtml() {
  if (window.matchMedia("(display-mode: standalone)").matches) return "";
  if (deferredInstallPrompt) {
    return `<section class="card install-card">
      <strong>Cài ứng dụng lên điện thoại</strong>
      <p class="subtitle">Thêm biểu tượng vào màn hình chính để mở như một ứng dụng.</p>
      <button class="button button-primary" data-action="install" type="button">Cài ứng dụng</button>
    </section>`;
  }
  return `<p class="hint install-hint">Để cài ứng dụng: mở trang này bằng Chrome từ một địa chỉ HTTPS, sau đó chọn menu ⋮ → <strong>Cài đặt ứng dụng</strong> hoặc <strong>Thêm vào màn hình chính</strong>.</p>`;
}

function pageHeading(eyebrow, title, subtitle) {
  return `<div class="page-heading">
    <div class="eyebrow">${escapeHtml(eyebrow)}</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="subtitle">${escapeHtml(subtitle)}</p>
  </div>`;
}

function noticeHtml() {
  if (!state.notice) return "";
  return `<div class="notice ${escapeHtml(state.noticeType)}" role="status">${escapeHtml(state.notice)}</div>`;
}

// Vẽ trang chính; nút ôn bật khi tổng hai kho có ít nhất hai mục.
function renderHome() {
  const uniqueWords = getUniqueHeadwords().size;
  const wordDefinitions = state.data.words.length;
  const phrasalCount = state.data.phrasal_verbs.length;
  const totalEntries = wordDefinitions + phrasalCount;
  const reviewDisabled = totalEntries < 2 ? "disabled" : "";
  appRoot.innerHTML = `
    ${pageHeading("SỔ TAY CÁ NHÂN", "Từ mới, nhớ lâu hơn.", "Ghi từ vựng và phrasal verbs riêng; ôn trên điện thoại kể cả khi ngoại tuyến.")}
    ${installHelpHtml()}
    <section class="card stats-card" aria-label="Số mục đã lưu">
      <div><div class="stats-number">${wordDefinitions + phrasalCount}</div><div class="stats-caption">${uniqueWords} từ vựng · ${wordDefinitions} định nghĩa · ${phrasalCount} phrasal verbs</div></div>
      <div class="stats-pill">Lưu trên điện thoại</div>
    </section>
    ${noticeHtml()}
    <div class="button-stack">
      <button class="button button-primary" data-action="add-screen" type="button">＋ Thêm từ vựng</button>
      <button class="button button-primary" data-action="add-phrasal-screen" type="button">＋ Thêm phrasal verb</button>
      <button class="button button-soft" data-action="review-setup" type="button" ${reviewDisabled}>Bắt đầu ôn</button>
    </div>
    ${totalEntries < 2 ? '<p class="hint">Cần ít nhất 2 mục đã lưu trong hai kho để mở phần ôn.</p>' : ''}
    <section class="card" style="margin-top:16px">
      <strong>Thiết lập hiện tại</strong>
      <p class="subtitle" style="margin-top:7px">${state.data.settings.review_count} mục/câu hỏi mỗi lượt. Mỗi định nghĩa có bộ đếm và ngưỡng xóa riêng.</p>
      <div class="divider"></div>
      <div class="button-row">
        <button class="button button-quiet" data-action="export" type="button">Xuất kho từ</button>
        <button class="button button-quiet" data-action="import" type="button">Nhập kho từ</button>
      </div>
    </section>
    <details class="transfer-guide">
      <summary>Cách chuyển kho từ từ máy tính sang điện thoại</summary>
      <ol>
        <li>Trên máy tính, tìm file <strong>vocabulary.json</strong> trong thư mục bản Python. Đóng ứng dụng trước khi sao chép.</li>
        <li>Chép file sang điện thoại, chẳng hạn vào thư mục <strong>Download/Tải xuống</strong>, bằng cáp USB hoặc dịch vụ lưu trữ đám mây.</li>
        <li>Mở bản Android, bấm <strong>Nhập kho từ</strong>, chọn file đó rồi xác nhận. File có thể chứa cả từ vựng và phrasal verbs.</li>
      </ol>
      <p>Muốn giữ kho đang có trên điện thoại, hãy bấm <strong>Xuất kho từ</strong> để sao lưu trước.</p>
    </details>`;
}

// Màn hình riêng để nhập từ vựng; cùng một từ vẫn có thể có nhiều định nghĩa.
function renderAddScreen() {
  appRoot.innerHTML = `
    ${pageHeading("THÊM TỪ VỰNG", "Ghi một nghĩa mới", "Mỗi định nghĩa có bộ đếm và ngưỡng xóa riêng.")}
    ${noticeHtml()}
    <form class="card" id="add-form" autocomplete="off">
      <div class="field"><label for="new-word">Từ tiếng Anh</label>
        <input class="text-input" id="new-word" name="word" type="text" required maxlength="100" autocapitalize="none" spellcheck="false" placeholder="Ví dụ: run">
        <small id="duplicate-hint">Bạn có thể lưu cùng một từ với nhiều định nghĩa.</small></div>
      <div class="field"><label for="new-definition">Định nghĩa</label>
        <textarea class="text-area" id="new-definition" name="definition" required maxlength="1500" placeholder="Ghi nghĩa tiếng Việt hoặc tiếng Anh..."></textarea></div>
      <div class="field"><label for="new-target">Số lần đúng để tự xóa định nghĩa này</label>
        <input class="number-input" id="new-target" name="delete_after" type="number" min="1" max="10000" step="1" value="3" required inputmode="numeric">
        <small>Thiết lập này áp dụng riêng cho định nghĩa vừa lưu.</small></div>
      <div class="button-row"><button class="button button-quiet" data-action="home" type="button">Quay lại</button>
        <button class="button button-primary" type="submit">Lưu định nghĩa</button></div>
    </form>`;
}

// Màn hình nhập phrasal verb, định nghĩa, các connector được chấp nhận và ngưỡng xóa riêng.
function renderAddPhrasalScreen() {
  appRoot.innerHTML = `
    ${pageHeading("THÊM PHRASAL VERB", "Ghi một cụm mới", "Nhập một hoặc nhiều từ nối, phân cách bằng dấu phẩy.")}
    ${noticeHtml()}
    <form class="card" id="add-phrasal-form" autocomplete="off">
      <div class="field"><label for="new-phrasal">Phrasal verb</label>
        <input class="text-input" id="new-phrasal" name="phrasal_verb" type="text" required maxlength="150" autocapitalize="none" spellcheck="false" placeholder="Ví dụ: look forward">
        <small>Có thể lưu trùng cụm nếu đó là một định nghĩa khác.</small></div>
      <div class="field"><label for="new-phrasal-definition">Định nghĩa</label>
        <textarea class="text-area" id="new-phrasal-definition" name="definition" required maxlength="1500" placeholder="Ví dụ: mong chờ điều gì..."></textarea></div>
      <div class="field"><label for="new-connectors">Từ nối đi kèm</label>
        <input class="text-input" id="new-connectors" name="connectors" type="text" required maxlength="300" autocapitalize="none" spellcheck="false" placeholder="Ví dụ: to, on">
        <small>Nếu có nhiều từ nối, nhập tất cả và ngăn cách bằng dấu phẩy. Từ nối được so sánh không phân biệt hoa/thường.</small></div>
      <div class="field"><label for="new-phrasal-target">Số lần đúng để tự xóa mục này</label>
        <input class="number-input" id="new-phrasal-target" name="delete_after" type="number" min="1" max="10000" step="1" value="3" required inputmode="numeric"></div>
      <div class="button-row"><button class="button button-quiet" data-action="home" type="button">Quay lại</button>
        <button class="button button-primary" type="submit">Lưu phrasal verb</button></div>
    </form>`;
}

// Đếm nhãn khác nhau theo phạm vi hiện tại để quyết định điều kiện trắc nghiệm.
function getChoiceLabels(pool, focus) {
  const labels = new Map();
  for (const item of pool) {
    const candidates = focus === "connector" ? item.connectors : [item.answer];
    for (const candidate of candidates) {
      const key = wordKey(candidate);
      if (!labels.has(key)) labels.set(key, candidate);
    }
  }
  return labels;
}

// Màn hình chọn phạm vi, nội dung, số câu và một trong ba dạng ôn.
function renderReviewSetup() {
  const scope = state.setupScope ?? state.data.settings.review_scope;
  const focus = scope === "words" ? "definition" : (state.setupFocus ?? state.data.settings.review_focus);
  const pool = makeReviewPool(scope, focus);
  const availableQuestionCount = focus === "definition" ? countUniqueDefinitions(pool) : pool.length;
  const labels = getChoiceLabels(pool, focus);
  const choiceDisabled = labels.size < 4 ? "disabled" : "";
  const scopeOption = (value, label) => `<option value="${value}" ${scope === value ? "selected" : ""}>${label}</option>`;
  const focusOption = (value, label) => `<option value="${value}" ${focus === value ? "selected" : ""}>${label}</option>`;
  const focusDisabled = scope === "words" ? "disabled" : "";
  const scopeDescription = scope === "words" ? `${state.data.words.length} mục từ vựng`
    : scope === "phrasals" ? `${state.data.phrasal_verbs.length} phrasal verbs`
      : `${state.data.words.length} mục từ vựng và ${state.data.phrasal_verbs.length} phrasal verbs`;
  const focusDescription = focus === "connector"
    ? `Ôn từ nối chỉ lấy phrasal verbs (${state.data.phrasal_verbs.length} mục). Một connector có thể nối với nhiều cụm.`
    : "Ôn định nghĩa sẽ lấy các mục trong phạm vi đã chọn.";
  appRoot.innerHTML = `
    ${pageHeading("CHỌN CÁCH ÔN", "Bắt đầu một lượt ngắn", "Chọn kho muốn ôn, sau đó chọn nội dung và cách luyện.")}
    ${noticeHtml()}
    <section class="card">
      <div class="field" style="margin-top:0"><label for="review-scope">Phạm vi ôn</label>
        <select class="text-input" id="review-scope">${scopeOption("words", "Từ vựng riêng")}${scopeOption("phrasals", "Phrasal verbs riêng")}${scopeOption("both", "Cả hai kho")}</select>
        <small>${escapeHtml(scopeDescription)}.</small></div>
      <div class="field"><label for="review-focus">Nội dung luyện tập</label>
        <select class="text-input" id="review-focus" ${focusDisabled}>${focusOption("definition", "Định nghĩa")}${focusOption("connector", "Từ nối của phrasal verbs")}</select>
        <small>${escapeHtml(focusDescription)}</small></div>
      <div class="field"><label for="review-count">Số mục hoặc câu hỏi muốn ôn</label>
        <input class="number-input" id="review-count" type="number" min="1" max="1000" step="1" inputmode="numeric" value="${state.data.settings.review_count}">
        <small>${availableQuestionCount} ${focus === "definition" ? "định nghĩa khác nhau" : "mục"} trong phạm vi nội dung đã chọn. Nếu số yêu cầu lớn hơn, ứng dụng lấy toàn bộ mục.</small></div>
      <div class="button-stack">
        <button class="button button-primary" data-action="start-review" data-mode="match" type="button">Nối ${focus === "connector" ? "phrasal verbs với từ nối" : "từ với định nghĩa"}</button>
        <button class="button button-primary" data-action="start-review" data-mode="type" type="button">${focus === "connector" ? "Xem phrasal verb, nhập từ nối" : "Xem định nghĩa, nhập từ"}</button>
        <button class="button button-primary" data-action="start-review" data-mode="choice" type="button" ${choiceDisabled}>${focus === "connector" ? "Trắc nghiệm 4 từ nối" : "Trắc nghiệm 4 lựa chọn"}</button>
      </div>
      ${pool.length < 2 ? '<p class="hint">Phạm vi này cần ít nhất 2 mục để bắt đầu ôn.</p>' : ''}
      ${labels.size < 4 ? `<p class="hint">${focus === "connector" ? "Trắc nghiệm từ nối cần ít nhất 4 connector khác nhau trong kho phrasal verbs." : "Trắc nghiệm cần ít nhất 4 đáp án khác nhau trong phạm vi đã chọn."}</p>` : ''}
      <button class="button button-quiet" data-action="home" type="button">Quay lại trang chính</button>
    </section>`;
}

// Tạo thẻ tiến độ dùng chung cho cả ba dạng ôn.
function progressHtml(review, remaining) {
  const completed = review.total - remaining;
  const percent = review.total ? Math.round((completed / review.total) * 100) : 0;
  return `<div class="progress-line"><span>${completed}/${review.total}</span><div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div><span>${remaining} còn lại</span></div>`;
}

// Hiện hai cột; connector phía bên phải có thể được dùng cho nhiều phrasal verbs.
function renderMatchQuestion() {
  const review = state.review;
  const left = [...review.leftItems].sort(() => Math.random() - 0.5);
  const right = [...review.rightItems].sort(() => Math.random() - 0.5);
  const answerLabel = (row) => review.focus === "connector" ? row.connector : row.definition;
  const leftHtml = left.map((row) => `
    <button class="button match-option ${review.selectedLeftId === row.id ? "selected" : ""}"
      data-action="select-left" data-id="${escapeHtml(row.id)}" type="button">${review.focus === "connector" ? phrasalPromptHtml(row) : escapeHtml(row.answer)}</button>`).join("");
  const rightHtml = right.map((row) => `
    <button class="button match-option ${review.selectedRightId === row.id ? "selected" : ""}"
      data-action="select-right" data-id="${escapeHtml(row.id)}" type="button">${escapeHtml(answerLabel(row))}</button>`).join("");
  const leftTitle = review.focus === "connector" ? "PHRASAL VERB" : "TỪ / PHRASAL VERB";
  const rightTitle = review.focus === "connector" ? "TỪ NỐI" : "ĐỊNH NGHĨA";
  const heading = review.focus === "connector" ? "Nối phrasal verb với từ nối" : "Nối từ với định nghĩa";
  const subtitle = review.focus === "connector"
    ? "Mỗi từ nối có thể ghép với nhiều phrasal verbs."
    : "Nếu trùng từ/cụm, có thể nối với bất kỳ định nghĩa nào của từ/cụm đó.";
  return `
    ${pageHeading("ÔN NỐI CẶP", heading, subtitle)}
    ${progressHtml(review, review.leftItems.length)}
    ${review.note ? `<div class="notice">${escapeHtml(review.note)}</div>` : ""}
    <div class="match-grid"><section class="match-column"><div class="column-title">${leftTitle}</div>${leftHtml}</section>
      <section class="match-column"><div class="column-title">${rightTitle}</div>${rightHtml}</section></div>
    <button class="button button-quiet" data-action="home" type="button" style="margin-top:14px">Kết thúc lượt ôn</button>`;
}

// Dựng cụm connector đã che và thêm nghĩa nếu phần động từ bị lặp trong lượt này.
function phrasalPromptHtml(item) {
  const definition = item.promptDefinition
    ? "<small style='display:block;margin-top:5px'>Nghĩa: " + escapeHtml(item.promptDefinition) + "</small>"
    : "";
  return escapeHtml(item.prompt) + (definition ? "<br>" + definition : "");
}

// Thẻ câu hỏi thay tiêu đề tùy theo ôn định nghĩa hay ôn connector.
function reviewPromptCard(item, focus) {
  const isConnector = focus === "connector";
  return `<section class="card review-card"><div class="definition-label">${isConnector ? "PHRASAL VERB" : "ĐỊNH NGHĨA"}</div>
    <p class="definition-text">${isConnector ? phrasalPromptHtml(item) : escapeHtml(item.definition)}</p></section>`;
}

function renderTypeQuestion() {
  const review = state.review;
  const question = review.questions[0];
  const connectorMode = review.focus === "connector";
  return `
    ${pageHeading(connectorMode ? "ÔN TỪ NỐI" : "ÔN NHẬP TỪ", connectorMode ? "Phrasal verb này đi với từ nối nào?" : "Từ nào có nghĩa này?", connectorMode ? "Nhập một trong các từ nối đã lưu cho cụm." : "Nhập từ tiếng Anh hoặc phrasal verb rồi kiểm tra.")}
    ${progressHtml(review, review.questions.length)}
    ${review.note ? `<div class="notice">${escapeHtml(review.note)}</div>` : ""}
    ${reviewPromptCard(question, review.focus)}
    <form class="card" id="answer-form" autocomplete="off" style="margin-top:14px"><div class="field" style="margin-top:0">
      <label for="typed-answer">${connectorMode ? "Từ nối" : "Từ tiếng Anh / phrasal verb"}</label>
      <input class="text-input" id="typed-answer" name="answer" type="text" required autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="Nhập đáp án"></div>
      <button class="button button-primary" type="submit">Kiểm tra đáp án</button></form>
    <button class="button button-quiet" data-action="home" type="button" style="margin-top:12px">Kết thúc lượt ôn</button>`;
}

function renderChoiceQuestion() {
  const review = state.review;
  const question = review.questions[0];
  const connectorMode = review.focus === "connector";
  const choices = question.options.map((option, index) => `
    <button class="button choice-option" data-action="choose-option" data-option="${escapeHtml(option)}" type="button">
      <span class="stats-pill">${String.fromCharCode(65 + index)}</span>${escapeHtml(option)}</button>`).join("");
  return `
    ${pageHeading(connectorMode ? "TRẮC NGHIỆM TỪ NỐI" : "TRẮC NGHIỆM", connectorMode ? "Chọn từ nối phù hợp" : "Chọn từ đúng", connectorMode ? "Bốn connector trong câu hỏi luôn khác nhau." : "Bốn đáp án trong câu này luôn khác nhau.")}
    ${progressHtml(review, review.questions.length)}
    ${review.note ? `<div class="notice">${escapeHtml(review.note)}</div>` : ""}
    ${reviewPromptCard(question, review.focus)}
    <div class="choice-grid">${choices}</div>
    <button class="button button-quiet" data-action="home" type="button" style="margin-top:12px">Kết thúc lượt ôn</button>`;
}

// Tổng kết số đúng và lượng dữ liệu còn lại trong cả hai kho.
function renderResult() {
  const review = state.review;
  const uniqueRemaining = getUniqueHeadwords().size;
  const totalEntries = state.data.words.length + state.data.phrasal_verbs.length;
  appRoot.innerHTML = `<div class="card"><div class="result-mark" aria-hidden="true">✓</div>
    <div class="eyebrow">ĐÃ XONG LƯỢT ÔN</div><h1>Tiến bộ từng ngày.</h1>
    <div class="result-number">${review.correct} / ${review.total} câu đúng</div>
    <div class="result-details"><div>Số câu sai hoặc bỏ qua: <strong>${review.wrong}</strong></div>
      <div>Từ vựng còn lại: <strong>${uniqueRemaining} từ · ${state.data.words.length} định nghĩa</strong></div>
      <div>Phrasal verbs còn lại: <strong>${state.data.phrasal_verbs.length}</strong></div>
      <div>Tổng mục còn trong kho: <strong>${totalEntries}</strong></div></div>
    <div class="button-stack" style="margin-top:22px">
      <button class="button button-primary" data-action="review-setup" type="button" ${totalEntries < 2 ? "disabled" : ""}>Ôn lượt mới</button>
      <button class="button" data-action="home" type="button">Trang chính</button></div></div>`;
}

// Chọn đúng màn hình, rồi cập nhật nội dung sau mỗi câu trả lời.
function render() {
  if (state.screen === "add") renderAddScreen();
  else if (state.screen === "add-phrasal") renderAddPhrasalScreen();
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

// Cộng đúng bộ đếm của mục nghĩa/cụm đang được hỏi và xóa đúng kho khi tới ngưỡng.
function recordCorrect(item) {
  const record = item.record;
  record.correct_count = Math.max(0, Number.parseInt(record.correct_count, 10) || 0) + 1;
  const target = positiveInteger(record.delete_after, 3);
  record.delete_after = target;
  const deleted = record.correct_count >= target;
  if (deleted) {
    const collection = item.kind === "word" ? state.data.words : state.data.phrasal_verbs;
    const index = collection.indexOf(record);
    if (index >= 0) collection.splice(index, 1);
  }
  return { count: record.correct_count, target, deleted };
}

// Xóa một hàng đợi theo ID để phân biệt các bản ghi cùng nội dung.
function removeById(items, id) {
  const index = items.findIndex((item) => item.id === id);
  if (index >= 0) items.splice(index, 1);
}

// Tạo danh sách bốn đáp án khác nhau từ đầu từ hoặc từ nối phù hợp.
function createChoiceOptions(item, allLabels, focus) {
  const accepted = focus === "connector" ? item.connectors : [item.answer];
  const correct = randomSample(accepted, 1)[0];
  const distractors = randomSample([...allLabels.entries()]
    // Một connector khác cũng được giữ nếu là đáp án hợp lệ của cùng cụm.
    .filter(([key]) => key !== wordKey(correct))
    .map(([, label]) => label), 3);
  return randomSample([correct, ...distractors], 4);
}

// Bắt đầu lượt ôn với phạm vi, nội dung và số mục người dùng chọn.
function beginReview(mode, requestedAmount, scope, focus) {
  const pool = makeReviewPool(scope, focus);
  if (pool.length < 2) {
    window.alert("Phạm vi và nội dung đã chọn cần ít nhất 2 mục để bắt đầu ôn.");
    state.screen = "setup";
    render();
    return;
  }
  const availableLabels = getChoiceLabels(pool, focus);
  if (mode === "choice" && availableLabels.size < 4) {
    window.alert(`Trắc nghiệm cần ít nhất 4 ${focus === "connector" ? "từ nối" : "đáp án"} khác nhau.`);
    state.screen = "setup";
    render();
    return;
  }
  // Khi ôn định nghĩa, chỉ lấy một bản ghi cho mỗi nghĩa khác nhau trong lượt.
  const questionPool = focus === "definition" ? uniqueDefinitionPool(pool) : pool;
  const amount = Math.min(requestedAmount, questionPool.length);
  const rows = randomSample(questionPool, amount).map((item, index) => ({
    ...item,
    id: `review-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
  }));
  if (focus === "connector") {
    // Gom theo động từ đầu tiên để nhận ra look up/look for dù connector khác nhau.
    const repeatedVerbs = new Map();
    for (const item of rows) {
      const key = wordKey(item.answer).split(/\s+/)[0];
      if (!repeatedVerbs.has(key)) repeatedVerbs.set(key, []);
      repeatedVerbs.get(key).push(item);
    }
    // Kèm nghĩa của từng mục khi hai phrasal verbs trong lượt trông giống nhau.
    for (const matchingItems of repeatedVerbs.values()) {
      if (matchingItems.length > 1) {
        for (const item of matchingItems) item.promptDefinition = item.definition;
      }
    }
  }
  state.data.settings.review_count = requestedAmount;
  state.data.settings.review_scope = scope;
  state.data.settings.review_focus = focus;
  saveData();
  state.review = {
    mode, scope, focus,
    leftItems: mode === "match" ? [...rows] : [],
    rightItems: [],
    questions: [],
    selectedLeftId: null,
    selectedRightId: null,
    total: rows.length,
    correct: 0,
    wrong: 0,
    note: "",
  };

  if (mode === "match" && focus === "connector") {
    // Tạo một thẻ bên phải cho từng cụm, kể cả khi nhiều cụm có cùng connector.
    state.review.rightItems = makeConnectorItems(rows);
    state.review.note = "Mỗi cụm có một thẻ connector ở cột bên kia; connector trùng nhau hiện thành các thẻ riêng.";
  } else if (mode === "match") {
    // Các định nghĩa bên phải giữ bản ghi riêng để cộng đúng bộ đếm của định nghĩa được ghép.
    state.review.rightItems = [...rows];
    state.review.note = "Nối từ hoặc phrasal verb với định nghĩa phù hợp.";
  } else if (mode === "choice") {
    state.review.questions = rows.map((item) => ({ ...item, options: createChoiceOptions(item, availableLabels, focus) }));
    state.review.note = "Chọn một trong bốn đáp án khác nhau.";
  } else {
    state.review.questions = rows;
    state.review.note = focus === "connector"
      ? "Đọc phrasal verb rồi nhập một từ nối đi kèm."
      : "Đọc định nghĩa rồi nhập từ hoặc phrasal verb.";
  }

  state.screen = "review";
  render();
  appRoot.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Hoàn tất câu hỏi dạng nhập/trắc nghiệm rồi chuyển sang mục tiếp theo.
function finishQuestion() {
  state.review.questions.shift();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// So sánh hai lựa chọn; connector trùng có thẻ riêng, còn sai thì bỏ qua không cộng tiến độ.
function checkMatchingPair() {
  const review = state.review;
  const left = review.leftItems.find((row) => row.id === review.selectedLeftId);
  const right = review.rightItems.find((row) => row.id === review.selectedRightId);
  if (!left || !right) return;

  if (review.focus === "connector") {
    const connector = right.connector;
    const accepted = left.connectors.some((value) => wordKey(value) === wordKey(connector));
    if (accepted) {
      const progress = recordCorrect(left);
      review.correct += 1;
      review.note = `Đúng: ${left.answer} — ${connector} (${progress.count}/${progress.target}).`;
      if (progress.deleted) review.note += " Mục này đã đạt ngưỡng xóa.";
      removeById(review.leftItems, left.id);
      saveData();
    } else {
      review.wrong += 1;
      window.alert(`${left.answer} đi với: ${left.connectors.join(", ")}\n\nCâu này được bỏ qua, không cộng lần đúng.`);
      review.note = "Phrasal verb đã được bỏ qua; bộ đếm đúng không thay đổi.";
      removeById(review.leftItems, left.id);
    }
    // Cân bằng lại hai cột để số thẻ connector luôn bằng số phrasal verbs còn lại.
    review.rightItems = makeConnectorItems(review.leftItems);
  } else {
    // Chỉ ghép cùng loại kho và cùng đầu từ; nghĩa nào cũng được nếu đầu từ bị trùng.
    const accepted = left.kind === right.kind && wordKey(left.answer) === wordKey(right.answer);
    if (accepted) {
      const progress = recordCorrect(right);
      review.correct += 1;
      review.note = `Đúng: ${left.answer} — ${right.definition} (${progress.count}/${progress.target}).`;
      if (progress.deleted) review.note += " Mục này đã đạt ngưỡng xóa.";
      removeById(review.leftItems, left.id);
      removeById(review.rightItems, right.id);
      saveData();
    } else {
      review.wrong += 1;
      const solution = review.rightItems.find((item) => item.kind === left.kind && wordKey(item.answer) === wordKey(left.answer));
      if (solution) {
        window.alert(`Cặp nối đúng:\n${left.answer} — ${solution.definition}\n\nCâu này được bỏ qua, không cộng lần đúng.`);
        removeById(review.rightItems, solution.id);
      } else {
        window.alert(`Đáp án đúng là: ${left.answer}\n\nCâu này được bỏ qua, không cộng lần đúng.`);
        removeById(review.rightItems, right.id);
      }
      review.note = "Câu sai đã được bỏ qua; bộ đếm đúng không thay đổi.";
      removeById(review.leftItems, left.id);
    }
  }
  review.selectedLeftId = null;
  review.selectedRightId = null;
  render();
}

// Chấm câu nhập; câu sai hiện từ/cụm hoặc các connector đúng rồi chuyển tiếp.
function submitTypedAnswer(form) {
  const question = state.review.questions[0];
  const guess = String(new FormData(form).get("answer") ?? "").trim();
  if (!guess) return;
  const acceptedAnswers = state.review.focus === "connector" ? question.connectors : [question.answer];
  const accepted = acceptedAnswers.some((answer) => wordKey(answer) === wordKey(guess));
  if (accepted) {
    const progress = recordCorrect(question);
    state.review.correct += 1;
    state.review.note = `Đúng: ${question.answer} (${progress.count}/${progress.target}).`;
    if (progress.deleted) state.review.note += " Mục này đã đạt ngưỡng xóa.";
    saveData();
  } else {
    state.review.wrong += 1;
    const answerText = acceptedAnswers.join(", ");
    window.alert(`Đáp án đúng là: ${answerText}\n\nCâu này được bỏ qua, không cộng lần đúng.`);
    state.review.note = "Câu sai đã được bỏ qua; bộ đếm đúng không thay đổi.";
  }
  finishQuestion();
}

// Chấm trắc nghiệm từ/cụm hoặc connector; đáp án sai không tăng bộ đếm.
function submitChoiceAnswer(answer) {
  const question = state.review.questions[0];
  const acceptedAnswers = state.review.focus === "connector" ? question.connectors : [question.answer];
  const accepted = acceptedAnswers.some((value) => wordKey(value) === wordKey(answer));
  if (accepted) {
    const progress = recordCorrect(question);
    state.review.correct += 1;
    state.review.note = `Đúng: ${question.answer} (${progress.count}/${progress.target}).`;
    if (progress.deleted) state.review.note += " Mục này đã đạt ngưỡng xóa.";
    saveData();
  } else {
    state.review.wrong += 1;
    window.alert(`Đáp án đúng là: ${acceptedAnswers.join(", ")}\n\nCâu này được bỏ qua, không cộng lần đúng.`);
    state.review.note = "Câu sai đã được bỏ qua; bộ đếm đúng không thay đổi.";
  }
  finishQuestion();
}

// Xuất hai kho và thiết lập dưới dạng JSON tương thích với bản Python.
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
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  state.notice = "Đã xuất file vocabulary.json để sao lưu hoặc chuyển giữa máy tính và điện thoại.";
  state.noticeType = "success";
  renderHome();
}

// Sự kiện bấm dùng chung để xử lý các nút trên mọi màn hình.
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
  } else if (action === "add-phrasal-screen") {
    state.screen = "add-phrasal";
    state.notice = "";
    render();
  } else if (action === "review-setup") {
    if (state.data.words.length + state.data.phrasal_verbs.length < 2) {
      window.alert("Cần ít nhất 2 mục đã lưu trong hai kho để bắt đầu ôn.");
      return;
    }
    state.setupScope = state.data.settings.review_scope;
    state.setupFocus = state.data.settings.review_focus;
    state.screen = "setup";
    state.notice = "";
    render();
  } else if (action === "start-review") {
    const requested = positiveInteger(document.getElementById("review-count").value, 0);
    if (!requested || requested > 1000) {
      window.alert("Số mục phải là số nguyên từ 1 đến 1000.");
      return;
    }
    const scope = document.getElementById("review-scope").value;
    const focus = scope === "words" ? "definition" : document.getElementById("review-focus").value;
    beginReview(button.dataset.mode, requested, scope, focus);
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
  } else if (action === "install") {
    installApp();
  } else if (action === "export") {
    exportData();
  } else if (action === "import") {
    importInput.click();
  }
});

// Thay giao diện thiết lập ngay khi người dùng đổi phạm vi hoặc dạng nội dung.
appRoot.addEventListener("change", (event) => {
  if (event.target.id === "review-scope") {
    state.setupScope = event.target.value;
    if (state.setupScope === "words") state.setupFocus = "definition";
    renderReviewSetup();
  } else if (event.target.id === "review-focus") {
    state.setupFocus = event.target.value;
    renderReviewSetup();
  }
});

// Lưu từ vựng hoặc phrasal verb mới với bộ đếm khởi tạo riêng.
appRoot.addEventListener("submit", (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  if (event.target.id === "add-form") {
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
  } else if (event.target.id === "add-phrasal-form") {
    const phrasal_verb = String(formData.get("phrasal_verb") ?? "").trim();
    const definition = String(formData.get("definition") ?? "").trim();
    const connectors = normalizeConnectors(formData.get("connectors"));
    const target = positiveInteger(formData.get("delete_after"), 0);
    if (!phrasal_verb || !definition || !connectors.length || !target || target > 10000) {
      window.alert("Nhập phrasal verb, định nghĩa, ít nhất một từ nối và số lần đúng hợp lệ từ 1 đến 10000.");
      return;
    }
    state.data.phrasal_verbs.push({ phrasal_verb, definition, connectors, correct_count: 0, delete_after: target });
    if (!saveData()) return;
    state.notice = `Đã lưu phrasal verb “${phrasal_verb}”.`;
    state.noticeType = "success";
    state.screen = "home";
    render();
  } else if (event.target.id === "answer-form") {
    submitTypedAnswer(event.target);
  }
});

// Gợi ý khi đang nhập một từ đã có trong kho.
appRoot.addEventListener("input", (event) => {
  if (event.target.id !== "new-word") return;
  const key = wordKey(event.target.value);
  const count = state.data.words.filter((item) => wordKey(item.word) === key).length;
  const hint = document.getElementById("duplicate-hint");
  if (hint) hint.textContent = count
    ? `Kho đã có ${count} định nghĩa của từ này. Mục mới sẽ có bộ đếm độc lập.`
    : "Bạn có thể lưu cùng một từ với nhiều định nghĩa.";
});

// Nhập JSON từ bản desktop hoặc điện thoại khác; dữ liệu nhập sẽ thay hai kho hiện tại.
importInput.addEventListener("change", async () => {
  const file = importInput.files?.[0];
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    if (!raw || (!Array.isArray(raw.words) && !Array.isArray(raw.phrasal_verbs))) {
      throw new Error("File cần có danh sách words hoặc phrasal_verbs.");
    }
    const imported = normalizeData(raw);
    const total = imported.words.length + imported.phrasal_verbs.length;
    if (!window.confirm(`Thay kho hiện tại bằng ${imported.words.length} mục từ vựng và ${imported.phrasal_verbs.length} phrasal verbs từ file ${file.name}?`)) {
      importInput.value = "";
      return;
    }
    state.data = imported;
    if (!saveData()) return;
    state.screen = "home";
    state.notice = `Đã nhập ${total} mục: ${imported.words.length} từ vựng và ${imported.phrasal_verbs.length} phrasal verbs.`;
    state.noticeType = "success";
    render();
  } catch (error) {
    window.alert(`Không đọc được file JSON: ${error.message}`);
  } finally {
    importInput.value = "";
  }
});

// Nút nhà luôn đưa người dùng về trang chính.
document.getElementById("home-button").addEventListener("click", () => {
  state.screen = "home";
  state.review = null;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Chrome gửi sự kiện này khi ứng dụng đã đủ điều kiện để cài trực tiếp.
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (state.screen === "home") renderHome();
});

// Mở hộp thoại cài đặt bằng tương tác chủ động của người dùng.
async function installApp() {
  if (!deferredInstallPrompt) return;
  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await promptEvent.prompt();
  const choice = await promptEvent.userChoice;
  state.notice = choice?.outcome === "accepted"
    ? "Đã bắt đầu cài ứng dụng lên màn hình chính."
    : "Bạn có thể cài ứng dụng sau từ menu Chrome.";
  state.noticeType = choice?.outcome === "accepted" ? "success" : "";
  if (state.screen === "home") renderHome();
}

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  state.notice = "Ứng dụng đã được thêm vào điện thoại.";
  state.noticeType = "success";
  if (state.screen === "home") renderHome();
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
