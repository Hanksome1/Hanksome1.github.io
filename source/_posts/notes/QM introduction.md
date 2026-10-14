---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: QM introduction
date: '2026-09-12'
updated: '2026-09-16 18:02:39'
tags:
  - QM
permalink: notes/qm-introduction/
synced: obsidian
---

### Toolbox
- Classical Mechanism 
	- 定義物體的degree of freedom, 用常微分方程ODE去描述物體，並求解得到物體的運動
- Feild 
	- 當degree of freedom diverge的時候就沒辦法使用classical mechanism，變成使用Field去表達，場就變成多變數的函數，因此要求解偏微分方程
- Random variable 
	- 很多時候結果並不是deterministic，而是機率分布，我們只能藉由觀測統計出可能的結果
- Linear Algebra 
	- Heisenberg提出我們可能可以用向量的方式去表示量子力學
	- Shordiger : wave function in hilbert sapce 

### Quantom Mechanic Overview 
薛丁格說量子力學其實是wave function in hilbert space，而hilbert space其實是一個假想的世界，在裡面粒子才是以wave移動，而再real universe我們只能觀察到每一個位置的機率是多少（高中物理教過的內容）
![[Quantum Mechanism Overview.svg]]

以下就是我們常見的轉換
$$
\ket{\psi} = \begin{pmatrix}
\psi_{1} \\
\psi_{2} \\
\dots \\
\psi_{3}
\end{pmatrix}
 = \psi(x,y,z,t)
$$
原本的$\ket{\psi}$是在hilbert space的wavefunction，有無限個dimension，但是可以轉換成3D世界中的機率分布 $P(\vec{r},t) = \lvert \psi(\vec{r},t) \rvert$。
