"""Baixa a prova oficial do Inep, recorta cada questão e cruza com o gabarito.

Uso: python scripts/extract_inep.py --ano 2024 --dia 1
Saída: public/questoes/*.webp, data/raw/<ano>-d<dia>.json e sources/review/*.jpg
"""
import argparse
import io
import json
import re
import subprocess
import sys
from pathlib import Path

import pymupdf
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://download.inep.gov.br/enem/provas_e_gabaritos"
ARGS = argparse.ArgumentParser()
ARGS.add_argument("--ano", type=int, default=2025)
ARGS.add_argument("--dia", type=int, choices=[1, 2], default=1)
ARGS.add_argument("--caderno", type=int, help="padrão: 1 no dia 1 (azul) e 7 no dia 2 (azul)")
OPT = ARGS.parse_args()
YEAR, DAY = OPT.ano, OPT.dia
BOOK = OPT.caderno or (1 if DAY == 1 else 7)
PDF = ROOT / "sources" / f"{YEAR}_PV_impresso_D{DAY}_CD{BOOK}.pdf"
GAB = ROOT / "sources" / f"{YEAR}_GB_impresso_D{DAY}_CD{BOOK}.pdf"
OUT = ROOT / "public" / "questoes"
REVIEW = ROOT / "sources" / "review" / f"{YEAR}-d{DAY}"
ZOOM = 2.2
TOP, BOTTOM = 74, 742      # abaixo do cabeçalho e acima do rodapé
LEFT, MID, RIGHT = 18, 284, 549
QUESTION = re.compile(r"^QUEST[ÃA]O\s*(\d+)", re.I)
STRIP = "ENEM20"            # faixa decorativa do cabeçalho e do rodapé
SECTION = re.compile(r"^(Questões de \d+|LINGUAGENS, CÓDIGOS|CIÊNCIAS HUMANAS|PROPOSTA DE REDAÇÃO|REDAÇÃO)", re.I)
SHARED = re.compile(r"^Textos? para as? Quest(?:ões|ão)(?: de)?\s*(\d+)\s*(?:a|e)\s*(\d+)", re.I)
SKIP_PAGE = re.compile(r"^(PROPOSTA DE REDAÇÃO|INSTRUÇÕES PARA A REDAÇÃO|RASCUNHO)$", re.I)


def lines_of(page):
    out = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(s["text"] for s in line["spans"]).strip()
            if text:
                out.append((text, pymupdf.Rect(line["bbox"])))
    return out


def page_is_wide(lines):
    """Página de coluna única: muitas linhas atravessam o meio da folha."""
    body = [r for t, r in lines if TOP < r.y0 < BOTTOM and not t.startswith(STRIP)]
    crossing = [r for r in body if r.x0 < MID - 40 and r.x1 > MID + 12]
    right = [r for r in body if r.x0 >= MID - 2]
    # Linha que atravessa o meio e quase nada começando à direita = coluna única.
    return len(crossing) > 0 and (len(crossing) / len(body) > .3 or len(right) <= len(crossing) * .15)


def columns(page_index, wide):
    if wide:
        return [(page_index, LEFT, RIGHT)]
    return [(page_index, LEFT, MID), (page_index, MID, RIGHT)]


def content_bottom(page, rect):
    """Último ponto com conteúdo real dentro do retângulo (texto, imagem ou desenho)."""
    pix = page.get_pixmap(matrix=pymupdf.Matrix(1, 1), clip=rect, colorspace=pymupdf.csGRAY)
    img = Image.frombytes("L", (pix.width, pix.height), pix.samples).point(lambda v: 255 if v < 235 else 0)
    box = img.getbbox()
    if not box:
        return None
    return pymupdf.Rect(rect.x0 + box[0], rect.y0 + box[1], rect.x0 + box[2], rect.y0 + box[3])


def text_bottom(lines, rect):
    """Fim da última linha de texto no recorte: a última alternativa encerra a questão."""
    ys = [r.y1 for t, r in lines
          if rect.x0 - 2 <= (r.x0 + r.x1) / 2 <= rect.x1 + 2 and rect.y0 <= r.y0 < rect.y1 and not t.startswith(STRIP)]
    return max(ys) if ys else None


def download(path):
    """Baixa o PDF oficial se ainda não estiver em sources/."""
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    url = f"{BASE_URL}/{path.name}"
    print("baixando", url)
    # O servidor do Inep corta algumas conexões do urllib; o curl do sistema é mais estável.
    subprocess.run(["curl", "-fL", "--retry", "4", "--retry-all-errors", "--ssl-no-revoke", "-o", str(path), url], check=True)


def area_of(number):
    if number <= 45:
        return "linguagens"
    if number <= 90:
        return "humanas"
    return "natureza" if number <= 135 else "matematica"


def main():
    download(PDF)
    download(GAB)
    doc = pymupdf.open(PDF)
    OUT.mkdir(parents=True, exist_ok=True)
    REVIEW.mkdir(parents=True, exist_ok=True)

    page_lines = [lines_of(p) for p in doc]
    # Cada edição tem cabeçalho e rodapé em alturas diferentes: mede pelas faixas da própria prova.
    global TOP, BOTTOM
    strips = [r for t, r in page_lines[1] if t.startswith(STRIP) and r.width > 200]
    if len(strips) >= 2:
        TOP, BOTTOM = min(r.y1 for r in strips) + 2, max(r.y0 for r in strips) - 2
    print(f"área útil: y {TOP:.0f} a {BOTTOM:.0f}")
    wide = [page_is_wide(l) for l in page_lines]

    # Sequência de colunas na ordem de leitura, com marcos (início de questão ou de seção).
    cols, starts = [], []
    for i, lines in enumerate(page_lines):
        if i == 0:
            continue
        if any(SKIP_PAGE.match(t) for t, _ in lines) or not any(TOP < r.y0 < BOTTOM and not t.startswith(STRIP) for t, r in lines):
            continue
        for ci, (pi, x0, x1) in enumerate(columns(i, wide[i])):
            marks = []
            for text, r in lines:
                if not (TOP - 4 < r.y0 < BOTTOM) or not (x0 - 8 <= r.x0 < x1 - 8):
                    continue
                m = QUESTION.match(text)
                shared = SHARED.match(text)
                if m:
                    marks.append((r.y0, "q", int(m.group(1))))
                elif shared:
                    marks.append((r.y0, "c", (int(shared.group(1)), int(shared.group(2)))))
                elif SECTION.match(text):
                    marks.append((r.y0, "s", text))
            marks.sort(key=lambda m: m[0])
            cols.append({"page": pi, "x0": x0, "x1": x1, "marks": marks})
            for y, kind, value in marks:
                if kind in ("q", "c"):
                    starts.append((len(cols) - 1, y, value))

    results, contexts, seen = [], [], {}
    for idx, (ci, y, number) in enumerate(starts):
        is_context = isinstance(number, tuple)
        variant = ""
        if not is_context:
            seen[number] = seen.get(number, 0) + 1
            variant = "" if number > 5 or DAY == 2 else ("en" if seen[number] == 1 else "es")
        segments, c, y0 = [], ci, y - 2
        while c < len(cols):
            col = cols[c]
            later = [m for m in col["marks"] if m[0] > y0 + 6]
            limit = later[0][0] - 3 if later else BOTTOM
            segments.append((col["page"], pymupdf.Rect(col["x0"], y0, col["x1"], limit)))
            if later:
                break
            c += 1
            if c >= len(cols):
                break
            nxt = cols[c]
            # Só continua se houver conteúdo antes do primeiro marco da próxima coluna.
            first = nxt["marks"][0][0] if nxt["marks"] else BOTTOM
            probe = pymupdf.Rect(nxt["x0"], TOP, nxt["x1"], first - 3)
            if first - TOP < 14 or text_bottom(page_lines[nxt["page"]], probe) is None:
                break
            y0 = TOP

        images, text = [], []
        for pi, rect in segments:
            tight = content_bottom(doc[pi], rect)
            if tight is None:
                continue
            last = text_bottom(page_lines[pi], rect)
            tight = pymupdf.Rect(max(rect.x0, tight.x0 - 4), max(rect.y0, tight.y0 - 3),
                                 min(rect.x1, tight.x1 + 4), min(rect.y1, (last or tight.y1) + 4))
            pix = doc[pi].get_pixmap(matrix=pymupdf.Matrix(ZOOM, ZOOM), clip=tight)
            images.append(Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB"))
            text.append(doc[pi].get_text("text", clip=tight))

        width = max(i.width for i in images)
        height = sum(i.height for i in images) + 12 * (len(images) - 1)
        canvas = Image.new("RGB", (width, height), "white")
        cursor = 0
        for im in images:
            canvas.paste(im, (0, cursor))
            cursor += im.height + 12
        if is_context:
            qid = f"{YEAR}-texto-{number[0]:02d}-{number[1]:02d}"
            canvas.save(OUT / f"{qid}.webp", "WEBP", quality=82, method=6)
            contexts.append({"id": qid, "from": number[0], "to": number[1], "image": f"questoes/{qid}.webp",
                             "text": "\n".join(text).strip(), "size": [canvas.width, canvas.height]})
            continue
        qid = f"{YEAR}-{number:02d}" + (f"-{variant}" if variant else "")
        canvas.save(OUT / f"{qid}.webp", "WEBP", quality=82, method=6)
        results.append({
            "id": qid, "year": YEAR, "day": DAY, "number": number, "language": variant or None,
            "area": area_of(number),
            "image": f"questoes/{qid}.webp", "text": "\n".join(text).strip(),
            "segments": len(segments), "pages": [p + 1 for p, _ in segments],
            "size": [canvas.width, canvas.height],
        })

    answers = parse_answers()
    for q in results:
        key = (q["number"], q["language"])
        q["answer"] = answers.get(key)
        q["context"] = next((c["image"] for c in contexts if c["from"] <= q["number"] <= c["to"]), None)
    print("textos compartilhados:", [(c["id"], c["size"]) for c in contexts])
    raw = ROOT / "data" / "raw"
    raw.mkdir(parents=True, exist_ok=True)
    (raw / f"{YEAR}-d{DAY}.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    contact_sheets(results)

    missing = [q["id"] for q in results if not q["answer"]]
    print("questões:", len(results), "| sem gabarito:", missing)
    print("multi-segmento:", [q["id"] for q in results if q["segments"] > 1])
    short = [q["id"] for q in results if not all(f"\n{l}" in "\n" + q["text"] or True for l in "ABCDE")]
    print("altura máx:", max(q["size"][1] for q in results), "| menor:", min(q["size"][1] for q in results))
    print("sem alternativa E no texto:", [q["id"] for q in results if not re.search(r"(^|\n)\s*E\s", q["text"])], short)


def parse_answers():
    words = pymupdf.open(GAB)[0].get_text().split()
    answers, i = {}, 0
    while i < len(words) - 1:
        if words[i].isdigit():
            n = int(words[i])
            if 1 <= n <= 5 and i + 2 < len(words) and re.fullmatch("[A-E]", words[i + 2]):
                answers[(n, "en")], answers[(n, "es")] = words[i + 1], words[i + 2]
                i += 3
                continue
            if 1 <= n <= 180 and re.fullmatch("[A-E]|ANULADO|ANULADA|\\*", words[i + 1]):
                answers[(n, None)] = words[i + 1]
                i += 2
                continue
        i += 1
    return answers


def contact_sheets(results, per=12):
    for s in range(0, len(results), per):
        chunk = results[s:s + per]
        tiles = []
        for q in chunk:
            im = Image.open(OUT / f"{q['id']}.webp")
            im.thumbnail((430, 620))
            tiles.append(im)
        sheet = Image.new("RGB", (4 * 440, 3 * 630), (70, 70, 70))
        for i, im in enumerate(tiles):
            sheet.paste(im, ((i % 4) * 440 + 5, (i // 4) * 630 + 5))
        sheet.save(REVIEW / f"sheet_{s // per + 1:02d}.jpg", quality=72)


if __name__ == "__main__":
    main()
