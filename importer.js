(function attachWordImporter(globalScope) {
  "use strict";

  const SUPPORTED = {
    docx: "DOCX",
    pptx: "PPTX",
    pdf: "PDF",
  };
  const EXPLICIT_SEPARATORS = ["\t", "::", "｜", "|"];
  let pdfModulePromise = null;

  function fileExtension(name) {
    const match = String(name || "").toLocaleLowerCase().match(/\.([^.]+)$/);
    return match ? match[1] : "";
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function splitExplicitLine(line) {
    const source = String(line || "").trim();
    for (const separator of EXPLICIT_SEPARATORS) {
      const index = source.indexOf(separator);
      if (index <= 0) continue;
      const word = clean(source.slice(0, index));
      const meaning = clean(source.slice(index + separator.length));
      if (word && meaning) return { word, meaning };
    }
    return null;
  }

  function rowsFromTextBlocks(blocks, sourceLabel) {
    const rows = [];
    blocks.forEach((block) => {
      String(block || "").split(/\r?\n/).forEach((line) => {
        const pair = splitExplicitLine(line);
        if (pair) rows.push({ ...pair, source: sourceLabel });
      });
    });
    return rows;
  }

  function descendantsByLocalName(node, localName) {
    return [...node.getElementsByTagNameNS("*", localName)];
  }

  function hasAncestorWithLocalName(node, localName, stopAt) {
    let parent = node.parentElement;
    while (parent && parent !== stopAt) {
      if (parent.localName === localName) return true;
      parent = parent.parentElement;
    }
    return false;
  }

  function textRuns(node) {
    return clean(descendantsByLocalName(node, "t").map((item) => item.textContent || "").join(""));
  }

  function cellText(cell) {
    const paragraphs = descendantsByLocalName(cell, "p")
      .filter((paragraph) => !hasAncestorWithLocalName(paragraph, "tc", cell))
      .map(textRuns)
      .filter(Boolean);
    return clean(paragraphs.length ? paragraphs.join(" ") : textRuns(cell));
  }

  function tableRows(documentNode, sourceLabel) {
    const rows = [];
    descendantsByLocalName(documentNode, "tr").forEach((row) => {
      const cells = descendantsByLocalName(row, "tc")
        .filter((cell) => {
          let parent = cell.parentElement;
          while (parent && parent !== row) {
            if (parent.localName === "tr") return false;
            parent = parent.parentElement;
          }
          return parent === row;
        })
        .map(cellText)
        .filter(Boolean);
      if (cells.length >= 2) {
        rows.push({ word: cells[0], meaning: clean(cells.slice(1).join(" ")), source: sourceLabel });
      }
    });
    return rows;
  }

  function parseXml(xmlText, label) {
    const documentNode = new DOMParser().parseFromString(xmlText, "application/xml");
    if (documentNode.querySelector("parsererror")) throw new Error(`${label} 内的文档结构无法读取`);
    return documentNode;
  }

  function uniqueRows(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const word = clean(row.word);
      const meaning = clean(row.meaning);
      if (!word || !meaning) return false;
      const key = `${word.toLocaleLowerCase()}\u0000${meaning.toLocaleLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      row.word = word;
      row.meaning = meaning;
      return true;
    });
  }

  async function parseDocx(arrayBuffer) {
    if (!globalScope.JSZip) throw new Error("DOCX 解析组件没有加载");
    const archive = await globalScope.JSZip.loadAsync(arrayBuffer);
    const documentPart = archive.file("word/document.xml");
    if (!documentPart) throw new Error("该文件不是有效的 DOCX 文档");
    const xml = await documentPart.async("string");
    const documentNode = parseXml(xml, "DOCX");
    const rows = tableRows(documentNode, "Word 表格");
    const paragraphs = descendantsByLocalName(documentNode, "p")
      .filter((paragraph) => !hasAncestorWithLocalName(paragraph, "tc", documentNode))
      .map(textRuns)
      .filter(Boolean);
    rows.push(...rowsFromTextBlocks(paragraphs, "Word 文本"));
    return uniqueRows(rows);
  }

  function slideNumber(path) {
    const match = path.match(/slide(\d+)\.xml$/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  }

  async function parsePptx(arrayBuffer) {
    if (!globalScope.JSZip) throw new Error("PPTX 解析组件没有加载");
    const archive = await globalScope.JSZip.loadAsync(arrayBuffer);
    const slidePaths = Object.keys(archive.files)
      .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
      .sort((a, b) => slideNumber(a) - slideNumber(b));
    if (!slidePaths.length) throw new Error("该文件不是有效的 PPTX 文档");
    const rows = [];
    for (const path of slidePaths) {
      const number = slideNumber(path);
      const xml = await archive.file(path).async("string");
      const documentNode = parseXml(xml, `PPTX 第 ${number} 页`);
      rows.push(...tableRows(documentNode, `PPT 第 ${number} 页表格`));
      const paragraphs = descendantsByLocalName(documentNode, "p")
        .filter((paragraph) => !hasAncestorWithLocalName(paragraph, "tc", documentNode))
        .map(textRuns)
        .filter(Boolean);
      rows.push(...rowsFromTextBlocks(paragraphs, `PPT 第 ${number} 页文本`));
    }
    return uniqueRows(rows);
  }

  function groupPdfLines(items) {
    const lines = [];
    [...items]
      .filter((item) => typeof item.str === "string" && item.str.trim() && Array.isArray(item.transform))
      .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])
      .forEach((item) => {
        const y = item.transform[5];
        let line = lines.find((entry) => Math.abs(entry.y - y) <= 3);
        if (!line) {
          line = { y, items: [] };
          lines.push(line);
        }
        line.items.push(item);
      });
    lines.forEach((line) => line.items.sort((a, b) => a.transform[4] - b.transform[4]));
    return lines;
  }

  function rowFromPdfLine(line, sourceLabel) {
    const visibleItems = line.items.map((item) => ({
      text: clean(item.str),
      x: item.transform[4],
      endX: item.transform[4] + (Number(item.width) || 0),
    })).filter((item) => item.text);
    if (!visibleItems.length) return null;

    const explicit = splitExplicitLine(visibleItems.map((item) => item.text).join(" "));
    if (explicit) return { ...explicit, source: sourceLabel };
    if (visibleItems.length < 2) return null;

    let splitIndex = -1;
    let largestGap = -Infinity;
    for (let index = 0; index < visibleItems.length - 1; index += 1) {
      const gap = visibleItems[index + 1].x - visibleItems[index].endX;
      if (gap > largestGap) {
        largestGap = gap;
        splitIndex = index;
      }
    }
    if (splitIndex < 0 || largestGap < 12) return null;
    const word = clean(visibleItems.slice(0, splitIndex + 1).map((item) => item.text).join(" "));
    const meaning = clean(visibleItems.slice(splitIndex + 1).map((item) => item.text).join(" "));
    return word && meaning ? { word, meaning, source: sourceLabel } : null;
  }

  async function getPdfModule() {
    if (!pdfModulePromise) {
      pdfModulePromise = import("./pdfjs-6.3.289.min.mjs").then((module) => {
        module.GlobalWorkerOptions.workerSrc = new URL(
          "./pdfjs-worker-6.3.289.min.mjs",
          document.baseURI,
        ).href;
        return module;
      });
    }
    return pdfModulePromise;
  }

  async function parsePdf(arrayBuffer) {
    const pdfjs = await getPdfModule();
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
    const documentNode = await loadingTask.promise;
    const rows = [];
    try {
      for (let pageNumber = 1; pageNumber <= documentNode.numPages; pageNumber += 1) {
        const page = await documentNode.getPage(pageNumber);
        const textContent = await page.getTextContent();
        groupPdfLines(textContent.items).forEach((line) => {
          const row = rowFromPdfLine(line, `PDF 第 ${pageNumber} 页`);
          if (row) rows.push(row);
        });
      }
    } finally {
      await loadingTask.destroy();
    }
    return uniqueRows(rows);
  }

  async function parseFile(file) {
    const extension = fileExtension(file && file.name);
    if (!SUPPORTED[extension]) {
      if (extension === "doc" || extension === "ppt") {
        throw new Error(`暂不支持 .${extension}，请先在 Office 中另存为 .${extension}x`);
      }
      throw new Error("请选择 PPTX、PDF 或 DOCX 文件");
    }
    const arrayBuffer = await file.arrayBuffer();
    let entries;
    if (extension === "docx") entries = await parseDocx(arrayBuffer);
    if (extension === "pptx") entries = await parsePptx(arrayBuffer);
    if (extension === "pdf") entries = await parsePdf(arrayBuffer);
    return { entries, format: SUPPORTED[extension], fileName: file.name };
  }

  globalScope.WordImporter = {
    parseFile,
    splitExplicitLine,
    rowsFromTextBlocks,
  };
})(typeof window !== "undefined" ? window : globalThis);
