package vn.signbridge.translation;

import org.springframework.data.jpa.repository.JpaRepository;

interface TranslationSessionRepository extends JpaRepository<TranslationSessionRecord, Long> {
}
