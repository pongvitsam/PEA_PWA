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

## เปิด GitHub Pages (ทำครั้งเดียว)

โค้ดและ workflow พร้อมแล้ว — ถ้าเปิดแล้วเห็น **404 File not found** แปลว่ายังไม่ได้ตั้งค่า Pages

1. เปิด [Settings → Pages](https://github.com/pongvitsam/PEA_PWA/settings/pages)
2. ที่ **Build and deployment** → **Source** เลือก **GitHub Actions** (ไม่ใช่ Deploy from a branch)
3. ไปที่ [Actions → Deploy GitHub Pages](https://github.com/pongvitsam/PEA_PWA/actions/workflows/pages.yml) แล้วกด **Run workflow** (หรือรอ push ใหม่ให้รันอัตโนมัติ)
4. รอ workflow ✅ เสร็จ แล้วเปิด `https://pongvitsam.github.io/PEA_PWA/`

**ทางเลือก (ถ้าใช้ Deploy from a branch):** Branch **`gh-pages`** → Folder **`/ (root)`** — อย่าเลือก `main` / `(root)` เพราะไม่มี `index.html` ที่ root ของ main

> ถ้ายัง 404: ตรวจว่า Source = **GitHub Actions** และ workflow Deploy GitHub Pages รันสำเร็จแล้ว

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
