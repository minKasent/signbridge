package vn.signbridge.analytics;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

interface ModelMetricRepository extends JpaRepository<ModelMetric, Long> {

	/** Mới nhất trước — dashboard hiện lịch sử từ vòng train gần nhất trở về trước. */
	List<ModelMetric> findAllByOrderByRecordedAtDesc();
}
