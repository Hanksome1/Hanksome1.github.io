---
tags: [Power, LaTeX]
aliases: [動態功耗]
summary: CMOS 動態功耗公式的推導，同時示範筆記裡的 LaTeX 寫法：數學式、方程式編號與引用、定理環境。
---
<!-- 範例筆記：示範 LaTeX 數學式、\label / \eqref、定理類 callout，可以保留或刪除。 -->

數位電路的功耗分成兩部分：電晶體切換時對負載電容充放電的**動態功耗** $P_{\text{dyn}}$，以及漏電造成的**靜態功耗** $P_{\text{leak}}$。這篇只談前者，它也是 [[Clock Gating]] 想降低的對象。

## 一次充電要花多少能量

> [!definition] 切換活動度
> 一個節點在每個時脈週期內發生 $0 \to 1$ 轉換的機率，記為 $\alpha \in [0, 1]$。時脈網路每個週期都會上升一次，所以 $\alpha = 1$；一般資料線多半只有 $0.1$ 到 $0.2$。

> [!proposition]
> \label{prop:energy}
> 用電壓 $V_{\mathrm{DD}}$ 把負載電容 $C_L$ 從 $0$ 充到 $V_{\mathrm{DD}}$，電源輸出的能量是 $C_L V_{\mathrm{DD}}^2$，其中只有一半存進電容。

> [!proof]
> 充電時電源的電流全部流進電容，$i(t) = C_L \, dv/dt$，所以
> $$
> \begin{align}
> E_{\text{supply}} &= \int_0^{\infty} V_{\mathrm{DD}} \, i(t) \, dt = C_L V_{\mathrm{DD}} \int_0^{V_{\mathrm{DD}}} dv = C_L V_{\mathrm{DD}}^2, \label{eq:supply} \\
> E_{\text{cap}} &= \int_0^{\infty} v(t) \, i(t) \, dt = C_L \int_0^{V_{\mathrm{DD}}} v \, dv = \tfrac{1}{2} C_L V_{\mathrm{DD}}^2. \label{eq:cap}
> \end{align}
> $$
> 兩者相減，另一半 $\tfrac{1}{2} C_L V_{\mathrm{DD}}^2$ 在上拉網路的電阻上變成熱；放電時，電容裡存的能量也會在下拉網路燒掉。

## 動態功耗 $P_{\text{dyn}}$

每個週期有 $\alpha$ 的機率發生一次充電，每次從電源拿走式 \eqref{eq:supply} 的能量，再乘上時脈頻率 $f$ 就是平均功率：

$$
P_{\text{dyn}} = \alpha \, C_L \, V_{\mathrm{DD}}^2 \, f \label{eq:pdyn}
$$

> [!corollary] 降低電壓
> 其他條件不變時，把供電電壓降為 $k V_{\mathrm{DD}}$（$0 < k < 1$），動態功耗變為原本的 $k^2$ 倍。

實際上降壓會讓閘延遲變長，$f$ 通常也得跟著降，所以 DVFS 省下的功耗接近 $k^3$。式 \eqref{eq:pdyn} 的四個因子各自對應一類低功耗手法：

| 因子 | 手法 |
| --- | --- |
| $\alpha$ | [[Clock Gating]]、operand isolation |
| $C_L$ | 縮短繞線、縮小 cell |
| $V_{\mathrm{DD}}$ | 多電壓域、DVFS |
| $f$ | 降頻、clock division |

> [!remark]
> Proposition \ref{prop:energy} 的結論和電阻大小無關：電阻只決定充電有**多快**，不影響燒掉**多少**。
