---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Probability Conservation in QM
date: '2026-10-03'
updated: '2026-10-03 23:49:59'
tags:
  - QM
  - Math
permalink: notes/probability-conservation-in-qm/
synced: obsidian
---

# Probability in Classical Mechanics 
![[Probability Conservation in Classical Mechanic.svg]]

$$
\nabla \vec{J} + \frac{ \partial \rho }{ \partial t }  = 0  
$$
$$
\int \rho d^{3}r  = Q
$$

### Probability Conservation in QM 
From schordinger equation we can derive : 
$$
[\psi ^{*} \partial_{t} \psi + \psi \partial_{t}\psi ^{*}] + \frac{\hat{h}}{2mi} [\psi ^{*} \partial_{x}^{2}\psi - \partial_{x}^{2}\psi ^{*}\psi] = 0 
$$
左邊的term可以看成是下面這個$\rho$的微分：
$$
\rho  = \psi ^{*} \boldsymbol{\psi}  \ \ , \ \  d\rho = \psi ^{*} \partial_{t} \psi + \psi \partial_{t}\psi ^{*}
$$
$$
J = \frac{\hat{h}}{2mi} \left( \psi ^{*} \frac{ \partial \psi }{ \partial x  } - \frac{ \partial \psi ^{*} }{ \partial x } \psi  \right)
$$
This conservation relation is embedded in schordinger equation. 

$$
\int \rho d^{3}r = \int \psi ^{*} \psi d^{3}r = const. = 1 
$$
這邊 $\psi ^{*}\psi$ 也可以看成是機率，所以全部機率也有conservation，加總會是1。
