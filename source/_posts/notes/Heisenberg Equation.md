---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Heisenberg Equation
date: '2026-10-09'
updated: '2026-10-12 15:36:53'
tags:
  - QM
permalink: notes/heisenberg-equation/
synced: obsidian
---

# Overview
Heisenberg Equation其實也是建立在Schordinger Equation的基礎上面，兩者的差異在於
- Schordinger Representation把wave functiong視為 time variant，也就是$\psi(t)$
- 但是在Heisenberg Representation則是把 wave function視為time independent，然後把所有time相關的term都移到operator裡面。


---

# Schordinger Equation 
$$
\Omega(t) = \braket{ \psi | \hat{\Omega}|\psi } = \frac{d\Omega(t)}{dt}  = \frac{d\bra{\psi(t)}}{dt} \hat{\Omega}\ket{\psi(t)}  + \braket{ \psi(t) | \hat{\Omega}|\psi(t) }  + \bra{\psi} \hat{\Omega}  \frac{ \partial \ket{\psi(t)}  }{ \partial t } 
$$
因為我們假設這邊的operation都是time invariant(在這邊是假設都是由X,P建構而成)

$$
\frac{\bra{\psi(t)}}{dt} = \frac{1}{-i\hbar} \bra{\psi(t)} \hat{H} \implies \frac{d\Omega(t)}{dt} = 
\frac{1}{i\hbar} (\braket{ \psi | \hat{\Omega}\hat{H} |\psi} -\braket{ \psi | \hat{H}\hat{\Omega}|\psi }   ) 
$$
$$
\frac{d \psi(t)}{dt} = \frac{1}{i\hbar} [\hat{\Omega},\hat{H}]
$$

### dX/dt in Schordinger Representation
- Let $\hat{\Omega}=\hat{X}$ 
- Fist Compute commutation $[\hat{X},\hat{H}]$
$$
[\hat{X},\hat{H}] = \left[ \hat{X}, \frac{\hat{P^{2}}}{2m} +\frac{1}{2}k\hat{X}\right] = \left[ \hat{X}, \frac{\hat{P}^{2}}{2m} \right] = \frac{1}{2m}[\hat{X},\hat{P}^{2}] = \frac{1}{2m} (\hat{P}[\hat{X},\hat{P}] + [\hat{X},\hat{P}]\hat{P}) = \frac{1}{2m}2i\hbar \hat{P} 
$$

> [!note] Commutator Important Principle 
> $$
> [\hat{A},\hat{B}\hat{C}] = B[\hat{A},\hat{C}] + [\hat{A},\hat{B}]\hat{C}
> $$

$$
\frac{d\Omega}{dt} = \frac{dX}{dt} = \braket{ \psi | \frac{1}{i\hbar}[\hat{P},\hat{H}]|\psi }  = \braket{ \psi(t) | \frac{1}{i\hbar} i\hbar \frac{\hat{P}}{m}|\psi(t) }  = \braket{  \psi(t)|  \frac{\hat{P}}{m}|\psi(t)} = \frac{\hat{P}}{m}
$$

$$
\implies \frac{d\hat{X}}{dt} = \frac{\hat{P}(t)}{m}
$$
### dP/dt in Schordinger Representation
$$
\frac{d\hat{P}}{dt} = -k\hat{X}
$$

$$
[\hat{P},\hat{H}] = \left[ \hat{P}, \frac{\hat{P}^{2}}{2m}+ \frac{1}{2}k\hat{X}^{2} \right]= \left[ \hat{P}, \frac{1}{2}k\hat{X}^{2} \right] = \frac{k}{2} [\hat{P},\hat{X}^{2}] = \frac{k}{2} 2i\hbar \hat{X}
$$


---

# Heisenberg Equation 
- Wave function never change over time, the observation/operation change with time 

$$
\Omega(t) = \braket{ \psi | \hat{\Omega}|\psi } = \braket{ \psi(0) | \Omega(t) \psi(0)} 
$$
$$
\ket{{\psi}}  = e^{iHt/\hbar} \ket{{\psi(0)}}  \implies \hat{\Omega}(t) = e^{i\hat{H}t/\hbar} \hat{\Omega} e^{i\hat{H}t/\hbar}
$$
$$
\frac{d\hat{\Omega}}{dt} = \frac{i\hat{H}t}{\hbar} e^{\frac{i\hat{H}t}{\hbar}} \hat{\Omega} e^{\frac{-i\hat{H}t}{\hbar}} + e^{\frac{i\hat{H}t}{\hbar}}\hat{\Omega} {\frac{i\hat{H}t}{\hbar}} e^{\frac{-i\hat{H}t}{\hbar}} = \frac{1}{i\hbar}[\hat{\Omega}(t)\hat{H}-\hat{H}\hat{\Omega}(t)] = \frac{1}{i\hbar} [\hat{\Omega}(t), \hat{H}]
$$
- Simple Harmonic 
$$
\begin{align}
&\frac{d\hat{X}}{dt}= \frac{\hat{P}}{m} \\
&\frac{d\hat{P}}{dt}= -k\hat{X}
\end{align}
$$


### Diagonalize $\hat{H}$
$$
\hat{H} = \frac{\hat{P}^{2}}{2m}+ \frac{1}{2}kX^{2} = \frac{\hat{P}}{2m} + \frac{1}{2}m\omega^{2}\hat{X}^{2} = \hbar \omega \left[ \frac{\hat{P}^{2}}{2m\hbar\omega}+\frac{m\omega}{2m\hbar}\hat{X}^{2} \right]
$$
$$
P_{Q} = \sqrt{ m\hbar\omega } , X_{Q} = \sqrt{ \frac{\hbar}{m\omega} }, X_{Q}P_{Q}=\hbar
$$
$$
\implies \frac{\hat{H}}{\hbar\omega} = \frac{1}{2} \left( \frac{\hat{P}}{P_{Q}} \right)^{2} + \frac{1}{2} \left( \frac{\hat{X}}{X_{Q}} \right)^{2} 
$$
- Set $m\omega=1$ and $\hbar=1$ (constant)
$$
\implies \frac{\hat{H}}{\hbar \omega} = \frac{1}{2}(\hat{P})^{2} + \frac{1}{2}(\hat{X})^{2}
$$
##### Change of Operation Skill 
$$
\begin{cases}
\text{Creation} : &\hat{a} = \frac{1}{\sqrt{ 2 }} (\hat{X}+i\hat{P}) \\
\text{Amihilation} : & \hat{a}^{\dagger} = \frac{1}{\sqrt{ 2 }}(\hat{X}-i\hat{P}) 
\end{cases}
$$
Communication 
$$
[\hat{a},\hat{a}^{\dagger}]= \left( \frac{1}{\sqrt{ 2 }} \right)^{2} [\hat{X}+i\hat{P},\hat{X}-i\hat{P}] = \frac{1}{2} [0+(-i\cdot i)+(i\cdot-i)+0] = 1 
$$

$$
\frac{\hat{H}}{\hbar\omega} = \frac{1}{2}\hat{P}^{2}+\frac{1}{2}\hat{X}^{2}= \frac{1}{2} \cdot \frac{1}{2} (\hat{a}-\hat{a}^{\dagger})^{2}+\frac{1}{2}\cdot \frac{1}{2} (\hat{a}+\hat{a}^{\dagger})^{2}= \frac{1}{2}(\hat{a}\hat{a}^{\dagger}+\hat{a}^{\dagger}\hat{a})
$$
$$
\implies \hat{H} = \left( \hat{a}^{\dagger}\hat{a}+\frac{1}{2} \right) \hbar\omega
$$
##### Another Change of Operation 
Create a new operator $\hat{N}$
$$
\hat{N} = \hat{a}^{\dagger}\hat{a}
$$
- Hermitian Operation : $\hat{N}^{\dagger}=(\hat{a}^{\dagger}\hat{a})^{\dagger}= \hat{a}^{\dagger}\hat{a}=\hat{N}$
- Non-negative eigenvalues : $\braket{ \psi  | \hat{N}|\psi }=\braket{ \psi | \hat{a}^{\dagger}\hat{a}|\psi }=\braket{ \psi' | \psi' }\geq {0}$ 
- Commute Properties 
	- $[\hat{a},\hat{N}]=[\hat{a},\hat{a}^{\dagger}\hat{a}]=\hat{a}$
	- $[\hat{a}^{\dagger},\hat{N}]=[\hat{a}^{\dagger},\hat{a}^{\dagger}\hat{a}]=-\hat{a}^{\dagger}$
	- $\to N\hat{a}=\hat{a}[\hat{N}-1]$

##### Operation on N basis 
假設$\hat{N}$的eigenbasis是$\ket{n}$
$$
\hat{N} \ket{n} =n \ket{n} 
$$
1. 假設$\ket{\phi_{n}}=\hat{a}\ket{n}$
$$
\begin{align}
& \hat{N}\ket{\phi_{n}} = \hat{N} \hat{a} \ket{n} \\
  \implies &  \hat{a}(\hat{N}-1) \ket{n} = (n-1)\hat{a}\ket{n} = (n-1)\ket{\phi_{n}}  \\
  \implies & \hat{N} \ket{\phi_{n}}  = (n-1) \ket{\phi_{n}} 
\end{align}
$$

2. 假設$\ket{\psi_{n}}=\hat{a}^{\dagger}\ket{n}$ 
$$
\begin{align}
& \hat{N}\ket{\psi_{n}} = \hat{N}\hat{a}^{\dagger}\ket{n}  \\
\implies & \hat{a}^{\dagger} (N+1)\ket{n}  = (n+1) \hat{a}^{\dagger}\ket{n}  = (n+1)\ket{\psi_{n}}   \\
\implies & \hat{N}\ket{\psi_{n}} = (n+1) \ket{\psi_{n}} 
\end{align}
$$

##### Eigenvalue 
$$
\ket{\phi_{n}} = \hat{a} \ket{n} = c\ket{n-1} = \sqrt{ n }\ket{n-1} 
$$
$$
\braket{ \phi_{n} | \phi_{n} } = \braket{ n | \hat{a}^{\dagger}\hat{a}|n } = \lvert c \rvert ^{2} \braket{ n-1 | n-1 } = n \implies c = \sqrt{ 
n }
$$

$$
\begin{align}
&\hat{a}\ket{1}  = \sqrt{ 1 }\ket{0}  \\
&\hat{a}\ket{0}  = \sqrt{ 0 }\ket{-1}  = 0 
\end{align}
$$

- $\ket{\psi_{n}}=\hat{a}^{\dagger}\ket{n}=c\ket{n+1}=\sqrt{  n+1}\ket{n+1}$
- $\ket{\phi_{n}}=\hat{a}^\ket{n}=c\ket{n}=\sqrt{  n}\ket{n-1}$

> [!note] Summary of this Operation 
> - $\hat{N}$ have eigenvalues n = 0,1,2,...,n
> - $\hat{a}\ket{n}=\sqrt{ n }\ket{n-1}$
> - $\hat{a}^{\dagger}\ket{n}=\sqrt{ n+1 }\ket{n+1}$


##### Essence of Energy 
![[QM Energy Quantization.svg|600]]




---
# Matrix Element In Energy Basis
- For Amihilation matrix $\hat{a}$
![[Pasted image 20261010151850.png|410]]
- For Creation matrix $\hat{a}^{\dagger}$
![[Screenshot 2026-10-10 at 3.19.39 PM.png|415]]


##### Create X and P from $\hat{a}$ and $\hat{a}^{\dagger}$
![[Screenshot 2026-10-10 at 3.20.36 PM.png]]