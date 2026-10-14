---
tags: [Power, STA, Verilog]
aliases: [時脈閘控, ICG]
summary: 暫存器不需要更新時，就把送給它的時脈關掉。時脈網路每個週期都在翻轉，關掉它是降低動態功耗最直接的方法。
---

[[Dynamic Power]] 的公式是 $P_{\text{dyn}} = \alpha \, C_L \, V_{\mathrm{DD}}^2 \, f$。時脈網路每個週期都會翻轉（$\alpha = 1$），又要推動大量暫存器的 clock pin，負載電容很大，往往是整顆晶片動態功耗的大宗。

Clock gating 的想法很簡單：一群暫存器在這個週期**不會更新**時，就不要把時脈送給它們。被關掉的那段時脈樹和暫存器內部，這一拍的 $\alpha$ 直接變成 $0$。

## 為什麼不能直接用 AND 閘

最直覺的寫法是 `assign gclk = clk & en;`。問題是 `en` 通常由同一個時脈的暫存器在上升緣之後送出，會在 `clk` 為高的時候改變，AND 閘就會切出半截的脈衝：

{% wavedrom en 在 clk 為高時改變：AND 閘輸出半截的 glitch；ICG 先用 latch 鎖住 en，只放行完整的脈衝 %}
{ signal: [
  { name: 'clk',        wave: '1.0.1.0.1.0.1.0.' },
  { name: 'en',         wave: '0....1.......0..' },
  { name: 'clk & en',   wave: '0....10.1.0.10..' },
  {},
  { name: 'en_latch',   wave: '0.....1.......0.' },
  { name: 'gclk (ICG)', wave: '0.......1.0.1.0.' }
]}
{% endwavedrom %}

寬度不足的脈衝會違反暫存器的 minimum pulse width，後面的暫存器可能取樣失敗，甚至進入 [[Metastability]]。

> [!warning] 不要在 RTL 裡自己用邏輯閘做時脈
> 除了 glitch，自己拼的閘也會讓時脈樹多出工具無法控制的延遲與 skew。讓合成工具自動插入，或直接例化 cell library 裡的 ICG。

## ICG：latch + AND

Integrated clock gating cell 在 AND 閘前面多了一個**低電位透明**的 latch：`clk` 為低時 latch 透明，`en` 可以更新；`clk` 為高時 latch 關閉，`en` 再怎麼變也傳不過去。所以在時脈為高的期間，AND 閘的另一個輸入一定是穩定的。

```verilog
// 行為模型，只用來模擬；實際設計請例化 cell library 的 ICG
module icg (
  input  wire clk,
  input  wire en,       // 功能 enable
  input  wire test_en,  // scan 模式強制打開時脈
  output wire gclk
);
  reg en_latch;
  always @(*)
    if (!clk) en_latch = en | test_en;  // clk 為低時透明
  assign gclk = clk & en_latch;
endmodule
```

`test_en` 是給 DFT 用的：scan shift 時所有暫存器都需要時脈，不能被功能上的 enable 關掉。

## 讓合成工具自動插入

大部分的 clock gating 不用手寫，只要把 RTL 寫成「有 enable 的暫存器」：

```verilog
always @(posedge clk)
  if (en) data_q <= data_d;   // 32-bit 暫存器
```

沒開 clock gating 時，這會合成成每個 bit 一個 MUX，把舊值接回去。開了之後，工具會把 32 個 MUX 換成一顆共用的 ICG：

```tcl
# Design Compiler
set_clock_gating_style -sequential_cell latch -minimum_bitwidth 4
compile_ultra -gate_clock
```

`-minimum_bitwidth` 是門檻：同一個 enable 至少要控制幾個 bit 才插 ICG。位寬太小時，ICG 本身的面積和功耗反而划不來。

依照關掉的範圍，可以分成兩種：

- **細粒度**：工具依照 enable 自動插入，對象是一組暫存器
- **粗粒度**：在架構層級關掉整個模組的時脈，例如加速器閒置時，由 power controller 關掉整個 [[Systolic Array|PE 陣列]] 的時脈

## Timing 要注意的地方

1. **Enable 的 setup / hold**：ICG 的 `E` 腳對 `CK` 有自己的 setup / hold 要求，STA 會像檢查一般暫存器一樣檢查它（觀念見 [[sta-setup-hold|Setup / Hold]]）。
2. **Enable 路徑比想像中短**：ICG 放在時脈樹比較上游，收到時脈的時間比下游的暫存器早。暫存器送出的 `en` 必須在 ICG 的時脈到達前穩定，可用的時間不到一個完整週期，常常成為 critical path。
3. **CTS 要認得它**：ICG 是時脈樹的一部分，做 [[Clock Tree Synthesis]] 時要讓工具把它前後的 skew 一起平衡。

> [!tip] 先找出值得 gate 的地方
> 用模擬產生的切換活動檔（SAIF 或 VCD）做功耗分析，找出 enable 長時間為 0、位寬又大的暫存器群，效益最高。

## 和其他低功耗手法比較

| 手法 | 省下的功耗 | 代價 |
| --- | --- | --- |
| Clock gating | 時脈網路與暫存器的動態功耗 | ICG 面積、enable 的時序變緊 |
| Operand isolation | 不需要的組合邏輯翻轉 | 多一級閘、增加延遲 |
| [[Power Gating]] | 漏電（靜態功耗） | power switch、isolation、retention，喚醒需要時間 |
| DVFS | 動態功耗中的 $V_{\mathrm{DD}}^2$ 項 | 電壓調節器、切換延遲 |
