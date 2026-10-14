---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Classical Mechanic & Quantumn Mechanic
date: '2026-09-21'
updated: '2026-09-24 14:23:43'
tags:
  - QM
  - Math
permalink: notes/classical-mechanic-quantumn-mechanic/
synced: obsidian
---

# Classical Action 
![[Screenshot 2026-09-21 at 9.07.43 AM.png]]

Action $S$ is a functional(泛函式) of a trajectory
$$
S = \int_{t_{i}}^{t_{f}} L(q,\dot{q},t)dt  = S[q(t)]
$$
Classical Action $S_{cs}$
$$
\begin{align}
S_{cs}[q_{cs}(t)] = min \{ S[q(t)] \} \\
q_{cs}(t) = argmin \{ S[q(t)] \}
\end{align}
$$
在classical mechanism裡面，我們只會選唯一的一條路徑，也就是$\delta S= 0$的路徑，根據推導，只有在這樣的條件下才會滿足F=ma。

> [!math-red] Conclusion
> 在classical action裡面，我們只探討其中一條線，並對他進行分析，其中我們最在乎的是$\delta S=0$的path，因為在這條path上面會滿足$F=ma$的關係。

# Quantum Action 
在quantum action裡面，我們會對所有可能的path做integral，我們會使用以下公式對所有的path做summation，計算probability amplitude 
$$
P.A. = \sum_{path} e^{iS[path]/\hbar}
$$
Sum over all possible path to calculate probability amplitude. 
	可以看成是把原本的action當成是相位，然後把全部做summation加總起來。
