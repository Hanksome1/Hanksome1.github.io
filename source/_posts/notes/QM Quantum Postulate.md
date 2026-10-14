---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: QM Quantum Postulate
date: '2026-09-26'
updated: '2026-10-05 11:16:06'
tags:
  - QM
permalink: notes/qm-quantum-postulate/
synced: obsidian
---

# QM Postulate 
There are four quantum postulate in quantum mechanics 

### QM number 1
The state of the particle is represented by a vector $\ket{\psi}$ in a Hilbert space

---

### QM number 2 
The state of the particle is represented by a vector $\ket{\psi}$ in a Hibert space.
The independent variables x and p of  classical mechanics are represented by Hermitian operators $X$ and $P$ with the following matrix elements in the eigenbasis of $X^{\dagger}$
$$
\begin{align}
& \braket{ x | X | x' }  = x \delta(x-x')  \\
& \braket{ x | P | x'  }  = - ih \delta(x-x')
\end{align}
$$


> [!math-orange]  Derivation of second equation 
> $$
> \begin{align}
> \hat{P} & = \hat{h}\hat{K}  \\
> \braket{ x | P |x' } & = \braket{ x | \hat{h}\vec{k} | \psi }  = -\frac{i\hat{h}d\psi}{dx} 
> \end{align}
> $$


> [!note] H operation 
> $$
> 	\hat{H} = \frac{\hat{P}^{2}}{2m}+ \hat{V}(x)
> $$

#### Common sense of these two operation in x space 
$$
\begin{align}
 & \hat{X} \to x \\
 & \hat{P} \to -ih \frac{d}{dx}
\end{align}
$$


#### Properties of these two operation 
$$
\begin{align}
 & [\hat{X}, \hat{K}] = i  \\
 & [\hat{X}, \hat{P}] = i\hat{h} 
\end{align}
$$
where $[\hat{X}, \hat{P}] = i\hat{h}$ is the foundamental commutator relation in QM. 

---


### QM number 4
the state vector obeys the Schrodinger equation
$$
\frac{d}{dt} \ket{\psi(t) }  = \frac{\hat{H}}{i\hat{h}} \ket{ H(t)} 
$$
where $H(x,p)$ is the quantum Hamiltonian operator and $H$ is the Hamiltonian for the corresponding classical problem
The solution is : 
$$
\psi = A e ^{-i (kx - \omega t)} \implies i\hat{h} \frac{ \partial \psi }{ \partial t } = i\hat{h} (-i\omega) \psi = \hat{h} \omega \psi = \hat{H}\psi
$$
we can view H as E, in this way, we can have $\hat{h}\omega =\hat{H} =E$

> [!note] H operation 
> H is Hamiltonian operator. 最主要的功能就是用來計算能量的計算符號，同時也是時間演化的生成元。
>
> 原本的 Shordinger Equation裡面是在探討隨著時間變化的wave function。但是但是如果Hamiltonian不隨著時間變化，而且我們找的是能量本徵態，就會變成
> $$
> \hat{H} \ket{\psi_{n}} = E_{n} \ket{\psi_{n}}  
> $$
> 這邊的$E_{n}$就是可以量測到的能量。

---

#### QM number 3 
If the particle is in a state $\ket{\psi}$, measurement of the variable (corresponding to) $\Omega$ will yield one of the eigenvalues $\omega$ with probability $P(\omega ) \propto \lvert \braket{ \omega | \psi } \rvert^{2}$. The state of the system will change from $\ket{\psi}$ to $\ket{\omega}$ as a result of the measurement. 

1. $\braket{ \psi | \hat{\Omega}|\psi }$  : is the expectation of $\hat{\Omega}$
2. $\lvert \braket{ x | \psi } \rvert^{2}=P(x,t)$  : is the probability to find a particle at $x$
3. $\lvert \braket{ k | \psi} \rvert^{2}=\lvert \psi(k) \rvert^{2}$ : is the probability density to find a particle at $p=\hat{h}k$

> [!example] Example of quantum collapse 
> $$
> \ket{\psi}  = \frac{1}{\sqrt{ 2 }}\ket{E_{1}} + \frac{1}{\sqrt{ 2 }} \ket{E_{2} }
> $$
> 假設這是原本的量子態，代表他有一半的機率會是E1一半的機率是E2，但是只要一經過量測，如果發現到E1，就會一直是E1，如果量測到E2，就會一直維持在E2的狀態。



--- 

# Textbook Note 
主要容易搞混的點是為什麼要用Hilbert space裡面這麼多參數去表示物理量（古典物力上我們只需要x跟p就可以表示任何運動）

在古典力學裡面，我們只需要x,p就可以model任合dynamical variable $\omega(x,p)$。但是在量子力學裡面我們需要以下的操作
1. Construct the corresponding quantum operator $\Omega(x\to X, p\to P)$, where X and P are the operators defined in postulate II. 
2. Find the orthonormal eigenvectors $\ket{\omega_{i}}$ and eigenvalues $\omega_{i}$ of $\Omega$
3. Expand $\ket{\psi}$ in this basis : 
$$
\ket{\psi} = \sum_{i} \ket{\omega_{i}} \braket{\omega_{i}|\psi} 
$$
4. Compute the probability $P(\omega)$ at the result m will obtain is proportional to the modulus squared of the projection of $\ket{\psi}$ along the eigenvector $\ket{\omega}$. 
$$
P(\omega_{i}) = \lvert \braket{ \omega_{i}|\psi' |  }  \rvert^{2} 
$$
> [!note] Concept of QM (multiple operation)
> we have a single ket $\ket{\psi}$ representing the state ofthe particle in Hilbert space, and it contains the statistical prediction for all observables. To extract this information for any observable, we must determine the eigenbasis of the corresponding operator and find the projection of $\ket{\psi}$ along all its eigenkets.
> ![[Pasted image 20261003183458.png]]


--- 
# Expectation value 
$$
\braket{  \Omega  }  = \braket{ \psi | \Omega|\psi }  
$$
這就是用來計算某一個operation結果的expectation value，像是如果我套用$\hat{X}$ Operation，得到的就會是位置的期望值（平均值）
$$
\braket{ X  }  = \braket{ \psi | \hat{X} | \psi} 
$$

### Calculate Momentum 
$$
\braket{  P  } = \braket{ \psi | P|\psi } = \int _{-\infty}^{\infty} dx \braket{ \psi | x } \braket{ x | P|\psi } = \int_{-\infty}^{\infty}dx \psi ^{*}(x) \left( -i\hbar  \frac{d\psi(x)}{dx} \right)   
$$
