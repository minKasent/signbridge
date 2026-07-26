// Test tích hợp: auth JWT, phân quyền, dataset, WebSocket + các lỗi vừa sửa
const BASE = "http://localhost:8080";
const ADMIN = { email: "admin@signbridge.vn", password: "signbridge-admin-dev" };
let passed = 0, failed = 0;

function check(name, cond, extra = "") {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
}

const post = (path, body, token) => fetch(`${BASE}${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});

function wsProbe(sendFn, { expectGloss = false } = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket("ws://localhost:8080/ws/translate");
    let glossCount = 0;
    const timer = setTimeout(() => { ws.close(); resolve({ glossCount, closeCode: null }); }, 12000);
    ws.onopen = () => sendFn(ws);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "gloss" && ++glossCount >= 2 && expectGloss) {
        clearTimeout(timer); ws.close(); resolve({ glossCount, closeCode: null });
      }
    };
    ws.onclose = (e) => { clearTimeout(timer); resolve({ glossCount, closeCode: e.code }); };
  });
}

const randomFrames = (n, dims = 144) =>
  Array.from({ length: n }, () => Array.from({ length: dims }, () => Math.random()));

async function main() {
  // --- 1. Auth ---
  console.log("1. Auth");
  const email = `user${Date.now() % 1000000}@signbridge.vn`;
  let res = await post("/api/auth/register", { email, password: "matkhau-manh-123", displayName: "User Test" });
  const user = await res.json();
  check("đăng ký → 201", res.status === 201, `(got ${res.status})`);
  check("đăng ký công khai CHỈ được quyền USER", user.role === "USER", `(got ${user.role})`);

  res = await post("/api/auth/register", { email, password: "matkhau-manh-123", displayName: "Trùng" });
  check("email trùng → 409 (không phải 500)", res.status === 409, `(got ${res.status})`);

  res = await post("/api/auth/login", ADMIN);
  const admin = await res.json();
  check("admin bootstrap đăng nhập được", res.status === 200 && admin.role === "ADMIN", `(got ${res.status}/${admin.role})`);

  res = await post("/api/auth/login", { email: ADMIN.email, password: "sai" });
  check("sai mật khẩu → 401", res.status === 401, `(got ${res.status})`);

  // --- 2. Phân quyền ---
  console.log("2. Phân quyền");
  const sign = { gloss: `TEST_${Date.now() % 100000}`, meaningVi: "ký hiệu test", category: "DAILY" };
  res = await post("/api/signs", sign);
  check("ghi từ điển không token → 401", res.status === 401, `(got ${res.status})`);

  res = await post("/api/signs", sign, user.token);
  check("ghi từ điển bằng token USER → 403", res.status === 403, `(got ${res.status})`);

  res = await post("/api/signs", sign, admin.token);
  check("ghi từ điển bằng token ADMIN → 201", res.status === 201, `(got ${res.status})`);

  // --- 3. Dataset ---
  console.log("3. Dataset");
  res = await post("/api/dataset/samples", { gloss: "XIN_CHAO", signerName: "AutoTest", fps: 25, frames: randomFrames(20) });
  check("mẫu hợp lệ → 201", res.status === 201, `(got ${res.status})`);

  res = await post("/api/dataset/samples", { gloss: "XIN_CHAO", signerName: "AutoTest", fps: 25, frames: randomFrames(20, 100) });
  check("mẫu sai chiều → 400", res.status === 400, `(got ${res.status})`);

  res = await post("/api/dataset/samples", { gloss: "GLOSS_KHONG_CO_THAT", signerName: "X", fps: 25, frames: randomFrames(20) });
  check("gloss không có trong từ điển → 400", res.status === 400, `(got ${res.status})`);

  res = await post("/api/dataset/samples", { gloss: "…", signerName: "X", fps: 25, frames: randomFrames(20) });
  check("gloss toàn ký tự lạ → 400 (không ghi vào thư mục gốc)", res.status === 400, `(got ${res.status})`);

  res = await fetch(`${BASE}/api/dataset/stats`);
  const stats = await res.json();
  check("stats có XIN_CHAO ≥ 1", res.status === 200 && (stats.XIN_CHAO ?? 0) >= 1, JSON.stringify(stats).slice(0, 80));

  // --- 3b. Chiều ngược: câu → chuỗi ký hiệu ---
  console.log("3b. Compose (chiều ngược)");
  res = await fetch(`${BASE}/api/signs/compose?text=${encodeURIComponent("Tôi bị đau bụng!")}`);
  const composed = await res.json();
  check("compose khớp cụm 'đau bụng' nguyên cụm", res.status === 200 &&
    composed.items.some((s) => s.meaningVi === "đau bụng"), JSON.stringify(composed).slice(0, 100));
  check("compose báo từ thiếu ('bị')", composed.missing.includes("bị"));

  // --- 3c. Upload clip webm (đường trang /record dùng) ---
  console.log("3c. Upload clip webm");
  const signForClip = { gloss: `TEST_CLIP_${Date.now() % 100000}`, meaningVi: "test clip", category: "DAILY" };
  res = await post("/api/signs", signForClip, admin.token);
  const createdSign = await res.json();
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(2048)], { type: "video/webm" }), "test.webm");
  res = await fetch(`${BASE}/api/signs/${createdSign.id}/clip`, {
    method: "POST", headers: { Authorization: `Bearer ${admin.token}` }, body: form,
  });
  const withClip = res.ok ? await res.json() : {};
  check("upload webm với ADMIN → clipUrl được gán", res.ok && /^\/clips\/sign-\d+\.webm$/.test(withClip.clipUrl ?? ""), `(got ${res.status} ${withClip.clipUrl})`);

  res = await fetch(`${BASE}/api/signs/${createdSign.id}/clip`, { method: "POST", body: (() => { const f = new FormData(); f.append("file", new Blob([new Uint8Array(16)], { type: "video/webm" }), "x.webm"); return f; })() });
  check("upload clip không token → 401", res.status === 401, `(got ${res.status})`);

  // --- 4. WebSocket ---
  console.log("4. WebSocket");
  const ok = await wsProbe((ws) => {
    let batch = 0;
    const iv = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN || batch >= 12) return clearInterval(iv);
      ws.send(JSON.stringify({ type: "frames", frames: randomFrames(5) }));
      batch++;
    }, 80);
  }, { expectGloss: true });
  check("stream hợp lệ → nhận ≥2 gloss", ok.glossCount >= 2, `(got ${ok.glossCount}, close ${ok.closeCode})`);

  // 100 frame toàn số 0 → payload nhỏ (lọt qua trần 256KB của Tomcat) nhưng vượt
  // MAX_BATCH_FRAMES=60 → phải bị chính handler chặn bằng 1008
  const zeroFrames = Array.from({ length: 100 }, () => new Array(144).fill(0));
  const oversized = await wsProbe((ws) => ws.send(JSON.stringify({ type: "frames", frames: zeroFrames })));
  check("lô quá nhiều frame (100) → đóng phiên 1008", oversized.closeCode === 1008, `(got ${oversized.closeCode})`);

  // Payload khổng lồ vẫn bị Tomcat chặn ở tầng buffer (1009) — phòng thủ nhiều lớp
  const huge = await wsProbe((ws) => ws.send(JSON.stringify({ type: "frames", frames: randomFrames(500) })));
  check("payload vượt 256KB → Tomcat đóng 1009", huge.closeCode === 1009, `(got ${huge.closeCode})`);

  const badDims = await wsProbe((ws) => ws.send(JSON.stringify({ type: "frames", frames: randomFrames(5, 3) })));
  check("frame sai chiều → đóng phiên 1008", badDims.closeCode === 1008, `(got ${badDims.closeCode})`);

  console.log(`\nKẾT QUẢ: ${passed} pass, ${failed} fail`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("Lỗi test:", e); process.exit(1); });
