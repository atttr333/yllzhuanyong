(function attachCore(globalScope) {
  "use strict";

  const STORAGE_KEY = "shici-vocabulary-v1";

  function todayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function makeId() {
    if (globalScope.crypto && typeof globalScope.crypto.randomUUID === "function") {
      return globalScope.crypto.randomUUID();
    }
    return `word-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function cleanText(value) {
    return String(value || "").trim();
  }

  function stripLeadingSerial(value) {
    return cleanText(value).replace(
      /^(?:(?:\(?\d{1,4}\)?)(?:\s*[.．、:：\-)]\s*|\s+))+(?=[A-Za-z])/,
      "",
    );
  }

  function cleanWord(value) {
    return stripLeadingSerial(value);
  }

  function normalizeAnswer(value) {
    return cleanWord(value).replace(/\s+/g, " ").toLocaleLowerCase();
  }

  function levenshteinDistance(leftValue, rightValue) {
    const left = Array.from(normalizeAnswer(leftValue));
    const right = Array.from(normalizeAnswer(rightValue));
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const current = [leftIndex];
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
        current[rightIndex] = Math.min(
          current[rightIndex - 1] + 1,
          previous[rightIndex] + 1,
          previous[rightIndex - 1] + substitutionCost,
        );
      }
      previous.splice(0, previous.length, ...current);
    }
    return previous[right.length];
  }

  function spellingDifferenceRatio(answer, target) {
    const normalizedTarget = normalizeAnswer(target);
    if (!normalizedTarget) return 1;
    return levenshteinDistance(answer, normalizedTarget) / Array.from(normalizedTarget).length;
  }

  function createBook(name) {
    const cleanedName = cleanText(name);
    if (!cleanedName) throw new Error("单词本名称不能为空");
    if (cleanedName.length > 40) throw new Error("单词本名称不能超过 40 个字");
    return { id: makeId(), name: cleanedName, createdAt: new Date().toISOString() };
  }

  function createWord(word, meaning, bookId, now = new Date()) {
    const cleanedWord = cleanWord(word);
    const cleanedMeaning = cleanText(meaning);
    if (!cleanedWord || !cleanedMeaning) {
      throw new Error("单词和释义都不能为空");
    }
    return {
      id: makeId(),
      bookId,
      word: cleanedWord,
      meaning: cleanedMeaning,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      attempts: 0,
      knownCount: 0,
      unknownCount: 0,
      lastStudiedAt: null,
      lastResult: null,
    };
  }

  function createEmptyState() {
    const firstBook = { id: "default-book", name: "我的单词本", createdAt: new Date().toISOString() };
    return { version: 2, books: [firstBook], selectedBookId: firstBook.id, words: [], daily: {} };
  }

  function normalizeState(value) {
    if (!value || typeof value !== "object" || !Array.isArray(value.words)) {
      return createEmptyState();
    }
    const fallback = { id: "default-book", name: "我的单词本", createdAt: new Date().toISOString() };
    const rawBooks = Array.isArray(value.books) ? value.books : [];
    const seenBookNames = new Set();
    const books = rawBooks.reduce((items, item) => {
      const name = cleanText(item && item.name);
      const key = name.toLocaleLowerCase();
      if (!item || !item.id || !name || seenBookNames.has(key)) return items;
      seenBookNames.add(key);
      items.push({ ...item, name });
      return items;
    }, []);
    if (!books.length) books.push(fallback);
    const bookIds = new Set(books.map((book) => book.id));
    const selectedBookId = bookIds.has(value.selectedBookId) ? value.selectedBookId : books[0].id;
    const seenWords = new Set();
    const words = value.words.reduce((items, item) => {
      const word = cleanWord(item && item.word);
      const meaning = cleanText(item && item.meaning);
      const bookId = bookIds.has(item && item.bookId) ? item.bookId : books[0].id;
      const key = `${bookId}\u0000${normalizeAnswer(word)}`;
      if (!item || !item.id || !word || !meaning || seenWords.has(key)) return items;
      seenWords.add(key);
      items.push({ ...item, word, meaning, bookId });
      return items;
    }, []);
    return {
      version: 2,
      books,
      selectedBookId,
      words,
      daily: value.daily && typeof value.daily === "object" ? value.daily : {},
    };
  }

  function addWord(state, word, meaning, bookId = state.selectedBookId, now = new Date()) {
    if (bookId instanceof Date) {
      now = bookId;
      bookId = state.selectedBookId;
    }
    const cleanedWord = cleanWord(word);
    const targetBookId = state.books.some((book) => book.id === bookId) ? bookId : state.selectedBookId;
    const duplicate = state.words.some(
      (item) => item.bookId === targetBookId && normalizeAnswer(item.word) === normalizeAnswer(cleanedWord),
    );
    if (duplicate) throw new Error("这个单词已经在词库中了");
    return { ...state, words: [createWord(cleanedWord, meaning, targetBookId, now), ...state.words] };
  }

  function updateWord(state, id, word, meaning, now = new Date()) {
    const cleanedWord = cleanWord(word);
    const cleanedMeaning = cleanText(meaning);
    if (!cleanedWord || !cleanedMeaning) throw new Error("单词和释义都不能为空");
    const duplicate = state.words.some(
      (item) => item.id !== id && item.bookId === state.words.find((wordItem) => wordItem.id === id)?.bookId && normalizeAnswer(item.word) === normalizeAnswer(cleanedWord),
    );
    if (duplicate) throw new Error("这个单词已经在词库中了");
    return {
      ...state,
      words: state.words.map((item) =>
        item.id === id
          ? { ...item, word: cleanedWord, meaning: cleanedMeaning, updatedAt: now.toISOString() }
          : item,
      ),
    };
  }

  function removeWord(state, id) {
    return { ...state, words: state.words.filter((item) => item.id !== id) };
  }

  function clearBookWords(state, bookId) {
    return { ...state, words: state.words.filter((item) => item.bookId !== bookId) };
  }

  function addBook(state, name) {
    const book = createBook(name);
    const duplicate = state.books.some((item) => item.name.toLocaleLowerCase() === book.name.toLocaleLowerCase());
    if (duplicate) throw new Error("已经有同名单词本了");
    return { ...state, books: [...state.books, book], selectedBookId: book.id };
  }

  function selectBook(state, bookId) {
    if (!state.books.some((book) => book.id === bookId)) return state;
    return { ...state, selectedBookId: bookId };
  }

  function wordsInBook(state, bookId = state.selectedBookId) {
    return state.words.filter((word) => word.bookId === bookId);
  }

  function recordAnswer(state, id, isKnown, now = new Date()) {
    const day = todayKey(now);
    const currentDaily = state.daily[day] || { studied: 0, known: 0, unknown: 0 };
    return {
      ...state,
      words: state.words.map((item) =>
        item.id === id
          ? {
              ...item,
              attempts: item.attempts + 1,
              knownCount: item.knownCount + (isKnown ? 1 : 0),
              unknownCount: item.unknownCount + (isKnown ? 0 : 1),
              lastStudiedAt: now.toISOString(),
              lastResult: isKnown ? "known" : "unknown",
            }
          : item,
      ),
      daily: {
        ...state.daily,
        [day]: {
          studied: currentDaily.studied + 1,
          known: currentDaily.known + (isKnown ? 1 : 0),
          unknown: currentDaily.unknown + (isKnown ? 0 : 1),
        },
      },
    };
  }

  function statusOf(word) {
    if (!word.attempts) return "new";
    return word.lastResult === "known" ? "mastered" : "review";
  }

  function statsOf(state, date = new Date(), bookId = state.selectedBookId) {
    const words = wordsInBook(state, bookId);
    const statuses = words.map(statusOf);
    const daily = state.daily[todayKey(date)] || { studied: 0, known: 0, unknown: 0 };
    return {
      total: words.length,
      mastered: statuses.filter((status) => status === "mastered").length,
      review: statuses.filter((status) => status === "review").length,
      daily,
    };
  }

  function filterWords(words, query, filter) {
    const needle = cleanText(query).toLocaleLowerCase();
    return words.filter((word) => {
      const matchesQuery =
        !needle ||
        word.word.toLocaleLowerCase().includes(needle) ||
        word.meaning.toLocaleLowerCase().includes(needle);
      const matchesFilter = filter === "all" || statusOf(word) === filter;
      return matchesQuery && matchesFilter;
    });
  }

  globalScope.WordForgeCore = {
    STORAGE_KEY,
    todayKey,
    createWord,
    createBook,
    createEmptyState,
    normalizeState,
    addWord,
    updateWord,
    removeWord,
    clearBookWords,
    addBook,
    selectBook,
    wordsInBook,
    recordAnswer,
    statusOf,
    statsOf,
    filterWords,
    cleanWord,
    stripLeadingSerial,
    normalizeAnswer,
    levenshteinDistance,
    spellingDifferenceRatio,
  };
})(typeof window !== "undefined" ? window : globalThis);
