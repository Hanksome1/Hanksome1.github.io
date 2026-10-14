---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: QM Double Slit Experiment
date: '2026-09-24'
updated: '2026-09-26 14:50:11'
tags:
  - QM
permalink: notes/qm-double-slit-experiment/
synced: obsidian
---

# Double slit experiment 
- Classical mechanic - Particle 
- Classical mechanic - Wave 
- Quantum mechanic - Duality 

### For Particle 
$$
\begin{align}
& \frac{dx}{dt} = \frac{1}{m}p  \\
& \frac{dp}{dt} = - \frac{dV}{dx} + \epsilon(t)
\end{align}
$$
對於particle來說，我們可以直接說 $I_{1}+I_{2}=I_{1+2}$ ，這是因為 **Conservation of probability**

![[Double Slit Experiment.svg]]

### For Wave 
像是水波紋，在有雙狹縫之後水波會互相干擾，導致出現double slit pattern 。
$$
I_{1}+I_{2} \neq I_{1+2}
$$

Wave formulation 
$$
\frac{1}{c^{2}}  \frac{ \partial u^{2} }{ \partial t^{2} }  = \nabla^{2}u + \text{nonlinear}
$$
$$
u(x,t) = A e ^{i(kx-\omega t)}
$$
- wave number : $\vec{k}$
- frequency : $\omega$
- dispertion relation : $\frac{\omega}{k} = e$

---
# Photon Experiment
有人就提出了一個實驗，試著整明photon是particle，他的做法是一次只發射一個photon，理論上這樣光子就不會有干涉，應該要有particle的double slit結果。
但是最後的結果就是即使每次只有一個光子射出，最後的結果依舊是wave版本的double slit pattern。
只有當有同時只有一個slit的時候才不會有干涉。可以想像成是即使只有一個光子，但是有兩個path的話光子可以同時走兩條路線。因此會互相干擾。

結果可以簡單地用這樣表示
$$
|\psi_{1} + \psi_{2}| ^{2} = \lvert \psi_{1} \rvert^{2} + \lvert \psi_{2} \rvert ^{2} + (\psi_{1}^{\dagger}\psi_{2} + \psi_{2}^{\dagger}\psi_{1})
$$
如果沒有interference 理論上 $\psi_{1}^{\dagger}\psi_{2} + \psi_{2}^{\dagger}\psi_{1}$ 這一項應該要是0，但是這邊實驗結果卻是 $\psi_{1}$跟 $\psi_{2}$ 會互相干涉。可以這樣想，即使是只有一個光子，從path1跟path2兩條路徑也會互相干涉。
