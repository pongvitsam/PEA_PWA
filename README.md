# PEA/PWA Smart Map System

ระบบแผนที่ ฐานข้อมูลโครงการ และ **แผนดับไฟ** สำหรับ PEA/PWA

## โครงสร้าง

| ส่วน | ที่อยู่ | คำอธิบาย |
|------|--------|----------|
| **GitHub Pages (เร็ว)** | `docs/` | หน้า Login + แอป (`index.html`, `app.html`) |
| **Google Apps Script (เดิม)** | `Index.html`, `รหัส.js` | Backend + ลิงก์ `/exec` เดิมยังใช้ได้ |

## URL

- **GitHub Pages:** `https://pongvitsam.github.io/PEA_PWA/` (หลังเปิด Pages)
- **Apps Script (เดิม):** [Web App](https://script.google.com/macros/s/AKfycbwEIi5cZDzvdGqcfqcsJcPjW1pBnTALtZFlGYZDkCYl9MTvOL0wuv4mBOEny4UUzyk9/exec)

## เปิด GitHub Pages (ใช้สาขา `main`)

ไฟล์เว็บอยู่ในโฟลเดอร์ **`docs/`** บนสาขา **`main`**

1. เปิด [Settings → Pages](https://github.com/pongvitsam/PEA_PWA/settings/pages)
2. **Build and deployment** → **Source** เลือก **Deploy from a branch**
3. **Branch:** **`main`** → **Folder:** **`/docs`** → **Save**
4. รอ 1–3 นาที (GitHub จะรัน *pages build and deployment* อัตโนมัติ)
5. เปิด `https://pongvitsam.github.io/PEA_PWA/` — ควรเห็นหน้า Login

> **อย่าเลือก** `main` / `(root)` — ไม่มี `index.html` ที่ root ของ repo (มีแค่ใน `docs/`) จึงขึ้น 404

## Deploy Backend (Apps Script)

```powershell
cd PEA-PWA
clasp push --force
clasp deploy -i AKfycbwEIi5cZDzvdGqcfqcsJcPjW1pBnTALtZFlGYZDkCYl9MTvOL0wuv4mBOEny4UUzyk9 -d "description"
```

## หมายเหตุ

- หน้า Login อยู่ที่ `docs/index.html` — หลัง login ไป `app.html`
- GitHub Pages เรียก API ผ่าน `docs/js/gas-api.js` → `doPost` ใน `รหัส.js`
- ลิงก์ Apps Script เดิมยังเปิด `Index.html` โดยตรงได้ (ไม่ผ่าน GitHub Pages)
