---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Quantumn Mechanics
date: '2026-09-12'
updated: '2026-10-09 17:07:44'
tags:
  - QM
aliases:
  - QM
permalink: notes/quantumn-mechanics/
synced: obsidian
---

![[Quantum Mechanics.svg]]
# Course Note 
##### Quantum Mechanic Basic & Background 
- [[QM introduction]] : Introduction of quantum mechanic
- [[QM Math]] : QM math introduction, introducing ket, bra, and basic math skills. 
- [[QM operation]] : operation in quantum mechanic
- [[Classical Mechanic & Quantumn Mechanic]]
- [[QM Double Slit Experiment]] : Double slit experiment 
##### Quantum Postulate and Basic Calculation
- [[QM Quantum Postulate]] : Four Fundamental Quantum Postulates 
- [[QM Finite Hilbert Space Calculation Example]] : Boron Atom under magnetic field example. 
### Quantum Tunneling Effect 
- [[QM Particle in Box]] : QM particle in box 
- [[Probability Conservation in QM]] : conservation equation embedded in schordinger equation. 
- [[Quantum Scattering]] : Quantum Scattering 1D case

### Introduction Heisenberg Matrix Mechanics
- [[Heisenberg Equation]]


---
# Homework 
- QM midterm1

---
### Important Equation in Quantum Mechanics 
##### Eistein Proposal for Photon 
$$
\begin{align}
 E = \hbar \omega \\
 \vec{k}  = \frac{\vec{p}}{\hat{h}}
\end{align}
$$
### Shordinger Equation 
$$
i\hat{h} \frac{d}{dt} \ket{\psi}  = \hat{H} \ket{\psi} 
$$
in which, the H operator is 
$$
\hat{H} = \frac{p^{2}}{2m} + \hat{V}  
$$
##### Normal Model Solution 
$$
\ket{\psi }  = \phi e^{iEt/\hat{h}}
$$
對很多後面的公式解，我們都是把這個帶入我們equation當中（他可以符合shordinger equation裡面的一階微分方程）

### Time Independent Schordinger Equation 
given 
$$
\ket{\psi }  = \phi e^{iEt/\hat{h}}
$$
$$
 E\phi = -\frac{\hat{h}}{2m} \frac{d^{2}\phi}{dx^{2}}+V\phi
$$
