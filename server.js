require("dotenv").config();

const express = require("express");
const multer = require("multer");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "slips.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS slips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trans_ref TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL,
  date TEXT,
  sender_bank TEXT,
  sender_name TEXT,
  receiver_bank TEXT,
  receiver_name TEXT,
  status TEXT NOT NULL,
  is_duplicate INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ["image/jpeg","image/png","image/webp","image/gif"].includes(file.mimetype);
    cb(ok ? null : new Error("รองรับเฉพาะ JPG, PNG, WEBP หรือ GIF"), ok);
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function getAmount(data) {
  return Number(data?.amount?.amount ?? data?.amount ?? 0);
}
function getDate(data) {
  return data?.date || data?.transactionDate || data?.timestamp || null;
}
function getBank(x) {
  return x?.bank?.short || x?.bank?.shortCode || x?.bank?.nameTh || "-";
}
function getName(x) {
  return x?.account?.name?.th || x?.account?.name?.en || x?.name || "-";
}

app.post("/api/verify-slip", upload.single("slip"), async (req, res) => {
  try {
    if (!process.env.EASYSLIP_API_KEY) {
      return res.status(500).json({
        ok: false,
        code: "MISSING_SERVER_CONFIG",
        message: "ยังไม่ได้ตั้ง EASYSLIP_API_KEY ในไฟล์ .env"
      });
    }
    if (!req.file) {
      return res.status(400).json({ ok:false, message:"กรุณาอัปโหลดรูปสลิป" });
    }

    const expectedAmount = Number(req.body.expectedAmount || process.env.EXPECTED_AMOUNT || 0);

    const form = new FormData();
    form.append("image", new Blob([req.file.buffer], { type: req.file.mimetype }), req.file.originalname);
    form.append("checkDuplicate", "true");

    if (expectedAmount > 0) form.append("matchAmount", String(expectedAmount));
    if (String(process.env.MATCH_ACCOUNT).toLowerCase() === "true") form.append("matchAccount", "true");

    const apiResponse = await fetch("https://api.easyslip.com/v2/verify/bank", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.EASYSLIP_API_KEY}`
      },
      body: form
    });

    const result = await apiResponse.json();

    if (!apiResponse.ok || result?.success === false) {
      return res.status(apiResponse.status || 400).json({
        ok: false,
        code: result?.error?.code || "SLIP_VERIFY_FAILED",
        message: result?.error?.message || "ตรวจสอบสลิปไม่สำเร็จ",
        provider: result
      });
    }

    const data = result.data || {};
    const transRef = data.transRef;
    if (!transRef) {
      return res.status(422).json({ ok:false, message:"API ไม่ส่งเลขอ้างอิงธุรกรรมกลับมา" });
    }

    const amount = getAmount(data);
    const isDuplicateProvider = Boolean(data.isDuplicate || result.isDuplicate);

    const exists = db.prepare("SELECT id FROM slips WHERE trans_ref = ?").get(transRef);
    if (exists || isDuplicateProvider) {
      if (!exists) {
        db.prepare(`
          INSERT OR IGNORE INTO slips
          (trans_ref, amount, date, sender_bank, sender_name, receiver_bank, receiver_name, status, is_duplicate, raw_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'duplicate', 1, ?)
        `).run(
          transRef, amount, getDate(data), getBank(data.sender), getName(data.sender),
          getBank(data.receiver), getName(data.receiver), JSON.stringify(result)
        );
      }
      return res.status(409).json({
        ok:false,
        code:"DUPLICATE_SLIP",
        message:"สลิปนี้ถูกตรวจสอบ/ใช้งานแล้ว",
        transRef,
        amount,
        isDuplicate:true
      });
    }

    const amountMatched = expectedAmount <= 0
      ? true
      : Boolean(data.isAmountMatched ?? Math.abs(amount - expectedAmount) < 0.01);

    const accountMatched = String(process.env.MATCH_ACCOUNT).toLowerCase() !== "true"
      ? true
      : Boolean(data.matchedAccount);

    const accepted = amountMatched && accountMatched;

    db.prepare(`
      INSERT INTO slips
      (trans_ref, amount, date, sender_bank, sender_name, receiver_bank, receiver_name, status, is_duplicate, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      transRef, amount, getDate(data), getBank(data.sender), getName(data.sender),
      getBank(data.receiver), getName(data.receiver), accepted ? "success" : "rejected",
      JSON.stringify(result)
    );

    return res.json({
      ok: accepted,
      status: accepted ? "success" : "rejected",
      message: accepted ? "ตรวจสอบสลิปสำเร็จ" : "สลิปไม่ผ่านเงื่อนไขยอดเงินหรือบัญชีผู้รับ",
      transRef,
      amount,
      expectedAmount,
      amountMatched,
      accountMatched,
      duplicate:false,
      date:getDate(data),
      senderBank:getBank(data.sender),
      senderName:getName(data.sender),
      receiverBank:getBank(data.receiver),
      receiverName:getName(data.receiver)
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      ok:false,
      code:"SERVER_ERROR",
      message: err.message || "เกิดข้อผิดพลาดในเซิร์ฟเวอร์"
    });
  }
});

app.get("/api/history", (req,res) => {
  const rows = db.prepare(`
    SELECT id, trans_ref AS transRef, amount, date, sender_bank AS senderBank,
           sender_name AS senderName, receiver_bank AS receiverBank,
           receiver_name AS receiverName, status, is_duplicate AS isDuplicate,
           created_at AS createdAt
    FROM slips ORDER BY id DESC LIMIT 100
  `).all();
  res.json({ok:true, items:rows});
});

app.get("/api/health", (req,res) => {
  res.json({
    ok:true,
    easyslipConfigured:Boolean(process.env.EASYSLIP_API_KEY),
    lineConfigured:Boolean(process.env.LIFF_ID)
  });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ok:false,message:"ไฟล์มีขนาดเกิน 10 MB"});
  }
  res.status(400).json({ok:false,message:err.message || "ข้อมูลไม่ถูกต้อง"});
});

app.listen(PORT, () => {
  console.log(`SlipCheck running at http://localhost:${PORT}`);
});
