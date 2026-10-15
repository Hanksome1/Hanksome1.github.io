---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 用 SpyGlass 做 lint
date: '2025-11-04'
updated: '2026-10-16 00:24:06'
tags:
  - ICLAB
  - Verilog
  - Verification
summary: Lint 在模擬之前先靜態檢查 RTL，抓出可合成性和 coding style 的問題。這裡記錄 SpyGlass 的 batch 腳本怎麼寫。
permalink: notes/iclab-spyglass/
synced: obsidian
---

Lint 是對 RTL 做靜態檢查，不需要 testbench。它可以抓出很多模擬不一定看得出來的問題：會合成出 latch 的寫法、位寬不一致、同一個訊號有多個 driver、宣告了卻沒用到的訊號……ICLAB 的 lab 和作業都要求 RTL 先通過 SpyGlass。

## 執行

```bash
sg_shell < spy.tcl
```

## spy.tcl

依序跑四個 lint goal，結果都附加到同一份 report：

```tcl
# 讀入 RTL
read_file -type verilog enigma_part2.v

# 自動儲存 goal 的結果
set_option save_goal true

# goal 1：lint_rtl
current_goal lint/lint_rtl -alltop
run_goal
# 建立 report，寫入這個 goal 的結果
capture enigma_part2.rpt {write_report moresimple}

# goal 2：lint_turbo_rtl
current_goal lint/lint_turbo_rtl -alltop
run_goal
# -append：接在同一份 report 後面
capture -append enigma_part2.rpt {write_report moresimple}

# goal 3：lint_functional_rtl
current_goal lint/lint_functional_rtl -alltop
run_goal
capture -append enigma_part2.rpt {write_report moresimple}

# goal 4：lint_abstract
current_goal lint/lint_abstract -alltop
run_goal
capture -append enigma_part2.rpt {write_report moresimple}
```

- `-alltop`：把所有沒被別人實例化的 module 都當成 top 來檢查。
- `write_report moresimple`：精簡格式的 report，一條違規一行。

寫 RTL 時要注意的規則，見 [[ICLAB_RTL_guideline_blog|RTL coding guidelines]]。
