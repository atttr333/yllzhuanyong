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

  function normalizeAnswer(value) {
    return cleanText(value).replace(/\s+/g, " ").toLocaleLowerCase();
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

  function createWord(word, meaning, now = new Date()) {
    const cleanedWord = cleanText(word);
    const cleanedMeaning = cleanText(meaning);
    if (!cleanedWord || !cleanedMeaning) {
      throw new Error("单词和释义都不能为空");
    }
    return {
      id: makeId(),
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
    return { version: 1, words: [], daily: {} };
  }

  function normalizeState(value) {
    if (!value || typeof value !== "object" || !Array.isArray(value.words)) {
      return createEmptyState();
    }
    return {
      version: 1,
      words: value.words.filter((item) => item && item.id && item.word && item.meaning),
      daily: value.daily && typeof value.daily === "object" ? value.daily : {},
    };
  }

  function addWord(state, word, meaning, now = new Date()) {
    const cleanedWord = cleanText(word);
    const duplicate = state.words.some(
      (item) => item.word.toLocaleLowerCase() === cleanedWord.toLocaleLowerCase(),
    );
    if (duplicate) throw new Error("这个单词已经在词库中了");
    return { ...state, words: [createWord(cleanedWord, meaning, now), ...state.words] };
  }

  function updateWord(state, id, word, meaning, now = new Date()) {
    const cleanedWord = cleanText(word);
    const cleanedMeaning = cleanText(meaning);
    if (!cleanedWord || !cleanedMeaning) throw new Error("单词和释义都不能为空");
    const duplicate = state.words.some(
      (item) => item.id !== id && item.word.toLocaleLowerCase() === cleanedWord.toLocaleLowerCase(),
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

  function statsOf(state, date = new Date()) {
    const statuses = state.words.map(statusOf);
    const daily = state.daily[todayKey(date)] || { studied: 0, known: 0, unknown: 0 };
    return {
      total: state.words.length,
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
    createEmptyState,
    normalizeState,
    addWord,
    updateWord,
    removeWord,
    recordAnswer,
    statusOf,
    statsOf,
    filterWords,
    normalizeAnswer,
    levenshteinDistance,
    spellingDifferenceRatio,
  };
})(typeof window !== "undefined" ? window : globalThis);
