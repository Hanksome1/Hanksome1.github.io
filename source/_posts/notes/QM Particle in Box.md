---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: QM Particle in Box
date: '2026-10-02'
updated: '2026-10-05 15:36:32'
tags:
  - QM
permalink: notes/qm-particle-in-box/
synced: obsidian
---

![[QM Particle in Box Example.svg|600]]

Potential V(x) is 
$$
V(x)=
\begin{cases}
0, & 0<x<L \\
\infty, & \text{otherwise}
\end{cases}

$$

### Starting From [[QM Quantum Postulate]]
- Postulate1 : express quantum state as $\braket{ x | \psi(t) } = \psi(x,t)$
- Postulate2 : $\hat{P}=-i\hat{h}\frac{ \partial  }{ \partial x}$
- Postulate4 : $(ih \frac{ \partial  }{ \partial t }-\hat{H})\ket{\psi}=0$

### Solution 
先帶入schordinger equation的geneartion，再來求解其中的$\phi(x)$
$$
\psi(x,t) = \phi (x) e^{iE/\hat{h}t} 
$$
$$
i\hat{h} \frac{ \partial \psi }{ \partial t }  = i\hat{h}\left( -\frac{iE}{\hat{h}} \right)\psi(x,t) = E \psi(x,t)
$$
$$
\implies E \psi e^{-iE/\hat{h}t} = \frac{\hat{h}}{2m} \frac{d^{2}\phi}{dx^{2}}e^{-iE/\hat{h}t} + V\phi e^{-iE/\hat{h}t}
$$
$$
\implies E\phi = -\frac{\hat{h}}{2m} \frac{d^{2}\phi}{dx^{2}}+V\phi
$$

> [!note] Boundary Condition 
> 因為邊界上面的potential太大了，所以粒子不可能跑出去，因此在邊界上的機率都是0
> $$
> \begin{align}
> \psi(x=0) = 0, \psi(x=L) = 0 \\
> \phi(x=0) = 0, \phi(x=L) = 0 
> \end{align}
> $$


$$
\implies \frac{d^{2}\phi}{dx^{2}} = -\frac{2mE}{\hat{h}}\phi, E = \frac{\hat{h}^{2}k^{2}}{2m}
$$
$$
\implies \frac{d^{2}\phi}{dx^{2}}= -k^{2}\phi
$$
$$
\implies \phi(x) = A\sin kx+B\cos kx
$$
with boundary condition, we can get 
$$
\phi(x) = A\sin kx
$$
with $k_{n} = \frac{n\pi}{L}$

所以我們可以知道這樣的solution意思是在這樣的case裡面
- $k_n$ , wave number is quantized (by boundary condition)
- $p = \hat{h}k$ momentum is also quantized (however, is by quantum relation)
- $E = \frac{p^{2}}{2m}$ is square of the n. 



---

# Note
