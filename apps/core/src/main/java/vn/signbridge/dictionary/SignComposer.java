package vn.signbridge.dictionary;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;

/**
 * Chiều ngược của hệ thống: câu tiếng Việt → chuỗi ký hiệu trong từ điển.
 *
 * Thuật toán khớp-cụm-dài-nhất (greedy longest match): tại mỗi vị trí thử cụm
 * 4→3→2→1 từ so với nghĩa tiếng Việt của các ký hiệu ("đau bụng" phải ăn cụm
 * "đau bụng" chứ không tách thành "đau" + "bụng"). Từ không có trong từ điển
 * đưa vào danh sách "missing" để UI hiển thị trung thực — người Điếc cần biết
 * từ nào KHÔNG được dịch.
 */
@Service
@RequiredArgsConstructor
public class SignComposer {

	private static final int MAX_PHRASE_WORDS = 4;

	private final SignRepository signs;

	public ComposeResult compose(String text) {
		Map<String, Sign> byMeaning = new HashMap<>();
		for (Sign sign : signs.findAll()) {
			byMeaning.put(normalize(sign.getMeaningVi()), sign);
		}

		String[] words = normalize(text).split(" ");
		List<Sign> matched = new ArrayList<>();
		List<String> missing = new ArrayList<>();

		int i = 0;
		while (i < words.length) {
			if (words[i].isBlank()) {
				i++;
				continue;
			}
			Sign found = null;
			int consumed = 1;
			for (int n = Math.min(MAX_PHRASE_WORDS, words.length - i); n >= 1; n--) {
				String phrase = String.join(" ", java.util.Arrays.copyOfRange(words, i, i + n));
				Sign candidate = byMeaning.get(phrase);
				if (candidate != null) {
					found = candidate;
					consumed = n;
					break;
				}
			}
			if (found != null) {
				matched.add(found);
			}
			else {
				missing.add(words[i]);
			}
			i += consumed;
		}
		return new ComposeResult(matched, missing);
	}

	/** Chữ thường + bỏ dấu câu + gộp khoảng trắng (giữ nguyên dấu tiếng Việt). */
	static String normalize(String text) {
		String cleaned = Normalizer.normalize(text, Normalizer.Form.NFC)
				.toLowerCase(Locale.ROOT)
				.replaceAll("[.,!?;:…\"'()\\[\\]-]", " ")
				.replaceAll("\\s+", " ")
				.strip();
		return cleaned;
	}

	public record ComposeResult(List<Sign> items, List<String> missing) {
	}
}
