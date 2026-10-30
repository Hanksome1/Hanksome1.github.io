---
title: 'ICLAB 設計流程：一條 flow 串起整學期的筆記'
summary: 用捲動走完 ICLAB 的 cell-based design flow：同一個 8-bit 累加器從 RTL、FSM、lint、testbench、合成、LEC 一路變成 layout，再拉遠看每份作業練的是哪一站。每一站都是對應筆記的入口。
date: 2026-10-30
updated: 2026-10-30
layout: iclab-flow
# kind: note 讓這一頁跟 source/_posts/notes/ 的筆記一起列在 /notes/；reading 是列表上顯示的閱讀分鐘數
kind: note
reading: 10
# 動畫的站點：開場地圖的每一格，ICLAB 筆記總覽標頭的動畫入口也用這份資料畫縮圖。
# notes 是這一站的筆記（網址的最後一段），地圖上的篇數從這裡算
tour:
  tagline: 同一個 8-bit 累加器從 RTL、合成、LEC 一路變成 layout，每一站都能點進對應的筆記。
  stops:
    - { id: rtl, n: '01', label: RTL, weeks: W2–5, sub: 用 Verilog 描述硬體, notes: [iclab-verilog-datatype, iclab-verilog-operators, iclab-verilog-assignment, iclab-verilog-timing-control, iclab-verilog-function-task, iclab-rtl-guideline, iclab-hw5-attention] }
    - { id: fsm, n: '02', label: FSM, weeks: W4, sub: 控制交給狀態機, notes: [iclab-fsm, iclab-hw4-qrcode, iclab-lab05-cpu] }
    - { id: lint, n: '03', label: Lint, weeks: W1, sub: 模擬之前先靜態檢查, notes: [iclab-spyglass] }
    - { id: sim, n: '04', label: Sim, weeks: W3, sub: Testbench 與波形, notes: [iclab-testbench, iclab-hw1-rop3, iclab-3dgs-golden-pattern] }
    - { id: synth, n: '05', label: Synth, weeks: W6–8, sub: RTL 變成 gate, notes: [iclab-synthesis, iclab-design-compiler, iclab-hw3-enigma] }
    - { id: lec, n: '06', label: LEC, weeks: W9–10, sub: 證明 netlist 沒改壞, notes: [iclab-lec] }
    - { id: floorplan, n: '07–12', label: APR, weeks: W11–13, sub: Floorplan 到 sign-off, notes: [iclab-apr, iclab-apr-floorplan, iclab-apr-powerplan] }
    - { id: projects, n: '13', label: Labs, weeks: W14–17, sub: 作業與期末專題, notes: [iclab-hw1-rop3, iclab-hw3-enigma, iclab-hw4-qrcode, iclab-hw5-attention, iclab-lab05-cpu, iclab-3dgs-golden-pattern] }
---
