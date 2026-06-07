# PATH-FIX — Lấy đường dẫn file đầy đủ của clip (chuỗi phương án + kết quả)

> Vấn đề: plugin chỉ thấy TÊN clip (basename), không có đường dẫn đầy đủ →
> AI không đọc được file, "scan không ra path". Yêu cầu: buộc lấy được path.

## Nguyên nhân GỐC (xác minh live + tài liệu Adobe)

`getMediaFilePath()` **KHÔNG nằm trên `ProjectItem`** — nó nằm trên lớp con
**`ClipProjectItem`** (Adobe UXP docs, minversion 25.0; trả **full path, SYNC**).
Code cũ gọi trên `ProjectItem` thô → method không tồn tại → throw → rơi về
basename → `withFullPath: 0` cho cả 413 clip.

Chẩn đoán live (`_debug.introspect`) chứng minh:

```
projItemMembers = [addEventListener, createSetColorLabelAction,
  createSetNameAction, getColorLabelIndex, getId, getParent, getParentBin,
  getProject, name, type]          ← KHÔNG có getMediaFilePath
path_getMediaFilePath = "(no method)"
module có: ClipProjectItem, ProjectItem, ...   ← lớp đúng tồn tại
```

## Chuỗi 3 phương án (test → tối ưu)

| #     | Phương án                    | Cơ chế                                                                                                                            | Trạng thái                                   |
| ----- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **1** | UXP `ClipProjectItem.cast()` | cast ProjectItem→ClipProjectItem rồi `getMediaFilePath()` (sync, full path). Path về THẲNG trong listClips, không cần thao tác gì | ✅ code xong, cần **reload panel** để verify |
| **2** | Đọc thẳng `.prproj`          | `project.path` → server gunzip + parse `<ActualMediaFilePath>` → khớp clip. Authoritative, kể cả clip ở nhiều folder              | ✅ **VERIFIED LIVE**                         |
| **3** | Khớp ext-insensitive         | khớp ĐÚNG basename rồi bù bỏ-đuôi ("0530" ↔ "0530.mp4"); dùng cho cả folder-scan                                                  | ✅ xong                                      |
| (cũ)  | Folder-scan đoán mò          | user nhập thư mục → quét → khớp basename                                                                                          | giữ làm fallback cuối                        |

## Kết quả VERIFIED LIVE (project thật "PHONG DEP TRUY_6_1.prproj")

Phương án 2 (`context.resolveFromProject`), **không cần reload, không nhập thư mục**:

```
prprojPath  = \\?\E:\T11\PHONG DEP TRUY_6_1.prproj
mediaIndexed = 202
resolved     = 171 / 171   (0 sót)
path mẫu:
  C:\Users\KENLY\Desktop\New folder (2)\...\0530.mp4   ← folder A
  E:\T11\DJI_20251126100842_0003_D.MP4                  ← folder B
```

→ Clip nằm ở **NHIỀU folder khác nhau**, `.prproj` cho path CHÍNH XÁC từng clip
bất kể nằm đâu. Folder-scan chỉ-E:/T11 sẽ trượt clip ở Desktop; `.prproj` thì không.

## Thứ tự ưu tiên trong FilmTab (UI)

1. Mở sequence → tự nạp clip. **Sau khi reload**: Phương án 1 cho path luôn
   (clip có path ngay trong bảng, khỏi bấm gì).
2. Nếu còn clip thiếu path → bấm **"🎯 Lấy path tự động (từ project)"** (Phương án 2).
3. Cùng đường: **"Quét thư mục"** (fallback, mục nâng cao).

## Điều kiện / giới hạn

- Phương án 2 cần project đã **LƯU** (đọc file `.prproj` trên đĩa).
- Clip synthetic (Black Video, Bars & Tone, nested seq) không có path file →
  bỏ qua (đúng kỳ vọng).
- Server chạy cùng máy Premiere nên đọc được file `.prproj` trực tiếp.
