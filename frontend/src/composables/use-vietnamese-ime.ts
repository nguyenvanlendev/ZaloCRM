// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
/**
 * use-vietnamese-ime.ts — Composable xử lý tính năng Gợi ý từ tiếp theo (Next-Word Prediction)
 * và Mở rộng gõ tắt (Shorthand Expansion) chuẩn phong cách bộ gõ hiện đại (Laban Key / Gboard).
 */

import { ref } from 'vue';
import { CRM_SHORTHANDS } from '../data/vietnamese-ime/crm-shorthands';
import { VIETNAMESE_BIGRAMS } from '../data/vietnamese-ime/vietnamese-bigrams';
import { VIETNAMESE_COMMON_WORDS } from '../data/vietnamese-ime/vietnamese-common-words';

const STORAGE_KEY_ENABLED = 'zalocrm_ime_autocomplete_enabled';

/**
 * Hàm bỏ dấu tiếng Việt để so khớp không phân biệt dấu khi gõ nhanh.
 */
export function removeAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export interface ImeContext {
  /** Từ đang gõ dở tại con trỏ (chưa có dấu cách phía sau) */
  currentWord: string;
  /** Từ liền trước từ hiện tại */
  prevWord: string;
  /** Có dấu cách liền trước con trỏ hay không (đang ở chế độ đoán từ tiếp theo) */
  hasTrailingSpace: boolean;
  /** Vị trí bắt đầu của currentWord trong chuỗi */
  startOffset: number;
  /** Vị trí kết thúc của currentWord trong chuỗi */
  endOffset: number;
}

/**
 * Phân tích chuỗi văn bản và vị trí con trỏ để trích xuất ngữ cảnh gõ phím.
 */
export function extractImeContext(textBeforeCursor: string): ImeContext {
  if (!textBeforeCursor) {
    return { currentWord: '', prevWord: '', hasTrailingSpace: false, startOffset: 0, endOffset: 0 };
  }

  // Nếu ký tự cuối cùng trước con trỏ là khoảng trắng hoặc dấu câu ngắt câu (. , ! ?)
  const endsWithSpace = /\s$/.test(textBeforeCursor);
  const trimmed = textBeforeCursor.trimEnd();
  
  if (endsWithSpace || !trimmed) {
    // Người dùng vừa gõ phím cách -> trích xuất từ trước đó để làm next-word prediction
    const tokens = trimmed.split(/[\s,.;:!?\n\r]+/).filter(Boolean);
    const prevWord = tokens.length > 0 ? tokens[tokens.length - 1] : '';
    return {
      currentWord: '',
      prevWord: prevWord.toLowerCase(),
      hasTrailingSpace: true,
      startOffset: textBeforeCursor.length,
      endOffset: textBeforeCursor.length,
    };
  }

  // Đang gõ dở một từ
  const lastSpaceIdx = Math.max(
    textBeforeCursor.lastIndexOf(' '),
    textBeforeCursor.lastIndexOf('\n'),
    textBeforeCursor.lastIndexOf('\t'),
    textBeforeCursor.lastIndexOf(','),
    textBeforeCursor.lastIndexOf('.')
  );

  const startOffset = lastSpaceIdx === -1 ? 0 : lastSpaceIdx + 1;
  const currentWord = textBeforeCursor.slice(startOffset);

  // Tìm từ đứng trước currentWord
  const beforeCurrent = lastSpaceIdx === -1 ? '' : textBeforeCursor.slice(0, lastSpaceIdx).trimEnd();
  const tokensBefore = beforeCurrent.split(/[\s,.;:!?\n\r]+/).filter(Boolean);
  const prevWord = tokensBefore.length > 0 ? tokensBefore[tokensBefore.length - 1] : '';

  return {
    currentWord,
    prevWord: prevWord.toLowerCase(),
    hasTrailingSpace: false,
    startOffset,
    endOffset: textBeforeCursor.length,
  };
}

/**
 * Kiểm tra xem văn bản trước con trỏ có vừa kết thúc bằng một từ viết tắt kèm dấu cách không.
 * Nếu có, trả về thông tin để thay thế chuẩn tiếng Việt: { rawWord, replacement, startOffset, endOffset }.
 */
export function checkShorthandTrailingSpace(textBeforeCursor: string): {
  rawWord: string;
  replacement: string;
  startOffset: number;
  endOffset: number;
} | null {
  if (!textBeforeCursor) return null;
  // Khớp: [khoảng trắng/dấu câu hoặc đầu dòng] + [từ viết tắt] + [1 khoảng trắng ở cuối]
  const match = textBeforeCursor.match(/(?:^|[\s,.;:!?\n\r])([a-zA-Z0-9đĐ]+)(\s)$/);
  if (!match) return null;

  const rawWord = match[1];
  const lower = rawWord.toLowerCase();
  const unaccented = removeAccents(lower);
  const replacement = CRM_SHORTHANDS[lower] || CRM_SHORTHANDS[unaccented];
  if (!replacement || lower === replacement.toLowerCase()) return null;

  const endOffset = textBeforeCursor.length;
  const startOffset = endOffset - 1 - rawWord.length;

  return {
    rawWord,
    replacement,
    startOffset,
    endOffset,
  };
}

/**
 * Thuật toán suy luận ứng viên từ ngữ cảnh (Candidate Generator).
 */
export function getCandidates(ctx: ImeContext): { candidates: string[]; isNextWord: boolean } {
  const result: string[] = [];
  const seen = new Set<string>();

  const add = (word: string) => {
    const trimmed = word.trim();
    const lower = trimmed.toLowerCase();
    if (!lower || seen.has(lower)) return;
    seen.add(lower);
    result.push(trimmed);
  };

  const curr = ctx.currentWord.trim();
  const currLower = curr.toLowerCase();
  const currUnaccented = removeAccents(curr);

  // ── 1. Đang có từ gõ dở (Prefix matching / Shorthand) ──────────────────────
  if (curr.length > 0) {
    // A. Nếu có từ đứng trước (ngữ cảnh Bigram):
    // Ưu tiên cao nhất cho từ trong Bigram khớp chính xác hoặc tiền tố (VD: "hôm" + "qua" -> "qua")
    if (ctx.prevWord && VIETNAMESE_BIGRAMS[ctx.prevWord]) {
      const bigrams = VIETNAMESE_BIGRAMS[ctx.prevWord];
      // 1. Khớp chính xác trong Bigram
      for (const nextWord of bigrams) {
        if (
          nextWord.toLowerCase() === currLower ||
          removeAccents(nextWord) === currUnaccented
        ) {
          add(nextWord);
        }
      }
      // 2. Khớp tiền tố trong Bigram
      for (const nextWord of bigrams) {
        if (
          nextWord.toLowerCase().startsWith(currLower) ||
          removeAccents(nextWord).startsWith(currUnaccented)
        ) {
          add(nextWord);
        }
      }
    }

    // B. Kiểm tra từ điển gõ tắt (Shorthand expansion)
    if (CRM_SHORTHANDS[currLower]) {
      add(CRM_SHORTHANDS[currLower]);
    } else if (CRM_SHORTHANDS[currUnaccented]) {
      add(CRM_SHORTHANDS[currUnaccented]);
    }

    // C. Tìm kiếm trong danh mục từ điển tiếng Việt phổ biến (Prefix matching)
    if (curr.length >= 1) {
      for (const word of VIETNAMESE_COMMON_WORDS) {
        const wordLower = word.toLowerCase();
        const wordUnaccented = removeAccents(word);
        const isExactAccented = wordLower === currLower;
        const isPrefixAccented = wordLower.startsWith(currLower) && wordLower !== currLower;
        const isPrefixUnaccented = wordUnaccented.startsWith(currUnaccented) && wordUnaccented !== currUnaccented;
        // Guard: nếu dạng bỏ dấu trùng chính xác (cùng độ dài) nhưng từ gốc khác →
        // đây là biến thể dấu (vd: "qua" → "quá"), KHÔNG gợi ý vì dễ gây sửa sai.
        const isAccentVariant =
          wordUnaccented === currUnaccented && wordLower !== currLower;

        if (isExactAccented || isPrefixAccented || (isPrefixUnaccented && !isAccentVariant)) {
          add(word);
          if (result.length >= 4) break;
        }
      }
    }

    return { candidates: result.slice(0, 4), isNextWord: false };
  }

  // ── 2. Vừa gõ dấu cách xong -> Đoán từ tiếp theo (Next-Word Prediction) ─────
  if (ctx.hasTrailingSpace && ctx.prevWord) {
    const bigrams = VIETNAMESE_BIGRAMS[ctx.prevWord];
    if (bigrams && bigrams.length > 0) {
      for (const nextWord of bigrams) {
        add(nextWord);
      }
      return { candidates: result.slice(0, 4), isNextWord: true };
    }
  }

  return { candidates: [], isNextWord: false };
}

export function useVietnameseIme() {
  const isEnabled = ref<boolean>(
    localStorage.getItem(STORAGE_KEY_ENABLED) !== 'false'
  );

  const candidates = ref<string[]>([]);
  const isNextWord = ref<boolean>(false);
  const selectedIndex = ref<number>(0);
  const activeContext = ref<ImeContext | null>(null);

  function toggleEnabled() {
    isEnabled.value = !isEnabled.value;
    localStorage.setItem(STORAGE_KEY_ENABLED, String(isEnabled.value));
    if (!isEnabled.value) {
      clear();
    }
  }

  function clear() {
    candidates.value = [];
    isNextWord.value = false;
    selectedIndex.value = 0;
    activeContext.value = null;
  }

  /**
   * Cập nhật danh sách gợi ý khi nội dung trước con trỏ thay đổi.
   */
  function onTextUpdate(textBeforeCursor: string) {
    if (!isEnabled.value) {
      clear();
      return;
    }

    const ctx = extractImeContext(textBeforeCursor);
    activeContext.value = ctx;

    const res = getCandidates(ctx);
    candidates.value = res.candidates;
    isNextWord.value = res.isNextWord;
    selectedIndex.value = 0;
  }

  return {
    isEnabled,
    candidates,
    isNextWord,
    selectedIndex,
    activeContext,
    toggleEnabled,
    clear,
    onTextUpdate,
  };
}
