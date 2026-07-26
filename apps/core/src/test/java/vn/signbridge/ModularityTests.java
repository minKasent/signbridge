package vn.signbridge;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

/**
 * Kiểm chứng ranh giới module (không cần Spring context / DB / Docker).
 * generateDocs() sinh sơ đồ C4 + module canvas vào target/spring-modulith-docs
 * — dùng trực tiếp cho chương kiến trúc của báo cáo.
 */
class ModularityTests {

	static final ApplicationModules modules = ApplicationModules.of(CoreApplication.class);

	@Test
	void verifyModuleStructure() {
		modules.verify();
	}

	@Test
	void generateDocumentation() {
		new Documenter(modules).writeDocumentation();
	}
}
