// Test luồng ghép câu: stream ký hiệu → nghỉ tay (frame toàn 0) → nhận câu tiếng Việt
let passed = 0, failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
};

const randomFrames = (n) => Array.from({ length: n }, () => Array.from({ length: 144 }, () => Math.random()));
const zeroFrames = (n) => Array.from({ length: n }, () => new Array(144).fill(0));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runSession({ flushManually = false } = {}) {
  return new Promise((resolve) => {
    const ws = new WebSocket("ws://localhost:8080/ws/translate");
    const glosses = [], sentences = [];
    const timer = setTimeout(() => { ws.close(); resolve({ glosses, sentences, timedOut: true }); }, 45000);

    ws.onopen = async () => {
      // Giai đoạn 1: ra ký hiệu (frame ngẫu nhiên → stub trả gloss khác nhau)
      for (let i = 0; i < 20; i++) {
        if (ws.readyState !== WebSocket.OPEN) break;
        ws.send(JSON.stringify({ type: "frames", frames: randomFrames(5) }));
        await sleep(60);
      }
      if (flushManually) {
        ws.send(JSON.stringify({ type: "flush" }));
      } else {
        // Giai đoạn 2: hạ tay (frame toàn 0 → stub trả NO_SIGN) → phải chốt câu
        for (let i = 0; i < 20; i++) {
          if (ws.readyState !== WebSocket.OPEN) break;
          ws.send(JSON.stringify({ type: "frames", frames: zeroFrames(5) }));
          await sleep(60);
        }
      }
      await sleep(12000); // chờ LLM trả về
      clearTimeout(timer);
      ws.close();
      resolve({ glosses, sentences, timedOut: false });
    };

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "gloss") glosses.push(msg.gloss);
      if (msg.type === "sentence") sentences.push(msg);
    };
    ws.onclose = () => { clearTimeout(timer); resolve({ glosses, sentences, timedOut: false }); };
  });
}

async function main() {
  console.log("1. Nghỉ tay → tự động chốt câu");
  const auto = await runSession();
  check("nhận được gloss", auto.glosses.length > 0, `(${auto.glosses.length})`);
  check("nhận được câu sau khi nghỉ tay", auto.sentences.length > 0, `(${auto.sentences.length})`);
  if (auto.sentences.length > 0) {
    const s = auto.sentences[0];
    console.log(`     → "${s.text}"  [nguồn: ${s.source}]`);
    console.log(`       gloss: ${s.glosses.join(" / ")}`);
    check("câu không rỗng", typeof s.text === "string" && s.text.trim().length > 0);
    check("câu do LLM ghép (không phải dự phòng)", s.source === "llm" || s.source === "cache", `(source=${s.source})`);
    check("có kèm danh sách gloss gốc", Array.isArray(s.glosses) && s.glosses.length > 0);
  }

  console.log("2. Chốt câu thủ công (nút 'Chốt câu')");
  const manual = await runSession({ flushManually: true });
  check("flush trả về câu", manual.sentences.length > 0, `(${manual.sentences.length})`);
  if (manual.sentences.length > 0) {
    console.log(`     → "${manual.sentences[0].text}"  [nguồn: ${manual.sentences[0].source}]`);
  }

  console.log(`\nKẾT QUẢ: ${passed} pass, ${failed} fail`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("Lỗi test:", e); process.exit(1); });
