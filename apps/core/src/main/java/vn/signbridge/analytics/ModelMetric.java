package vn.signbridge.analytics;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * Kết quả đánh giá của một lần huấn luyện model (bảng `model_metrics` trong PLAN §3).
 *
 * Là chỗ chứa số liệu cho chương đánh giá của báo cáo: mỗi vòng train (VD "exp03")
 * ghi một dòng, dashboard /stats hiện lịch sử để thấy accuracy tiến triển theo version.
 */
@Entity
@Table(name = "model_metrics")
@Getter
@Setter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
class ModelMetric {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	/** Tên vòng huấn luyện, khớp run trên W&B (VD "exp03-voya-pretrain"). */
	@Column(nullable = false)
	private String version;

	/** Top-1 accuracy trên test split, 0..1. */
	@Column(nullable = false)
	private double accuracy;

	/** Top-5 accuracy — để null khi vòng train không đo. */
	private Double top5Accuracy;

	/** Số lớp gloss của vòng train đó (30, 100, 161…). */
	private Integer numClasses;

	@Column(length = 500)
	private String note;

	@Column(nullable = false)
	private Instant recordedAt;
}
