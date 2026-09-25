// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Nguyễn Tiến Lộc
import { describe, it, expect } from 'vitest';
import {
  removeAccents,
  extractImeContext,
  getCandidates,
  checkShorthandTrailingSpace,
} from './use-vietnamese-ime';

describe('use-vietnamese-ime core logic', () => {
  describe('removeAccents', () => {
    it('removes Vietnamese accents correctly', () => {
      expect(removeAccents('tiếng Việt')).toBe('tieng viet');
      expect(removeAccents('Chào Anh')).toBe('chao anh');
      expect(removeAccents('Được rồi')).toBe('duoc roi');
    });
  });

  describe('extractImeContext', () => {
    it('handles empty string', () => {
      const ctx = extractImeContext('');
      expect(ctx.currentWord).toBe('');
      expect(ctx.prevWord).toBe('');
      expect(ctx.hasTrailingSpace).toBe(false);
    });

    it('detects word currently being typed', () => {
      const ctx = extractImeContext('Dạ em xin ch');
      expect(ctx.currentWord).toBe('ch');
      expect(ctx.prevWord).toBe('xin');
      expect(ctx.hasTrailingSpace).toBe(false);
    });

    it('detects trailing space for next-word prediction', () => {
      const ctx = extractImeContext('Dạ em xin ');
      expect(ctx.currentWord).toBe('');
      expect(ctx.prevWord).toBe('xin');
      expect(ctx.hasTrailingSpace).toBe(true);
    });

    it('handles punctuation correctly', () => {
      const ctx = extractImeContext('Chào anh. Em ');
      expect(ctx.currentWord).toBe('');
      expect(ctx.prevWord).toBe('em');
      expect(ctx.hasTrailingSpace).toBe(true);
    });
  });

  describe('getCandidates', () => {
    it('predicts next word after "xin "', () => {
      const ctx = extractImeContext('xin ');
      const res = getCandidates(ctx);
      expect(res.isNextWord).toBe(true);
      expect(res.candidates).toContain('chào');
      expect(res.candidates).toContain('phép');
      expect(res.candidates).toContain('lỗi');
    });

    it('predicts next word after "chào "', () => {
      const ctx = extractImeContext('chào ');
      const res = getCandidates(ctx);
      expect(res.isNextWord).toBe(true);
      expect(res.candidates).toContain('anh');
      expect(res.candidates).toContain('chị');
    });

    it('expands shorthands like "ko" -> "không"', () => {
      const ctx = extractImeContext('Dạ bên em ko');
      const res = getCandidates(ctx);
      expect(res.isNextWord).toBe(false);
      expect(res.candidates[0]).toBe('không');
    });

    it('expands shorthands like "dc" -> "được"', () => {
      const ctx = extractImeContext('Em gửi dc');
      const res = getCandidates(ctx);
      expect(res.isNextWord).toBe(false);
      expect(res.candidates[0]).toBe('được');
    });

    it('expands shorthands like "bjo" -> "bây giờ"', () => {
      const ctx = extractImeContext('bjo');
      const res = getCandidates(ctx);
      expect(res.isNextWord).toBe(false);
      expect(res.candidates[0]).toBe('bây giờ');
    });

    it('supports prefix matching when typing incomplete words', () => {
      const ctx = extractImeContext('báo g');
      const res = getCandidates(ctx);
      expect(res.candidates.length).toBeGreaterThan(0);
      expect(res.candidates).toContain('giá');
    });

    it('prioritizes exact contextual bigram match "hôm qua" -> "qua" as primary candidate', () => {
      const ctx = extractImeContext('hôm qua');
      const res = getCandidates(ctx);
      expect(res.candidates[0]).toBe('qua');
    });

    it('suggests "qua" when typing "hôm q"', () => {
      const ctx = extractImeContext('hôm q');
      const res = getCandidates(ctx);
      expect(res.candidates[0]).toBe('qua');
    });
  });

  describe('checkShorthandTrailingSpace', () => {
    it('never auto-corrects valid word "hôm qua " to "quá"', () => {
      const res = checkShorthandTrailingSpace('hôm qua ');
      expect(res).toBeNull();
    });
    it('detects "ko " at start of text and returns replacement "không"', () => {
      const res = checkShorthandTrailingSpace('ko ');
      expect(res).not.toBeNull();
      expect(res?.rawWord).toBe('ko');
      expect(res?.replacement).toBe('không');
      expect(res?.startOffset).toBe(0);
      expect(res?.endOffset).toBe(3);
    });

    it('detects "ko " in middle of sentence', () => {
      const res = checkShorthandTrailingSpace('Dạ bên em ko ');
      expect(res).not.toBeNull();
      expect(res?.rawWord).toBe('ko');
      expect(res?.replacement).toBe('không');
      expect(res?.startOffset).toBe(10);
      expect(res?.endOffset).toBe(13);
    });

    it('detects "dc " -> "được"', () => {
      const res = checkShorthandTrailingSpace('Em làm dc ');
      expect(res).not.toBeNull();
      expect(res?.replacement).toBe('được');
    });

    it('does not replace when word is not a shorthand', () => {
      const res = checkShorthandTrailingSpace('Xin chào bạn ');
      expect(res).toBeNull();
    });

    it('does not replace when word is already full accented word', () => {
      const res = checkShorthandTrailingSpace('Dạ không ');
      expect(res).toBeNull();
    });

    it('handles single-char shorthand "k " → "không"', () => {
      const res = checkShorthandTrailingSpace('k ');
      expect(res).not.toBeNull();
      expect(res?.replacement).toBe('không');
    });

    it('handles single-char shorthand "r " → "rồi"', () => {
      const res = checkShorthandTrailingSpace('r ');
      expect(res).not.toBeNull();
      expect(res?.replacement).toBe('rồi');
    });

    it('does NOT auto-expand valid Vietnamese word "chào " (chào = chào in shorthands)', () => {
      // "chào" maps to "chào" — guard `lower === replacement.toLowerCase()` should catch this
      const res = checkShorthandTrailingSpace('chào ');
      expect(res).toBeNull();
    });

    it('does NOT auto-expand valid word "chưa " if not in shorthands with different expansion', () => {
      // "chua" → "chưa" in shorthands, but "chưa " typed literally should NOT expand
      // because removeAccents("chưa") = "chua", CRM_SHORTHANDS["chua"] = "chưa",
      // and guard `lower === replacement.toLowerCase()` → "chưa" === "chưa" → null
      const res = checkShorthandTrailingSpace('chưa ');
      expect(res).toBeNull();
    });

    it('handles shorthand after newline', () => {
      const res = checkShorthandTrailingSpace('Dạ anh\nko ');
      expect(res).not.toBeNull();
      expect(res?.replacement).toBe('không');
    });

    it('handles shorthand after comma', () => {
      const res = checkShorthandTrailingSpace('Vâng,ko ');
      expect(res).not.toBeNull();
      expect(res?.replacement).toBe('không');
    });

    it('does NOT expand "la " (not a shorthand)', () => {
      const res = checkShorthandTrailingSpace('la ');
      expect(res).toBeNull();
    });

    it('does NOT expand "va " (not a shorthand)', () => {
      const res = checkShorthandTrailingSpace('va ');
      expect(res).toBeNull();
    });

    it('does NOT expand "co " (not a shorthand)', () => {
      const res = checkShorthandTrailingSpace('co ');
      expect(res).toBeNull();
    });
  });

  describe('getCandidates — edge cases', () => {
    it('returns candidates for "qua" typed alone (no prevWord context)', () => {
      const ctx = extractImeContext('qua');
      const res = getCandidates(ctx);
      // "qua" is NOT a shorthand, so candidates should come from common words prefix match
      // and NOT include a shorthand expansion
      expect(res.isNextWord).toBe(false);
      // Should still offer prefix suggestions or be empty, but never "quá"
      for (const c of res.candidates) {
        expect(c).not.toBe('quá');
      }
    });

    it('returns empty for completely empty input', () => {
      const ctx = extractImeContext('');
      const res = getCandidates(ctx);
      expect(res.candidates).toEqual([]);
      expect(res.isNextWord).toBe(false);
    });

    it('returns nextWord predictions for "không " (trailing space)', () => {
      const ctx = extractImeContext('không ');
      const res = getCandidates(ctx);
      expect(res.isNextWord).toBe(true);
      expect(res.candidates.length).toBeGreaterThan(0);
    });

    it('does not return more than 4 candidates', () => {
      const ctx = extractImeContext('ch');
      const res = getCandidates(ctx);
      expect(res.candidates.length).toBeLessThanOrEqual(4);
    });
  });
});
