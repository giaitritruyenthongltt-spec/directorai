# Tái cấu trúc cơ chế Panel — state dùng chung (sửa "đổi tab mất map")

> Phản hồi người dùng: "lấy path map tốt rồi, NHƯNG đổi tab quay lại phải map
> lại. Tab Tự động không thấy chức năng map. Các tab khác cần xem lại cơ chế."

## Chẩn đoán gốc (phân tích sâu 7 tab)

1. **Mất state khi đổi tab** — `App.tsx` render `{activeTab==='x' && <XTab/>}` →
   tab cũ UNMOUNT → `clips`, `seqName`, đường dẫn đã map, `plan` **mất sạch**.
2. **Không có state dùng chung** — mỗi tab tự giữ `clips`/`clipText`/`folderText`
   riêng → map ở FilmTab thì AutoTab không biết.
3. **AutoTab thiếu chức năng map path** — chỉ có quét thư mục + nhập tay, KHÔNG
   có "Lấy path từ project" (resolveFromProject chỉ ở FilmTab).
4. **Lặp logic** — `loadFromSequence`, `scanFolders`, subscribe `conn` lặp ở
   FilmTab/AutoTab/DirectorTab.
5. **Guard kết nối không nhất quán** — AnalysisTab/StylePicker/ContextTab KHÔNG
   check `wsClient.state` trước khi gọi RPC.

## Kiến trúc mới

```
App
 └─ SessionProvider  (state DÙNG CHUNG, sống ở cấp App — KHÔNG unmount theo tab)
     ├─ conn            (1 subscribe duy nhất)
     ├─ clips[]         (kèm path đã resolve) + seqName
     ├─ folderText      (chia sẻ)
     ├─ editPlan        (session cache)
     └─ actions: loadClips / resolveFromProject / scanFolders
 └─ Tabs  (useSession() — chỉ render, data nằm ở context → đổi tab KHÔNG mất)
     └─ <ClipSourcePanel/>  (khối "Nguồn clip" DÙNG CHUNG: nạp / lấy-path-project
                              / quét thư mục / bảng clip) — mọi tab nhúng được
```

## Danh sách hạng mục (R = refactor state, F = fix cơ chế)

### Nhóm R — State dùng chung (sửa đúng điểm đau)

| #      | Hạng mục                                      | Chi tiết                                                                                                       |
| ------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **R1** | `SessionProvider` + `useSession`              | Context giữ conn/clips/seqName/folderText/editPlan + actions. 1 subscribe conn. Tự nạp clip khi connected.     |
| **R2** | Bọc `App` bằng SessionProvider                | Mọi tab truy cập state chung; đổi tab không mất.                                                               |
| **R3** | `ClipSourcePanel` dùng chung                  | Khối: [Nạp lại][🎯 Lấy path từ project][▸ Quét thư mục] + ClipTable. Đọc/ghi context. Dùng ở mọi tab cần clip. |
| **R4** | FilmTab dùng useSession + ClipSourcePanel     | Bỏ state clip cục bộ; plan đẩy lên context.                                                                    |
| **R5** | **AutoTab dùng useSession + ClipSourcePanel** | THÊM chức năng map path (đang thiếu); bỏ clipText nhập tay, dùng clips chung.                                  |
| **R6** | AnalysisTab dùng clips chung                  | Bỏ textarea; phân tích trực tiếp clip đã nạp; + guard kết nối.                                                 |
| **R7** | Bỏ subscribe conn lặp                         | conn lấy từ context (1 nguồn).                                                                                 |
| **R8** | editPlan session cache                        | Lập kế hoạch ở FilmTab xong, đổi tab vẫn giữ.                                                                  |

### Nhóm F — Fix cơ chế từng tab (polish)

| #      | Hạng mục                                         | File:Line               |
| ------ | ------------------------------------------------ | ----------------------- |
| **F1** | AnalysisTab thiếu guard kết nối                  | AnalysisTab.tsx:45      |
| **F2** | ContextTab health re-check khi reconnect         | ContextTab.tsx:29-39    |
| **F3** | AutoTab reset preview khi nạp lại clip           | AutoTab.tsx:116         |
| **F4** | DirectorTab huỷ polling khi unmount/đổi tab      | DirectorTab.tsx:216-232 |
| **F5** | StylePicker reset YAML khi đổi mode              | StylePicker.tsx:192     |
| **F6** | ticked modules + folderText persist localStorage | AutoTab.tsx:58          |

## Thứ tự thực thi

R1 → R2 → R3 → R4 → R5 → R6 → R7/R8 (lõi, sửa đúng điểm đau) → rồi F1–F6 (polish).

## Tiêu chí "xong"

- Map path **1 lần** ở bất kỳ tab nào → **mọi tab thấy** + **đổi tab không mất**.
- Tab Tự động **có** nút lấy path như Film.
- Mọi tab gọi RPC đều có guard kết nối.
