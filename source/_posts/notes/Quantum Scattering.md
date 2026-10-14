---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Quantum Scattering
date: '2026-10-03'
updated: '2026-10-07 23:27:42'
tags:
  - QM
  - Math
permalink: notes/quantum-scattering/
synced: obsidian
---

![[Quantum Scattering Example.svg|Quantum Scattering Example|600]]


1. E > V case 

Schordinger Equation 
$$
E = \frac{\hbar k_{1}}{2m} = \frac{\hbar k_{2}}{2m} + V_{0} 
$$
therefore, $0<k_{2}<k_{1}$, with $\psi(x) = \phi(x)e^{iE/\hbar t}$ 
$$
\phi(x) = 
\begin{cases}
Ae^{ik_{1}x}+Be^{-ik_{1}x}, x\leq{0} \\
Ce^{ik_{2}x}, x\geq_{0}
\end{cases}
$$
> [!note] Matching Boundary Condition 
> $$
> \begin{align}
> \psi_{I}(0^{-} ) = \psi_{II}(0^{+}) \\
> \frac{d\psi_{I}}{dx}(0^{-}) = \frac{d\psi_{II}}{dx}(0^{+})
> \end{align}
> $$

By boundary condition : 
$$
\begin{cases}
A+B=C \\
ik_{1}(A-B) = ik_{2}C
\end{cases}
$$
$$
\frac{B}{A} = \frac{k_{1}-k_{2}}{k_{1}+k_{2}} 
$$
$$
\frac{C}{A} = \frac{2k_{1}}{k_{1}+k_{2}}
$$
帶入[[Probability Conservation in QM]]裡面的公式：
$$
J = \frac{\hat{h}}{2mi} \left( \psi ^{*} \frac{ \partial \psi }{ \partial x  } - \frac{ \partial \psi ^{*} }{ \partial x } \psi  \right)
$$
就可以計算出
$$
\begin{align}
j_{I} = \frac{\hbar k_{1}}{m} \lvert A \rvert ^{2} \\
j_{R} = \frac{\hbar k_{1}}{m} \lvert B \rvert ^{2} \\
j_{T} = \frac{\hbar k_{2}}{m} \lvert C \rvert ^{2}
\end{align}
$$
很剛好的是 $\lvert C \rvert^{2}$就是電荷密度，然後 $\frac{p_{}{_{2}}}{m}=\frac{\hbar k_{2}}{m}=v_{2}$ , 所以得到很剛好的式子：$j=\rho v$

$$
\begin{align}
R = \frac{j_{R}}{J_{I} } & = \frac{\frac{\hbar k_{1}}{m} \lvert B \rvert ^{2}}{\frac{\hbar k_{1}}{m} \lvert A \rvert ^{2}} = \frac{(k_{1}-k_{2})^{2}}{(k_{1}+k_{2})^{2}} \\
T = \frac{j_{T}}{J_{I} } & = \frac{\frac{\hbar k_{2}}{m} \lvert C \rvert ^{2}}{\frac{\hbar k_{1}}{m} \lvert A \rvert ^{2}} = \frac{4k_{1}k_{2}}{(k_{1}+k_{2})^{2}} \\
& \implies R +T = 1 
\end{align}
$$

### Ghost State in Quantum Scattering 
有時候R+T並不會等於1，有一些wave function會被困在barrier裡面（ghost state），這是schordinger equation裡面多出來的解（因為boundary condition不滿足convergence，所以通常不討論）但是在這個case boundary condition不用考慮（邊界只有barrier的邊界）


![[QuantumScatteringGhostState.svg|600]]

##### Derivation 
$$
-\frac{h}{2m} \frac{d^{2}\phi}{dx^{2}} +V_{0}\phi = E \phi \ \ , \ \ \psi(x,t) = \phi(x)e^{-iE\hbar/t}
$$
For E < V0 case : 
$$
\frac{\hbar}{2m} \frac{d^{2}\phi}{dx^{2}} = (V_{0}-E) \phi 
$$
where $(V_{0}-E)$ is positive 
$$
\text{let } \alpha = \frac{2m(V_{0}-E)}{-\hbar^{2}} \implies \frac{d^{2}\phi}{dx^{2}} = \alpha^{2}\phi^{2}
$$
$$
\implies \phi(x) = De^{\alpha x}+Ee^{-\alpha x}
$$
這組solution會lead to **negative energe**！！！
$$
\int dx \phi ^{*}\left( -\frac{\hbar}{2m} \frac{d^{2}}{x^{2}} \right)\phi 
$$
但是這組solution我們一班並不討論（雖然這也是schordinger equaiton的legal form），但是試想在$x\to \infty$會發生什麼事情，在那邊的probability會是無限大，所以意思是wave equation的出現機率會跑到無窮遠！！！
所以被boundary condition 所控制，這組解並不成立。
$$
\lvert \psi \rvert ^{2} <\infty  , at\ \  x\to \infty \text{(B.C.)}
$$

但是在這個scattering的case裡面，在barrier裡面並不需要考慮boundary condition，只需要考慮barrier的左界跟右界就可以了。
在裡面的解也可以看成
$$
\psi(x,t) = De^{-\alpha x}e^{-iE\hbar/t} + Ee^{\alpha x}e^{-iE\hbar/t} 
$$
