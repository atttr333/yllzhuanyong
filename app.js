(function startApp() {
  "use strict";

  const Core = window.WordForgeCore;
  const sampleWords = [
    ["serendipity", "意外发现美好事物的能力"],
    ["wander", "漫步；闲逛；徘徊"],
    ["tranquil", "平静的；安宁的"],
    ["resilient", "有韧性的；能迅速恢复的"],
    ["glimpse", "一瞥；短暂地看见"],
  ];

  const elements = {
    views: [...document.querySelectorAll(".view")],
    navLinks: [...document.querySelectorAll(".nav-link")],
    routeButtons: [...document.querySelectorAll("[data-route]")],
    headerAdd: document.querySelector("#header-add-button"),
    libraryAdd: document.querySelector("#library-add-button"),
    emptyAdd: document.querySelector("#empty-add-button"),
    wordDialog: document.querySelector("#word-dialog"),
    wordForm: document.querySelector("#word-form"),
    dialogTitle: document.querySelector("#dialog-title"),
    dialogClose: document.querySelector("#dialog-close"),
    wordId: document.querySelector("#word-id"),
    wordInput: document.querySelector("#word-input"),
    meaningInput: document.querySelector("#meaning-input"),
    formError: document.querySelector("#form-error"),
    importEntrySection: document.querySelector("#import-entry-section"),
    openImportButton: document.querySelector("#open-import-button"),
    importDialog: document.querySelector("#import-dialog"),
    importDialogClose: document.querySelector("#import-dialog-close"),
    importUploadView: document.querySelector("#import-upload-view"),
    importLoading: document.querySelector("#import-loading"),
    importPreviewView: document.querySelector("#import-preview-view"),
    importFileInput: document.querySelector("#import-file-input"),
    fileDropZone: document.querySelector("#file-drop-zone"),
    importError: document.querySelector("#import-error"),
    importFileType: document.querySelector("#import-file-type"),
    importFileName: document.querySelector("#import-file-name"),
    importFileDetail: document.querySelector("#import-file-detail"),
    importValidCount: document.querySelector("#import-valid-count"),
    importPreviewList: document.querySelector("#import-preview-list"),
    chooseAnotherFile: document.querySelector("#choose-another-file"),
    confirmImportButton: document.querySelector("#confirm-import-button"),
    confirmDialog: document.querySelector("#confirm-dialog"),
    confirmTitle: document.querySelector("#confirm-title"),
    confirmMessage: document.querySelector("#confirm-message"),
    confirmDelete: document.querySelector("#confirm-delete"),
    wordTableBody: document.querySelector("#word-table-body"),
    libraryEmpty: document.querySelector("#library-empty"),
    searchInput: document.querySelector("#search-input"),
    filterChips: [...document.querySelectorAll(".filter-chip")],
    recentPanel: document.querySelector(".recent-panel"),
    recentContent: document.querySelector("#recent-content"),
    recentList: document.querySelector("#recent-list"),
    recentPreviewCover: document.querySelector("#recent-preview-cover"),
    toggleRecentManage: document.querySelector("#toggle-recent-manage"),
    recentBulkBar: document.querySelector("#recent-bulk-bar"),
    recentSelectedCount: document.querySelector("#recent-selected-count"),
    deleteSelectedRecent: document.querySelector("#delete-selected-recent"),
    startButton: document.querySelector("#start-button"),
    reviewButton: document.querySelector("#review-button"),
    exitStudyButton: document.querySelector("#exit-study-button"),
    flashcard: document.querySelector("#flashcard"),
    studyMeaning: document.querySelector("#study-meaning"),
    studyIndex: document.querySelector("#study-index"),
    studyTotal: document.querySelector("#study-total"),
    studyMode: document.querySelector("#study-mode"),
    studyProgress: document.querySelector("#study-progress"),
    studyAnswerForm: document.querySelector("#study-answer-form"),
    studyAnswerInput: document.querySelector("#study-answer-input"),
    checkAnswerButton: document.querySelector("#check-answer-button"),
    answerCheckStatus: document.querySelector("#answer-check-status"),
    answerFeedbackDialog: document.querySelector("#answer-feedback-dialog"),
    answerFeedbackMark: document.querySelector("#answer-feedback-mark"),
    answerFeedbackLabel: document.querySelector("#answer-feedback-label"),
    answerFeedbackTitle: document.querySelector("#answer-feedback-title"),
    answerFeedbackMessage: document.querySelector("#answer-feedback-message"),
    answerTarget: document.querySelector("#answer-target"),
    answerTargetWord: document.querySelector("#answer-target-word"),
    nextQuestionButton: document.querySelector("#next-question-button"),
    resultTotal: document.querySelector("#result-total"),
    resultKnown: document.querySelector("#result-known"),
    resultUnknown: document.querySelector("#result-unknown"),
    studyAgainButton: document.querySelector("#study-again-button"),
    toast: document.querySelector("#toast"),
  };

  let state = loadState();
  let activeFilter = "all";
  let pendingDeleteIds = [];
  let studySession = null;
  let dashboardRound = null;
  let answerRequestToken = 0;
  let answerCheckPending = false;
  let recentManageMode = false;
  let recentRevealed = false;
  const selectedRecentIds = new Set();
  const synonymCache = new Map();
  let toastTimer = null;
  let importRows = [];

  function loadState() {
    try {
      const stored = localStorage.getItem(Core.STORAGE_KEY);
      if (stored) return Core.normalizeState(JSON.parse(stored));
    } catch (error) {
      console.warn("无法读取本地词库：", error);
    }

    let initial = Core.createEmptyState();
    sampleWords.forEach(([word, meaning], index) => {
      const date = new Date(Date.now() - index * 60000);
      initial = Core.addWord(initial, word, meaning, date);
    });
    return initial;
  }

  function saveState() {
    try {
      localStorage.setItem(Core.STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      showToast("保存失败，请检查浏览器存储权限");
      console.error("无法保存本地词库：", error);
    }
  }

  function navigate(route) {
    const view = document.querySelector(`#${route}-view`);
    if (!view) return;
    elements.views.forEach((item) => item.classList.toggle("is-active", item === view));
    elements.navLinks.forEach((item) => item.classList.toggle("is-active", item.dataset.route === route));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (route === "home") renderDashboard();
    if (route === "library") renderLibrary();
  }

  function renderDashboard() {
    const stats = Core.statsOf(state);
    setText("#stat-total", stats.total);
    setText("#stat-mastered", stats.mastered);
    setText("#stat-review", stats.review);
    const progressValue = document.querySelector("#today-progress-value");
    const totalWrap = document.querySelector("#today-total-wrap");
    let percent = 0;
    if (!dashboardRound) {
      setText("#today-studied", "待定");
      setText("#today-known", "—");
      setText("#today-unknown", "—");
      totalWrap.hidden = true;
      progressValue.classList.add("is-pending");
    } else {
      setText("#today-studied", dashboardRound.answered);
      setText("#total-words", dashboardRound.total);
      setText("#today-known", dashboardRound.known);
      setText("#today-unknown", dashboardRound.unknown);
      totalWrap.hidden = false;
      progressValue.classList.remove("is-pending");
      percent = dashboardRound.total ? Math.min(100, (dashboardRound.answered / dashboardRound.total) * 100) : 0;
    }
    document.querySelector("#today-progress").style.width = `${percent}%`;
    const formatter = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" });
    document.querySelector("#today-label").textContent = formatter.format(new Date()).toUpperCase();
    renderRecent();
  }

  function renderRecent() {
    elements.recentList.replaceChildren();
    elements.recentPanel.classList.toggle("is-managing", recentManageMode);
    elements.recentContent.classList.toggle("is-revealed", recentRevealed || recentManageMode);
    elements.toggleRecentManage.textContent = recentManageMode ? "完成" : "管理";
    elements.recentBulkBar.hidden = !recentManageMode;
    const recent = [...state.words]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 3);
    if (!recent.length) {
      selectedRecentIds.clear();
      const empty = document.createElement("p");
      empty.className = "recent-empty";
      empty.textContent = "还没有添加单词";
      elements.recentList.append(empty);
      updateRecentSelectionBar();
      return;
    }
    recent.forEach((word) => {
      const item = document.createElement("div");
      item.className = "recent-item";
      const checkbox = document.createElement("input");
      const title = document.createElement("strong");
      const meaning = document.createElement("p");
      const status = document.createElement("span");
      const deleteButton = document.createElement("button");
      checkbox.className = "recent-select";
      checkbox.type = "checkbox";
      checkbox.dataset.id = word.id;
      checkbox.checked = selectedRecentIds.has(word.id);
      checkbox.setAttribute("aria-label", `选择 ${word.word}`);
      title.textContent = word.word;
      meaning.textContent = word.meaning;
      status.className = "recent-status";
      status.textContent = statusLabel(Core.statusOf(word));
      deleteButton.className = "recent-delete";
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete-recent";
      deleteButton.dataset.id = word.id;
      deleteButton.setAttribute("aria-label", `删除 ${word.word}`);
      deleteButton.textContent = "×";
      item.append(checkbox, title, meaning, status, deleteButton);
      elements.recentList.append(item);
    });
    updateRecentSelectionBar();
  }

  function updateRecentSelectionBar() {
    const count = selectedRecentIds.size;
    elements.recentSelectedCount.textContent = `已选择 ${count} 个`;
    elements.deleteSelectedRecent.disabled = count === 0;
  }

  function toggleRecentManagement() {
    recentManageMode = !recentManageMode;
    recentRevealed = recentManageMode;
    if (!recentManageMode) selectedRecentIds.clear();
    renderRecent();
  }

  function renderLibrary() {
    const words = Core.filterWords(state.words, elements.searchInput.value, activeFilter);
    elements.wordTableBody.replaceChildren();
    elements.libraryEmpty.hidden = words.length > 0;
    document.querySelector(".word-table").hidden = words.length === 0;
    words.forEach((word) => elements.wordTableBody.append(createWordRow(word)));
  }

  function createWordRow(word) {
    const row = document.createElement("tr");
    const status = Core.statusOf(word);
    const wordCell = document.createElement("td");
    const meaningCell = document.createElement("td");
    const statusCell = document.createElement("td");
    const attemptsCell = document.createElement("td");
    const actionsCell = document.createElement("td");
    const statusBadge = document.createElement("span");
    const actions = document.createElement("div");
    const editButton = document.createElement("button");
    const deleteButton = document.createElement("button");

    wordCell.textContent = word.word;
    meaningCell.textContent = word.meaning;
    statusBadge.className = `status-dot ${status}`;
    statusBadge.textContent = statusLabel(status);
    statusCell.append(statusBadge);
    attemptsCell.textContent = `${word.attempts} 次`;
    actions.className = "row-actions";
    editButton.className = "mini-button";
    editButton.type = "button";
    editButton.dataset.action = "edit";
    editButton.dataset.id = word.id;
    editButton.setAttribute("aria-label", `编辑 ${word.word}`);
    editButton.textContent = "✎";
    deleteButton.className = "mini-button";
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.id = word.id;
    deleteButton.setAttribute("aria-label", `删除 ${word.word}`);
    deleteButton.textContent = "×";
    actions.append(editButton, deleteButton);
    actionsCell.append(actions);
    row.append(wordCell, meaningCell, statusCell, attemptsCell, actionsCell);
    return row;
  }

  function statusLabel(status) {
    return { new: "未学习", mastered: "已掌握", review: "待复习" }[status];
  }

  function openWordDialog(wordId = null) {
    elements.wordForm.reset();
    elements.formError.textContent = "";
    elements.wordId.value = wordId || "";
    elements.dialogTitle.textContent = wordId ? "编辑单词" : "添加单词";
    elements.importEntrySection.hidden = Boolean(wordId);
    if (wordId) {
      const word = state.words.find((item) => item.id === wordId);
      if (!word) return;
      elements.wordInput.value = word.word;
      elements.meaningInput.value = word.meaning;
    }
    elements.wordDialog.showModal();
    setTimeout(() => elements.wordInput.focus(), 0);
  }

  function resetImportDialog() {
    importRows = [];
    elements.importFileInput.value = "";
    elements.importError.textContent = "";
    elements.importUploadView.hidden = false;
    elements.importLoading.hidden = true;
    elements.importPreviewView.hidden = true;
    elements.importPreviewList.replaceChildren();
  }

  function openImportDialog() {
    elements.wordDialog.close();
    resetImportDialog();
    elements.importDialog.showModal();
  }

  async function handleImportFile(file) {
    if (!file) return;
    elements.importError.textContent = "";
    elements.importUploadView.hidden = true;
    elements.importPreviewView.hidden = true;
    elements.importLoading.hidden = false;
    try {
      const result = await window.WordImporter.parseFile(file);
      importRows = result.entries.map((entry) => ({ ...entry, selected: true }));
      if (!importRows.length) {
        throw new Error("没有识别到结构明确的记录，请使用双列表格或明确分隔符后重试");
      }
      elements.importFileType.textContent = result.format;
      elements.importFileName.textContent = result.fileName;
      elements.importFileDetail.textContent = `识别到 ${importRows.length} 条记录`;
      renderImportRows();
      elements.importLoading.hidden = true;
      elements.importPreviewView.hidden = false;
    } catch (error) {
      console.error("文件解析失败：", error);
      elements.importLoading.hidden = true;
      elements.importUploadView.hidden = false;
      elements.importError.textContent = error.message || "文件读取失败";
    }
  }

  function importRowStatus(row, index, seenWords) {
    const word = String(row.word || "").trim();
    const meaning = String(row.meaning || "").trim();
    if (!row.selected) return { valid: false, label: "未勾选" };
    if (!word || !meaning) return { valid: false, label: "内容不完整" };
    if (word.length > 80) return { valid: false, label: "单词超过 80 字" };
    if (meaning.length > 300) return { valid: false, label: "释义超过 300 字" };
    const normalizedWord = word.toLocaleLowerCase();
    if (state.words.some((item) => item.word.toLocaleLowerCase() === normalizedWord)) {
      return { valid: false, label: "词库中已存在" };
    }
    if (seenWords.has(normalizedWord)) return { valid: false, label: "文件内重复" };
    seenWords.add(normalizedWord);
    return { valid: true, label: "可导入", index };
  }

  function importRowStatuses() {
    const seenWords = new Set();
    return importRows.map((row, index) => importRowStatus(row, index, seenWords));
  }

  function renderImportRows() {
    elements.importPreviewList.replaceChildren();
    importRows.forEach((row, index) => {
      const wrapper = document.createElement("div");
      const checkbox = document.createElement("input");
      const wordInput = document.createElement("input");
      const meaningInput = document.createElement("input");
      const status = document.createElement("span");
      const remove = document.createElement("button");

      wrapper.className = "import-preview-row";
      wrapper.dataset.index = String(index);
      checkbox.type = "checkbox";
      checkbox.checked = row.selected;
      checkbox.dataset.field = "selected";
      checkbox.setAttribute("aria-label", `选择第 ${index + 1} 条记录`);
      wordInput.type = "text";
      wordInput.value = row.word;
      wordInput.maxLength = 80;
      wordInput.placeholder = "单词";
      wordInput.dataset.field = "word";
      wordInput.setAttribute("aria-label", `第 ${index + 1} 条单词`);
      meaningInput.type = "text";
      meaningInput.value = row.meaning;
      meaningInput.maxLength = 300;
      meaningInput.placeholder = "释义";
      meaningInput.dataset.field = "meaning";
      meaningInput.setAttribute("aria-label", `第 ${index + 1} 条释义`);
      status.className = "import-row-status";
      remove.className = "import-row-remove";
      remove.type = "button";
      remove.dataset.action = "remove-import-row";
      remove.setAttribute("aria-label", `移除第 ${index + 1} 条预览记录`);
      remove.textContent = "×";
      wrapper.append(checkbox, wordInput, meaningInput, status, remove);
      elements.importPreviewList.append(wrapper);
    });
    refreshImportStatuses();
  }

  function refreshImportStatuses() {
    const statuses = importRowStatuses();
    statuses.forEach((status, index) => {
      const rowElement = elements.importPreviewList.querySelector(`[data-index="${index}"]`);
      if (!rowElement) return;
      rowElement.classList.toggle("is-invalid", !status.valid);
      rowElement.querySelector(".import-row-status").textContent = status.label;
    });
    const validCount = statuses.filter((status) => status.valid).length;
    elements.importValidCount.textContent = `${validCount} 条可导入`;
    elements.confirmImportButton.disabled = validCount === 0;
    elements.confirmImportButton.textContent = validCount ? `导入 ${validCount} 条到词库` : "导入到词库";
  }

  function confirmImport() {
    const statuses = importRowStatuses();
    let importedCount = 0;
    statuses.forEach((status, index) => {
      if (!status.valid) return;
      const row = importRows[index];
      state = Core.addWord(state, row.word, row.meaning);
      importedCount += 1;
    });
    if (!importedCount) return;
    saveState();
    elements.importDialog.close();
    elements.searchInput.value = "";
    activeFilter = "all";
    elements.filterChips.forEach((chip) => chip.classList.toggle("is-active", chip.dataset.filter === "all"));
    navigate("library");
    showToast(`已导入 ${importedCount} 个单词`);
  }

  function handleWordSubmit(event) {
    event.preventDefault();
    const id = elements.wordId.value;
    try {
      state = id
        ? Core.updateWord(state, id, elements.wordInput.value, elements.meaningInput.value)
        : Core.addWord(state, elements.wordInput.value, elements.meaningInput.value);
      saveState();
      elements.wordDialog.close();
      renderDashboard();
      renderLibrary();
      showToast(id ? "单词已更新" : "单词已加入词库");
    } catch (error) {
      elements.formError.textContent = error.message;
    }
  }

  function requestDelete(ids) {
    const normalizedIds = (Array.isArray(ids) ? ids : [ids])
      .filter((id) => state.words.some((word) => word.id === id));
    if (!normalizedIds.length) return;
    pendingDeleteIds = normalizedIds;
    elements.confirmDialog.returnValue = "";
    if (normalizedIds.length === 1) {
      const word = state.words.find((item) => item.id === normalizedIds[0]);
      elements.confirmTitle.textContent = "删除这个单词？";
      elements.confirmMessage.textContent = `“${word.word}”及其学习记录将被移除。`;
    } else {
      elements.confirmTitle.textContent = `删除选中的 ${normalizedIds.length} 个单词？`;
      elements.confirmMessage.textContent = "这些单词及其学习记录都会被移除，此操作不能在应用内撤销。";
    }
    elements.confirmDialog.showModal();
  }

  function startStudy(mode = "all") {
    const words = mode === "review"
      ? state.words.filter((word) => Core.statusOf(word) === "review")
      : state.words;
    if (!words.length) {
      showToast(mode === "review" ? "目前没有需要复习的单词" : "请先向词库添加单词");
      if (!state.words.length) navigate("library");
      return;
    }
    studySession = {
      mode,
      ids: words.map((word) => word.id),
      index: 0,
      known: 0,
      unknown: 0,
    };
    dashboardRound = {
      total: words.length,
      answered: 0,
      known: 0,
      unknown: 0,
    };
    elements.studyMode.textContent = mode === "review" ? "只复习生词" : "全部词汇";
    navigate("study");
    renderStudyCard();
  }

  function renderStudyCard() {
    if (!studySession) return;
    const id = studySession.ids[studySession.index];
    const word = state.words.find((item) => item.id === id);
    if (!word) {
      nextStudyCard();
      return;
    }
    elements.studyMeaning.textContent = word.meaning;
    elements.studyIndex.textContent = studySession.index + 1;
    elements.studyTotal.textContent = studySession.ids.length;
    elements.studyProgress.style.width = `${(studySession.index / studySession.ids.length) * 100}%`;
    document.querySelector(".card-corner").textContent = String(studySession.index + 1).padStart(2, "0");
    elements.studyAnswerInput.value = "";
    elements.studyAnswerInput.disabled = false;
    elements.checkAnswerButton.disabled = false;
    elements.checkAnswerButton.textContent = "检查答案";
    elements.answerCheckStatus.textContent = "按 Enter 提交答案";
    answerCheckPending = false;
    setTimeout(() => elements.studyAnswerInput.focus(), 0);
  }

  async function synonymsFor(targetWord) {
    const key = Core.normalizeAnswer(targetWord);
    if (synonymCache.has(key)) return synonymCache.get(key);
    const url = new URL("https://api.datamuse.com/words");
    url.searchParams.set("rel_syn", key);
    url.searchParams.set("max", "1000");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`同义词服务返回 ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error("同义词服务返回了无法识别的数据");
      const words = new Set(
        payload
          .filter((item) => item && typeof item.word === "string")
          .map((item) => Core.normalizeAnswer(item.word)),
      );
      synonymCache.set(key, words);
      return words;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function classifyAnswer(answer, targetWord) {
    const normalizedAnswer = Core.normalizeAnswer(answer);
    const normalizedTarget = Core.normalizeAnswer(targetWord);
    if (normalizedAnswer === normalizedTarget) return "correct";
    try {
      const synonyms = await synonymsFor(normalizedTarget);
      if (synonyms.has(normalizedAnswer)) return "synonym";
    } catch (error) {
      console.warn("同义词核验失败：", error);
      if (Core.spellingDifferenceRatio(normalizedAnswer, normalizedTarget) <= 0.25) return "typo";
      return "unverified";
    }
    if (Core.spellingDifferenceRatio(normalizedAnswer, normalizedTarget) <= 0.25) return "typo";
    return "wrong";
  }

  function recordStudyOutcome(resultType) {
    if (!studySession) return;
    const id = studySession.ids[studySession.index];
    const isKnown = resultType === "correct";
    state = Core.recordAnswer(state, id, isKnown);
    if (isKnown) studySession.known += 1;
    else studySession.unknown += 1;
    dashboardRound.answered += 1;
    dashboardRound.known += isKnown ? 1 : 0;
    dashboardRound.unknown += isKnown ? 0 : 1;
    saveState();
  }

  function showAnswerFeedback(resultType, targetWord) {
    const exactMessages = ["棒棒哒，完全正确。", "答对了，记得很牢。", "完全匹配，就是这个词。"];
    const feedback = {
      correct: {
        mark: "✓",
        label: "EXACT MATCH",
        title: exactMessages[(studySession.known - 1) % exactMessages.length],
        message: "你写出了此前录入的目标词。",
        revealTarget: false,
      },
      synonym: {
        mark: "≈",
        label: "CLOSE, NOT EXACT",
        title: "意思接近，但还不完全对。",
        message: "这个同义词不能算作正确答案。",
        revealTarget: true,
      },
      typo: {
        mark: "!",
        label: "CHECK THE SPELLING",
        title: "你可能记错了或拼错了。",
        message: "输入与目标词的字母编辑差异不超过 25%。",
        revealTarget: true,
      },
      wrong: {
        mark: "×",
        label: "NOT THIS WORD",
        title: "这次没有答对。",
        message: "请记住此前录入的准确英文。",
        revealTarget: true,
      },
      unverified: {
        mark: "×",
        label: "CHECK UNAVAILABLE",
        title: "没有匹配到目标词。",
        message: "当前无法联网核验它是否为同义词，暂不计为正确。",
        revealTarget: true,
      },
    }[resultType];
    elements.answerFeedbackDialog.dataset.result = resultType;
    elements.answerFeedbackMark.textContent = feedback.mark;
    elements.answerFeedbackLabel.textContent = feedback.label;
    elements.answerFeedbackTitle.textContent = feedback.title;
    elements.answerFeedbackMessage.textContent = feedback.message;
    elements.answerTarget.hidden = !feedback.revealTarget;
    elements.answerTargetWord.textContent = targetWord;
    elements.nextQuestionButton.textContent = studySession.index + 1 >= studySession.ids.length
      ? "查看本轮结果 →"
      : "下一题 →";
    elements.answerFeedbackDialog.showModal();
  }

  async function handleStudyAnswer(event) {
    event.preventDefault();
    if (!studySession || answerCheckPending) return;
    const answer = elements.studyAnswerInput.value.trim();
    if (!answer) return;
    const wordId = studySession.ids[studySession.index];
    const word = state.words.find((item) => item.id === wordId);
    if (!word) {
      nextStudyCard();
      return;
    }
    answerCheckPending = true;
    const requestToken = ++answerRequestToken;
    elements.studyAnswerInput.disabled = true;
    elements.checkAnswerButton.disabled = true;
    elements.checkAnswerButton.textContent = "核对中…";
    elements.answerCheckStatus.textContent = "正在核对目标词与英文同义词…";
    const resultType = await classifyAnswer(answer, word.word);
    if (requestToken !== answerRequestToken || !studySession) return;
    recordStudyOutcome(resultType);
    showAnswerFeedback(resultType, word.word);
  }

  function nextStudyCard() {
    studySession.index += 1;
    if (studySession.index >= studySession.ids.length) {
      finishStudy();
      return;
    }
    renderStudyCard();
  }

  function finishStudy() {
    elements.resultTotal.textContent = studySession.ids.length;
    elements.resultKnown.textContent = studySession.known;
    elements.resultUnknown.textContent = studySession.unknown;
    elements.studyProgress.style.width = "100%";
    navigate("result");
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2400);
  }

  function setText(selector, value) {
    document.querySelector(selector).textContent = String(value);
  }

  elements.routeButtons.forEach((button) => button.addEventListener("click", () => navigate(button.dataset.route)));
  [elements.headerAdd, elements.libraryAdd, elements.emptyAdd].forEach((button) => button.addEventListener("click", () => openWordDialog()));
  elements.dialogClose.addEventListener("click", () => elements.wordDialog.close());
  elements.wordForm.addEventListener("submit", handleWordSubmit);
  elements.openImportButton.addEventListener("click", openImportDialog);
  elements.importDialogClose.addEventListener("click", () => elements.importDialog.close());
  elements.importFileInput.addEventListener("change", () => handleImportFile(elements.importFileInput.files[0]));
  elements.chooseAnotherFile.addEventListener("click", resetImportDialog);
  elements.confirmImportButton.addEventListener("click", confirmImport);
  elements.fileDropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    elements.fileDropZone.classList.add("is-dragging");
  });
  elements.fileDropZone.addEventListener("dragleave", () => elements.fileDropZone.classList.remove("is-dragging"));
  elements.fileDropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.fileDropZone.classList.remove("is-dragging");
    handleImportFile(event.dataTransfer.files[0]);
  });
  elements.importPreviewList.addEventListener("input", (event) => {
    const rowElement = event.target.closest("[data-index]");
    if (!rowElement || !event.target.dataset.field) return;
    const index = Number(rowElement.dataset.index);
    const field = event.target.dataset.field;
    importRows[index][field] = field === "selected" ? event.target.checked : event.target.value;
    refreshImportStatuses();
  });
  elements.importPreviewList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action='remove-import-row']");
    if (!button) return;
    const rowElement = button.closest("[data-index]");
    importRows.splice(Number(rowElement.dataset.index), 1);
    renderImportRows();
  });
  elements.searchInput.addEventListener("input", renderLibrary);
  elements.filterChips.forEach((chip) => chip.addEventListener("click", () => {
    activeFilter = chip.dataset.filter;
    elements.filterChips.forEach((item) => item.classList.toggle("is-active", item === chip));
    renderLibrary();
  }));
  elements.wordTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "edit") openWordDialog(button.dataset.id);
    if (button.dataset.action === "delete") requestDelete([button.dataset.id]);
  });
  elements.toggleRecentManage.addEventListener("click", toggleRecentManagement);
  elements.recentPreviewCover.addEventListener("click", () => {
    recentRevealed = true;
    elements.recentContent.classList.add("is-revealed");
  });
  elements.recentList.addEventListener("change", (event) => {
    if (!event.target.classList.contains("recent-select")) return;
    if (event.target.checked) selectedRecentIds.add(event.target.dataset.id);
    else selectedRecentIds.delete(event.target.dataset.id);
    updateRecentSelectionBar();
  });
  elements.recentList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "delete-recent") requestDelete([button.dataset.id]);
  });
  elements.deleteSelectedRecent.addEventListener("click", () => requestDelete([...selectedRecentIds]));
  elements.confirmDialog.addEventListener("close", () => {
    if (elements.confirmDialog.returnValue === "confirm" && pendingDeleteIds.length) {
      const deletedCount = pendingDeleteIds.length;
      pendingDeleteIds.forEach((id) => {
        state = Core.removeWord(state, id);
      });
      saveState();
      selectedRecentIds.clear();
      renderDashboard();
      renderLibrary();
      showToast(deletedCount === 1 ? "单词已删除" : `已删除 ${deletedCount} 个单词`);
    }
    pendingDeleteIds = [];
  });
  elements.startButton.addEventListener("click", () => startStudy("all"));
  elements.reviewButton.addEventListener("click", () => startStudy("review"));
  elements.exitStudyButton.addEventListener("click", () => {
    answerRequestToken += 1;
    answerCheckPending = false;
    studySession = null;
    navigate("home");
  });
  elements.studyAnswerForm.addEventListener("submit", handleStudyAnswer);
  elements.answerFeedbackDialog.addEventListener("cancel", (event) => event.preventDefault());
  elements.nextQuestionButton.addEventListener("click", () => {
    elements.answerFeedbackDialog.close();
    nextStudyCard();
  });
  elements.studyAgainButton.addEventListener("click", () => startStudy(studySession ? studySession.mode : "all"));

  renderDashboard();
  renderLibrary();
})();
