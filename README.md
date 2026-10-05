# SlipCheck — Real Slip Verification + LINE MINI App

ระบบตัวอย่างสำหรับ:
- อัปโหลดสลิปธนาคารไทย
- ตรวจสอบผ่าน EasySlip API v2
- ตรวจสลิปซ้ำด้วย `checkDuplicate`
- ตรวจบัญชีผู้รับด้วย `matchAccount`
- ตรวจยอดด้วย `matchAmount`
- เก็บประวัติใน SQLite
- พร้อมนำ URL ไปตั้งเป็น LINE MINI App / LIFF และเปิดจาก Rich Menu ของ LINE Official Account

## 1) เตรียม EasySlip

สมัคร Developer และสร้าง API Key จาก EasySlip Developer Portal

เอกสาร API:
https://document.easyslip.com/th/v2/

ระบบนี้เรียก:
`POST https://api.easyslip.com/v2/verify/bank`

โดยส่งรูปผ่าน `multipart/form-data`

API key ต้องอยู่ใน `.env` ฝั่ง server เท่านั้น

## 2) ติดตั้ง

```bash
npm install
cp .env.example .env
```

แก้ `.env`:
```env
EASYSLIP_API_KEY=ใส่คีย์จริง
EXPECTED_AMOUNT=500
MATCH_ACCOUNT=true
```

จากนั้น:
```bash
npm start
```

เปิด:
`http://localhost:3000`

## 3) การป้องกันสลิปซ้ำ

ระบบใช้ 2 ชั้น:
1. ขอ EasySlip ตรวจ `checkDuplicate=true`
2. บันทึก `transRef` ลง SQLite พร้อม UNIQUE constraint

ดังนั้นถ้า API ตอบว่าสลิปซ้ำ หรือ `transRef` เคยถูกบันทึกในฐานข้อมูล ระบบจะไม่ยืนยันการชำระเงินซ้ำ

## 4) การตรวจยอดและบัญชีผู้รับ

ส่ง:
- `matchAmount`
- `matchAccount`

ไปพร้อมกับคำขอ EasySlip

ถ้าต้องการให้ตรวจบัญชีผู้รับ ต้องลงทะเบียนบัญชีผู้รับใน EasySlip Developer Portal ก่อน

## 5) ต่อ LINE Official Account

LINE MINI App/LIFF ต้องมี HTTPS เมื่อ deploy จริง

ขั้นตอน:
1. สร้าง LINE Developers Channel สำหรับ LINE MINI App/LIFF
2. ตั้ง Endpoint URL เป็น:
   `https://โดเมนของคุณ/`
3. ตั้ง LIFF ID ใน `.env`
4. ตั้ง Rich Menu ของ LINE Official Account ให้เปิด LIFF URL / permanent link
5. เปิดหน้าเว็บจาก LINE

LINE ระบุว่าสามารถตั้ง LIFF URL หรือ permanent link ของ LINE MINI App ใน Rich Menu ได้

## 6) Production

แนะนำ:
- Render / Railway / VPS สำหรับ Node.js
- PostgreSQL แทน SQLite เมื่อมีผู้ใช้จำนวนมาก
- HTTPS
- จำกัดชนิดและขนาดไฟล์
- ไม่เก็บ API key ใน frontend
- ตั้ง IP whitelist ใน EasySlip ถ้าโฮสต์รองรับ static outbound IP
- สำรองฐานข้อมูล

> Demo นี้ไม่สามารถตรวจสลิปจริงจนกว่าจะใส่ EASYSLIP_API_KEY และตั้งค่า EasySlip/บัญชีรับเงินของคุณ
