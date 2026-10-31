---
title: '積體電路設計導論：從一顆電晶體到一塊 ROM'
summary: 用捲動走完 EE3230 積體電路設計導論：從 full-custom 流程、process corner、MOS、反相器、邏輯閘、導線 RC、setup 與 hold、SRAM，一路做到期末 128 × 16 bit 的 ROM macro。每一站都是對應筆記的入口。
date: 2026-10-31
updated: 2026-10-31
layout: vlsi-tour
# kind: note 讓這一頁跟 source/_posts/notes/ 的筆記一起列在 /notes/；reading 是列表上顯示的閱讀分鐘數
kind: note
reading: 10
# 動畫的站點：VLSI 筆記總覽標頭的動畫入口用這份資料畫縮圖（格數就是站數）。
# notes 是這一站的筆記（網址的最後一段）；title 是入口卡的標題，沒寫就用預設的「串成一條 design flow」
tour:
  title: 把 VLSI 整學期的筆記，從一顆電晶體疊到一塊 ROM
  tagline: 從 MOS、反相器、邏輯閘、導線 RC、時序到記憶體，最後拉遠看期末的 128 × 16 bit ROM macro，每一站都能點進對應的筆記。
  stops:
    - { id: flow, n: '01–02', label: Flow, weeks: Ch1, sub: Full-custom 流程與 process corner, notes: [vlsi-intro] }
    - { id: mos, n: '03', label: MOS, weeks: Ch2, sub: Strong 0 與 weak 1, notes: [vlsi-process] }
    - { id: inv, n: '04', label: Inverter, weeks: Ch3, sub: VTC、延遲、inverter chain, notes: [vlsi-inverter] }
    - { id: logic, n: '05', label: Logic, weeks: Ch4, sub: Static CMOS 與 dynamic logic, notes: [vlsi-logic] }
    - { id: rc, n: '06', label: RC, weeks: Ch5, sub: 寄生 RC 與 Elmore delay, notes: [vlsi-rc] }
    - { id: seq, n: '07', label: Sequential, weeks: Ch6, sub: Setup 與 hold, notes: [vlsi-sequential] }
    - { id: mem, n: '08', label: Memory, weeks: Ch7, sub: SRAM 與期末的 ROM, notes: [vlsi-memory] }
    - { id: chip, n: '09', label: Chip, weeks: Ch8, sub: 功耗, notes: [vlsi-power] }
---
