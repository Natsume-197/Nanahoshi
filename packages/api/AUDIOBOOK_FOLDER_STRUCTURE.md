# Audiobook Folder Structure

Nanahoshi uses the directory hierarchy to automatically infer audiobook metadata (author, series, title, and series position). This follows the same convention used by [Audiobookshelf](https://www.audiobookshelf.org/).

## Supported Folder Structures

The scanner determines metadata based on the **depth** of the folder structure relative to the library root.

### 3 Levels: Author / Series / Title (recommended)

```
/library-root/
  Author Name/
    Series Name/
      Vol 1 - Book Title/
        chapter01.mp3
        chapter02.mp3
        cover.jpg
      Vol 2 - Book Title/
        book.m4b
```

Detects: **author**, **series**, **title**, and **series position** (from folder name).

### 2 Levels: Author / Title

```
/library-root/
  Author Name/
    Book Title/
      chapter01.mp3
      chapter02.mp3
```

Detects: **author** and **title**.

### 1 Level: Title only

```
/library-root/
  Book Title/
    book.m4b
```

Detects: **title** only.

### Root level: Standalone file

```
/library-root/
  standalone-book.m4b
```

No metadata from folders. Title comes from audio file tags or filename.

## File Grouping Rules

### .m4b files (self-contained audiobooks)

Each `.m4b` file is treated as a **separate, standalone audiobook**, regardless of how many `.m4b` files are in the same folder. The `.m4b` format is a container with embedded chapters, so each file represents a complete audiobook.

**Multiple .m4b files in the same folder** are interpreted as volumes of a series:

```
/library-root/
  Mushoku Tensei/
    [1巻] 無職転生 1.m4b     → Audiobook 1 (series: "Mushoku Tensei", position: 1)
    [2巻] 無職転生 2.m4b     → Audiobook 2 (series: "Mushoku Tensei", position: 2)
```

With 1 ancestor folder and multiple siblings, the folder is inferred as the **series name**.

### Other formats (mp3, m4a, ogg, opus, flac, wma)

All audio files within the same directory are grouped as **tracks/chapters of a single audiobook**:

```
/library-root/
  Author/
    Book Title/
      01 - Chapter One.mp3    ┐
      02 - Chapter Two.mp3    ├─ One audiobook, 3 chapters
      03 - Chapter Three.mp3  ┘
```

### CD/Disc subfolders

Folders matching the pattern `CD 1`, `Disc 2`, `Disk 3`, `cd1`, etc. are **not** treated as separate audiobooks. Instead, their contents are collapsed into the parent audiobook folder. This handles multi-disc audiobooks correctly.

Pattern: `/^(cd|dis[ck])\s*\d{1,3}$/i`

```
/library-root/
  Author/
    Long Audiobook/
      CD 1/
        track01.mp3    ┐
        track02.mp3    │
      CD 2/            ├─ One audiobook (all tracks merged)
        track01.mp3    │
        track02.mp3    ┘
```

## Series Position Patterns

The scanner extracts series position from folder names and filenames using these patterns:

### Numbered patterns

| Pattern | Example | Position |
|---------|---------|----------|
| `[N巻]` | `[1巻] 無職転生` | 1 |
| `第N巻` | `第5巻 タイトル` | 5 |
| `N巻` | `1巻 タイトル` | 1 |
| `Vol N` / `Vol. N` / `Volume N` | `Vol. 3 - Title` | 3 |
| `Book N` | `Book 12 - Title` | 12 |
| Leading number | `1 - Wizards First Rule` | 1 |
| Trailing number | `Title 2` | 2 |

### Japanese positional words

| Pattern | Meaning | Position |
|---------|---------|----------|
| `上巻` / `(上)` / `（上）` | Upper volume (jōkan) | 1 |
| `中巻` / `(中)` / `（中）` | Middle volume (chūkan) | 2 |
| `下巻` / `(下)` / `（下）` | Lower volume (gekan) | 3 |
| `前編` | First part (zenpen) | 1 |
| `後編` | Second part (kōhen) | 2 |

### CD/Disc folder names

Folders matching these patterns are collapsed into the parent audiobook:

| Pattern | Examples |
|---------|----------|
| `cd\|disc\|disk` + number | `CD 1`, `Disc 2`, `disk3` |
| `ディスク` + number | `ディスク1`, `ディスク 2` |

## Metadata Priority

Audio file tags always take priority over folder-based hints:

1. **Audio tags** (album, artist, series, etc.) — highest priority
2. **Folder hierarchy** — fallback when tags are missing
3. **Filename** — last resort for title

## Examples

### Full structure (3 levels)

```
Audiobooks/
  Rifujin na Magonote/
    Mushoku Tensei/
      Vol 1 - 無職転生 1/
        audiobook.m4b
      Vol 2 - 無職転生 2/
        audiobook.m4b
```

Result:
- 2 audiobooks
- Author: "Rifujin na Magonote" (from folder)
- Series: "Mushoku Tensei" (from folder)
- Positions: 1 and 2 (from "Vol 1", "Vol 2")

### Flat .m4b with series (1 level)

```
Audiobooks/
  Mushoku Tensei/
    [1巻] 無職転生 1.m4b
    [2巻] 無職転生 2.m4b
```

Result:
- 2 audiobooks (each .m4b is standalone)
- Series: "Mushoku Tensei" (from parent folder, because there are multiple siblings)
- Positions: 1 and 2 (from `[1巻]` and `[2巻]` in filenames)

### Mixed formats

```
Audiobooks/
  Brandon Sanderson/
    The Way of Kings/
      chapter01.mp3
      chapter02.mp3
    Standalone Novel/
      book.m4b
```

Result:
- "The Way of Kings": 1 audiobook with 2 chapters, author = "Brandon Sanderson"
- "Standalone Novel": 1 audiobook, author = "Brandon Sanderson"
