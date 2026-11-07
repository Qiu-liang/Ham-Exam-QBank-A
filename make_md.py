# -*- coding: utf-8 -*-
"""Render the scraped A-class bank JSON as a readable Markdown study sheet."""
import json

SRC = [
    ("A 类题库（20250809 新版，683 题）", "A类题库_2025新版.json"),
    ("A 类题库（20211022 旧版，380 题）", "A类题库_2021旧版.json"),
]
OUT = "A类题库.md"

lines = [
    "# A 类业余无线电台操作证书考试题库",
    "",
    "> 来源：<https://exam.ham.upall.cn/> · 页面版本 v20251017 · 抓取日期 2026-11-07",
    "> ",
    "> 标记说明：✅ 为正确选项，⬜ 为错误选项；「答案」为正确选项字母组合。",
    "> ",
    "> 编号说明：标题前的编号为本文件的连续编号；反引号内为题库存放的原始题号。",
    "",
    "## 目录",
    "",
]
for title, _ in SRC:
    lines.append("- %s" % title)
lines.append("")

for title, path in SRC:
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    qs = data["questions"]
    meta = data["meta"]
    lines += ["---", "", "## %s" % title, "",
              "共 %d 题：单选 %d 题，多选 %d 题。" % (
                  meta["count"], meta["singleChoice"], meta["multiChoice"]), ""]
    for q in qs:
        tail = "" if q["answerCount"] == 1 else "（多选）"
        lines.append("**%04d. %s**%s  " % (q["seq"], q["stem"], tail))
        lines.append("`%s`" % q["code"] if q["code"] else "`%04d`" % q["seq"])
        lines.append("")
        for o in q["options"]:
            mark = "✅" if o["correct"] else "⬜"
            lines.append("- %s %s. %s" % (mark, o["label"], o["text"]))
        lines.append("")
        answer_line = "**答案：%s**" % q["answer"]
        if q["similar"]:
            answer_line += "　相似题号：%s" % "、".join(str(x) for x in q["similar"])
        lines.append(answer_line)
        lines.append("")

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines).rstrip() + "\n")

print("saved", OUT, "questions:", sum(1 for _ in lines if _.startswith("**答案：")))
