# -*- coding: utf-8 -*-
"""Build a study-friendly Excel workbook from the scraped A-class question bank JSON."""
import json
import math
import sys
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "题库数据"
SRC = [
    ("A类-2025新版", DATA / "A类题库_2025新版.json"),
]
OUT = ROOT / "成品题库" / "A类业余无线电台操作证题库.xlsx"

HEAD_FILL = PatternFill("solid", fgColor="1F4E79")
HEAD_FONT = Font(name="微软雅黑", size=10, bold=True, color="FFFFFF")
BODY_FONT = Font(name="微软雅黑", size=10)
ANS_FONT = Font(name="微软雅黑", size=10, bold=True, color="C00000")
CORRECT_FILL = PatternFill("solid", fgColor="E2EFDA")
BAND_FILL = PatternFill("solid", fgColor="F7F9FC")
THIN = Side(style="thin", color="D9D9D9")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
TOP_WRAP = Alignment(vertical="top", wrap_text=True)
CENTER_WRAP = Alignment(vertical="top", horizontal="center", wrap_text=True)

HEADERS = ["编号", "题号", "题型", "题干", "A", "B", "C", "D", "答案", "正确答案原文", "相似题号"]
WIDTHS = [6, 7, 8, 60, 27, 27, 27, 27, 7, 44, 14]
CENTER_COLS = (1, 2, 3, 9)
OPTION_COLS = (5, 6, 7, 8)

BANK_INFO = {
    "A类-2025新版": dict(
        set_desc="20250809 新版（现行题库）",
        scope="A类验证证书：30-3000MHz 频段，最大发射功率不大于 25W",
        url="https://exam.ham.upall.cn/?t=a_2025",
        count=683,
    ),
}


def est_height(values, widths):
    lines = 1
    for value, width in zip(values, widths):
        text = str(value or "")
        units = sum(2 if ord(ch) > 127 else 1 for ch in text)
        lines = max(lines, math.ceil(units / max(width - 2, 4)))
    return min(14.5 * lines + 6, 200)


def build_sheet(ws, data):
    qs = data["questions"]
    ws.append(HEADERS)
    for col, width in enumerate(WIDTHS, start=1):
        ws.column_dimensions[get_column_letter(col)].width = width
        cell = ws.cell(row=1, column=col)
        cell.fill = HEAD_FILL
        cell.font = HEAD_FONT
        cell.alignment = CENTER_WRAP
        cell.border = BORDER
    ws.row_dimensions[1].height = 26

    for idx, q in enumerate(qs, start=2):
        opts = [o["text"] for o in q["options"]] + [""] * 4
        correct = {o["label"] for o in q["options"] if o["correct"]}
        kind = "单选" if q["answerCount"] <= 1 else "多选(%d)" % q["answerCount"]
        row = [q["seq"], q["number"], kind, q["stem"], opts[0], opts[1], opts[2], opts[3],
               q["answer"], q["answerText"], ",".join(str(x) for x in q["similar"])]
        ws.append(row)
        band = (idx % 2 == 0)
        for col in range(1, len(HEADERS) + 1):
            cell = ws.cell(row=idx, column=col)
            cell.font = BODY_FONT
            cell.alignment = CENTER_WRAP if col in CENTER_COLS else TOP_WRAP
            cell.border = BORDER
            if band:
                cell.fill = BAND_FILL
        for col, label in zip(OPTION_COLS, ["A", "B", "C", "D"]):
            if label in correct:
                ws.cell(row=idx, column=col).fill = CORRECT_FILL
        ws.cell(row=idx, column=9).font = ANS_FONT
        ws.cell(row=idx, column=10).font = ANS_FONT
        ws.row_dimensions[idx].height = est_height(row, WIDTHS)

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = "A1:%s%d" % (get_column_letter(len(HEADERS)), len(qs) + 1)
    ws.sheet_view.zoomScale = 100
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.print_title_rows = "1:1"


def build_info(ws, metas):
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 16
    ws.column_dimensions["B"].width = 84
    ws["A1"] = "A 类业余无线电台操作证考试题库"
    ws["A1"].font = Font(name="微软雅黑", size=15, bold=True, color="1F4E79")
    ws.merge_cells("A1:B1")
    ws.row_dimensions[1].height = 30

    rows = []
    for name, meta in metas:
        info = BANK_INFO.get(name, {})
        rows += [
            ("", ""),
            ("题集", "%s —— %s" % (name, info.get("set_desc", ""))),
            ("题目数量", "%d 题（单选 %d 题，多选 %d 题）" % (
                meta["count"], meta["singleChoice"], meta["multiChoice"])),
            ("覆盖范围", info.get("scope", "")),
            ("网址", info.get("url", "")),
        ]
    rows += [
        ("", ""),
        ("数据来源", "https://exam.ham.upall.cn/　页面版本 v20251017"),
        ("抓取日期", "2026-11-07"),
        ("编号", "“编号”为连续编号（1 起），方便按顺序刷题；“题号”为网站原题号，因网站曾删题存在跳号。"),
        ("答案", "“答案”列为正确选项字母组合；A~D 列中绿色底色单元格即正确选项。"),
        ("相似题号", "题库自带的相似题索引，编号对应“题号”列（网站原题号）。"),
        ("提示", "多选题需全部选对；单选/判断题只有一个正确选项。A 类试卷一般 40 题，答对 25 题以上合格。"),
    ]
    r = 3
    for key, value in rows:
        k = ws.cell(row=r, column=1, value=key)
        k.font = Font(name="微软雅黑", size=10, bold=True, color="1F4E79")
        k.alignment = TOP_WRAP
        cell = ws.cell(row=r, column=2, value=value)
        cell.font = BODY_FONT
        cell.alignment = TOP_WRAP
        if value:
            ws.row_dimensions[r].height = est_height([value], [84])
        r += 1


def main():
    wb = Workbook()
    info = wb.active
    info.title = "说明"
    metas = []
    for sheet_name, path in SRC:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
        metas.append((sheet_name, data["meta"]))
        build_sheet(wb.create_sheet(sheet_name), data)
    build_info(info, metas)
    wb.save(str(OUT))
    print("saved", OUT, [s.title for s in wb.worksheets], [s.max_row - 1 for s in wb.worksheets])


if __name__ == "__main__":
    sys.exit(main())
