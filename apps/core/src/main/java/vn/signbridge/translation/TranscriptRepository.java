package vn.signbridge.translation;

import org.springframework.data.jpa.repository.JpaRepository;

interface TranscriptRepository extends JpaRepository<TranscriptRecord, Long> {
}
